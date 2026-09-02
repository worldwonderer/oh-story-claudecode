#!/usr/bin/env node
/**
 * delegate-prose.js — 正文写作外包给外部 CLI 模型
 *
 * 治的病：大纲、细纲、追踪在 Claude Code / Codex 里做没问题，但正文那一步想换一个
 * 模型写。宿主 CLI 的 subagent 只能跑宿主自己的模型，没有任何字段能路由出去，
 * 所以正文这一步必须以子进程形式交给外部 CLI。
 *
 * 边界（实测定下来的，不要随手放宽）：
 *
 * 1. 委派方只读。它拿到 --add-dir 的项目目录，用只读工具读细纲、文风与 reference，
 *    正文经 --json-schema 结构化返回，**由宿主落盘**。这样不需要 --dangerously-skip-permissions
 *    （那会在挂载了项目目录的会话里自动批准一切工具，含任意命令执行），
 *    也不需要写用户全局 ~/.gemini/settings.json（部署器一律不碰用户 home）。
 *
 * 2. 必须显式禁掉委派方自查。narrative-writer 模板给了 Bash 用于确定性自查字数/句长，
 *    而 headless 下 command 权限会被自动拒绝——实测委派方遇拒后不是降级继续，而是
 *    整个 run 放弃、13 秒零产出。所以 prompt 里要写明「不许用命令行工具，也不要
 *    因为无法自查而放弃或缩短产出」，并说清校验由宿主做。
 *
 * 3. 代价要如实记账。禁掉自查后一章约 128 秒（放开自查约 622 秒），但字数会失控
 *    ——实测目标 3000 字出到 4819 字、委派方自估 3042 严重失真，且漏掉一条一级毒句式。
 *    所以宿主拿到草稿后必须照常跑 check-ai-patterns / 字数口径，超长走既有 compress-once。
 *    本脚本不做质量判断，只负责把稿子取回来。
 *
 * 4. 失败一律显式。预检失败、调用失败、产出不合格各有独立退出码，调用方据此决定
 *    静默回落还是报错；任何情况下都不得把失败伪装成委派成功。
 *
 * 用法：
 *   node delegate-prose.js --preflight [--model <id>]
 *   node delegate-prose.js --project <项目根> --materials <materials.json> --out <正文路径> [选项]
 *
 * 选项：
 *   --project <dir>        必填。挂给委派方的目录，也是相对路径的解析根
 *   --materials <path>     必填。本章材料 JSON，字段见 buildTask()
 *   --out <path>           必填。宿主把返回的正文写到这里
 *   --instructions <path>  写手指令模板（Markdown，自动剥 frontmatter）
 *   --model <id>           默认 gemini-3.7-flash-high。传具体模型 ID，不是档位名
 *   --timeout <dur>        默认 25m，透传给 --print-timeout
 *   --metrics <path>       把 usage / 时长 / refs_read 写成 JSON
 *   --mode draft|compress  默认 draft
 *
 * 退出码：
 *   0 成功  1 缺 CLI  2 鉴权或网络  3 调用失败  4 产出不合格  5 用法错误
 */

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

const CLI = 'agy'
const DEFAULT_MODEL = 'gemini-3.7-flash-high'
const DEFAULT_TIMEOUT = '25m'

const EXIT = { OK: 0, MISSING_CLI: 1, AUTH_OR_NETWORK: 2, INVOCATION: 3, BAD_OUTPUT: 4, USAGE: 5 }

const SCHEMA = {
  type: 'object',
  properties: {
    prose: { type: 'string' },
    visible_chars: { type: 'integer' },
    refs_read: { type: 'array', items: { type: 'string' } },
  },
  required: ['prose', 'visible_chars', 'refs_read'],
}

function die(code, message) {
  process.stderr.write(`delegate-prose: ${message}\n`)
  process.exit(code)
}

function parseArgs(argv) {
  const opts = { model: DEFAULT_MODEL, timeout: DEFAULT_TIMEOUT, mode: 'draft', preflight: false }
  const takesValue = new Set([
    '--project', '--materials', '--out', '--instructions', '--model', '--timeout', '--metrics', '--mode',
  ])
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]
    if (token === '--preflight') {
      opts.preflight = true
    } else if (takesValue.has(token)) {
      const value = argv[++i]
      if (value === undefined || value.startsWith('--')) die(EXIT.USAGE, `${token} requires a value`)
      opts[token.slice(2)] = value
    } else {
      die(EXIT.USAGE, `unknown argument: ${token}`)
    }
  }
  if (opts.mode !== 'draft' && opts.mode !== 'compress') die(EXIT.USAGE, '--mode must be draft or compress')
  return opts
}

/** 预检分两级，让调用方能区分「没装」和「装了但不能用」。 */
function preflight() {
  // 直接 spawn，不经 shell：ENOENT 就是没装，装了但非零就是鉴权或网络。
  // 走 shell 会触发 Node 的 DEP0190，也多一个进程。
  const models = spawnSync(CLI, ['models'], { encoding: 'utf8' })
  if (models.error && models.error.code === 'ENOENT') {
    return { ok: false, code: EXIT.MISSING_CLI, reason: 'MISSING_CLI' }
  }
  if (models.error || models.status !== 0) {
    return { ok: false, code: EXIT.AUTH_OR_NETWORK, reason: 'AUTH_OR_NETWORK' }
  }
  return { ok: true, reason: 'OK', models: String(models.stdout || '') }
}

/** 剥掉 Markdown frontmatter，只留写手指令正文。 */
function stripFrontmatter(text) {
  if (!text.startsWith('---')) return text
  const end = text.indexOf('\n---', 3)
  if (end === -1) return text
  return text.slice(text.indexOf('\n', end + 1) + 1)
}

function line(label, value) {
  if (value === undefined || value === null || value === '') return ''
  if (Array.isArray(value)) return value.length ? `- ${label}：${value.join('、')}\n` : ''
  return `- ${label}：${value}\n`
}

function buildTask(m, mode) {
  const head = mode === 'compress'
    ? `# 本次任务：压缩第 ${m.chapter} 章正文\n\n目标净删约 ${m.delete_chars} 可见字符。只做净删，不得新增语义、不得改动已批准的情节点与结尾钩子。\n`
    : `# 本次任务：写第 ${m.chapter} 章正文\n`

  let body = `\n项目目录已通过 --add-dir 挂载，按相对路径读取。\n\n**材料定位**\n`
  body += line('细纲文件（必读）', m.outline_file)
  body += line('文风路径（写作前必读）', m.style_file)
  body += line('上一章', m.prev_chapter)
  body += line('当前正文（待压缩）', m.current_prose_file)
  body += line('主对标/拆文路径', m.benchmark_path)

  body += `\n**写前给定**\n`
  body += line('目标情绪', m.emotion)
  body += line('涉及角色', m.characters)
  body += line('字数目标', m.target_chars ? `${m.target_chars} 字（visible_chars_v1 口径）` : '')
  body += line('阶段位置', m.stage_position)
  body += line('本章结构公式', m.structure_formula)
  body += line('本章可释放信息', m.releasable)
  body += line('本章禁止提前释放信息', m.forbidden_early)
  body += line('主/副对标召回摘要', m.benchmark_recall)
  body += line('selected_emotion_module', m.selected_emotion_module)
  body += line('rhythm_reference', m.rhythm_reference)
  body += line('genre_prose_card', m.genre_prose_card)
  body += line('作者偏好', m.author_preferences)
  body += line('格式硬约束', m.format_constraints)

  body += `
**边界**
- 只展开细纲已有事件、人物、冲突与结尾钩子，不自造新主线、新角色、新反转，不提前写后续章剧情。
- 细纲是「要发生什么」的契约、不是正文的形状：可打散重排、把相邻情节点缝进同一个连续动作，不要一条一段平推，不把细纲措辞原样搬进叙述。
- 标题行以外不得出现「本章 / 上一章 / 前文 / 后文 / 伏笔 / 细纲 / 读者」这类写作工程词。

**工具限制（重要）**
本次只允许只读工具（view_file / find_by_name / grep_search）。**禁止使用 run_command 或任何命令行工具。**
字数统计、句长核对、禁用词与细纲照搬复扫全部由宿主会话在你返回后用确定性脚本执行。
你不要自查，也**不要因为无法自查而放弃、缩短或截断产出**——按目标字数凭经验估算即可。

**执行**
1. 按你的参考文件体系表逐行独立判定，命中即用只读工具读取该参考文件。
2. 写出完整正文（含标题行）。
3. 不要写任何文件。按 JSON schema 返回：prose=完整正文文本，visible_chars=你的估算值，refs_read=实际读过的文件路径数组。
`
  return head + body
}

function readJson(file, what) {
  let raw
  try {
    raw = fs.readFileSync(file, 'utf8')
  } catch (err) {
    die(EXIT.USAGE, `cannot read ${what}: ${file}`)
  }
  try {
    return JSON.parse(raw)
  } catch (err) {
    die(EXIT.USAGE, `${what} is not valid JSON: ${file}`)
  }
}

function main() {
  const opts = parseArgs(process.argv.slice(2))

  if (opts.preflight) {
    const check = preflight()
    process.stdout.write(`${check.reason}\n`)
    process.exit(check.ok ? EXIT.OK : check.code)
  }

  for (const required of ['project', 'materials', 'out']) {
    if (!opts[required]) die(EXIT.USAGE, `--${required} is required`)
  }
  const project = path.resolve(opts.project)
  if (!fs.existsSync(project) || !fs.statSync(project).isDirectory()) {
    die(EXIT.USAGE, `--project is not a directory: ${project}`)
  }

  const check = preflight()
  if (!check.ok) die(check.code, `preflight failed: ${check.reason}`)

  const materials = readJson(path.resolve(opts.materials), '--materials')
  let instructions = ''
  if (opts.instructions) {
    const file = path.resolve(opts.instructions)
    if (!fs.existsSync(file)) die(EXIT.USAGE, `--instructions not found: ${file}`)
    instructions = stripFrontmatter(fs.readFileSync(file, 'utf8')).trim() + '\n\n---\n'
  }
  const prompt = instructions + buildTask(materials, opts.mode)

  const schemaFile = path.join(fs.mkdtempSync(path.join(require('os').tmpdir(), 'delegate-prose-')), 'schema.json')
  fs.writeFileSync(schemaFile, JSON.stringify(SCHEMA))

  const startedAt = Date.now()
  const run = spawnSync(CLI, [
    '--add-dir', project,
    '--model', opts.model,
    '--print-timeout', opts.timeout,
    '--output-format', 'json',
    '--json-schema', schemaFile,
    `-p=${prompt}`,
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  const wallSeconds = Math.round((Date.now() - startedAt) / 1000)

  try { fs.rmSync(path.dirname(schemaFile), { recursive: true, force: true }) } catch (err) { /* 清理失败不影响结果 */ }

  if (run.status !== 0) {
    die(EXIT.INVOCATION, `${CLI} exited ${run.status} after ${wallSeconds}s: ${String(run.stderr || '').trim().slice(0, 400)}`)
  }

  let envelope
  try {
    envelope = JSON.parse(String(run.stdout || ''))
  } catch (err) {
    die(EXIT.BAD_OUTPUT, `${CLI} did not return parseable JSON after ${wallSeconds}s`)
  }
  if (envelope.status && envelope.status !== 'SUCCESS') {
    die(EXIT.INVOCATION, `${CLI} reported status ${envelope.status} after ${wallSeconds}s`)
  }

  let payload = envelope.response
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload)
    } catch (err) {
      die(EXIT.BAD_OUTPUT, 'structured output is not valid JSON')
    }
  }
  if (!payload || typeof payload.prose !== 'string' || !payload.prose.trim()) {
    die(EXIT.BAD_OUTPUT, 'structured output carries no prose')
  }

  const prose = payload.prose.endsWith('\n') ? payload.prose : payload.prose + '\n'
  const out = path.resolve(opts.out)
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, prose, 'utf8')

  // 宿主口径的可见字符数：去掉标题行与全部空白。委派方自估不可信（实测 3042 对 4819），
  // 一律以这里的数为准，交给调用方判断带内 / under / over。
  const visible = prose.split('\n').filter((l) => !/^#/.test(l)).join('').replace(/\s/g, '').length

  const metrics = {
    mode: opts.mode,
    model: opts.model,
    wall_seconds: wallSeconds,
    delegate_duration_seconds: envelope.duration_seconds,
    num_turns: envelope.num_turns,
    usage: envelope.usage,
    visible_chars: visible,
    visible_chars_self_reported: payload.visible_chars,
    refs_read: payload.refs_read,
    out,
  }
  if (opts.metrics) {
    const metricsPath = path.resolve(opts.metrics)
    fs.mkdirSync(path.dirname(metricsPath), { recursive: true })
    fs.writeFileSync(metricsPath, JSON.stringify(metrics, null, 2) + '\n', 'utf8')
  }

  process.stdout.write(`OK ${visible} chars in ${wallSeconds}s via ${opts.model} -> ${out}\n`)
}

main()
