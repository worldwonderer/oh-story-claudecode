#!/usr/bin/env python
"""Sync Claude Code agent templates to OpenCode format.

Scans templates/agents/*.md, converts frontmatter to opencode format,
and writes to opencode/agents/. Also syncs CLAUDE.md.tmpl -> AGENTS.md.tmpl.
"""
import os
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


def sync_agents():
    """Sync all agent files from templates to opencode format."""
    src_dir = ROOT / "skills/story-setup/references/templates/agents"
    dst_dir = ROOT / "skills/story-setup/references/opencode/agents"
    dst_dir.mkdir(parents=True, exist_ok=True)

    results = []
    for md_file in sorted(src_dir.glob("*.md")):
        content = md_file.read_text(encoding="utf-8")
        fm, body = parse_frontmatter(content)
        new_fm = convert_claude_to_opencode(fm)
        new_body = replace_claude_paths(body)
        new_body = fix_path_rules_section(new_body)  # 覆盖路径规则段的错误替换
        output = format_frontmatter(new_fm) + new_body
        output = output.rstrip("\n") + "\n"  # 规范行尾为单个换行，避免 EOF 空行

        dst_file = dst_dir / md_file.name
        old_content = dst_file.read_text(encoding="utf-8") if dst_file.exists() else ""
        dst_file.write_text(output, encoding="utf-8", newline="\n")

        status = "updated" if old_content and old_content != output else "created" if not old_content else "unchanged"
        results.append(f"  [{status}] {md_file.name}")

    return results


def sync_agents_md():
    """Sync CLAUDE.md.tmpl to opencode/AGENTS.md.tmpl."""
    src = ROOT / "skills/story-setup/references/templates/CLAUDE.md.tmpl"
    dst = ROOT / "skills/story-setup/references/opencode/AGENTS.md.tmpl"
    dst.parent.mkdir(parents=True, exist_ok=True)

    content = src.read_text(encoding="utf-8")
    new_content = replace_claude_paths(content)
    new_content = new_content.rstrip("\n") + "\n"  # 规范行尾为单个换行，避免 EOF 空行

    old_content = dst.read_text(encoding="utf-8") if dst.exists() else ""
    dst.write_text(new_content, encoding="utf-8", newline="\n")

    status = "updated" if old_content and old_content != new_content else "created" if not old_content else "unchanged"
    return f"  [{status}] AGENTS.md.tmpl"


def main():
    print("=== opencode sync script ===\n")
    print("1. Syncing agents...")
    agent_results = sync_agents()
    for r in agent_results:
        print(r)

    print("\n2. Syncing AGENTS.md.tmpl...")
    print(sync_agents_md())

    print("\n3. Manual maintenance required:")
    print("  - skills/story-setup/references/opencode/plugin.ts (hooks logic)")
    print("  - skills/story-setup/references/opencode/commands/ (slash commands)")
    print("  - skills/story-setup/references/opencode/opencode.json.patch (config fragment)")
    print("\nDone.")


if __name__ == "__main__":
    main()
