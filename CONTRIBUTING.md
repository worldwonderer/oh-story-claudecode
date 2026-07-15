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
scripts/                       # 开发守卫 / 测试 / 代码生成（20 个脚本的完整索引见 scripts/README.md）
```

每个 skill 由一个 `SKILL.md`（入口）和 `references/` 目录（知识库）组成。

## Skill 格式

`SKILL.md` 开头必须有 frontmatter：

```yaml
---
name: skill-name
description: "一句话描述。触发方式：/skill-name、触发词1、触发词2"
metadata: {"openclaw":{"source":"https://github.com/worldwonderer/oh-story-claudecode"}}
---
```

为兼容 OpenClaw，frontmatter 必须保持单行键值：`description` 不使用 `|`/`>` 块，`metadata` 必须是单行 JSON 对象。更长的触发说明放到正文中。

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
- `scripts/check-claude-adapter.sh` — Claude marketplace 与 skill 映射检查
- `scripts/check-opencode-adapter.sh` — OpenCode adapter 同步、commands/agents/plugin/config 锚点检查
- `scripts/check-openclaw-skills.sh` — OpenClaw 单行 frontmatter、`metadata.openclaw` 与可选真实 CLI 发现检查
- `scripts/check-codex-adapter.sh` — Codex repo skills symlink、custom-agent TOML（schema + 生成确定性）与 hooks 锚点检查
- `scripts/test-codex-hooks.sh` — Codex hooks 合成事件测试
- `scripts/check-zcode-adapter.sh` — ZCode plugin/marketplace、13 Skills/Commands、受支持 Hook 事件与部署锚点检查
- `scripts/test-zcode-hooks.sh` — ZCode 严格 JSON Hook 契约、正文守卫、连续性与跨平台 Node runner 测试
- 采集脚本 `node --check` 语法校验

以上为代表性列举；**强制清单按 `.github/workflows/cross-platform.yml` 为准**，每个脚本的用途与触发时机见 [scripts/README.md](scripts/README.md)。另有 `.github/workflows/cli-compat.yml` 在相关 PR、每周定时和手动触发时安装官方当前版本，真实运行 Claude Code、Codex、OpenCode、OpenClaw 的无鉴权 smoke。

另有 windows / macos job 验证 cdp-utils 加载与 setup 脚本 dry-run。

提交前建议按 Linux CI 的强制清单本地跑一遍：

```bash
bash scripts/static-check.sh
bash scripts/check-hook-regex-sync.sh
bash scripts/check-shared-files.sh
bash scripts/test-ai-patterns.sh
bash scripts/test-degeneration.sh
bash scripts/test-prose-backstop-hook.sh
bash scripts/test-prose-net-parity.sh
bash scripts/test-story-continuity.sh
bash scripts/check-story-setup-deployment.sh
bash scripts/check-claude-adapter.sh
bash scripts/check-codex-adapter.sh
bash scripts/check-opencode-adapter.sh
bash scripts/check-openclaw-skills.sh
bash scripts/test-codex-hooks.sh
bash scripts/check-python-invocation.sh
bash scripts/check-hook-locale-safety.sh
bash scripts/test-hook-encoding-portable.sh
bash scripts/test-charcount-portable.sh
bash scripts/test-charcount-portable.sh --stub

# 可选真实 CLI smoke（需分别安装对应 CLI）
CLAUDE_REAL_CHECK=1 bash scripts/check-claude-adapter.sh
bash scripts/test-codex-cli-e2e.sh
bash scripts/test-opencode-cli-e2e.sh
OPENCLAW_REAL_CHECK=1 bash scripts/check-openclaw-skills.sh
```

涉及 agent/skill/plugin/hook 协议的断言必须先核对对应项目官方文档，再以真实 CLI 输出复核；不要从其他 agent 的相似字段推断。

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

本项目同时支持 Claude Code、OpenCode、Codex、ZCode 和 OpenClaw。OpenCode 的 agent 模板和项目指令模板由 `scripts/sync-opencode.py` 从 Claude Code 模板自动生成。

### 何时需要同步

当你修改了以下文件后，需要运行同步脚本：

- `skills/story-setup/references/templates/agents/*.md`（agent 定义）
- `skills/story-setup/references/templates/CLAUDE.md.tmpl`（项目指令模板）

### 同步步骤

```bash
python3 scripts/sync-opencode.py
python3 scripts/sync-opencode.py --check  # 可选：只校验，不改文件
bash scripts/check-opencode-adapter.sh
bash scripts/test-opencode-cli-e2e.sh  # 可选：需要本机已安装 opencode
```

脚本会：
1. 将 `templates/agents/` 下的 Claude Code agent 转换为 opencode 格式，写入 `opencode/agents/`
2. 将 `CLAUDE.md.tmpl` 复制到 `opencode/AGENTS.md.tmpl`，替换 `.claude/` 路径引用
3. 输出同步结果摘要
4. 可选真实 CLI smoke 会在临时项目里验证 13 个 slash commands、7 个 agents 与 `story-hooks.ts` 插件能被 OpenCode 解析加载

### CI 检测

PR 中如果修改了 Claude Code 模板文件，CI 会自动检测 opencode 模板是否同步，并额外检查 `opencode.json.patch`、`plugin.ts`、13 个 command 与 7 个 agent 的结构锚点。如果 CI 报错，请在本地运行同步脚本和 `bash scripts/check-opencode-adapter.sh`，再提交结果。

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
- **subagent 检测**：所有 spawn agent 的 skill（story-review、story-long-write、story-deslop、story-import、story-long-analyze、story-short-write）需按 `.claude/agents/` → `.opencode/agents/` → `.codex/agents/` 顺序检查；ZCode 3.3.4 与 OpenClaw Phase 1 不部署项目 agents，走 solo/direct fallback。

**插件输出不可见**：opencode 插件的 `output.extra.system` 已移除（真实 API 中不存在此字段）。系统提示注入改用 `experimental.session.compacting` 的 `output.context` 传递写作上下文。

**session-start 系统提示注入不支持**：OpenCode 公开 Plugin API 中无 `chat.message` 或等效 hook，部署状态检测和写作进度无法在会话开始时注入模型上下文。用户可手动运行 `/story-setup` 查看状态。

**其它 hook 差异**：`detect-gaps`（缺口检测）插件未移植，会话开始不注入提示（仅保留 compact 摘要与写正文前的大纲守卫）；`session-end` opencode 无等价事件、暂不支持；`validate-commit` 改用 git 原生 `pre-commit` hook（适用于所有 CLI）。

### OpenCode 使用注意事项

- **首次部署后需要重启 opencode**：story-setup 部署的 `.opencode/commands/` 下的 slash command 在 opencode 重启后才会生效。退出 opencode 后执行 `opencode -c` 重新进入即可。
- **首次部署使用自然语言触发**：新项目中没有 slash command，需要用自然语言触发 story-setup（如「请使用 story-setup skill，帮我部署网文写作环境」）。
- **opencode 配置不热加载**：修改 `opencode.json`、agent 文件或 plugin 后均需重启 opencode。
- **browser-cdp 长耗时操作可能卡死**：opencode 无后台任务机制，长耗时浏览器操作需用户按 `ESC` 打断（SKILL.md 已内置超时包装指引）。

## OpenClaw 适配维护

OpenClaw 当前采用 **Phase 1 skills-only** 适配：

- canonical source 仍是仓库根 `skills/`；不要为 OpenClaw 维护第二份 skill。
- 所有 `SKILL.md` frontmatter 必须符合 OpenClaw/AgentSkills 约束：单行 `name`、单行 `description`、单行 JSON `metadata`，且 `metadata.openclaw` 存在。
- `metadata.openclaw.requires.bins/env/config/anyBins` 用于 OpenClaw load-time gating；例如 `story-cover` 通过 `GPT_IMAGE_API_KEY` 控制可见性。
- `story-setup target_cli=openclaw` 只部署项目 `skills/` 与 `references/openclaw/AGENTS.md.tmpl`，不部署 OpenClaw agents/hooks/plugin。
- OpenClaw 会在 session 启动时 snapshot eligible skills；变更后需要新 session 或等待 skills watcher 刷新。

### OpenClaw 检查步骤

```bash
bash scripts/check-openclaw-skills.sh
OPENCLAW_REAL_CHECK=1 bash scripts/check-openclaw-skills.sh  # 本机安装 openclaw 时可选
```

`OPENCLAW_REAL_CHECK=1` 会用临时 profile + 临时 workspace 创建隔离 agent，确认 OpenClaw CLI 能从 workspace `skills/` 发现 13 个 story skill；脚本结束后清理临时 profile。

### OpenClaw 已知边界

- **agents 暂缓**：OpenClaw 的 agent/session 模型与 Claude/Codex 项目内 agent 文件不同，暂不生成 OpenClaw Gateway agents。涉及 agent 协作的 skill 必须降级 solo/direct。
- **hooks 暂缓**：写正文前大纲守卫、commit 提醒、session-start/compact 注入未迁移为 OpenClaw hook/plugin；OpenClaw 下只作为 skill 流程软约束。
- **package 暂缓**：OpenClaw 可识别 workspace/personal/managed skill roots；现阶段不发布 OpenClaw 原生 plugin package。

## ZCode 适配维护

ZCode 采用「原生 plugin + `story-setup` workspace 部署」双入口：

- `.zcode-plugin/plugin.json` 与根 `marketplace.json` 暴露同一组 13 Skills、13 Commands 和 ZCode Hooks；版本必须与 `skills/story/VERSION` 同步。
- `skills/story-setup/references/zcode/` 是 workspace 部署模板，包含 `AGENTS.md.tmpl`、Commands、`config.json.patch` 与无第三方依赖的 Node Hook runner。
- ZCode 3.3.4 只支持 `SessionStart`、`UserPromptSubmit`、`PreToolUse`、`PermissionRequest`、`PostToolUse`、`PostToolUseFailure`、`Stop`。不要复制 Claude 的 `PreCompact`、`PostCompact`、`SessionEnd`、`SubagentStop` 或 `Notification`。
- Hook stdout 为空表示放行；只要非空就必须满足严格 JSON schema。诊断只写 stderr，异常 fail-open；优先使用 `process` + `node`，不要引入 shell/Python launcher 的跨平台分支。
- 3.3.4 不执行项目级或 plugin custom agents，也不发现 `.zcode/rules`。不要生成 `.zcode/agents/` / `.zcode/rules/` 或默认写入用户 home；涉及专业 Agent 的 Skill 必须明确报告 solo/direct fallback。

### ZCode 检查步骤

```bash
bash scripts/check-zcode-adapter.sh
bash scripts/test-zcode-hooks.sh
bash scripts/test-prose-net-parity.sh
```

更新正文轻量确定性网时，必须同步 Claude、OpenCode、Codex、ZCode 四端，并让 parity 测试通过。

## Codex 适配维护

本项目同时支持 Codex CLI（repo skills 发现 + `$story-setup` 项目部署）：

- repo-local skills：`.agents/skills` 是指向 `skills/` 的相对 symlink（`../skills`，agentskills.io 标准路径），Codex 扫描它发现 skill，别复制第二份。必须是有效相对 symlink（`check-codex-adapter.sh` 守卫 target=`../skills`；无效/绝对会让发现失效，见 openai/codex#11314）；Windows 需 git `core.symlinks=true`。OpenClaw 原生扫 workspace `skills/`，不依赖它。
- project deployment hooks：`skills/story-setup/references/codex/hooks/hooks.json` 面向 `$story-setup` 部署到写作项目，`command`（POSIX sh）通过当前目录向上查找定位项目 `.codex/hooks/story_codex_hook.py`，不得要求项目必须是 Git 仓库；并把查到的根以 `CODEX_PROJECT_DIR=` 传给 Python（Codex 本身不注入该变量，root 解析以 Python 的 `__file__` 自定位为准）。
- Windows hooks：Codex 在 Windows 下用 `%COMSPEC% /C`（cmd.exe）跑 hook 命令，**不是** POSIX shell，所以每个 hook 必须带 `commandWindows`（cmd.exe 语法）。当前 `commandWindows` 为 `if exist .codex\hooks\story_codex_hook.py python ... <event>`：cwd 为项目根时运行、否则干净 no-op（best-effort，上溯查找仅 POSIX `command` 具备）。Python hook 本体跨平台、已做 UTF-8 字节 stdio 与 `__file__` 自定位。改 `command` 时必须同步改 `commandWindows`（`check-codex-adapter.sh` 守卫 event 一致 + cmd.exe 安全）。
- custom agents：`skills/story-setup/references/codex/agents/*.toml` 由 `scripts/generate-codex-agents.py` 从 `references/templates/agents/*.md` 生成。修改 Claude agent 模板后必须重新生成并提交。

### Codex 同步步骤

```bash
python3 scripts/generate-codex-agents.py
bash scripts/check-codex-adapter.sh
bash scripts/test-codex-hooks.sh
```

### Codex 关键兼容性问题

- **hooks 信任门槛**：Codex project `.codex/` 配置层需要被 trust，非 managed command hooks 还需要用户在 `/hooks` review/trust 后才会运行。
- **hook JSON 契约**：`PreToolUse`、`PreCompact`、`PostCompact` 的普通 stdout 会被忽略；需要输出 JSON，如 `hookSpecificOutput.permissionDecision = "deny"` 或 `hookSpecificOutput.additionalContext`。
- **PreToolUse 不完整拦截**：Codex 官方说明当前 shell/edit 拦截不是完备安全边界；story hooks 只作为写作流程 guardrail，不能替代版本控制和人工审查。
- **agent 文件格式**：Codex custom agents 是 `.codex/agents/{name}.toml`，必需 `name`、`description`、`developer_instructions`；只读 agent 使用 `sandbox_mode = "read-only"`。
- **custom-agent 运行时注册**：`$story-setup` 写入 `.codex/agents/*.toml` 后，需要 trust 项目 `.codex/` 配置层并新开 Codex 会话。若当前 Codex 运行时仍返回 `unknown agent_type`（本地 `codex exec 0.141.0` 临时项目烟测可复现），skill 必须降级 solo/direct 并报告 fallback；自动化硬门槛是 TOML schema 与文件部署检查。
