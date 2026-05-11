#!/bin/bash
# session-end.sh — 会话结束时记录最后状态
# 设计原则：静默执行，不输出任何内容
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
    return
  fi
  local story_files=$(find "$root" -maxdepth 3 -name "*.md" -path "*/正文/*" -print -quit 2>/dev/null || true)
  if [ -n "$story_files" ]; then
    dirname "$(dirname "$story_files")"
  fi
}

BOOK_DIR=$(discover_book_dir)

# 记录会话结束时间戳
if [ -n "$BOOK_DIR" ]; then
  mkdir -p "$BOOK_DIR/追踪"
  echo "[$(date '+%Y-%m-%dT%H:%M:%S%z')] session ended" >> "$BOOK_DIR/追踪/session-log.txt"
fi
