#!/usr/bin/env python3
"""story_doctor.py — oh-story 部署与项目健康检查

治的病：能力检测散落在写作途中。agent 能不能 spawn、外包 CLI 在不在、追踪结构完不完整，
现在都是写到一半才发现——用户已经投入了一章的时间，才知道自己一直在降级模式里跑。
本脚本把这些检查集中到一次显式调用，让用户在开写之前就知道自己会拿到什么、拿不到什么。

**本脚本必须自包含**：只用标准库，不 import 任何 skill 内的模块。doctor 要诊断的正是
「部署坏了」这件事，如果它自己依赖那份部署，坏的时候就一起哑了。

严重度三档：
  error    写作会失败——缺 helper、sentinel 不可解析、追踪结构损坏
  warning  能写但降级——agent 不可用会退 solo、Node 缺失 hook 不跑、外包不可用
  info     纯信息——可选能力没开

修复分三层，边界直接取自 UPGRADING.md 的文件所有权模型，不另造一套：
  auto     「story-setup 管理，可替换」——不含用户内容，可以直接从 skill 包重铺
  prompt   「用户与 story-setup 共同维护」——只合并管理块，动之前必须问
  refuse   「用户状态，不覆盖」——正文/设定/大纲/追踪，doctor 永不自动改

用法（调用方按跨平台规则探测解释器，不要裸调 python3——Windows 上会 exit 49）：
  "$PYBIN" story_doctor.py --project <项目根> [--package <skill 包根>]
  "$PYBIN" story_doctor.py --project . --json
  "$PYBIN" story_doctor.py --project . --fix              # 只应用 auto 层
  "$PYBIN" story_doctor.py --project . --only deploy/skills-complete
  "$PYBIN" story_doctor.py --project . --check-delegate   # 额外跑联网的外包鉴权检查

退出码：
  0  没有 error 也没有 warning
  1  有 warning，没有 error
  2  有 error
  3  用法错误
"""

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

KNOWN_SKILLS = (
    "browser-cdp", "story", "story-cover", "story-deslop", "story-doctor",
    "story-import", "story-long-analyze", "story-long-scan", "story-long-write",
    "story-review", "story-setup", "story-short-analyze", "story-short-scan",
    "story-short-write",
)

KNOWN_AGENTS = (
    "chapter-extractor", "character-designer", "consistency-checker",
    "narrative-writer", "story-architect", "story-explorer", "story-researcher",
)

# story-setup 部署时必须存在的 helper。缺任何一个，重新部署都会中途失败。
SETUP_HELPERS = (
    "merge-claude-settings.py", "merge-codex-hooks.py", "merge-antigravity-hooks.py",
    "generate-antigravity-agents.mjs", "deploy-antigravity-skills.py", "copy-path-safety.py",
)

# target_cli → (skill 部署根, agent 部署根 or None)
CLI_LAYOUT = {
    "claude-code": (".claude/skills", ".claude/agents"),
    "codex": (".codex/skills", ".codex/agents"),
    "antigravity": (".agents/skills", ".agents/agents"),
    "zcode": (".zcode/skills", None),
    "opencode": ("skills", ".opencode/agents"),
    "openclaw": ("skills", None),
    "reasonix": ("skills", None),
    "generic": ("skills", None),
}


class Finding(object):
    def __init__(self, check_id, severity, message, fix_hint="", fix_tier="none", path=""):
        self.check_id = check_id
        self.severity = severity
        self.message = message
        self.fix_hint = fix_hint
        self.fix_tier = fix_tier
        self.path = path

    def as_dict(self):
        return {
            "checkId": self.check_id, "severity": self.severity, "message": self.message,
            "fixHint": self.fix_hint, "fixTier": self.fix_tier, "path": self.path,
        }


def read_sentinel(path):
    """.story-deployed 是 YAML 风格的 key: value；只取第一个冒号前后，不引入 yaml 依赖。"""
    fields = {}
    try:
        text = path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return None
    for raw in text.splitlines():
        line = raw.strip().lstrip("﻿")
        if not line or line.startswith("#") or ":" not in line:
            continue
        key, _, value = line.partition(":")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        # 值里常带中文括号注释（模板本身就这么写），取到第一个括号为止。
        for stop in ("（", "("):
            if stop in value:
                value = value.split(stop, 1)[0].strip()
        if key:
            fields[key] = value
    return fields


def package_root(explicit):
    """skill 包根：优先显式传入，否则从本脚本位置上溯三级（skills/story-doctor/scripts）。"""
    if explicit:
        return Path(explicit).resolve()
    return Path(__file__).resolve().parent.parent.parent.parent


def check_deployment(project, pkg, findings):
    sentinel_path = project / ".story-deployed"
    if not sentinel_path.is_file():
        findings.append(Finding(
            "deploy/sentinel-present", "error",
            "没有找到 .story-deployed：这个目录还没有部署过 oh-story。",
            "在项目根运行 /story-setup 完成首次部署。", "prompt", str(sentinel_path)))
        return None

    fields = read_sentinel(sentinel_path)
    if fields is None:
        findings.append(Finding(
            "deploy/sentinel-parse", "error",
            ".story-deployed 存在但读不出来（编码损坏或权限不足）。",
            "确认文件可读；内容无法恢复时重跑 /story-setup 重建。", "prompt", str(sentinel_path)))
        return None

    targets = [t.strip() for t in fields.get("target_cli", "").split(",") if t.strip()]
    if not targets:
        findings.append(Finding(
            "deploy/target-cli", "error",
            ".story-deployed 缺少 target_cli，无法判断该按哪一端校验部署。",
            "重跑 /story-setup，它会重新探测并写回 target_cli。", "prompt", str(sentinel_path)))
        return fields

    unknown = [t for t in targets if t not in CLI_LAYOUT]
    if unknown:
        findings.append(Finding(
            "deploy/target-cli", "warning",
            "target_cli 含无法识别的端：{}。这些端不做校验。".format("、".join(unknown)),
            "确认拼写，或重跑 /story-setup 修正。", "prompt", str(sentinel_path)))

    check_version(pkg, fields, sentinel_path, findings)

    for target in targets:
        if target not in CLI_LAYOUT:
            continue
        skills_root, agents_root = CLI_LAYOUT[target]
        check_skills(project, pkg, target, skills_root, findings)
        if agents_root:
            check_agents(project, target, agents_root, findings)
    check_references(project, fields, findings)
    check_helpers(pkg, findings)
    return fields


def check_version(pkg, fields, sentinel_path, findings):
    """只有「项目比 skill 新」是危险的——那意味着重新部署会降级覆盖。"""
    pkg_version = None
    setup_skill = pkg / "skills" / "story-setup" / "SKILL.md"
    if setup_skill.is_file():
        for line in setup_skill.read_text(encoding="utf-8", errors="replace").splitlines():
            if "agents_version:" in line:
                digits = "".join(ch for ch in line.split("agents_version:", 1)[1] if ch.isdigit())
                if digits:
                    pkg_version = int(digits)
                    break
    deployed = fields.get("agents_version", "")
    if pkg_version is None or not deployed.isdigit():
        return
    if int(deployed) > pkg_version:
        findings.append(Finding(
            "deploy/agents-version", "error",
            "项目部署的 agents_version {} 比当前 skill 包的 {} 新；重新部署会降级覆盖。"
            .format(deployed, pkg_version),
            "先更新 oh-story-claudecode（npx skills add 或 marketplace），再回来检查。",
            "refuse", str(sentinel_path)))
    elif int(deployed) < pkg_version:
        findings.append(Finding(
            "deploy/agents-version", "warning",
            "项目部署的 agents_version {} 落后于 skill 包的 {}。".format(deployed, pkg_version),
            "重跑 /story-setup 刷新项目文件。", "prompt", str(sentinel_path)))


def check_skills(project, pkg, target, rel_root, findings):
    root = project / rel_root
    if not root.is_dir():
        findings.append(Finding(
            "deploy/skills-complete", "error",
            "{}：{} 不存在，所有 skill 都没部署。".format(target, rel_root),
            "重跑 /story-setup 并选择这一端。", "prompt", str(root)))
        return
    missing = [n for n in KNOWN_SKILLS if not (root / n / "SKILL.md").is_file()]
    if not missing:
        return
    # skill 目录属于「story-setup 管理，可替换」，且源在 skill 包里，可以直接重铺。
    repairable = all((pkg / "skills" / n / "SKILL.md").is_file() for n in missing)
    findings.append(Finding(
        "deploy/skills-complete", "error",
        "{}：缺 {} 个 skill —— {}".format(target, len(missing), "、".join(missing)),
        "从当前 skill 包重铺这些目录。" if repairable
        else "skill 包本身也缺这些源，先重装 oh-story-claudecode。",
        "auto" if repairable else "refuse", str(root)))


def check_agents(project, target, rel_root, findings):
    root = project / rel_root
    if not root.is_dir():
        findings.append(Finding(
            "deploy/agents-complete", "warning",
            "{}：{} 不存在，7 个 agent 都不可用；写作会全程回落 solo（单视角，失去多 agent 协作）。"
            .format(target, rel_root),
            "重跑 /story-setup 并选择这一端。", "prompt", str(root)))
        return
    if target == "antigravity":
        missing = [n for n in KNOWN_AGENTS if not (root / n / "agent.md").is_file()]
    elif target == "codex":
        missing = [n for n in KNOWN_AGENTS if not (root / (n + ".toml")).is_file()]
    else:
        missing = [n for n in KNOWN_AGENTS if not (root / (n + ".md")).is_file()]
    if missing:
        findings.append(Finding(
            "deploy/agents-complete", "warning",
            "{}：缺 {} 个 agent —— {}；用到它们的环节会回落 solo。"
            .format(target, len(missing), "、".join(missing)),
            "重跑 /story-setup 重新生成 agent 定义。", "prompt", str(root)))


def check_references(project, fields, findings):
    raw = fields.get("references_dir", "")
    dirs = [d.strip() for d in raw.split(",") if d.strip()]
    if not dirs:
        findings.append(Finding(
            "deploy/references-bundle", "warning",
            "sentinel 缺 references_dir，无法确认 agent 参考资料是否完整。",
            "重跑 /story-setup 写回 references_dir。", "prompt", ""))
        return
    for rel in dirs:
        root = project / rel
        if not root.is_dir():
            findings.append(Finding(
                "deploy/references-bundle", "error",
                "参考资料目录不存在：{}；agent 落笔前的必读文件全部读不到。".format(rel),
                "从当前 skill 包重铺参考资料包。", "auto", str(root)))
        elif not any(root.glob("*.md")):
            findings.append(Finding(
                "deploy/references-bundle", "error",
                "参考资料目录是空的：{}".format(rel),
                "从当前 skill 包重铺参考资料包。", "auto", str(root)))


def check_helpers(pkg, findings):
    root = pkg / "skills" / "story-setup" / "scripts"
    missing = [n for n in SETUP_HELPERS if not (root / n).is_file()]
    if missing:
        findings.append(Finding(
            "deploy/helper-scripts", "error",
            "skill 包缺 {} 个部署 helper —— {}；重新部署会中途失败。"
            .format(len(missing), "、".join(missing)),
            "按安装方式重装 oh-story-claudecode（npx skills add 或 marketplace 面板）。",
            "refuse", str(root)))


def check_runtime(findings):
    if shutil.which("node") is None:
        findings.append(Finding(
            "runtime/node", "warning",
            "PATH 里没有 node：正文兜底 hook、字数统计与连续性检查都会停用。",
            "安装 Node.js 并确保它在 PATH 中，然后新开会话。", "refuse", ""))
    if shutil.which("python3") is None and shutil.which("python") is None:
        findings.append(Finding(
            "runtime/python", "error",
            "PATH 里没有 Python 3：追踪事务与字数口径脚本无法运行。",
            "安装 Python 3 并确保它在 PATH 中。", "refuse", ""))


def check_books(project, findings):
    """长篇项目的追踪结构。这是最常见的写作被拦点：旧结构缺 _tracking-state.json。"""
    books = [d for d in sorted(project.iterdir()) if d.is_dir() and (d / "追踪").is_dir()]
    if not books:
        findings.append(Finding(
            "project/books", "info",
            "没有发现长篇书目录（含 追踪/ 的目录）；短篇项目或新项目属正常。", "", "none", ""))
        return
    for book in books:
        state = book / "追踪" / "_tracking-state.json"
        if not state.is_file():
            findings.append(Finding(
                "project/tracking-state", "error",
                "《{}》缺 追踪/_tracking-state.json —— 这是旧追踪结构，写下一章会被拦。"
                .format(book.name),
                "按 story-setup/UPGRADING.md「追踪模型迁移」重建；追踪目录属用户状态，doctor 不会自动改。",
                "refuse", str(state)))
            continue
        try:
            json.loads(state.read_text(encoding="utf-8"))
        except (OSError, UnicodeDecodeError, ValueError):
            findings.append(Finding(
                "project/tracking-state", "error",
                "《{}》的 _tracking-state.json 不是合法 JSON，追踪事务无法提交。".format(book.name),
                "用 tracking_commit.py 的 revision 修复流程处理；不要手改。",
                "refuse", str(state)))


def check_delegate(project, fields, findings, probe_auth):
    """正文外包就绪性。默认只做瞬时检查；鉴权要联网，需显式开启。"""
    mode = (fields or {}).get("prose_delegate", "").strip() or "none"
    if mode == "none":
        findings.append(Finding(
            "delegate/enabled", "info",
            "正文外包未开启（prose_delegate: none）；正文由当前 CLI 自己写。", "", "none", ""))
        return
    if mode != "agy":
        findings.append(Finding(
            "delegate/enabled", "warning",
            "prose_delegate 的值 {!r} 不认识，外包不会生效。".format(mode),
            "合法值只有 none 或 agy；重跑 /story-setup 修正。", "prompt", ""))
        return
    if shutil.which("agy") is None:
        findings.append(Finding(
            "delegate/cli-present", "warning",
            "开启了正文外包但 PATH 里没有 agy；正文会自动回落到本地写手。",
            "安装 agy 并登录 Google 账号（不需要装 Antigravity IDE），或重跑 /story-setup 关掉外包。",
            "prompt", ""))
        return
    if not probe_auth:
        findings.append(Finding(
            "delegate/auth", "info",
            "agy 已安装；鉴权状态未检测（要联网，加 --check-delegate 才跑）。", "", "none", ""))
        return
    try:
        proc = subprocess.run(["agy", "models"], stdout=subprocess.PIPE,
                              stderr=subprocess.PIPE, timeout=20)
        ok = proc.returncode == 0
    except (OSError, subprocess.SubprocessError):
        ok = False
    if ok:
        findings.append(Finding(
            "delegate/auth", "info",
            "正文外包就绪：agy 已安装并可取到模型列表。", "", "none", ""))
    else:
        findings.append(Finding(
            "delegate/auth", "warning",
            "agy 装了但取不到模型列表（未登录、网络不可用，或进程卡住）；正文会回落本地写手。",
            "在项目目录启动一次交互式 agy 完成登录后重试。", "prompt", ""))


def apply_auto_fixes(pkg, findings, dry_run=False):
    """只修 auto 层：来源在 skill 包、目标不含用户内容的受管副本。

    dry_run=True 时只算出「会做什么」，一个字节都不写。auto 层覆盖的是本来就该被覆盖的
    受管副本，所以不做备份（真正要保护的正文/设定/追踪在 refuse 层，根本不会被碰）；
    但「先看后修」仍然有价值——用户有权在动手前知道要动哪些文件。
    """
    fixed = []
    for f in findings:
        if f.fix_tier != "auto":
            continue
        if f.check_id == "deploy/skills-complete":
            root = Path(f.path)
            for name in KNOWN_SKILLS:
                src = pkg / "skills" / name
                dst = root / name
                if (src / "SKILL.md").is_file() and not (dst / "SKILL.md").is_file():
                    if not dry_run:
                        if dst.exists():
                            shutil.rmtree(dst)
                        shutil.copytree(src, dst)
                    fixed.append("重铺 skill {}".format(name))
        elif f.check_id == "deploy/references-bundle":
            dst = Path(f.path)
            src = pkg / "skills" / "story-setup" / "references" / "agent-references"
            if not src.is_dir():
                continue
            if not dry_run:
                dst.mkdir(parents=True, exist_ok=True)
                for item in src.iterdir():
                    if item.is_file():
                        shutil.copy2(item, dst / item.name)
                    elif item.is_dir():
                        target = dst / item.name
                        if target.exists():
                            shutil.rmtree(target)
                        shutil.copytree(item, target)
            fixed.append("重铺参考资料包 {}".format(dst))
    return fixed


ICON = {"error": "✗", "warning": "!", "info": "·"}
TIER_LABEL = {"auto": "可自动修", "prompt": "需确认", "refuse": "需手动"}


def render(findings, fixed, dry_run=False):
    errors = [f for f in findings if f.severity == "error"]
    warnings = [f for f in findings if f.severity == "warning"]
    lines = []
    for sev in ("error", "warning", "info"):
        for f in findings:
            if f.severity != sev:
                continue
            lines.append("{} [{}] {}".format(ICON[sev], f.check_id, f.message))
            if f.fix_hint:
                lines.append("    修复（{}）：{}".format(TIER_LABEL.get(f.fix_tier, ""), f.fix_hint))
    if fixed:
        lines.append("")
        lines.append(("将会自动修复 {} 项（--dry-run，未写入）：" if dry_run
                      else "已自动修复 {} 项：").format(len(fixed)))
        lines.extend("  - " + item for item in fixed)
    lines.append("")
    lines.append("共 {} 项结果：{} error / {} warning / {} info".format(
        len(findings), len(errors), len(warnings),
        len(findings) - len(errors) - len(warnings)))
    if errors:
        lines.append("存在阻断问题，先处理 error 再开始写作。")
    elif warnings:
        lines.append("没有阻断问题；上面的 warning 表示部分能力降级，写作仍可进行。")
    else:
        lines.append("部署健康，写作可以正常进行。")
    return "\n".join(lines)


def run_all(project, pkg, probe_auth):
    findings = []
    fields = check_deployment(project, pkg, findings)
    check_runtime(findings)
    check_books(project, findings)
    check_delegate(project, fields, findings, probe_auth)
    return findings


def main(argv=None):
    parser = argparse.ArgumentParser(description="oh-story 部署与项目健康检查")
    parser.add_argument("--project", default=".")
    parser.add_argument("--package", default="")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--fix", action="store_true",
                        help="应用 auto 层修复；prompt/refuse 层不动")
    parser.add_argument("--dry-run", action="store_true",
                        help="与 --fix 同用：只列出会修什么，不写任何文件")
    parser.add_argument("--check-delegate", action="store_true",
                        help="额外跑联网的外包鉴权检查")
    parser.add_argument("--only", action="append", default=[])
    parser.add_argument("--skip", action="append", default=[])
    args = parser.parse_args(argv)

    project = Path(args.project).resolve()
    if not project.is_dir():
        sys.stderr.write("story-doctor: --project 不是目录：{}\n".format(project))
        return 3
    pkg = package_root(args.package)

    def collect():
        found = run_all(project, pkg, args.check_delegate)
        if args.only:
            found = [f for f in found if f.check_id in args.only]
        if args.skip:
            found = [f for f in found if f.check_id not in args.skip]
        return found

    findings = collect()
    fixed = []
    if args.fix:
        fixed = apply_auto_fixes(pkg, findings, dry_run=args.dry_run)
        if fixed and not args.dry_run:
            # 修完重跑：报告的是修复后的真实状态，不是修之前的快照。
            findings = collect()

    if args.json:
        print(json.dumps({
            "ok": not any(f.severity in ("error", "warning") for f in findings),
            "checksRun": len(findings),
            "fixed": fixed,
            "dryRun": bool(args.dry_run),
            "findings": [f.as_dict() for f in findings],
        }, ensure_ascii=False, indent=2))
    else:
        print(render(findings, fixed, args.dry_run))

    if any(f.severity == "error" for f in findings):
        return 2
    if any(f.severity == "warning" for f in findings):
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
