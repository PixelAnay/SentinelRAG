// Headless Chrome check of every dashboard view: console errors, horizontal overflow, screenshots.
// Usage: node scripts/ui_check.mjs [width] [height] [view,view,...] [--reveal]
// Needs the server running (python -m sentinel.server). Screenshots go to runs/shots/.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const [w = "1440", h = "900", only = ""] = process.argv.slice(2).filter(a => !a.startsWith("--"));
const reveal = process.argv.includes("--reveal");
const views = only ? only.split(",") : ["overview", "mailbox", "web", "documents", "cases", "detector", "results", "method"];
mkdirSync("runs/shots", { recursive: true });

const port = 9333;
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${port}`, "--disable-gpu", `--window-size=${w},${h}`,
  "--user-data-dir=" + process.env.TEMP + "/sr-ui-check", "about:blank"], { stdio: "ignore" });
const sleep = ms => new Promise(r => setTimeout(r, ms));

let target;
for (let i = 0; i < 40 && !target; i++) {
  await sleep(250);
  try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === "page"); } catch { /* not up yet */ }
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener("open", r));
let id = 0;
const pending = new Map();
const errors = [];
ws.addEventListener("message", ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); }
  if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errors.push(m.params.args.map(a => a.value ?? a.description).join(" "));
  if (m.method === "Log.entryAdded" && m.params.entry.level === "error") errors.push(m.params.entry.text + " " + (m.params.entry.url || ""));
});
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJS = async expr => (await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result.value;

await send("Runtime.enable"); await send("Log.enable"); await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: +w, height: +h, deviceScaleFactor: 1, mobile: +w < 700 });
await send("Page.navigate", { url: "http://127.0.0.1:8000/#overview" });
await sleep(2500);
if (reveal) await evalJS(`document.getElementById("revealBtn").click()`);

const report = [];
for (const v of views) {
  const before = errors.length;
  await evalJS(`location.hash = "#${v}"`);
  await sleep(1800);
  const info = await evalJS(`(() => {
    const vw = document.documentElement.clientWidth;
    const wide = [...document.querySelectorAll("body *")].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.right > vw + 1 && getComputedStyle(e).position !== "fixed"
      && !e.closest(".sections,.tbl-scroll,.src,.pk-list ul,.cmd,.as-sugg,pre,iframe"); }).slice(0, 5).map(e => e.tagName + "." + e.className);
    return { scrollW: document.documentElement.scrollWidth, vw, wide, h1: document.querySelectorAll("h1:not([hidden] *)").length };
  })()`);
  const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: +w, height: Math.min(await evalJS("document.documentElement.scrollHeight"), 6000), scale: 1 } });
  const file = `runs/shots/${v}-${w}${reveal ? "-reveal" : ""}.png`;
  writeFileSync(file, Buffer.from(shot.data, "base64"));
  report.push({ view: v, overflow: info.scrollW > info.vw ? `${info.scrollW} > ${info.vw}` : "none", wide: info.wide, errors: errors.slice(before), file });
}
console.log(JSON.stringify(report, null, 1));
ws.close();
chrome.kill();
process.exit(0);
