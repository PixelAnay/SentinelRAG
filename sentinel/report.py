"""Combine runs/*.json into runs/results.md.

Run: python -m sentinel.report
"""
import json

from .config import RUNS

MODES = ["none", "classifier", "slm_judge", "llamaguard"]


def load(p):
    return json.load(open(p)) if p.exists() else None


def pct(x):
    return "n/a" if x is None else f"{100 * x:.1f}%"


def main():
    lines = ["# SentinelRAG results", "", "## Detection (per document)", "",
             "| Defence | Test set | Precision | Recall | F1 | False-positive rate | Median ms | p95 ms |",
             "|---|---|---|---|---|---|---|---|"]
    for m in MODES[1:]:
        d = load(RUNS / f"detection_{m}.json")
        for s, v in (d or {}).items():
            lines.append(f"| {m} | {s} | {v['precision']:.3f} | {v['recall']:.3f} | {v['f1']:.3f} | "
                         f"{pct(v['fpr'])} | {v['ms_median']:.0f} | {v['ms_p95']:.0f} |")
    lines += ["", "## End to end (assistant: Gemma 4 E2B, thinking off, k=5)", "",
              "| Mode | Attacks retrieved | ASR set A | ASR set B | Attacks blocked A | Attacks blocked B | "
              "False block (clean) | False block (hard negative) | Table acc clean | Table acc attacked | "
              "Defence ms median | Defence ms p95 |",
              "|---|---|---|---|---|---|---|---|---|---|---|---|"]
    for m in MODES:
        e = load(RUNS / f"e2e_{m}.json")
        if not e:
            continue
        lines.append(f"| {m} | {e['attack_retrieved']}/{e['attack_cases']} | {pct(e['ASR_A'])} | {pct(e['ASR_B'])} | "
                     f"{pct(e['blocked_A'])} | {pct(e['blocked_B'])} | {pct(e['false_block_clean'])} | "
                     f"{pct(e['false_block_hard_negative'])} | {pct(e['table_acc_clean'])} | "
                     f"{pct(e['table_acc_attacked'])} | {e['defense_ms_median']:.0f} | {e['defense_ms_p95']:.0f} |")
    text = "\n".join(lines + intervals() + web() + seeds() + reference()) + "\n"
    (RUNS / "results.md").write_text(text, encoding="utf8")
    print(text)


def wilson(k, n, z=1.96):
    if n == 0:
        return "n/a"
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * ((p * (1 - p) / n + z * z / (4 * n * n)) ** 0.5) / d
    return f"{100 * p:.1f}% [{100 * max(0, c - h):.1f}, {100 * min(1, c + h):.1f}]"


def intervals():
    """95% Wilson intervals from saved counts. Single run, so these cover sampling error only."""
    out = ["", "## 95% confidence intervals (Wilson)", "",
           "| Defence | Test B recall | Test A false-positive rate | Test B false-positive rate |", "|---|---|---|---|"]
    for m in MODES[1:]:
        d = load(RUNS / f"detection_{m}.json")
        if d:
            b, a = d["testB_llmail"], d["testA_bipia_email"]
            out.append(f"| {m} | {wilson(b['tp'], b['tp'] + b['fn'])} | {wilson(a['fp'], a['fp'] + a['tn'])} | "
                       f"{wilson(b['fp'], b['fp'] + b['tn'])} |")
    out += ["", "| Mode | ASR set B | Attacks blocked, set B | False block, hard negatives |", "|---|---|---|---|"]
    for m in MODES:
        p = RUNS / f"e2e_raw_{m}.json"
        if not p.exists():
            continue
        r = load(p)
        b = [x for x in r["attack"] if x["set"] == "B" and x["retrieved"]]
        h = [x for x in r["safe"] if x["kind"] == "hard_negative"]
        out.append(f"| {m} | {wilson(sum(x['success'] for x in b), len(b))} | "
                   f"{wilson(sum(x['blocked'] for x in b), len(b))} | "
                   f"{wilson(sum(x['any_blocked'] for x in h), len(h))} |")
    return out


def web():
    out = ["", "## Web pages, end to end (80 poisoned and 40 clean pages, 95% Wilson intervals)", "",
           "| Mode | ASR | Attacks blocked | False block (clean pages) | Defence ms median |", "|---|---|---|---|---|"]
    for m in MODES:
        p = RUNS / f"web_e2e_{m}.json"
        if p.exists():
            s = load(p)["summary"]
            out.append(f"| {m} | {s['ASR']} | {s['blocked']} | {s['false_block']} | {s['defense_ms_median']:.0f} |")
    return out


def reference():
    """Prompt Guard 2 (86M) is a pretrained reference model, not one of the three contestants."""
    d = load(RUNS / "detection_prompt_guard2.json")
    if not d:
        return []
    out = ["", "## Reference: Meta Llama-Prompt-Guard-2-86M (pretrained, not fine-tuned, not a contestant)", "",
           "| Test set | Precision | Recall | F1 | False-positive rate | Median ms | p95 ms |", "|---|---|---|---|---|---|---|"]
    for s, v in d.items():
        out.append(f"| {s} | {v['precision']:.3f} | {v['recall']:.3f} | {v['f1']:.3f} | {pct(v['fpr'])} | "
                   f"{v['ms_median']:.0f} | {v['ms_p95']:.0f} |")
    return out


def seeds():
    out = ["", "## Classifier across three training seeds", "",
           "| Test set | Metric | Seed 13 | Seed 21 | Seed 42 | Mean | Range |", "|---|---|---|---|---|---|---|"]
    runs = [load(RUNS / f"detection_{n}.json") for n in ["classifier", "classifier_s21", "classifier_s42"]]
    if not all(runs):
        return []
    for s in runs[0]:
        for key, label in [("recall", "Recall"), ("fpr", "False-positive rate"), ("f1", "F1")]:
            v = [r[s][key] for r in runs]
            fmt = (lambda x: f"{100 * x:.1f}%") if key != "f1" else (lambda x: f"{x:.3f}")
            out.append(f"| {s} | {label} | {fmt(v[0])} | {fmt(v[1])} | {fmt(v[2])} | {fmt(sum(v) / 3)} | "
                       f"{fmt(min(v))} to {fmt(max(v))} |")
    return out

if __name__ == "__main__":
    main()
