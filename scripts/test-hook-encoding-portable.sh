#!/bin/bash
# test-hook-encoding-portable.sh — 部署型 hook 在 Windows 中文系统下的编码健壮性回归。
#
# Windows 中文环境有两层独立的编码坑（都让 hook 静默失效，见 issue #164）：
#   1) python stdout 默认 cp936（与区域设置无关）：print(中文) 编成 GBK，和脚本 UTF-8
#      字面量字节不符 → 比较恒假。修法：sys.stdout.buffer.write(...encode("utf-8"))。
#   2) 用户导出 GBK 区域设置（LANG=zh_CN.GBK）时，gawk/GNU sed/GNU grep/bash 通配
#      按 GBK 多字节解码 UTF-8 内容/路径会乱。修法：hook 内 export LC_ALL=C 走字节匹配。
#
# 本测试两段都跑：
#   Part 1：用 PYTHONIOENCODING=gbk 强制 python stdout 走 cp936，复现坑 1（任何平台可跑）。
#   Part 2：在真实 GBK 区域下跑全部 hook，复现坑 2（需系统装有 zh_CN.GBK 类 locale；
#           macOS 自带，CI ubuntu 由 workflow localedef 生成，Windows Git Bash 若无则跳过）。
#
# 用法：bash scripts/test-hook-encoding-portable.sh
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
if [ -z "$REPO_ROOT" ]; then
  echo "Error: not in a git repository"
  exit 1
fi
HOOKS_DIR="$REPO_ROOT/skills/story-setup/references/templates/hooks"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# 探测可用解释器（Windows 上 python3 可能是 Store 占位程序 exit 49）
for PYBIN in python3 python py; do "$PYBIN" -c "" 2>/dev/null && break; done

fail=0
pass() { echo "  PASS $1"; }
bad()  { echo "  FAIL $1"; fail=1; }

deploy() { # $1 = project root
  mkdir -p "$1/.claude"
  cp -R "$HOOKS_DIR" "$1/.claude/hooks"
  chmod +x "$1/.claude/hooks"/*.sh "$1/.claude/hooks/lib"/*.sh 2>/dev/null || true
}

echo "Hook encoding portability test (issue #164)"
echo "==========================================="
echo "interpreter: $PYBIN"

# ===== Part 1：python stdout cp936（PYTHONIOENCODING=gbk）=====
echo "--- Part 1: python stdout cp936 simulation (PYTHONIOENCODING=gbk) ---"
P1="$WORK/p1"; deploy "$P1"
mkdir -p "$P1/book/正文" "$P1/book/大纲" "$P1/short"
run_guard_py() { # $1 mode(default|gbk)  $2 file_path -> exit code
  local mode="$1" fp="$2" ec=0
  local -a pyenv=()
  [ "$mode" = "gbk" ] && pyenv=(env PYTHONIOENCODING=gbk)
  printf '{"tool_name":"Write","tool_input":{"file_path":"%s","content":"x"}}' "$fp" \
    | CLAUDE_PROJECT_DIR="$P1" ${pyenv[@]+"${pyenv[@]}"} bash "$P1/.claude/hooks/guard-outline-before-prose.sh" \
      >/dev/null 2>&1 || ec=$?
  printf '%s' "$ec"
}
for MODE in default gbk; do
  rm -f "$P1/book/大纲/细纲_第1章.md"
  [ "$(run_guard_py "$MODE" 'book/正文/第1章_开端.md')" = 2 ] && pass "[$MODE] long blocked, 细纲 missing" || bad "[$MODE] long should block when 细纲 missing"
  : > "$P1/book/大纲/细纲_第1章.md"
  [ "$(run_guard_py "$MODE" 'book/正文/第1章_开端.md')" = 0 ] && pass "[$MODE] long allowed, 细纲 present" || bad "[$MODE] long should allow when 细纲 present"
  : > "$P1/short/设定.md"; rm -f "$P1/short/小节大纲.md"
  [ "$(run_guard_py "$MODE" 'short/正文.md')" = 2 ] && pass "[$MODE] short blocked, 小节大纲 missing" || bad "[$MODE] short should block when 小节大纲 missing"
  : > "$P1/short/小节大纲.md"
  [ "$(run_guard_py "$MODE" 'short/正文.md')" = 0 ] && pass "[$MODE] short allowed, 小节大纲 present" || bad "[$MODE] short should allow when 小节大纲 present"
done

# ===== Part 1b：Windows 盘符绝对路径分类（issue #184，任何平台可跑）=====
# Windows + Git Bash 下 Claude Code 传入盘符绝对路径（F:/... 或 F:\...）。旧 case 只认 /*，
# 把它当相对路径拼成 $ROOT/F:/...，找错 大纲/ 目录 → 误报细纲缺失。修复后盘符路径按绝对路径处理。
# POSIX runner 无真实盘符：用反证法——fixture 只放在「旧代码会拼出来的」$ROOT/C:/<book> 下。
#   修复后：guard 把 C:/<book> 当绝对路径（→ 文件系统根 /C:/<book>，不存在）→ 找不到 fixture → block(2)
#   旧代码：拼成 $ROOT/C:/<book> 命中 fixture → allow(0)
# 以 block(2) 证明盘符路径已按绝对路径处理。（真实 Windows 上同样的绝对处理会命中真盘符下的
# 真细纲而放行，方向相反，此处只验「是否按绝对路径分类」这一修复点。）
echo "--- Part 1b: Windows drive-letter absolute path classification (issue #184) ---"
if mkdir -p "$P1/C:/book184/大纲" 2>/dev/null && : > "$P1/C:/book184/大纲/细纲_第2章.md" 2>/dev/null; then
  run_guard_drive() { # $1 file_path(JSON-escaped) -> exit code
    local ec=0
    printf '{"tool_name":"Write","tool_input":{"file_path":"%s","content":"x"}}' "$1" \
      | CLAUDE_PROJECT_DIR="$P1" bash "$P1/.claude/hooks/guard-outline-before-prose.sh" >/dev/null 2>&1 || ec=$?
    printf '%s' "$ec"
  }
  [ "$(run_guard_drive 'C:/book184/正文/第2章_x.md')" = 2 ] \
    && pass "[win] forward-slash drive path treated as absolute (not root-joined)" \
    || bad  "[win] forward-slash drive path was root-joined — issue #184 regression"
  # 反斜杠路径在真实 JSON 里是转义的（\\）；json.loads 解出单反斜杠交给 bash，case 分支再归一。
  [ "$(run_guard_drive 'C:\\book184\\正文\\第2章_x.md')" = 2 ] \
    && pass "[win] backslash drive path treated as absolute (separators normalized)" \
    || bad  "[win] backslash drive path mishandled — issue #184 regression"
  rm -rf "$P1/C:"
else
  echo "  SKIP: 文件系统不支持含 ':' 的目录名（无法构造盘符 fixture）"
fi

# ===== Part 1c：真实 Windows 盘符路径（cygpath，仅 Windows/MSYS 跑）=====
# 1b 是 POSIX 反证；这里在真实 Windows/MSYS 上用 cygpath 把 $P1 映射成 C:/... 盘符路径，
# 直接验用户可见行为：细纲在则放行、细纲缺则拦截——而不是反向的分类反证。POSIX 无 cygpath → SKIP。
echo "--- Part 1c: real Windows drive-letter path via cygpath (issue #184) ---"
if command -v cygpath >/dev/null 2>&1; then
  WINROOT="$(cygpath -m "$P1" 2>/dev/null || true)"
  case "$WINROOT" in
    [A-Za-z]:/*)
      mkdir -p "$P1/winbook/正文" "$P1/winbook/大纲"
      run_guard_win() { local ec=0; printf '{"tool_name":"Write","tool_input":{"file_path":"%s","content":"x"}}' "$1" \
        | CLAUDE_PROJECT_DIR="$P1" bash "$P1/.claude/hooks/guard-outline-before-prose.sh" >/dev/null 2>&1 || ec=$?; printf '%s' "$ec"; }
      : > "$P1/winbook/大纲/细纲_第3章.md"
      [ "$(run_guard_win "$WINROOT/winbook/正文/第3章_x.md")" = 0 ] \
        && pass "[win] real drive path allowed when 细纲 present" \
        || bad  "[win] real drive path should allow when 细纲 present"
      rm -f "$P1/winbook/大纲/细纲_第3章.md"
      [ "$(run_guard_win "$WINROOT/winbook/正文/第3章_x.md")" = 2 ] \
        && pass "[win] real drive path blocked when 细纲 missing" \
        || bad  "[win] real drive path should block when 细纲 missing"
      rm -rf "$P1/winbook"
      ;;
    *)
      echo "  SKIP: cygpath present but did not yield a drive-letter path ($WINROOT)"
      ;;
  esac
else
  echo "  SKIP: cygpath not available (not a Windows/MSYS runner)"
fi

# ===== Part 2：真实 GBK 区域下跑全部 hook =====
echo "--- Part 2: real GBK locale (LANG/LC_ALL=zh_CN.GBK) end-to-end ---"
# 探测「可用」的 GBK 类 locale：不看 `locale -a` 列表（Cygwin/MSYS2 会按需合成而不列出），
# 而是真试着设上去看 `locale charmap` 是否返回 GB 类编码。这样 Linux(localedef 生成)、
# macOS(自带)、Windows Git Bash(Cygwin 合成) 三处都能跑到真实 GBK。
detect_gbk_locale() {
  local cand cm
  for cand in zh_CN.GBK zh_CN.gbk zh_CN.GB18030 zh_CN.gb18030 zh_CN.GB2312 zh_CN.gb2312; do
    cm="$(LC_ALL="$cand" locale charmap 2>/dev/null | tr 'a-z' 'A-Z' | tr -d '-')"
    case "$cm" in GBK|GB18030|GB2312) printf '%s' "$cand"; return 0 ;; esac
  done
  return 1
}
GBK_LOCALE="$(detect_gbk_locale || true)"
if [ -z "$GBK_LOCALE" ]; then
  echo "  SKIP: 系统无可用 zh_CN.GBK 类 locale（Part 1 已覆盖 python 那层；Part 2 需真实 GBK 区域）"
else
  echo "  using locale: $GBK_LOCALE"
  GBK() { LANG="$GBK_LOCALE" LC_ALL="$GBK_LOCALE" env "$@"; }
  P2="$WORK/p2"; deploy "$P2"
  git -C "$P2" init -q; git -C "$P2" config user.email t@t.t; git -C "$P2" config user.name t
  # 中文书名作为中间目录——正是 GBK 下 bash 通配会 NOMATCH 的场景
  BOOK="$P2/让你管账号"; mkdir -p "$BOOK/正文" "$BOOK/大纲" "$BOOK/追踪" "$BOOK/设定"
  printf '让你管账号\n' > "$P2/.active-book"

  # 2a guard-outline：中文书名中间目录 + 中文通配 glob
  rg() { local ec=0; printf '{"tool_name":"Write","tool_input":{"file_path":"%s","content":"x"}}' "$1" \
    | GBK CLAUDE_PROJECT_DIR="$P2" bash "$P2/.claude/hooks/guard-outline-before-prose.sh" >/dev/null 2>&1 || ec=$?; printf '%s' "$ec"; }
  [ "$(rg '让你管账号/正文/第1章_开端.md')" = 2 ] && pass "[GBK] guard blocks missing 细纲" || bad "[GBK] guard should block missing 细纲"
  : > "$BOOK/大纲/细纲_第1章.md"
  [ "$(rg '让你管账号/正文/第1章_开端.md')" = 0 ] && pass "[GBK] guard allows present 细纲 (Chinese glob)" || bad "[GBK] guard should allow present 细纲 under GBK"
  [ "$(rg '让你管账号/正文/第001章_开端.md')" = 0 ] && pass "[GBK] guard tolerates zero-pad 第001章" || bad "[GBK] guard should tolerate 第001章 under GBK"

  # 2b detect-story-gaps：正常伏笔表不误报；同时证明中文书目能被发现。
  # F001 状态用全角空格 U+3000 补白（已埋 前后各一个），守住 LC_ALL=C 下 trim 仍认全角空格。
  cat > "$BOOK/追踪/伏笔.md" <<'EOF'
| ID | 伏笔内容 | 埋设章节 | 预计回收章节 | 状态{未埋/已埋/已回收/已过期} | 重要度{高/中/低} |
|----|---------|---------|-------------|-----------------------------|----------------|
| F001 | 玉佩身世 | 第1章 | 第20章 |　已埋　| 高 |
| F002 | 师门往事 | 第3章 | 第25章 | 已回收 | 中 |
EOF
  out="$(cd "$P2" && GBK CLAUDE_PROJECT_DIR="$P2" bash .claude/hooks/detect-story-gaps.sh 2>&1 || true)"
  echo "$out" | grep -q '伏笔' && bad "[GBK] detect-story-gaps spuriously warns on normal 伏笔" || pass "[GBK] detect-story-gaps silent on normal 伏笔"
  # 制造真实缺口（正文>10 设定<3），证明中文书目确实被遍历到（否则上面的"静默"是假阳性）
  i=1; while [ "$i" -le 11 ]; do : > "$BOOK/正文/第${i}章.md"; i=$((i+1)); done
  out2="$(cd "$P2" && GBK CLAUDE_PROJECT_DIR="$P2" bash .claude/hooks/detect-story-gaps.sh 2>&1 || true)"
  echo "$out2" | grep -q '让你管账号' && pass "[GBK] detect-story-gaps discovers Chinese book + warns on real gap" || bad "[GBK] detect-story-gaps failed to discover Chinese book under GBK"
  rm -f "$BOOK"/正文/第*章.md

  # 2c validate-story-commit：命中全角冒号 + 全角空格的硬编码属性（C/GBK 区域下方括号字符组
  # 会漏全角冒号、[[:space:]] 会漏全角空格，交替修好）
  printf '年龄　：18\n' > "$BOOK/正文/第1章_开端.md"
  git -C "$P2" add -A >/dev/null 2>&1
  cout="$(cd "$P2" && GBK CLAUDE_PROJECT_DIR="$P2" STORY_COMMIT_COMMAND='git commit -m x' bash .claude/hooks/validate-story-commit.sh 2>&1 || true)"
  echo "$cout" | grep -q '正文硬编码角色属性' && pass "[GBK] validate-commit catches fullwidth-colon attr" || bad "[GBK] validate-commit missed fullwidth-colon attr under GBK"

  # 2d lib/common.sh discover_active_book：.active-book 指向「短中文书名」时，GBK 下 trim sed
  # 会报 illegal byte sequence → active 被吞空 → 误回退到 find 的第一本书。覆盖被 session-*/
  # pre-compact/post-compact 复用的这条共享路径。确定性构造：活跃书无 追踪/正文（fallback 找
  # 不到它），诱饵书有 追踪/（fallback 只会命中诱饵）—— 修复前回 decoy、修复后回 .active-book。
  P2D="$WORK/p2d"; deploy "$P2D"
  mkdir -p "$P2D/让你管账号/设定" "$P2D/decoy小说/追踪"
  printf '让你管账号\n' > "$P2D/.active-book"
  active_path="$(cd "$P2D" && GBK CLAUDE_PROJECT_DIR="$P2D" bash -c 'source ".claude/hooks/lib/common.sh"; discover_active_book' 2>/dev/null)"
  # 字节安全断言：活跃书有 设定/、诱饵书有 追踪/；用 [ -d ] 直接 stat 字节路径，避免 basename
  # 在个别 runner 的 GBK 下改写多字节而假失败。修复前回诱饵（无 设定/），修复后回活跃书。
  if [ -d "$active_path/设定" ]; then
    pass "[GBK] common.sh discover_active_book honors short Chinese .active-book"
  else
    bad "[GBK] common.sh discover_active_book dropped short Chinese .active-book (resolved [$active_path])"
  fi
fi

echo ""
if [ "$fail" -eq 0 ]; then
  echo "PASS: hook 在 cp936 与真实 GBK 区域下都正确"
else
  echo "FAIL: hook 在某个编码/区域模式下行为不符（中文编码回归）"
fi
exit "$fail"
