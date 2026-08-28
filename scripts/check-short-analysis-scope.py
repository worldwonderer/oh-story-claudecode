#!/usr/bin/env python3
"""Keep short-analysis rubrics observational and free of long-form playbooks."""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path


NEW_REFERENCES = (
    "analysis-short-genres.md",
    "analysis-short-patterns.md",
    "analysis-short-mechanics.md",
    "analysis-short-suspense.md",
    "analysis-short-hooks.md",
)
LEGACY_REFERENCES = (
    "analysis-genre-catalog.md",
    "analysis-genre-formulas.md",
    "analysis-genre-mechanics.md",
    "analysis-suspense.md",
    "analysis-chapter-hooks.md",
)
FORBIDDEN = re.compile(
    r"黄金三章|前\s*3\s*章|8\s*节点|五阶段|每章必备|"
    r"事业线是长篇骨架|10\s*万字|写长方法|多轮副本|跨卷运转"
)
PERCENT = re.compile(r"\d+(?:\.\d+)?\s*%")
WRITING_HEADING = re.compile(r"^#{1,6}\s+.*(?:写作公式|创作流程|写法步骤|大纲检查)")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    root = args.root.resolve()
    skill = root / "skills/story-short-analyze"
    references = skill / "references"
    entrypoint = skill / "SKILL.md"
    failures: list[str] = []

    if not entrypoint.is_file():
        print("ERROR: story-short-analyze/SKILL.md missing", file=sys.stderr)
        return 2
    skill_text = entrypoint.read_text(encoding="utf-8")

    for name in LEGACY_REFERENCES:
        if (references / name).exists():
            failures.append(f"legacy mixed analysis reference still exists: {name}")
        if name in skill_text:
            failures.append(f"SKILL.md still routes to legacy mixed reference: {name}")

    for name in NEW_REFERENCES:
        path = references / name
        if not path.is_file():
            failures.append(f"short analysis reference missing: {name}")
            continue
        if f"references/{name}" not in skill_text:
            failures.append(f"SKILL.md does not route to short analysis reference: {name}")
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
            if FORBIDDEN.search(line):
                failures.append(f"{name}:{number}: long-form playbook token: {line.strip()}")
            if PERCENT.search(line):
                failures.append(f"{name}:{number}: prescribed percentage in observation rubric: {line.strip()}")
            if WRITING_HEADING.search(line):
                failures.append(f"{name}:{number}: writing-oriented heading: {line.strip()}")

    if failures:
        print("SHORT ANALYSIS SCOPE VIOLATIONS")
        for failure in failures:
            print(f"  {failure}")
        return 1

    print("Short analysis scope: 5 observational rubrics; no legacy long-form playbook tokens")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
