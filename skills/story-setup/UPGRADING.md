# 升级指南

## 升级策略

| 策略 | 适用场景 | 风险 |
|------|----------|------|
| 覆盖部署 | 全新项目或无需保留自定义 | 低 |
| 合并部署 | 有自定义内容需保留 | 中 |
| 手动更新 | 只改特定文件 | 低 |

推荐：运行 `/story-setup` 重新部署，自动走合并策略。

## 文件分类

### 可安全覆盖

这些文件由 story-setup 管理，不含用户自定义内容：
- `.claude/hooks/` — 所有 hook 脚本与 `lib/` 辅助库
- `.claude/agents/` — 所有 agent 定义
- `.claude/rules/` — 所有 path-scoped 规则
- `.claude/skills/story-setup/references/agent-references/` — Agent 参考资料副本

### 需合并（不覆盖）

这些文件可能含用户自定义内容：
- `CLAUDE.md` — 按 marker/section 合并，用户独有 section 保留
- `.claude/settings.local.json` — hooks 按 command 去重 append，其他配置保留

### 不碰

这些文件完全由用户管理：
- `{书名}/追踪/上下文.md` — 用户写作上下文
- `{书名}/追踪/伏笔.md` — 用户伏笔追踪
- `.active-book` — 用户活跃书目
- 短篇项目的 `追踪/` — setup/hooks 不应为短篇自动创建

## 版本检测

`.story-deployed` 文件记录部署版本：
- 无此文件 → 未部署，需全新安装
- `agents_version: 1` → 旧版，需重新部署以获取新 Agent
- `agents_version: 2` → 旧版，需重新部署以获取 story-explorer agent
- `agents_version: 3` → 旧版，需重新部署以获取 story-explorer agent
- `agents_version: 4` → 旧版，需重新部署以获取 chapter-extractor agent
- `agents_version: 5` → 旧版，需重新部署以统一短篇主会话/子代理正文格式
- `agents_version: 6` → 旧版，需重新部署以获取日更续写与伏笔 hook 修复
- `agents_version: 7` → 旧版，需重新部署以获取 Agent 参考文件路径修复
- `agents_version: 8` → 旧版，需重新部署以获取 hook lib、reference bundle、root-aware hook 与短篇无副作用修复
- `agents_version: 9` → 旧版，需重新部署以获取新版写作 Agent
- `agents_version: 10` → 当前版本

## 版本变更

### v2

- 4 个创作型 Agent + 1 个研究型 Agent（story-architect, character-designer, narrative-writer, consistency-checker, story-researcher）
- Agent 引用 skill references 写作理论
- Hook 脚本优化（减少 context 输出）
- 4 条 path-scoped 规则

### v3

- 新增 story-explorer 只读查询 Agent（角色/伏笔/设定/进度查询，日更上下文快速加载）
- 6 个 Agent 总计（story-architect, character-designer, narrative-writer, consistency-checker, story-researcher, story-explorer）
- story-explorer 被 story-long-write、story-review、story 路由集成调用

### v4

- 新增 chapter-extractor 章节提取 Agent
- 7 个 Agent 总计（story-architect, character-designer, narrative-writer, consistency-checker, story-researcher, story-explorer, chapter-extractor）

### v5

- 更新 narrative-writer 场景写法：使用“三维度织入”并按镜头断段控制段落密度
- 字数统计改为 Python 字符统计优先，`wc -m` 仅作 macOS/Linux 备选，提升 Windows + DeepSeek/Claude Code 兼容性
- 已部署项目重新运行 `/story-setup` 后获取新版 agent 定义

### v6

- 统一 narrative-writer 子代理与主会话的短篇正文格式：固定写入 `正文.md`、小节标记统一、段落无空行、对话半角双引号
- 短篇写作不再由 narrative-writer 创建长篇 `追踪/上下文.md`

### v7

- 修复长篇 `/story-long-write 日更` 批量续写中的 continuation 规则：同一批次内“继续/续写/日更”保持在 daily workflow，不直接跳到正文续写。
- 修复 `detect-story-gaps.sh` 对伏笔表头和正常开放伏笔（`未埋`/`已埋`）的误报；SessionStart 只提示 `已过期` 或异常状态。
- 已部署项目需重新运行 `/story-setup`，以覆盖 `.claude/hooks/`、`.claude/agents/`、`.claude/rules/` 并获得新版 hook 行为。

### v8

- 修复 story-review 及部署后的 reviewer Agent 在项目根目录下读取参考文件时，只找裸文件名（如 `quality-checklist.md`）导致找不到 skill references 的问题。
- Agent 模板新增参考文件路径规则：优先从 `.claude/skills/` 或 `skills/` 拼接解析 `story-setup/references/agent-references/*.md` 规范路径，避免依赖当前工作目录且不跨 skill 引用 references。
- 已部署项目需重新运行 `/story-setup`，以覆盖 `.claude/agents/` 并获得新版参考文件路径规则。

### v9

- `setup_skill_version` 升级到 `1.1.0`，`.story-deployed` 的 `agents_version` 升级到 `9`。
- 部署契约补充机械可检查清单：hooks、rules、agents、Agent References、settings hooks、`CLAUDE.md` 合并和 `.story-deployed` 字段都必须明确 source、target、owner、merge mode、validation。
- Hook 部署从“只复制 `.sh` 文件”改为递归复制完整 `references/templates/hooks/` 目录树，避免遗漏 `lib/common.sh`；新增 `lib/sentinel.sh` 统一读取 `.story-deployed` 字段。
- Hook runtime 改为 root-aware：优先使用 `CLAUDE_PROJECT_DIR`，其次 git root，最后 cwd；`discover_active_book` 与 `discover_all_books` 分离，避免单本会话逻辑和全项目巡检互相污染。
- `detect-story-gaps.sh` 使用 bash 3.2 兼容数组/去重逻辑，并从公共库获取所有书目。
- `session-end.sh` 默认不写 `session-log.txt`；显式 `STORY_SESSION_LOG=1` 时也只写已存在的长篇 `追踪/`，不会为短篇创建 `追踪/`。
- `validate-story-commit.sh` 增加脚本内自检：解析 `CLAUDE_TOOL_INPUT.command` / `STORY_COMMIT_COMMAND` 后只对真实 `git commit` 生效，避免 `echo git commit docs` 这类非提交命令误触发。
- Agent Reference bundle 补齐并 canonicalize：
  - `genre-readers.md`：从 `story-long-write/references/genre-readers.md` 复制为 story-setup canonical 副本。
  - `genre-writing-formulas.md`：从 `story-long-write/references/genre-writing-formulas.md` 复制为 story-setup canonical 副本。
  - `emotional-methods.md`：从 `story-long-write/references/emotional-methods.md` 复制为 story-setup canonical 副本。
  - `style-combat-face.md`：从 `story-long-write/references/style-combat-face.md` 复制为 story-setup canonical 副本。
  - `output-templates.md`：不复制；`chapter-extractor` 已内置输出格式，旧的裸引用改写为“遵循本文件输出格式”。
- `story-format.md` 删除“章节之间用 `---` 分隔”的旧规则，改为禁止正文片段使用水平分隔线，与 narrative-writer 保持一致。

### v10 (当前)

已部署项目请重新运行 `/story-setup`，刷新写作 Agent；主要影响是日更续写更稳定地沿用对标文风。
