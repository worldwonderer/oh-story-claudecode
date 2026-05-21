# Changelog

All notable changes to this project will be documented in this file.

## v0.6.6

> 日更续写稳定性 + 伏笔 hook 降噪

### Bug 修复

- 修复长篇 `/story-long-write 日更` 在多次会话后，同一批次内用户回复“继续”可能跳出 `workflow-daily.md`、直接进入正文续写的问题。
- 修复日更流程偶发绕过真实项目文件、依赖聊天记忆写作的问题：每章开始前必须确认读取本轮 workflow 内的细纲、上一章正文、上下文、伏笔、时间线和角色状态/设定。
- 修复 SessionStart hook 把正常开放伏笔（`未埋` / `已埋`）当成问题提示，进而诱发全量伏笔审计和 token 膨胀的问题。
- 修复 `workflow-daily.md` 中裸 `SKILL.md` section 描述被本地 static-check 误判为断裂 section 引用的问题。

### 改进

- **story-long-write**：日更批量写作中，“继续 / 续写 / 日更”统一解释为继续当前 daily workflow，不重新进入场景选择，也不跳过状态筛选和意图确认。
- **workflow-daily**：正常批量执行时不再逐章询问“是否继续”；仅在细纲缺失、章节号冲突、请求范围超过已有细纲、用户要求改大纲/追踪等真实阻塞时暂停确认。
- **伏笔处理**：日更流程只处理本轮新增、推进、回收的增量伏笔；全量伏笔审计只由 `/story-review` 或用户明确要求触发。
- **story-setup**：`agents_version` 升级到 v7，既有项目重新运行 `/story-setup` 后可获得新版 hook/agent/rule。
- **CI/脚本**：`check-hook-regex-sync.sh` 从静态正则覆盖检查升级为行为级 fixture 校验，验证正常开放状态不报警、`已过期` 和异常状态报警。

### 验证

- `git diff --check`
- `bash scripts/check-hook-regex-sync.sh`
- `bash scripts/check-shared-files.sh`
- `bash scripts/static-check.sh`
- GitHub CI：macOS / Windows / static-check 全绿
- tmux + Claude Code 场景实测：构造 42 章长篇项目，执行 `/story-long-write 日更` 写第43章，再回复“继续”写第44章；两轮均保持在 daily workflow，读取必需上下文/伏笔/时间线/角色状态，未触发全量伏笔审计。

## v0.6.5

> 写作去 AI 味密度修复 + 对标路径说明统一

### Bug 修复

- 修复 Claude/Opus 4.7 下旧“三层展开”提示容易诱导的叠加式描写：同一动作/情绪不再按发生、感知、反应拆成多段重复描写
- 修复三维度织入后一段到底的问题：新增镜头断段、手机阅读密度和输出前密度重排规则
- 修复 Windows + DeepSeek/Claude Code 组合中字数统计偏差：优先使用 Python 字符统计，`wc -m` 仅作 macOS/Linux 备选，禁止模型估算和 `wc -c` 字节数

### 改进

- **story-short-write / story-long-write**：正文写作改为“三维度织入”，并明确按新动作/新物件/新信息/新对话断段
- **story-deslop**：将“重复描写去重”纳入 Gate C/D，不再用专项门禁堆叠规则
- **story-long-write / chapter-extractor / story-long-analyze**：长篇情节点密度统一为 150-200 字/个情节点，每章下限 10 个、上限 40 个
- **story-setup**：agents_version 升级到 v5，narrative-writer 模板同步新版场景写法、段落密度和跨平台字数统计规则
- **story-short-write**：统一短篇 `对标/` 与 `拆文库/` 路径说明：项目根 `拆文库/` 为原始产出，短篇目录 `对标/` 为当前作品引用视图

### 验证

- `git diff --check`
- `bash scripts/static-check.sh`
- `bash scripts/check-hook-regex-sync.sh`
- tmux + Claude Code 场景实测：对比旧三层、三维度织入、镜头断段和密度重排后的段落/句长指标

## v0.6.4

> 产线思路统一 — 核心思路集成 + 文件系统 + 准备层

### 新功能

- 新增 **state-tracking.md** 状态追踪协议文件（双 skill 共享）：最简记忆包提取逻辑（当前状态/历史因果/世界约束）+ 角色状态快照格式

### 改进

- **story-long-write SKILL.md**：
  - 新增"核心方法"section（4 条原则：先定情绪、验证过的模式、模块组装、只加载必需信息）+ 情绪-题材对照表
  - Phase 1 首问从"写什么类型"改为"让读者什么感觉"
  - Phase 2 开头加入"从目标情绪出发"和"角色位抽象"引导
  - Phase 3 大纲三检升级为四检（首条为情绪交付），细纲新增"目标情绪"字段
  - Phase 4 准备层前加入方法引导，写作技巧表新增"情绪验证"行
  - Phase 5 从单一检查改为双维度（情绪交付 + 技术质量）
  - 文件结构图升级：`对标/` 新增角色/剧情/设定结构化子目录；`追踪/` 新增 `角色状态.md`
  - Artifact 映射表新增 4 行（角色状态、对标角色/剧情/设定）
  - 单章写作 step 2 上下文读取从 7 扩展到 11 个文件源（含 `拆文库/` 回退路径）
  - 准备层 3.1（状态筛选）+ 3.2（模块召回）+ 3.3（指令确认）
  - 步骤重编号 1-10 连续无跳跃
  - narrative-writer prompt 注入准备层输出
  - Step 9（更新追踪）新增 `角色状态.md` 更新
- **story-short-write SKILL.md**：
  - 新增精简版"核心方法"section（3 条原则，不与执行规则重复）
  - Phase 2 引用改为"从目标情绪反推剧情"
  - 创作三检替换为 2 步准备层（记忆+召回 / 指令确认）
  - Phase 3 前新增简化文件结构说明

### 文档

- README.md 项目文件结构全面更新（长篇对标/追踪、短篇结构、拆文库说明），README_EN.md 长篇结构同步

## v0.6.3

> 引用完整性修复 + CI static-check 增强

### Bug 修复

- **story-long-write**: `genre-writing-formulas.md` 引用了不存在的 `genre-writing-techniques.md`，改为正确的 `style-craft.md`
- **story-long-write**: `format-and-structure.md` section 引用 `设计任务第 4 步` 在 long-write SKILL.md 中不存在，改为 `Phase 3 细纲`
- **story-short-analyze**: 补充缺失的 `anti-ai-writing.md` 和 `banned-words.md`（从 story-deslop 复制）

### CI 增强 (static-check.sh)

- **Check 6 收紧**: `references/` 下的反引号引用限制在 skill 内解析，防止跨 skill 断裂引用静默通过
- **Check 7 新增**: 裸 .md 文件名检测（非反引号、非链接、非代码块），不存在的文件报 FAIL，存在的报 WARN
- **Check 8 新增**: SKILL.md section 引用验证（三级匹配：子串 → 空格前缀剥离 → 字符级 fallback），断裂的 section 引用报 FAIL
- 脚本注释更新，准确描述全部 8 个检查项

## v0.6.2

> story-short-analyze skill v2.1.0

### 新功能

- 新增 **material-decomposition.md** 短篇拆解方法论：情节节点提取、爆点分析、写作手法（POV/对话/时间/信息/意象）、节奏分析、人物功能评估、共鸣分析（9层）
- story-short-analyze 升级为三件套架构（SKILL.md + material-decomposition.md + output-templates.md），对齐长篇拆文体系深度
- 新增**故事核**提取（一句话概括核心梗）
- 新增**爆点性/话题性**分析
- 新增**共鸣分析**（9层共鸣：情感/价值观/经历/社会现象/文化/普世价值/哲学思考/情感深度/人物深度）
- 新增**人物分类**（主人公/主动人物/被动人物/功能人物）

### 改进

- 短篇拆文管道从模糊 Phase 描述升级为 5 阶段管道表（Phase 2-6，含输入/输出/完成标志）
- 情节节点提取：密度公式（200-300字/个，15-60个全文）、6种节点类型、情绪标记（-9~+9）
- 爆点分析：6维度（铺垫/积累/延迟/爆发点/余波/印象）+ 期待感分析
- 写作手法：POV策略（含切换检测）、对话手法（占比/潜台词率/模式识别）、信息控制矩阵、意象追踪
- 人物功能标签（7种）、内在矛盾提取、弧线记录、人物分类（主动/被动人物）、关系演变追踪
- 可选模块：同类对比、平台适配评估（知乎/番茄/七猫）、详细节奏分析
- 质量门控：情节节点覆盖≥90%、情感曲线100%、写作手法≥5项、人物100%、共鸣≥3层
- 精细/标准双模式路由
- 术语全面对齐行业标准（故事核/爆点/共鸣/主动人物被动人物等）
- 新增**拆解思路**章节：核心原则（故事核驱动/读者视角/可借鉴性/爆点为中心/共鸣决定传播）+ 分析顺序 + 每阶段核心问题 + 拆解心态
- 新增分析维度：套娃反转质量检验、伏笔式反转、称呼变化追踪、主题意象群、重读发现、弹幕/评论互动、反差萌、倒计时框架、双视角叙事、双主人公结构
- 新增报应设计细分（主角设局 vs 反派自毁）、甜宠/喜剧类五维替代维度（反差萌浓度+甜度曲线）
- 新增灵活分节说明、反转密度异常检测、BE结尾评估标准（意难平≥8）、期待感分析
- **术语去抽象化**：清理 9 个自造词（心酸双峰/甜度阶梯/弹幕元叙事/反差萌循环/隐性反转/被动报应自循环/意象系统/二次阅读设计/称呼操控式），回归已有概念和日常描述
- 标杆拆文 demo：《我爸死后，我成了他的影子拳手》（套娃反转式，4层嵌套+5人物+12节点情感曲线）

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
