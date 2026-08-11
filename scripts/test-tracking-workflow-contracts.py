#!/usr/bin/env python3
"""Lexical guards for the single-authority tracking workflow contracts."""

from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def read(relative: str) -> str:
    return (ROOT / relative).read_text(encoding="utf-8")


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def require_all(text: str, needles: tuple[str, ...], label: str) -> None:
    missing = [needle for needle in needles if needle not in text]
    require(not missing, f"{label} missing contract text: {missing}")


def test_transaction_is_the_only_tracking_writer() -> None:
    for path in (
        "skills/story-long-write/SKILL.md",
        "skills/story-long-write/references/workflow-daily.md",
        "skills/story-long-write/references/workflow-revision.md",
        "skills/story-import/SKILL.md",
        "skills/story-review/SKILL.md",
    ):
        require("tracking_commit.py" in read(path), f"{path} must route writes through tracking_commit.py")

    protocol = read("skills/story-long-write/references/tracking-transaction.md")
    require_all(
        protocol,
        (
            "一个结构化权威状态 + 多个确定性派生视图",
            "不分别",
            "_tracking-state.json",
            "唯一提交点",
            "直接重跑**同一份** `commit`",
            "expected_state_revision",
            "完整连续性记录",
            "不是并发锁",
        ),
        "tracking protocol",
    )


def test_authority_model_matches_the_implementation() -> None:
    protocol = read("skills/story-long-write/references/tracking-transaction.md")
    require_all(
        protocol,
        (
            "导入截止章",
            "imported_through_chapter",
            "章节记录",
            "覆盖记录",
            "唯一权威",
            "不承诺单独无损重建",
            "工具不再反向解析 Markdown",
        ),
        "tracking authority model",
    )
    require("基线_截至第N章.md" not in protocol, "tracking protocol still creates a redundant baseline file")
    for path in (
        "skills/story-long-write/references/state-tracking.md",
        "skills/story-import/references/state-tracking.md",
        "skills/story-long-write/references/workflow-daily.md",
    ):
        require("core: true" not in read(path), f"{path} still instructs callers to use the removed core field")


def test_failed_commit_retries_the_same_external_transaction() -> None:
    protocol = read("skills/story-long-write/references/tracking-transaction.md")
    require_all(
        protocol,
        (
            "事务 JSON 在成功前必须保留",
            "修正环境后直接重跑**同一份** `commit`",
            "不维护 `dirty/pending/repair` 状态机",
        ),
        "retry contract",
    )


def test_state_card_and_compact_delta_limits_are_explicit() -> None:
    protocol = read("skills/story-long-write/references/tracking-transaction.md")
    require_all(
        protocol,
        (
            "目标 ≤1536 字节，硬上限 3072 字节",
            "目标 ≤4096 字节，超过警告；硬上限 8192 字节",
            "四个列表不限制条数",
            "≤12288 字节",
            "## 当前位置",
            "## 长期约束",
            "## 核心角色状态",
            "## 活跃伏笔",
            "## 近三章速记",
            "## 下一章承诺",
            "## 连贯性风险",
        ),
        "bounded tracking protocol",
    )


def test_import_records_a_cutoff_without_fabricated_old_deltas() -> None:
    text = read("skills/story-import/SKILL.md")
    require_all(
        text,
        (
            "imported_through_chapter=N",
            "不得为第 1..N 章伪造逐章",
            "_tracking-state.json",
            "角色状态/{角色名}.md",
            "时间线/读者已知.md",
            "tracking_commit.py init",
        ),
        "story-import tracking",
    )
    # 迁移可以描述，但只能「存档旧结构后按当前协议重建」，不得声称解析/转换旧追踪文件。
    require("_旧追踪存档" in text, "story-import migration must archive the old tracking structure")
    require(
        "解析旧" not in text and "兼容层" not in text,
        "story-import must not claim to parse or convert old tracking structures",
    )


def test_reader_timeline_is_kept_separate_from_author_truth() -> None:
    explorer = read("skills/story-setup/references/templates/agents/story-explorer.md")
    require_all(
        explorer,
        (
            "未指定时默认 `reader`",
            "读者已知.md",
            "作者真相.md",
            "reader` 结果不得混入 `objective_fact` 中尚未揭示的内容",
        ),
        "story-explorer timeline",
    )
    checker = read("skills/story-setup/references/templates/agents/consistency-checker.md")
    require_all(
        checker,
        (
            "用 `作者真相.md` 核对客观时序",
            "用 `读者已知.md` 核对正文是否提前泄露",
            "tracking_commit.py check",
        ),
        "consistency timeline",
    )


def test_review_mutations_are_transactional_and_scoped() -> None:
    text = read("skills/story-review/SKILL.md")
    require_all(
        text,
        (
            "full / lean 模式只允许通过该工具修改 `追踪/`",
            "solo 模式不修改任何 `追踪/` 文件",
            "mode=revision",
            "同一 ID `upsert` 当前状态",
            "逐章记录规范且未超限",
            "tracking_commit.py check",
        ),
        "story-review tracking maintenance",
    )


def test_retired_tracking_architecture_is_absent() -> None:
    paths = (
        "README.md",
        "README_EN.md",
        "skills/story-long-write/SKILL.md",
        "skills/story-long-write/references/artifact-protocols.md",
        "skills/story-long-write/references/workflow-daily.md",
        "skills/story-long-write/references/workflow-revision.md",
        "skills/story-import/SKILL.md",
        "skills/story-import/references/structure-mapping-long.md",
        "skills/story-review/SKILL.md",
        "skills/story-setup/references/templates/CLAUDE.md.tmpl",
        "skills/story-setup/references/templates/agents/story-explorer.md",
        "skills/story-setup/references/templates/rules/story-consistency.md",
    )
    retired = (
        "追踪/阶段摘要.md",
        "追踪/角色状态.md",
        "追踪/时间线.md",
        "追踪/摘要/",
        "## 逐章更新记录",
        "## 累计待处理项",
        "## 历史记录索引",
        "顶层区块恰好是下面 11 个",
        "迁移归档",
        "_tracking-meta.json",
        "事件库.json",
    )
    for path in paths:
        text = read(path)
        found = [term for term in retired if term in text]
        require(not found, f"{path} still contains retired tracking architecture: {found}")

    require(
        not (ROOT / "skills/story-setup/references/templates/上下文.md.tmpl").exists(),
        "manual context template must be deleted; the transaction tool renders the hot cache",
    )


def test_no_tracking_fallback_or_context_style_fingerprint_remains() -> None:
    long_write = read("skills/story-long-write/SKILL.md")
    for forbidden in (
        "角色状态文件缺失** → 从角色设定文件和前文推断当前状态",
        "伏笔/时间线文件缺失** → 不检查",
    ):
        require(forbidden not in long_write, f"story-long-write still has tracking fallback: {forbidden}")
    require_all(
        long_write,
        (
            "视为当前语义检查点损坏",
            "已有正文但 `_tracking-state.json` 缺失时重新 `/story-import`",
        ),
        "fail-closed tracking reads",
    )
    writer = read("skills/story-setup/references/templates/agents/narrative-writer.md")
    require("`上下文.md` 文风指纹" not in writer, "narrative-writer still reads a removed context style fingerprint")
    require("追踪/上下文.md`「文风指纹」" not in writer, "narrative-writer still treats context as style storage")
    require("续写状态卡不存文风" in writer, "narrative-writer must keep style out of tracking context")


def test_hooks_fail_closed_on_invalid_tracking_checkpoints() -> None:
    js = read("skills/story-setup/references/templates/hooks/story_hook_core.js")
    py = read("skills/story-setup/references/codex/hooks/story_codex_hook.py")
    for label, text in (("JS hook", js), ("Codex hook", py)):
        require_all(
            text,
            (
                "_tracking-state.json 缺失",
                "schema_version=4",
                "state_revision",
                "mode=revision 事务重建派生视图",
                "重新 /story-import",
                "last_committed_chapter",
                "必须先提交",
            ),
            label,
        )


def test_daily_quality_repairs_close_tracking_before_batch_finish() -> None:
    text = read("skills/story-long-write/references/workflow-daily.md")
    revision = text.index("若本步修文改变了会影响后续的事实")
    step_four = text.index("## Step 4：批末收尾")
    require(revision < step_four, "quality repair revision invariant must appear before Step 4")
    require_all(text[revision:step_four], ("mode=revision", "通过 `check`", "纯措辞调整不重复提交"), "daily quality repair closure")


def test_tracking_examples_use_the_demo_novel() -> None:
    paths = (
        "skills/story-long-write/references/tracking-transaction.md",
        "skills/story-import/SKILL.md",
        "skills/story-import/references/character-state-reverse.md",
        "skills/story-review/SKILL.md",
        "skills/story-setup/references/templates/rules/story-consistency.md",
    )
    for path in paths:
        text = read(path)
        require("江晨" in text, f"{path} must use the repository demo in examples")
        found = [term for term in ("林舟", "钟楼", "调查员") if term in text]
        require(not found, f"{path} still contains placeholder examples: {found}")


def test_context_retirement_must_be_declared_not_silent() -> None:
    protocol = read("skills/story-long-write/references/tracking-transaction.md")
    require_all(
        protocol,
        (
            "delta.retired_context_items",
            "delta.retired_characters",
            "## 本章退役登记",
            "漏写不会被当成删除",
        ),
        "explicit context retirement",
    )
    daily = read("skills/story-long-write/references/workflow-daily.md")
    require_all(
        daily,
        ("delta.retired_context_items", "delta.retired_characters", "每章整份提交"),
        "daily workflow retirement rules",
    )


def test_init_archives_a_pre_protocol_tracking_directory() -> None:
    protocol = read("skills/story-long-write/references/tracking-transaction.md")
    require_all(
        protocol,
        ("追踪/_旧追踪存档/", "校验失败的 `init` 不移动任何文件", "不参与解析"),
        "init archive contract",
    )
    require(
        "追踪/_旧追踪存档/" in read("skills/story-long-write/references/workflow-daily.md"),
        "workflow-daily must state where a pre-protocol tracking directory goes",
    )
    tool = read("skills/story-long-write/scripts/tracking_commit.py")
    require(
        'RETIRED_ARCHIVE_DIR = "_旧追踪存档"' in tool,
        "tracking_commit.py must define the archive directory used by the documented contract",
    )


def main() -> None:
    tests = [
        value
        for name, value in sorted(globals().items())
        if name.startswith("test_") and callable(value)
    ]
    for test in tests:
        test()
    print(f"Tracking workflow contract tests passed ({len(tests)} tests).")


if __name__ == "__main__":
    main()
