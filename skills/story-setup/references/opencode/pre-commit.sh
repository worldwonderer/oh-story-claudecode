#!/bin/bash
### story-hooks: BEGIN ###
# story project commit validation
# Managed by story-setup -- do not edit this block manually
# Checks for hardcoded character attributes in story files (advisory only, never blocks)
(
set -euo pipefail
# LC_ALL=C：模式里的全角「　」「：」是多字节 UTF-8，GBK 区域下 grep 会判无效序列
# 退 2，! 取反后对每个设定文件误报缺字段。强制 C 区域按字节匹配（同
# validate-story-commit.sh，issue #164 约定：LC_ALL=C + 交替代替字符组）。
export LC_ALL=C
ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
WARNINGS=""

while IFS= read -r -d '' file; do
  case "$file" in
    *.md) ;;
    *) continue ;;
  esac

  FULL_PATH="$ROOT/$file"
  [ -f "$FULL_PATH" ] || continue

  # 匹配语义与警告文案对齐 JS core（story_hook_core.js stagedMarkdownWarnings）：冒号/空白用
  # 交替而非含全角字符的方括号字符组（C/GBK 区域下字符组会被拆成单字节、漏匹配）；name 字段
  # grep -i 大小写不敏感。
  case "$file" in
    正文.md|*/正文.md|正文/*|*/正文/*)
      HARDCODED=$(grep -nE "(身高|体重|年龄)([[:space:]]|　)*(：|:)([[:space:]]|　)*[0-9]+" "$FULL_PATH" 2>/dev/null || true)
      if [ -n "$HARDCODED" ]; then
        WARNINGS="$WARNINGS"$'\n'"⚠ $file: 正文硬编码角色属性，应引用设定文件："$'\n'"$HARDCODED"
      fi
      ;;
  esac

  case "$file" in
    设定/*|*/设定/*)
      if ! grep -qiE "^([[:space:]]|　)*(名字|姓名|名称|name)([[:space:]]|　)*(：|:)" "$FULL_PATH" 2>/dev/null; then
        WARNINGS="$WARNINGS"$'\n'"⚠ $file: 设定文件缺少 name/名字 必填字段。"
      fi
      ;;
  esac
done < <(git -c core.quotepath=false diff --cached --relative --name-only --diff-filter=ACM -z -- . 2>/dev/null || true)

if [ -n "$WARNINGS" ]; then
  echo "=== Story Commit Warnings（advisory only）==="
  echo "$WARNINGS"
  echo "=== End Warnings ==="
fi

)
### story-hooks: END ###
