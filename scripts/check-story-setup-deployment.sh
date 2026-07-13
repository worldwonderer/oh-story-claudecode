#!/bin/bash
# check-story-setup-deployment.sh — story-setup deployment/runtime regression checks
# Covers hook lib deployment, reference bundle integrity, root-aware hooks,
# short-project non-mutation, commit-hook self-gating, and deployed-behavior anchors.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SKILL_DIR="$REPO_ROOT/skills/story-setup"
HOOKS_DIR="$SKILL_DIR/references/templates/hooks"
AGENT_REFS_DIR="$SKILL_DIR/references/agent-references"
SKILL_FILE="$SKILL_DIR/SKILL.md"
SETTINGS_FILE="$SKILL_DIR/references/templates/settings-hooks.json"
TMP_DIR="$(mktemp -d)"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

assert_file() {
  [ -f "$1" ] || fail "required file missing: $1"
}

assert_grep() {
  local pattern="$1"
  local file="$2"
  local message="$3"
  grep -Eq "$pattern" "$file" || fail "$message ($file)"
}

assert_no_grep() {
  local pattern="$1"
  local file="$2"
  local message="$3"
  if grep -Eq "$pattern" "$file"; then
    fail "$message ($file)"
  fi
}

copy_hooks() {
  local root="$1"
  mkdir -p "$root/.claude"
  cp -R "$HOOKS_DIR" "$root/.claude/hooks"
  chmod +x "$root/.claude/hooks"/*.sh
}

copy_agent_refs() {
  local root="$1"
  mkdir -p "$root/.claude/skills/story-setup/references"
  cp -R "$AGENT_REFS_DIR" "$root/.claude/skills/story-setup/references/agent-references"
}

write_sentinel() {
  local root="$1"
  cat > "$root/.story-deployed" <<'SENTINEL'
deployed_at: 2026-05-24T00:00:00Z
agents_version: 17
setup_skill_version: 1.2.6
target_cli: claude-code
resolver_strategy: project-local-skill-reference
references_dir: .claude/skills/story-setup/references/agent-references
SENTINEL
}

run_from_nested() {
  local root="$1"
  local script="$2"
  local nested="$root/nested/a/b"
  mkdir -p "$nested"
  (cd "$nested" && CLAUDE_PROJECT_DIR="$root" bash "$root/.claude/hooks/$script")
}

run_from_nested_no_project_dir() {
  local root="$1"
  local script="$2"
  local nested="$root/nested/a/b"
  mkdir -p "$nested"
  (cd "$nested" && unset CLAUDE_PROJECT_DIR && bash "$root/.claude/hooks/$script")
}

setup_git_repo() {
  local root="$1"
  git -C "$root" init -q
  git -C "$root" config user.email story-setup@example.invalid
  git -C "$root" config user.name story-setup-test
}

run_commit_hook_command() {
  local root="$1"
  local command_text="$2"
  (cd "$root" && CLAUDE_PROJECT_DIR="$root" STORY_COMMIT_COMMAND="$command_text" bash .claude/hooks/validate-story-commit.sh 2>&1 || true)
}

assert_commit_warns() {
  local root="$1"
  local command_text="$2"
  local label="$3"
  local out
  out="$(run_commit_hook_command "$root" "$command_text")"
  echo "$out" | grep -q 'Story Commit Warnings' || fail "validate-story-commit did not warn for $label: $command_text"
  echo "$out" | grep -q 'Hardcoded character attributes' || fail "validate-story-commit did not inspect staged markdown for $label"
}

echo "Story setup deployment check"
echo "============================"
echo "Repo: $REPO_ROOT"

# TS1 — Hook dependency completeness
assert_file "$HOOKS_DIR/lib/common.sh"
assert_file "$HOOKS_DIR/lib/sentinel.sh"
runtime_artifacts="$(find "$HOOKS_DIR" -maxdepth 4 \( -path '*/.omc*' -o -name '.DS_Store' -o -name '*.tmp' -o -name '*.log' \) -print 2>/dev/null || true)"
[ -z "$runtime_artifacts" ] || fail "hook templates contain runtime artifacts that would be recursively deployed: $runtime_artifacts"
while IFS= read -r src; do
  [ -n "$src" ] || continue
  case "$src" in
    '$(dirname "$0")/'*)
      rel="${src#'$(dirname "$0")/'}"
      assert_file "$HOOKS_DIR/$rel"
      ;;
    "\$(dirname \"\$0\")/"*)
      rel="${src#"\$(dirname \"\$0\")/"}"
      assert_file "$HOOKS_DIR/$rel"
      ;;
  esac
done < <(grep -RhoE '^source[[:space:]]+"[^"]+"' "$HOOKS_DIR"/*.sh | sed -E 's/^source[[:space:]]+"//;s/"$//' | sort -u)
assert_grep '递归复制完整目录树|recursive' "$SKILL_FILE" "SKILL.md must require recursive hook deployment"
assert_grep 'lib/common\.sh' "$SKILL_FILE" "SKILL.md must mention hooks/lib/common.sh"
assert_grep 'lib/sentinel\.sh' "$SKILL_FILE" "SKILL.md must mention hooks/lib/sentinel.sh"
echo "  OK TS1 hook dependency completeness"

# TS1b — SessionStart 部署自检名单必须覆盖所有 hook 脚本（防新增 hook 漏登记，#195 review）
selfcheck_line="$(grep -E 'for hook in .*; do' "$HOOKS_DIR/session-start.sh" | head -1)"
[ -n "$selfcheck_line" ] || fail "session-start.sh 缺少 hook 自检 for 循环"
while IFS= read -r hookfile; do
  base="$(basename "$hookfile")"
  case "$selfcheck_line" in
    *" $base "*) : ;;
    *) fail "session-start.sh 部署自检名单漏列 hook：$base（新增 hook 须同步加入该名单）" ;;
  esac
done < <(find "$HOOKS_DIR" -maxdepth 1 -name '*.sh' -type f)
echo "  OK TS1b session-start self-check lists all hook scripts"

# TS2 — Deployment checklist/manifest parseability
for header in 'Source path' 'Target path' 'Owner class' 'Merge mode' 'Validation check'; do
  assert_grep "$header" "$SKILL_FILE" "deployment manifest missing column: $header"
done
for group in 'templates/hooks/' 'templates/rules' 'templates/agents' 'agent-references' 'settings-hooks\.json' 'CLAUDE\.md' '\.story-deployed'; do
  assert_grep "$group" "$SKILL_FILE" "deployment manifest missing asset group: $group"
done
assert_file "$SKILL_DIR/references/openclaw/AGENTS.md.tmpl"
assert_file "$SKILL_DIR/references/generic/AGENTS.md.tmpl"
assert_grep 'references/openclaw/AGENTS\.md\.tmpl' "$SKILL_FILE" "deployment manifest missing OpenClaw AGENTS template"
assert_grep 'OpenClaw skills-only|target_cli 含 openclaw' "$SKILL_FILE" "story-setup must document OpenClaw skills-only deployment"
assert_grep 'references/generic/AGENTS\.md\.tmpl' "$SKILL_FILE" "deployment manifest missing generic AGENTS template"
assert_grep 'target_cli 含 generic|通用 Web AI / 其他 Agent' "$SKILL_FILE" "story-setup must document generic Web AI deployment"
assert_grep 'references_dir' "$SKILL_FILE" "sentinel references_dir must be documented"
assert_grep 'resolver_strategy' "$SKILL_FILE" "sentinel resolver_strategy must be documented"
assert_grep 'target_cli' "$SKILL_FILE" "sentinel target_cli must be documented"
echo "  OK TS2 deployment manifest"

# TS3 — Agent reference bundle integrity
historical_missing=(genre-readers.md genre-writing-formulas.md emotional-methods.md style-combat-face.md output-templates.md)
for name in "${historical_missing[@]}"; do
  if [ "$name" = "output-templates.md" ]; then
    assert_no_grep 'output-templates\.md' "$SKILL_DIR/references/templates/agents/chapter-extractor.md" "chapter-extractor must not point at missing output-templates.md"
  else
    assert_file "$AGENT_REFS_DIR/$name"
  fi
done
refs_tmp="$TMP_DIR/deployed-reference-bundle"
copy_agent_refs "$refs_tmp"
while IFS= read -r ref; do
  [ -n "$ref" ] || continue
  assert_file "$AGENT_REFS_DIR/$ref"
  assert_file "$refs_tmp/.claude/skills/story-setup/references/agent-references/$ref"
done < <(grep -RhoE 'story-setup/references/agent-references/[A-Za-z0-9_-]+\.md' \
  "$SKILL_DIR/references/templates/agents" "$AGENT_REFS_DIR" "$SKILL_DIR/references/templates/rules" 2>/dev/null \
  | sed 's|.*/||' | sort -u)
echo "  OK TS3 agent reference integrity"

# TS4 — Hook root resolution from nested cwd
root="$TMP_DIR/root-aware"
mkdir -p "$root/book/追踪" "$root/book/正文" "$root/book/设定" "$root/book/大纲" "$root/拆文库/sample"
setup_git_repo "$root"
copy_hooks "$root"
copy_agent_refs "$root"
write_sentinel "$root"
printf 'book\n' > "$root/.active-book"
cat > "$root/book/追踪/上下文.md" <<'CTX'
# 写作进度
## 当前位置
- 章: 第1章
CTX
touch "$root/拆文库/sample/_progress.md"

out_start="$(run_from_nested "$root" session-start.sh || true)"
echo "$out_start" | grep -q '当前位置' || fail "session-start did not resolve active book from project root"
echo "$out_start" | grep -q '未完成拆文' || fail "session-start did not resolve 拆文库 from project root"
if echo "$out_start" | grep -q '参考资料包缺失'; then
  fail "session-start reported missing reference bundle after deployed refs were copied"
fi

out_pre="$(run_from_nested "$root" pre-compact.sh || true)"
echo "$out_pre" | grep -q 'Writing context: book/追踪/上下文.md' || fail "pre-compact did not resolve context from project root"

out_post="$(run_from_nested "$root" post-compact.sh || true)"
echo "$out_post" | grep -q 'Read book/追踪/上下文.md' || fail "post-compact did not resolve context from project root"

out_gaps="$(run_from_nested "$root" detect-story-gaps.sh || true)"
if [ -n "$out_gaps" ] && echo "$out_gaps" | grep -q "$root/nested"; then
  fail "detect-story-gaps leaked nested cwd paths"
fi

fallback_root="$TMP_DIR/git-fallback"
mkdir -p "$fallback_root/book/追踪" "$fallback_root/book/正文" "$fallback_root/book/大纲"
setup_git_repo "$fallback_root"
copy_hooks "$fallback_root"
copy_agent_refs "$fallback_root"
write_sentinel "$fallback_root"
printf 'book\n' > "$fallback_root/.active-book"
printf '# 写作进度\n' > "$fallback_root/book/追踪/上下文.md"
out_fallback="$(run_from_nested_no_project_dir "$fallback_root" pre-compact.sh || true)"
echo "$out_fallback" | grep -q 'Writing context: book/追踪/上下文.md' || fail "pre-compact did not resolve context via git root fallback without CLAUDE_PROJECT_DIR"

echo "  OK TS4 hook root resolution"

# TS5 — Sentinel / broken deployment diagnostics
broken_root="$TMP_DIR/broken-libs"
mkdir -p "$broken_root"
setup_git_repo "$broken_root"
copy_hooks "$broken_root"
write_sentinel "$broken_root"
rm -f "$broken_root/.claude/hooks/lib/sentinel.sh"
broken_out="$(run_from_nested "$broken_root" session-start.sh 2>&1 || true)"
echo "$broken_out" | grep -q 'hook 函数库缺失' || fail "session-start did not explain missing hook libraries before sourcing"

bad_sentinel_root="$TMP_DIR/bad-sentinel"
mkdir -p "$bad_sentinel_root"
setup_git_repo "$bad_sentinel_root"
copy_hooks "$bad_sentinel_root"
cat > "$bad_sentinel_root/.story-deployed" <<'SENTINEL'
deployed_at: 2026-05-24T00:00:00Z
agents_version: 17
setup_skill_version: 1.2.6
resolver_strategy: project-local-skill-reference
references_dir: .claude/skills/story-setup/references/agent-references
SENTINEL
bad_sentinel_out="$(run_from_nested "$bad_sentinel_root" session-start.sh 2>&1 || true)"
echo "$bad_sentinel_out" | grep -q '缺少 target_cli' || fail "session-start did not warn for missing sentinel target_cli"
echo "$bad_sentinel_out" | grep -q '参考资料包缺失或为空' || fail "session-start did not warn for missing deployed reference bundle"

stale_v15_root="$TMP_DIR/stale-v13"
mkdir -p "$stale_v15_root/.claude/skills/story-setup/references/agent-references"
setup_git_repo "$stale_v15_root"
copy_hooks "$stale_v15_root"
cat > "$stale_v15_root/.story-deployed" <<'SENTINEL'
deployed_at: 2026-05-24T00:00:00Z
agents_version: 16
setup_skill_version: 1.2.5
target_cli: claude-code
resolver_strategy: project-local-skill-reference
references_dir: .claude/skills/story-setup/references/agent-references
SENTINEL
stale_v15_out="$(run_from_nested "$stale_v15_root" session-start.sh 2>&1 || true)"
echo "$stale_v15_out" | grep -q '低于 v17' || fail "session-start did not warn for agents_version 16 stale v17 deployment"
echo "  OK TS5 sentinel diagnostics"

# TS6 — Short project non-mutation
short_root="$TMP_DIR/short-project"
mkdir -p "$short_root/story"
setup_git_repo "$short_root"
copy_hooks "$short_root"
write_sentinel "$short_root"
printf 'story\n' > "$short_root/.active-book"
cat > "$short_root/story/正文.md" <<'TXT'
正文
TXT
run_from_nested "$short_root" session-end.sh >"$TMP_DIR/story-session-end.out" 2>&1 || true
[ ! -d "$short_root/story/追踪" ] || fail "session-end created 追踪/ for short project without opt-in"
(cd "$short_root/nested/a/b" && CLAUDE_PROJECT_DIR="$short_root" STORY_SESSION_LOG=1 bash "$short_root/.claude/hooks/session-end.sh") >"$TMP_DIR/story-session-end-opt.out" 2>&1 || true
[ ! -d "$short_root/story/追踪" ] || fail "session-end created 追踪/ for short project even with STORY_SESSION_LOG=1"
echo "  OK TS6 short project non-mutation"

# TS7 — Commit hook self-gating
commit_root="$TMP_DIR/commit-hook"
mkdir -p "$commit_root/book/正文" "$commit_root/book/设定" "$commit_root/short"
setup_git_repo "$commit_root"
copy_hooks "$commit_root"
cat > "$commit_root/book/正文/第1章.md" <<'TXT'
年龄 ：18
TXT
cat > "$commit_root/short/正文.md" <<'TXT'
身高: 180
TXT
cat > "$commit_root/book/设定/角色.md" <<'TXT'
角色设定
TXT
git -C "$commit_root" add "book/正文/第1章.md" "short/正文.md" "book/设定/角色.md"
for cmd in \
  'git commit -m test' \
  'git -c user.name=x commit -m test' \
  "git -C $commit_root commit -m test" \
  'command git commit -m test' \
  'env X=1 git commit -m test' \
  'git add .; git commit -m test' \
  $'git add .\ngit commit -m test' \
  '(git commit -m test)' \
  'if true; then git commit -m test; fi' \
  'noglob git commit -m test'; do
  assert_commit_warns "$commit_root" "$cmd" "$cmd"
done
for cmd in 'echo git commit docs' 'grep "git commit" file'; do
  non_commit_out="$(run_commit_hook_command "$commit_root" "$cmd")"
  [ -z "$non_commit_out" ] || fail "validate-story-commit warned for non-commit command '$cmd': $non_commit_out"
done
stdin_out="$(cd "$commit_root" && unset STORY_COMMIT_COMMAND CLAUDE_TOOL_INPUT && printf '%s' '{"tool_name":"Bash","tool_input":{"command":"git commit -m test"}}' | CLAUDE_PROJECT_DIR="$commit_root" bash .claude/hooks/validate-story-commit.sh 2>&1 || true)"
echo "$stdin_out" | grep -q 'Story Commit Warnings' || fail "validate-story-commit did not read stdin hook payload"
echo "$stdin_out" | grep -q 'short/正文.md' || fail "validate-story-commit did not inspect short-story 正文.md"
echo "$stdin_out" | grep -q 'book/设定/角色.md' || fail "validate-story-commit did not inspect staged setting markdown"

mono_root="$TMP_DIR/mono-root"
project_root="$mono_root/story-project"
mkdir -p "$project_root/book/正文"
setup_git_repo "$mono_root"
copy_hooks "$project_root"
cat > "$project_root/book/正文/第1章.md" <<'TXT'
身高:181
TXT
git -C "$mono_root" add "story-project/book/正文/第1章.md"
mono_out="$(cd "$project_root" && CLAUDE_PROJECT_DIR="$project_root" STORY_COMMIT_COMMAND='git commit -m test' bash .claude/hooks/validate-story-commit.sh 2>&1 || true)"
echo "$mono_out" | grep -q 'Hardcoded character attributes' || fail "validate-story-commit missed staged files when CLAUDE_PROJECT_DIR differs from git root"
echo "  OK TS7 commit hook self-gating"

# TS8 — detect-story-gaps multi-book traversal
multi_root="$TMP_DIR/multi-book"
mkdir -p "$multi_root/long/追踪" "$multi_root/long/正文" "$multi_root/short"
setup_git_repo "$multi_root"
copy_hooks "$multi_root"
printf 'long\n' > "$multi_root/.active-book"
printf '长篇正文\n' > "$multi_root/long/正文/第1章.md"
printf '短篇正文\n' > "$multi_root/short/正文.md"
multi_out="$(run_from_nested "$multi_root" detect-story-gaps.sh || true)"
echo "$multi_out" | grep -q '^检查：long$' || fail "detect-story-gaps did not inspect long project when .active-book is set"
echo "$multi_out" | grep -q '^检查：short$' || fail "detect-story-gaps did not inspect short project alongside long project"
long_count="$(printf '%s\n' "$multi_out" | grep -c '^检查：long$' || true)"
[ "$long_count" -eq 1 ] || fail "detect-story-gaps reported long project $long_count times; expected exactly once"
echo "  OK TS8 multi-book gap detection"

# TS9 — Settings JSON remains valid
python3 -m json.tool "$SETTINGS_FILE" >/dev/null
echo "  OK TS9 settings JSON"

# TS10 — Version threshold + deployed-behavior anchors
# 只锚定「跑起来会坏」的东西：agents_version 阈值要跨文件对齐，部署到用户手里的
# agent 模板要带住关键行为规则。原先还夹着一批「UPGRADING.md/README 必须写到某句话」
# 的文档完整性断言——那种改一个词就红、测的是措辞不是行为，已随 check-story-long-write-contract.sh
# 一并去掉，发版是否补 UPGRADING 由发版清单和人把关，不靠 CI 钉死措辞。
assert_grep 'AGENTS_VERSION.*-lt 17|AGENTS_VERSION" -lt 17' "$HOOKS_DIR/session-start.sh" "session-start must warn for agents_version 16 under v17 deployment"
assert_grep 'agents_version.*< 17|版本 < 17' "$SKILL_DIR/SKILL.md" "story-setup redeploy branch must treat agents_version 16 as stale"
assert_grep 'agents_version.*小于 `17`|小于 .17' "$REPO_ROOT/skills/story-review/SKILL.md" "story-review must treat agents_version 16 as stale"
assert_grep 'contract_version.*v12|gaps\.contract_version == "v12"' "$SKILL_DIR/references/templates/agents/story-explorer.md" "story-explorer must classify v12 benchmark contracts before fallback"
assert_grep 'contract_version.*legacy|legacy_deconstruction: true|legacy_deconstruction": true' "$SKILL_DIR/references/templates/agents/story-explorer.md" "story-explorer must classify legacy benchmark fallback explicitly"
assert_grep 'missing_primary_contract: true|missing_primary_contract": true' "$SKILL_DIR/references/templates/agents/story-explorer.md" "story-explorer must emit missing_primary_contract for broken v12 canonical artifacts"
assert_grep 'repair_action.*Stage 3|Stage 3.*repair_action|重跑 /story-long-analyze Stage 3' "$SKILL_DIR/references/templates/agents/story-explorer.md" "story-explorer must provide a v12 repair action instead of silent fallback"
assert_grep 'legacy_deconstruction: true|missing_primary_contract' "$REPO_ROOT/skills/story-long-write/SKILL.md" "story-long-write must not silently fallback for v12 primary contract gaps"
assert_grep '内容概括（五段式）|情节安排（多线）|人物关系和出场顺序|结尾设定和钩子' "$SKILL_DIR/references/templates/agents/story-architect.md" "story-architect must output v13 chapter blueprint fields"
assert_grep '逻辑线|人物关系变化|代价兑现 / 收益兑现|结尾设定' "$SKILL_DIR/references/templates/agents/consistency-checker.md" "consistency-checker must consume v13 outline blueprint fields"
assert_grep '语气标点谱系' "$SKILL_DIR/references/templates/agents/narrative-writer.md" "narrative-writer must enforce v13 tone punctuation"
assert_grep '不用.*……|不使用.*……|不保留.*……|不残留.*……' "$SKILL_DIR/references/templates/agents/narrative-writer.md" "narrative-writer must reject ellipsis pause punctuation"
assert_grep '不用.*——|不使用.*——|不保留.*——|不残留.*——' "$SKILL_DIR/references/templates/agents/narrative-writer.md" "narrative-writer must reject dialogue dash exception"
assert_grep '语气标点谱系' "$AGENT_REFS_DIR/format-and-structure.md" "agent references must include v13 tone punctuation format rules"
assert_grep '不用.*……|不使用.*……|不保留.*……|不残留.*……' "$AGENT_REFS_DIR/format-and-structure.md" "agent references must forbid ellipsis pause punctuation"
assert_grep '不用.*——|不使用.*——|不保留.*——|不残留.*——|正文和对话都禁止.*——' "$AGENT_REFS_DIR/format-and-structure.md" "agent references must forbid dialogue dash exception"
assert_grep '禁止先否定再肯定翻转句式' "$SKILL_DIR/references/templates/agents/narrative-writer.md" "narrative-writer must hard-ban not-then-is flips"
assert_grep 'check-ai-patterns\.js --check' "$SKILL_DIR/references/templates/agents/narrative-writer.md" "narrative-writer must require detector rescan handoff"
assert_grep '裸调用.*不得自动进入正文写作|不得自动进入正文写作.*裸调用' "$REPO_ROOT/skills/story-long-write/SKILL.md" "story-long-write bare invocation must not auto-write prose"
assert_grep '不得把已有项目默认为日更 3 章|默认为日更 3 章' "$REPO_ROOT/skills/story-long-write/SKILL.md" "story-long-write must not default existing projects to daily 3 chapters on bare invocation"
assert_grep '默认停在细纲交付|默认停靠.*Phase 1→3' "$REPO_ROOT/skills/story-long-write/SKILL.md" "story-long-write opening flow must stop after outline by default"
assert_grep '本轮 K（最多 3 章）后必须进入 Step 3/4 收尾并停止|最多 3 章.*收尾并停止' "$REPO_ROOT/skills/story-long-write/references/workflow-daily.md" "daily workflow must stop after bounded batch"
assert_grep '细纲边界|outline_underfilled|不得自造剧情' "$SKILL_DIR/references/templates/agents/narrative-writer.md" "narrative-writer must enforce outline boundary and report outline_underfilled"
assert_grep 'outline_underfilled' "$SKILL_DIR/references/opencode/agents/narrative-writer.md" "opencode narrative-writer must inherit outline_underfilled boundary"
assert_grep 'outline_underfilled' "$SKILL_DIR/references/codex/agents/narrative-writer.toml" "codex narrative-writer must inherit outline_underfilled boundary"
assert_grep '导入续写入口顺序|推荐顺序.*story-setup' "$REPO_ROOT/skills/story-import/SKILL.md" "story-import must answer setup-vs-import order before asking for source"
echo "  OK TS10 version + behavior anchors"

# TS11 — Outline-before-prose write guard (BLOCKING PreToolUse hook)
guard_root="$TMP_DIR/outline-guard"
mkdir -p "$guard_root/book/正文" "$guard_root/book/大纲" "$guard_root/book/设定" \
         "$guard_root/short" "$guard_root/docs" \
         "$guard_root/impbook/正文" "$guard_root/拆文库/impbook" \
         "$guard_root/impshort" "$guard_root/拆文库/impshort"
setup_git_repo "$guard_root"
copy_hooks "$guard_root"
assert_file "$guard_root/.claude/hooks/guard-outline-before-prose.sh"

run_guard() {
  # $1 = file_path ; prints the hook exit code (0 allow, 2 block)
  local fp="$1" ec=0
  printf '{"tool_name":"Write","tool_input":{"file_path":"%s","content":"x"}}' "$fp" \
    | CLAUDE_PROJECT_DIR="$guard_root" bash "$guard_root/.claude/hooks/guard-outline-before-prose.sh" >/dev/null 2>&1 || ec=$?
  printf '%s' "$ec"
}

# 长篇授权流：缺细纲拦截 / 有细纲放行 / 章号补零容忍
[ "$(run_guard 'book/正文/第1章_开端.md')" = "2" ] || fail "guard did not BLOCK long prose when 细纲 missing"
: > "$guard_root/book/大纲/细纲_第1章.md"
[ "$(run_guard 'book/正文/第1章_开端.md')" = "0" ] || fail "guard wrongly blocked long prose when 细纲 present"
[ "$(run_guard 'book/正文/第001章_开端.md')" = "0" ] || fail "guard did not tolerate chapter-number zero padding (第001章 vs 细纲_第1章)"
: > "$guard_root/book/大纲/细纲_第7章_惊变.md"
[ "$(run_guard 'book/正文/第7章_x.md')" = "0" ] || fail "guard did not tolerate title-suffixed 细纲 (细纲_第7章_惊变.md)"
# 短篇授权流：有 设定.md 信号 + 缺小节大纲 -> 拦截；补小节大纲 -> 放行
: > "$guard_root/short/设定.md"
[ "$(run_guard 'short/正文.md')" = "2" ] || fail "guard did not BLOCK short prose when 小节大纲.md missing"
: > "$guard_root/short/小节大纲.md"
[ "$(run_guard 'short/正文.md')" = "0" ] || fail "guard wrongly blocked short prose when 小节大纲.md present"
# 非作品文件 / 无短篇工程信号 -> 放行（宁可漏拦不可误伤）
[ "$(run_guard 'book/设定/角色.md')" = "0" ] || fail "guard wrongly blocked a non-prose file"
[ "$(run_guard 'docs/正文.md')" = "0" ] || fail "guard wrongly blocked a non-story 正文.md (no 设定.md signal)"
# 已存在正文 -> 放行（续写/改稿/去AI味）
: > "$guard_root/book/正文/第9章_x.md"
[ "$(run_guard 'book/正文/第9章_x.md')" = "0" ] || fail "guard wrongly blocked rewrite of an existing prose file"
# story-import 迁移流：存在 拆文库/{书名}/ 源 -> 正文先于大纲/小节大纲迁移，放行
[ "$(run_guard 'impbook/正文/第1章_x.md')" = "0" ] || fail "guard wrongly blocked story-import LONG prose migration (拆文库 source present)"
: > "$guard_root/impshort/设定.md"
[ "$(run_guard 'impshort/正文.md')" = "0" ] || fail "guard wrongly blocked story-import SHORT prose migration (拆文库 source present)"
echo "  OK TS11 outline-before-prose guard"

# TS12 — Agents-pending-restart one-shot confirmation
restart_root="$TMP_DIR/restart-flag"
mkdir -p "$restart_root/.claude"
setup_git_repo "$restart_root"
copy_hooks "$restart_root"
copy_agent_refs "$restart_root"
write_sentinel "$restart_root"
touch "$restart_root/.claude/.agents-pending-restart"
restart_out="$(run_from_nested "$restart_root" session-start.sh || true)"
echo "$restart_out" | grep -q '现已注册可用' || fail "session-start did not confirm agents registered after restart flag"
[ ! -f "$restart_root/.claude/.agents-pending-restart" ] || fail "session-start did not clear the one-shot .agents-pending-restart flag"
echo "  OK TS12 restart-flag confirmation"

echo ""
echo "OK: story-setup deployment checks passed"
