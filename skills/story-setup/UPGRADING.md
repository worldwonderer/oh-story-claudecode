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
- `.claude/hooks/` — 所有 hook 脚本
- `.claude/agents/` — 所有 agent 定义
- `.claude/rules/` — 所有 path-scoped 规则

### 需合并（不覆盖）

这些文件可能含用户自定义内容：
- `CLAUDE.md` — 按 section 合并，用户独有 section 保留
- `.claude/settings.local.json` — hooks 按 command 去重 append，其他配置保留
- `.codex/config.toml` — 仅首次创建模板，已有文件不覆盖

### 不碰

这些文件完全由用户管理：
- `{书名}/追踪/上下文.md` — 用户写作上下文
- `{书名}/追踪/伏笔.md` — 用户伏笔追踪
- `.active-book` — 用户活跃书目

## 版本检测

`.story-deployed` 文件记录部署版本：
- 无此文件 → 未部署，需全新安装
- `agents_version: 1` / `2` → 旧版，需重新部署以获取新 Agent 和 `.codex/config.toml`
- `agents_version: 3` → 当前版本

## 版本变更

### v3 (当前)

- 新增项目级 `.codex/config.toml` 模板部署（仅 Codex CLI 用户，不影响 Claude Code）
- 保持 `.codex/config.toml` 已有用户配置不被覆盖
- CLAUDE.md 模板新增「Skill 执行约束」section，规范 skill 执行流程纪律

### v2

- 4 个创作型 Agent（story-architect, character-designer, narrative-writer, consistency-checker）
- Agent 引用 skill references 写作理论
- Hook 脚本优化（减少 context 输出）
- 4 条 path-scoped 规则
