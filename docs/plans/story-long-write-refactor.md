# story-long-write References 重构计划

## RALPLAN-DR Summary

### Principles
1. **场景驱动** - 文件按 SKILL.md Phase 场景切分，agent 按需加载，不加载无关内容
2. **<30KB 上限** - 每个 reference 文件压缩到 30KB 以内，确保加载后不爆炸
3. **指令化** - 去除教程解释，保留可执行指令+决策规则+速查表
4. **跨skill同步** - 共享文件（genre-frameworks-unified、hook-techniques、character-design）在所有使用skill中同步拆分
5. **不破坏跨skill重复** - anti-ai-writing.md、banned-words.md、quality-checklist.md 等保持原位，只做内容压缩

### Decision Drivers
1. 上下文窗口是稀缺资源 - 6个>100KB文件是最大瓶颈
2. Agent 按 SKILL.md 指引加载 - 场景索引比知识分类更实用
3. 知识完整性 - 压缩不能丢失关键技法，只去除冗余表达

### Viable Options

**Option A: 拆分+压缩（推荐）**
- 6个大文件拆为 ~18 个小文件
- 每个文件同时做内容压缩（去教程化）
- 更新 SKILL.md 为场景索引
- Pros: 彻底解决问题，agent 精确加载
- Cons: 工作量大，文件数增多

**Option B: 仅压缩不拆分**
- 保持现有文件名，只压缩内容
- Pros: 改动小，不破坏 SKILL.md 引用
- Cons: 123KB 文件压到 60KB 仍然太大

**Option C: 按需抽取摘要文件**
- 保留原文件不动，新建摘要版
- SKILL.md 指向摘要版
- Pros: 原文件保留可查
- Cons: 维护两套，容易不一致

**选择 Option A** - Option B 不能解决核心问题（文件仍然太大），Option C 维护成本高。

---

## 详细拆分方案

### 第一批：拆分 6 个超大文件（>100KB）

#### 1. outline-arrangement.md (123KB/2589行) → 4 个文件

| 新文件 | 内容 | 目标大小 | 使用场景 |
|--------|------|----------|----------|
| `outline-methods.md` | 五步大纲法+故事结构分级+八节点结构+节点设计法+细纲实务 | <25KB | Phase 3 建大纲 |
| `outline-conflict.md` | 矛盾设计方法论+主线支线设计+双线结构+三大驱动力+设门槛拉长 | <20KB | Phase 3 矛盾与结构 |
| `outline-structure-theory.md` | 三幕/五幕/六幕+因果链+强主线弱主线+竹子法+传统文框架 | <20KB | Phase 3 深度结构设计 |
| `outline-rhythm.md` | 升级感设计+节奏控制+章节名策略+推演方法+爽点节奏公式 | <15KB | Phase 3-4 节奏把控 |

#### 2. advanced-plot-techniques.md (111KB/2379行) → 4 个文件

| 新文件 | 内容 | 目标大小 | 使用场景 |
|--------|------|----------|----------|
| `plot-core-methods.md` | 小纲四步法+高潮逆推+噱头分类+剧情循环+卡文对策 | <20KB | Phase 3 小纲与卡文 |
| `plot-emotion-system.md` | 情绪拉扯理论+情绪模块+爽点设计+情绪升级+对比技法 | <15KB | Phase 3-4 情绪设计 |
| `plot-frameworks.md` | 双线法+阵营手牌法+九条主线+套路模板+大框架拆解 | <15KB | Phase 3 框架选择 |
| `plot-special-topics.md` | 金手指设计+同人vs原创+都市高武模板+题材边界+扫榜方法论 | <15KB | Phase 1-2 特殊题材 |

#### 3. hook-techniques.md (110KB/2564行) → 3 个文件

| 新文件 | 内容 | 目标大小 | 使用场景 |
|--------|------|----------|----------|
| `hooks-chapter.md` | 章尾13式+章首7式+实战模板+钩子选择指南 | <20KB | Phase 3-4 章节钩子 |
| `hooks-suspense.md` | 悬念编排+分层钩子+期待接力+震惊分层+悬念信息顺序 | <15KB | Phase 3-4 悬念设计 |
| `hooks-paragraph.md` | 段落级钩子11种+组合技法+禁忌+对话情绪递增 | <12KB | Phase 4 段落写作 |

#### 4. genre-frameworks-unified.md (110KB/2450行) → 3 个文件

| 新文件 | 内容 | 目标大小 | 使用场景 |
|--------|------|----------|----------|
| `genre-catalog.md` | 各题材框架（追妻/重生/霸总/同人/脑洞/凡人流/仙侠/都市等） | <25KB | Phase 1-2 选题材 |
| `genre-core-mechanics.md` | 核心梗解析+微创新+差异化设计+冲突网络+卖点偏移 | <15KB | Phase 2 核心设定 |
| `genre-readers.md` | 读者心理需求+题材生命力+跨网站适配+题材边界 | <10KB | Phase 1 市场判断 |

#### 5. style-modules.md (118KB/2519行) → 3 个文件

| 新文件 | 内容 | 目标大小 | 使用场景 |
|--------|------|----------|----------|
| `style-genre-modules.md` | 幽默/悬疑/言情/推理/恐怖/玄幻/现实/升级流风格模块 | <20KB | Phase 4 题材风格 |
| `style-combat-face.md` | 装逼打脸+爽点释放+无敌文+震惊链+升级流装逼 | <15KB | Phase 4 打斗/装逼 |
| `style-craft.md` | 写作四要点+白描+视角+镜头式+文学素养+毒点规避 | <12KB | Phase 4 写作技法 |

#### 6. character-design.md (93KB/2102行) → 3 个文件

| 新文件 | 内容 | 目标大小 | 使用场景 |
|--------|------|----------|----------|
| `character-basics.md` | 主角卡+配角卡+反派层级+动机链+人设核心原则 | <20KB | Phase 2 设定人物 |
| `character-design-methods.md` | 三层标签法+人设关联分层+配角功能化+群像写作+凸显人设 | <15KB | Phase 2-4 人物深化 |
| `character-relations.md` | 人物关系类型+感情流人设+穿书角色+修罗场+男频女频爱情线 | <12KB | Phase 2 关系设计 |

### 第二批：压缩中等文件

| 文件 | 当前行数 | 目标 | 方法 |
|------|---------|------|------|
| opening-design.md | 728行/31KB | <350行/15KB | 去除拆解案例冗余，合并重叠章节 |
| emotional-arc-design.md | 420行/17KB | <250行/10KB | 精简解释，保留弧线模板+速查表 |
| dialogue-mastery.md | 285行/12KB | <200行/8KB | 去除冗余说明，保留技法+示例 |
| reversal-toolkit.md | 379行/15KB | <250行/10KB | 精简案例，保留类型+规则+自检 |

### 第三批：小文件保持（只做微调）

| 文件 | 大小 | 操作 |
|------|------|------|
| artifact-protocols.md | 6KB | 保持不变 |
| banned-words.md | 2.4KB | 保持不变 |
| anti-ai-writing.md | 14KB | 保持不变（跨skill共享，改动需同步） |
| quality-checklist.md | 8KB | 保持不变（跨skill共享） |
| narrative-units.md | 4KB | 保持不变 |

### 第四批：更新 SKILL.md

将现有参考资料表改为场景索引：

```markdown
## 参考资料索引

### Phase 1：选题方向
| 场景 | 加载文件 |
|------|---------|
| 确定题材类型 | `genre-catalog.md` |
| 判断市场方向 | `genre-readers.md` |
| 特殊题材考量 | `plot-special-topics.md` |

### Phase 2：核心设定
| 场景 | 加载文件 |
|------|---------|
| 设定人物 | `character-basics.md` |
| 设计关系 | `character-relations.md` |
| 题材框架与定位 | `genre-catalog.md` + `genre-core-mechanics.md` |
| 创建 artifact | `artifact-protocols.md` |

### Phase 3：大纲搭建
| 场景 | 加载文件 |
|------|---------|
| 搭建大纲 | `outline-methods.md` |
| 设计矛盾与结构 | `outline-conflict.md` |
| 深度结构理论 | `outline-structure-theory.md` |
| 节奏与升级感 | `outline-rhythm.md` |
| 小纲与卡文 | `plot-core-methods.md` |
| 选择叙事框架 | `plot-frameworks.md` |
| 黄金三章 | `opening-design.md` |
| 情绪弧线 | `emotional-arc-design.md` |
| 反转设计 | `reversal-toolkit.md` |

### Phase 4：正文写作
| 场景 | 加载文件 |
|------|---------|
| 章节钩子 | `hooks-chapter.md` |
| 悬念设计 | `hooks-suspense.md` |
| 段落级钩子 | `hooks-paragraph.md` |
| 题材风格 | `style-genre-modules.md` |
| 打斗/装逼 | `style-combat-face.md` |
| 写作技法 | `style-craft.md` |
| 对话 | `dialogue-mastery.md` |
| 人物深化 | `character-design-methods.md` |
| 情绪技法 | `plot-emotion-system.md` |
| 叙事单元 | `narrative-units.md` |

### Phase 5：质量检查
| 场景 | 加载文件 |
|------|---------|
| 质量检查 | `quality-checklist.md` |
| 禁用词扫描 | `banned-words.md` |
| 去AI味 | `anti-ai-writing.md` |
```

---

## 压缩规则

对每个文件执行以下压缩：

1. **去教程化**：
   - 删除"为什么"的解释段落，只保留规则本身
   - "适合XX的作者" → 删除
   - "注意"/"小心"/"需要强调的是" → 删除修饰语，直接写规则
   - 多段解释 → 压缩为一句话规则

2. **格式压缩**：
   - 散文段落 → 转为表格或列表
   - 重复说明同一概念 → 合并为一处
   - 多个相似示例 → 保留最清晰的一个
   - 引言/过渡句 → 删除

3. **知识内化**：
   - 删除外部作者引用标识
   - 删除"XX老师说过"等表述
   - 统一为项目知识风格

4. **结构优化**：
   - 每个文件开头加简短用途说明（1-2行）
   - 保留目录但精简（只列 H2）
   - 结尾加速查表（如果有决策逻辑）

## 执行顺序

1. 先拆分 6 个超大文件（影响最大）
2. 压缩 4 个中等文件
3. 更新 SKILL.md 参考资料表
4. 验证：确认新文件都可被 SKILL.md 正确引用
5. 删除旧文件，commit

## 跨skill同步计划（Architect + Critic 审查反馈）

### 共享文件完整清单

**long-write ↔ short-write（10个文件共享）：**
| 文件 | 大小 | 类型 | 本计划处理方式 |
|------|------|------|---------------|
| genre-frameworks-unified.md | 110KB | 拆分 | 拆为3个新文件，同步到short-write |
| hook-techniques.md | 110KB | 拆分 | 拆为3个新文件，同步到short-write |
| character-design.md | 93KB | 拆分 | 拆为3个新文件，同步到short-write |
| opening-design.md | 31KB | 压缩 | 压缩后同步到short-write |
| emotional-arc-design.md | 17KB | 压缩 | 压缩后同步到short-write |
| dialogue-mastery.md | 12KB | 压缩 | 压缩后同步到short-write |
| reversal-toolkit.md | 15KB | 压缩 | 压缩后同步到short-write |
| anti-ai-writing.md | 14KB | 保持 | 不改动（已足够精炼） |
| banned-words.md | 2.4KB | 保持 | 不改动 |
| quality-checklist.md | 8KB | 保持 | 不改动 |

**long-write ↔ short-analyze（额外4个，上面已包含）：**
character-design.md, genre-frameworks-unified.md, hook-techniques.md, quality-checklist.md

**short-write ↔ short-analyze 独有共享（不在 long-write 中）：**
- genre-writing-formulas.md (75KB) → 后续任务#3/#6中处理

### 同步策略

1. 先在 story-long-write 中完成拆分/压缩，产出稳定内容
2. 将拆分/压缩后的文件复制到 short-write 的 references/ 目录
3. 将3个共享拆分文件（genre-catalog/core/readers, hooks-chapter/suspense/paragraph, character-basics/design-methods/relations）也复制到 short-analyze
4. 更新所有受影响 skill 的 SKILL.md 引用
5. 所有skill中的同名文件内容完全一致（保持跨skill重复设计）

### 执行顺序

1. 拆3个独占文件（outline-arrangement, style-modules, advanced-plot-techniques）→ 仅 long-write
2. 拆3个共享大文件（genre-frameworks-unified, hook-techniques, character-design）→ 同步到 short-write + short-analyze
3. 压缩4个中等文件（opening-design, emotional-arc-design, dialogue-mastery, reversal-toolkit）→ 同步到 short-write
4. 更新所有受影响 SKILL.md 的参考资料表

### 内容映射补全
- "连续性追踪与节奏管理"（原 advanced-plot-techniques.md）→ 归入 `plot-core-methods.md`
- Phase 2 场景索引补充 `genre-catalog.md`（题材定位artifact需要题材框架数据）

### 验证方法
1. **知识完整性**：提取每个原文件的所有H2标题，逐一确认映射到新文件，确保零遗漏
2. **引用完整性**：grep SKILL.md 中所有 references/ 路径，确认文件存在
3. **跨skill一致性**：md5比对同步文件，确保完全一致
4. **大小达标**：每个新文件 <30KB，确认不超限

## 风险与缓解

| 风险 | 缓解措施 |
|------|---------|
| 知识丢失 | 拆分前先备份，压缩后与原文交叉比对 |
| SKILL.md 引用断裂 | Phase 4 验证步骤确保所有引用正确 |
| 跨skill不一致 | 共享文件在所有skill中同步拆分，内容完全一致 |
| 拆分粒度过细 | 每个文件保持 <25KB 上限，按场景自然分组 |
