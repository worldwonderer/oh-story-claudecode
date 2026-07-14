#!/bin/bash
# common.sh — 公共函数库，供各 hook 文件 source
# 注意：不加 set -euo pipefail，避免 source 时覆盖调用方的 shell options

# project_root — 稳定解析项目根目录
# 优先使用 Claude Code 注入的 CLAUDE_PROJECT_DIR；其次使用 git root；最后退回当前目录。
# 输出绝对路径，避免 hook 从嵌套 cwd 执行时误读/误写。
project_root() {
  if [ -n "${CLAUDE_PROJECT_DIR:-}" ] && [ -d "$CLAUDE_PROJECT_DIR" ]; then
    (cd "$CLAUDE_PROJECT_DIR" 2>/dev/null && pwd -P) && return
  fi
  local git_root
  git_root=$(git rev-parse --show-toplevel 2>/dev/null || true)
  if [ -n "$git_root" ] && [ -d "$git_root" ]; then
    (cd "$git_root" 2>/dev/null && pwd -P) && return
  fi
  pwd -P
}

# resolve_project_path <path> — 将相对路径按项目根目录解析为绝对路径。
resolve_project_path() {
  local path="$1"
  case "$path" in
    /*) printf '%s\n' "$path" ;;
    *) printf '%s/%s\n' "$(project_root)" "$path" ;;
  esac
}

# discover_active_book — 单本书查询（活跃书目）
# 优先 root/.active-book；其次 find 第一个 追踪/ (长篇) 或 正文/ / 正文.md (短篇) 目录。
# 使用场景：session-start / session-end / pre-compact / post-compact —— 一次会话只关心当前活跃的那本书。
discover_active_book() {
  local root
  root=$(project_root)

  if [ -f "$root/.active-book" ]; then
    local active
    # LC_ALL=C：书名是中文 UTF-8。Windows 中文系统若导出 GBK 区域设置，trim 的
    # s/^[[:space:]]*// 会逼 sed 按 GBK 解码整行，短书名（如「让你管账号」「修仙传」）的
    # UTF-8 字节是非法 GBK 序列 → BSD sed 报 illegal byte sequence、active 被吞成空 →
    # .active-book 被忽略、误解析到 find 到的第一本书。强制 C 区域走字节处理才稳。
    # 本库被无 export 的 session-*/pre-compact/post-compact 复用，故在此 per-command 兜底，
    # 不在库里 export（避免给调用方留全局副作用，与文件头「不覆盖调用方 shell 选项」一致）。
    active=$(LC_ALL=C sed -n '1p' "$root/.active-book" | LC_ALL=C sed 's/^[[:space:]]*//;s/[[:space:]]*$//' || true)
    if [ -n "$active" ]; then
      resolve_project_path "$active"
      return
    fi
  fi

  # 长篇优先（追踪/ 目录存在）
  local first
  first=$(find "$root" -maxdepth 4 -type d -name "追踪" -print -quit 2>/dev/null || true)
  if [ -n "$first" ]; then
    dirname "$first"
    return
  fi

  # 短篇 fallback：查找 正文/ 目录或 正文.md（maxdepth 4 覆盖 推荐/短篇/书名/正文 结构）
  local story_path
  story_path=$(find "$root" -maxdepth 4 \( -type d -name "正文" -o -type f -name "正文.md" \) -print -quit 2>/dev/null || true)
  if [ -n "$story_path" ]; then
    dirname "$story_path"
  fi
}

# discover_all_books — 多本书查询（项目内所有书目）
# 输出：换行分隔的绝对目录路径列表（不含重复）。
# 使用场景：detect-story-gaps —— 需要遍历项目内所有书目做缺口检测。
discover_all_books() {
  local root
  root=$(project_root)
  # 用 awk 去重保持插入顺序（bash 3.2 兼容，不用关联数组）
  {
    # 长篇：追踪/ 父目录
    find "$root" -maxdepth 4 -type d -name "追踪" -print 2>/dev/null | while IFS= read -r d; do dirname "$d"; done
    # 短篇：正文/ 父目录 或 正文.md 父目录
    find "$root" -maxdepth 4 \( -type d -name "正文" -o -type f -name "正文.md" \) -print 2>/dev/null | while IFS= read -r d; do dirname "$d"; done
  } | awk 'NF && !seen[$0]++'
}
