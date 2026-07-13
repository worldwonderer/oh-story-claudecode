#!/bin/bash
# detect-story-gaps.sh — 检测写作项目中的 5 项缺口
# 设计原则：无缺口时完全静默，不输出任何内容，避免污染 context
set -euo pipefail

# 加载公共函数库（project_root + discover_all_books）
source "$(dirname "$0")/lib/common.sh"

# 后续 awk 解析中文伏笔表 + find/grep 中文路径。Windows 中文系统若导出 GBK 区域设置，
# gawk 会把 UTF-8 状态值按 GBK 多字节解码失败，trim 和 == 比较全乱、每行误报。强制 C
# 区域走字节匹配（UTF-8 字面量 vs UTF-8 内容字节相等）才稳定（issue #164 同类）。文末的
# 连续性扫描内嵌 python，但它以 encoding='utf-8' 显式读文件、用 stdout.buffer 写 UTF-8 字节，
# 不受 LC_ALL=C 影响，故仍可在顶部 export。
export LC_ALL=C

ROOT=$(project_root)
OUTPUT=""
HAS_WARNINGS=false

# 1. 新项目检测：没有书名目录（同时支持长篇和短篇项目）
# bash 3.2 兼容：不用关联数组，由 discover_all_books 内部按顺序去重。
declare -a BOOK_DIRS=()
while IFS= read -r dir; do
  [ -n "$dir" ] && BOOK_DIRS+=("$dir")
done < <(discover_all_books)

if [ "${#BOOK_DIRS[@]}" -eq 0 ]; then
  # 完全新项目，没有任何目录结构 — 静默退出
  exit 0
fi

for BOOK_DIR in "${BOOK_DIRS[@]}"; do
  BOOK_NAME=$(basename "$BOOK_DIR")
  BOOK_OUTPUT=""

  # 2. 正文多但设定少
  CHAPTER_COUNT=0
  SETTING_COUNT=0
  if [ -d "$BOOK_DIR/正文" ]; then
    CHAPTER_COUNT=$(find "$BOOK_DIR/正文" -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
  elif [ -f "$BOOK_DIR/正文.md" ]; then
    CHAPTER_COUNT=1
  fi
  if [ -d "$BOOK_DIR/设定" ]; then
    SETTING_COUNT=$(find "$BOOK_DIR/设定" -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
  fi
  if [ "$CHAPTER_COUNT" -gt 10 ] && [ "$SETTING_COUNT" -lt 3 ]; then
    BOOK_OUTPUT+="[WARN] ${BOOK_NAME}：正文 ${CHAPTER_COUNT} 章，但设定文件只有 ${SETTING_COUNT} 个，建议补充设定。\n"
  fi

  # 4. 过期或异常伏笔线索
  if [ -f "$BOOK_DIR/追踪/伏笔.md" ]; then
    # 仅检查表格数据行中的状态列。正常开放状态（未埋/已埋）不报警，
    # 避免长篇项目每次 SessionStart 都触发全量伏笔审计。
    # 行为回归脚本：scripts/check-hook-regex-sync.sh（区域设置健壮性由 export LC_ALL=C 保证）
    ABNORMAL_FORESHADOW=$(awk -F'|' '
      # 含全角空格 U+3000：LC_ALL=C 下 [[:space:]] 只认 ASCII 空白，单元格用全角空格补白时
      # 会留在 status 里被误判为异常；用交替补上全角空格（不能进字符组，否则触发跨区域 bug）。
      function trim(s) { gsub(/^([[:space:]]|　)+|([[:space:]]|　)+$/, "", s); return s }
      /^\|/ && $0 !~ /^\|[-[:space:]|]+$/ {
        status=trim($6)
        if (status == "" || status == "状态" || status ~ /^状态\{/) next
        if (status == "已过期" || (status != "未埋" && status != "已埋" && status != "已回收")) print
      }
    ' "$BOOK_DIR/追踪/伏笔.md" 2>/dev/null || true)
    if [ -n "$ABNORMAL_FORESHADOW" ]; then
      BOOK_OUTPUT+="[WARN] ${BOOK_NAME}：伏笔.md 中检测到过期或异常的伏笔条目，建议跑 /story-review lean 或做一次伏笔审计。\n"
    fi
  fi

  # 5. 大纲缺失（按项目类型区分判定）
  if [ -d "$BOOK_DIR/正文" ] || [ -f "$BOOK_DIR/正文.md" ]; then
    # 长篇判定：有 追踪/ 视为长篇，要求 大纲/ 目录
    if [ -d "$BOOK_DIR/追踪" ] && [ ! -d "$BOOK_DIR/大纲" ]; then
      BOOK_OUTPUT+="[WARN] ${BOOK_NAME}：已有 正文/ 但缺少 大纲/，建议先搭大纲。\n"
    # 短篇判定：无 追踪/ 视为短篇，要求 小节大纲.md 单文件
    elif [ ! -d "$BOOK_DIR/追踪" ] && [ ! -f "$BOOK_DIR/小节大纲.md" ]; then
      BOOK_OUTPUT+="[WARN] ${BOOK_NAME}：已有正文但缺少 小节大纲.md，建议先搭大纲。\n"
    fi
  fi

  # 仅在有问题时输出该书目的信息
  if [ -n "$BOOK_OUTPUT" ]; then
    OUTPUT+="检查：$BOOK_NAME\n$BOOK_OUTPUT"
    HAS_WARNINGS=true
  fi
done

# 3. 全局拆文未完成检测（项目级，非书目级）
GLOBAL_PROGRESS_OUTPUT=""
if [ -d "$ROOT/拆文库" ]; then
  while IFS= read -r -d '' progress_file; do
    GLOBAL_PROGRESS_OUTPUT+="[WARN] 拆文未完成：${progress_file#$ROOT/}，运行 /story-long-analyze 继续。\n"
  done < <(find "$ROOT/拆文库" -name "_progress.md" -print0 2>/dev/null || true)
fi
if [ -n "$GLOBAL_PROGRESS_OUTPUT" ]; then
  OUTPUT+="$GLOBAL_PROGRESS_OUTPUT"
  HAS_WARNINGS=true
fi

# 6. 跨批连续性兜底（追踪 staleness + 章节标题去重）——与 codex story_codex_hook.py 的
# continuity_findings 同触发条件。会话起点提醒：续写前发现「写了章但 上下文.md 没跟上」
# 或「两章撞名」。模型无关；无问题静默。探测真正可用的解释器（Windows Store 占位 exit 49）。
# 扫描范围 repo-wide（与本文件上方的缺口检测一致），多书项目里非活跃书也会提醒——有意为之
# （切书前也想知道断线），不按 .active-book 收窄。staleness 用 mtime 比较（+1 秒容差防同秒误报），
# 是启发式 advisory：git checkout / 带 -p 的拷贝改 mtime 时可能偏差，只提醒不阻塞。
CONT_PYBIN=""
for c in python3 python py; do
  if "$c" -c "" >/dev/null 2>&1; then CONT_PYBIN="$c"; break; fi
done
if [ -n "$CONT_PYBIN" ]; then
  CONTINUITY_OUTPUT="$("$CONT_PYBIN" - "$ROOT" <<'PY' 2>/dev/null || true
import os, re, sys

root = sys.argv[1]
out = []

def discover_books(root):
    books, seen = [], set()
    for dirpath, dirnames, filenames in os.walk(root):
        rel = os.path.relpath(dirpath, root)
        if rel != '.' and any(p.startswith('.') for p in rel.split(os.sep)):
            dirnames[:] = [d for d in dirnames if not d.startswith('.')]
            continue
        depth = 0 if rel == '.' else rel.count(os.sep) + 1
        if depth > 4:
            dirnames[:] = []
            continue
        base = os.path.basename(dirpath)
        if base in ('追踪', '正文') or '正文.md' in filenames:
            book = os.path.dirname(dirpath) if base in ('追踪', '正文') else dirpath
            if book not in seen:
                seen.add(book); books.append(book)
    return books

for book in discover_books(root):
    rel_book = os.path.relpath(book, root)
    body = os.path.join(book, '正文')
    chapters = []
    if os.path.isdir(body):
        chapters = sorted(os.path.join(body, f) for f in os.listdir(body)
                          if re.match(r'^第.*章.*\.md$', f))
    # ① 追踪 staleness（仅长篇：有 追踪/上下文.md）
    ctx = os.path.join(book, '追踪', '上下文.md')
    if chapters and os.path.exists(ctx):
        newest = max((os.path.getmtime(c) for c in chapters), default=0)
        try:
            ctx_m = os.path.getmtime(ctx)
        except OSError:
            ctx_m = 0
        if newest > ctx_m + 1:
            latest = os.path.basename(max(chapters, key=os.path.getmtime))
            out.append(f"[continuity] {rel_book}：正文已更新到「{latest}」但 追踪/上下文.md 更早，"
                       f"续写会断线——补更 上下文.md/伏笔.md 再继续。")
    # ② 标题去重（按文件名 第N章_标题 的标题部分）
    titles = {}
    for c in chapters:
        mt = re.match(r'^第0*\d+章[_\- 　]+(.+)$', os.path.basename(c)[:-3])
        if mt and mt.group(1).strip():
            titles.setdefault(mt.group(1).strip(), []).append(os.path.basename(c))
    for title, files in titles.items():
        if len(files) > 1:
            joined = '、'.join(files)
            out.append(f"[continuity] {rel_book}：{len(files)} 章标题重复「{title}」（{joined[:60]}），建议改名。")

if out:
    sys.stdout.buffer.write(('\n'.join(out) + '\n').encode('utf-8'))
PY
)"
  if [ -n "$CONTINUITY_OUTPUT" ]; then
    OUTPUT+="$CONTINUITY_OUTPUT"
    HAS_WARNINGS=true
  fi
fi

# 仅在有警告时输出
if [ "$HAS_WARNINGS" = true ]; then
  printf '%b' "=== 写作缺口检测 ===\n$OUTPUT\n"
fi
