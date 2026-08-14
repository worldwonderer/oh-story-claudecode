#!/bin/bash
# test-story-cover-codex-imagegen.sh — story-cover 的 Codex 内置 ImageGen 通路契约。
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SKILL="$REPO_ROOT/skills/story-cover/SKILL.md"

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

assert_contains() {
  local needle="$1"
  grep -F -- "$needle" "$SKILL" >/dev/null 2>&1 || fail "missing story-cover contract: $needle"
}

assert_contains 'Codex 内置 ImageGen（默认）'
assert_contains '计入 Codex 通用用量，**无需** `OPENAI_API_KEY` 或 `GPT_IMAGE_API_KEY`'
assert_contains '只要内置 `image_gen` 工具可用，就直接调用工具，不检查 API Key'
assert_contains '`story-cover` 必须自行完成工具调用和落盘'
assert_contains '每个构图方案单独调用一次内置工具'
assert_contains '读取工具结果返回的生成图片绝对路径'
assert_contains '保留 `$CODEX_HOME/generated_images/` 下的原文件'
assert_contains '不要求用户 `export`'
assert_contains "SRC='<image_gen 工具返回的生成图片绝对路径>'"
assert_contains "REF_IMAGE='<参考图路径或 URL；没有则留空>'"
assert_contains '#### API 回退'
assert_contains ': "${GPT_IMAGE_API_KEY:?请设置 export GPT_IMAGE_API_KEY=你的key}"'

builtin_line=$(grep -n -F '#### Codex 内置 ImageGen（默认）' "$SKILL" | head -1 | cut -d: -f1)
fallback_line=$(grep -n -F '#### API 回退' "$SKILL" | head -1 | cut -d: -f1)
[ -n "$builtin_line" ] && [ -n "$fallback_line" ] || fail "could not locate generation route headings"
[ "$builtin_line" -lt "$fallback_line" ] || fail "Codex built-in route must precede API fallback"

echo "PASS: story-cover prefers Codex built-in ImageGen and keeps the API fallback"
