# scripts/ —— 仓库开发脚本索引

这些是开发本仓库（skill 套件本体）用的**守卫 / 测试 / 代码生成**脚本，**不是** skill 运行时脚本（运行时脚本在各 skill 自己的 `scripts/` 下，如 `story-deslop/scripts/check-ai-patterns.js`，跨 skill 字节同步）。

- 绝大多数由 CI 自动跑（`.github/workflows/cross-platform.yml`）。提交前本地一把梭的完整命令见 [CONTRIBUTING.md](../CONTRIBUTING.md)「CI 检查」。
- **改名 / 移动任一脚本**，要同步改 `.github/workflows/*.yml`、`CONTRIBUTING.md`、本文件，以及调用它的兄弟脚本（见下方「何时跑」里的调用关系）。

## 静态守卫（check-*）

| 脚本 | 检查什么 | 何时跑 |
|---|---|---|
| `static-check.sh` | Skill 结构、frontmatter、引用路径、死文件、references 交叉引用（结构总闸） | CI |
| `check-shared-files.sh` | 跨 skill 同名 reference/脚本副本字节一致 | CI |
| `check-story-setup-deployment.sh` | story-setup 部署/运行时回归（慢，>2min） | CI |
| `check-hook-regex-sync.sh` | `detect-story-gaps.sh` 伏笔状态检测行为 | CI |
| `check-hook-locale-safety.sh` | 部署 hook 在 Windows 中文 GBK 区域的字节安全 | CI |
| `check-python-invocation.sh` | 技能文档禁止裸调 `python3`（须 python3→python→py 探测） | CI |
| `check-claude-adapter.sh` | Claude marketplace 与 13 个 skill 的一一映射；可选真实 CLI strict validate | CI（静态）；`CLAUDE_REAL_CHECK=1`（真实 CLI） |
| `check-opencode-adapter.sh` | OpenCode 适配层同步 + commands/agents/plugin/config 锚点 | CI + sync CI（调 sync-opencode.py） |
| `check-openclaw-skills.sh` | OpenClaw AgentSkills/frontmatter 兼容性 | CI |
| `check-codex-adapter.sh` | Codex 适配层：repo skills symlink、agent TOML、hooks 锚点 | CI（调 generate-codex-agents.py 验生成确定性） |
| `check-zcode-adapter.sh` | ZCode plugin/marketplace、Skills/Commands/Hooks 与部署锚点 | CI |

## 测试回归（test-*）

| 脚本 | 测什么 | 何时跑 |
|---|---|---|
| `test-ai-patterns.sh` | 确定性 AI 句式检测器 `check-ai-patterns.js` 回归 | CI |
| `test-degeneration.sh` | 模型退化检测器 `check-degeneration.js` 回归 | CI |
| `test-prose-net-parity.sh` | 正文兜底「轻量确定性网」Claude/OpenCode/Codex/ZCode parity | CI（调 check-hook-regex-sync） |
| `test-prose-backstop-hook.sh` | `check-prose-after-write.sh` 回归 | CI |
| `test-story-continuity.sh` | `detect-story-gaps.sh` 跨批连续性兜底回归 | CI |
| `test-codex-hooks.sh` | Codex hook 合成 stdin/stdout 契约 | CI |
| `test-codex-cli-e2e.sh` | 隔离 HOME 后用真实 Codex CLI 检查 repo 13 个 skill 的发现结果 | CLI compatibility CI；需已安装 `codex` |
| `test-zcode-hooks.sh` | ZCode 严格 JSON Hook、正文守卫与连续性回归 | CI |
| `test-charcount-portable.sh` | 跨平台字符统计命令在三平台 + Windows 的正确性 | CI（调 check-python-invocation） |
| `test-hook-encoding-portable.sh` | 部署 hook 在 Windows 中文系统的编码健壮性 | CI |
| `test-opencode-cli-e2e.sh` | 真实 OpenCode CLI 加载 smoke（repo skills 发现 / 13 commands / 7 agents / plugin） | CLI compatibility CI；需已安装 `opencode` |

## 代码生成 / 同步

| 脚本 | 干什么 | 何时跑 |
|---|---|---|
| `sync-opencode.py` | 从 Claude agent 模板 + `CLAUDE.md.tmpl` 生成 `opencode/agents/` 与 `AGENTS.md.tmpl`；`--check` 只读验同步 | 改 agent 模板后手动跑；sync CI + 被 check-opencode-adapter 调 |
| `generate-codex-agents.py` | 从 Claude agent 模板生成 Codex `.toml` agents | 改 agent 模板后手动跑；被 check-codex-adapter 调验确定性 |

> 改了 `skills/story-setup/references/templates/agents/*.md` 或 `CLAUDE.md.tmpl`，必须重跑这两个生成脚本并提交结果，否则适配层 CI 红。详见 [CONTRIBUTING.md](../CONTRIBUTING.md)「OpenCode 模板同步」「Codex 适配维护」。
