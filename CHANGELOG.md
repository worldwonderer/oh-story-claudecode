# Changelog

All notable changes to this project will be documented in this file.

## v0.6.21

> 短篇写作参考栈瘦身：删掉长篇继承残留，建立短篇专属 format/craft/deslop/题材包体系（#206）

### 改进

- **短篇写作 references 清理（#206）**：`story-short-write` 删除 13 个长篇继承残留参考（角色、长篇结构、通用题材读者、开篇、状态追踪等），避免短篇写作继续被长篇规则误导。新增短篇专属基础层：`short-format.md`（硬格式/段落/标点/正文契约）、`short-craft.md`（短篇叙事姿态、情绪直给+体感焊接、三维度揉进、密度控制）、`short-deslop.md`（短篇去 AI 味，只杀真 AI 腔，不杀情绪烈度）。
- **题材包接管短篇风格（#206）**：新增 `genre-styles/追妻火葬场.md`、`复仇打脸.md`、`总裁豪门.md`、`宅斗宫斗.md` 四个短篇题材包，把开头模式、爽点密度、对话风格、情绪模式、结尾模式收束到题材本地；冷门题材仍可降级读取 `genre-writing-formulas.md`。
- **短篇/拆文 AI 规则边界显式化（#206）**：共享 `output-contract.md` 明确拆文报告质量门仍走 `story-short-analyze/references/anti-ai-writing.md`，短篇成稿去 AI 味走 `story-short-write/references/short-deslop.md`，避免两套规则继续靠“本地 AI 腔规则文件”这种隐式短语耦合。
- **部署模板同步短篇例外（#206）**：`story-setup` 的 narrative-writer Claude/OpenCode/Codex 模板同步短篇题材包例外：短篇需要“情绪词 + 体感/动作焊住”时不强制改成纯动作外化，只清理空泛无体感的 AI 情绪总结。

### 发布准备

- 版本号升级到 `0.6.21`（`.claude-plugin/marketplace.json` + `skills/story/VERSION`）。`.story-deployed` 的 `agents_version` 升级到 `16`、`setup_skill_version` 升级到 `1.2.5`；本版含 deployed narrative-writer 模板与 reference bundle 更新，已部署项目需重新运行 `/story-setup` 并新开会话获取。`UPGRADING.md` 新增 v16 条目，`README` / `README_EN` 更新 v0.6.21 版本说明。

## v0.6.20

> 长篇大纲补强：对标节奏迁移（激活死链接）+ 章节定位与张弛（破"每章像短篇"）（#198）

### 新增

- **对标节奏迁移（#198）**：对标书拆出的 `剧情/节奏.md` 过去只喂 Phase4 逐章文风、从不回流卷级结构；新增「一级结构=对标书剧情单元 + 关键点法 + 对标节奏迁移 M1-M5」（`outline-structure-theory.md`），卷纲模板加「对标结构坐标」表，Phase3 卷纲定稿前读对标节奏回流（按归一化关键点 1/4·中点·3/4 换素材排进本卷，保留情绪链+功能位、禁照搬桥段，并比对「不建议模仿」就地修正对标硬伤）。缺 `节奏.md`/`情绪模块.md` 时走 `章节摘要 + 拆文报告` 降级路径（多数真实拆文库都缺，已在 盘龙拆文库 端到端验证）。
- **章节定位与张弛，破「每章像短篇」（#198）**：顶层「每章一视同仁——钩子+爽点+悬念」逼模型把关系/铺垫/过场章都写成强钩子短篇；改为按章在一级结构里的位置分六型定位（高压/推进/修炼试错/关系回收/低压生活/信息整理），低压/关系/过场章允许无显性爽点、弱钩子，但每章保留往下看的理由（番茄追读红线），并加「禁情绪母题扎堆」底线（连续多章同母题才是真正疲劳源）。定位可留空=退化为推进章，非硬配额、非新教条；压力级=爆发烈度，与情绪强度分两轴；占比按题材分档（番茄短平快高压可到 30%+）。SKILL.md 大纲四检升五检、顶层质量要求/爽点密度/step9/三处 QA 按定位放宽，story-architect spawn 注入「章节定位契约」，并修复 `agent-references/quality-checklist.md` 漏同步（deployed agent 审查时实读）。盲评（同一新章按旧/新规则各写一版正文）：旧版判「工业爽文/每章必须钩子的流水线产物」，新版「关系章作者型写法」，编辑判定新版明显更适合高潮后呼吸位；字数预算 Σ∈[章目标,×1.1] 契约不动，关系回收章加「≥1情感密点」更严下限。

### 发布准备

- 版本号升级到 `0.6.20`（`.claude-plugin/marketplace.json` + `skills/story/VERSION`）。本版同步更新 `agent-references/quality-checklist.md` 与 `outline-methods.md` 的章节定位豁免，并在 `story-architect` spawn prompt 注入「章节定位契约」——部署 agent 无需重部署即按新定位排/审大纲；未 bump `agents_version`（本版无 hooks/agents/agent 模板结构变更，agent-references 内容在新项目部署或下次重部署自然生效）。`README` / `README_EN` 更新 v0.6.20 版本说明。

## v0.6.19

> Codex CLI 适配 + OpenClaw 兼容（#186）· 自定义文风 `设定/文风.md` 优先于对标（#194）· 模型退化/工程词泄漏检测（#173）· 碎句号/长段落检测 + 破折号按功能改写（#188）· 正文兜底 + 跨批连续性确定性网（#195）· OpenCode 子代理模型自动配置降本（#191）· 细纲按字数预算根治欠字反复回炉（#187）

### 新增

- **Codex CLI 适配 + OpenClaw 兼容（#186, #189）**：`$story-setup` 部署 `.codex/agents/*.toml`（由 Claude agent 模板经 `generate-codex-agents.py` 生成）与 `.codex/hooks.json`；Codex 就地用 repo 时扫 `.agents/skills`（symlink 到 `skills/`，#189 加 symlink 守卫并记 Windows `core.symlinks` 坑）。补齐 OpenClaw skills-only 兼容（单行 frontmatter + `metadata.openclaw` + `story-setup target_cli=openclaw`），并加固 OpenCode/Codex 适配漂移守卫（`check-opencode-adapter.sh` / `check-codex-adapter.sh`）。
- **自定义文风优先于对标文风（#194）**：每章写作前先读 `设定/文风.md`，含实质内容即进入「自定义文风模式」——它作权威风格基（句长 / 软标点 / 对话潜台词 / 情绪交替），对标 / 拆文 `文风.md` 降为参考（原文锚点 + 句长兜底）；`narrative-writer` 文风指纹新增「来源」字段，用户新增/改 `设定/文风.md` 后用新来源刷新句长带快照、不再被旧对标永久压住（三端模板 + `上下文.md.tmpl`）。
- **模型退化 + 工程词泄漏检测器（#173）**：新增 `check-degeneration.js`（4 份字节同步），确定性检测弱模型退化——逐字复读/打转、末尾截断、占位/拒绝语（`作为AI`/`我无法续写`/`（此处省略）`/乱码 �）、工程词漏进正文（`细纲`/`情节点`/`本章`/`下一章` 等）；每条 finding 带 `severity: blocking|advisory`（blocking 即重写、tier2 章节/歧义词只提示，对话行里的 tier1 工程词降级 advisory）。接入 `story-long-write`/`story-deslop`/`story-review`/`story-short-write` 收尾复扫，`story-review` 子 Agent prompt 补「继承的开放项」做跨批连续性。
- **碎句号/长段落检测 + 破折号按功能改写（#188）**：`check-ai-patterns.js`（4 份字节同步）新增碎句号（连续短叙述句无呼吸）、长段落（>200 字按镜头断段）检测，与破折号按功能改写建议（打断→动作 beat/短句、拖长音→省略或动作、插入说明→逗号/冒号，不一律改句号）；每条 finding 带 `severity`，混合行（叙述 + 引号内物件）不再被一个引号整行豁免，`story-review` 指定 em-dash 归口 `check-ai-patterns.js` 并与 normalize 去重。
- **正文兜底 + 跨批连续性确定性网（#195）**：新增 deployed hook `check-prose-after-write.sh`（PostToolUse Write/Edit 落盘后跑硬信号兜底——截断、拒绝语/AI 自指、工程词泄漏、逐行复读、字数欠账），即使主会话漏跑确定性收尾也能兜住；三端（Claude/OpenCode/Codex）轻量网 parity 守卫，Codex 用 Stop 回合末 git 改动集扫描；跨批连续性在会话起点提醒续写断线 / 章节撞名。
- **OpenCode 子代理模型自动配置（#191）**：`$story-setup` 含 `target_cli=opencode` 时检测 `opencode models` 并按等级为各写作 agent 写入 `model:` 字段，避免低成本 agent 继承主模型造成高额消耗；逐级 AskUserQuestion 选择，支持自定义输入/保留现有/跳过，优先按 `opencode models --verbose` 的成本分级、关键词作回退。

### 改进

- **细纲按字数预算编排，根治正文欠字反复回炉（#187）**：细纲情节点序列改为按字数预算编排——每点标密/疏给预算（密 ≥250、慢镜头爽点 400-600、疏 ≈40、铺垫 120-150），各点求和 Σ 落在 [章目标, 章目标×1.1]；写后字数验证对照预算定位欠账密点、一次性重写到位，不逐点挤牙膏反复回炉，并补 > 章目标×1.1 的超预算收敛分支；调 `story-architect` 时 spawn prompt 注入预算契约并在接收细纲后校验 Σ。

### 修复

- **大纲守卫识别 Windows 盘符绝对路径（#184）**：写正文前的大纲守卫 hook 正确识别 `C:\\...` 形式的 Windows 盘符绝对路径，避免在 Windows 上误判正文文件路径。

### 发布准备

- 版本号升级到 `0.6.19`（`.claude-plugin/marketplace.json` + `skills/story/VERSION`），`.story-deployed` 的 `agents_version` 升级到 `15`、`setup_skill_version` 升级到 `1.2.4`——本版含 deployed hook / agent 模板 / Codex 适配变更，已部署项目需重新运行 `/story-setup` 并新开会话获取。`UPGRADING.md` 新增 v15 条目，`README` / `README_EN` 更新 v0.6.19 题词。

## v0.6.18

> OpenCode CLI 完整支持（#151）· 内置版本更新提醒（#173）· 对话机械化/论文腔修复（#171）· 续写文风漂移每章自检（#168）· 新名词锚点（#175）· AI 句式硬门槛与 detector 复扫（#166）· 封面平台尺寸裁剪兜底（#176）· Windows 中文系统 hook 字节稳定（#164）

### 新增

- **OpenCode CLI 完整支持（#151）**：新增 `skills/story-setup/references/opencode/` 适配层（`plugin.ts` 写正文前大纲守卫、13 个 command 包装、`AGENTS.md.tmpl`、`pre-commit.sh`、`opencode.json.patch`），`scripts/sync-opencode.py` 由 Claude agent 模板自动生成 opencode 副本并经 `.github/workflows/sync-opencode.yml`（check-sync）守卫；6 个写作 skill + story-setup 的 agent 检测同时兼容 `.claude/agents/` 与 `.opencode/agents/`，agent 参考路径解析增加 `.opencode/skills/` 步骤。
- **内置版本更新检查（#173）**：不新增 skill，把更新检查折进 `/story` 路由——主动「检查/更新版本」读 `skills/story/VERSION` 比对 GitHub latest release，提示 当前→最新 + Releases/CHANGELOG，由 AskUserQuestion 决定是否更新（只通知、不自动安装）；session-start 增加被动提醒（每 24h 至多一次、curl 5s 超时、全程静默兜底、`STORY_NO_UPDATE_CHECK=1` 可关，仅落后才提示）。被动提醒走 deployed hook，仅 Claude Code；主动检查两端通用。

### 改进

- **对话机械化/论文腔/不分场合修复（#171）**：`narrative-writer` 参考表接入 `dialogue-mastery`（按需读取），审查清单新增对话质量逐项（机械对话/角色科普嘴/说话不分场合）、新增「写完后对话自检」收尾步使对话检查每章必跑；写前意图确认（`story-long-write` 3.3 / `workflow-daily` 2.4）新增「③对话声线基线」按本章基调收敛（高压 beat→搞笑声线让位、信息型配角不当科普嘴、逐句承接对方情绪）；`story-review` Agent2（character-designer）新增对话三症状独立审查。`dialogue-mastery.md`（4 份同步）补「每句回应上一句情绪」「Gate G 同样管台词」「场合例外声线让位」。
- **续写文风漂移（逗号结巴体）每章自检（#168）**：`narrative-writer` 新增「写完后文风自检」收尾步，取目标句长带粗测本章句段长/碎句比，漂移即按目标带把碎句合并回中长句重写（以 `文风.md`/原文锚点为准，不模仿可能已漂移的上一章）；目标句长带快照钉进抗 compaction 的 `追踪/上下文.md` 新增「## 文风指纹」区（首次写作从 `文风.md` 快照填入、之后不变），自检优先据上下文指纹判漂，闭合长会话 compaction 后丢失文风路径的盲区。
- **新名词/设定首次出现给读者锚点（#175）**：`anti-ai-writing.md`（6 份同步）Gate G/模式8 自检后补反向制衡「删解释腔 ≠ 把读者读懵」——新名词/设定首次出现仍要靠角色动作反应/对话半句/场景物理后果一笔带出当下作用，不整段讲来历、也不甩零信息生词，并给「蓝晶」示例区分「锚 vs 解释」。
- **AI 句式硬门槛 + detector 复扫（#166）**：`narrative-writer`、写作 skill、review/deslop 流程把「先否定再肯定」翻转句式列为硬禁令（文风召回/对标模仿/Gate B 软规则都不能覆盖）；`story-deslop`/`story-long-write`/`story-short-write`/`story-review` 携带本地 `check-ai-patterns.js`，文件模式在预检/交付前 `node scripts/check-ai-patterns.js --check <正文文件…>` 复扫到 0；narrative-writer 无 Bash 工具时只报告已自检、不谎称已运行脚本。detector 收敛误报：`是`-类连词（只是/可是/于是…）、either-or「不是A就是B / 也是B」与句尾反问「…，是吗 / 是吧 / 是嘛」不再被当成翻转句式（4 份同步副本 + 回归用例）。
- **封面：强制收集笔名 + 平台尺寸由裁剪兜底（#176）**：`story-cover` Step 1 缺书名/笔名先 AskUserQuestion 补全、不留空；`GPT_IMAGE_SIZE` 降级为「目标比例提示」（实测多数中转/聚合代理忽略 size，对任意请求都返回约 2:3 竖图）；新增 Step 3.5 居中裁剪+缩放（crop-to-fill），不论出图比例都确定性裁成平台精确像素（番茄 600×800），不变形、不依赖代理是否认 size；提示词书名/笔名留中心安全区（inner ~85%）。

### 修复

- **Windows 中文系统 hook 字节稳定（#164）**：根治 GBK 区域编码两层坑——python stdout 恒 cp936（改 `sys.stdout.buffer.write`）；导出 GBK 下 gawk/sed/grep/bash 通配 mis-decode UTF-8（7 个 deployed hook 统一 `export LC_ALL=C`（python-safe 放置）、`common.sh` book-name sed 包裹、全角冒号改 `(：|:)` 交替、全角空格 U+3000 处理）。新增真 GBK 区域端到端 CI（ubuntu/windows/macos）+ 静态 locale-safety 守卫 + python `print()` 禁用。
- **字数统计错误（#170）**：修复字数统计；`narrative-writer` Gate E 增「具体字数表达校验」（禁止正文中未经脚本核验的「这五个字」式字数断言，改非数字表述）。

### 文档

- **精简 README OpenCode 注意事项（#179）**：README / README_EN 把 #151 引入的「OpenCode 已知差异」5 条 bullet 压成一行（安装发现 + 重启 + 首次自然语言触发 + 「部分 hook 行为有差异，详见 CONTRIBUTING」），实现细节统一回填 `CONTRIBUTING.md`（detect-gaps/session-end/validate-commit/browser-cdp ESC），指针名副其实不丢信息。

### 发布准备

- `CHANGELOG.md` 新增 v0.6.18 条目；`.claude-plugin/marketplace.json` metadata.version 0.6.17 → 0.6.18；`skills/story/VERSION` 0.6.17 → 0.6.18（更新检查锚点，须与 release tag 一致）。
- story-setup `setup_skill_version` 1.2.3 / `agents_version` 14（v0.6.17 之后已 bump，本次不变）。由于 templates/hooks/rules/references 更新（含 OpenCode 适配层、对话/文风自检、detector 复扫、被动更新提醒），已部署项目需重新运行 `/story-setup`，并在部署后新开 Claude Code 会话。
- canonical source 位于 `skills/**`、`scripts/**`、`CHANGELOG.md` 和 `.claude-plugin/marketplace.json`；根目录 `.claude/` 仍视为 ignored 本地部署镜像。

## v0.6.17

> 用户反馈专项：长篇细纲升级为章节蓝图（#162）· 语气标点谱系（#161）· story-setup v13 部署刷新 · 汇入 v0.6.16 之后的深度限知、正文元信息、拆文模块链、review 一致性、段落/主语节奏等修复

### 新增 / 改进

- **长篇细纲升级为章节蓝图（#162）**：`story-long-write` 的 `大纲/细纲_第XXX章.md` 保留旧字段（核心事件、目标情绪、章首/章尾钩子、爽点、字数目标），新增内容概括（起因/发展/转折/高潮/结尾）、情节安排（主线/辅线/事件线/感情线/逻辑线）、人物关系和出场顺序、情节细化、结尾设定和钩子。
- **日更与导入消费新版蓝图**：日更准备层会显式读取内容概括、多线安排、人物出场、代价/收益与章尾承接；旧版细纲缺新版字段不阻塞，补建/回填未知项统一写 `[待补充]`；`story-import` 只从证据反推新版字段，不编造副线或关系。
- **细纲蓝图上下游贯通（#162 下游细化）**：把已有 craft reference 接进日更写作/核对闭环，复用现有字段、零新概念——`内容概括` 发展/转折按 `plot-emotion-system` 倒推法做爽点铺垫（不铺=空洞）；`视角/信息差` 经 `出场顺序` 的在场配角放大成差异化反应（`plot-core-methods` 集体震惊）；`情节点功能标签` 即 `commercial-core-methods` 目的词，驱动展开/带过详略。落在 `story-long-write` 写前准备（3.3/2.4）+ 对照细纲核对（每条带修复动作），`story-architect` 模板同步叫法对齐；不新增字段/文件，旧细纲仍非阻塞。
- **短篇小节大纲轻量增强**：`小节大纲.md` 增加结构段/五段功能、人物/关系变化、因果/逻辑链、结尾承接/钩子等字段，但不套长篇完整章节蓝图，避免短篇流程变重。
- **术语白话化（去自造黑话，语义不变）**：把作者面向的晦涩自造/借用复合词换成白话——蓝图兑现→对照细纲核对、三维度织入→三维度揉进、镜头断段→画面分段、最简记忆包→本节速记、质量门控→质量检查、准备层→写前准备、角色位抽象→看成功能位、五重驱动→五项驱动、孤立情节兜底→散落情节兜底、结构物件→贯穿道具、三现编排→三次出现、few-shot→范例片段、目标函数→目标、字数探针→字数检查 等；保留 功能位/信息团/目的词/戏剧单元/疏密分配 等行业真实术语；跨 skill 字节同构副本同步，本地守卫全绿。
- **语气标点谱系（#161）**：writer references、`narrative-writer`、`story-review`、`story-deslop` 增加“标点服务语气/人物声线”的规则：质问用问号，爆发峰值少量感叹；犹豫/未尽/打断/拖长改用动作停顿、短句或换行处理，正文产物不再使用 `……` / `——`；同时明确禁止通篇句号化和随机标点堆砌。
- **story-setup v13**：`setup_skill_version` 升级到 `1.2.2`、`.story-deployed` 的 `agents_version` 升级到 `13`；`story-architect` 产出新版章节蓝图，`consistency-checker` 消费逻辑线/人物关系变化/出场顺序/代价兑现，session-start 对 v12 及以下提示重新部署。
- **v0.6.16 后已合入改进汇总**：包含写正文前细纲守卫与 subagent solo 降级修复（#148）、深度限知视角/去解释腔/情绪烈度（#147/#152）、正文中禁止章节元信息（#155）、副对标书数量放宽（#157）、story-review 推理型一致性检查（#158）、拆文→可复用写作模块链（#149/#156）、清理过期市场指导（#160）、段落/主语节奏自然化（#159）。

### 修复

- **skill 指令一致性（左右互搏收敛）**：统一 `story-long-write` 日更读取列表与 `workflow-daily.md` 中 `剧情/情绪模块.md` / `剧情/节奏.md` 的缺失措辞——明确 v12 新契约缺失停下修复、仅 legacy 回退，消除与权威「缺失文件回退」规则的冲突；`story` 路由的「查故事资料 / 查资料」改为先做轻量 agent 可用性检查，不可用时降级直接 Read/Grep 并标注 `Fallback: agent unavailable -> direct lookup`，不再无条件直接 spawn。
- **标点规范化器边界修复**：`normalize-punctuation.js` 对紧跟开引号 / 开括号（`「『（(“‘`）的 `……` / `——` 删空处理，修复 `「……你回来了。」` 被误改成 `「，你回来了。」`、`「……」` 被改成 `「。」` 的问题；句末拖长、数字区间、冒号落点等既有行为不变（4 份副本保持字节一致）。

### 发布准备

- `CHANGELOG.md` 新增 v0.6.17 条目；`.claude-plugin/marketplace.json` metadata.version 0.6.16 → 0.6.17。
- 由于 story-setup templates/rules/references 更新，已部署项目需重新运行 `/story-setup`，并在部署后新开 Claude Code 会话。
- 根目录 `.claude/` 仍视为 ignored 本地部署镜像，不作为发布源；canonical source 位于 `skills/**`、`scripts/**`、`CHANGELOG.md` 和 `.claude-plugin/marketplace.json`。

## v0.6.16

> 扫榜全平台健壮性实测修复：番茄书名全回退 `bookId:xxx` 修复 + 题材/标签扩采 · 点众/七猫/刺猬猫书名与作品页链接修复 · 黑岩错误态细分 · 晋江补详情页核心指标采集 · 全平台连通性自检/质量信号 · 拆解管道合法性语境 · 写作流程破折号过滤 · prompt-cache 优化

### Bug 修复（扫榜）

- **番茄扫榜书名全回退 `bookId:xxx` 修复**：根因是详情解码把整页约 20 本一次性同步 XHR 塞进一个 eval，撞 `cdp-utils.ab()` 的 20s 硬超时 → 静默返回空 → 每本回退 bookId。改为分批解码（每 5 本）+ 多策略解析（内嵌 JSON `bookName` / `<title>` / og:meta），并加连通性自检与「标题解析率 / 数据质量」文件头标注（#144）。
- **点众扫榜书名是 UI 文字/简介串 → 重写**：改为按 `bookId` 聚合 anchor 解析（书名取「书名+评分」anchor 去尾部 `X.X分`、简介取最长 anchor、作者/状态/字数从卡片文本），实测书名 10/10、作品页链接 10/10（#144）。
- **七猫 / 刺猬猫作品页链接几乎全失修复**：`extractBookUrls` 旧版按 bookId 取到的是排名数字 / 空封面 anchor 当书名导致回填失败；改为取最像书名的 anchor + 书名归一回填，实测链接 20/21、10/10；七猫频道 tab 点击失败自动重试一次（#144）。
- **黑岩扫榜错误态误报修复**：把「接口超时 / CDP 断」「401 未授权」「服务端错误码」分开报错，不再一律误报「认证失败」+ 套用 DOM 选择器话术；加书名命中率质量门，字段改名时拦截而非静默写 undefined（#144）。
- **拆解管道补材料合法性语境**：消除对用户自有作品的过度拒绝（#143）。
- **长篇写作流程破折号过滤**：自动过滤破折号 + 修正规范化器误伤合法破折号（#139 / #141）。

### 改进（扫榜）

- **晋江补详情页采集**：列表取书名 / 作者 / `novelid` 后进 `onebook.php` 详情页，用 `fetch + TextDecoder('gb18030')` 解出 `itemprop` 微数据（收藏 / 营养液 / 积分 / 字数 / 状态，公开指标无需登录）；受 `--top` / `--detail-limit` 控量，`--list-only` 可跳过（#144）。
- **番茄题材 / 标签扩采**：题材取详情页 `categoryV2` 首个 `Name`、标签取简介开头 `【…】`（番茄 SSR 无评分字段，已移除评分声明）（#144）。
- **全平台扫榜健壮性统一**：浏览器型脚本统一连通性自检（CDP 未起 / 被重定向 → 可操作报错，替代误导性「结构已变」）、复杂 eval 走 base64（消除 shell 转义隐患）、输出文件头加质量信号（链接 / 书名 / 标题解析率、详情命中率）（#144）。

### 性能

- **削减 prompt-cache miss**：`story-deslop` / `narrative-writer` / `story-long-analyze` 拆解管道的提示词缓存未命中优化（#142）。

### 说明

- 扫榜修复均经真站实测（隔离 headless Chrome 逐平台跑通）+ sandbox 测试（番茄 31 / 晋江 10 断言）验证；`cdp-utils.js` 未改动，跨 skill 双副本仍字节一致。
- 本地守卫（shared-files / static-check 等）全绿。
- marketplace metadata.version 0.6.15 → 0.6.16。

## v0.6.15

> 拆文 demo 全量重做（盘龙长篇 / 曾将爱意私藏短篇）+ 新增 story-import 长篇续写工程 demo · story-import 框架修正（交付物＝写作工程，移除 `[导入反推]`）· 拆文契约/门控补强 · story-deslop/story-review 标点规范化（盐言「」保持有效）

### 改进

- **story-import（交付物＝写作工程）**：开篇与原则 1 明确「交付物是可续写的写作工程」——`拆文库/` 是工程的一部分（喂给 `对标/`）、非用完即弃的中间产物；Phase 1 新增「1.0 确认意图」，用户意图不明时主动询问「建写作工程 vs 只要拆文库分析」并分流（只要分析直接走 `/story-long-analyze`）。
- **移除 `[导入反推]` 约定**：删除 story-import 原「原则 3：标注导入来源」及所有 `[导入反推]` 标记/校验项，不确定字段统一改 `[待补充]`（`SKILL.md` + `structure-mapping-long/short` + `character-state-reverse` 同步）。
- **story-long-analyze 拆文契约补强 + 基调/主题标签枚举扩展**（#136）。
- **story-short-analyze 门控/计数口径补强**：情节节点计数口径明确（复合合并共用一个 N 编号、密度校验按最终 N 编号总数计）；Phase 7.1 AI 腔自检补源文豁免规则（跳过 `>` 引用行与表格原文直引列，只扫分析师本人措辞）（#136）。
- **banned-words 最毒句式补变体**：「不是A，（而）是B」标注「而」可省、省掉也算命中（6 份同步副本一并更新）（#136）。

### Bug 修复

- **标点引导纠偏（Issue #133）**：`story-deslop` / `story-review` 各自内置确定性 破折号/分隔线 规范化器 `normalize-punctuation.js`（skill 内复制一份、不跨 skill 引用）；盐言短篇「」引号保持有效、不被全局判错；写作 references 的 prompt 示例去掉「把 em-dash 节奏当首选散文模式」的教学。

### Demo 与文档

- **拆文 demo 按新契约全量重做**：`demo/拆文库-盘龙`（长篇拆文）、`demo/拆文库-曾将爱意私藏`（短篇拆文，替换原文缺失的「影子拳手」demo）。
- **新增 story-import 长篇续写工程 demo**：`demo/让你管账号，你高燃混剪炸全网`——番茄前 20 章逆向重建为可续写工程（正文 / 设定 / 大纲 / 追踪 / 参考资料），可直接 `/story-long-write` 日更续写第 21 章。
- **README / README_EN**：新增三个 demo 展示块（短篇拆文 / 长篇拆文 / 长篇续写工程）+ 交流群与 Discussions 链接（#131）。

### 工程

- **check-shared-files 守卫同名 script 副本**：跨 skill 同名脚本（如 `normalize-punctuation.js`）强制字节一致，防止复制副本漂移。

### 说明

- 同名共享文件改动均按 `check-shared-files.sh` 字节同步到全部副本；本地五道守卫（shared-files / python-invocation / story-setup-deployment / hook-regex-sync / static-check）全绿。
- marketplace metadata.version 0.6.14 → 0.6.15。

## v0.6.14

> 细纲后自动补全新设定/角色（防设定漂移）· Windows `python3` 跨平台修复（Store 占位程序 exit 49）· SessionStart hook 中文化 · 文档纠偏（README_EN / CONTRIBUTING）· 工程守卫加固（python 调用 / 语法 / 共享文件精度）

### 改进

- **story-long-write（细纲后自动建档）**：Phase 3 细纲段新增「细纲后设定补全」——每批细纲建完后扫描会复用的新具名角色/势力/关键设定，自动建 `设定/角色|势力|世界观` 档案 + `追踪/角色状态` 初始条目。按卷纲/细纲判断是否复用，一次性路人不建档；已存在按细纲增量补充、不覆盖；只填细纲已确定信息、留占位符、不杜撰。产物映射表补 `设定/角色|势力` 行；单章流程 step 11 增补「正文里首次引入的会复用角色」按同规则建档。（Closes #123）
- **SessionStart hook 中文化**：`detect-story-gaps.sh` 与 `session-start.sh` 面向作者展示的输出改为中文（保留 `[WARN]`/`[INFO]` 级别标记与 `/story-setup` 等命令名），降低非技术中文作者每次会话开始的理解成本。
- **dialogue-mastery 语言差异化表补全为 7 维**：原表只有 5 行，与同文件自查清单及 character-designer agent 写的「7 维差异化」矛盾；补上「身份影响措辞 / 进度影响态度」两维，4 个字节同步副本（long-write / short-write / agent-references / story-review）一并更新。
- **文档纠偏**：`README_EN` 安装命令补 `-g` 全局参数 + 全局/局部说明，短篇结构块纠正为真实文件名（`正文.md` / `小节大纲.md` / `拆文库/`，删不存在的 `References/`），对齐 `README.md`；`CONTRIBUTING` 把 CI 描述纠正为实际的 4 个守卫脚本 + `node --check`。
- **story 路由（多书切换）**：新增「切换/列出书目」意图与多书切换流程（扫描含 `追踪/`、`设定/` 的书目录，写回 `.active-book`）。

### Bug 修复

- **Windows 下 `python3` 触发 Store 占位程序 exit 49（修复 #121）**：真因是 Windows 上 `python3` 解析到 Microsoft Store 的 App Execution Alias 占位程序，在非交互子进程（Claude Code 的 Git Bash）里静默 `exit 49`，与中文路径无关。所有文档化的「跨平台字数统计」`python3` 调用改为解释器探测（`python3`→`python`→`py` 选可用者）；`validate-story-commit.sh` 的 `command -v python3` 守卫换成实跑探测（占位程序会让 `command -v` 误判存在）。（取代 #122）
- **agent 模板枚举漂移修复**：`story-architect` 情绪弧线对齐 emotional-arc-design（V形/倒V形/W形/递进/延迟满足/急转）、章首钩子改「按开篇策略选类型」、删残留玄学公式；`character-designer` 对话权力模式改 压制/反转/心死（对齐 dialogue-mastery）。

### 工程

- **跨平台 python 守卫**：新增 `scripts/check-python-invocation.sh`（禁止 `skills/` 里裸调 `python3`，覆盖 `-c`/`-m`/`<<`/脚本路径，放行探测列表与说明文字）与 `scripts/test-charcount-portable.sh`（构造中文路径 + 已知字数断言，`--stub` 模式塞入 exit-49 假 `python3` 复现 Windows 故障并断言回退到可用解释器）；`cross-platform.yml` 三平台接入，Windows 用 Git Bash 跑 stub 测试。
- **CI 语法守卫**：`cross-platform.yml` static-check 新增 `node --check`，覆盖全部 `*-scraper.js` + `cdp-utils.js` + `setup-cdp-chrome.js`（此前 0 覆盖，语法回归可直接进主干）。
- **采集脚本健壮性（7 个 scraper）**：`writeFileSync` 前补 `fs.mkdirSync(OUTDIR,{recursive})`（`--outdir` 指向不存在目录不再 ENOENT 丢数据）；裸 `main()` 统一包 try/catch + `process.exit(1)`；fanqie 额外补 per-category / per-channel try/catch（单品类/单频道失败不中断整轮）。
- **check-shared-files 精度提升**：`character-basics` / `character-design-methods` / `character-relations` 此前被整体豁免、漂移不报警；改为只排除 story-short-analyze 那份（带分析师视角 header 的有意分叉），其余副本仍强制字节一致，恢复对 writer↔writer 漂移的守卫。

### 说明

- 同名共享文件改动均按 `check-shared-files.sh` 字节同步到全部副本；三平台 CI 守卫全绿。
- `story-deslop` rubric 收紧仍在分支开发中，留待后续版本。

## v0.6.13

> write skill references 一致性修复 + 抽象概念可落地化（补真实网文例子 / 删黑话比喻）+ 同 skill 去重（指针化）+ agent 模板枚举漂移修复

### 改进

- **抽象概念可落地化**：两个 write skill 的理论 reference 把「只有定义没法照着写」的元概念补上具体网文例子或删掉空话——plot-emotion-system 提炼层级补「追妻文逐级抽象 + 换壳」贯穿例；plot-frameworks 故事构型补「萧炎打脸」例 + 小说四维自检改通俗四项 + 螺旋并线补可操作定义；style-commercial-theory（已改名）艺术化/极端化/代偿/观念错位/套路五写各补例；plot-core-methods 信息团 / 谜语人vs伏笔 / 升级三维度 / 金手指升华 补判据与例；emotional-arc-design 删「故事 = 情绪 × 世界」玄学公式、改三层情绪例；outline-structure-theory 选幕依据从悲剧体裁术语改按题材、删根/干/枝比喻列与八条线 placeholder；style-craft 删写意/神韵审美黑话；short genre-* 补基调自查/恋爱磨合/跨题材融合例并删修仙三境界等口号。
- **一致性修复**：短篇反转信息差阈值统一为 writing-workflow 三档（villain-and-reveal 改指针）；对话占比统一 45-65%（genre-writing-techniques 两处）；workflow-revision Step3 编号修复；SKILL 横切表 anti-ai-writing 括注改真实小节名 + 补「对话」行；long SKILL 两处锚点名对齐正文。
- **同 skill 去重（指针化）**：权力博弈对话（writing-craft→dialogue-mastery）、角色状态模板（artifact-protocols→state-tracking）、五幕式（plot-frameworks→outline-structure-theory）、阵营手牌法（plot-frameworks→plot-special-topics）各定单一真相源 + 同 skill 内指针，删重复块（净减约 130 行），不跨 skill 引用。
- **命名去误导**：`style-commercial-theory.md` → `commercial-core-methods.md`（全文讲卖点/商业策略不讲文风）；`format-and-structure.md` 标题「短篇格式规范」→「正文格式与小节结构」（承载全体裁通用排版硬规则，4 副本同步）。
- **F1 地图分层**：plot-core-methods 点明「新手村四势力（全量框架）vs 换地图三势力（精简版）」是分层而非矛盾，并提示换地图别丢变现/资源闭环渠道（3 副本同步）。
- **opening-design 短篇适配**：short SKILL 路由处注明「前3章」读作开篇首节~前1/3、七步法按目标字数等比缩放（不改字节锁定的 opening-design 本体）。

### Bug 修复

- **agent 模板枚举漂移**：story-architect 误导技巧「情感引导」→「情绪引导」、反转类型 5→7 补「认知/无反转」（与 reversal-toolkit 及拆文 `_meta.json.reversal_type` 契约对齐）；character-designer 关系命名「结盟型/权力型」→「联盟型/权威型」（与 character-relations 对齐）。

### 说明

- 同名共享文件改动均按 `check-shared-files.sh` 字节同步到全部副本；三道守卫（check-shared-files / static-check / check-story-setup-deployment）全绿。
- 暂缓项（需后续单独定方向）：`check-shared-files.sh` IGNORE 逻辑细化（character-* 在 write 侧已字节相同却被整体豁免，应改「按 skill 对」豁免，分类清单已备）、agent 模板少数 canonical-conflict 枚举（章首钩子7式 / 情绪弧线6种 / 语言风格5vs7维 / 对话权力模式）、agent 模板薄索引去重。

## v0.6.12

> 选题决策（开方）：扫榜→可行性判断→爆款原因假设→拆文回填 · references 按主题索引 + 检索可验证 · 女频长篇 playbook · 术语白话化（去自造比喻）· 工程守卫（CI 增检查 + 采集脚本健壮性）

### 改进

- **story-long-scan（选题决策）**：Phase 4 从「在对话里匹配」升级为产出持久的 `选题决策.md`——按「选题四步」给 2-3 个推荐选题（能爆的原因[待拆文验证] / 市场验证 / 差异化定位 / 可行性高·中·低 + 失败风险 + 验证动作 / 篇幅平台）。可行性按现有 `[数据稀疏]`/<15 样本门控封顶（样本不足不给「高」），内置知识模式一律「中」。方法见新增 `references/topic-decision.md`。
- **story-long-analyze（爆款原因回填）**：Stage 5 汇总报告产出后，若项目根有 `选题决策.md`，按题材关键词匹配回填对应选题的「能爆的原因」（引用本书 写法技巧/可借鉴套路/核心机制，标注为单本假设级支撑）；多匹配问用户、无匹配静默跳过、已填不覆盖。锚定 Stage 5 终态，不受 Stage 6（文风，失败容忍）影响。
- **story-long-write（消费选题）**：Phase 1 先查项目根 `选题决策.md`——存在则以可行性最高的选题为开书起点 + 看扫榜日期提示数据新鲜度；缺失则提示路径后回退原有选题提问。
- **story-long-write / story-short-write（按主题索引）**：两个 write SKILL.md 新增「按主题快速定位」横切主题索引（爽点/情绪/节奏/高潮/金手指/感情线/反转/人物/去AI味），每主题给一个权威文件 + 配套文件；爽点按「设计/翻盘/打脸/题材公式」意图分流。检索提升经 A/B 实测（带索引 vs 不带）。
- **story-long-write（女频长篇）**：新增 `references/female-audience-writing.md`——女频核心原则、文案结构、长线题材骨架、卷级感情节奏、多平台（番茄女生/起点女生/晋江/七猫）写法定位。
- **流程衔接补全**：story-setup、story-review 补「流程衔接」段（封面/浏览器工具等边缘 skill 不强加）；story `选题决策` 路由 → story-long-scan。
- **story-short-write**：`output-contract.md` 接入 Phase 2「对标上下文加载」+ 参考资料表（原为孤儿文件）。
- **术语白话化（去自造比喻）**：可行性灯→可行性高/中/低、开方/处方→选题建议、爆款基因→能爆的原因、粗/细格栅级→直述追踪粒度、逻辑闭环→前后能圆回来、状态语义→状态含义、新范式→新玩法、解构/原子事件→拆解/最小情节点、地图颗粒度→地图详略、好感度×关系阶段矩阵→对照表；`source of truth`→数据源、`Artifact`→产物；story-import `管线`→`管道` 统一。
- **README**：结构整理——list 化核心思路、前置项目文件结构、收拢知识体系段。

### 工程

- **CI**：`cross-platform.yml` static-check job 增加 `check-shared-files.sh`（跨 skill 同名副本一致性）+ `check-story-setup-deployment.sh`（部署完整性）守卫——此前仅本地运行，副本漂移可直接进主干无人拦。
- **采集脚本健壮性**：5 个排行榜采集脚本（刺猬猫/晋江/七猫/点众/黑岩）补错误处理——逐项 try/catch（单条失败不中断整轮）、页面结构变化时给明确「采集失败：页面结构可能已变」提示、中途失败已采部分仍落盘。纯 Node（fs/path/console），三端通用。

## v0.6.11

> story-short-analyze 输出契约 + Phase 7 门控验收 · 多对标书跨书召回（cross-book-recall）· write skill references 内容整理：反转类型对齐拆文枚举 + 跨书字段映射 + 去重瘦身

### 改进

- **story-short-analyze（短篇拆文）**：新增 `references/output-contract.md` 定义 analyze→write 输出契约——Stage→文件映射、`_meta.json` schema（含 `structure_counts`：beats/hooks/setup_clues/character_archetypes/reusable_structures/reversal_type）、下游消费规范。双副本与 story-short-write byte-equal，`scripts/check-shared-files.sh` 守护。拆文产物维持旧 3 文件名（拆文报告.md / 情节节点.md / 写作手法.md），不触及 story-short-write 既有读取。
- **story-short-analyze**：Phase 1 加字数探针（`<15000` 短篇 / `15000-20000` 灰区询问 / `>20000` 建议改长篇）+ lightweight resume（读 `_meta.json.last_stage_in_progress` + `stages_completed` 续跑）；题材识别扫不到时显式填 `genre_detected="通用"`。
- **story-short-analyze**：新增 Phase 7 门控验收——(7.1) 拆文报告 AI 腔自检；(7.2) `structure_counts` 数值/枚举校验（beats≥4 结构段、hooks≥3、reversal_type 在 7 枚举内）；(7.3) `output-templates.md` BLOCK 项扫描。`beats` 明确为结构段数（开端/发展/高潮/结局），情节节点 15-60 密度校验仍归 `情节节点.md`。`reversal_type` 枚举含「无反转」，甜宠/喜剧/报应型不被误伤（setup_clues 跳过阈值）。
- **story-short-analyze**：8 份 genre/character reference 注入「## 用作拆文标尺时」分析师视角 header（仅 analyze 侧分叉，`IGNORE_NAMES` 标注 intentional，不 cascade 进 writer）。
- **story-long-write / story-short-write（跨书召回）**：新增 `references/cross-book-recall.md`——项目根 `拆文库/` ≥2 本时启用多对标书跨书召回。三道防线：①副对标 `文风.md` 不读 ②角色/剧情/设定 模块只主对标 + 1 本同题材副对标 ③narrative-writer 输入只主对标。跨题材相关度由 agent 读「题材类型」字段自决（同题材/弱相关/不相关），不维护索引、不引入题材标号。长篇 4 个 + 短篇 2 个 HTML anchor 触发点，sync-source byte-equal 双副本。
- **story-long-write / story-short-write（references 内容整理）**：`reversal-toolkit.md` 反转类型 5→7，补「认知反转」（追妻/世情主力——全程恨结尾翻成爱）「无反转」（甜宠/喜剧/报应型，走甜度递进或报应兑现），与 analyze `_meta.json.reversal_type` 七值枚举字面对齐。`cross-book-recall.md` 加「拆文字段→写作参考」映射表（structure_counts 各字段回查对应 reference）。
- **story-long-write**：`narrative-units.md` 并入 `plot-emotion-system.md`（提炼层级零-四级 + 常见误区迁入，情绪模块/戏剧单元/卡片去重），减一份文件。

### Bug 修复

- 修复 story-short-analyze `beats≥4` 门控形同虚设——原注释标「情节节点数」但情节节点真实下限 15-60，门控永远通过；改为「结构段数」语义，阈值与定义对齐。
- 修复 story-short-analyze `reversal_type` 硬阻断会误伤无反转题材（甜宠/喜剧/报应型）——枚举补「无反转」并豁免 setup_clues 阈值。
- 修复 story-short-analyze 字数探针边界 `15000` 重叠（`≤15000` 与 `15000-20000` 都含 15000）——改非重叠 `<15000 / 15000-20000 / >20000`。
- 修复 cross-book-recall 触发条件与 `workflow-daily.md` 优雅降级口径冲突——主对标书字段缺失统一为「字典序第一本并提示」，不 fail-fast。
- 修复 story-long-write SKILL.md「五种反转类型」section-anchor 在 reversal-toolkit 改 7 类后静默失效——锚点同步为「反转类型」。
- 清理 story-short-write `style-craft.md` 孤儿（SKILL.md 0 引用、无 agent load；long-write 副本保留仍用）。

### 验证

- `scripts/check-shared-files.sh` 全过：output-contract.md / cross-book-recall.md / reversal-toolkit.md 各副本 byte-equal，0 mismatch。
- `scripts/static-check.sh` 13 skills 0 fail；`scripts/check-story-setup-deployment.sh` 通过（reversal-toolkit 3 副本含 agent-references 同步）；macos / windows / static-check 三套 CI 全绿。
- reversal_type 七枚举（视角/身份/动机/时间线/信息/认知/无反转）在 reversal-toolkit / output-contract.md / output-templates.md 三处字面一致。
- cross-book-recall 映射表字段名与 output-contract `structure_counts` 逐字匹配；narrative-writer agent prompt schema 零改动（`git diff` 确认）。
- 能力锚点回归：reversal-toolkit 原 5 类设置/揭示步骤未动；narrative-units 的「提炼层级」「戏剧性会磨损情绪不会磨损」「重构/微调」「常见误区」已进 plot-emotion-system；删 style-craft 前确认 short-write 0 live 引用。

## v0.6.10

> story-long-analyze 拆解管道修正 + 拆文产物按主题拆分 + 下游 story-import / story-long-write 同步对齐 · story-deslop rubric 收紧 + 禁用句式批量导入 · 对标书产物术语作者化

### 改进

- **story-long-analyze（长篇拆文）**：情节点下限统一到 10（原 SKILL.md 路由层与 chapter-extractor 校验层不一致：路由说 3-40，校验说 10-40——短章会被静默拆得过细或过粗）。5 处漂移位点全部对齐到 10-40。
- **story-long-analyze**：Stage 6 文风提取的句长/标点统计从「眼测」改为 `python3` 切句脚本（按 `[。！？]` 切句、桶化短/中/长句、统计标点密度）。Stage 6 由主线程跑，Bash 工具可用；句长 confidence 从 low 升到 high。
- **story-long-analyze**：Stage 4 拆为 4a / 4b / 4c——设定（世界观/金手指/势力）与 Stage 3 并行（数据源是 Stage 2 章节摘要 + 情节点，不依赖 Stage 3）；角色完整档案、角色关系串行依赖 Stage 3 合并后的角色实体。修正原并行图把「角色构建」放在 Stage 3 旁边的错误。
- **story-long-analyze**：概要.md 拆分两版——Stage 0 写 ~200 字 thin first-pass（基于章节标题 + 抽样开头/结尾），Stage 5 用完整剧情信息写 500-1000 字全书概要，覆盖 Stage 0 的首版。避免 Stage 0 在没读完全书的情况下硬凑高密度概要。
- **story-long-analyze**：新增 Stage 0.5 章节边界表，写入 `_progress.md`（`schema_version: 2`）。Stage 1/2/6 全部从该表取章节切片，不再各自跑 regex。旧 `_progress.md` 续跑时走 lazy migration——现场跑一次正则重建并写回，不破 `paused_after_stage1` 契约。章节正则补 `千` / `两`，支持 1000+ 章长篇。
- **story-long-analyze**：chapter-extractor 默认 haiku，质量校验失败（情节点 < 10、原文引用缺失、类型/基调超出枚举、角色名为昵称等 9 条自检）→ 主线程用 sonnet 重 spawn 一次。两份 chapter-extractor 模板（`.claude/agents/` + `skills/story-setup/.../templates/agents/`）内容对齐到自包含版本（不再引用 `output-templates.md`）。
- **story-long-analyze**：Stage 4 设定按主题拆分多文件输出——`设定/世界观/{背景设定,力量体系,地理,金手指}.md` + `设定/势力/{势力名}.md`，与下游 story-import / story-long-write 项目结构对齐，下游不再做 re-split。
- **story-import（已有小说导入）**：3.5 拆分步骤识别两种拆文库形态——`设定/世界观/` 子目录存在则 pass-through；只有单文件 `设定/世界观.md` 则走原 re-split 逻辑（早期拆文库或手动写的兜底）。
- **story-long-write（长篇写作）**：单章准备层读取路径从 `设定/金手指.md 或 世界观.md` 改为 glob `设定/世界观/*.md`，回退到单文件 `设定/世界观.md`、再回退 `设定/金手指.md`，全缺失则跳过不阻塞。项目结构文档同步更新到按主题拆分布局。
- **story-deslop（去 AI 味）**：rubric 全面收紧 + 从两份高信号来源 prompt（prompt_11257 / prompt_78650）批量导入禁用句式。Gate B 新增「不是 A，而是 B」「声音不大，却带着……」并把「如同」并入 仿佛 / 犹如 / 宛若 家族；新增「修饰词清扫」子块（形容词 / 定语 / 副词 / 指示代词 / 量词）；Gate C / D 把「重复语义」拆成 4 桶（形容词 / 近义词 / 含义 / 上下文主语）+ 加「多余场景 / 人物 / 物品描写」子块；Phase 4 报告加「字数协议」（原文 / 修订后 / 净变化 / 上限）+ 3 轮 stop rule + 「再检一次」尾检；Phase 4 明确文件路径模式——直接走 Edit / Write，对话里只 emit ≤200 字样本（避免长章节重发）；narrative-writer spawn 加 anti-recursion guard；明确「嵌入式提醒」模式仅 Phase 1+2。
- **story-deslop**：banned-words.md 新增「最毒禁用句式」表（毒级 ★★-★★★★★，仅来自两份 source prompt）；一级禁用补充 `如同` / `不容置喙` / `冰冷`；新增「书面腔→口语化」mini-table；新增「比喻分类」表（5 类，来自 prompt_78650）。anti-ai-writing.md 把「段落是否超过 3 句」改为网文段落规则（一句一段，≤4 分句，per prompt_78650）。6 份共享 reference 副本全部同步（涵盖 story-deslop / long-write / short-write / short-analyze / review / story-setup）。
- **story-setup / 日更文档（术语）**：Stage 6 产物在日更文档和 setup agent 模板里的称呼统一从「文风画像」改成 `文风.md`；把实现层的 metadata 语言换成作者向的「生成记录」契约。既有 agent JSON 字段保持兼容。
- **output-templates.md（小修）**：清掉 Stage 6 模板末尾的尾部空白，恢复 `git diff --check` 干净（writer-friendly 术语合并的遗留）。

### Bug 修复

- 修复 story-long-analyze 情节点下限漂移导致短章被过细切（路由层 3，校验层 10）。
- 修复 chapter-extractor 两份模板内容已经悄悄不一致（一份说「输出对齐 output-templates.md」，另一份说「不依赖外部模板」）。
- 修复章节正则 `第[一二三四五六七八九十百零0-9]+章` 对 1000+ 章长篇（盘龙 / 诡秘之主等）匹配失败的截断问题。
- 修复 story-long-write 日更循环读 `设定/金手指.md 或 世界观.md` 的扁平路径——拆文产物已经按主题拆到子目录后，这条扁平读取会 ENOENT 静默失败。
- 修复 story-deslop 英文触发词 `deslop` 与 `/oh-my-claudecode:ai-slop-cleaner` 冲突——删除该触发词避免误路由。
- 修复 story-deslop 综合判定规则 off-by-one：「五项 → 六项」（评估表实际包含 6 个指标）。
- 修复 story-deslop 「15% 上限」陈述与「分级删除上限 15/25/35%」不一致——统一改为「对应等级上限」。
- 修复 story-deslop Phase 1 报告的 排比 sample 归类错误（节奏 → 句式，对应 Gate B 而非 Gate D）。
- 修复 story-deslop 三遍法 ↔ Gate 的 1:1 映射叙述错误——实际是 overlap，重写为诚实的 overlap 表述。

### 验证

- F-codes（F1a/F1b/F2/.../F7）和 plan 上下文（`#F3-defer`）等开发期符号不外泄到 skill 文件——`grep -rn` 在 `skills/` 和 `.claude/agents/` 下 0 命中。
- 情节点下限：`3-40` 在 `skills/story-long-analyze/` 和两份 chapter-extractor 副本下 0 命中；`10-40` 在期望的 6 处全部命中。
- `python3` 切句脚本本地用真实中文小样本跑通：`sentences=6; short_lt15=66%; mid_15to30=33%; long_gt30=0%; avg_len=12; punct_density=15%`。
- 章节正则补全 character class 含 `千` + `两`：`grep -F` 在 `style-profile-generator.md` 行 55 唯一命中。
- 两份 chapter-extractor 副本 `diff -q` 空输出，byte-identical。
- 跨 skill 读取路径审计：story-long-write 已无扁平 `设定/世界观.md` / `设定/金手指.md` 单点读，全部走 glob + 回退链；story-import 既能 pass-through 新版子目录形态，也能 re-split 单文件版本。
- `_progress.md` 4 个状态值（`pending` / `paused_after_stage1` / `completed` / `completed_with_errors`）在 `pipeline-ops.md` 全部保留，无回归。
- `scripts/check-shared-files.sh` 全过（story-deslop 改动涉及 6 份共享 reference 副本，banned-words.md / anti-ai-writing.md 跨 skill 同步）。
- `scripts/check-story-setup-deployment.sh` / `scripts/static-check.sh` 通过；macos / windows / static-check 三套 CI 全绿。
- 「文风画像 → 文风.md」术语统一：日更文档与 setup agent 模板审计通过，既有 agent JSON 字段兼容性保留。

## v0.6.9

> story-cover 协议修复 + browser-cdp 同意握手 + story-review / story-setup 可靠性强化

### 改进

- **story-cover（封面生成）**：`images/edits` 流程改回正确的 `multipart/form-data` 形式（原 JSON-with-URL 仅在 yunwu 代理下歪打正着，对 OpenAI 直连必失败），文本字段用 `--form-string` 避免 `@` 前缀被误判为文件引用；自动版本号 `封面_v1/v2.png` 不再相互覆盖；落地 `.prompt.txt` 与 `.ref.txt` 旁注便于迭代；强制 `BOOK_DIR` / `PROMPT` 入口校验；`jq -n --arg` 拼 JSON 体规避中文/引号/换行的 shell 转义陷阱；`jq -er '.data[0].b64_json // empty'` 配合 `-s` 检查杜绝把 `"null"` 解码成 3 字节假 PNG；`jq`、`base64` 加入 `openclaw.requires.bins`。
- **story-cover**：删除已与 `references/cover-styles.md` 漂移的平台风格副本表，统一以参考文件为单一来源；新增 Step 1.5「题材判定」明确关键词命中 + 多匹配优先级 + 零命中默认都市的确定性规则；`API 配置` 段重写为环境变量速查表。
- **browser-cdp（浏览器操控）**：`setup-cdp-chrome.js` 在杀掉用户 Chrome 前先做明确的同意握手——TTY 走 readline 询问，skill 模式以 exit 3 + `NEEDS_CONSENT` 行回到 Claude Code 由 `AskUserQuestion` 询问，再以 `--yes` 显式确认。重排 `main()` 确保 Profile 复制在 Chrome 进程退出之后，避免 SQLite 写锁中复制导致 cookie 静默撕裂。
- **browser-cdp**：cookie 路径全覆盖（旧 `Default/Cookies` + 新 `Default/Network/Cookies` + `Login Data For Account`）；启动加固——端口校验、`--remote-allow-origins`、`--no-first-run`、`SingletonLock` 清理、超时后孤儿进程回收；新增 `--detect-only` / `--reset` / `--profile` 选项。
- **story-review（多视角审查）**：模式预检 + Agent 缺失/异常/过旧/启动失败的安全 solo 回退；reference 文件不可读时使用内置 rubric fallback；spawn 失败不再让 full/lean 半成品审稿继续；报告附带可机器校验的元数据。
- **story-setup（环境部署）**：sentinel v9 元数据 + 项目内 reference 路径双重校验；hook 包自包含化；新增 `scripts/check-story-setup-deployment.sh` 与 `scripts/check-hook-regex-sync.sh` 兜底回归。

### Bug 修复

- 修复 story-cover 在 `images/generations` 请求体中带 `response_format: b64_json` 的兼容性问题——`gpt-image-2` 始终返回 base64，该参数已被 gpt-image 系列拒收。
- 修复 story-cover 在 `BOOK_DIR` 未设置时静默落地到 CWD、`PROMPT` 未设置时报 `unbound variable` 等不友好行为，改为带说明的 `:?` 报错。
- 修复 browser-cdp 在不询问用户的情况下直接杀掉 Chrome 的破坏性默认。
- 修复 story-review 在用户项目尚未运行 story-setup 时直接失败而非降级 solo 模式。
- 修复 story-setup 短篇/长篇项目根目录解析在某些路径下不稳定的问题。

### 验证

- story-cover：双 bash block `bash -n` 全过；`jq -n --arg` 拼接含中文/引号/换行的 prompt 校验通过；`curl --trace` 证实 `--form-string` 不把 `@` 前缀当文件引用；端到端打 `yunwu.ai/v1`，文生图 2.9 MB / 图生图 3.1 MB 两个 1024×1536 PNG + 旁注文件齐全。
- browser-cdp：本地 fixture + Claude Code skill 模式 `NEEDS_CONSENT` 回环验证。
- story-review：tmux + Claude Code `/story-review` 单飞回退与 deployed-agent 满编 smoke 全过；3 个独立 read-only sub-agent 审查 + 1 轮 re-review 通过。
- story-setup：`scripts/check-story-setup-deployment.sh` / `check-hook-regex-sync.sh` / `check-shared-files.sh` / `static-check.sh` 全过；hook 模板 `bash -n` 全部通过。
- `claude plugin validate` 通过；GitHub CI：macOS / Windows / static-check 全绿。

## v0.6.8

> story-import 重构 + skill 自包含化 + 起点扫榜与 story-review 子 Agent 修复

### 改进

- **story-import（导入已有小说）**：按篇幅自动分流。长篇走 story-long-analyze 6 阶段管线 + 长篇结构迁移；短篇走 story-short-analyze + 短篇结构迁移（单文件 `正文.md`，不产 `追踪/`、`大纲/` 等长篇专属目录）。判定优先级：用户声明 > 章节结构 > 字数兜底 30000。
- **story-import**：长篇新增「角色状态反推」7 步算法，从拆书产物反推 `追踪/角色状态.md`，不重读原文。补齐 story-long-write 日更准备层依赖的角色状态文件，避免导入书永久走兜底分支。
- **story-import**：调用 story-long-analyze 时自动越过 Stage 1 停靠点，以「完整拆解、一次跑完、不要停下询问」模式驱动，确保 Stage 2-5 全套产物落地；停靠询问不透传给用户。
- **story-import**：skill 自包含化。原先跨 skill 引用 story-long-write / story-short-write 的 references（22+ 处 `../` 路径）全部清除——迁移所需模板（关系/题材定位/卷纲/角色状态）内联到 story-import 自己的 reference 文件，叶子引用文件（state-tracking.md、format-and-structure.md）以本地副本管理。

### Bug 修复

- 修复 story-review 子 Agent 读取 `quality-checklist.md` 等参考文件时按当前目录解析导致找不到的问题：story-review prompt 与 story-setup Agent 模板统一使用本 skill 内复制的 references 规范路径，并将 `agents_version` 升级到 v8 以提示既有项目重新部署。
- 修复起点中文网扫榜在 PC 站触发风控页时无法采集的问题：`qidian-rank-scraper.js` 默认改为移动端 SSR pageContext 抓取，并保留 CAPTCHA/CDP 回退。

### 验证

- story-import 篇幅分流、角色状态反推、跨 skill 引用清零均经独立验证；`scripts/static-check.sh` 13/13 PASS，`scripts/check-shared-files.sh` 0 mismatches。
- story-review / story-setup Agent 模板路径审计通过。
- 起点畅销榜实时采集成功并生成 Markdown。
- `node --check skills/story-long-scan/scripts/qidian-rank-scraper.js`
- GitHub CI：macOS / Windows / static-check 全绿。

## v0.6.7

> 拆书 skill 重构：长篇双模式合并 + 短篇去模式化

### 改进

- **story-long-analyze（长篇拆书）**：「快速 / 深度」双模式合并为单一拆解管道。「快速」不再是独立模式，而是管道跑完黄金三章（Stage 1）后的可停靠交付点——产出 `快速预览.md` 并询问是否继续全量拆解。确认后从 Stage 2 续跑，不重跑已完成阶段；`快速预览.md` 与终态 `拆文报告.md` 字段向上兼容。
- **story-long-analyze**：文档单一事实源。质量阈值、分块策略统一归 `material-decomposition.md`；运维内容（`_progress.md` 模板、错误处理、恢复机制）拆出为独立的 `pipeline-ops.md`。
- **story-short-analyze（短篇拆书）**：砍掉「标准 / 精细」双档，统一为单一全量拆解。双档在实操中无人遵守，连示范 demo 都没按标准模式产出。
- **story-short-analyze**：质量阈值收敛到唯一权威文件；管道阶段术语 `Phase 2-6` 对齐为 `Stage 2-6`，与长篇 Stage 体系一致；新增原文备份前置步骤。
- 黄金三章深度拆解产物由单文件拆为三个单章文件 `第N章_深度拆解.md`。
- 同步更新下游 skill：story-long-write、story-import、chapter-extractor agent 模板的拆书术语与文件名引用。

### Bug 修复

- 修复 `story-short-write` 指向「自检模式 / 拆文模式」的悬空引用——这两个入口在 story-short-analyze 中并不存在。
- 修复短篇拆书情节节点密度在三处文件给出不一致数值的问题，统一到唯一权威的字数分档表。

### 验证

- 长篇、短篇拆书各经独立验收，发现的问题已修复。
- 长篇新管道用《盘龙》开篇 23 章端到端实跑，Stage 1 停靠点、断点续跑、字段向上兼容均跑通。
- 全仓旧模式术语（快速模式 / 深度模式 / 标准模式 / 精细模式 / 自检模式）零残留。
- GitHub CI：macOS / Windows / static-check 全绿。

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
