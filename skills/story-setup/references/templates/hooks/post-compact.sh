#!/bin/bash
# post-compact.sh — compact 后提醒恢复上下文
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

BOOK_DIR=$(discover_book_dir)

if [ -n "$BOOK_DIR" ] && [ -f "$BOOK_DIR/追踪/上下文.md" ]; then
  LINE_COUNT=$(wc -l < "$BOOK_DIR/追踪/上下文.md" | tr -d ' ')
  echo "Context was compacted. Read $BOOK_DIR/追踪/上下文.md ($LINE_COUNT lines) to restore writing context."
else
  echo "Context was compacted. Check 追踪/上下文.md to restore context."
fi
