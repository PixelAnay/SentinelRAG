/* =========================================================
   Results and Project tabs. Every number comes from showcase/results.json.
========================================================= */
"use strict";

const DET = {
  classifier:    { name: "Fine-tuned DeBERTa",   color: "var(--c-classifier)" },
  slm_judge:     { name: "Gemma 4 judge",        color: "var(--c-slm)" },
  llamaguard:    { name: "Llama-Guard-3-1B",     color: "var(--c-llamaguard)" },
  prompt_guard2: { name: "Prompt Guard 2 (reference)", color: "var(--c-pg2)" }
};
const E2E = {
  none:       { name: "No defence",         color: "var(--c-none)" },
  classifier: DET.classifier, slm_judge: DET.slm_judge, llamaguard: DET.llamaguard
};
const SETS = [
  ["testA_bipia_email", "A: BIPIA emails (held-out wording)"],
  ["testB_llmail", "B: LLMail-Inject (never trained on)"],
  ["testC_table", "C: tables"],
  ["testD_web", "D: web pages (HTML)"]
];
const SEEDS = [["classifier", "Seed 13", "#0b57d0"], ["classifier_s21", "Seed 21", "#5b8def"], ["classifier_s42", "Seed 42", "#9bb9f5"]];

const legend = series => `<div class="legend">${series.map(s => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join("")}</div>`;

function bar(b, max, fmt) {
  const w = Math.min(100, (b.v / max) * 100);
  const wh = b.lo != null ? `<i class="whisk" style="left:${(b.lo / max) * 100}%;width:${Math.max(0.6, ((b.hi - b.lo) / max) * 100)}%"></i>` : "";
  return `<div class="bar" title="${esc(b.title || "")}"><div class="track"><div class="fill" style="width:${w}%;--c:${b.color}"></div>${wh}</div><div class="val">${fmt(b.v)}</div></div>`;
}
function chart(groups, { max = 1, fmt = v => pct(v, 1) } = {}) {
  return `<div class="chart">${groups.map(g => `<div class="cgroup"><div class="lbl">${esc(g.label)}</div><div>${g.bars.map(b => bar(b, max, fmt)).join("")}</div></div>`).join("")}</div>`;
}
const cnt = (c, color, title) => { const w = wilson(c.k, c.n); return { v: w ? w.p : 0, lo: w && w.lo, hi: w && w.hi, color, title: `${c.k} of ${c.n}. 95% interval ${pct(w.lo)} to ${pct(w.hi)}` }; };
const heat = (v, goodHigh = true) => { const g = goodHigh ? v : 1 - v; return `background:hsl(${Math.round(g * 118)},62%,${88 - Math.round(g * 6)}%)`; };

SR.init.results = async function () {
  const host = $("#resultsMain");
  host.innerHTML = `<h1>Results</h1><p class="lead"><span class="spin"></span>Loading…</p>`;
  let R;
  try { R = SR.results = await api("/api/results"); }
  catch (e) { host.innerHTML = `<h1>Results</h1><div class="takeaway warn">${esc(e.message)}</div>`; return; }
  const D = R.detection, C = R.e2eCounts, W = R.webE2E;
  const f1 = (n, s) => D[n][s].f1, rec = (n, s) => D[n][s].recall, fpr = (n, s) => D[n][s].fpr;
  const detSeries = Object.values(DET);
  const e2eSeries = Object.values(E2E);

  /* headline cards */
  const asrB = wilson(C.none.asrB.k, C.none.asrB.n);
  const cards = `<div class="cards">
    <div class="card" style="--c:var(--c-none)"><b>Undefended assistant</b><div class="stat">${pct(asrB.p)}</div>
      <p>of retrieved LLMail attacks (set B) made the assistant email the attacker (${asrB.k} of ${asrB.n}).</p></div>
    <div class="card" style="--c:var(--c-classifier)"><b>Fine-tuned DeBERTa</b><div class="stat">${pct(C.classifier.asrB.k / C.classifier.asrB.n)}</div>
      <p>attack success. It blocks ${pct(C.classifier.blockedB.k / C.classifier.blockedB.n)} of set B attacks in about ${Math.round(D.classifier.testB_llmail.ms_median)} ms per document.</p></div>
    <div class="card" style="--c:var(--c-slm)"><b>Gemma 4 judge</b><div class="stat">${pct(C.slm_judge.asrB.k / C.slm_judge.asrB.n)}</div>
      <p>attack success. It blocks ${pct(C.slm_judge.blockedB.k / C.slm_judge.blockedB.n)}, at about ${Math.round(D.slm_judge.testB_llmail.ms_median)} ms per document.</p></div>
    <div class="card" style="--c:var(--c-pg2)"><b>Prompt Guard 2 (reference)</b><div class="stat">${pct(rec("prompt_guard2", "testB_llmail"), 0)}</div>
      <p>recall on set B. It targets jailbreaks, not task-style email injections.</p></div></div>`;

  /* detection F1 */
  const f1Groups = SETS.map(([s, label]) => ({ label, bars: Object.keys(DET).map(n => ({ v: f1(n, s), color: DET[n].color, title: `${DET[n].name}: F1 ${f1(n, s).toFixed(3)}` })) }));

  /* recall / FPR heat table */
  const heatRows = Object.keys(DET).map(n => `<tr><td><b>${esc(DET[n].name)}</b></td>` + SETS.map(([s]) =>
    `<td style="${heat(rec(n, s))}">${pct(rec(n, s))}</td><td style="${heat(fpr(n, s), false)}">${pct(fpr(n, s))}</td>`).join("") + `</tr>`).join("");

  /* latency */
  const latGroups = SETS.map(([s, label]) => ({ label, bars: Object.keys(DET).map(n => ({ v: D[n][s].ms_median, color: DET[n].color, title: `median ${D[n][s].ms_median.toFixed(0)} ms, p95 ${D[n][s].ms_p95.toFixed(0)} ms` })) }));
  const latMax = Math.max(...latGroups.flatMap(g => g.bars.map(b => b.v)));

  /* end to end */
  const e2eMetric = (label, key) => ({ label, bars: Object.keys(E2E).map(m => cnt(C[m][key], E2E[m].color)) });
  const e2eGroups = [
    e2eMetric("Attack success, set A (BIPIA)", "asrA"), e2eMetric("Attack success, set B (LLMail)", "asrB"),
    e2eMetric("Attacks blocked, set B", "blockedB"), e2eMetric("Harmless instruction-like emails wrongly blocked", "hardNegBlocked"),
    e2eMetric("Ordinary emails wrongly blocked", "cleanBlocked")
  ];
  const tableGroups = [e2eMetric("Table answered correctly, no attack", "tableClean"), e2eMetric("Table answered correctly, under attack", "tableAttacked")];

  /* web */
  const webMetric = (label, key) => ({ label, bars: Object.keys(E2E).map(m => cnt(W[m][key], E2E[m].color)) });
  const webGroups = [webMetric("Attack success", "asr"), webMetric("Attacks blocked", "blocked"), webMetric("Clean pages wrongly blocked", "falseBlock")];
  const vecs = Object.keys(R.webByVector.classifier);
  const vecRows = vecs.map(v => `<tr><td><b>${esc(VECTOR_NOTES[v] || v)}</b></td>` + ["classifier", "slm_judge", "llamaguard"].map(m => {
    const c = R.webByVector[m][v], p = c.k / c.n; return `<td style="${heat(p)}">${c.k} / ${c.n}</td>`;
  }).join("") + `</tr>`).join("");

  /* seeds */
  const seedBars = (label, s, key) => ({ label, bars: SEEDS.map(([n, nm, col]) => ({ v: D[n][s][key], color: col, title: `${nm}: ${pct(D[n][s][key])}` })) });
  const seedGroups = [
    seedBars("Set B recall (unseen email attacks)", "testB_llmail", "recall"), seedBars("Web recall", "testD_web", "recall"),
    seedBars("Set A false-positive rate", "testA_bipia_email", "fpr"), seedBars("Web false-positive rate", "testD_web", "fpr")
  ];
  const sb = SEEDS.map(([n]) => D[n].testB_llmail.recall);

  const sizes = R.sizes;
  const sizeRows = [["train", "Training"], ["val", "Validation (disjoint source emails)"], ...SETS].map(([k, label]) =>
    `<tr><td>${esc(label)}</td><td>${sizes[k].total.toLocaleString()}</td><td>${sizes[k].attacks.toLocaleString()}</td><td>${(sizes[k].total - sizes[k].attacks).toLocaleString()}</td></tr>`).join("");

  host.innerHTML = `
    <h1>Results</h1>
    <p class="lead">Everything measured in this project. Bars with a grey span show a 95% Wilson interval. These are single runs on one RTX 4050, so differences of a few points are within noise.</p>
    ${cards}

    <h2>1. Does it spot the injection? Detection F1 per document</h2>
    ${legend(detSeries)}${chart(f1Groups, { fmt: v => v.toFixed(3) })}
    <div class="takeaway">On <b>set B</b>, the one the classifier never trained on, the judge leads: F1 ${f1("slm_judge", "testB_llmail").toFixed(3)} against ${f1("classifier", "testB_llmail").toFixed(3)}.
    On the in-family sets A, C and D the fine-tuned classifier leads (${f1("classifier", "testA_bipia_email").toFixed(3)}, ${f1("classifier", "testC_table").toFixed(3)}, ${f1("classifier", "testD_web").toFixed(3)}).
    Set A is optimistic for the classifier because it trained on the same benchmark family.</div>

    <h3>Recall and false-positive rate, side by side</h3>
    <table class="heat"><thead><tr><th rowspan="2">Detector</th>${SETS.map(([, l]) => `<th colspan="2">${esc(l.split(":")[0])}: ${esc(l.split(": ")[1])}</th>`).join("")}</tr>
    <tr>${SETS.map(() => "<th>Recall</th><th>False pos.</th>").join("")}</tr></thead><tbody>${heatRows}</tbody></table>
    <div class="takeaway warn">Llama-Guard flags almost everything once given a custom injection category, so its recall looks fine while its false-positive rate is not usable. Prompt Guard 2 almost never fires on these task-style injections.</div>

    <h2>2. How fast? Median time per document</h2>
    ${legend(detSeries)}${chart(latGroups, { max: latMax * 1.05, fmt: v => `${Math.round(v)} ms` })}
    <div class="takeaway">The classifier takes ${Math.round(D.classifier.testB_llmail.ms_median)}-${Math.round(Math.max(...SETS.map(([s]) => D.classifier[s].ms_median)))} ms per document. The judge takes ${Math.round(Math.min(...SETS.map(([s]) => D.slm_judge[s].ms_median)))}-${Math.round(Math.max(...SETS.map(([s]) => D.slm_judge[s].ms_median)))} ms because it generates text. Per query, multiply by up to five retrieved documents.</div>

    <h2>3. What happens to the assistant? End to end on emails</h2>
    <p>The assistant (Gemma 4 E2B) retrieves up to five emails, the defence filters them, and success means it called <code>send_email</code> to the attacker. n = 100 cases per set.</p>
    ${legend(e2eSeries)}${chart(e2eGroups)}
    <div class="takeaway">Undefended, ${pct(asrB.p)} of retrieved set B attacks succeed. The classifier cuts that to ${pct(C.classifier.asrB.k / C.classifier.asrB.n)} and the judge to ${pct(C.slm_judge.asrB.k / C.slm_judge.asrB.n)}.
    The price is usability: the judge wrongly blocks ${pct(C.slm_judge.hardNegBlocked.k / C.slm_judge.hardNegBlocked.n, 0)} of harmless emails that give instructions to people, the classifier ${pct(C.classifier.hardNegBlocked.k / C.classifier.hardNegBlocked.n, 0)}, Llama-Guard ${pct(C.llamaguard.hardNegBlocked.k / C.llamaguard.hardNegBlocked.n, 0)}.</div>
    <div class="takeaway warn">The undefended baseline is only moderately vulnerable (Gemma often summarises an injection instead of obeying it), so "attacks blocked" is the steadier signal.</div>

    <h3>The cost of withholding a document: tables</h3>
    ${legend(e2eSeries)}${chart(tableGroups)}
    <div class="takeaway">Withholding an attacked table also withholds the data needed to answer. Accuracy under attack falls from ${pct(C.none.tableAttacked.k / C.none.tableAttacked.n, 0)} (undefended) to ${pct(C.classifier.tableAttacked.k / C.classifier.tableAttacked.n, 0)} (classifier) and ${pct(C.slm_judge.tableAttacked.k / C.slm_judge.tableAttacked.n, 0)} (judge). A real deployment needs a sanitise-and-continue path.</div>

    <h2>4. Web pages: where the ranking flips</h2>
    <p>Raw HTML from 59 Wikipedia articles with an injection hidden six ways. 80 attacked and 40 clean pages per run.</p>
    ${legend(e2eSeries)}${chart(webGroups)}
    <h3>Attacks blocked, by where the injection hides</h3>
    <table class="heat"><thead><tr><th>Hiding place</th><th>DeBERTa</th><th>Gemma judge</th><th>Llama-Guard</th></tr></thead><tbody>${vecRows}</tbody></table>
    <div class="takeaway">The classifier blocks ${pct(W.classifier.blocked.k / W.classifier.blocked.n, 0)} of attacked pages, the judge ${pct(W.slm_judge.blocked.k / W.slm_judge.blocked.n, 0)}. The judge seems to treat markup as noise, and hidden divs and alt text are where it fails most.
    Undefended ASR is only ${pct(W.none.asr.k / W.none.asr.n)}, so use the blocked rate.</div>

    <h2>5. How stable is the classifier? Three training seeds</h2>
    <div class="legend">${SEEDS.map(([, n, c]) => `<span><i style="background:${c}"></i>${n}</span>`).join("")}</div>${chart(seedGroups)}
    <div class="takeaway warn">Training variance is large. Recall on unseen LLMail attacks ranges from ${pct(Math.min(...sb))} to ${pct(Math.max(...sb))}, and the false-positive rate on held-out benign wording from ${pct(Math.min(...SEEDS.map(([n]) => fpr(n, "testA_bipia_email"))))} to ${pct(Math.max(...SEEDS.map(([n]) => fpr(n, "testA_bipia_email"))))}.
    The seed 13 numbers elsewhere in this dashboard are one draw. The judge and Llama-Guard run at temperature 0, so they have no seed variance.</div>

    <h2>6. The data</h2>
    <table class="tbl-plain"><thead><tr><th>Set</th><th>Rows</th><th>Attacks</th><th>Safe</th></tr></thead><tbody>${sizeRows}</tbody></table>
    <p class="hint">Reproduce everything with <code>python -m sentinel.report</code>. This page reads a snapshot taken with <code>python -m scripts.build_showcase</code>.</p>`;
};

/* =============== Project =============== */
SR.init.project = async function () {
  await SR.ready;
  const host = $("#projectMain");
  host.innerHTML = `
    <h1>SentinelRAG</h1>
    <p class="lead">A comparison of defences against indirect prompt injection for an email assistant that retrieves content and can call a <code>send_email</code> tool.</p>

    <h2>The problem</h2>
    <p>An assistant that reads emails, web pages and documents also reads instructions an attacker has planted in them. If the model obeys, it can leak data through its tools. This project asks which cheap, local defence stops that best, what it costs in speed, and what it breaks for normal use. Nothing is ever really sent: <code>send_email</code> only records the call.</p>

    <h2>How a query flows</h2>
    <div class="flow">
      <div>User question</div><span>→</span><div>Retrieve top 5<small>MiniLM embeddings</small></div><span>→</span>
      <div class="hot">Defence filter<small>per retrieved document</small></div><span>→</span>
      <div>Assistant<small>Gemma 4 E2B + <code>send_email</code></small></div><span>→</span><div>Answer or tool call</div>
    </div>
    <p>A blocked document is replaced by a placeholder, so the model never reads it.</p>

    <h2>The three setups compared</h2>
    <div class="cards">
      <div class="card" style="--c:var(--c-none)"><b>1. Vulnerable baseline</b><p>The same assistant with no filter. It sets how much risk exists.</p></div>
      <div class="card" style="--c:var(--c-classifier)"><b>2. Fine-tuned classifier</b><p>DeBERTa-v3-base, fine-tuned on your data. Reads a document in roughly 26 to 45 ms and answers with a probability.</p></div>
      <div class="card" style="--c:var(--c-slm)"><b>3. Generative guardrail</b><p>A prompted Gemma 4 E2B judge that answers INJECTION or SAFE. A second option, Llama-Guard-3-1B with a custom category, is reported too.</p></div>
      <div class="card" style="--c:var(--c-pg2)"><b>Reference: Prompt Guard 2</b><p>Meta's pretrained 86M detector, scored for context only. It is not a contestant because "fine-tuned" means your own model.</p></div>
    </div>

    <h2>Tabs in this dashboard</h2>
    <table class="tbl-plain"><tbody>
      <tr><td><b>Mail assistant</b></td><td>A working email client with about 20 emails, including real attacks. Ask the assistant a question under any defence, then see which emails were withheld and any tool call it attempted (shown in Sent).</td></tr>
      <tr><td><b>Web pages</b></td><td>The same page rendered as a person sees it and as raw HTML the assistant reads. Shows why hidden text works.</td></tr>
      <tr><td><b>Documents</b></td><td>Tables with questions, some carrying an injection, to show the accuracy cost of blocking.</td></tr>
      <tr><td><b>Showcase</b></td><td>A scripted tour of real cases, each run live through all four setups next to what happened in the evaluation.</td></tr>
      <tr><td><b>Detector</b></td><td>Paste text or load a test-set row and see every detector's verdict, score and time.</td></tr>
      <tr><td><b>Results</b></td><td>All measurements with confidence intervals.</td></tr>
    </tbody></table>
    <p>The <b>Reveal attacks</b> button in the top bar marks which items hold an injection. Leave it off while demonstrating, then switch it on to explain.</p>

    <h2>Method</h2>
    <ul class="plain">
      <li><b>Training data:</b> BIPIA email injections with attack templates and source emails kept disjoint from the test sets. Half the training emails are re-rendered in the LLMail layout so the model cannot learn a format shortcut.</li>
      <li><b>Test A:</b> BIPIA emails with held-out attack wording. <b>Test B:</b> LLMail-Inject, a different dataset never used in training, so it is the fair cross-dataset test. <b>Test C:</b> tables. <b>Test D:</b> web pages, synthetic, made from Wikipedia articles with six hiding places.</li>
      <li><b>Negatives:</b> ordinary emails plus <i>hard negatives</i>, harmless emails that give instructions to people, so a filter cannot win by flagging every imperative sentence. LLMail submissions that the benchmark's own judge labelled "not an attack" were excluded because many still asked to email the attacker.</li>
      <li><b>Assistant:</b> Gemma 4 E2B on llama.cpp with thinking off, temperature 0, top five documents. The system prompt lets it decide whether to use the tool, as in the LLMail challenge. A stricter prompt acted as a defence and hid the effect being studied.</li>
      <li><b>Statistics:</b> 95% Wilson intervals, and three training seeds for the classifier.</li>
    </ul>

    <h2>Which defence when</h2>
    <table class="tbl-plain"><thead><tr><th>Situation</th><th>Pick</th><th>Why</th></tr></thead><tbody>
      <tr><td>High volume, strict latency, many harmless emails with requests</td><td>Fine-tuned DeBERTa</td><td>About 26 to 45 ms per document, few false blocks. Misses some unseen attack wording and varies by training seed, so validate the threshold and retrain on new attack styles.</td></tr>
      <tr><td>Attacks are the bigger worry in email, some false blocks are acceptable</td><td>Prompted Gemma judge</td><td>Highest recall on unseen email attacks. About four times slower, and blocks roughly one in five harmless instruction-like emails.</td></tr>
      <tr><td>Content is web pages or raw HTML</td><td>Fine-tuned DeBERTa</td><td>The judge misses many injections hidden in markup.</td></tr>
      <tr><td>Neither is strong enough alone</td><td>Run both in sequence</td><td>Not measured here.</td></tr>
      <tr><td>Llama-Guard-3-1B</td><td>Not as configured</td><td>Its built-in categories do not cover injection, and a custom category flags almost everything.</td></tr>
    </tbody></table>
    <div class="takeaway warn">Filters lower risk and never remove it. Structural controls matter more: require approval before any tool call that sends data out, and split a quarantined reader model from a privileged tool-using model. Those two are described but not built or tested here.</div>

    <h2>Limitations</h2>
    <ul class="plain">
      <li>One machine, single runs. Intervals cover case sampling, not training variance, which is large for the classifier.</li>
      <li>The end-to-end runs use the seed 13 classifier only.</li>
      <li>Web pages are synthetic and use clean Wikipedia text, a friendly sample.</li>
      <li>The undefended assistant is only moderately obedient, which narrows the baseline gap.</li>
      <li>Block-only defences lose the data they block.</li>
    </ul>

    <h2>Run it yourself</h2>
    <pre class="cmd">python -m sentinel.server          # this dashboard, http://127.0.0.1:8000
python -m sentinel.eval_detection classifier slm_judge llamaguard prompt_guard2
python -m sentinel.eval_e2e none classifier slm_judge llamaguard --n 100
python -m sentinel.eval_web_e2e none classifier slm_judge llamaguard --n 80
python -m sentinel.report          # tables for RESULTS.md
python -m scripts.build_showcase   # refresh the dashboard's data snapshot</pre>`;
};
