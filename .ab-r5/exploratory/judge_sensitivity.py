# -*- coding: utf-8 -*-
"""评委灵敏度对照：把成稿改写成用户投诉的那种「平推概述体」（已知更差），
看两家评委能不能把原稿挑出来。挑不出来 = 这家评委的零结果没有信息量。"""
import sys, json, glob, collections, os
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0,'/Users/pite/makemoney/oh-story-pr373/.ab-r5/harness')
import cli, measure as M

FLATTEN = """把下面这段网络小说正文改写一遍。剧情事件、人物、顺序全部不变，只改写法：

- 每个情节点单独成段，一段讲完一件事，按顺序平推。
- 用概述句交代，不要具体镜头：把「他把烟摁进搪瓷缸，缸底还剩半口凉茶」这类
  写成「他有些烦躁地抽完了烟」。
- 人物情绪一律直接告诉读者：写「他心里一紧」「气氛变得凝重」「前所未有的震撼」。
- 一批人、一段过程、一片反应用清单句整批交代：「有人说……也有人说……」。
- 字数与原文接近。

只输出改写后的正文，不要任何解释。

===== 原文 =====
%s
"""

OUT = '/Users/pite/makemoney/oh-story-pr373/.ab-r5/exploratory/judge_sensitivity'
os.makedirs(OUT, exist_ok=True)
picks = sorted(glob.glob('/Users/pite/makemoney/oh-story-pr373/.ab-r5/runs/ch*__base__gpt__r1.final.md'))
picks = [picks[i] for i in (0, 3, 6, 9, 12, 15)]

def flatten(p):
    rid = os.path.basename(p)[:-len('.final.md')]
    fp = os.path.join(OUT, rid + '.flat.md')
    if os.path.exists(fp):
        return rid, open(p,encoding='utf-8').read(), open(fp,encoding='utf-8').read()
    orig = open(p, encoding='utf-8').read()
    t, mt = cli.call("gpt", FLATTEN % orig, min_chars=500)
    if t is None: return rid, orig, None
    t = M.normalize_prose(t)
    open(fp,'w',encoding='utf-8').write(t)
    return rid, orig, t

with ThreadPoolExecutor(max_workers=6) as ex:
    flats = list(ex.map(flatten, picks))
flats = [f for f in flats if f[2]]
print("flattened:", len(flats))

jobs = [(j, rid, o, f, order) for rid, o, f in flats for j in ("ds","gpt") for order in ("of","fo")]
def go(x):
    j, rid, o, f, order = x
    a, b = (o, f) if order == "of" else (f, o)
    r, mt = M.pref(j, a, b)
    if not r: return j, rid, order, None
    w = r["winner"]
    pick = ("orig" if w=="甲" else "flat" if w=="乙" else "tie") if order=="of" else \
           ("flat" if w=="甲" else "orig" if w=="乙" else "tie")
    return j, rid, order, pick
with ThreadPoolExecutor(max_workers=6) as ex:
    res = list(ex.map(go, jobs))
for j in ("ds","gpt"):
    c = collections.Counter(p for jj,_,_,p in res if jj==j)
    print(f"{j}: {dict(c)}")
json.dump([{"judge":j,"run":r,"order":o,"pick":p} for j,r,o,p in res],
          open(os.path.join(OUT,'verdicts.json'),'w',encoding='utf-8'), ensure_ascii=False, indent=1)
