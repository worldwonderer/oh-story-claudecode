# Agent 清单

## Tier 1 — 架构层（Opus）

| Agent | Model | 职责 | 被调用时机 |
|-------|-------|------|-----------|
| story-architect | opus | 题材定位、大纲结构、钩子/反转设计、情绪弧线、范围控制 | long-write Phase 1-3, short-write Phase 1-2 |

## Tier 2 — 创作层（Sonnet）

| Agent | Model | 职责 | 被调用时机 |
|-------|-------|------|-----------|
| character-designer | sonnet | 角色档案、voice profile、动机链、对话创作 | long-write Phase 2,4, short-write Phase 2,3 |
| narrative-writer | sonnet | 正文写作、去AI味、格式合规、节长达标 | long-write Phase 4-5, short-write Phase 3-4 |

## Tier 3 — 检查层（Haiku）

| Agent | Model | 职责 | 被调用时机 |
|-------|-------|------|-----------|
| consistency-checker | haiku | 事实冲突 grep 扫描、S1-S4 分级报告 | long-write Phase 5, short-write Phase 4, story-review |

## 委派规则

- story-architect 可并行调用 character-designer（设定审查时）
- narrative-writer 与 consistency-checker 可并行调用（Phase 5 终检）
- character-designer 与 story-architect 可并行调用（Phase 2 设定审查）
- consistency-checker 永远只读，不修改任何文件

## 升级路径

| 场景 | 升级给 |
|------|--------|
| 角色弧线方向与大纲冲突 | character-designer → story-architect |
| 设定矛盾需创作决策 | consistency-checker → story-architect |
| 角色对话风格偏离设定 | narrative-writer → character-designer |
| 情绪弧线方向不明 | narrative-writer → story-architect |
