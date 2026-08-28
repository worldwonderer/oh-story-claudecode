#!/usr/bin/env python3
"""Behavior tests for the Antigravity named-group hook merger."""

from __future__ import annotations

import importlib.util
import json
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "skills/story-setup/scripts/merge-antigravity-hooks.py"
SPEC = importlib.util.spec_from_file_location("merge_antigravity_hooks", MODULE_PATH)
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def main() -> None:
    existing = {
        "user-checks": {"PreToolUse": [{"matcher": "run_command", "hooks": []}]},
        "oh-story": {"Stop": [{"type": "command", "command": "legacy"}]},
        "metadata": {"owner": "user"},
    }
    template = {"oh-story": {"PreInvocation": [{"type": "command", "command": "current"}]}}
    merged = MODULE.merge(existing, template)
    assert merged["oh-story"] == template["oh-story"]
    assert merged["user-checks"] == existing["user-checks"]
    assert merged["metadata"] == existing["metadata"]
    assert MODULE.merge(merged, template) == merged

    with tempfile.TemporaryDirectory(prefix="oh-story-antigravity-merge-") as directory:
        target = Path(directory) / ".agents/hooks.json"
        target.parent.mkdir(parents=True)
        target.write_text(json.dumps(existing), encoding="utf-8")
        target.chmod(0o640)
        MODULE.atomic_write(target, merged)
        assert json.loads(target.read_text(encoding="utf-8")) == merged
        assert target.stat().st_mode & 0o777 == 0o640

    try:
        MODULE.merge({}, {"other": {}})
    except MODULE.MergeError:
        pass
    else:
        raise AssertionError("template without object-valued oh-story must fail")

    print("Antigravity hook merge tests passed.")


if __name__ == "__main__":
    main()
