#!/bin/bash
# session-start.sh — 显示项目状态和写作上下文摘要
set -euo pipefail

# 发现活跃的书目目录
discover_book_dir() {
  if [ -f ".active-book" ]; then
    cat ".active-book"
    return
  fi
  local first=$(find "$(git rev-parse --show-toplevel 2>/dev/null || pwd)" -maxdepth 2 -type d -name "追踪" -print -quit 2>/dev/null || true)
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

# 上下文.md 摘要（只看当前位置部分，前 10 行）
BOOK_DIR=$(discover_book_dir)
if [ -n "$BOOK_DIR" ] && [ -f "$BOOK_DIR/追踪/上下文.md" ]; then
  echo "--- 当前位置 ---"
  head -10 "$BOOK_DIR/追踪/上下文.md"
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

echo ""
echo "=== Session Start Complete ==="
