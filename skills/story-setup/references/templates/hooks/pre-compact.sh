#!/bin/bash
# pre-compact.sh — compact 前记录写作状态摘要（不 dump 内容）
set -euo pipefail

discover_book_dir() {
  if [ -f ".active-book" ]; then
    cat ".active-book"
    return
  fi
  local root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
  local first=$(find "$root" -maxdepth 4 -type d -name "追踪" -print -quit 2>/dev/null || true)
  if [ -n "$first" ]; then
    dirname "$first"
  fi
}

echo "=== Pre-Compact Summary ==="

BOOK_DIR=$(discover_book_dir)

# 上下文.md 状态摘要（路径 + 行数，不输出内容）
if [ -n "$BOOK_DIR" ] && [ -f "$BOOK_DIR/追踪/上下文.md" ]; then
  LINE_COUNT=$(wc -l < "$BOOK_DIR/追踪/上下文.md" | tr -d ' ')
  echo "Writing context: $BOOK_DIR/追踪/上下文.md ($LINE_COUNT lines)"
else
  echo "Active state: not found"
fi

# Git 未提交变更计数
CHANGED=$(git diff --name-only 2>/dev/null | wc -l | tr -d ' ') || CHANGED=0
STAGED=$(git diff --name-only --cached 2>/dev/null | wc -l | tr -d ' ') || STAGED=0
echo "Git: ${CHANGED} unstaged, ${STAGED} staged"


# 记录 compaction 时间戳
if [ -n "$BOOK_DIR" ]; then
  mkdir -p "$BOOK_DIR/追踪"
  echo "[$(date '+%Y-%m-%dT%H:%M:%S%z')] compact performed" >> "$BOOK_DIR/追踪/compaction-log.txt"
fi

echo "=== Pre-Compact Complete ==="
