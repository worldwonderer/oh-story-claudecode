#!/usr/bin/env bash
# check-story-doctor.sh — story-doctor 契约验证
#
# 最要紧的一条：doctor 的 --fix 绝不能碰用户状态。修复分层直接对应 UPGRADING.md 的
# 文件所有权模型，这里用真实 fixture 跑一遍，断言正文/设定/追踪字节未变。
set -euo pipefail

cd "$(dirname "$0")/.."

DOCTOR="skills/story-doctor/scripts/story_doctor.py"
SKILL="skills/story-doctor/SKILL.md"

fail() { echo "FAIL: $1" >&2; exit 1; }

[ -f "$DOCTOR" ] || fail "missing $DOCTOR"
[ -f "$SKILL" ] || fail "missing $SKILL"
python3 -c "import ast,sys; ast.parse(open(sys.argv[1],encoding='utf-8').read())" "$DOCTOR" \
  || fail "story_doctor.py is not valid Python"

# 自包含：doctor 诊断的正是「部署坏了」，它自己再依赖那份部署就会一起哑。
python3 - "$DOCTOR" <<'PY'
import ast, sys
tree = ast.parse(open(sys.argv[1], encoding="utf-8").read())
allowed = {
    "argparse", "json", "shutil", "subprocess", "sys", "os", "re",
    "pathlib", "collections", "tempfile", "typing",
}
bad = []
for node in ast.walk(tree):
    if isinstance(node, ast.Import):
        bad += [a.name for a in node.names if a.name.split(".")[0] not in allowed]
    elif isinstance(node, ast.ImportFrom) and node.module:
        if node.module.split(".")[0] not in allowed:
            bad.append(node.module)
if bad:
    raise SystemExit("FAIL: story_doctor.py must stay stdlib-only, got: " + ", ".join(sorted(set(bad))))
PY

# 检查清单必须与部署真源同步，否则 doctor 会漏检新增的 skill。
python3 - <<'PY'
import ast, re
from pathlib import Path

doctor = Path("skills/story-doctor/scripts/story_doctor.py").read_text(encoding="utf-8")
tree = ast.parse(doctor)
known = None
for node in ast.walk(tree):
    if isinstance(node, ast.Assign) and any(
        isinstance(t, ast.Name) and t.id == "KNOWN_SKILLS" for t in node.targets
    ):
        known = {e.value for e in node.value.elts}
if known is None:
    raise SystemExit("FAIL: story_doctor.py must declare KNOWN_SKILLS")
on_disk = {p.parent.name for p in Path("skills").glob("*/SKILL.md")}
if known != on_disk:
    raise SystemExit(
        "FAIL: doctor KNOWN_SKILLS drifted from skills/: missing={}, extra={}".format(
            sorted(on_disk - known), sorted(known - on_disk)))

deploy = Path("skills/story-setup/scripts/deploy-antigravity-skills.py").read_text(encoding="utf-8")
deploy_known = set(re.findall(r'"([a-z0-9-]+)",', deploy.split("KNOWN_SKILLS = (", 1)[1].split(")", 1)[0]))
if deploy_known != known:
    raise SystemExit(
        "FAIL: doctor and deploy-antigravity-skills disagree on the skill list: {}".format(
            sorted(deploy_known ^ known)))
PY

# 退出码契约：调用方靠它区分「可以开写」「降级可写」「先修再写」。
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/undeployed"
set +e
python3 "$DOCTOR" --project "$tmp/undeployed" --package . >/dev/null 2>&1
[ $? -eq 2 ] || fail "an undeployed directory must exit 2 (error)"
python3 "$DOCTOR" --project "$tmp/does-not-exist" --package . >/dev/null 2>&1
[ $? -eq 3 ] || fail "a bad --project must exit 3 (usage)"
set -e

# 修复边界：构造一个坏项目，跑 --fix，断言受管文件被修、用户状态一个字节没动。
proj="$tmp/proj"
mkdir -p "$proj/.claude/skills" "$proj/.claude/agents" "$proj/我的书/追踪" "$proj/我的书/正文"
cp -R skills/. "$proj/.claude/skills/"
cp skills/story-setup/references/templates/agents/*.md "$proj/.claude/agents/"
printf 'deployed_at: 2026-01-01\nagents_version: 29\ntarget_cli: claude-code\nreferences_dir: .claude/skills/story-setup/references/agent-references\n' \
  > "$proj/.story-deployed"
printf 'broken json\n' > "$proj/我的书/追踪/_tracking-state.json"
printf '正文原文，doctor 不许动\n' > "$proj/我的书/正文/第1章.md"
rm -rf "$proj/.claude/skills/story-deslop"

before_state="$(shasum "$proj/我的书/追踪/_tracking-state.json" | cut -d' ' -f1)"
before_prose="$(shasum "$proj/我的书/正文/第1章.md" | cut -d' ' -f1)"

set +e
python3 "$DOCTOR" --project "$proj" --package . --fix >/dev/null 2>&1
set -e

[ -f "$proj/.claude/skills/story-deslop/SKILL.md" ] \
  || fail "--fix must restore a managed skill directory (auto tier)"
[ "$(shasum "$proj/我的书/追踪/_tracking-state.json" | cut -d' ' -f1)" = "$before_state" ] \
  || fail "--fix modified 追踪/ — user state is never auto-fixable"
[ "$(shasum "$proj/我的书/正文/第1章.md" | cut -d' ' -f1)" = "$before_prose" ] \
  || fail "--fix modified 正文/ — user state is never auto-fixable"

# --dry-run 必须真的不写。auto 层不做备份，先看后修就是唯一的安全网。
dry="$tmp/dryproj"
cp -R "$proj" "$dry"
rm -rf "$dry/.claude/skills/story-review"
set +e
python3 "$DOCTOR" --project "$dry" --package . --fix --dry-run >/dev/null 2>&1
set -e
[ ! -e "$dry/.claude/skills/story-review/SKILL.md" ] \
  || fail "--dry-run must not write anything"

# doctor 平时就是从项目内那份部署里跑起来的，此时「源」等于「目标」，缺的东西在源里
# 同样缺——不能声称能自动修，也不能把这说成「包坏了」。必须给出可行的出路。
selfrepair="$tmp/selfrepair"
mkdir -p "$selfrepair/.claude/skills"
cp -R skills/. "$selfrepair/.claude/skills/"
printf 'agents_version: 29\ntarget_cli: claude-code\nreferences_dir: .claude/skills/story-setup/references/agent-references\n' \
  > "$selfrepair/.story-deployed"
rm -rf "$selfrepair/.claude/skills/story-review"
python3 - "$selfrepair" <<'PY2'
import json, subprocess, sys
proj = sys.argv[1]
doctor = proj + "/.claude/skills/story-doctor/scripts/story_doctor.py"
out = subprocess.run([sys.executable, doctor, "--project", proj, "--json", "--fix"],
                     stdout=subprocess.PIPE, encoding="utf-8").stdout
data = json.loads(out)
hits = [f for f in data["findings"] if f["checkId"] == "deploy/skills-complete"]
if not hits:
    raise SystemExit("FAIL: a missing skill must still be reported when source == destination")
for f in hits:
    if f["fixTier"] == "auto":
        raise SystemExit("FAIL: doctor cannot claim auto-repair when it is its own broken source")
    if "--package" not in f["fixHint"] and "story-setup" not in f["fixHint"]:
        raise SystemExit("FAIL: the fix hint must offer a workable route out")
if data["fixed"]:
    raise SystemExit("FAIL: nothing can be repaired when source == destination, got " + str(data["fixed"]))
PY2

# 用户状态的发现必须标成 refuse，不能哪天被改成 auto。
python3 - "$DOCTOR" "$proj" <<'PY'
import json, subprocess, sys
out = subprocess.run(
    [sys.executable, sys.argv[1], "--project", sys.argv[2], "--package", ".", "--json"],
    stdout=subprocess.PIPE, encoding="utf-8").stdout
findings = json.loads(out)["findings"]
tracking = [f for f in findings if f["checkId"] == "project/tracking-state"]
if not tracking:
    raise SystemExit("FAIL: a corrupt tracking state must be reported")
for f in tracking:
    if f["fixTier"] != "refuse":
        raise SystemExit("FAIL: tracking state must stay fixTier=refuse, got " + f["fixTier"])
PY

# SKILL.md 的关键约束不能被悄悄放宽。
grep -q '不要挂进 session-start' "$SKILL" \
  || fail "story-doctor must stay out of session-start (it does network work)"
grep -q '永不自动改' "$SKILL" \
  || fail "story-doctor must promise never to auto-edit user state"
grep -q 'UPGRADING.md' "$SKILL" \
  || fail "fix tiers must be anchored to the file-ownership model, not invented"

echo "story-doctor checks passed."
