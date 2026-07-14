#!/usr/bin/env python3
"""Audit and normalize workflow Step numbering in canonical skill Markdown.

The fixer intentionally has a narrow write surface: it renumbers only explicit
ATX headings such as ``### Step 1.5`` and references that can be bound to those
headings without guessing. Phase/Stage labels, raw numeric headings, and
bullet labels are never rewritten automatically.
"""

from __future__ import annotations

import argparse
import difflib
import os
import re
import shutil
import sys
import tempfile
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable, Sequence
from urllib.parse import unquote


REPO_ROOT = Path(__file__).resolve().parent.parent

ATX_HEADING_RE = re.compile(
    r"^[ ]{0,3}(#{1,6})[ \t]+(.*?)(?:[ \t]+#+[ \t]*)?$"
)
FENCE_OPEN_RE = re.compile(r"^[ ]{0,3}(`{3,}|~{3,})")
STEP_HEADING_RE = re.compile(
    r"^Step(?P<space>[ \t]+)(?P<label>[0-9]+(?:\.[0-9]+)*)"
    r"(?=$|[ \t:：.、)\]—–-])"
)
STEP_LABEL_RE = re.compile(
    r"(?<![A-Za-z0-9_])Step[ \t]+(?P<label>[0-9]+(?:\.[0-9]+)*)\b"
)
DOTTED_WORKFLOW_LABEL_RE = re.compile(
    r"(?<![A-Za-z0-9_])(?P<kind>Step|Phase|Stage)[ \t]+"
    r"(?P<label>[0-9]+\.[0-9]+(?:\.[0-9]+)*)\b"
)
RAW_DOTTED_HEADING_RE = re.compile(
    r"^[ ]{0,3}#{1,6}[ \t]+(?P<label>[0-9]+\.[0-9]+(?:\.[0-9]+)*)"
    r"(?=$|[ \t:：.、)\]—–-])"
)
DOTTED_BULLET_RE = re.compile(
    r"^[ \t]*[-*+][ \t]+"
    r"(?:(?:Step|Phase|Stage)[ \t]+)?"
    r"(?P<label>[0-9]+\.[0-9]+(?:\.[0-9]+)*)"
    r"(?=$|[ \t:：.、)\]—–-])"
)
MARKDOWN_LINK_RE = re.compile(r"!?\[[^\]\n]*\]\((?P<target>[^)\n]+)\)")
REFERENCE_LINK_RE = re.compile(
    r"^[ ]{0,3}\[[^\]\n]+\]:[ \t]*(?P<target><[^>\n]+>|\S+)"
)
INLINE_CODE_RE = re.compile(r"(?<!`)`[^`\n]+`(?!`)")
EXTERNAL_SCHEMES = ("http://", "https://", "mailto:", "data:", "tel:")


@dataclass
class Heading:
    line_index: int
    level: int
    title: str
    parent_index: int | None
    section_end: int = 0


@dataclass
class StepHeading:
    heading_index: int
    line_index: int
    level: int
    parent_index: int | None
    old_label: str
    new_label: str = ""
    label_start: int = 0
    label_end: int = 0

    @property
    def group_key(self) -> tuple[int, int | None]:
        return (self.level, self.parent_index)


@dataclass(frozen=True)
class Replacement:
    line_index: int
    start: int
    end: int
    value: str


@dataclass(frozen=True)
class Issue:
    path: Path
    line: int
    column: int
    code: str
    message: str
    blocks_fix: bool = False


@dataclass
class Document:
    path: Path
    display_path: str
    text: str
    lines: list[str]
    headings: list[Heading] = field(default_factory=list)
    steps: list[StepHeading] = field(default_factory=list)
    fenced_lines: set[int] = field(default_factory=set)


@dataclass
class Analysis:
    documents: list[Document]
    issues: list[Issue]
    replacements: dict[Path, list[Replacement]]

    @property
    def blockers(self) -> list[Issue]:
        return [issue for issue in self.issues if issue.blocks_fix]


def strip_line_ending(line: str) -> str:
    return line.rstrip("\r\n")


def parse_document(path: Path, root: Path) -> Document:
    raw = path.read_bytes()
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise ValueError(f"{display_path(path, root)} is not valid UTF-8: {exc}") from exc

    lines = text.splitlines(keepends=True)
    if text and not lines:
        lines = [text]
    document = Document(
        path=path,
        display_path=display_path(path, root),
        text=text,
        lines=lines,
    )

    stack: list[int] = []
    fence_char: str | None = None
    fence_length = 0

    for line_index, line in enumerate(lines):
        content = strip_line_ending(line)
        if fence_char is not None:
            document.fenced_lines.add(line_index)
            close_re = re.compile(
                rf"^[ ]{{0,3}}{re.escape(fence_char)}{{{fence_length},}}[ \t]*$"
            )
            if close_re.match(content):
                fence_char = None
                fence_length = 0
            continue

        fence_match = FENCE_OPEN_RE.match(content)
        if fence_match:
            marker = fence_match.group(1)
            fence_char = marker[0]
            fence_length = len(marker)
            document.fenced_lines.add(line_index)
            continue

        heading_match = ATX_HEADING_RE.match(content)
        if not heading_match:
            continue

        level = len(heading_match.group(1))
        title = heading_match.group(2)
        while stack and document.headings[stack[-1]].level >= level:
            stack.pop()
        parent_index = stack[-1] if stack else None
        heading_index = len(document.headings)
        document.headings.append(
            Heading(
                line_index=line_index,
                level=level,
                title=title,
                parent_index=parent_index,
                section_end=len(lines),
            )
        )
        stack.append(heading_index)

        step_match = STEP_HEADING_RE.match(title)
        if step_match:
            # heading_match.start(2) locates the title inside the original line;
            # step_match spans are relative to that title.
            title_start = heading_match.start(2)
            label_start = title_start + step_match.start("label")
            label_end = title_start + step_match.end("label")
            document.steps.append(
                StepHeading(
                    heading_index=heading_index,
                    line_index=line_index,
                    level=level,
                    parent_index=parent_index,
                    old_label=step_match.group("label"),
                    label_start=label_start,
                    label_end=label_end,
                )
            )

    for index, heading in enumerate(document.headings):
        for following in document.headings[index + 1 :]:
            if following.level <= heading.level:
                heading.section_end = following.line_index
                break

    return document


def display_path(path: Path, root: Path) -> str:
    try:
        return path.relative_to(root).as_posix()
    except ValueError:
        return str(path)


def markdown_slug(title: str) -> str:
    """Return the GitHub-style heading slug subset used by repository checks."""

    result: list[str] = []
    for char in title.strip().lower():
        category = unicodedata.category(char)
        if char.isspace():
            result.append("-")
        elif char in "-_" or category[0] in {"L", "M", "N"}:
            result.append(char)
    return "".join(result)


def allocate_anchor(title: str, counts: dict[str, int]) -> str:
    base = markdown_slug(title)
    suffix = counts.get(base, 0)
    counts[base] = suffix + 1
    return base if suffix == 0 else f"{base}-{suffix}"


def is_direct_skill_entry(path: Path, root: Path) -> bool:
    skills_dir = root / "skills"
    try:
        relative = path.relative_to(skills_dir)
    except ValueError:
        return False
    return len(relative.parts) == 2 and relative.parts[-1] == "SKILL.md"


def discover_markdown(root: Path, requested: Sequence[str]) -> list[Path]:
    candidates: list[Path] = []
    if requested:
        for raw_path in requested:
            candidate = Path(raw_path)
            if not candidate.is_absolute():
                candidate = root / candidate
            if not candidate.exists():
                raise FileNotFoundError(f"path does not exist: {candidate}")
            if candidate.is_dir():
                candidates.extend(candidate.rglob("*.md"))
            elif candidate.suffix.lower() == ".md":
                candidates.append(candidate)
            else:
                raise ValueError(f"not a Markdown file or directory: {candidate}")
    else:
        skills_dir = root / "skills"
        if not skills_dir.is_dir():
            raise FileNotFoundError(f"canonical skills directory not found: {skills_dir}")
        candidates.extend(skills_dir.rglob("*.md"))

    unique: dict[str, Path] = {}
    for candidate in candidates:
        if not candidate.is_file():
            continue
        absolute = candidate.absolute()
        unique[os.path.normcase(str(absolute))] = absolute
    files = sorted(unique.values(), key=lambda item: display_path(item, root))
    if not files:
        raise ValueError("no Markdown files found in the selected scope")
    return files


def assign_step_numbers(document: Document) -> tuple[list[Issue], list[Replacement]]:
    issues: list[Issue] = []
    replacements: list[Replacement] = []
    groups: dict[tuple[int, int | None], list[StepHeading]] = {}
    for step in document.steps:
        groups.setdefault(step.group_key, []).append(step)

    for steps in groups.values():
        old_targets: dict[str, set[str]] = {}
        for ordinal, step in enumerate(steps, start=1):
            step.new_label = str(ordinal)
            old_targets.setdefault(step.old_label, set()).add(step.new_label)
            if step.old_label != step.new_label:
                issues.append(
                    Issue(
                        path=document.path,
                        line=step.line_index + 1,
                        column=step.label_start + 1,
                        code="step-sequence",
                        message=(
                            f"Step {step.old_label} should be Step {step.new_label} "
                            "within its heading-level/parent group"
                        ),
                    )
                )
                replacements.append(
                    Replacement(
                        line_index=step.line_index,
                        start=step.label_start,
                        end=step.label_end,
                        value=step.new_label,
                    )
                )

        for old_label, targets in old_targets.items():
            if len(targets) <= 1:
                continue
            first_conflict = next(step for step in steps if step.old_label == old_label)
            issues.append(
                Issue(
                    path=document.path,
                    line=first_conflict.line_index + 1,
                    column=first_conflict.label_start + 1,
                    code="ambiguous-step-mapping",
                    message=(
                        f"Step {old_label} occurs more than once in one group and would map "
                        f"to {', '.join('Step ' + target for target in sorted(targets, key=int))}"
                    ),
                    blocks_fix=True,
                )
            )

    return issues, replacements


def group_scope_contains(document: Document, step: StepHeading, line_index: int) -> bool:
    if step.parent_index is None:
        return True
    parent = document.headings[step.parent_index]
    return parent.line_index <= line_index < parent.section_end


def containing_workflow_parent(document: Document, line_index: int) -> int | None:
    """Return the deepest Step-owning parent section containing ``line_index``."""

    parent_indexes = {
        step.parent_index for step in document.steps if step.parent_index is not None
    }
    containing = [
        parent_index
        for parent_index in parent_indexes
        if document.headings[parent_index].line_index <= line_index
        < document.headings[parent_index].section_end
    ]
    if not containing:
        return None
    return max(containing, key=lambda index: document.headings[index].level)


def bind_step_references(document: Document) -> tuple[list[Issue], list[Replacement]]:
    issues: list[Issue] = []
    replacements: list[Replacement] = []
    candidates_by_label: dict[str, list[StepHeading]] = {}
    heading_spans: dict[int, set[tuple[int, int]]] = {}
    for step in document.steps:
        candidates_by_label.setdefault(step.old_label, []).append(step)
        heading_spans.setdefault(step.line_index, set()).add((step.label_start, step.label_end))

    for line_index, line in enumerate(document.lines):
        content = strip_line_ending(line)
        for match in STEP_LABEL_RE.finditer(content):
            label_span = (match.start("label"), match.end("label"))
            if label_span in heading_spans.get(line_index, set()):
                continue

            old_label = match.group("label")
            candidates = candidates_by_label.get(old_label, [])
            if not candidates:
                if "." in old_label:
                    issues.append(
                        Issue(
                            path=document.path,
                            line=line_index + 1,
                            column=match.start() + 1,
                            code="unbound-step-reference",
                            message=(
                                f"fractional Step {old_label} reference has no explicit "
                                "Step heading in this file"
                            ),
                            blocks_fix=True,
                        )
                    )
                continue

            scoped = [
                candidate
                for candidate in candidates
                if group_scope_contains(document, candidate, line_index)
            ]
            workflow_parent = containing_workflow_parent(document, line_index)
            if not scoped and workflow_parent is not None:
                parent = document.headings[workflow_parent]
                issues.append(
                    Issue(
                        path=document.path,
                        line=line_index + 1,
                        column=match.start() + 1,
                        code="unscoped-step-reference",
                        message=(
                            f"Step {old_label} has no matching heading inside workflow "
                            f"section {parent.title!r}; refusing to bind it to another workflow"
                        ),
                        blocks_fix=True,
                    )
                )
                continue

            selected = scoped or candidates
            target_labels = {candidate.new_label for candidate in selected}
            if len(target_labels) != 1:
                rendered = ", ".join(
                    "Step " + target for target in sorted(target_labels, key=int)
                )
                issues.append(
                    Issue(
                        path=document.path,
                        line=line_index + 1,
                        column=match.start() + 1,
                        code="ambiguous-step-reference",
                        message=(
                            f"Step {old_label} reference can map to {rendered}; move it under "
                            "one workflow parent or make the target explicit"
                        ),
                        blocks_fix=True,
                    )
                )
                continue

            new_label = next(iter(target_labels))
            if new_label != old_label:
                replacements.append(
                    Replacement(
                        line_index=line_index,
                        start=match.start("label"),
                        end=match.end("label"),
                        value=new_label,
                    )
                )

    return issues, replacements


def renamed_heading_anchors(document: Document) -> dict[str, tuple[str, int]]:
    """Map changed old anchors to `(new_anchor, heading_line)` for one document.

    Duplicate-anchor suffixes are allocated across every heading, because a
    Step rename can also shift the generated anchor of a later non-Step heading.
    """

    steps_by_heading = {step.heading_index: step for step in document.steps}
    old_counts: dict[str, int] = {}
    new_counts: dict[str, int] = {}
    changes: dict[str, tuple[str, int]] = {}
    for heading_index, heading in enumerate(document.headings):
        old_title = heading.title
        new_title = old_title
        step = steps_by_heading.get(heading_index)
        if step is not None and step.old_label != step.new_label:
            match = STEP_HEADING_RE.match(old_title)
            if match is None:  # parse_document created the Step, so this is defensive.
                raise RuntimeError(
                    f"cannot rebuild Step heading anchor in {document.display_path}:"
                    f"{heading.line_index + 1}"
                )
            new_title = (
                old_title[: match.start("label")]
                + step.new_label
                + old_title[match.end("label") :]
            )
        old_anchor = allocate_anchor(old_title, old_counts)
        new_anchor = allocate_anchor(new_title, new_counts)
        if old_anchor != new_anchor:
            changes[old_anchor] = (new_anchor, heading.line_index + 1)
    return changes


def strip_link_title(target: str) -> str:
    target = target.strip()
    if target.startswith("<") and ">" in target:
        return target[1 : target.index(">")]
    match = re.match(r"^(.*?)(?:\s+[\"'].*[\"'])?$", target)
    return (match.group(1) if match else target).strip()


def link_destination(
    raw: str, source: Path, root: Path
) -> tuple[Path, str] | None:
    target = strip_link_title(raw)
    if not target or target.lower().startswith(EXTERNAL_SCHEMES):
        return None
    path_part, separator, fragment = target.partition("#")
    if not separator or not fragment:
        return None
    decoded_path = unquote(path_part)
    if not decoded_path:
        target_path = source
    elif decoded_path.startswith("/"):
        target_path = root / decoded_path.lstrip("/")
    else:
        target_path = source.parent / decoded_path
    return target_path.resolve(), unquote(fragment).lower()


def repository_markdown(root: Path) -> list[Path]:
    excluded = {".git", ".omx", "node_modules", "__pycache__"}
    return sorted(
        path.absolute()
        for path in root.rglob("*.md")
        if path.is_file()
        and not any(part in excluded for part in path.relative_to(root).parts)
    )


def anchor_reference_issues(
    documents: Sequence[Document], root: Path
) -> list[Issue]:
    """Fail closed when renumbering would invalidate an existing fragment link.

    Sources are scanned repository-wide rather than only inside the requested
    write scope, so `fix path/to/SKILL.md` cannot break an inbound same-skill
    reference that lives in an unselected reference file.
    """

    changes_by_path = {
        document.path.resolve(): renamed_heading_anchors(document)
        for document in documents
    }
    changes_by_path = {
        path: changes for path, changes in changes_by_path.items() if changes
    }
    if not changes_by_path:
        return []

    selected = {document.path.resolve(): document for document in documents}
    issues: list[Issue] = []
    for path in repository_markdown(root):
        document = selected.get(path.resolve()) or parse_document(path, root)
        for line_index, line in enumerate(document.lines):
            if line_index in document.fenced_lines:
                continue
            content = INLINE_CODE_RE.sub("", strip_line_ending(line))
            matches = list(MARKDOWN_LINK_RE.finditer(content))
            reference_match = REFERENCE_LINK_RE.match(content)
            if reference_match:
                matches.append(reference_match)
            for match in matches:
                destination = link_destination(
                    match.group("target"), document.path, root
                )
                if destination is None:
                    continue
                target_path, fragment = destination
                changed = changes_by_path.get(target_path, {}).get(fragment)
                if changed is None:
                    continue
                new_anchor, heading_line = changed
                issues.append(
                    Issue(
                        path=document.path,
                        line=line_index + 1,
                        column=match.start("target") + 1,
                        code="step-anchor-reference",
                        message=(
                            f"renumbering heading {display_path(target_path, root)}:"
                            f"{heading_line} changes #{fragment} to #{new_anchor}; "
                            "update this Markdown fragment explicitly before retrying"
                        ),
                        blocks_fix=True,
                    )
                )
    return issues


def check_label_policy(document: Document, root: Path) -> list[Issue]:
    issues: list[Issue] = []
    direct_skill_entry = is_direct_skill_entry(document.path, root)
    for line_index, line in enumerate(document.lines):
        content = strip_line_ending(line)
        for match in DOTTED_WORKFLOW_LABEL_RE.finditer(content):
            kind = match.group("kind")
            issues.append(
                Issue(
                    path=document.path,
                    line=line_index + 1,
                    column=match.start() + 1,
                    code=f"dotted-{kind.lower()}-label",
                    message=(
                        f"{kind} {match.group('label')} uses a dotted workflow label; "
                        "use stable integer workflow numbering"
                    ),
                )
            )

        if not direct_skill_entry or line_index in document.fenced_lines:
            continue
        raw_match = RAW_DOTTED_HEADING_RE.match(content)
        if raw_match:
            issues.append(
                Issue(
                    path=document.path,
                    line=line_index + 1,
                    column=raw_match.start("label") + 1,
                    code="raw-dotted-heading",
                    message=(
                        f"raw workflow heading {raw_match.group('label')} is dotted; "
                        "name workflow headings explicitly and use integer labels"
                    ),
                )
            )
        bullet_match = DOTTED_BULLET_RE.match(content)
        if bullet_match:
            issues.append(
                Issue(
                    path=document.path,
                    line=line_index + 1,
                    column=bullet_match.start("label") + 1,
                    code="dotted-bullet-label",
                    message=(
                        f"bullet substep {bullet_match.group('label')} is dotted; "
                        "use an unnumbered label or a nested integer Step heading"
                    ),
                )
            )
    return issues


def analyze(files: Sequence[Path], root: Path) -> Analysis:
    documents: list[Document] = []
    issues: list[Issue] = []
    replacements: dict[Path, list[Replacement]] = {}

    for path in files:
        document = parse_document(path, root)
        documents.append(document)
        sequence_issues, heading_replacements = assign_step_numbers(document)
        reference_issues, reference_replacements = bind_step_references(document)
        policy_issues = check_label_policy(document, root)
        issues.extend(sequence_issues)
        issues.extend(reference_issues)
        issues.extend(policy_issues)
        replacements[path] = heading_replacements + reference_replacements

    issues.extend(anchor_reference_issues(documents, root))
    issues = sorted(
        deduplicate_issues(issues),
        key=lambda issue: (
            display_path(issue.path, root),
            issue.line,
            issue.column,
            issue.code,
        ),
    )
    return Analysis(documents=documents, issues=issues, replacements=replacements)


def deduplicate_issues(issues: Iterable[Issue]) -> list[Issue]:
    unique: dict[tuple[Path, int, int, str, str], Issue] = {}
    for issue in issues:
        key = (issue.path, issue.line, issue.column, issue.code, issue.message)
        unique[key] = issue
    return list(unique.values())


def render_document(document: Document, replacements: Sequence[Replacement]) -> str:
    by_line: dict[int, list[Replacement]] = {}
    for replacement in replacements:
        by_line.setdefault(replacement.line_index, []).append(replacement)

    rendered = list(document.lines)
    for line_index, line_replacements in by_line.items():
        ordered = sorted(line_replacements, key=lambda item: (item.start, item.end))
        for previous, current in zip(ordered, ordered[1:]):
            if previous.end > current.start:
                raise RuntimeError(
                    f"overlapping replacements in {document.display_path}:{line_index + 1}"
                )
        line = rendered[line_index]
        for replacement in reversed(ordered):
            line = line[: replacement.start] + replacement.value + line[replacement.end :]
        rendered[line_index] = line
    return "".join(rendered)


def transformed_documents(analysis: Analysis) -> dict[Path, str]:
    transformed: dict[Path, str] = {}
    for document in analysis.documents:
        rendered = render_document(document, analysis.replacements[document.path])
        if rendered != document.text:
            transformed[document.path] = rendered
    return transformed


def format_issue(issue: Issue, root: Path) -> str:
    prefix = "BLOCK" if issue.blocks_fix else "ISSUE"
    return (
        f"{prefix} {display_path(issue.path, root)}:{issue.line}:{issue.column} "
        f"[{issue.code}] {issue.message}"
    )


def print_issues(issues: Sequence[Issue], root: Path) -> None:
    for issue in issues:
        print(format_issue(issue, root))


def group_inventory(document: Document) -> Iterable[str]:
    groups: dict[tuple[int, int | None], list[StepHeading]] = {}
    for step in document.steps:
        groups.setdefault(step.group_key, []).append(step)
    for (level, parent_index), steps in groups.items():
        if parent_index is None:
            parent = "<document>"
        else:
            heading = document.headings[parent_index]
            parent = f"line {heading.line_index + 1} {heading.title!r}"
        before = ", ".join("Step " + step.old_label for step in steps)
        after = ", ".join("Step " + step.new_label for step in steps)
        yield (
            f"GROUP {document.display_path}: level {level}, parent {parent}: "
            f"{before} -> {after}"
        )


def command_audit(analysis: Analysis, root: Path) -> int:
    group_count = 0
    step_count = 0
    for document in analysis.documents:
        inventory = list(group_inventory(document))
        group_count += len(inventory)
        step_count += len(document.steps)
        for line in inventory:
            print(line)
    print_issues(analysis.issues, root)
    print(
        f"SUMMARY: {len(analysis.documents)} Markdown file(s), {group_count} Step group(s), "
        f"{step_count} Step heading(s), {len(analysis.issues)} issue(s)"
    )
    return 0


def command_check(analysis: Analysis, root: Path) -> int:
    if analysis.issues:
        print_issues(analysis.issues, root)
        print(
            f"FAIL: {len(analysis.issues)} numbering issue(s) across "
            f"{len(analysis.documents)} Markdown file(s)"
        )
        return 1
    print(
        f"PASS: {len(analysis.documents)} Markdown file(s) use canonical workflow numbering"
    )
    return 0


def print_diffs(analysis: Analysis, transformed: dict[Path, str]) -> None:
    documents_by_path = {document.path: document for document in analysis.documents}
    for path in sorted(transformed, key=lambda item: documents_by_path[item].display_path):
        document = documents_by_path[path]
        diff = difflib.unified_diff(
            document.text.splitlines(keepends=True),
            transformed[path].splitlines(keepends=True),
            fromfile=document.display_path,
            tofile=document.display_path,
        )
        sys.stdout.writelines(diff)


def transactional_write(changes: dict[Path, str]) -> None:
    staged: dict[Path, Path] = {}
    backups: dict[Path, Path] = {}
    replaced: list[Path] = []
    try:
        # Stage every new file and every backup before replacing the first path.
        for path in sorted(changes, key=str):
            stat = path.stat()
            fd, staged_name = tempfile.mkstemp(
                prefix=f".{path.name}.skill-numbering.", suffix=".tmp", dir=path.parent
            )
            staged_path = Path(staged_name)
            staged[path] = staged_path
            try:
                with os.fdopen(fd, "wb") as handle:
                    handle.write(changes[path].encode("utf-8"))
                    handle.flush()
                    os.fsync(handle.fileno())
                os.chmod(staged_path, stat.st_mode)
            except Exception:
                staged_path.unlink(missing_ok=True)
                raise

            backup_fd, backup_name = tempfile.mkstemp(
                prefix=f".{path.name}.skill-numbering.", suffix=".bak", dir=path.parent
            )
            os.close(backup_fd)
            backup_path = Path(backup_name)
            shutil.copy2(path, backup_path)
            backups[path] = backup_path

        for path in sorted(changes, key=str):
            os.replace(staged[path], path)
            replaced.append(path)

    except Exception as exc:
        rollback_errors: list[str] = []
        for path in reversed(replaced):
            try:
                os.replace(backups[path], path)
            except Exception as rollback_exc:  # pragma: no cover - catastrophic I/O
                rollback_errors.append(f"{path}: {rollback_exc}")
        if rollback_errors:
            details = "; ".join(rollback_errors)
            raise RuntimeError(f"write failed ({exc}); rollback also failed: {details}") from exc
        raise
    finally:
        for temporary in list(staged.values()) + list(backups.values()):
            temporary.unlink(missing_ok=True)


def command_fix(analysis: Analysis, root: Path, write: bool) -> int:
    if analysis.blockers:
        print_issues(analysis.blockers, root)
        print(
            f"ABORT: {len(analysis.blockers)} unbound/ambiguous mapping issue(s); "
            "no files were written"
        )
        return 1

    manual_issues = [
        issue
        for issue in analysis.issues
        if issue.code
        in {
            "dotted-phase-label",
            "dotted-stage-label",
            "raw-dotted-heading",
            "dotted-bullet-label",
        }
    ]
    if write and manual_issues:
        print_issues(manual_issues, root)
        print(
            f"ABORT: {len(manual_issues)} check-only issue(s) require manual edits; "
            "no files were written"
        )
        return 1

    transformed = transformed_documents(analysis)
    if not transformed:
        print(
            "PASS: automatic Step numbering is already normalized "
            f"({len(analysis.documents)} Markdown file(s))"
        )
        if manual_issues:
            print(
                f"NOTE: {len(manual_issues)} check-only issue(s) still require manual edits; "
                "run the check command for locations"
            )
        return 0

    if not write:
        print_diffs(analysis, transformed)
        print(f"DRY-RUN: {len(transformed)} file(s) would change; no files were written")
        if manual_issues:
            print(f"NOTE: {len(manual_issues)} check-only issue(s) would remain")
        return 0

    transactional_write(transformed)
    print(f"UPDATED: normalized {len(transformed)} Markdown file(s) transactionally")
    post_write = analyze([document.path for document in analysis.documents], root)
    if post_write.issues:
        print_issues(post_write.issues, root)
        print(
            f"FAIL: write completed but {len(post_write.issues)} numbering issue(s) remain"
        )
        return 1
    print("PASS: post-write numbering check is clean")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Audit/check/fix workflow numbering. Default scope is every Markdown file "
            "under skills/."
        )
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    def add_scope_options(subparser: argparse.ArgumentParser) -> None:
        subparser.add_argument(
            "--root",
            type=Path,
            default=REPO_ROOT,
            help="repository root containing skills/ (default: script repository root)",
        )
        subparser.add_argument(
            "paths",
            nargs="*",
            help="optional Markdown files/directories relative to --root",
        )

    audit = subparsers.add_parser("audit", help="report groups and issues without failing")
    add_scope_options(audit)

    check = subparsers.add_parser("check", help="fail when numbering policy is violated")
    add_scope_options(check)

    fix = subparsers.add_parser("fix", help="renumber explicit Step headings and bound refs")
    add_scope_options(fix)
    mode = fix.add_mutually_exclusive_group(required=True)
    mode.add_argument("--dry-run", action="store_true", help="print a diff without writing")
    mode.add_argument("--write", action="store_true", help="write all validated changes")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    root = args.root.expanduser().absolute()
    try:
        files = discover_markdown(root, args.paths)
        result = analyze(files, root)
        if args.command == "audit":
            return command_audit(result, root)
        if args.command == "check":
            return command_check(result, root)
        if args.command == "fix":
            return command_fix(result, root, write=args.write)
        parser.error(f"unknown command: {args.command}")
    except (OSError, RuntimeError, ValueError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
