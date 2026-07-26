#!/usr/bin/env bash
# check-opencode-adapter.sh — deterministic checks for the OpenCode adapter surface.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ROOT="$REPO_ROOT/skills/story-setup/references/opencode"
TMP_DIR="$(mktemp -d)"
SYNC_LOG="$TMP_DIR/sync.log"
trap 'rm -rf "$TMP_DIR"' EXIT

fail() { echo "FAIL: $*" >&2; exit 1; }
assert_file() { [ -f "$1" ] || fail "required file missing: $1"; }
assert_dir() { [ -d "$1" ] || fail "required directory missing: $1"; }
assert_grep() { grep -Eq "$1" "$2" || fail "$3 ($2)"; }

cd "$REPO_ROOT"

echo "OpenCode adapter check"
echo "======================"
echo "Repo: $REPO_ROOT"

assert_dir "$ROOT"
assert_file "$ROOT/AGENTS.md.tmpl"
assert_file "$ROOT/opencode.json.patch"
assert_file "$ROOT/plugin.ts"
assert_file "$ROOT/story_hook_core.js"
assert_dir "$ROOT/agents"
assert_dir "$ROOT/commands"
assert_file "scripts/sync-opencode.py"

python3 -m json.tool "$ROOT/opencode.json.patch" >/dev/null
python3 - <<'PY'
import json
from pathlib import Path
cfg = json.loads(Path('skills/story-setup/references/opencode/opencode.json.patch').read_text())
assert cfg.get('$schema') == 'https://opencode.ai/config.json', cfg
plugins = cfg.get('plugin')
assert isinstance(plugins, list), plugins
assert './.opencode/plugins/story-hooks.ts' in plugins, plugins
PY

echo "  OK config patch"

# Snapshot the generated surface so --check itself is held to its read-only contract,
# including when a developer already has unrelated worktree changes.
cp -R "$ROOT" "$TMP_DIR/opencode-before"
if ! python3 scripts/sync-opencode.py --check >"$SYNC_LOG" 2>&1; then
  cat "$SYNC_LOG" >&2 || true
  echo "::error::OpenCode templates are out of sync with Claude Code templates." >&2
  echo "::error::Run 'python3 scripts/sync-opencode.py' locally and commit the changes." >&2
  exit 1
fi
diff -qr "$TMP_DIR/opencode-before" "$ROOT" >/dev/null \
  || fail "sync-opencode.py --check modified generated files"

echo "  OK generated OpenCode templates are in sync (--check stayed read-only)"

python3 - "scripts/sync-opencode.py" "$TMP_DIR" <<'PY'
import importlib.util
import sys
from pathlib import Path

script_path = Path(sys.argv[1]).resolve()
tmp = Path(sys.argv[2]) / "opencode-transaction"
spec = importlib.util.spec_from_file_location("sync_opencode", script_path)
module = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(module)

src = tmp / "skills/story-setup/references/templates/agents"
templates = src.parent
dst_root = tmp / "skills/story-setup/references/opencode"
dst = dst_root / "agents"
src.mkdir(parents=True)
dst.mkdir(parents=True)
(templates / "CLAUDE.md.tmpl").write_text("valid instructions\n", encoding="utf-8")
(src / "a.md").write_text(
    "---\nname: a\ndescription: valid first fixture\ntools: [Read]\n---\nbody\n",
    encoding="utf-8",
)
(src / "b.md").write_text("missing frontmatter\n", encoding="utf-8")
(dst / "a.md").write_text("keep old a\n", encoding="utf-8")
(dst / "sentinel.md").write_text("keep sentinel\n", encoding="utf-8")
before = {path.name: path.read_bytes() for path in dst.iterdir()}
module.ROOT = tmp
old_argv = sys.argv
sys.argv = [str(script_path)]
try:
    module.main()
except ValueError:
    pass
else:
    raise SystemExit("sync-opencode must reject malformed agent source")
finally:
    sys.argv = old_argv
after = {path.name: path.read_bytes() for path in dst.iterdir()}
if after != before:
    raise SystemExit("sync-opencode modified destination before validating all sources")
PY

echo "  OK malformed source cannot partially update generated agents"

python3 - "scripts/sync-opencode.py" "$TMP_DIR" <<'PY'
import importlib.util
import sys
from pathlib import Path

script_path = Path(sys.argv[1]).resolve()
tmp = Path(sys.argv[2])
spec = importlib.util.spec_from_file_location("sync_opencode_atomic", script_path)
module = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(module)


def snapshot(root: Path) -> dict[str, tuple[str, bytes]]:
    result = {}
    if not root.exists():
        return result
    for path in sorted(root.rglob("*")):
        rel = path.relative_to(root).as_posix()
        if path.is_symlink():
            result[rel] = ("symlink", str(path.readlink()).encode())
        elif path.is_dir():
            result[rel] = ("dir", b"")
        else:
            result[rel] = ("file", path.read_bytes())
    return result


def write_agent(path: Path, name: str) -> None:
    path.write_text(
        f"---\nname: {name}\ndescription: valid {name} fixture\ntools: [Read]\n---\n{name} body\n",
        encoding="utf-8",
    )


def run_normal(root: Path) -> None:
    old_root, old_argv = module.ROOT, sys.argv
    module.ROOT = root
    sys.argv = [str(script_path)]
    try:
        module.main()
    finally:
        module.ROOT = old_root
        sys.argv = old_argv


# Cross-phase failure: valid agents followed by a missing CLAUDE.md.tmpl must
# leave the entire OpenCode adapter tree byte-for-byte unchanged.
missing_root = tmp / "opencode-missing-agents-template"
missing_src = missing_root / "skills/story-setup/references/templates/agents"
missing_dst = missing_root / "skills/story-setup/references/opencode"
missing_src.mkdir(parents=True)
(missing_dst / "agents").mkdir(parents=True)
write_agent(missing_src / "a.md", "a")
(missing_dst / "agents/a.md").write_text("keep old a\n", encoding="utf-8")
(missing_dst / "plugin.ts").write_text("keep manual plugin\n", encoding="utf-8")
before = snapshot(missing_dst)
try:
    run_normal(missing_root)
except RuntimeError:
    pass
else:
    raise SystemExit("sync-opencode must reject a missing CLAUDE.md.tmpl")
if snapshot(missing_dst) != before:
    raise SystemExit("sync-opencode partially updated agents before CLAUDE.md.tmpl validation")


# Publication failure: b.md is deliberately a directory in the destination.
# The failed second agent output must not expose the earlier a.md update or
# mutate AGENTS.md.tmpl/manual OpenCode assets.
write_root = tmp / "opencode-write-failure"
write_src_root = write_root / "skills/story-setup/references/templates"
write_src = write_src_root / "agents"
write_dst = write_root / "skills/story-setup/references/opencode"
write_src.mkdir(parents=True)
(write_dst / "agents/b.md").mkdir(parents=True)
write_agent(write_src / "a.md", "a")
write_agent(write_src / "b.md", "b")
(write_src_root / "CLAUDE.md.tmpl").write_text("new instructions\n", encoding="utf-8")
(write_dst / "agents/a.md").write_text("keep old a\n", encoding="utf-8")
(write_dst / "AGENTS.md.tmpl").write_text("keep old instructions\n", encoding="utf-8")
(write_dst / "plugin.ts").write_text("keep manual plugin\n", encoding="utf-8")
before = snapshot(write_dst)
try:
    run_normal(write_root)
except (IsADirectoryError, OSError):
    pass
else:
    raise SystemExit("sync-opencode must fail when a generated target is a directory")
if snapshot(write_dst) != before:
    raise SystemExit("sync-opencode exposed a partial adapter update after a write failure")


# Fail the second os.replace after the first agent was committed. The normal
# exception path must restore agents, AGENTS.md.tmpl, and manual assets.
commit_dst = tmp / "opencode-commit-failure"
(commit_dst / "agents").mkdir(parents=True)
(commit_dst / "agents/a.md").write_text("old a\n", encoding="utf-8")
(commit_dst / "agents/b.md").write_text("old b\n", encoding="utf-8")
(commit_dst / "AGENTS.md.tmpl").write_text("old instructions\n", encoding="utf-8")
(commit_dst / "plugin.ts").write_text("manual plugin\n", encoding="utf-8")
before = snapshot(commit_dst)
real_replace = module.os.replace
calls = 0

def fail_second_replace(src, dst):
    global calls
    calls += 1
    if calls == 2:
        raise OSError("injected second-commit failure")
    return real_replace(src, dst)

module.os.replace = fail_second_replace
try:
    module.publish_tree(
        {"a.md": "new a\n", "b.md": "new b\n"},
        "new instructions\n",
        commit_dst,
    )
except OSError:
    pass
else:
    raise SystemExit("sync-opencode did not surface injected commit failure")
finally:
    module.os.replace = real_replace
if snapshot(commit_dst) != before:
    raise SystemExit("sync-opencode failed to roll back an interrupted commit")


# A copied symlink at opencode/agents must never redirect staging writes into an
# external/user directory.
link_root = tmp / "opencode-symlink-parent"
link_src_root = link_root / "skills/story-setup/references/templates"
link_src = link_src_root / "agents"
link_dst = link_root / "skills/story-setup/references/opencode"
external = tmp / "opencode-external"
link_src.mkdir(parents=True)
link_dst.mkdir(parents=True)
external.mkdir()
write_agent(link_src / "a.md", "a")
(link_src_root / "CLAUDE.md.tmpl").write_text("instructions\n", encoding="utf-8")
(external / "a.md").write_text("external sentinel\n", encoding="utf-8")
(link_dst / "agents").symlink_to(external, target_is_directory=True)
before_external = snapshot(external)
try:
    run_normal(link_root)
except ValueError:
    pass
else:
    raise SystemExit("sync-opencode must reject a symlinked agents directory")
if snapshot(external) != before_external:
    raise SystemExit("sync-opencode followed agents symlink and modified external files")
PY

echo "  OK OpenCode generated-file failures roll back without replacing the adapter root"

# A stale generated agent that cannot be removed (immutable flag, lock, read-only
# mount) must not abort the rollback: restorable files return to their prior
# bytes, the un-removable file keeps its content, and manual assets stay put.
python3 - "scripts/sync-opencode.py" "$TMP_DIR" <<'PY'
import importlib.util
import sys
from pathlib import Path

script_path = Path(sys.argv[1]).resolve()
root = Path(sys.argv[2]) / "opencode-immutable-stale"
agents = root / "agents"
agents.mkdir(parents=True)
(agents / "a.md").write_text("old a\n", encoding="utf-8")
(agents / "stale.md").write_text("old stale\n", encoding="utf-8")
(root / "AGENTS.md.tmpl").write_text("old instructions\n", encoding="utf-8")
(root / "plugin.ts").write_text("manual plugin\n", encoding="utf-8")


def snap() -> dict[str, bytes]:
    return {
        path.relative_to(root).as_posix(): path.read_bytes()
        for path in sorted(root.rglob("*"))
        if path.is_file()
    }


before = snap()
spec = importlib.util.spec_from_file_location("sync_opencode_immutable", script_path)
module = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(module)

real_unlink = Path.unlink
real_copy2 = module.shutil.copy2
# Key the fault on the file's OWN path, not its name: a real immutable file
# still allows being read/copied into the backup dir, so only writes and unlinks
# targeting stale.md itself must fail. Keying on the name would also block the
# backup copy and abort before the rollback path is ever exercised.
victim = (agents / "stale.md").resolve()


def blocked_unlink(self, *args, **kwargs):
    if self.resolve() == victim:
        raise PermissionError("simulated immutable stale file")
    return real_unlink(self, *args, **kwargs)


def blocked_copy2(src, dst, *args, **kwargs):
    if Path(dst).resolve() == victim:
        raise PermissionError("simulated immutable stale file")
    return real_copy2(src, dst, *args, **kwargs)


Path.unlink = blocked_unlink
module.shutil.copy2 = blocked_copy2
try:
    module.publish_tree({"a.md": "new a\n"}, "new instructions\n", root)
except PermissionError:
    pass
else:
    raise SystemExit("sync-opencode did not surface the un-removable stale file")
finally:
    Path.unlink = real_unlink
    module.shutil.copy2 = real_copy2
after = snap()
if after != before:
    raise SystemExit(
        f"sync-opencode rollback left a partial update past an un-removable file: {before} -> {after}"
    )
PY

echo "  OK OpenCode rollback survives an un-removable stale agent file"

python3 - <<'PY'
from pathlib import Path
expected = {
    'chapter-extractor', 'character-designer', 'consistency-checker',
    'narrative-writer', 'story-architect', 'story-explorer', 'story-researcher',
}
read_only = {'chapter-extractor', 'consistency-checker', 'story-explorer'}
base = Path('skills/story-setup/references/opencode/agents')
found = {p.stem for p in base.glob('*.md')}
assert found == expected, found
for p in sorted(base.glob('*.md')):
    text = p.read_text()
    assert text.startswith('---\n'), f'{p}: missing frontmatter'
    try:
        fm = text.split('---', 2)[1]
    except IndexError:
        raise AssertionError(f'{p}: malformed frontmatter')
    assert 'mode: subagent' in fm, f'{p}: missing mode: subagent'
    assert 'description:' in fm, f'{p}: missing description'
    assert 'read: allow' in fm, f'{p}: missing read allow'
    assert 'steps:' in fm, f'{p}: missing steps limit'
    if p.stem in read_only:
        assert 'edit: deny' in fm, f'{p}: read-only agent must deny edit'
    else:
        assert 'edit: allow' in fm, f'{p}: write-capable agent must allow edit'
    assert '.claude/skills/story-setup/references/agent-references/' not in text, f'{p}: leaked Claude reference path'
    assert '.opencode/skills/story-setup/references/agent-references/' not in text, f'{p}: stale hidden OpenCode reference fallback'
    if p.stem in {'character-designer', 'consistency-checker', 'narrative-writer', 'story-architect'}:
        assert '{项目根}/skills/story-setup/references/agent-references/' in text, f'{p}: missing canonical OpenCode reference path'
PY

echo "  OK agent templates"

# frontmatter 解析必须锚定独占一行的 `---`（值里的三连字符不得截断 permission/steps），
# 且 disallowedTools 里的 Bash 必须落成真正的 bash 限制：OpenCode 里未声明的权限等于放行，
# 只有 edit: deny 的只读 agent 仍能用 shell 重定向写正文。
# bash glob 规则的**顺序**同样受闸：OpenCode 用 findLast 取最后一条命中的规则，
# 宽 deny 必须在前、窄 allow 必须在后，否则 agent 正文要求的 git rev-parse 反被打死。
python3 - "scripts/sync-opencode.py" <<'PY'
import importlib.util
import sys
from pathlib import Path

script_path = Path(sys.argv[1]).resolve()
spec = importlib.util.spec_from_file_location("sync_opencode_permissions", script_path)
module = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(module)

source = (
    "---\nname: a\ndescription: |\n  只读 agent --- 7 Gate。\n"
    "tools: [Read, Glob, Grep]\ndisallowedTools: [Write, Edit, Bash]\nmaxTurns: 9\n"
    "# 备注 --- 与主 skill 平级\n---\nbody\n"
)
fm, body = module.parse_frontmatter(source)
missing = {'name', 'description', 'tools', 'disallowedTools', 'maxTurns'} - set(fm)
assert not missing, f'frontmatter truncated at an inline ---: missing {missing}'
assert body.strip() == 'body', body

converted = module.convert_claude_to_opencode(fm)
permission = converted['permission']
assert permission['edit'] == 'deny', converted
bash = permission.get('bash')
assert isinstance(bash, dict) and bash.get('*') == 'deny', f'disallowed Bash must deny: {converted}'
assert bash.get('git rev-parse *') == 'allow', f'read-only agent must keep git rev-parse: {converted}'

# 只断言「存在 *: deny」是抓不住顺序倒置的（#265 review）：OpenCode 的
# permission/index.ts evaluate() 用 `rulesets.flat().findLast(...)`，**最后一条命中的
# 规则生效**。所以必须复刻同一套判定，断言解析后的裁决，而不是断言文本里出现了某几行。
def wildcard_match(value: str, pattern: str) -> bool:
    """复刻上游 Wildcard.match：glob 里的 * 匹配任意长度字符。"""
    import re
    regex = '^' + '.*'.join(re.escape(part) for part in pattern.split('*')) + '$'
    return re.match(regex, value, flags=re.DOTALL) is not None


def evaluate(rules, command: str) -> str:
    """复刻上游 evaluate()：按顺序遍历，最后一条命中的规则覆盖之前的裁决。"""
    verdict = 'allow'  # 上游语义：未声明即放行
    for pattern, action in rules:
        if wildcard_match(command, pattern):
            verdict = action
    return verdict


def bash_rules_in_file_order(fm_text: str):
    """按**文件里的书写顺序**取 bash 的 glob 规则——顺序就是优先级，不能走 dict/set。"""
    import re
    rules = []
    in_bash = False
    for line in fm_text.split('\n'):
        if re.match(r'^\s{2}bash:\s*$', line):
            in_bash = True
            continue
        if in_bash:
            matched = re.match(r'^\s{4}"(.+)":\s*(\w+)\s*$', line)
            if matched:
                rules.append((matched.group(1), matched.group(2)))
                continue
            if line.strip():
                in_bash = False
    return rules


# format_frontmatter 不得对键排序：一排序，生成器里「宽 deny 在前、窄 allow 在后」的
# 顺序就被静默抹掉。用逆字母序的插入顺序探它。
probe = {
    'permission': {
        'read': 'allow',
        'bash': {'zzz *': 'deny', '*': 'deny', 'aaa *': 'allow'},
    }
}
probe_rules = bash_rules_in_file_order(module.format_frontmatter(probe))
assert probe_rules == [('zzz *', 'deny'), ('*', 'deny'), ('aaa *', 'allow')], (
    f'format_frontmatter reordered permission globs (must preserve dict order): {probe_rules}'
)

# 生成器自身的输出：宽 deny 必须在前，窄 allow 必须在后
generated_rules = bash_rules_in_file_order(module.format_frontmatter(converted))
assert generated_rules[0] == ('*', 'deny'), (
    f'broad deny must come FIRST (findLast: later rules win): {generated_rules}'
)
assert generated_rules[-1] == ('git rev-parse *', 'allow'), (
    f'specific allow must come LAST (findLast: later rules win): {generated_rules}'
)

NEEDED = 'git rev-parse --show-toplevel'
FORBIDDEN = (
    'rm -rf /',
    "python3 -c 'print(1)'",
    'echo x > 第1章.md',
    'bash -c "cat /etc/passwd"',
    'git push --force',
)

read_only = {'chapter-extractor', 'consistency-checker', 'story-explorer'}
base = Path('skills/story-setup/references/opencode/agents')
for name in sorted(read_only):
    fm_text = (base / f'{name}.md').read_text(encoding='utf-8').split('\n---\n', 1)[0]
    rules = bash_rules_in_file_order(fm_text)
    assert rules, f'{name}: read-only agent must declare bash glob rules'
    # 文本顺序断言：`"*": deny` 必须出现在 `"git rev-parse *": allow` **之前**
    deny_at = fm_text.find('"*": deny')
    allow_at = fm_text.find('"git rev-parse *": allow')
    assert deny_at >= 0, f'{name}: read-only agent must deny arbitrary bash'
    assert allow_at >= 0, f'{name}: read-only agent must allow git rev-parse'
    assert deny_at < allow_at, (
        f'{name}: bash rules are INVERTED — `"*": deny` must precede '
        f'`"git rev-parse *": allow`, otherwise OpenCode findLast lets the broad '
        f'deny override the allow and 正文要求的 {NEEDED} 被打死'
    )
    # 裁决断言：正文唯一需要的只读命令必须放行
    verdict = evaluate(rules, NEEDED)
    assert verdict == 'allow', (
        f'{name}: OpenCode would resolve {NEEDED!r} to {verdict!r}; the agent body '
        f'requires it to locate the project root (rules in file order: {rules})'
    )
    # 反向断言：闸门对真正的越权命令仍然生效，不是把限制整体拆了
    for command in FORBIDDEN:
        verdict = evaluate(rules, command)
        assert verdict == 'deny', (
            f'{name}: arbitrary bash {command!r} resolved to {verdict!r}, must be deny '
            f'(rules in file order: {rules})'
        )
PY

echo "  OK read-only agents deny arbitrary bash but keep git rev-parse (order-aware verdict)"

python3 - <<'PY'
from pathlib import Path
skill_names = {p.parent.name for p in Path('skills').glob('*/SKILL.md')}
command_names = {p.stem for p in Path('skills/story-setup/references/opencode/commands').glob('*.md')}
assert skill_names == command_names, f'missing={skill_names-command_names}, extra={command_names-skill_names}'
for p in sorted(Path('skills/story-setup/references/opencode/commands').glob('*.md')):
    text = p.read_text()
    assert text.startswith('---\n'), f'{p}: missing frontmatter'
    fm = text.split('---', 2)[1]
    assert 'description:' in fm, f'{p}: missing description'
    assert f'请使用 {p.stem} skill' in text, f'{p}: command body must route to same skill'
PY

echo "  OK slash command templates"

assert_grep 'experimental\.session\.compacting' "$ROOT/plugin.ts" "OpenCode plugin must inject pre-compact context"
assert_grep 'tool\.execute\.before' "$ROOT/plugin.ts" "OpenCode plugin must guard tool writes"
assert_grep 'proseBlockReason' "$ROOT/plugin.ts" "OpenCode plugin must keep outline-before-prose guard"
assert_grep 'tool\.execute\.after' "$ROOT/plugin.ts" "OpenCode plugin must run the prose backstop after writes"
assert_grep 'proseAfterWrite' "$ROOT/plugin.ts" "OpenCode plugin must surface backstop findings on the write result"
assert_grep 'from "\./lib/story_hook_core\.js"' "$ROOT/plugin.ts" "OpenCode plugin must consume the shared prose-guard core"
# CI has no opencode CLI to actually load the plugin, so this is a structural proxy: the
# deploy manifest must place the core under .opencode/plugins/lib/, never flat in
# .opencode/plugins/ (a flat *.js there is auto-loaded by OpenCode as a broken second plugin).
assert_grep '\.opencode/plugins/lib/story_hook_core\.js' "$REPO_ROOT/skills/story-setup/SKILL.md" "SKILL.md deploy manifest must target .opencode/plugins/lib/story_hook_core.js, not a flat .opencode/plugins/story_hook_core.js"
assert_grep '正文' "$ROOT/plugin.ts" "OpenCode plugin must inspect prose targets"
assert_grep '@opencode-ai/plugin' "$ROOT/plugin.ts" "OpenCode plugin must import OpenCode plugin types"
# The shared prose-guard core (light net / outline guard / wordcount·landing·dup-title) deploys
# alongside plugin.ts and is imported by it; it must be byte-identical to the ZCode copy and valid JS.
ZCODE_CORE="$REPO_ROOT/skills/story-setup/references/zcode/hooks/story_hook_core.js"
cmp -s "$ROOT/story_hook_core.js" "$ZCODE_CORE" || fail "story_hook_core.js drifted from the ZCode copy (must be byte-identical)"
node --check "$ROOT/story_hook_core.js" || fail "story_hook_core.js is not valid JavaScript"
assert_grep 'proseNetFindings' "$ROOT/story_hook_core.js" "shared core must carry the light prose net (parity with codex/claude)"
# #242: runtime behavioral test — actually loads the plugin against the deployed core layout and
# exercises the before/after/compacting hooks (stronger than the structural greps above).
node --experimental-strip-types scripts/test-opencode-plugin.mjs
assert_grep 'AGENTS\.md|OpenCode' "$ROOT/AGENTS.md.tmpl" "OpenCode AGENTS template must be present"
assert_grep 'story-long-write|story-short-write|story-review' "$ROOT/AGENTS.md.tmpl" "OpenCode AGENTS template must mention story skill routing"

echo "  OK plugin behavior and instruction anchors"
echo ""
echo "OK: OpenCode adapter checks passed"
