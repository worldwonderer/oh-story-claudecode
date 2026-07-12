#!/usr/bin/env bash
# check-opencode-adapter.sh — deterministic checks for the OpenCode adapter surface.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ROOT="$REPO_ROOT/skills/story-setup/references/opencode"
TMP_DIR="$(mktemp -d)"
SYNC_LOG="$TMP_DIR/sync.log"
trap 'rm -rf "$TMP_DIR"' EXIT

fail() { echo "FAIL: $*" >&2; exit 1; }
assert_file() { [ -f "$1" ] || fail "required file missing: $1"; }
assert_dir() { [ -d "$1" ] || fail "required directory missing: $1"; }
assert_grep() { grep -Eq "$1" "$2" || fail "$3 ($2)"; }

cd "$REPO_ROOT"

echo "OpenCode adapter check"
echo "======================"
echo "Repo: $REPO_ROOT"

assert_dir "$ROOT"
assert_file "$ROOT/AGENTS.md.tmpl"
assert_file "$ROOT/opencode.json.patch"
assert_file "$ROOT/plugin.ts"
assert_dir "$ROOT/agents"
assert_dir "$ROOT/commands"
assert_file "scripts/sync-opencode.py"

python3 -m json.tool "$ROOT/opencode.json.patch" >/dev/null
python3 - <<'PY'
import json
from pathlib import Path
cfg = json.loads(Path('skills/story-setup/references/opencode/opencode.json.patch').read_text())
assert cfg.get('$schema') == 'https://opencode.ai/config.json', cfg
plugins = cfg.get('plugin')
assert isinstance(plugins, list), plugins
assert './.opencode/plugins/story-hooks.ts' in plugins, plugins
PY

echo "  OK config patch"

# Snapshot the generated surface so --check itself is held to its read-only contract,
# including when a developer already has unrelated worktree changes.
cp -R "$ROOT" "$TMP_DIR/opencode-before"
if ! python3 scripts/sync-opencode.py --check >"$SYNC_LOG" 2>&1; then
  cat "$SYNC_LOG" >&2 || true
  echo "::error::OpenCode templates are out of sync with Claude Code templates." >&2
  echo "::error::Run 'python3 scripts/sync-opencode.py' locally and commit the changes." >&2
  exit 1
fi
diff -qr "$TMP_DIR/opencode-before" "$ROOT" >/dev/null \
  || fail "sync-opencode.py --check modified generated files"

echo "  OK generated OpenCode templates are in sync (--check stayed read-only)"

python3 - "scripts/sync-opencode.py" "$TMP_DIR" <<'PY'
import importlib.util
import sys
from pathlib import Path

script_path = Path(sys.argv[1]).resolve()
tmp = Path(sys.argv[2]) / "opencode-transaction"
spec = importlib.util.spec_from_file_location("sync_opencode", script_path)
module = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(module)

src = tmp / "skills/story-setup/references/templates/agents"
dst = tmp / "skills/story-setup/references/opencode/agents"
src.mkdir(parents=True)
dst.mkdir(parents=True)
(src / "a.md").write_text(
    "---\nname: a\ndescription: valid first fixture\ntools: [Read]\n---\nbody\n",
    encoding="utf-8",
)
(src / "b.md").write_text("missing frontmatter\n", encoding="utf-8")
(dst / "a.md").write_text("keep old a\n", encoding="utf-8")
(dst / "sentinel.md").write_text("keep sentinel\n", encoding="utf-8")
before = {path.name: path.read_bytes() for path in dst.iterdir()}
module.ROOT = tmp
try:
    module.sync_agents(check=False)
except ValueError:
    pass
else:
    raise SystemExit("sync-opencode must reject malformed agent source")
after = {path.name: path.read_bytes() for path in dst.iterdir()}
if after != before:
    raise SystemExit("sync-opencode modified destination before validating all sources")
PY

echo "  OK malformed source cannot partially update generated agents"

python3 - <<'PY'
from pathlib import Path
expected = {
    'chapter-extractor', 'character-designer', 'consistency-checker',
    'narrative-writer', 'story-architect', 'story-explorer', 'story-researcher',
}
read_only = {'chapter-extractor', 'consistency-checker', 'story-explorer'}
base = Path('skills/story-setup/references/opencode/agents')
found = {p.stem for p in base.glob('*.md')}
assert found == expected, found
for p in sorted(base.glob('*.md')):
    text = p.read_text()
    assert text.startswith('---\n'), f'{p}: missing frontmatter'
    try:
        fm = text.split('---', 2)[1]
    except IndexError:
        raise AssertionError(f'{p}: malformed frontmatter')
    assert 'mode: subagent' in fm, f'{p}: missing mode: subagent'
    assert 'description:' in fm, f'{p}: missing description'
    assert 'read: allow' in fm, f'{p}: missing read allow'
    assert 'steps:' in fm, f'{p}: missing steps limit'
    if p.stem in read_only:
        assert 'edit: deny' in fm, f'{p}: read-only agent must deny edit'
    else:
        assert 'edit: allow' in fm, f'{p}: write-capable agent must allow edit'
    assert '.claude/skills/story-setup/references/agent-references/' not in text, f'{p}: leaked Claude reference path'
    if p.stem in {'character-designer', 'consistency-checker', 'narrative-writer', 'story-architect'}:
        assert '.opencode/skills/story-setup/references/agent-references/' in text, f'{p}: missing OpenCode reference path'
PY

echo "  OK agent templates"

python3 - <<'PY'
from pathlib import Path
skill_names = {p.parent.name for p in Path('skills').glob('*/SKILL.md')}
command_names = {p.stem for p in Path('skills/story-setup/references/opencode/commands').glob('*.md')}
assert skill_names == command_names, f'missing={skill_names-command_names}, extra={command_names-skill_names}'
for p in sorted(Path('skills/story-setup/references/opencode/commands').glob('*.md')):
    text = p.read_text()
    assert text.startswith('---\n'), f'{p}: missing frontmatter'
    fm = text.split('---', 2)[1]
    assert 'description:' in fm, f'{p}: missing description'
    assert f'请使用 {p.stem} skill' in text, f'{p}: command body must route to same skill'
PY

echo "  OK slash command templates"

assert_grep 'experimental\.session\.compacting' "$ROOT/plugin.ts" "OpenCode plugin must inject pre-compact context"
assert_grep 'tool\.execute\.before' "$ROOT/plugin.ts" "OpenCode plugin must guard tool writes"
assert_grep 'proseBlockReason' "$ROOT/plugin.ts" "OpenCode plugin must keep outline-before-prose guard"
assert_grep 'tool\.execute\.after' "$ROOT/plugin.ts" "OpenCode plugin must run the prose backstop after writes"
assert_grep 'proseNetFindings' "$ROOT/plugin.ts" "OpenCode plugin must carry the light prose net (parity with codex/claude)"
assert_grep 'proseAfterWriteNote' "$ROOT/plugin.ts" "OpenCode plugin must surface backstop findings on the write result"
assert_grep '正文' "$ROOT/plugin.ts" "OpenCode plugin must inspect prose targets"
assert_grep '@opencode-ai/plugin' "$ROOT/plugin.ts" "OpenCode plugin must import OpenCode plugin types"
assert_grep 'AGENTS\.md|OpenCode' "$ROOT/AGENTS.md.tmpl" "OpenCode AGENTS template must be present"
assert_grep 'story-long-write|story-short-write|story-review' "$ROOT/AGENTS.md.tmpl" "OpenCode AGENTS template must mention story skill routing"

echo "  OK plugin and instruction anchors"
echo ""
echo "OK: OpenCode adapter checks passed"
