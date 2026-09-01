#!/usr/bin/env python3
"""Runtime regressions for the mechanical long-analysis index."""

from __future__ import annotations

import csv
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parent.parent
BUILD_SCRIPT = REPO_ROOT / "skills/story-long-analyze/scripts/build_chapter_index.py"
CHAPTER_COLUMNS = ("chapter", "title", "source_locator", "char_count", "status")


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def run(*args: object) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, *(str(arg) for arg in args)],
        text=True,
        encoding="utf-8",
        env={**os.environ, "PYTHONIOENCODING": "utf-8"},
        capture_output=True,
        check=False,
    )



def test_mechanical_index_is_single_write_and_resumable() -> None:
    with tempfile.TemporaryDirectory(prefix="story-index-v4-") as temp:
        root = Path(temp)
        source = root / "小说.txt"
        output = root / "chapter_index.csv"
        progress = root / "_progress.json"
        snapshot = root / "_state_snapshot.json"
        source.write_text(
            "第一章\n开篇内容。\n\n第二章 有标题\n推进内容。\n\nChapter 3\n转折内容。\n\n第四章：收束\n收束内容。\n",
            encoding="utf-8",
        )
        base_args = (
            BUILD_SCRIPT,
            "--source",
            source,
            "--output",
            output,
            "--progress",
            progress,
            "--snapshot",
            snapshot,
            "--locator-path",
            "原文/小说.txt",
        )
        stage0_args = (
            BUILD_SCRIPT,
            "--mode",
            "boundaries",
            "--source",
            source,
            "--progress",
            progress,
            "--snapshot",
            snapshot,
            "--locator-path",
            "原文/小说.txt",
        )
        stage0 = run(*stage0_args)
        require(stage0.returncode == 0, "Stage 0 boundary build failed")
        require(not output.exists(), "Stage 0 must not create chapter_index.csv")
        paused = json.loads(progress.read_text(encoding="utf-8"))
        paused.update(
            {
                "current_stage": "paused_after_stage1",
                "last_committed_batch": "golden_chapters",
                "completed_ranges": paused["completed_ranges"] + ["1-3:golden_chapters"],
                "pending_ranges": ["stage_2_index"],
                "next_action": "stage_2_index",
            }
        )
        saved_snapshot = json.loads(snapshot.read_text(encoding="utf-8"))
        saved_snapshot["aliases"] = {"林雷": ["主角"]}
        snapshot.write_text(json.dumps(saved_snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        import hashlib
        paused["artifact_checksums"]["_state_snapshot.json"] = hashlib.sha256(snapshot.read_bytes()).hexdigest()
        progress.write_text(json.dumps(paused, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        first = run(*base_args)
        require(first.returncode == 0, "first index build failed: {}".format(first.stderr or first.stdout))
        first_payload = json.loads(first.stdout)
        require(first_payload.get("reused") is False and first_payload.get("chapters") == 4, "bare chapter headings must be indexed")
        committed = json.loads(progress.read_text(encoding="utf-8"))
        require("1-3:golden_chapters" in committed["completed_ranges"], "Stage 2 must preserve the Stage 1 checkpoint")
        require(json.loads(snapshot.read_text(encoding="utf-8"))["aliases"] == {"林雷": ["主角"]}, "Stage 2 must not overwrite the Stage 0/1 snapshot")
        with output.open("r", encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle)
            rows = list(reader)
            header = tuple(reader.fieldnames or ())
        require(header == CHAPTER_COLUMNS, "chapter index must contain only five mechanical columns")
        require(len(rows) == 4, "all four fixture chapters must be indexed")
        before = (output.stat().st_mtime_ns, output.read_bytes())
        second = run(*base_args)
        require(second.returncode == 0, "same-source rerun must succeed")
        require(json.loads(second.stdout).get("reused") is True, "same hashes must reuse the index")
        after = (output.stat().st_mtime_ns, output.read_bytes())
        require(after == before, "reuse must not rewrite chapter_index.csv")

        tampered = output.read_text(encoding="utf-8-sig").replace("原文/小说.txt:L1-L3", "原文/小说.txt:L1-L2")
        output.write_text(tampered, encoding="utf-8-sig")
        corrupt = run(*base_args)
        require(corrupt.returncode == 2, "same-row-count index corruption must not be reused")
        require(json.loads(corrupt.stdout).get("error") == "existing_index_incompatible", "corrupt index needs explicit repair")
        repaired = run(*base_args, "--rebuild")
        require(repaired.returncode == 0, "explicit rebuild must repair a corrupt index")

        checksum_progress = json.loads(progress.read_text(encoding="utf-8"))
        checksum_progress["artifact_checksums"]["chapter_index.csv"] = "0" * 64
        progress.write_text(json.dumps(checksum_progress, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        bad_checksum = run(*base_args)
        require(bad_checksum.returncode == 2, "registered checksum corruption must block reuse")
        require(json.loads(bad_checksum.stdout).get("error") == "artifact_checksum_mismatch", "checksum mismatch must be explicit")
        require(run(*base_args, "--rebuild").returncode == 0, "explicit rebuild must repair checksum registration")

        source.write_text(source.read_text(encoding="utf-8") + "补充一行。\n", encoding="utf-8")
        changed = run(*base_args)
        require(changed.returncode == 2, "changed source must refuse an implicit overwrite")
        require(json.loads(changed.stdout).get("error") in {"existing_index_incompatible", "existing_boundaries_incompatible"}, "source changes need an explicit rebuild")
        rebuilt = run(*base_args, "--rebuild")
        require(rebuilt.returncode == 0 and not json.loads(rebuilt.stdout).get("reused"), "explicit rebuild must refresh the index")
        require(json.loads(progress.read_text(encoding="utf-8"))["schema_version"] == 4, "progress must use schema v4")
        require(json.loads(progress.read_text(encoding="utf-8"))["contract_version"] == "5.0", "analysis contract must use v5.0")
        require(json.loads(snapshot.read_text(encoding="utf-8"))["schema_version"] == 4, "snapshot must use schema v4")

        invalid = root / "跳章.txt"
        invalid.write_text("第一章\n一。\n第三章\n三。\n第二卷第一章\n重置。\n", encoding="utf-8")
        rejected = run(
            BUILD_SCRIPT,
            "--source", invalid,
            "--output", root / "invalid.csv",
            "--progress", root / "invalid-progress.json",
            "--snapshot", root / "invalid-snapshot.json",
        )
        require(rejected.returncode == 2 and "chapter_number_gap" in json.loads(rejected.stdout).get("error", ""), "jumped chapter numbers must be rejected")

        volumes = root / "多卷.txt"
        volumes.write_text("第一卷 起点\n第一章\n一。\n第二章\n二。\n第二卷 新局\n第一章\n三。\n第二章\n四。\n", encoding="utf-8")
        volume_run = run(
            BUILD_SCRIPT,
            "--source", volumes,
            "--output", root / "volumes.csv",
            "--progress", root / "volumes-progress.json",
            "--snapshot", root / "volumes-snapshot.json",
        )
        require(volume_run.returncode == 0, "explicit volume boundaries may reset local chapter numbers")


def main() -> int:
    test_mechanical_index_is_single_write_and_resumable()
    print("OK: long-analyze contract v5 runtime regressions passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
