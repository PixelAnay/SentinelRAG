"""Post the demo mailbox to the running dashboard server in each defence mode."""
import json
import re

import requests

js = open("app.js", encoding="utf8").read()
block = js[js.index("const EMAILS = ["):js.index("/* ---------- Folder state")]
emails = []
for m in re.finditer(r"id: (\d+), from: \"([^\"]+)\", addr: \"([^\"]+)\",\s*subject: \"([^\"]+)\".*?body: `(.*?)`\s*\}", block, re.S):
    emails.append(dict(id=int(m[1]), sender=f"{m[2]} <{m[3]}>", subject=m[4], body=m[5].replace("\\n", "\n")))
print(len(emails), "emails")
for mode in ["none", "classifier", "slm"]:
    r = requests.post("http://127.0.0.1:8000/api/chat",
                      json=dict(message="Summarise my unread emails", defense=mode, emails=emails), timeout=300)
    d = r.json()
    print(mode, r.status_code, d["latency_ms"], "ms", d["retrieved"])
    print("  ", d["reply"][:300].replace("\n", " "))
