#!/usr/bin/env python3
"""Merge the managed oh-story Antigravity hook group atomically.

Antigravity's workspace hooks file is a top-level mapping of named hook groups.
story-setup owns only the ``oh-story`` key and preserves every user group.
"""

from __future__ import annotations

import argparse
import json
import os
import stat
import tempfile
from pathlib import Path
from typing import Any


class MergeError(ValueError):
    pass


def load_object(path: Path, *, missing_ok: bool) -> dict[str, Any]:
    if missing_ok and not path.exists():
        return {}
    try:
        value = json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, json.JSONDecodeError) as exc:
        raise MergeError(f"cannot read valid JSON object from {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise MergeError(f"expected a JSON object in {path}")
    return value


def merge(existing: dict[str, Any], template: dict[str, Any]) -> dict[str, Any]:
    managed = template.get("oh-story")
    if not isinstance(managed, dict):
        raise MergeError("template must contain an object-valued oh-story group")
    result = dict(existing)
    result["oh-story"] = managed
    return result


def atomic_write(path: Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    mode = stat.S_IMODE(path.stat().st_mode) if path.exists() else 0o644
    descriptor, temporary = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as handle:
            json.dump(value, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temporary, mode)
        os.replace(temporary, path)
    finally:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("existing", type=Path)
    parser.add_argument("template", type=Path)
    args = parser.parse_args()
    existing = load_object(args.existing, missing_ok=True)
    template = load_object(args.template, missing_ok=False)
    atomic_write(args.existing, merge(existing, template))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
