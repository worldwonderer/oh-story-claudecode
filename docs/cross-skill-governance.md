# 跨 Skill 文件治理决策

## 当前边界

- 每个可安装 Skill 必须自包含。story-setup 继续携带 Agent reference bundle，安装时不依赖仓库内其他 Skill 路径。
- 重复 runtime 由 `scripts/shared-assets.json` 管理；重复 reference 由 `scripts/shared-references.json` 管理。manifest 中的 source 是维护入口，target 是为独立安装保留的发布副本。
- 文件恰好同名不代表共享，文件改名也不代表独立。守卫按显式所有权和内容哈希同时检查。
- story-setup 使用单一 story-architect Agent，通过 `common + long|short` reference profile 路由，不复制两套 Agent 名称。

## 已执行决策

- 五类 `quality-checklist.md` 按消费者改成 long chapter、short prose、source story、review、agent quality，停止用 basename 暗示共享。
- story-short-analyze 的人物、题材、读者、钩子手册改成 `analysis-*` 标尺资产；报告表达改用轻量 `analysis-report-style.md`，不再复制正文去 AI 全手册和禁用词表。
- story-long-write 移除短篇 `genre-writing-formulas.md` 与段落钩子副本，改走长篇题材卡、剧情单元、章节钩子与悬念体系。
- 通用章钩文件的固定百字口径会渗入长篇；因此拆成 long/short chapter hooks，长篇按章节功能和跨章期待决定落点，不设固定百字配额。
- story-setup 为短篇公式、段钩、情绪法使用 `short-*` 部署别名，并增加独立的 long emotional profile。
- `plot-core-methods.md` 保留并由 story-architect 在卡文、剧情循环、五步高潮、过渡、长线期待与日纲推进时条件消费。
- story-deslop 删除没有消费者的 outline-copy detector；story-short-write 把自己的 detector 接入 Phase 4。
- story-architect 的 reference 清单收敛到 `agent-reference-profiles.md` 一个契约源：Common 只保留跨体裁方法，Long/Short 分别拥有题材、情绪、章钩、悬念、反转和质量覆盖；Agent 模板不再复制第二份 inventory。
- 原共享 suspense/reversal 拆成 `long-*` 与 `short-*`。长篇按章、单元、卷、全书维护期待与反转层级；短篇按全文、小节、证据归属与付费断点组织，不再让同一文件同时承载两套时空尺度。
- 长篇题材目录和核心机制改成 `long-genre-*` 独立所有权；短篇公式删除长篇黄金三章公式。通用 `agent-quality.md` 只保留跨体裁五维核心，长短篇阈值分别进入 quality overlay。
- `format-and-structure.md` 的 canonical owner 调整为 story-import，继续服务短篇/导入部署；长篇改用独立 `long-format.md`，不再复制短篇段落和全文格式口径。
- reference 治理从 exact-copy 扩展到 semantic ownership：目录镜像必须完整覆盖源树，高相似派生文件必须在 `derived_groups` 声明历史关系与分化理由，未声明近似副本直接失败。
- story-short-analyze 不再用“复制写作手册 + 声明只作分析”的方式兼容题材资料。混合的 genre catalog/formulas/mechanics、long suspense 和 chapter hooks 已替换为五个 `analysis-short-*` 源文观察标尺，分别负责题材所有权、结构功能链、有限机制复现、悬念证据链和边界钩子；不含卷级、全书、黄金开篇、推荐结构比例或每章必钩口令。
- `check-short-analysis-scope.py` 把这条边界写成静态契约：旧混合文件名、长篇 playbook token、推荐百分比和写作型标题重新出现时 CI 失败。相应历史 near-copy 声明从 12 组降为 9 组，而不是永久把已完成分化的文件留在豁免表。
- short-write Phase 2 在首屏路由短篇专属 `short-reversal.md`，产物再由确定性 verifier 校验累计目标字数、反转比例算术、付费点和大纲结构；reference profile 负责功能判断，verifier 只负责机械应用，不把百分比重新升级成质量阈值。
