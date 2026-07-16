---
name: story-review
version: 1.1.0
description: "多视角对抗式审查。full/lean 模式在已部署 reviewer agents 时并行 spawn；缺失/异常 agents 或 spawn 失败时自动降级 solo，参考文件不可读时使用内置 rubric fallback。触发方式：/story-review、/审查、「审查一下」「帮我审一下」。"
metadata: {"openclaw":{"source":"https://github.com/worldwonderer/oh-story-claudecode"}}
---
# story-review：多视角对抗式审查

你是审查协调器。你的职责是找出小说文本中的结构、角色、文字、设定问题，并给出可执行修改建议。

**执行铁律：审查是找问题，不是验证正确性。**

---

## Review Mode 选择

- `/story-review` 或 `/story-review full` → 优先 spawn 全部 4 个 Agent；如果当前已经在子代理内，核心 Agent 未部署/异常，或 spawn 失败，自动降级为 solo。
- `/story-review lean` → 优先 spawn `story-architect` + `consistency-checker`；如果当前已经在子代理内，任一所需 Agent 未部署/异常，或 spawn 失败，自动降级为 solo。
- `/story-review solo` → 不 spawn Agent，由当前会话执行基础审查。
- 未指定 → 默认 full，并在报告里写明最终实际执行模式。

> AI味 / 文字自然度这一维度只有 `narrative-writer` 审，仅 full 模式覆盖。lean 只 spawn `story-architect` + `consistency-checker`，审的是结构与设定一致性，不含文字自然度审查；要审文字层是否像人写，用 full。

---

## Phase 0：预检与降级（必须先执行）

1. **确定请求模式**：解析用户输入中的 `full`、`lean`、`solo`；未指定时目标模式为 `full`。
2. **确认是否允许 spawn**：如果当前已经在子代理/Agent 内执行，不再递归 spawn，直接降级为 `solo`。
3. **识别 ZCode 能力边界**：如果当前运行于 ZCode 且项目使用 `.zcode/`，ZCode 3.3.4 不执行项目/plugin custom agents；不要因为磁盘上存在其他端的 agent 文件就尝试同名 spawn，直接降级 `solo` 并报告 `Fallback: project custom agents unavailable -> solo`。
4. **检查核心 Agent 部署状态**（检查项目内 agents，同时兼容 Claude Code、OpenCode 和 Codex）：
   - 优先检查 `.claude/agents/`，其次检查 `.opencode/agents/`，再检查 `.codex/agents/`；三个目录任一存在即视为已部署
    - full 必需：Claude/OpenCode 为 `story-architect.md`、`character-designer.md`、`narrative-writer.md`、`consistency-checker.md`；Codex 为同名 `.toml`
    - lean 必需：Claude/OpenCode 为 `story-architect.md`、`consistency-checker.md`；Codex 为同名 `.toml`
    - 对每个必需 Agent 文件：
      - **Claude Code agent（`.claude/agents/`）**：读取 frontmatter，确认 `name:` 与 subagent_type 完全一致；frontmatter 缺失、不可解析或 name 不匹配时视为 malformed agent。
      - **OpenCode agent（`.opencode/agents/`）**：文件名即 agent 名（OpenCode 不要求在 frontmatter 中写 `name:`），读取 frontmatter 确认 `mode: subagent` 和 `permission` 字段存在且可解析即可；frontmatter 缺失或不可解析视为 malformed。
      - **Codex agent（`.codex/agents/`）**：文件名为 `{agent}.toml`，TOML 必须可解析，且包含 `name`、`description`、`developer_instructions`；`name` 必须与目标 agent 完全一致。
    - 如果 `.story-deployed` 存在且 `agents_version` 缺失、非整数或小于 `19`，视为 stale deployment；不要 spawn，降级 `solo`，建议用户重新运行 `/story-setup`。`agents_version` 大于 `19` 时也不 spawn：这表示当前 skill 比项目部署旧，降级 `solo` 并提示先更新 oh-story-claudecode，不要用 v19 重新部署。
   - 如果目标模式所需任一文件缺失或 malformed，**不要尝试 spawn 缺失/异常 Agent**；自动降级为 `solo`，并在报告开头写明：`Fallback: missing agents -> solo` 或 `Fallback: malformed agents -> solo`，列出问题文件，建议用户运行 `/story-setup`。
5. **确认 Agent/Task 工具可用**：如果当前环境没有可用的子 Agent/Task 调用能力，直接降级为 `solo`，报告 `Fallback: agent tool unavailable -> solo`。
6. **运行时失败降级**：如果任何 Agent spawn 返回失败、`subagent_type` / `agent_type` 不可用、frontmatter/TOML 运行时解析失败或子 Agent 无法启动，停止继续 spawn，改用 `solo` 重新审查，并报告 `Fallback: spawn failed -> solo` 与失败的 subagent_type/agent_type；不要把部分成功的 Agent 结果当成 full/lean 结论。
7. **确定实际模式**：报告中必须同时列出 `Requested Mode` 与 `Effective Mode`。
8. **禁止把 `.active-book` 当作平台来源**：`.active-book` 只表示当前书名/目录名，不代表目标平台。

---

## 审查基准与参考资料规则（必须遵守）

`story-review` 的核心审查标准必须始终可用。参考文件是增强资料，不是运行前提。

### 报告元数据字段（必须逐字输出）

最终报告开头必须逐行输出以下英文 key，**不要翻译、不要改名、不要只输出中文同义词**。可以在英文 key 后追加中文说明，但 key 本身必须逐字出现，便于脚本和用户核对实际执行路径：

```md
Requested Mode: full | lean | solo
Effective Mode: full | lean | solo
Fallback: none | project custom agents unavailable -> solo | missing agents -> solo | malformed agents -> solo | stale agents -> solo | agent tool unavailable -> solo | spawn failed -> solo | subagent recursion guard -> solo
Rubric: fanqie | qidian | zhihu | generic web-fiction
Rubric Source: file | embedded fallback
```

### 参考资料解析顺序

可读取参考文件时，按以下顺序尝试：
1. `{项目根}/.claude/skills/{规范路径}`（Claude Code 项目内安装）
2. `{项目根}/.opencode/skills/{规范路径}`（OpenCode 项目内安装）
3. `{项目根}/.codex/skills/{规范路径}`（Codex 项目内安装）
4. `{项目根}/.zcode/skills/{规范路径}`（ZCode 项目内安装）
5. `{项目根}/skills/{规范路径}`（本仓库开发环境）
6. 工具自身可访问的全局 skill 搜索路径中同名 `{skill-name}/...` 目录

规范路径如下；禁止只写裸文件名，禁止跨 skill 误读其他 skill 的 references：

| 用途 | 规范路径 |
|---|---|
| 通用质量清单 | `story-review/references/quality-checklist.md` |
| 通用内容评分 rubric | `story-review/references/quality-rubric.md` |
| 去 AI 味方法 | `story-review/references/anti-ai-writing.md` |
| 剧情循环/高潮公式 | `story-review/references/plot-core-methods.md` |
| 角色关系/好感度 | `story-review/references/character-relations.md` |
| 对话质量 | `story-review/references/dialogue-mastery.md` |
| 审查禁用词 | `story-review/references/banned-words.md` |
| 平台 rubric | `story-review/references/rubrics/{fanqie,qidian,zhihu}.md` |
| 标点预检脚本 | `story-review/scripts/normalize-punctuation.js` |
| AI句式预检脚本 | `story-review/scripts/check-ai-patterns.js` |

### 内置审查基准包（路径不可读时必用）

如果上述参考文件在当前项目中不可读，**不要把审查降级为无 rubric，也不要在报告里说“无法加载具体 rubric”后停止使用标准**。必须使用本节内置基准包，并报告：`Rubric Source: embedded fallback`。

通用网文内容 rubric：
- 核心卖点：本章是否围绕明确卖点推进；看不出卖点至少 S2。
- 冲突推进：本章是否有阻碍、选择、代价或关系变化；只解释/闲聊/总结至少 S2。
- 情绪曲线：是否有铺垫、升温、释放或反转；情绪平直或突兀至少 S2/S3。
- 钩子与期待：开头或结尾是否制造后续问题；没有悬念或未完成期待至少 S2。
- 角色动机：行为是否符合目标、性格、处境和关系压力；为剧情服务而失真是 S1/S2。
- 对话质量：是否有潜台词、信息控制、角色差异；说明书式对话至少 S2。
- 设定一致性：不违背已写规则、时间线、角色属性；明确事实冲突通常 S1。
- 文字自然度：具体、可感、动作承载信息；AI 腔、陈词滥调、总结体按影响定 S2/S3。
- 标点节奏：标点是否服务语气/人物声线；通篇句号化、随机堆砌问号/感叹号，或残留 `……`/`——` 硬造停顿，按影响定 S3/S2。
- 具体字数表达校验：正文用“这五个字 / 短短四字 / 三个字一落 / 八个字砸下去”等具体字数表达评价台词、题字、信件、念头或弹幕时，必须能确认统计口径、机器核对结果和叙事必要；不能确保字数计算正确时，按文字自然度问题处理，建议改成“这句话一落”“那几个字”“话音落下”等非具体数字表达。
- 格式可读性：段落短、对话独立、无多余空行；格式阻碍阅读按 S3，严重混乱按 S2。
- 最小剧情循环：目标 → 阻碍 → 行动 → 代价/反馈 → 新期待；缺少目标/阻碍/反馈通常至少 S2。
- 高潮构建：蓄能 → 假胜 → 崩解 → 反转/兑现；高潮直接平铺、无代价或无兑现通常 S2/S3。
- 关系/好感度：互动尺度必须匹配当前关系阶段；越界亲密、突然信任、突然敌对都需要铺垫，否则按影响定 S1/S2。
- 伏笔与连载期待：伏笔状态需可追踪；伏笔密度只作为结构风险提示，除非直接造成理解混乱，否则不升级到 S2+。

AI 味 / 禁用词 fallback 速查：
- 高频套话：`命运的齿轮开始转动`、`心猛地一沉`、`眼神复杂`、`深刻变化`、`踏上新的旅程`。
- 章末总结体：`这一切都说明...`、`他终于明白...`、`新的篇章开始了...`。
- 信息倾倒：角色直接说“我要解释世界观/规则/关系变化”。
- 论文体/万能结论：过度使用“然而、与此同时、不可否认、这意味着”。
- 处理原则：有原文证据才输出 finding；给出可执行替换方向，不只评价“AI 味重”。

平台 fallback 摘要：
- 番茄：强开局、强冲突、高频爽点/情绪反馈、低理解门槛。
- 起点：设定自洽、升级路径、长线期待、世界观承载力。
- 知乎盐言：短篇钩子、反转密度、情绪兑现、信息差推进。

### 传给子 Agent 的规则

full/lean 模式下，主会话必须把“审查基准包摘要”直接写进每个 Agent prompt。**不要要求子 Agent 必须读取 `story-review/references/*` 才能完成任务**；如需补充，只读取本 Skill 的 `story-review/references/*`，最终遵守注入的 rubric 摘要和统一 Findings Schema。

---

## Phase 1：收集待审查内容

1. **确定审查范围**：
   - 用户指定了章节/文件 → 只审查指定内容。
   - 用户未指定 → 优先审查最近修改的正文文件（`git diff --name-only` 中的正文/设定/大纲相关文件），否则审查当前书的当前章节。
2. **范围传递策略**：
   - 优先把文件路径、章节名、行号范围传给 reviewer，不要把整本或大量章节完整复制进每个 prompt。
   - 单文件或短片段可附 300-1200 字关键摘录。
   - 多章/整卷/整本审查必须分批：按章节或文件组拆分，每批输出独立 findings，再综合。
   - **跨批连续性（分批必做）**：审每一批前，先读 `追踪/伏笔.md` 里「已埋未回收 / 未埋」且预计回收章 ≤ 本批末章的开放项，连同上一批 findings 摘要，作为「继承的开放项」注入本批 reviewer / consistency-checker prompt（与既有「已知角色」并列）——这样审 200-300 时能看见 1-200 埋下、本批本该兑现却悬空的钩子/伏笔/未完成剧情，跨批不断线。审完把本批新发现、且不在 `伏笔.md` 里的开放钩子补登记进 `追踪/伏笔.md`（续写/import 工程常见 reviewer 先于写手发现）。
   - **乱序/重叠审查提醒**：若已审过靠后的范围（如先审 300-400），之后审靠前的范围（200-300）时，只有当本批**新增/改动了一个开放项、且其预计兑现章落在已审过的靠后范围内**，才提醒用户「200-300 的改动可能影响已审的 300-400」，并让用户选择复审受影响章节 / 全量复审 / 仅记为待办——**默认记为待办，不盲目全量重跑**。无具体跨范围依赖时不提醒。
3. **读取相关支撑材料**：正文、相关设定、角色档案、大纲、追踪/上下文、伏笔文件；缺失时在报告中标记证据不足。
4. **识别目标平台并加载 rubric**：
   - 优先使用用户显式指定的平台。
   - 其次读取项目文档里的 `目标平台` / `平台` 字段，例如 `设定/题材定位.md`、`大纲/`、`拆文报告` 等。
   - 不要把 `.active-book` 当作平台来源；它只能辅助定位当前书名目录。
   - 番茄小说 → 优先读取 `story-review/references/rubrics/fanqie.md`；不可读时使用内置番茄 fallback 摘要。
   - 起点 → 优先读取 `story-review/references/rubrics/qidian.md`；不可读时使用内置起点 fallback 摘要。
   - 知乎盐言 → 优先读取 `story-review/references/rubrics/zhihu.md`；不可读时使用内置知乎 fallback 摘要。
   - 未识别平台 → 优先读取 `story-review/references/quality-rubric.md`；不可读时使用内置通用网文内容 rubric，并报告 `Rubric: generic web-fiction` 与 `Rubric Source: file | embedded fallback`。
5. **形成审查基准包摘要**：把已加载的文件内容或内置 fallback 摘要压缩为 5-12 条审查标准，后续 solo 和子 Agent 都必须使用这份摘要。
6. **确定性预检（只报告，不修改）**：当审查范围包含本地正文文件路径时，运行本 skill 自带脚本：
   ```bash
   node scripts/normalize-punctuation.js --check <正文文件...>
   node scripts/check-ai-patterns.js --check --fail-on=blocking <正文文件...>
   node scripts/check-degeneration.js --check <正文文件...>
   ```
   - 将 `ellipsis`、`double-hyphen`、`markdown-divider` 结果作为 `format` findings 合并进报告。`em-dash` 破折号只采用 `check-ai-patterns.js` 的语义改写建议（见下条）；`normalize-punctuation.js` 报的同一位置 `em-dash` 在合并时去重丢弃，避免同处出现「机械替换」与「按功能改写」两条相互冲突的 finding。另外人工检查标点节奏是否通篇句号化或随机堆砌，脚本不替代语气判断。
   - `check-ai-patterns.js` 的 findings 合并进 `prose`：severity=blocking 的类别一律按 S2（当前为 `not-is-comparison` / `em-dash` / `voice-contrast` / `negation-parade` / `reverse-not-is` / `trailer-ending`），修法直接采用检测器输出的建议（删否定铺垫/反差腔/排比否定/章尾预告腔，直接写后项或具体动作；破折号按功能改成动作/短句/逗号/冒号）。
   - 其余 prose findings 统一按 S4：只指出读感风险，不替代人工判断；功能性写法标 `[需复核]` 并保留。完整类别和修法见 `anti-ai-writing.md`。
   - `check-degeneration.js` 报告模型退化（逐字复读/截断/占位符/工程词泄漏），每条带 `severity: blocking|advisory`：blocking（复读/截断/tier1 工程词）作为 S1/S2 `prose` findings，修复建议是「重新生成该段，不是改写」；advisory（tier2 章节/歧义词）作为 S4。
   - `story-review` 不修改文件；需要自动修复时建议转 `/story-deslop`。
   - 默认 `--quote-mode keep`，不把知乎盐言短篇的 `「」` 当作问题；只有项目明确指定引号风格时才检查对应转换建议。
   - 这些脚本都是 `story-review` 的本地副本，不引用其他 skill 的文件。

**story-explorer 预查询（可选）**。仅当 `Effective Mode` 仍为 `full`/`lean`、当前允许 spawn 且 Agent/Task 工具可用时，才可检查 agent 目录（优先 `.claude/agents/`，其次 `.opencode/agents/`，再检查 `.codex/agents/`）下的 `story-explorer.md` 或 `story-explorer.toml` 并 spawn `story-explorer` 预查设定摘要；`solo` 或子代理递归保护场景下不得 spawn，只能直接 Read/Grep。Prompt 示例：

```text
项目目录：{dir}
查询类型：setting_appearances
查询参数：{审查涉及的设定关键词}
```

此步可选，跳过不影响审查流程。

---

## 统一 Findings Schema（所有模式必须使用）

所有 reviewer（包括 solo）输出问题时必须使用统一结构，方便综合排序。`location` 必须使用工具读取结果显示的原始文件行号；不要删除空行后重新编号。

对 `consistency` / `factual` / `causal` / `rule_boundary` 类 finding，`fix` 字段只写事实统一方向（例如“统一为左臂旧伤，并同步正文/设定中冲突处”或“需在 A/B 时间线中裁定一个来源”），不要写文学创作建议。

```yaml
- severity: S1 | S2 | S3 | S4
  category: structure | character | prose | consistency | platform | factual | format | causal | rule_boundary
  location: 文件路径:行号 或 章节/段落描述
  evidence: "引用原文或具体证据"
  issue: "问题描述"
  fix: "可执行修改建议"
```

严重度定义：
- **S1**：会破坏主线、角色动机、世界规则或读者信任，需优先修。
- **S2**：明显影响章节效果、留存、节奏、人物可信度，建议本轮修。
- **S3**：局部质量问题，如措辞、轻微格式、局部节奏，可排期修。
- **S4**：建议项或风格微调，不阻塞发布。

---

## Phase 2：并行 Spawn Agent（full/lean 模式）

使用 Agent/Task 工具并行调用（Codex 原生子代理使用 `agent_type`，Claude Code 兼容面使用 `subagent_type`；实际字段以当前 CLI 暴露的工具为准）。每个 Agent 不继承父对话上下文，prompt 必须自包含项目路径、审查范围、文件路径、必要摘录、审查基准包摘要、Rubric Source 和统一 Findings Schema。

**调用规则**：执行 Phase 0 后，只有实际模式仍是 full/lean 时才 spawn。不要 spawn 缺失 Agent。

**Agent 1: story-architect**（subagent_type: story-architect）
- full/lean 均调用。
- 审查视角：主题对齐、大纲结构、钩子/反转质量、范围控制、平台期待。
- 提示指令：
  ```
  你是 story-architect，从故事架构层面审查以下内容。
  你的任务是【找问题】，不是验证正确性。以最严苛的标准审视。
  项目路径：{项目根}
  审查范围：{文件路径/章节/必要摘录}
  审查基准包摘要：{Phase 1 形成的 rubric / fallback 摘要，必须内联}
  Rubric Source: file | embedded fallback
  相关文件路径：{设定/大纲/细纲文件路径}
  继承的开放项（分批审查必填，无则写「无」）：{从 追踪/伏笔.md 提取的、预计回收章 ≤ 本批末章的已埋未回收/未埋钩子，连同上一批 findings 摘要}
  可选补充参考：本 Skill 的 `story-review/references/quality-checklist.md`、`story-review/references/plot-core-methods.md`；若不可读，不影响审查。
  检查项：
  1. 这一章是否推进了故事主题？
  2. 大纲结构是否完整（钩子/爽点/悬念）？
  3. 情绪节奏是否合理？
  4. 钩子和反转设计质量如何？
  5. 范围控制：有无角色/设定膨胀？
  6. 剧情循环是否存在且可重复？（参照审查基准包摘要里的剧情循环原则）
  7. 高潮场景是否用了蓄能→假胜→崩解结构？（参照审查基准包摘要里的高潮构建原则）
  8. 伏笔密度、连载期待和结构信息量是否合理？（伏笔密度通常只作为 S4 结构风险，除非已造成理解混乱）
  9. 按平台 rubric 或通用内容 rubric 逐项对照，标记 PASS/FAIL。
  10. 继承的开放项里，本批本该兑现的钩子/伏笔是否落空？

  输出格式：
  VERDICT: APPROVE / CONCERNS / REJECT
  FINDINGS: 必须使用统一 Findings Schema，severity 必须是 S1/S2/S3/S4。
  INHERITED_ITEMS: 逐条列继承的开放项 + 已检查 / 未能检查；本批本该兑现却落空的列为 finding。
  RECOMMENDATIONS: [修改建议]
  ```

**Agent 2: character-designer**（subagent_type: character-designer）
- full 模式调用。
- 审查视角：角色语言风格一致性、对话质量、人物弧线、关系推进。
- 提示指令：
  ```
  你是 character-designer，从角色和对话层面审查以下内容。
  你的任务是【找问题】，不是验证正确性。以最严苛的标准审视。
  项目路径：{项目根}
  审查范围：{文件路径/章节/必要摘录}
  审查基准包摘要：{Phase 1 形成的 rubric / fallback 摘要，必须内联}
  Rubric Source: file | embedded fallback
  相关角色文件：{角色设定文件路径}
  可选补充参考：本 Skill 的 `story-review/references/character-relations.md`、`story-review/references/dialogue-mastery.md`；若不可读，不影响审查。
  检查项：
  1. 角色语言风格是否与语言风格档案一致？
  2. 对话是否千篇一律或信息过满？
  3. 人物弧线是否连贯？
  4. 角色行为是否符合其动机？
  5. 对话是否有潜台词和信息控制？
  6. 爱情线好感度与 CP 行为是否匹配？（参照审查基准包摘要或本 Skill 的角色关系参考）
  7. 好感度进度是否可感知？
  8. 对话三症状（可选读 `story-review/references/dialogue-mastery.md` 自查项）：① 机械对话/问答式/句间无情绪承接；② 角色当「科普嘴」整段讲设定原理(Gate G 同样管台词)；③ 说话不分场合(高压/生死 beat 的玩笑、口头梗、插科打诨出戏)。命中按 S2/S3 报具体引用+改法。

  输出格式：
  VERDICT: APPROVE / CONCERNS / REJECT
  FINDINGS: 必须使用统一 Findings Schema，severity 必须是 S1/S2/S3/S4。
  RECOMMENDATIONS: [修改建议]
  ```

**Agent 3: narrative-writer**（subagent_type: narrative-writer）
- full 模式调用。
- 审查视角：AI味检测（含解释腔/上帝感/安排感=模式 8）、情绪烈度（够不够爽/会不会太保守）、格式合规、节奏均匀度、文字自然度。
- 提示指令：
  ```
  你是 narrative-writer，从文字质量层面审查以下内容。
  你的任务是【找问题】，不是验证正确性。以最严苛的标准审视。
  项目路径：{项目根}
  审查范围：{文件路径/章节/必要摘录}
  审查基准包摘要：{Phase 1 形成的 rubric / fallback 摘要，必须内联}
  Rubric Source: file | embedded fallback
  AI 味 / 禁用词摘要：{从 anti-ai-writing、banned-words 或内置 fallback 提取，必须内联}
  可选补充参考：本 Skill 的 `story-review/references/anti-ai-writing.md`、`story-review/references/banned-words.md`、`story-review/references/quality-checklist.md`；若不可读，不影响审查。
  检查项：
  1. 是否存在禁用词/套话/陈词滥调，或“像/好像/仿佛/如同”式比喻成片堆叠？
  2. 是否出现 AI 写作指纹、8 种 AI 写作模式（含模式 8 解释腔/上帝视角/安排感）或章末总结体？
  3. 格式是否合规（按戏剧单元/镜头自然断段、无机械字数切分、无空行、对话独立成行、主语节奏自然）？
  4. 标点节奏是否匹配语气/人物声线：是否通篇句号化、随机堆砌问号/感叹号，或残留 `……`/`——` 硬造停顿？正文（含对话）里的破折号是否已清理？
  5. 是否出现“这五个字 / 短短四字 / 三个字一落 / 八个字砸下去”等正文内具体字数表达？若统计口径不明、未见机器核对结果或无叙事必要，标为问题并建议改成非具体数字表达。
  6. 节奏是否均匀（有无连续多节无情绪变化）？
  7. 是否存在删掉无损的任务卡点或流程细节？若只是水/局部节奏问题标 S3；明显拖垮主线推进标 S2。
  8. 身体部位同一词是否超 5 次？
  9. AI味分级（轻度/中度/重度）及证据。
  10. 去 AI 补充复核：是否有作者解释总结/意义尾巴；是否连续堆精致戏剧反应短语；是否把已有手机/屏幕/公告/规则/证据载体改成叙述者解释；是否把任务卡点当成自然感或凑字数手段；是否机械删除了有功能的生活化/角色化比喻或短篇主观审判句。

  输出格式：
  VERDICT: APPROVE / CONCERNS / REJECT
  FINDINGS: 必须使用统一 Findings Schema，severity 必须是 S1/S2/S3/S4；AI味级别写入 issue 或 category。
  RECOMMENDATIONS: [修改建议]
  ```

**Agent 4: consistency-checker**（subagent_type: consistency-checker）
- full/lean 均调用。
- 审查视角：grep-first + 推理型一致性检测，输出 S1-S4 报告。
- 提示指令：
  ```
  你是 consistency-checker，使用 grep-first + 推理型一致性审查检测事实矛盾。
  你的任务是【找事实矛盾、状态断线和需要推理才能发现的设定逻辑冲突】，不做创作评判，不评价文学质量，不输出创作修改建议。
  项目路径：{项目根}
  审查范围：{文件路径/章节/必要摘录}
  已知角色：{从设定文件提取角色列表}
  继承的开放项（分批审查必填，无则写「无」）：{从 追踪/伏笔.md 提取的、预计回收章 ≤ 本批末章的已埋未回收/未埋伏笔，连同上一批 findings 摘要}
  审查基准包摘要：{Phase 1 形成的 rubric / fallback 摘要，必须内联}
  Rubric Source: file | embedded fallback
  可选补充参考：本 Skill 的 `story-review/references/quality-checklist.md`；若不可读，不影响事实冲突扫描。
  检查项：
  1. 角色属性是否前后一致？
  2. 世界规则是否被违反？
  3. 伏笔状态是否前后一致（已埋/计划回收/已回收/断线）？
  4. 时间线是否自洽？
  5. 术语、身份、地点、能力边界是否前后一致？
  6. 继承的开放项里，本批本该回收的伏笔是否仍悬空？

  输出格式：
  VERDICT: APPROVE / CONCERNS / REJECT
  FINDINGS: 必须使用统一 Findings Schema，severity 必须是 S1/S2/S3/S4；category 只能使用 consistency / factual / format / causal / rule_boundary。
  INHERITED_ITEMS: 逐条列继承的开放项 + 已检查 / 未能检查；本批新发现、不在 伏笔.md 的开放钩子单列，供主会话回写 追踪/伏笔.md。
  FACTUAL_RECONCILIATION: [仅列需统一的事实来源或需人工裁决项，不写文学创作建议]
  REASONING_CHAINS: [仅列推理型 finding 的前提/规则 -> 触发事件 -> 矛盾点 -> 需裁决问题]
  ```

---

## Phase 3：综合裁决

1. 收集实际执行的 reviewer VERDICT 和 FINDINGS。
2. 合并去重：按 `severity` 排序（S1 > S2 > S3 > S4），同级内按影响范围排序。
3. **可选事实核查**：如果审查内容涉及需要验证的外部事实（历史年代、地理方位、职业细节等），只有在 `Effective Mode` 仍为 `full`/`lean`、当前不是子 Agent、Agent/Task 工具可用且 agent 目录（优先 `.claude/agents/`，其次 `.opencode/agents/`，再检查 `.codex/agents/`）下的 `story-researcher.md` 或 `story-researcher.toml` 已部署时，才可额外 spawn `story-researcher` 搜索验证；`solo`、missing/malformed/stale/spawn failed 降级或子代理递归保护场景下不得 spawn，只能在报告中标记“需人工事实核查”。
4. **分歧呈现**：如果 reviewer 间有冲突意见，明确呈现分歧让用户裁决；不要自动妥协。
5. 输出综合审查报告。报告必须列出实际模式、fallback 原因、使用的 rubric、Rubric Source、审查范围和证据不足项。

---

## Phase 4：输出报告（full / lean 模式）

只有 `Effective Mode` 确实为 `full` 或 `lean` 时才使用本模板；如果 Phase 0 或运行时失败导致降级 `solo`，必须改用 solo 模式模板。

注意：下列 `Requested Mode`、`Effective Mode`、`Fallback`、`Rubric`、`Rubric Source` 五个英文 key 必须逐字保留；不要改成“请求模式/实际模式/回退/评估标准”等中文 key。

```md
=== 故事审查报告 ===
Requested Mode: full | lean
Effective Mode: full | lean
Fallback: none
Rubric: fanqie | qidian | zhihu | generic web-fiction
Rubric Source: file | embedded fallback
审查范围: {章节/文件/批次}

## Verdict Summary / 结论汇总
- story-architect: APPROVE / CONCERNS(n) / REJECT / NOT_RUN
- character-designer: APPROVE / CONCERNS(n) / REJECT / NOT_RUN
- narrative-writer: APPROVE / CONCERNS(n) / REJECT / NOT_RUN
- consistency-checker: APPROVE / CONCERNS(n) / REJECT / NOT_RUN

> `NOT_RUN` 只用于 lean 模式排除的 reviewer 或可选 reviewer；如果 full/lean 必需 reviewer 缺失或 spawn 失败，应降级 solo，而不是在 full/lean 报告中标记 NOT_RUN 后继续综合。

## Severity Counts
- S1: n
- S2: n
- S3: n
- S4: n

## 综合评定
APPROVE(通过) / CONCERNS(有问题) / REJECT(需重写)

## 发现的问题
{按统一 Findings Schema 或等价表格列出所有问题}

## Agent 分歧（如有）
{列出 reviewer 间不同意见和证据}

## 证据不足 / 需补充
{缺失设定、缺失大纲、无法核查事实等}

## 修改建议
{按 S1→S4 优先级排列}
```

---

## lean 模式

lean 模式只 spawn `story-architect` + `consistency-checker`。如果任一缺失，按 Phase 0 自动降级 solo。其余流程同 full。

---

## solo 模式

不 spawn Agent。先按 Phase 1 第 4 步识别目标平台并加载对应 rubric；即使是 solo，也必须用平台 rubric、`story-review/references/quality-rubric.md` 或内置审查基准包校准判断。

solo 必须执行基础检查：
1. 格式合规性检查（戏剧单元/画面分段、无机械字数切分、无空行、对话格式、主语/角色名节奏）。
2. 简单的设定一致性 grep（角色名、属性、关键设定、伏笔关键词）+ 推理型一致性检查（规则边界、设定层级、跨章因果链、可滥用漏洞、代价一致性）。
3. AI 味与禁用词检查（优先读取 `story-review/references/banned-words.md` 与 `story-review/references/anti-ai-writing.md`，不可读时使用内置 AI 味 / 禁用词 fallback 速查）。
4. 通用网文内容评分（优先读取 `story-review/references/quality-rubric.md`，不可读时使用内置通用网文内容 rubric）。
5. 按统一 Findings Schema 输出简化版报告。

### solo 模式输出格式

注意：下列 `Requested Mode`、`Effective Mode`、`Fallback`、`Rubric`、`Rubric Source` 五个英文 key 必须逐字保留；不要改成“请求模式/实际模式/回退/评估标准”等中文 key。

```md
=== 故事审查报告（solo）===
Requested Mode: {full | lean | solo}
Effective Mode: solo
Fallback: none | missing agents -> solo | malformed agents -> solo | stale agents -> solo | agent tool unavailable -> solo | spawn failed -> solo | subagent recursion guard -> solo
Rubric: fanqie | qidian | zhihu | generic web-fiction
Rubric Source: file | embedded fallback
审查范围: {章节/文件}

## 基础检查结果

### 格式合规性
- [{x| }] 段落按戏剧单元/镜头/一件事结束自然断开，非机械按字数切分；偶发稍长的完整推理/氛围/情绪链不算违规，通篇同阈值切段或碎成提纲才算：通过/不通过；证据：...
- [{x| }] 主语/角色名节奏自然：段首能建立主语，段中有代词/省略，关键转折再点名；连续句/段无必要重复同一主角名才算主语过密：通过/不通过；证据：...
- [{x| }] 无段间空行：通过/不通过；证据：...
- [{x| }] 对话独立成行：通过/不通过；证据：...
- [{x| }] 具体字数表达已确认统计正确且有叙事必要；不能确认时已改成非具体数字表达：通过/不通过；证据：...
- 违规位置：{列出}

> checklist 约定：`[x]` 只表示通过，`[ ]` 表示未通过；不得出现“`[x] ... 不通过`”这种矛盾写法。

### 设定一致性（grep + 推理扫描）
- 字面事实冲突：{列出发现的矛盾或证据不足}
- 推理型一致性：{规则边界/设定层级/跨章因果/可滥用漏洞/代价一致性的发现；无则写“未发现”}

### AI 味 / 禁用词
- {列出问题，必须附 evidence}

### Findings
{按统一 Findings Schema 或等价表格列出，severity 必须是 S1/S2/S3/S4}

### 修改建议
{按优先级排列}
```

---

## 流程衔接

**流水线：** 通用
**位置：** 审查（写作之后）

| 时机 | 跳转到 | 命令 |
|---|---|---|
| 要修改查出的问题 | story-long-write / story-short-write | 返回对应写作 skill 修改 |
| 发现 AI 味需清理 | story-deslop | `/story-deslop` |
| 需要重新拆解对标书 | story-long-analyze / story-short-analyze | `/story-long-analyze` 或 `/story-short-analyze` |

---

## 语言

- 跟随用户的语言回复，用户用什么语言就用什么语言回复。
- 中文回复遵循《中文文案排版指北》。
