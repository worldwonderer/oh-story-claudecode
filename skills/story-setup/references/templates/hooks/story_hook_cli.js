#!/usr/bin/env node
"use strict"

// story_hook_cli.js — Claude Code bash hook 的 node 桥
// Claude 侧 hook 是 bash（settings.json 挂 bash 脚本），逻辑本体走这里 require 的
// 共享核 story_hook_core.js——和 OpenCode/ZCode 用的是同一份，由 check-shared-files
// 保证字节相同。这样正文网/字数/大纲守卫/连续性/commit 侦测只有一份实现（core），
// 各端只留读写各自 hook I/O 格式的薄壳。node 天生按 UTF-8 写 stdout，顺带免掉了
// 旧内嵌 python 那套 cp936/LC_ALL 编码体操。

const fs = require("node:fs")
const core = require("./story_hook_core.js")

function readStdin() {
  try {
    return fs.readFileSync(0, "utf8")
  } catch {
    return ""
  }
}

// 与旧 extract_target_path 的 dig 逐字对应：只认 dict 的 file_path/path/filePath，
// 再往 tool_input/input/parameters/args 里递归；list 不下钻。
function digTargetPath(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const key of ["file_path", "path", "filePath"]) {
      const found = value[key]
      if (typeof found === "string" && found) return found
    }
    for (const key of ["tool_input", "input", "parameters", "args"]) {
      const found = digTargetPath(value[key])
      if (found) return found
    }
  }
  return ""
}

// 与旧 validate-story-commit find_command 逐字对应：dict 的 command/cmd/script（是字符串就取，
// 允许空串），再往 tool_input/input/parameters/args 递归。
function digCommand(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const key of ["command", "cmd", "script"]) {
      if (typeof value[key] === "string") return value[key]
    }
    for (const key of ["tool_input", "input", "parameters", "args"]) {
      const found = digCommand(value[key])
      if (found) return found
    }
  }
  return ""
}

const [command, ...args] = process.argv.slice(2)

if (command === "extract-target") {
  // PostToolUse 工具输入 JSON → 目标文件路径。无输入/解析失败/无路径都以非零退出，
  // 让 bash 侧静默放行（与旧 python sys.exit(1) 一致）。
  const raw = process.env.HOOK_INPUT || readStdin()
  if (!raw) process.exit(1)
  let obj
  try {
    obj = JSON.parse(raw)
  } catch {
    process.exit(1)
  }
  const target = digTargetPath(obj)
  if (!target) process.exit(1)
  process.stdout.write(target)
} else if (command === "prose-net") {
  // 轻量确定性网 + 字数欠账，对齐旧内嵌 python 第二段的 out 列表（net 逐条 + 可选字数行）。
  // 读文件失败静默退出（兜底不反噬流程）。
  const absolute = args[0]
  let text
  try {
    text = fs.readFileSync(absolute, "utf8")
  } catch {
    process.exit(0)
  }
  const out = core.proseNetFindings(text)
  const wordcount = core.wordcountFinding(absolute, text)
  if (wordcount) out.push(wordcount)
  if (out.length) process.stdout.write(out.join("\n"))
} else if (command === "is-git-commit") {
  // git commit 侦测。命令优先取 STORY_COMMIT_COMMAND，缺省再从 HOOK_INPUT 挖 command/cmd/script。
  // 用共享核 isGitCommitCommand（js 分词语义，与 OpenCode/ZCode 一致；对「引号内分隔符」这类
  // 边界与旧 python shlex 有已文档化、仅 advisory 的差异）。是 git commit → exit 0，否则 exit 1。
  let raw = process.env.STORY_COMMIT_COMMAND || ""
  if (!raw) {
    const hookInput = process.env.HOOK_INPUT || ""
    if (!hookInput) process.exit(1)
    let obj
    try {
      obj = JSON.parse(hookInput)
    } catch {
      obj = {}
    }
    raw = digCommand(obj)
  }
  if (!raw) process.exit(1)
  process.exit(core.isGitCommitCommand(raw) ? 0 : 1)
} else if (command === "continuity") {
  // 跨批连续性兜底：追踪 staleness + 章节标题去重。用共享核 continuityFindings（消息串与旧
  // python 逐字一致；多书/并列去重的排序按 js 语义，仅影响 advisory 顺序）。
  const root = args[0]
  const out = core.continuityFindings(root)
  if (out.length) process.stdout.write(out.join("\n") + "\n")
} else {
  process.exit(2)
}
