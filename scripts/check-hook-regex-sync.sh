#!/bin/bash
# check-hook-regex-sync.sh — 校验 detect-story-gaps.sh 中的伏笔状态正则
# 是否覆盖了 artifact-protocols.md 中定义的所有"未关闭"伏笔状态
#
# 设计意图：hook 的伏笔检测是为了发现"未关闭的伏笔"。
# 所以只需要匹配"未关闭"类状态（已埋、已过期），不需要匹配"已关闭"类状态（已回收）。
# 这个脚本检查：协议中定义的每个"未关闭"状态，hook 是否都能匹配到。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

HOOK_FILE="$REPO_ROOT/skills/story-setup/references/templates/hooks/detect-story-gaps.sh"
PROTOCOL_FILE="$REPO_ROOT/skills/story-long-write/references/artifact-protocols.md"

# 1. 检查文件存在
if [ ! -f "$HOOK_FILE" ]; then
  echo "FAIL: hook file not found: $HOOK_FILE"
  exit 1
fi
if [ ! -f "$PROTOCOL_FILE" ]; then
  echo "FAIL: protocol file not found: $PROTOCOL_FILE"
  exit 1
fi

# 2. 从 artifact-protocols.md 的伏笔模板中提取状态枚举
# 模板格式：状态{未埋/已埋/已回收/已过期}
STATUS_ENUM=$(grep -oE '状态\{[^}]+\}' "$PROTOCOL_FILE" 2>/dev/null | head -1 | sed 's/状态{//;s/}//' || true)

if [ -z "$STATUS_ENUM" ]; then
  echo "WARN: No foreshadow status enum found in protocol file (may not have foreshadow template yet)"
  exit 0
fi

echo "Protocol defines status values: $STATUS_ENUM"

# 3. 区分"未关闭"和"已关闭"状态
# "已关闭"状态（hook 不需要匹配这些）：
CLOSED_STATES="已回收 已解决 已完成 已关闭"
# 已回收是已关闭状态，不需要在 hook 的 "未关闭伏笔" 检测中匹配
# 其余都是"未关闭"状态（hook 需要匹配）

# 4. 检查每个未关闭状态是否在 hook 中被匹配
FAIL=""
IFS='/'
for state in $STATUS_ENUM; do
  # 跳过已关闭状态
  is_closed=false
  IFS_OLD="$IFS"
  IFS=' '
  for closed in $CLOSED_STATES; do
    IFS="$IFS_OLD"
    if [ "$state" = "$closed" ]; then
      is_closed=true
      break
    fi
  done
  IFS="$IFS_OLD"
  if [ "$is_closed" = true ]; then
    echo "  SKIP (closed): $state"
    continue
  fi

  # 检查 hook 是否包含该状态
  if grep -qF "$state" "$HOOK_FILE" 2>/dev/null; then
    echo "  OK:   $state → matched in hook"
  else
    echo "  FAIL: $state → NOT matched in hook"
    FAIL="$FAIL $state"
  fi
done
unset IFS

if [ -n "$FAIL" ]; then
  echo ""
  echo "FAIL: detect-story-gaps.sh doesn't match the following open foreshadow states:"
  for f in $FAIL; do
    echo "  - $f"
  done
  echo ""
  echo "Please update the grep regex in detect-story-gaps.sh to include these states."
  echo "Hook file: $HOOK_FILE"
  echo "Protocol file: $PROTOCOL_FILE"
  exit 1
fi

echo ""
echo "OK: hook regex covers all open foreshadow states from artifact-protocols.md"
