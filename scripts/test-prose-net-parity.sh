#!/bin/bash
# test-prose-net-parity.sh — 正文兜底「轻量确定性网」四端 parity 守卫
# 网在四处各有实现：① Claude check-prose-after-write.sh 内嵌 python；② Codex
# story_codex_hook.py；③ OpenCode plugin.ts；④ ZCode story_zcode_hook.js。
# 三份必须同检同放。本测试两层保证：
#   A. 规范串一致（CI 安全、零运行时依赖）：每条 net 正则/常量/阈值的规范文本必须在三份里都出现，
#      改一处漏改另一处即 fail——直接锚定漂移（参照 check-hook-regex-sync.sh 的做法）。
#   B. 功能 parity（best-effort，无 TS 运行时则自跳过）：codex python 网与 opencode TS 网在同一
#      组 fixture 上逐字相等。
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
[ -z "$ROOT" ] && { echo "Error: not in a git repository" >&2; exit 1; }

CLAUDE="$ROOT/skills/story-setup/references/templates/hooks/check-prose-after-write.sh"
CODEX="$ROOT/skills/story-setup/references/codex/hooks/story_codex_hook.py"
OPENCODE="$ROOT/skills/story-setup/references/opencode/plugin.ts"
ZCODE="$ROOT/skills/story-setup/references/zcode/hooks/story_zcode_hook.js"
for f in "$CLAUDE" "$CODEX" "$OPENCODE" "$ZCODE"; do
  [ -f "$f" ] || { echo "FAIL: missing impl: $f" >&2; exit 1; }
done

fails=0

# ── A. 规范串三端一致 ──────────────────────────────────────────────
# 每条 net 正则的规范子串（足以唯一锚定该模式）+ 关键常量/阈值。必须在三份文件里都 grep -F 到。
CANON=(
  # 软信号（拒绝语 / AI 自指）
  '作为(一个)?(AI|人工智能|大?语言模型|智能助手|聊天助手)(?='
  '我(无法|不能)(继续(写|创作|生成|下去|输出)?'
  "Sure|Certainly|Here'?s|As an AI|I (?:cannot|can't|am unable|apologize)"
  # 硬信号（占位 / 工程词 / 乱码）
  '(此处|以下|这里|下文|后续)?[^）)]{0,10}(省略|略去|略过)'
  '(TODO|占位符|placeholder|待补充|此处待填|此处待补)'
  '(细纲|情节点|卷纲|功能标签|目标情绪|字数目标|章首钩子|章尾钩子|任务描述)'
  # 常量 / 阈值（截断终止标点集、对话引号、复读最短可见长度）
  '。！？…”』」）)!?.~—'
  '「'
  '>= 8'
  # 字数欠账：细纲「字数目标」抽取 + 90% 门
  '字数目标[^0-9]{0,6}(\d{3,6})'
)
for needle in "${CANON[@]}"; do
  for f in "$CLAUDE" "$CODEX" "$OPENCODE" "$ZCODE"; do
    if ! grep -Fq "$needle" "$f"; then
      echo "FAIL: net 规范串缺失/漂移 — 「${needle}」未出现在 $(basename "$f")" >&2
      fails=$((fails + 1))
    fi
  done
done
# 复读阈值在 JS 里写作 `sa.length >= 8`，python 里 `len(sa) >= 8`；上面的 '>= 8' 已覆盖两者。

# ── B. 功能 parity（codex python 网 vs opencode TS 网），best-effort ──
# TS 运行：优先 node 原生类型擦除（node ≥ 22.6 的 --experimental-strip-types），否则 npx esbuild；
# 都没有则跳过 B（A 已给出 CI 安全的硬保证）。
run_functional() {
  command -v node >/dev/null 2>&1 || return 1
  command -v python3 >/dev/null 2>&1 || return 1
  local tmp; tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' RETURN

  cat > "$tmp/fixtures.json" <<'EOF'
{
  "clean": "江晨睁开眼天还没亮。\n他要快要狠要赢这是唯一的活路。\n「作为AI管家，我劝你别白费力气。」\n他握紧拳头走向门口。",
  "truncate": "江晨握紧拳头慢慢走向门口。\n江晨冲过去一拳砸在",
  "refuse": "夜色压下来。\n作为AI我无法继续创作这部分内容。",
  "engword": "街灯一盏盏亮起。\n按照本章细纲的情节点他该出场了。",
  "repeat": "他握紧拳头一步步走过去缓缓逼近。\n他握紧拳头一步步走过去缓缓逼近。\n他终于停下了。",
  "placeholder": "他打开门。\n（此处省略三百字打斗描写）他赢了。",
  "english_ai": "他说。\nI cannot continue writing this scene for you.",
  "parallel": "要么生，要么死。\n要么战，要么逃。\n要么赢，要么输。\n他做出了选择。",
  "danmaku": "前方高能！\n前方高能！预警。\n这一段我哭了。\n作者加更！"
}
EOF

  python3 - "$CODEX" "$tmp/fixtures.json" > "$tmp/py.txt" <<'PY'
import importlib.util, sys, json
spec = importlib.util.spec_from_file_location("ch", sys.argv[1]); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
fx = json.load(open(sys.argv[2], encoding='utf-8'))
# 用 stdout.buffer 直写 UTF-8 字节：Windows runner 上 python<3.15 的文本 stdout 是 cp1252，
# 含中文 findings 的 print 会 UnicodeEncodeError（与 node 侧 console.log 的 UTF-8 输出对齐）。
for k in sorted(fx):
    line = k + " | " + " ;; ".join(m.prose_net_findings(fx[k]))
    sys.stdout.buffer.write((line + "\n").encode("utf-8"))
PY

  node - "$ZCODE" "$tmp/fixtures.json" > "$tmp/zcode.txt" <<'JS'
const hook = require(process.argv[2])
const fx = require(process.argv[3])
for (const k of Object.keys(fx).sort()) {
  console.log(k, "|", hook.proseNetFindings(fx[k]).join(" ;; "))
}
JS
  if ! diff "$tmp/py.txt" "$tmp/zcode.txt" >/dev/null; then
    echo "FAIL: 功能 parity 不一致（codex python 网 vs zcode JS 网）：" >&2
    diff "$tmp/py.txt" "$tmp/zcode.txt" >&2 || true
    return 3
  fi

  # 转译 TS：擦除类型即可（net 函数只用 RegExp/String/Set/Array）。优先 node 原生类型擦除
  # （node ≥ 22.6 的 --experimental-strip-types），否则用本机已装的 esbuild 二进制。
  # 不走 `npx --yes esbuild`：CI 全平台 node 20，逐次联网下载既慢又脆——B 是开发期确认，
  # CI 的确定性保证由 A（规范串三端一致）承担，无 TS 运行时则 B 自跳过。
  cp "$OPENCODE" "$tmp/p.ts"
  printf '\nexport { proseNetFindings as _net }\n' >> "$tmp/p.ts"
  local ran=0
  if node --experimental-strip-types -e '' >/dev/null 2>&1; then
    node --experimental-strip-types --input-type=module -e "
      import { _net } from '$tmp/p.ts';
      import fs from 'node:fs';
      const fx = JSON.parse(fs.readFileSync('$tmp/fixtures.json','utf-8'));
      for (const k of Object.keys(fx).sort()) console.log(k, '|', _net(fx[k]).join(' ;; '));
    " > "$tmp/ts.txt" 2>/dev/null && ran=1
  fi
  if [ "$ran" -eq 0 ] && command -v esbuild >/dev/null 2>&1; then
    if esbuild "$tmp/p.ts" --format=esm --platform=node --log-level=silent --outfile="$tmp/p.mjs" >/dev/null 2>&1; then
      node --input-type=module -e "
        import { _net } from '$tmp/p.mjs';
        import fs from 'node:fs';
        const fx = JSON.parse(fs.readFileSync('$tmp/fixtures.json','utf-8'));
        for (const k of Object.keys(fx).sort()) console.log(k, '|', _net(fx[k]).join(' ;; '));
      " > "$tmp/ts.txt" 2>/dev/null && ran=1
    fi
  fi
  [ "$ran" -eq 0 ] && return 2

  if ! diff "$tmp/py.txt" "$tmp/ts.txt" >/dev/null; then
    echo "FAIL: 功能 parity 不一致（codex python 网 vs opencode TS 网）：" >&2
    diff "$tmp/py.txt" "$tmp/ts.txt" >&2 || true
    return 3
  fi
  return 0
}

set +e
run_functional
rc=$?
set -e
case "$rc" in
  0) echo "功能 parity：codex python 网 == opencode TS 网 == zcode JS 网（9 fixtures 逐字相等）。" ;;
  2) echo "功能 parity：跳过（无 TS 运行时；规范串检查已给 CI 安全保证）。" ;;
  *) fails=$((fails + 1)) ;;
esac

if [ "$fails" -ne 0 ]; then
  echo "Prose net parity tests FAILED ($fails)." >&2
  exit 1
fi
echo "Prose net parity tests passed."
