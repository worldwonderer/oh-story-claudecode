#!/bin/bash
# detect-story-gaps.sh — 检测写作项目中的 5 项缺口
set -euo pipefail

echo "=== Story Gap Detection ==="

# 1. 新项目检测：没有书名目录
BOOK_DIRS=()
while IFS= read -r -d '' dir; do
  BOOK_DIRS+=("$(dirname "$dir")")
done < <(find . -maxdepth 2 -type d -name "追踪" -print0 2>/dev/null || true)

if [ ${#BOOK_DIRS[@]} -eq 0 ]; then
  echo "[INFO] No book project detected. Run /story-long-write or /story-short-write to start."
fi

for BOOK_DIR in ${BOOK_DIRS[@]+"${BOOK_DIRS[@]}"}; do
  BOOK_NAME=$(basename "$BOOK_DIR")
  echo ""
  echo "Checking: $BOOK_NAME"

  # 2. 正文多但设定少
  CHAPTER_COUNT=0
  SETTING_COUNT=0
  if [ -d "$BOOK_DIR/正文" ]; then
    CHAPTER_COUNT=$(find "$BOOK_DIR/正文" -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
  fi
  if [ -d "$BOOK_DIR/设定" ]; then
    SETTING_COUNT=$(find "$BOOK_DIR/设定" -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
  fi
  if [ "$CHAPTER_COUNT" -gt 10 ] && [ "$SETTING_COUNT" -lt 3 ]; then
    echo "[WARN] $CHAPTER_COUNT chapters but only $SETTING_COUNT setting files. Consider adding more settings."
  fi

  # 3. 拆文未完成
  PROGRESS=""
  if [ -d "拆文库" ]; then
    PROGRESS=$(find "拆文库" -name "_progress.md" 2>/dev/null | head -1 || true)
  fi
  if [ -n "$PROGRESS" ]; then
    echo "[WARN] Incomplete analysis: $PROGRESS. Run /story-long-analyze to continue."
  fi

  # 4. 未关闭的伏笔线索
  if [ -f "$BOOK_DIR/追踪/伏笔.md" ]; then
    # 正则依赖 artifact-protocols.md 中的伏笔格式定义，格式变更时需同步更新
    STALE_FORESHADOW=$(grep -E "第[0-9]+章.*未回收|状态.*进行中|status.*open" "$BOOK_DIR/追踪/伏笔.md" 2>/dev/null || true)
    if [ -n "$STALE_FORESHADOW" ]; then
      echo "[WARN] Open foreshadowing threads detected in 伏笔.md. Consider running /story-review."
    fi
  fi

  # 5. 大纲缺失
  if [ -d "$BOOK_DIR/正文" ] && [ ! -d "$BOOK_DIR/大纲" ]; then
    echo "[WARN] 正文/ exists but 大纲/ is missing. Consider creating an outline first."
  fi
done

echo ""
echo "=== Gap Detection Complete ==="
