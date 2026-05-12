#!/bin/bash
# post-compact.sh — compact 后提醒恢复上下文
set -euo pipefail

# 加载公共函数库
source "$(dirname "$0")/lib/common.sh"

BOOK_DIR=$(discover_book_dir)

if [ -n "$BOOK_DIR" ] && [ -f "$BOOK_DIR/追踪/上下文.md" ]; then
  LINE_COUNT=$(wc -l < "$BOOK_DIR/追踪/上下文.md" | tr -d ' ')
  echo "Context was compacted. Read $BOOK_DIR/追踪/上下文.md ($LINE_COUNT lines) to restore writing context."
else
  echo "Context was compacted. Check 追踪/上下文.md to restore context."
fi
