# -*- coding: utf-8 -*-
"""探索性、确定性的表层统计——不参与预注册判定，只给结论提供纹理。

全部指标都是纯字符统计，没有 LLM 参与，噪声为零：
  para_mean   平均段长（可见字符）
  para_p10    段长第 10 百分位（「一行一段」的直接度量）
  one_sent_%  只含一个句末标点的段落占比
  comma_ratio 逗号 / 句号（电报体指标，半角全角都算）
  sent_mean   平均句长
"""
import glob, json, os, re, statistics as st, sys

END = "。！？…"
COMMA = "，、,"


def stats(text):
    paras = [p.strip() for p in re.split(r"\n\s*\n|\n", text) if p.strip()]
    lens = [len(re.sub(r"\s", "", p)) for p in paras]
    one_sent = sum(1 for p in paras if sum(p.count(c) for c in END) <= 1)
    body = re.sub(r"\s", "", text)
    n_end = sum(body.count(c) for c in END) or 1
    n_comma = sum(body.count(c) for c in COMMA)
    sents = [s for s in re.split(f"[{END}]", body) if s]
    return {
        "paras": len(paras),
        "para_mean": round(st.mean(lens), 1) if lens else 0,
        "para_p10": sorted(lens)[max(0, int(0.10 * len(lens)) - 1)] if lens else 0,
        "one_sent_pct": round(100 * one_sent / max(1, len(paras)), 1),
        "comma_ratio": round(n_comma / n_end, 3),
        "sent_mean": round(st.mean([len(s) for s in sents]), 1) if sents else 0,
    }


def main(d):
    rows = []
    for p in sorted(glob.glob(os.path.join(d, "*.final.md"))):
        rid = os.path.basename(p)[:-len(".final.md")]
        mp = os.path.join(d, rid + ".meta.json")
        if not os.path.exists(mp):
            continue
        meta = json.load(open(mp, encoding="utf-8"))
        if "chars" not in meta:
            continue
        s = stats(open(p, encoding="utf-8").read())
        rows.append({**{k: meta[k] for k in ("run", "chapter", "arm", "model", "rep", "chars", "target")}, **s})
    keys = ("para_mean", "para_p10", "one_sent_pct", "comma_ratio", "sent_mean", "chars")
    print(f"n = {len(rows)}")
    print("%-14s %10s %10s %10s" % ("指标", "base", "v2", "差"))
    for k in keys:
        b = [r[k] for r in rows if r["arm"] == "base"]
        v = [r[k] for r in rows if r["arm"] == "v2"]
        if not b or not v:
            continue
        print("%-14s %10.2f %10.2f %+10.2f" % (k, st.mean(b), st.mean(v), st.mean(v) - st.mean(b)))
    print("\n按写手模型分：")
    for m in sorted({r["model"] for r in rows}):
        print(f"  [{m}]")
        for k in keys:
            b = [r[k] for r in rows if r["arm"] == "base" and r["model"] == m]
            v = [r[k] for r in rows if r["arm"] == "v2" and r["model"] == m]
            if b and v:
                print("    %-12s base %8.2f  v2 %8.2f  差 %+7.2f" % (k, st.mean(b), st.mean(v), st.mean(v) - st.mean(b)))
    json.dump(rows, open(os.path.join(d, "..", "surface_stats.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main(sys.argv[1])
