import type { Plugin } from "@opencode-ai/plugin"
import * as fs from "node:fs"
import * as path from "node:path"
import { execSync } from "node:child_process"

interface StoryDeployed {
  agents_version?: number
  setup_skill_version?: string
  target_cli?: string
  resolver_strategy?: string
  references_dir?: string
}

function projectRoot(): string {
  try {
    return execSync("git rev-parse --show-toplevel", {
      cwd: process.cwd(),
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim()
  } catch {
    return process.cwd()
  }
}

function readSentinelField(root: string, field: string): string {
  const sentinelPath = path.join(root, ".story-deployed")
  if (!fs.existsSync(sentinelPath)) return ""
  const content = fs.readFileSync(sentinelPath, "utf-8")
  for (const line of content.split("\n")) {
    const clean = line.replace(/\r$/, "")
    const match = clean.match(new RegExp(`^${field}:\\s*(.+)`))
    if (match) {
      let val = match[1].trim()
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1)
      }
      return val
    }
  }
  return ""
}

function readSentinel(root: string): StoryDeployed | null {
  const sentinelPath = path.join(root, ".story-deployed")
  if (!fs.existsSync(sentinelPath)) return null
  const agentsVer = readSentinelField(root, "agents_version")
  return {
    agents_version: agentsVer ? parseInt(agentsVer, 10) : undefined,
    setup_skill_version: readSentinelField(root, "setup_skill_version") || undefined,
    target_cli: readSentinelField(root, "target_cli") || undefined,
    resolver_strategy: readSentinelField(root, "resolver_strategy") || undefined,
    references_dir: readSentinelField(root, "references_dir") || undefined,
  }
}

function sentinelExists(root: string): boolean {
  return fs.existsSync(path.join(root, ".story-deployed"))
}

function discoverActiveBook(root: string): string | null {
  const activeBookPath = path.join(root, ".active-book")
  if (fs.existsSync(activeBookPath)) {
    const active = fs.readFileSync(activeBookPath, "utf-8").split("\n")[0].trim()
    if (active) {
      const resolved = path.resolve(root, active)
      const normalizedRoot = path.resolve(root)
      if (resolved.startsWith(normalizedRoot + path.sep) && fs.existsSync(resolved)) return resolved
    }
  }

  const firstTrackDir = findFirstDir(root, "追踪", 4)
  if (firstTrackDir) return path.dirname(firstTrackDir)

  const bodyDir = findFirstBodyDir(root, 4)
  if (bodyDir) return bodyDir

  return null
}

function findFirstDir(base: string, name: string, maxDepth: number): string | null {
  if (maxDepth <= 0) return null
  try {
    for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue
      const full = path.join(base, entry.name)
      if (entry.name === name) return full
      const found = findFirstDir(full, name, maxDepth - 1)
      if (found) return found
    }
  } catch {}
  return null
}

function findFirstBodyDir(base: string, maxDepth: number): string | null {
  if (maxDepth <= 0) return null
  try {
    for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue
      const full = path.join(base, entry.name)
      if (entry.name === "正文") return path.dirname(full)
      const found = findFirstBodyDir(full, maxDepth - 1)
      if (found) return found
    }
    for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
      if (entry.isFile() && entry.name === "正文.md") return base
    }
  } catch {}
  return null
}

function tryGit(root: string, args: string): string {
  try {
    return execSync(`git ${args}`, {
      cwd: root,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim()
  } catch {
    return ""
  }
}

// OpenCode Plugin API 提供 chat.message hook（见 @opencode-ai/plugin 类型定义），
// 可用于注入 session-start 检查与缺口检测。当前版以 partial 方式仅部署
// experimental.session.compacting 和 tool.execute.before，后续版本可扩展。

function preCompactOutput(): string {
  const root = projectRoot()
  const lines = ["=== Pre-Compact Summary ==="]
  const bookDir = discoverActiveBook(root)
  if (bookDir) {
    const ctxPath = path.join(bookDir, "追踪", "上下文.md")
    if (fs.existsSync(ctxPath)) {
      const lineCount = fs.readFileSync(ctxPath, "utf-8").split("\n").length
      const relPath = path.relative(root, ctxPath)
      lines.push(`Writing context: ${relPath} (${lineCount} lines)`)
    } else {
      lines.push("Active state: not found")
    }
  } else {
    lines.push("Active state: not found")
  }

  const changed = tryGit(root, "diff --name-only")
  const staged = tryGit(root, "diff --name-only --cached")
  const changedCount = changed ? changed.split("\n").filter(Boolean).length : 0
  const stagedCount = staged ? staged.split("\n").filter(Boolean).length : 0
  lines.push(`Git: ${changedCount} unstaged, ${stagedCount} staged`)

  lines.push("=== Pre-Compact Complete ===")
  return lines.join("\n")
}

// 相对路径按项目根解析（对齐 guard-outline-before-prose.sh 的 $ROOT/$TARGET）
function resolveTarget(root: string, target: string): string {
  const normalized = target.replace(/\\/g, "/")
  return path.isAbsolute(normalized) ? normalized : path.resolve(root, normalized)
}

// 从 bash 命令里提取可能的「正文」写入目标，用于防止绕过 write/edit 守卫
function extractProseTargets(cmd: string): string[] {
  const out: string[] = []
  const re = /[^\s'"<>|;&()]*正文[^\s'"<>|;&()]*/g
  let m: RegExpExecArray | null
  while ((m = re.exec(cmd)) !== null) {
    if (m[0]) out.push(m[0])
  }
  return out
}

// 按目标文件判断是否拦截写正文，逐字对齐 Claude hook guard-outline-before-prose.sh：
// 只拦「首次创建正文文件且缺对应大纲/细纲」，已存在正文（续写/改稿/去AI味）一律放行，
// 解析不到、非正文目标、story-import 迁移一律放行（宁可漏拦不可误伤）。
// 返回拦截原因；返回 null 表示放行。
function proseBlockReason(root: string, abs: string): string | null {
  const base = path.basename(abs)
  const parent = path.basename(path.dirname(abs))

  // 短篇单文件正文：{书}/正文.md
  if (base === "正文.md") {
    if (fs.existsSync(abs)) return null // 已存在 → 续写/改稿放行
    const bookDir = path.dirname(abs)
    // story-import 迁移：已有 拆文库/{书名}/ 分析源时，正文先于小节大纲迁移属正常流程
    if (fs.existsSync(path.join(root, "拆文库", path.basename(bookDir)))) return null
    // 仅在确为短篇工程时拦截（有 设定.md 信号），避免误伤 docs/正文.md 等非作品文件
    if (!fs.existsSync(path.join(bookDir, "设定.md"))) return null
    if (!fs.existsSync(path.join(bookDir, "小节大纲.md"))) {
      return `⛔ 写正文被拦截：${path.relative(root, abs) || abs} 缺少同目录 小节大纲.md。先按 story-short-write 完成「小节大纲.md」再写正文。`
    }
    return null
  }

  // 长篇分章正文：{书}/正文/第N章*.md
  if (parent !== "正文") return null
  if (!/^第.*章.*\.md$/.test(base)) return null
  if (fs.existsSync(abs)) return null // 已存在 → 续写/改稿放行
  const m = base.match(/^第0*(\d+)章/)
  if (!m) return null
  const num = m[1]
  const bookDir = path.dirname(path.dirname(abs))
  // story-import 迁移：已有 拆文库/{书名}/ 分析源时放行（细纲由章节摘要反推、晚于正文迁移）
  if (fs.existsSync(path.join(root, "拆文库", path.basename(bookDir)))) return null
  // 容忍补零差异与标题后缀：按整数章号匹配 大纲/细纲_第*章*.md
  const outlineDir = path.join(bookDir, "大纲")
  let found = false
  try {
    for (const f of fs.readdirSync(outlineDir)) {
      const fm = f.match(/^细纲_第0*(\d+)章.*\.md$/)
      if (fm && fm[1] === num) {
        found = true
        break
      }
    }
  } catch {}
  if (!found) {
    return `⛔ 写正文被拦截：第 ${num} 章缺少细纲（${path.relative(root, outlineDir)}/细纲_第${num}章.md）。先按 story-long-write 单章流程补建细纲再写正文。`
  }
  return null
}

export default (async () => {
  return {
    "experimental.session.compacting": async (
      _input: unknown,
      output: { context: string[]; prompt?: string }
    ) => {
      const preMsg = preCompactOutput()
      if (preMsg) {
        output.context = [...output.context, preMsg]
      }
      // 不注入 post-compact 信息：OpenCode 无压缩后 hook
    },

    "tool.execute.before": async (
      input: { tool: string; args?: Record<string, unknown> },
      output: { args?: Record<string, unknown> }
    ) => {
      const root = projectRoot()
      const targets: string[] = []

      if (input.tool === "write" || input.tool === "edit") {
        const filePath = (output.args?.filePath as string) || ""
        if (filePath) targets.push(resolveTarget(root, filePath))
      } else if (input.tool === "bash") {
        const cmd = (output.args?.command as string) || ""
        for (const t of extractProseTargets(cmd)) targets.push(resolveTarget(root, t))
      } else {
        return
      }

      for (const abs of targets) {
        const reason = proseBlockReason(root, abs)
        if (reason) {
          throw new Error(`${reason}（此操作无法通过 Bash/命令行绕过。）`)
        }
      }
    },
  }
}) satisfies Plugin
