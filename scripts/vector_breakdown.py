"""Recall on Test D by where the injection is hidden, for the classifier and the Gemma judge."""
import json
from collections import defaultdict

from sentinel.config import PROCESSED
from sentinel.factory import make_defense

rows = [json.loads(line) for line in open(PROCESSED / "testD_web.jsonl", encoding="utf8")]
for name in ["classifier", "slm_judge"]:
    d = make_defense(name)
    hit = defaultdict(list)
    for r in rows:
        if r["label"]:
            hit[r["vector"]].append(int(d.check(r["text"])[0]))
    print(name, {k: f"{sum(v)}/{len(v)}" for k, v in sorted(hit.items())})
    d.close()
