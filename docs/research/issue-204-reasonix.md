# Issue #204：Reasonix 支持成本评估

> 调研日期：2026-07-11；核验版本：Reasonix CLI `v1.17.10`（`698e39a`）。

## 结论

**支持成本不高，但应分层交付。**

- **Skills 可用：几乎零成本。** Reasonix 已原生扫描 `.agents/skills`；用 `v1.17.10` 的 `reasonix doctor capabilities --json` 实测，本仓库 13 个 Skills 全部识别，且无诊断问题。
- **一键安装 + 项目规则 + 基础 Hooks：低到中等成本。** 主要是补原生 manifest、`story-setup` 的 Reasonix target 和 Hook 输入/退出码适配。
- **7 个专业 Agent + 并行行为完全对齐：中等成本。** Reasonix 不读取 `.claude/agents/*.md`，需转成 Skill/subagent，并改写现有工作流的调用与降级检测。

建议先交付前两层即可关闭 Issue #204；多 Agent 作为后续增强，不阻塞主写作流程。
上述零成本发现依赖 Git 正确保留 `.agents/skills` symlink；Windows 未启用 symlink 时应走原生 plugin 或 `story-setup` 实体复制。

## 产品定位

Reasonix 1.x 是 MIT 许可的 Go CLI/Desktop Agent，默认分支为 `main-v2`。其重点是保持 DeepSeek 请求前缀稳定以提高 prefix-cache 命中，并提供 planner/executor 双模型、上下文裁剪与压缩、Goal/Plan、Skills、Hooks、MCP 和子代理；发布包覆盖 macOS、Windows、Linux。这与 Issue 评论中“降低 token 成本”的诉求一致。

## 与 oh-story 相关的 Reasonix 规范

| 能力 | Reasonix `v1.17.10` | 对本项目的影响 |
|---|---|---|
| Skills | 扫描项目 `.reasonix/.agents/.agent/.claude/skills`；项目优先 | 现有 `.agents/skills -> ../skills` 已直接生效 |
| Instructions | 加载 `REASONIX.md`、`AGENTS.md`、`CLAUDE.md` 及 local 变体 | 可直接复用项目根 `AGENTS.md` |
| Plugin | 根 `reasonix-plugin.json`；支持 Git/local 安装 | 现仓库缺该文件，`reasonix plugin install` 会失败 |
| Commands | 项目 `.reasonix/commands/*.md` | 非必需；Skill 本身已可用 `/story-*` 调用 |
| Hooks | 项目 `.reasonix/settings.json`，需显式 trust | 不能直接使用现有 `.claude/settings.local.json` |
| Hook 事件 | `SessionStart/End`、`Pre/PostToolUse`、`PreCompact`、`Stop` 等 | 覆盖大部分生命周期；没有 `PostCompact` |
| 子代理 | `runAs: subagent` Skill、`task`、`parallel_tasks`；默认深度 2 | 能实现专业角色，但不是 Claude agent 文件格式 |

### Hook 差异

Reasonix 的工具 payload 是 `toolName` + `toolArgs`；阻断 `PreToolUse` 要 **exit 2**。现有 Claude Hook 读取 `tool_input`，ZCode Node runner 也未读取 `toolArgs`，因此都不能原样复用。

最小适配应：

1. 将 `toolArgs` 归一为现有 runner 的输入；匹配 Reasonix 工具名 `bash/read_file/write_file/edit_file/multi_edit`。
2. 大纲守卫发现问题时写 stderr 并 exit 2。
3. `SessionStart` 用 stdout 注入上下文；`PreCompact` 用 stdout 追加摘要指导。
4. `PostToolUse` 的 stdout 不会注入模型，只能作为 warning 或留到下一生命周期处理。
5. 项目安装后提示运行 `/hooks trust` 并新开会话。

## 推荐实现

### Phase 1：原生安装与 Skills（低成本）

新增根 `reasonix-plugin.json`：

```json
{
  "name": "oh-story",
  "version": "<release>",
  "description": "网络小说创作工具箱",
  "skills": "skills"
}
```

实测给当前仓库临时补上该 manifest 后，`reasonix plugin install <dir> --dry-run` 正确识别 `skillCount: 13`。同时补 README 安装说明和一条 `reasonix doctor capabilities` 校验即可。

不要依赖现有 `.claude-plugin/marketplace.json`：Reasonix `v1.17.10` 不支持多插件 marketplace index，也不读取本仓库这种只有 marketplace、没有 `.claude-plugin/plugin.json` 的布局。

### Phase 2：`story-setup target_cli=reasonix`（低到中等成本）

部署：

```text
.reasonix/skills/                  # 13 Skills
.reasonix/settings.json            # Hooks，安全合并
.reasonix/hooks/story_reasonix_hook.js
AGENTS.md                           # marker/section 合并
.story-deployed                     # target_cli: reasonix
```

Hook 逻辑可复用 ZCode runner 的文件识别与正文质量网，但需按上节改输入、阻断和输出契约。若继续使用 Node，安装报告必须明确 Node 依赖；否则要另做跨平台 runner。

### Phase 3：专业 Agent（可选，中等成本）

将 7 个 `.claude/agents/*.md` 生成 Reasonix Role Skills：

- frontmatter 使用 `runAs: subagent`、`allowed-tools`、`read-only`；
- 工具名映射为 Reasonix 的 `read_file/glob/grep/write_file/edit_file/bash`；
- 不复制 `opus/sonnet/haiku` 名称，模型由用户的 `[agent].subagent_models` 配置；
- 参考资料路径增加 `.reasonix/skills/story-setup/references/agent-references/`；
- 工作流增加 `.reasonix` 检测与 `run_skill` 调用，失败时继续 solo fallback。

`run_skill` 本身按保守策略串行。若必须保留 `story-review full` 的并行语义，还需基于只读 `parallel_tasks` 或后台 `task` 单独设计调度、结果汇总和失败回退；这是完整适配的主要成本。

## 成本估算

按一名熟悉本仓库的维护者估算：

| 范围 | 预计成本 | 风险 |
|---|---:|---|
| 文档 + 原生 manifest + Skills 校验 | 0.5–1 人日 | 低 |
| 加 `story-setup`、AGENTS、基础 Hooks 与测试 | 再 1–2 人日 | 中低 |
| 7 Agent 转换、工作流调用、并行/降级、三平台回归 | 再 2–4 人日 | 中 |

因此，**主功能正式支持约 1.5–3 人日；完整 Agent parity 约 4–7 人日**。前者性价比高，后者应按真实用户需求再做。

## 验证与边界

已验证：

- 从 tag `v1.17.10` 构建 Reasonix CLI；在本 worktree 运行 capability doctor，识别 13/13 Skills、0 issues。
- 当前 GitHub 仓库直接 `reasonix plugin install ... --dry-run` 失败，原因确为缺少受支持 manifest。
- 临时添加最小 `reasonix-plugin.json` 后 dry-run 成功并报告 `skillCount: 13`。

未验证：真实 DeepSeek API 会话、Windows/Linux Hook 运行、7 Agent 端到端并行。因此成本估算对 Skills/安装置信度高，对完整并行 parity 为中等置信度。

## 来源

- [Issue #204](https://github.com/worldwonderer/oh-story-claudecode/issues/204)
- [DeepSeek-Reasonix](https://github.com/esengine/DeepSeek-Reasonix) · [v1.17.10](https://github.com/esengine/DeepSeek-Reasonix/releases/tag/v1.17.10)
- Reasonix 源码/文档：`internal/skill/skill.go`、`internal/config/paths.go`、`docs/PLUGIN_PACKAGES.md`、`docs/DESKTOP_HOOKS.zh-CN.md`、`docs/GUIDE.zh-CN.md`
