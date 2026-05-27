#!/bin/bash
# check-story-setup-deployment.sh — story-setup deployment/runtime regression checks
# Covers hook lib deployment, reference bundle integrity, root-aware hooks,
# short-project non-mutation, commit-hook self-gating, and upgrade docs.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SKILL_DIR="$REPO_ROOT/skills/story-setup"
HOOKS_DIR="$SKILL_DIR/references/templates/hooks"
AGENT_REFS_DIR="$SKILL_DIR/references/agent-references"
SKILL_FILE="$SKILL_DIR/SKILL.md"
UPGRADING_FILE="$SKILL_DIR/UPGRADING.md"
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
agents_version: 10
setup_skill_version: 1.1.1
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

# TS2 — Deployment checklist/manifest parseability
for header in 'Source path' 'Target path' 'Owner class' 'Merge mode' 'Validation check'; do
  assert_grep "$header" "$SKILL_FILE" "deployment manifest missing column: $header"
done
for group in 'templates/hooks/' 'templates/rules' 'templates/agents' 'agent-references' 'settings-hooks\.json' 'CLAUDE\.md' '\.story-deployed'; do
  assert_grep "$group" "$SKILL_FILE" "deployment manifest missing asset group: $group"
done
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
for name in "${historical_missing[@]}"; do
  if [ "$name" != "output-templates.md" ]; then
    assert_grep "$name" "$UPGRADING_FILE" "UPGRADING.md must record canonicalization for $name"
  fi
done
assert_grep 'output-templates\.md' "$UPGRADING_FILE" "UPGRADING.md must record removal/rewrite for output-templates.md"
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
echo "$out_start" | grep -q 'incomplete analysis' || fail "session-start did not resolve 拆文库 from project root"
if echo "$out_start" | grep -q 'reference bundle is missing'; then
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
echo "$broken_out" | grep -q 'hook libraries are missing' || fail "session-start did not explain missing hook libraries before sourcing"

bad_sentinel_root="$TMP_DIR/bad-sentinel"
mkdir -p "$bad_sentinel_root"
setup_git_repo "$bad_sentinel_root"
copy_hooks "$bad_sentinel_root"
cat > "$bad_sentinel_root/.story-deployed" <<'SENTINEL'
deployed_at: 2026-05-24T00:00:00Z
agents_version: 10
setup_skill_version: 1.1.1
resolver_strategy: project-local-skill-reference
references_dir: .claude/skills/story-setup/references/agent-references
SENTINEL
bad_sentinel_out="$(run_from_nested "$bad_sentinel_root" session-start.sh 2>&1 || true)"
echo "$bad_sentinel_out" | grep -q 'missing target_cli' || fail "session-start did not warn for missing sentinel target_cli"
echo "$bad_sentinel_out" | grep -q 'reference bundle is missing or empty' || fail "session-start did not warn for missing deployed reference bundle"
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
echo "$multi_out" | grep -q '^Checking: long$' || fail "detect-story-gaps did not inspect long project when .active-book is set"
echo "$multi_out" | grep -q '^Checking: short$' || fail "detect-story-gaps did not inspect short project alongside long project"
long_count="$(printf '%s\n' "$multi_out" | grep -c '^Checking: long$' || true)"
[ "$long_count" -eq 1 ] || fail "detect-story-gaps reported long project $long_count times; expected exactly once"
echo "  OK TS8 multi-book gap detection"

# TS9 — Settings JSON remains valid
python3 -m json.tool "$SETTINGS_FILE" >/dev/null
echo "  OK TS9 settings JSON"

# TS10 — Upgrade notes completeness
assert_grep 'agents_version: 10|`agents_version: 10`|agents_version`.*10' "$UPGRADING_FILE" "UPGRADING.md must document agents_version 10"
assert_grep '/story-setup' "$UPGRADING_FILE" "UPGRADING.md must tell users to rerun /story-setup"
assert_grep 'hook.*lib|lib/common\.sh|lib/sentinel\.sh' "$UPGRADING_FILE" "UPGRADING.md must document hook lib repair"
assert_grep 'reference bundle|Agent Reference|agent-references' "$UPGRADING_FILE" "UPGRADING.md must document reference bundle repair"
assert_grep '新版写作 Agent|写作 Agent|对标文风' "$UPGRADING_FILE" "UPGRADING.md must briefly document the v10 writing-agent refresh"
echo "  OK TS10 upgrade notes"

echo ""
echo "OK: story-setup deployment checks passed"
