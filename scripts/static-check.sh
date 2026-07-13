#!/bin/bash
# static-check.sh — Skill 结构与路径完整性检查
# 检查：frontmatter、引用路径有效、死文件、交叉引用、Agent 引用有效、
#       反引号引用有效(含 skill 作用域)、裸文件名检测、SKILL.md section 引用

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
  grep -oE '(references|scripts|assets)/[^ `")\]]+' "$file" 2>/dev/null || true
}

# 从 SKILL.md 提取所有 subagent_type 引用
extract_agent_refs() {
  local file="$1"
  grep -oE 'subagent_type:[[:space:]]*"[^"]+"' "$file" 2>/dev/null | sed 's/subagent_type:[[:space:]]*"//' | sed 's/"$//' || true
  grep -oE 'subagent_type="[^"]+"' "$file" 2>/dev/null | sed 's/subagent_type="//' | sed 's/"//' || true
  grep -oE '\(subagent_type:[[:space:]]*[a-z][a-z0-9_-]+\)' "$file" 2>/dev/null | sed 's/(subagent_type:[[:space:]]*//' | sed 's/)$//' || true
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
        # Fallback: check if a parent directory is referenced in SKILL.md
        # (handles skills that reference directories like "references/templates/hooks/")
        local parent_covered=false
        local check_dir="$(dirname "$ref_file")"
        while [ "$check_dir" != "$skill_dir" ] && [ "$check_dir" != "/" ]; do
          local rel_dir="${check_dir#$skill_dir/}/"
          if grep -qF "$rel_dir" "$skill_file" 2>/dev/null; then
            parent_covered=true
            break
          fi
          check_dir="$(dirname "$check_dir")"
        done
        if [ "$parent_covered" = false ]; then
          local rel_path="${ref_file#$skill_dir/}"
          dead_files+=("$rel_path")
        fi
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

  # Check 4: Internal cross-references in references/ files
  if [ -d "$skill_dir/references" ]; then
    local broken_xrefs=()
    while IFS= read -r -d '' ref_file; do
      [ "$(basename "$ref_file")" = ".gitkeep" ] && continue
      # Extract markdown links [text](path) from reference files
      while IFS= read -r xref; do
        [ -z "$xref" ] && continue
        # Skip external URLs, anchors, and template placeholders
        [[ "$xref" == http* ]] && continue
        [[ "$xref" == \#* ]] && continue
        [[ "$xref" == *"{"* ]] && continue
        local xref_full="$(dirname "$ref_file")/$xref"
        if [ ! -e "$xref_full" ]; then
          broken_xrefs+=("$(basename "$ref_file") -> $xref")
        fi
      done < <(grep -oE '\]\([^)]+\)' "$ref_file" 2>/dev/null | sed 's/](\(.*\))/\1/' | grep -v '^http' | grep -v '^#' || true)
    done < <(find "$skill_dir/references" -type f -name "*.md" -print0 2>/dev/null)

    if [ ${#broken_xrefs[@]} -eq 0 ]; then
      echo "  [PASS] no broken cross-references in references/"
    else
      echo "  [FAIL] broken cross-references in references/:"
      for x in "${broken_xrefs[@]}"; do
        echo "         -> $x"
      done
      errors=$((errors + 1))
    fi
  fi

  # Check 5: Agent references valid
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

  # Check 6: Backtick-wrapped inline file references (e.g. `character-design.md`)
  # Only checks ASCII-named reference files, skips artifact templates (Chinese paths, dates)
  local broken_inline=()
  while IFS= read -r -d '' src_file; do
    local src_rel="${src_file#$skill_dir/}"
    while IFS= read -r ref_name; do
      [ -z "$ref_name" ] && continue
      # Skip template placeholders and non-ASCII paths (artifact templates)
      [[ "$ref_name" == *"{"* ]] && continue
      [[ "$ref_name" =~ [^[:ascii:]] ]] && continue
      # Only check filenames that look like reference docs (lowercase ASCII + hyphens + underscores)
      local base_name="$(basename "$ref_name")"
      [[ "$base_name" =~ ^[a-z0-9_-]+\.md$ ]] || continue
      # Skip dynamic/runtime-generated files (underscore prefix)
      [[ "$base_name" =~ ^_ ]] && continue
      # Resolution scope: bare filenames in references/*.md (direct children) are skill-scoped;
      # files in subdirectories (templates/, etc.) and path references allow broad resolution
      local found=false
      local is_scoped_ref=false
      local src_parent="$(basename "$(dirname "$src_file")")"
      [[ "$src_parent" == "references" ]] && [[ "$ref_name" != */* ]] && is_scoped_ref=true
      local ref_dir="$(dirname "$src_file")"
      if [ -f "$ref_dir/$ref_name" ]; then
        found=true
      elif find "$skill_dir" -type f -name "$base_name" -print -quit 2>/dev/null | grep -q .; then
        found=true
      elif [ "$is_scoped_ref" = false ] && find "$SKILLS_DIR" -type f -name "$base_name" -print -quit 2>/dev/null | grep -q .; then
        found=true
      elif [ "$is_scoped_ref" = false ] && [ -f "$REPO_ROOT/$ref_name" ]; then
        found=true
      fi
      if [ "$found" = false ]; then
        broken_inline+=("$src_rel -> $ref_name")
      fi
    done < <(grep -oE '`[^`]+\.md`' "$src_file" 2>/dev/null | sed 's/`//g' | sort -u || true)
  done < <(find "$skill_dir" -type f -name "*.md" -print0 2>/dev/null)

  if [ ${#broken_inline[@]} -eq 0 ]; then
    echo "  [PASS] no broken inline file references"
  else
    echo "  [FAIL] broken inline file references (backtick-wrapped):"
    for x in "${broken_inline[@]}"; do
      echo "         -> $x"
    done
    errors=$((errors + 1))
  fi

  # Check 7: Bare prose .md filename detection (not backtick-wrapped, not in markdown links)
  # FAILs for filenames not found anywhere in skills/; WARNs for existing but unwrapped names
  local bare_refs=()
  while IFS= read -r -d '' src_file; do
    local src_rel="${src_file#$skill_dir/}"
    # Use awk to: 1) skip code blocks, 2) strip markdown links and backtick content, 3) find bare .md names
    while IFS= read -r bare; do
      [ -z "$bare" ] && continue
      local bname
      bname="$(basename "$bare")"
      [[ "$bname" =~ ^[a-z0-9_-]+\.md$ ]] || continue
      [[ "$bname" =~ ^_ ]] && continue
      # Skip numbered example filenames (e.g. chapter01.md, file123.md)
      [[ "$bname" =~ ^[a-z]+[0-9]+\.md$ ]] && continue
      bare_refs+=("$src_rel: $bname")
    done < <(awk '
      /^```/ { in_block = !in_block; next }
      in_block { next }
      { gsub(/\[[^\]]*\]\([^)]*\)/, "")
        gsub(/`[^`]*`/, "")
        while (match($0, /[a-z0-9_-]+\.md/)) {
          print substr($0, RSTART, RLENGTH)
          $0 = substr($0, RSTART + RLENGTH)
        }
      }
    ' "$src_file" 2>/dev/null || true)
  done < <(find "$skill_dir" -type f -name "*.md" -print0 2>/dev/null)

  # Deduplicate
  local unique_bare=()
  if [ ${#bare_refs[@]} -gt 0 ]; then
    while IFS= read -r ref; do
      unique_bare+=("$ref")
    done < <(printf '%s\n' "${bare_refs[@]}" | sort -u)
  fi

  # Separate bare refs into: broken (file not found) vs valid (exists but should be wrapped)
  local broken_bare=()
  local valid_bare=()
  for x in ${unique_bare[@]+"${unique_bare[@]}"}; do
    local bname="${x##* }"
    local src_part="${x%%: *}"
    local src_file_path="$skill_dir/$src_part"
    local found=false
    local ref_dir="$(dirname "$src_file_path")"
    if [ -f "$ref_dir/$bname" ]; then
      found=true
    elif find "$skill_dir" -type f -name "$bname" -print -quit 2>/dev/null | grep -q .; then
      found=true
    elif find "$SKILLS_DIR" -type f -name "$bname" -print -quit 2>/dev/null | grep -q .; then
      found=true
    fi
    if [ "$found" = false ]; then
      broken_bare+=("$x")
    else
      valid_bare+=("$x")
    fi
  done

  if [ ${#broken_bare[@]} -gt 0 ]; then
    echo "  [FAIL] bare .md filenames referencing non-existent files:"
    for x in "${broken_bare[@]}"; do
      echo "         -> $x"
    done
    errors=$((errors + 1))
  fi
  if [ ${#valid_bare[@]} -gt 0 ]; then
    echo "  [WARN] bare .md filenames not wrapped in backticks (Check 6 cannot validate):"
    for x in "${valid_bare[@]}"; do
      echo "         -> $x"
    done
    warnings=$((warnings + 1))
  fi
  if [ ${#broken_bare[@]} -eq 0 ] && [ ${#valid_bare[@]} -eq 0 ]; then
    echo "  [PASS] no bare prose .md filename references"
  fi

  # Check 8: SKILL.md section reference validation
  local broken_section_refs=()
  if [ -f "$skill_dir/SKILL.md" ] && [ -d "$skill_dir/references" ]; then
    # Extract all headings from SKILL.md into an array
    local headings=()
    local h_tmp
    h_tmp="$(grep -E '^#{1,4}[[:space:]]' "$skill_dir/SKILL.md" 2>/dev/null | sed -E 's/^#+[[:space:]]*//' | sed 's/[[:space:]]*$//' | tr '[:upper:]' '[:lower:]')" || true
    if [ -n "$h_tmp" ]; then
      while IFS= read -r h_line; do
        headings+=("$h_line")
      done <<< "$h_tmp"
    fi

    # For each references/*.md file, extract and validate section refs
    while IFS= read -r -d '' src_file; do
      local src_rel="${src_file#$skill_dir/}"
      # Extract section references (grep works, pipe to temp var to avoid nested pipefail)
      local refs_tmp
      # Use simple grep to find lines with section refs, then extract with sed
      refs_tmp="$(grep 'SKILL\.md' "$src_file" 2>/dev/null | grep -oE '(见|参考|参见|详见) SKILL\.md [^)]+' | sed -E 's/^(见|参考|参见|详见) SKILL\.md //' | sort -u)" || true
      [ -z "$refs_tmp" ] && continue
      while IFS= read -r ref_text; do
        [ -z "$ref_text" ] && continue
        # Strip trailing punctuation and lowercase
        local clean_ref
        clean_ref="$(echo "$ref_text" | sed -E 's/[）)」』,，。；：;:]+$//' | sed -E 's/[[:space:]]*$//' | tr '[:upper:]' '[:lower:]')"
        [ -z "$clean_ref" ] && continue
        local matched=false
        for h in "${headings[@]}"; do
          # Substring match: ref in heading or heading in ref
          if [[ "$h" == *"$clean_ref"* ]] || [[ "$clean_ref" == *"$h"* ]]; then
            matched=true
            break
          fi
        done
        # Prefix-strip match: progressively remove last token and check headings
        if [ "$matched" = false ]; then
          local prefix="$clean_ref"
          while [[ "$prefix" == *[[:space:]]* ]]; do
            prefix="${prefix% *}"
            [ -z "$prefix" ] && break
            for h in "${headings[@]}"; do
              if [[ "$h" == *"$prefix"* ]] || [[ "$prefix" == *"$h"* ]]; then
                matched=true
                break 2
              fi
            done
          done
          # Character-level fallback: strip one char at a time (max 3 iterations)
          # Handles cases like "设计任务第" not matching "设计任务（...）"
          if [ "$matched" = false ] && [ -n "$prefix" ]; then
            for _cnt in 1 2 3; do
              prefix="${prefix%?}"
              [ -z "$prefix" ] && break
              for h in "${headings[@]}"; do
                if [[ "$h" == *"$prefix"* ]] || [[ "$prefix" == *"$h"* ]]; then
                  matched=true
                  break 2
                fi
              done
            done
          fi
        fi
        if [ "$matched" = false ]; then
          broken_section_refs+=("$src_rel -> SKILL.md '$ref_text'")
        fi
      done <<< "$refs_tmp"
    done < <(find "$skill_dir/references" -maxdepth 1 -type f -name "*.md" -print0 2>/dev/null)
  fi

  if [ ${#broken_section_refs[@]} -eq 0 ]; then
    echo "  [PASS] no broken SKILL.md section references"
  else
    echo "  [FAIL] broken SKILL.md section references:"
    for x in "${broken_section_refs[@]}"; do
      echo "         -> $x"
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
