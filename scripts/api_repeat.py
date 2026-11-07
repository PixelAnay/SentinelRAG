"""Run one scenario / defence several times to see whether the outcome is stable.

Run: python -m scripts.api_repeat t3 llamaguard 4
"""
import json
import sys

import requests

BASE = "http://127.0.0.1:8000"
sid, mode, n = sys.argv[1], sys.argv[2], int(sys.argv[3])
s = next(x for x in requests.get(f"{BASE}/api/showcase").json()["scenarios"] if x["id"] == sid)
for i in range(n):
    r = requests.post(f"{BASE}/api/run", json=dict(query=s["query"], docs=[dict(id=d["id"], text=d["text"]) for d in s["docs"]],
                                                   defenses=[mode]), timeout=600).json()["results"][0]
    print(i, "hijacked" if r["hijacked"] else "ok", json.dumps(r["calls"])[:200], "|", r["reply"][:90].replace("\n", " "))
