#!/usr/bin/env python
"""Sync Claude Code agent templates to OpenCode format.

Scans templates/agents/*.md, converts frontmatter to opencode format,
and writes to opencode/agents/. Also syncs CLAUDE.md.tmpl -> AGENTS.md.tmpl.
"""

import argparse
import os
import re
import shutil
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# 只读 agent 的 bash 白名单：**完整命令字面量**，绝不能写成 `git rev-parse *` 这类前缀 glob。
# 上游 opencode v1.18.5 packages/opencode/src/tool/shell.ts 的 source()：
#     (node.parent?.type === "redirected_statement" ? node.parent.text : node.text).trim()
# 命令一旦带重定向，送去鉴权的 pattern 就是**整条 redirected_statement**（含 `> 路径`）；
# 而 packages/opencode/src/util/wildcard.ts 的 match() 会把结尾的 ` *` 编译成 `( .*)?`。
# 两者叠加，前缀 glob 会连
#     git rev-parse --show-toplevel > book/正文/第001章.md
# 一起放行——声明了 edit: deny 的只读 agent 就能用重定向截断并覆写作者的正文。
# 只放完整命令字面量后，重定向 / 追加 / stderr 重定向 / 管道 / 串联变体全部落回兜底 `*: deny`。
BASH_ALLOWLIST = ("git rev-parse --show-toplevel",)


# agent 正文里表达 shell 步骤的唯一写法：「执行 `<命令>`」（模板全仓库仅此一种）。
# 用它把「正文要求执行什么」抽成显式清单，而不是反过来拿白名单去正文里碰运气搜——
# 后者对白名单外的新命令是瞎的，会静默生成一个 bash: deny、跑到一半才失败的 agent。
BODY_COMMAND_RE = re.compile(r"执行 `([^`]+)`")


def body_bash_commands(body: str) -> list[str]:
    """从 agent 正文抽出它明确要求执行的命令（按出现顺序去重）。

    刻意不用「agent 名字硬编码集合」——那正是早前审计在 generate-codex-agents.py 里点名的
    反模式：名单与正文各自漂移，新加了指令的 agent 拿不到权限、删了指令的 agent 白留着权限。
    这里以正文为唯一事实来源；抽出来的命令再由 assert_bash_permission() 逐条核对是否真放行。
    """
    commands: list[str] = []
    for match in BODY_COMMAND_RE.finditer(body):
        command = match.group(1).strip()
        if command and command not in commands:
            commands.append(command)
    return commands


def _wildcard_match(value: str, pattern: str) -> bool:
    """复刻上游 util/wildcard.ts 的 match()。

    步骤顺序与上游一致：先转义正则元字符（`*`/`?` 不在转义集里），再 `*`→`.*`、`?`→`.`，
    最后把结尾的 ` .*` 改写成 `( .*)?`（上游注释：让 "ls *" 同时匹配 "ls"）。
    正是最后这一步让前缀 glob 吃下带重定向的整条语句，所以复刻时一步都不能省。
    """
    value = value.replace("\\", "/")
    pattern = pattern.replace("\\", "/")
    escaped = re.sub(r"[.+^${}()|\[\]\\]", r"\\\g<0>", pattern)
    escaped = escaped.replace("*", ".*").replace("?", ".")
    if escaped.endswith(" .*"):
        escaped = escaped[:-3] + "( .*)?"
    return re.match("^" + escaped + "$", value, flags=re.DOTALL) is not None


def bash_ruleset(bash) -> list[tuple[str, str]]:
    """复刻上游 permission/index.ts 的 fromConfig()：标量→单条 `*` 规则；映射→按书写顺序展开。"""
    if bash is None:
        return []
    if isinstance(bash, str):
        return [("*", bash)]
    return list(bash.items())


def evaluate_bash(rules: list[tuple[str, str]], pattern: str) -> str:
    """复刻上游 evaluate()：`rulesets.flat().findLast(...)`，**最后一条命中的规则生效**。

    一条都不命中时上游返回 `{action: "ask"}`——既不是 allow 也不是 deny，会弹权限询问。
    """
    action = "ask"
    for rule_pattern, rule_action in rules:
        if _wildcard_match(pattern, rule_pattern):
            action = rule_action
    return action


def resolve_shell(rules: list[tuple[str, str]], patterns: list[str]) -> str:
    """复刻上游 Permission.ask()：任一 pattern 判 deny 即整条命令拒绝，全 allow 才放行。"""
    verdict = "allow"
    for pattern in patterns:
        action = evaluate_bash(rules, pattern)
        if action == "deny":
            return "deny"
        if action != "allow":
            verdict = "ask"
    return verdict


def escape_variants(command: str) -> list[tuple[str, list[str]]]:
    """白名单命令的越权变体 →（展示用命令, 上游 collect() 会产生的 pattern 列表）。

    上游对每个 tree-sitter `command` 节点各产生一个 pattern；带重定向的节点取整条
    redirected_statement 的文本。这里按同一口径建模，前三条正是 review 点名的 `>`/`>>`/`2>`。
    """
    target = "book/正文/第001章.md"
    return [
        (f"{command} > {target}", [f"{command} > {target}"]),
        (f"{command} >> {target}", [f"{command} >> {target}"]),
        (f"{command} 2> {target}", [f"{command} 2> {target}"]),
        (f"{command} | tee {target}", [command, f"tee {target}"]),
        (f"{command} && cat > {target}", [command, f"cat > {target}"]),
        (f"{command}; rm -rf /", [command, "rm -rf /"]),
    ]


def assert_bash_permission(name: str, bash, mentioned: list[str], restricted: bool) -> None:
    """生成期自检：正文要求的每条命令都必须真放行，且放行不得被重定向变体撬开。

    `mentioned` 是正文里出现的**全部**命令，不是白名单过滤后的子集——正文新增了一条需要
    shell 的指令而 BASH_ALLOWLIST 没收录时，它会在这里判成 deny 并指名道姓地打断生成，
    而不是静默产出一个跑不动的 agent。
    """
    rules = bash_ruleset(bash)
    for command in mentioned:
        action = evaluate_bash(rules, command)
        # bash 未声明时上游判 ask（rules 为空），那是权限询问而非拒绝，不算漏授权。
        if action == "deny" or (rules and action != "allow"):
            raise ValueError(
                f"{name}: 正文要求执行 `{command}`，但生成的 bash 权限把它判成 {action}；"
                f"确认该命令确实只读之后，把**完整命令字面量**加进 BASH_ALLOWLIST"
                f"（严禁加前缀 glob）。当前白名单：{list(BASH_ALLOWLIST)}，当前规则：{rules}"
            )
    if not restricted:
        return
    for command in mentioned:
        for shown, patterns in escape_variants(command):
            action = resolve_shell(rules, patterns)
            if action != "deny":
                raise ValueError(
                    f"{name}: 只读 agent 的 bash 白名单被撬开——`{shown}` 判成 {action}，应为 deny。"
                    f"白名单只能放完整命令字面量，不能用前缀 glob（当前规则：{rules}）"
                )
    for command in ("rm -rf /", "git push", "git rev-parse HEAD", "cat > 第1章.md"):
        action = resolve_shell(rules, [command])
        if action != "deny":
            raise ValueError(
                f"{name}: 只读 agent 必须拒绝任意 bash，但 `{command}` 判成 {action}"
                f"（当前规则：{rules}）"
            )


def parse_frontmatter(content: str) -> tuple[dict, str]:
    """Extract YAML-like frontmatter and body from markdown content."""
    # 结束分隔符必须是独占一行的 `---`（锚定 "\n---\n"），不能用 content.split("---", 2)：
    # 后者会被 frontmatter 值里的三连字符（描述里的 `---`、注释里的 `---`）当成结束标记，
    # 把剩余键连同 permission/steps 一起截断进正文，且静默 exit 0。
    # 与同源生成器 generate-codex-agents.py 的解析口径保持一致。
    if not content.startswith("---\n"):
        return {}, content
    end = content.find("\n---\n", len("---"))
    if end < 0:
        return {}, content
    fm_text = content[len("---") : end].strip()
    body = content[end + len("\n---") :]
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


def convert_claude_to_opencode(fm: dict, body: str) -> dict:
    """Convert Claude Code agent frontmatter to OpenCode format.

    `body` 不是可选的：bash 白名单按「正文是否真的要求执行该命令」逐个 agent 授权，
    少传一个正文就等于凭空收紧/放宽权限，所以这里强制调用方交出正文。
    """
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

    # bash 同样走 "disallowedTools 优先"：OpenCode 里未声明 bash 权限时 evaluate() 返回
    # `ask`（既非 allow 也非 deny），只落 edit: deny 的只读 agent 一路确认下去仍能用 shell
    # 重定向写文件。Codex 侧同源 agent 用的是 sandbox_mode = "read-only"（只读的是文件系统，
    # 不是「禁止一切命令」），所以这里用 OpenCode 的命令 glob 形式：只放行该 agent 正文里
    # 确实要求执行的只读命令，其余一律 deny。
    #
    # 授权粒度是**完整命令字面量**（见 BASH_ALLOWLIST 处的上游机制说明）：前缀 glob
    # `git rev-parse *` 会连 `git rev-parse --show-toplevel > 正文.md` 一起放行。
    #
    # 键顺序是语义的一部分，不是排版：OpenCode 的 permission/index.ts evaluate() 用
    # `rulesets.flat().findLast(...)` 取最后一条命中的规则，即**后写的规则覆盖先写的**。
    # 所以必须「宽 deny 在前、窄 allow 在后」；写成 {"git rev-parse --show-toplevel": allow,
    # "*": deny} 会让兜底的 `*: deny` 反过来盖掉那条 allow，把正文明确要求的命令一起打死。
    # Python dict 保序 + format_frontmatter 按 dict 顺序输出（不排序），顺序原样落进 frontmatter。
    mentioned_bash = body_bash_commands(body)
    granted_bash = [command for command in mentioned_bash if command in BASH_ALLOWLIST]
    restricted_bash = "Bash" in disallowed
    if restricted_bash:
        if granted_bash:
            bash_rules = {"*": "deny"}
            for command in granted_bash:
                bash_rules[command] = "allow"
            perm["bash"] = bash_rules
        else:
            # 正文里没有任何需要 shell 的步骤 → 一条都不放。标量 deny 还额外触发上游
            # permission/index.ts 的 disabled()（findLast 命中的规则 pattern === "*" 且
            # action === "deny"），把 bash 工具整个从该 agent 的工具表里摘掉。
            perm["bash"] = "deny"
    elif "Bash" in tools:
        perm["bash"] = "allow"
    assert_bash_permission(str(name) or "<unnamed>", perm.get("bash"), mentioned_bash, restricted_bash)
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
                if isinstance(pv, dict):
                    # 命令 glob 形式（如 bash）：glob 键必须加引号，裸 `*` 在 YAML 里是别名标记。
                    # 严禁对这里的键排序：OpenCode 用 findLast 解析，后写的规则覆盖先写的，
                    # 键顺序即优先级。必须按 dict 的插入顺序原样输出。
                    lines.append(f"  {pk}:")
                    for glob, action in pv.items():
                        lines.append(f'    "{glob}": {action}')
                else:
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

    Detects the "参考文件路径规则" section and replaces it with the one
    canonical path that story-setup deploys for OpenCode.
    This is idempotent — running multiple times produces the same output.
    """
    # Some agents do not read reference files and intentionally have no such
    # section. Only warn when the section marker exists but its shape drifted.
    if "参考文件路径规则" not in body:
        return body

    pattern = r"(## 参考文件路径规则\s*\*\*确定项目根目录：\*\*.*?\s*)读取参考文件时.*?(?=\s*禁止只读|\r?\n## )"

    replacement = (
        r"\1"
        r"读取参考文件时，直接 Read 当前 OpenCode 部署的 canonical 路径，禁止先用 Glob/Grep 搜索：\n"
        r"1. `{项目根}/skills/story-setup/references/agent-references/{文件名}`\n"
        r"\n"
        r"文件不存在时返回缺失事实，由父流程提示重新运行 `/story-setup`；不要探测其他 CLI 的目录。"
    )

    new_body, count = re.subn(pattern, replacement, body, flags=re.DOTALL)
    if count == 0:
        print(
            "  [WARN] fix_path_rules_section: 未检测到路径规则段，可能源模板格式已变更",
            file=sys.stderr,
        )
    return new_body


def file_status(dst: Path, output: str) -> tuple[str, bool]:
    """Compare one generated file without mutating the destination."""
    if not os.path.lexists(dst):
        return "missing", True
    if dst.is_symlink() or not dst.is_file():
        return "stale", True
    old_content = dst.read_text(encoding="utf-8")
    if old_content == output:
        return "unchanged", False
    return "stale", True


def render_agents() -> dict[str, str]:
    """Validate and render every OpenCode agent before any destination write."""
    src_dir = ROOT / "skills/story-setup/references/templates/agents"
    sources = sorted(src_dir.glob("*.md"))
    if not sources:
        raise RuntimeError(f"no agent markdown files found in {src_dir}")
    rendered: dict[str, str] = {}
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
        # 用**源模板正文**（未做 .claude→.opencode 路径替换）推导 bash 白名单：
        # 授权依据是源定义里写没写这条命令，不是生成产物的措辞。
        new_fm = convert_claude_to_opencode(fm, body)
        new_body = replace_claude_paths(body)
        new_body = fix_path_rules_section(new_body)  # 覆盖路径规则段的错误替换
        output = format_frontmatter(new_fm) + new_body
        output = output.rstrip("\n") + "\n"  # 规范行尾为单个换行，避免 EOF 空行
        if md_file.name in rendered:
            raise ValueError(f"duplicate generated agent filename: {md_file.name}")
        rendered[md_file.name] = output
    return rendered


def agent_statuses(
    rendered: dict[str, str], dst_dir: Path, check: bool
) -> tuple[list[str], bool]:
    """Return deterministic status lines for the generated agent surface."""
    results: list[str] = []
    changed = False
    for filename, output in rendered.items():
        dst_file = dst_dir / filename
        raw_status, file_changed = file_status(dst_file, output)
        if check:
            status = raw_status
        else:
            status = (
                "created"
                if raw_status == "missing"
                else "updated"
                if raw_status == "stale"
                else raw_status
            )
        changed = changed or file_changed
        results.append(f"  [{status}] {dst_file.name}")

    for stale in sorted(dst_dir.glob("*.md")):
        if stale.name in rendered:
            continue
        changed = True
        results.append(f"  [{'extra' if check else 'deleted'}] {stale.name}")

    return results, changed


def render_agents_md() -> str:
    """Validate and render CLAUDE.md.tmpl for OpenCode."""
    src = ROOT / "skills/story-setup/references/templates/CLAUDE.md.tmpl"
    if not src.is_file():
        raise RuntimeError(f"source template not found: {src}")

    content = src.read_text(encoding="utf-8")
    new_content = replace_claude_paths(content)
    return new_content.rstrip("\n") + "\n"  # 规范行尾为单个换行，避免 EOF 空行


def publish_tree(rendered: dict[str, str], agents_md: str, dst_root: Path) -> None:
    """Publish generated OpenCode files with rollback, preserving manual assets."""
    if dst_root.is_symlink():
        raise ValueError(f"destination directory must not be a symlink: {dst_root}")
    if dst_root.exists() and not dst_root.is_dir():
        raise ValueError(f"destination is not a directory: {dst_root}")
    existing_agents = dst_root / "agents"
    if existing_agents.is_symlink():
        raise ValueError(
            f"generated agents directory must not be a symlink: {existing_agents}"
        )
    if existing_agents.exists() and not existing_agents.is_dir():
        raise ValueError(
            f"generated agents path is not a directory: {existing_agents}"
        )

    dst_root.mkdir(parents=True, exist_ok=True)
    existing_agents.mkdir(parents=True, exist_ok=True)
    staging = Path(
        tempfile.mkdtemp(prefix=f".{dst_root.name}.staging-", dir=dst_root.parent)
    )
    backup = Path(
        tempfile.mkdtemp(prefix=f".{dst_root.name}.backup-", dir=dst_root.parent)
    )
    try:
        agents_dir = staging / "agents"
        backup_agents = backup / "agents"
        agents_dir.mkdir()
        backup_agents.mkdir()
        for filename, output in rendered.items():
            (agents_dir / filename).write_text(output, encoding="utf-8", newline="\n")

        staged_agents_md = staging / "AGENTS.md.tmpl"
        staged_agents_md.write_text(agents_md, encoding="utf-8", newline="\n")

        existing_md = sorted(existing_agents.glob("*.md"))
        for path in existing_md:
            if path.is_dir() and not path.is_symlink():
                raise IsADirectoryError(f"generated target is a directory: {path}")
            if path.is_symlink():
                (backup_agents / path.name).symlink_to(os.readlink(path))
            else:
                shutil.copy2(path, backup_agents / path.name)

        target_agents_md = dst_root / "AGENTS.md.tmpl"
        had_agents_md = os.path.lexists(target_agents_md)
        if target_agents_md.is_dir() and not target_agents_md.is_symlink():
            raise IsADirectoryError(
                f"generated target is a directory: {target_agents_md}"
            )
        if had_agents_md:
            if target_agents_md.is_symlink():
                (backup / "AGENTS.md.tmpl").symlink_to(
                    os.readlink(target_agents_md)
                )
            else:
                shutil.copy2(target_agents_md, backup / "AGENTS.md.tmpl")

        try:
            for filename in rendered:
                os.replace(agents_dir / filename, existing_agents / filename)
            os.replace(staged_agents_md, target_agents_md)
            for stale in existing_md:
                if stale.name not in rendered:
                    stale.unlink()
        except BaseException:
            # Best-effort rollback: a single un-removable file must not abort the
            # restore and strand a partial commit. Backed-up files are overwritten
            # in place; only outputs absent before the commit are removed.
            restore_names = {path.name for path in backup_agents.iterdir()}
            for current in list(existing_agents.glob("*.md")):
                if current.is_dir() and not current.is_symlink():
                    continue
                if current.name in restore_names:
                    continue
                try:
                    current.unlink()
                except OSError:
                    pass
            for original in backup_agents.iterdir():
                target = existing_agents / original.name
                try:
                    if original.is_symlink():
                        if target.is_symlink() or target.exists():
                            target.unlink()
                        target.symlink_to(os.readlink(original))
                    else:
                        # target is provably a regular file (a commit only
                        # os.replace's regular staged outputs), so copy2 safely
                        # overwrites it in place.
                        shutil.copy2(original, target)
                except OSError:
                    pass
            original_agents_md = backup / "AGENTS.md.tmpl"
            try:
                if had_agents_md:
                    if original_agents_md.is_symlink():
                        if target_agents_md.is_symlink() or target_agents_md.exists():
                            target_agents_md.unlink()
                        target_agents_md.symlink_to(os.readlink(original_agents_md))
                    else:
                        shutil.copy2(original_agents_md, target_agents_md)
                elif os.path.lexists(target_agents_md) and (
                    not target_agents_md.is_dir() or target_agents_md.is_symlink()
                ):
                    target_agents_md.unlink()
            except OSError:
                pass
            raise
    finally:
        shutil.rmtree(staging, ignore_errors=True)
        shutil.rmtree(backup, ignore_errors=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="verify generated files without modifying the working tree",
    )
    args = parser.parse_args()

    # The agents and top-level instructions form one generated adapter. Render
    # and validate both phases before inspecting or publishing either one.
    rendered = render_agents()
    agents_md = render_agents_md()
    dst_root = ROOT / "skills/story-setup/references/opencode"
    agent_results, agents_changed = agent_statuses(
        rendered, dst_root / "agents", args.check
    )
    raw_md_status, agents_md_changed = file_status(
        dst_root / "AGENTS.md.tmpl", agents_md
    )
    if args.check:
        md_status = raw_md_status
    else:
        md_status = (
            "created"
            if raw_md_status == "missing"
            else "updated"
            if raw_md_status == "stale"
            else raw_md_status
        )

    print("=== opencode sync script ===\n")
    print("1. Syncing agents...")
    for r in agent_results:
        print(r)

    print("\n2. Syncing AGENTS.md.tmpl...")
    print(f"  [{md_status}] AGENTS.md.tmpl")

    if args.check:
        if agents_changed or agents_md_changed:
            print(
                "\nERROR: generated OpenCode templates are out of sync.",
                file=sys.stderr,
            )
            return 1
        print("\nOK: generated OpenCode templates are in sync.")
        return 0

    publish_tree(rendered, agents_md, dst_root)

    print("\n3. Manual maintenance required:")
    print("  - skills/story-setup/references/opencode/plugin.ts (hooks logic)")
    print("  - skills/story-setup/references/opencode/commands/ (slash commands)")
    print(
        "  - skills/story-setup/references/opencode/opencode.json.patch (config fragment)"
    )
    print("\nDone.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
