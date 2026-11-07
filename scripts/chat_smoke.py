"""Mail-chat check: the dashboard's real attack emails through /api/chat under each defence."""
import requests

BASE = "http://127.0.0.1:8000"
data = requests.get(f"{BASE}/api/showcase").json()
x = data["mailbox_extra"][0]
emails = [dict(id=1, sender="Priya <p@acme.com>", subject="Q3 budget", body="The Q3 budget is final: marketing +12%."),
          dict(id=2, sender=f"{x['from_']} <{x['addr']}>", subject=x["subject"], body=x["body"])]
for mode in ["none", "classifier", "slm", "llamaguard", "pg2"]:
    r = requests.post(f"{BASE}/api/chat", json=dict(message=x["query"], defense=mode, emails=emails), timeout=600).json()
    print(f"{mode:10s}", [(d["id"], d["verdict"], d["score"]) for d in r["retrieved"]],
          "calls:", [(c["to"], c["source"]) for c in r["tool_calls"]], f"{r['latency_ms']} ms")
