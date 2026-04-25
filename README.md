# oh-story

网络小说创作工具箱。6 个 Claude Code skill，覆盖长篇与短篇网文的扫榜、拆文、写作全流程。

**当前版本：v2.0.0**

## 如何安装

```bash
npx skills add worldwonderer/oh-story-claudecode
```

安装后 7 个 skill 会自动注册到 Claude Code、Cursor、Copilot 等支持的编辑器。

## 如何更新

重新运行一次安装命令即可：

```bash
npx skills add worldwonderer/oh-story-claudecode
```

## 在 Claude Code 会话中使用

在 Claude Code 对话中直接输入斜杠命令触发对应 skill：

| 命令 | 用途 |
|---|---|
| `/story-long-scan` | 长篇扫榜 |
| `/story-long-analyze` | 长篇拆文 |
| `/story-long-write` | 长篇写作 |
| `/story-short-scan` | 短篇扫榜 |
| `/story-short-analyze` | 短篇拆文 |
| `/story-short-write` | 短篇写作 |
| `/story-deslop` | 去AI味 |

也可以用自然语言触发，例如：

- 「帮我开书」→ `story-long-write`
- 「扫个榜看看什么火」→ `story-long-scan`
- 「拆一下黄金三章」→ `story-long-analyze`
- 「写一篇知乎盐言」→ `story-short-write`
- 「这篇太AI了」→ `story-deslop`

---

## 工具箱

### 长篇工具

| Skill | 做什么 |
|---|---|
| `/story-long-scan` | 长篇扫榜。分析起点/番茄/晋江排行榜数据，提炼市场趋势 |
| `/story-long-analyze` | 长篇拆文。深度拆解黄金三章、人设架构、爽点设计、节奏控制 |
| `/story-long-write` | 长篇写作。从大纲到正文，辅助长篇网文创作全流程（也响应 `/story`、`/网文`） |

### 短篇工具

| Skill | 做什么 |
|---|---|
| `/story-short-scan` | 短篇扫榜。分析知乎盐言/番茄短篇数据，捕捉风口题材 |
| `/story-short-analyze` | 短篇拆文。拆解爆款叙事结构、情绪曲线、反转技巧 |
| `/story-short-write` | 短篇写作。从构思到成稿，聚焦情绪拉扯与节奏把控 |

### 润色工具

| Skill | 做什么 |
|---|---|
| `/story-deslop` | 去AI味。检测并清除AI写作痕迹，让文字回归自然 |

### 工具路径图

#### 长篇主线

```text
long-scan（什么题材火）
    ↓
long-analyze（拆一本爆款学结构）
    ↓
long-write（开书写作）
```

#### 短篇主线

```text
short-scan（什么情绪火）
    ↓
short-analyze（拆一篇爆款学反转）
    ↓
short-write（动笔写稿）
```

#### 快速通道

```text
已有方向，直接写 → /story-long-write 或 /story-short-write
已有作品，想拆解 → /story-long-analyze 或 /story-short-analyze
```

---

## 知识体系

统一的分层知识架构：核心知识集中在 `story-long-write/references/`，其他 skill 通过跨 skill 引用共享。

| 知识主题 | 文件 | 消费 skills |
|---|---|---|
| 人物设计与分析 | `character-design.md` | long-analyze, short-analyze, short-write |
| 钩子技法大全 | `hook-techniques.md` | short-analyze, short-write |
| 对话技法大全 | `dialogue-mastery.md` | short-write |
| 去AI味完整指南 | `anti-ai-writing.md` | deslop, short-write |
| 质量检查清单 | `quality-checklist.md` | long-analyze, short-analyze, short-write |
| 情绪弧线设计 | `emotional-arc-design.md` | short-write |
| 反转工具箱 | `reversal-toolkit.md` | short-write |
| 题材框架（双视角） | `genre-frameworks-unified.md` | long-analyze, short-analyze |

长篇专属知识（大纲排布、八节点结构、连续性管理、风格模块等）仅 `story-long-write` 使用。各 skill 保留自身专属文件（如短篇写作公式、拆文案例、禁用词表等）。

---

## 适用平台

### 长篇
起点中文网、番茄小说、晋江文学城、七猫小说、刺猬猫

### 短篇
知乎盐言故事、番茄短篇、七猫短篇、小红书故事

---

## 使用示例

### 示例 1：长篇从零开始

```
用户：我想写一本长篇网文，但不知道写什么
→ /story-long-scan 扫榜分析，推荐方向
→ /story-long-analyze 拆一本同类型爆款
→ /story-long-write 开始写大纲和正文
```

### 示例 2：短篇快速出稿

```
用户：帮我写一篇知乎盐言风格的短篇
→ /story-short-write
→ 确定情绪目标 → 设计反转 → 写初稿 → 精修
```

### 示例 3：拆解学习

```
用户：帮我拆一下《XX》的黄金三章
→ /story-long-analyze → 逐章拆解
```

---

## License

MIT
