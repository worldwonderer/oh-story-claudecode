#!/bin/bash
# test-outline-copy.sh — regression tests for the outline-copy detector.
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
if [ -z "$REPO_ROOT" ]; then
  echo "Error: not in a git repository" >&2
  exit 1
fi

SCRIPT="$REPO_ROOT/skills/story-long-write/scripts/check-outline-copy.js"
DETECTOR_COPIES=(
  "$REPO_ROOT/skills/story-long-write/scripts/check-outline-copy.js"
  "$REPO_ROOT/skills/story-short-write/scripts/check-outline-copy.js"
)
for detector_copy in "${DETECTOR_COPIES[@]}"; do
  node --check "$detector_copy" >/dev/null
  cmp -s "$SCRIPT" "$detector_copy" || {
    echo "FAIL: detector copy drifted from story-long-write source: $detector_copy" >&2
    exit 1
  }
done

TMP_DIR="$(mktemp -d)"
cleanup() { rm -rf "$TMP_DIR"; }
trap cleanup EXIT

CASE=""
STATUS=0
OUTPUT=""

fail() {
  echo "FAIL [$CASE]: $1" >&2
  [ -n "$OUTPUT" ] && echo "--- detector output ---" >&2 && echo "$OUTPUT" >&2
  exit 1
}

run() {
  set +e
  OUTPUT="$(node "$SCRIPT" "$@" 2>&1)"
  STATUS=$?
  set -e
}

expect_status() {
  [ "$STATUS" -eq "$1" ] || fail "expected exit $1, got $STATUS"
}

expect_contains() {
  case "$OUTPUT" in
  *"$1"*) ;;
  *) fail "expected output to contain: $1" ;;
  esac
}

expect_missing() {
  case "$OUTPUT" in
  *"$1"*) fail "expected output NOT to contain: $1" ;;
  *) ;;
  esac
}

# 22 字未授权重合，单独就超过 15 字阈值
COPIED="他握紧那柄旧刀在雨里站了整整一夜没有离开半步"
# 6 字锚句，短于阈值：只有被挖除后剩余片段仍达阈值时才谈得上误赦免
OATH="此誓天地可鉴"
VOW="虽死无悔"
# 18 字锚句，本身即超过阈值：用于验证豁免仍然生效（防止改过头）
# 取自 demo/长篇 第 1 章的系统奖励串——真实的功能性重合样本，本就该逐字一致
PANEL="天王级唱功大师级导演能力中国军魂伴奏"

# --- 1. 锚句之前存在超阈值重合：必须报出前段，不得因片段含锚句而整段赦免 ---
CASE="anchor-tail"
cat >"$TMP_DIR/o1.md" <<EOF
#### 情节细化
- 点1：${COPIED}，${OATH}。
- 复沓锚句：
  点1：${OATH}
EOF
printf '%s，%s。\n' "$COPIED" "$OATH" >"$TMP_DIR/p1.md"
run --outline "$TMP_DIR/o1.md" "$TMP_DIR/p1.md"
expect_status 1
expect_contains "22 字「${COPIED}」"
expect_contains "1 处 6 字为复沓锚句"

# --- 2. 锚句之后存在超阈值重合 ---
CASE="anchor-head"
cat >"$TMP_DIR/o2.md" <<EOF
#### 情节细化
- 点1：${OATH}，${COPIED}。
- 复沓锚句：
  点1：${OATH}
EOF
printf '%s，%s。\n' "$OATH" "$COPIED" >"$TMP_DIR/p2.md"
run --outline "$TMP_DIR/o2.md" "$TMP_DIR/p2.md"
expect_status 1
expect_contains "22 字「${COPIED}」"

# --- 3. 一个重合片段里包含多个锚句：中间段照报，两端各自扣除 ---
CASE="multi-anchor"
cat >"$TMP_DIR/o3.md" <<EOF
#### 情节细化
- 点1：${OATH}，${COPIED}，${VOW}。
- 复沓锚句：
  点1：${OATH}
  点1：${VOW}
EOF
printf '%s，%s，%s。\n' "$OATH" "$COPIED" "$VOW" >"$TMP_DIR/p3.md"
run --outline "$TMP_DIR/o3.md" "$TMP_DIR/p3.md"
expect_status 1
expect_contains "22 字「${COPIED}」"
expect_contains "10 字为复沓锚句"

# --- 4. 片段完全等于锚句：豁免仍然生效，静默放行并报出豁免量 ---
CASE="pure-anchor"
cat >"$TMP_DIR/o4.md" <<EOF
#### 情节细化
- 点1：面板弹出，主角确认奖励到手。
- 复沓锚句：
  点1：${PANEL}
EOF
printf '眼前忽然亮起一行小字。\n%s\n他抬手把那行字抹掉。\n' "$PANEL" >"$TMP_DIR/p4.md"
run --outline "$TMP_DIR/o4.md" "$TMP_DIR/p4.md"
expect_status 0
expect_contains "无未授权誊抄"
expect_contains "1 处 18 字"

# --- 5. 短篇标准结构：正文.md + 小节大纲.md，单参调用必须自动发现 ---
CASE="short-story-autodiscover"
mkdir -p "$TMP_DIR/短篇"
cat >"$TMP_DIR/短篇/小节大纲.md" <<EOF
## 第一节
- 点1：${COPIED}。
EOF
printf '%s。\n' "$COPIED" >"$TMP_DIR/短篇/正文.md"
run "$TMP_DIR/短篇/正文.md"
expect_status 1
expect_contains "22 字「${COPIED}」"

# --- 6. 长篇标准结构：正文/第N章 + 大纲/细纲_第N章，单参调用必须自动发现 ---
CASE="long-form-autodiscover"
mkdir -p "$TMP_DIR/长篇/正文" "$TMP_DIR/长篇/大纲"
cat >"$TMP_DIR/长篇/大纲/细纲_第001章.md" <<EOF
## 第 1 章
- 点1：${COPIED}。
EOF
printf '# 第001章 雨夜\n\n%s。\n' "$COPIED" >"$TMP_DIR/长篇/正文/第001章_雨夜.md"
run "$TMP_DIR/长篇/正文/第001章_雨夜.md"
expect_status 1
expect_contains "22 字「${COPIED}」"

# --- 7. 存量细纲没有复沓锚句字段：按无锚句处理，照常检测且不报错 ---
CASE="legacy-no-anchor-field"
cat >"$TMP_DIR/o7.md" <<EOF
#### 情节细化
- 点1：${COPIED}，${OATH}。
EOF
printf '%s，%s。\n' "$COPIED" "$OATH" >"$TMP_DIR/p7.md"
run --outline "$TMP_DIR/o7.md" "$TMP_DIR/p7.md"
expect_status 1
expect_contains "28 字"
expect_missing "为复沓锚句"

# --- 8. 锚句字段写「无」：不得把「无」当成锚句 ---
CASE="anchor-field-none"
cat >"$TMP_DIR/o8.md" <<EOF
#### 情节细化
- 点1：${COPIED}。
- 复沓锚句：无
- 结尾设定：主角离开。
EOF
printf '%s。\n' "$COPIED" >"$TMP_DIR/p8.md"
run --outline "$TMP_DIR/o8.md" "$TMP_DIR/p8.md"
expect_status 1
expect_contains "22 字「${COPIED}」"
expect_missing "为复沓锚句"

# --- 9. 正文与细纲无重合：完全静默 ---
CASE="clean"
cat >"$TMP_DIR/o9.md" <<EOF
#### 情节细化
- 点1：${COPIED}。
EOF
printf '雨停了，他终于肯回头看一眼身后那扇门。\n' >"$TMP_DIR/p9.md"
run --outline "$TMP_DIR/o9.md" "$TMP_DIR/p9.md"
expect_status 0
[ -z "$OUTPUT" ] || fail "expected silent output on a clean chapter"

# --- 10. 缺细纲：不可判定时静默退出 0，不得误报 ---
CASE="missing-outline"
printf '%s。\n' "$COPIED" >"$TMP_DIR/orphan.md"
run "$TMP_DIR/orphan.md"
expect_status 0
[ -z "$OUTPUT" ] || fail "expected silence when no outline can be located"

# --- 11. 收尾复扫按通配传多章：每章各自比对，不得把第二个正文当成细纲 ---
CASE="multi-prose-batch"
mkdir -p "$TMP_DIR/批/正文" "$TMP_DIR/批/大纲"
cat >"$TMP_DIR/批/大纲/细纲_第005章.md" <<EOF
## 第 5 章
- 点1：${COPIED}。
EOF
cat >"$TMP_DIR/批/大纲/细纲_第006章.md" <<EOF
## 第 6 章
- 点1：${VOW}，主角转身离开。
EOF
printf '# 第005章 雨夜\n\n%s。\n' "$COPIED" >"$TMP_DIR/批/正文/第005章_雨夜.md"
printf '# 第006章 天明\n\n雨停了，他终于肯回头看一眼身后那扇门。\n' >"$TMP_DIR/批/正文/第006章_天明.md"
run "$TMP_DIR/批/正文/第005章_雨夜.md" "$TMP_DIR/批/正文/第006章_天明.md"
expect_status 1
expect_contains "第005章_雨夜.md"
expect_contains "22 字「${COPIED}」"

# --- 12. 多章里只有靠后的一章有重合：不得因首章干净就整体放行 ---
CASE="multi-prose-later-hit"
run "$TMP_DIR/批/正文/第006章_天明.md" "$TMP_DIR/批/正文/第005章_雨夜.md"
expect_status 1
expect_contains "第005章_雨夜.md"

echo "PASS: check-outline-copy.js (12 cases)"
