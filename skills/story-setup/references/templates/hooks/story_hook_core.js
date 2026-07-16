"use strict"

const fs = require("node:fs")
const path = require("node:path")
const { spawnSync } = require("node:child_process")

function existingDir(value) {
  if (typeof value !== "string" || !value.trim()) return null
  try {
    const resolved = path.resolve(value)
    return fs.statSync(resolved).isDirectory() ? resolved : null
  } catch {
    return null
  }
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

function proseBlockReason(root, absolute) {
  const base = path.basename(absolute)
  const parent = path.basename(path.dirname(absolute))
  if (base === "正文.md") {
    if (fs.existsSync(absolute)) return null
    const book = path.dirname(absolute)
    if (fs.existsSync(path.join(root, "拆文库", path.basename(book)))) return null
    if (!fs.existsSync(path.join(book, "设定.md"))) return null
    if (!fs.existsSync(path.join(book, "小节大纲.md"))) {
      return `⛔ 写正文被拦截：${safeRelative(root, absolute)} 缺少同目录 小节大纲.md。先按 story-short-write 完成「小节大纲.md」再写正文。`
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
  // 欠账门（无状态）：写第 N 章（首建）前，上一章有未清毒句式且未标「去味:跳过」豁免时先清再写。
  // 判据现算自上一章文件本身，不落任何状态文件；找不到上一章/读取失败一律放行（宁可漏拦不可误伤）。
  // js↔py 文案由 check-hook-regex-sync.sh 锁同步，判定由 test-prose-net-parity.sh Part E 锁 parity。
  const prevNum = Number(chapter) - 1
  if (prevNum >= 1) {
    let prevFile = null
    try {
      for (const file of fs.readdirSync(path.dirname(absolute))) {
        const pm = file.match(/^第0*(\d+)章.*\.md$/)
        if (pm && Number(pm[1]) === prevNum) {
          prevFile = path.join(path.dirname(absolute), file)
          break
        }
      }
    } catch {}
    if (prevFile) {
      let prevText = null
      try { prevText = fs.readFileSync(prevFile, "utf8") } catch {}
      if (prevText !== null && !/去味(：|:)跳过/.test(prevText.split(/\r?\n/).slice(0, 6).join("\n"))) {
        const hits = toxicPhraseFindings(prevText).filter((line) => line.startsWith("第"))
        if (hits.length) {
          const shown = hits.slice(0, 6)
          const more = hits.length - shown.length
          let reason = `⛔ 写正文被拦截：上一章（${path.basename(prevFile)}）有 ${hits.length} 处未清毒句式欠账，先清零再写第 ${chapter} 章；用户显式豁免时在上一章标题行下加 <!-- 去味:跳过 --> 后重试。\n${shown.join("\n")}`
          if (more > 0) reason += `\n（另有 ${more} 处，完整扫描：node <skill>/scripts/check-ai-patterns.js --check 上一章文件）`
          return reason
        }
      }
    }
  }
  return null
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

// ── 毒句式（确定性 AI 句式指纹，写后正文网热路径）─────────────────────────────
// 与 check-ai-patterns.js 的同名新规则统一规格：只收确定性、低误报的句式；密度型/
// advisory 检测归 check-ai-patterns.js 深扫，不进这张每次写正文都跑的网。全部正则
// 线性扫描、量词有界，无回溯灾难。台词/弹幕/系统播报不算：逐行把成对引号段等长
// 句号占位（同 check-ai-patterns.js 的 maskQuoted：占位天然截断各规则的字符类，
// 规则不会跨引号拼出假命中），占位后仍残留引号字符（跨行对话/未闭合）的行整行
// 跳过。js↔py 同构实现（codex
// story_codex_hook.py）由 scripts/check-hook-regex-sync.sh（规范串逐字锁）与
// scripts/test-prose-net-parity.sh（fixture 逐字 diff）锁 parity，文案以本核为准。
const TOXIC_QUOTE_SPANS = [/「[^」]*」/g, /『[^』]*』/g, /【[^】]*】/g, /“[^”]*”/g, /‘[^’]*’/g, /"[^"]*"/g, /'[^']*'/g]
const TOXIC_QUOTE_CHARS = new Set(Array.from("「」『』【】“”‘’\"'"))
// 分句起点边界（前一字符属于它才认「是A，不是B」的分句首「是」）；同时用作确认语的右边界。
const TOXIC_CLAUSE_BOUNDARY = new Set(Array.from("，,。.！!？?；;：:、…—~ \t　"))
// 疑问尾（是吗/是吧/是嘛）与确认语（是的/是啊/是呀/是呢+边界）里的「是」不是对比句系动词；
// 排除逻辑移植自 check-ai-patterns.js 的 TAG_PARTICLES / AFFIRMATION_TAG_PARTICLES。
const TOXIC_TAG_PARTICLES = new Set(["吗", "吧", "嘛"])
const TOXIC_AFFIRM_PARTICLES = new Set(["的", "啊", "呀", "呢"])
const TOXIC_TRAILER_WINDOW = 600
const TOXIC_SENTENCE_PATTERNS = [
  [/声音(?:并)?不[大高响亮][^。！？!?\n]{0,16}[却但偏]/g, "voice-contrast", "删「不X…却Y」反差腔，直接写具体效果或动作。"],
  [/(?:没有[^。！？!?\n，,]{1,12}[，,]){2}/g, "negation-parade", "「没有…，没有…」排比删到只剩一个或全删，改写正面在场的细节。"],
  [/是[^。！？!?\n，,]{1,12}[，,]\s*(?:而)?不是[^。！？!?\n]{1,20}/g, "reverse-not-is", "删否定铺垫，直接写肯定项，或改成动作细节。"],
  [/不是[^。！？!?\n]{1,16}[，,]\s*(?:而)?是/g, "not-is-comparison", "删否定铺垫，直接写肯定项，或改成动作细节。"],
]
// 「正式拉开序幕/帷幕」是场内事件的报幕式陈述，不是叙述者预告，lookbehind 排除（同 check-ai-patterns.js）。
const TOXIC_TRAILER_PATTERN = /没人知道|谁也不知道|谁也没想到|殊不知|(?:这)?才刚刚开(?:始|头)|正(?:朝着|向着)[^。！？!?\n]{0,24}(?:压|涌|袭|逼)(?:了?过去|了?过来|来)|(?<!正式)拉开(?:序幕|帷幕)|即将(?:开始|来临|降临)/
// 「是A，不是B」的反问尾巴（…，不是吗/么/吧）不算对比句；取匹配段最后一个「不是」后的首字判断。
const TOXIC_REVERSE_TAIL = /.*[，,]\s*(?:而)?不是([^。！？!?\n]*)$/

function maskQuotedSpans(line) {
  let out = line
  for (const spans of TOXIC_QUOTE_SPANS) out = out.replace(spans, (m) => "。".repeat(m.length))
  return out
}

// 「是不是」疑问、翻转「是」后跟疑问尾/确认语 → 不算「不是A，(而)是B」对比句。
function toxicNotIsExcluded(line, matched, start) {
  if (start > 0 && line[start - 1] === "是") return true
  const end = start + matched.length
  const c1 = line[end] || ""
  const c2 = line[end + 1] || ""
  if (TOXIC_TAG_PARTICLES.has(c1)) return true
  if (TOXIC_AFFIRM_PARTICLES.has(c1) && (c2 === "" || TOXIC_CLAUSE_BOUNDARY.has(c2))) return true
  return false
}

// 只认分句首的「是A，不是B」：句中「但是/还是/只是/他是…」的「是」一律不算（either-or
// 「不是/就是/也是」与全部「X是」连词/副词合成词都被分句首判定排除）；「是的，不是…」
// 确认语开头、「是不是…」问句起头、「…，不是吗/么/吧」反问尾巴不算（同 check-ai-patterns.js）。
function toxicReverseNotIsExcluded(line, matched, start) {
  const prev = start > 0 ? line[start - 1] : ""
  if (prev !== "" && !TOXIC_CLAUSE_BOUNDARY.has(prev)) return true
  if (line.slice(start + 1, start + 3) === "不是") return true
  const c1 = line[start + 1] || ""
  const c2 = line[start + 2] || ""
  if ((TOXIC_TAG_PARTICLES.has(c1) || TOXIC_AFFIRM_PARTICLES.has(c1)) && (c2 === "" || TOXIC_CLAUSE_BOUNDARY.has(c2))) return true
  const tail = matched.match(TOXIC_REVERSE_TAIL)
  const t1 = tail && tail[1] ? tail[1][0] : ""
  if (t1 === "吗" || t1 === "么" || t1 === "吧") return true
  return false
}

// 每行只报第一条命中的句式规则（复扫到净哲学：改完一处再扫下一处）。
function matchToxicSentence(line) {
  for (const [regex, label, fix] of TOXIC_SENTENCE_PATTERNS) {
    regex.lastIndex = 0
    let match
    while ((match = regex.exec(line)) !== null) {
      if (label === "not-is-comparison" && toxicNotIsExcluded(line, match[0], match.index)) continue
      if (label === "reverse-not-is" && toxicReverseNotIsExcluded(line, match[0], match.index)) continue
      return [label, fix, match[0]]
    }
  }
  return null
}

function toxicPhraseFindings(text) {
  const findings = []
  const content = []
  text.split("\n").forEach((raw, index) => {
    const line = raw.trim()
    if (skippableLine(line)) return
    const masked = maskQuotedSpans(line)
    for (const ch of masked) {
      if (TOXIC_QUOTE_CHARS.has(ch)) return
    }
    content.push([index + 1, masked])
  })
  for (const [lineNo, masked] of content) {
    const hit = matchToxicSentence(masked)
    if (hit) findings.push(`第${lineNo}行 毒句式[${hit[0]}]：『${hit[2].slice(0, 20)}』——${hit[1]}`)
  }
  // trailer-ending 只扫文末 600 字窗口（引号占位后按行累计，边界行整行计入）。
  let acc = 0
  let cut = content.length
  while (cut > 0 && acc < TOXIC_TRAILER_WINDOW) {
    cut -= 1
    acc += Array.from(content[cut][1]).length
  }
  for (let i = cut; i < content.length; i++) {
    const [lineNo, masked] = content[i]
    const match = masked.match(TOXIC_TRAILER_PATTERN)
    if (match) findings.push(`第${lineNo}行 毒句式[trailer-ending]：『${match[0].slice(0, 20)}』——删章尾预告腔，用正在发生的动作或画面收章。`)
  }
  if (findings.length) findings.push("毒句式是确定性 AI 指纹：本章须清零后再继续。完整扫描：node <skill>/scripts/check-ai-patterns.js --check <正文文件>")
  return findings
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
  // 「去味:跳过」豁免与欠账门同判据（文件首 6 行）：标记在场时跳过毒句式推回，
  // 其余网（元信息/占位/复读/截断）照常——否则按拦截提示加标记的那次 Edit 会把
  // 已豁免的毒句式再次当硬信号推回。
  if (!/去味(：|:)跳过/.test(text.split(/\r?\n/).slice(0, 6).join("\n"))) {
    findings.push(...toxicPhraseFindings(text))
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
    ? `字数：第${chapter}章 实际 ${actual} 字 < 目标 ${target} 的 90%（${Math.floor(target * 0.9)}）。对照细纲字数预算定位欠账的密点、一次性重写到配额，别挤牙膏回炉。`
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
    if (bytes < 200) findings.push(`【落盘】正文仅 ${bytes} 字节，疑似未写完/落盘失败（quota/超时中断？），请核对并补写。`)
    const text = fs.readFileSync(absolute, "utf8")
    findings.push(...proseNetFindings(text))
    const wordcount = wordcountFinding(absolute, text)
    if (wordcount) findings.push(wordcount)
  } catch {
    return ""
  }
  findings.push(...duplicateTitleFindings(absolute))
  if (!findings.length) return ""
  return `=== 正文兜底检测（${safeRelative(root, absolute)}）===\n轻量确定性网自动复扫（模型无关，防主会话漏跑收尾）。按类型处理后复扫到净：\n${findings.join("\n")}`
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

module.exports = {
  existingDir,
  safeRelative,
  resolveTarget,
  firstLine,
  findFirst,
  discoverActiveBook,
  discoverAllBooks,
  continuityFindings,
  extractProseTargets,
  extractPatchTargets,
  proseBlockReason,
  isProsePath,
  wordcountFinding,
  duplicateTitleFindings,
  proseAfterWrite,
  shellWords,
  isGitCommitCommand,
  stagedMarkdownWarnings,
  TERMINAL,
  QUOTE_OPENERS,
  SOFT_PATTERNS,
  HARD_PATTERNS,
  skippableLine,
  proseNetFindings,
  maskQuotedSpans,
  toxicPhraseFindings,
}
