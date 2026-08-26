# -*- coding: utf-8 -*-
"""Round 5 预注册分析脚本 —— 与 PROTOCOL.md 同时冻结，在任何确证数据产生之前提交。

输入（命令行给 runs 目录）：
  <dir>/*.final.md            成稿
  <dir>/*.meta.json           写作元数据（chapter/model/arm/rep/chars/target）
  <dir>/*.ext.{gpt,gpt2,gpt3}.json 三名抽取员的候选清单与覆盖判定
  <dir>/*.judge.json          可替换性判定（合并候选后一次判定）→ nsd_by_extractor / off
  <dir>/*.tell.json           情绪直陈句计数
  <dir>/pref.*.json           成对偏好投票（4 票/对：2 家评委 × 2 种呈现顺序）
  preregistered/chapter_classes.json   章节结构分类（写作前冻结，只看细纲）

输出：协议第 6 节规定的全部统计量，打印到 stdout；并写出 results.json 明细。
"""
import glob, json, os, random, statistics as st, sys

N_PERM, N_BOOT, SEED = 10000, 10000, 20260826
ALPHA_PRIMARY = 0.025          # 两个共同主指标，Bonferroni
CLASS_SCORE = {"none": 1.0, "concrete": 0.0, "abstract": -1.0}
EXTRACTORS = ("gpt", "gpt2", "gpt3")


# ---------------- 装载 ----------------

def load(d, classes_path):
    classes = json.load(open(classes_path, encoding="utf-8"))
    rows = []
    for p in sorted(glob.glob(os.path.join(d, "*.meta.json"))):
        meta = json.load(open(p, encoding="utf-8"))
        rid = meta.get("run")
        if not rid or "chars" not in meta:
            continue
        jp = os.path.join(d, rid + ".judge.json")
        if not os.path.exists(jp):
            continue
        jd = json.load(open(jp, encoding="utf-8"))
        if jd.get("nsd_by_extractor") is None:
            continue
        nsd_list, cov_list = [], []
        for ex in EXTRACTORS:
            ep = os.path.join(d, f"{rid}.ext.{ex}.json")
            if not os.path.exists(ep):
                continue
            ed = json.load(open(ep, encoding="utf-8"))
            if not ed.get("result"):
                continue
            if ex in jd["nsd_by_extractor"]:
                nsd_list.append(jd["nsd_by_extractor"][ex])
            cov_list.append(len(set(ed["result"]["covered"])))
        if not nsd_list:
            continue
        tell = None
        tp = os.path.join(d, rid + ".tell.json")
        if os.path.exists(tp):
            td = json.load(open(tp, encoding="utf-8"))
            if td.get("result"):
                tell = td["result"]["n"]
        ch = meta["chapter"]
        union = jd.get("nsd_union")
        if union is None:                       # 旧产物兜底：从逐条判定重算
            union = sum(1 for it in jd.get("items", []) if not it["movable"])
        rows.append({
            "run": rid, "chapter": ch, "model": meta["model"], "arm": meta["arm"],
            "rep": meta["rep"], "nsd_list": nsd_list,
            "nsd": union,                       # 主口径：并集（见协议偏离 1）
            "nsd_median3": st.median(nsd_list), # 敏感性：逐抽取员中位数（原冻结口径）
            "cov": st.median(cov_list) if cov_list else None,
            "cov_total": meta["points"], "off": jd["off"], "tell": tell,
            "chars": meta["chars"], "target": meta["target"],
            "candidates": jd["candidates"],
            "cls": (classes.get(ch, {}).get("ds") or {}).get("label"),
        })
    prefs = []
    for p in sorted(glob.glob(os.path.join(d, "pref.*.json"))):
        pd_ = json.load(open(p, encoding="utf-8"))
        if pd_.get("arm_winner"):
            ch, mdl, rep, judge, order = pd_["pid"].split("__")
            prefs.append({"chapter": ch, "model": mdl, "rep": rep, "judge": judge,
                          "order": order, "winner": pd_["arm_winner"],
                          "cls": (classes.get(ch, {}).get("ds") or {}).get("label")})
    return rows, prefs, classes


# ---------------- 通用统计 ----------------

def cell_effects(rows, key):
    """按 (chapter, model) 出格：v2 均值 − base 均值。返回 [(chapter, model, d)]。"""
    cells = {}
    for r in rows:
        if r.get(key) is None:
            continue
        cells.setdefault((r["chapter"], r["model"]), {"base": [], "v2": []})[r["arm"]].append(r[key])
    out = []
    for (ch, m), g in sorted(cells.items()):
        if g["base"] and g["v2"]:
            out.append((ch, m, sum(g["v2"]) / len(g["v2"]) - sum(g["base"]) / len(g["base"])))
    return out


def perm_test_cells(rows, key, n=N_PERM, seed=SEED):
    """在每个 (chapter, model) 格内置换臂标签；统计量 = 各格效应的平均。"""
    rnd = random.Random(seed)
    groups = {}
    for r in rows:
        if r.get(key) is None:
            continue
        groups.setdefault((r["chapter"], r["model"]), []).append(r)

    def stat(assign):
        ds = []
        for k, g in groups.items():
            a = [r[key] for r, lab in zip(g, assign[k]) if lab == "v2"]
            b = [r[key] for r, lab in zip(g, assign[k]) if lab == "base"]
            if a and b:
                ds.append(sum(a) / len(a) - sum(b) / len(b))
        return sum(ds) / len(ds) if ds else 0.0

    obs = stat({k: [r["arm"] for r in g] for k, g in groups.items()})
    hits = 0
    for _ in range(n):
        assign = {}
        for k, g in groups.items():
            labs = [r["arm"] for r in g]
            rnd.shuffle(labs)
            assign[k] = labs
        if abs(stat(assign)) >= abs(obs) - 1e-12:
            hits += 1
    return obs, (hits + 1) / (n + 1)


def cluster_boot_ci(effects, n=N_BOOT, seed=SEED + 1, alpha=0.05):
    """按章节整簇重抽（章节是主导的异质来源）。effects: [(chapter, model, d)]"""
    rnd = random.Random(seed)
    by_ch = {}
    for ch, m, d in effects:
        by_ch.setdefault(ch, []).append(d)
    chs = sorted(by_ch)
    if not chs:
        return float("nan"), float("nan")
    stats = []
    for _ in range(n):
        pick = [rnd.choice(chs) for _ in chs]
        vals = [d for c in pick for d in by_ch[c]]
        stats.append(sum(vals) / len(vals))
    stats.sort()
    return stats[int(alpha / 2 * len(stats))], stats[int((1 - alpha / 2) * len(stats)) - 1]


def pressure_trend(effects, press, n=N_PERM, seed=SEED + 4):
    """预先声明的调节变量 M1：章节压力级（卷纲「章节定位分布」表，确定性、非本实验产物）。
    方向预测：低压章效应更大 → 斜率为负。"""
    by_ch = {}
    for ch, m, d in effects:
        by_ch.setdefault(ch, []).append(d)
    chs = [c for c in sorted(by_ch) if c in press]
    if len(chs) < 4:
        return None
    y = [sum(by_ch[c]) / len(by_ch[c]) for c in chs]
    x0 = [float(press[c]["pressure"]) for c in chs]

    def slope(x):
        mx, my = sum(x) / len(x), sum(y) / len(y)
        den = sum((a - mx) ** 2 for a in x)
        return sum((a - mx) * (b - my) for a, b in zip(x, y)) / den if den else 0.0

    obs = slope(x0)
    rnd = random.Random(seed)
    hits = 0
    for _ in range(n):
        xs = x0[:]
        rnd.shuffle(xs)
        if abs(slope(xs)) >= abs(obs) - 1e-12:
            hits += 1
    means = {}
    for c, v in zip(chs, y):
        means.setdefault(press[c]["pressure"], []).append(v)
    return {"slope": obs, "p": (hits + 1) / (n + 1),
            "by_level": {k: (len(v), sum(v) / len(v)) for k, v in sorted(means.items())}}


def moderator_trend(effects, classes, n=N_PERM, seed=SEED + 2):
    """预先声明的有序趋势：none(+1) > concrete(0) > abstract(−1)。
    统计量 = 章节级效应对该分数的最小二乘斜率。置换 = 打乱章节的分类标签。"""
    by_ch = {}
    for ch, m, d in effects:
        by_ch.setdefault(ch, []).append(d)
    chs = [c for c in sorted(by_ch)
           if (classes.get(c, {}).get("ds") or {}).get("label") in CLASS_SCORE]
    if len(chs) < 4:
        return None
    y = [sum(by_ch[c]) / len(by_ch[c]) for c in chs]
    x0 = [CLASS_SCORE[classes[c]["ds"]["label"]] for c in chs]

    def slope(x):
        mx, my = sum(x) / len(x), sum(y) / len(y)
        den = sum((a - mx) ** 2 for a in x)
        return sum((a - mx) * (b - my) for a, b in zip(x, y)) / den if den else 0.0

    obs = slope(x0)
    rnd = random.Random(seed)
    hits = 0
    for _ in range(n):
        xs = x0[:]
        rnd.shuffle(xs)
        if abs(slope(xs)) >= abs(obs) - 1e-12:
            hits += 1
    means = {}
    for c, v in zip(chs, y):
        means.setdefault(classes[c]["ds"]["label"], []).append(v)
    return {"slope": obs, "p": (hits + 1) / (n + 1),
            "by_class": {k: (len(v), sum(v) / len(v)) for k, v in sorted(means.items())}}


# ---------------- 偏好 ----------------

def pref_scores(prefs):
    """每个 (chapter, model, rep) 配对一个分数：(v2 票 − base 票) / 总票数 ∈ [−1, 1]。"""
    pairs = {}
    for p in prefs:
        pairs.setdefault((p["chapter"], p["model"], p["rep"]), []).append(p["winner"])
    out = []
    for (ch, m, rep), ws in sorted(pairs.items()):
        n = len(ws)
        out.append((ch, m, (ws.count("v2") - ws.count("base")) / n, n))
    return out


def pref_test(scores, n=N_PERM, seed=SEED + 3):
    """符号翻转置换：臂标签在配对内互换即等价于分数取反。"""
    vals = [s for _, _, s, _ in scores]
    if not vals:
        return float("nan"), float("nan")
    obs = sum(vals) / len(vals)
    rnd = random.Random(seed)
    hits = 0
    for _ in range(n):
        f = sum(v if rnd.random() < 0.5 else -v for v in vals) / len(vals)
        if abs(f) >= abs(obs) - 1e-12:
            hits += 1
    return obs, (hits + 1) / (n + 1)


def icc21(mat):
    n, k = len(mat), len(mat[0])
    grand = sum(sum(r) for r in mat) / (n * k)
    row_m = [sum(r) / k for r in mat]
    col_m = [sum(mat[i][j] for i in range(n)) / n for j in range(k)]
    ms_r = k * sum((m - grand) ** 2 for m in row_m) / (n - 1) if n > 1 else 0.0
    ms_c = n * sum((m - grand) ** 2 for m in col_m) / (k - 1) if k > 1 else 0.0
    ss_e = sum((mat[i][j] - row_m[i] - col_m[j] + grand) ** 2
               for i in range(n) for j in range(k))
    ms_e = ss_e / ((n - 1) * (k - 1)) if n > 1 and k > 1 else 0.0
    den = ms_r + (k - 1) * ms_e + k * (ms_c - ms_e) / n
    return (ms_r - ms_e) / den if den else 0.0


def in_band(r):
    return r["target"] * 0.85 <= r["chars"] <= r["target"] * 1.15


# ---------------- 报告 ----------------

def main(d, classes_path):
    rows, prefs, classes = load(d, classes_path)
    print("=" * 90)
    print(f"Round 5 · 扩章 × 跨模型确证　成稿 n={len(rows)}　偏好投票 n={len(prefs)}")
    print("=" * 90)

    chs = sorted({r["chapter"] for r in rows})
    mdls = sorted({r["model"] for r in rows})
    print(f"章节 {len(chs)} 个：{' '.join(chs)}")
    print(f"模型 {len(mdls)} 个：{' '.join(mdls)}")

    print("\n--- 逐格样本数与 NSD ---")
    print("%-8s %-6s %-6s %5s %6s %6s %6s %6s %7s %6s" %
          ("章节", "分类", "模型", "n", "NSD", "覆盖", "串味", "直陈", "字数", "带内"))
    for ch in chs:
        cls = (classes.get(ch, {}).get("ds") or {}).get("label", "?")
        for m in mdls:
            for arm in ("base", "v2"):
                g = [r for r in rows if r["chapter"] == ch and r["model"] == m and r["arm"] == arm]
                if not g:
                    continue
                f = lambda k: (sum(r[k] for r in g if r[k] is not None) /
                               max(1, len([r for r in g if r[k] is not None])))
                print("%-8s %-9s %-7s %5d %6.2f %6.2f %6.2f %6.2f %7.0f %5.0f%%" % (
                    ch + "/" + arm, cls, m, len(g), f("nsd"), f("cov"), f("off"),
                    f("tell"), f("chars"), 100 * sum(1 for r in g if in_band(r)) / len(g)))

    # ---- 主指标 1：NSD ----
    print("\n" + "-" * 90)
    print("主指标 1（机制）：NSD 不可替换具体细节数（并集口径，见协议偏离 1）")
    eff = cell_effects(rows, "nsd")
    obs, p = perm_test_cells(rows, "nsd")
    lo, hi = cluster_boot_ci(eff)
    print(f"  格数 = {len(eff)}（章节 × 模型）")
    print(f"  平均效应 (v2 − base) = {obs:+.3f}")
    print(f"  置换检验 p = {p:.4f}")
    print(f"  章节整簇 bootstrap 95% CI = [{lo:+.3f}, {hi:+.3f}]")
    nsd_pass = (p < ALPHA_PRIMARY and lo > 0)
    print(f"  → {'通过' if nsd_pass else '未通过'}（阈值 p<{ALPHA_PRIMARY} 且 CI 下界>0）")
    eff_m = cell_effects(rows, "nsd_median3")
    obs_m, p_m = perm_test_cells(rows, "nsd_median3")
    lo_m, hi_m = cluster_boot_ci(eff_m, seed=SEED + 7)
    print(f"  [敏感性·原冻结口径 逐抽取员中位数] 平均效应 {obs_m:+.3f}, p = {p_m:.4f}, "
          f"CI [{lo_m:+.3f}, {hi_m:+.3f}]")

    # ---- 主指标 2：成对偏好 ----
    print("\n" + "-" * 90)
    print("主指标 2（价值）：成对盲评偏好（4 票/对，2 家评委 × 2 种顺序）")
    sc = pref_scores(prefs)
    pobs, pp = pref_test(sc)
    plo, phi = cluster_boot_ci([(c, m, s) for c, m, s, _ in sc])
    v2w = sum(1 for p_ in prefs if p_["winner"] == "v2")
    bw = sum(1 for p_ in prefs if p_["winner"] == "base")
    tie = sum(1 for p_ in prefs if p_["winner"] == "tie")
    print(f"  配对数 = {len(sc)}；总票 v2 {v2w} / base {bw} / 平 {tie}")
    print(f"  平均偏好分 (v2 − base)/票数 = {pobs:+.3f}")
    print(f"  符号翻转置换 p = {pp:.4f}")
    print(f"  章节整簇 bootstrap 95% CI = [{plo:+.3f}, {phi:+.3f}]")
    pref_pass = (pp < ALPHA_PRIMARY and plo > 0)
    print(f"  → {'通过' if pref_pass else '未通过'}（阈值 p<{ALPHA_PRIMARY} 且 CI 下界>0）")
    # 稳健读数（次要）：只保留「换了呈现顺序后仍选同一臂」的评委票
    byjudge = {}
    for p_ in prefs:
        byjudge.setdefault((p_["chapter"], p_["model"], p_["rep"], p_["judge"]),
                           {})[p_["order"]] = p_["winner"]
    rob = {}
    for (ch, m, rep, jm), o in byjudge.items():
        if len(o) < 2:
            continue
        w = set(o.values())
        v = 1 if w == {"v2"} else -1 if w == {"base"} else 0
        rob.setdefault((ch, m, rep), []).append(v)
    rob_sc = [(ch, m, sum(v) / len(v), len(v)) for (ch, m, rep), v in sorted(rob.items())]
    if rob_sc:
        r_obs, r_p = pref_test(rob_sc, seed=SEED + 8)
        rlo, rhi = cluster_boot_ci([(c, m, s_) for c, m, s_, _ in rob_sc], seed=SEED + 9)
        nz = sum(1 for _, _, s_, _ in rob_sc if s_ != 0)
        print(f"  [稳健读数·只算换序后仍选同一臂的票] {len(rob_sc)} 对中 {nz} 对给出方向；"
              f"均值 {r_obs:+.3f}, p = {r_p:.4f}, CI [{rlo:+.3f}, {rhi:+.3f}]")

    # ---- 预先声明的敏感性分析：剔除长度差过大的配对 ----
    chars = {r["run"]: r for r in rows}
    lenmap = {}
    for r in rows:
        lenmap[(r["chapter"], r["model"], r["rep"], r["arm"])] = (r["chars"], r["target"])
    keep = []
    for ch, m, s_, nv in sc:
        ok = True
        for rep in {r["rep"] for r in rows if r["chapter"] == ch and r["model"] == m}:
            a = lenmap.get((ch, m, rep, "base")); b = lenmap.get((ch, m, rep, "v2"))
            if a and b and abs(a[0] - b[0]) > 0.10 * a[1]:
                ok = False
        if ok:
            keep.append((ch, m, s_, nv))
    if keep and len(keep) < len(sc):
        k_obs, k_p = pref_test(keep, seed=SEED + 5)
        klo, khi = cluster_boot_ci([(c, m, s_) for c, m, s_, _ in keep], seed=SEED + 6)
        print(f"\n  敏感性（剔除 |Δ字数| > 10%×目标 的配对，剩 {len(keep)}/{len(sc)}）："
              f"偏好分 {k_obs:+.3f}, p = {k_p:.4f}, CI [{klo:+.3f}, {khi:+.3f}]")
    else:
        print(f"\n  敏感性（长度差过滤）：无配对被剔除或全部被剔除，跳过")

    # ---- 预先声明的调节变量 ----
    print("\n" + "-" * 90)
    print("预先声明的调节变量 M1：章节压力级（卷纲「章节定位分布」表）——预测低压章效应更大（斜率为负）")
    press = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                        "chapter_pressure.json"), encoding="utf-8"))
    for name, e in (("NSD", eff), ("偏好", [(c, m, s_) for c, m, s_, _ in sc])):
        t = pressure_trend(e, press)
        if not t:
            print(f"  {name}: 章节不足，跳过")
            continue
        print(f"  {name}: 斜率 = {t['slope']:+.3f}, 置换 p = {t['p']:.4f}")
        for k, (n_, v) in t["by_level"].items():
            print(f"      压力级 {k}  章数 {n_:2d}  平均效应 {v:+.3f}")

    print("\n" + "-" * 90)
    print("预先声明的调节变量 M2：章节结构分类的有序趋势 none(+1) > concrete(0) > abstract(−1)")
    for name, e in (("NSD", eff), ("偏好", [(c, m, s_) for c, m, s_, _ in sc])):
        t = moderator_trend(e, classes)
        if not t:
            print(f"  {name}: 章节不足，跳过")
            continue
        print(f"  {name}: 斜率 = {t['slope']:+.3f}, 置换 p = {t['p']:.4f}")
        for k, (n_, v) in t["by_class"].items():
            print(f"      {k:<9} 章数 {n_:2d}  平均效应 {v:+.3f}")

    # ---- 次要指标 ----
    print("\n" + "-" * 90)
    print("次要指标（描述性 + 区间，不做假设检验）")
    for key, name in (("cov", "覆盖 COV"), ("off", "串味 OFF"), ("tell", "情绪直陈 TELL")):
        e2 = cell_effects(rows, key)
        if not e2:
            continue
        l2, h2 = cluster_boot_ci(e2)
        b = [r[key] for r in rows if r["arm"] == "base" and r.get(key) is not None]
        v = [r[key] for r in rows if r["arm"] == "v2" and r.get(key) is not None]
        print(f"  {name}: base {sum(b)/len(b):.2f} → v2 {sum(v)/len(v):.2f}  "
              f"(分格平均差 {sum(d for _,_,d in e2)/len(e2):+.2f}, CI [{l2:+.2f}, {h2:+.2f}])")
    bb = [r for r in rows if r["arm"] == "base"]
    vv = [r for r in rows if r["arm"] == "v2"]
    pb = 100 * sum(1 for r in bb if in_band(r)) / len(bb)
    pv = 100 * sum(1 for r in vv if in_band(r)) / len(vv)
    print(f"  字数带内率: base {pb:.0f}% → v2 {pv:.0f}%  ({pv-pb:+.0f} 个百分点)")

    # ---- 事先声明的可证伪条件 ----
    print("\n" + "-" * 90)
    print("事先声明的可证伪 / 副作用条件")
    fails = []
    covb = st.mean([r["cov"] for r in bb if r["cov"] is not None])
    covv = st.mean([r["cov"] for r in vv if r["cov"] is not None])
    offb = st.mean([r["off"] for r in bb]); offv = st.mean([r["off"] for r in vv])
    if covb - covv >= 1:
        fails.append(f"覆盖下降 {covb-covv:.2f} ≥ 1")
    if offv - offb >= 0.5:
        fails.append(f"串味上升 {offv-offb:.2f} ≥ 0.5")
    if pb - pv >= 25:
        fails.append(f"带内率下降 {pb-pv:.0f} ≥ 25 个百分点")
    print("  " + ("副作用条件全部未触发" if not fails else "触发：" + "；".join(fails)))

    # ---- 预先声明的判定表 ----
    print("\n" + "=" * 90)
    if nsd_pass and pref_pass:
        v = "两个主指标都通过 → 收益被确证，建议合入"
    elif pref_pass and not nsd_pass:
        v = "偏好通过、机制未确证 → 读者侧有收益但不是靠 NSD 这条机制，可合入并修正机制描述"
    elif nsd_pass and not pref_pass:
        v = "机制通过、偏好未通过 → 文本按规则的方向变了，但读者侧看不出好处，不建议直接合入"
    else:
        v = "两个主指标都未通过 → 收益未被确证，按调节变量结果决定是缩窄触发条件还是放弃"
    print("预先声明的判定：" + v)
    print("=" * 90)

    # ---- 量具可靠性 ----
    mat = [r["nsd_list"] for r in rows if len(r["nsd_list"]) == 3]
    if len(mat) >= 3:
        print(f"\n抽取员一致性 ICC(2,1) = {icc21(mat):.3f}（n={len(mat)}，三名抽取员）")

    json.dump(rows, open(os.path.join(d, "..", "results_round5.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    json.dump([{"chapter": c, "model": m, "score": s, "votes": n} for c, m, s, n in sc],
              open(os.path.join(d, "..", "pref_round5.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)


if __name__ == "__main__":
    d = sys.argv[1]
    cp = sys.argv[2] if len(sys.argv) > 2 else os.path.join(
        os.path.dirname(os.path.abspath(__file__)), "chapter_classes.json")
    main(d, cp)
