# -*- coding: utf-8 -*-
"""跑一份成稿：两段式真路径（真 checkpoint、真组装）。

用法：python3 run_write.py <outdir> <chapter> <arm> <model>
产物：<outdir>/<run_id>.{seg1.md,seg2.md,final.md,meta.json}
已存在 final.md 时直接跳过（可断点续跑）。
"""
import json, os, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import build_prompt as bp
import cli
from measure import normalize_prose

STORYCTL = os.path.join(bp.ROOT, "skills/story-long-write/scripts/storyctl.py")


def checkpoint(seg1_text, target, chapter):
    fd, path = tempfile.mkstemp(suffix=".md", dir="/private/tmp")
    with os.fdopen(fd, "w", encoding="utf-8") as fh:
        fh.write(seg1_text)
    try:
        out = subprocess.run(
            ["python3", STORYCTL, "wordcount", "checkpoint", "--file", path,
             "--target", str(target), "--chapter", str(chapter)],
            capture_output=True, check=True).stdout.decode("utf-8")
        return json.loads(out)
    finally:
        os.unlink(path)


def visible_chars(text):
    sys.path.insert(0, os.path.join(bp.ROOT, "skills/story-long-write/scripts"))
    import wordcount_core as wc
    return wc.count_visible_chars(text)


def run(outdir, chapter, arm, model, rep="r1"):
    run_id = f"ch{chapter:02d}__{arm}__{model}__{rep}"
    os.makedirs(outdir, exist_ok=True)
    final_p = os.path.join(outdir, run_id + ".final.md")
    if os.path.exists(final_p):
        return run_id, "skip"

    p1, o, split = bp.build(chapter, arm, 1)
    t1, m1 = cli.call(model, p1, min_chars=200)
    if t1 is None:
        json.dump({"run": run_id, "fail": "seg1", "meta": m1},
                  open(os.path.join(outdir, run_id + ".meta.json"), "w"), ensure_ascii=False)
        return run_id, "fail-seg1"
    open(os.path.join(outdir, run_id + ".seg1.md"), "w", encoding="utf-8").write(t1)

    ck = checkpoint(t1, o["target_n"], chapter)
    remaining = {"actual": ck["actual"],
                 "min": ck["remaining_user_range"]["min"],
                 "max": ck["remaining_user_range"]["max"]}

    p2, _, _ = bp.build(chapter, arm, 2, split=split, seg1_text=t1, remaining=remaining)
    t2, m2 = cli.call(model, p2, min_chars=200)
    if t2 is None:
        json.dump({"run": run_id, "fail": "seg2", "meta": m2, "checkpoint": ck},
                  open(os.path.join(outdir, run_id + ".meta.json"), "w"), ensure_ascii=False)
        return run_id, "fail-seg2"
    open(os.path.join(outdir, run_id + ".seg2.md"), "w", encoding="utf-8").write(t2)

    final = normalize_prose(t1.rstrip() + "\n\n" + t2.lstrip())
    open(final_p, "w", encoding="utf-8").write(final)
    json.dump({"run": run_id, "chapter": f"ch{chapter:02d}", "arm": arm, "model": model,
               "rep": rep, "title": o["title"], "target": o["target_n"],
               "points": len(o["points"]), "split": split,
               "chars": visible_chars(final), "checkpoint": ck,
               "seg1_meta": m1, "seg2_meta": m2,
               "prompt_chars": [len(p1), len(p2)]},
              open(os.path.join(outdir, run_id + ".meta.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    return run_id, "ok"


if __name__ == "__main__":
    outdir, ch, arm, model = sys.argv[1], int(sys.argv[2]), sys.argv[3], sys.argv[4]
    rep = sys.argv[5] if len(sys.argv) > 5 else "r1"
    rid, status = run(outdir, ch, arm, model, rep)
    print(json.dumps({"run": rid, "status": status}, ensure_ascii=False))
