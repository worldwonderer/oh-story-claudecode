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

**执行铁律：短篇写的是情绪，不是故事。读者记住的永远是情绪，不是剧情。**

---

## 执行规则

1. **先定情绪，再定故事**。动笔前必须确定目标情绪（意难平/反转震撼/爽感释放/治愈温暖/细思极恐/共鸣感动），所有内容为这个情绪服务。
2. **一个反转撑一篇**。所有铺垫为反转服务，所有情绪为反转蓄力。不多线、不铺世界观。
3. **每句话必须有用**。不推动剧情、不铺垫反转、不推高情绪的句子 → 删。
4. **开头 3 句定生死，结尾定传播**。开头必须包含钩子，结尾必须有余韵。
5. **默认第一人称**。短篇网文（盐言/黑岩/点众/七猫短篇）绝大多数用第一人称，代入感最强。除非题材明确需要第三人称（如多视角悬疑），否则一律用「我」。

---

## 格式规范（最高优先级）

详细规则见 `references/format-and-structure.md`，写作前必须加载。

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

> 如果用户有参考小说，先用 `/story-short-analyze` 拆解，输出存入 `拆文库/{书名}/`（或用户指定的 对标/ 目录）。写作时参考其结构/情绪/反转设计。

#### Agent 调用：story-architect

构思阶段，如果项目已部署 story-architect agent（检查 `.claude/agents/story-architect.md` 是否存在），可 spawn `Agent(subagent_type: "story-architect", prompt: "项目目录：{dir}\n任务类型：短篇构思\n查询参数：{情绪目标+题材方向}")` 辅助框架设计。如 agent 不可用，由主线程直接执行。

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

详细步骤和模板见 `references/writing-workflow.md`。按顺序完成：

1. 设计结构物件（1-2 个）→ 加载 `writing-craft.md`
2. 设计反派（如有）→ 加载 `villain-and-reveal.md`
3. 确定揭露方式 → 同上
4. 编写 小节大纲.md（格式见 writing-workflow.md）
5. 反转信息差验证（公式见 writing-workflow.md）
6. 伏笔回查清单（标准见 writing-workflow.md）

#### Agent 调用：character-designer

设计任务完成后，如果项目已部署 character-designer agent（检查 `.claude/agents/character-designer.md` 是否存在），可 spawn `Agent(subagent_type: "character-designer", prompt: "项目目录：{dir}\n任务类型：角色设定\n查询参数：{人设速写+关系}")` 辅助角色设定和语言风格档案。如 agent 不可用，由主线程直接执行。

---

### Phase 3：逐场景写作

> 术语说明：Phase 3 按「段」划分叙事结构（开头段/铺垫段/升级段/反转段/结尾段），每段包含若干「小节」（数字编号的 beat）。「场景」指写作时的具体画面。

**写作心法：你不是在翻译大纲，你在构建场景。读者要和主角一起经历。**

#### Agent 调用：narrative-writer

正文写作阶段，如果项目已部署 narrative-writer agent（检查 `.claude/agents/narrative-writer.md` 是否存在），spawn `Agent(subagent_type: "narrative-writer", prompt: "项目目录：{dir}\n任务描述：写正文\n情绪目标：{从核心框架读取}\n小节大纲：小节大纲.md\n涉及角色：{从核心框架读取}")` 执行正文写作。如 agent 不可用，由主线程直接写作。

⚠️ **硬约束：每节 ≥ 800 字 / 50-65 行**。
题材例外：爽文、打脸、系统流等高信息密度题材可降至 ≥ 500 字/节（见 genre-writing-formulas.md 各题材速查表），但不得低于 500 字。
写完每节后必须统计字数和行数。不足 800 字（高信息密度题材不足 500 字）的节不得跳过，必须用三层展开法补足后再写下一节。整篇完成后总字数必须 ≥ 8000 字。

**节数守恒**：正文节数必须等于小节大纲规划节数。不得合并多节为一节。如果写作中发现某节不需要独立存在，应回到大纲阶段调整，而非在写作时偷减。

**节长达标流程（两步法）**：
1. **初稿**：按场景展开法写出完整初稿，每节尽量展开
2. **扩充检查**（初稿完成后必做）：逐节统计字数，不足 800 字的节用以下方法补足：
   - 加感知层（2-3 句感官细节，至少 2 个不同感官）
   - 加反应层（1-3 句身体动作/状态）
   - 加回忆闪回（1-2 句关联记忆）
   - 加环境物件（通过动作带出，不独立成句）
   - 加一轮对话（参考 writing-craft.md 对话权力模式）
   - **禁止凑字**：每个添加必须推动情绪/铺垫/代入感，不得灌水

**节长验证（分批写作，每批写完后执行）**：
分批写作：每次输出 2-3 节（2-3 节约为 Claude 单次输出的最佳叙事窗口，过少浪费上下文，过多降低单节质量），写完后统一检查本批所有节的字数。
如果任何一节 < 800 字（高信息密度题材 < 500 字）→ 用三层展开法补足后再写下一批。
禁止跳过未达标的小节。

> 批量验证更高效：一次性输出多节能让 AI 保持叙事连贯性，
> 批后统计比逐节暂停更符合 AI 的文本生成特性。

> **节长速算**：平均每行 15 字 × 55 行 ≈ 825 字。写到第 30 行时如果还不到 500 字，说明子事件展开不够，必须加感知层和反应层。

每个小节按「场景展开法」写作（详见 writing-craft.md 第 8 节）：发生层(30-40字) → 感知层(60-80字,≥2个感官) → 反应层(40-60字)，三层合计 ≥150 字。

**写完后对照 小节大纲.md 检查**：每个子事件三层都展开了？本节情绪到位？伏笔/物件已植入？节长 <800 字 → 回查感知层/反应层补足后再写下一节。

按以下结构分段写：

#### 第一段：开头（前 300-500 字）

**目标**：3 句话内抓住读者。**必须包含一个开篇钩子**（从 hooks-chapter.md 选择类型）。

**技法指令**：前 100 字事件密度 ≥ 3，不做背景铺垫，直接上事件链。

**开头零环境规则**：
- 前 3 句禁止出现任何环境描写（灯光、天气、气味、温度、装修）
- 前 3 句必须是：事件 / 对话 / 动作 / 信息炸弹，四种之一
- 环境细节只能通过感知层（三层展开法的第二层）自然带出，不能独立成句
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
- **结构物件第 1 现必须在此段完成**
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
- **结构物件第 2 现必须在此段完成**（意义被颠覆）

#### 第五段：结尾（占全文 5-10%）

- 章末必须有钩子（悬念或余韵）
- 用安静细节收尾（一个物件、一个动作、一句短话），不写大段抒情
- 结尾方式见下表，参考 emotional-methods.md「余韵钝痛」
- **结构物件第 3 现（回扣暴击）**

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

- [ ] 总字数 ≥ 8000（使用 `wc -m` 验证，兼容中文字符计数）
- [ ] 每节 ≥ 800 字（爽文等高信息密度题材 ≥ 500 字，见 genre-writing-formulas.md）
- [ ] 节数 = 小节大纲规划节数（不得合并/省略）
- [ ] 身体部位同一词全文 ≤ 5 次
- [ ] 「像」≤ 10 处

**中文文本统计注意事项**：
- `wc -c` 统计的是字节数，中文每字符 3 字节（UTF-8），不等于字数
- 字数统计必须使用 `wc -m`（字符数）而非 `wc -c`（字节数）
- macOS 的 `wc -m` 在某些 locale 下可能不准确，备选方案：`python3 -c "print(len(open('文件路径').read()))"`
- 行数统计使用 `wc -l` 是安全的

**不通过 → 回退补足，不得进入精修。**

---

### Phase 4：精修打磨

加载 `references/writing-workflow.md` 中的精修清单完成检查。
重点：开头钩子、情绪曲线、反转铺垫、每句话价值、格式规范、AI 腔排查。

#### Agent 调用：narrative-writer（去AI味）+ consistency-checker

精修阶段，如果项目已部署对应 agent，可 spawn：
- `Agent(subagent_type: "narrative-writer", prompt: "项目目录：{dir}\n任务描述：去AI味+格式检查\n检查范围：{正文文件}")` — 执行去AI味（6 Gate）和格式合规检查
- `Agent(subagent_type: "consistency-checker", prompt: "项目目录：{dir}\n检查范围：{正文文件}\n检查类型：事实冲突+伏笔断线+角色属性不一致")` — 执行一致性检查

如 agent 不可用，由主线程直接执行。

**自检记录隔离规则**：
- 所有自检记录（字数统计、禁用词扫描结果、格式检查清单）必须写入独立文件 `自检_{标题}.md`（标题取自 Phase 2 核心框架）
- **绝对不能**将自检记录附加到正文文件末尾
- 自检文件与正文文件完全分离，便于后续清理和归档
- 正文中不得出现任何 `<!-- 自检 -->` 或类似的检查标记注释

不通过 → 回退补足。

---

## 流程衔接

**流水线：** 短篇
**位置：** 写作（第 3/3 步）

| 时机 | 跳转到 | 命令 |
|---|---|---|
| 有参考小说想对标 | story-short-analyze | `/story-short-analyze`（拆文模式） → 输出存入 `拆文库/{书名}/` |
| 写完，去 AI 味 | story-deslop | `/story-deslop` |
| 想自检 | story-short-analyze | `/story-short-analyze`（自检模式） |
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
| [references/female-audience-writing.md](references/female-audience-writing.md) | 女频写作时 |
| [references/character-basics.md](references/character-basics.md) | 人物基础设定 |
| [references/character-design-methods.md](references/character-design-methods.md) | 人设方法 |
| [references/character-relations.md](references/character-relations.md) | 人物关系设计 |
| [references/dialogue-mastery.md](references/dialogue-mastery.md) | 写对话时 |
| [references/opening-design.md](references/opening-design.md) | 设计开头时 |
| [references/genre-catalog.md](references/genre-catalog.md) | 题材框架 |
| [references/genre-core-mechanics.md](references/genre-core-mechanics.md) | 核心梗设计 |
| [references/genre-readers.md](references/genre-readers.md) | 读者心理 |

---

## 语言

- 跟随用户的语言回复，用户用什么语言就用什么语言回复
- 中文回复遵循《中文文案排版指北》
