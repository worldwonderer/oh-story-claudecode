#!/bin/bash
# session-end.sh — 会话结束时记录最后状态
# 设计原则：静默执行，不输出任何内容
set -euo pipefail

# 加载公共函数库
source "$(dirname "$0")/lib/common.sh"

BOOK_DIR=$(discover_book_dir)

# 记录会话结束时间戳
if [ -n "$BOOK_DIR" ]; then
  mkdir -p "$BOOK_DIR/追踪"
  echo "[$(date '+%Y-%m-%dT%H:%M:%S%z')] session ended" >> "$BOOK_DIR/追踪/session-log.txt"
fi
