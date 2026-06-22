#!/bin/bash
### story-hooks: BEGIN ###
# story project commit validation
# Managed by story-setup -- do not edit this block manually
# Checks for hardcoded character attributes in story files (advisory only, never blocks)
(
set -euo pipefail
ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
WARNINGS=""

while IFS= read -r -d '' file; do
  case "$file" in
    *.md) ;;
    *) continue ;;
  esac

  FULL_PATH="$ROOT/$file"
  [ -f "$FULL_PATH" ] || continue

  case "$file" in
    *正文.md|*正文/*)
      HARDCODED=$(grep -nE "(身高|体重|年龄)[[:space:]]*[：:][[:space:]]*[0-9]+" "$FULL_PATH" 2>/dev/null || true)
      if [ -n "$HARDCODED" ]; then
        WARNINGS="$WARNINGS"$'\n'"  $file: Hardcoded character attributes found (should reference 设定/ files):"$'\n'"$HARDCODED"
      fi
      ;;
  esac

  case "$file" in
    *设定/*)
      if ! grep -qE "^[[:space:]]*(名字|姓名|名称|name|Name)[[:space:]]*[：:]" "$FULL_PATH" 2>/dev/null; then
        WARNINGS="$WARNINGS"$'\n'"  $file: Setting file missing required fields (name/名字: ...)"
      fi
      ;;
  esac
done < <(git -c core.quotepath=false diff --cached --relative --name-only --diff-filter=ACM -z -- . 2>/dev/null || true)

if [ -n "$WARNINGS" ]; then
  echo "=== Story Commit Warnings (advisory only, not blocking) ==="
  echo "$WARNINGS"
  echo "=== End Warnings ==="
fi

)
### story-hooks: END ###
