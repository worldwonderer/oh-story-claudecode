# -*- coding: utf-8 -*-
"""章节结构分类（调节变量）——只看细纲，不看任何正文，不知道有实验。

标签：
  none     整章都是具体的人和具体的事，没有被一个词概括掉的「集合」
  concrete 有集合，且该集合在故事世界里有实体、能被一个镜头拍到
  abstract 有集合，但没有实体、拍不到（舆论、评论区、热搜、抽象时间流逝）
"""
import json, os, re, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import cli, build_prompt as bp

PROMPT = """下面是一本网络小说某一章的**细纲**（写正文之前的规划文档）。你只做归类，不评价好坏。

请判断：这份细纲里，有没有被一个词概括掉的「集合」——指向一批人、一段时间、一次过程、
一片反应或一组数字，而不是某一个具体的人或某一件具体的事？

如果有，它属于哪一种：
- `concrete`：这个集合在故事世界里**有实体**，可以被一个镜头拍到（一群在场的人、一段能走完的路、一批实物、一场能看见的活动）。
- `abstract`：这个集合**没有实体**，拍不到（网络舆论、弹幕与评论区反应、热搜与转发量、抽象的时间流逝、统计数字本身）。

如果整章都是具体的人和具体的事，没有这种被概括掉的集合，答 `none`。
如果 concrete 与 abstract 同时存在，取在本章**篇幅占比更大**的那一种。

只输出一个 JSON，不要任何其他文字：{"label": "none", "why": "不超过25字"}

===== 细纲 =====
%(outline)s
"""


def classify(model, n):
    o = bp.parse_outline(n)
    txt, meta = cli.call(model, PROMPT % {"outline": o["raw"]}, min_chars=3,
                         need_cjk=False, timeout=900)
    if txt is None:
        return None, meta
    m = re.search(r'"label"\s*:\s*"(none|concrete|abstract)"', txt)
    if not m:
        m = re.search(r'\b(none|concrete|abstract)\b', txt)
        if not m:
            return None, {**meta, "parse": "fail", "head": txt[:200]}
    why = re.search(r'"why"\s*:\s*"([^"]*)', txt)
    return {"label": m.group(1), "why": why.group(1) if why else ""}, meta


if __name__ == "__main__":
    from concurrent.futures import ThreadPoolExecutor
    out_path = sys.argv[1]
    chapters = [int(x) for x in sys.argv[2:]]
    rows = {}
    def go(args):
        model, n = args
        r, mt = classify(model, n)
        return model, n, r, mt
    jobs = [(m, n) for m in ("ds", "kimi") for n in chapters]
    with ThreadPoolExecutor(max_workers=6) as ex:
        for model, n, r, mt in ex.map(go, jobs):
            rows.setdefault(f"ch{n:02d}", {})[model] = r
            print(model, n, r, flush=True)
    json.dump(rows, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print("written", out_path)
