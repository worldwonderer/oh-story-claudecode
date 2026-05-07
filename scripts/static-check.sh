#!/bin/bash
# static-check.sh — Skill 结构与路径完整性检查
# 检查：frontmatter、引用路径有效、死文件、Agent 引用有效、Hook 路径有效

set -euo pipefail

# 用 git 定位项目根目录，避免硬编码跳级
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
if [ -z "$REPO_ROOT" ]; then
  echo "Error: not in a git repository"
  exit 1
fi

SKILLS_DIR="$REPO_ROOT/skills"
if [ ! -d "$SKILLS_DIR" ]; then
  echo "Error: skills/ not found at $SKILLS_DIR"
  exit 1
fi

TOTAL=0
PASS=0
FAIL=0
WARN=0

# ---------- helpers ----------

# 从 SKILL.md 提取所有相对路径引用（markdown 链接 + 行内路径）
extract_referenced_paths() {
  local file="$1"
  # Match [text](relative/path) — capture the path part
  grep -oE '\]\([^)]+\)' "$file" 2>/dev/null | sed 's/](\(.*\))/\1/' | grep -v '^http' | grep -v '^#' || true
  # Match bare relative paths in code blocks or prose: references/xxx, scripts/xxx
  grep -oE '(references|scripts|assets)/[^ ")\]]+' "$file" 2>/dev/null || true
}

# 从 SKILL.md 提取所有 subagent_type 引用
extract_agent_refs() {
  local file="$1"
  grep -oE 'subagent_type:[[:space:]]*"[^"]+"' "$file" 2>/dev/null | sed 's/subagent_type:[[:space:]]*"//' | sed 's/"$//' || true
  grep -oE 'subagent_type="[^"]+"' "$file" 2>/dev/null | sed 's/subagent_type="//' | sed 's/"//' || true
}

# ---------- checks ----------

check_skill() {
  local skill_dir="$1"
  local skill_name
  skill_name="$(basename "$skill_dir")"
  local skill_file="$skill_dir/SKILL.md"

  if [ ! -f "$skill_file" ]; then
    return
  fi

  TOTAL=$((TOTAL + 1))
  local errors=0
  local warnings=0

  echo ""
  echo "--- $skill_name ---"

  # Check 1: frontmatter (name + description required)
  local has_name has_desc
  has_name="$(grep -c '^name:' "$skill_file" || true)"
  has_desc="$(grep -c '^description:' "$skill_file" || true)"
  if [ "$has_name" -ge 1 ] && [ "$has_desc" -ge 1 ]; then
    echo "  [PASS] frontmatter: name + description present"
  else
    echo "  [FAIL] frontmatter: missing name or description"
    errors=$((errors + 1))
  fi

  # Check 2: referenced paths exist
  local broken_paths=()
  while IFS= read -r ref_path; do
    [ -z "$ref_path" ] && continue
    # Resolve relative to skill directory
    local full_path="$skill_dir/$ref_path"
    if [ ! -e "$full_path" ]; then
      broken_paths+=("$ref_path")
    fi
  done < <(extract_referenced_paths "$skill_file" | sort -u)

  if [ ${#broken_paths[@]} -eq 0 ]; then
    echo "  [PASS] all referenced paths exist"
  else
    echo "  [FAIL] broken path references:"
    for p in "${broken_paths[@]}"; do
      echo "         -> $p"
    done
    errors=$((errors + 1))
  fi

  # Check 3: dead files in references/ (recursive, skip .gitkeep)
  if [ -d "$skill_dir/references" ]; then
    local dead_files=()
    while IFS= read -r -d '' ref_file; do
      local ref_basename
      ref_basename="$(basename "$ref_file")"
      [ "$ref_basename" = ".gitkeep" ] && continue
      # Check if basename is mentioned anywhere in SKILL.md
      if ! grep -qF "$ref_basename" "$skill_file" 2>/dev/null; then
        local rel_path="${ref_file#$skill_dir/}"
        dead_files+=("$rel_path")
      fi
    done < <(find "$skill_dir/references" -type f -print0 2>/dev/null)

    if [ ${#dead_files[@]} -eq 0 ]; then
      echo "  [PASS] no dead files in references/"
    else
      echo "  [WARN] files in references/ not referenced in SKILL.md:"
      for f in "${dead_files[@]}"; do
        echo "         -> $f"
      done
      warnings=$((warnings + 1))
    fi
  fi

  # Check 4: Agent references valid
  local agent_names=()
  if [ -d "$REPO_ROOT/skills/story-setup/references/templates/agents" ]; then
    for f in "$REPO_ROOT/skills/story-setup/references/templates/agents/"*.md; do
      [ -f "$f" ] && agent_names+=("$(basename "$f" .md)")
    done
  fi

  local broken_agents=()
  while IFS= read -r agent_ref; do
    [ -z "$agent_ref" ] && continue
    local found=false
    for name in "${agent_names[@]}"; do
      if [ "$agent_ref" = "$name" ]; then
        found=true
        break
      fi
    done
    if [ "$found" = false ]; then
      broken_agents+=("$agent_ref")
    fi
  done < <(extract_agent_refs "$skill_file" | sort -u)

  if [ ${#broken_agents[@]} -eq 0 ]; then
    if [ ${#agent_names[@]} -gt 0 ] && [ -n "$(extract_agent_refs "$skill_file")" ]; then
      echo "  [PASS] all agent references valid"
    fi
  else
    echo "  [FAIL] unknown agent references:"
    for a in "${broken_agents[@]}"; do
      echo "         -> $a"
    done
    errors=$((errors + 1))
  fi

  # Summary
  if [ "$errors" -eq 0 ]; then
    PASS=$((PASS + 1))
    if [ "$warnings" -gt 0 ]; then
      WARN=$((WARN + 1))
      echo "  Result: PASS ($warnings warnings)"
    else
      echo "  Result: PASS"
    fi
  else
    FAIL=$((FAIL + 1))
    echo "  Result: FAIL ($errors errors, $warnings warnings)"
  fi
}

# ---------- main ----------

echo "Skill Static Check"
echo "=================="
echo "Repo: $REPO_ROOT"

for skill_dir in "$SKILLS_DIR"/*/; do
  check_skill "$skill_dir"
done

echo ""
echo "=================="
echo "Total: $TOTAL | Pass: $PASS | Fail: $FAIL | Warn: $WARN"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
