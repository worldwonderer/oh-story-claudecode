#!/bin/bash
# common.sh — 公共函数库，供各 hook 文件 source
# 注意：不加 set -euo pipefail，避免 source 时覆盖调用方的 shell options

# 发现活跃的书目目录（支持长篇和短篇项目）
# 长篇：查找 追踪/ 目录
# 短篇：查找 正文/ 目录（无需找 .md 文件，减少一层 depth 需求）
discover_book_dir() {
  if [ -f ".active-book" ]; then
    cat ".active-book"
    return
  fi
  local root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
  # 长篇优先（追踪/ 目录存在）
  local first=$(find "$root" -maxdepth 4 -type d -name "追踪" -print -quit 2>/dev/null || true)
  if [ -n "$first" ]; then
    dirname "$first"
    return
  fi
  # 短篇 fallback：查找 正文/ 目录（maxdepth 4 覆盖 推荐/短篇/书名/正文 结构）
  local story_dir=$(find "$root" -maxdepth 4 -type d -name "正文" -print -quit 2>/dev/null || true)
  if [ -n "$story_dir" ]; then
    dirname "$story_dir"
  fi
}
