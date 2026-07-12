#!/usr/bin/env bash
# check-claude-adapter.sh — Claude Code marketplace/plugin compatibility checks.
# Static by default; set CLAUDE_REAL_CHECK=1 to invoke the installed Claude CLI.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MARKETPLACE="$REPO_ROOT/.claude-plugin/marketplace.json"
EXPECTED_COUNT=13

fail() { echo "FAIL: $*" >&2; exit 1; }

echo "Claude Code adapter check"
echo "========================="
echo "Repo: $REPO_ROOT"

python3 - "$MARKETPLACE" "$REPO_ROOT" "$EXPECTED_COUNT" <<'PY'
import json
import sys
from pathlib import Path

marketplace_path = Path(sys.argv[1])
repo_root = Path(sys.argv[2])
expected_count = int(sys.argv[3])

data = json.loads(marketplace_path.read_text(encoding="utf-8"))
plugins = data.get("plugins")
if not isinstance(plugins, list):
    raise SystemExit("FAIL: marketplace plugins must be an array")
if len(plugins) != expected_count:
    raise SystemExit(
        f"FAIL: expected {expected_count} marketplace plugins, found {len(plugins)}"
    )

expected = {path.parent.name for path in (repo_root / "skills").glob("*/SKILL.md")}
found: set[str] = set()
for plugin in plugins:
    if not isinstance(plugin, dict):
        raise SystemExit("FAIL: every marketplace plugin must be an object")
    name = plugin.get("name")
    description = plugin.get("description")
    source = plugin.get("source")
    skills = plugin.get("skills")
    if not isinstance(name, str) or not name:
        raise SystemExit("FAIL: marketplace plugin is missing name")
    if name in found:
        raise SystemExit(f"FAIL: duplicate marketplace plugin: {name}")
    if not isinstance(description, str) or not description:
        raise SystemExit(f"FAIL: {name}: missing description")
    if source != "./":
        raise SystemExit(f"FAIL: {name}: source must be './', got {source!r}")
    if skills != [f"./skills/{name}"]:
        raise SystemExit(
            f"FAIL: {name}: skills must contain only './skills/{name}', got {skills!r}"
        )
    if not (repo_root / "skills" / name / "SKILL.md").is_file():
        raise SystemExit(f"FAIL: {name}: referenced SKILL.md does not exist")
    found.add(name)

if found != expected:
    missing = sorted(expected - found)
    extra = sorted(found - expected)
    raise SystemExit(f"FAIL: marketplace/skills mismatch; missing={missing}, extra={extra}")

print(f"  OK marketplace maps all {len(found)} skills exactly once")
PY

if [ "${CLAUDE_REAL_CHECK:-0}" = "1" ]; then
  command -v claude >/dev/null 2>&1 \
    || fail "CLAUDE_REAL_CHECK=1 but claude is not on PATH"
  echo "  Claude: $(claude --version)"
  claude plugin validate --strict "$REPO_ROOT"
  echo "  OK Claude CLI strict marketplace/plugin validation"
fi

echo "OK: Claude Code adapter checks passed"
