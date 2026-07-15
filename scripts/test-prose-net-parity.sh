#!/bin/bash
# test-prose-net-parity.sh — 正文兜底「轻量确定性网」四端 parity 守卫
# 网在四处各有实现：① Claude check-prose-after-write.sh 内嵌 python；② Codex
# story_codex_hook.py；③ OpenCode plugin.ts；④ ZCode story_zcode_hook.js。
# （③④ 的纯逻辑现共用各自的 story_hook_core.js companion，字节一致。）
# 四份必须同检同放。本测试四层保证：
#   A. 规范串一致（CI 安全、零运行时依赖）：每条 net 正则/常量/阈值的规范文本必须在四份里都出现，
#      改一处漏改另一处即 fail——直接锚定漂移（参照 check-hook-regex-sync.sh 的做法）。
#   B. 功能 parity（best-effort，无 TS 运行时则自跳过）：codex python 网、opencode TS 网、
#      zcode JS 网在同一组 fixture 上逐字相等。
#   C. 命令函数 parity（CI 硬保证）：正文目标抽取、apply-patch 目标、git commit 侦测三个纯函数
#      在 codex python 与 zcode JS 间逐字相等——锁住此前无守卫、已漂移的手抄逻辑。
#   D. Claude 内嵌 python parity（CI 硬保证）：把 Claude bash hook 里的 heredoc python 抽出来，
#      is_git_commit_command / prose_net_findings / 字数欠账 / 跨批连续性 与 codex python 逐字相等
#      ——此前唯一没被 functional 跑过的那份手抄（含三重重复的 git commit tokenizer）。codex 已由
#      B/C 锁到 zcode/opencode，故 claude==codex 即四端闭环。
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
[ -z "$ROOT" ] && { echo "Error: not in a git repository" >&2; exit 1; }

CLAUDE="$ROOT/skills/story-setup/references/templates/hooks/check-prose-after-write.sh"
CODEX="$ROOT/skills/story-setup/references/codex/hooks/story_codex_hook.py"
OPENCODE="$ROOT/skills/story-setup/references/opencode/plugin.ts"
ZCODE="$ROOT/skills/story-setup/references/zcode/hooks/story_zcode_hook.js"
ZCODE_CORE="$ROOT/skills/story-setup/references/zcode/hooks/story_hook_core.js"
OPENCODE_CORE="$ROOT/skills/story-setup/references/opencode/story_hook_core.js"
CLAUDE_COMMIT="$ROOT/skills/story-setup/references/templates/hooks/validate-story-commit.sh"
CLAUDE_GAPS="$ROOT/skills/story-setup/references/templates/hooks/detect-story-gaps.sh"
for f in "$CLAUDE" "$CODEX" "$OPENCODE" "$ZCODE" "$ZCODE_CORE" "$OPENCODE_CORE" "$CLAUDE_COMMIT" "$CLAUDE_GAPS"; do
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

# ── D. Claude 内嵌 python parity（claude-embedded vs codex python），CI 硬保证 ─────────
# Claude 的 hook 是 bash 内嵌 heredoc python：validate-story-commit.sh 的 is_git_commit_command
# （~93 行 tokenizer）、check-prose-after-write.sh 的 prose_net_findings + 字数欠账。这三处此前
# 只被 Part A 规范串锚定、无 functional 守卫，是三份手抄里唯一没被跑过的一份（已知 is_git_commit
# 三重重复）。这里把 heredoc python 抽出来当模块跑，与 codex 同实现逐字比对。codex 本身已被
# Part B/C 锁到 zcode/opencode，故 claude==codex 即闭环。纯 python（CI 全平台都有），故为硬门。
# 跨批连续性（detect-story-gaps.sh 的 continuity heredoc）也纳入：staleness 用固定 mtime
# 制造，与 codex continuity_findings 逐字比对（此前 Claude 用 [WARN]、句尾不同，已统一到 codex）。
run_claude_parity() {
  command -v python3 >/dev/null 2>&1 || return 1
  python3 - "$CODEX" "$CLAUDE_COMMIT" "$CLAUDE" "$CLAUDE_GAPS" <<'PY'
import importlib.util, sys, os, subprocess, tempfile
from pathlib import Path

codex_path, commit_sh, net_sh, gaps_sh = sys.argv[1:5]
spec = importlib.util.spec_from_file_location("ch", codex_path); cx = importlib.util.module_from_spec(spec); spec.loader.exec_module(cx)

def extract_py_block(path, must_contain):
    # Pull the heredoc python body out of a bash hook. The opener line may carry trailing
    # redirections (e.g. `<<'PY' 2>/dev/null || true`), so slice after the opener's newline.
    src = open(path, encoding="utf-8").read()
    for chunk in src.split("<<'PY'")[1:]:
        after = chunk.split("\n", 1)[1] if "\n" in chunk else ""
        body = after.split("\nPY\n", 1)[0]
        if must_contain in body:
            return body
    raise SystemExit(f"parity: no heredoc PY block containing {must_contain!r} in {path}")

tmp = tempfile.mkdtemp()
commit_py = os.path.join(tmp, "claude_commit.py"); open(commit_py, "w", encoding="utf-8").write(extract_py_block(commit_sh, "punctuation_chars"))
net_py = os.path.join(tmp, "claude_net.py"); open(net_py, "w", encoding="utf-8").write(extract_py_block(net_sh, "def prose_net_findings"))
cont_py = os.path.join(tmp, "claude_cont.py"); open(cont_py, "w", encoding="utf-8").write(extract_py_block(gaps_sh, "def discover_books"))

CMDS = {
    "commit_plain": "git commit -m x", "commit_chain": "git add . && git commit -m x",
    "commit_if": "if true; then git commit -m x; fi", "commit_for": "for f in *; do git commit -am x; done",
    "commit_subshell": "(cd sub && git commit)", "commit_env": "FOO=1 git commit",
    "commit_config": "git -c user.name=x commit", "commit_C": "git -C sub commit -m y",
    "commit_env_prog": "env GIT_DIR=x git commit", "noncommit_echo": "echo git commit docs",
    "noncommit_status": "git status && echo done", "mention": "grep -n 正文/第1章.md notes.md",
    "redirect": "echo x > 正文/第1章.md",
}
NETS = {
    "clean": "江晨睁开眼天还没亮。\n他要快要狠要赢这是唯一的活路。\n「作为AI管家，我劝你别白费力气。」\n他握紧拳头走向门口。",
    "truncate": "江晨握紧拳头慢慢走向门口。\n江晨冲过去一拳砸在",
    "refuse": "夜色压下来。\n作为AI我无法继续创作这部分内容。",
    "engword": "街灯一盏盏亮起。\n按照本章细纲的情节点他该出场了。",
    "repeat": "他握紧拳头一步步走过去缓缓逼近。\n他握紧拳头一步步走过去缓缓逼近。\n他终于停下了。",
    "placeholder": "他打开门。\n（此处省略三百字打斗描写）他赢了。",
    "english_ai": "他说。\nI cannot continue writing this scene for you.",
    "parallel": "要么生，要么死。\n要么战，要么逃。\n要么赢，要么输。\n他做出了选择。",
    "danmaku": "前方高能！\n前方高能！预警。\n这一段我哭了。\n作者加更！",
}

codex_lines, claude_lines = [], []

# is_git_commit_command: exit 0 == is-commit
for k in sorted(CMDS):
    cmd = CMDS[k]
    codex_lines.append(f"commit[{k}]={1 if cx.is_git_commit_command(cmd) else 0}")
    r = subprocess.run([sys.executable, commit_py], env={**os.environ, "STORY_COMMIT_COMMAND": cmd, "HOOK_INPUT": ""}, capture_output=True)
    claude_lines.append(f"commit[{k}]={1 if r.returncode == 0 else 0}")

# prose_net_findings: HD2 argv (abs, base, parent); no 大纲 => wordcount stays silent
body_dir = os.path.join(tmp, "nb", "正文"); os.makedirs(body_dir, exist_ok=True)
for k in sorted(NETS):
    text = NETS[k]
    codex_lines.append(f"net[{k}]=" + " ;; ".join(cx.prose_net_findings(text)))
    f = os.path.join(body_dir, "第7章.md"); open(f, "w", encoding="utf-8").write(text)
    r = subprocess.run([sys.executable, net_py, f, "第7章.md", "正文"], capture_output=True)
    claude_lines.append(f"net[{k}]=" + r.stdout.decode("utf-8").replace("\n", " ;; "))

# 字数欠账: 细纲 has 字数目标, short body triggers the <90% notice
wb = os.path.join(tmp, "wc"); os.makedirs(os.path.join(wb, "大纲")); os.makedirs(os.path.join(wb, "正文"))
open(os.path.join(wb, "大纲", "细纲_第1章.md"), "w", encoding="utf-8").write("字数目标：1000\n")
short = "他缓缓走过去然后停下了。\n江风吹过安静的码头夜色。\n他终于松开了拳头。"
cf = os.path.join(wb, "正文", "第1章.md"); open(cf, "w", encoding="utf-8").write(short)
wc = cx._wordcount_finding(Path(cf), short)
codex_lines.append("wc=" + " ;; ".join(list(cx.prose_net_findings(short)) + ([wc] if wc else [])))
r = subprocess.run([sys.executable, net_py, cf, "第1章.md", "正文"], capture_output=True)
claude_lines.append("wc=" + r.stdout.decode("utf-8").replace("\n", " ;; "))

# 跨批连续性: 固定 mtime 制造 staleness（章新于上下文）+ 撞名，与 codex continuity_findings 比对
cont_root = os.path.join(tmp, "cont"); book = os.path.join(cont_root, "书")
os.makedirs(os.path.join(book, "正文")); os.makedirs(os.path.join(book, "追踪"))
open(os.path.join(book, "追踪", "上下文.md"), "w", encoding="utf-8").write("ctx\n")
for ch in ("第1章_甲.md", "第2章_甲.md"):
    open(os.path.join(book, "正文", ch), "w", encoding="utf-8").write("x\n")
os.utime(os.path.join(book, "追踪", "上下文.md"), (1000000000, 1000000000))
os.utime(os.path.join(book, "正文", "第1章_甲.md"), (2000000000, 2000000000))
os.utime(os.path.join(book, "正文", "第2章_甲.md"), (2000000001, 2000000001))  # unambiguously newest
codex_lines.append("cont=" + " ;; ".join(cx.continuity_findings(Path(cont_root))))
r = subprocess.run([sys.executable, cont_py, cont_root], capture_output=True)
claude_cont = [ln for ln in r.stdout.decode("utf-8").split("\n") if ln.startswith("[continuity]")]
claude_lines.append("cont=" + " ;; ".join(claude_cont))

if codex_lines != claude_lines:
    sys.stderr.write("FAIL: Claude 内嵌 python 与 codex python 漂移：\n")
    for a, b in zip(codex_lines, claude_lines):
        if a != b:
            sys.stderr.write(f"  codex : {a}\n  claude: {b}\n")
    sys.exit(3)
PY
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
run_claude_parity
rc_claude=$?
set -e
case "$rc_claude" in
  0) echo "Claude 内嵌 python parity：claude-embedded == codex python（is_git_commit_command 13 + prose_net 9 + 字数欠账 + 跨批连续性，逐字相等）。" ;;
  1) echo "Claude 内嵌 python parity：跳过（无 python3 运行时）。" ;;
  *) fails=$((fails + 1)) ;;
esac

if [ "$fails" -ne 0 ]; then
  echo "Prose net parity tests FAILED ($fails)." >&2
  exit 1
fi
echo "Prose net parity tests passed."
