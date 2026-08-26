# -*- coding: utf-8 -*-
"""作业调度：写作 / 测量两阶段，线程池 + 断点续跑。

用法：
  python3 orchestrate.py write   <dir> --chapters 4 5 .. --models gpt kimi --reps r1 r2 --workers 6
  python3 orchestrate.py extract <dir> --workers 8
  python3 orchestrate.py judge   <dir> --workers 8
  python3 orchestrate.py tell    <dir> --workers 8
  python3 orchestrate.py pref    <dir> --workers 8
"""
import argparse, glob, json, os, random, sys, threading, traceback
from concurrent.futures import ThreadPoolExecutor, as_completed

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import build_prompt as bp
import measure as M
import run_write

# 抽取员 3 名：两次独立的 GPT 抽样 + 一次 Kimi 抽样。
# DeepSeek（codewhale）不能当抽取员/计数员——实测它对「输出一长串条目」的任务稳定返回空串
# （10 条可以，40 条起为空），只在输出极短的任务上可靠，故只用作偏好评委与章节分类员。
EXTRACTORS = ("gpt", "gpt2", "kimi")
JUDGE_MODEL = "gpt"          # 可替换性判定员：全程看不到正文
TELL_MODEL = "gpt"           # 情绪直陈计数员
# 偏好评委必须没写过这一对稿子
PREF_JUDGES = {"gpt": ("ds", "kimi"), "kimi": ("ds", "gpt")}

_print_lock = threading.Lock()


def say(*a):
    with _print_lock:
        print(*a, flush=True)


def jdump(path, obj):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(obj, fh, ensure_ascii=False, indent=1)
    os.replace(tmp, path)


def pool(jobs, fn, workers):
    done = fail = 0
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futs = {ex.submit(fn, j): j for j in jobs}
        for f in as_completed(futs):
            try:
                r = f.result()
                done += 1
                say(f"[{done+fail}/{len(jobs)}] {r}")
            except Exception:
                fail += 1
                say(f"[{done+fail}/{len(jobs)}] EXC {futs[f]}\n{traceback.format_exc()}")
    say(f"== done={done} fail={fail} ==")


# ---------------- write ----------------

def cmd_write(a):
    jobs = [(c, arm, m, r) for c in a.chapters for m in a.models
            for arm in ("base", "v2") for r in a.reps]
    random.Random(20260826).shuffle(jobs)   # 打散，避免某臂集中在某段时间跑
    def go(j):
        c, arm, m, r = j
        rid, st = run_write.run(a.dir, c, arm, m, r)
        return f"{rid} {st}"
    pool(jobs, go, a.workers)


# ---------------- 公共：枚举成稿 ----------------

def essays(d):
    out = []
    for p in sorted(glob.glob(os.path.join(d, "*.final.md"))):
        rid = os.path.basename(p)[:-len(".final.md")]
        meta = json.load(open(os.path.join(d, rid + ".meta.json"), encoding="utf-8"))
        out.append((rid, p, meta))
    return out


# ---------------- extract ----------------

def cmd_extract(a):
    jobs = [(rid, p, meta, ex) for rid, p, meta in essays(a.dir) for ex in EXTRACTORS
            if not os.path.exists(os.path.join(a.dir, f"{rid}.ext.{ex}.json"))]
    def go(j):
        rid, p, meta, ex = j
        prose = open(p, encoding="utf-8").read()
        o = bp.parse_outline(int(meta["chapter"][2:]))
        res, mt = M.extract(ex, prose, o["points"])
        out = os.path.join(a.dir, f"{rid}.ext.{ex}.json")
        jdump(out, {"run": rid, "extractor": ex, "result": res, "meta": mt})
        return f"{rid} ext:{ex} " + ("ok n=%d" % len(res["details"]) if res else "FAIL")
    pool(jobs, go, a.workers)


# ---------------- judge（合并候选后一次判定） ----------------

def cmd_judge(a):
    jobs = []
    for rid, p, meta in essays(a.dir):
        exts = {}
        ok = True
        for ex in EXTRACTORS:
            f = os.path.join(a.dir, f"{rid}.ext.{ex}.json")
            if not os.path.exists(f):
                ok = False; break
            d = json.load(open(f, encoding="utf-8"))
            if not d.get("result"):
                ok = False; break
            exts[ex] = d["result"]["details"]
        if ok and not os.path.exists(os.path.join(a.dir, f"{rid}.judge.json")):
            jobs.append((rid, exts))
    def go(j):
        rid, exts = j
        merged, index = [], {}
        for ex in EXTRACTORS:
            for d in exts[ex]:
                key = d.strip()
                if key and key not in index:
                    index[key] = len(merged); merged.append(key)
        res, mt = M.judge(JUDGE_MODEL, merged)
        if res is None:
            jdump(os.path.join(a.dir, f"{rid}.judge.json"),
                  {"run": rid, "result": None, "meta": mt})
            return f"{rid} judge FAIL"
        verdict = {}
        for it in res["items"]:
            if 1 <= it["i"] <= len(merged):
                verdict[merged[it["i"] - 1]] = it
        per = {}
        for ex in EXTRACTORS:
            keys = {d.strip() for d in exts[ex] if d.strip()}
            per[ex] = sum(1 for k in keys if k in verdict and not verdict[k]["movable"])
        off = sum(1 for k, v in verdict.items() if v["offgenre"])
        union_nsd = sum(1 for k, v in verdict.items() if not v["movable"])
        jdump(os.path.join(a.dir, f"{rid}.judge.json"),
              {"run": rid, "candidates": len(merged), "judged": len(verdict),
               "nsd_union": union_nsd, "nsd_by_extractor": per, "off": off,
               "items": res["items"], "meta": mt})
        return f"{rid} judge ok cand={len(merged)} nsd={per}"
    pool(jobs, go, a.workers)


# ---------------- tell ----------------

def cmd_tell(a):
    jobs = [(rid, p) for rid, p, _ in essays(a.dir)
            if not os.path.exists(os.path.join(a.dir, f"{rid}.tell.json"))]
    def go(j):
        rid, p = j
        res, mt = M.tell(TELL_MODEL, open(p, encoding="utf-8").read())
        jdump(os.path.join(a.dir, f"{rid}.tell.json"),
              {"run": rid, "result": res, "meta": mt})
        return f"{rid} tell " + (f"ok n={res['n']}" if res else "FAIL")
    pool(jobs, go, a.workers)


# ---------------- pref（同章同模型同 rep 的 base/v2 配对） ----------------

def cmd_pref(a):
    bykey = {}
    for rid, p, meta in essays(a.dir):
        bykey[(meta["chapter"], meta["model"], meta["rep"], meta["arm"])] = p
    pairs = []
    for (ch, mdl, rep, arm), p in bykey.items():
        if arm != "base":
            continue
        q = bykey.get((ch, mdl, rep, "v2"))
        if q:
            pairs.append((ch, mdl, rep, p, q))
    jobs = []
    for ch, mdl, rep, pbase, pv2 in pairs:
        for jm in PREF_JUDGES[mdl]:
            for order in ("bv", "vb"):   # 甲=base/乙=v2  与  甲=v2/乙=base
                pid = f"{ch}__{mdl}__{rep}__{jm}__{order}"
                if not os.path.exists(os.path.join(a.dir, f"pref.{pid}.json")):
                    jobs.append((pid, jm, order, pbase, pv2))
    def go(j):
        pid, jm, order, pbase, pv2 = j
        tb = open(pbase, encoding="utf-8").read()
        tv = open(pv2, encoding="utf-8").read()
        first, second = (tb, tv) if order == "bv" else (tv, tb)
        res, mt = M.pref(jm, first, second)
        rec = {"pid": pid, "judge": jm, "order": order, "result": res, "meta": mt}
        if res:
            w = res["winner"]
            rec["arm_winner"] = ("base" if w == "甲" else "v2" if w == "乙" else "tie") \
                if order == "bv" else ("v2" if w == "甲" else "base" if w == "乙" else "tie")
        jdump(os.path.join(a.dir, f"pref.{pid}.json"), rec)
        return f"{pid} " + (rec.get("arm_winner", "FAIL"))
    pool(jobs, go, a.workers)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["write", "extract", "judge", "tell", "pref"])
    ap.add_argument("dir")
    ap.add_argument("--chapters", type=int, nargs="*", default=[])
    ap.add_argument("--models", nargs="*", default=["gpt", "kimi"])
    ap.add_argument("--reps", nargs="*", default=["r1"])
    ap.add_argument("--workers", type=int, default=6)
    a = ap.parse_args()
    {"write": cmd_write, "extract": cmd_extract, "judge": cmd_judge,
     "tell": cmd_tell, "pref": cmd_pref}[a.cmd](a)
