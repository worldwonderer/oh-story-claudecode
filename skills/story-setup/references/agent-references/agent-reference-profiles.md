# Agent 参考资料 Profile 契约

> 本文件是 story-architect 的唯一资料清单。story-architect 自身只描述任务能力，不复制文件清单。每次任务选择 `long` 或 `short` 后，只能加载 `Common + 当前 profile`；表外文件即使存在也不读取。其他 agent 按各自模板的参考表读取，只用本文件的 long / short 选择规则和质量覆盖表。

## 选择规则

1. 参数明确写“长篇 / 连载 / 章纲 / 日更”时选择 `long`。
2. 明确写“短篇 / 单篇 / 小节大纲 / 盐言 / 小程序短故事”时选择 `short`。
3. 参数未写明时，用项目产物判定：`大纲/细纲_第XXX章.md`、`追踪/` 属于 long；`小节大纲.md`、单文件 `正文.md` 属于 short。
4. 新建项目尚无产物时按调用方判定：story-long-write 的题材定位、核心设定、大纲任务为 `long`；story-short-write 的构思任务为 `short`。
5. 仍无法判定时返回 `Reference Profile: unresolved`，不得同时加载两套资料兜底。
6. 输出开头标记 `Reference Profile: long|short`；审查任务按被审查作品选择。

## Common

| 文件 | 读取条件 |
|---|---|
| [agent-quality.md](agent-quality.md) | 审查、评分或交付前检查；只提供跨体裁质量核心，必须同时加载当前 profile 的质量覆盖 |
| [genre-readers.md](genre-readers.md) | 判断目标读者、平台与期待 |
| [emotional-arc-design.md](emotional-arc-design.md) | 设计或审查情绪弧线、期待管理与兑现 |
| [plot-core-methods.md](plot-core-methods.md) | 卡文、剧情循环失效、五步高潮、过渡或日纲缺推进；short 只取与总篇幅兼容的方法 |

## Long profile

| 文件 | 读取条件 |
|---|---|
| [long-genre-catalog.md](long-genre-catalog.md) | 长篇题材定位或框架速查 |
| [long-genre-mechanics.md](long-genre-mechanics.md) | 提炼长篇核心梗、循环机制、事业线或金手指 |
| [genre-prose-cards.md](genre-prose-cards.md) | 确定长篇题材声线与长线约束 |
| [outline-methods.md](outline-methods.md) | 建大纲、卷纲或章节蓝图 |
| [outline-conflict.md](outline-conflict.md) | 主支线、AB 线与冲突结构 |
| [outline-rhythm.md](outline-rhythm.md) | 连载节奏、升级感与跨章兑现 |
| [opening-design.md](opening-design.md) | 新书开篇或黄金三章 |
| [long-emotional-methods.md](long-emotional-methods.md) | 设计跨章剧情单元的情绪发动机与兑现链 |
| [long-chapter-hooks.md](long-chapter-hooks.md) | 设计章首/章尾与跨章期待，不采用固定百字配额 |
| [long-suspense.md](long-suspense.md) | 编排短期、中期、远期悬念与回收周期 |
| [long-reversal.md](long-reversal.md) | 设计单元、卷级或全书反转，不采用全文百分比铁律 |
| [long-quality.md](long-quality.md) | 黄金三章、连载节奏、读者契约与终局储备审查 |

Long profile 禁止读取 `short-*` 文件，不得采用“6 章”“每节 500–800 字”“每两节一钩”“全文 70–85% 必须高潮”等短篇默认口径。

## Short profile

| 文件 | 读取条件 |
|---|---|
| [short-genre-formulas.md](short-genre-formulas.md) | 需要短篇题材结构骨架时 |
| [short-paragraph-hooks.md](short-paragraph-hooks.md) | 设计段落留存、付费断点与小节内钩子 |
| [short-chapter-hooks.md](short-chapter-hooks.md) | 设计节首/节尾钩子与高密度接力 |
| [short-emotional-methods.md](short-emotional-methods.md) | 设计单篇内的羁绊、撕裂、拉扯与余韵 |
| [short-suspense.md](short-suspense.md) | 编排主悬念、副悬念、节间钩子和全文回收 |
| [short-reversal.md](short-reversal.md) | 设计短篇线索、误导、揭示位置与两层反转 |
| [short-quality.md](short-quality.md) | 审查全文密度、付费点、反转证据链和结尾兑现 |

Short profile 禁止读取 `long-*`、`outline-*`、`opening-design.md` 或 `genre-prose-cards.md`；不得把卷级、日更或跨十几章指标当硬门槛。

