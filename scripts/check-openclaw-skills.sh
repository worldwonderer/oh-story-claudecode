#!/usr/bin/env bash
# check-openclaw-skills.sh — OpenClaw AgentSkills/frontmatter compatibility checks.
# Static by default; set OPENCLAW_REAL_CHECK=1 to run an isolated OpenClaw CLI
# smoke test with a temporary profile and workspace.
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
if [ -z "$REPO_ROOT" ]; then
  echo "Error: not in a git repository" >&2
  exit 1
fi

SKILLS_DIR="$REPO_ROOT/skills"
EXPECTED_COUNT=14

echo "OpenClaw skills check"
echo "====================="
echo "Repo: $REPO_ROOT"

python3 - "$SKILLS_DIR" "$EXPECTED_COUNT" <<'PY'
from pathlib import Path
import json
import re
import sys

skills_dir = Path(sys.argv[1])
expected = int(sys.argv[2])
failures: list[str] = []
skill_files = sorted(skills_dir.glob('*/SKILL.md'))

if len(skill_files) != expected:
    failures.append(f'expected {expected} SKILL.md files, found {len(skill_files)}')

frontmatter_re = re.compile(r'^---\n(.*?)\n---\n', re.S)
for path in skill_files:
    rel = path.relative_to(skills_dir.parent)
    text = path.read_text(encoding='utf-8')
    match = frontmatter_re.match(text)
    if not match:
        failures.append(f'{rel}: missing opening YAML frontmatter block')
        continue
    raw = match.group(1)
    lines = raw.splitlines()
    for idx, line in enumerate(lines, 1):
        if not line.strip() or line.lstrip().startswith('#'):
            continue
        if line[:1].isspace():
            failures.append(f'{rel}:{idx}: OpenClaw frontmatter only supports single-line top-level keys; found indented/block line')
        if re.match(r'^(description|metadata):\s*[>|]', line):
            failures.append(f'{rel}:{idx}: {line.split(":",1)[0]} must be a single-line value for OpenClaw')
    data = {}
    for line in lines:
        if not line.strip() or line.lstrip().startswith('#') or line[:1].isspace():
            continue
        if ':' not in line:
            failures.append(f'{rel}: invalid frontmatter line without colon: {line!r}')
            continue
        key, value = line.split(':', 1)
        value = value.strip()
        try:
            data[key] = json.loads(value) if value.startswith(('"', '{', '[', 'true', 'false', 'null')) else value
        except Exception:
            # OpenClaw still accepts plain scalar strings; only metadata is required
            # to be JSON and is checked separately below.
            data[key] = value.strip('"')
    name = data.get('name')
    desc = data.get('description')
    if not isinstance(name, str) or not name.strip():
        failures.append(f'{rel}: missing string name')
    if name and name != path.parent.name:
        failures.append(f'{rel}: name {name!r} must match directory {path.parent.name!r}')
    if not isinstance(desc, str) or not desc.strip():
        failures.append(f'{rel}: missing string description')
    elif '\n' in desc:
        failures.append(f'{rel}: description must be single-line')
    meta_lines = [line for line in lines if line.startswith('metadata:')]
    if not meta_lines:
        failures.append(f'{rel}: metadata with metadata.openclaw is required for OpenClaw gating/source metadata')
    elif len(meta_lines) > 1:
        failures.append(f'{rel}: duplicate metadata keys')
    else:
        raw_meta = meta_lines[0].split(':', 1)[1].strip()
        if not (raw_meta.startswith('{') and raw_meta.endswith('}')):
            failures.append(f'{rel}: metadata must be a single-line JSON object')
        else:
            try:
                parsed_meta = json.loads(raw_meta)
            except Exception as exc:
                failures.append(f'{rel}: metadata JSON parse failed: {exc}')
            else:
                oc = parsed_meta.get('openclaw')
                if not isinstance(oc, dict):
                    failures.append(f'{rel}: metadata.openclaw must be an object')
                else:
                    requires = oc.get('requires')
                    if requires is not None:
                        if not isinstance(requires, dict):
                            failures.append(f'{rel}: metadata.openclaw.requires must be an object')
                        else:
                            for key in ('bins', 'anyBins', 'env', 'config'):
                                value = requires.get(key)
                                if value is not None and (
                                    not isinstance(value, list)
                                    or not all(isinstance(x, str) for x in value)
                                ):
                                    failures.append(f'{rel}: metadata.openclaw.requires.{key} must be string[]')

if failures:
    print('FAIL: OpenClaw skill compatibility errors:', file=sys.stderr)
    for item in failures:
        print(f'  - {item}', file=sys.stderr)
    sys.exit(1)

for path in skill_files:
    print(f'  OK {path.parent.name}')
print(f'OK: {len(skill_files)} skills have OpenClaw-compatible single-line frontmatter')
PY

if [ "${OPENCLAW_REAL_CHECK:-0}" = "1" ]; then
  if ! command -v openclaw >/dev/null 2>&1; then
    echo "FAIL: OPENCLAW_REAL_CHECK=1 but openclaw is not on PATH" >&2
    exit 1
  fi
  TMP_DIR="$(mktemp -d)"
  PROFILE="ohstory-check-$$"
  cleanup() {
    rm -rf "$TMP_DIR" "$HOME/.openclaw-$PROFILE"
  }
  trap cleanup EXIT

  mkdir -p "$TMP_DIR/workspace"
  cp -R "$SKILLS_DIR" "$TMP_DIR/workspace/skills"
  openclaw --profile "$PROFILE" agents add ohstory-check \
    --workspace "$TMP_DIR/workspace" \
    --agent-dir "$TMP_DIR/agent" \
    --model "test/model" \
    --non-interactive \
    --json >/dev/null
  LIST_JSON="$TMP_DIR/skills.json"
  openclaw --profile "$PROFILE" skills list --agent ohstory-check --json >"$LIST_JSON"
  python3 - "$LIST_JSON" "$EXPECTED_COUNT" <<'PY'
import json
import sys
from pathlib import Path

data = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
expected = int(sys.argv[2])
skills = data.get('skills', [])
story = [s for s in skills if s.get('name') == 'browser-cdp' or str(s.get('name', '')).startswith('story')]
errors = []
if data.get('workspaceDir') is None:
    errors.append('missing workspaceDir in openclaw skills output')
if len(story) != expected:
    errors.append(f'expected {expected} story skills from temporary workspace, got {len(story)}')
for item in story:
    if item.get('source') != 'openclaw-workspace':
        errors.append(f'{item.get("name")}: expected source openclaw-workspace, got {item.get("source")}')
    if item.get('name') != 'story-cover' and item.get('eligible') is not True:
        errors.append(f'{item.get("name")}: expected eligible=True, got {item.get("eligible")} missing={item.get("missing")}')
cover = next((s for s in story if s.get('name') == 'story-cover'), None)
if cover and 'GPT_IMAGE_API_KEY' not in cover.get('missing', {}).get('env', []):
    errors.append('story-cover should expose GPT_IMAGE_API_KEY as missing env when unset')
if errors:
    for err in errors:
        print(f'FAIL: {err}', file=sys.stderr)
    sys.exit(1)
print(f'OK: OpenClaw CLI discovered {len(story)} workspace story skills')
PY
fi

echo "OK: OpenClaw skills checks passed"
