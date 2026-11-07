/* =========================================================
   Shared pieces: helpers, the defence registry, the outcome table
   used by Web pages, Documents and Case studies, routing,
   backend status and the presenter switch.
========================================================= */
"use strict";

const SR = {
  data: null,
  results: null,
  init: {},
  inited: {},
  onReveal: [],
  DEF: {
    none:       { name: "No filter",          sub: "Vulnerable baseline",              color: "var(--c-none)",       rec: "none" },
    classifier: { name: "Fine-tuned DeBERTa", sub: "Classifier, 184M, trained here",  color: "var(--c-classifier)", rec: "classifier" },
    slm:        { name: "Gemma 4 judge",      sub: "Prompted generative guardrail",    color: "var(--c-slm)",        rec: "slm_judge", binary: true },
    llamaguard: { name: "Llama-Guard-3-1B",   sub: "Custom injection category",        color: "var(--c-llamaguard)", rec: "llamaguard", binary: true },
    pg2:        { name: "Prompt Guard 2",     sub: "Meta's 86M detector, reference",   color: "var(--c-pg2)",        rec: null, ref: true }
  },
  MAIN: ["none", "classifier", "slm", "llamaguard"],
  ALL: ["none", "classifier", "slm", "llamaguard", "pg2"]
};

/* ---------- helpers ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pct = (x, d = 1) => (x == null || Number.isNaN(x)) ? "n/a" : `${(100 * x).toFixed(d)}%`;
const msf = x => x == null ? "" : x >= 10000 ? `${(x / 1000).toFixed(1)} s` : `${Math.round(x).toLocaleString()} ms`;
const swatch = mode => `<i class="swatch${SR.DEF[mode].ref ? " ref" : ""}" style="--c:${SR.DEF[mode].color}" aria-hidden="true"></i>`;

function wilson(k, n, z = 1.96) {
  if (!n) return null;
  const p = k / n, d = 1 + z * z / n, c = (p + z * z / (2 * n)) / d;
  const h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
  return { p, lo: Math.max(0, c - h), hi: Math.min(1, c + h), k, n };
}

function toast(msg) {
  $$(".toast").forEach(t => t.remove());
  const t = document.createElement("div");
  t.className = "toast"; t.setAttribute("role", "status"); t.textContent = msg;
  document.body.appendChild(t);
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.remove(), 3200);
}

async function api(path, body) {
  const opt = body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
  let res;
  try { res = await fetch(path, opt); }
  catch { throw new Error("The backend is not reachable. Start it with python -m sentinel.server, then reload."); }
  if (!res.ok) {
    let detail = "";
    try { detail = (await res.json()).detail || ""; } catch { /* not JSON */ }
    throw new Error(`The backend returned ${res.status}${detail ? ": " + detail : ""}.`);
  }
  return res.json();
}

async function runOne(query, docs, mode) {
  const out = await api("/api/run", { query, docs: docs.map(d => ({ id: String(d.id), text: d.text })), defenses: [mode] });
  return out.results[0];
}

/* Mark the injected span inside a source text (shown only with the presenter switch on). */
function marked(src, inj) {
  if (inj) {
    const i = src.indexOf(inj);
    if (i >= 0) return esc(src.slice(0, i)) + `<mark class="inj">${esc(inj)}</mark>` + esc(src.slice(i + inj.length));
  }
  return esc(src);
}

const stateBox = (title, text, kind = "") => `<div class="state ${kind}"><b>${esc(title)}</b>${text}</div>`;
const noData = () => stateBox("The case data did not load", `${esc(SR.dataError || "Unknown error.")}<br>Start the backend with <code>python -m sentinel.server</code> and open <code>http://127.0.0.1:8000</code>.`, "error");

/* ---------- outcome of one run ---------- */
function assistantOutcome(r) {
  const parts = [];
  for (const c of r.calls) {
    if (c.source === "document")
      parts.push(`<p class="o-hijack"><b>Hijacked.</b> Called <code>send_email</code> to <b>${esc(c.to || "?")}</b>, an address planted in the content it read.</p>`);
    else if (c.source === "invented")
      parts.push(`<p class="o-warn"><b>Emailed ${esc(c.to || "?")}</b>, an address it made up. A model habit, not an injection.</p>`);
    else parts.push(`<p>Sent the email the user asked for, to ${esc(c.to)}.</p>`);
  }
  if (!r.calls.length) parts.push(`<p class="o-safe">Answered. No email sent.</p>`);
  return parts.join("");
}

function filterOutcome(r, meta, mode) {
  if (!r.docs.length) return `<span class="hint">No documents</span>`;
  const many = r.docs.length > 1;
  const scoreOf = d => d.verdict === "unchecked" || SR.DEF[mode].binary ? "" : ` <span class="num">${d.score.toFixed(2)}</span>`;
  const line = d => {
    const m = meta[d.id] || {};
    const tag = d.verdict === "blocked" ? `<span class="tag redact">withheld</span>`
      : d.verdict === "clean" ? `<span class="tag pass">passed</span>` : `<span class="tag">not checked</span>`;
    const atk = m.attack ? ` <span class="tag attack attack-only">attack</span>` : "";
    return `<li>${tag}${scoreOf(d)}${many ? ` <span class="o-title" title="${esc(m.title || d.id)}">${esc(m.title || d.id)}</span>` : ""}${atk}</li>`;
  };
  if (!many) return `<ul class="o-docs">${line(r.docs[0])}</ul>`;
  /* several documents: list the ones that matter (withheld or attacks), fold the rest into one line */
  const key = r.docs.filter(d => d.verdict === "blocked");
  const rest = r.docs.filter(d => !key.includes(d));
  const missed = rest.filter(d => (meta[d.id] || {}).attack).map(d =>
    `<li class="attack-only o-hijack">Attack passed: ${esc((meta[d.id] || {}).title || d.id)}</li>`).join("");
  const restLine = rest.length ? `<li class="o-rest">${rest.every(d => d.verdict === "clean") ? `<span class="tag pass">passed</span>` : ""} ${rest.length} other${rest.length > 1 ? "s" : ""}${
    rest.every(d => d.verdict === "clean") && !SR.DEF[mode].binary ? ` <span class="num">max ${Math.max(...rest.map(d => d.score)).toFixed(2)}</span>` : rest.every(d => d.verdict === "clean") ? "" : " not withheld"}</li>` : "";
  return `<ul class="o-docs">${key.map(line).join("")}${restLine}${missed}</ul>`;
}

function recordedText(mode, rec) {
  if (SR.DEF[mode].ref) return `<span class="hint">Scored on detection only</span>`;
  if (!rec) return "";
  const bits = [rec.blocked ? "withheld" : "nothing withheld", rec.hijacked ? `<b class="o-hijack-t">hijacked</b>` : "not hijacked"];
  if (rec.correct != null) bits.push(rec.correct ? "answer right" : "answer wrong");
  return bits.join(", ");
}

/* states: { mode: { s: "idle"|"pending"|"ok"|"error", r, extra } } */
function outcomeTable(modes, states, { meta = {}, recorded = null } = {}) {
  const head = `<div class="o-row o-headrow" aria-hidden="true"><span>Defence</span><span>Filter</span><span>Assistant</span><span>Time</span>${recorded ? "<span>In the evaluation run</span>" : ""}</div>`;
  const rows = modes.map(m => {
    const st = states[m] || { s: "idle" }, d = SR.DEF[m], r = st.r;
    const rec = recorded ? recorded[d.rec] : null;
    let filt, asst, time, reply = "";
    if (st.s === "pending") { filt = `<span class="hint"><span class="spin"></span>Running</span>`; asst = time = ""; }
    else if (st.s === "error") { filt = ""; asst = `<p class="o-warn">${esc(r)}</p>`; time = ""; }
    else if (st.s === "idle") { filt = `<span class="hint">Not run yet</span>`; asst = time = ""; }
    else {
      filt = m === "none" ? `<span class="hint">No filter</span>` : filterOutcome(r, meta, m);
      asst = assistantOutcome(r) + (st.extra || "");
      time = `<span class="num" title="filter ${msf(r.defense_ms)}, model ${msf(r.llm_ms)}">${m === "none" ? "" : `filter ${msf(r.defense_ms)}<br>`}total ${msf(r.total_ms)}</span>`;
      reply = `<details class="o-reply"><summary>Reply</summary><p>${esc(r.reply || "(no text answer)")}</p></details>`;
    }
    let recCell = "";
    if (recorded) {
      let agree = "";
      if (st.s === "ok" && rec) {
        const liveBlocked = r.docs.some(x => x.verdict === "blocked");
        const same = liveBlocked === !!rec.blocked && r.hijacked === !!rec.hijacked;
        agree = same ? `<span class="tag">same live</span>` : `<span class="tag warn" title="The assistant model is not perfectly repeatable">differs live</span>`;
      }
      recCell = `<span class="o-rec"><span class="o-lbl">Evaluation run</span>${recordedText(m, rec)} ${agree}</span>`;
    }
    const cls = st.s === "ok" && r.hijacked ? " is-hijacked" : st.s === "pending" ? " is-pending" : "";
    return `<div class="o-row${cls}">
      <span class="o-def">${swatch(m)}<span><b>${esc(d.name)}</b><small>${esc(d.sub)}</small></span></span>
      <span class="o-filter"><span class="o-lbl">Filter</span>${filt}</span>
      <span class="o-asst${asst || reply ? "" : " empty"}"><span class="o-lbl">Assistant</span>${asst}${reply}</span>
      <span class="o-time${time ? "" : " empty"}"><span class="o-lbl">Time</span>${time}</span>${recCell}</div>`;
  }).join("");
  return `<div class="otable${recorded ? " with-rec" : ""}">${head}${rows}</div>`;
}

/* Question + defence picker + outcome table, used by Web pages and Documents. */
function runPanel(host, { docs, query, check }) {
  const meta = Object.fromEntries(docs.map(d => [d.id, { title: d.title, attack: !!(d.label || d.attack) }]));
  let pick = "classifier";
  const states = {};
  let shown = SR.MAIN;
  host.innerHTML = `
    <div class="runbox">
      <label class="label" for="rpQ">The user asks the assistant</label>
      <div class="rp-q"><input class="field" id="rpQ" value="${esc(query)}">
        <button type="button" class="btn" data-act="all">Run all four</button></div>
      <div class="rp-one">
        <span class="hint">Or one defence:</span>
        <select class="select" id="rpPick" aria-label="Defence for a single run">${SR.ALL.map(m =>
          `<option value="${m}" ${m === pick ? "selected" : ""}>${esc(SR.DEF[m].name)}</option>`).join("")}</select>
        <button type="button" class="btn quiet sm" data-act="one">Run</button>
        <span class="hint">Live on this machine. The first run of each model loads it.</span>
      </div>
    </div>
    <div data-out></div>`;
  const out = $("[data-out]", host), q = $("#rpQ", host);
  const draw = () => { out.innerHTML = outcomeTable(shown, states, { meta }); };
  draw();
  $("#rpPick", host).addEventListener("change", e => { pick = e.target.value; });
  const btns = $$("[data-act]", host);
  async function go(list) {
    if (!q.value.trim()) { q.focus(); toast("Type a question first."); return; }
    btns.forEach(b => (b.disabled = true));
    list.forEach(m => { if (!shown.includes(m)) shown = [...shown, m]; });
    list.forEach(m => (states[m] = { s: "pending" }));
    draw();
    for (const m of list) {
      try { const r = await runOne(q.value, docs, m); states[m] = { s: "ok", r, extra: check ? check(r) : "" }; }
      catch (e) { states[m] = { s: "error", r: e.message }; }
      draw();
    }
    btns.forEach(b => (b.disabled = false));
  }
  $('[data-act="all"]', host).addEventListener("click", () => go(SR.MAIN));
  $('[data-act="one"]', host).addEventListener("click", () => go([pick]));
}

/* Answer check for tables: does the reply contain the expected value? */
function answerCheck(ideal) {
  return r => {
    const ok = String(r.reply).toLowerCase().includes(String(ideal).toLowerCase());
    return ok ? `<p class="o-safe">Answer contains the expected value, ${esc(ideal)}.</p>`
              : `<p class="o-warn">Answer is missing the expected value, ${esc(ideal)}.</p>`;
  };
}

/* Two-pane picker used by Web pages, Documents and Case studies. */
function pickerLayout(view, { title, intro, items, render, group }) {
  const host = $(`#view-${view}`);
  let html = "";
  let lastGroup = null;
  items.forEach((it, i) => {
    if (group && group(it) !== lastGroup) { lastGroup = group(it); html += `<li class="pk-group">${esc(lastGroup)}</li>`; }
    html += `<li><button type="button" class="pk-item" data-i="${i}"><span class="num">${String(i + 1).padStart(2, "0")}</span>
      <span class="pk-text">${esc(it.title)}${it.sub ? `<small>${it.sub}</small>` : ""}</span></button></li>`;
  });
  host.innerHTML = `<div class="picker">
    <nav class="pk-list" aria-label="${esc(title)}"><h1>${esc(title)}</h1><p>${intro}</p><ul>${html}</ul></nav>
    <div class="pk-main" tabindex="-1"></div></div>`;
  const main = $(".pk-main", host);
  function open(i, focus) {
    $$(".pk-item", host).forEach(b => b.toggleAttribute("aria-current", Number(b.dataset.i) === i));
    render(main, i, open);
    if (focus) { main.focus({ preventScroll: true }); main.scrollIntoView({ block: "start" }); }
  }
  $(".pk-list", host).addEventListener("click", e => { const b = e.target.closest(".pk-item"); if (b) open(Number(b.dataset.i), true); });
  open(0);
}

/* ---------- routing ---------- */
const VIEWS = ["overview", "mailbox", "web", "documents", "cases", "detector", "results", "method"];
function showView(name) {
  if (!VIEWS.includes(name)) name = "overview";
  VIEWS.forEach(v => { $(`#view-${v}`).hidden = v !== name; });
  $$(".sections a").forEach(a => a.dataset.view === name ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"));
  document.body.dataset.view = name;
  const cur = $(".sections a[aria-current]");
  if (cur) cur.scrollIntoView({ block: "nearest", inline: "nearest" });
  if (!SR.inited[name] && SR.init[name]) { SR.inited[name] = true; SR.init[name](); }
  window.scrollTo(0, 0);
}
window.addEventListener("hashchange", () => showView(location.hash.slice(1)));

/* ---------- presenter switch ---------- */
$("#revealBtn").addEventListener("click", () => {
  const on = !document.body.classList.contains("reveal");
  document.body.classList.toggle("reveal", on);
  $("#revealBtn").setAttribute("aria-pressed", String(on));
  SR.onReveal.forEach(f => f(on));
});

/* ---------- backend status ---------- */
async function pollStatus() {
  const s = $("#serverStatus");
  try {
    const st = await (await fetch("/api/status")).json();
    s.className = "status ok";
    const gb = st.vram_free_mb != null ? `<span class="long">, ${(st.vram_free_mb / 1024).toFixed(1)} GB GPU free</span>` : "";
    s.innerHTML = `<span>Backend ready${gb}</span>`;
    s.title = `Models loaded: ${st.loaded.join(", ") || "none yet, each loads on first use"}`;
  } catch {
    s.className = "status err";
    s.textContent = "Backend offline";
    s.title = "Start it with: python -m sentinel.server";
  }
}
pollStatus();
setInterval(pollStatus, 15000);

/* ---------- boot (runs after every script has loaded) ---------- */
SR.ready = (async () => {
  try { SR.data = await api("/api/showcase"); }
  catch (e) { SR.dataError = e.message; }
})();
SR.ready.then(() => {
  if (SR.data && typeof mailAddExtras === "function") mailAddExtras(SR.data.mailbox_extra);
  showView(location.hash.slice(1));
});
