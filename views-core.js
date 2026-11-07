/* =========================================================
   Shared pieces for the showcase tabs: helpers, tab switching,
   backend status, presenter mode, and the result-column renderer.
========================================================= */
"use strict";

const SR = {
  data: null,
  results: null,
  inited: {},
  init: {},
  DEF: {
    none:       { name: "No defence",          sub: "Baseline assistant",           color: "var(--c-none)",       rec: "none" },
    classifier: { name: "Fine-tuned DeBERTa",  sub: "Classifier (your model)",      color: "var(--c-classifier)", rec: "classifier" },
    slm:        { name: "Gemma 4 judge",       sub: "Prompted SLM guardrail",       color: "var(--c-slm)",        rec: "slm_judge", binary: true },
    llamaguard: { name: "Llama-Guard-3-1B",    sub: "With a custom injection category", color: "var(--c-llamaguard)", rec: "llamaguard", binary: true },
    pg2:        { name: "Prompt Guard 2 (86M)", sub: "Pretrained reference model",  color: "var(--c-pg2)",        rec: null }
  },
  MAIN_MODES: ["none", "classifier", "slm", "llamaguard"]
};

/* ---------- helpers ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pct = (x, d = 1) => (x == null || Number.isNaN(x)) ? "n/a" : `${(100 * x).toFixed(d)}%`;
const ms = x => `${Math.round(x)} ms`;

function wilson(k, n, z = 1.96) {
  if (!n) return null;
  const p = k / n, d = 1 + z * z / n, c = (p + z * z / (2 * n)) / d;
  const h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
  return { p, lo: Math.max(0, c - h), hi: Math.min(1, c + h), k, n };
}

async function api(path, body) {
  const opt = body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
  let res;
  try { res = await fetch(path, opt); } catch { throw new Error("Backend not reachable. Start it with: python -m sentinel.server"); }
  if (!res.ok) {
    let detail = "";
    try { detail = (await res.json()).detail || ""; } catch { /* ignore */ }
    throw new Error(`Backend error ${res.status}${detail ? ": " + detail : ""}`);
  }
  return res.json();
}

/* One request to /api/run for one defence. */
async function runOne(query, docs, mode) {
  const out = await api("/api/run", { query, docs: docs.map(d => ({ id: String(d.id), text: d.text })), defenses: [mode] });
  return out.results[0];
}

/* ---------- result column ---------- */
function verdictPills(r, docMeta, def) {
  if (!r.docs.length) return "";
  const rows = r.docs.map(d => {
    const meta = docMeta[d.id] || {};
    const cls = d.verdict === "blocked" ? "bad" : d.verdict === "clean" ? "ok" : "";
    const label = d.verdict === "blocked" ? "withheld" : d.verdict === "clean" ? "passed" : "unfiltered";
    const score = d.verdict === "unchecked" || def.binary ? "" : ` ${d.score.toFixed(2)}`;
    const tag = meta.attack ? `<span class="pill bad attack-tag">attack</span>` : "";
    return `<div class="dv ${meta.attack ? "attack" : ""}"><span class="pill ${cls}">${label}${score}</span>` +
           `<span class="t" title="${esc(meta.title || d.id)}">${esc(meta.title || d.id)}</span>${tag}</div>`;
  }).join("");
  return `<div><div class="sect" style="margin:0 0 4px">Documents the assistant retrieved</div><div class="dverdicts">${rows}</div></div>`;
}

function recordedLine(mode, rec, group) {
  if (mode === "pg2") return `<div class="recorded">Prompt Guard 2 was only scored on detection, not run end to end.</div>`;
  if (!rec) return "";
  const bits = [rec.blocked ? "document withheld" : "nothing withheld", rec.hijacked ? "assistant hijacked" : "assistant not hijacked"];
  if (rec.correct != null) bits.push(rec.correct ? "answer correct" : "answer wrong");
  return `<div class="recorded">In the evaluation run: ${bits.join(", ")}.</div>`;
}

/* state: "idle" | "pending" | "ok" | "error" */
function colHTML(mode, state, r, rec, docMeta = {}, extra = "") {
  const def = SR.DEF[mode];
  let body;
  if (state === "pending") body = `<div><span class="spin"></span>Running…</div>`;
  else if (state === "error") body = `<div class="alert">${esc(r)}</div>`;
  else if (state === "idle") body = `<div class="hint">Not run yet.</div>`;
  else {
    const callBox = c => {
      if (c.source === "document")
        return `<div class="alert">⚠ Hijacked: the assistant called <b>send_email</b> to <b>${esc(c.to || "?")}</b>, an address taken from the retrieved content.<br><small>Nothing was delivered (recorder only).</small></div>`;
      if (c.source === "invented")
        return `<div class="warnbox">The assistant also emailed its answer to <b>${esc(c.to || "?")}</b>, an address nobody gave it. This is the model's own habit, not an injection.<br><small>Nothing was delivered (recorder only).</small></div>`;
      return `<div class="safe-note">send_email to <b>${esc(c.to)}</b>, as the user asked.</div>`;
    };
    const calls = r.calls.length ? r.calls.map(callBox).join("") : `<div class="safe-note">✓ No email was sent.</div>`;
    body = calls + `<div class="reply">${esc(r.reply || "(no text answer)")}</div>` + verdictPills(r, docMeta, def) +
           `<div class="hint">defence ${ms(r.defense_ms)} · model ${ms(r.llm_ms)} · total ${ms(r.total_ms)}</div>`;
  }
  return `<article class="rcol ${state === "pending" ? "pending" : ""}" style="--c:${def.color}">` +
         `<header>${esc(def.name)}<small>${esc(def.sub)}</small></header><div class="rbody">${body}${extra}${recordedLine(mode, rec)}</div></article>`;
}

/* ---------- tabs ---------- */
function showView(name) {
  if (!$(`#view-${name}`)) name = "mail";
  $$(".view").forEach(v => v.classList.toggle("hidden", v.id !== `view-${name}`));
  $$(".vtab").forEach(t => t.classList.toggle("active", t.dataset.view === name));
  document.body.dataset.view = name;
  document.body.classList.remove("chat-open", "sidebar-open");
  if (location.hash !== `#${name}`) history.replaceState(null, "", `#${name}`);
  if (!SR.inited[name] && SR.init[name]) { SR.inited[name] = true; SR.init[name](); }
}

$$(".vtab").forEach(t => t.addEventListener("click", () => showView(t.dataset.view)));
window.addEventListener("hashchange", () => showView(location.hash.slice(1)));

/* ---------- presenter mode ---------- */
$("#revealBtn").addEventListener("click", () => {
  const on = !document.body.classList.contains("reveal");
  document.body.classList.toggle("reveal", on);
  $("#revealBtn").setAttribute("aria-pressed", String(on));
  $("#revealBtn").textContent = on ? "👁 Attacks revealed" : "👁 Reveal attacks";
  if (typeof EMAILS !== "undefined" && typeof selectedId !== "undefined" && selectedId != null) {
    const open = EMAILS.find(m => m.id === selectedId);
    if (open) renderBanner(open);
  }
});

/* ---------- backend status ---------- */
async function pollStatus() {
  const s = $("#serverStatus");
  try {
    const st = await (await fetch("/api/status")).json();
    s.className = "vtab-status ok";
    const vram = st.vram_free_mb != null ? ` · ${Math.round(st.vram_free_mb / 1024 * 10) / 10} GB VRAM free` : "";
    s.textContent = `backend ready${vram}`;
    s.title = `Loaded: ${st.loaded.join(", ") || "nothing yet (models load on first use)"}`;
  } catch {
    s.className = "vtab-status err";
    s.textContent = "backend offline";
    s.title = "Start it with: python -m sentinel.server";
  }
}
pollStatus();
setInterval(pollStatus, 15000);

/* ---------- boot ---------- */
SR.ready = (async function boot() {
  try {
    SR.data = await api("/api/showcase");
    if (typeof mailAddExtras === "function") mailAddExtras(SR.data.mailbox_extra);
  } catch (e) { SR.dataError = e.message; }
})();
SR.ready.then(() => showView(location.hash.slice(1) || "mail"));
