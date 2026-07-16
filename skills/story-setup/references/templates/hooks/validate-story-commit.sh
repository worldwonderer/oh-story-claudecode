#!/bin/bash
# validate-story-commit.sh — 在 git commit 时检查格式问题（WARNING only, no BLOCKING）
set -euo pipefail

source "$(dirname "$0")/lib/common.sh"

HOOK_INPUT="${CLAUDE_TOOL_INPUT:-}"
if [ -z "$HOOK_INPUT" ] && [ ! -t 0 ]; then
  HOOK_INPUT="$(cat)"
fi
export HOOK_INPUT

is_git_commit_command() {
  # 走 node 共享核 isGitCommitCommand：命令优先取 STORY_COMMIT_COMMAND，缺省从 HOOK_INPUT
  # 挖 command/cmd/script。js 分词语义，与 OpenCode/ZCode 一致；对「引号内分隔符」这类边界
  # 与旧 python shlex 有已文档化、仅 advisory 的差异（不影响本 hook 的 exit 0 非阻塞语义）。
  # node 探测不到就当「非 commit」，让下方静默放行（兜底不反噬提交流程；native 安装可能
  # 无 node，此时 commit 格式提示停用，session-start.sh 会在会话起点提示一次）。
  node -e "" >/dev/null 2>&1 || return 1
  local CLI; CLI="$(dirname "$0")/story_hook_cli.js"
  [ -f "$CLI" ] || return 1
  node "$CLI" is-git-commit >/dev/null 2>&1
}

# PreToolUse matcher 可能过宽或目标 CLI 不支持 if 字段；脚本必须内部自检。
# 没有明确 git commit 命令时完全静默退出，避免 echo/grep 等命令误触发。
if ! is_git_commit_command; then
  exit 0
fi

# 后续 case + grep 在中文路径/正文内容上做匹配。Windows 中文系统若导出 GBK 区域设置，
# grep 按 GBK 多字节解码 UTF-8 内容会乱。强制 C 区域走字节匹配才稳定（issue #164 同类）。
# 放在 is_git_commit_command（内嵌 python）之后，避免影响其输入解码。
export LC_ALL=C

ROOT=$(project_root)
GIT_ROOT=$(git -C "$ROOT" rev-parse --show-toplevel 2>/dev/null || printf '%s\n' "$ROOT")
WARNINGS=""

# 获取即将 commit 的文件列表（使用 -z null 分隔避免空格路径问题）
while IFS= read -r -d '' file; do
  # 跳过非 md 文件
  case "$file" in
    *.md) ;;
    *) continue ;;
  esac

  FULL_PATH="$ROOT/$file"
  if [ ! -f "$FULL_PATH" ]; then
    FULL_PATH="$GIT_ROOT/$file"
  fi

  # 检查正文文件是否包含硬编码的情节值
  # 匹配语义与警告文案对齐 JS core（story_hook_core.js stagedMarkdownWarnings，跨 CLI 的
  # 权威实现；py↔js 由 scripts/test-prose-net-parity.sh Part E 锁 parity）。
  # 冒号/空白都用交替而不是把全角字符塞进方括号字符组：含全角字符的字符组在 C 区域会被
  # 拆成单字节、漏匹配；(：|:) 同时命中全角「：」和半角「:」，([[:space:]]|　) 在 LC_ALL=C 下
  # 也认全角空格 U+3000（否则全角空格分隔的写法会漏检/误判）。
  case "$file" in
    正文.md|*/正文.md|正文/*|*/正文/*)
      HARDCODED=$(grep -nE "(身高|体重|年龄)([[:space:]]|　)*(：|:)([[:space:]]|　)*[0-9]+" "$FULL_PATH" 2>/dev/null || true)
      if [ -n "$HARDCODED" ]; then
        WARNINGS="$WARNINGS\n⚠ $file: 正文硬编码角色属性，应引用设定文件：\n$HARDCODED"
      fi
      ;;
  esac

  # 检查设定文件的必填字段（结构化匹配：key:value 格式）。grep -i 对齐 JS core 的 /i：
  # 大小写不敏感命中 name/NAME/Name（LC_ALL=C 下 -i 只折叠 ASCII，中文字节不受影响）。
  case "$file" in
    设定/*|*/设定/*)
      if ! grep -qiE "^([[:space:]]|　)*(名字|姓名|名称|name)([[:space:]]|　)*(：|:)" "$FULL_PATH" 2>/dev/null; then
        WARNINGS="$WARNINGS\n⚠ $file: 设定文件缺少 name/名字 必填字段。"
      fi
      ;;
  esac
done < <(git -C "$ROOT" -c core.quotepath=false diff --cached --relative --name-only --diff-filter=ACM -z -- . 2>/dev/null || true)

if [ -n "$WARNINGS" ]; then
  echo "=== Story Commit Warnings（advisory only）==="
  printf '%b\n' "$WARNINGS"
  echo "=== End Warnings ==="
fi

# Always exit 0 — 写作流程不能被 hook 卡住
exit 0
