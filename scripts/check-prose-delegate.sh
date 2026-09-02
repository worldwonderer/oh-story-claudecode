#!/usr/bin/env bash
# check-prose-delegate.sh — 正文外包契约验证
#
# 只做不花配额、不联网的静态与本地行为验证：真实 agy 调用要几分钟并消耗用户配额，
# 不进 CI。预检的两个失败分支可以在本地无网络地验证，因为「没装」这一支只看 ENOENT。
set -euo pipefail

cd "$(dirname "$0")/.."

HELPER="skills/story-long-write/scripts/delegate-prose.js"
SHORT_HELPER="skills/story-short-write/scripts/delegate-prose.js"

fail() { echo "FAIL: $1" >&2; exit 1; }

[ -f "$HELPER" ] || fail "missing $HELPER"
[ -f "$SHORT_HELPER" ] || fail "missing $SHORT_HELPER"
cmp -s "$HELPER" "$SHORT_HELPER" || fail "long/short delegate-prose copies drifted; run sync-shared-assets.py sync"

node --check "$HELPER" || fail "delegate-prose.js is not valid JavaScript"

# 只读契约：绝不允许把危险权限开关写进 helper。注释里解释「为什么不用」是允许的，
# 所以先剥掉注释行再查，否则文档反而会把自己判失败。
CODE="$(mktemp)"
trap 'rm -f "$CODE"' EXIT
sed -e 's://.*::' -e '/^[[:space:]]*\*/d' -e '/^[[:space:]]*\/\*/d' "$HELPER" > "$CODE"

if grep -q -- '--dangerously-skip-permissions' "$CODE"; then
  fail "delegate must stay read-only; --dangerously-skip-permissions is out of bounds"
fi
if grep -q '\.gemini' "$CODE"; then
  fail "delegate must not touch the user's global ~/.gemini configuration"
fi
grep -q -- '--json-schema' "$CODE" \
  || fail "delegate must request structured output via --json-schema"
grep -q -- '--add-dir' "$CODE" \
  || fail "delegate must mount the project with --add-dir"

# 禁自查那段是必需品，不是修辞：删掉它外包必失败（headless 下 command 被自动拒绝，
# 委派方遇拒整个 run 放弃）。
grep -q '禁止使用 run_command' "$HELPER" \
  || fail "delegate prompt must forbid run_command; without it the headless run aborts"
grep -q '不要因为无法自查而放弃' "$HELPER" \
  || fail "delegate prompt must tell the model not to give up when it cannot self-check"

# 退出码契约：调用方靠它区分静默回落与显式报错。
for token in "MISSING_CLI: 1" "AUTH_OR_NETWORK: 2" "INVOCATION: 3" "BAD_OUTPUT: 4" "USAGE: 5"; do
  grep -q "$token" "$HELPER" || fail "delegate must keep exit code contract: $token"
done

# 预检的「没装」分支：无 agy 的 PATH 下必须干净地报 MISSING_CLI 并退 1。
node_dir="$(dirname "$(command -v node)")"
set +e
out="$(env PATH="$node_dir:/usr/bin:/bin" node "$HELPER" --preflight 2>&1)"
rc=$?
set -e
[ "$rc" -eq 1 ] || fail "preflight without agy must exit 1, got $rc"
[ "$out" = "MISSING_CLI" ] || fail "preflight without agy must print MISSING_CLI, got: $out"

# 用法错误必须在任何外部调用之前挡住。
set +e
env PATH="$node_dir:/usr/bin:/bin" node "$HELPER" --mode bogus --preflight >/dev/null 2>&1
[ $? -eq 5 ] || fail "invalid --mode must exit 5"
env PATH="$node_dir:/usr/bin:/bin" node "$HELPER" --model >/dev/null 2>&1
[ $? -eq 5 ] || fail "a flag missing its value must exit 5"
set -e

# 默认关：sentinel 与两条写作流程都不得让外包变成默认路径。
grep -q 'prose_delegate' skills/story-setup/SKILL.md \
  || fail "story-setup does not document the prose_delegate sentinel field"
grep -q 'prose_delegate: none（可选' skills/story-setup/SKILL.md \
  || fail "story-setup must default prose_delegate to none"
grep -q '不询问、不预检、不提示' skills/story-setup/SKILL.md \
  || fail "story-setup must stay silent about delegation when it is off"
# 热路径只放一行门禁，细节在按需加载的 reference 里——外包默认关闭，
# 不该让每个用户每次会话都为一个可选功能付上下文预算。
for doc in skills/story-long-write/references/workflow-chapter.md skills/story-short-write/SKILL.md; do
  grep -q 'prose_delegate' "$doc" || fail "$doc does not gate prose delegation on the sentinel"
  grep -q '默认关闭' "$doc" || fail "$doc must mark prose delegation as off by default"
  grep -q 'references/prose-delegate.md' "$doc" || fail "$doc must route delegation detail to the cold reference"
done

for ref in skills/story-long-write/references/prose-delegate.md skills/story-short-write/references/prose-delegate.md; do
  [ -f "$ref" ] || fail "missing $ref"
  grep -q '静默回落' "$ref" || fail "$ref must fall back silently when the delegate is unavailable"
  grep -q '不得把失败说成外包成功' "$ref" || fail "$ref must forbid dressing a delegate failure up as success"
  grep -q '自估 3052、实际 4925' "$ref" || fail "$ref must record that the delegate's self-reported length is untrustworthy"
done
grep -q '不要让委派方直接写 `正文.md`' skills/story-short-write/references/prose-delegate.md \
  || fail "short-form delegation must stage segments instead of writing 正文.md directly"

echo "Prose delegate checks passed."
