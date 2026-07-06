#!/bin/bash
# test-ai-patterns.sh — regression tests for the deterministic AI-pattern detector.
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
if [ -z "$REPO_ROOT" ]; then
  echo "Error: not in a git repository" >&2
  exit 1
fi

SCRIPT="$REPO_ROOT/skills/story-deslop/scripts/check-ai-patterns.js"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

FIXTURE="$TMP_DIR/fixture.md"
OUT="$TMP_DIR/out.json"

cat > "$FIXTURE" <<'EOF'
---
title: 不是A，而是B
---
是不是这里不该报。
他不是冷漠，而是绝望。
她不是害怕，是累了。
他不是笨是太急。
他不是冷漠；是绝望。
它不是普通的粥！
是药。
她不是不想走，也不是不敢走。
他不是讨厌你，只是累了。
他不是走了，可是没人知道。
他不是不愿意，于是答应了。
她不是生气，倒是有点担心。
他不是哭就是闹。
这事不是真的就是假的。
这不是你的东西，是吗？
他不是傻子。是吗？
他不是傻子，是吧。
不是这样，是嘛。
```
他不是冷漠，而是绝望。
```
~~~md
他不是普通表达，而是代码示例。
~~~
EOF

set +e
node "$SCRIPT" --json "$FIXTURE" > "$OUT"
status=$?
set -e

if [ "$status" -ne 1 ]; then
  echo "FAIL: expected detector to exit 1 for positive findings, got $status" >&2
  cat "$OUT" >&2 || true
  exit 1
fi

node - "$OUT" <<'NODE'
const fs = require('fs');
const report = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const excerpts = report.findings.map((finding) => finding.excerpt);

// Genuine flips that MUST be detected: 而是 / “，是” / compact / “；是” / hard-stop + 是.
const expected = [
  '不是冷漠，而是绝望',
  '不是害怕，是累了',
  '不是笨是太急',
  '不是冷漠；是绝望',
  '不是普通的粥！ 是药',
];

// Natural prose that MUST NOT be flagged: the trailing 是 of a conjunction
// (只是/可是/于是/倒是…) after a separator is not a positive copula (issue #166
// false-positive class). “是不是”/“也不是” second-negation must also stay silent.
const forbidden = [
  '只是累了',
  '可是没人知道',
  '于是答应了',
  '倒是有点担心',
  // either-or「不是A就是B / 也是B」与句尾反问「…，是吗 / 是吧 / 是嘛」不是否定后翻转。
  '哭就是',
  '真的就是',
  '是吗',
  '是吧',
  '是嘛',
];

if (report.findings.length !== expected.length) {
  throw new Error(`expected ${expected.length} findings, got ${report.findings.length}: ${JSON.stringify(excerpts)}`);
}

for (const excerpt of expected) {
  if (!excerpts.includes(excerpt)) {
    throw new Error(`missing expected excerpt: ${excerpt}; got ${JSON.stringify(excerpts)}`);
  }
}

for (const marker of forbidden) {
  if (excerpts.some((excerpt) => excerpt.includes(marker))) {
    throw new Error(`false positive: conjunction "${marker}" was flagged; got ${JSON.stringify(excerpts)}`);
  }
}
NODE

echo "AI pattern detector regression tests passed."

# --- 段落级检测：碎句号 / 长段落 / 破折号（issue #188） ---
FIXTURE2="$TMP_DIR/fixture-prose.md"
LONG_PARA="他沿着长廊一直往里走，"
i=0
while [ "$i" -lt 16 ]; do
  LONG_PARA="${LONG_PARA}走过一道又一道紧闭的木门，"
  i=$((i + 1))
done
LONG_PARA="${LONG_PARA}终于在尽头停下，盯着那点暗红看了很久。"
{
  # 6 句连续短叙述句 → 碎句号
  printf '%s\n' '他站起来。' '他走过去。' '门开了。' '风进来。' '他停住。' '心一沉。'
  # 6 句对话短句 → 必须不报碎句号（成片短句是对话/弹幕的正常形态）
  printf '%s\n' '“这真的没问题。”' '“一点也不难。”' '“我信你。”' '“你别紧张。”' '“好。”' '“嗯。”'
  # 破折号 → em-dash（按功能改写，不机械替换）
  printf '%s\n' '她借着月光看清了桌上那张纸的边角——那是一张旧纸。'
  # 单段超长 → long-paragraph
  printf '%s\n' "$LONG_PARA"
} > "$FIXTURE2"

set +e
node "$SCRIPT" --json "$FIXTURE2" > "$OUT"
status=$?
set -e
if [ "$status" -ne 1 ]; then
  echo "FAIL: expected prose detector to exit 1 for positive findings, got $status" >&2
  cat "$OUT" >&2 || true
  exit 1
fi

node - "$OUT" <<'NODE'
const fs = require('fs');
const report = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const counts = report.findings.reduce((m, f) => ((m[f.type] = (m[f.type] || 0) + 1), m), {});

// Exactly one of each new prose type, nothing else. The 6 dialogue lines must NOT
// trip 碎句号 (成片短句是对话/弹幕的正常形态 — only narrative runs count).
if (report.findings.length !== 3) {
  throw new Error(`expected 3 prose findings, got ${report.findings.length}: ${JSON.stringify(report.findings.map((f) => `${f.type}@${f.line}`))}`);
}
for (const type of ['period-stutter', 'em-dash', 'long-paragraph']) {
  if (counts[type] !== 1) throw new Error(`expected exactly 1 ${type}, got ${counts[type] || 0}`);
}
// 碎句号 must flag the narrative block (line 1), not the dialogue cluster (lines 7-12).
const stutter = report.findings.find((f) => f.type === 'period-stutter');
if (stutter.line !== 1) {
  throw new Error(`period-stutter should start at the narrative block (line 1), got line ${stutter.line}`);
}
NODE

# --- MEDIUM-1：碎句号混合行（叙述 + 引号内物件）不能被一个引号整行豁免（#188 review） ---
FIXTURE3="$TMP_DIR/fixture-mixed-quote.md"
printf '%s\n' '他站起。他看见“门”。风进来。他回头。灯灭了。心一沉。' > "$FIXTURE3"
set +e
node "$SCRIPT" --json "$FIXTURE3" > "$OUT"
set -e
node - "$OUT" <<'NODE'
const fs = require('fs');
const r = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const st = r.findings.filter((f) => f.type === 'period-stutter');
if (st.length !== 1) throw new Error('混合引号叙述应命中碎句号: ' + JSON.stringify(r.findings.map((f) => f.type)));
if (st[0].severity !== 'advisory') throw new Error('period-stutter 应为 advisory');
NODE

# 纯对话成片短句仍豁免（体裁手法）。
FIXTURE4="$TMP_DIR/fixture-pure-dialogue.md"
printf '%s\n' '“走。”' '“快。”' '“跑。”' '“停。”' '“看。”' '“听。”' > "$FIXTURE4"
set +e
pure_out="$(node "$SCRIPT" "$FIXTURE4" 2>&1)"
pure_status=$?
set -e
if [ "$pure_status" -ne 0 ]; then
  echo "FAIL: 纯对话成片短句被误判碎句号 (exit $pure_status):" >&2
  echo "$pure_out" >&2
  exit 1
fi

# --- markdown 结构行不算长段落（#188 review 新发现）---
FIXTURE5="$TMP_DIR/fixture-heading.md"
node -e 'process.stdout.write("## " + "长".repeat(230) + "\n")' > "$FIXTURE5"
set +e
head_out="$(node "$SCRIPT" "$FIXTURE5" 2>&1)"
head_status=$?
set -e
if [ "$head_status" -ne 0 ]; then
  echo "FAIL: markdown 标题被误判 long-paragraph (exit $head_status):" >&2
  echo "$head_out" >&2
  exit 1
fi

# --- severity 字段 + --fail-on 语义：仅 advisory（long-paragraph）时默认退出 1，blocking 模式退出 0 ---
FIXTURE6="$TMP_DIR/fixture-advisory.md"
node -e 'process.stdout.write("他沿着长廊一直往里走，" + "走过一道又一道紧闭的木门，".repeat(16) + "终于在尽头停下。\n")' > "$FIXTURE6"
set +e
node "$SCRIPT" --json "$FIXTURE6" > "$OUT"
adv_all=$?
node "$SCRIPT" --fail-on=blocking "$FIXTURE6" >/dev/null 2>&1
adv_blk=$?
set -e
node - "$OUT" <<'NODE'
const fs = require('fs');
const r = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (!r.findings.length) throw new Error('expected long-paragraph finding');
if (!r.findings.every((f) => f.severity === 'advisory')) {
  throw new Error('long-paragraph-only fixture 应全为 advisory: ' + JSON.stringify(r.findings.map((f) => f.severity)));
}
NODE
[ "$adv_all" -eq 1 ] || { echo "FAIL: advisory-only 默认 --fail-on=all 应退出 1，实际 $adv_all" >&2; exit 1; }
[ "$adv_blk" -eq 0 ] || { echo "FAIL: advisory-only --fail-on=blocking 应退出 0，实际 $adv_blk" >&2; exit 1; }

# blocking（em-dash）：severity=blocking，--fail-on=blocking 退出 1。
FIXTURE7="$TMP_DIR/fixture-blocking.md"
printf '%s\n' '她停住——没说话。' > "$FIXTURE7"
set +e
node "$SCRIPT" --json "$FIXTURE7" > "$OUT"
node "$SCRIPT" --fail-on=blocking "$FIXTURE7" >/dev/null 2>&1
blk_blk=$?
set -e
node - "$OUT" <<'NODE'
const fs = require('fs');
const r = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const dash = r.findings.find((f) => f.type === 'em-dash');
if (!dash || dash.severity !== 'blocking') throw new Error('em-dash 应为 blocking: ' + JSON.stringify(dash));
NODE
[ "$blk_blk" -eq 1 ] || { echo "FAIL: em-dash --fail-on=blocking 应退出 1，实际 $blk_blk" >&2; exit 1; }

echo "Prose pattern (碎句号/长段落/破折号) regression tests passed."

# --- issue #205：跨空行的「不是A。/（空行）/是B」揭示句必须命中（旧 skipGap 只吞一个换行会漏）---
FIXTURE8="$TMP_DIR/fixture-cross-para.md"
printf '%s\n' '中年男人消失了。' '' '不是被拖走。' '' '是整个人像被橡皮擦抹掉，全没了。' > "$FIXTURE8"
set +e
node "$SCRIPT" --json "$FIXTURE8" > "$OUT"
set -e
node - "$OUT" <<'NODE'
const fs = require('fs');
const r = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const ni = r.findings.filter((f) => f.type === 'not-is-comparison');
if (ni.length !== 1) throw new Error('跨空行 不是A。/是B 应命中 1 处 not-is: ' + JSON.stringify(r.findings.map((f) => `${f.type}@${f.line}`)));
if (ni[0].line !== 3) throw new Error('not-is 应定位到「不是」所在行 3，实际 ' + ni[0].line);
if (ni[0].severity !== 'blocking') throw new Error('not-is 应为 blocking');
NODE

# 引号内台词「不是A，是B」是口语辩解，不算叙述层 AI 对比句式（与碎句号一致豁免引号内容）。
FIXTURE9="$TMP_DIR/fixture-dialogue-notis.md"
printf '%s\n' '“你们看见了啊，不是我要闹，是物业非法限制人身自由。”' > "$FIXTURE9"
set +e
dlg_out="$(node "$SCRIPT" "$FIXTURE9" 2>&1)"
dlg_status=$?
set -e
if [ "$dlg_status" -ne 0 ]; then
  echo "FAIL: 引号内台词 不是A，是B 被误判 not-is (exit $dlg_status):" >&2
  echo "$dlg_out" >&2
  exit 1
fi

# 引号外叙述的翻转句仍必须命中（豁免只针对引号内，别把整行叙述放过）。
FIXTURE10="$TMP_DIR/fixture-narration-notis.md"
printf '%s\n' '他冷笑一声。这不是巧合，是有人安排的。' > "$FIXTURE10"
set +e
node "$SCRIPT" --json "$FIXTURE10" > "$OUT"
set -e
node - "$OUT" <<'NODE'
const fs = require('fs');
const r = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const ni = r.findings.filter((f) => f.type === 'not-is-comparison');
if (ni.length !== 1) throw new Error('引号外叙述翻转句应命中 1 处 not-is: ' + JSON.stringify(r.findings.map((f) => f.type)));
NODE

echo "issue #205 (跨空行翻转命中 / 引号内台词豁免) regression tests passed."

# --- issue #205：微动作复读（「了下/了一下」式轻量补语高密度=电报体指纹）---
FIXTURE11="$TMP_DIR/fixture-micro-tic.md"
printf '%s\n' \
  '父亲的手停了一下。绳在铁环上松了半圈。' \
  '他把绳拉紧，在秆子上勒了一道印。' \
  '他拍了两下，手背上沾了叶子。' \
  '母亲切了一阵，停了。锅铲刮了一下锅底。' \
  '他把线头绕了一下，又攥了一下石头。' > "$FIXTURE11"
set +e
node "$SCRIPT" --json "$FIXTURE11" > "$OUT"
set -e
node - "$OUT" <<'NODE'
const fs = require('fs');
const r = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const mt = r.findings.filter((f) => f.type === 'micro-action-tic');
if (mt.length !== 1) throw new Error('高密度「了下/了一下」应报 1 处 micro-action-tic: ' + JSON.stringify(r.findings.map((f) => f.type)));
if (mt[0].severity !== 'advisory') throw new Error('micro-action-tic 应为 advisory');
NODE

# advisory 不触发 --fail-on=blocking（微动作复读是提示，不阻塞收尾流程）。
set +e
node "$SCRIPT" --fail-on=blocking "$FIXTURE11" > /dev/null 2>&1
tic_blk=$?
set -e
[ "$tic_blk" -eq 0 ] || { echo "FAIL: micro-action-tic --fail-on=blocking 应退出 0，实际 $tic_blk" >&2; exit 1; }

# 低密度（正常中文里偶尔一个「了一下/了一眼」）不报；引号内台词的「了下/了一下」不计入。
FIXTURE12="$TMP_DIR/fixture-micro-tic-normal.md"
printf '%s\n' \
  '他回到家的时候，父亲正在院子里绑架子车上的绳子，车斗里堆着几捆刚掰下来的玉米秆。' \
  '他说要去北京谈观测站的事，父亲的手停了一下，然后把绳子重新拉紧，没有接话。' \
  '“你等我一下，我去把鸡圈门修完了一下午也就过去了。”父亲蹲在鸡圈边上，头也没抬。' \
  '傍晚收拾行李的时候，他把断渠捡回来的那块石头看了一眼，装进了外套口袋里。' \
  '母亲在厨房里切菜，刀落在案板上的声音比平时快了不少，他站在门口听了一会儿才进去。' > "$FIXTURE12"
set +e
node "$SCRIPT" --json "$FIXTURE12" > "$OUT"
set -e
node - "$OUT" <<'NODE'
const fs = require('fs');
const r = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const mt = r.findings.filter((f) => f.type === 'micro-action-tic');
if (mt.length !== 0) throw new Error('低密度/引号内「了下/了一下」不应报 micro-action-tic: ' + JSON.stringify(mt));
NODE

# issue #205 三轮：省略「一/两」的短尾巴（了下/了眼/了声）也是电报体反向指纹；
# PR 文档不能推荐一个 detector 抓不到、反复复用后又会被朱雀判机械的替换模板。
FIXTURE13="$TMP_DIR/fixture-micro-tic-short-tail.md"
printf '%s\n' \
  '他扯了下嘴角，没接那句话。母亲把碗推过去，他看了眼，又挪开。' \
  '院门响了声，父亲停了下，手里的绳子绕了圈，重新压住秆子。' \
  '她扫了眼桌上的信封，笑了声，指尖在信纸边缘顿了下。' \
  '屋里静了会，锅盖颤了下，水汽贴着墙慢慢往上爬。' > "$FIXTURE13"
set +e
node "$SCRIPT" --json "$FIXTURE13" > "$OUT"
set -e
node - "$OUT" <<'NODE'
const fs = require('fs');
const r = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const mt = r.findings.filter((f) => f.type === 'micro-action-tic');
if (mt.length !== 1) throw new Error('省略量词的「了下/了眼/了声」高密度也应报 micro-action-tic: ' + JSON.stringify(r.findings));
if (!mt[0].excerpt.includes('了下') || !mt[0].excerpt.includes('了眼')) {
  throw new Error('micro-action-tic excerpt 应包含短尾巴样本: ' + JSON.stringify(mt[0]));
}
NODE

echo "micro-action-tic (电报体微动作复读) regression tests passed."

# --- issue #205：抽象总结复读（命运/棋局/这一刻终于明白/才刚刚开始）---
FIXTURE14="$TMP_DIR/fixture-abstract-summary.md"
printf '%s\n' \
  '从这一刻开始，所有安排都被推到台前。' \
  '命运像早已布好的棋局，把他推向那扇门。' \
  '他生出前所未有的决意。' \
  '属于他的反击，才刚刚开始。' > "$FIXTURE14"
set +e
node "$SCRIPT" --json "$FIXTURE14" > "$OUT"
set -e
node - "$OUT" <<'NODE'
const fs = require('fs');
const r = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const ast = r.findings.filter((f) => f.type === 'abstract-summary-tic');
if (ast.length !== 1) throw new Error('高密度抽象总结应报 1 处 abstract-summary-tic: ' + JSON.stringify(r.findings));
if (ast[0].severity !== 'advisory') throw new Error('abstract-summary-tic 应为 advisory');
if (!ast[0].excerpt.includes('从这一刻开始') || !ast[0].excerpt.includes('才刚刚开始')) {
  throw new Error('abstract-summary-tic excerpt 应包含总结腔样本: ' + JSON.stringify(ast[0]));
}
NODE

# advisory 不触发 --fail-on=blocking；低密度题材词与引号内台词/引用不报。
set +e
node "$SCRIPT" --fail-on=blocking "$FIXTURE14" > /dev/null 2>&1
ast_blk=$?
set -e
[ "$ast_blk" -eq 0 ] || { echo "FAIL: abstract-summary-tic --fail-on=blocking 应退出 0，实际 $ast_blk" >&2; exit 1; }

FIXTURE15="$TMP_DIR/fixture-abstract-summary-normal.md"
printf '%s\n' \
  '她把旧棋盘从柜子里搬出来，棋子少了两枚，只能用纽扣代替。' \
  '父亲说：“从这一刻开始，你要自己记账。”她点点头，把账本翻到空白页。' \
  '院外的雨停了，屋檐还在滴水，她先把潮掉的纸拿到窗边晾开。' > "$FIXTURE15"
set +e
node "$SCRIPT" --json "$FIXTURE15" > "$OUT"
set -e
node - "$OUT" <<'NODE'
const fs = require('fs');
const r = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const ast = r.findings.filter((f) => f.type === 'abstract-summary-tic');
if (ast.length !== 0) throw new Error('低密度/引号内抽象总结词不应报 abstract-summary-tic: ' + JSON.stringify(ast));
NODE

echo "abstract-summary-tic (抽象总结复读) regression tests passed."
