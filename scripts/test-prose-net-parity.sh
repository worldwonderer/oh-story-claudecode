#!/bin/bash
# test-prose-net-parity.sh — 正文兜底「轻量确定性网」四端 parity 守卫
# 网在四处各有实现：① Claude check-prose-after-write.sh 内嵌 python；② Codex
# story_codex_hook.py；③ OpenCode plugin.ts；④ ZCode story_zcode_hook.js。
# （③④ 的纯逻辑现共用各自的 story_hook_core.js companion，字节一致。）
# 四份必须同检同放。本测试五层保证：
#   A. 规范串一致（CI 安全、零运行时依赖）：每条 net 正则/常量/阈值的规范文本必须在四份里都出现，
#      改一处漏改另一处即 fail——直接锚定漂移（参照 check-hook-regex-sync.sh 的做法）。
#   B. 功能 parity（best-effort，无 TS 运行时则自跳过）：codex python 网、opencode TS 网、
#      zcode JS 网在同一组 fixture 上逐字相等。
#   C. 命令函数 parity（CI 硬保证）：正文目标抽取、apply-patch 目标、git commit 侦测三个纯函数
#      在 codex python 与 zcode JS 间逐字相等——锁住此前无守卫、已漂移的手抄逻辑。
#   D. Claude 归核回归守卫（CI 硬保证）：Claude 的 4 个 bash hook 不再内嵌 heredoc python，
#      改调本目录同一份 node 共享核 story_hook_core.js（经 story_hook_cli.js）。与 zcode/opencode
#      同一份、已由 B/C 锁到 codex，故 claude==codex 结构性闭环。守两条防回退：hook 里不得再出现
#      heredoc python，且必须经 story_hook_cli.js 调核。字节一致另由 check-shared-files 保证。
#   E. 未归核面 parity（CI 硬保证）：staged markdown warnings 与大纲阻断判定未归核——codex
#      python 与 JS core 各有一份实现，在 fixture 上逐字比对（大小写变体命中、警告/阻断文案），
#      语义/文案以 JS core 为准。Claude 端这两面另有纯 bash 实现（validate-story-commit.sh 的
#      grep 段、guard-outline-before-prose.sh 的判定段），无跨端逐字锁，行为由
#      check-story-setup-deployment.sh / test-hook-encoding-portable.sh 的运行回归覆盖。
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
[ -z "$ROOT" ] && { echo "Error: not in a git repository" >&2; exit 1; }

CLAUDE="$ROOT/skills/story-setup/references/templates/hooks/check-prose-after-write.sh"
CODEX="$ROOT/skills/story-setup/references/codex/hooks/story_codex_hook.py"
OPENCODE="$ROOT/skills/story-setup/references/opencode/plugin.ts"
ZCODE="$ROOT/skills/story-setup/references/zcode/hooks/story_zcode_hook.js"
ZCODE_CORE="$ROOT/skills/story-setup/references/zcode/hooks/story_hook_core.js"
OPENCODE_CORE="$ROOT/skills/story-setup/references/opencode/story_hook_core.js"
CLAUDE_CORE="$ROOT/skills/story-setup/references/templates/hooks/story_hook_core.js"
CLAUDE_COMMIT="$ROOT/skills/story-setup/references/templates/hooks/validate-story-commit.sh"
CLAUDE_GAPS="$ROOT/skills/story-setup/references/templates/hooks/detect-story-gaps.sh"
for f in "$CLAUDE" "$CODEX" "$OPENCODE" "$ZCODE" "$ZCODE_CORE" "$OPENCODE_CORE" "$CLAUDE_CORE" "$CLAUDE_COMMIT" "$CLAUDE_GAPS"; do
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
    if grep -Fq "$needle" "$f"; then
      continue
    fi
    # ZCode's net constants/patterns live in the shared story_hook_core.js companion
    # that story_zcode_hook.js requires; accept a hit there as satisfying this file.
    if [ "$f" = "$ZCODE" ] && grep -Fq "$needle" "$ZCODE_CORE"; then
      continue
    fi
    # OpenCode's plugin.ts likewise imports the net from its own shared story_hook_core.js
    # companion (byte-identical to ZCode's); accept a hit there as satisfying plugin.ts.
    if [ "$f" = "$OPENCODE" ] && grep -Fq "$needle" "$OPENCODE_CORE"; then
      continue
    fi
    # Claude's check-prose-after-write.sh now delegates the net/wordcount patterns to the
    # same shared story_hook_core.js (loaded via story_hook_cli.js); accept a hit there.
    if [ "$f" = "$CLAUDE" ] && grep -Fq "$needle" "$CLAUDE_CORE"; then
      continue
    fi
    echo "FAIL: net 规范串缺失/漂移 — 「${needle}」未出现在 $(basename "$f")" >&2
    fails=$((fails + 1))
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
  "danmaku": "前方高能！\n前方高能！预警。\n这一段我哭了。\n作者加更！",
  "toxic_voice": "他开口了。\n声音不高，第一句却稳稳压住了整个大厅。",
  "toxic_negation": "没有伴奏，没有和声，没有提词器。\n台下静了三秒。",
  "toxic_reverse_notis": "是真嗓子，不是修音修出来的。\n他清了清嗓子接着唱。",
  "toxic_forward_notis": "不是没有想过退路，而是根本没有退路。\n他把门关上了。",
  "toxic_trailer": "他放下麦克风朝台下鞠了一躬。\n没人知道，这才刚刚开头。",
  "toxic_dialogue_ok": "「没人知道。」\n他笑了笑接着往前走。",
  "toxic_eitheror_ok": "不是生就是死，他认了。\n他推门走了进去。",
  "toxic_affirm_ok": "是啊，不是他的错。\n他把灯关了。",
  "toxic_shibushi_ok": "他问自己是不是听错了，是不是灯光太晃。\n他揉了揉眼睛。",
  "toxic_question_ok": "是不是他干的，不是我干的。\n他说不清。",
  "toxic_rhetorical_ok": "是挺好的一件事，不是吗。\n他点了点头。",
  "toxic_curtain_ok": "钟声再度响起，比赛正式拉开序幕。\n他站上了台。",
  "toxic_quote_mid_ok": "她的声音不大好听，被人截成“名场面”，但她不在乎。\n台下没有掌声，没有“安可”声，只有此起彼伏的咳嗽。",
  "toxic_multi_tail_ok": "是他的错，不是我的错，不是吗。\n他点了点头。",
  "toxic_exempt_marker_ok": "# 第1章\n<!-- 去味:跳过 -->\n没有伴奏，没有和声，没有提词器。",
  "toxic_exempt_fullwidth_ok": "# 第1章\n<!-- 去味：跳过 -->\n没有伴奏，没有和声，没有提词器。",
  "toxic_exempt_other_nets": "# 第1章\n<!-- 去味:跳过 -->\n没有伴奏，没有和声，没有提词器。\n按照本章细纲的情节点他该出场了。",
  "toxic_astral_window_ok": "没人知道他练了多少年。\n“第1排😀😀😀😀😀😀😀😀😀😀”\n“第2排😀😀😀😀😀😀😀😀😀😀”\n“第3排😀😀😀😀😀😀😀😀😀😀”\n“第4排😀😀😀😀😀😀😀😀😀😀”\n“第5排😀😀😀😀😀😀😀😀😀😀”\n“第6排😀😀😀😀😀😀😀😀😀😀”\n“第7排😀😀😀😀😀😀😀😀😀😀”\n“第8排😀😀😀😀😀😀😀😀😀😀”\n“第9排😀😀😀😀😀😀😀😀😀😀”\n“第10排😀😀😀😀😀😀😀😀😀😀”\n“第11排😀😀😀😀😀😀😀😀😀😀”\n“第12排😀😀😀😀😀😀😀😀😀😀”\n“第13排😀😀😀😀😀😀😀😀😀😀”\n“第14排😀😀😀😀😀😀😀😀😀😀”\n“第15排😀😀😀😀😀😀😀😀😀😀”\n“第16排😀😀😀😀😀😀😀😀😀😀”\n“第17排😀😀😀😀😀😀😀😀😀😀”\n“第18排😀😀😀😀😀😀😀😀😀😀”\n“第19排😀😀😀😀😀😀😀😀😀😀”\n“第20排😀😀😀😀😀😀😀😀😀😀”\n“第21排😀😀😀😀😀😀😀😀😀😀”\n“第22排😀😀😀😀😀😀😀😀😀😀”\n“第23排😀😀😀😀😀😀😀😀😀😀”\n“第24排😀😀😀😀😀😀😀😀😀😀”\n“第25排😀😀😀😀😀😀😀😀😀😀”\n“第26排😀😀😀😀😀😀😀😀😀😀”\n“第27排😀😀😀😀😀😀😀😀😀😀”\n“第28排😀😀😀😀😀😀😀😀😀😀”\n“第29排😀😀😀😀😀😀😀😀😀😀”\n“第30排😀😀😀😀😀😀😀😀😀😀”",
  "toxic_trailer_window_ok": "没人知道他练了多少年。\n江晨把这段视频剪了又剪从凌晨剪到天亮每一帧都抠得死死的。江晨把这段视频剪了又剪从凌晨剪到天亮每一帧都抠得死死的。江晨把这段视频剪了又剪从凌晨剪到天亮每一帧都抠得死死的。江晨把这段视频剪了又剪从凌晨剪到天亮每一帧都抠得死死的。江晨把这段视频剪了又剪从凌晨剪到天亮每一帧都抠得死死的。江晨把这段视频剪了又剪从凌晨剪到天亮每一帧都抠得死死的。江晨把这段视频剪了又剪从凌晨剪到天亮每一帧都抠得死死的。江晨把这段视频剪了又剪从凌晨剪到天亮每一帧都抠得死死的。江晨把这段视频剪了又剪从凌晨剪到天亮每一帧都抠得死死的。江晨把这段视频剪了又剪从凌晨剪到天亮每一帧都抠得死死的。江晨把这段视频剪了又剪从凌晨剪到天亮每一帧都抠得死死的。江晨把这段视频剪了又剪从凌晨剪到天亮每一帧都抠得死死的。江晨把这段视频剪了又剪从凌晨剪到天亮每一帧都抠得死死的。江晨把这段视频剪了又剪从凌晨剪到天亮每一帧都抠得死死的。江晨把这段视频剪了又剪从凌晨剪到天亮每一帧都抠得死死的。江晨把这段视频剪了又剪从凌晨剪到天亮每一帧都抠得死死的。江晨把这段视频剪了又剪从凌晨剪到天亮每一帧都抠得死死的。江晨把这段视频剪了又剪从凌晨剪到天亮每一帧都抠得死死的。江晨把这段视频剪了又剪从凌晨剪到天亮每一帧都抠得死死的。江晨把这段视频剪了又剪从凌晨剪到天亮每一帧都抠得死死的。江晨把这段视频剪了又剪从凌晨剪到天亮每一帧都抠得死死的。江晨把这段视频剪了又剪从凌晨剪到天亮每一帧都抠得死死的。\n他把琴盖合上，起了身。"
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

  # 毒句式 fixture 防空转断言（两端同错也能 diff 通过，故对期望输出显式断言）：
  # 正例（用户实抓的真实毒句）须命中对应规则；反例（对话内/either-or/确认语/是不是/
  # 窗口外 trailer）须完全静默。
  grep -q '^toxic_voice | 第2行 毒句式\[voice-contrast\]' "$tmp/py.txt" || { echo "FAIL: 毒句式正例 voice-contrast 未命中「声音不高…却」" >&2; return 3; }
  grep -q '^toxic_negation | 第1行 毒句式\[negation-parade\]' "$tmp/py.txt" || { echo "FAIL: 毒句式正例 negation-parade 未命中「没有…没有…」" >&2; return 3; }
  grep -q '^toxic_reverse_notis | 第1行 毒句式\[reverse-not-is\]' "$tmp/py.txt" || { echo "FAIL: 毒句式正例 reverse-not-is 未命中「是真嗓子，不是修音」" >&2; return 3; }
  grep -q '^toxic_forward_notis | 第1行 毒句式\[not-is-comparison\]' "$tmp/py.txt" || { echo "FAIL: 毒句式正例 not-is-comparison 未命中「不是…，而是…」" >&2; return 3; }
  grep -q '^toxic_trailer | 第2行 毒句式\[trailer-ending\]' "$tmp/py.txt" || { echo "FAIL: 毒句式正例 trailer-ending 未命中「没人知道，这才刚刚开头」" >&2; return 3; }
  grep -q '^toxic_dialogue_ok | $' "$tmp/py.txt" || { echo "FAIL: 对话内「没人知道」被误报（成对引号应剥除）" >&2; return 3; }
  grep -q '^toxic_eitheror_ok | $' "$tmp/py.txt" || { echo "FAIL: either-or「不是A就是B」被误报" >&2; return 3; }
  grep -q '^toxic_affirm_ok | $' "$tmp/py.txt" || { echo "FAIL: 确认语「是啊，不是…」被误报" >&2; return 3; }
  grep -q '^toxic_shibushi_ok | $' "$tmp/py.txt" || { echo "FAIL: 疑问「是不是」被误报" >&2; return 3; }
  grep -q '^toxic_question_ok | $' "$tmp/py.txt" || { echo "FAIL: 「是不是…」问句起头被误报" >&2; return 3; }
  grep -q '^toxic_rhetorical_ok | $' "$tmp/py.txt" || { echo "FAIL: 反问尾巴「…，不是吗」被误报" >&2; return 3; }
  grep -q '^toxic_curtain_ok | $' "$tmp/py.txt" || { echo "FAIL: 报幕式「正式拉开序幕」被误报" >&2; return 3; }
  grep -q '^toxic_trailer_window_ok | $' "$tmp/py.txt" || { echo "FAIL: 文末 600 字窗口外的「没人知道」被误报" >&2; return 3; }
  grep -q '^toxic_quote_mid_ok | $' "$tmp/py.txt" || { echo "FAIL: 句中引号段未按等长占位截断，规则跨引号拼出假命中" >&2; return 3; }
  grep -q '^toxic_multi_tail_ok | $' "$tmp/py.txt" || { echo "FAIL: 带中间对比项的反问尾巴「…，不是吗」被误报" >&2; return 3; }
  grep -q '^toxic_exempt_marker_ok | $' "$tmp/py.txt" || { echo "FAIL: 标「去味:跳过」的正文毒句式未被写后网豁免" >&2; return 3; }
  grep -q '^toxic_exempt_fullwidth_ok | $' "$tmp/py.txt" || { echo "FAIL: 全角冒号豁免标记「去味：跳过」未生效" >&2; return 3; }
  grep -q '^toxic_exempt_other_nets | 第4行 工程词泄漏' "$tmp/py.txt" || { echo "FAIL: 豁免标记不应连带关掉毒句式以外的网（工程词漏检）" >&2; return 3; }
  grep '^toxic_exempt_other_nets' "$tmp/py.txt" | grep -q '毒句式' && { echo "FAIL: 豁免标记在场时毒句式仍被推回" >&2; return 3; }
  grep -q '^toxic_astral_window_ok | $' "$tmp/py.txt" || { echo "FAIL: 引号内 emoji 的占位长度未按 UTF-16 码元对齐，trailer 窗口切点漂移" >&2; return 3; }

  # 转译 TS：擦除类型即可（net 函数只用 RegExp/String/Set/Array）。优先 node 原生类型擦除
  # （node ≥ 22.6 的 --experimental-strip-types），否则用本机已装的 esbuild 二进制。
  # 不走 `npx --yes esbuild`：CI 全平台 node 20，逐次联网下载既慢又脆——B 是开发期确认，
  # CI 的确定性保证由 A（规范串三端一致）承担，无 TS 运行时则 B 自跳过。
  cp "$OPENCODE" "$tmp/p.ts"
  # plugin.ts imports the core from ./lib/story_hook_core.js (the deploy target — a lib/
  # subdir escapes OpenCode's single-level .opencode/plugins/*.js plugin auto-discovery);
  # mirror that layout here so the copied plugin's import resolves.
  mkdir -p "$tmp/lib"
  cp "$OPENCODE_CORE" "$tmp/lib/story_hook_core.js"
  # plugin.ts imports the net from ./lib/story_hook_core.js; re-export it from that companion
  # so the type-stripped module exposes the exact function OpenCode runs at deploy time.
  printf "\nexport { proseNetFindings as _net } from './lib/story_hook_core.js'\n" >> "$tmp/p.ts"
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

# ── C. 命令函数 parity（codex python vs zcode JS），CI 硬保证 ─────────────────
# 正文目标抽取（重定向/tee/touch/cp·mv）、apply-patch 目标、git commit 侦测三个纯函数
# （命令串 → 值）在下列 fixture 上逐字相等。此前只在 py/js 手抄、无守卫，已漂移（cp·mv
# 元数、git 控制词 then/do/else/elif、子 shell 括号）。node+python3 在 CI 全平台都在，故为硬门。
# 注：fixture 取两端已收敛的子集；引号内分隔符（echo "a; git commit"）与命令替换（$(git commit)）
# 两端本就不等（py 用 shlex 尊重引号，js 裸拆），非本网职责，且只影响 advisory 不影响拦截。
run_cmd_parity() {
  command -v node >/dev/null 2>&1 || return 1
  command -v python3 >/dev/null 2>&1 || return 1
  local tmp; tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' RETURN
  cat > "$tmp/cmd.json" <<'EOF'
{
  "redirect": "echo x > book/正文/第1章.md",
  "append": "cat a >> 正文.md",
  "tee": "echo x | tee book/正文/第2章.md",
  "tee_a": "printf y | tee -a 正文.md",
  "touch": "touch book/正文/第3章.md",
  "cp": "cp src.md book/正文/第4章.md",
  "mv2": "mv 正文.md",
  "cp_flag": "cp -f a.md 正文.md",
  "mention": "grep -n book/正文/第1章.md notes.md",
  "patch_add": "*** Begin Patch\n*** Add File: book/正文/第5章.md\n+正文\n*** End Patch",
  "commit_plain": "git commit -m x",
  "commit_chain": "git add . && git commit -m x",
  "commit_if": "if true; then git commit -m x; fi",
  "commit_for": "for f in *; do git commit -am x; done",
  "commit_subshell": "(cd sub && git commit)",
  "commit_env": "FOO=1 git commit",
  "commit_config": "git -c user.name=x commit",
  "commit_C": "git -C sub commit -m y",
  "noncommit_echo": "echo git commit docs",
  "noncommit_status": "git status && echo done"
}
EOF
  python3 - "$CODEX" "$tmp/cmd.json" > "$tmp/cpy.txt" <<'PY'
import importlib.util, sys, json
spec = importlib.util.spec_from_file_location("ch", sys.argv[1]); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
fx = json.load(open(sys.argv[2], encoding='utf-8'))
for k in sorted(fx):
    c = fx[k]
    line = f"{k} :: pros=[{'|'.join(m.extract_prose_targets_from_command(c))}] patch=[{'|'.join(m.extract_apply_patch_targets(c))}] commit={'1' if m.is_git_commit_command(c) else '0'}"
    sys.stdout.buffer.write((line + "\n").encode("utf-8"))
PY
  node - "$ZCODE" "$tmp/cmd.json" > "$tmp/cjs.txt" <<'JS'
const h = require(process.argv[2])
const fx = require(process.argv[3])
for (const k of Object.keys(fx).sort()) {
  const c = fx[k]
  console.log(`${k} :: pros=[${h.extractProseTargets(c).join("|")}] patch=[${h.extractPatchTargets(c).join("|")}] commit=${h.isGitCommitCommand(c) ? "1" : "0"}`)
}
JS
  if ! diff "$tmp/cpy.txt" "$tmp/cjs.txt" >/dev/null; then
    echo "FAIL: 命令函数 parity 不一致（codex python vs zcode JS）：" >&2
    diff "$tmp/cpy.txt" "$tmp/cjs.txt" >&2 || true
    return 3
  fi
  return 0
}

# ── D. Claude 归核回归守卫（CI 硬保证）─────────────────────────────────────────────
# Claude 的 4 个 bash hook（check-prose-after-write / guard-outline-before-prose /
# validate-story-commit / detect-story-gaps）不再内嵌 heredoc python，改调本目录同一份 node
# 共享核 story_hook_core.js（经 story_hook_cli.js）——正文网/字数/大纲守卫/git-commit 侦测/
# 连续性。这份核与 OpenCode/ZCode 是同一份（check-shared-files 保证字节相同），已由 Part B/C
# 锁到 codex，故 claude==codex 结构性闭环，无需再抽 heredoc 重跑。这里守两条防回退：
# ① 4 个 hook 里不得再出现 heredoc python（防有人手抄回退成第 5 份实现）；② 必须经
# story_hook_cli.js 调核。字节一致另由 check-shared-files 保证。
run_claude_core_check() {
  local hooks_dir cli bad=0 hook
  hooks_dir="$(dirname "$CLAUDE")"
  cli="$hooks_dir/story_hook_cli.js"
  [ -f "$cli" ] || { echo "FAIL: 缺少 story_hook_cli.js（Claude 调核桥）" >&2; return 3; }
  [ -f "$hooks_dir/story_hook_core.js" ] || { echo "FAIL: 缺少 story_hook_core.js（Claude 共享核副本）" >&2; return 3; }
  if command -v node >/dev/null 2>&1; then
    node --check "$cli" >/dev/null 2>&1 || { echo "FAIL: story_hook_cli.js node 语法错误" >&2; return 3; }
  fi
  for hook in check-prose-after-write guard-outline-before-prose validate-story-commit detect-story-gaps; do
    if grep -q "<<'PY'" "$hooks_dir/$hook.sh"; then
      echo "FAIL: $hook.sh 又内嵌 heredoc python（应改调 node 共享核 story_hook_cli.js）" >&2; bad=1
    fi
    grep -q 'story_hook_cli\.js' "$hooks_dir/$hook.sh" || { echo "FAIL: $hook.sh 未经 story_hook_cli.js 调核" >&2; bad=1; }
  done
  [ "$bad" -eq 0 ] || return 3
  return 0
}

# ── E. 未归核面 parity（codex python vs JS core），CI 硬保证 ─────────────────────
# staged markdown warnings 与大纲阻断判定未归核：codex python（staged_markdown_warnings /
# prose_block_reason）与 JS core（stagedMarkdownWarnings / proseBlockReason）各有一份实现，
# 语义/文案以 JS core 为准，这里在 fixture 上逐字比对防漂移。Claude 端的纯 bash 实现不在此锁，
# 由 check-story-setup-deployment.sh / test-hook-encoding-portable.sh 的运行回归覆盖。
# fixture 至少覆盖：① name 字段大小写变体（NAME/全角空格补白）命中一致——有字段不告警；
# ② 缺字段/硬编码属性的中文警告文案（含头尾框线）逐字一致；③ 长篇缺细纲/有细纲、
# 短篇缺小节大纲/无设定信号 4 组阻断判定与阻断文案逐字一致；④ 毒句式欠账门 4 组：
# 有欠账拦、标「去味:跳过」/全角冒号「去味：跳过」豁免放、上一章含坏字节替换解码继续扫。
run_uncored_parity() {
  command -v node >/dev/null 2>&1 || return 1
  command -v python3 >/dev/null 2>&1 || return 1
  command -v git >/dev/null 2>&1 || return 1
  local tmp; tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' RETURN

  # E1: staged markdown warnings —— 建独立 git 仓库并 stage 固定文件集
  local repo="$tmp/repo"
  mkdir -p "$repo/book/正文" "$repo/设定"
  git -C "$repo" init -q
  printf '身高: 180\n他推门而入。\n年龄　：18\n' > "$repo/book/正文/第1章.md"
  printf 'NAME：林远\n' > "$repo/设定/主角.md"            # 大小写变体：字段在，不告警
  printf '　名字 ：苏离\n' > "$repo/设定/配角.md"          # 全角空格补白：字段在，不告警
  printf '简介：没有名字字段\n' > "$repo/设定/反派.md"     # 缺字段：告警
  git -C "$repo" add -A

  python3 - "$CODEX" "$repo" > "$tmp/spy.txt" <<'PY'
import importlib.util, sys
from pathlib import Path
spec = importlib.util.spec_from_file_location("ch", sys.argv[1]); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
out = m.staged_markdown_warnings(Path(sys.argv[2]))
sys.stdout.buffer.write((out + "\n").encode("utf-8"))
PY
  node - "$CLAUDE_CORE" "$repo" > "$tmp/sjs.txt" <<'JS'
const core = require(process.argv[2])
console.log(core.stagedMarkdownWarnings(process.argv[3]))
JS
  if ! diff "$tmp/spy.txt" "$tmp/sjs.txt" >/dev/null; then
    echo "FAIL: staged warnings parity 不一致（codex python vs JS core）：" >&2
    diff "$tmp/spy.txt" "$tmp/sjs.txt" >&2 || true
    return 3
  fi
  # 防空转（两边都输出空串也会 diff 通过）：断言命中/未命中与统一后的中文文案确实在场
  grep -q '正文硬编码角色属性，应引用设定文件' "$tmp/spy.txt" || { echo "FAIL: staged warnings 未按统一文案报硬编码属性" >&2; return 3; }
  grep -q '反派.md: 设定文件缺少 name/名字 必填字段。' "$tmp/spy.txt" || { echo "FAIL: staged warnings 未按统一文案报缺 name 字段" >&2; return 3; }
  grep -q '主角.md' "$tmp/spy.txt" && { echo "FAIL: 大写 NAME： 应视为字段已存在（大小写不敏感）" >&2; return 3; }
  grep -q '配角.md' "$tmp/spy.txt" && { echo "FAIL: 全角空格补白的 名字 ： 应视为字段已存在" >&2; return 3; }

  # E2: 大纲阻断判定 —— 8 组判定：长篇缺细纲(拦)/有细纲(放)、短篇缺小节大纲(拦)/无设定信号(放)、
  #     毒句式欠账门（上一章有欠账拦 / 标「去味:跳过」豁免放 / 全角冒号「去味：跳过」豁免放 /
  #     上一章含坏字节替换解码继续扫仍拦）
  local blk="$tmp/blk"
  mkdir -p "$blk/long/正文" "$blk/long/大纲" "$blk/short" "$blk/short2" \
    "$blk/long2/正文" "$blk/long2/大纲" "$blk/long3/正文" "$blk/long3/大纲"
  : > "$blk/long/大纲/细纲_第2章.md"
  : > "$blk/short/设定.md"
  : > "$blk/short2/其他.md"
  : > "$blk/long2/大纲/细纲_第2章.md"
  printf '%s\n' '# 第1章 旧' '' '声音不大，却带着一股狠劲。' > "$blk/long2/正文/第1章_旧.md"
  : > "$blk/long3/大纲/细纲_第2章.md"
  printf '%s\n' '# 第1章 旧' '<!-- 去味:跳过 -->' '声音不大，却带着一股狠劲。' > "$blk/long3/正文/第1章_旧.md"
  mkdir -p "$blk/long4/正文" "$blk/long4/大纲" "$blk/long5/正文" "$blk/long5/大纲"
  : > "$blk/long4/大纲/细纲_第2章.md"
  printf '%s\n' '# 第1章 旧' '<!-- 去味：跳过 -->' '声音不大，却带着一股狠劲。' > "$blk/long4/正文/第1章_旧.md"
  : > "$blk/long5/大纲/细纲_第2章.md"
  { printf '%s\n' '# 第1章 旧' '声音不大，却带着一股狠劲。'; printf '\xff\n'; } > "$blk/long5/正文/第1章_旧.md"

  python3 - "$CODEX" "$blk" > "$tmp/bpy.txt" <<'PY'
import importlib.util, sys
from pathlib import Path
spec = importlib.util.spec_from_file_location("ch", sys.argv[1]); m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
root = Path(sys.argv[2])
for rel in ["long/正文/第1章_起.md", "long/正文/第2章_承.md", "short/正文.md", "short2/正文.md", "long2/正文/第2章_新.md", "long3/正文/第2章_新.md", "long4/正文/第2章_新.md", "long5/正文/第2章_新.md"]:
    reason = m.prose_block_reason(root, root / rel)
    sys.stdout.buffer.write((f"{rel} :: {reason if reason else '-'}\n").encode("utf-8"))
PY
  node - "$CLAUDE_CORE" "$blk" > "$tmp/bjs.txt" <<'JS'
const path = require("node:path")
const core = require(process.argv[2])
const root = process.argv[3]
for (const rel of ["long/正文/第1章_起.md", "long/正文/第2章_承.md", "short/正文.md", "short2/正文.md", "long2/正文/第2章_新.md", "long3/正文/第2章_新.md", "long4/正文/第2章_新.md", "long5/正文/第2章_新.md"]) {
  const reason = core.proseBlockReason(root, path.join(root, rel))
  console.log(`${rel} :: ${reason || "-"}`)
}
JS
  if ! diff "$tmp/bpy.txt" "$tmp/bjs.txt" >/dev/null; then
    echo "FAIL: 大纲阻断 parity 不一致（codex python vs JS core）：" >&2
    diff "$tmp/bpy.txt" "$tmp/bjs.txt" >&2 || true
    return 3
  fi
  grep -q '第1章_起.md :: ⛔' "$tmp/bpy.txt" || { echo "FAIL: 长篇缺细纲未被拦截" >&2; return 3; }
  grep -q '第2章_承.md :: -' "$tmp/bpy.txt" || { echo "FAIL: 长篇有细纲被误拦" >&2; return 3; }
  grep -q 'short/正文.md :: ⛔' "$tmp/bpy.txt" || { echo "FAIL: 短篇缺小节大纲未被拦截" >&2; return 3; }
  grep -q 'short2/正文.md :: -' "$tmp/bpy.txt" || { echo "FAIL: 无设定信号的正文.md 被误拦" >&2; return 3; }
  grep -q '毒句式欠账' "$tmp/bpy.txt" || { echo "FAIL: 上一章毒句式欠账未被欠账门拦截" >&2; return 3; }
  grep -q 'long3/正文/第2章_新.md :: -' "$tmp/bpy.txt" || { echo "FAIL: 标「去味:跳过」豁免的上一章仍被欠账门误拦" >&2; return 3; }
  grep -q 'long4/正文/第2章_新.md :: -' "$tmp/bpy.txt" || { echo "FAIL: 全角冒号豁免标记「去味：跳过」未被欠账门认可" >&2; return 3; }
  grep -q 'long5/正文/第2章_新.md :: ⛔' "$tmp/bpy.txt" || { echo "FAIL: 上一章含坏字节时两端应替换解码继续扫（不得整体放行）" >&2; return 3; }
  return 0
}

set +e
run_functional
rc=$?
set -e
case "$rc" in
  0) echo "功能 parity：codex python 网 == opencode TS 网 == zcode JS 网（28 fixtures 逐字相等，含毒句式正反例与豁免标记）。" ;;
  2) echo "功能 parity：跳过（无 TS 运行时；规范串检查已给 CI 安全保证）。" ;;
  *) fails=$((fails + 1)) ;;
esac

set +e
run_cmd_parity
rc_cmd=$?
set -e
case "$rc_cmd" in
  0) echo "命令函数 parity：codex python == zcode JS（20 fixtures：正文抽取/apply-patch/git commit 侦测逐字相等）。" ;;
  1) echo "命令函数 parity：跳过（无 node/python3 运行时）。" ;;
  *) fails=$((fails + 1)) ;;
esac

set +e
run_claude_core_check
rc_claude=$?
set -e
case "$rc_claude" in
  0) echo "Claude 归核回归：4 个 bash hook 无内嵌 python、均经 story_hook_cli.js 调共享核（与 OpenCode/ZCode 同一份，经 B/C 锁到 codex）。" ;;
  *) fails=$((fails + 1)) ;;
esac

set +e
run_uncored_parity
rc_uncored=$?
set -e
case "$rc_uncored" in
  0) echo "未归核面 parity：codex python == JS core（staged warnings 大小写变体/文案 + 大纲阻断 8 组判定含毒句式欠账门/文案逐字相等）。" ;;
  1) echo "未归核面 parity：跳过（无 node/python3/git 运行时）。" ;;
  *) fails=$((fails + 1)) ;;
esac

if [ "$fails" -ne 0 ]; then
  echo "Prose net parity tests FAILED ($fails)." >&2
  exit 1
fi
echo "Prose net parity tests passed."
