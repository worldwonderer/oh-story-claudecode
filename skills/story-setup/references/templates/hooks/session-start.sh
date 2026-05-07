#!/bin/bash
# session-start.sh — 显示项目状态和写作上下文摘要
set -euo pipefail

# 发现活跃的书目目录
discover_book_dir() {
  if [ -f ".active-book" ]; then
    cat ".active-book"
    return
  fi
  local first=$(find . -maxdepth 2 -type d -name "追踪" -print -quit 2>/dev/null || true)
  if [ -n "$first" ]; then
    dirname "$first"
  fi
}

# 部署状态检测
if [ ! -f ".story-deployed" ]; then
  echo "[WARN] Writing infrastructure not deployed. Run /story-setup to initialize."
  echo ""
fi

echo "=== Story Writing ==="

# 显示分支和最近 commit
BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
echo "Branch: $BRANCH"
git log --oneline -5 2>/dev/null || echo "(no git history)"
echo ""

# active.md 摘要（只看当前位置部分，前 10 行）
BOOK_DIR=$(discover_book_dir)
if [ -n "$BOOK_DIR" ] && [ -f "$BOOK_DIR/追踪/active.md" ]; then
  echo "--- 当前位置 ---"
  head -10 "$BOOK_DIR/追踪/active.md"
  echo "---"
  echo ""
fi

# 未完成拆文（阈值 > 0 才报告）
if [ -d "拆文库" ]; then
  PROGRESS_COUNT=$(find 拆文库 -name "_progress.md" 2>/dev/null | wc -l | tr -d ' ')
  if [ "$PROGRESS_COUNT" -gt 0 ]; then
    echo "[INFO] $PROGRESS_COUNT incomplete analysis in 拆文库/. Run /story-long-analyze or /story-short-analyze."
  fi
fi

# Draft markers（阈值 > 3 才列出详情）
if [ -n "$BOOK_DIR" ] && [ -d "$BOOK_DIR/正文" ]; then
  DRAFT_COUNT=$( { grep -rE "TODO|FIXME|WIP|PLACEHOLDER|TBD" "$BOOK_DIR/正文/" 2>/dev/null || true; } | wc -l | tr -d ' ')
  if [ "$DRAFT_COUNT" -gt 3 ]; then
    echo "[WARN] $DRAFT_COUNT draft markers in 正文/ (showing first 5):"
    grep -rnE "TODO|FIXME|WIP|PLACEHOLDER|TBD" "$BOOK_DIR/正文/" 2>/dev/null | head -5
  elif [ "$DRAFT_COUNT" -gt 0 ]; then
    echo "[INFO] $DRAFT_COUNT draft markers in 正文/."
  fi
fi

echo ""
echo "=== Session Start Complete ==="
