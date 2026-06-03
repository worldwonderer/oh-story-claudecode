#!/bin/bash
# test-charcount-portable.sh — 验证「跨平台字符统计」命令在三大平台 + Windows
# Microsoft Store 占位程序场景下都能正确数出中文字符数。
#
# 背景：技能文档要求模型用下面这条探测命令统计字数。Windows 上 python.org 安装后
# `python3` 会落到 Microsoft Store 占位程序、以 exit 49 静默失败，必须按
# python3 -> python -> py 探测出真正可用的解释器。GitHub windows-latest 自带可用的
# python3，因此 `--stub` 模式人为塞入一个 exit-49 的假 python3 来复现真实故障。
#
# 用法：
#   bash scripts/test-charcount-portable.sh           # 用真实解释器
#   bash scripts/test-charcount-portable.sh --stub     # 模拟 Store 占位程序(exit 49)
#
# 注意：下面 PROBE/COUNT 两行必须与技能文档里的命令逐字一致（story-short-write、
# story-long-write、narrative-writer、style-profile-generator）。check-python-invocation.sh
# 守卫文档不回退成裸 python3；本脚本守卫这条命令真的能跑出正确结果。
set -euo pipefail

STUB=0
[ "${1:-}" = "--stub" ] && STUB=1

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# 中文目录 + 中文文件名，复现 issue #121 的路径场景
BOOK_DIR="$WORK/小说项目/第一卷"
mkdir -p "$BOOK_DIR"
FILE="$BOOK_DIR/正文.md"
# 12 个码位：中文字数测试(6) + ABC(3) + 123(3)，无结尾换行
printf '%s' '中文字数测试ABC123' > "$FILE"
EXPECT=12

if [ "$STUB" -eq 1 ]; then
  # 塞一个永远 exit 49 的假 python3 到 PATH 最前面，复现 Windows Store 占位程序
  FAKEBIN="$WORK/fakebin"
  mkdir -p "$FAKEBIN"
  printf '#!/bin/sh\nexit 49\n' > "$FAKEBIN/python3"
  chmod +x "$FAKEBIN/python3"
  PATH="$FAKEBIN:$PATH"
  export PATH
  echo "[stub] python3 现在固定 exit 49（模拟 Microsoft Store 占位程序）"
fi

# === 与技能文档逐字一致的探测 + 统计命令 ===
for PYBIN in python3 python py; do "$PYBIN" -c "" 2>/dev/null && break; done
GOT="$("$PYBIN" -c "from pathlib import Path; print(len(Path('$FILE').read_text(encoding='utf-8')))")"
# === 命令结束 ===

echo "selected interpreter: $PYBIN"
echo "char count: $GOT (expect $EXPECT)"

fail=0
if [ "$GOT" != "$EXPECT" ]; then
  echo "FAIL: 字符数不符（中文路径或解释器问题）"
  fail=1
fi
if [ "$STUB" -eq 1 ] && [ "$PYBIN" = "python3" ]; then
  echo "FAIL: stub 模式下仍选中了坏掉的 python3，回退链没生效"
  fail=1
fi
if [ "$fail" -eq 0 ]; then
  echo "PASS"
fi
exit "$fail"
