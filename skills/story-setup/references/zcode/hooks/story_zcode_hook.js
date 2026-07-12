#!/usr/bin/env node
"use strict"

// ZCode hook adapter for oh-story writing projects. It has no third-party
// dependencies and emits only fields accepted by ZCode 3.3.4's strict hook
// output schema. Diagnostics go to stderr; a healthy no-op keeps stdout empty.

const fs = require("node:fs")
const path = require("node:path")
const { spawnSync } = require("node:child_process")

let hookInput = {}
try {
  const raw = fs.readFileSync(0, "utf8")
  if (raw.trim()) {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) hookInput = parsed
  }
} catch {
  hookInput = {}
}

function emit(value) {
  if (value && typeof value === "object") process.stdout.write(JSON.stringify(value))
}

function hookContext(event, text) {
  return {
    hookSpecificOutput: {
      hookEventName: event,
      additionalContext: text,
    },
  }
}

function existingDir(value) {
  if (typeof value !== "string" || !value.trim()) return null
  try {
    const resolved = path.resolve(value)
    return fs.statSync(resolved).isDirectory() ? resolved : null
  } catch {
    return null
  }
}

function deployedWorkspaceRoot() {
  try {
    const hooksDir = __dirname
    if (path.basename(hooksDir) === "hooks" && path.basename(path.dirname(hooksDir)) === ".zcode") {
      return path.dirname(path.dirname(hooksDir))
    }
  } catch {}
  return null
}

function projectRoot() {
  for (const name of ["ZCODE_PROJECT_DIR", "CLAUDE_PROJECT_DIR"]) {
    const candidate = existingDir(process.env[name])
    if (candidate) return candidate
  }
  const deployed = deployedWorkspaceRoot()
  if (deployed) return deployed
  const inputCwd = existingDir(hookInput.cwd)
  const cwd = inputCwd || process.cwd()
  try {
    const result = spawnSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
    if (result.status === 0 && result.stdout.trim()) return path.resolve(result.stdout.trim())
  } catch {}
  return path.resolve(cwd)
}

function safeRelative(root, target) {
  try {
    const rel = path.relative(path.resolve(root), path.resolve(target))
    return rel && !rel.startsWith("..") ? rel.split(path.sep).join("/") : String(target)
  } catch {
    return String(target)
  }
}

function resolveTarget(root, target) {
  const normalized = String(target || "").replace(/\\/g, "/")
  return path.isAbsolute(normalized) ? path.resolve(normalized) : path.resolve(root, normalized)
}

function firstLine(file) {
  try {
    return fs.readFileSync(file, "utf8").split(/\r?\n/, 1)[0].trim()
  } catch {
    return ""
  }
}

function findFirst(base, maxDepth, predicate) {
  if (maxDepth < 0) return null
  let entries = []
  try {
    entries = fs.readdirSync(base, { withFileTypes: true })
  } catch {
    return null
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".") || entry.name === "node_modules") continue
    const full = path.join(base, entry.name)
    if (predicate(full, entry)) return full
  }
  if (maxDepth === 0) return null
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".") || entry.name === "node_modules") continue
    const found = findFirst(path.join(base, entry.name), maxDepth - 1, predicate)
    if (found) return found
  }
  return null
}

function discoverActiveBook(root) {
  const declared = firstLine(path.join(root, ".active-book"))
  if (declared) {
    const candidate = resolveTarget(root, declared)
    const rel = path.relative(root, candidate)
    if (!rel.startsWith("..") && existingDir(candidate)) return candidate
  }
  const tracking = findFirst(root, 4, (_full, entry) => entry.isDirectory() && entry.name === "追踪")
  if (tracking) return path.dirname(tracking)
  const body = findFirst(root, 4, (_full, entry) => entry.isDirectory() && entry.name === "正文")
  if (body) return path.dirname(body)
  const bodyFile = findFirst(root, 4, (_full, entry) => entry.isFile() && entry.name === "正文.md")
  return bodyFile ? path.dirname(bodyFile) : null
}

function discoverAllBooks(root) {
  const books = new Map()
  function walk(base, depth) {
    if (depth < 0) return
    let entries = []
    try { entries = fs.readdirSync(base, { withFileTypes: true }) } catch { return }
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue
      const full = path.join(base, entry.name)
      if (entry.isDirectory() && (entry.name === "追踪" || entry.name === "正文")) {
        books.set(path.dirname(full), path.dirname(full))
      } else if (entry.isFile() && entry.name === "正文.md") {
        books.set(path.dirname(full), path.dirname(full))
      }
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".") || entry.name === "node_modules") continue
      walk(path.join(base, entry.name), depth - 1)
    }
  }
  walk(root, 8)
  return [...books.values()]
}

function continuityFindings(root) {
  const messages = []
  for (const book of discoverAllBooks(root)) {
    const bodyDir = path.join(book, "正文")
    let chapters = []
    try {
      chapters = fs.readdirSync(bodyDir)
        .filter((file) => /^第.*章.*\.md$/.test(file))
        .map((file) => path.join(bodyDir, file))
    } catch {}

    const context = path.join(book, "追踪", "上下文.md")
    if (chapters.length && fs.existsSync(context)) {
      try {
        const newest = Math.max(...chapters.map((file) => fs.statSync(file).mtimeMs))
        const contextTime = fs.statSync(context).mtimeMs
        if (newest > contextTime + 1000) {
          const latest = chapters.reduce((left, right) => fs.statSync(left).mtimeMs > fs.statSync(right).mtimeMs ? left : right)
          messages.push(`[continuity] ${safeRelative(root, book)}：正文已更新到「${path.basename(latest)}」但 追踪/上下文.md 更早，续写会断线——补更 上下文.md/伏笔.md 再继续。`)
        }
      } catch {}
    }

    const titles = new Map()
    for (const chapter of chapters) {
      const match = path.basename(chapter, ".md").match(/^第0*\d+章[_\- 　]+(.+)$/)
      if (!match) continue
      const title = match[1].trim()
      if (title) titles.set(title, [...(titles.get(title) || []), path.basename(chapter)])
    }
    for (const [title, files] of titles.entries()) {
      if (files.length > 1) {
        messages.push(`[continuity] ${safeRelative(root, book)}：${files.length} 章标题重复「${title}」（${files.join("、").slice(0, 60)}），建议改名。`)
      }
    }
  }
  return messages
}

function sessionStart() {
  const root = projectRoot()
  const messages = []
  const sentinel = path.join(root, ".story-deployed")
  if (fs.existsSync(sentinel)) {
    let text = ""
    try { text = fs.readFileSync(sentinel, "utf8") } catch {}
    const match = text.match(/^target_cli:\s*(.+)$/m)
    if (!match) {
      messages.push("[story-setup] .story-deployed 缺少 target_cli；建议重新运行 $story-setup。")
    } else if (!match[1].split(",").map((item) => item.trim()).includes("zcode")) {
      messages.push("[story-setup] 当前部署标记未包含 zcode；如需 ZCode 项目适配，请重新运行 $story-setup 并选择 ZCode。")
    }
  }
  const book = discoverActiveBook(root)
  if (book) {
    const context = path.join(book, "追踪", "上下文.md")
    if (fs.existsSync(context)) {
      messages.push(`[story context] 当前书目：${safeRelative(root, book)}。继续长篇写作前先读取 ${safeRelative(root, context)}。`)
    } else {
      messages.push(`[story context] 检测到写作项目：${safeRelative(root, book)}。`)
    }
  }
  messages.push(...continuityFindings(root))
  if (messages.length) emit(hookContext("SessionStart", messages.join("\n")))
}

function toolName(input) {
  return String(input.tool_name || input.toolName || input.tool || input.name || "")
}

function toolPayload(input) {
  for (const key of ["tool_input", "toolInput", "input", "parameters", "args"]) {
    const value = input[key]
    if (value && typeof value === "object" && !Array.isArray(value)) return value
  }
  return {}
}

function extractProseTargets(command) {
  const targets = []
  const token = `["']?([^\\s"'<>|;&()]*正文[^\\s"'<>|;&()]*)["']?`
  for (const source of [`>>?\\s*${token}`, `(?:^|[\\s;&|(){}<>])(?:tee(?:\\s+-a)?|touch)\\s+${token}`]) {
    const regex = new RegExp(source, "gm")
    let match
    while ((match = regex.exec(command)) !== null) {
      if (match[1]) targets.push(match[1])
    }
  }
  for (const raw of command.split(/[;&|\n]/)) {
    const segment = raw.split(/\d*[<>]/)[0]
    const words = segment.trim().split(/\s+/).filter(Boolean)
    if (words.length >= 2 && (words[0] === "cp" || words[0] === "mv")) {
      const positional = words.slice(1).filter((word) => !word.startsWith("-"))
      const destination = positional[positional.length - 1]
      if (destination && destination.includes("正文")) targets.push(destination.replace(/^["']|["']$/g, ""))
    }
  }
  return targets
}

function extractPatchTargets(patchText) {
  const targets = []
  for (const line of String(patchText).split(/\r?\n/)) {
    const match = line.trim().match(/^\*\*\* (?:Add|Update) File: (.+)$/)
    if (match) targets.push(match[1].trim())
  }
  return targets
}

function targetPaths(input) {
  const root = projectRoot()
  const name = toolName(input)
  const payload = toolPayload(input)
  const rawTargets = []
  for (const key of ["file_path", "filePath", "path", "target", "filename"]) {
    if (typeof payload[key] === "string") rawTargets.push(payload[key])
  }
  const command = typeof payload.command === "string" ? payload.command : ""
  if (command) {
    if (/bash/i.test(name)) rawTargets.push(...extractProseTargets(command))
    else rawTargets.push(...extractPatchTargets(command), ...extractProseTargets(command))
  }
  for (const key of ["patch", "content", "text"]) {
    if (typeof payload[key] === "string" && /applypatch|patch/i.test(name)) rawTargets.push(...extractPatchTargets(payload[key]))
  }
  return [...new Set(rawTargets.filter(Boolean).map((value) => resolveTarget(root, value)))]
}

function proseBlockReason(root, absolute) {
  const base = path.basename(absolute)
  const parent = path.basename(path.dirname(absolute))
  if (base === "正文.md") {
    if (fs.existsSync(absolute)) return null
    const book = path.dirname(absolute)
    if (fs.existsSync(path.join(root, "拆文库", path.basename(book)))) return null
    if (!fs.existsSync(path.join(book, "设定.md"))) return null
    if (!fs.existsSync(path.join(book, "小节大纲.md"))) {
      return `⛔ 写正文被拦截：${safeRelative(root, absolute)} 缺少同目录 小节大纲.md。先按 story-short-write 完成小节大纲再写正文。`
    }
    return null
  }
  if (parent !== "正文" || !/^第.*章.*\.md$/.test(base) || fs.existsSync(absolute)) return null
  const match = base.match(/^第0*(\d+)章/)
  if (!match) return null
  const chapter = match[1]
  const book = path.dirname(path.dirname(absolute))
  if (fs.existsSync(path.join(root, "拆文库", path.basename(book)))) return null
  const outlineDir = path.join(book, "大纲")
  let found = false
  try {
    found = fs.readdirSync(outlineDir).some((file) => {
      const candidate = file.match(/^细纲_第0*(\d+)章.*\.md$/)
      return candidate && candidate[1] === chapter
    })
  } catch {}
  if (!found) {
    return `⛔ 写正文被拦截：第 ${chapter} 章缺少细纲（${safeRelative(root, outlineDir)}/细纲_第${chapter}章.md）。先按 story-long-write 单章流程补建细纲再写正文。`
  }
  return null
}

function preToolProseGuard() {
  const root = projectRoot()
  for (const target of targetPaths(hookInput)) {
    const reason = proseBlockReason(root, target)
    if (reason) {
      emit({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason: reason,
        },
      })
      return
    }
  }
}

function shellWords(segment) {
  return (segment.match(/"(?:\\.|[^"])*"|'[^']*'|[^\s]+/g) || []).map((word) => word.replace(/^["']|["']$/g, ""))
}

function isGitCommitCommand(command) {
  const valueOptions = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path", "--super-prefix", "--config-env"])
  // Flatten subshell/brace grouping to spaces so `(git commit)` / `{ git commit; }` still expose
  // the git verb; split on separators; skip leading shell wrappers and control words
  // (then/do/else/elif) so a commit inside if/for/while is detected. Mirrors the Claude bash
  // oracle validate-story-commit.sh and codex is_git_commit_command.
  for (const rawSegment of String(command).replace(/\r/g, "").replace(/[(){}]/g, " ").split(/[;&|\n]+/)) {
    const words = shellWords(rawSegment)
    let i = 0
    while (i < words.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i]) || ["command", "noglob", "then", "do", "else", "elif"].includes(words[i]))) i++
    if (words[i] === "env") {
      i++
      while (i < words.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i]) || ["-i", "--ignore-environment"].includes(words[i]))) i++
    }
    if (words[i] !== "git") continue
    i++
    while (i < words.length) {
      const token = words[i]
      if (token === "commit") return true
      if (valueOptions.has(token)) { i += 2; continue }
      if ([...valueOptions].some((option) => option.startsWith("--") && token.startsWith(`${option}=`))) { i++; continue }
      if (token.startsWith("-")) { i++; continue }
      break
    }
  }
  return false
}

function stagedMarkdownWarnings(root) {
  let output
  try {
    output = spawnSync("git", ["-C", root, "-c", "core.quotepath=false", "diff", "--cached", "--relative", "--name-only", "--diff-filter=ACM", "-z", "--", "."], {
      encoding: "buffer",
      stdio: ["ignore", "pipe", "ignore"],
    })
    if (output.status !== 0 || !output.stdout) return ""
  } catch {
    return ""
  }
  const warnings = []
  for (const relative of output.stdout.toString("utf8").split("\0").filter(Boolean)) {
    if (!relative.endsWith(".md")) continue
    const full = path.join(root, relative)
    let text = ""
    try { text = fs.readFileSync(full, "utf8") } catch { continue }
    if (relative === "正文.md" || relative.includes("/正文.md") || relative.startsWith("正文/") || relative.includes("/正文/")) {
      const hits = []
      text.split(/\r?\n/).forEach((line, index) => {
        if (/(身高|体重|年龄)[\s　]*(：|:)[\s　]*[0-9]+/.test(line)) hits.push(`${index + 1}:${line}`)
      })
      if (hits.length) warnings.push(`⚠ ${relative}: 正文硬编码角色属性，应引用设定文件：\n${hits.join("\n")}`)
    }
    if ((relative.startsWith("设定/") || relative.includes("/设定/")) && !/^[\s　]*(名字|姓名|名称|name)[\s　]*(：|:)/im.test(text)) {
      warnings.push(`⚠ ${relative}: 设定文件缺少 name/名字 必填字段。`)
    }
  }
  return warnings.length ? `=== Story Commit Warnings（advisory only）===\n${warnings.join("\n")}\n=== End Warnings ===` : ""
}

function preToolCommitAdvisory() {
  const payload = toolPayload(hookInput)
  const command = typeof payload.command === "string" ? payload.command : ""
  if (!command || !isGitCommitCommand(command)) return
  const warnings = stagedMarkdownWarnings(projectRoot())
  if (warnings) emit(hookContext("PreToolUse", warnings))
}

const TERMINAL = new Set(Array.from("。！？…”』」）)!?.~—"))
const QUOTE_OPENERS = new Set(["「", "“", "‘", "『", '"'])
const SOFT_PATTERNS = [
  [/作为(一个)?(AI|人工智能|大?语言模型|智能助手|聊天助手)(?=，|,|。|、|；|;|：|:|！|!|？|\?|\s|）|\)|」|』|"|】|我|无法|不能|没法|$)/, "AI 自指"],
  [/^(Sure|Certainly|Here'?s|As an AI|I (?:cannot|can't|am unable|apologize))/, "英文 AI 腔"],
  [/我(无法|不能)(继续(写|创作|生成|下去|输出)?|生成(内容|文本|正文)?|创作|续写|写作|完成(这个|本)?(章|篇|创作|请求)?)/, "生成拒绝语"],
]
const HARD_PATTERNS = [
  [/[（(](此处|以下|这里|下文|后续)?[^）)]{0,10}(省略|略去|略过)[^）)]{0,10}[）)]/, "占位符（括号省略）"],
  [/(TODO|占位符|placeholder|待补充|此处待填|此处待补)/, "占位符"],
  [/(细纲|情节点|卷纲|功能标签|目标情绪|字数目标|章首钩子|章尾钩子|任务描述)/, "工程词泄漏"],
  [/�/, "乱码（替换字符）"],
]

function skippableLine(line) {
  return !line || line.startsWith("#") || line === "---" || /^[-—=*·•\s]+$/.test(line)
}

function proseNetFindings(text) {
  const findings = []
  const content = []
  text.split("\n").forEach((raw, index) => {
    const line = raw.trim()
    if (skippableLine(line)) return
    const lineNo = index + 1
    content.push([lineNo, line])
    let hit = false
    if (!QUOTE_OPENERS.has(line[0])) {
      for (const [regex, label] of SOFT_PATTERNS) {
        const match = line.match(regex)
        if (match) {
          findings.push(`第${lineNo}行 元信息泄漏（${label}）：「${match[0].slice(0, 20)}」`)
          hit = true
          break
        }
      }
    }
    if (hit) return
    for (const [regex, label] of HARD_PATTERNS) {
      const match = line.match(regex)
      if (match) {
        findings.push(`第${lineNo}行 ${label}：「${match[0].slice(0, 20)}」`)
        break
      }
    }
  })
  for (let i = 1; i < content.length; i++) {
    const previous = content[i - 1][1]
    const [lineNo, current] = content[i]
    if (previous === current && current.length >= 8) findings.push(`第${lineNo}行 紧邻复读：整行与上一行完全相同「${current.slice(0, 20)}」`)
  }
  if (content.length) {
    const [lineNo, last] = content[content.length - 1]
    if (!TERMINAL.has(Array.from(last).pop())) findings.push(`第${lineNo}行 疑似截断：结尾「…${last.slice(-12)}」未以标点收束`)
  }
  return findings
}

function isProsePath(absolute) {
  const base = path.basename(absolute)
  const parent = path.basename(path.dirname(absolute))
  if (base === "正文.md") return fs.existsSync(path.join(path.dirname(absolute), "设定.md"))
  if (parent !== "正文" || !/^第.*章.*\.md$/.test(base)) return false
  const book = path.dirname(path.dirname(absolute))
  // 大纲/追踪/设定 must be directories; 设定.md a file — matches the bash oracle
  // check-prose-after-write.sh (`[ -d 大纲 ] || … || [ -f 设定.md ]`).
  return ["大纲", "追踪", "设定"].some((name) => existingDir(path.join(book, name))) || fs.existsSync(path.join(book, "设定.md"))
}

function wordcountFinding(absolute, text) {
  if (path.basename(path.dirname(absolute)) !== "正文") return null
  const match = path.basename(absolute).match(/^第0*(\d+)章/)
  if (!match) return null
  const chapter = match[1]
  const outlineDir = path.join(path.dirname(path.dirname(absolute)), "大纲")
  let target = null
  try {
    for (const file of fs.readdirSync(outlineDir)) {
      const fileMatch = file.match(/^细纲_第0*(\d+)章.*\.md$/)
      if (!fileMatch || fileMatch[1] !== chapter) continue
      const content = fs.readFileSync(path.join(outlineDir, file), "utf8")
      const targetMatch = content.match(/字数目标[^0-9]{0,6}(\d{3,6})/)
      if (targetMatch) target = Number(targetMatch[1])
      break
    }
  } catch {}
  if (!target) return null
  const actual = Array.from(text).length
  return actual < target * 0.9
    ? `字数：第${chapter}章 实际 ${actual} 字 < 目标 ${target} 的 90%（${Math.floor(target * 0.9)}）。对照细纲字数预算补足密点。`
    : null
}

function duplicateTitleFindings(absolute) {
  const bodyDir = path.dirname(absolute)
  if (path.basename(bodyDir) !== "正文") return []
  const titles = new Map()
  try {
    for (const file of fs.readdirSync(bodyDir)) {
      const match = file.replace(/\.md$/, "").match(/^第0*\d+章[_\- 　]+(.+)$/)
      if (!match) continue
      const title = match[1].trim()
      if (title) titles.set(title, [...(titles.get(title) || []), file])
    }
  } catch {}
  const findings = []
  for (const [title, files] of titles.entries()) {
    if (files.length > 1) findings.push(`${files.length} 章标题重复「${title}」（${files.join("、").slice(0, 60)}），建议改名。`)
  }
  return findings
}

function proseAfterWrite(root, absolute) {
  if (!fs.existsSync(absolute) || !isProsePath(absolute)) return ""
  const findings = []
  try {
    const bytes = fs.statSync(absolute).size
    if (bytes < 200) findings.push(`【落盘】正文仅 ${bytes} 字节，疑似未写完或落盘失败。`)
    const text = fs.readFileSync(absolute, "utf8")
    findings.push(...proseNetFindings(text))
    const wordcount = wordcountFinding(absolute, text)
    if (wordcount) findings.push(wordcount)
  } catch {
    return ""
  }
  findings.push(...duplicateTitleFindings(absolute))
  if (!findings.length) return ""
  return `=== 正文兜底检测（${safeRelative(root, absolute)}）===\n轻量确定性网发现以下问题，处理后复扫到净：\n${findings.join("\n")}`
}

function postToolProseCheck() {
  const root = projectRoot()
  const notes = targetPaths(hookInput).map((target) => proseAfterWrite(root, target)).filter(Boolean)
  if (notes.length) emit(hookContext("PostToolUse", notes.join("\n\n")))
}

function main() {
  const event = process.argv[2] || ""
  try {
    if (event === "session-start") sessionStart()
    else if (event === "pre-tool-prose-guard") preToolProseGuard()
    else if (event === "pre-tool-commit-advisory") preToolCommitAdvisory()
    else if (event === "post-tool-prose-check") postToolProseCheck()
    else {
      process.stderr.write(`unknown oh-story ZCode hook event: ${event}\n`)
      process.exitCode = 2
    }
  } catch (error) {
    // Hook checks are defensive guardrails. Unexpected parse/filesystem failures
    // fail open and are diagnosable without corrupting strict stdout JSON.
    process.stderr.write(`[oh-story zcode hook] ${error instanceof Error ? error.message : String(error)}\n`)
  }
}

if (require.main === module) main()

module.exports = { continuityFindings, proseNetFindings, extractProseTargets, extractPatchTargets, isGitCommitCommand }
