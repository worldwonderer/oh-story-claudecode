---
name: output-contract
description: |
  story-short-analyze 输出契约。定义 Stage → 文件映射、_meta.json schema、
  下游消费规范（story-short-write 读全套 markdown + 原文 + _meta.json 写新短篇）。
sync-source: skills/story-short-analyze/references/output-contract.md
sync-policy: |
  本文件在 story-short-analyze 与 story-short-write 之间需保持字节一致（byte-equal）。
  修改任一副本后，必须同步另一副本，并通过 bash scripts/check-shared-files.sh 验证。
  禁止把本文件加入 IGNORE_NAMES 列表——它必须保持同步，不属于 intentional differences。
---

# 输出契约：story-short-analyze ↔ story-short-write

`story-short-analyze` 拆完一篇短篇后，产物落盘到 `拆文库/{书名}/`。`story-short-write`
写下一篇同题材短篇时，**同时**读这个目录下的全部产出。

---

## 输出目录与文件树

```
拆文库/{书名}/
├── 原文/                  # 管道前置步骤产出，存放源文件备份
├── 拆文报告.md             # 人类可读综合报告（Stage 2-6 综合）
├── 情节节点.md             # Stage 2 情节节点清单
├── 写作手法.md             # Stage 4 写作手法分析
└── _meta.json             # 管道元数据 + 结构计数（resume + Phase 7 检查数值依据）
```

**文件名约定**：`拆文报告.md / 情节节点.md / 写作手法.md` 由 `story-short-write` 硬编码
消费，不可重命名。分析叙事走 markdown，数字/枚举走 `_meta.json.structure_counts`。

---

## Stage → 文件映射

| Stage | 名称 | 落地文件 | 主要内容 |
|-------|------|----------|---------|
| 2 | 结构+情节节点 | `拆文报告.md`（故事核/结构/梗概段） + `情节节点.md` | 故事核 / 4-6 段结构 / 故事梗概 / 情节节点清单 |
| 3 | 情感线+爆点 | `拆文报告.md`（情感曲线段+爆点段） | 情感曲线 ≥5 节点 / 爆点 6 维度 / 期待感 |
| 4 | 反转+写作手法 | `拆文报告.md`（反转段） + `写作手法.md` | 前置反转检查 / 反转分析（铺垫 ≥2） / 写作手法 ≥5 项 |
| 5 | 人物+开头结尾 | `拆文报告.md`（人物段+首尾段） | 人物分类+功能评估 / 开头分析 / 结尾分析 / 首尾呼应 |
| 6 | 综合评估 | `拆文报告.md`（综合段） + `_meta.json`（写 structure_counts） | 五维评分 / 爆点性 / 话题性 / 共鸣 ≥3 层 / 可复用结构 ≥3 条 / 节奏速报 |

---

## `_meta.json` schema

`_meta.json` 是管道元数据 + 结构计数。**不放分析内容**，只放数字和枚举——给 Phase 7
检查做完整性校验用。分析叙事都在 `拆文报告.md` 里。

```jsonc
{
  "version": "2.0",
  "word_count": 5234,                   // 源文字数（Phase 1 探针填入）
  "genre_detected": "追妻",             // Phase 1 题材识别；未识别填 "通用"
  "created_at": "{ISO8601 时间戳}",      // 拆文启动时间，写入时填当前 UTC
  "stages_completed": [2, 3, 4, 5],     // 已完成 Stage，按完成顺序 append
  "last_stage_in_progress": null,       // 当前正在执行的 Stage；空闲为 null

  "structure_counts": {                 // Stage 6 完成时一次性写入；Phase 7.2 验收依据
    "beats": 5,                         // 结构段数（结构划分，开端/发展/高潮/结局，Stage 2）
    "hooks": 4,                         // 钩子数（Stage 3）
    "setup_clues": 3,                   // 反转铺垫线索数（Stage 4）
    "character_archetypes": 3,          // 有反差人物数（Stage 5）
    "reusable_structures": 3,           // 可复用手法条数（Stage 6）
    "reversal_type": "视角反转"          // 反转类型枚举（视角/身份/动机/时间线/信息/认知/无反转）；甜宠/喜剧/报应型填「无反转」
  }
}
```

### 写入顺序（crash safety）

1. **Stage N 开始前**：`last_stage_in_progress = N`，写盘。
2. **Stage N 文件写完后**：non-empty + 最小长度合理性检查（如 `拆文报告.md` 新增段 ≥ 200 字）。
3. **通过**：清空 `last_stage_in_progress`，append `N` 到 `stages_completed[]`。
4. **失败**：`stages_completed` 不动，`last_stage_in_progress` 保留为 `N`。
5. **Stage 6 完成时额外动作**：把 `structure_counts` 一次性算出并写入 `_meta.json`，
   然后才进 Phase 7。

### Resume 协议

- `last_stage_in_progress` 非空 → 该 Stage 上次中断，**从头**重跑（不复用半成品）。
- `last_stage_in_progress` 为空 → 从 `max(stages_completed) + 1` 开始。
- `stages_completed` 含 6 → 已完成，询问用户覆盖/取消。

**Stage 6 = 内容写完 AND Phase 7 通过**。Phase 7 未过前 `last_stage_in_progress` 保持 `6`、`stages_completed` 不含 `6`；resume 时正文/structure_counts 已在盘上，只重跑 Phase 7 检查，不重写 Stage 6 正文。

---

## Phase 7 检查接入点

Stage 6 内容写完后、`stages_completed[6]` append 前，跑三道检查：

### 7.1 拆文报告 AI 腔自检

扫描 `拆文报告.md` 全文 against 本地禁用词表 + `references/anti-ai-writing.md`。
这是 `story-short-analyze` 的拆文报告质量门；`story-short-write` 成稿去 AI 味另走
`references/short-deslop.md`，不要把两套规则混用。
命中 → 不写 `stages_completed[6]`，列出位置请用户修订**拆文报告本身**的 AI 腔
（源文里有 AI 腔不算——这里扫的是分析师写的报告）。

### 7.2 `_meta.json.structure_counts` 数值校验

| 字段 | 最低值 | 不达标 |
|------|--------|--------|
| `structure_counts.beats` | ≥ 4（结构段：开端/发展/高潮/结局）| 阻断 |
| `structure_counts.hooks` | ≥ 3 | 阻断 |
| `structure_counts.setup_clues` | ≥ 3（reversal_type=无反转时跳过本行）| 阻断 |
| `structure_counts.character_archetypes` | ≥ 2 | 阻断 |
| `structure_counts.reusable_structures` | ≥ 3 | 阻断 |
| `structure_counts.reversal_type` | 在枚举内（含「无反转」）| 阻断 |
| `genre_detected` | 非空 | 阻断 |

> 情节节点数（15-60 个，按字数分档）走 `情节节点.md` 自己的密度校验（见 material-decomposition.md），不在本表。`beats` 是结构段数，不是情节节点数。

### 7.3 `story-short-analyze/references/output-templates.md` BLOCK 项扫描

扫 `story-short-analyze/references/output-templates.md` 所有 `[BLOCK]` 标注项对应的产出段是否在 `拆文报告.md` 出现。
任一缺失 → 阻断。`[WARN]` 项 → 写入拆文报告末尾「待补」清单，不阻断。

### 7.4 通过

清空 `_meta.json.last_stage_in_progress`，append `6` 到 `stages_completed[]`，提示
用户「拆解完成，可调用 `/story-short-write` 写下一篇」。

---

## 下游消费规范（story-short-write 怎么用）

> `story-short-write` 当前硬编码读 `拆文报告.md / 情节节点.md / 写作手法.md` 三个 markdown。
> `_meta.json` 是可选增强：read 容忍，不存在不阻塞写作。

| 文件 | 角色 | 怎么读 |
|------|------|--------|
| `_meta.json`（可选）| 数字门面 + 题材识别 | 看 `genre_detected` 决定哪个题材标尺，读 `structure_counts` 确认拆文完整性，读 `structure_counts.reversal_type` 选反转骨架 |
| `拆文报告.md` | 分析叙事主体 | 读「故事核」「结构」「情感曲线」「爆点」「反转分析」「人物」「五维评分」「共鸣分析」「可复用结构」「同类型写作动作」段，是 writer 的主输入 |
| `情节节点.md` | 节奏锚点 | 看每个节点的字数位置 + 功能 + 触发事件，给新故事排节奏 |
| `写作手法.md` | 手法库 | POV / 对话 / 时间 / 信息控制 等具体手法 + 原文示例，新篇里复用 |
| `原文/` | 语感源 | 抄对话调子、节奏、画面感、打脸张力。**不抄具体情节**，抄写法。 |

### 写作流程建议

1. 看 `_meta.json.genre_detected` 和 `structure_counts.reversal_type` 选骨架。
2. 读 `拆文报告.md` 的「核心手法」「共鸣分析」「可复用结构」段，决定要保留 / 调整哪些。
3. 读 `情节节点.md` 把节奏锚点抄到新故事的字数位置上。
4. 写场景时翻 `写作手法.md` + `原文/`，参考具体写法。
5. 写完后（可选）在新文档 frontmatter 写 `derived_from: 拆文库/{书名}/` 追溯。

### 维护者本地烟雾测试

```bash
ls 拆文库/{书名}/   # 应有：原文/ 拆文报告.md 情节节点.md 写作手法.md _meta.json
/story-short-write 拆文库/{书名}/
# 通过：输出 8000+ 字同题材新短篇，prose 有源文对话节奏和画面感
# 失败：写得像填空 / 或 short-write 找不到三个 markdown
```

---

## 版本约定

- `_meta.json.version` 与本文件 `sync-policy` 联动。
- breaking change（字段重命名 / 类型变更 / 必填变更）必须 bump major version 并同步两侧
  副本，CI 通过 `scripts/check-shared-files.sh` 拦截单边修改。
- additive change（新增可选字段）可 bump minor，旧字段保持读容忍。
