#!/usr/bin/env python3
"""Mutation regressions for the scan/browser static policy guard."""

from __future__ import annotations

from pathlib import Path
import shutil
import subprocess
import tempfile


ROOT = Path(__file__).resolve().parents[1]


def make_fixture(destination: Path) -> None:
    (destination / "scripts").mkdir()
    shutil.copy2(ROOT / "scripts/check-scan-runtime-policy.sh", destination / "scripts")
    for relative in (
        "skills/story-long-scan/scripts",
        "skills/story-short-scan/scripts",
    ):
        shutil.copytree(ROOT / relative, destination / relative)
    setup_dir = destination / "skills/browser-cdp/scripts"
    setup_dir.mkdir(parents=True)
    shutil.copy2(
        ROOT / "skills/browser-cdp/scripts/setup-cdp-chrome.js",
        setup_dir,
    )


def run_guard(fixture: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["bash", str(fixture / "scripts/check-scan-runtime-policy.sh")],
        text=True,
        capture_output=True,
        check=False,
    )


def require_rejection(label: str, mutate, expected: str) -> None:
    with tempfile.TemporaryDirectory() as raw:
        fixture = Path(raw)
        make_fixture(fixture)
        mutate(fixture)
        result = run_guard(fixture)
        if result.returncode == 0 or expected not in result.stderr:
            raise AssertionError(
                f"{label} mutation escaped policy guard:\n{result.stdout}\n{result.stderr}"
            )


def mutate_filename_with_dead_local_date(fixture: Path) -> None:
    target = fixture / "skills/story-long-scan/scripts/qidian-rank-scraper.js"
    source = target.read_text(encoding="utf-8")
    source = source.replace(
        "`起点${rtInfo.label}_${localDateStamp()}.md`",
        "`起点${rtInfo.label}_fixed.md`",
        1,
    )
    target.write_text(source + "\nvoid localDateStamp();\n", encoding="utf-8")


def mutate_http_get_with_dead_safe_call(fixture: Path) -> None:
    target = fixture / "skills/browser-cdp/scripts/setup-cdp-chrome.js"
    source = target.read_text(encoding="utf-8")
    source = source.replace("agent: false", "agent: true", 1)
    source += '\nhttp.get("http://unused.invalid", { agent: false });\n'
    target.write_text(source, encoding="utf-8")


def main() -> None:
    with tempfile.TemporaryDirectory() as raw:
        fixture = Path(raw)
        make_fixture(fixture)
        baseline = run_guard(fixture)
        if baseline.returncode != 0:
            raise AssertionError(f"baseline policy guard failed:\n{baseline.stderr}")

    require_rejection(
        "fixed filename plus dead localDateStamp",
        mutate_filename_with_dead_local_date,
        "output filename assignment must call localDateStamp() directly",
    )
    require_rejection(
        "keep-alive probe plus dead agent:false call",
        mutate_http_get_with_dead_safe_call,
        "CDP probes must disable the keep-alive agent",
    )
    print("PASS: scan runtime policy guard rejects dead-occurrence false negatives")


if __name__ == "__main__":
    main()
