# Issue #211：ZCode 支持调研与实现

> 调研日期：2026-07-11；基线：`origin/main@2e9cbac`；核验版本：ZCode 3.3.4。

## 结论

Issue #211 可用原生 ZCode 扩展面实现，采用两条入口：

1. 仓库级 plugin：`.zcode-plugin/plugin.json` + 根 `marketplace.json`，暴露 13 个 Skills、13 个 Commands 和 Hooks。
2. 项目级部署：`story-setup target_cli=zcode` 写入 `.zcode/skills`、`.zcode/commands`、`.zcode/hooks`，合并 `.zcode/config.json` 与根 `AGENTS.md`。

不照搬 `.claude/`，原因是 ZCode 3.3.4 有三项边界：

- 不执行项目级或 plugin custom agents；相关流程必须降级 solo/direct。
- 只支持 7 个 Hook 事件；非空 stdout 必须是严格 JSON。
- 没有 `.zcode/rules`、`PreCompact`、`PostCompact`、`SessionEnd`。

## 产品特性

ZCode 是智谱的 Agentic Development Environment。3.3.4 提供 Goal 长任务模式、内置子智能体与后台任务、Skills/Commands/Hooks/Plugin/MCP 扩展、Remote Control/Bot Channel，以及 macOS、Windows、Linux 客户端。本适配只依赖稳定的 Skills、Commands、Hooks、Plugin 与 workspace instructions，不依赖后台子任务。

## 与本 Issue 相关的 ZCode 规范

### 配置与发现

| 能力 | Workspace 路径/行为 |
|---|---|
| 主配置 | `.zcode/config.json` 或根 `zcode.json` |
| Instructions | 根 `AGENTS.md`；不依赖 `CLAUDE.md`、嵌套 `AGENTS.md` 或 include |
| Skills | `.zcode/skills/<name>/SKILL.md`；用 `$name` 或 `/` 面板调用 |
| Commands | `.zcode/commands/*.md`；文件名需匹配 `^[a-z0-9][a-z0-9_:-]{0,63}$` |
| Plugin | 优先读取 `.zcode-plugin/plugin.json` |
| 自定义 Agent | 3.3.4 仅稳定加载用户级 `~/.zcode/agents/*.md`；项目/plugin agent 不执行 |

Skill frontmatter 至少包含 `name`、`description`，description 不超过 1024 字符。Command 支持 `description`、`argument-hint`、`allowed-tools`、`model`、`skills`、`disable-noninteractive`，正文可用 `$ARGUMENTS`。

### Hooks

支持事件：

- `SessionStart`
- `UserPromptSubmit`
- `PreToolUse`
- `PermissionRequest`
- `PostToolUse`
- `PostToolUseFailure`
- `Stop`

Workspace Hooks 位于 `.zcode/config.json` 的 `hooks.events`，且需 `hooks.enabled: true`；plugin Hooks 使用 `{ "hooks": { "Event": [...] } }`。优先使用跨平台 `process` Hook：

```json
{
  "type": "process",
  "command": "node",
  "args": ["${ZCODE_PROJECT_DIR}/.zcode/hooks/story_zcode_hook.js", "session-start"],
  "timeoutMs": 15000
}
```

输出规则：

- 无发现：stdout 为空、exit 0。
- 有上下文：输出最小 `hookSpecificOutput` JSON。
- `PreToolUse` 阻断：`permissionDecision: "deny"` + 原因。
- 诊断写 stderr；异常 fail-open，避免破坏工具调用。

## Issue #211 的实现

### 文件布局

```text
.zcode-plugin/plugin.json
marketplace.json
skills/story-setup/references/zcode/
├── AGENTS.md.tmpl
├── config.json.patch
├── commands/                 # 13 个 wrapper
└── hooks/
    ├── hooks.json
    └── story_zcode_hook.js
```

`story-setup` 的 ZCode 部署规则：

- 只替换 13 个已知 Skill/Command 名称，保留用户自定义资源。
- `.zcode/config.json` 按事件、matcher、process args 去重合并，保留未知字段。
- `AGENTS.md` 按管理块/section 合并。
- 不创建 `.zcode/agents`、`.zcode/rules`，不写用户 home。
- `.story-deployed` 记录 `target_cli: zcode`、`setup_skill_version: 1.2.7` 和 ZCode reference 路径。

### Hook 行为

| 行为 | ZCode 映射 |
|---|---|
| 会话上下文与连续性提醒 | `SessionStart`：恢复活跃书目，检查追踪 staleness、重复章名 |
| 写正文前大纲守卫 | `PreToolUse Bash|Write|Edit` |
| commit advisory | `PreToolUse Bash`，runner 内确认真实 `git commit` |
| 正文质量网 | `PostToolUse Bash|Write|Edit`：落盘、截断、占位符、工程词、复读、字数欠账、重复标题 |
| compact 后恢复 | `SessionStart` matcher `compact` |
| compact 前保存 / session end | 无等价事件，保留为 Skill/AGENTS 软约束 |

Runner 使用 ZCode 自带环境可用的 Node，无第三方依赖、无联网副作用。正文轻量确定性网与 Claude/OpenCode/Codex 由 parity 测试锁定。

### Agent 降级

以下 Skills 在 ZCode 下不尝试项目 custom agent，直接执行同等规则并报告：

```text
Fallback: project custom agents unavailable -> solo
```

涉及：`story-long-write`、`story-short-write`、`story-long-analyze`、`story-import`、`story-deslop`、`story-review`。

## 验证

自动化检查：

```bash
bash scripts/check-zcode-adapter.sh
bash scripts/test-zcode-hooks.sh
bash scripts/test-prose-net-parity.sh
bash scripts/check-story-setup-deployment.sh
```

覆盖 plugin/marketplace schema、13 Skills/Commands、受支持事件、严格 JSON、UTF-8、Bash/Write/Edit 路径识别、大纲 deny/allow、commit advisory、连续性、malformed input fail-open 和四端正文网 parity。CI 在 Ubuntu、Windows、macOS 运行 ZCode Hook 测试。

## 已知边界

- 规范以 3.3.4 为准；未来若正式支持 project/plugin agents，应单独升级，不在当前 manifest 中预声明无效组件。
- workspace Skills 优先于 plugin；plugin 更新不会自动覆盖项目快照，需重跑 `$story-setup`。
- Hook 依赖 PATH 中的 `node`。
- 未宣称支持 ZCode 当前没有的 compact 前保存或 session-end 生命周期。

## 来源

官方：

- [ZCode 文档](https://zcode.z.ai/cn/docs/welcome)
- [Agent / 子智能体](https://zcode.z.ai/cn/docs/agents) · [Subagents](https://zcode.z.ai/cn/docs/subagents)
- [Skill](https://zcode.z.ai/cn/docs/skill) · [Command](https://zcode.z.ai/cn/docs/commands) · [Plugin](https://zcode.z.ai/cn/docs/plugin)
- [更新日志](https://zcode.z.ai/cn/changelog)
- ZCode 3.3.4 官方发行包内置诊断 Skills：`zcode-configuration-guide`、`diagnosing-hooks`、`diagnosing-plugins`、`diagnosing-skills`、`diagnosing-commands`

Issue 与参考实现：

- [Issue #211](https://github.com/worldwonderer/oh-story-claudecode/issues/211)
- [Issue 评论中的临时实现](https://github.com/worldwonderer/oh-story-claudecode/issues/211#issuecomment-4942083674)
- [`GlotTale/novelist@8eb2593`](https://github.com/GlotTale/novelist/tree/8eb25938ff1ffba0ba1f1dd9b17587dc1e13ec80)

第三方实现只用于目录布局参考；其 Claude shell Hooks、Rules 和生命周期假设不作为 ZCode 运行时规范。
