# -*- coding: utf-8 -*-
"""按 workflow-chapter.md 步骤 6-7 重建 narrative-writer 的 spawn prompt。

两臂唯一差异 = ARM_BLOCK_V2 这一段文字，其余逐字相同。
"""
import os, re, json

ROOT = "/Users/pite/makemoney/oh-story-pr373"
BOOK = os.path.join(ROOT, "demo/长篇/让你管账号，你高燃混剪炸全网")
AREF = os.path.join(ROOT, "skills/story-setup/references/agent-references")
TMPL = os.path.join(ROOT, "skills/story-setup/references/templates/agents/narrative-writer.md")

# narrative-writer 参考文件表里对本任务命中的行（长篇续写章、有对话、有情绪目标）
INLINE_REFS = [
    "writing-craft.md",
    "banned-words.md",
    "anti-ai-writing.md",
    "emotional-arc-design.md",
    "dialogue-mastery.md",
]
GENRE_CARD = "genre-prose-cards/都市脑洞.md"


def read(p):
    with open(p, encoding="utf-8") as fh:
        return fh.read()


# ---------- 细纲解析 ----------

def parse_outline(n):
    path = os.path.join(BOOK, f"大纲/细纲_第{n:03d}章.md")
    text = read(path)
    out = {"raw": text, "path": f"大纲/细纲_第{n:03d}章.md"}

    m = re.search(r"^### 第\d+章[：:](.+)$", text, re.M)
    out["title"] = m.group(1).strip() if m else f"第{n}章"

    def field(name):
        m = re.search(rf"^- {name}[：:](.*)$", text, re.M)
        return m.group(1).strip() if m else ""

    for k, label in (("stage", "阶段位置"), ("formula", "本章结构公式"),
                     ("forbid", "本章禁止提前释放"), ("hook_head", "章首钩子"),
                     ("shuang", "爽点"), ("hook_tail", "章尾钩子"),
                     ("cast", "出场角色"), ("target", "字数目标")):
        out[k] = field(label)
    out["target_n"] = int(re.sub(r"[^0-9]", "", out["target"]) or 0)

    # 情节细化：编号情节点
    block = re.search(r"#### 情节细化\n(.*?)(?=\n####|\n- 预算说明|\Z)", text, re.S)
    pts = []
    if block:
        for line in block.group(1).split("\n"):
            m = re.match(r"^\s*(\d+)\.\s*(.+?)\s*$", line)
            if m:
                pts.append(m.group(2))
    out["points"] = pts

    # 核心事件
    core = re.search(r"^- 核心事件[：:]\n((?:\s+- .*\n)+)", text, re.M)
    out["core"] = [l.strip()[2:] for l in core.group(1).rstrip("\n").split("\n")] if core else []
    return out


def prev_tail(n, limit=1200):
    import glob
    hits = sorted(glob.glob(os.path.join(BOOK, f"正文/第{n-1:03d}章_*.md")))
    if not hits:
        return "（无上一章，本章为开篇）"
    body = read(hits[0])
    body = re.sub(r"^#.*\n", "", body, count=1).strip()
    return body[-limit:]


def cast_files(cast):
    names = [x.strip() for x in re.split(r"[、,，/]", cast) if x.strip()]
    chunks = []
    for nm in names:
        p = os.path.join(BOOK, f"设定/角色/{nm}.md")
        if os.path.exists(p):
            chunks.append((f"设定/角色/{nm}.md", read(p)))
    return chunks


# ---------- 两臂唯一差异 ----------

ARM_BLOCK_V2 = (
    "     - 拒绝概述（密度层）：细纲用一个词概括掉的地方——一批人、一段时间、一次过程、一片反应、"
    "一组数字，凡是**没法用一个镜头拍下来**的——都要落到能被一个镜头拍下来的东西上"
    "（一个具体的人／一件具体的物／一次具体的来回），不许用「第一个……第二个……」"
    "「有人说……也有人说……」这类清单句整批交代。判据：**把这个细节原样挪到另一本书的"
    "另一个角色身上，还成不成立？成立就说明它是通用填充，换掉**。其余的一笔带过甚至不写，"
    "不要每一处都办到同样的分辨率。另两条：**情绪不许直接告知**（不写「胸口堵得发紧」"
    "「前所未有」这类替读者下结论的句子，只写哪个动作停住了、哪句话说到一半换了词、"
    "哪个东西被拿起又放下）；**自查**——读者合上这一章，能复述出几个具体到不可替换的画面？"
    "一个都说不出，整章就还停在素材简介上。\n"
)


# ---------- 组装 ----------

def system_block():
    t = read(TMPL)
    t = re.sub(r"^---\n.*?\n---\n", "", t, count=1, flags=re.S)  # 去 frontmatter
    # 路径规则改成「已内联」，避免写手去读文件（本次为无工具的一次性生成）
    t = re.sub(
        r"## 参考文件路径规则\n.*?(?=## 参考文件体系)",
        "## 参考文件路径规则\n\n本次调用**没有文件工具**。你需要的全部参考文件与本书材料"
        "已按原文内联在下方，直接使用，不要尝试读取或搜索任何文件。\n\n",
        t, flags=re.S)
    return t


# DeepSeek 次要臂用的精简参考集：它的 64k 上下文装不下完整 prompt。
# 只用于「跨架构次要臂」，两臂在该臂内仍逐字节相同。
LEAN_DROP = ("anti-ai-writing.md", "emotional-arc-design.md")


def refs_block(lean=False):
    parts = []
    for name in INLINE_REFS:
        if lean and name in LEAN_DROP:
            continue
        parts.append(f"\n\n===== 参考文件：story-setup/references/agent-references/{name} =====\n\n"
                     + read(os.path.join(AREF, name)))
    parts.append("\n\n===== 参考文件：genre-prose-cards/都市脑洞.md（本书主题材卡） =====\n\n"
                 + read(os.path.join(AREF, GENRE_CARD)))
    return "".join(parts)


def materials_block(o, n):
    parts = ["\n\n===== 本书材料 =====\n"]
    for label, rel in (("设定/文风.md（自定义文风模式·权威风格基）", "设定/文风.md"),
                       ("设定/题材定位.md", "设定/题材定位.md"),
                       ("大纲/卷纲_第1卷.md", "大纲/卷纲_第1卷.md"),
                       ("追踪/上下文.md", "追踪/上下文.md")):
        parts.append(f"\n----- {label} -----\n" + read(os.path.join(BOOK, rel)))
    for rel, body in cast_files(o["cast"]):
        parts.append(f"\n----- {rel} -----\n" + body)
    parts.append(f"\n----- 上一章结尾（正文/第{n-1:03d}章，末 1200 字） -----\n" + prev_tail(n))
    parts.append(f"\n----- {o['path']}（本章细纲·全文） -----\n" + o["raw"])
    return "".join(parts)


def prep_block(o):
    core = "；".join(o["core"]) if o["core"] else o["formula"]
    return (
        "- 写前准备输出：\n"
        f"  - 本节速记：{o['stage']}；本章核心事件＝{core}\n"
        f"  - 情绪目标：{o['shuang'] or o['hook_tail']}\n"
        f"  - 涉及角色：{o['cast']}\n"
        "  - 参考技法：writing-craft「从细纲到正文」「三维度揉进」「疏密分配」；"
        "anti-ai-writing 七 Gate；dialogue-mastery 逐句情绪反馈\n"
        "- 主对标/拆文路径：本书自续写，无外部对标书；文风权威为 设定/文风.md（自定义文风模式）\n"
        "- selected_emotion_module：围观者反应链——弹幕/评论从质疑一路反转到认错与泪目"
        "（读者需求＝打脸＋感动叠加；触发器＝地球神作出手；可替换要素＝反应链的载体与人物）\n"
        "- rhythm_reference：系统派压力任务 → 主角祭出地球神作 → 围观反应链反转 → 数据/热搜/国运兑现\n"
        "- genre_prose_card：都市脑洞（已内联单卡，只作内部题材味校准，正文不得出现卡名或自评）\n"
        "- 文风路径：设定/文风.md（已内联）；文风召回指令：按其句长/标点/内心吐槽/对话分层/"
        "few-shot 锚点对齐本书既定笔调\n"
        f"- 阶段位置：{o['stage']}\n"
        f"- 本章结构公式：{o['formula']}\n"
        f"- 本章禁止提前释放：{o['forbid']}\n"
    )


COMMON_TAIL = (
    "     - 细纲优先边界（内容层）：只展开本章细纲，不自造新剧情；每条情节点都要独立落地，"
    "不许漏、不许两条并一句。不得仅为追字数自动补纲、扩写或重写。\n"
    "     - 正文形状（形状层）：落地位置、顺序、拆成几处由你编排，可打散重排、"
    "把相邻几条缝进同一个连续动作；不要一条一段平推，不把细纲措辞原样搬进叙述。\n"
)


def task_block(o, n, arm, seg, split, seg1_text=None, remaining=None):
    pts = o["points"]
    k = split
    if seg == 1:
        scope = (f"- 本次范围：只写情节点 1–{k}（共 {len(pts)} 点）。写完第 {k} 点即停，"
                 "不要收尾、不要写章尾钩子、不要提前写后面的情节点。\n"
                 f"- 字数目标：本章 {o['target_n']} 字（口径 visible_chars_v1）。"
                 "本段按情节点占比自然展开，不要心算逐点配额。\n")
        listing = "\n".join(f"  {i+1}. {p}" for i, p in enumerate(pts[:k]))
        prior = ""
    else:
        lo, hi = remaining["min"], remaining["max"]
        scope = (f"- 本次范围：只写剩余情节点 {k+1}–{len(pts)}。写完即停。\n"
                 f"- 前半段已写 {remaining['actual']} 字；本段的用户区间是 {lo}–{hi} 字"
                 "（口径 visible_chars_v1）。\n"
                 "- 只完成剩余情节点，不得为字数新增独立事件、人物决定、关系变化、揭示或支线；"
                 "剩余情节点完成即停，即使仍欠长也不加剧情。\n")
        listing = "\n".join(f"  {i+1}. {p}" for i, p in enumerate(pts) if i >= k)
        prior = ("\n----- 前半段已完成的正文（不要重写、不要复述，直接自然接续） -----\n"
                 + seg1_text + "\n")

    arm_line = ARM_BLOCK_V2 if arm == "v2" else ""
    return (
        "\n\n===== 本次任务（父流程 spawn 传参） =====\n"
        f"- 项目目录：demo/长篇/让你管账号，你高燃混剪炸全网\n"
        f"- 章节：第 {n} 章《{o['title']}》\n"
        f"- 细纲文件：{o['path']}（全文见上）\n"
        + prep_block(o)
        + "- 正文执行约束：\n"
        + COMMON_TAIL
        + arm_line
        + "\n" + scope
        + "\n- 本次要落地的情节点：\n" + listing + "\n"
        + prior
        + "\n----- 输出契约（严格遵守） -----\n"
        "- 只输出正文文本本身。不要标题行、不要任何解释、前言、后记、字数统计、"
        "自评、markdown 代码块或列表标记。\n"
        "- 第一行直接是正文。段落之间用空行分隔。\n"
        "- 正文里不得出现「第X章」「上一章」「本章」「前文」「后文」「伏笔」「细纲」「读者」"
        "这类写作工程词（角色在故事世界内真实阅读/讨论时除外）。\n"
    )


def build(n, arm, seg, split=None, seg1_text=None, remaining=None, lean=False):
    o = parse_outline(n)
    if split is None:
        split = (len(o["points"]) + 1) // 2
    return (system_block() + refs_block(lean) + materials_block(o, n)
            + task_block(o, n, arm, seg, split, seg1_text, remaining)), o, split


if __name__ == "__main__":
    import sys
    n = int(sys.argv[1]); arm = sys.argv[2]
    p, o, split = build(n, arm, 1)
    sys.stderr.write(f"chapter={n} arm={arm} title={o['title']} target={o['target_n']} "
                     f"points={len(o['points'])} split={split} prompt_chars={len(p)}\n")
    sys.stdout.write(p)
