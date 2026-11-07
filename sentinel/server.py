"""Dashboard backend. Serves the static frontend and POST /api/chat.

Run: python -m sentinel.server   (then open http://127.0.0.1:8000)
"""
import time
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.responses import FileResponse
from pydantic import BaseModel

from .assistant import Assistant
from .config import ROOT
from .factory import assistant_server, make_defense
from .rag import EmailStore

MODES = {"none": "none", "classifier": "classifier", "slm": "slm_judge"}
state = {"llm": None, "defenses": {}}


@asynccontextmanager
async def lifespan(app):
    state["llm"] = assistant_server().start()
    yield
    for d in state["defenses"].values():
        d.close()
    state["llm"].stop()


app = FastAPI(lifespan=lifespan)


class Email(BaseModel):
    id: int
    sender: str = ""
    subject: str
    body: str


class Chat(BaseModel):
    message: str
    defense: str = "none"
    emails: list[Email] = []


def defense_for(mode):
    name = MODES.get(mode, "none")
    if name not in state["defenses"]:
        state["defenses"][name] = make_defense(name, share_assistant=state["llm"])
    return state["defenses"][name]


@app.post("/api/chat")
def chat(req: Chat):
    t0 = time.perf_counter()
    docs = [dict(id=e.id, text=f"From: {e.sender}\nSubject: {e.subject}\n\n{e.body}") for e in req.emails]
    if not docs:
        return dict(reply="No emails were provided.", latency_ms=0, retrieved=[])
    bot = Assistant(state["llm"], EmailStore(docs), defense_for(req.defense), k=min(5, len(docs)))
    out = bot.run(req.message)
    verdict = {}
    for i in out["retrieved"]:
        verdict[i] = "blocked" if i in out["blocked"] else ("not-checked" if req.defense == "none" else "clean")
    reply = out["answer"].strip() or "(no text answer)"
    for c in out["calls"]:
        if c["name"] == "send_email":
            reply += f"\n\n[Assistant tried to send an email to {c['args'].get('to', '?')}. Nothing was sent: demo mode.]"
    return dict(reply=reply, latency_ms=round((time.perf_counter() - t0) * 1e3),
                defense_ms=round(out["ms_defense"]), retrieved=[dict(id=i, verdict=v) for i, v in verdict.items()])


@app.get("/")
def index():
    return FileResponse(ROOT / "index.html")


@app.get("/{name}")
def static(name: str):
    p = ROOT / name
    if name in ("app.js", "styles.css") and p.exists():
        return FileResponse(p)
    return FileResponse(ROOT / "index.html", status_code=404)


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
