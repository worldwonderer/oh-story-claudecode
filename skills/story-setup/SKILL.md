---
name: story-setup
version: 1.2.5
description: "网文写作工具集基础设施部署。为 Claude Code / OpenCode / Codex / OpenClaw 提供内置适配；Web AI / 通用 Agent 可走 skills + AGENTS.md 文件模式。触发方式：/story-setup、$story-setup、「准备写书」「帮我搭一下环境」「配置写作项目」。"
metadata: {"openclaw":{"source":"https://github.com/worldwonderer/oh-story-claudecode"}}
---
# story-setup：网文写作工具集基础设施部署

你是写作基础设施部署器。将网文写作工具集部署到用户项目目录：已适配的 CLI 走专用 hooks/agents/config；NarraFork、Web AI、自定义 Agent 等环境走通用文件模式。

**执行铁律：不覆盖用户已有配置，合并而非替换。**

---

## Phase 1：检测项目状态

1. 检查当前目录是否已部署过（存在 `.story-deployed`）
   - 如果已存在 → 使用 AskUserQuestion 确认是否重新部署
2. 检查是否有书名目录（包含 `追踪/` 子目录的目录，或用户自定义结构）
   - 有 → 识别为长篇项目，显示当前项目信息
   - 无 → 识别为新项目或短篇项目
3. 检查 `.claude/settings.local.json` 是否存在
   - 存在 → 读取现有配置，后续合并
   - 不存在 → 后续创建新文件
4. 检查 `.active-book` 文件是否存在
   - 存在 → 显示当前活跃书目
   - 不存在 → 跳过
5. 检查 `opencode.json` 或 `.opencode/` 是否存在
   - 存在 → 识别为 opencode 项目，`target_cli = opencode`
   - 不存在 → 跳过
6. 检查 `.codex/`、`.codex/config.toml`、`.codex/agents/`、`.codex/hooks.json`、`AGENTS.md` 中的 Codex 段
   - 存在 → 识别为 Codex 项目，`target_cli = codex`
   - 不存在 → 跳过
7. 检查 `openclaw.json`、`.openclaw/`、`.agents/skills/`、`AGENTS.md` 中的 OpenClaw 段，或 `skills/*/SKILL.md` 中的 `metadata.openclaw`
   - 存在 → 识别为 OpenClaw 项目，`target_cli = openclaw`
   - 不存在 → 跳过
8. 如 `.claude/` 或 `CLAUDE.md`、opencode 标记、Codex 标记、OpenClaw 标记同时存在 → 使用 AskUserQuestion 让用户选择目标环境（选项：Claude Code / OpenCode / Codex / OpenClaw / 通用 Web AI 或其他 Agent / 任意组合）
9. 如四类内置 CLI 标记都不存在（全新项目或 Web AI 项目）→ 使用 AskUserQuestion 让用户选择目标环境
   - 用户选择 opencode → `target_cli = opencode`，部署时创建 `opencode.json` 和 `.opencode/`
   - 用户选择 claude-code → 按现有逻辑处理
   - 用户选择 codex → `target_cli = codex`，部署时创建 `.codex/`
   - 用户选择 openclaw → `target_cli = openclaw`，部署时复制 OpenClaw 兼容 skills 到项目 `skills/`
   - 用户选择通用 Web AI / 其他 Agent → `target_cli = generic`，部署通用 `AGENTS.md` 与项目本地 `skills/`；不写平台专属 hooks/agents
   - 用户选择多端 → `target_cli = claude-code,opencode,codex,openclaw,generic` 的子集（仅包含用户选择的端）

## Phase 2：部署基础设施

使用 AskUserQuestion 确认部署位置后，依次执行。

### 2.0 部署清单（机械可检查）

| Source path | Target path | Owner class | Merge mode | Validation check |
|-------------|-------------|-------------|------------|------------------|
| `skills/story-setup/references/templates/CLAUDE.md.tmpl` | `CLAUDE.md` | user+managed | marker/section merge | contains story skill routing sections |
| `skills/story-setup/references/templates/hooks/` | `.claude/hooks/` | story-setup managed | recursive replace | `session-*.sh`, `detect-story-gaps.sh`, `validate-story-commit.sh`, `guard-outline-before-prose.sh`, `check-prose-after-write.sh`, `lib/common.sh`, `lib/sentinel.sh` exist |
| `skills/story-setup/references/templates/rules/*.md` | `.claude/rules/*.md` | story-setup managed | replace | every rule contains `paths` frontmatter |
| `skills/story-setup/references/templates/agents/*.md` | `.claude/agents/*.md` | story-setup managed | replace | 7 agent files exist |
| `skills/story-setup/references/agent-references/*.md` | `.claude/skills/story-setup/references/agent-references/*.md` | story-setup managed | replace | every `story-setup/references/agent-references/*.md` reference resolves |
| `skills/story-setup/references/templates/settings-hooks.json` | `.claude/settings.local.json` | user+managed | merge by hook command | hook JSON valid and registered commands deduped |
| `skills/story-setup/references/templates/上下文.md.tmpl` | `{书名}/追踪/上下文.md` | user state | create only if absent | never overwrite existing writing context |
| generated sentinel | `.story-deployed` | story-setup managed | replace | contains `agents_version`, `setup_skill_version`, `target_cli`, `resolver_strategy`, `references_dir` |
| `skills/story-setup/references/opencode/AGENTS.md.tmpl` | `AGENTS.md` | user+managed | marker/section merge | contains story skill routing sections | target_cli 含 opencode |
| `skills/story-setup/references/opencode/agents/` | `.opencode/agents/` | story-setup managed | replace | 7 agent files exist（replace 前按 2.4.4 Step 0 缓存现有 `model:`，避免覆盖用户已配模型） | target_cli 含 opencode |
| `skills/story-setup/references/opencode/plugin.ts` | `.opencode/plugins/story-hooks.ts` | story-setup managed | replace | TypeScript plugin file exists | target_cli 含 opencode |
| `skills/story-setup/references/opencode/commands/` | `.opencode/commands/` | story-setup managed | replace | 13 command files exist | target_cli 含 opencode |
| `skills/story-setup/references/opencode/opencode.json.patch` | merge into `opencode.json` | user+managed | merge by plugin/permission key | plugin entry registered | target_cli 含 opencode |
| `skills/story-setup/references/agent-references/` | `skills/story-setup/references/agent-references/` | story-setup managed | replace | every reference resolves | target_cli 含 opencode |
| `skills/story-setup/references/opencode/pre-commit.sh` | `.git/hooks/pre-commit` | user+managed | append or create | file exists and is executable；含 marker 块则替换块内容，不含则检测 exit 0 位置智能插入 | target_cli 含 opencode |
| `skills/story-setup/references/codex/AGENTS.md.tmpl` | `AGENTS.md` | user+managed | marker/section merge | contains Codex story skill routing sections | target_cli 含 codex |
| `skills/story-setup/references/codex/agents/` | `.codex/agents/` | story-setup managed | replace | 7 TOML agent files parse and contain `name`/`description`/`developer_instructions` | target_cli 含 codex |
| `skills/story-setup/references/codex/hooks/hooks.json` | `.codex/hooks.json` | user+managed | merge by event+command | hook JSON valid; commands deduped | target_cli 含 codex |
| `skills/story-setup/references/codex/hooks/story_codex_hook.py` | `.codex/hooks/story_codex_hook.py` | story-setup managed | replace | Python syntax valid | target_cli 含 codex |
| `skills/story-setup/references/agent-references/` | `.codex/skills/story-setup/references/agent-references/` | story-setup managed | replace | every reference resolves | target_cli 含 codex |
| `skills/story-setup/references/openclaw/AGENTS.md.tmpl` | `AGENTS.md` | user+managed | marker/section merge | contains OpenClaw story skill routing sections | target_cli 含 openclaw |
| `skills/story-setup/references/generic/AGENTS.md.tmpl` | `AGENTS.md` | user+managed | marker/section merge | contains generic story skill routing sections | target_cli 含 generic |
| repository `skills/{browser-cdp,story*}/` | `skills/{browser-cdp,story*}/` | story-setup managed for known skill names | replace known skill dirs only | 13 `SKILL.md` files exist; OpenClaw-compatible frontmatter | target_cli 含 openclaw 或 generic |
| `skills/story-setup/references/agent-references/` | `skills/story-setup/references/agent-references/` | story-setup managed | replace via full skill copy | every reference resolves | target_cli 含 openclaw 或 generic |

### opencode.json 合并算法

部署 `opencode.json.patch` 时按以下规则合并：

1. 读取现有 `opencode.json`（如存在），解析 JSON
2. 合并 `plugin` 数组：将 `./.opencode/plugins/story-hooks.ts` 加入数组，去重
3. 保留用户已有的其他配置字段（`permission`、`model`、`provider` 等），不覆盖
4. 写入合并后的 `opencode.json`

### 2.1 部署 CLAUDE.md

- 读取 `skills/story-setup/references/templates/CLAUDE.md.tmpl`
- 替换占位符（见下方「模板占位符」段）
- 写入项目根目录 `CLAUDE.md`（如已存在，按「CLAUDE.md 合并策略」处理）

### 2.2 部署 Hooks

- **递归复制完整目录树**：将 `skills/story-setup/references/templates/hooks/` 复制到用户项目 `.claude/hooks/`
- 必须保留子目录 `lib/`，其中：
  - `lib/common.sh` 提供 `project_root`、`discover_active_book`、`discover_all_books`
  - `lib/sentinel.sh` 提供 `.story-deployed` 字段读取
- 只需对 `.claude/hooks/*.sh` 设置执行权限（`chmod +x`）；`lib/*.sh` 由 hook `source`，不要求可执行位

### 2.3 部署 Rules

- 读取 `skills/story-setup/references/templates/rules/` 下所有 `.md` 文件
- 复制到用户项目的 `.claude/rules/` 目录

### 2.4 部署 Agents

- 读取 `skills/story-setup/references/templates/agents/` 下所有 `.md` 文件
- 复制到用户项目的 `.claude/agents/` 目录
- Agent 文件属于 story-setup 管理文件，可安全覆盖；版本升级时按 `UPGRADING.md` 的版本检测结果重新部署
- **部署后必须新开会话**：Claude Code 只在会话启动时扫描 `.claude/agents/` 注册 subagent。当前会话内新部署的 agent 不会立即可用——必须让用户新开一个 Claude Code 会话，`story-architect`/`narrative-writer` 等 custom agent 才会注册成 `subagent_type`；否则 story-review、story-long-write 等想 spawn 时会拿到「subagent_type 不可用」并降级 solo（单视角）。这一步必须在安装报告里明确告知用户（见 Phase 3 第 6 步）。

### 2.4.1 Agent 兼容性处理

- Agent frontmatter 以 Claude Code 为主；OpenCode 由 `scripts/sync-opencode.py` 生成 `.opencode/agents/*.md`；Codex 由 `scripts/generate-codex-agents.py` 生成 `.codex/agents/*.toml`。
- **OpenClaw Phase 1 不部署 agents**：OpenClaw 只部署 skills，agent 协作相关 skill 必须按既有 fallback 规则降级 solo/direct，不要把 Claude/OpenCode agent frontmatter 直接复制成 OpenClaw agent。
- 部署到项目后，agent 内引用的参考资料必须走 `story-setup/references/agent-references/*.md` 这一本 skill 内复制路径；不要跨 skill 引用其他 skill 的 references。若全局安装路径不同，优先用项目内 `.claude/skills/` 或 `skills/` 作为规范路径前缀，其次用工具的 skill 搜索能力，不要假定固定绝对路径。

### 2.4.2 部署 Agent References

- 将 `skills/story-setup/references/agent-references/` 下所有 `.md` 复制到项目内 `.claude/skills/story-setup/references/agent-references/`
- 如目标项目已经使用项目本地 `skills/` 目录，也可以同步复制到 `skills/story-setup/references/agent-references/` 作为 fallback，但不得只复制 fallback 而遗漏 `.claude/skills/` 主路径
- 校验：凡 agent 或 reference 中出现 `story-setup/references/agent-references/<file>.md`，源包与目标包都必须存在 `<file>.md`

### 2.4.3 部署 Codex Agents（target_cli 含 codex 时）

- 读取 `skills/story-setup/references/codex/agents/` 下所有 `.toml` 文件，复制到用户项目 `.codex/agents/`
- Agent 文件属于 story-setup 管理文件，可安全覆盖；生成源由 `scripts/generate-codex-agents.py` 从 Claude agent 模板确定性生成
- 校验每个 TOML 都能解析，且包含 Codex 必需字段：`name`、`description`、`developer_instructions`
- 只读职责 agent（`chapter-extractor`、`consistency-checker`、`story-explorer`）必须保留 `sandbox_mode = "read-only"`
- **部署后必须 trust + 新开 Codex 会话**：Codex custom agents 位于 `.codex/agents/*.toml`，项目 `.codex/` 配置层需要被 trust；部署后需要新会话/刷新后才可能稳定暴露给 spawn。若运行时返回 `unknown agent_type`，调用方必须降级 solo/direct 并报告 fallback。
- 将 `skills/story-setup/references/agent-references/` 同步复制到 `.codex/skills/story-setup/references/agent-references/`，作为 Codex agent 的项目内参考资料主路径

### 2.4.4 配置 OpenCode Agent 模型

> 仅当 `target_cli` 含 `opencode` 时执行。OpenCode 子代理不指定模型时继承主模型，导致低成本 Agent 也消耗主模型额度。此步骤自动检测用户模型并写入 `model:` 字段。

#### Step 0：保留已有模型配置（必须在 `.opencode/agents/` 的 replace 之前执行）

OpenCode agents 部署是 `replace`，会覆盖上次写入的 `model:`。所以在执行该 replace **之前**先扫描现有 `.opencode/agents/*.md`，缓存每个 agent 的 `model:`（agent 名 → 模型 ID）。后续检测失败/超时、或用户跳过某一级时，用缓存值回填，避免把用户上次配好的低成本模型抹成主模型。若 replace 已先发生、缓存为空，则按全新部署处理，并在安装报告中提示"未能保留上次模型配置"。

#### Step 1：获取模型列表

优先执行 `opencode models --verbose`，它输出含 cost（input/output/cache 单价）、context、capabilities 的 metadata；不可用或解析失败时回退到 `opencode models` 纯文本（每行 `provider/model`）。两者都用 60000ms（60 秒）超时，因为首次运行需加载 models.dev 缓存。

- 成功 → 进入 Step 2
- 超时 → 重试一次（缓存可能未预热）；仍然超时则按 Step 0 缓存回填已有 `model:`、跳过自动配置，在安装报告中输出手动配置指南
- 失败（命令不存在、输出为空等）→ 同上：回填 Step 0 缓存、跳过自动配置、输出手动配置指南

#### Step 2：模型分级

**优先按成本分级（有 `--verbose` 时）**：按每模型实际 cost 从低到高分档——低端取最便宜/免费档、中端取中价档、高端取最贵或上下文/能力最强档。免费模型按真实 cost=0 归低端，**不按名字里的营销词**（如 `nemotron-3-ultra-free` 名含 `ultra` 但 cost=0，应归低端）。无 cost 数据的模型也据此进入候选，不被丢弃。

**回退按关键词分级（无 `--verbose` 或无 cost 时）**：按模型 ID 中最后一个 `/` 之后的模型名按 `-`、`.`、`_` 分割为段，逐段精确匹配关键词（不区分大小写）。例如 `minimax-m3` 拆为 `[minimax, m3]`，不匹配 `mini` 也不匹配 `max`；`claude-haiku-4.5` 拆为 `[claude, haiku, 4, 5]`，匹配 `haiku`。关键词分级是启发式，安装报告中标注 `分级依据：关键词（heuristic）`。

| 等级 | 匹配关键词 | 对应 Agent |
|------|-----------|-----------|
| 低端 | `haiku`, `flash`, `mini`, `nano`, `lite` | chapter-extractor, consistency-checker, story-explorer |
| 中端 | `sonnet`, `plus` | story-researcher, narrative-writer, character-designer |
| 高端 | `opus`, `pro`, `ultra`, `max` | story-architect |

- 一个模型可能匹配多个等级的关键词，取最高等级
- 关键词回退下未匹配任何关键词的模型仍列入候选附加建议（按成本分级则一律纳入），并在安装报告列出，提示"可通过自定义输入使用"
- 同一等级内，如果包含多个模型供应商，优先列出知名供应商（anthropic、openai、google、deepseek）的模型

#### Step 3：逐级交互选择

按 低端 → 中端 → 高端 顺序，每级用 AskUserQuestion 让用户选择。

**低端选项结构：**

```
问题："为低成本 Agent（chapter-extractor, consistency-checker, story-explorer）选择模型："
选项：
  - provider/model-id
  - provider/model-id
  - 自定义输入（手动输入完整模型 ID，ID 拼写错误要到运行时才会暴露）
  - 跳过，使用主模型（成本可能较高）
```

**中端选项结构：**

```
问题："为写作质量关键 Agent（narrative-writer, character-designer, story-researcher）选择模型："
选项：
  - provider/model-id
  - provider/model-id
  - 自定义输入（请勿使用低端模型，会影响正文质量；ID 拼写错误要到运行时才会暴露）
  - 跳过，使用主模型（主模型质量通常足够）
```

**高端选项结构：**

```
问题："为总指挥 Agent（story-architect）选择模型："
选项：
  - provider/model-id
  - provider/model-id
  - 自定义输入（手动输入完整模型 ID，ID 拼写错误要到运行时才会暴露）
  - 跳过，使用主模型（成本可能较高）
```

规则：
- 候选最多显示 5 个，超过则截断并提示"更多模型请使用自定义输入"。**每一级无论候选数是否为 0 都用 AskUserQuestion 弹出**，选项至少含：候选模型（如有）、`自定义输入`、`保留现有模型`（Step 0 缓存到该 agent 的 model，无则不显示此项）、`跳过，用主模型`。候选为 0 时仍弹窗，并在问题说明里给出对应警告 + 列出未分级/未入档模型供参考——不再静默跳过交互（否则用户够不到自定义输入）。
- `自定义输入`：用户输入 `provider/model-id` 完整 ID；写入前校验为单行、无控制字符、匹配 `^[A-Za-z0-9._-]+/[A-Za-z0-9._:+-]+$`，不符则提示重输或改选跳过。
- `保留现有模型`：写回 Step 0 缓存的该 agent model（重新部署时保住用户上次配置），不算"跳过"。
- `跳过，用主模型`：显式清除——不写该 agent 的 `model:`，agent 继承主模型。想保留上次配置请选 `保留现有模型`。
- 各级候选为 0 时在问题说明里给出提示：
  - 低端："未检测到低成本模型，这 3 个 agent 将使用主模型，成本可能较高"
  - 中端："未检测到匹配的中端模型。narrative-writer、character-designer、story-researcher 将使用主模型。如主模型质量足够此配置合理；如需降本，请用自定义输入指定不低于主模型质量的中端模型，或从下方未分级模型里选。"
  - 高端："未检测到高端模型，story-architect 将使用主模型"

#### Step 4：写入 model 字段

对应用户选择的 agent 文件（`.opencode/agents/*.md`，由部署清单中 OpenCode agents 部署步骤在此步骤之前已部署），在 frontmatter 末尾、closing `---` 之前，以**零缩进的顶层字段**插入 `model:`（不要插进 `permission:` 等多行 map 的缩进块内部）。值含 YAML 特殊字符时加引号，确保不破坏 frontmatter：

```yaml
---
description: ...
mode: subagent
permission:
  read: allow
  edit: deny
steps: 12
model: provider/model-id
---
```

- 如果 agent 文件已有 `model:` 字段（重新部署场景），替换该顶层 `model:` 的值，不新增重复键
- `保留现有模型`：写回 Step 0 缓存的该 agent model
- `跳过，用主模型`：不写入 `model:` 字段
- 检测失败/超时、没走到本步骤的等级：用 Step 0 缓存回填 `model:`，避免 replace 抹掉用户上次配置

### 2.5 部署 Session State 模板

- 读取 `skills/story-setup/references/templates/上下文.md.tmpl`
- 仅当已识别为长篇书目且 `{书名}/追踪/` 已存在时，创建缺失的 `{书名}/追踪/上下文.md`
- 如果目标文件已存在，不覆盖；短篇项目不得因此创建 `追踪/` 目录

### 2.6 合并 Hooks 注册到 settings.local.json

> 兼容性说明：`settings-hooks.json` 中 PreToolUse 的 `if` 字段使用 Claude Code hook 条件语法，需要运行环境支持 hook-level if。若目标工具不支持该字段，hook 脚本本身仍会自检并 advisory-only 退出；部署时可删除该 `if` 字段并保留 matcher + command。

- 读取 `skills/story-setup/references/templates/settings-hooks.json`
- 读取用户项目的 `.claude/settings.local.json`（如存在）
- 合并 hooks 配置（按「settings-hooks.json 合并算法」处理）
- 写入 `.claude/settings.local.json`

## Codex hooks.json 合并算法（target_cli 含 codex 时）

Codex 项目 hooks 部署到 `.codex/hooks.json`，hook 脚本部署到 `.codex/hooks/story_codex_hook.py`。

1. 读取 `skills/story-setup/references/codex/hooks/hooks.json`
2. 读取用户现有 `.codex/hooks.json`（如存在），提取 hooks 部分
3. 对每个 hook event（SessionStart、PreToolUse、PreCompact、PostCompact、Stop）按 `command` 去重追加；每个 hook 同时携带 `command`（POSIX sh，Unix）与 `commandWindows`（cmd.exe，Windows）两个字段，整体保留不要拆开
4. 保留用户已有其他 hooks/config，不覆盖未知字段
5. 写入 `.codex/hooks.json` 后提示用户：项目 `.codex/` 层需要被 Codex trust，非 managed command hooks 还需要在 `/hooks` 中 review/trust 后才会运行；Windows 下 Codex 以 cmd.exe 跑 hook，走 `commandWindows`（cwd 为项目根时生效，否则 no-op），正文守卫在 Windows 非项目根目录下不强制拦截

## OpenClaw skills-only 部署算法（target_cli 含 openclaw 时）

OpenClaw Phase 1 只部署 skills，不部署 OpenClaw agents/hooks/plugin。

1. 读取仓库当前 `skills/` 下所有包含 `SKILL.md` 的 story skill 目录（13 个：`browser-cdp` 与 `story*`）。
2. 写入目标项目 `skills/{skill-name}/`，仅替换这些 story-setup 管理的已知 skill 目录；保留用户在 `skills/` 下的其他目录。
3. 每个 `SKILL.md` 必须满足 OpenClaw frontmatter 约束：`name` / `description` 是单行键值，`metadata` 是单行 JSON 对象且含 `metadata.openclaw`。
4. 复制 `skills/story-setup/references/openclaw/AGENTS.md.tmpl` 到项目 `AGENTS.md`，按「AGENTS.md 合并策略」合并。
5. `.story-deployed` 的 `target_cli` 写入 `openclaw` 或多端组合；`references_dir` 对 OpenClaw 写 `skills/story-setup/references/agent-references`。
6. 安装报告必须提示：OpenClaw 会在 session 启动时 snapshot eligible skills；部署后如果命令/skills 未出现，需新开 OpenClaw session 或等待 skills watcher 刷新。
7. 安装报告必须提示：OpenClaw Phase 1 没有硬 hooks/agents；写正文前大纲守卫、commit 提醒、session/compact 自动注入只作为 skill 内软约束，不是运行时强制拦截。

## 通用 Web AI / 其他 Agent 部署算法（target_cli 含 generic 时）

通用路径面向 NarraFork、Web AI、自定义 Agent 等可读取项目文件的环境，只部署通用文件，不声明平台原生 hooks/agents 能力。

1. 复制仓库当前 `skills/` 下所有包含 `SKILL.md` 的 story skill 目录（13 个：`browser-cdp` 与 `story*`）到目标项目 `skills/{skill-name}/`；仅替换这些 story-setup 管理的已知 skill 目录，保留用户其他目录。
2. 复制 `skills/story-setup/references/generic/AGENTS.md.tmpl` 到项目 `AGENTS.md`，按「AGENTS.md 合并策略」合并。
3. 复制 `skills/story-setup/references/agent-references/` 到 `skills/story-setup/references/agent-references/`，保证 narrative-writer / story-architect 等角色说明里的参考路径可解析。
4. `.story-deployed` 的 `target_cli` 写入 `generic` 或多端组合；`references_dir` 对 generic 写 `skills/story-setup/references/agent-references`。
5. 安装报告必须提示：generic 不部署平台专属 hooks/custom agents；大纲守卫、commit 提醒、session/compact 注入、多 agent spawn 按 skill 内软约束或 solo/direct fallback 执行。

### 2.7 创建部署标记

- 创建 `.story-deployed` 文件（sentinel file）
- 写入以下字段（YAML `key: value` 格式，hook 用 `references/templates/hooks/lib/sentinel.sh` 读取）：
  ```
  deployed_at: <date -u +"%Y-%m-%dT%H:%M:%SZ">
  agents_version: 16
  setup_skill_version: 1.2.5
  target_cli: claude-code（或 opencode、codex、openclaw、generic，或 claude-code,opencode,codex,openclaw,generic 等组合）
  resolver_strategy: project-local-skill-reference
  references_dir: .claude/skills/story-setup/references/agent-references（Codex 可写 .codex/skills/story-setup/references/agent-references；OpenClaw / generic 可写 skills/story-setup/references/agent-references；多端用逗号分隔）
  ```
- 此文件供 session-start.sh 和写作 skill 检测部署状态，避免重复提示
- 同时创建一次性标记文件 `.claude/.agents-pending-restart`（空文件即可）。session-start.sh 在下一个会话启动时据此确认 agents 已随新会话注册，并自动删除该标记——用来向用户确认「重启已生效」。
- 如果 `.story-deployed` 已存在但无 `agents_version` 或版本 < 16，提示用户重新运行 story-setup 以更新 hooks/agents/rules/reference bundle（具体变更见 `UPGRADING.md`）

## Phase 3：验证安装

1. 验证 hooks 注册：
   - 检查 `.claude/settings.local.json` 中的 hooks 字段是否正确
   - 检查 `.claude/hooks/` 下的脚本是否存在且有执行权限
   - 检查 `.claude/hooks/lib/common.sh` 与 `.claude/hooks/lib/sentinel.sh` 是否存在
2. 验证 rules 路径：
   - 检查 `.claude/rules/` 下的规则文件是否存在且包含 `paths` frontmatter
3. 验证 agents：
   - 检查 `.claude/agents/` 下的 7 个 agent 定义文件是否存在
4. 验证 agent reference bundle：
   - 检查 `.claude/skills/story-setup/references/agent-references/` 下 reference 文件完整
   - 检查所有 `story-setup/references/agent-references/<file>.md` 都能解析到 deployed bundle
5. 验证部署标记：
   - 检查 `.story-deployed` 是否存在且包含时间戳、`agents_version: 16`、`setup_skill_version: 1.2.5`、`target_cli`、`resolver_strategy`、`references_dir`
6. 输出安装报告：
   - 列出所有已部署的文件
   - 列出需要注意的事项（如已有配置已合并）
    - **⚠️ 重启提示（必须醒目输出）**：本次部署写入了 `.claude/agents/`，但这些 custom agent 只在「会话启动」时才会被 Claude Code 注册成 `subagent_type`。**请新开一个 Claude Code 会话再开始写作**，否则当前会话里 story-review / story-long-write 等想 spawn `story-architect`、`narrative-writer` 等时会拿到「subagent_type 不可用」并降级 solo（单视角，失去多 agent 协作）。判断是否生效：新会话里跑 `/story-review`，报告头若是 `Effective Mode: full/lean` 即注册成功；若是 `Fallback: ... -> solo` 说明还在旧会话或未注册。
    - 重启后即可使用 `/story-long-write` 或 `/story-short-write`
    - 如果执行了 2.4.4 模型配置，输出 Agent 模型配置摘要：
      ```
      Agent 模型配置：
        story-architect          → <高端模型>（provider/model-id）
        narrative-writer         → <中端模型>（provider/model-id）
        character-designer       → <中端模型>（provider/model-id）
        story-researcher         → <中端模型>（provider/model-id）
        chapter-extractor        → <低端模型>（provider/model-id）
        consistency-checker      → <低端模型>（provider/model-id）
        story-explorer           → <低端模型>（provider/model-id）
      ```
    - 如果自动检测失败（`opencode models` 不可用），输出手动配置指南：
      ```
      无法自动检测模型列表。以下 Agent 未配置模型，将使用主模型，成本可能较高：
        - chapter-extractor（建议使用低成本模型）
        - consistency-checker（建议使用低成本模型）
        - story-explorer（建议使用低成本模型）

      手动配置方法：编辑 .opencode/agents/{agent名}.md，在 frontmatter 中添加：
        model: provider/model-id

      可用模型列表与成本可通过 opencode models --verbose 查看（输出含每模型 cost/context）。
      模型库与定价见 OpenCode 官方模型源 https://models.dev/。
      ```
7. 验证 opencode 部署（仅当 target_cli 含 opencode 时）：
    - 检查 `.opencode/agents/` 下的 7 个 agent 定义文件是否存在，且 frontmatter 包含 `mode: subagent` 和 `permission` 字段
    - 检查 `.opencode/plugins/story-hooks.ts` 是否存在
     - 检查 `.opencode/commands/` 下的 13 个 command 文件是否存在
    - 检查 `skills/story-setup/references/agent-references/` 下 reference 文件完整且数量与源目录一致
    - 检查 `opencode.json` 的 `plugin` 数组是否包含 story-hooks 条目
    - 检查 `.git/hooks/pre-commit` 是否存在且有执行权限（Windows 上跳过执行权限检查）
    - 检查 `.opencode/agents/` 下 agent 文件 frontmatter 可被 YAML 解析、`model:`（如有配置）是合法顶层标量，而非仅 grep 到 `model:` 子串
8. 验证 Codex 部署（仅当 target_cli 含 codex 时）：
    - 检查 `AGENTS.md` 含 Codex story skill routing sections
    - 检查 `.codex/agents/` 下 7 个 `.toml` agent 定义文件存在并可解析
    - 检查 `.codex/hooks.json` 存在且 JSON 有效，包含 `.codex/hooks/story_codex_hook.py` command
    - 检查 `.codex/hooks/story_codex_hook.py` 存在且 Python 语法有效
    - 检查 `.codex/skills/story-setup/references/agent-references/` 下 reference 文件完整且数量与源目录一致
    - 安装报告必须提示：Codex 需要 trust 项目 `.codex/` 配置层，并在 `/hooks` review/trust 非 managed hooks；部署后新开 Codex 会话让 custom agents 生效；若当前运行时仍返回 `unknown agent_type`，按各 skill 的 fallback 规则降级 solo/direct
9. 验证 OpenClaw 部署（仅当 target_cli 含 openclaw 时）：
    - 检查 `AGENTS.md` 含 OpenClaw story skill routing sections
    - 检查 `skills/` 下 13 个 story skill 目录存在，且每个 `SKILL.md` 包含单行 `name`、单行 `description`、单行 JSON `metadata.openclaw`
    - 检查 `skills/story-setup/references/agent-references/` 下 reference 文件完整且数量与源目录一致
    - 安装报告必须提示：OpenClaw Phase 1 是 skills-only；未部署 OpenClaw agents/hooks，运行时硬拦截不可用；部署后新开 OpenClaw session 或等待 watcher 刷新
10. 验证通用 Web AI / 其他 Agent 部署（仅当 target_cli 含 generic 时）：
    - 检查 `AGENTS.md` 含通用 story skill routing sections
    - 检查 `skills/` 下 13 个 story skill 目录存在，且每个 `SKILL.md` 可读
    - 检查 `skills/story-setup/references/agent-references/` 下 reference 文件完整且数量与源目录一致
    - 安装报告必须提示：generic 不部署平台专属 hooks/agents；所有硬拦截与多 agent 协作都按 skill 内软约束或 solo/direct fallback 执行

---

## 模板占位符

| 占位符 | 替换规则 | 示例 |
|--------|----------|------|
| `{项目名}` | 用户项目名称或目录名 | 《剑来》、《暗卫》 |
| `{书名}` | 书名目录名（与目录一致） | 与 `{项目名}` 相同，或用户自定义 |
| `{目标平台}` | 目标发布平台 | 起点、番茄、晋江、知乎盐言 |
| `{作者名}` | 用户笔名或昵称 | 未指定时用「作者」 |

替换时去掉花括号。如果用户未指定项目名，用当前目录名。未指定的占位符保留原样不替换。

## CLAUDE.md 合并策略

用户已有 CLAUDE.md 时，按 marker/section 合并：
1. 优先识别 story-setup 管理块标记（如果旧项目已有标记，只替换标记内内容）
2. 无标记时，读取用户现有 CLAUDE.md，按 `##` 标题切分为 section map
3. 读取模板 CLAUDE.md.tmpl，同样切分
4. 模板中的标准 section（Skill 路由表、文件结构、协作规则、Context Recovery、语言）**覆盖**用户同名 section
5. 用户独有的 section（自定义内容）**保留**不动
6. 未知冲突用 AskUserQuestion 让用户选择保留哪个版本

## AGENTS.md 合并策略（OpenCode / Codex / OpenClaw / generic）

用户已有 AGENTS.md 时，按 marker/section 合并：
1. 优先识别 story-setup 管理块标记（如果旧项目已有标记，只替换标记内内容）
2. 无标记时，读取用户现有 AGENTS.md，按 `##` 标题切分为 section map
3. OpenCode 使用 `skills/story-setup/references/opencode/AGENTS.md.tmpl`；Codex 使用 `skills/story-setup/references/codex/AGENTS.md.tmpl`；OpenClaw 使用 `skills/story-setup/references/openclaw/AGENTS.md.tmpl`；通用 Web AI / 其他 Agent 使用 `skills/story-setup/references/generic/AGENTS.md.tmpl`
4. 模板中的标准 section（Skill 路由表、文件结构、协作规则、Compact 后恢复上下文）覆盖同名 section；用户独有 section 保留
5. 多端同时部署时，Codex/OpenCode/OpenClaw/generic 共同可用的通用段落只保留一份；工具特有说明以小节区分，避免互相覆盖

## settings-hooks.json 合并算法

hooks 注册合并按 command 字段去重：
1. 读取用户现有 `.claude/settings.local.json`（如存在），提取 hooks 部分
2. 读取 `settings-hooks.json` 模板，提取要注册的 hooks
3. 对每个 hook event（SessionStart、PreToolUse 等）：
   - 用户已有的 hook command → 保留，不重复添加
   - 模板中的新 hook command → append 到对应 event 的 hooks 数组
   - 用户独有的其他配置（permissions、env 等）→ 完整保留
4. 写入合并后的完整 settings.local.json

## 重新部署

- `.story-deployed` 不存在 → 全新安装，Phase 2 全部执行
- `.story-deployed` 存在且 `agents_version: 16` → 提示已部署，AskUserQuestion 确认是否重新部署
- `.story-deployed` 存在但 `agents_version` < 16 → 提示需要更新，重新执行 Phase 2 覆盖 agents/hooks/rules/reference bundle，CLAUDE.md / AGENTS.md / settings.local.json / .codex/hooks.json 走合并策略

---

## 参考资料

| 文件 | 用途 |
|------|------|
| references/templates/CLAUDE.md.tmpl | 项目根 CLAUDE.md 模板 |
| references/templates/hooks/ | 8 个 hook 脚本模板 + `lib/common.sh`/`lib/sentinel.sh`（正文兜底 `check-prose-after-write.sh` 限 PostToolUse Write/Edit；`cat>`/`tee` 等 Bash 写正文由 Codex Stop 回合末 git 扫描兜，Claude/OpenCode 的 Bash 仅 pre-guard） |
| references/templates/rules/ | 4 条 path-scoped 规则模板 |
| references/templates/agents/ | 7 个 agent 定义模板（story-architect, character-designer, narrative-writer, consistency-checker, story-researcher, story-explorer, chapter-extractor） |
| references/agent-references/ | Agent 模板自带的参考资料副本；部署到 `.claude/skills/story-setup/references/agent-references/`，避免跨 skill references |
| references/templates/settings-hooks.json | hooks 注册 JSON 片段 |
| references/templates/上下文.md.tmpl | 写作上下文模板 |
| references/codex/AGENTS.md.tmpl | Codex 项目根 AGENTS.md 模板 |
| references/codex/agents/ | 7 个 Codex custom agent TOML 模板 |
| references/codex/hooks/hooks.json | Codex hooks 注册 JSON 模板（部署到 `.codex/hooks.json`） |
| references/codex/hooks/story_codex_hook.py | Codex hook adapter（部署到 `.codex/hooks/story_codex_hook.py`） |
| references/openclaw/AGENTS.md.tmpl | OpenClaw 项目根 AGENTS.md 模板（skills-only） |
| references/generic/AGENTS.md.tmpl | 通用 Web AI / 其他 Agent 项目根 AGENTS.md 模板（skills + soft checks） |

---

## 流程衔接

**流水线：** 部署
**位置：** 初始化（最前置）

| 时机 | 跳转到 | 命令 |
|---|---|---|
| 部署完成，开始写作 | story-long-write / story-short-write | `/story-long-write` 或 `/story-short-write`；Codex 中也可用 `$story-long-write` / `$story-short-write`；OpenClaw 中可用 `/skill story-long-write`；generic 直接点名 skill |
| 导入已有小说做拆解 | story-import | `/story-import`；Codex 中也可用 `$story-import`；OpenClaw 中可用 `/skill story-import`；generic 直接点名 skill |
| 需要浏览器登录态（扫榜/拆文取原文） | browser-cdp | `/browser-cdp`；Codex 中也可用 `$browser-cdp`；OpenClaw 中可用 `/skill browser-cdp`；generic 需平台允许本地脚本/浏览器控制 |
