#!/usr/bin/env python3
"""Behavior regression for the workspace-level author-memory transaction tool."""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any


REPO = Path(__file__).resolve().parents[1]
TOOL = REPO / "skills" / "story" / "scripts" / "author_memory_commit.py"


def run(*args: str, expect: int = 0) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(
        [sys.executable, str(TOOL), *args],
        cwd=REPO,
        text=True,
        encoding="utf-8",
        capture_output=True,
        check=False,
    )
    if result.returncode != expect:
        raise AssertionError(
            f"expected exit {expect}, got {result.returncode}\nstdout={result.stdout}\nstderr={result.stderr}"
        )
    return result


def write_json(path: Path, document: object) -> None:
    path.write_text(json.dumps(document, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def transaction(transaction_id: str, revision: int, operations: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "schema_version": 1,
        "transaction_id": transaction_id,
        "expected_state_revision": revision,
        "operations": operations,
    }


def preference(
    assertion: str,
    quote: str,
    *,
    status: str = "active",
    source: str = "explicit_user",
    scope_level: str = "global",
    scope_value: str | None = None,
    conflicts_with: list[str] | None = None,
) -> dict[str, Any]:
    return {
        "kind": "prose_style",
        "scope": {"level": scope_level, "value": scope_value},
        "assertion": assertion,
        "quote": quote,
        "source_ref": "test:conversation",
        "source": source,
        "confidence": "high" if source == "explicit_user" else "medium",
        "importance": "high",
        "status": status,
        "reason": "behavior regression evidence",
        "conflicts_with": conflicts_with or [],
    }


def replacement(assertion: str, quote: str) -> dict[str, Any]:
    document = preference(assertion, quote, scope_level="book", scope_value="雾港来信")
    document.pop("status")
    document.pop("conflicts_with")
    return document


def snapshot(root: Path) -> dict[str, bytes]:
    return {
        str(path.relative_to(root)): path.read_bytes()
        for path in sorted(root.rglob("*"))
        if path.is_file()
    }


def state(workspace: Path) -> dict[str, Any]:
    path = workspace / ".story" / "作者记忆" / "_author-memory-state.json"
    return json.loads(path.read_text(encoding="utf-8"))


def commit(workspace: Path, input_path: Path, document: dict[str, Any], *, expect: int = 0) -> subprocess.CompletedProcess[str]:
    write_json(input_path, document)
    return run("commit", "--workspace", str(workspace), "--input", str(input_path), expect=expect)


def main() -> None:
    with tempfile.TemporaryDirectory(prefix="author-memory-test-") as temporary:
        workspace = Path(temporary) / "创作工作区"
        workspace.mkdir()
        input_path = Path(temporary) / "transaction.json"
        memory = workspace / ".story" / "作者记忆"

        init_result = run("init", "--workspace", str(workspace))
        assert json.loads(init_result.stdout)["revision"] == 0
        assert {path.name for path in memory.iterdir()} == {
            "_author-memory-state.json",
            "作者画像.md",
            "待确认.md",
            "变更记录.md",
        }
        run("check", "--workspace", str(workspace))

        first = transaction(
            "tx-active",
            0,
            [{"action": "remember", "preference": preference(
                "对话尽量短，用动作承接情绪，不用大段解释",
                "以后对话都短一点，情绪放动作里，别让角色长篇解释。",
            )}],
        )
        commit(workspace, input_path, first)
        current = state(workspace)
        assert current["state_revision"] == 1
        assert current["items"]["AP001"]["status"] == "active"
        assert "AP001" in (memory / "作者画像.md").read_text(encoding="utf-8")

        replay = commit(workspace, input_path, first)
        assert json.loads(replay.stdout)["replayed"] is True
        assert state(workspace)["state_revision"] == 1

        reused = json.loads(json.dumps(first, ensure_ascii=False))
        reused["operations"][0]["preference"]["quote"] = "同一 ID 的不同内容"
        before_failure = snapshot(memory)
        error = commit(workspace, input_path, reused, expect=2)
        assert "different content" in error.stderr
        assert snapshot(memory) == before_failure

        pending = transaction(
            "tx-pending",
            1,
            [{"action": "remember", "preference": preference(
                "倾向用物件细节替代直接心理说明",
                "三次修改都把心理说明换成了桌上的旧物。",
                status="pending",
                source="repeated_correction",
            )}],
        )
        commit(workspace, input_path, pending)
        assert state(workspace)["items"]["AP002"]["status"] == "pending"
        assert "AP002" in (memory / "待确认.md").read_text(encoding="utf-8")

        invalid_inference = transaction(
            "tx-invalid-inference",
            2,
            [{"action": "remember", "preference": preference(
                "推断出的习惯不能直接生效",
                "从成稿里看起来如此。",
                source="inferred_pattern",
            )}],
        )
        before_failure = snapshot(memory)
        error = commit(workspace, input_path, invalid_inference, expect=2)
        assert "must remain pending" in error.stderr
        assert snapshot(memory) == before_failure

        decide = transaction(
            "tx-decide",
            2,
            [{
                "action": "decide",
                "item_id": "AP002",
                "decision": "activate",
                "quote": "对，这也是我的长期习惯。",
                "reason": "author confirmed the candidate",
            }],
        )
        commit(workspace, input_path, decide)
        assert state(workspace)["items"]["AP002"]["status"] == "active"

        conflict = transaction(
            "tx-conflict",
            3,
            [{"action": "remember", "preference": preference(
                "本书允许更长的试探性对话",
                "这本书对话慢一点，多试探几轮。",
                status="conflict",
                scope_level="book",
                scope_value="雾港来信",
                conflicts_with=["AP001"],
            )}],
        )
        commit(workspace, input_path, conflict)
        assert state(workspace)["items"]["AP003"]["status"] == "conflict"

        illegal_activation = transaction(
            "tx-illegal-conflict-activation",
            4,
            [{
                "action": "decide",
                "item_id": "AP003",
                "decision": "activate",
                "quote": "启用它。",
                "reason": "must still use replace",
            }],
        )
        before_failure = snapshot(memory)
        error = commit(workspace, input_path, illegal_activation, expect=2)
        assert "must be activated with replace" in error.stderr
        assert snapshot(memory) == before_failure

        replace = transaction(
            "tx-replace",
            4,
            [{
                "action": "replace",
                "old_ids": ["AP001", "AP003"],
                "preference": replacement(
                    "本书对话允许更长的试探，但避免解释设定",
                    "这本书可以让对话慢一点，多试探，但还是别拿台词讲设定。",
                ),
            }],
        )
        commit(workspace, input_path, replace)
        current = state(workspace)
        assert current["items"]["AP001"]["status"] == "superseded"
        assert current["items"]["AP003"]["status"] == "superseded"
        assert current["items"]["AP004"]["status"] == "active"
        assert current["items"]["AP001"]["superseded_by"] == "AP004"

        forget = transaction(
            "tx-forget",
            5,
            [{
                "action": "forget",
                "item_id": "AP002",
                "quote": "忘掉这个偏好。",
                "reason": "author withdrew it",
            }],
        )
        commit(workspace, input_path, forget)
        assert state(workspace)["items"]["AP002"]["status"] == "superseded"

        reinforce_preference = replacement(
            "本书对话允许更长的试探，但避免解释设定",
            "这本书就按慢对话和少解释继续。",
        )
        reinforce_preference["status"] = "active"
        reinforce_preference["conflicts_with"] = []
        reinforce = transaction(
            "tx-reinforce",
            6,
            [{"action": "remember", "preference": reinforce_preference}],
        )
        commit(workspace, input_path, reinforce)
        current = state(workspace)
        assert current["next_item_number"] == 5
        assert current["items"]["AP004"]["confirmation_count"] == 2
        assert len(current["items"]["AP004"]["evidence"]) == 2

        stale = transaction(
            "tx-stale",
            5,
            [{"action": "forget", "item_id": "AP004", "quote": "旧事务", "reason": "stale"}],
        )
        before_failure = snapshot(memory)
        error = commit(workspace, input_path, stale, expect=2)
        assert "stale state revision" in error.stderr
        assert snapshot(memory) == before_failure

        partial_failure = transaction(
            "tx-partial-failure",
            7,
            [
                {"action": "remember", "preference": preference("不应落盘", "这条事务后面会失败。")},
                {"action": "forget", "item_id": "AP999", "quote": "不存在", "reason": "force rollback"},
            ],
        )
        before_failure = snapshot(memory)
        error = commit(workspace, input_path, partial_failure, expect=2)
        assert "unknown item AP999" in error.stderr
        assert snapshot(memory) == before_failure

        unknown_field = transaction(
            "tx-unknown-field",
            7,
            [{"action": "forget", "item_id": "AP004", "quote": "x", "reason": "x", "extra": True}],
        )
        before_failure = snapshot(memory)
        error = commit(workspace, input_path, unknown_field, expect=2)
        assert "unsupported fields" in error.stderr
        assert snapshot(memory) == before_failure

        profile = memory / "作者画像.md"
        profile.write_text(profile.read_text(encoding="utf-8") + "手工污染\n", encoding="utf-8")
        check_error = run("check", "--workspace", str(workspace), expect=2)
        assert "stale or edited" in check_error.stderr
        replay = commit(workspace, input_path, reinforce)
        assert json.loads(replay.stdout)["replayed"] is True
        run("check", "--workspace", str(workspace))
        assert "手工污染" not in profile.read_text(encoding="utf-8")

        final = state(workspace)
        assert final["state_revision"] == 7
        assert set(final["applied_transactions"]) == {
            "tx-active", "tx-pending", "tx-decide", "tx-conflict", "tx-replace", "tx-forget", "tx-reinforce"
        }

    print("OK: author-memory transaction behavior")


if __name__ == "__main__":
    main()
