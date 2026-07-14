#!/usr/bin/env python3
"""Behavior regression for v17 -> current Codex hook registration upgrades."""

from __future__ import annotations

import copy
import importlib.util
import json
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MERGER_PATH = ROOT / "skills/story-setup/scripts/merge-codex-hooks.py"
TEMPLATE_PATH = ROOT / "skills/story-setup/references/codex/hooks/hooks.json"


def load_merger():
    spec = importlib.util.spec_from_file_location("story_codex_hook_merge", MERGER_PATH)
    if spec is None or spec.loader is None:
        raise AssertionError(f"unable to load {MERGER_PATH}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def all_commands(document: dict[str, object]):
    hooks = document.get("hooks", {})
    assert isinstance(hooks, dict)
    for blocks in hooks.values():
        assert isinstance(blocks, list)
        for block in blocks:
            assert isinstance(block, dict)
            commands = block.get("hooks", [])
            assert isinstance(commands, list)
            yield from commands


def legacy_document(template: dict[str, object]) -> dict[str, object]:
    legacy = copy.deepcopy(template)
    for index, hook in enumerate(all_commands(legacy)):
        assert isinstance(hook, dict)
        hook["command"] = (
            'PROJECT_ROOT="$PWD"; HOOK="$PROJECT_ROOT/.codex/hooks/story_codex_hook.py"; '
            f'python3 "$HOOK" legacy-{index}'
        )
        hook["commandWindows"] = (
            "if exist .codex\\hooks\\story_codex_hook.py "
            f"python .codex\\hooks\\story_codex_hook.py legacy-{index}"
        )
    legacy["approval_policy"] = "on-request"
    first_block = legacy["hooks"]["PreToolUse"][0]
    first_block["hooks"].append(
        {"type": "command", "command": "./user-check.sh", "timeout": 3}
    )
    legacy["hooks"]["UserEvent"] = [
        {"matcher": "custom", "hooks": [{"type": "command", "command": "./custom.sh"}]}
    ]
    return legacy


def main() -> None:
    merger = load_merger()
    template = json.loads(TEMPLATE_PATH.read_text(encoding="utf-8"))
    legacy = legacy_document(template)

    merged = merger.merge_documents(legacy, template)
    commands = list(all_commands(merged))
    rendered = json.dumps(merged, ensure_ascii=False)
    assert "story_codex_hook.py" not in rendered
    assert sum(merger.is_story_setup_hook(command) for command in commands) == 6
    assert sum(command.get("command") == "./user-check.sh" for command in commands) == 1
    assert sum(command.get("command") == "./custom.sh" for command in commands) == 1
    assert merged["approval_policy"] == "on-request"
    assert merger.merge_documents(merged, template) == merged, "merge must be idempotent"

    with tempfile.TemporaryDirectory(prefix="codex-hook-merge-") as tmp:
        root = Path(tmp)
        existing_path = root / "hooks.json"
        output_path = root / "result.json"
        existing_path.write_text(json.dumps(legacy), encoding="utf-8")
        merger.atomic_write_json(output_path, merged)
        assert json.loads(output_path.read_text(encoding="utf-8")) == merged

    try:
        merger.merge_documents({}, {"hooks": []})
    except merger.MergeError:
        pass
    else:
        raise AssertionError("malformed template hooks must fail")

    print("OK: Codex hook merge replaces v17 registrations and preserves user hooks")


if __name__ == "__main__":
    main()
