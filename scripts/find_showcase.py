"""List showcase candidates by joining saved end-to-end runs with the dataset rows."""
import json
import random

from sentinel.config import PROCESSED, RUNS, SEED
from sentinel.eval_e2e import build_cases

MODES = ["none", "classifier", "slm_judge", "llamaguard"]

mailbox, attack, safe, tables = build_cases(100)
raw = {m: json.load(open(RUNS / f"e2e_raw_{m}.json")) for m in MODES}
print("attack cases", len(attack), [len(raw[m]["attack"]) for m in MODES])
print("safe cases", len(safe), [len(raw[m]["safe"]) for m in MODES])
print("table cases", len(tables), [len(raw[m]["table"]) for m in MODES])
print("row keys", list(attack[0]["row"].keys()))
print("table keys", list(tables[0].keys()))

print("\n== EMAIL ATTACKS: hijacked at baseline ==")
for i, c in enumerate(attack):
    r = {m: raw[m]["attack"][i] for m in MODES}
    if r["none"]["success"] and r["none"]["retrieved"]:
        print(i, c["row"]["id"], c["set"],
              "clf blocked" if r["classifier"]["blocked"] else "clf MISS",
              "| judge blocked" if r["slm_judge"]["blocked"] else "| judge MISS",
              "| lg blocked" if r["llamaguard"]["blocked"] else "| lg MISS", "|", c["row"]["kind"])

print("\n== HARD NEGATIVES ==")
for i, c in enumerate(safe):
    if c["kind"] != "hard_negative":
        continue
    r = {m: raw[m]["safe"][i] for m in MODES}
    if r["slm_judge"]["any_blocked"] or r["classifier"]["any_blocked"]:
        print(i, c["row"]["id"], {m: r[m]["any_blocked"] for m in MODES})

print("\n== WEB ==")
rows = [json.loads(line) for line in open(PROCESSED / "testD_web.jsonl", encoding="utf8")]
rng = random.Random(SEED)
attacked = [r for r in rows if r["label"]]
clean = [r for r in rows if r["kind"] == "clean"]
rng.shuffle(attacked)
rng.shuffle(clean)
wcases = [(r, True) for r in attacked[:80]] + [(r, False) for r in clean[:40]]
web = {m: json.load(open(RUNS / f"web_e2e_{m}.json"))["raw"] for m in MODES}
print(len(wcases), [len(web[m]) for m in MODES], list(rows[0].keys()))
for i, (r, a) in enumerate(wcases):
    if not a:
        continue
    d = {m: web[m][i] for m in MODES}
    if d["none"]["success"] or (d["classifier"]["blocked"] != d["slm_judge"]["blocked"]):
        print(i, r["id"], r.get("vector"), {m: ("hij" if d[m]["success"] else "") + ("blk" if d[m]["blocked"] else "") for m in MODES})
print("clean web false blocks:", [(i, {m: web[m][i]["blocked"] for m in MODES}) for i, (r, a) in enumerate(wcases) if not a and any(web[m][i]["blocked"] for m in MODES)][:8])

print("\n== TABLES ==")
for i, c in enumerate(tables):
    r = {m: raw[m]["table"][i] for m in MODES}
    if c["label"] and (r["none"]["success"] or r["classifier"]["blocked"]):
        print(i, c["id"], c["question"][:60], {m: (r[m]["blocked"], r[m]["correct"], r[m]["success"]) for m in MODES})
        if i > 140:
            break
