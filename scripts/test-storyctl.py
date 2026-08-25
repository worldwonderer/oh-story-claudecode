#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import json
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
STORYCTL_PATH = ROOT / "skills/story-long-write/scripts/storyctl.py"
SPEC = importlib.util.spec_from_file_location("storyctl", STORYCTL_PATH)
assert SPEC and SPEC.loader
storyctl = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(storyctl)


def run_cli(*arguments: str) -> tuple[subprocess.CompletedProcess[str], dict[str, object]]:
    completed = subprocess.run(
        [sys.executable, str(STORYCTL_PATH), *arguments],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )
    try:
        payload = json.loads(completed.stdout)
    except json.JSONDecodeError as error:
        raise AssertionError(
            f"CLI did not return JSON: exit={completed.returncode} stdout={completed.stdout!r} stderr={completed.stderr!r}"
        ) from error
    return completed, payload


class VisibleCharsTests(unittest.TestCase):
    def test_frozen_unicode_counting_contract(self) -> None:
        self.assertEqual(storyctl.count_visible_chars("甲\n乙"), 2)
        self.assertEqual(storyctl.count_visible_chars("甲\r\n乙"), 2)
        self.assertEqual(storyctl.count_visible_chars("甲\r乙"), 2)
        self.assertEqual(storyctl.count_visible_chars("中文"), 2)
        self.assertEqual(storyctl.count_visible_chars("😀"), 1)
        self.assertEqual(storyctl.count_visible_chars("e\u0301"), 2)
        self.assertEqual(storyctl.count_visible_chars("\ufeff正文"), 2)
        self.assertEqual(storyctl.count_visible_chars("正文\ufeff"), 3)
        self.assertEqual(storyctl.count_visible_chars("中文，。！"), 5)

        whitespace = "".join(
            chr(codepoint)
            for codepoint in [
                *range(0x0009, 0x000E),
                0x0020,
                0x0085,
                0x00A0,
                0x1680,
                *range(0x2000, 0x200B),
                0x2028,
                0x2029,
                0x202F,
                0x205F,
                0x3000,
            ]
        )
        self.assertEqual(storyctl.count_visible_chars(f"甲{whitespace}乙"), 2)

    def test_frontmatter_and_first_heading_are_not_body(self) -> None:
        body = "\ufeff---\r\ntitle: 第一章\r\ntags:\r\n  - test\r\n---\r\n# 第一章 标题\r\n正文😀\r\n"
        self.assertEqual(storyctl.count_visible_chars(body), 3)
        self.assertEqual(storyctl.count_visible_chars("---\n场景转换\n---\n正文"), 12)
        self.assertEqual(storyctl.count_visible_chars("# 第一章\n正文\n## 中段标题"), 8)

    def test_bands_and_status_boundaries(self) -> None:
        self.assertEqual(
            storyctl.compute_wordcount_bands(1200),
            {"internal": {"min": 1056, "max": 1344}, "user": {"min": 1020, "max": 1380}},
        )
        self.assertEqual(
            storyctl.compute_wordcount_bands(1001),
            {"internal": {"min": 881, "max": 1121}, "user": {"min": 851, "max": 1151}},
        )

        def status(actual: int) -> str:
            return storyctl.evaluate_wordcount("字" * actual, 1200)["status"]

        self.assertEqual(status(1056), "internal_pass")
        self.assertEqual(status(1344), "internal_pass")
        self.assertEqual(status(1055), "borderline")
        self.assertEqual(status(1020), "borderline")
        self.assertEqual(status(1345), "borderline")
        self.assertEqual(status(1380), "borderline")
        self.assertEqual(status(1019), "under")
        self.assertEqual(status(1381), "over")
        self.assertEqual(storyctl.evaluate_wordcount("", 1200)["invalid_reason"], "EMPTY_BODY")
        self.assertEqual(storyctl.evaluate_wordcount("正文", "12.5")["invalid_reason"], "INVALID_TARGET")
        self.assertEqual(
            storyctl.evaluate_wordcount("正文", "9007199254740992")["invalid_reason"],
            "INVALID_TARGET",
        )


class CheckpointTests(unittest.TestCase):
    def test_checkpoint_reports_only_current_count_and_remaining_user_range(self) -> None:
        result = storyctl.checkpoint_wordcount("字" * 558, 2200, chapter=28)
        self.assertEqual(result["schema"], "story-wordcount-checkpoint/v1")
        self.assertEqual(result["actual"], 558)
        self.assertEqual(result["user_band"], {"min": 1870, "max": 2530})
        self.assertEqual(result["remaining_user_range"], {"min": 1312, "max": 1972})
        self.assertNotIn("beats", result)
        self.assertNotIn("resolution", result)

    def test_commit_record_has_no_event_or_approval_chain(self) -> None:
        with tempfile.TemporaryDirectory(prefix="storyctl-record-") as directory:
            project = Path(directory)
            (project / "大纲").mkdir()
            (project / "正文").mkdir()
            (project / "大纲/细纲_第001章.md").write_text(
                "- 字数目标：1000 字\n- 字数口径：visible_chars_v1\n", encoding="utf-8"
            )
            (project / "正文/第001章_测试.md").write_text(
                "# 第1章\n" + "字" * 800, encoding="utf-8"
            )
            record = storyctl.build_project_wordcount_record(
                project, 1, resolution="accepted_current_length"
            )
        self.assertEqual(
            set(record),
            {"metric", "target", "actual", "status", "resolution", "body_sha256"},
        )
        self.assertEqual(record["status"], "under")
        self.assertEqual(record["resolution"], "accepted_current_length")


class StoryctlCliTests(unittest.TestCase):
    def test_wordcount_measure_returns_actual_without_a_target(self) -> None:
        with tempfile.TemporaryDirectory(prefix="storyctl-measure-") as directory:
            body = Path(directory) / "chapter.md"
            body.write_text("# 第一章\n正文 😀", encoding="utf-8")
            completed, result = run_cli(
                "wordcount", "measure", "--file", str(body), "--chapter", "1"
            )

        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertEqual(result["schema"], "story-wordcount-measurement/v1")
        self.assertEqual(result["metric"], "visible_chars_v1")
        self.assertEqual(result["actual"], 3)
        self.assertEqual(result["status"], "measured")

    def test_wordcount_check_returns_structured_result(self) -> None:
        with tempfile.TemporaryDirectory(prefix="storyctl-check-") as directory:
            body = Path(directory) / "chapter.md"
            body.write_text("# 第一章\n" + "字" * 1020, encoding="utf-8")
            completed, result = run_cli(
                "wordcount",
                "check",
                "--file",
                str(body),
                "--target",
                "1200",
                "--chapter",
                "1",
                "--case-id",
                "boundary",
            )

        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertEqual(result["schema"], "story-wordcount-result/v1")
        self.assertEqual(result["metric"], "visible_chars_v1")
        self.assertEqual(result["chapter"], "1")
        self.assertEqual(result["case_id"], "boundary")
        self.assertEqual(result["actual"], 1020)
        self.assertEqual(result["status"], "borderline")
        self.assertEqual(result["internal_band"], {"min": 1056, "max": 1344, "status": "fail"})
        self.assertEqual(result["user_band"], {"min": 1020, "max": 1380, "status": "pass"})

    def test_wordcount_checkpoint_is_a_pure_measurement(self) -> None:
        with tempfile.TemporaryDirectory(prefix="storyctl-checkpoint-") as directory:
            body = Path(directory) / "segment.md"
            body.write_text("# 前半段\n" + "字" * 558, encoding="utf-8")
            completed, result = run_cli(
                "wordcount", "checkpoint", "--file", str(body), "--target", "2200", "--chapter", "28"
            )
        self.assertEqual(completed.returncode, 0, completed.stderr)
        self.assertEqual(result["actual"], 558)
        self.assertEqual(result["remaining_user_range"], {"min": 1312, "max": 1972})

    def test_cli_errors_are_json_and_nonzero(self) -> None:
        completed, result = run_cli("wordcount", "check", "--file", "missing.md", "--target", "1200")
        self.assertEqual(completed.returncode, 2)
        self.assertEqual(result["status"], "invalid")
        self.assertEqual(result["invalid_reason"], "INVALID_FILE")

        completed, result = run_cli("unknown-command")
        self.assertEqual(completed.returncode, 2)
        self.assertEqual(result["invalid_reason"], "INVALID_ARGUMENT")

    def test_demo_outlines_and_bodies_use_the_same_metric(self) -> None:
        book = ROOT / "demo/长篇/让你管账号，你高燃混剪炸全网"
        outlines = sorted((book / "大纲").glob("细纲_第*.md"))
        self.assertEqual(len(outlines), 20)
        for outline in outlines:
            outline_text = outline.read_text(encoding="utf-8")
            target_matches = re.findall(r"^- 字数目标：([1-9]\d*) 字$", outline_text, re.MULTILINE)
            metric_matches = re.findall(r"^- 字数口径：([^\n]+)$", outline_text, re.MULTILINE)
            self.assertEqual(len(target_matches), 1, outline.name)
            self.assertEqual(metric_matches, ["visible_chars_v1"], outline.name)

            chapter = outline.stem.removeprefix("细纲_第").removesuffix("章")
            bodies = list((book / "正文").glob(f"第{chapter}章_*"))
            self.assertEqual(len(bodies), 1, outline.name)
            completed, result = run_cli(
                "wordcount",
                "check",
                "--file",
                str(bodies[0]),
                "--target",
                target_matches[0],
                "--chapter",
                chapter,
            )
            self.assertEqual(completed.returncode, 0, f"{outline.name}: {completed.stderr}")
            self.assertEqual(result["status"], "internal_pass", outline.name)
            self.assertEqual(result["target"], result["actual"], outline.name)


if __name__ == "__main__":
    unittest.main()
