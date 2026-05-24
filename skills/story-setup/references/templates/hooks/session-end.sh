#!/bin/bash
# session-end.sh — 会话结束时按需记录最后状态
# 设计原则：默认静默且不写文件；显式启用时也不创建短篇项目的 追踪/ 目录
set -euo pipefail

# 加载公共函数库
source "$(dirname "$0")/lib/common.sh"

# 默认禁用 session-log.txt 写入（避免每次会话结束都污染工作树）。
# 显式 STORY_SESSION_LOG=1 才启用；即使启用，也只写入已存在的长篇追踪目录。
if [ "${STORY_SESSION_LOG:-0}" != "1" ]; then
  exit 0
fi

BOOK_DIR=$(discover_active_book)

# 只写入已存在的追踪目录；不要 mkdir，避免把短篇项目误升级成长篇结构。
if [ -n "$BOOK_DIR" ] && [ -d "$BOOK_DIR/追踪" ]; then
  echo "[$(date '+%Y-%m-%dT%H:%M:%S%z')] session ended" >> "$BOOK_DIR/追踪/session-log.txt"
fi
