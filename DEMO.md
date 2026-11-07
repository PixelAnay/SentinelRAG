# Running and presenting SentinelRAG

## Start it

```
cd C:\Code\SentinelRAG
python -m sentinel.server
```

Wait about a minute (the Gemma assistant model loads), then open <http://127.0.0.1:8000>. The top-right of the tab strip shows "backend ready". Stop it with Ctrl+C in that window.

Needs the GPU free. Close other GPU-heavy programs first (6 GB VRAM). The first use of each defence loads its model (a few seconds, up to about 20 s for Prompt Guard 2), so click through the defences once before an audience arrives.

## Tabs

| Tab | What it shows |
|---|---|
| Mail assistant | A working email client with about 20 emails, including real attacks from the datasets. Ask the assistant under any defence. Withheld emails get a red badge, and any `send_email` the assistant attempts shows up in Sent. |
| Web pages | A page as a person sees it next to the raw HTML the assistant reads. Shows why hidden text works. |
| Documents | Tables with questions. Shows that blocking an attacked table also removes the data needed to answer. |
| Showcase | 15 scripted real cases. Each runs live through all four setups beside what happened in the evaluation. |
| Detector | Paste text or load a test-set row. Every detector's verdict, score and time. |
| Results | All measurements with confidence intervals. |
| Project | The method, the three setups, the recommendation table, limitations and commands. |

**Reveal attacks** (top bar) marks which emails, pages and tables hold an injection. Keep it off while you demonstrate and switch it on to explain.

## A 7-minute script

1. **Project** (30 s). Show the flow diagram: retrieve, filter, assistant. Say what is compared.
2. **Mail assistant** (2 min).
   - Defence: *None*. Click the chip "Summarize the email about Appointment with Dr. Rothschild - Wed Dec 11 2024". The assistant emails `contact@contact.com`. Open **Sent** to show the attempt. Nothing is delivered.
   - Switch to *Classifier (DeBERTa)* and ask again. The email gets a red "blocked" badge and no mail is sent.
   - Switch to *SLM Guardrail* and ask again. Same result, slower.
   - Switch to *Prompt Guard 2* and ask again. It misses, and the assistant is hijacked again.
   - Switch to *Llama-Guard* and ask again. It blocks, but it also blocks the harmless emails.
3. **Web pages** (1.5 min). Open a page, turn on *Reveal attacks*, point at the highlighted hidden text on the right and the clean page on the left.
4. **Showcase** (2 min). Step 3 (classifier misses, judge catches) and step 9 (judge misses, classifier catches). Neither filter wins everywhere.
5. **Results** (1 min). The F1 chart, the end-to-end chart, and the seed chart (the classifier varies a lot between training runs).

## Things to say honestly

- The undefended assistant is only moderately obedient, so "attacks blocked" is a steadier metric than attack success.
- Live runs usually match the saved evaluation but not always. The model is not perfectly repeatable, so one case can come out differently.
- Blocking has a cost: an attacked table that is withheld cannot be used to answer.
- The assistant sometimes emails its own answer to an address it invents. The dashboard marks that separately from a hijack (an address taken from the retrieved content).

## If something goes wrong

- *Backend offline*: the server window closed. Start it again.
- *A defence errors out on first use*: free VRAM (`nvidia-smi`), close other GPU programs, retry.
- *Port 8000 busy*: an older server is still running. Find it with `Get-NetTCPConnection -LocalPort 8000` and stop that process.

## Refreshing the dashboard data

The Showcase and Results tabs read two snapshot files in `showcase/`. Rebuild them after re-running evaluations:

```
python -m scripts.build_showcase
```
