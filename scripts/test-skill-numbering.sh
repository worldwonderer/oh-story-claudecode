#!/bin/bash
# test-skill-numbering.sh — skill 工作流编号维护器的隔离回归。
#
# 所有 fixture 都在临时目录创建，不读取或改写仓库 skills/，因此可与内容迁移并行运行。
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TOOL="$REPO_ROOT/scripts/skill-numbering.py"

if command -v python3 >/dev/null 2>&1 && python3 -c "" >/dev/null 2>&1; then
  PYTHON=python3
elif command -v python >/dev/null 2>&1 && python -c "" >/dev/null 2>&1; then
  PYTHON=python
else
  echo "FAIL: no usable Python interpreter (tried python3, python)" >&2
  exit 1
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

fail() {
  echo "FAIL: $*" >&2
  exit 1
}

assert_contains() {
  local file="$1"
  local needle="$2"
  grep -F -- "$needle" "$file" >/dev/null 2>&1 || {
    echo "--- $file ---" >&2
    cat "$file" >&2
    fail "expected output to contain: $needle"
  }
}

run_expect_fail() {
  local output="$1"
  shift
  if "$@" >"$output" 2>&1; then
    cat "$output" >&2
    fail "command unexpectedly succeeded: $*"
  fi
}

echo "[1/8] dry-run, cascade-safe references, code fences, and parent grouping"
MAIN="$WORK/fixture repo"
mkdir -p "$MAIN/skills/demo/references"
cat >"$MAIN/skills/demo/SKILL.md" <<'EOF'
---
name: demo
description: demo
---

# Demo

Stage 0A is a persistent pipeline ID.

## Alpha workflow

Run Step 1.5 before Step 2.

### Step 1: first

First body.

### Step 1.5: inserted

Inserted body.

### Step 2: former second

#### Step 4: nested first

Nested Step 4 stays in its own heading-level group.

#### Step 8: nested second

```text
Run Step 1.5 before Step 2.
### Step 1.5 is an example reference, not a parsed heading
Stage 0A remains literal.
```

## Beta workflow

### Step 7: beta first

### Step 9: beta second

Repeat Step 9.
EOF
cat >"$MAIN/skills/demo/references/handbook.md" <<'EOF'
# Handbook

### 3.1 Reference section numbering

Section 3.1 and Stage 0A are handbook identifiers, not workflow Step labels.
EOF

"$PYTHON" "$TOOL" audit --root "$MAIN" >"$WORK/audit.out"
assert_contains "$WORK/audit.out" "[step-sequence]"
assert_contains "$WORK/audit.out" "[dotted-step-label]"

cp "$MAIN/skills/demo/SKILL.md" "$WORK/before-dry-run.md"
"$PYTHON" "$TOOL" fix --dry-run --root "$MAIN" >"$WORK/dry-run.out"
cmp -s "$WORK/before-dry-run.md" "$MAIN/skills/demo/SKILL.md" || fail "dry-run mutated SKILL.md"
assert_contains "$WORK/dry-run.out" "+### Step 2: inserted"
assert_contains "$WORK/dry-run.out" "+### Step 3: former second"
assert_contains "$WORK/dry-run.out" "+Run Step 2 before Step 3."
assert_contains "$WORK/dry-run.out" "+### Step 2 is an example reference, not a parsed heading"

echo "[2/8] write mode and exact non-mutation boundaries"
"$PYTHON" "$TOOL" fix --write --root "$MAIN" >"$WORK/write.out"
cat >"$WORK/expected-main.md" <<'EOF'
---
name: demo
description: demo
---

# Demo

Stage 0A is a persistent pipeline ID.

## Alpha workflow

Run Step 2 before Step 3.

### Step 1: first

First body.

### Step 2: inserted

Inserted body.

### Step 3: former second

#### Step 1: nested first

Nested Step 1 stays in its own heading-level group.

#### Step 2: nested second

```text
Run Step 2 before Step 3.
### Step 2 is an example reference, not a parsed heading
Stage 0A remains literal.
```

## Beta workflow

### Step 1: beta first

### Step 2: beta second

Repeat Step 2.
EOF
diff -u "$WORK/expected-main.md" "$MAIN/skills/demo/SKILL.md" || fail "write result differs"
grep -F "### 3.1 Reference section numbering" "$MAIN/skills/demo/references/handbook.md" >/dev/null || fail "handbook section number changed"
grep -F "Stage 0A" "$MAIN/skills/demo/SKILL.md" >/dev/null || fail "Stage ID changed"
grep -F "Stage 0A" "$MAIN/skills/demo/references/handbook.md" >/dev/null || fail "handbook Stage ID changed"
"$PYTHON" "$TOOL" check --root "$MAIN" >"$WORK/check-clean.out"
assert_contains "$WORK/check-clean.out" "PASS"

echo "[3/8] idempotence"
cp "$MAIN/skills/demo/SKILL.md" "$WORK/before-idempotence.md"
"$PYTHON" "$TOOL" fix --write --root "$MAIN" >"$WORK/idempotence.out"
cmp -s "$WORK/before-idempotence.md" "$MAIN/skills/demo/SKILL.md" || fail "second write was not idempotent"
assert_contains "$WORK/idempotence.out" "already normalized"

echo "[4/8] unbound and ambiguous references fail before every write"
UNBOUND="$WORK/unbound"
mkdir -p "$UNBOUND/skills/demo" "$UNBOUND/skills/otherwise-valid"
cat >"$UNBOUND/skills/demo/SKILL.md" <<'EOF'
# Unbound

## Workflow

### Step 1: only step

Continue at Step 4.5.
EOF
cat >"$UNBOUND/skills/otherwise-valid/SKILL.md" <<'EOF'
# This file would be fixable on its own

## Workflow

### Step 9: should become one
EOF
cp "$UNBOUND/skills/demo/SKILL.md" "$WORK/unbound-before.md"
cp "$UNBOUND/skills/otherwise-valid/SKILL.md" "$WORK/unbound-valid-before.md"
run_expect_fail "$WORK/unbound-dry.out" "$PYTHON" "$TOOL" fix --dry-run --root "$UNBOUND"
assert_contains "$WORK/unbound-dry.out" "[unbound-step-reference]"
cmp -s "$WORK/unbound-before.md" "$UNBOUND/skills/demo/SKILL.md" || fail "blocked dry-run mutated a file"
run_expect_fail "$WORK/unbound.out" "$PYTHON" "$TOOL" fix --write --root "$UNBOUND"
assert_contains "$WORK/unbound.out" "[unbound-step-reference]"
cmp -s "$WORK/unbound-before.md" "$UNBOUND/skills/demo/SKILL.md" || fail "unbound failure wrote a partial result"
cmp -s "$WORK/unbound-valid-before.md" "$UNBOUND/skills/otherwise-valid/SKILL.md" || fail "validation failure changed another file"

AMBIGUOUS="$WORK/ambiguous"
mkdir -p "$AMBIGUOUS/skills/demo"
cat >"$AMBIGUOUS/skills/demo/SKILL.md" <<'EOF'
# Ambiguous

The shared shortcut says Step 1.5 before either workflow is selected.

## First workflow

### Step 1: first

### Step 1.5: second

## Second workflow

### Step 1: first

### Step 1.25: second

### Step 1.5: third
EOF
cp "$AMBIGUOUS/skills/demo/SKILL.md" "$WORK/ambiguous-before.md"
run_expect_fail "$WORK/ambiguous.out" "$PYTHON" "$TOOL" fix --write --root "$AMBIGUOUS"
assert_contains "$WORK/ambiguous.out" "[ambiguous-step-reference]"
cmp -s "$WORK/ambiguous-before.md" "$AMBIGUOUS/skills/demo/SKILL.md" || fail "ambiguous failure wrote a partial result"

DUPLICATE="$WORK/duplicate mapping"
mkdir -p "$DUPLICATE/skills/demo"
cat >"$DUPLICATE/skills/demo/SKILL.md" <<'EOF'
# Duplicate mapping

## Workflow

### Step 1.5: first copy

### Step 1.5: second copy
EOF
cp "$DUPLICATE/skills/demo/SKILL.md" "$WORK/duplicate-before.md"
run_expect_fail "$WORK/duplicate.out" "$PYTHON" "$TOOL" fix --write --root "$DUPLICATE"
assert_contains "$WORK/duplicate.out" "[ambiguous-step-mapping]"
cmp -s "$WORK/duplicate-before.md" "$DUPLICATE/skills/demo/SKILL.md" || fail "duplicate mapping failure wrote a result"

echo "[5/8] a reference inside one workflow never binds to another workflow"
WRONG_SCOPE="$WORK/wrong scope"
mkdir -p "$WRONG_SCOPE/skills/demo"
cat >"$WRONG_SCOPE/skills/demo/SKILL.md" <<'EOF'
# Wrong scope

## Alpha workflow

Run Step 1.5 after Alpha starts.

### Step 1: alpha only

## Beta workflow

### Step 1: beta first

### Step 1.5: beta inserted
EOF
cp "$WRONG_SCOPE/skills/demo/SKILL.md" "$WORK/wrong-scope-before.md"
run_expect_fail "$WORK/wrong-scope.out" "$PYTHON" "$TOOL" fix --write --root "$WRONG_SCOPE"
assert_contains "$WORK/wrong-scope.out" "[unscoped-step-reference]"
cmp -s "$WORK/wrong-scope-before.md" "$WRONG_SCOPE/skills/demo/SKILL.md" || fail "cross-workflow reference failure wrote a result"

echo "[6/8] a mid-commit failure rolls every replaced file back"
ROLLBACK="$WORK/rollback"
mkdir -p "$ROLLBACK/skills/alpha" "$ROLLBACK/skills/beta"
cat >"$ROLLBACK/skills/alpha/SKILL.md" <<'EOF'
# Alpha

## Workflow

### Step 8: alpha
EOF
cat >"$ROLLBACK/skills/beta/SKILL.md" <<'EOF'
# Beta

## Workflow

### Step 9: beta
EOF
cp "$ROLLBACK/skills/alpha/SKILL.md" "$WORK/rollback-alpha-before.md"
cp "$ROLLBACK/skills/beta/SKILL.md" "$WORK/rollback-beta-before.md"
"$PYTHON" - "$TOOL" "$ROLLBACK" >"$WORK/rollback.out" 2>&1 <<'PY'
import importlib.util
import sys
from pathlib import Path

tool_path = Path(sys.argv[1])
root = Path(sys.argv[2])
spec = importlib.util.spec_from_file_location("skill_numbering_test_target", tool_path)
if spec is None or spec.loader is None:
    raise SystemExit("could not load skill-numbering.py")
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)

real_replace = module.os.replace
commit_count = 0


def fail_second_commit(source, destination):
    global commit_count
    source_path = Path(source)
    if source_path.suffix == ".tmp" and ".skill-numbering." in source_path.name:
        commit_count += 1
        if commit_count == 2:
            raise OSError("injected second-commit failure")
    return real_replace(source, destination)


module.os.replace = fail_second_commit
return_code = module.main(["fix", "--write", "--root", str(root)])
raise SystemExit(0 if return_code == 1 else 1)
PY
assert_contains "$WORK/rollback.out" "injected second-commit failure"
cmp -s "$WORK/rollback-alpha-before.md" "$ROLLBACK/skills/alpha/SKILL.md" || fail "first committed file was not rolled back"
cmp -s "$WORK/rollback-beta-before.md" "$ROLLBACK/skills/beta/SKILL.md" || fail "second file changed after injected failure"
if find "$ROLLBACK" -type f -name '.*.skill-numbering.*' -print -quit | grep -q .; then
  find "$ROLLBACK" -type f -name '.*.skill-numbering.*' -print >&2
  fail "transaction failure left staging/backup files behind"
fi

echo "[7/8] manual-only dotted labels block write mode without rewriting handbook numbering"
MANUAL="$WORK/manual"
mkdir -p "$MANUAL/skills/demo/references"
cat >"$MANUAL/skills/demo/SKILL.md" <<'EOF'
# Manual issues

### Phase 1.5: inserted phase

Use Phase 1.5 here.

### 2.4 Raw workflow heading

- 3.2 nested workflow action

### Stage 0.5: persistent stage
EOF
cat >"$MANUAL/skills/demo/references/handbook.md" <<'EOF'
# Handbook

### 2.4 Raw handbook section

- 3.2 handbook list label

Stage 0A is stable.
EOF
run_expect_fail "$WORK/manual-check.out" "$PYTHON" "$TOOL" check --root "$MANUAL"
assert_contains "$WORK/manual-check.out" "[dotted-phase-label]"
assert_contains "$WORK/manual-check.out" "[dotted-stage-label]"
assert_contains "$WORK/manual-check.out" "[raw-dotted-heading]"
assert_contains "$WORK/manual-check.out" "[dotted-bullet-label]"
if grep -F "handbook.md" "$WORK/manual-check.out" >/dev/null 2>&1; then
  cat "$WORK/manual-check.out" >&2
  fail "handbook/reference section numbering was incorrectly flagged"
fi
"$PYTHON" "$TOOL" audit --root "$MANUAL" >"$WORK/manual-audit.out"
"$PYTHON" "$TOOL" fix --dry-run --root "$MANUAL" >"$WORK/manual-fix.out"
assert_contains "$WORK/manual-fix.out" "check-only issue(s) still require manual edits"
cp "$MANUAL/skills/demo/SKILL.md" "$WORK/manual-before.md"
run_expect_fail "$WORK/manual-write.out" "$PYTHON" "$TOOL" fix --write --root "$MANUAL"
assert_contains "$WORK/manual-write.out" "check-only issue(s) require manual edits"
cmp -s "$WORK/manual-before.md" "$MANUAL/skills/demo/SKILL.md" || fail "manual-only write failure mutated SKILL.md"

echo "[8/8] affected Markdown anchors block every write, including subset-scope inbound links"
ANCHORS="$WORK/anchors"
mkdir -p "$ANCHORS/skills/demo/references"
cat >"$ANCHORS/skills/demo/SKILL.md" <<'EOF'
# Anchor safety

## Workflow

### Step 1: first

[Step 1.5](#step-15-inserted)
[label without Step](#step-15-inserted)

### Step 1.5: inserted

### Step 2: former second
EOF
cat >"$ANCHORS/skills/demo/references/inbound.md" <<'EOF'
# Inbound reference

[label without Step](../SKILL.md#step-15-inserted)
EOF
cp "$ANCHORS/skills/demo/SKILL.md" "$WORK/anchors-before.md"
cp "$ANCHORS/skills/demo/references/inbound.md" "$WORK/anchors-inbound-before.md"
run_expect_fail "$WORK/anchors.out" \
  "$PYTHON" "$TOOL" fix --write --root "$ANCHORS" skills/demo/SKILL.md
assert_contains "$WORK/anchors.out" "[step-anchor-reference]"
assert_contains "$WORK/anchors.out" "references/inbound.md"
cmp -s "$WORK/anchors-before.md" "$ANCHORS/skills/demo/SKILL.md" || fail "anchor blocker mutated selected file"
cmp -s "$WORK/anchors-inbound-before.md" "$ANCHORS/skills/demo/references/inbound.md" || fail "anchor blocker mutated inbound reference"

echo "PASS: skill numbering regression"
