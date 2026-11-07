"""Replay showcase scenarios through the live server and compare with the recorded evaluation.

Run (server must be up): python -m scripts.api_smoke [scenario ids...]
"""
import sys
import time

import requests

BASE = "http://127.0.0.1:8000"
MODES = {"none": "none", "classifier": "classifier", "slm": "slm_judge", "llamaguard": "llamaguard"}

data = requests.get(f"{BASE}/api/showcase", timeout=30).json()
want = sys.argv[1:] or [s["id"] for s in data["scenarios"]]
agree = total = 0
for s in data["scenarios"]:
    if s["id"] not in want:
        continue
    print(f"\n[{s['id']}] {s['title']}  ({s['dataset']})")
    for mode, rec_name in MODES.items():
        t0 = time.time()
        r = requests.post(f"{BASE}/api/run", json=dict(query=s["query"], docs=[dict(id=d["id"], text=d["text"]) for d in s["docs"]],
                                                       defenses=[mode]), timeout=600).json()["results"][0]
        rec = s["recorded"][rec_name]
        blocked = any(d["verdict"] == "blocked" for d in r["docs"])
        same = (blocked == rec["blocked"]) and (r["hijacked"] == rec["hijacked"])
        agree += same
        total += 1
        print(f"  {mode:10s} blocked={blocked!s:5} hijacked={r['hijacked']!s:5} | recorded blocked={rec['blocked']!s:5} "
              f"hijacked={rec['hijacked']!s:5} {'OK ' if same else 'DIFF'} {time.time() - t0:.1f}s")
print(f"\nagreement with the recorded run: {agree}/{total}")
