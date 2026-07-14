#!/bin/bash
# guard-outline-before-prose.sh — PreToolUse(Write|Edit|MultiEdit) 流程守卫
# 写「正文」前必须先有对应大纲/细纲，否则阻止（exit 2，BLOCKING）。
#
# 只拦截「首次创建正文文件且缺细纲」这一种情况：
#   - 长篇 正文/第N章_*.md ：要求同书 大纲/细纲_第N章.md 存在
#   - 短篇 正文.md         ：要求同目录 小节大纲.md 存在
# 正文已存在（续写/去AI味/改稿）一律放行；非正文目标、解析不到路径一律静默放行。
# 设计原则：宁可漏拦不可误伤——任何不确定都 exit 0。
set -euo pipefail

source "$(dirname "$0")/lib/common.sh"

# 全程走字节稳定区域：本 hook 在中文路径上做 bash 通配（中间目录是中文书名时
# 细纲_第*章*.md 在 GBK 区域会 NOMATCH）、sed 提章号、case 匹配。Windows 中文系统若导出
# GBK/GB2312 区域设置，这些都会按多字节错误解码 UTF-8 而失效。强制 C 区域走字节匹配（UTF-8
# 字面量 vs UTF-8 字节相等）才稳定（issue #164）。路径抽取走 node 共享核，node 自身按 UTF-8
# 处理、与 bash 区域无关；拦截判定全在下方 bash，不受影响。
export LC_ALL=C

HOOK_INPUT="${CLAUDE_TOOL_INPUT:-}"
if [ -z "$HOOK_INPUT" ] && [ ! -t 0 ]; then
  HOOK_INPUT="$(cat)"
fi
export HOOK_INPUT

# 探测 node（Claude Code 自身即 node 应用，正常必有；探测不到就静默放行）。
node -e "" >/dev/null 2>&1 || exit 0
CLI="$(dirname "$0")/story_hook_cli.js"
[ -f "$CLI" ] || exit 0

# 从 tool 输入 JSON（HOOK_INPUT 环境变量）提取目标文件路径，node 按 UTF-8 写回。
TARGET="$(node "$CLI" extract-target 2>/dev/null || true)"
# 解析不到路径 → 放行
[ -z "$TARGET" ] && exit 0

ROOT=$(project_root)
# 绝对路径直接采用，相对路径才拼项目根。
# Windows + Git Bash 下 Claude Code 可能传入盘符绝对路径（F:/work/... 或 F:\work\...）；
# 只认 /* 会把它们当相对路径拼成 $ROOT/F:/work/...，找错 大纲/ 目录、误报细纲缺失（issue #184）。
# [A-Za-z]:[/\\]* 命中盘符绝对路径，并把反斜杠统一成正斜杠（对齐 plugin.ts 的 isAbsolute + 反斜杠归一）。
case "$TARGET" in
  /*) ABS="$TARGET" ;;
  [A-Za-z]:[/\\]*) ABS="${TARGET//\\//}" ;;
  *)  ABS="$ROOT/$TARGET" ;;
esac

BASE="$(basename "$ABS")"
PARENT="$(basename "$(dirname "$ABS")")"

case "$BASE" in
  正文.md)
    # 短篇单文件正文：已存在则放行（续写/改稿）
    [ -f "$ABS" ] && exit 0
    BOOK_DIR="$(dirname "$ABS")"
    # story-import 迁移：已有 拆文库/{书名}/ 分析源时，正文先于小节大纲迁移是正常流程（小节大纲由拆文反推），放行
    [ -d "$ROOT/拆文库/$(basename "$BOOK_DIR")" ] && exit 0
    # 仅在确为短篇工程时拦截（有 设定.md 信号——story-short-write/import 都先产 设定.md），
    # 避免误伤 docs/正文.md 等非作品文件
    [ -f "$BOOK_DIR/设定.md" ] || exit 0
    if [ ! -f "$BOOK_DIR/小节大纲.md" ]; then
      printf '%s\n' "⛔ 写正文被拦截：${TARGET} 缺少同目录 小节大纲.md。" >&2
      printf '%s\n' "   先按 story-short-write 完成「小节大纲.md」，再写正文（不允许跳过大纲直接写正文）。" >&2
      printf '%s\n' "   如确需先起草，请先补建 小节大纲.md。" >&2
      exit 2
    fi
    ;;
  *)
    # 长篇分章正文：父目录须为「正文」，文件名形如 第N章...
    [ "$PARENT" = "正文" ] || exit 0
    case "$BASE" in
      第*章*.md) ;;
      *) exit 0 ;;
    esac
    # 已存在则放行（续写/改稿）
    [ -f "$ABS" ] && exit 0
    # 章号（去前导零）
    NUM="$(printf '%s' "$BASE" | sed -n 's/^第0*\([0-9][0-9]*\)章.*/\1/p')"
    [ -z "$NUM" ] && exit 0
    BOOK_DIR="$(dirname "$(dirname "$ABS")")"
    # story-import 迁移：已有 拆文库/{书名}/ 分析源时放行（细纲由章节摘要反推、晚于正文迁移）
    [ -d "$ROOT/拆文库/$(basename "$BOOK_DIR")" ] && exit 0
    OUTLINE_DIR="$BOOK_DIR/大纲"
    FOUND=""
    if [ -d "$OUTLINE_DIR" ]; then
      # 容忍补零差异与标题后缀：按整数章号匹配 大纲/细纲_第*章*.md
      for f in "$OUTLINE_DIR"/细纲_第*章*.md; do
        [ -e "$f" ] || continue
        fnum="$(basename "$f" | sed -n 's/^细纲_第0*\([0-9][0-9]*\)章.*/\1/p')"
        if [ "$fnum" = "$NUM" ]; then FOUND="$f"; break; fi
      done
    fi
    if [ -z "$FOUND" ]; then
      printf '%s\n' "⛔ 写正文被拦截：第 ${NUM} 章缺少细纲（${OUTLINE_DIR#$ROOT/}/细纲_第${NUM}章.md）。" >&2
      printf '%s\n' "   按 story-long-write 单章流程先补建细纲，再写正文（不允许跳过细纲直接写作）。" >&2
      printf '%s\n' "   如确需先起草，请先补建对应细纲文件。" >&2
      exit 2
    fi
    ;;
esac

exit 0
