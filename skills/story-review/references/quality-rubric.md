# Skill Quality Rubric — 4 类评分标准

## authoring 类（story-long-write、story-short-write）

| 检查项 | PASS | FAIL |
|--------|------|------|
| 输出格式 | 格式规范（一段一句、无空行、对话格式） | 存在格式违规 |
| 情绪连贯 | 情绪有起伏且有转折 | 情绪平直无变化 |
| 设定一致 | 与已有设定不矛盾 | 存在设定矛盾 |
| 钩子密度 | 每章有钩子 | 连续章节无钩子 |

## analysis 类（story-long-analyze、story-short-analyze）

| 检查项 | PASS | FAIL |
|--------|------|------|
| 输出完整 | 所有 Phase 都有输出 | 缺少 Phase 输出 |
| 引用准确 | 引用了原文具体内容 | 引用模糊或无引用 |
| 深度足够 | 有洞察和可操作建议 | 只有表面总结 |
| 格式规范 | 使用 output-templates.md 格式 | 格式不符合模板 |

## utility 类（story-deslop、story-cover）

| 检查项 | PASS | FAIL |
|--------|------|------|
| 功能完整 | 完成核心功能 | 核心功能缺失 |
| 无副作用 | 不破坏原有内容 | 修改了不该改的内容 |
| 质量提升 | 处理后文本质量明显提升 | 处理后无改善或变差 |

## pipeline 类（story-long-scan、story-short-scan、browser-cdp）

| 检查项 | PASS | FAIL |
|--------|------|------|
| 批量处理 | 能处理多个文件 | 只处理单个文件或失败 |
| 错误处理 | 单个文件失败不影响整体 | 一个失败全部中断 |
| 进度追踪 | 有进度输出和 _progress.md | 无进度追踪 |
| 恢复机制 | 支持断点续传 | 不支持续传 |
