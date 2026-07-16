#!/usr/bin/env python3
"""Focused regressions for the structured current-contract validator."""

from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
MODULE_PATH = SCRIPT_DIR / "check-current-skill-contracts.py"
SPEC = importlib.util.spec_from_file_location("current_contract_validator", MODULE_PATH)
assert SPEC is not None and SPEC.loader is not None
VALIDATOR = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = VALIDATOR
SPEC.loader.exec_module(VALIDATOR)


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def finding_codes(findings: list[object]) -> set[str]:
    return {finding.code for finding in findings}


def repository_manifest() -> object:
    manifest, findings = VALIDATOR.load_manifest(SCRIPT_DIR / "current-contract.json")
    require(not findings and manifest is not None, "repository manifest must load")
    return manifest


def test_manifest_contract() -> None:
    manifest_path = SCRIPT_DIR / "current-contract.json"
    manifest, findings = VALIDATOR.load_manifest(manifest_path)
    require(not findings, "repository manifest should validate: {}".format(findings))
    require(manifest is not None, "repository manifest should load")
    require(not VALIDATOR.validate_repository(REPO_ROOT, manifest), "manifest and repository must agree")

    raw = json.loads(manifest_path.read_text(encoding="utf-8"))
    with tempfile.TemporaryDirectory() as tmp:
        tmpdir = Path(tmp)

        wrong_type = dict(raw)
        wrong_type["agents_version"] = "18"
        wrong_type_path = tmpdir / "wrong-type.json"
        wrong_type_path.write_text(json.dumps(wrong_type, ensure_ascii=False), encoding="utf-8")
        _, wrong_type_findings = VALIDATOR.load_manifest(wrong_type_path)
        require(
            "manifest-value-type" in finding_codes(wrong_type_findings),
            "string agents_version must be rejected",
        )

        stale = dict(raw)
        stale["topic_decision_phase"] = 4
        stale_path = tmpdir / "stale.json"
        stale_path.write_text(json.dumps(stale, ensure_ascii=False), encoding="utf-8")
        stale_manifest, stale_findings = VALIDATOR.load_manifest(stale_path)
        require(
            not stale_findings and stale_manifest is not None,
            "a well-formed manifest remains the source of truth",
        )
        require(
            "topic-decision-phase" in finding_codes(
                VALIDATOR.validate_repository(REPO_ROOT, stale_manifest)
            ),
            "repository drift from the manifest must be rejected",
        )

        malformed_sections = dict(raw)
        malformed_sections["required_outline_sections"] = [{"rule": "阶段位置"}]
        malformed_path = tmpdir / "malformed-sections.json"
        malformed_path.write_text(json.dumps(malformed_sections, ensure_ascii=False), encoding="utf-8")
        _, malformed_findings = VALIDATOR.load_manifest(malformed_path)
        require(
            "manifest-outline-type" in finding_codes(malformed_findings),
            "incomplete outline-section objects must be rejected",
        )

        duplicate_artifacts = dict(raw)
        duplicate_artifacts["primary_benchmark_artifacts"] = ["剧情/节奏.md", "剧情/节奏.md"]
        duplicate_path = tmpdir / "duplicate-artifacts.json"
        duplicate_path.write_text(json.dumps(duplicate_artifacts, ensure_ascii=False), encoding="utf-8")
        _, duplicate_findings = VALIDATOR.load_manifest(duplicate_path)
        require(
            "manifest-artifact-duplicate" in finding_codes(duplicate_findings),
            "duplicate primary artifacts must be rejected",
        )

        renamed_artifacts = dict(raw)
        renamed_artifacts["primary_benchmark_artifacts"] = [
            "剧情/主情绪.md",
            "剧情/主节奏.md",
        ]
        renamed_path = tmpdir / "renamed-artifacts.json"
        renamed_path.write_text(
            json.dumps(renamed_artifacts, ensure_ascii=False), encoding="utf-8"
        )
        renamed_manifest, renamed_findings = VALIDATOR.load_manifest(renamed_path)
        require(
            not renamed_findings and renamed_manifest is not None,
            "renamed current artifacts must remain manifest-driven",
        )
        renamed_semantic = semantic_findings(
            "- 若 `剧情/主节奏.md` 缺失，回退读取 `拆文报告.md`。",
            renamed_manifest.primary_benchmark_artifacts,
        )
        require(
            "silent-primary-artifact-fallback" in finding_codes(renamed_semantic),
            "semantic guard must follow renamed manifest artifacts",
        )


def semantic_findings(
    text: str, primary_artifacts: tuple[str, ...] | None = None
) -> list[object]:
    if primary_artifacts is None:
        primary_artifacts = repository_manifest().primary_benchmark_artifacts
    return VALIDATOR.semantic_primary_fallback_findings(
        text,
        Path("fixture.md"),
        primary_artifacts,
    )


def test_bad_fallbacks_fail() -> None:
    bad_cases = {
        "inline report fallback": "- 若 `剧情/情绪模块.md` 缺失，回退读取 `拆文报告.md`。",
        "nested summary substitution": """
1. 检查 `剧情/节奏.md`。
2. 任一主产物缺失时：
   - 使用 `章节/*_摘要.md` 代替。
""",
        "structured gap story fallback": "- `rhythm_missing: true` 时改用 `故事线.md` 补足节奏。",
    }
    for label, text in bad_cases.items():
        findings = semantic_findings(text)
        require(
            "silent-primary-artifact-fallback" in finding_codes(findings),
            "{} should fail".format(label),
        )


def test_fail_fast_prose_passes() -> None:
    good_cases = {
        "explicit不得": "- `剧情/情绪模块.md` 缺失时必须停止；不得以 `拆文报告.md`、章节摘要或故事线代替。",
        "explicit禁止 fallback": "- `rhythm_missing: true` 时返回 `missing_primary_contract`，禁止 fallback 到 `故事线.md`。",
        "normal complete branch": "- 两个主产物都存在时读取 `拆文报告.md`，仅作人类可读概览。",
        "deep-dive fallback is not primary fallback": (
            "- 先读 `剧情/情绪模块.md` 与 `剧情/节奏.md`；模块或节奏文件缺失时停止修复。"
            "匹配 `章节/*_摘要.md` 后，若同章深度拆解不存在，则回退黄金三章深度拆解。"
        ),
    }
    for label, text in good_cases.items():
        findings = semantic_findings(text)
        require(not findings, "{} should pass, got {}".format(label, findings))


def test_structured_sentinel_contract() -> None:
    manifest = repository_manifest()
    scattered = """
agents_version: {agents_version}
setup_skill_version: {setup_skill_version}
说明文字中还提到了 target_cli、resolver_strategy 与 references_dir。
""".format(
        agents_version=manifest.agents_version,
        setup_skill_version=manifest.setup_skill_version,
    )
    require(
        VALIDATOR.extract_sentinel_fields(scattered) is None,
        "scattered sentinel tokens must not satisfy the deployment block",
    )
    require(
        "setup-sentinel-block"
        in finding_codes(
            VALIDATOR.sentinel_contract_findings(
                scattered, manifest, Path("fixture.md")
            )
        ),
        "missing structured sentinel block must fail",
    )

    structured = """
### Step 8：创建部署标记

- 写入以下字段：

```yaml
deployed_at: 2026-07-14T00:00:00Z
agents_version: {agents_version}
setup_skill_version: {setup_skill_version}
target_cli: codex
resolver_strategy: project-first
references_dir: .codex/skills/story-setup/references
```
""".format(
        agents_version=manifest.agents_version,
        setup_skill_version=manifest.setup_skill_version,
    )
    require(
        not VALIDATOR.sentinel_contract_findings(
            structured, manifest, Path("fixture.md")
        ),
        "well-formed structured sentinel must pass",
    )

    incomplete = structured.replace("target_cli: codex\n", "")
    require(
        "setup-sentinel-fields"
        in finding_codes(
            VALIDATOR.sentinel_contract_findings(
                incomplete, manifest, Path("fixture.md")
            )
        ),
        "missing generated sentinel fields must fail",
    )


def test_structured_outline_contract() -> None:
    manifest = repository_manifest()
    rule_names = [rule for rule, _ in manifest.required_outline_sections]
    demo_names = [demo for _, demo in manifest.required_outline_sections]

    scattered_rule = "2. **细纲必填项**\n\n" + "、".join(rule_names)
    require(
        "outline-rule-section"
        in finding_codes(
            VALIDATOR.outline_rule_contract_findings(
                scattered_rule, manifest, Path("rule.md")
            )
        ),
        "outline names scattered in prose must not satisfy structured rules",
    )
    structured_rule = (
        "2. **细纲必填项**\n"
        + "\n".join("- {}：必填".format(name) for name in rule_names)
        + "\n3. **下一条规则**\n"
    )
    require(
        not VALIDATOR.outline_rule_contract_findings(
            structured_rule, manifest, Path("rule.md")
        ),
        "structured outline rule fields must pass",
    )

    scattered_demo = "本章应包含：" + "、".join(demo_names)
    declared = VALIDATOR.extract_demo_outline_fields(scattered_demo)
    require(
        not set(demo_names).issubset(declared),
        "demo names scattered in prose must not count as declared sections",
    )
    structured_demo = "\n".join("## {}".format(name) for name in demo_names)
    require(
        set(demo_names).issubset(
            VALIDATOR.extract_demo_outline_fields(structured_demo)
        ),
        "structured demo headings must be recognized",
    )


def test_upgrading_version_contract() -> None:
    manifest = repository_manifest()
    structured = """
## 当前版本

- `setup_skill_version: {setup_skill_version}`
- `agents_version: {agents_version}`

## 下一节
""".format(
        setup_skill_version=manifest.setup_skill_version,
        agents_version=manifest.agents_version,
    )
    require(
        not VALIDATOR.upgrading_version_findings(
            structured, manifest, Path("UPGRADING.md")
        ),
        "structured current-version bullets must pass",
    )
    scattered = (
        "说明 setup_skill_version: {}，agents_version: {}，但没有当前版本字段。".format(
            manifest.setup_skill_version, manifest.agents_version
        )
    )
    require(
        "upgrading-current-version"
        in finding_codes(
            VALIDATOR.upgrading_version_findings(
                scattered, manifest, Path("UPGRADING.md")
            )
        ),
        "version strings scattered in prose must not satisfy current-version bullets",
    )


def test_old_artifact_prose_silent_only() -> None:
    """keep C：带显式标记的旧格式大纲容忍放行，无标记的静默降级仍拦（drop A/B 不受影响）。"""
    rule = next(r for r in VALIDATOR.LEGACY_RULES if r.code == "old-artifact-prose")
    require(rule.exempt_when is not None, "old-artifact-prose must narrow to silent-only")
    flagged = [
        "旧版细纲缺这些字段不阻塞读取，未知项写 `[待补充]`。",
        "旧版细纲回退读取核心事件、情节点序列、目标情绪。",
        "旧版卷纲缺少卷契约/剧情单元卡不阻塞日更；本轮记录到 `追踪/上下文.md`。",
        "旧版细纲只核对核心事件、目标情绪、章首/章尾钩子和字数目标。",
    ]
    silent = [
        "直接改读旧版细纲当权威，不提示。",
        "早期拆文库格式直接拿来用。",
        "兼容旧结构，静默继续写作。",
    ]
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        skills = root / "skills" / "story-long-write"
        skills.mkdir(parents=True)
        (skills / "keep-c.md").write_text("\n".join(flagged) + "\n", encoding="utf-8")
        require(
            not VALIDATOR.check_absent_rule(root, rule),
            "flagged old-outline tolerance (keep C) must pass, got {}".format(
                VALIDATOR.check_absent_rule(root, rule)
            ),
        )
        (skills / "keep-c.md").write_text("\n".join(silent) + "\n", encoding="utf-8")
        found = VALIDATOR.check_absent_rule(root, rule)
        require(
            len(found) == len(silent),
            "each silent old-format downgrade must fire, got {}".format(found),
        )


def main() -> int:
    test_manifest_contract()
    test_bad_fallbacks_fail()
    test_fail_fast_prose_passes()
    test_old_artifact_prose_silent_only()
    test_structured_sentinel_contract()
    test_structured_outline_contract()
    test_upgrading_version_contract()
    print("OK: current-contract manifest, structure, and fallback regressions passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
