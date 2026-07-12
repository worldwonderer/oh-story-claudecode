#!/usr/bin/env bash
# Deterministic checks for the ZCode plugin and story-setup deployment surface.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

fail() { echo "FAIL: $*" >&2; exit 1; }
assert_file() { [ -f "$1" ] || fail "required file missing: $1"; }
assert_grep() { grep -Eq "$1" "$2" || fail "$3 ($2)"; }

ROOT="skills/story-setup/references/zcode"
HOOK="$ROOT/hooks/story_zcode_hook.js"

echo "ZCode adapter check"
echo "==================="
echo "Repo: $REPO_ROOT"

for file in \
  .zcode-plugin/plugin.json \
  marketplace.json \
  "$ROOT/AGENTS.md.tmpl" \
  "$ROOT/config.json.patch" \
  "$ROOT/hooks/hooks.json" \
  "$HOOK"; do
  assert_file "$file"
done

for file in .zcode-plugin/plugin.json marketplace.json "$ROOT/config.json.patch" "$ROOT/hooks/hooks.json"; do
  python3 -m json.tool "$file" >/dev/null
done
node --check "$HOOK"
echo "  OK JSON/JavaScript syntax"

python3 - <<'PY'
import json, re
from pathlib import Path

plugin = json.loads(Path('.zcode-plugin/plugin.json').read_text())
assert re.fullmatch(r'[a-z0-9][a-z0-9._-]{0,127}', plugin['name'])
assert plugin['name'] == 'oh-story'
assert plugin['skills'] == 'skills'
assert plugin['commands'] == 'skills/story-setup/references/zcode/commands'
assert plugin['hooks'] == 'skills/story-setup/references/zcode/hooks/hooks.json'
for key in ('agents', 'channels', 'lspServers', 'outputStyles', 'settings'):
    assert key not in plugin, f'non-runnable ZCode component declared: {key}'

market = json.loads(Path('marketplace.json').read_text())
assert market['name'] == 'oh-story-zcode'
assert market['version'] == 1
assert len(market['plugins']) == 1
entry = market['plugins'][0]
assert entry['name'] == plugin['name'] and entry['source'] == './'
assert entry['version'] == plugin['version']
assert plugin['version'] == Path('skills/story/VERSION').read_text().strip()
PY
echo "  OK native plugin/marketplace manifest"

python3 - <<'PY'
import re
from pathlib import Path

skills = sorted(Path('skills').glob('*/SKILL.md'))
commands = sorted(Path('skills/story-setup/references/zcode/commands').glob('*.md'))
assert len(skills) == 13, f'expected 13 skills, got {len(skills)}'
assert len(commands) == 13, f'expected 13 commands, got {len(commands)}'
expected = {p.parent.name for p in skills}
assert {p.stem for p in commands} == expected

for skill in skills:
    text = skill.read_text(encoding='utf-8')
    front = text.split('---', 2)[1]
    name = re.search(r'^name:\s*["\']?([^"\'\n]+)', front, re.M)
    desc = re.search(r'^description:\s*(.+)$', front, re.M)
    assert name and name.group(1).strip() == skill.parent.name, skill
    assert desc, f'{skill}: missing description'
    value = desc.group(1).strip().strip('"\'')
    assert len(value) <= 1024, f'{skill}: description too long'

allowed = {'description', 'argument-hint', 'allowed-tools', 'model', 'skills', 'disable-noninteractive'}
for command in commands:
    assert re.fullmatch(r'[a-z0-9][a-z0-9_:-]{0,63}', command.stem), command
    text = command.read_text(encoding='utf-8')
    assert text.startswith('---\n'), command
    front, body = text.split('---', 2)[1:]
    keys = {line.split(':', 1)[0] for line in front.splitlines() if ':' in line}
    assert keys <= allowed, f'{command}: unsupported keys {keys - allowed}'
    assert 'description' in keys and 'skills' in keys
    assert '$ARGUMENTS' in body
PY
echo "  OK 13 Skills + 13 Commands (schema and one-to-one names)"

python3 - <<'PY'
import json
from pathlib import Path

supported = {'SessionStart', 'UserPromptSubmit', 'PreToolUse', 'PermissionRequest', 'PostToolUse', 'PostToolUseFailure', 'Stop'}
plugin = json.loads(Path('skills/story-setup/references/zcode/hooks/hooks.json').read_text())['hooks']
config = json.loads(Path('skills/story-setup/references/zcode/config.json.patch').read_text())['hooks']
assert config['enabled'] is True
assert set(plugin) == {'SessionStart', 'PreToolUse', 'PostToolUse'}
assert set(config['events']) == set(plugin)
assert set(plugin) <= supported

def flatten(events):
    return [hook for groups in events.values() for group in groups for hook in group['hooks']]

plugin_hooks = flatten(plugin)
workspace_hooks = flatten(config['events'])
assert len(plugin_hooks) == len(workspace_hooks) == 4
for hook in plugin_hooks + workspace_hooks:
    assert set(hook) <= {'type', 'command', 'args', 'timeoutMs'}
    assert hook['type'] == 'process' and hook['command'] == 'node'
    assert hook['args'][1] in {'session-start', 'pre-tool-prose-guard', 'pre-tool-commit-advisory', 'post-tool-prose-check'}
post_groups = plugin['PostToolUse']
assert len(post_groups) == 1 and post_groups[0]['matcher'] == 'Bash|Write|Edit'
for hook in plugin_hooks:
    assert hook['args'][0].startswith('${ZCODE_PLUGIN_ROOT}/')
for hook in workspace_hooks:
    assert hook['args'][0] == '${ZCODE_PROJECT_DIR}/.zcode/hooks/story_zcode_hook.js'
PY
echo "  OK supported events + strict process-hook shape"

if grep -RqsE 'PreCompact|PostCompact|SessionEnd|SubagentStop|Notification' "$ROOT/hooks" "$ROOT/config.json.patch"; then
  fail "ZCode adapter contains unsupported hook events"
fi
[ ! -e "$ROOT/agents" ] || fail "ZCode 3.3.4 must not ship project agents"
[ ! -e "$ROOT/rules" ] || fail "ZCode has no .zcode/rules discovery surface"

assert_grep '\$story-long-write|\$story-setup' "$ROOT/AGENTS.md.tmpl" 'ZCode AGENTS template must document $skill invocation'
assert_grep 'project custom agents unavailable.*solo|不执行项目.*custom agents' "$ROOT/AGENTS.md.tmpl" "ZCode AGENTS template must document solo fallback"
assert_grep 'target_cli = zcode|target_cli.*zcode' skills/story-setup/SKILL.md "story-setup must document zcode target_cli"
assert_grep 'references/zcode/config\.json\.patch' skills/story-setup/SKILL.md "story-setup manifest missing ZCode config patch"
assert_grep '\.zcode/skills/story-setup/references/agent-references' skills/story-setup/SKILL.md "story-setup missing ZCode reference path"

for skill in story-long-write story-short-write story-long-analyze story-import story-deslop story-review; do
  assert_grep 'ZCode 3\.3\.4|\.zcode/' "skills/$skill/SKILL.md" "$skill must document ZCode fallback"
done

echo "  OK deployment instructions + explicit capability boundaries"
echo ""
echo "OK: ZCode adapter checks passed"
