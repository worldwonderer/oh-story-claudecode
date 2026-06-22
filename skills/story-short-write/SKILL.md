---
name: story-short-write
version: 1.0.0
description: |
  短篇网文写作。辅助短篇小说创作，从构思到成稿，聚焦情绪拉扯与节奏把控。
  触发方式：/story-short-write、/写短篇、「帮我写一篇短篇」「写个盐言故事」
metadata:
  openclaw:
    source: https://github.com/worldwonderer/oh-story-claudecode
---

# story-short-write：短篇网文写作

你是短篇网文写作执行器。从构思到成稿，完成一篇完整的短篇小说。

**执行规则：短篇以情绪为目标，所有内容为情绪服务。**

---

## 执行规则

1. **先定情绪，再定故事**。动笔前必须确定目标情绪（意难平/反转震撼/爽感释放/治愈温暖/细思极恐/共鸣感动），所有内容为这个情绪服务。
2. **一个反转撑一篇**。所有铺垫为反转服务，所有情绪为反转蓄力。不多线、不铺世界观。
3. **每句话必须有用**。不推动剧情、不铺垫反转、不推高情绪的句子 → 删。
4. **开头 3 句定生死，结尾定传播**。开头必须包含钩子，结尾必须有余韵。
5. **默认第一人称**。短篇网文（盐言/七猫短篇等）绝大多数用第一人称，代入感最强。除非题材明确需要第三人称（如多视角悬疑），否则一律用「我」。

---

## 格式规范（最高优先级）

详细规则见 `references/format-and-structure.md`，写作前必须加载。**主会话与 narrative-writer 子代理使用同一套正文格式**：正文只允许保存在 `正文.md`，正文相邻段落之间只允许一个换行符 `\n`（不得出现空行/`\n\n`），对话引号风格按项目/平台约定统一（默认半角双引号，盐言可用「」），短篇小节标记全文统一（默认 `###1.`/`###2.`）。如果子代理输出与主会话格式不一致，按本格式规范重排后再写入文件。

---

## 核心方法

除了上面的执行规则，构思和写作时遵循：

- **从验证过的模式出发**：有对标书就先拆解，没有就从题材框架（genre-catalog.md）找对应的剧情模式
- **用模块组装**：铺垫段、升级段、反转段各有成熟写法，不要重新发明。参考 genre-writing-formulas.md 对应题材
- **只加载必需信息**：写每节前明确目标情绪和要用的技法，答不出就先回读参考

---

## 写作流程

### Phase 1：确定情绪目标

问用户：**「你想让读者读完什么感觉？有没有想写的题材方向或灵感？」**

如果用户有明确想法 → 直接进入 Phase 2。

如果用户只有模糊想法 → 帮用户做情绪选择：

| 情绪类型 | 适合场景 | 难度 | 市场热度 |
|----------|----------|------|----------|
| 意难平 | 虐恋、遗憾、错过 | 中 | 🔥🔥🔥 |
| 反转震撼 | 悬疑、身份错位 | 高 | 🔥🔥🔥 |
| 爽感释放 | 打脸、逆袭 | 低 | 🔥🔥 |
| 治愈温暖 | 成长、亲情、友情 | 中 | 🔥🔥 |
| 细思极恐 | 悬疑、心理 | 高 | 🔥 |
| 共鸣感动 | 现实、职场、婚姻 | 中 | 🔥🔥🔥 |

---

### Phase 2：构思核心框架

> 如果用户有参考小说，先用 `/story-short-analyze` 拆解。默认输出存入项目根目录 `拆文库/{书名}/`；如用户指定当前短篇引用目录，则可输出/同步到 `{短篇标题}/对标/{书名}/`。写作时会自动查找并读取这些拆文结果，不需要用户手动复制到 prompt。

#### 对标上下文加载

> **拆文库/对标关系**：`拆文库/` = analyze skill 的原始产出（数据源），位于项目根目录。`对标/` = 当前短篇的引用视图，位于 `{短篇标题}/对标/`。短篇写作优先读取 `{短篇标题}/对标/{书名}/`，不存在则回退项目根 `拆文库/{书名}/`，再回退 `{短篇标题}/拆文库/{书名}/`（兼容旧结构）。

推荐目录结构：

```
项目根/
├── 拆文库/
│   └── {书名}/
│       ├── 拆文报告.md
│       ├── 情节节点.md
│       └── 写作手法.md
└── {短篇标题}/
    ├── 设定.md
    ├── 小节大纲.md
    ├── 正文.md
    └── 对标/
        └── {书名}/
            ├── 拆文报告.md
            ├── 情节节点.md
            └── 写作手法.md
```

如果工作目录下存在 `对标/` 或项目根存在 `拆文库/`，或用户提到参考小说：

1. 按上述顺序查找 `拆文报告.md`、`情节节点.md`、`写作手法.md`
2. 读取核心发现：结构段落、情绪曲线、反转位置、铺垫方式、句式节奏、可借鉴技法
3. 写入本篇 `设定.md` 的“对标摘要”区，写作时每个场景从中召回 1-2 个相关技法
4. 如只找到原文、未找到拆文报告，提示用户先运行 `/story-short-analyze`；如用户要求继续，也可只按原文做弱参考

> **拆文产出格式**：analyze 落盘的完整文件树、`_meta.json` schema、Stage→文件映射，以及「story-short-write 怎么读这些产出」的下游消费规范，见 [references/output-contract.md](references/output-contract.md)。

<!-- cross-book-recall:trigger:structure-positioning -->
> **多对标书时**：参 `references/cross-book-recall.md`，副对标 anchor 入「对标摘要」区

#### Agent 调用：story-architect

构思阶段，如果项目已部署 story-architect agent（优先检查 `.claude/agents/` 下的 `story-architect.md` 是否存在；不存在时再检查 `.opencode/agents/`），可 spawn `Agent(subagent_type: "story-architect", prompt: "项目目录：{dir}\n任务类型：短篇构思\n查询参数：{情绪目标+题材方向}")` 辅助框架设计。如 agent 不可用，由主线程直接执行。

帮用户确定短篇的核心框架：

```
## 短篇核心框架

### 基本信息
- 标题（暂定）：{}
- 目标字数：{} 字（短篇通常 8000-20000 字）
- 目标平台：{}
- 情绪目标：{读者读完的感受}

### 一句话梗概
{主角 + 困境 + 反转 + 情绪落点}

### 核心反转
- 反转类型：{身份反转/视角反转/动机反转/时间线反转}
- 反转内容：{一句话描述}
- 铺垫线索：{至少 3 个铺垫点}

### 情绪设计
- 开头情绪：{}（强度 {1-10}）
- 中段情绪：{}（强度 {1-10}）
- 反转情绪：{}（强度 {1-10}，峰值维持 ≥2 节）
- 结尾情绪：{}（强度 {1-10}）
- 反转高潮不要骤降：反转前 1 节开始升温，反转节达到峰值，反转后 1 节维持峰值不骤降

### 人设速写
- 主角：{一句话人设}
- 关键角色：{一句话人设}
- 关系：{他们之间的关系}
```

框架确定后，完成设计任务，然后在工作目录下创建文件。

#### 设计任务（框架确定后执行）

详细步骤和模板见 `references/writing-workflow.md`。构思时从目标情绪反推剧情，不是从灵感正向构建。按顺序完成：

1. 设计贯穿道具（1-2 个）→ 加载 `writing-craft.md`
2. 设计反派（如有）→ 加载 `villain-and-reveal.md`
3. 确定揭露方式 → 同上
4. 编写 小节大纲.md（格式见 writing-workflow.md）：短篇只做轻量蓝图，每节包含结构段/五段功能、人物/关系变化、因果/逻辑链、结尾承接/钩子，不套长篇完整章节蓝图
5. 反转信息差验证（公式见 writing-workflow.md）
6. 伏笔回查清单（标准见 writing-workflow.md）

#### Agent 调用：character-designer

设计任务完成后，如果项目已部署 character-designer agent（优先检查 `.claude/agents/` 下的 `character-designer.md` 是否存在；不存在时再检查 `.opencode/agents/`），可 spawn `Agent(subagent_type: "character-designer", prompt: "项目目录：{dir}\n任务类型：角色设定\n查询参数：{人设速写+关系}")` 辅助角色设定和语言风格档案。如 agent 不可用，由主线程直接执行。

---

### Phase 3：逐场景写作

**项目文件结构**：

```
{短篇标题}/
├── 设定.md              ← Phase 2 产出（含对标摘要）
├── 小节大纲.md          ← Phase 2 产出
├── 正文.md              ← Phase 3 产出
└── 对标/                ← 当前短篇引用视图（可选）
    └── {书名}/
        ├── 拆文报告.md
        ├── 情节节点.md
        └── 写作手法.md
```

**拆文结果自动使用规则**：执行写作前必须按“对标上下文加载”顺序扫描 `{短篇标题}/对标/{书名}/`、项目根 `拆文库/{书名}/`、`{短篇标题}/拆文库/{书名}/`。找到拆文报告时，把“结构/情绪/反转/写作手法”作为技法参考；找到结构化子目录时，按当前小节目标检索最相关模块。

> 术语说明：Phase 3 按「段」划分叙事结构（开头段/铺垫段/升级段/反转段/结尾段），每段包含若干「小节」（数字编号的 beat）。「场景」指写作时的具体画面。

**写前准备**（每个场景写前执行 2 步，是核心方法的落地：确认情绪目标 → 召回技法模块）：
- **步骤 1：记忆+召回**：① 本场景目标情绪词？② 借鉴哪个参考文件的哪个技法？③ 具体用在哪个段落？答不出 → 先回读参考再动笔。如有 `对标/` 或 `拆文库/` 结构化产出，按“对标上下文加载”规则检索与当前场景最相关的结构/情绪/反转/写作手法模块作为参考，并写入“拆文召回摘要”
  <!-- cross-book-recall:trigger:tempo-section -->
  - **多对标书时**：参 `references/cross-book-recall.md`，副对标/参考对标按阶段预算进入"副对标召回摘要"；正文只传摘要，不传副书文风或原文
- **步骤 2：指令确认**：用一句话概括本场景写作意图（情绪+技法+适配段落），确认后开始写作

**写作指令：按三维度揉进逐场景写作，不照搬大纲腔。每个场景让读者和主角一起经历。三个维度（发生、感知、反应）同时揉进同一段连续正文，不按维度分段，不用"先写发生再补感知"的方式写作。揉进后仍必须按戏剧单元/画面分段：一段承载一个完整动作-信息变化或一条连续推理/氛围/情绪链，不按固定字数强拆。输出前做自然节奏重排：场景/一件事结束才分段；新动作、新线索、新对话、视线切换另起；完整推理、氛围铺陈、情绪变化可保留稍长段。高潮/打脸/反转压短，沉淀/推理/收束允许长一点，爽点 beat 写密、过场 beat 写疏，忌通篇同长度或同一阈值切段（见 writing-craft.md「疏密分配」）。主语节奏：段首或主语重置时可用主角名；同一动作链内优先代词/省略；关键转折再点名强调，避免连续句/段无必要重复主角名。标点节奏：按语气标点谱系执行，避免通篇句号化，也禁止随机堆砌问号/感叹号；质问用问号，爆发处少量感叹；犹豫、未尽、打断或拖长用动作停顿、短句、换行处理，正文产物不使用 `……` / `——` / `—` / `--`。叙述姿态锁深度限知此刻感知，不跳出解释因果/不剧透预告/不替读者总结升华（去说教·上帝感·安排感，见 anti-ai 模式8/Gate G）；情绪宁烈不温，冲突前置、爽点要狠要具体、台词带刺，敢写极端反应不点到为止（以克制为爽感的题材如虐文/世情除外，按 genre-catalog 走克制路线）。**

#### Agent 调用：narrative-writer

正文写作阶段默认由主会话按 2-3 节/批分批写正文，主会话输出是短篇正文的标准形态。不要要求单次 agent spawn 完成 8000+ 字全文。每批写完后先更新“已写小节摘要”（3-5 条：已揭示信息、情绪位置、未回收伏笔、下一批衔接句），下一批必须先读取该摘要和 `正文.md` 尾部 300-500 字再续写。只有在用户明确要求子代理、主会话上下文不足，或需要隔离一段试写时，才优先检查 `.claude/agents/` 下的 `narrative-writer.md` 是否存在；不存在时再检查 `.opencode/agents/`。存在时 spawn `Agent(subagent_type: "narrative-writer", prompt: "项目目录：{dir}\n任务描述：写正文\n输出文件：正文.md\n情绪目标：{从核心框架读取}\n小节大纲：小节大纲.md（读取结构段/五段功能、人物/关系变化、因果/逻辑链、结尾承接/钩子；短篇只用轻量蓝图，不套长篇章节蓝图）\n涉及角色：{从核心框架读取}\n主对标/拆文路径：{本次查找到的主对标 对标/{主对标书}/ 或 拆文库/{主对标书}/，没有则写 无}\n主拆文召回摘要：{本场景最相关的主对标结构/情绪/反转/写作手法模块；按场景相关性压缩，不写固定5条上限；没有则写 无}\n副对标召回摘要：{按 references/cross-book-recall.md 阶段预算筛选后的副对标/参考对标结构化摘要表；可含多本，但只传摘要，不传副书文风/原文；没有则写 无}\n格式硬约束：必须完全遵守 story-short-write/references/format-and-structure.md；全文小节标记统一，默认 ###1.、###2.；正文相邻段落之间只允许一个换行符 `\n`，不得出现空行/`\n\n`；对话独立成行，引号风格按项目/平台约定统一（默认半角双引号，盐言可用「」）；禁止使用 --- 分隔正文片段；禁止把自检/说明/审查报告写入正文.md。\n写作硬约束：禁止先否定再肯定的翻转句式，含省略连接词、跨句或换行变体；按三维度揉进写场景，但仍必须按戏剧单元/画面分段；一段承载一个完整动作-信息变化或一条连续推理/氛围/情绪链，不按固定字数强拆。输出前做自然节奏重排：场景/一件事结束才分段；新动作、新线索、新对话、视线切换另起；完整推理、氛围铺陈、情绪变化可保留稍长段。高潮/打脸/反转压短，沉淀/推理/收束允许长一点，爽点 beat 写密、过场 beat 写疏，忌通篇同长度或同一阈值切段（见 writing-craft.md「疏密分配」）。主语节奏：段首或主语重置时可用主角名；同一动作链内优先代词/省略；关键转折再点名强调，避免连续句/段无必要重复主角名。标点节奏：按语气标点谱系执行，避免通篇句号化，也禁止随机堆砌问号/感叹号；质问用问号，爆发处少量感叹；犹豫、未尽、打断或拖长用动作停顿、短句、换行处理，正文产物不使用 `……` / `——` / `—` / `--`。叙述姿态锁深度限知此刻感知，不跳出解释因果/不剧透预告/不替读者总结升华（去说教·上帝感·安排感，见 anti-ai 模式8/Gate G）；情绪宁烈不温，冲突前置、爽点要狠要具体、台词带刺，敢写极端反应不点到为止（以克制为爽感的题材如虐文/世情除外，按 genre-catalog 走克制路线）。")`。无论由谁写作，最终写入 `正文.md` 前都必须按同一格式规范重排一次，保证主会话与子代理输出格式一致。

⚠️ **硬约束：每节 ≥ 800 字 / 50-65 行**。
题材例外：爽文、打脸、系统流等高信息密度题材可降至 ≥ 500 字/节（见 genre-writing-formulas.md 各题材速查表），但不得低于 500 字。
写完每节后必须统计字数和行数。不足 800 字（高信息密度题材不足 500 字）的节不得跳过，必须补充更多子事件/对话来补足后再写下一节。整篇完成后总字数必须 ≥ 8000 字。
**字数统计必须跨平台可执行：优先使用 Python 字符统计**：`for PYBIN in python3 python py; do "$PYBIN" -c "" 2>/dev/null && break; done; "$PYBIN" -c "from pathlib import Path; print(len(Path('文件路径').read_text(encoding='utf-8')))"`。**不要直接调 `python3`**，Windows 上 `python3` 会落到 Microsoft Store 占位程序、以 exit 49 静默失败；上面的探测会按 `python3→python→py` 选出真正可用的解释器。Windows / DeepSeek / Claude Code 组合下不要让模型自行估算字数；`wc -m` 仅作为 macOS/Linux 备选，禁止使用 `wc -c`（字节数）。如果当前 agent/工具环境没有 Bash/Python 权限，必须明确声明“未完成机器字数验证”，并按行数速算作为临时估计，不得声称已通过字数硬验证。
**⚠️ 字数不足 = 章节未完成。禁止在字数未达标时结束章节。必须继续展开场景直到达标。**

**节数守恒**：正文节数必须等于小节大纲规划节数。不得合并多节为一节。如果写作中发现某节不需要独立存在，应回到大纲阶段调整，而非在写作时偷减。

**节长达标流程**：
1. **写作时**：按三维度揉进写每个子事件——发生、感知、反应揉进同一段连续正文，不按维度分段写
2. **字数不足时**（逐节统计后）：用以下方法补足（优先级从高到低）：
   - 补充更多子事件（回到小节大纲补充）
   - 加一轮对话（参考 writing-craft.md 对话权力模式）
   - 加回忆闪回（1-2 句关联记忆）
   - 加环境物件（通过动作带出，不独立成句）
   - **禁止凑字**：每个添加必须推动情绪/铺垫/代入感，不得灌水。禁止用"加感知层""加反应层"的方式在已有动作上叠加描写

**节长验证（分批写作，每批写完后执行）**：
分批写作：每次输出 2-3 节（2-3 节约为 Claude 单次输出的最佳叙事窗口，过少浪费上下文，过多降低单节质量），写完后统一检查本批所有节的字数。
如果任何一节 < 800 字（高信息密度题材 < 500 字）→ 补充更多子事件/对话来补足后再写下一批。
禁止跳过未达标的小节。

> 批量验证更高效：一次性输出多节能让 AI 保持叙事连贯性，
> 批后统计比逐节暂停更符合 AI 的文本生成特性。

> **节长速算**：平均每行 15 字 × 55 行 ≈ 825 字。写到第 30 行时如果还不到 500 字，说明子事件数量不够，需要补充更多子事件或对话。

每个小节按「三维度揉进」写作（详见 writing-craft.md 第 8 节）：每个子事件将发生、感知、反应三个维度揉进同一段连续正文，子事件合计 ≥150 字。维度揉进不等于按维度分段——禁止"先写发生再补感知再补反应"的堆叠写法；也不等于一段到底，按新动作/新物件/新信息/新对话断段。长度只是诊断，先判断是否完整戏剧单元；混入多个动作/信息才拆，完整推理、氛围或情绪链可以保留稍长段。

**写完后对照 小节大纲.md 检查**：每个子事件三个维度都揉进了？本节情绪到位？伏笔/物件已植入？节长 <800 字 → 补充更多子事件/对话后再写下一节。

按以下结构分段写：

#### 第一段：开头（前 300-500 字）

**目标**：3 句话内抓住读者。**必须包含一个开篇钩子**（从 hooks-chapter.md 选择类型）。

**技法指令**：前 100 字事件密度 ≥ 3，不做背景铺垫，直接上事件链。

**开头零环境规则**（默认适用；悬疑、惊悚、灾难、强氛围题材可例外）：
- 前 3 句禁止出现无事件承载的环境描写（灯光、天气、气味、温度、装修）
- 前 3 句必须是：事件 / 对话 / 动作 / 信息炸弹，四种之一
- 环境细节只能揉进角色的动作和感知中自然带出，不能独立成句；例外题材中，环境也必须携带威胁、异常或信息差
- 检查方法：标出前 3 句的主语，如果主语是环境物件（灯光/走廊/房间/天气），重写

开头技巧：

| 技巧 | 说明 | 示例 |
|------|------|------|
| 冲突前置 | 第一句就是矛盾 | 「离婚协议放在桌上，他已经签了。」 |
| 信息差钩 | 给读者一个角色不知道的信息 | 「她不知道，对面那个男人已经在计划第三次了。」 |
| 反常行为 | 用一个不合常理的行为引起好奇 | 「她把订婚戒指冲进了马桶。」 |
| 重生反常 | 重生后做前世绝不会做的事 | 「沈栀心念成灰，支着一口气找到了媒婆:郭家的那个天阉，我来嫁。」 |
| 超自然身份 | 开篇揭示非人类身份 | 「我是世上仅存的红衣厉鬼。我不知自己是怎么死的。」 |
| 灵魂旁观 | 以灵魂视角描述死亡现场 | 「我的尸体躺在透明棺材里，三个哥哥在外面笑着说：她演得真像。」 |
| 悬念句 | 抛出一个需要解释的事实 | 「我死后的第三天，老公发了一条朋友圈。」 |
| 替嫁被弃 | 被迫接受不公正的命运 | 「三个月后，我代替皇后的嫡亲公主坐上了去漠北和亲的轿撵。」 |
| 代入式提问 | 直接让读者产生共鸣 | 「你有没有在深夜接到过一个不该接的电话？」 |

#### 第二段：铺垫（占全文 30-40%）

- 用物件/数字/习惯建立羁绊（详见 emotional-methods.md「羁绊铺设」）
- 埋入至少 3 个反转线索，分散在不同小节
- 每 2-3 个小节埋一个钩子（类型从 hooks-paragraph.md 选择）
- 小节用数字分割，每小节推进一个情节点
- 情绪强度逐节递增，不允许连续 2 节无情绪变化
- **贯穿道具第 1 次出现必须在此段完成**
- **反派作恶按阶梯递增**（小恶→中恶，见 villain-and-reveal.md）

#### 第三段：升级（占全文 20-30%）

- 冲突必须比上一段升级（强度/范围/代价至少一个维度上升）
- 插入倒计时钩子或代价钩子制造紧迫感
- 钩子密度提高到每 2 节一个（按题材分级见 genre-writing-formulas.md）
- 埋入误导信息，让读者猜错反转方向
- **数字/金额递增作为叙事工具**（具体数字替代模糊描述，见 writing-craft.md）
- **一动一静交替**：每节有动有静，不连续暴力也不连续安静

#### 第四段：反转（占全文 10-15%）

- 反转在一节内完成揭示，不拖延
- 揭示后确保前面铺垫的线索可被回溯（读者能找到「原来如此」的伏笔）
- 反转节的情绪冲击强度必须 > 前面所有节的最高值
- **用证物/证人/偷听/剥洋葱揭露真相**（4 种方式见 villain-and-reveal.md）
- **贯穿道具第 2 次出现必须在此段完成**（意义被颠覆）

#### 第五段：结尾（占全文 5-10%）

- 章末必须有钩子（悬念或余韵）
- 用安静细节收尾（一个物件、一个动作、一句短话），不写大段抒情
- 结尾方式见下表，参考 emotional-methods.md「余韵钝痛」
- **贯穿道具第 3 次出现（回扣暴击）**

结尾类型：

| 类型 | 效果 | 适合情绪 |
|------|------|----------|
| 余韵式 | 不说完，让读者自己想 | 意难平 |
| 呼应式 | 首尾呼应，形成闭环 | 治愈、成长 |
| 开放式 | 留下悬念 | 细思极恐 |
| 反转再反转 | 结尾再来一个小反转 | 震惊 |
| 金句式 | 一句话点题 | 共鸣 |

---

### Phase 3 完成门槛（进入 Phase 4 前必须通过）

- [ ] 总字数 ≥ 8000（优先用 Python 字符统计验证，兼容 Windows 和中文字符计数）
- [ ] 每节 ≥ 800 字（爽文等高信息密度题材 ≥ 500 字，见 genre-writing-formulas.md）
- [ ] 节数 = 小节大纲规划节数（不得合并/省略）
- [ ] 身体部位同一词全文 ≤ 5 次
- [ ] 「像」≤ 10 处
- [ ] `node scripts/check-ai-patterns.js --check 正文.md` 无高危 AI 句式命中

**中文文本统计注意事项**：
- `wc -c` 统计的是字节数，中文每字符 3 字节（UTF-8），不等于字数
- 字数统计必须优先使用跨平台 Python 字符统计：`for PYBIN in python3 python py; do "$PYBIN" -c "" 2>/dev/null && break; done; "$PYBIN" -c "from pathlib import Path; print(len(Path('文件路径').read_text(encoding='utf-8')))"`（**勿直接用 `python3`**：Windows 上它会触发 Microsoft Store 占位程序、exit 49 失败）
- `wc -m` 仅作为 macOS/Linux 备选；Windows 环境或模型兼容性不确定时不要依赖 `wc`
- 禁止用 `wc -c` 或模型估算字数
- 行数统计使用 `wc -l` 是安全的

**不通过 → 回退补足，不得进入精修。**

---

### Phase 4：精修打磨

加载 `references/writing-workflow.md` 中的精修清单完成检查。
重点：开头钩子、情绪曲线、反转铺垫、每句话价值、格式规范、AI 腔排查。文件模式必须先运行 `node scripts/normalize-punctuation.js 正文.md`，再运行 `node scripts/check-ai-patterns.js --check 正文.md`；后者只报告不改写，命中时回到正文改掉并复扫到 0。

#### Agent 调用：narrative-writer（去AI味）+ consistency-checker

精修阶段，如果项目已部署对应 agent，可 spawn：
- `Agent(subagent_type: "narrative-writer", prompt: "项目目录：{dir}\n任务描述：去AI味+格式检查\n检查范围：{正文文件}\n必须检查：先否定再肯定的翻转句式；发现后直接改成后项或动作细节")` — 执行去AI味（7 Gate）和格式合规检查
- `Agent(subagent_type: "consistency-checker", prompt: "项目目录：{dir}\n检查范围：{正文文件}\n检查类型：事实冲突+伏笔断线+角色属性不一致")` — 执行一致性检查

如 agent 不可用，由主线程直接执行。

**正文洁净规则**：
- 自检（字数统计、禁用词扫描、格式检查）是过程动作，结果直接在对话里说明，不落盘成文件
- **绝对不能**把自检记录附加到正文文件末尾
- 正文中不得出现任何 `<!-- 自检 -->` 或类似的检查标记注释

不通过 → 回退补足。

---

## 流程衔接

**流水线：** 短篇
**位置：** 写作（第 3/3 步）

| 时机 | 跳转到 | 命令 |
|---|---|---|
| 有参考小说想对标 | story-short-analyze | `/story-short-analyze` → 输出存入 `拆文库/{书名}/` |
| 写完，去 AI 味 | story-deslop | `/story-deslop` |
| 想自检 | 本 skill 质量自检 | 用 Phase 4 自检流程 + `references/quality-checklist.md` 逐项核对 |
| 需要市场方向 | story-short-scan | `/story-short-scan` |
| 设定太大，适合长篇 | story-long-write | `/story-long-write` |

---

## 参考资料

按需加载以下文件。写作时同时加载 ≤ 3 个：

| 文件 | 何时加载 |
|------|----------|
| [references/format-and-structure.md](references/format-and-structure.md) | 写作前必读 |
| [references/writing-workflow.md](references/writing-workflow.md) | Phase 2 设计任务 + Phase 4 精修 |
| [references/writing-craft.md](references/writing-craft.md) | 写作全程参考 |
| [references/anti-ai-writing.md](references/anti-ai-writing.md) | 去AI味时必读 |
| [references/genre-writing-formulas.md](references/genre-writing-formulas.md) | 核心参考，按题材加载 |
| [references/genre-writing-techniques.md](references/genre-writing-techniques.md) | 通用写作技法+情绪操控+感情线法则 |
| [references/emotional-methods.md](references/emotional-methods.md) | 设计情感时 |
| [references/hooks-chapter.md](references/hooks-chapter.md) | 章节钩子设计 |
| [references/hooks-suspense.md](references/hooks-suspense.md) | 悬念设计 |
| [references/hooks-paragraph.md](references/hooks-paragraph.md) | 段落钩子技巧 |
| [references/villain-and-reveal.md](references/villain-and-reveal.md) | Phase 2 设计反派时 |
| [references/reversal-toolkit.md](references/reversal-toolkit.md) | 设计反转时 |
| [references/emotional-arc-design.md](references/emotional-arc-design.md) | 设计情绪曲线时 |
| [references/quality-checklist.md](references/quality-checklist.md) | 精修检查时 |
| [references/banned-words.md](references/banned-words.md) | 禁用词表 |
| [scripts/normalize-punctuation.js](scripts/normalize-punctuation.js) | Phase 4 文件模式确定性标点收尾 |
| [scripts/check-ai-patterns.js](scripts/check-ai-patterns.js) | Phase 3 完成门槛与 Phase 4 复扫；只报告高危 AI 句式 |
| [references/female-audience-writing.md](references/female-audience-writing.md) | 女频写作时 |
| [references/character-basics.md](references/character-basics.md) | 人物基础设定 |
| [references/character-design-methods.md](references/character-design-methods.md) | 人设方法 |
| [references/character-relations.md](references/character-relations.md) | 人物关系设计 |
| [references/dialogue-mastery.md](references/dialogue-mastery.md) | 写对话时 |
| [references/opening-design.md](references/opening-design.md) | 设计开头时（短篇用法：「前3章」读作开篇首节~前1/3，七步法按目标字数等比缩放） |
| [references/genre-catalog.md](references/genre-catalog.md) | 题材框架 |
| [references/genre-core-mechanics.md](references/genre-core-mechanics.md) | 核心梗设计 |
| [references/genre-readers.md](references/genre-readers.md) | 读者心理 |
| [references/state-tracking.md](references/state-tracking.md) | 状态追踪协议（Phase 3 写前准备参考） |
| [references/output-contract.md](references/output-contract.md) | Phase 2 对标上下文加载时（理解 analyze 产出格式与消费规范） |

### 按主题快速定位（横切主题）

有些主题散在多个文件里。下表给每个主题一个**权威文件**（先读它，通常够用），配套文件只在需要那个角度时再加载。括号是该文件里对应的小节。

| 主题 | 权威文件（先读） | 配套文件（按角度补充） |
|------|-----------------|----------------------|
| 情绪设计 | **`references/emotional-methods.md`**（情感三板斧 + 拉扯节奏 + 失败模式） | `references/emotional-arc-design.md`（六种弧线 / 前反应-复现-后反应结构）· `references/genre-writing-techniques.md`（情绪操控核心法则） |
| 反转 | **`references/reversal-toolkit.md`**（反转类型 / 铺垫 / 有效性自检） | `references/villain-and-reveal.md`（真相揭露机制 / 反转有效性自检） |
| 反派揭露 | **`references/villain-and-reveal.md`**（反派模板 / 揭露机制 / 报应设计） | `references/reversal-toolkit.md` |
| 人物 | **`references/character-basics.md`**（主角/配角/反派/动机模板速填） | `references/character-design-methods.md`（三层标签反差/深化）· `references/character-relations.md`（关系/感情线） |
| 钩子 | **`references/hooks-chapter.md`**（章节/开篇钩子类型） | `references/hooks-paragraph.md`（段落钩子）· `references/hooks-suspense.md`（悬念设计） |
| 女频写作 | **`references/female-audience-writing.md`**（核心原则 / 文案结构体系 / 感情线写法深化） | `references/genre-writing-techniques.md`（女频读者心理与写作技法 / 感情线四阶段推进法）· `references/genre-readers.md`（读者心理） |
| 题材公式 | **`references/genre-writing-formulas.md`**（各题材创作公式速查） | `references/genre-catalog.md`（题材框架）· `references/genre-core-mechanics.md`（核心梗设计） |
| 开头 | **`references/opening-design.md`**（黄金一章 / 三大基点 / 题材开头模板；短篇：「前3章」读作开篇首节~前1/3、七步法按目标字数等比缩放） | `references/hooks-chapter.md`（开篇钩子类型） |
| 格式与节奏 | **`references/format-and-structure.md`**（正文格式硬规范） | `references/writing-craft.md`（三维度揉进）· `references/writing-workflow.md`（设计/精修工作流） |
| 对话 | **`references/dialogue-mastery.md`**（对话技法主文件：差异化/潜台词/对话节奏） | `references/writing-craft.md`（对话权力博弈的结构化用法） |
| 去AI味 | **`references/anti-ai-writing.md`**（AI指纹/核心规则/Show Don't Tell） | `references/banned-words.md`（禁用词扫描）· `scripts/check-ai-patterns.js`（AI句式复扫）· `references/quality-checklist.md`（成稿检查） |

---

## 语言

- 跟随用户的语言回复，用户用什么语言就用什么语言回复
- 中文回复遵循《中文文案排版指北》
