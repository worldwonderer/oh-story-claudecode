#!/bin/bash
# detect-story-gaps.sh — 检测写作项目中的 5 项缺口
# 设计原则：无缺口时完全静默，不输出任何内容，避免污染 context
# 注意：本脚本有独立的短篇项目检测逻辑（find 正文/ 目录并去重），
# 不使用 lib/common.sh 的 discover_book_dir（该函数只找单个目录）
set -euo pipefail

OUTPUT=""
HAS_WARNINGS=false

# 1. 新项目检测：没有书名目录（同时支持长篇和短篇项目）
# 长篇项目：查找 追踪/ 目录
BOOK_DIRS=()
while IFS= read -r -d '' dir; do
  BOOK_DIRS+=("$(dirname "$dir")")
done < <(find "$(git rev-parse --show-toplevel 2>/dev/null || pwd)" -maxdepth 4 -type d -name "追踪" -print0 2>/dev/null || true)

# 短篇项目检测：查找包含 .md 文件但没有 追踪/ 子目录的项目目录
SHORT_DIRS=()
while IFS= read -r -d '' dir; do
  SHORT_DIRS+=("$(dirname "$dir")")
done < <(find "$(git rev-parse --show-toplevel 2>/dev/null || pwd)" -maxdepth 3 -type d -name "正文" -print0 2>/dev/null || true)

# 从短篇目录中排除已被长篇检测到的目录
for short_dir in "${SHORT_DIRS[@]+${SHORT_DIRS[@]}}"; do
  is_book=false
  for book_dir in "${BOOK_DIRS[@]+${BOOK_DIRS[@]}}"; do
    if [ "$short_dir" = "$book_dir" ]; then
      is_book=true
      break
    fi
  done
  if [ "$is_book" = false ]; then
    BOOK_DIRS+=("$short_dir")
  fi
done

if [ ${#BOOK_DIRS[@]} -eq 0 ]; then
  # 完全新项目，没有任何目录结构 — 静默，不输出
  : # no-op
fi

for BOOK_DIR in ${BOOK_DIRS[@]+"${BOOK_DIRS[@]}"}; do
  BOOK_NAME=$(basename "$BOOK_DIR")
  BOOK_OUTPUT=""

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
    BOOK_OUTPUT+="[WARN] $BOOK_NAME: $CHAPTER_COUNT chapters but only $SETTING_COUNT setting files. Consider adding more settings.\n"
  fi

  # 4. 未关闭的伏笔线索
  if [ -f "$BOOK_DIR/追踪/伏笔.md" ]; then
    # 正则依赖 artifact-protocols.md 中的伏笔格式定义，格式变更时需同步更新
    STALE_FORESHADOW=$(grep -E "状态.*(已埋|已过期)" "$BOOK_DIR/追踪/伏笔.md" 2>/dev/null || true)
    if [ -n "$STALE_FORESHADOW" ]; then
      BOOK_OUTPUT+="[WARN] $BOOK_NAME: Open foreshadowing threads detected in 伏笔.md. Consider running /story-review.\n"
    fi
  fi

  # 5. 大纲缺失（按项目类型区分判定）
  if [ -d "$BOOK_DIR/正文" ]; then
    # 长篇判定：有 追踪/ 视为长篇，要求 大纲/ 目录
    if [ -d "$BOOK_DIR/追踪" ] && [ ! -d "$BOOK_DIR/大纲" ]; then
      BOOK_OUTPUT+="[WARN] $BOOK_NAME: 正文/ exists but 大纲/ is missing. Consider creating an outline first.\n"
    # 短篇判定：无 追踪/ 视为短篇，要求 小节大纲.md 单文件
    elif [ ! -d "$BOOK_DIR/追踪" ] && [ ! -f "$BOOK_DIR/小节大纲.md" ]; then
      BOOK_OUTPUT+="[WARN] $BOOK_NAME: 正文/ exists but 小节大纲.md is missing. Consider creating an outline first.\n"
    fi
  fi

  # 仅在有问题时输出该书目的信息
  if [ -n "$BOOK_OUTPUT" ]; then
    OUTPUT+="Checking: $BOOK_NAME\n$BOOK_OUTPUT"
    HAS_WARNINGS=true
  fi
done

# 3. 全局拆文未完成检测（项目级，非书目级）
GLOBAL_PROGRESS_OUTPUT=""
if [ -d "拆文库" ]; then
  while IFS= read -r -d '' progress_file; do
    GLOBAL_PROGRESS_OUTPUT+="[WARN] Incomplete analysis: $progress_file. Run /story-long-analyze to continue.\n"
  done < <(find "拆文库" -name "_progress.md" -print0 2>/dev/null || true)
fi
if [ -n "$GLOBAL_PROGRESS_OUTPUT" ]; then
  OUTPUT+="$GLOBAL_PROGRESS_OUTPUT"
  HAS_WARNINGS=true
fi

# 仅在有警告时输出
if [ "$HAS_WARNINGS" = true ]; then
  printf '%b' "=== Story Gap Detection ===\n$OUTPUT\n"
fi
