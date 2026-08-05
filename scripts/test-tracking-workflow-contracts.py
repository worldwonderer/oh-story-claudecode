#!/usr/bin/env python3
"""Regression guards for the bounded tracking-file workflows introduced in PR #283."""

from __future__ import annotations

import errno
import json
import os
from pathlib import Path
import re
import runpy
import subprocess
import tempfile
import tomllib


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
                "按维度分别合并",
                "从这个标题行 `Read` 到下一个 `## ` 标题",
                "每个维度取章节号最大的记录",
                "同章有多条时取文件中最后一条",
                "关系记录还要按关系对象分别合并",
                "角色列与查询角色名完全相同",
                "不要把角色名只出现在第四列的关系记录算到该角色名下",
                "不得把某一条单维度变更当成角色的完整当前状态",
            ),
            path,
        )
    expected_pattern = r"^\|[^|]*\|[[:space:]]*{转义后的角色名}[[:space:]]*\|"
    canonical = read(paths[0])
    require(expected_pattern in canonical, "canonical explorer must contain a single escaped pipe")
    require(r"^\\|" not in canonical, "canonical explorer must not double-escape the first pipe")
    codex = tomllib.loads(read(paths[2]))["developer_instructions"]
    require(expected_pattern in codex, "loaded Codex instructions must preserve the exact regex")
    python_pattern = expected_pattern.replace("[[:space:]]", r"\s").replace(
        "{转义后的角色名}", re.escape("沈栀")
    )
    rows = (
        "| 第1章 | 沈栀 | 身份 | 巡查官 |",
        "| 第2章 | 林深 | 关系 | 与沈栀：同盟 |",
        "completely unrelated",
    )
    require(
        [row for row in rows if re.match(python_pattern, row)] == [rows[0]],
        "exact role-column pattern must reject names occurring only in column four",
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
                "与{对象}：{当前关系}",
                "旧记录无法确定关系对象",
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
        "溢出项",
        "有界小文件",
        "角色状态归并",
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
            "把 X 补足为至少三位的 `NNN`",
            "重写 `追踪/逐章记录/第{NNN}章.md`",
            "重算受影响角色的当前状态",
            "关系还要按关系对象分别求当前值",
            "`追踪/角色状态.md` 的 `## 逐章更新记录`",
            "同步更新状态摘要 `追踪/上下文.md` 的 `## 在场角色`",
            "同步改写 `追踪/阶段摘要.md` 中覆盖第 X 章的十章概要",
            "历史记录待追加行",
            "按最后一章 M 重算的角色行",
            "修改前的本章完整记录",
            "来源章为 X",
            "跨章事项对账",
            "先把 `record_id`、结清依据和本次回炉章号写进",
            "再删除该 `record_id` 的精确文件并确认已经不存在",
            "`--next-name --target {目标章} --source {X}`",
            "新旧编号的替换关系",
            "不得直接覆盖原 `record_id` 文件",
            "都先按“新增”取得新编号",
            "旧文件仍是可恢复的完整版本",
            "两份都保留并停止",
            "--ordinary-count {普通事项数}",
            "重写并重新读取 `## 下一章必做事项` 和 `## 历史记录索引`",
        ),
        "revision workflow",
    )
    require(
        "追踪/逐章记录/第{X}章.md" not in text,
        "revision must not use a non-canonical unpadded per-chapter path",
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
            "状态摘要不得超过 12288 字节",
            "`## 近三章速记` 最多 3 条",
            "- 追踪/阶段摘要.md",
            "- 追踪/逐章记录/",
            "续写后有未结清跨章事项时才添加第 6 行",
            "后续日更与审查只往这里追加",
            "本小节必须保持为文件最后一个小节",
            "每次完整重写，≤8 行",
            "固定保留，≤6 行",
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
    require(text.count("## 逐章更新记录") >= 2, "import must create foreshadow and timeline append targets")
    reverse = read("skills/story-import/references/character-state-reverse.md")
    require_all(
        reverse,
        (
            "## 逐章更新记录",
            "本小节必须放在所有角色小节之后",
            "| 章节 | 角色 | 维度{身份/能力/关系/形象} | 当前值 |",
        ),
        "import character-state template",
    )


def test_review_mutation_boundary_is_explicit() -> None:
    text = read("skills/story-review/SKILL.md")
    require("`story-review` 不修改文件" not in text, "review must not make a false global read-only claim")
    require_all(
        text,
        (
            "不修改正文、设定或大纲文件",
            "三种模式都执行同一套确定性的追踪维护",
            "只允许修改 `追踪/` 下的文件",
            "重算时不得只取该角色的最后一条记录",
            "先归档，再从当前文件移除",
            "未成功合并的行必须留在当前 `## 逐章更新记录` 中",
            "保持 `## 在场角色` 现有的入选顺序和最多 6 人上限",
            "先确保 `追踪/角色状态归档/` 已创建",
            "YYYYMMDD-HHMMSS-ffffff",
            "绝不覆盖",
            "失败时重试一次",
            "停止后续维护",
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
            "追踪/待处理事项/",
            "每个事项单独一个文件",
            "每章都要读取 JSON 返回的精确路径（最多 6 个）",
            "按 `record_id` 去重",
            "目录文件是完整依据",
            "事项进入状态摘要后也不得删除该文件",
            "--ordinary-count {普通事项数}",
            "普通事项数 + 已到目标章的固定事项数超过 5",
            "停止且不重写状态摘要",
            "普通事项和已到目标章的固定事项",
            "未来目标章的固定事项",
            "`due_overflow` 为 true",
            "停止写下一章",
            "[固定｜目标第N章｜来源第M章｜记录编号={record_id}]",
            "select-pending-items.py",
            "--limit 6",
            "--next-name",
            "再删除它的精确文件并确认文件已经不存在",
            "随后重新运行选择脚本、重写并重新读取状态摘要",
            "条数上限和 12288 字节硬上限优先",
            "先从高重要度候选中",
        ),
        "status-summary capacity rules",
    )
    require("_待处理事项.md" not in text, "overflow must not move to another unbounded hot file")


def test_pending_selector_is_numeric_bounded_and_index_independent() -> None:
    script = ROOT / "skills/story-long-write/scripts/select-pending-items.py"
    module = runpy.run_path(str(script))
    select_pending = module["select_pending"]
    next_pending_path = module["next_pending_path"]
    canonical_name = module["canonical_name"]
    record_id = module["record_id"]

    with tempfile.TemporaryDirectory() as temp:
        directory = Path(temp) / "追踪" / "待处理事项"
        directory.mkdir(parents=True)
        fixtures = (
            "第1000_源999_01.md",
            "第999_源998_01.md",
            "第050_源049_01.md",
            "第1001_源1000_01.md",
            "第1002_源1000_01.md",
            "第1003_源1000_01.md",
            "第1004_源1000_01.md",
            "第1005_源1000_01.md",
        )
        for name in fixtures:
            (directory / name).write_text("不要读取我的内容", encoding="utf-8")
        (directory / "无法识别.md").write_text("保留", encoding="utf-8")

        result = select_pending(directory, current_chapter=1005, limit=6)
        require(result["total"] == 8, "selector must reconcile the real directory without an index")
        require(result["due_overflow"] is True, "more than five due items must block")
        require(len(result["items"]) == 6, "selector output must stay bounded at six items")
        require(
            [item["target_chapter"] for item in result["items"]] == [50, 999, 1000, 1001, 1002, 1003],
            "selector must compare chapter numbers numerically across 999/1000",
        )
        require(result["invalid_count"] == 1, "invalid pending names must be surfaced")
        require(
            result["items"][0]["record_id"] == "第050_源049_01",
            "selector must preserve a legacy filename stem as its stable record ID",
        )

        first = next_pending_path(directory, 1000, 999)
        require(
            first.name == canonical_name(1000, 999, 2),
            "new paths must avoid numeric sequence IDs already used by legacy names",
        )
        first.write_text("first", encoding="utf-8")
        second = next_pending_path(directory, 1000, 999)
        require(second.name == canonical_name(1000, 999, 3), "next-name must never overwrite a prior item")

    with tempfile.TemporaryDirectory() as temp:
        missing = Path(temp) / "追踪" / "待处理事项"
        path = next_pending_path(missing, 12, 11)
        require(missing.is_dir(), "next-name must create the pending-item directory on first use")
        require(path.name == canonical_name(12, 11, 1), "first record name must be canonical")
        require(record_id(12, 11, 1) == path.stem, "new canonical paths and record IDs must agree")

    with tempfile.TemporaryDirectory() as temp:
        directory = Path(temp) / "mixed"
        directory.mkdir()
        for sequence in range(1, 4):
            (directory / canonical_name(20, 19, sequence)).write_text("待办", encoding="utf-8")
        mixed = select_pending(directory, current_chapter=20, limit=6, ordinary_count=3)
        require(mixed["due_overflow"] is True, "three ordinary plus three due fixed items must block")
        require(mixed["actionable_count"] == 6, "mixed overflow must count both persistence classes")

        future = Path(temp) / "future"
        future.mkdir()
        for sequence in range(1, 6):
            (future / canonical_name(30, 19, sequence)).write_text("以后处理", encoding="utf-8")
        future_result = select_pending(future, current_chapter=20, limit=6, ordinary_count=1)
        require(future_result["due_overflow"] is False, "future fixed items must not displace a due ordinary item")
        require(future_result["actionable_count"] == 1, "only due-now work belongs in the overflow gate")

        for invalid_name in ("第050_源049_00.md", "第050_源049_10000.md", "第٠٥٠_源049_01.md"):
            (directory / invalid_name).write_text("非法序号", encoding="utf-8")
        invalid = select_pending(directory, current_chapter=20, limit=6)
        require(invalid["invalid_count"] == 3, "zero, oversized, and non-ASCII numeric names must be invalid")


def test_json_clis_write_utf8_under_non_utf8_locale() -> None:
    selector = ROOT / "skills/story-long-write/scripts/select-pending-items.py"
    migration = ROOT / "skills/story-long-write/scripts/extract-context-sections.py"
    environment = {**os.environ, "PYTHONIOENCODING": "gbk"}

    with tempfile.TemporaryDirectory() as temp:
        root = Path(temp) / "日本語📘"
        pending = root / "追踪" / "待处理事项"
        selected = subprocess.run(
            [
                "python3",
                str(selector),
                "--directory",
                str(pending),
                "--next-name",
                "--target",
                "1",
                "--source",
                "0",
            ],
            check=True,
            capture_output=True,
            env=environment,
        )
        require("日本語📘" in json.loads(selected.stdout.decode("utf-8"))["path"], "selector JSON must be UTF-8")

        source = root / "追踪" / "上下文.md"
        source.parent.mkdir(parents=True, exist_ok=True)
        source.write_text("## 下一章必做事项\n- 🚀\n", encoding="utf-8")
        migrated = subprocess.run(
            [
                "python3",
                str(migration),
                "prepare",
                str(source),
                str(source.parent / "通用副本.md"),
                str(source.parent / "完整归档.md"),
            ],
            check=True,
            capture_output=True,
            env=environment,
        )
        require("🚀" in json.loads(migrated.stdout.decode("utf-8"))["tail"], "migration JSON must be UTF-8")


def test_recent_chapters_and_roles_handle_small_or_large_casts() -> None:
    text = read("skills/story-long-write/references/workflow-daily.md")
    require_all(
        text,
        (
            "最多 3 条",
            "已有章节不足 3 章时只写实际存在的章节",
            "下一章优先角色",
            "最多 6 人",
            "其余角色仍保留在 `追踪/角色状态.md`",
        ),
        "bounded status projections",
    )


def test_old_context_migration_extracts_complete_sections() -> None:
    text = read("skills/story-long-write/references/workflow-daily.md")
    require_all(
        text,
        (
            "一直取到下一个顶层 `## ` 标题之前",
            "extract-context-sections.py",
            "脚本会先创建目标目录",
            "_旧状态摘要关键区块_截至第{N}章.md",
            "现行 11 个规定区块",
            "完整旧文件原样复制",
            "追踪/.上下文迁移.json",
            "追踪/上下文.md.new",
            "原文件保持不变",
        ),
        "old context migration",
    )
    require("grep -A8" not in text, "migration must not truncate long legacy sections")
    require("awk '" not in text, "migration must use the platform-neutral runtime script")
    require("tail -c" not in text, "migration must not require a Unix-only tail command")
    migration_script = read("skills/story-long-write/scripts/extract-context-sections.py")
    require_all(
        migration_script,
        (
            "def fsync_directory(directory: Path)",
            "fsync_directory(path.parent)",
            "write_atomic_bytes(candidate, replacement)",
            "fsync_directory(source.parent)",
            "fsync_directory(manifest.parent)",
        ),
        "power-loss durable migration",
    )

    module = runpy.run_path(str(ROOT / "skills/story-long-write/scripts/extract-context-sections.py"))
    if os.name != "nt":
        with tempfile.TemporaryDirectory() as temp:
            original_fsync = module["os"].fsync

            def fail_fsync(_descriptor: int) -> None:
                raise OSError(errno.EIO, "simulated storage failure")

            module["os"].fsync = fail_fsync
            try:
                try:
                    module["fsync_directory"](Path(temp))
                except OSError as error:
                    require(error.errno == errno.EIO, "directory fsync must propagate real I/O failures")
                else:
                    raise AssertionError("directory fsync must not swallow real I/O failures")
            finally:
                module["os"].fsync = original_fsync

    with tempfile.TemporaryDirectory() as temp:
        root = Path(temp)
        source = root / "追踪" / "上下文.md"
        source.parent.mkdir()
        protected_lines = "".join(f"- 永久规则 {index}\n" for index in range(1, 13))
        long_log = "- 过程日志填充\n" * 1_000
        original = (
            "# 旧摘要\n\n"
            "## 下一章必做事项\n- 不能丢的事项\n\n"
            "## 最近决策\n"
            + protected_lines
            + "## 普通日志\n"
            + long_log
        )
        source.write_text(original, encoding="utf-8")
        destination = root / "追踪" / "逐章记录" / "_旧状态摘要关键区块_截至第12章.md"
        archive = root / "追踪" / "逐章记录" / "_旧上下文_截至第12章.md"
        result = module["prepare_migration"](source, destination, archive)
        extracted = destination.read_text(encoding="utf-8")
        require(
            result["sections"] == ["下一章必做事项", "最近决策"],
            "migration must report every protected section it found",
        )
        require("永久规则 12" in extracted, "migration must retain lines beyond the old eight-line window")
        require("不能丢的事项" in extracted, "migration must preserve current sections pushed out of the tail")
        require("普通日志" not in extracted, "migration must stop at the next top-level section")
        require("不能丢的事项" not in result["tail"], "fixture must push the protected item out of the tail")
        require(archive.read_text(encoding="utf-8") == original, "archive must preserve the exact old summary")
        require(source.read_text(encoding="utf-8") == original, "prepare must leave the canonical file untouched")

        candidate = root / "追踪" / "上下文.md.new"
        candidate.write_text(
            "# 写作状态摘要\n\n"
            + "\n".join(f"## {section}\n- 已迁移\n" for section in module["SUMMARY_SECTIONS"]),
            encoding="utf-8",
        )
        installed = module["install_migration"](source, candidate, destination, archive)
        require(installed["status"] == "installed", "validated candidate must be installed")
        require(not candidate.exists(), "atomic install must consume the candidate file")
        require(not module["default_manifest"](source).exists(), "successful install must clear its marker")
        require(
            module["top_level_sections"](source.read_text(encoding="utf-8"))
            == list(module["SUMMARY_SECTIONS"]),
            "installed summary must have the exact 11-section contract",
        )

    with tempfile.TemporaryDirectory() as temp:
        root = Path(temp)
        source = root / "追踪" / "上下文.md"
        source.parent.mkdir()
        source.write_text("## 最近决策\n- 旧规则\n", encoding="utf-8")
        protected = root / "追踪" / "逐章记录" / "旧区块.md"
        archive = root / "追踪" / "逐章记录" / "完整旧摘要.md"
        module["prepare_migration"](source, protected, archive)
        candidate = root / "追踪" / "上下文.md.new"
        replacement = (
            "# 写作状态摘要\n\n"
            + "\n".join(f"## {section}\n- 已恢复\n" for section in module["SUMMARY_SECTIONS"])
        ).encode("utf-8")
        candidate.write_bytes(replacement)
        manifest = module["default_manifest"](source)
        install_globals = module["install_migration"].__globals__
        original_directory_sync = install_globals["fsync_directory"]
        sync_calls: list[Path] = []

        def fail_after_source_replace(directory: Path) -> None:
            sync_calls.append(directory)
            if len(sync_calls) == 3:
                raise OSError(errno.EIO, "simulated post-replacement failure")
            original_directory_sync(directory)

        install_globals["fsync_directory"] = fail_after_source_replace
        try:
            try:
                module["install_migration"](source, candidate, protected, archive)
            except OSError as error:
                require(error.errno == errno.EIO, "install must surface a post-replacement fsync failure")
            else:
                raise AssertionError("install must not report success after a directory fsync failure")
        finally:
            install_globals["fsync_directory"] = original_directory_sync

        require(manifest.exists(), "post-replacement failure must leave the recovery marker")
        require(not candidate.exists(), "fixture must fail after the candidate becomes the canonical summary")
        require(source.read_bytes() == replacement, "fixture must reach the post-replacement recovery state")

        recovered = module["install_migration"](source, candidate, protected, archive)
        require(recovered["status"] == "already_installed", "install must recover after replacement interruption")
        require(not manifest.exists(), "replacement recovery must clear the stale marker")
        require(archive.read_text(encoding="utf-8") == "## 最近决策\n- 旧规则\n", "recovery must retain the exact old archive")


def test_history_appends_are_verified_and_recoverable() -> None:
    text = read("skills/story-long-write/references/workflow-daily.md")
    require_all(
        text,
        (
            "逐条核对刚追加的记录",
            "本章后的完整当前值",
            "关系写成 与对象：当前关系",
            "历史记录待追加行",
            "完整 ASCII 表格行",
            "失败时重试一次",
            "停止写下一章",
            "质量预警",
        ),
        "history append recovery",
    )
    require("追加失败不阻塞" not in text, "history append failures must not be silently ignored")


def test_stage_summary_updates_the_named_section() -> None:
    text = read("skills/story-long-write/references/workflow-daily.md")
    artifact = read("skills/story-long-write/references/artifact-protocols.md")
    require_all(
        text,
        (
            "先 `Read` 这个平时不读的小文件",
            "`## 十章概要` 表内",
            "起始章相同但不足十章的旧行",
            "不得用 `>>` 把十章概要追加到文件末尾",
        ),
        "stage summary update",
    )
    require("文件日更不读" not in text, "stage summary cannot be both unread and section-updated")
    require_all(
        artifact,
        (
            "先 `Read`，再用 `Edit`",
            "不得在文件末尾直接追加",
            "起始章相同",
        ),
        "stage summary artifact protocol",
    )
    stage_section = artifact.split("## 追踪/阶段摘要.md", maxsplit=1)[1].split("## 追踪/逐章记录/", maxsplit=1)[0]
    require("`>>`" not in stage_section, "stage summary template must not prescribe EOF append")


def test_hook_size_messages_use_the_same_ceiling() -> None:
    js_paths = (
        "skills/story-setup/references/templates/hooks/story_hook_core.js",
        "skills/story-setup/references/opencode/story_hook_core.js",
        "skills/story-setup/references/zcode/hooks/story_hook_core.js",
    )
    for path in js_paths:
        require("Math.ceil(contextSize / 1024)" in read(path), f"{path} must round size upward")
    py = read("skills/story-setup/references/codex/hooks/story_codex_hook.py")
    require("(ctx_size + 1023) // 1024" in py, "Codex hook must use the same ceiling as JS")

    with tempfile.TemporaryDirectory() as temp:
        root = Path(temp)
        tracking = root / "测试书" / "追踪"
        tracking.mkdir(parents=True)
        (tracking / "上下文.md").write_bytes(b"x" * 12289)

        hook_path = ROOT / "skills/story-setup/references/codex/hooks/story_codex_hook.py"
        hook_globals = runpy.run_path(str(hook_path))
        python_messages = hook_globals["continuity_findings"](root)

        js_path = ROOT / "skills/story-setup/references/templates/hooks/story_hook_core.js"
        script = (
            "const core=require(process.argv[1]);"
            "console.log(JSON.stringify(core.continuityFindings(process.argv[2])));"
        )
        completed = subprocess.run(
            ["node", "-e", script, str(js_path), str(root)],
            check=True,
            capture_output=True,
            text=True,
        )
        javascript_messages = json.loads(completed.stdout)
        for label, messages in (("Python", python_messages), ("JavaScript", javascript_messages)):
            require(any("已 13KB" in message for message in messages), f"{label} hook must report 12289 bytes as 13KB")


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
