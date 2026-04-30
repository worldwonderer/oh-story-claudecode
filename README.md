# oh-story-claudecode

网文写作 skill 包，覆盖长篇与短篇网文的扫榜、拆文、写作、去AI味全流程。

## 流程总览

```mermaid
flowchart LR
    classDef entry fill:#f0f0f0,color:#333,stroke:#999,stroke-width:1px
    classDef phase fill:#e8f4fd,color:#1a1a2e,stroke:#4a9be8,stroke-width:1px
    classDef final fill:#fce4ec,color:#333,stroke:#e57373,stroke-width:1px

    entry_l{{"长篇作者"}}:::entry
    entry_s{{"短篇作者"}}:::entry
    entry_r{{"已有方向"}}:::entry

    subgraph S1 ["  扫榜选材"]
        direction TB
        scan_l["长篇扫榜"]:::phase
        scan_s["短篇扫榜"]:::phase
    end

    subgraph S2 ["  拆文学习"]
        direction TB
        analyze_l["长篇拆文"]:::phase
        analyze_s["短篇拆文"]:::phase
    end

    subgraph S3 ["  落笔创作"]
        direction TB
        write_l["长篇写作"]:::phase
        write_s["短篇写作"]:::phase
    end

    subgraph S4 ["  精修定稿"]
        deslop["去 AI 味"]:::final
    end

    entry_l --> scan_l
    entry_s --> scan_s
    scan_l --> analyze_l
    scan_s --> analyze_s
    analyze_l --> write_l
    analyze_s --> write_s
    entry_r -.->|跳过准备| write_l
    entry_r -.->|跳过准备| write_s
    write_l --> deslop
    write_s --> deslop
```

## 安装

**方式一** 直接告诉 Claude Code / OpenClaw：

```
安装这个 skill https://github.com/worldwonderer/oh-story-claudecode
```

**方式二** 命令行：

```bash
npx skills add worldwonderer/oh-story-claudecode -y
```

更新时重新执行同一条命令即可。

## Skills

| Skill | 触发 | 说明 |
|:------|:-----|:-----|
| `story-long-write` | `/story-long-write` `/story` `/网文` | 长篇写作 · 大纲搭建、人物设定、正文输出 |
| `story-long-analyze` | `/story-long-analyze` | 长篇拆文 · 黄金三章、爽点设计、节奏分析 |
| `story-long-scan` | `/story-long-scan` | 长篇扫榜 · 起点/番茄/晋江市场趋势 |
| `story-short-write` | `/story-short-write` | 短篇写作 · 情绪设计、反转构思、精修出稿 |
| `story-short-analyze` | `/story-short-analyze` | 短篇拆文 · 叙事结构、情绪曲线、钩子拆解 |
| `story-short-scan` | `/story-short-scan` | 短篇扫榜 · 知乎盐言/番茄短篇风口数据 |
| `story-deslop` | `/story-deslop` `/去AI味` | 去AI味 · 检测并清除 AI 写作痕迹 |
| `browser-cdp` | `/browser-cdp` | 浏览器操控 · CDP 协议复用登录态抓取数据 |

自然语言同样触发：「帮我开书」→ `story-long-write`，「这篇太 AI 了」→ `story-deslop`。

## 项目文件结构

写作内容用文件系统管理，不堆在对话里。

**长篇：**

```
{书名}/
├── 设定/
│   ├── 世界观/          # 背景、力量体系等，按主题拆文件
│   ├── 角色/            # 每个人物一个文件（沈栀.md、陆衍止.md）
│   ├── 势力/            # 每个势力/组织一个文件（天机阁.md）
│   └── 关系.md          # 角色关系映射
├── 大纲/
│   ├── 大纲.md          # 全书卷级结构
│   ├── 卷纲_第一卷.md   # 每卷一个，含爽点节奏+人物弧线
│   ├── 细纲_第001章.md  # 每章一个章纲，与正文一一对应
│   └── ...
├── 编排/                # 章节级/卷级创作编排
│   ├── 钩子_第XXX章.md  # 章级钩子设计
│   ├── 情绪_第X卷.md    # 卷级情绪弧线
│   ├── 反转登记.md      # 全书反转管理
│   └── 题材定位.md      # 题材核心梗
├── 正文/
│   ├── 第001章_章名.md
│   └── ...
├── 追踪/                # 连续性管理
│   ├── 伏笔.md          # 伏笔埋设/回收状态表
│   └── 时间线.md        # 故事内时间线
└── 笔记.md
```

## 知识体系

各 skill 自带 `references/` 知识库，按需加载，不占上下文。

| 主题 | 内容 | 所在 skill |
|:-----|:-----|:-----------|
| 大纲排布 | 五步大纲法 · 故事结构分级 · 节点设计法 · 升级感设计 | long-write |
| 开头设计 | 开篇模式 · 前 500 字设计 · 黄金三章开头策略 | long-write / short-write |
| 人物设计 | 角色设定 · 人物提取 · 关系映射 · 动机链 · 群像 | long-write / short-write / short-analyze |
| 钩子技法 | 章尾钩子 13 式 · 章首钩子 7 式 · 段落级钩子 · 悬念编排 | long-write / short-write / short-analyze |
| 情绪设计 | 6 种弧形模板 · 期待感管理 · 题材赛道策略 | long-write / short-write |
| 题材框架 | 长篇八节点 · 短篇压缩三幕 · 8 大题材开头模板 | long-write / short-write / short-analyze |
| 对话技法 | 节奏 · 潜台词 · 信息控制 · 对话模式数据库 | long-write / short-write |
| 反转工具箱 | 类型 · 时机 · 误导底层路径 | long-write / short-write |
| 风格模块 | 对话 · 打斗 · 智斗 · 镜头式写作 · 装逼打脸 · 白描 | long-write |
| 高级技法 | 小纲四步法 · 高潮逆推 · 双线结构 · AB 交织法 | long-write |
| 去AI味 | 预防 · 三遍去AI法 · 改写范例库 · 禁用词表 | deslop / long-write / short-write |
| 质量检查 | 通用 · 长篇专项 · 短篇专项 · 毒点排查 | long-write / short-write / short-analyze |
| 写作公式 | 21 大题材写作公式 · 三翻四震 · 感情线四阶段 | short-write / short-analyze |
| 女频写作 | 女读者偏好 · 情感描写 · 感情线模式 · 对标拆书 | short-write |
| 拆文方法 | 黄金三章 · 情绪曲线 · 结构拆解 · 知乎风格分析 | long-analyze / short-analyze |
| 拆文实例 | 完整案例拆解 · 模板化输出 | short-analyze |
| 读者画像 | 9 维画像 · 目标读者分析 | long-scan |
| 市场数据 | 题材趋势 · 平台特性 · 采集格式 · 投稿指南 | long-scan / short-scan |

## 适用平台

**长篇** 起点中文网 · 番茄小说 · 晋江文学城 · 七猫小说 · 刺猬猫

**短篇** 知乎盐言故事 · 番茄短篇 · 七猫短篇

这套 skill 现在能让我度过找工作的过渡期 :joy:，希望也能帮到有需要的朋友。

## Star History

<a href="https://www.star-history.com/?repos=worldwonderer%2Foh-story-claudecode&type=date&legend=top-left">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/chart?repos=worldwonderer/oh-story-claudecode&type=date&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/chart?repos=worldwonderer/oh-story-claudecode&type=date&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/chart?repos=worldwonderer/oh-story-claudecode&type=date&legend=top-left" />
 </picture>
</a>

## 贡献

欢迎贡献新 skill、补充知识库、更新市场数据。详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## Community

[LINUX DO - The New Ideal Community](https://linux.do)

## 致谢

- [FanqieRankTracker](https://github.com/wen1701/FanqieRankTracker) — 番茄小说字体反爬解码方案参考
