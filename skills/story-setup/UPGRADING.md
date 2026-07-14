# 升级指南

## 当前版本

- `setup_skill_version: 1.2.7`
- `agents_version: 18`

`.story-deployed` 缺失任一字段，或 `agents_version` 缺失 / 非整数 / 小于 `18`，都视为待更新部署。直接重新运行 `/story-setup`（Codex 用 `$story-setup`）；不在运行时逐级兼容历史模板。如项目 `agents_version` 大于 `18`，说明本地 story-setup 比项目旧：先更新 oh-story-claudecode，不得用 v18 降级覆盖。历史版本改动见仓库根目录 `CHANGELOG.md`。

## 升级策略

| 策略 | 适用场景 | 行为 |
|------|----------|------|
| 覆盖部署 | 全新项目 | 写入当前 agents/hooks/rules/reference bundle |
| 合并部署 | 已有项目 | 替换 story-setup 管理文件，合并用户维护文件 |
| 手动更新 | 只更新特定文件 | 仅建议熟悉部署契约的维护者使用 |

推荐始终重新运行 story-setup，让部署器按 owner class 处理文件。

## 文件所有权

### story-setup 管理，可替换

- `.claude/hooks/`、`.claude/agents/`、`.claude/rules/`
- `.opencode/agents/`、`.opencode/commands/`、`.opencode/plugins/story-hooks.ts`
- `.codex/agents/`、`.codex/hooks/story_codex_hook.py`、`.codex/hooks/run-story-hook.sh`、`.codex/hooks/run-story-hook.cmd`
- 各目标 CLI 的 `story-setup/references/agent-references/`
- `.story-deployed`

### 用户与 story-setup 共同维护，只合并管理块

- `CLAUDE.md` / `AGENTS.md`
- `.claude/settings.local.json`
- `.codex/hooks.json`
- `opencode.json`
- `.git/hooks/pre-commit`

### 用户状态，不覆盖

- `{书名}/正文/`、`正文.md`
- `{书名}/设定/`、`大纲/`、`追踪/`
- `.active-book`

## v18 当前契约

- 写作与导入只接受当前拆文产物：`剧情/情绪模块.md` 与 `剧情/节奏.md` 缺失时 fail-fast，并给出重跑 Stage 3+ / 重新导入的修复动作。
- 长篇正文只消费完整章节蓝图；缺少阶段位置、结构公式、禁止提前释放、内容概括、情节安排、人物关系、情节细化或结尾设定时，先补齐细纲再写。
- 每个 agent adapter 只读取本目标的 canonical reference 路径：Claude `.claude/skills/`、OpenCode `skills/`、Codex `.codex/skills/`。
- `_progress.md` 恢复只接受 `schema_version: 2` 与章节边界表，不再执行隐式历史迁移。
- Codex hooks 升级使用稳定管理身份替换注册；会先移除旧直调 Python 命令与已有 launcher 命令，再写入当前 6 个注册，不会双重执行。
- 定制 hook 如果调用了已删除的 `discover_book_dir()`，请改为 `discover_active_book()`。当前版不再保留该兼容别名。

## 升级步骤

1. 在项目根目录重新运行 story-setup。
2. 确认 `.story-deployed` 写入 `agents_version: 18` 与 `setup_skill_version: 1.2.7`。
3. 确认目标 CLI 的 agents、hooks/rules 和 reference bundle 都通过安装验证。
4. 新开会话，使 custom agents 与 hooks 按当前文件重新注册。
5. 若已有拆文库或细纲不满足当前契约，先重新拆解/导入或补齐细纲，再继续写作。
