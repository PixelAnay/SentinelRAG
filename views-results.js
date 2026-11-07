/* =========================================================
   Overview, Results and Method. Every number on these pages is
   read from showcase/results.json (built by scripts/build_showcase.py).
========================================================= */
"use strict";

const SHORT = { none: "No filter", classifier: "DeBERTa", slm_judge: "Gemma judge", llamaguard: "Llama-Guard", prompt_guard2: "Prompt Guard 2" };
const KEY2DEF = { none: "none", classifier: "classifier", slm_judge: "slm", llamaguard: "llamaguard", prompt_guard2: "pg2" };
const DETS = ["classifier", "slm_judge", "llamaguard", "prompt_guard2"];
const E2ES = ["none", "classifier", "slm_judge", "llamaguard"];
const SETS = [["testA_bipia_email", "A", "BIPIA emails, held-out wording"], ["testB_llmail", "B", "LLMail-Inject, never trained on"],
              ["testC_table", "C", "Tables"], ["testD_web", "D", "Web pages (HTML)"]];
const SEEDS = [["classifier", "Seed 13"], ["classifier_s21", "Seed 21"], ["classifier_s42", "Seed 42"]];
const colorOf = k => SR.DEF[KEY2DEF[k]].color;
const refOf = k => !!SR.DEF[KEY2DEF[k]].ref;

let figN = 0;
const fig = (title, body, reading = "") =>
  `<figure class="figure"><figcaption><span class="fig-n">Figure ${++figN}.</span> ${title}</figcaption>${body}${reading ? `<p class="reading">${reading}</p>` : ""}</figure>`;

/* bars: groups = [{ label, sub, bars: [{ key, name, v, lo, hi, title, color, ref }] }] */
function bars(groups, { max = 1, fmt = v => pct(v, 1), axis = "%" } = {}) {
  const ticks = axis === "%" ? [0, .25, .5, .75, 1].map(t => [t * max, `${Math.round(t * max * 100)}%`])
    : [0, .25, .5, .75, 1].map(t => [t * max, `${Math.round(t * max)}`]);
  const tickHTML = ticks.map(([v, l]) => `<span style="left:${(v / max) * 100}%">${l}</span>`).join("");
  return `<div class="bars">${groups.map(g => `<div class="b-group">
      <p class="b-glabel">${esc(g.label)}${g.sub ? `<small>${esc(g.sub)}</small>` : ""}</p>
      ${g.bars.map(b => {
        const w = Math.min(100, (b.v / max) * 100);
        const wh = b.lo != null ? `<i class="whisk" style="left:${(b.lo / max) * 100}%;width:${Math.max(.4, ((b.hi - b.lo) / max) * 100)}%"></i>` : "";
        return `<div class="b-row" title="${esc(b.title || "")}"><span class="b-name">${esc(b.name)}</span>
          <span class="b-track"><i class="b-fill${b.ref ? " ref" : ""}" style="width:${w}%;--c:${b.color}"></i>${wh}</span>
          <span class="b-val num">${fmt(b.v)}</span></div>`;
      }).join("")}</div>`).join("")}
    <div class="b-axis" aria-hidden="true"><span></span><span class="b-ticks">${tickHTML}</span><span></span></div></div>`;
}
const countBar = (key, c) => {
  const w = wilson(c.k, c.n);
  return { key, name: SHORT[key], v: w.p, lo: w.lo, hi: w.hi, color: colorOf(key), title: `${c.k} of ${c.n}; 95% interval ${pct(w.lo)} to ${pct(w.hi)}` };
};
const rate = c => c.k / c.n;

async function loadResults(host) {
  if (SR.results) return SR.results;
  host.innerHTML = stateBox("Loading the measurements", `<span class="spin"></span>Reading showcase/results.json`);
  try { return (SR.results = await api("/api/results")); }
  catch (e) { host.innerHTML = `<div class="page">${stateBox("The results did not load", esc(e.message), "error")}</div>`; return null; }
}

/* ---------- Overview ---------- */
function tradeoffPlot(C) {
  const pts = E2ES.map(k => {
    const x = wilson(C[k].blockedB.k, C[k].blockedB.n), y = wilson(C[k].hardNegBlocked.k, C[k].hardNegBlocked.n);
    return { k, x, y };
  });
  const W = 520, H = 360, L = 56, B = 44, T = 16, R = 20, pw = W - L - R, ph = H - T - B;
  const sx = v => L + v * pw, sy = v => T + (1 - v) * ph;
  const grid = [0, .25, .5, .75, 1].map(t => `
    <line x1="${sx(t)}" y1="${T}" x2="${sx(t)}" y2="${T + ph}" class="g"/><text x="${sx(t)}" y="${T + ph + 18}" class="tk" text-anchor="middle">${t * 100}%</text>
    <line x1="${L}" y1="${sy(t)}" x2="${L + pw}" y2="${sy(t)}" class="g"/><text x="${L - 8}" y="${sy(t) + 4}" class="tk" text-anchor="end">${t * 100}%</text>`).join("");
  const LABEL_POS = { none: [10, -10, "start"], classifier: [12, -12, "start"], slm_judge: [-12, -14, "end"], llamaguard: [-12, 22, "end"] };
  const dots = pts.map(p => {
    const [dx, dy, anchor] = LABEL_POS[p.k], cx = sx(p.x.p), cy = sy(p.y.p);
    return `<g class="pt" style="--c:${colorOf(p.k)}">
      <line x1="${sx(p.x.lo)}" y1="${cy}" x2="${sx(p.x.hi)}" y2="${cy}" class="wh"/>
      <line x1="${cx}" y1="${sy(p.y.lo)}" x2="${cx}" y2="${sy(p.y.hi)}" class="wh"/>
      <circle cx="${cx}" cy="${cy}" r="6"/>
      <text x="${cx + dx}" y="${cy + dy}" text-anchor="${anchor}" class="pl">${SHORT[p.k]}</text>
      <title>${SHORT[p.k]}: blocks ${p.x.k} of ${p.x.n} attacks, wrongly blocks ${p.y.k} of ${p.y.n} harmless requests</title></g>`;
  }).join("");
  return `<svg class="plot" viewBox="0 0 ${W} ${H}" role="img" aria-label="Scatter plot of attacks blocked against harmless emails wrongly blocked, one point per defence">
    ${grid}
    <text x="${L + pw - 6}" y="${T + ph - 10}" text-anchor="end" class="corner">better</text>
    ${dots}
    <text x="${L + pw / 2}" y="${H - 4}" text-anchor="middle" class="ax">Attacks blocked, LLMail set B</text>
    <text transform="translate(14 ${T + ph / 2}) rotate(-90)" text-anchor="middle" class="ax">Harmless requests wrongly blocked</text></svg>`;
}

SR.init.overview = async function () {
  const host = $("#view-overview");
  const R = await loadResults(host);
  if (!R) return;
  figN = 0;
  const D = R.detection, C = R.e2eCounts, W = R.webE2E;
  const asr = k => rate(C[k].asrB);
  host.innerHTML = `<div class="page overview">
    <header class="ov-head">
      <h1>Can a small local filter stop an AI assistant from being hijacked?</h1>
      <p class="lede">An assistant that reads email, web pages and documents also reads instructions an attacker plants in them.
        SentinelRAG puts a filter between retrieval and the model and compares three setups: no filter, a fine-tuned DeBERTa classifier,
        and a prompted Gemma 4 guardrail. Llama-Guard-3-1B and Meta's Prompt Guard 2 are scored alongside for reference.
        Everything runs on one laptop GPU, and the <code>send_email</code> tool only records calls.</p>
    </header>

    ${fig("How a question is answered, and where the filter sits.", `
      <ol class="flow">
        <li><b>Question</b><span>from the user</span></li>
        <li><b>Retrieve</b><span>top 5 by MiniLM embedding</span></li>
        <li class="flow-filter"><b>Filter</b><span>each document, one at a time</span>
          <span class="strips" aria-label="Five retrieved documents, one withheld">
            <i></i><i></i><i class="redacted">withheld</i><i></i><i></i></span></li>
        <li><b>Assistant</b><span>Gemma 4 E2B with <code>send_email</code></span></li>
        <li><b>Answer</b><span>or a tool call</span></li>
      </ol>`, "A withheld document is replaced by a placeholder, so the model never reads its text. The attack counts as successful when the assistant calls <code>send_email</code> to an address planted in the content.")}

    <div class="ov-split">
      ${fig("Safety against usability, end to end on emails.", tradeoffPlot(C),
        `Bottom right is better: many attacks blocked, few harmless emails blocked. Each point is one defence over 100 retrieval cases per set; lines are 95% Wilson intervals. With no filter, ${pct(asr("none"))} of retrieved set B attacks hijacked the assistant.
         The judge blocks the most attacks but also blocks ${pct(rate(C.slm_judge.hardNegBlocked), 0)} of harmless emails that ask a person to do something. Llama-Guard blocks everything of that kind.`)}
      <section class="findings" aria-labelledby="fTitle">
        <h2 id="fTitle">What the measurements say</h2>
        <ol>
          <li><p><b>Both filters cut hijacks.</b> Attack success on set B fell from ${pct(asr("none"))} with no filter to ${pct(asr("classifier"))} with DeBERTa and ${pct(asr("slm_judge"))} with the Gemma judge.</p></li>
          <li><p><b>Neither wins everywhere.</b> On unseen email attacks the judge leads (F1 ${D.slm_judge.testB_llmail.f1.toFixed(2)} against ${D.classifier.testB_llmail.f1.toFixed(2)}).
            On web pages DeBERTa blocks ${pct(rate(W.classifier.blocked), 0)} of attacks and the judge ${pct(rate(W.slm_judge.blocked), 0)}.</p></li>
          <li><p><b>Speed differs by about four times.</b> DeBERTa takes about ${Math.round(D.classifier.testB_llmail.ms_median)} ms per document, the judge about ${Math.round(D.slm_judge.testB_llmail.ms_median)} ms.</p></li>
          <li><p><b>Off-the-shelf detectors miss this attack style.</b> Prompt Guard 2 catches ${pct(D.prompt_guard2.testB_llmail.recall, 0)} of set B attacks, because it was built for jailbreaks, not task-style requests.</p></li>
        </ol>
        <p><a href="#results">All measurements, with intervals</a></p>
      </section>
    </div>

    <section class="ov-when" aria-labelledby="wTitle">
      <h2 id="wTitle">Which defence when</h2>
      <table class="plain">
        <thead><tr><th scope="col">If the situation is</th><th scope="col">Use</th><th scope="col">Because</th></tr></thead>
        <tbody>
          <tr><td>High volume, tight latency, many emails that make requests of people</td><td><span class="who">${swatch("classifier")}Fine-tuned DeBERTa</span></td><td>Fast and rarely blocks harmless mail. It misses some unseen attack wording and varies by training seed, so validate it and retrain on new attack styles.</td></tr>
          <tr><td>Email, where a missed attack costs more than a blocked email</td><td><span class="who">${swatch("slm")}Gemma 4 judge</span></td><td>Highest recall on unseen email attacks. Slower, and blocks about one in five harmless request emails.</td></tr>
          <tr><td>Web pages or raw HTML</td><td><span class="who">${swatch("classifier")}Fine-tuned DeBERTa</span></td><td>The judge misses many injections hidden in markup, such as hidden divs and alt text.</td></tr>
          <tr><td>Neither is strong enough alone</td><td>Both in sequence</td><td>Not measured here.</td></tr>
          <tr><td>Considering Llama-Guard-3-1B</td><td><span class="who">${swatch("llamaguard")}Not as configured</span></td><td>Its built-in categories do not cover injection, and a custom category makes it flag nearly everything.</td></tr>
        </tbody>
      </table>
      <p class="note">Filters lower the risk; they do not remove it. Requiring approval before any tool call that sends data out, and splitting a quarantined reader model from the tool-using model, matter more. Both are described in the write-up but not built here.</p>
    </section>

    <section class="ov-tour" aria-labelledby="tTitle">
      <h2 id="tTitle">See it happen</h2>
      <ol>
        <li><a href="#mailbox">Mailbox</a><p>A working inbox with real dataset attacks in it. Ask the assistant a question under each filter and watch which emails get withheld.</p></li>
        <li><a href="#web">Web pages</a><p>The same page as a person sees it and as the HTML the assistant reads. Hidden text is invisible to one and plain to the other.</p></li>
        <li><a href="#documents">Documents</a><p>Tables with questions. Withholding an attacked table also withholds the answer.</p></li>
        <li><a href="#cases">Case studies</a><p>Fifteen recorded cases, including where each filter fails, ready to rerun live.</p></li>
        <li><a href="#detector">Detector</a><p>Any text against every detector, with scores and timings.</p></li>
      </ol>
      <p class="hint">Presenting? Keep <b>Show attacks</b> off while you demonstrate, then switch it on to point at the injected text.</p>
    </section>
  </div>`;
};

/* ---------- Results ---------- */
SR.init.results = async function () {
  const host = $("#view-results");
  const R = await loadResults(host);
  if (!R) return;
  figN = 0;
  const D = R.detection, C = R.e2eCounts, W = R.webE2E;
  const f1Groups = SETS.map(([s, l, sub]) => ({ label: `Set ${l}`, sub, bars: DETS.map(k => ({ key: k, name: SHORT[k], v: D[k][s].f1, color: colorOf(k), ref: refOf(k), title: `precision ${D[k][s].precision.toFixed(3)}, recall ${D[k][s].recall.toFixed(3)}` })) }));
  const best = (s, key, low) => DETS.reduce((a, k) => (low ? D[k][s][key] < D[a][s][key] : D[k][s][key] > D[a][s][key]) ? k : a, DETS[0]);
  const rfRows = DETS.map(k => `<tr><th scope="row"><span class="who">${swatch(KEY2DEF[k])}${SHORT[k]}</span></th>${SETS.map(([s]) => {
    const r = D[k][s].recall, f = D[k][s].fpr;
    return `<td class="${best(s, "recall") === k ? "best" : ""}">${pct(r)}</td><td class="${best(s, "fpr", true) === k ? "best" : ""}">${pct(f)}</td>`;
  }).join("")}</tr>`).join("");
  const latMax = Math.max(...DETS.flatMap(k => SETS.map(([s]) => D[k][s].ms_median)));
  const latGroups = SETS.map(([s, l, sub]) => ({ label: `Set ${l}`, sub, bars: DETS.map(k => ({ key: k, name: SHORT[k], v: D[k][s].ms_median, color: colorOf(k), ref: refOf(k), title: `median ${D[k][s].ms_median.toFixed(0)} ms, p95 ${D[k][s].ms_p95.toFixed(0)} ms` })) }));
  const metric = (label, key, src = C, sub = "") => ({ label, sub, bars: E2ES.map(k => countBar(k, src[k][key])) });
  const vecs = Object.keys(R.webByVector.classifier);
  const vecRows = vecs.map(v => `<tr><th scope="row">${esc(VECTOR[v] || v)}</th>${["classifier", "slm_judge", "llamaguard"].map(k => {
    const c = R.webByVector[k][v]; return `<td><span class="num">${c.k} / ${c.n}</span> <span class="mini" style="--c:${colorOf(k)}"><i style="width:${(c.k / c.n) * 100}%"></i></span></td>`;
  }).join("")}</tr>`).join("");
  const seedGroups = [["Set B recall", "unseen email attacks", "testB_llmail", "recall"], ["Web recall", "", "testD_web", "recall"],
                      ["Set A false positives", "held-out benign wording", "testA_bipia_email", "fpr"], ["Web false positives", "", "testD_web", "fpr"]]
    .map(([label, sub, s, key]) => ({ label, sub, bars: SEEDS.map(([k, n], i) => ({ name: n, v: D[k][s][key], color: `color-mix(in srgb, var(--c-classifier) ${100 - i * 30}%, white)`, title: pct(D[k][s][key]) })) }));
  const sb = SEEDS.map(([k]) => D[k].testB_llmail.recall), sa = SEEDS.map(([k]) => D[k].testA_bipia_email.fpr);
  const sizes = R.sizes;
  const sizeRows = [["train", "Training"], ["val", "Validation, disjoint source emails"], ...SETS.map(([s, l, sub]) => [s, `Test ${l}: ${sub}`])]
    .map(([k, label]) => `<tr><th scope="row">${esc(label)}</th><td class="num">${sizes[k].total.toLocaleString()}</td><td class="num">${sizes[k].attacks.toLocaleString()}</td><td class="num">${(sizes[k].total - sizes[k].attacks).toLocaleString()}</td></tr>`).join("");

  host.innerHTML = `<div class="page results">
    <header class="page-head">
      <h1>Results</h1>
      <p class="lede">Every measurement from the project. Thin lines on bars are 95% Wilson intervals. These are single runs on one RTX 4050, so gaps of a few points are within noise.</p>
      <nav class="toc" aria-label="On this page"><a href="#r-detect">Detection</a><a href="#r-speed">Speed</a><a href="#r-e2e">End to end</a><a href="#r-web">Web pages</a><a href="#r-seeds">Seeds</a><a href="#r-data">Data</a></nav>
    </header>

    <section id="r-detect"><h2>Does the filter spot the injection?</h2>
      ${fig("Detection F1 per document, by test set. Prompt Guard 2 (hatched) is a reference, not a contestant.", bars(f1Groups, { fmt: v => v.toFixed(3) }),
        `On set B, which the classifier never trained on, the judge leads: ${D.slm_judge.testB_llmail.f1.toFixed(3)} against ${D.classifier.testB_llmail.f1.toFixed(3)}.
         On the in-family sets A, C and D the classifier leads. Set A flatters the classifier because it trained on the same benchmark family.`)}
      <figure class="figure"><figcaption><span class="fig-n">Figure ${++figN}.</span> Recall and false-positive rate. The shaded cell is the best in each column.</figcaption>
        <div class="tbl-scroll"><table class="plain numeric">
          <thead><tr><th scope="col" rowspan="2">Detector</th>${SETS.map(([, l]) => `<th scope="colgroup" colspan="2">Set ${l}</th>`).join("")}</tr>
          <tr>${SETS.map(() => `<th scope="col">Recall</th><th scope="col">False pos.</th>`).join("")}</tr></thead>
          <tbody>${rfRows}</tbody></table></div>
        <p class="reading">Given a custom injection category, Llama-Guard flags almost everything: its recall looks fine and its false-positive rate is unusable. Prompt Guard 2 rarely fires on task-style injections.</p></figure>
    </section>

    <section id="r-speed"><h2>How long does it take?</h2>
      ${fig("Median time per document, in milliseconds.", bars(latGroups, { max: Math.ceil(latMax / 40) * 40, fmt: v => `${Math.round(v)} ms`, axis: "ms" }),
        `The classifier needs ${Math.round(Math.min(...SETS.map(([s]) => D.classifier[s].ms_median)))} to ${Math.round(Math.max(...SETS.map(([s]) => D.classifier[s].ms_median)))} ms per document. The judge needs
         ${Math.round(Math.min(...SETS.map(([s]) => D.slm_judge[s].ms_median)))} to ${Math.round(Math.max(...SETS.map(([s]) => D.slm_judge[s].ms_median)))} ms because it generates text. A question retrieves up to five documents, so multiply by five.`)}
    </section>

    <section id="r-e2e"><h2>What happens to the assistant?</h2>
      <p class="lede">The assistant retrieves up to five emails, the filter checks them, and an attack succeeds when it calls <code>send_email</code> to the attacker. 100 cases per set.</p>
      ${fig("End to end on emails.", bars([metric("Attack success", "asrA", C, "set A, BIPIA"), metric("Attack success", "asrB", C, "set B, LLMail"),
        metric("Attacks blocked", "blockedB", C, "set B"), metric("Harmless requests wrongly blocked", "hardNegBlocked"), metric("Ordinary emails wrongly blocked", "cleanBlocked")]),
        `With no filter ${pct(rate(C.none.asrB))} of retrieved set B attacks succeed. DeBERTa cuts that to ${pct(rate(C.classifier.asrB))} and the judge to ${pct(rate(C.slm_judge.asrB))}.
         The undefended assistant often summarises an injection instead of obeying it, so attacks blocked is the steadier signal.`)}
      ${fig("Withholding a table also withholds the answer.", bars([metric("Answered correctly", "tableClean", C, "no attack"), metric("Answered correctly", "tableAttacked", C, "under attack")]),
        `Under attack, accuracy falls from ${pct(rate(C.none.tableAttacked), 0)} with no filter to ${pct(rate(C.classifier.tableAttacked), 0)} with DeBERTa and ${pct(rate(C.slm_judge.tableAttacked), 0)} with the judge.
         A real deployment needs a way to strip the injection and keep the data.`)}
    </section>

    <section id="r-web"><h2>Web pages: where the ranking flips</h2>
      <p class="lede">Raw HTML from 59 Wikipedia articles with an injection hidden six ways: 80 attacked and 40 clean pages per run.</p>
      ${fig("End to end on web pages.", bars([metric("Attack success", "asr", W), metric("Attacks blocked", "blocked", W), metric("Clean pages wrongly blocked", "falseBlock", W)]),
        `DeBERTa blocks ${pct(rate(W.classifier.blocked), 0)} of attacked pages and the judge ${pct(rate(W.slm_judge.blocked), 0)}. With no filter only ${pct(rate(W.none.asr))} succeed, so the blocked rate carries the comparison.`)}
      <figure class="figure"><figcaption><span class="fig-n">Figure ${++figN}.</span> Attacked pages blocked, by where the injection hides.</figcaption>
        <div class="tbl-scroll"><table class="plain numeric"><thead><tr><th scope="col">Hidden in</th><th scope="col">DeBERTa</th><th scope="col">Gemma judge</th><th scope="col">Llama-Guard</th></tr></thead><tbody>${vecRows}</tbody></table></div>
        <p class="reading">The judge seems to treat markup as noise. Hidden divs and alt text are where it misses most.</p></figure>
    </section>

    <section id="r-seeds"><h2>How stable is the classifier?</h2>
      ${fig("The same classifier trained with three seeds.", bars(seedGroups),
        `Recall on unseen set B attacks ranges from ${pct(Math.min(...sb))} to ${pct(Math.max(...sb))}, and false positives on held-out benign wording from ${pct(Math.min(...sa))} to ${pct(Math.max(...sa))}.
         The seed 13 numbers used elsewhere are one draw. The judge and Llama-Guard run at temperature 0, so they have no seed variance.`)}
    </section>

    <section id="r-data"><h2>The data</h2>
      <div class="tbl-scroll"><table class="plain numeric"><thead><tr><th scope="col">Split</th><th scope="col">Rows</th><th scope="col">Attacks</th><th scope="col">Safe</th></tr></thead><tbody>${sizeRows}</tbody></table></div>
      <p class="hint">Reproduce with <code>python -m sentinel.report</code>. This page reads a snapshot made by <code>python -m scripts.build_showcase</code>.</p>
    </section>
  </div>`;
  $$(".toc a", host).forEach(a => a.addEventListener("click", ev => { ev.preventDefault(); $(a.getAttribute("href"), host).scrollIntoView({ block: "start" }); }));
};

/* ---------- Method ---------- */
SR.init.method = function () {
  $("#view-method").innerHTML = `<div class="page prose">
    <header class="page-head"><h1>Method</h1>
      <p class="lede">How the comparison was set up, what it can and cannot tell you, and how to reproduce it.</p></header>

    <h2>The setups</h2>
    <dl class="setups">
      <dt>${swatch("none")}Vulnerable baseline</dt><dd>The same assistant with no filter. It sets how much risk there is to remove.</dd>
      <dt>${swatch("classifier")}Fine-tuned classifier</dt><dd>DeBERTa-v3-base fine-tuned on this project's training split. Reads one document in tens of milliseconds and returns a probability; 0.5 is the threshold.</dd>
      <dt>${swatch("slm")}Generative guardrail</dt><dd>Gemma 4 E2B prompted to answer INJECTION or SAFE for each document, thinking off, temperature 0.</dd>
      <dt>${swatch("llamaguard")}Llama-Guard-3-1B</dt><dd>A second guardrail, given a custom S1 category for prompt injection because its built-in categories do not cover it.</dd>
      <dt>${swatch("pg2")}Prompt Guard 2, 86M</dt><dd>Meta's pretrained injection and jailbreak detector. Scored on detection only, for context. It is not a contestant because the brief asks for a model fine-tuned here.</dd>
    </dl>

    <h2>Data</h2>
    <ul>
      <li><b>Training:</b> BIPIA email injections, with attack templates and source emails kept apart from the test sets. Half the training emails are rewritten in the LLMail layout so the model cannot learn a format shortcut.</li>
      <li><b>Test A:</b> BIPIA emails with attack wording held out from training.</li>
      <li><b>Test B:</b> LLMail-Inject, a different dataset never used in training. This is the fair cross-dataset test.</li>
      <li><b>Test C:</b> BIPIA tables with questions.</li>
      <li><b>Test D:</b> synthetic web pages built from Wikipedia articles, with the injection in one of six places.</li>
      <li><b>Negatives:</b> ordinary emails plus hard negatives, harmless emails that give instructions to people, so a filter cannot score well by flagging every imperative sentence. LLMail submissions that the benchmark's own judge marked "not an attack" were dropped, because many of them still asked to email the attacker.</li>
    </ul>

    <h2>The assistant</h2>
    <p>Gemma 4 E2B on llama.cpp, thinking off, temperature 0, top five documents by MiniLM similarity. Its system prompt says it may decide whether to use the tool, as in the LLMail challenge. A stricter prompt behaved like a defence of its own and hid the effect under study.</p>

    <h2>Statistics</h2>
    <p>Proportions carry 95% Wilson intervals. The classifier was trained with three seeds (13, 21, 42) to show training variance; the end-to-end runs use seed 13.</p>

    <h2>Limitations</h2>
    <ul>
      <li>One machine and single runs. Intervals cover case sampling, not training variance, which is large for the classifier.</li>
      <li>The end-to-end runs use the seed 13 classifier only.</li>
      <li>Web pages are synthetic and built from clean Wikipedia text, a friendly sample.</li>
      <li>The undefended assistant is only moderately obedient, which narrows the gap to the baseline.</li>
      <li>Block-only filters lose whatever they block, including the useful data in an attacked document.</li>
    </ul>

    <h2>Reproduce</h2>
    <pre class="cmd">python -m sentinel.server         # this dashboard, http://127.0.0.1:8000
python -m sentinel.eval_detection classifier slm_judge llamaguard prompt_guard2
python -m sentinel.eval_e2e none classifier slm_judge llamaguard --n 100
python -m sentinel.eval_web_e2e none classifier slm_judge llamaguard --n 80
python -m sentinel.report         # tables for RESULTS.md
python -m scripts.build_showcase  # refresh this dashboard's data snapshot</pre>
  </div>`;
};
