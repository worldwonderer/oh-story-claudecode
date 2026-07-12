#!/usr/bin/env bash
# check-codex-adapter.sh — deterministic checks for the Codex adapter surface.
#
# Codex support here is repo skill discovery (.agents/skills symlink) plus
# `$story-setup` project deployment (.codex/agents + .codex/hooks). There is no
# materialized plugin package; agent TOMLs are generated from the Claude agent
# templates by scripts/generate-codex-agents.py.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

fail() { echo "FAIL: $*" >&2; exit 1; }
assert_file() { [ -f "$1" ] || fail "required file missing: $1"; }
assert_path() { [ -e "$1" ] || fail "required path missing: $1"; }
assert_grep() { grep -Eq "$1" "$2" || fail "$3 ($2)"; }

cd "$REPO_ROOT"

echo "Codex adapter check"
echo "==================="
echo "Repo: $REPO_ROOT"

CODEX_DIR="skills/story-setup/references/codex"
assert_path ".agents/skills"
assert_file "$CODEX_DIR/AGENTS.md.tmpl"
assert_file "$CODEX_DIR/hooks/hooks.json"
assert_file "$CODEX_DIR/hooks/story_codex_hook.py"
assert_path "$CODEX_DIR/agents"
assert_file "scripts/generate-codex-agents.py"

python3 -m json.tool "$CODEX_DIR/hooks/hooks.json" >/dev/null
python3 - <<'PY'
from pathlib import Path
for name in (
    'scripts/generate-codex-agents.py',
    'skills/story-setup/references/codex/hooks/story_codex_hook.py',
):
    compile(Path(name).read_text(encoding='utf-8'), name, 'exec')
PY

echo "  OK JSON/Python syntax"

# Windows encoding safety (issue #164 class): the hook carries Chinese 正文/细纲 over
# stdin/stdout, so it must use UTF-8 bytes, not Windows' ANSI code page text streams.
HOOK_PY="$CODEX_DIR/hooks/story_codex_hook.py"
assert_grep 'sys\.stdin\.buffer\.read' "$HOOK_PY" "Codex hook must read stdin as UTF-8 bytes"
assert_grep 'sys\.stdout\.buffer\.write' "$HOOK_PY" "Codex hook must write stdout as UTF-8 bytes"
if grep -qE 'sys\.stdin\.read\(\)|sys\.stdout\.write\(' "$HOOK_PY"; then
  fail "Codex hook must not use text-mode sys.stdin.read()/sys.stdout.write() (Windows ANSI hazard)"
fi
# Every read_text( must pass encoding= (not just the bare ()) — the likely #164-class regression
# is dropping only the encoding kwarg while keeping other args.
if grep -nE '\.read_text\(' "$HOOK_PY" | grep -qv 'encoding='; then
  fail "every Codex hook read_text() must pass encoding='utf-8' (Windows ANSI hazard)"
fi

echo "  OK Windows encoding safety (UTF-8 stdio + file reads)"

# Prose backstop parity surface: Codex has no PostToolUse, so the light prose net runs at Stop
# (sweeping git-changed 正文) and continuity runs at SessionStart. These must stay present.
assert_grep 'def prose_net_findings' "$HOOK_PY" "Codex hook must carry the light prose net (parity with claude/opencode)"
assert_grep 'def find_changed_prose_files' "$HOOK_PY" "Codex Stop sweep must discover git-changed prose"
assert_grep 'def continuity_findings' "$HOOK_PY" "Codex hook must carry the continuity backstop (追踪 staleness + dup-title)"

echo "  OK prose backstop parity surface (Stop net + SessionStart continuity)"

# .agents/skills is a relative symlink to skills/ (the agentskills.io path Codex scans), so
# there is no second skill copy. Must be a valid relative symlink: an invalid/absolute one
# (openai/codex#11314) or a Windows no-symlinks text stub silently breaks discovery.
[ -L ".agents/skills" ] || fail ".agents/skills must be a symlink (got a regular file/dir; on Windows enable git core.symlinks)"
target="$(readlink .agents/skills)"
[ "$target" = "../skills" ] || fail ".agents/skills symlink target must be relative '../skills', got '$target'"
skill_count="$(find skills -maxdepth 2 -name SKILL.md | wc -l | tr -d ' ')"
[ "$skill_count" = "13" ] || fail "expected 13 skills, found $skill_count"
for skill in skills/*/SKILL.md; do
  name="$(basename "$(dirname "$skill")")"
  assert_file ".agents/skills/$name/SKILL.md"
done

echo "  OK .agents/skills discovery symlink ($skill_count skills)"

# Custom-agent TOMLs are generated deterministically from the Claude templates.
python3 scripts/generate-codex-agents.py --dest "$TMP_DIR/agents" >/dev/null
diff -qr "$TMP_DIR/agents" "$CODEX_DIR/agents" >/dev/null \
  || fail "generated Codex agents are stale; run scripts/generate-codex-agents.py"

# A missing/empty source must fail before touching the destination. Otherwise a
# typo in --source silently prunes every generated TOML while returning success.
mkdir -p "$TMP_DIR/empty-source" "$TMP_DIR/safe-dest"
printf 'keep\n' > "$TMP_DIR/safe-dest/sentinel.toml"
if python3 scripts/generate-codex-agents.py \
  --source "$TMP_DIR/empty-source" --dest "$TMP_DIR/safe-dest" >/dev/null 2>&1; then
  fail "Codex generator must reject an empty source directory"
fi
assert_file "$TMP_DIR/safe-dest/sentinel.toml"

# A malformed later source must also fail before any earlier valid source is
# written. This locks the generator's validate-all-then-write behavior.
mkdir -p "$TMP_DIR/malformed-source" "$TMP_DIR/transactional-dest"
cat >"$TMP_DIR/malformed-source/a.md" <<'EOF'
---
name: a
description: valid first fixture
---
body
EOF
printf 'missing frontmatter\n' >"$TMP_DIR/malformed-source/b.md"
printf 'keep old a\n' >"$TMP_DIR/transactional-dest/a.toml"
printf 'keep sentinel\n' >"$TMP_DIR/transactional-dest/sentinel.toml"
cp -R "$TMP_DIR/transactional-dest" "$TMP_DIR/transactional-before"
if python3 scripts/generate-codex-agents.py \
  --source "$TMP_DIR/malformed-source" \
  --dest "$TMP_DIR/transactional-dest" >/dev/null 2>&1; then
  fail "Codex generator must reject malformed agent source"
fi
diff -qr "$TMP_DIR/transactional-before" "$TMP_DIR/transactional-dest" >/dev/null \
  || fail "Codex generator modified destination before validating all sources"

python3 - <<'PY'
import tomllib
from pathlib import Path
expected = {
    'chapter-extractor', 'character-designer', 'consistency-checker',
    'narrative-writer', 'story-architect', 'story-explorer', 'story-researcher',
}
read_only = {'chapter-extractor', 'consistency-checker', 'story-explorer'}
found = set()
for path in sorted(Path('skills/story-setup/references/codex/agents').glob('*.toml')):
    data = tomllib.loads(path.read_text())
    for key in ('name', 'description', 'developer_instructions'):
        assert data.get(key), f'{path}: missing {key}'
    name = data['name']
    instructions = data['developer_instructions']
    assert path.name == f'{name}.toml', f'{path}: filename/name mismatch'
    assert '.codex/skills/story-setup/references/agent-references/' in instructions
    assert 'agent_type' in instructions, f'{path}: missing Codex agent_type guidance'
    assert 'subagent_type' not in instructions, f'{path}: leaked Claude subagent_type wording'
    assert 'unknown agent_type' in instructions, f'{path}: missing runtime fallback guidance'
    if name in read_only:
        assert data.get('sandbox_mode') == 'read-only', f'{path}: expected read-only sandbox'
    found.add(name)
assert found == expected, found
PY

echo "  OK Codex custom-agent TOML (schema + generator determinism)"

# Deployment hooks target the project .codex/ and must not require git to launch.
assert_grep 'for PYBIN in python3 python py' "$CODEX_DIR/hooks/hooks.json" "deployment hooks must probe Python interpreter"
assert_grep 'CODEX_PROJECT_DIR.*CLAUDE_PROJECT_DIR.*SEARCH_DIR' "$CODEX_DIR/hooks/hooks.json" "deployment hooks must resolve project root without requiring git"
if grep -q 'git rev-parse' "$CODEX_DIR/hooks/hooks.json"; then
  fail "deployment hooks must not require git to launch story_codex_hook.py"
fi
assert_grep '\.codex/hooks/story_codex_hook\.py' "$CODEX_DIR/hooks/hooks.json" "deployment hooks must point at project .codex/hooks"

# Every launcher must (a) propagate the resolved root to Python (CODEX_PROJECT_DIR=$PROJECT_ROOT)
# and (b) no-op when the hook file is absent instead of running "//.codex/..." (root="/"). And
# the Python hook must self-locate from __file__ so a Git Bash MSYS root still resolves on Windows.
python3 - "$CODEX_DIR/hooks/hooks.json" "$CODEX_DIR/hooks/story_codex_hook.py" <<'PY'
import json, sys
from pathlib import Path
hooks = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))["hooks"]
all_hooks = [h for arr in hooks.values() for blk in arr for h in blk["hooks"]]
assert all_hooks, "no launcher commands found"
for h in all_hooks:
    c = h["command"]
    assert '[ -f "$HOOK" ] || exit 0' in c, f"launcher missing no-op guard: {c[:80]}"
    assert 'CODEX_PROJECT_DIR="$PROJECT_ROOT" "$PYBIN" "$HOOK"' in c, f"launcher must propagate root to Python: {c[:80]}"
    assert '"$PYBIN" "$PROJECT_ROOT/.codex/hooks/story_codex_hook.py"' not in c, f"launcher runs hook without root propagation/no-op guard: {c[:80]}"
    # Codex runs Windows hooks via cmd.exe (%COMSPEC% /C), not a POSIX shell, so every hook
    # needs a cmd.exe-safe commandWindows; otherwise the POSIX command is fed to cmd.exe and breaks.
    w = h.get("commandWindows")
    assert w, f"hook missing commandWindows (Windows = cmd.exe /C): {c[:60]}"
    assert "story_codex_hook.py" in w, f"commandWindows must invoke the hook: {w}"
    for posixism in ("${", "$(", "[ -f", "for PYBIN", "; do ", "&& break"):
        assert posixism not in w, f"commandWindows must be cmd.exe-safe (found POSIX {posixism!r}): {w}"
    assert c.split()[-1] == w.split()[-1], f"command/commandWindows event mismatch: {c.split()[-1]} vs {w.split()[-1]}"
hook_py = Path(sys.argv[2]).read_text(encoding="utf-8")
assert "Path(__file__)" in hook_py and "_deployed_root_from_file" in hook_py, \
    "story_codex_hook.py must self-locate the project root from __file__ (Windows MSYS-path safety)"
PY

echo "  OK launcher root propagation + no-op guard + Python self-location + cmd.exe commandWindows"

# Reference-path ordering: where the agent body lists the numbered read order, Codex must read
# .codex/skills/... first (story-setup deploys the bundle there); otherwise the body contradicts
# the appended Codex note and the agent reads non-existent .claude/.opencode paths first.
python3 - "$CODEX_DIR/agents" <<'PY'
import sys
from pathlib import Path
for path in sorted(Path(sys.argv[1]).glob("*.toml")):
    text = path.read_text(encoding="utf-8")
    if "1. `{项目根}/" not in text:
        continue  # this agent has no numbered reference list
    codex_i = text.find(".codex/skills/story-setup/references/agent-references/")
    claude_i = text.find(".claude/skills/story-setup/references/agent-references/")
    assert codex_i != -1, f"{path.name}: numbered reference list must include .codex/skills first"
    assert claude_i == -1 or codex_i < claude_i, f"{path.name}: .codex/skills must precede .claude/skills"
PY

echo "  OK Codex agent reference-path ordering"

assert_grep '\$story-setup|\$story-long-write|/skills' "$CODEX_DIR/AGENTS.md.tmpl" "Codex AGENTS template must mention skill invocation"
assert_grep '\.codex/agents/\*\.toml' "$CODEX_DIR/AGENTS.md.tmpl" "Codex AGENTS template must mention custom agent location"
assert_grep '\.codex/hooks\.json' "$CODEX_DIR/AGENTS.md.tmpl" "Codex AGENTS template must mention hooks location"
assert_grep 'references/codex' skills/story-setup/SKILL.md "story-setup must document Codex references"
assert_grep 'target_cli:.*codex|codex.*target_cli' skills/story-setup/SKILL.md "story-setup must document codex target_cli"
assert_grep '\.codex/agents|\.codex/hooks\.json' skills/story-review/SKILL.md "story-review must check Codex agents"

echo "  OK Codex docs/instruction anchors"
echo ""
echo "OK: Codex adapter checks passed"
