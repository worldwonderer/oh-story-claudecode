#!/usr/bin/env python3
"""Regression tests for explicit reference governance and consumer reachability."""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
CHECKER = SCRIPT_DIR / "shared-references.py"
CONSUMERS = SCRIPT_DIR / "check-agent-reference-consumers.py"
SIMILARITY = SCRIPT_DIR / "check-reference-similarity.py"
SHORT_ANALYSIS = SCRIPT_DIR / "check-short-analysis-scope.py"


def write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def run(script: Path, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(script), *args],
        text=True,
        capture_output=True,
        check=False,
    )


def manifest(root: Path) -> Path:
    path = root / "shared-references.json"
    path.write_text(
        json.dumps(
            {
                "version": 1,
                "groups": [
                    {
                        "name": "aliased-copy",
                        "source": "skills/a/references/guide.md",
                        "targets": ["skills/b/references/b-guide.md"],
                    }
                ],
                "tree_groups": [
                    {
                        "name": "cards",
                        "source": "skills/a/references/cards",
                        "targets": ["skills/c/references/cards"],
                        "files": ["one.md"],
                    }
                ],
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    return path


def test_reference_manifest() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        write(root / "skills/a/references/guide.md", "guide\n")
        write(root / "skills/b/references/b-guide.md", "guide\n")
        write(root / "skills/a/references/cards/one.md", "card\n")
        write(root / "skills/c/references/cards/one.md", "card\n")
        config = manifest(root)

        result = run(CHECKER, "check", "--root", str(root), "--manifest", str(config))
        assert result.returncode == 0, result.stdout + result.stderr

        write(root / "skills/b/references/b-guide.md", "drift\n")
        result = run(CHECKER, "check", "--root", str(root), "--manifest", str(config))
        assert result.returncode == 1 and "DRIFT" in result.stdout
        result = run(CHECKER, "sync", "--root", str(root), "--manifest", str(config))
        assert result.returncode == 0
        assert (root / "skills/b/references/b-guide.md").read_text() == "guide\n"

        write(root / "skills/d/references/unmanaged.md", "guide\n")
        result = run(CHECKER, "check", "--root", str(root), "--manifest", str(config))
        assert result.returncode == 1
        assert "UNMANAGED EXACT REFERENCE COPY" in result.stdout

        write(root / "skills/a/references/cards/two.md", "new card\n")
        result = run(CHECKER, "check", "--root", str(root), "--manifest", str(config))
        assert result.returncode == 2
        assert "undeclared source files: two.md" in result.stderr


def test_agent_reference_reachability() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        base = root / "skills/story-setup/references"
        write(
            base / "templates/agents/story-architect.md",
            "read story-setup/references/agent-references/agent-reference-profiles.md\n",
        )
        write(
            base / "agent-references/agent-reference-profiles.md",
            """# Profile contract

## Common
| file | condition |
|---|---|
| [index.md](index.md) | always |

## Long profile
| file | condition |
|---|---|
| [long-guide.md](long-guide.md) | long |

## Short profile
| file | condition |
|---|---|
| [short-guide.md](short-guide.md) | short |
""",
        )
        write(
            base / "agent-references/index.md",
            "[detail](details/detail.md)\n",
        )
        write(base / "agent-references/details/detail.md", "reachable\n")
        write(base / "agent-references/long-guide.md", "long\n")
        write(base / "agent-references/short-guide.md", "short\n")
        result = run(CONSUMERS, "--root", str(root))
        assert result.returncode == 0, result.stdout + result.stderr

        write(base / "agent-references/orphan.md", "orphan\n")
        result = run(CONSUMERS, "--root", str(root))
        assert result.returncode == 1
        assert "orphan.md" in result.stdout


def test_reference_similarity_declarations() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        lines = [f"shared governance sentence number {index:02d}" for index in range(15)]
        write(root / "skills/a/references/guide.md", "\n".join(lines) + "\n")
        write(
            root / "skills/b/references/derived.md",
            "\n".join(lines[:-1] + ["derived consumer sentence differs here"]) + "\n",
        )
        config = root / "shared-references.json"
        config.write_text('{"version": 1, "groups": [], "tree_groups": []}', encoding="utf-8")
        result = run(SIMILARITY, "--root", str(root), "--manifest", str(config))
        assert result.returncode == 1
        assert "UNDECLARED NEAR-IDENTICAL" in result.stdout

        config.write_text(
            json.dumps(
                {
                    "version": 1,
                    "groups": [],
                    "tree_groups": [],
                    "derived_groups": [
                        {
                            "name": "guide-derivative",
                            "reason": "different consumer contract",
                            "members": [
                                "skills/a/references/guide.md",
                                "skills/b/references/derived.md",
                            ],
                        }
                    ],
                }
            ),
            encoding="utf-8",
        )
        result = run(SIMILARITY, "--root", str(root), "--manifest", str(config))
        assert result.returncode == 0, result.stdout + result.stderr


def test_short_analysis_scope() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        skill = root / "skills/story-short-analyze"
        write(
            skill / "SKILL.md",
            "\n".join(f"read references/{name}" for name in (
                "analysis-short-genres.md",
                "analysis-short-patterns.md",
                "analysis-short-mechanics.md",
                "analysis-short-suspense.md",
                "analysis-short-hooks.md",
            )),
        )
        for name in (
            "analysis-short-genres.md",
            "analysis-short-patterns.md",
            "analysis-short-mechanics.md",
            "analysis-short-suspense.md",
            "analysis-short-hooks.md",
        ):
            write(skill / "references" / name, "# 源文观察\n\n按位置报告证据与作用。\n")

        result = run(SHORT_ANALYSIS, "--root", str(root))
        assert result.returncode == 0, result.stdout + result.stderr

        write(
            skill / "references/analysis-short-patterns.md",
            "# 源文观察\n\n每章必备一种爽点，推荐结构为 40%。\n",
        )
        result = run(SHORT_ANALYSIS, "--root", str(root))
        assert result.returncode == 1
        assert "long-form playbook token" in result.stdout
        assert "prescribed percentage" in result.stdout


def main() -> int:
    test_reference_manifest()
    test_agent_reference_reachability()
    test_reference_similarity_declarations()
    test_short_analysis_scope()
    print("PASS: shared reference manifest and deployed consumer guards")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
