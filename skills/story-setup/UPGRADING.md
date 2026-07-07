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
- `agents_version: 10` → 旧版，需重新部署以获取写正文前细纲守卫 hook、长短交错/疏密写作规则与部署后重启提示
- `agents_version: 11` → 旧版，需重新部署以获取拆文「关键信息与扩写技法」「情绪模块/节奏」产物及日更消费链 + 推理型一致性检查 + 自然分段与主语节奏规则
- `agents_version: 12` → 旧版，需重新部署以获取章节蓝图细纲与语气标点谱系
- `agents_version: 13` → 旧版，需重新部署以获取 AI 句式硬门槛、narrative-writer 交付复扫和 issue #166 修复
- `agents_version: 14` → 旧版，需重新部署以获取 v0.6.19 部署侧改动（正文兜底 hook、文风指纹来源刷新、Codex/OpenClaw 适配）
- `agents_version: 15` → 旧版，需重新部署以获取 v0.6.21 短篇写作 Agent 模板与参考栈更新
- `agents_version: 16` → 当前版本

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
- **本地正文检查**：`story-deslop`、`story-long-write`、`story-short-write`、`story-review` 都携带本地 `check-ai-patterns.js`，文件模式会在预检或交付前对正文执行 `node scripts/check-ai-patterns.js --check --fail-on=blocking <正文文件...>`；`blocking` 命中时回到正文改写，并复扫到 0；`advisory` 只提示读感风险，按上下文处理，不要为了朱雀结果机械改文。
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

### v16 (当前)

- `setup_skill_version` 升级到 `1.2.5`，`.story-deployed` 的 `agents_version` 升级到 `16`。
- **短篇写作参考栈清理（#206）**：`story-short-write` 不再继承长篇通用参考；改由 `short-format.md`、`short-craft.md`、`short-deslop.md` 与 `genre-styles/` 题材包承担短篇格式、情绪直给、节奏密度和去 AI 味规则。
- **narrative-writer 短篇例外同步（#206）**：Claude/OpenCode/Codex 三端 agent 模板同步「短篇题材包例外」——短篇需要情绪直给时允许“情绪词 + 体感/动作焊住”，只清除空泛 AI 情绪总结，不再误把短篇爽感写法全部改成纯动作外化。
- 已部署项目请重新运行 `/story-setup` 刷新 agents/reference bundle；**部署后新开会话**，否则旧会话仍使用 v15 narrative-writer 模板，无法获得以上 v16 的短篇写作规则。
