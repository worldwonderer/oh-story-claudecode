#!/usr/bin/env python3
"""Regression guards for the bounded tracking-file workflows introduced in PR #283."""

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


def test_character_status_merges_sparse_dimensions() -> None:
    paths = (
        "skills/story-setup/references/templates/agents/story-explorer.md",
        "skills/story-setup/references/opencode/agents/story-explorer.md",
        "skills/story-setup/references/codex/agents/story-explorer.toml",
    )
    for path in paths:
        text = read(path)
        require_all(
            text,
            (
                "按维度分别归并",
                "从这个标题行 `Read` 到下一个 `## ` 标题",
                "每个维度取章节号最大的记录",
                "同章有多条时取文件中最后一条",
                "关系记录还要按关系对象分别归并",
                "不得把某一条单维度变更当成角色的完整当前状态",
            ),
            path,
        )
    for path in (
        "skills/story-import/references/state-tracking.md",
        "skills/story-long-write/references/state-tracking.md",
    ):
        require_all(
            read(path),
            (
                "身份、能力、公众形象分别取各自的最新记录",
                "关系还要按关系对象分开重算",
            ),
            path,
        )


def test_tracking_vocabulary_uses_plain_chinese() -> None:
    paths = (
        "README.md",
        "skills/story-import/SKILL.md",
        "skills/story-long-write/SKILL.md",
        "skills/story-long-write/references/artifact-protocols.md",
        "skills/story-long-write/references/state-tracking.md",
        "skills/story-long-write/references/workflow-daily.md",
        "skills/story-long-write/references/workflow-revision.md",
        "skills/story-review/SKILL.md",
        "skills/story-setup/references/templates/上下文.md.tmpl",
        "skills/story-setup/references/templates/agents/story-explorer.md",
    )
    retired_terms = (
        "写作简报",
        "追踪/章记/",
        "卷史.md",
        "冷文件",
        "逐章事件流",
        "下一章硬任务",
        "累计欠账",
        "冷文件索引",
        "[pin]",
        "pinned",
        "FIFO",
    )
    for path in paths:
        text = read(path)
        found = [term for term in retired_terms if term in text]
        require(not found, f"{path} still uses opaque tracking terms: {found}")


def test_revision_refreshes_all_tracking_views() -> None:
    text = read("skills/story-long-write/references/workflow-revision.md")
    require_all(
        text,
        (
            "重写 `追踪/逐章记录/第{X}章.md`",
            "重算受影响角色的当前状态",
            "关系还要按关系对象分别求当前值",
            "`追踪/角色状态.md` 的 `## 逐章更新记录`",
            "同步更新状态摘要 `追踪/上下文.md` 的 `## 在场角色`",
        ),
        "revision workflow",
    )


def test_import_creates_every_reported_tracking_artifact() -> None:
    text = read("skills/story-import/SKILL.md")
    require_all(
        text,
        (
            "追踪目录包含六项产物",
            "mkdir -p 追踪/逐章记录",
            "**⑤ 追踪/阶段摘要.md**",
            "**⑥ 追踪/上下文.md**",
            "逐章记录/ + 阶段摘要.md",
        ),
        "import workflow",
    )
    mapping = read("skills/story-import/references/structure-mapping-long.md")
    require_all(
        mapping,
        (
            "`追踪/逐章记录/` | 创建空目录",
            "`追踪/阶段摘要.md` | 每 10 章汇总一行",
            "追踪/逐章记录/ 空目录已创建",
            "追踪/阶段摘要.md 已生成完整的十章概要与卷级总览",
        ),
        "import structure mapping",
    )


def test_review_mutation_boundary_is_explicit() -> None:
    text = read("skills/story-review/SKILL.md")
    require("`story-review` 不修改文件" not in text, "review must not make a false global read-only claim")
    require_all(
        text,
        (
            "不修改正文、设定或大纲文件",
            "full / lean 模式只允许修改 `追踪/` 下的文件",
            "solo 模式只报告维护建议，不修改任何文件",
            "重算时不得只取该角色的最后一条记录",
        ),
        "review workflow",
    )
    before_maintenance, maintenance = text.split("## 追踪文件维护", maxsplit=1)
    require("补登记进 `追踪/" not in before_maintenance, "review writes must stay in maintenance")
    require("开放钩子补登记" in maintenance, "maintenance must own hook registration")


def test_fallback_search_is_recursive() -> None:
    text = read("skills/story-long-write/references/workflow-daily.md")
    require(
        "grep -R -n --include='*.md' \"F007\" 追踪/伏笔.md 追踪/逐章记录/" in text,
        "fallback grep must search the per-chapter directory recursively",
    )


def test_capacity_rules_have_deterministic_overflow() -> None:
    text = read("skills/story-long-write/references/workflow-daily.md")
    require_all(
        text,
        (
            "即使全部是高重要度，也只保留计划回收章最近的 8 条",
            "追踪/逐章记录/_待处理事项.md",
            "按目标章节升序只保留最早的 5 项",
            "条数上限和 12288 字节硬上限优先",
            "先从高重要度候选中",
        ),
        "status-summary capacity rules",
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
