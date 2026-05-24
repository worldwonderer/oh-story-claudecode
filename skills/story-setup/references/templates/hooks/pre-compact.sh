#!/bin/bash
# pre-compact.sh — compact 前记录写作状态摘要（不 dump 内容）
set -euo pipefail

# 加载公共函数库
source "$(dirname "$0")/lib/common.sh"

ROOT=$(project_root)

echo "=== Pre-Compact Summary ==="

BOOK_DIR=$(discover_active_book)

# 上下文.md 状态摘要（路径 + 行数，不输出内容）
if [ -n "$BOOK_DIR" ] && [ -f "$BOOK_DIR/追踪/上下文.md" ]; then
  LINE_COUNT=$(wc -l < "$BOOK_DIR/追踪/上下文.md" | tr -d ' ')
  echo "Writing context: ${BOOK_DIR#$ROOT/}/追踪/上下文.md ($LINE_COUNT lines)"
else
  echo "Active state: not found"
fi

# Git 未提交变更计数
CHANGED=$(git -C "$ROOT" diff --name-only 2>/dev/null | wc -l | tr -d ' ') || CHANGED=0
STAGED=$(git -C "$ROOT" diff --name-only --cached 2>/dev/null | wc -l | tr -d ' ') || STAGED=0
echo "Git: ${CHANGED} unstaged, ${STAGED} staged"

echo "=== Pre-Compact Complete ==="
