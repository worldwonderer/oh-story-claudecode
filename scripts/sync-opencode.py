#!/usr/bin/env python
"""Sync Claude Code agent templates to OpenCode format.

Scans templates/agents/*.md, converts frontmatter to opencode format,
and writes to opencode/agents/. Also syncs CLAUDE.md.tmpl -> AGENTS.md.tmpl.
"""
import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def parse_frontmatter(content: str) -> tuple[dict, str]:
    """Extract YAML-like frontmatter and body from markdown content."""
    if not content.startswith("---"):
        return {}, content
    parts = content.split("---", 2)
    if len(parts) < 3:
        return {}, content
    fm_text = parts[1].strip()
    body = parts[2]
    fm = {}
    lines = fm_text.split("\n")
    i = 0
    while i < len(lines):
        stripped = lines[i].strip()

        if not stripped or stripped.startswith("#"):
            i += 1
            continue

        if ":" in stripped:
            key, _, val = stripped.partition(":")
            key = key.strip()
            val = val.strip()

            if val == "|":
                continuation = []
                i += 1
                while i < len(lines):
                    cont_line = lines[i]
                    if cont_line.startswith((" ", "\t")) and cont_line.strip():
                        continuation.append(cont_line.strip())
                        i += 1
                    elif not cont_line.strip():
                        continuation.append("")
                        i += 1
                    else:
                        break
                fm[key] = "\n".join(continuation).strip()
                continue
            else:
                fm[key] = val

        i += 1

    return fm, body


def convert_claude_to_opencode(fm: dict) -> dict:
    """Convert Claude Code agent frontmatter to OpenCode format."""
    result = {}
    name = fm.get("name", "")

    if "description" in fm:
        result["description"] = fm["description"]

    result["mode"] = "subagent"

    tools = _parse_list(fm.get("tools", ""))
    disallowed = _parse_list(fm.get("disallowedTools", ""))

    perm = {}
    if any(t in tools for t in ("Read", "Glob", "Grep")):
        perm["read"] = "allow"
    has_write = any(t in tools for t in ("Write", "Edit"))
    has_edit_disallowed = any(t in disallowed for t in ("Write", "Edit"))

    # deny priority: disallowedTools overrides Write/Edit in tools
    # story-researcher is a known exception — opencode's edit permission controls
    # both Write and Edit, cannot distinguish. story-researcher needs to create
    # new files (research output), so set edit: allow
    if name == "story-researcher":
        perm["edit"] = "allow"
    elif has_edit_disallowed:
        perm["edit"] = "deny"
    elif has_write:
        perm["edit"] = "allow"

    if "Bash" in tools:
        perm["bash"] = "allow"
    if perm:
        result["permission"] = perm

    if "maxTurns" in fm:
        try:
            result["steps"] = int(fm["maxTurns"])
        except ValueError:
            pass

    return result


def _parse_list(val: str) -> list[str]:
    """Parse a YAML-like list like '[Read, Glob, Grep]'."""
    match = re.search(r"\[(.*)\]", val)
    if not match:
        return []
    items = match.group(1).split(",")
    return [item.strip().strip("'").strip('"') for item in items if item.strip()]


def format_frontmatter(fm: dict) -> str:
    """Format frontmatter dict to YAML-like string."""
    lines = ["---"]
    for key, value in fm.items():
        if key == "permission" and isinstance(value, dict):
            lines.append("permission:")
            for pk, pv in value.items():
                lines.append(f"  {pk}: {pv}")
        elif key == "description" and "\n" in value:
            lines.append("description: |")
            for desc_line in value.split("\n"):
                lines.append(f"  {desc_line}")
        else:
            lines.append(f"{key}: {value}")
    lines.append("---")
    return "\n".join(lines) + "\n"


def replace_claude_paths(body: str) -> str:
    """Replace .claude/ path references with .opencode/ equivalents.

    路径规则段由 fix_path_rules_section() 幂等处理，无需手动修复。
    """
    replacements = [
        (".claude/skills/", ".opencode/skills/"),
        (".claude/agents/", ".opencode/agents/"),
        (".claude/hooks/", ".opencode/hooks/"),
        ("~/.claude/", "~/.config/opencode/"),
        ("$HOME/.claude/", "$HOME/.config/opencode/"),
        ("CLAUDE.md", "AGENTS.md"),
    ]
    for old, new in replacements:
        if old in body:
            body = body.replace(old, new)
    return body


def fix_path_rules_section(body: str) -> str:
    """Replace the reference file path rules section with correct opencode paths.

    Detects the "参考文件路径规则" section and replaces it with a canonical
    2-step opencode path resolution (skills/ first, .opencode/skills/ fallback).
    This is idempotent — running multiple times produces the same output.
    """
    # Some agents do not read reference files and intentionally have no such
    # section. Only warn when the section marker exists but its shape drifted.
    if "参考文件路径规则" not in body:
        return body

    pattern = r'(## 参考文件路径规则\s*\*\*确定项目根目录：\*\*.*?\s*)读取参考文件时.*?(?=\s*禁止只读|\r?\n## )'

    replacement = (
        r'\1'
        r'读取参考文件时，**严格按以下顺序直接 Read，禁止先用 Glob/Grep 搜索**：\n'
        r'1. `{项目根}/skills/story-setup/references/agent-references/{文件名}`\n'
        r'2. `{项目根}/.opencode/skills/story-setup/references/agent-references/{文件名}`\n'
        r'\n'
        r'以上两步全部文件不存在时，才使用 Glob/Grep 全局搜索 `**/story-setup/references/agent-references/{文件名}`。'
    )

    new_body, count = re.subn(pattern, replacement, body, flags=re.DOTALL)
    if count == 0:
        print(f"  [WARN] fix_path_rules_section: 未检测到路径规则段，可能源模板格式已变更", file=sys.stderr)
    return new_body


def sync_file(dst: Path, output: str, check: bool) -> tuple[str, bool]:
    """Write one generated file, or compare it without mutating in check mode."""
    old_content = dst.read_text(encoding="utf-8") if dst.exists() else None
    if old_content == output:
        return "unchanged", False
    if check:
        return "missing" if old_content is None else "stale", True
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(output, encoding="utf-8", newline="\n")
    return "created" if old_content is None else "updated", True


def sync_agents(check: bool = False) -> tuple[list[str], bool]:
    """Sync all agent files from templates to opencode format."""
    src_dir = ROOT / "skills/story-setup/references/templates/agents"
    dst_dir = ROOT / "skills/story-setup/references/opencode/agents"
    sources = sorted(src_dir.glob("*.md"))
    if not sources:
        raise RuntimeError(f"no agent markdown files found in {src_dir}")
    if not check:
        dst_dir.mkdir(parents=True, exist_ok=True)

    results = []
    changed = False
    expected_names = {path.name for path in sources}
    prepared: list[tuple[Path, str]] = []
    for md_file in sources:
        content = md_file.read_text(encoding="utf-8")
        fm, body = parse_frontmatter(content)
        name = str(fm.get("name", "")).strip()
        description = str(fm.get("description", "")).strip()
        if not name:
            raise ValueError(f"{md_file}: missing agent name")
        if name != md_file.stem:
            raise ValueError(
                f"{md_file}: agent name {name!r} must match filename {md_file.stem!r}"
            )
        if not description:
            raise ValueError(f"{md_file}: missing agent description")
        new_fm = convert_claude_to_opencode(fm)
        new_body = replace_claude_paths(body)
        new_body = fix_path_rules_section(new_body)  # 覆盖路径规则段的错误替换
        output = format_frontmatter(new_fm) + new_body
        output = output.rstrip("\n") + "\n"  # 规范行尾为单个换行，避免 EOF 空行
        prepared.append((dst_dir / md_file.name, output))

    # Validate/render every source before the first write so a malformed later
    # template cannot leave a partially synchronized destination.
    for dst_file, output in prepared:
        status, file_changed = sync_file(dst_file, output, check)
        changed = changed or file_changed
        results.append(f"  [{status}] {dst_file.name}")

    for stale in sorted(dst_dir.glob("*.md")):
        if stale.name in expected_names:
            continue
        changed = True
        if check:
            results.append(f"  [extra] {stale.name}")
        else:
            stale.unlink()
            results.append(f"  [deleted] {stale.name}")

    return results, changed


def sync_agents_md(check: bool = False) -> tuple[str, bool]:
    """Sync CLAUDE.md.tmpl to opencode/AGENTS.md.tmpl."""
    src = ROOT / "skills/story-setup/references/templates/CLAUDE.md.tmpl"
    dst = ROOT / "skills/story-setup/references/opencode/AGENTS.md.tmpl"
    if not src.is_file():
        raise RuntimeError(f"source template not found: {src}")

    content = src.read_text(encoding="utf-8")
    new_content = replace_claude_paths(content)
    new_content = new_content.rstrip("\n") + "\n"  # 规范行尾为单个换行，避免 EOF 空行

    status, changed = sync_file(dst, new_content, check)
    return f"  [{status}] AGENTS.md.tmpl", changed


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="verify generated files without modifying the working tree",
    )
    args = parser.parse_args()

    print("=== opencode sync script ===\n")
    print("1. Syncing agents...")
    agent_results, agents_changed = sync_agents(check=args.check)
    for r in agent_results:
        print(r)

    print("\n2. Syncing AGENTS.md.tmpl...")
    agents_md_result, agents_md_changed = sync_agents_md(check=args.check)
    print(agents_md_result)

    if args.check:
        if agents_changed or agents_md_changed:
            print("\nERROR: generated OpenCode templates are out of sync.", file=sys.stderr)
            return 1
        print("\nOK: generated OpenCode templates are in sync.")
        return 0

    print("\n3. Manual maintenance required:")
    print("  - skills/story-setup/references/opencode/plugin.ts (hooks logic)")
    print("  - skills/story-setup/references/opencode/commands/ (slash commands)")
    print("  - skills/story-setup/references/opencode/opencode.json.patch (config fragment)")
    print("\nDone.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
