#!/usr/bin/env python3
"""Reject undeclared near-identical Markdown references across skills."""

from __future__ import annotations

import argparse
import hashlib
import itertools
import json
import re
import sys
from collections import defaultdict
from pathlib import Path


JACCARD_THRESHOLD = 0.85
CONTAINMENT_THRESHOLD = 0.95


def normalized_lines(path: Path) -> set[str]:
    return {
        re.sub(r"\s+", " ", line.strip())
        for line in path.read_text(encoding="utf-8").splitlines()
        if len(line.strip()) >= 12
    }


def skill_owner(root: Path, path: Path) -> str | None:
    try:
        relative = path.resolve().relative_to((root / "skills").resolve())
    except ValueError:
        return None
    return relative.parts[0] if len(relative.parts) >= 3 else None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument(
        "--manifest",
        type=Path,
        default=Path(__file__).resolve().with_name("shared-references.json"),
    )
    args = parser.parse_args()
    root = args.root.resolve()
    try:
        data = json.loads(args.manifest.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"SIMILARITY MANIFEST ERROR: {exc}", file=sys.stderr)
        return 2

    acknowledged: set[frozenset[Path]] = set()
    derived_count = 0
    for index, group in enumerate(data.get("derived_groups", [])):
        if not isinstance(group, dict):
            print(f"SIMILARITY MANIFEST ERROR: derived_groups[{index}] must be an object", file=sys.stderr)
            return 2
        name = group.get("name")
        reason = group.get("reason")
        members = group.get("members")
        if not isinstance(name, str) or not name or not isinstance(reason, str) or not reason.strip():
            print(f"SIMILARITY MANIFEST ERROR: derived_groups[{index}] needs name and reason", file=sys.stderr)
            return 2
        if not isinstance(members, list) or len(members) < 2 or not all(isinstance(item, str) for item in members):
            print(f"SIMILARITY MANIFEST ERROR: {name}.members needs at least two paths", file=sys.stderr)
            return 2
        paths = [(root / item).resolve() for item in members]
        missing = [path for path in paths if not path.is_file()]
        if missing:
            print(f"SIMILARITY MANIFEST ERROR: {name} has missing members", file=sys.stderr)
            for path in missing:
                print(f"  {path}", file=sys.stderr)
            return 2
        acknowledged.update(frozenset(pair) for pair in itertools.combinations(paths, 2))
        derived_count += 1

    files: list[tuple[Path, set[str], str]] = []
    for path in sorted((root / "skills").glob("*/references/**/*.md")):
        owner = skill_owner(root, path)
        lines = normalized_lines(path)
        if owner is not None and len(lines) >= 12:
            files.append((path.resolve(), lines, owner))

    inverted: dict[bytes, list[int]] = defaultdict(list)
    for index, (_, lines, _) in enumerate(files):
        for line in lines:
            inverted[hashlib.sha1(line.encode("utf-8")).digest()[:8]].append(index)

    shared_counts: dict[tuple[int, int], int] = defaultdict(int)
    for indexes in inverted.values():
        unique = sorted(set(indexes))
        for left, right in itertools.combinations(unique, 2):
            if files[left][2] != files[right][2]:
                shared_counts[(left, right)] += 1

    unmanaged: list[tuple[float, float, Path, Path]] = []
    for (left_index, right_index), shared in shared_counts.items():
        left_path, left_lines, _ = files[left_index]
        right_path, right_lines, _ = files[right_index]
        if left_path.read_bytes() == right_path.read_bytes():
            continue
        jaccard = shared / len(left_lines | right_lines)
        containment = shared / min(len(left_lines), len(right_lines))
        pair = frozenset((left_path, right_path))
        if (jaccard >= JACCARD_THRESHOLD or containment >= CONTAINMENT_THRESHOLD) and pair not in acknowledged:
            unmanaged.append((jaccard, containment, left_path, right_path))

    if unmanaged:
        print("UNDECLARED NEAR-IDENTICAL CROSS-SKILL REFERENCES")
        for jaccard, containment, left, right in sorted(unmanaged, reverse=True):
            print(f"  J={jaccard:.1%} containment={containment:.1%}")
            print(f"    {left.relative_to(root)}")
            print(f"    {right.relative_to(root)}")
        return 1

    print(
        f"Reference similarity: no undeclared candidates at J>={JACCARD_THRESHOLD:.0%} "
        f"or containment>={CONTAINMENT_THRESHOLD:.0%}; {derived_count} derived groups declared"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

