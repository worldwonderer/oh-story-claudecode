#!/usr/bin/env node
"use strict"

// story_hook_cli.js — Claude Code bash hook 的 node 桥
// Claude 侧 hook 是 bash（settings.json 挂 bash 脚本），归核逻辑走这里 require 的
// 共享核 story_hook_core.js——和 OpenCode/ZCode 用的是同一份，由 check-shared-files
// 保证字节相同。归核（单份实现在 core）的面：正文网/字数（prose-net）、路径抽取
// （extract-target）、git commit 侦测（is-git-commit）、连续性（continuity）、追踪检查点
// （tracking-checkpoint）。
// 尚未归核、各端独立实现的面：
//   - 大纲/细纲阻断判定：Claude 走 guard-outline-before-prose.sh 纯 bash（本 cli 无
//     prose-block 子命令）。它必须在无 node 的运行时也拦得住（官方推荐的原生二进制装法
//     不带 Node），所以只能用纯 bash 判定；反过来追踪检查点要解析 JSON，无 node 就没法做，
//     故走上面的 tracking-checkpoint 子命令、node 缺席时降级放行。
//     codex prose_block_reason ↔ core proseBlockReason 由
//     scripts/test-prose-net-parity.sh Part E 锁 parity。
//   - staged markdown warnings：Claude 走 validate-story-commit.sh bash grep；codex
//     staged_markdown_warnings ↔ core stagedMarkdownWarnings 同由 Part E 锁 parity。
//     匹配语义与文案以 JS core 为准。
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
  // 轻量确定性网（含毒句式）+ 字数欠账，对齐旧内嵌 python 第二段的 out 列表（net 逐条 +
  // 可选字数行）。读文件失败静默退出（兜底不反噬流程）。
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
} else if (command === "prose-toxic") {
  // 毒句式确定性检测单跑（供 guard 前置门 / 手工复扫调用；prose-net 已含同一组结果）。
  // 契约：stdout 空 = 干净；非空 = findings 行（每行一条，末行为清零要求 + 完整扫描提示）。
  // 文件读不了或任何内部异常一律 exit 0 静默放行（与本 CLI 的降级哲学一致，兜底不反噬流程）。
  const absolute = args[0]
  try {
    const text = fs.readFileSync(absolute, "utf8")
    const out = core.toxicPhraseFindings(text)
    if (out.length) process.stdout.write(out.join("\n"))
  } catch {
    process.exit(0)
  }
} else if (command === "tracking-checkpoint") {
  // 追踪检查点门（BLOCKING 面）：guard-outline-before-prose.sh 调本子命令复用共享核
  // trackingCheckpointIssue，与 codex py / opencode / zcode 同一份判定（issue #305 之前
  // Claude 侧独缺这道门，同一工程同一次写正文，主力端放行、另三端拦下）。
  // 用法：tracking-checkpoint <root> <bookDir> <上一章号|->
  //   首建新章传上一章号，做「上一章事务是否已提交」的顺序校验；
  //   正文已存在（续写/改稿/回炉）传 `-`，只校验 state 自身的存在/schema/修订一致性。
  // 契约：stdout 空 = 放行；非空 = 完整拦截文案，与 core.proseBlockReason 逐字一致。
  // node 缺席时 bash 侧根本不调本子命令（等同放行），故内部异常也一律 exit 0 静默放行，
  // 与本 CLI 其余子命令的降级哲学一致（兜底不反噬流程）。
  const [root, book, expectedRaw] = args
  try {
    // 注意别写成 Number(expectedRaw) 直接判整数：空串会被转成 0，把「续写」误当成
    // 「首建第 1 章」去校验顺序。先排掉空串/缺省/占位符 `-`。
    const expected =
      expectedRaw && expectedRaw !== "-" && Number.isInteger(Number(expectedRaw))
        ? Number(expectedRaw)
        : null
    const issue = core.trackingCheckpointIssue(book, true, expected)
    if (issue) process.stdout.write(`⛔ 写正文被拦截：${core.safeRelative(root, book)} 的${issue}。`)
  } catch {
    process.exit(0)
  }
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
