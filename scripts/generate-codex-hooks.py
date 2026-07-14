#!/usr/bin/env python3
"""Generate Codex hook registration JSON from one event manifest."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DEST = REPO_ROOT / "skills/story-setup/references/codex/hooks/hooks.json"

HOOKS = [
    ("SessionStart", "startup|resume|clear|compact", "session-start", 10, "Loading story context"),
    ("PreToolUse", "Bash|apply_patch|Edit|Write", "pre-tool-prose-guard", 10, "Checking story outline guard"),
    ("PreToolUse", "Bash", "pre-tool-commit-advisory", 15, "Checking story commit warnings"),
    ("PreCompact", "manual|auto", "pre-compact", 10, "Summarizing story context"),
    ("PostCompact", "manual|auto", "post-compact", 10, "Restoring story context hint"),
    ("Stop", None, "stop", 5, None),
]


def posix_command(event: str) -> str:
    return (
        'ROOT="${CODEX_PROJECT_DIR:-${CLAUDE_PROJECT_DIR:-$PWD}}"; '
        '[ -d "$ROOT" ] || ROOT="$PWD"; '
        'ROOT="$(cd "$ROOT" 2>/dev/null && pwd)" || exit 0; '
        'while [ ! -f "$ROOT/.codex/hooks/run-story-hook.sh" ]; do '
        'PARENT="$(dirname "$ROOT")"; [ "$PARENT" != "$ROOT" ] || exit 0; ROOT="$PARENT"; '
        'done; '
        f'sh "$ROOT/.codex/hooks/run-story-hook.sh" {event}'
    )


def windows_command(event: str) -> str:
    script = (
        "$r=$env:CODEX_PROJECT_DIR; "
        "if (-not $r) { $r=$env:CLAUDE_PROJECT_DIR }; "
        "if (-not $r -or -not (Test-Path -LiteralPath $r -PathType Container)) { $r=(Get-Location).Path }; "
        "while ($true) { "
        "$launcher=Join-Path $r '.codex\\hooks\\run-story-hook.cmd'; "
        f"if (Test-Path -LiteralPath $launcher -PathType Leaf) {{ & $launcher '{event}'; exit $LASTEXITCODE }}; "
        "$parent=Split-Path -Parent $r; "
        "if (-not $parent -or $parent -eq $r) { exit 0 }; "
        "$r=$parent "
        "}"
    )
    return f'powershell -NoProfile -ExecutionPolicy Bypass -Command "{script}"'


def build_document() -> dict[str, object]:
    events: dict[str, list[dict[str, object]]] = {}
    for event_name, matcher, handler, timeout, status_message in HOOKS:
        command: dict[str, object] = {
            "type": "command",
            "command": posix_command(handler),
            "timeout": timeout,
            "commandWindows": windows_command(handler),
        }
        if status_message:
            command["statusMessage"] = status_message
        block: dict[str, object] = {"hooks": [command]}
        if matcher:
            block["matcher"] = matcher
        events.setdefault(event_name, []).append(block)
    return {"hooks": events}


def rendered() -> str:
    return json.dumps(build_document(), ensure_ascii=False, indent=2) + "\n"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dest", type=Path, default=DEFAULT_DEST)
    parser.add_argument("--check", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    expected = rendered()
    if args.check:
        try:
            actual = args.dest.read_text(encoding="utf-8")
        except OSError as exc:
            print(f"ERROR: unable to read {args.dest}: {exc}", file=sys.stderr)
            return 1
        if actual != expected:
            print(f"ERROR: stale generated hooks file: {args.dest}", file=sys.stderr)
            print("Run: python3 scripts/generate-codex-hooks.py", file=sys.stderr)
            return 1
        print(f"OK: generated hooks are current ({len(HOOKS)} registrations)")
        return 0

    args.dest.parent.mkdir(parents=True, exist_ok=True)
    args.dest.write_text(expected, encoding="utf-8", newline="\n")
    print(f"Wrote {args.dest} ({len(HOOKS)} registrations)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
