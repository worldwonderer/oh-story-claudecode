import type { Plugin } from "@opencode-ai/plugin"
import * as fs from "node:fs"
import * as path from "node:path"
import { execSync } from "node:child_process"
import {
  discoverActiveBook,
  resolveTarget,
  extractProseTargets,
  proseBlockReason,
  proseAfterWrite,
} from "./lib/story_hook_core.js"

// 写正文守卫的检测逻辑（去 AI 味轻量确定性网、大纲/细纲守卫、字数/落盘/标题去重、
// 正文写入目标抽取）与 ZCode hook 共享同一份 story_hook_core.js，随本插件一起部署到
// .opencode/plugins/lib/story_hook_core.js（放 lib/ 子目录而非平铺：OpenCode 只单层扫描
// .opencode/plugins/*.js 当插件加载，平铺会被误当成第二个插件导致加载失败；lib/ 子目录不在
// 扫描范围内）。这里只保留 OpenCode 宿主相关的部分：项目根定位、
// 事件模型（experimental.session.compacting / tool.execute.*）、以及把发现追加进写工具
// 返回结果的输出信封。共享核以 bash hook 为 oracle，parity 由 test-prose-net-parity.sh 守卫。

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

    // 正文落盘兜底：写正文后跑轻量确定性网（截断/拒绝语/工程词/复读 + 落盘/字数/标题去重），
    // 把发现追加进写工具的返回结果让模型读到。非正文文件、无发现一律不动结果（静默放行）。
    // OpenCode 无 PostToolUse，tool.execute.after 是写后唯一可向模型回话的钩子。
    "tool.execute.after": async (
      input: { tool: string; args?: Record<string, unknown> },
      output: { output?: string }
    ) => {
      if (input.tool !== "write" && input.tool !== "edit") return
      const filePath = (input.args?.filePath as string) || ""
      if (!filePath) return
      const root = projectRoot()
      try {
        const note = proseAfterWrite(root, resolveTarget(root, filePath))
        if (note && typeof output.output === "string") output.output += `\n\n${note}`
      } catch {
        // 兜底不能反过来卡流程：解析失败一律放行
      }
    },
  }
}) satisfies Plugin
