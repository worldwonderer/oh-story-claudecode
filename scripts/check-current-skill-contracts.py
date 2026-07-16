#!/usr/bin/env python3
"""Validate the repository's current-only skill and artifact contracts.

The JSON manifest is the single structured inventory for version numbers,
primary benchmark artifacts, and outline sections.  This module deliberately
keeps the older path/legacy guards too, but implements them with scoped file
walks and actionable findings rather than a chain of shell grep calls.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator, List, Optional, Sequence, Tuple


SUPPORTED_MANIFEST_VERSION = 1
EXPECTED_MANIFEST_KEYS = {
    "manifest_version",
    "setup_skill_version",
    "agents_version",
    "topic_decision_phase",
    "progress_schema_version",
    "expected_demo_outline_count",
    "primary_benchmark_artifacts",
    "required_outline_sections",
}
SEMVER_RE = re.compile(r"[0-9]+\.[0-9]+\.[0-9]+")
ARTIFACT_PATH_RE = re.compile(r"(?:[^/\s]+/)+[^/\s]+\.md")


@dataclass(frozen=True)
class ContractManifest:
    manifest_version: int
    setup_skill_version: str
    agents_version: int
    topic_decision_phase: int
    progress_schema_version: int
    primary_benchmark_artifacts: Tuple[str, ...]
    required_outline_sections: Tuple[Tuple[str, str], ...]
    expected_demo_outline_count: int


@dataclass(frozen=True)
class Finding:
    code: str
    message: str
    path: Optional[Path] = None
    line: Optional[int] = None
    excerpt: Optional[str] = None

    def detail(self, repo_root: Path) -> str:
        location = ""
        if self.path is not None:
            try:
                shown = self.path.resolve().relative_to(repo_root.resolve())
            except ValueError:
                shown = self.path
            location = str(shown)
            if self.line is not None:
                location += ":{}".format(self.line)
            location += ": "
        suffix = ""
        if self.excerpt:
            suffix = " [{}]".format(self.excerpt.strip())
        return "{}{}{}".format(location, self.message, suffix)


@dataclass(frozen=True)
class AbsentRule:
    code: str
    label: str
    pattern: str
    relative_roots: Tuple[str, ...]
    # 「静默才禁」豁免：命中行的本地上下文若带显式容忍标记（不阻塞 / [待补充] / 回退 /
    # 只核对 / 记录…），说明是有据可查的旧格式容忍而非静默降级，放行。仅用于旧格式大纲容忍
    # （keep C）；benchmark 回退（drop A/B）的规则不设豁免，静默与显式一律禁。
    exempt_when: Optional[str] = None


LEGACY_RULES = (
    AbsentRule(
        "legacy-progress-branch",
        "no legacy deconstruction/progress branches",
        r"legacy_deconstruction|contract_version[^\n]*legacy|pre-v12|schema v1|lazy migration|schema_migration",
        ("skills",),
    ),
    AbsentRule(
        "old-artifact-prose",
        "no silent old artifact-format downgrade",
        r"旧拆文库|旧版细纲|旧式薄细纲|旧版内部降级标记|早期拆文库格式|兼容旧结构",
        ("skills",),
        # keep C：旧格式大纲/细纲容忍是显式、有据可查的（不阻塞日更、回退读取旧字段、未知写
        # [待补充]、记录到追踪），不是静默降级——带这些标记就放行，只拦无标记的静默兼容措辞。
        exempt_when=r"不阻塞|\[待补充\]|回退|只核对|记录|保留或映射|仍可续写|仍可用|仍要保留",
    ),
    AbsentRule(
        "removed-hook-alias",
        "removed hook alias stays removed",
        r"discover_book_dir\s*\(",
        ("skills/story-setup/references/templates/hooks",),
    ),
    AbsentRule(
        "obsolete-short-benchmark-path",
        "short writing uses only current benchmark paths",
        r"\{短篇标题\}/拆文库/\{书名\}",
        ("skills/story-short-write",),
    ),
    AbsentRule(
        "dotted-demo-workflow-label",
        "shipped demos do not preserve dotted workflow labels",
        r"(?:Step|Phase|Stage)\s*[0-9]+\.[0-9]+",
        ("demo",),
    ),
    AbsentRule(
        "obsolete-topic-decision-acceptance",
        "long analyze does not silently accept obsolete topic-decision contracts",
        r"旧模板或文件坏了|直接跳过，不提示",
        ("skills/story-long-analyze",),
    ),
    AbsentRule(
        "duplicate-adapter-reference-fallback",
        "story-setup deploys one canonical reference path per adapter",
        r"同步复制到\s*`skills/[^`]+`\s*作为 fallback",
        ("skills/story-setup/SKILL.md",),
    ),
    AbsentRule(
        "opencode-old-reference-prefix",
        "OpenCode agents use the deployed skills/ reference path only",
        r"\.opencode/skills/story-setup/references/agent-references/",
        ("skills/story-setup/references/opencode/agents",),
    ),
    AbsentRule(
        "codex-old-reference-prefix",
        "Codex agents use the deployed .codex/skills reference path only",
        r"\.(?:claude|opencode)/skills/story-setup/references/agent-references/|\{项目根\}/skills/story-setup/references/agent-references/",
        ("skills/story-setup/references/codex/agents",),
    ),
)


PRIMARY_GAP_TERMS = (
    "module_missing",
    "rhythm_missing",
    "missing_primary_contract",
    "主产物",
    "权威文件",
    "主文件",
)
MISSING_STATE_RE = r"(?:缺失|不存在|未找到|找不到|为\s*(?:true|真)|:\s*true)"
SUBSTITUTE_SOURCE_RE = re.compile(
    r"章节(?:/\*|/第[^\s`，。；;]*)?_?摘要(?:\.md)?|第[^\s`，。；;]*章_摘要(?:\.md)?|"
    r"拆文报告(?:\.md)?|故事线(?:\.md)?",
    re.IGNORECASE,
)
SUBSTITUTE_ACTION_RE = re.compile(
    r"回退|fallback|改读|转读|读取|使用|采用|改用|替代|代替|顶替|补足|补齐|拼出|兜底|"
    r"substitut(?:e|ion)",
    re.IGNORECASE,
)
PROHIBITION_RE = re.compile(
    r"不得|禁止|严禁|不允许|不可|不要|不能|不应|must\s+not|do\s+not|never",
    re.IGNORECASE,
)


def primary_term_pattern(primary_artifacts: Sequence[str]) -> str:
    """Build artifact terms from the manifest, including common local shorthand."""

    terms = set(PRIMARY_GAP_TERMS)
    for artifact in primary_artifacts:
        normalized = artifact.replace("\\", "/")
        basename = normalized.rsplit("/", 1)[-1]
        for value in (normalized, basename):
            terms.add(value)
            if value.endswith(".md"):
                terms.add(value[:-3])
    return "(?:{})".format(
        "|".join(re.escape(term) for term in sorted(terms, key=len, reverse=True))
    )


def _is_int(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def load_manifest(path: Path) -> Tuple[Optional[ContractManifest], List[Finding]]:
    findings: List[Finding] = []
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return None, [Finding("manifest-missing", "current contract manifest is missing", path)]
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        return None, [Finding("manifest-invalid-json", "cannot parse manifest: {}".format(exc), path)]

    if not isinstance(raw, dict):
        return None, [Finding("manifest-type", "manifest root must be a JSON object", path)]

    keys = set(raw)
    for missing in sorted(EXPECTED_MANIFEST_KEYS - keys):
        findings.append(Finding("manifest-key-missing", "missing manifest key: {}".format(missing), path))
    for unknown in sorted(keys - EXPECTED_MANIFEST_KEYS):
        findings.append(Finding("manifest-key-unknown", "unknown manifest key: {}".format(unknown), path))

    if "manifest_version" in raw:
        if not _is_int(raw["manifest_version"]):
            findings.append(Finding("manifest-value-type", "manifest_version has the wrong type", path))
        elif raw["manifest_version"] != SUPPORTED_MANIFEST_VERSION:
            findings.append(
                Finding(
                    "manifest-version-unsupported",
                    "manifest_version must be {}, got {}".format(
                        SUPPORTED_MANIFEST_VERSION, raw["manifest_version"]
                    ),
                    path,
                )
            )

    setup_version = raw.get("setup_skill_version")
    if not isinstance(setup_version, str):
        if "setup_skill_version" in raw:
            findings.append(Finding("manifest-value-type", "setup_skill_version has the wrong type", path))
    elif not SEMVER_RE.fullmatch(setup_version):
        findings.append(Finding("manifest-value-format", "setup_skill_version must be x.y.z", path))

    for key in (
        "agents_version",
        "topic_decision_phase",
        "progress_schema_version",
        "expected_demo_outline_count",
    ):
        if key not in raw:
            continue
        if not _is_int(raw[key]):
            findings.append(Finding("manifest-value-type", "{} has the wrong type".format(key), path))
        elif raw[key] < 1:
            findings.append(Finding("manifest-value-range", "{} must be a positive integer".format(key), path))

    artifacts = raw.get("primary_benchmark_artifacts")
    if not isinstance(artifacts, list) or any(not isinstance(item, str) for item in artifacts):
        findings.append(Finding("manifest-artifact-type", "primary_benchmark_artifacts must be a string array", path))
    elif not artifacts:
        findings.append(Finding("manifest-artifact-empty", "primary_benchmark_artifacts must not be empty", path))
    elif len(set(artifacts)) != len(artifacts):
        findings.append(Finding("manifest-artifact-duplicate", "primary_benchmark_artifacts must be unique", path))
    elif any(ARTIFACT_PATH_RE.fullmatch(item) is None for item in artifacts):
        findings.append(
            Finding(
                "manifest-artifact-format",
                "primary benchmark artifacts must be relative Markdown paths",
                path,
            )
        )

    sections = raw.get("required_outline_sections")
    valid_sections = isinstance(sections, list) and bool(sections) and all(
        isinstance(item, dict)
        and set(item) == {"rule", "demo"}
        and isinstance(item.get("rule"), str) and bool(item["rule"].strip())
        and isinstance(item.get("demo"), str) and bool(item["demo"].strip())
        for item in sections or []
    )
    if not valid_sections:
        findings.append(
            Finding(
                "manifest-outline-type",
                "required_outline_sections must be an array of exact {rule, demo} string objects",
                path,
            )
        )
    elif (
        len({item["rule"] for item in sections}) != len(sections)
        or len({item["demo"] for item in sections}) != len(sections)
    ):
        findings.append(
            Finding(
                "manifest-outline-duplicate",
                "required_outline_sections must use unique rule and demo names",
                path,
            )
        )

    if findings:
        return None, findings

    assert isinstance(artifacts, list)
    assert isinstance(sections, list)
    manifest = ContractManifest(
        manifest_version=raw["manifest_version"],
        setup_skill_version=raw["setup_skill_version"],
        agents_version=raw["agents_version"],
        topic_decision_phase=raw["topic_decision_phase"],
        progress_schema_version=raw["progress_schema_version"],
        primary_benchmark_artifacts=tuple(artifacts),
        required_outline_sections=tuple((item["rule"], item["demo"]) for item in sections),
        expected_demo_outline_count=raw["expected_demo_outline_count"],
    )
    return manifest, []


def iter_files(root: Path) -> Iterator[Path]:
    if root.is_file():
        if root.name not in {"UPGRADING.md", "CHANGELOG.md"}:
            yield root
        return
    if not root.exists():
        return
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if path.name in {"UPGRADING.md", "CHANGELOG.md"}:
            continue
        if any(part in {".git", ".omx"} for part in path.parts):
            continue
        yield path


def read_text(path: Path) -> Optional[str]:
    try:
        return path.read_text(encoding="utf-8")
    except (OSError, UnicodeError):
        return None


def regex_hits(path: Path, pattern: re.Pattern[str]) -> Iterator[Finding]:
    text = read_text(path)
    if text is None:
        return
    for match in pattern.finditer(text):
        line = text.count("\n", 0, match.start()) + 1
        excerpt = text.splitlines()[line - 1] if text.splitlines() else ""
        yield Finding("", "", path, line, excerpt)


def check_absent_rule(repo_root: Path, rule: AbsentRule) -> List[Finding]:
    compiled = re.compile(rule.pattern)
    exempt = re.compile(rule.exempt_when) if rule.exempt_when else None
    findings: List[Finding] = []
    for relative_root in rule.relative_roots:
        root = repo_root / relative_root
        for path in iter_files(root):
            for hit in regex_hits(path, compiled):
                if exempt is not None:
                    # 只看命中行本身：显式容忍标记须与旧格式措辞同处一行才算「有据可查」，
                    # 避免相邻的静默降级借上一行的标记蒙混过关
                    if exempt.search(hit.excerpt):
                        continue
                findings.append(
                    Finding(rule.code, rule.label, hit.path, hit.line, hit.excerpt)
                )
    return findings


def line_context(lines: Sequence[str], index: int, lookback: int = 3) -> str:
    """Return the local Markdown branch without crossing a heading or blank line."""
    start = index
    remaining = lookback
    while start > 0 and remaining > 0:
        candidate = lines[start - 1]
        if not candidate.strip() or candidate.lstrip().startswith("#"):
            break
        start -= 1
        remaining -= 1
    return "\n".join(lines[start : index + 1])


def semantic_primary_fallback_findings(
    text: str,
    path: Path,
    primary_artifacts: Sequence[str],
) -> List[Finding]:
    """Find positive fallback branches for missing primary benchmark artifacts.

    Detection is intentionally local: a substitute source/action must occur in
    the same line, and the missing-primary condition must be in that line or
    its immediate Markdown-list context.  Explicit negative clauses such as
    "不得以拆文报告代替" are accepted.
    """
    findings: List[Finding] = []
    lines = text.splitlines()
    primary_terms = primary_term_pattern(primary_artifacts)
    primary_missing = re.compile(
        primary_terms + r".{0,50}" + MISSING_STATE_RE,
        re.IGNORECASE,
    )
    primary_missing_reversed = re.compile(
        MISSING_STATE_RE + r".{0,50}" + primary_terms,
        re.IGNORECASE,
    )
    primary_artifact = re.compile(primary_terms, re.IGNORECASE)
    for index, line in enumerate(lines):
        # Bind the action to its source within one natural-language clause.
        # A line may legitimately read a chapter summary and later fall back
        # from a *deep-dive* to another deep-dive; whole-line co-occurrence
        # would incorrectly classify that as a primary-artifact fallback.
        substitute_clauses = [
            clause
            for clause in re.split(r"\）、|[，,；;。！？!?]", line)
            if SUBSTITUTE_SOURCE_RE.search(clause)
            and SUBSTITUTE_ACTION_RE.search(clause)
            and not PROHIBITION_RE.search(clause)
        ]
        if not substitute_clauses:
            continue
        context = line_context(lines, index)
        has_missing = bool(
            primary_missing.search(context) or primary_missing_reversed.search(context)
        )
        has_primary = bool(primary_artifact.search(context))
        if not has_missing or not has_primary:
            continue
        findings.append(
            Finding(
                "silent-primary-artifact-fallback",
                "missing primary benchmark artifacts must fail fast; do not substitute summaries, 拆文报告, or 故事线",
                path,
                index + 1,
                substitute_clauses[0].strip() or line,
            )
        )
    return findings


def require_pattern(path: Path, pattern: str, code: str, message: str) -> List[Finding]:
    text = read_text(path)
    if text is None:
        return [Finding(code, "cannot read required file", path)]
    if re.search(pattern, text, re.MULTILINE):
        return []
    return [Finding(code, message, path)]


def parse_frontmatter_version(path: Path) -> Optional[str]:
    text = read_text(path)
    if text is None:
        return None
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return None
    for line in lines[1:]:
        if line.strip() == "---":
            break
        match = re.fullmatch(r"version:\s*([^\s]+)\s*", line)
        if match:
            return match.group(1)
    return None


def extract_current_version_fields(text: str) -> dict[str, str]:
    """Parse version bullets from the `## 当前版本` section only."""
    lines = text.splitlines()
    start: Optional[int] = None
    for index, line in enumerate(lines):
        if re.fullmatch(r"##\s+当前版本\s*", line):
            start = index + 1
            break
    if start is None:
        return {}

    end = len(lines)
    for index in range(start, len(lines)):
        if re.match(r"^#{1,2}\s+", lines[index]):
            end = index
            break

    fields: dict[str, str] = {}
    for line in lines[start:end]:
        match = re.fullmatch(
            r"\s*-\s+`(setup_skill_version|agents_version):\s*([^`]+)`\s*",
            line,
        )
        if match:
            fields[match.group(1)] = match.group(2).strip()
    return fields


def upgrading_version_findings(
    text: str, manifest: ContractManifest, path: Path
) -> List[Finding]:
    fields = extract_current_version_fields(text)
    expected = {
        "setup_skill_version": manifest.setup_skill_version,
        "agents_version": str(manifest.agents_version),
    }
    findings: List[Finding] = []
    for key, value in expected.items():
        actual = fields.get(key)
        if actual != value:
            findings.append(
                Finding(
                    "upgrading-current-version",
                    "UPGRADING current-version bullet {} must be {!r}, got {!r}".format(
                        key, value, actual
                    ),
                    path,
                )
            )
    return findings


def extract_sentinel_fields(text: str) -> Optional[dict[str, str]]:
    """Parse the generated `.story-deployed` YAML example from its Step section.

    This intentionally ignores version strings in surrounding explanatory
    prose.  The deployment contract is the fenced block following the
    "写入以下字段" instruction inside "创建部署标记".
    """
    lines = text.splitlines()
    section_start: Optional[int] = None
    heading_level = 0
    for index, line in enumerate(lines):
        match = re.match(r"^(#{2,6})\s+Step\s+[A-Za-z0-9]+[：:]\s*创建部署标记\s*$", line)
        if match:
            section_start = index + 1
            heading_level = len(match.group(1))
            break
    if section_start is None:
        return None

    section_end = len(lines)
    for index in range(section_start, len(lines)):
        match = re.match(r"^(#{1,6})\s+", lines[index])
        if match and len(match.group(1)) <= heading_level:
            section_end = index
            break

    marker_index: Optional[int] = None
    for index in range(section_start, section_end):
        if "写入以下字段" in lines[index]:
            marker_index = index + 1
            break
    if marker_index is None:
        return None

    fence_start: Optional[int] = None
    for index in range(marker_index, section_end):
        if re.match(r"^\s*```(?:ya?ml)?\s*$", lines[index], re.IGNORECASE):
            fence_start = index + 1
            break
    if fence_start is None:
        return None

    fence_end: Optional[int] = None
    for index in range(fence_start, section_end):
        if re.match(r"^\s*```\s*$", lines[index]):
            fence_end = index
            break
    if fence_end is None:
        return None

    fields: dict[str, str] = {}
    for line in lines[fence_start:fence_end]:
        match = re.match(r"^\s*([A-Za-z_][A-Za-z0-9_]*):\s*(.*?)\s*$", line)
        if match:
            fields[match.group(1)] = match.group(2)
    return fields


def sentinel_contract_findings(
    text: str, manifest: ContractManifest, path: Path
) -> List[Finding]:
    fields = extract_sentinel_fields(text)
    if fields is None:
        return [
            Finding(
                "setup-sentinel-block",
                "cannot find the structured generated-sentinel fenced block",
                path,
            )
        ]

    required = {
        "deployed_at",
        "agents_version",
        "setup_skill_version",
        "target_cli",
        "resolver_strategy",
        "references_dir",
    }
    findings: List[Finding] = []
    missing = sorted(required - set(fields))
    if missing:
        findings.append(
            Finding(
                "setup-sentinel-fields",
                "generated sentinel is missing fields: {}".format(", ".join(missing)),
                path,
            )
        )

    expected = {
        "agents_version": str(manifest.agents_version),
        "setup_skill_version": manifest.setup_skill_version,
    }
    for key, value in expected.items():
        actual = fields.get(key)
        if actual != value:
            findings.append(
                Finding(
                    "setup-sentinel-field",
                    "generated sentinel {} must be {!r}, got {!r}".format(key, value, actual),
                    path,
                )
            )
    return findings


def _clean_markdown_label(label: str) -> str:
    return label.strip().strip("`*_ ")


def _normalize_rule_field(label: str) -> str:
    label = _clean_markdown_label(label)
    if label.startswith("本章"):
        label = label[2:]
    label = re.sub(r"[（(].*$", "", label).strip()
    return label


def extract_outline_rule_fields(text: str) -> set[str]:
    """Return structured field labels from Rules item 2 (细纲必填项)."""
    lines = text.splitlines()
    start: Optional[int] = None
    for index, line in enumerate(lines):
        if re.match(r"^\s*2\.\s+\*\*细纲必填项\*\*", line):
            start = index + 1
            break
    if start is None:
        return set()

    end = len(lines)
    for index in range(start, len(lines)):
        if re.match(r"^\s*[3-9][0-9]*\.\s+\*\*", lines[index]):
            end = index
            break

    fields: set[str] = set()
    for line in lines[start:end]:
        match = re.match(r"^\s*-\s+(.+?)[：:]", line)
        if match:
            fields.add(_normalize_rule_field(match.group(1)))
    return fields


def outline_rule_contract_findings(
    text: str, manifest: ContractManifest, path: Path
) -> List[Finding]:
    fields = extract_outline_rule_fields(text)
    required = {rule for rule, _ in manifest.required_outline_sections}
    missing = sorted(required - fields)
    if not missing:
        return []
    return [
        Finding(
            "outline-rule-section",
            "outline rule is missing structured blueprint fields: {}".format(", ".join(missing)),
            path,
        )
    ]


def extract_demo_outline_fields(text: str) -> set[str]:
    """Return labels declared as headings or `- field: value` entries."""
    fields: set[str] = set()
    for line in text.splitlines():
        heading = re.match(r"^#{2,6}\s+(.+?)\s*$", line)
        if heading:
            fields.add(_clean_markdown_label(heading.group(1)))
            continue
        bullet = re.match(r"^\s*-\s+(.+?)[：:]", line)
        if bullet:
            fields.add(_clean_markdown_label(bullet.group(1)))
    return fields


def validate_repository(repo_root: Path, manifest: ContractManifest) -> List[Finding]:
    findings: List[Finding] = []

    for rule in LEGACY_RULES:
        findings.extend(check_absent_rule(repo_root, rule))

    pipeline = repo_root / "skills/story-long-analyze/references/pipeline-ops.md"
    pipeline_text = read_text(pipeline) or ""
    schema_values = [int(value) for value in re.findall(r"schema_version:\s*([0-9]+)", pipeline_text)]
    if not schema_values or any(value != manifest.progress_schema_version for value in schema_values):
        findings.append(
            Finding(
                "progress-schema-version",
                "every pipeline schema_version must equal {} (found {})".format(
                    manifest.progress_schema_version, schema_values or "none"
                ),
                pipeline,
            )
        )
    findings.extend(require_pattern(pipeline, r"章节边界", "chapter-boundary-table", "progress must keep the canonical chapter-boundary table"))

    setup_skill = repo_root / "skills/story-setup/SKILL.md"
    actual_setup_version = parse_frontmatter_version(setup_skill)
    if actual_setup_version != manifest.setup_skill_version:
        findings.append(
            Finding(
                "setup-frontmatter-version",
                "story-setup frontmatter version must be {}, got {!r}".format(
                    manifest.setup_skill_version, actual_setup_version
                ),
                setup_skill,
            )
        )
    setup_text = read_text(setup_skill) or ""
    findings.extend(sentinel_contract_findings(setup_text, manifest, setup_skill))

    upgrading = repo_root / "skills/story-setup/UPGRADING.md"
    upgrading_text = read_text(upgrading) or ""
    findings.extend(upgrading_version_findings(upgrading_text, manifest, upgrading))

    topic_file = repo_root / "skills/story-long-scan/references/topic-decision.md"
    topic_text = read_text(topic_file) or ""
    topic_match = re.search(r"Phase\s+([0-9]+)[^\n]*产出\s*`选题决策\.md`", topic_text)
    if not topic_match or int(topic_match.group(1)) != manifest.topic_decision_phase:
        findings.append(
            Finding(
                "topic-decision-phase",
                "topic-decision output phase must be {}, got {}".format(
                    manifest.topic_decision_phase,
                    topic_match.group(1) if topic_match else "none",
                ),
                topic_file,
            )
        )
    scan_skill = repo_root / "skills/story-long-scan/SKILL.md"
    findings.extend(
        require_pattern(
            scan_skill,
            r"^#{{2,6}}\s+Phase\s+{}[：:]\s*选题决策\s*$".format(manifest.topic_decision_phase),
            "topic-decision-phase-heading",
            "story-long-scan must expose topic decision as Phase {}".format(manifest.topic_decision_phase),
        )
    )
    for path in iter_files(repo_root / "skills"):
        if path.suffix.lower() != ".md":
            continue
        text = read_text(path) or ""
        for line_number, line_text in enumerate(text.splitlines(), start=1):
            if "选题决策" not in line_text:
                continue
            for match in re.finditer(r"story-long-scan\s+Phase\s+([0-9]+)", line_text):
                value = int(match.group(1))
                if value == manifest.topic_decision_phase:
                    continue
                findings.append(
                    Finding(
                        "stale-topic-decision-phase-reference",
                        "story-long-scan topic-decision references must use Phase {}".format(
                            manifest.topic_decision_phase
                        ),
                        path,
                        line_number,
                        line_text,
                    )
                )

    long_analyze = repo_root / "skills/story-long-analyze/SKILL.md"
    findings.extend(require_pattern(long_analyze, r"invalid_topic_decision_contract", "invalid-topic-contract", "invalid topic-decision artifacts must fail explicitly"))
    explorer = repo_root / "skills/story-setup/references/templates/agents/story-explorer.md"
    findings.extend(require_pattern(explorer, r"missing_primary_contract", "explorer-primary-failure", "story-explorer must fail closed on missing current benchmark artifacts"))
    findings.extend(require_pattern(explorer, r"repair_action", "explorer-repair-action", "story-explorer must return an explicit repair action"))

    long_write = repo_root / "skills/story-long-write/SKILL.md"
    for artifact in manifest.primary_benchmark_artifacts:
        findings.extend(
            require_pattern(
                long_write,
                re.escape(artifact),
                "long-write-primary-artifact",
                "long writing must require {}".format(artifact),
            )
        )

    outline_rule = repo_root / "skills/story-setup/references/templates/rules/story-outline.md"
    outline_rule_text = read_text(outline_rule) or ""
    findings.extend(
        outline_rule_contract_findings(outline_rule_text, manifest, outline_rule)
    )

    demo_root = repo_root / "demo/拆文库-盘龙"
    for artifact in manifest.primary_benchmark_artifacts:
        artifact_path = demo_root / artifact
        try:
            has_content = artifact_path.is_file() and artifact_path.stat().st_size > 0
        except OSError:
            has_content = False
        if not has_content:
            findings.append(
                Finding("demo-primary-artifact", "demo deconstruction is missing non-empty {}".format(artifact), artifact_path)
            )

    outline_dir = repo_root / "demo/让你管账号，你高燃混剪炸全网/大纲"
    outlines = sorted(outline_dir.glob("细纲_第*.md"))
    if len(outlines) != manifest.expected_demo_outline_count:
        findings.append(
            Finding(
                "demo-outline-count",
                "expected {} demo chapter outlines, found {}".format(
                    manifest.expected_demo_outline_count, len(outlines)
                ),
                outline_dir,
            )
        )
    for outline in outlines:
        text = read_text(outline) or ""
        declared_fields = extract_demo_outline_fields(text)
        missing = [
            demo
            for _, demo in manifest.required_outline_sections
            if demo not in declared_fields
        ]
        if missing:
            findings.append(
                Finding(
                    "demo-outline-section",
                    "demo outline is missing current blueprint sections: {}".format(", ".join(missing)),
                    outline,
                )
            )

    for path in iter_files(repo_root / "skills"):
        if path.suffix.lower() != ".md":
            continue
        text = read_text(path)
        if text is not None:
            findings.extend(
                semantic_primary_fallback_findings(
                    text,
                    path,
                    manifest.primary_benchmark_artifacts,
                )
            )

    return findings


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--repo-root",
        type=Path,
        default=Path(__file__).resolve().parent.parent,
        help="repository root (default: parent of scripts/)",
    )
    parser.add_argument(
        "--manifest",
        type=Path,
        default=Path(__file__).resolve().with_name("current-contract.json"),
        help="current contract manifest",
    )
    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = build_parser().parse_args(argv)
    repo_root = args.repo_root.resolve()
    manifest, manifest_findings = load_manifest(args.manifest.resolve())

    print("Current Skill Contract Check")
    print("============================")
    if manifest_findings:
        for finding in manifest_findings:
            print("  [FAIL] {}: {}".format(finding.code, finding.detail(repo_root)))
        print("\nResult: {} failure(s)".format(len(manifest_findings)))
        return 1

    assert manifest is not None
    print("  [PASS] manifest schema and declared release values")
    findings = validate_repository(repo_root, manifest)
    if findings:
        for finding in findings:
            print("  [FAIL] {}: {}".format(finding.code, finding.detail(repo_root)))
        print("\nResult: {} failure(s)".format(len(findings)))
        return 1

    print("  [PASS] legacy/path guards")
    print("  [PASS] version, phase, progress, and artifact contracts")
    print("  [PASS] primary-artifact fallback semantics")
    print("  [PASS] demo primary artifacts and {} outlines".format(manifest.expected_demo_outline_count))
    print("\nResult: all current-contract checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
