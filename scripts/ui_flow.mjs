// Headless Chrome click-through of the live paths: a mailbox question, a case-study run,
// a web-page run and a detector scan. Needs the server running. Screenshots go to runs/shots/.
// Usage: node scripts/ui_flow.mjs [width]
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const W = +(process.argv[2] || 1440), H = 900, port = 9334;
mkdirSync("runs/shots", { recursive: true });
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${port}`, "--disable-gpu",
  "--user-data-dir=" + process.env.TEMP + "/sr-ui-flow", "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let target;
for (let i = 0; i < 40 && !target; i++) { await sleep(250); try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === "page"); } catch { } }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener("open", r));
let id = 0; const pending = new Map(); const errors = [];
ws.addEventListener("message", ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
  if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errors.push(m.params.args.map(a => a.value ?? a.description).join(" "));
});
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async e => (await send("Runtime.evaluate", { expression: e, returnByValue: true, awaitPromise: true })).result.value;
const waitFor = async (cond, ms = 240000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await js(cond)) return true; await sleep(500); } return false; };
const shot = async name => {
  const h = Math.min(await js("document.documentElement.scrollHeight"), 5000);
  const s = h <= H ? await send("Page.captureScreenshot", { format: "png" })
    : await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width: W, height: h, scale: 1 } });
  writeFileSync(`runs/shots/${name}.png`, Buffer.from(s.data, "base64"));
};
await send("Runtime.enable"); await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: W < 700 });
await send("Page.navigate", { url: "http://127.0.0.1:8000/#mailbox" });
await sleep(2500);
const log = [];

// 1. Mailbox: reveal on, open the Rothschild email, ask with no filter, then with DeBERTa.
await js(`document.getElementById("revealBtn").click()`);
log.push(["reveal switch", await js(`document.body.classList.contains("reveal") && document.getElementById("revealBtn").getAttribute("aria-pressed")`)]);
await js(`[...document.querySelectorAll(".mail-item")].find(b => b.textContent.includes("Rothschild")).click()`);
log.push(["open email", await js(`document.querySelector(".rd-subj")?.textContent`)]);
await js(`document.getElementById("askAbout").click()`);
log.push(["ask about this email", await js(`document.getElementById("chatInput").value`)]);
await js(`document.getElementById("chatForm").requestSubmit()`);
await waitFor(`document.querySelectorAll(".as-turn").length >= 1`);
log.push(["no filter answer", await js(`document.querySelector(".as-turn:last-of-type .callout")?.textContent.trim().slice(0, 90) || "no callout"`)]);
await js(`document.querySelector('input[name=defense][value=classifier]').click()`);
await js(`document.getElementById("askAbout").click(); document.getElementById("chatForm").requestSubmit()`);
await waitFor(`document.querySelectorAll(".as-turn").length >= 2`);
log.push(["DeBERTa answer", await js(`[...document.querySelectorAll(".as-turn")].pop().querySelector(".tag.redact") ? "withheld tag shown" : "no withheld tag"`)]);
log.push(["reader banner", await js(`document.querySelector(".redaction")?.textContent.slice(0, 60) || "none"`)]);
log.push(["chat log scrolled to latest", await js(`(l => l.scrollHeight - l.scrollTop - l.clientHeight < 4)(document.getElementById("chatLog"))`)]);
await shot(`flow-mailbox-${W}`);
await js(`document.querySelector('.folders [data-folder=sent]').click()`);
log.push(["sent folder items", await js(`document.querySelectorAll(".mail-item").length`)]);
await js(`document.querySelector(".mail-item")?.click()`);
await shot(`flow-sent-${W}`);

// 2. Case study 1: run all four live.
await js(`location.hash = "#cases"`); await sleep(1200);
await js(`document.getElementById("caseRun").click()`);
await waitFor(`!document.getElementById("caseRun").disabled && document.querySelectorAll(".o-row .o-asst p").length >= 4`);
log.push(["case run", await js(`[...document.querySelectorAll("#caseOut .o-rec")].map(e => e.textContent.trim()).join(" | ")`)]);
await js(`document.querySelector(".doc summary").click()`);
await shot(`flow-case-${W}`);
await js(`document.getElementById("caseNext").click()`);
log.push(["next case", await js(`document.querySelector(".doc-head h2").textContent`)]);

// 3. Web page 2: run one defence.
await js(`location.hash = "#web"`); await sleep(1200);
await js(`document.querySelectorAll(".pk-item")[1].click()`); await sleep(300);
await js(`document.querySelector('[data-act=one]').click()`);
await waitFor(`!document.querySelector('[data-act=one]').disabled && !document.querySelector(".is-pending")`);
log.push(["web run", await js(`document.querySelector(".o-row:not(.o-headrow):nth-child(3) .o-filter")?.textContent.trim()`)]);
await shot(`flow-web-${W}`);

// 4. Detector: preset + scan.
await js(`location.hash = "#detector"`); await sleep(1000);
await js(`document.querySelector("[data-p='1']").click(); document.getElementById("detScan").click()`);
await waitFor(`document.querySelectorAll(".meters li").length >= 4`);
log.push(["detector", await js(`[...document.querySelectorAll(".meters li")].map(l => l.querySelector("b").textContent + ": " + l.querySelector(".m-verdict")?.textContent).join(", ")`)]);
await js(`document.getElementById("detLoad").click()`); await sleep(1500);
log.push(["load row", await js(`document.getElementById("detTruth").textContent`)]);
await shot(`flow-detector-${W}`);

// 5. Write-your-own dialog opens and closes with Escape.
await js(`location.hash = "#mailbox"`); await sleep(500);
await js(`document.getElementById("writeBtn").click()`);
log.push(["dialog open", await js(`document.getElementById("writeDialog").open`)]);
await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
await sleep(300);
log.push(["dialog closed by Escape", await js(`!document.getElementById("writeDialog").open`)]);

log.forEach(([k, v]) => console.log(`${k}: ${v}`));
console.log("console errors:", errors.length ? errors : "none");
ws.close(); chrome.kill(); process.exit(0);
