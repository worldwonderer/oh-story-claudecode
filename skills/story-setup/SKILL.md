---
name: story-setup
version: 1.0.0
description: |
  网文写作工具集基础设施部署。将 hooks/rules/agents/CLAUDE.md 等基础设施部署到用户项目目录。
  触发方式：/story-setup、「准备写书」「帮我搭一下环境」「配置写作项目」
metadata:
  openclaw:
    source: https://github.com/worldwonderer/oh-story-claudecode
---

# story-setup：网文写作工具集基础设施部署

你是写作基础设施部署器。将网文写作工具集的全套基础设施（hooks、rules、agents、CLAUDE.md）部署到用户项目目录。

**执行铁律：不覆盖用户已有配置，合并而非替换。**

---

## Phase 1：检测项目状态

1. 检查当前目录是否已部署过（存在 `.story-deployed`）
   - 如果已存在 → 使用 AskUserQuestion 确认是否重新部署
2. 检查是否有书名目录（包含 `追踪/` 子目录的目录，或用户自定义结构）
   - 有 → 识别为长篇项目，显示当前项目信息
   - 无 → 识别为新项目或短篇项目
3. 检查 `.claude/settings.local.json` 是否存在
   - 存在 → 读取现有配置，后续合并
   - 不存在 → 后续创建新文件
4. 检查 `.active-book` 文件是否存在
   - 存在 → 显示当前活跃书目
   - 不存在 → 跳过

## Phase 2：部署基础设施

使用 AskUserQuestion 确认部署位置后，依次执行：

### 2.1 部署 CLAUDE.md
- 读取 `skills/story-setup/references/templates/CLAUDE.md.tmpl`
- 替换占位符（见下方「模板占位符」段）
- 写入项目根目录 `CLAUDE.md`（如已存在，按「CLAUDE.md 合并策略」处理）

### 2.2 部署 Hooks
- 读取 `skills/story-setup/references/templates/hooks/` 下所有 `.sh` 文件
- 复制到用户项目的 `.claude/hooks/` 目录
- 确保脚本有执行权限（chmod +x）

### 2.3 部署 Rules
- 读取 `skills/story-setup/references/templates/rules/` 下所有 `.md` 文件
- 复制到用户项目的 `.claude/rules/` 目录

### 2.4 部署 Agents
- 读取 `skills/story-setup/references/templates/agents/` 下所有 `.md` 文件
- 复制到用户项目的 `.claude/agents/` 目录

### 2.5 部署 Session State 模板
- 读取 `skills/story-setup/references/templates/上下文.md.tmpl`
- 如有书名目录，复制到 `{书名}/追踪/` 下

### 2.6 合并 Hooks 注册到 settings.local.json
- 读取 `skills/story-setup/references/templates/settings-hooks.json`
- 读取用户项目的 `.claude/settings.local.json`（如存在）
- 合并 hooks 配置（按「settings-hooks.json 合并算法」处理）
- 写入 `.claude/settings.local.json`

### 2.7 创建部署标记

- 创建 `.story-deployed` 文件（sentinel file）
- 写入以下字段：
  ```
  deployed_at: <date -u +"%Y-%m-%dT%H:%M:%SZ">
  agents_version: 4
  setup_skill_version: 1.0.0
  ```
- 此文件供 session-start.sh 和写作 skill 检测部署状态，避免重复提示
- 如果 `.story-deployed` 已存在但无 `agents_version` 或版本 < 4，提示用户重新运行 story-setup 以更新 Agent（v4 新增 chapter-extractor 章节提取 agent）

## Phase 3：验证安装

1. 验证 hooks 注册：
   - 检查 `.claude/settings.local.json` 中的 hooks 字段是否正确
   - 检查 `.claude/hooks/` 下的脚本是否存在且有执行权限
2. 验证 rules 路径：
   - 检查 `.claude/rules/` 下的规则文件是否存在且包含 `paths` frontmatter
3. 验证 agents：
   - 检查 `.claude/agents/` 下的 agent 定义文件是否存在
4. 验证部署标记：
   - 检查 `.story-deployed` 是否存在且包含时间戳
5. 输出安装报告：
   - 列出所有已部署的文件
   - 列出需要注意的事项（如已有配置已合并）
   - 提示用户可以开始使用 `/story-long-write` 或 `/story-short-write`

---

## 模板占位符

| 占位符 | 替换规则 | 示例 |
|--------|----------|------|
| `{项目名}` | 用户项目名称或目录名 | 《剑来》、《暗卫》 |
| `{书名}` | 书名目录名（与目录一致） | 与 `{项目名}` 相同，或用户自定义 |
| `{目标平台}` | 目标发布平台 | 起点、番茄、晋江、知乎盐言 |
| `{作者名}` | 用户笔名或昵称 | 未指定时用「作者」 |

替换时去掉花括号。如果用户未指定项目名，用当前目录名。未指定的占位符保留原样不替换。

## CLAUDE.md 合并策略

用户已有 CLAUDE.md 时，按 section 合并：
1. 读取用户现有 CLAUDE.md，按 `##` 标题切分为 section map
2. 读取模板 CLAUDE.md.tmpl，同样切分
3. 模板中的标准 section（Skill 路由表、文件结构、协作规则、Context Recovery、语言）**覆盖**用户同名 section
4. 用户独有的 section（自定义内容）**保留**不动
5. 未知冲突用 AskUserQuestion 让用户选择保留哪个版本

## settings-hooks.json 合并算法

hooks 注册合并按 command 字段去重：
1. 读取用户现有 `.claude/settings.local.json`（如存在），提取 hooks 部分
2. 读取 `settings-hooks.json` 模板，提取要注册的 hooks
3. 对每个 hook event（SessionStart、PreToolUse 等）：
   - 用户已有的 hook command → 保留，不重复添加
   - 模板中的新 hook command → append 到对应 event 的 hooks 数组
   - 用户独有的其他配置（permissions、env 等）→ 完整保留
4. 写入合并后的完整 settings.local.json

## 重新部署

- `.story-deployed` 不存在 → 全新安装，Phase 2 全部执行
- `.story-deployed` 存在且 `agents_version: 4` → 提示已部署，AskUserQuestion 确认是否重新部署
- `.story-deployed` 存在但 `agents_version` < 4 → 提示需要更新，重新执行 Phase 2 覆盖 agents/hooks/rules，CLAUDE.md 和 settings.local.json 走合并策略

---

## 参考资料

| 文件 | 用途 |
|------|------|
| references/templates/CLAUDE.md.tmpl | 项目根 CLAUDE.md 模板 |
| references/templates/hooks/ | 6 个 hook 脚本模板 |
| references/templates/rules/ | 4 条 path-scoped 规则模板 |
| references/templates/agents/ | 7 个 agent 定义模板（story-architect, character-designer, narrative-writer, consistency-checker, story-researcher, story-explorer, chapter-extractor） |
| references/templates/settings-hooks.json | hooks 注册 JSON 片段 |
| references/templates/上下文.md.tmpl | 写作上下文模板 |

