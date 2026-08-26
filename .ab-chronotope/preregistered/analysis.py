# -*- coding: utf-8 -*-
"""预注册分析脚本 —— 与 PROTOCOL.md 同时冻结，在任何确证数据产生之前提交。

输入：results.json（同目录），每份成稿一条记录：
  {run, chapter, arm("base"|"v2"), model, rep,
   nsd_list:[int,int,int], cov:int, cov_total:int, off:int,
   chars:int, target:int, qual:float}
输出：按协议第 6 节规定的统计量，全部打印到 stdout。
"""
import json, os, random, statistics as st

HERE = os.path.dirname(os.path.abspath(__file__))
N_PERM, N_BOOT, SEED = 10000, 10000, 20260826   # 固定种子，结果可复现

def median(xs): return st.median(xs)

def stratified_perm_test(rows, key, strata="chapter", n=N_PERM, seed=SEED):
    """仅在同一 stratum 内置换臂标签；统计量 = 分层配对后的平均差 (v2 - base)。"""
    rnd = random.Random(seed)
    groups = {}
    for r in rows: groups.setdefault(r[strata], []).append(r)
    def stat(assign):
        diffs = []
        for s, g in groups.items():
            a = [r[key] for r, lab in zip(g, assign[s]) if lab == "v2"]
            b = [r[key] for r, lab in zip(g, assign[s]) if lab == "base"]
            if a and b: diffs.append(sum(a)/len(a) - sum(b)/len(b))
        return sum(diffs)/len(diffs) if diffs else 0.0
    obs_assign = {s: [r["arm"] for r in g] for s, g in groups.items()}
    obs = stat(obs_assign)
    hits = 0
    for _ in range(n):
        perm = {}
        for s, g in groups.items():
            labs = [r["arm"] for r in g]; rnd.shuffle(labs); perm[s] = labs
        if abs(stat(perm)) >= abs(obs) - 1e-12: hits += 1
    return obs, (hits + 1) / (n + 1)

def bootstrap_ci(rows, key, strata="chapter", n=N_BOOT, seed=SEED, alpha=0.05):
    """分层 bootstrap：每层内对 v2 与 base 各自有放回重抽，统计量同上。"""
    rnd = random.Random(seed + 1)
    groups = {}
    for r in rows: groups.setdefault(r[strata], []).append(r)
    stats = []
    for _ in range(n):
        diffs = []
        for s, g in groups.items():
            a = [r[key] for r in g if r["arm"] == "v2"]
            b = [r[key] for r in g if r["arm"] == "base"]
            if not a or not b: continue
            ra = [rnd.choice(a) for _ in a]; rb = [rnd.choice(b) for _ in b]
            diffs.append(sum(ra)/len(ra) - sum(rb)/len(rb))
        if diffs: stats.append(sum(diffs)/len(diffs))
    stats.sort()
    lo = stats[int(alpha/2 * len(stats))]
    hi = stats[int((1 - alpha/2) * len(stats)) - 1]
    return lo, hi

def spearman(x, y):
    def rank(v):
        order = sorted(range(len(v)), key=lambda i: v[i]); r = [0.0]*len(v); i = 0
        while i < len(order):
            j = i
            while j+1 < len(order) and v[order[j+1]] == v[order[i]]: j += 1
            avg = (i + j) / 2.0 + 1
            for k in range(i, j+1): r[order[k]] = avg
            i = j + 1
        return r
    rx, ry = rank(x), rank(y); n = len(x)
    mx, my = sum(rx)/n, sum(ry)/n
    num = sum((a-mx)*(b-my) for a, b in zip(rx, ry))
    den = (sum((a-mx)**2 for a in rx) * sum((b-my)**2 for b in ry)) ** 0.5
    return num/den if den else 0.0

def icc21(mat):
    """ICC(2,1) 双向随机、单测量、绝对一致。mat: 每行一个目标，每列一名评审。"""
    n, k = len(mat), len(mat[0])
    grand = sum(sum(r) for r in mat) / (n*k)
    row_m = [sum(r)/k for r in mat]
    col_m = [sum(mat[i][j] for i in range(n))/n for j in range(k)]
    ms_r = k * sum((m-grand)**2 for m in row_m) / (n-1) if n > 1 else 0.0
    ms_c = n * sum((m-grand)**2 for m in col_m) / (k-1) if k > 1 else 0.0
    ss_e = sum((mat[i][j] - row_m[i] - col_m[j] + grand)**2 for i in range(n) for j in range(k))
    ms_e = ss_e / ((n-1)*(k-1)) if n > 1 and k > 1 else 0.0
    den = ms_r + (k-1)*ms_e + k*(ms_c - ms_e)/n
    return (ms_r - ms_e) / den if den else 0.0

def band(r):
    lo, hi = r["target"]*0.85, r["target"]*1.15
    return lo <= r["chars"] <= hi

def report(rows, tag):
    print("\n" + "="*84); print(tag + f"（n={len(rows)}）"); print("="*84)
    if not rows: print("  无数据"); return
    for r in rows: r["nsd"] = median(r["nsd_list"])
    chs = sorted({r["chapter"] for r in rows})
    print("%-14s %-6s %6s %6s %6s %6s %7s %6s" % ("章节","臂","n","NSD","覆盖","串味","字数","带内"))
    for ch in chs:
        for arm in ("base","v2"):
            g = [r for r in rows if r["chapter"]==ch and r["arm"]==arm]
            if not g: continue
            f = lambda k: sum(r[k] for r in g)/len(g)
            print("%-14s %-6s %6d %6.2f %6.2f %6.2f %7.0f %5.0f%%" % (
                ch, arm, len(g), f("nsd"), f("cov"), f("off"), f("chars"),
                100*sum(1 for r in g if band(r))/len(g)))
    print("\n--- 主检验：NSD（协议第 6 节，判定阈值 p<0.05 且 CI 下界>0）---")
    obs, p = stratified_perm_test(rows, "nsd")
    lo, hi = bootstrap_ci(rows, "nsd")
    print(f"  分层平均差 (v2 − base) = {obs:+.2f}")
    print(f"  分层置换检验 p = {p:.4f}   ({N_PERM} 次重排, seed={SEED})")
    print(f"  bootstrap 95% CI = [{lo:+.2f}, {hi:+.2f}]   ({N_BOOT} 次重抽)")
    verdict = "H1 成立" if (p < 0.05 and lo > 0) else "H1 未被确证"
    print(f"  → {verdict}")
    print("\n--- 次要指标（描述性，不做检验）---")
    for key, name, worse in (("cov","覆盖 COV","降"),("off","串味 OFF","升")):
        b = [r[key] for r in rows if r["arm"]=="base"]; v = [r[key] for r in rows if r["arm"]=="v2"]
        d = sum(v)/len(v) - sum(b)/len(b)
        l2, h2 = bootstrap_ci(rows, key)
        print(f"  {name}: base {sum(b)/len(b):.2f} → v2 {sum(v)/len(v):.2f}  (差 {d:+.2f}, CI [{l2:+.2f},{h2:+.2f}])")
    bb = [r for r in rows if r["arm"]=="base"]; vv = [r for r in rows if r["arm"]=="v2"]
    pb = 100*sum(1 for r in bb if band(r))/len(bb); pv = 100*sum(1 for r in vv if band(r))/len(vv)
    print(f"  字数带内率: base {pb:.0f}% → v2 {pv:.0f}%  (差 {pv-pb:+.0f} 个百分点)")
    if any("qual" in r for r in rows):
        qb = [r.get("qual",0) for r in bb]; qv = [r.get("qual",0) for r in vv]
        print(f"  参考 QUAL（不作依据）: base {sum(qb)/len(qb):.2f} → v2 {sum(qv)/len(qv):.2f}")
    print("\n--- 事先声明的可证伪条件 ---")
    fails = []
    if not (p < 0.05 and lo > 0): fails.append("主检验未通过")
    covb = sum(r["cov"] for r in bb)/len(bb); covv = sum(r["cov"] for r in vv)/len(vv)
    if covb - covv >= 1: fails.append(f"覆盖下降 {covb-covv:.2f} ≥ 1")
    offb = sum(r["off"] for r in bb)/len(bb); offv = sum(r["off"] for r in vv)/len(vv)
    if offv - offb >= 0.5: fails.append(f"串味上升 {offv-offb:.2f} ≥ 0.5")
    if pb - pv >= 25: fails.append(f"带内率下降 {pb-pv:.0f} ≥ 25 个百分点")
    print("  " + ("全部未触发 → PR 收益被确证" if not fails else "触发：" + "；".join(fails) + " → 收益未被确证"))
    print("\n--- 评委间一致性（三名抽取员的 NSD）---")
    mat = [r["nsd_list"] for r in rows if len(r["nsd_list"]) == 3]
    if len(mat) >= 3:
        print(f"  ICC(2,1) = {icc21(mat):.3f}")
        for i, j in ((0,1),(0,2),(1,2)):
            print(f"  Spearman ρ(抽取员{i+1}, 抽取员{j+1}) = "
                  f"{spearman([m[i] for m in mat],[m[j] for m in mat]):+.3f}")

if __name__ == "__main__":
    rows = json.load(open(os.path.join(HERE, "results.json"), encoding="utf-8"))
    report([r for r in rows if r["model"] == "gpt"], "主分析 · GPT-5.6 写作 · GPT 评审")
    sec = [r for r in rows if r["model"] == "claude"]
    if sec: report(sec, "次要复核 · Claude Opus 5 写作（单独报告，不并入主判定）")
