#!/bin/bash
# test-story-cover-codex-imagegen.sh — story-cover 的 Codex 内置 ImageGen 通路契约。
set -euo pipefail

SKILL="$(cd "$(dirname "$0")/.." && pwd)/skills/story-cover/SKILL.md"
ROUTES='/^## 生成通路$/,/^## 输出参数与 API 回退环境变量$/p'
BUILTIN='/^#### Codex 内置 ImageGen（优先）$/,/^#### API 回退$/p'
API='/^#### API 回退$/,/^### Step 5：/p'
EXPORT='/^### Step 5：/,/^### Step 6：/p'

fail() { echo "FAIL: $*" >&2; exit 1; }

assert_all() {
  local range="$1" needle
  shift
  for needle in "$@"; do
    sed -n "$range" "$SKILL" | grep -F -- "$needle" >/dev/null 2>&1 || fail "missing contract: $needle"
  done
}

assert_none() {
  local range="$1" needle
  shift
  for needle in "$@"; do
    ! sed -n "$range" "$SKILL" | grep -F -- "$needle" >/dev/null 2>&1 || fail "unexpected contract: $needle"
  done
}

assert_all "$ROUTES" \
  'Codex 内置（优先）' \
  '计入 Codex 通用用量，无需 `OPENAI_API_KEY` 或 `GPT_IMAGE_API_KEY`' \
  '`story-cover` 自行调用工具，不让用户另开命令' \
  '内置调用失败时先报告错误，不静默切换到可能收费的 API'

assert_all "$BUILTIN" \
  '比例和安全区写进提示词，不传 `GPT_IMAGE_MODEL`、`GPT_IMAGE_SIZE`、`response_format`' \
  '本地文件先用图片查看工具载入会话；URL 先下载再载入' \
  '每个构图方案单独调用一次' '先创建 `BOOK_DIR/封面/`' '`N` 自增且不覆盖旧版' \
  '保留 `$CODEX_HOME/generated_images/` 原文件' \
  '同时保存同名 `.prompt.txt`，有参考图再保存 `.ref.txt`' \
  '确认图片可读，并把原图绝对路径交给 Step 5'
assert_none "$BUILTIN" 'curl' '${GPT_IMAGE_API_KEY:?'

assert_all "$API" '$BASE_URL/images/generations' '$BASE_URL/images/edits'
KEY_GUARD=': "${GPT_IMAGE_API_KEY:?请设置 export GPT_IMAGE_API_KEY=你的key}"'
[ "$(sed -n "$API" "$SKILL" | grep -F -c "$KEY_GUARD")" -eq 2 ] && \
  [ "$(grep -F -c "$KEY_GUARD" "$SKILL")" -eq 2 ] || \
  fail 'both API fallback routes must enforce GPT_IMAGE_API_KEY'

assert_all "$EXPORT" \
  "SRC='<Step 4 生成的原图绝对路径>'" \
  "TARGET='<Step 1 确定的平台上传尺寸；无则留空>'" \
  '[ -f "$SRC" ] || { echo "封面原图不存在: $SRC" >&2; exit 1; }'

echo "PASS: story-cover prefers Codex built-in ImageGen and keeps the API fallback"
