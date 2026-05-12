#!/bin/bash
# validate-story-commit.sh — 在 git commit 时检查格式问题（WARNING only, no BLOCKING）
set -euo pipefail

# 仅在 git commit 命令时触发（由 settings.json 的 if 过滤器控制）
# 其他 Bash 命令不应到达此脚本，但做安全检查

WARNINGS=""

# 获取即将 commit 的文件列表（使用 -z null 分隔避免空格路径问题）
while IFS= read -r -d '' file; do
  # 跳过非 md 文件
  case "$file" in
    *.md) ;;
    *) continue ;;
  esac

  # 检查正文文件是否包含硬编码的情节值
  case "$file" in
    正文/*|*/正文/*)
      HARDCODED=$(grep -nE "(身高|体重|年龄)(：|:)[0-9]+" "$file" 2>/dev/null || true)
      if [ -n "$HARDCODED" ]; then
        WARNINGS="$WARNINGS\n⚠ $file: Hardcoded character attributes found (should reference 设定/ files):\n$HARDCODED"
      fi
      ;;
  esac

  # 检查设定文件的必填字段（结构化匹配：key:value 格式）
  case "$file" in
    设定/*|*/设定/*)
      if ! grep -qE "^(名字|姓名|名称|name|Name)[：:]" "$file" 2>/dev/null; then
        WARNINGS="$WARNINGS\n⚠ $file: Setting file missing required fields (name/名字: ...)"
      fi
      ;;
  esac
done < <(git -c core.quotepath=false diff --cached --name-only --diff-filter=ACM -z 2>/dev/null || true)

if [ -n "$WARNINGS" ]; then
  echo "=== Story Commit Warnings (advisory only, not blocking) ==="
  printf '%b\n' "$WARNINGS"
  echo "=== End Warnings ==="
fi

# Always exit 0 — 写作流程不能被 hook 卡住
exit 0
