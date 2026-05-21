#!/bin/bash
# check-hook-regex-sync.sh — 行为级校验 detect-story-gaps.sh 的伏笔状态检测
#
# 设计意图：SessionStart hook 只提示过期或异常伏笔，避免把长篇中正常
# 开放状态（未埋/已埋）误判为问题，诱发 daily 流程中的全量伏笔审计。
# 本脚本运行真实 hook fixture，验证正常状态不报警、已过期/异常状态报警。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

HOOK_FILE="$REPO_ROOT/skills/story-setup/references/templates/hooks/detect-story-gaps.sh"
COMMON_FILE="$REPO_ROOT/skills/story-setup/references/templates/hooks/lib/common.sh"
PROTOCOL_FILE="$REPO_ROOT/skills/story-long-write/references/artifact-protocols.md"

for file in "$HOOK_FILE" "$COMMON_FILE" "$PROTOCOL_FILE"; do
  if [ ! -f "$file" ]; then
    echo "FAIL: required file not found: $file"
    exit 1
  fi
done

STATUS_ENUM=$(grep -oE '状态\{[^}]+\}' "$PROTOCOL_FILE" 2>/dev/null | head -1 | sed 's/状态{//;s/}//' || true)
if [ -z "$STATUS_ENUM" ]; then
  echo "FAIL: No foreshadow status enum found in protocol file"
  exit 1
fi

echo "Protocol defines status values: $STATUS_ENUM"

TMP_DIR=$(mktemp -d)
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

setup_fixture() {
  local name="$1"
  local foreshadow_body="$2"
  local root="$TMP_DIR/$name"
  mkdir -p "$root/.claude/hooks/lib" "$root/book/追踪" "$root/book/正文" "$root/book/设定" "$root/book/大纲"
  cp "$HOOK_FILE" "$root/.claude/hooks/detect-story-gaps.sh"
  cp "$COMMON_FILE" "$root/.claude/hooks/lib/common.sh"
  chmod +x "$root/.claude/hooks/detect-story-gaps.sh"
  touch "$root/.story-deployed"
  cat > "$root/book/追踪/上下文.md" <<'CTX'
# 写作进度
## 当前位置
- 章: 第1章
CTX
  cat > "$root/book/追踪/伏笔.md" <<EOF_FORESHADOW
# 伏笔追踪

## 伏笔状态表

| ID | 伏笔内容 | 埋设章节 | 预计回收章节 | 状态{未埋/已埋/已回收/已过期} | 重要度{高/中/低} |
|----|---------|---------|-------------|-----------------------------|----------------|
$foreshadow_body
EOF_FORESHADOW
  printf '%s' "$root"
}

run_hook() {
  local root="$1"
  (cd "$root" && bash .claude/hooks/detect-story-gaps.sh)
}

assert_no_foreshadow_warn() {
  local case_name="$1"
  local body="$2"
  local root output
  root=$(setup_fixture "$case_name" "$body")
  output=$(run_hook "$root" || true)
  if echo "$output" | grep -q 'foreshadowing entries detected\|伏笔'; then
    echo "FAIL: $case_name should not emit foreshadow warning"
    echo "Output:"
    echo "$output"
    exit 1
  fi
  echo "  OK no warn: $case_name"
}

assert_foreshadow_warn() {
  local case_name="$1"
  local body="$2"
  local root output
  root=$(setup_fixture "$case_name" "$body")
  output=$(run_hook "$root" || true)
  if ! echo "$output" | grep -q 'Overdue/abnormal foreshadowing entries detected'; then
    echo "FAIL: $case_name should emit overdue/abnormal foreshadow warning"
    echo "Output:"
    echo "$output"
    exit 1
  fi
  echo "  OK warn: $case_name"
}

assert_no_foreshadow_warn "header-only" ""
assert_no_foreshadow_warn "planned-unplanted" "| F001 | 计划后续埋设 | 第5章 | 第10章 | 未埋 | 中 |"
assert_no_foreshadow_warn "normal-open-planted" "| F002 | 正常开放伏笔 | 第1章 | 第20章 | 已埋 | 高 |"
assert_no_foreshadow_warn "closed-recovered" "| F003 | 已回收伏笔 | 第1章 | 第3章 | 已回收 | 低 |"
assert_foreshadow_warn "overdue" "| F004 | 过期伏笔 | 第1章 | 第2章 | 已过期 | 高 |"
assert_foreshadow_warn "unknown-status" "| F005 | 异常状态 | 第1章 | 第2章 | 状态损坏 | 高 |"

# Guard against reverting to the old broad regex or warning wording.
if grep -q "状态\.\*(未埋|已埋|已过期)" "$HOOK_FILE"; then
  echo "FAIL: old broad foreshadow regex is still present in hook"
  exit 1
fi
if grep -q 'Open foreshadowing[[:space:]]threads' "$HOOK_FILE"; then
  echo "FAIL: old open-foreshadow warning wording is still present in hook"
  exit 1
fi

# Ensure all protocol statuses are accounted for in documented hook semantics.
for state in $(echo "$STATUS_ENUM" | tr '/' ' '); do
  if ! grep -qF "$state" "$HOOK_FILE" && ! grep -qF "$state" "$PROTOCOL_FILE"; then
    echo "FAIL: status not documented in hook/protocol semantics: $state"
    exit 1
  fi
done

echo ""
echo "OK: hook foreshadow detection warns only on overdue/abnormal states"
