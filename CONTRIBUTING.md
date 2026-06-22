# 贡献指南

感谢你对网文写作 skill 包的关注，欢迎贡献。

## 仓库结构

```
skills/
├── story/                   # 工具箱路由
├── story-setup/             # 环境部署
├── story-import/            # 逆向导入
├── story-long-write/        # 长篇写作
├── story-long-analyze/      # 长篇拆文
├── story-long-scan/         # 长篇扫榜
├── story-short-write/       # 短篇写作
├── story-short-analyze/     # 短篇拆文
├── story-short-scan/        # 短篇扫榜
├── story-deslop/            # 去AI味
├── story-review/            # 多视角审查
├── story-cover/             # 封面生成
└── browser-cdp/             # 浏览器操控
scripts/
├── static-check.sh                    # frontmatter + 引用路径 + 死文件 + 交叉引用
├── check-hook-regex-sync.sh           # hook 伏笔状态检测行为
├── check-shared-files.sh              # 跨 skill 同名副本一致性
└── check-story-setup-deployment.sh    # story-setup 部署完整性
```

每个 skill 由一个 `SKILL.md`（入口）和 `references/` 目录（知识库）组成。

## Skill 格式

`SKILL.md` 开头必须有 frontmatter：

```yaml
---
name: skill-name
description: |
  一句话描述。
  触发方式：/skill-name、触发词1、触发词2
---
```

`references/` 中的文件由 skill 按需加载，不会全部塞进上下文。

## 如何贡献

### 改进现有 skill

1. Fork 仓库
2. 从 `main` 创建分支：`git checkout -b feat/your-feature main`
3. 修改对应的 `SKILL.md` 或 `references/` 文件
4. 提交 PR，说明改了什么、为什么改

### 新增 skill

1. 在 `skills/` 下创建目录，包含 `SKILL.md` 和 `references/`
2. 确保在仓库根目录运行 `npx skills validate` 无报错
3. 提交 PR

## CI 检查

PR 自动运行 `.github/workflows/cross-platform.yml`。static-check job 跑以下检查（全部强制）：

- `scripts/static-check.sh` — frontmatter、引用路径、死文件、references 交叉引用
- `scripts/check-hook-regex-sync.sh` — hook 伏笔状态检测行为
- `scripts/check-shared-files.sh` — 跨 skill 同名副本字节一致性
- `scripts/check-story-setup-deployment.sh` — story-setup 部署完整性
- 采集脚本 `node --check` 语法校验

另有 windows / macos job 验证 cdp-utils 加载与 setup 脚本 dry-run。

提交前建议本地全部跑一遍：

```bash
bash scripts/static-check.sh
bash scripts/check-hook-regex-sync.sh
bash scripts/check-shared-files.sh
bash scripts/check-story-setup-deployment.sh
```

## 共享文件规范

部分文件跨 skill 共享（如 banned-words.md、anti-ai-writing.md），修改时必须同步所有副本。
运行 `bash scripts/check-shared-files.sh` 检查一致性。

### 知识库贡献

最有价值的贡献类型：

- **实战数据**：各平台最新榜单分析、题材趋势变化
- **新题材框架**：新的题材写作公式、结构模板
- **去AI味规则**：新的 AI 痕迹模式、改写范例
- **平台规则更新**：投稿要求、推荐机制的变化

## 质量要求

- **操作性**：内容必须能让 AI agent 直接执行，不要写教程
- **简洁**：用表格和模板，不要长篇叙述
- **无冗余**：不同 skill 的 `references/` 之间可以共享文件（通过路径引用），但同一 skill 内不要重复
- **中文**：所有内容用中文

## 提交流程

```
fork → branch → commit → PR → review → merge
```

- 一个 PR 聚焦一个改动
- commit message 用中文，格式：`类型: 简短描述`
- 类型：`feat`（新增）/ `fix`（修复）/ `docs`（文档）/ `refactor`（重构）

## OpenCode 模板同步

本项目同时支持 Claude Code 和 OpenCode 两个 CLI。OpenCode 的 agent 模板和项目指令模板由 `scripts/sync-opencode.py` 从 Claude Code 模板自动生成。

### 何时需要同步

当你修改了以下文件后，需要运行同步脚本：

- `skills/story-setup/references/templates/agents/*.md`（agent 定义）
- `skills/story-setup/references/templates/CLAUDE.md.tmpl`（项目指令模板）

### 同步步骤

```bash
python scripts/sync-opencode.py
```

脚本会：
1. 将 `templates/agents/` 下的 Claude Code agent 转换为 opencode 格式，写入 `opencode/agents/`
2. 将 `CLAUDE.md.tmpl` 复制到 `opencode/AGENTS.md.tmpl`，替换 `.claude/` 路径引用
3. 输出同步结果摘要

### CI 检测

PR 中如果修改了 Claude Code 模板文件，CI 会自动检测 opencode 模板是否同步。如果 CI 报错，请在本地运行同步脚本并提交结果。

### 手动维护的部分

以下文件无法自动生成，需要手动维护：

- `skills/story-setup/references/opencode/plugin.ts` — hooks 逻辑
- `skills/story-setup/references/opencode/commands/` — slash commands
- `skills/story-setup/references/opencode/opencode.json.patch` — 配置片段

### sync-opencode.py 已知局限

运行同步脚本后需进行以下手动检查：

- **路径解析段**：已由 `fix_path_rules_section()` 自动处理，无需手动修复
- **agent 数量**：确认 `opencode/agents/` 下始终为 7 个文件

### OpenCode 关键兼容性问题

**Glob 不搜索隐藏目录**：opencode 的 Glob 工具不搜索 `.opencode/` 目录，这导致了以下设计决策：

- **agent-references** 部署到 `skills/story-setup/references/agent-references/`（非隐藏），而非 `.opencode/skills/`
- **agent 文件** 双份部署：`.opencode/agents/`（opencode 系统使用）+ `agents/`（Glob 可见副本）
- **subagent 检测**：所有 spawn agent 的 skill（story-review、story-long-write、story-deslop、story-import、story-long-analyze、story-short-write）需同时检查 `.claude/agents/` 和 `.opencode/agents/` 两个目录（`.claude/agents/` 优先，不存在时 fallback 到 `.opencode/agents/`）

**插件输出不可见**：opencode 插件的 `output.extra.system` 已移除（真实 API 中不存在此字段）。系统提示注入改用 `experimental.session.compacting` 的 `output.context` 传递写作上下文。

**session-start 系统提示注入不支持**：OpenCode 公开 Plugin API 中无 `chat.message` 或等效 hook，部署状态检测和写作进度无法在会话开始时注入模型上下文。用户可手动运行 `/story-setup` 查看状态。

### OpenCode 使用注意事项

- **首次部署后需要重启 opencode**：story-setup 部署的 `.opencode/commands/` 下的 slash command 在 opencode 重启后才会生效。退出 opencode 后执行 `opencode -c` 重新进入即可。
- **首次部署使用自然语言触发**：新项目中没有 slash command，需要用自然语言触发 story-setup（如「请使用 story-setup skill，帮我部署网文写作环境」）。
- **opencode 配置不热加载**：修改 `opencode.json`、agent 文件或 plugin 后均需重启 opencode。
