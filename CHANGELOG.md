# Changelog

All notable changes to this project will be documented in this file.

## v0.6.1

### 新功能

- 新增 **chapter-extractor** 章节 Agent（Haiku）：客观白描铁律、动态密度公式（3-40范围）、100+项泛称黑名单（8类），支持并行章节提取
- story-long-analyze 管线重构：故事框架识别、两步法剧情聚合、3层置信度孤立情节兜底
- 管线鲁棒性：Stage 3-4 并行执行图、计数验证、completed_with_errors 部分失败容忍

### 改进

- 方法论深化：两阶段角色模型、别名4类分类、一人一实体原则、13种剧情类型、金手指8类分类
- 情节点密度从 8-15 扩展为 3-40 动态范围（150-200字/个）
- 新增智能分块（>500章）、关系提取改为从情节点提取、框架识别自检模板
- story-setup agents_version 升级到 v4（7 个 Agent）
- story-import 管道表同步更新

### 修复

- material-decomposition.md 目录名统一为中文（chapters→章节 等）
- output-templates.md 情节点密度修复（8-15→3-40动态范围）、孤立阈值同步
- SKILL.md 链接引用修正、质量门控指向权威来源（material-decomposition.md）
- 孤立情节兜底 output-templates.md 同步为3层置信度
- 全书概要长度对标 zenstory（300-600→500-1000字），补全长篇体系感描述要求
- SKILL.md 管道表 Stage 3 孤立兜底步数修正（4→6）

## v0.6.0

### 新功能

- 新增 **story-explorer** 只读查询 Agent（Haiku）：10 种查询类型（角色状态、伏笔、设定、时间线、进度、上下文加载等），被 story-long-write、story-review、story 路由集成调用
- 新增 **story-import** 逆向导入 Skill：4 阶段流水线（确认来源 → 深度分析 → 结构迁移 → 项目激活），将已有小说反向解析为标准项目目录结构
- story 路由表新增「查故事资料」和「导入小说」入口

### 改进

- story-setup agents_version 升级到 v3（6 个 Agent）
- UPGRADING.md 新增 v3 版本记录
- story-long-write、story-review、workflow-daily 统一 story-explorer 集成模式（部署检测 + 结构化 prompt + 回退机制）
- structure-mapping.md 新增势力/散落情节/悬念映射规则

### 修复

- structure-mapping.md 细纲反推表格格式修复（2 列 → 3 列 Markdown 表格）
- story-explorer context_load 增加备用逻辑（追踪文件缺失时扫描正文推断章节号）
- 统一所有调用点的参数命名为中文（项目目录/查询类型/查询参数）

## v0.5.0

### 参考文件操作手册格式重构（核心变更）

- 全 skill references 从「知识百科」统一转为「操作手册」格式：决策路由表 + 指令语气 + 质量检查清单
- 大文件拆分：character-design → basics + methods + relations；genre-frameworks → catalog + mechanics + readers + formulas；hook-techniques → chapter + suspense + paragraph；outline-arrangement → methods + conflict + structure-theory + rhythm；style-modules → craft + genre-modules + combat-face + commercial-theory；advanced-plot-techniques → core-methods + frameworks + special-topics + emotion-system
- 新增 writing-craft.md（306行）、format-and-structure.md（137行）、emotional-methods.md（179行）
- 13 个共享文件跨 skill (long-write/short-write/short-analyze/deslop) byte-for-byte 同步
- Agent 模板和 SKILL.md 索引全部更新为新文件名

### 新功能

- 新增 story-researcher 资料研究 agent（CDP 搜索+正文提取+多源交叉验证）
- 长篇写作新增场景路由（开书/日更续写/大修）+ 日更工作流 + 大修工作流
- story skill 路由表新增「查资料」入口
- story-review 审查流程新增可选事实核查路径
- static-check.sh 新增 Check 6：检测反引号行内悬空文件引用
- static-check.sh Check 5 增强：支持 `(subagent_type: xxx)` 格式匹配

### 改进

- 精简 story-short-write SKILL.md 22.8KB→13.7KB，新建 writing-workflow.md
- 长篇写作增加创作公式引用、分层摘要协议与扫榜新元素提取
- reference 文件拆分压缩 + 术语直白化

### 修复

- opening-design.md 恢复 6 个丢失知识点（鬼灭之刃范例/信息团排版/改进方向/创意正确展开/期待感三路径/卖点设计与验证）
- 全文件箭头风格统一（`-->` → `->`，21 处）
- character-relations.md `x` → `×` 符号修正
- story-outline.md 裸路径 → 全路径修复
- SKILL.md Phase 3 索引补全 genre-writing-formulas.md
- 9 项 bug 修复与改进（B-1~B-5/D-1~D-3/D-4）
- 悬空文件引用修复（artifact-protocols/agent 模板/publishing-guide）

## v0.4.1

- 新增 story-review 多视角对抗式审查 skill
- 跨 skill 去 symlink 化 + CI 一致性校验
- AI 模式适配 + deslop 量化 + 拆文格式指引
- 指令冲突修复（细纲策略、节长标准、反转百分比）
- 起点扫榜失效链接修复（新书榜拆分 + 三江 URL 迁移）
- grep 全角冒号匹配修复
- 补齐 banned-words.md + CI 增加 references 内部交叉引用检查
- 消除跨 skill 引用残留 + 同步共享文件差异

## v0.4.0

- 新增 story-setup 基础设施部署 skill
- 添加 skill 结构静态检查脚本 + CI 集成
- browser-cdp 跨平台支持（Windows/macOS/Linux）
- 长篇拆文 skill 多项改进
- 短篇拆文/短篇写作 skill 迭代验证改进
- 拆文输出统一到拆文库/{书名}/

## v0.3.0

- 新增 story-cover 封面生成 skill
- 添加 ClawHub marketplace metadata
- 扫榜脚本体系升级（5 平台采集 + 共享模块 + 安全加固）
- 采集脚本数据正确性修复
- 7 个 skill 流程衔接表中文化
- 交叉引用一致性 + 术语通俗化 + 4 个新参考文件

## v0.2.0

- 知识库整合打磨（文件合并/去重/去教程化/SKILL.md 修复）
- 长篇小说目录结构升级（编排/追踪目录 + artifact 模板）
- 扫榜能力增强 + 新增七猫采集
- 新增 CONTRIBUTING.md

## v0.1.0

- 初始版本：长篇/短篇写作、拆文、扫榜、去 AI 味、浏览器操控
- 用 52000+ 本真实数据增强知识库
