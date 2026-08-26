# -*- coding: utf-8 -*-
"""测量层：抽取 / 可替换性判定 / 情绪直陈计数 / 成对偏好。

四个执行体的任务都很窄，谁都不知道臂别，也没人被问「哪一版是加了规则的」。
"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import cli
import build_prompt as bp

SETTING_LINE = ("都市 · 系统 · 文娱（军事主旋律）· 脑洞：前世 MCN 老板穿越成火箭军文艺兵，"
                "用地球神作整顿平行世界军宣，主角江晨，记者钟嘉嘉，上级周薄森/张耀祖。")


def normalize_prose(text):
    """去掉各 CLI 的排版习惯差异（行首缩进、多余空行），两臂同样处理。"""
    lines = [re.sub(r"^[ \t　\xa0]+", "", ln.rstrip()) for ln in text.split("\n")]
    out, blank = [], 0
    for ln in lines:
        if ln == "":
            blank += 1
            if blank > 1:
                continue
        else:
            blank = 0
        out.append(ln)
    return "\n".join(out).strip()


def parse_json(text, keys):
    """按字段抠，不整份 parse —— 评委 JSON 常在末尾被截断。"""
    m = re.search(r"\{.*\}", text, re.S)
    if m:
        try:
            return json.loads(m.group(0))
        except Exception:
            pass
    out = {}
    for k in keys:
        m = re.search(rf'"{k}"\s*:\s*(\[.*?\]|"[^"]*"|true|false|-?\d+)', text, re.S)
        if m:
            try:
                out[k] = json.loads(m.group(1))
            except Exception:
                out[k] = m.group(1).strip('"')
    return out


# ---------------- 抽取员 ----------------

EXTRACT = """你在做一份文本标注工作，**不评价好坏**，只做记录。

下面是一段网络小说正文，以及这一章原本规划的情节点清单。

请完成两件事：

1. 列出正文里**读者能复述出来的具体画面**，照抄原文片段（每条 ≤20 字）。
   一条 = 一个具体的人做一个具体的动作，或一个具体的物件，或一个具体的数字/时间点，
   或一句有内容的台词片段。
   规则：
   - 同一个物件、同一个动作只列一次，不要把同一句话拆成好几条。
   - 不列：概括性叙述、情绪与心理评价、抽象说明、泛泛的场面词、
     以及「他点头」「她笑了」这种任何小说里都有的通用动作。
   - 按正文中出现的先后排列，不设条数上限；宁可少列，也不要把每个名词短语都列进来。
2. 情节点清单里，哪几条在正文中被实际落地了（能指出对应的文字）？给出编号。

只输出一个 JSON，不要任何其他文字：
{"details": ["原文片段", ...], "covered": [1,2,...], "total_points": <整数>}

===== 情节点清单 =====
%(points)s

===== 正文 =====
%(prose)s
"""


def extract(model, prose, points):
    listing = "\n".join(f"{i+1}. {p}" for i, p in enumerate(points))
    txt, meta = cli.call(model, EXTRACT % {"points": listing, "prose": prose},
                         min_chars=10, need_cjk=False, timeout=900)
    if txt is None:
        return None, meta
    d = parse_json(txt, ["details", "covered", "total_points"])
    if "details" not in d:
        return None, {**meta, "parse": "fail", "head": txt[:300]}
    return {"details": [str(x) for x in d.get("details", [])],
            "covered": [int(x) for x in d.get("covered", []) if str(x).lstrip("-").isdigit()],
            "total_points": len(points)}, meta


# ---------------- 可替换性判定员（不看正文） ----------------

JUDGE = """下面是从某本网络小说的某一章里抽出来的细节清单。**你看不到正文，也不需要看。**

本书设定一句话：%(setting)s

对清单里的每一条，独立回答两个是非题：

A. `movable`：把这一条**原样**放进另一本书、另一个角色身上，还成不成立？
   成立（随便哪本书都能用这句）→ true；搬不走（离开这本书这个人就不成立）→ false。
B. `offgenre`：这一条是否**明显不属于**上面那句设定所描述的世界（题材串味）？是 → true。

只输出一个 JSON，不要任何其他文字：
{"items": [{"i": 1, "movable": true, "offgenre": false}, ...]}

===== 细节清单 =====
%(listing)s
"""


def _judge_chunk(model, chunk, offset):
    listing = "\n".join(f"{offset+i+1}. {d}" for i, d in enumerate(chunk))
    txt, meta = cli.call(model, JUDGE % {"setting": SETTING_LINE, "listing": listing},
                         min_chars=10, need_cjk=False, timeout=900)
    if txt is None:
        return None, meta
    parsed = []
    for m in re.finditer(r'\{[^{}]*\}', txt):
        blob = m.group(0)
        mi = re.search(r'"i"\s*:\s*(\d+)', blob)
        mv = re.search(r'"movable"\s*:\s*(true|false)', blob)
        mo = re.search(r'"offgenre"\s*:\s*(true|false)', blob)
        if mi and mv:
            parsed.append({"i": int(mi.group(1)), "movable": mv.group(1) == "true",
                           "offgenre": bool(mo and mo.group(1) == "true")})
    return parsed, meta


CHUNK = 35


def judge(model, details):
    """分块判定：每块 ≤35 条，保证输出不会被截断。缺项按块重试一次。"""
    all_items, metas = [], []
    for off in range(0, len(details), CHUNK):
        chunk = details[off:off + CHUNK]
        got = None
        for _ in range(2):
            parsed, meta = _judge_chunk(model, chunk, off)
            metas.append(meta)
            if parsed and len({it["i"] for it in parsed
                               if off < it["i"] <= off + len(chunk)}) >= len(chunk):
                got = parsed
                break
            if parsed and got is None:
                got = parsed          # 保底：不完整也先留着，第二次若更好则覆盖
        if got is None:
            return None, {"stage": "judge", "offset": off, "metas": metas[-2:]}
        all_items.extend(got)
    seen, uniq = set(), []
    for it in all_items:
        if it["i"] in seen or not (1 <= it["i"] <= len(details)):
            continue
        seen.add(it["i"]); uniq.append(it)
    if not uniq:
        return None, {"stage": "judge", "parse": "empty"}
    return {"items": uniq,
            "nsd": sum(1 for it in uniq if not it["movable"]),
            "off": sum(1 for it in uniq if it["offgenre"]),
            "n": len(uniq), "asked": len(details)}, {"chunks": len(metas)}


# ---------------- 情绪直陈计数员 ----------------

TELL = """你在做一份文本标注工作，**不评价好坏**，只做记录。

下面是一段网络小说正文。请逐条列出其中**直接告知情绪、或替读者把结论下掉**的句子，照抄原文（每条 ≤25 字）。

算数的：直接说出人物情绪状态的句子（「他心里一暖」「胸口堵得发紧」）；
用形容词替读者做判断的句子（「前所未有的震撼」「气氛变得凝重」）；
叙述者出面解释意义或总结的句子（「这一刻，他终于明白……」）。

不算数的：人物自己说出口的台词；只写动作、物件、感官而不点明情绪的句子。

只输出一个 JSON，不要任何其他文字：{"tells": ["原文片段", ...]}

===== 正文 =====
%(prose)s
"""


def tell(model, prose):
    txt, meta = cli.call(model, TELL % {"prose": prose}, min_chars=5,
                         need_cjk=False, timeout=900)
    if txt is None:
        return None, meta
    d = parse_json(txt, ["tells"])
    if "tells" not in d:
        return None, {**meta, "parse": "fail", "head": txt[:300]}
    return {"tells": [str(x) for x in d["tells"]], "n": len(d["tells"])}, meta


# ---------------- 成对偏好 ----------------

PREF = """下面是同一份章节大纲写出来的两个版本正文：甲 和 乙。剧情事件相同，只有文字不同。

请以**网络小说读者**的身份判断：哪一版更值得追读？

判断维度（不用逐条打分，综合判断即可）：画面感与质感、人物是否立得住、
是否读起来像流水账或素材简介、是否有 AI 腔（说教、上帝视角、替读者下结论）。

只输出一个 JSON，`winner` 必须放在最前面，不要任何其他文字：
{"winner": "甲", "why": "不超过25字"}
winner 只能是 "甲"、"乙" 或 "平"。

===== 甲 =====
%(a)s

===== 乙 =====
%(b)s
"""


def pref(model, a_text, b_text):
    txt, meta = cli.call(model, PREF % {"a": a_text, "b": b_text},
                         min_chars=3, need_cjk=False, timeout=900)
    if txt is None:
        return None, meta
    m = re.search(r'"winner"\s*:\s*"([^"]*)"', txt)
    if not m:
        m = re.search(r'(甲|乙|平)', txt)
        if not m:
            return None, {**meta, "parse": "fail", "head": txt[:200]}
    w = m.group(1)
    if w not in ("甲", "乙", "平"):
        return None, {**meta, "parse": "bad-winner", "head": txt[:200]}
    why = re.search(r'"why"\s*:\s*"([^"]*)', txt)
    return {"winner": w, "why": why.group(1) if why else ""}, meta
