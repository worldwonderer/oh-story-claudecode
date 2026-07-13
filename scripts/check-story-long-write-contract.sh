#!/bin/bash
# check-story-long-write-contract.sh — static checks for story-long-write reader contract/progression docs
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SKILL_DIR="$REPO_ROOT/skills/story-long-write"
REF_DIR="$SKILL_DIR/references"
CANON="$REF_DIR/reader-contract-and-progression.md"
SKILL="$SKILL_DIR/SKILL.md"
ARTIFACT="$REF_DIR/artifact-protocols.md"
DAILY="$REF_DIR/workflow-daily.md"
QUALITY="$REF_DIR/quality-checklist.md"
EMOTIONAL="$REF_DIR/emotional-methods.md"
PLOT="$REF_DIR/plot-core-methods.md"
CONSUMERS=("$SKILL" "$ARTIFACT" "$DAILY" "$QUALITY")
FEATURE_FILES=("$CANON" "${CONSUMERS[@]}")

fail() { echo "FAIL: $*" >&2; exit 1; }
assert_file() { [ -f "$1" ] || fail "required file missing: $1"; }
assert_grep() {
  local pattern="$1" file="$2" message="$3"
  grep -Eq "$pattern" "$file" || fail "$message ($file)"
}
assert_no_grep() {
  local pattern="$1" file="$2" message="$3"
  if grep -Eq "$pattern" "$file"; then fail "$message ($file)"; fi
}

for file in "$CANON" "$SKILL" "$ARTIFACT" "$DAILY" "$QUALITY" "$PLOT" "$EMOTIONAL"; do
  assert_file "$file"
done

for term in \
  '读者契约' '主角代理权' '利益安全' '兑现归属' '期待债' '终局储备' \
  '终局底牌' '升级台阶' '主推线' '升级线' '战果' '一战多得' '梯队' '透支' \
  '启发式' '行动成本' '成功税' '题材边界' '旁观者' '制度/势力范围' \
  '合理化债务' 'contract-safe' 'needs-justification' 'contract-break' \
  '授权社区样本' '问题帖' '非统计共识' '来源站点隐私数据|访问凭证|cookies|tokens|请求签名|私有标识符' \
  '核心资产' '可见交换' '国家合作|政府合作|state-cooperation' '主角不可替代'; do
  assert_grep "$term" "$CANON" "canonical reference missing required term: $term"
done

# Progression model: one breakthrough axis + free spoils (一战多得 allowed); macro 终局底牌/升级台阶 reserve replaces the old freeze rule.
for file in "$CANON" "$SKILL" "$ARTIFACT" "$DAILY" "$QUALITY" "$EMOTIONAL"; do
  assert_no_grep '成长预算|冻结成长轴|默认选择?1个主成长轴|至多1个次成长轴|突破轴|断粮' "$file" \
    "superseded progression term remains (use 主推线/升级线 and 透支)"
done
for file in "$CANON" "$SKILL" "$ARTIFACT"; do
  assert_grep '主推线' "$file" "file missing main-push line (主推线) progression rule"
done
assert_grep '一战多得' "$CANON" "canonical must explicitly allow 一战多得 (multi-gain per battle is good design)"
assert_grep '终局底牌' "$CANON" "canonical missing 终局底牌 macro reserve"
assert_grep '升级台阶' "$CANON" "canonical missing 升级台阶 (system rungs) check"
assert_grep '梯队' "$CANON" "canonical missing 梯队 (tiered unlock) rule"
assert_grep '透支' "$CANON" "canonical missing 透支 (over-spend) warning framing"
# 终局底牌/升级台阶 lives folded inside 设定/题材定位.md, not a separate file.
assert_grep '终局底牌与升级台阶' "$ARTIFACT" "artifact must fold 终局底牌/升级台阶 into 题材定位 template"
assert_no_grep '设定/终局底牌\.md|终局底牌\.md' "$ARTIFACT" "终局底牌 must not be a separate file"
assert_no_grep '设定/终局底牌\.md|终局底牌\.md' "$SKILL" "终局底牌 must not be a separate file"
assert_grep '终局底牌' "$QUALITY" "quality checklist missing 终局底牌 reserve review"
assert_grep '一战多得' "$QUALITY" "quality checklist must affirm 一战多得 is good design, not overspeed"

# All four workflow consumers must point to the canonical reference; the contract exposes all three risks.
for file in "${CONSUMERS[@]}"; do
  assert_grep 'reader-contract-and-progression\.md' "$file" \
    "consumer must reference canonical reader contract/progression reference"
done
for risk in 'contract-safe' 'needs-justification' 'contract-break'; do
  assert_grep "$risk" "$CANON" "canonical reference missing risk level $risk"
  assert_grep "$risk" "$SKILL" "SKILL.md must consume risk level $risk"
  assert_grep "$risk" "$QUALITY" "quality checklist must review risk level $risk"
done

assert_grep '大纲安全七检' "$SKILL" "SKILL.md must use the seven-check outline safety name"
assert_no_grep '大纲五检' "$SKILL" "legacy five-check outline safety name remains"

# Compact repeated loop card lives inside the volume outline; no separate loop artifacts.
assert_grep '正式情节循环卡（1[–—-]3 万字为可调启发式；存于卷纲内；不另建单独循环文件）' "$ARTIFACT" \
  "artifact protocol missing compact in-volume loop-card declaration"
for field in \
  '循环ID' '章节范围' '循环节拍/章功能分配' '循环承诺' '卷级贡献' '主角局部目标与核心利益' '因果入口' \
  '核心阻碍' '关键选择与决定性行动' '兑现方式与归属' \
  '本循环主推线/战果' '终局底牌边界' '禁止提前释放' '下一循环因果钩子'; do
  assert_grep "^- ${field}：" "$ARTIFACT" "compact loop card missing field: $field"
done
assert_no_grep '大纲/循环[^`[:space:]]*\.md|追踪/循环[^`[:space:]]*\.md|loop[-_ ]?(card|tracker).*\.md' "$ARTIFACT" \
  "artifact protocol must not define separate loop files"
assert_grep '旧字段|legacy|兼容' "$ARTIFACT" \
  "artifact templates must preserve legacy chapter-outline compatibility wording"
assert_no_grep '^## 爽点节奏$' "$ARTIFACT" \
  "legacy standalone gratification-rhythm section remains"
# The 爽点节奏 volume-outline table was replaced by 正式情节循环; no stale references may list it as a 卷纲 component.
assert_no_grep '爽点节奏' "$ARTIFACT" \
  "stale 爽点节奏 reference remains in artifact protocol (replaced by 正式情节循环)"
assert_no_grep '爽点节奏' "$SKILL" \
  "stale 爽点节奏 reference remains in SKILL (replaced by 正式情节循环)"
assert_grep '旧版卷纲缺少卷契约/循环卡不阻塞日更' "$DAILY" \
  "daily workflow must preserve legacy volume-outline compatibility"
assert_grep '内存推断.*追踪/上下文\.md' "$DAILY" \
  "legacy volume-outline fallback must infer in memory and record context"
assert_grep '仅在明确补纲/改纲时回写卷纲.*未知字段写.*\[待补充\].*绝不自动修改已锁定卷纲' "$DAILY" \
  "legacy volume-outline fallback must restrict writeback and protect locked outlines"
assert_no_grep '\| 5 \| `大纲/卷纲_第X卷\.md` \|[^\n]*缺失时从大纲/细纲临时归纳并回填' "$DAILY" \
  "manual-load table must not unconditionally write inferred legacy volume data back"
assert_grep '\| 5 \| `大纲/卷纲_第X卷\.md` \|[^\n]*旧版缺卷契约/循环卡不阻塞[^\n]*内存推断并记入 `追踪/上下文\.md`[^\n]*仅本轮明确补纲/改纲时回写[^\n]*\[待补充\][^\n]*锁定卷纲绝不自动修改' "$DAILY" \
  "manual-load table must use conditional legacy volume-outline writeback"
assert_no_grep '没有明确阶段总览时[^。\n]*本批写后回填到大纲/卷纲' "$DAILY" \
  "stage-summary fallback must not unconditionally write inferred data back"
assert_grep '没有明确阶段总览时[^。\n]*仅为本轮[^；\n]*临时归纳；本轮明确补纲/改纲时才回写，否则记入 `追踪/上下文\.md`；锁定大纲/卷纲绝不自动修改' "$DAILY" \
  "stage-summary fallback must keep inference in context unless outline editing is explicit"

# Chapter contract uses one exact cost/ownership field; cost is optional and never invented.
for file in "$SKILL" "$ARTIFACT"; do
  assert_grep '行动成本（可无）/收益归属' "$file" \
    "chapter template missing exact optional cost/benefit ownership field"
  assert_no_grep '代价兑现[[:space:]]*/[[:space:]]*收益兑现|可选行动成本|兑现归属：' "$file" \
    "old or duplicate chapter cost/ownership field remains"
done
assert_grep '行动成本可无，不为征税硬造代价' "$DAILY" \
  "daily workflow must state that cost is optional and never invented"
assert_grep '行动成本（可无）/收益归属' "$DAILY" \
  "daily workflow must consume the exact chapter cost/ownership field"

assert_grep '卷契约.*当前循环.*章节细纲' "$DAILY" \
  "daily workflow must define writing-plan authority order"
assert_grep '主角代理权' "$DAILY" "daily intention confirmation must consume protagonist agency"
assert_grep '终局底牌边界' "$DAILY" "daily intention confirmation must consume 终局底牌 boundary"
assert_grep 'protagonist_agency_risk' "$DAILY" "daily workflow must mark protagonist agency risk"
assert_grep '计划节拍' "$DAILY" "daily workflow must use Chinese plan-beat wording"
assert_grep '漂移.*(aligned|adaptive|structural)|aligned\|adaptive\|structural' "$DAILY" \
  "daily workflow must include drift enum"
assert_grep 'structural.*漂移|结构性漂移' "$DAILY" \
  "daily workflow must require structural drift repair/replan"
assert_no_grep '追踪/循环追踪\.md|追踪/记忆包\.md|loop-tracker\.md|memory-pack\.md' "$DAILY" \
  "daily workflow must not create new tracker paths"

assert_grep '无毒不等于好看' "$QUALITY" "quality checklist missing bidirectional review warning"
assert_grep '契约.*代理权.*期待.*终局|代理权.*期待.*终局' "$QUALITY" \
  "quality checklist missing contract/agency/expectation/reserve review"
assert_no_grep '必须设计假胜|章末200字必须|局部胜利必须' "$PLOT" \
  "plot-core-methods still contains universal climax/suspense/cost wording"

# Third-round generalized positive emotion-causality engine.
assert_grep '^- 循环情绪引擎：' "$ARTIFACT" "loop card missing the single emotional-engine field"
[ "$(grep -Ec '^- 循环情绪引擎：' "$ARTIFACT")" -eq 1 ] || fail "loop card must contain exactly one emotional-engine field"
assert_grep '循环承诺.*情绪命题/期待' "$ARTIFACT" "loop promise must clarify the emotion proposition/expectation"
for file in "$ARTIFACT" "$SKILL"; do
  assert_grep '目标情绪.*前状态.*后状态.*推进循环情绪引擎.*不得只写' "$file" \
    "chapter emotion placeholder must require a causal change and engine link"
done
assert_grep '先.*正向情绪发动机.*再.*负向.*护栏' "$SKILL" \
  "outline review must design the positive engine before negative guardrails"
assert_grep '删除题材核心的对象/关系/问题.*通用职业升级|删除题材核心的对象/关系/问题.*换皮情节' "$SKILL" \
  "SKILL missing genre-core degradation question"
assert_grep '删除主角后.*情绪兑现.*基本不变' "$SKILL" \
  "SKILL missing protagonist-removal degradation question"
for q in '为何是该承载对象' '为何是现在' '为什么没有被直接解决 / 为何此前仍悬置' '主角凭什么介入/转化' '现实/设定边界如何约束'; do
  assert_grep "$q" "$EMOTIONAL" "reasonableness five questions missing: $q"
done
for file in "$EMOTIONAL" "$ARTIFACT"; do
  assert_grep '核心情绪命题.*承载对象/情绪缺口.*受阻或缺口维持原因.*本轮触发.*主角不可替代的点火/转化动作.*意义变化或可见兑现.*题材/契约兑现' "$file" \
    "generalized emotional-engine chain is incomplete"
  assert_grep '承载对象.*人物.*关系.*目标.*规则.*场景' "$file" \
    "carrier-object type range is incomplete"
  assert_grep '无/即时.*因果闭合' "$file" \
    "inapplicable engine links must allow no/immediate while preserving causal closure"
done
assert_grep '具体投入.*受阻/延迟.*意义变化.*可信反应.*按题材组合' "$EMOTIONAL" \
  "strength principle must use a genre-specific mechanism combination"
assert_grep '不要求全部出现' "$EMOTIONAL" "strength mechanisms must not all be mandatory"
assert_grep '克制反应.*可选放大器' "$EMOTIONAL" "restrained reaction must be optional"
assert_grep '先用.*通用长篇循环情绪引擎.*三板斧.*可选技法' "$EMOTIONAL" \
  "emotional-methods intro must prioritize the generalized engine"
assert_grep '规划长篇情节循环的情绪引擎.*通用长篇循环情绪引擎' "$EMOTIONAL" \
  "decision route missing long-form plot-loop engine"
assert_grep '情绪前状态.*触发.*后状态' "$DAILY" "daily intention missing before-trigger-after causality"
assert_grep '不得只写情绪标签' "$DAILY" "daily intention must reject emotion-label-only planning"
assert_grep '仅当新承载对象、关键转折或高潮进入时.*合理性五问' "$DAILY" \
  "daily workflow must gate the five questions to meaningful entries"
assert_grep '复用既有计划节拍/实际结果/承诺进度' "$DAILY" \
  "daily workflow must reuse existing write-after fields"
assert_grep '不是必备项|可选技法.*不是.*硬模板' "$EMOTIONAL" \
  "emotion mechanisms must remain optional rather than universal templates"
assert_grep '不把物件、误解、反转、死亡、疾病、哭喊或群体抬升当成通用硬模板' "$QUALITY" \
  "quality checklist must reject hardcoded emotional mechanisms"
for file in "$EMOTIONAL" "$ARTIFACT" "$SKILL" "$DAILY" "$QUALITY"; do
  assert_no_grep '必须(爱国|老兵|开放日|催泪|死亡|疾病|哭喊|物件.{0,6}三次|误解|群体抬升)' "$file" \
    "generalized engine contains a universal hardcoded mechanism"
done
assert_no_grep '^- (情绪引擎进度|承载者状态|意义变化|合理性五问)：' "$ARTIFACT" \
  "chapter/loop template gained unauthorized emotion fields"
assert_no_grep '^--? (情绪引擎进度|承载者状态|意义变化|合理性五问)：' "$DAILY" \
  "tracker gained unauthorized emotion fields"
assert_no_grep '承载者/情绪缺口|长期受阻原因（为何过去不能解决）|情绪意义变化/最终画面|agency/成长负向护栏' "$EMOTIONAL" \
  "old mandatory generalized-engine wording remains"
assert_no_grep '承载者/情绪缺口|长期受阻原因|意义变化/最终画面' "$ARTIFACT" \
  "artifact retains old generalized-engine wording"
assert_no_grep '每 3-5 个小节有一次情绪转向|给转折至少 3 节铺垫|反转后 500 字内收尾' "$EMOTIONAL" \
  "emotional-methods retains fixed short-form numeric requirements"
assert_grep '题材、篇幅和既有兑现节奏.*不固定要求每 3-5 个小节' "$EMOTIONAL" \
  "emotion-turn cadence must be a genre/length/payoff heuristic"
assert_grep '转折重量与篇幅.*不固定三节' "$EMOTIONAL" \
  "turn setup must scale without a fixed three-section rule"
assert_grep '题材与篇幅适配的速度收束或冷却.*不固定五百字' "$EMOTIONAL" \
  "post-reversal closing must scale without a fixed 500-character rule"

# Reject English residue introduced by this feature; technical identifiers/enums remain allowed.
for file in "${FEATURE_FILES[@]}"; do
  assert_no_grep '(^|[^[:alnum:]_])(beat|payoff|per-loop|highlight|side character|chance|canonical)([^[:alnum:]_]|$)|10k[[:space:]]*[–—-][[:space:]]*30k' "$file" \
    "new-feature English residue remains (use 权威文件/权威参考 instead of canonical)"
done

# Second-round agency, ownership, pacing, and novelty contracts.
for term in '因果权' '结算权' '期待所有权' '关键节点四问' '换书债'; do
  assert_grep "$term" "$CANON" "canonical reference missing second-round concept: $term"
done
assert_grep '谁决定事情为什么发生/如何进入' "$CANON" "four-question contract missing causality question"
assert_grep '谁作出不可替代的关键选择' "$CANON" "four-question contract missing choice question"
assert_grep '谁承担或选择关键后果' "$CANON" "four-question contract missing consequence question"
assert_grep '核心收益/认可/权力最终结算给谁' "$CANON" "four-question contract missing settlement question"
assert_grep '长期净收益为负.*控制/因果权下降|长期净收益为负.*主角控制/因果权下降' "$CANON"   "red-light combination must require negative long-term net benefit and reduced control"
assert_grep '战略性让步.*更大控制|局部聚光灯/资源换取更大控制' "$CANON"   "canonical reference must allow strategic concessions"
assert_grep '目标 / 风险 / 信息 / 关系 / 资源 / 身份 / 情绪立场' "$CANON"   "canonical reference missing seven-state chapter progression rule"
assert_grep '本书题材、平台与对标调整，不是硬门槛|不是硬门槛' "$CANON"   "progression must be relative to this book and not a hard gate"
assert_grep '快节奏（番茄/爽文）保留.*可见事件或爽点|快节奏.*可见事件' "$CANON"   "canonical must keep a fast-platform visible-event floor (platform tiering)"
assert_grep '短暂低压.*小而可见的收益/奖励' "$CANON"   "canonical reference missing brief post-payoff small-gain relaxation"
assert_grep '新地图、新机构、新能力、新敌人或新谜团.*铺垫成本.*期待债' "$CANON"   "canonical reference missing new-element expectation debt"
assert_grep '履约爽文/能力幻想.*愚蠢或可避免的无能.*高风险' "$CANON"   "canonical reference missing genre-specific incompetence-disaster risk"
assert_grep '不看出场时长|不要求主角.*亲自' "$CANON"   "agency must not require protagonist page-time or personal execution"

# Canonical remains authoritative; each of the four consumers references and consumes it.
for file in "${CONSUMERS[@]}"; do
  assert_grep 'reader-contract-and-progression\.md' "$file" "consumer missing canonical reference"
done
assert_grep '关键节点四问' "$SKILL" "SKILL must consume four-question contract"
assert_grep '关键节点四问' "$ARTIFACT" "artifact protocol must consume four-question contract"
assert_grep '关键节点四问' "$DAILY" "daily workflow must consume four-question contract"
assert_grep '关键节点四问' "$QUALITY" "quality checklist must consume four-question contract"
assert_grep '权威文件七类状态分档' "$DAILY"   "daily workflow must delegate seven-state progression to the canonical file (deduped)"
assert_grep '两问皆否即放行|一战多得（多线齐涨）是好设计' "$QUALITY"   "quality checklist must use the two-question overspeed test"

echo "OK story-long-write reader contract/progression checks"
