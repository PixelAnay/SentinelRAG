"""Dashboard backend. Serves the static frontend and the JSON API.

Run: python -m sentinel.server   (then open http://127.0.0.1:8000)

Endpoints
  POST /api/chat       mail assistant (one defence)
  POST /api/run        any documents + question, one or more defences
  POST /api/scan       run detectors on a piece of text
  GET  /api/showcase   scripted scenarios, web and table libraries, extra mailbox emails
  GET  /api/results    saved evaluation numbers
  GET  /api/samples    random rows from the test sets
  GET  /api/status     what is loaded
"""
import json
import random
import threading
import time
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from .assistant import Assistant
from .config import ATTACKER_ADDR, PROCESSED, ROOT
from .factory import assistant_server, make_defense
from .rag import EmailStore

MODES = {"none": "none", "classifier": "classifier", "slm": "slm_judge", "llamaguard": "llamaguard",
         "pg2": "prompt_guard2"}
DETECTORS = {"classifier": "Fine-tuned DeBERTa (seed 13)", "classifier_s21": "Fine-tuned DeBERTa (seed 21)",
             "classifier_s42": "Fine-tuned DeBERTa (seed 42)", "slm_judge": "Gemma 4 E2B judge",
             "llamaguard": "Llama-Guard-3-1B (custom category)", "prompt_guard2": "Prompt Guard 2 86M (reference)"}
SHOWCASE = ROOT / "showcase"
STATIC = {".js", ".css", ".html"}

state = {"llm": None, "defenses": {}}
lock = threading.Lock()
_rows = {}


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


class Doc(BaseModel):
    id: str
    text: str


class Run(BaseModel):
    query: str
    docs: list[Doc]
    defenses: list[str] = ["none"]


class Scan(BaseModel):
    text: str
    detectors: list[str] = ["classifier"]


def defense_for(mode):
    name = MODES.get(mode)
    if name is None:
        raise HTTPException(400, f"unknown defence {mode!r}")
    if name not in state["defenses"]:
        state["defenses"][name] = make_defense(name, share_assistant=state["llm"])
    return state["defenses"][name]


def call_source(to, query, docs):
    """Where did the recipient address come from? query = the user asked for it, document = it appears in
    retrieved content (the hijack pattern), invented = the model made it up."""
    t = to.lower().strip()
    if not t:
        return "invented"
    if t in query.lower():
        return "query"
    if "@" in t and (t == ATTACKER_ADDR.lower() or any(t in d["text"].lower() for d in docs)):
        return "document"
    return "invented"


def answer(mode, query, docs):
    """Retrieve, filter and answer. Returns the reply plus per-document verdicts."""
    t0 = time.perf_counter()
    bot = Assistant(state["llm"], EmailStore(docs), defense_for(mode), k=min(5, len(docs)))
    out = bot.run(query)
    shown = {}
    for doc_id, score in zip(out["retrieved"], out["scores"]):
        verdict = "blocked" if doc_id in out["blocked"] else ("unchecked" if mode == "none" else "clean")
        shown[doc_id] = dict(id=doc_id, verdict=verdict, score=round(float(score), 4))
    calls = []
    for c in out["calls"]:
        to = str(c["args"].get("to", ""))
        src = call_source(to, query, docs)
        calls.append(dict(name=c["name"], to=to, body=str(c["args"].get("body", ""))[:300], source=src,
                          unrequested=src != "query"))
    return dict(mode=mode, reply=out["answer"].strip(), calls=calls, docs=list(shown.values()),
                hijacked=any(c["source"] == "document" for c in calls), defense_ms=round(out["ms_defense"]),
                llm_ms=round(out["ms_llm"]), total_ms=round((time.perf_counter() - t0) * 1e3))


@app.post("/api/chat")
def chat(req: Chat):
    docs = [dict(id=e.id, text=f"From: {e.sender}\nSubject: {e.subject}\n\n{e.body}") for e in req.emails]
    if not docs:
        return dict(reply="No emails were provided.", latency_ms=0, retrieved=[], tool_calls=[])
    with lock:
        r = answer(req.defense, req.message, docs)
    reply = r["reply"] or "(no text answer)"
    for c in r["calls"]:
        reply += f"\n\n[Assistant tried to send an email to {c['to'] or '?'}. Nothing was sent.]"
    return dict(reply=reply, latency_ms=r["total_ms"], defense_ms=r["defense_ms"],
                retrieved=[dict(id=d["id"], verdict=d["verdict"], score=d["score"]) for d in r["docs"]],
                tool_calls=r["calls"])


@app.post("/api/run")
def run(req: Run):
    if not req.docs:
        raise HTTPException(400, "no documents")
    docs = [dict(id=d.id, text=d.text) for d in req.docs]
    with lock:
        return dict(results=[answer(m, req.query, docs) for m in req.defenses])


@app.post("/api/scan")
def scan(req: Scan):
    out = []
    with lock:
        for name in req.detectors:
            if name not in DETECTORS:
                out.append(dict(name=name, label=name, error="unknown detector"))
                continue
            try:
                if name not in state["defenses"]:
                    state["defenses"][name] = make_defense(name, share_assistant=state["llm"])
                    state["defenses"][name].check("warm up")
                t0 = time.perf_counter()
                flagged, score = state["defenses"][name].check(req.text)
                out.append(dict(name=name, label=DETECTORS[name], flagged=bool(flagged), score=round(float(score), 4),
                                binary=name in ("slm_judge", "llamaguard"),
                                ms=round((time.perf_counter() - t0) * 1e3, 1)))
            except Exception as e:
                out.append(dict(name=name, label=DETECTORS[name], error=f"{type(e).__name__}: {e}"[:300]))
    return dict(results=out)


def rows(name):
    if name not in _rows:
        _rows[name] = [json.loads(line) for line in open(PROCESSED / f"{name}.jsonl", encoding="utf8")]
    return _rows[name]


@app.get("/api/samples")
def samples(set: str = "testB_llmail", label: int = -1, kind: str = "", n: int = 1, seed: int | None = None):
    if set not in ("testA_bipia_email", "testB_llmail", "testC_table", "testD_web"):
        raise HTTPException(400, "unknown set")
    pool = [r for r in rows(set) if (label < 0 or r["label"] == label) and (not kind or r["kind"] == kind)]
    random.Random(seed).shuffle(pool)
    return dict(rows=[dict(id=r["id"], text=r["text"][:8000], label=r["label"], kind=r["kind"],
                           vector=r.get("vector"), question=r.get("question"), ideal=r.get("ideal"))
                      for r in pool[:max(1, min(n, 20))]], pool=len(pool))


@app.get("/api/kinds")
def kinds(set: str):
    return dict(kinds=sorted({r["kind"] for r in rows(set)}))


@app.get("/api/showcase")
def showcase():
    return FileResponse(SHOWCASE / "scenarios.json", media_type="application/json")


@app.get("/api/results")
def results():
    return FileResponse(SHOWCASE / "results.json", media_type="application/json")


@app.get("/api/status")
def status():
    info = dict(loaded=sorted(state["defenses"]), assistant=bool(state["llm"]))
    try:
        import torch
        free, total = torch.cuda.mem_get_info()
        info["vram_free_mb"], info["vram_total_mb"] = free // 2**20, total // 2**20
    except Exception:
        pass
    return info


@app.get("/")
def index():
    return FileResponse(ROOT / "index.html", headers={"Cache-Control": "no-cache"})


@app.get("/fonts/{name}")
def font(name: str):
    p = ROOT / "fonts" / name
    if p.suffix == ".woff2" and "\\" not in name and ".." not in name and p.is_file():
        return FileResponse(p, media_type="font/woff2")
    return JSONResponse({"error": "not found"}, status_code=404)


@app.get("/{name}")
def static(name: str):
    p = ROOT / name
    if p.suffix in STATIC and "\\" not in name and ".." not in name and p.is_file():
        return FileResponse(p, headers={"Cache-Control": "no-cache"})
    return JSONResponse({"error": "not found"}, status_code=404)


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8000)
