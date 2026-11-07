"""Detection accuracy and per-check latency on the three test sets.

Run: python -m sentinel.eval_detection classifier [slm_judge llamaguard]
"""
import json
import sys
import time
from collections import defaultdict

import numpy as np

from .config import PROCESSED, RUNS
from .factory import make_defense

SETS = ["testA_bipia_email", "testB_llmail", "testC_table", "testD_web"]


def load(name):
    return [json.loads(line) for line in open(PROCESSED / f"{name}.jsonl", encoding="utf8")]


def prf(gold, pred):
    gold, pred = np.array(gold), np.array(pred)
    tp = int(((gold == 1) & (pred == 1)).sum())
    fp = int(((gold == 0) & (pred == 1)).sum())
    fn = int(((gold == 1) & (pred == 0)).sum())
    tn = int(((gold == 0) & (pred == 0)).sum())
    p = tp / (tp + fp) if tp + fp else 0.0
    r = tp / (tp + fn) if tp + fn else 0.0
    return dict(precision=p, recall=r, f1=2 * p * r / (p + r) if p + r else 0.0,
                fpr=fp / (fp + tn) if fp + tn else 0.0, tp=tp, fp=fp, fn=fn, tn=tn)


def run(name, limit=None):
    d = make_defense(name)
    for _ in range(3):
        d.check("Warm up text for timing.")
    out = {}
    for s in SETS:
        rows = load(s)[:limit]
        gold, pred, ms, per_kind = [], [], [], defaultdict(list)
        for r in rows:
            t0 = time.perf_counter()
            flagged, _ = d.check(r["text"])
            ms.append((time.perf_counter() - t0) * 1e3)
            gold.append(r["label"])
            pred.append(int(flagged))
            per_kind[r["kind"]].append(int(flagged))
        res = prf(gold, pred)
        res["ms_median"], res["ms_p95"] = float(np.median(ms)), float(np.percentile(ms, 95))
        res["flag_rate_by_kind"] = {k: round(float(np.mean(v)), 3) for k, v in per_kind.items()}
        out[s] = res
        print(f"{name:11s} {s:18s} P={res['precision']:.3f} R={res['recall']:.3f} F1={res['f1']:.3f} "
              f"FPR={res['fpr']:.3f} median={res['ms_median']:.1f}ms p95={res['ms_p95']:.1f}ms", flush=True)
    d.close()
    RUNS.mkdir(exist_ok=True)
    json.dump(out, open(RUNS / f"detection_{name}.json", "w"), indent=2)


if __name__ == "__main__":
    for n in sys.argv[1:]:
        run(n)
