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
  command -v python3 >/dev/null 2>&1 || return 1
  python3 - <<'PY'
import json
import os
import re
import shlex
import sys

raw = os.environ.get("STORY_COMMIT_COMMAND", "")
if not raw:
    hook_input = os.environ.get("HOOK_INPUT", "")
    if not hook_input:
        sys.exit(1)
    try:
        obj = json.loads(hook_input)
    except Exception:
        obj = {}

    def find_command(value):
        if isinstance(value, dict):
            for key in ("command", "cmd", "script"):
                if isinstance(value.get(key), str):
                    return value[key]
            for key in ("tool_input", "input", "parameters", "args"):
                found = find_command(value.get(key))
                if found:
                    return found
        return ""

    raw = find_command(obj)

if not raw:
    sys.exit(1)

# Bash treats unescaped newlines like command separators; normalize them before
# shlex tokenization so multi-line Bash tool inputs still expose later git commits.
raw = raw.replace("\r\n", "\n").replace("\r", "\n").replace("\n", " ; ")

try:
    lexer = shlex.shlex(raw, posix=True, punctuation_chars="();|&{}")
    lexer.whitespace_split = True
    tokens = list(lexer)
except TypeError:
    try:
        tokens = shlex.split(raw, posix=True)
    except Exception:
        tokens = raw.split()
except Exception:
    tokens = raw.split()

if not tokens:
    sys.exit(1)

assignment = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*=")
separators = {";", "&&", "||", "|", "|&", "&"}
openers = {"(", "{"}
closers = {")", "}"}
control_words = {"then", "do", "else", "elif"}
wrappers = {"command", "noglob"}
git_options_with_value = {
    "-C", "-c", "--git-dir", "--work-tree", "--namespace",
    "--exec-path", "--super-prefix", "--config-env",
}

def skip_shell_wrappers(i):
    while i < len(tokens):
        tok = tokens[i]
        if tok in openers:
            i += 1
            continue
        if assignment.match(tok):
            i += 1
            continue
        if tok in wrappers:
            i += 1
            continue
        if tok == "env":
            i += 1
            while i < len(tokens):
                if assignment.match(tokens[i]):
                    i += 1
                    continue
                if tokens[i] in {"-i", "--ignore-environment"}:
                    i += 1
                    continue
                break
            continue
        break
    return i

def is_git_commit_at(i):
    if i >= len(tokens) or tokens[i] != "git":
        return False
    i += 1
    while i < len(tokens):
        tok = tokens[i]
        if tok in closers or tok in separators:
            return False
        if tok == "commit":
            return True
        if tok == "--":
            i += 1
            continue
        if tok in git_options_with_value:
            i += 2
            continue
        if any(tok.startswith(prefix + "=") for prefix in git_options_with_value if prefix.startswith("--")):
            i += 1
            continue
        if tok.startswith("-c") and tok != "-c":
            i += 1
            continue
        if tok.startswith("-"):
            i += 1
            continue
        return False
    return False

segment_start = True
i = 0
while i < len(tokens):
    tok = tokens[i]
    if tok in separators or tok in control_words:
        segment_start = True
        i += 1
        continue
    if segment_start or tok in openers:
        start = skip_shell_wrappers(i)
        if is_git_commit_at(start):
            sys.exit(0)
        segment_start = False
    i += 1

sys.exit(1)
PY
}

# PreToolUse matcher 可能过宽或目标 CLI 不支持 if 字段；脚本必须内部自检。
# 没有明确 git commit 命令时完全静默退出，避免 echo/grep 等命令误触发。
if ! is_git_commit_command; then
  exit 0
fi

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
  case "$file" in
    正文.md|*/正文.md|正文/*|*/正文/*)
      HARDCODED=$(grep -nE "(身高|体重|年龄)[[:space:]]*[：:][[:space:]]*[0-9]+" "$FULL_PATH" 2>/dev/null || true)
      if [ -n "$HARDCODED" ]; then
        WARNINGS="$WARNINGS\n⚠ $file: Hardcoded character attributes found (should reference 设定/ files):\n$HARDCODED"
      fi
      ;;
  esac

  # 检查设定文件的必填字段（结构化匹配：key:value 格式）
  case "$file" in
    设定/*|*/设定/*)
      if ! grep -qE "^[[:space:]]*(名字|姓名|名称|name|Name)[[:space:]]*[：:]" "$FULL_PATH" 2>/dev/null; then
        WARNINGS="$WARNINGS\n⚠ $file: Setting file missing required fields (name/名字: ...)"
      fi
      ;;
  esac
done < <(git -C "$ROOT" -c core.quotepath=false diff --cached --relative --name-only --diff-filter=ACM -z -- . 2>/dev/null || true)

if [ -n "$WARNINGS" ]; then
  echo "=== Story Commit Warnings (advisory only, not blocking) ==="
  printf '%b\n' "$WARNINGS"
  echo "=== End Warnings ==="
fi

# Always exit 0 — 写作流程不能被 hook 卡住
exit 0
