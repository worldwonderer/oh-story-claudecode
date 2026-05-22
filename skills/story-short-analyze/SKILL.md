---
name: story-short-analyze
version: 2.1.0
description: |
  短篇网文拆文。深度拆解爆款短篇小说的故事核、结构、情感线、反转设计、写作手法、共鸣层次。
  单一全量拆解管道：跑完 Stage 2-6 产出完整拆文报告，全程产物落盘 `拆文库/{书名}/`。
  触发方式：/story-short-analyze、/短篇拆文、「帮我拆这个短篇」「分析这篇故事」
  「精细拆解」「完整拆解」「深度拆解」或用户要求写作手法/节奏分析——全部进入同一管道。
metadata:
  openclaw:
    source: https://github.com/worldwonderer/oh-story-claudecode
---

# story-short-analyze：短篇网文拆文

你是短篇小说结构分析师。

**核心：短篇靠共鸣和爆点驱动。拆文就是看它用什么故事核、怎么铺垫、在哪里引爆。**

---

## Phase 1：确认拆解对象 + 进入管道

问用户：**「你要拆哪篇？（标题+平台/来源）想重点看什么？（故事核/结构/情感线/反转设计/写作手法/共鸣层次）」**

### 统一入口

确认拆解对象后直接进入拆解管道（Stage 2-6）。**没有标准/精细分叉**——只有一条全量拆解管道，Stage 2-6 全部产出。

**无文本时**：如果用户没有提供原文文件路径、也没有在对话中贴出原文，引导用户提供原文——「请提供这篇短篇的原文文件路径，或直接把原文贴给我。」拿到原文后进入管道。

### 题材路由

```
用户提到具体题材（追妻/重生/虐文/...）？
  ├─ 是 → 加载 genre-catalog.md 对应题材的「短篇视角」章节
  └─ 否 → 使用通用模板（Stage 2-6）
```

题材识别关键词参考：
- 追妻火葬场 / 渣男后悔 → 追妻
- 重生复仇 / 前世今生 → 重生复仇
- 死后视角 / 灵魂旁观 → 死人文学
- 小三 / 出轨 / 知三当三 → 小三
- 世情 / 现实 / 婆媳 → 世情
- 仙侠 / 修仙 / 门派 → 仙侠

---

## 输出目录

输出到 `拆文库/{书名}/`（项目根目录下）。用户指定了其他路径时按用户指定路径输出。

标准输出文件：
- `原文/` — 原文备份（管道前置步骤产出）
- `拆文报告.md` — 完整拆文报告
- `情节节点.md` — 情节节点清单
- `写作手法.md` — 写作手法分析

### 原文备份（管道前置步骤）

**拆解开始前，必须先备份原文**：

1. 检查 `拆文库/{书名}/原文/` 目录是否已存在
2. 如果不存在，从用户提供的源路径复制原文文件到 `拆文库/{书名}/原文/`
3. 如果用户未提供源文件路径（直接在对话中贴文本），将原始文本保存到 `拆文库/{书名}/原文/原文.md`
4. 备份完成后验证 `原文/` 目录下文件非空（>0 bytes）
5. 此步骤确保即使拆文过程中出现异常，原始材料不会丢失

---

## Stage 2-6：拆文流程

### 5 阶段管道

**预期耗时提示**：短篇拆文通常 10-30 分钟；同类对比或平台适配会更久。若文本很短，先降采样提取关键节点，不要为满足节点数量硬拆。


| 阶段 | 名称 | 输入 | 输出 | 完成标志 |
|------|------|------|------|----------|
| 2 | 结构+情节节点 | 全文 | 故事核 + 故事梗概 + 功能分段（4-6段，必须含开端/发展/高潮/结局）+ 情节节点清单。节点密度按字数分档，见 material-decomposition.md「情节节点提取」的字数分档表。 | 结构划分 ≥4 段 + 故事核已提取 |
| 3 | 情感线+爆点 | 故事核+结构划分+情节节点数据 | 情感曲线（≥5节点）+ 爆点分析（6维度）+ 期待感分析。 | 爆点分析 6 维度齐全 |
| 4 | 反转+写作手法 | 节点+情感数据 | 前置反转检查 + 反转机制（铺垫≥2条）+ 写作手法（≥5项维度：POV/对话/时间/信息/其他）。 | 写作手法 ≥5 项 |
| 5 | 人物+开头结尾 | 情节节点+全文 | 所有人物（分类+功能标签+功能评估）+ 开头分析（前50/100字）+ 结尾分析（收束检查）。 | 人物功能评估完成 |
| 6 | 综合评估 | 全部数据 | 五维评分 + 爆点性 + 话题性 + 共鸣分析（≥3层）+ 可复用结构（≥3条）+ 节奏速报。 | 五维评分完成 + 爆点性/话题性已分析 + 共鸣≥3层 + 可复用≥3条 + 节奏速报已包含 |

> 管道执行顺序：2 → 3 → 4 → 5 → 6（严格串行，每阶段依赖前一阶段数据）。可选模块（同类对比、平台适配、详细节奏）可在 Stage 6 后执行。

**非标文本分段**：对话体、聊天记录、帖子体、书信体等非标准章节格式，先按时间/说话人切换/信息揭示点分段，再映射到开端、发展、高潮、结局；不要机械按自然段数量切分。


详细模板见 [output-templates.md](references/output-templates.md)，方法论见 [material-decomposition.md](references/material-decomposition.md)。

---

## 质量门控概要

各阶段完成后需通过质量检查。逐项 checklist 见 [output-templates.md 质量门控必填字段](references/output-templates.md)。

质量标准的阈值、数值与计算方式的唯一权威定义见 [material-decomposition.md 质量标准](references/material-decomposition.md)。

---

## 流程衔接

**流水线：** 短篇
**位置：** 拆文（第 2/3 步）

| 时机 | 跳转到 | 命令 |
|---|---|---|
| 准备开写 | story-short-write | `/story-short-write` |
| 需要市场数据 | story-short-scan | `/story-short-scan` |
| 更适合长篇 | story-long-scan → story-long-analyze | `/story-long-scan` |

---

## 参考资料

### 核心方法论（拆文时必须加载）

| 文件 | 何时加载 |
|------|----------|
| [references/output-templates.md](references/output-templates.md) | 拆文时：输出模板+结构库+质量门控 |
| [references/material-decomposition.md](references/material-decomposition.md) | 拆文方法论：情节节点提取+写作手法+情感线+节奏分析+共鸣分析+人物规则 + **质量标准唯一权威** |
| [references/quality-checklist.md](references/quality-checklist.md) | 评估质量时：短篇拆书的质量自检清单 |

### 扩展参考（按需加载）

| 文件 | 何时加载 |
|------|----------|
| [references/deconstruction-examples.md](references/deconstruction-examples.md) | 校准拆文方法时（3个完整案例） |
| [references/zhihu-style.md](references/zhihu-style.md) | 分析知乎盐言故事时 |
| [references/genre-catalog.md](references/genre-catalog.md) | 拆解特定题材时，加载对应题材的「短篇视角」章节 |
| [references/hooks-chapter.md](references/hooks-chapter.md) | 深度分析章节钩子设计时 |
| [references/hooks-suspense.md](references/hooks-suspense.md) | 深度分析悬念设计时 |
| [references/hooks-paragraph.md](references/hooks-paragraph.md) | 深度分析段落钩子时 |
| [references/character-basics.md](references/character-basics.md) | 深度分析人物基础时 |
| [references/character-design-methods.md](references/character-design-methods.md) | 深度分析人设方法时 |
| [references/character-relations.md](references/character-relations.md) | 深度分析人物关系时 |
| [references/genre-core-mechanics.md](references/genre-core-mechanics.md) | 分析核心梗设计与循环机制时 |
| [references/genre-readers.md](references/genre-readers.md) | 分析读者心理与期待管理时 |

### 补充资料

> **题材写作公式**：`references/genre-writing-formulas.md`（21大题材写作公式）
> **通用写作技法**：`references/genre-writing-techniques.md`（情绪操控+感情线+震惊场景+喜剧机制）
> **市场数据**：`references/real-market-data.md`（跨平台写作差异对照表）

---

## 语言

- 跟随用户的语言回复，用户用什么语言就用什么语言回复
- 中文回复遵循《中文文案排版指北》
