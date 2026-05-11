#!/bin/bash
# session-start.sh — 显示项目状态和写作上下文摘要
# 设计原则：无可用信息时完全静默，不输出任何内容，避免污染 context
set -euo pipefail

# 发现活跃的书目目录（支持长篇和短篇项目）
discover_book_dir() {
  if [ -f ".active-book" ]; then
    cat ".active-book"
    return
  fi
  local root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
  # 长篇项目：查找 追踪/ 目录（支持深层嵌套，maxdepth 4）
  local first=$(find "$root" -maxdepth 4 -type d -name "追踪" -print -quit 2>/dev/null || true)
  if [ -n "$first" ]; then
    dirname "$first"
    return
  fi
  # 短篇项目：查找包含正文 .md 文件但没有 追踪/ 的目录
  local story_files=$(find "$root" -maxdepth 3 -name "*.md" -path "*/正文/*" -print -quit 2>/dev/null || true)
  if [ -n "$story_files" ]; then
    dirname "$(dirname "$story_files")"
  fi
}

OUTPUT=""
HAS_CONTENT=false

# 部署自检：.story-deployed 存在但 hooks 文件被误删时发出警告
if [ -f ".story-deployed" ]; then
  MISSING_HOOKS=""
  for hook in session-start.sh session-end.sh detect-story-gaps.sh pre-compact.sh post-compact.sh validate-story-commit.sh; do
    if [ ! -f ".claude/hooks/$hook" ]; then
      MISSING_HOOKS+="$hook "
    fi
  done
  if [ -n "$MISSING_HOOKS" ]; then
    OUTPUT+="[WARN] .story-deployed exists but hooks are missing: $MISSING_HOOKS\n"
    OUTPUT+="  Fix: re-run /story-setup to restore missing hooks.\n\n"
    HAS_CONTENT=true
  fi
else
  OUTPUT+="[WARN] Writing infrastructure not deployed. Run /story-setup to initialize.\n\n"
  HAS_CONTENT=true
fi

# 显示分支和最近 commit（仅在有 git 历史时）
BRANCH=$(git branch --show-current 2>/dev/null || echo "")
if [ -n "$BRANCH" ]; then
  OUTPUT+="=== Story Writing ===\n"
  OUTPUT+="Branch: $BRANCH\n"
  RECENT=$(git log --oneline -5 2>/dev/null || true)
  if [ -n "$RECENT" ]; then
    OUTPUT+="$RECENT\n"
  fi
  OUTPUT+="\n"
  HAS_CONTENT=true
fi

# 上下文.md 摘要（只看当前位置部分，前 10 行）
BOOK_DIR=$(discover_book_dir)
if [ -n "$BOOK_DIR" ] && [ -f "$BOOK_DIR/追踪/上下文.md" ]; then
  OUTPUT+="--- 当前位置 ---\n"
  SNAPSHOT=$(head -10 "$BOOK_DIR/追踪/上下文.md")
  OUTPUT+="${SNAPSHOT}\n---\n\n"
  HAS_CONTENT=true
fi

# 未完成拆文（阈值 > 0 才报告）
if [ -d "拆文库" ]; then
  PROGRESS_COUNT=$(find 拆文库 -name "_progress.md" 2>/dev/null | wc -l | tr -d ' ')
  if [ "$PROGRESS_COUNT" -gt 0 ]; then
    OUTPUT+="[INFO] $PROGRESS_COUNT incomplete analysis in 拆文库/. Run /story-long-analyze or /story-short-analyze.\n"
    HAS_CONTENT=true
  fi
fi

# 仅在有实际内容时输出，否则完全静默
if [ "$HAS_CONTENT" = true ]; then
  printf '%b' "$OUTPUT"
fi
