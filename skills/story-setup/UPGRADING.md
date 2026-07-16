# 升级指南

## 当前版本

- `setup_skill_version: 1.2.7`
- `agents_version: 19`

`.story-deployed` 缺失任一字段，或 `agents_version` 缺失 / 非整数 / 小于 `19`，都视为待更新部署。直接重新运行 `/story-setup`（Codex 用 `$story-setup`）；不在运行时逐级兼容历史模板。如项目 `agents_version` 大于 `19`，说明本地 story-setup 比项目旧：先更新 oh-story-claudecode，不得用 v19 降级覆盖。历史版本改动见仓库根目录 `CHANGELOG.md`。

## 升级策略

| 策略 | 适用场景 | 行为 |
|------|----------|------|
| 覆盖部署 | 全新项目 | 写入当前 agents/hooks/rules/reference bundle |
| 合并部署 | 已有项目 | 替换 story-setup 管理文件，合并用户维护文件 |
| 手动更新 | 只更新特定文件 | 仅建议熟悉部署契约的维护者使用 |

推荐始终重新运行 story-setup，让部署器按 owner class 处理文件。

## 文件所有权

### story-setup 管理，可替换

这些文件由 story-setup 管理，不含用户自定义内容：
- `.claude/hooks/` — 所有 hook 脚本与 `lib/` 辅助库
- `.claude/agents/` — 所有 agent 定义
- `.claude/rules/` — 所有 path-scoped 规则
- `.claude/skills/story-setup/references/agent-references/` — Agent 参考资料副本
- `.zcode/skills/{13 known skills}/`、`.zcode/commands/{13 known commands}.md` — 仅覆盖 oh-story 已知名称
- `.zcode/hooks/story_zcode_hook.js` — ZCode 专用 Hook runner

### 用户与 story-setup 共同维护，只合并管理块

这些文件可能含用户自定义内容：
- `CLAUDE.md` — 按 marker/section 合并，用户独有 section 保留
- `.claude/settings.local.json` — hooks 按 command 去重 append，其他配置保留
- `AGENTS.md` — ZCode/OpenCode/Codex/OpenClaw/generic 按 marker/section 合并
- `.zcode/config.json` — 仅按事件、matcher 和 process args 去重合并 oh-story Hooks，其他字段保留

### 用户状态，不覆盖

- `{书名}/正文/`、`正文.md`
- `{书名}/设定/`、`大纲/`、`追踪/`
- `.active-book`

## v19 当前契约

- 写作与导入只接受当前拆文产物：`剧情/情绪模块.md` 与 `剧情/节奏.md` 缺失时 fail-fast，并给出重跑 Stage 3+ / 重新导入的修复动作。
- 新建、补建、改纲的细纲只接受完整章节蓝图：缺少阶段位置、结构公式、禁止提前释放、内容概括、情节安排、人物关系、情节细化或结尾设定时，先补齐再写。旧版细纲缺这些字段不阻塞日更，回退消费旧字段（核心事件、情节点序列、目标情绪、章首/章尾钩子、字数目标）。
- 每个 agent adapter 只读取本目标的 canonical reference 路径：Claude `.claude/skills/`、OpenCode `skills/`、Codex `.codex/skills/`。
- `_progress.md` 恢复只接受 `schema_version: 2` 与章节边界表，不再执行隐式历史迁移。
- Codex hooks 升级使用稳定管理身份替换注册；会先移除旧直调 Python 命令与已有 launcher 命令，再写入当前 6 个注册，不会双重执行。
- 定制 hook 如果调用了已删除的 `discover_book_dir()`，请改为 `discover_active_book()`。当前版不再保留该兼容别名。

## 升级步骤

1. 在项目根目录重新运行 story-setup。
2. 确认 `.story-deployed` 写入 `agents_version: 19` 与 `setup_skill_version: 1.2.7`。
3. 确认目标 CLI 的 agents、hooks/rules 和 reference bundle 都通过安装验证。
4. 新开会话，使 custom agents 与 hooks 按当前文件重新注册。
5. 若已有拆文库或细纲不满足当前契约，先重新拆解/导入或补齐细纲，再继续写作。

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

- 更新 narrative-writer 场景写法：使用”三维度揉进”并按画面分段控制段落密度
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

### v10

已部署项目请重新运行 `/story-setup`，刷新写作 Agent；主要影响是日更续写更稳定地沿用对标文风。

### v11

- `setup_skill_version` 升级到 `1.2.0`，`.story-deployed` 的 `agents_version` 升级到 `11`。
- **新增写正文前流程守卫 hook** `guard-outline-before-prose.sh`（PreToolUse Write/Edit/MultiEdit）：首次创建 `正文/第N章_*.md` 时若缺 `大纲/细纲_第N章.md`、首次创建短篇 `正文.md` 时若缺 `小节大纲.md`，直接阻断（exit 2），强制先搭大纲再写正文。正文已存在（续写/去AI味/改稿）或非正文文件一律放行。
- **部署后必须新开会话**：custom agents 只在会话启动时注册成 `subagent_type`。`/story-setup` 部署完会留下一次性标记 `.claude/.agents-pending-restart`，session-start.sh 在下个会话确认 agents 已注册并清除标记。部署当前会话内 spawn agent 仍会降级 solo——必须新开 Claude Code 会话。
- **写作规则补「长短交错 + 疏密分配」**：`format-and-structure.md` 段落节奏不再使用固定字数上限的一刀切，改为按戏剧单元、情绪 beat 和疏密分配自然断段；`writing-craft.md` 新增「疏密分配（详略不均）」；`anti-ai-writing.md` 长短句交错改为可执行的自然节奏目标；narrative-writer 模板补 Gate D 长短变化与「句式多样性」审查；story-review 段落 gate 由旧字数上限改为查长短/疏密变化。针对生成内容文学味过重、句式单一、节奏平坦的反馈。
- 已部署项目重新运行 `/story-setup` 刷新 hooks/agents/references；**部署后新开会话**。

### v12

- `setup_skill_version` 升级到 `1.2.1`，`.story-deployed` 的 `agents_version` 升级到 `12`。
- **拆文→写作模块链（issue #149）**：`story-long-analyze` Stage 2 摘要新增「关键信息与扩写技法」表，Stage 3 产出权威产物 `剧情/节奏.md`（关键信息推进 / 情绪触动点 / 爆发节奏）与 `剧情/情绪模块.md`（读者需求·情绪引擎 / 可复现模块）；`story-import` 同步到 `对标/{书名}/剧情/`；`story-long-write` 日更按权威优先级读取并复现。
- **agent 模板更新**：`chapter-extractor` 增加「关键信息与扩写技法」提取，`story-explorer` 的 `benchmark_style_load` 增加 `selected_emotion_module`/`rhythm_reference` 等返回字段。**已部署项目须重新运行 `/story-setup` 才能拿到新 agent 行为**；否则日更回退到主会话手动加载（功能不丢，仅失去 agent 快捷路径）。
- `consistency-checker` 从纯 grep-first 字面矛盾扩展为「grep-first + 推理型一致性审查」：补查规则边界悖论、设定层级冲突、跨章因果链、规则可滥用漏洞、代价一致性。
- **自然分段 + 主语节奏**：`format-and-structure.md` 与 `writing-craft.md` 不再把 `60/45` 字数当成硬切分规则，改为按戏剧单元/镜头/一件事结束分段；完整推理链、氛围铺陈、情绪变化可保留稍长段。
- **主语过密修复**：narrative-writer 模板和 story-review 检查项新增“段首点名建立主语、段中代词/省略、关键转折再点名”的节奏规则，不按全章名字次数一刀切。
- 已部署项目重新运行 `/story-setup` 刷新 agents/references；**部署后新开会话**。

### v13

- `setup_skill_version` 升级到 `1.2.2`，`.story-deployed` 的 `agents_version` 升级到 `13`。
- **细纲升级为章节蓝图（issues #162）**：新建/补建长篇 `大纲/细纲_第XXX章.md` 时，除旧字段外新增内容概括（起因/发展/转折/高潮/结尾）、情节安排（主线/辅线/事件线/感情线/逻辑线）、人物关系和出场顺序、情节细化、结尾设定和钩子；旧版细纲仍可续写，缺失字段不阻塞，回填未知项写 `[待补充]`。
- **语气标点谱系（issue #161）**：writer references、narrative-writer、review/deslop 增加“标点跟着语气/人物声线走”的规则，避免通篇句号化，也禁止随机堆砌问号/感叹号；犹豫/未尽/打断/拖长改用动作停顿、短句或换行处理，正文产物不用 `……`、不用 `——`，知乎盐言 `「」` 引号风格继续有效。
- `story-architect` 会产出新版章节蓝图；`consistency-checker` 会消费细纲里的逻辑线、人物关系变化、出场顺序和代价/收益兑现；`narrative-writer` 会按语气标点谱系执行正文标点节奏。
- 已部署项目请重新运行 `/story-setup` 刷新 hooks/agents/references；**部署后新开会话**，否则旧会话仍使用 v12 agent 定义。

### v14

- `setup_skill_version` 升级到 `1.2.3`，`.story-deployed` 的 `agents_version` 升级到 `14`。
- **AI 句式硬门槛（issue #166）**：`narrative-writer`、写作 skill、review/deslop 流程都把“先否定再肯定”的翻转句式列为硬禁令；文风召回、对标模仿和 Gate B 软规则都不能覆盖这条禁令。
- **本地正文检查**：`story-deslop`、`story-long-write`、`story-short-write`、`story-review` 都携带本地 `check-ai-patterns.js`，文件模式会在预检或交付前对正文执行 `node scripts/check-ai-patterns.js --check --fail-on=blocking <正文文件...>`；`blocking` 命中时回到正文改写，并复扫到 0；`advisory` 只提示读感风险，按上下文处理；功能性写法保留或标 `[需复核]`。
- **narrative-writer 交付边界**：agent 本身没有 Bash/Node 工具时，只能报告已按规则自检，不能声称已运行脚本；主会话或调用方具备执行能力时，必须对实际落盘文件复扫。
- **字数统计修复（issue #170）**：`narrative-writer` Gate E 增「具体字数表达校验」——禁止正文写未经脚本核验的「这五个字」式字数断言，改用非数字表述。
- **对话机械化/论文腔/不分场合修复（issue #171）**：`narrative-writer` 参考表接入 `dialogue-mastery`、审查清单加对话质量逐项、新增「写完后对话自检」收尾步；写前意图确认加「对话声线基线」（高压 beat→搞笑声线让位、信息型配角不当科普嘴、逐句承接对方情绪），`consistency-checker`/`character-designer` 审查侧同步。
- **续写文风漂移每章自检（issue #168）**：`narrative-writer` 新增「写完后文风自检」，并把目标句长带快照钉进 `追踪/上下文.md` 的「## 文风指纹」区（抗 compaction），续写逐章按目标带把碎句合并回中长句，防逗号结巴体。
- **新名词/设定首次出现给读者锚点（issue #175）**：`anti-ai-writing.md` Gate G 自检后补「删解释腔 ≠ 把读者读懵」反向制衡，新名词首次出现靠动作/对话半句/场景后果一笔带出当下作用。
- **被动版本更新检查（issue #173）**：`session-start.sh` 增加被动更新提醒——每 24h 至多一次、curl 5s 超时、全程静默兜底、`STORY_NO_UPDATE_CHECK=1` 可关，仅落后才提示。
- 已部署项目请重新运行 `/story-setup` 刷新 hooks/agents/references；**部署后新开会话**，否则旧会话仍使用 v13 agent 定义，无法获得以上 v14 的全部改进。

### v15

- `setup_skill_version` 升级到 `1.2.4`，`.story-deployed` 的 `agents_version` 升级到 `15`。
- **正文兜底 + 跨批连续性确定性网（#195）**：新增 deployed hook `check-prose-after-write.sh`（PostToolUse Write/Edit 落盘后跑硬信号兜底——截断、拒绝语/AI 自指、工程词泄漏、逐行复读、字数欠账）；`session-start.sh` 部署自检补 hook、`detect-story-gaps.sh` 与 Codex `story_codex_hook.py` 同步跨批连续性兜底。
- **自定义文风指纹来源刷新（#196）**：narrative-writer 模板与 `上下文.md.tmpl` 的「文风指纹」加「来源」字段，用户新增/改 `设定/文风.md` 后能用新来源刷新句长带快照，不再被旧对标永久压住。
- **模型退化 / 碎句号检测接入写作链路（#193/#192）**：`check-degeneration.js`（复读/截断/工程词泄漏）与升级版 `check-ai-patterns.js`（碎句号/长段落/破折号按功能改写）随写作 skill 部署，正文收尾复扫，每条 finding 带 `severity: blocking|advisory`。
- **Codex / OpenClaw 适配（#186/#189）**：`$story-setup` 部署 `.codex/agents/*.toml` 与 `.codex/hooks.json`，补齐 OpenClaw skills-only 兼容，Codex `.agents/skills` symlink 守卫。
- 已部署项目请重新运行 `/story-setup` 刷新 hooks/agents/references；**部署后新开会话**，否则旧会话仍使用 v14 agent 定义，无法获得以上 v15 的全部改进。

### v16

- `setup_skill_version` 升级到 `1.2.5`，`.story-deployed` 的 `agents_version` 升级到 `16`。
- **短篇写作参考栈清理（#206）**：`story-short-write` 不再继承长篇通用参考；改由 `short-format.md`、`short-craft.md`、`short-deslop.md` 与 `genre-styles/` 题材包承担短篇格式、情绪直给、节奏密度和去 AI 味规则。
- **narrative-writer 短篇例外同步（#206）**：Claude/OpenCode/Codex 三端 agent 模板同步「短篇题材包例外」——短篇需要情绪直给时允许“情绪词 + 体感/动作焊住”，只清除空泛 AI 情绪总结，不再误把短篇爽感写法全部改成纯动作外化。
- 已部署项目请重新运行 `/story-setup` 刷新 agents/reference bundle；**部署后新开会话**，否则旧会话仍使用 v15 narrative-writer 模板，无法获得以上 v16 的短篇写作规则。

### v17

- `setup_skill_version` 升级到 `1.2.6`，`.story-deployed` 的 `agents_version` 升级到 `17`。
- **题材正文提示卡召回（#226）**：narrative-writer Claude/OpenCode/Codex 三端模板接入「题材正文提示卡」召回——先读索引、再只读取 `genre-prose-cards/{题材}.md` 单卡，卡片只内部校准题材味，anti-leak 硬约束保证卡名/题材标签/置信度/合规自评一律不写进正文；文风指纹与 Gate G 去解释腔规则按题材细化。
- **大纲边界与逐章写法公式（#225/#226）**：narrative-writer 模板只扩写细纲计划内情节点，不足时返回 `outline_underfilled` 欠账报告交主会话补纲；chapter-extractor 模板新增 `chapter_formula` 逐章写法公式产物（情绪流向/节奏配比/结构公式/章尾卡点）。
- **generic Web AI 部署（#216）**：story-setup 新增 `target_cli=generic` 文件模式，Web AI / 通用 Agent 项目复制 `skills/` 与通用 `AGENTS.md`，不声明平台原生 hooks/custom agents 能力。
- 已部署项目请重新运行 `/story-setup` 刷新 agents/reference bundle；**部署后新开会话**，否则旧会话仍使用 v16 agent 模板，无法获得以上 v17 改进。

### setup 1.2.7（ZCode，agents v17）

- 新增 `target_cli=zcode`：部署 `.zcode/skills/`、`.zcode/commands/`、`.zcode/hooks/story_zcode_hook.js`，合并 `.zcode/config.json` 与根 `AGENTS.md`。
- ZCode 3.3.4 不执行项目/plugin custom agents；不创建 `.zcode/agents/` 或 `.zcode/rules/`，专业角色稳定降级为 solo/direct。
- ZCode Hook 依赖 PATH 中的 `node`，仅使用受支持的 SessionStart / PreToolUse / PostToolUse 事件；无 PreCompact / SessionEnd 等价能力。
- 已有 ZCode 项目升级后重新运行 `$story-setup` 并新开 ZCode session；Claude/OpenCode/Codex 的 agents bundle 仍为 v17，无需因本项单独提升 `agents_version`。

### v18

- `.story-deployed` 的 `agents_version` 升级到 `18`（`setup_skill_version` 仍为 `1.2.7`）。
- **技能契约体检（#242）**：新增 `check-current-skill-contracts.py`，把版本锚点、主产物路径、细纲必填项和「静默降级」禁令固化成 CI 契约；`agents_version` 成为运行时过期判定的唯一权威。
- **对标主产物缺失改 fail-fast**：`剧情/情绪模块.md` / `剧情/节奏.md` 缺失时统一停下、设 `missing_primary_contract` 并提示重跑 `/story-long-analyze` Stage 3+ 或 `/story-import`，不再用 `拆文报告.md` / 章节摘要 / 故事线静默降级。
- **旧版大纲容忍保留**：旧版卷纲缺卷契约/剧情单元卡、旧版细纲缺章节蓝图字段仍不阻塞日更；本轮内存推断、未知项写 `[待补充]`，仅在明确补纲/改纲时回写；新建、补建、改纲时必须按当前章节蓝图补齐。
- session-start / story-outline 规则与 agent 模板同步刷新。已部署项目请重新运行 `/story-setup` 刷新 hooks/agents/references；**部署后新开会话**，否则旧会话仍使用 v17 部署。

### v19 (当前)

- `.story-deployed` 的 `agents_version` 升级到 `19`（`setup_skill_version` 仍为 `1.2.7`）。
- **概念统一为「剧情单元」**：剧情条 / 循环卡 / 正式情节循环 / 剧情段统一叫**剧情单元**（卷纲里的记为**剧情单元卡**），字段 循环ID/循环节拍/循环情绪引擎/循环承诺 → 单元ID/单元节拍/单元情绪引擎/单元承诺；「循环」一词只保留节奏义（爽点循环/小中大循环等）。已有卷纲用旧词不阻塞——按字段结构回退读取，补纲/改纲时升级为新词。
- **拆书剧情单元接入卷纲/细纲**：卷纲剧情单元卡新增可缺省字段「对标剧情参照」；「对标节奏迁移」改以剧情单元为选段单位（按 类型/桥段标签 圈同类）；细纲分批边界改为「一批 = 一个剧情单元」，剧情批召回一次、结论固化进剧情单元卡；story-long-write 场景表新增「补纲/扩纲」入口与卷纲锁定定义。拆文侧 `剧情/README.md` 新增「剧情单元清单」索引（存量书可用「补剧情单元清单」机械补建）。旧版卷纲/细纲/拆文库无这些字段一律不阻塞，回退原流程。
- **卷纲规则同步新推进模型**：部署规则 story-outline.md 的卷纲必填项改为 卷契约/终局储备/剧情单元卡 schema，废弃「每 N 章一个大爽点」固定周期；细纲缺项处理恢复旧版容忍（新建/补建/改纲才要求按当前蓝图齐全）。
- **story-architect 模板对齐**：细纲最小结构补 单元ID/位置、主角目标/关键选择；「代价兑现/收益兑现」改名「行动成本（可无）/收益归属」；Phase 2 spawn 也必须附带契约摘要（新增细纲层字段一条）。
- **审查线对齐新推进模型**：agent-references/quality-checklist.md 同步七类状态分档、悬念/爽点间隔按章节定位豁免，新增「读者契约与终局储备双向审查」一节。
- **hooks 健壮性**：session-start 部署自检名单纳入 `story_hook_cli.js` / `story_hook_core.js`，并在 node 缺失时一次性 [WARN] 提示正文兜底网/commit 提示/连续性检查已停用（大纲拦截仍有纯 bash 兜底）；staged 提交扫描四份实现（JS core / Codex python / Claude bash / OpenCode pre-commit）语义与中文文案统一，parity 测试新增 Part E（staged warnings 与大纲阻断的 py↔js 逐字锁）。
- **去AI味闸口机器化（无状态）**：写后正文网新增确定性毒句式检测（不是A而是B 全家族/声线反差/否定排比/预告收尾），写正文落盘即自动扫描并推回命中，Claude/ZCode/OpenCode/Codex 四端同一共享核；写下一章前新增「毒句式欠账门」——上一章有未清 blocking 命中且未标 `<!-- 去味:跳过 -->` 豁免时拦截（判据现算自文件本身，不落任何状态文件，node 缺失或解析失败一律放行）；豁免标记冒号全半角均认，且同时使写后网跳过该章毒句式推回（其余网照常）；`check-ai-patterns.js` 同步新增 voice-contrast / negation-parade / reverse-not-is / trailer-ending（blocking，经真人语料零误报校准）与 quote-emphasis-tic（advisory）；SKILL 侧最毒句式速查内联进写作步骤、新增「写后同轮清零」要求，OpenClaw/generic 无 hook 平台由 AGENTS 模板自锁条款兜底。
- 已部署项目请重新运行 `/story-setup` 刷新 hooks/agents/rules/references；**部署后新开会话**，否则旧会话仍使用 v18 部署。
