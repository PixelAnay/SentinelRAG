# Running and presenting SentinelRAG

## Start it

```
cd C:\Code\SentinelRAG
python -m sentinel.server
```

Wait about a minute (the Gemma assistant model loads), then open <http://127.0.0.1:8000>. The top bar shows "Backend ready" with a filled green dot. Stop it with Ctrl+C in that window.

Needs the GPU free. Close other GPU-heavy programs first (6 GB VRAM). The first use of each defence loads its model (a few seconds, up to about 20 s for Prompt Guard 2), so click through the defences once before an audience arrives.

The dashboard needs no internet: fonts are served from `fonts/`.

## Sections

| Section | What it shows |
|---|---|
| Overview | The question, the pipeline figure, the safety-against-usability plot, the main findings and the "which defence when" table. |
| Mailbox | A working inbox with about 20 emails, including real dataset attacks. Pick a filter on the right and ask a question. Each answer lists the emails read, marks them passed or withheld (black bar), and flags any `send_email` call. Calls are recorded under "Sent by assistant". "Add to the inbox" adds a real attack, a harmless request, or one you write. |
| Web pages | A page as a person sees it next to the raw HTML the assistant reads, with a live run under it. |
| Documents | Tables with questions. Blocking an attacked table also removes the answer. |
| Case studies | 15 recorded cases with the evaluation result per defence. "Run live on all four" reruns them and marks each row "same live" or "differs live". |
| Detector | Paste text or load a test-set row. Every detector's verdict, score against the 0.5 threshold, and time. |
| Results | Every measurement as numbered figures with 95% intervals. |
| Method | Setups, data, assistant configuration, statistics, limitations and the commands to reproduce. |

**Show attacks** (top right) marks every email, page and table that holds an injection, and highlights the injected text in red. Keep it off while you demonstrate and switch it on to explain.

## A 7-minute script

1. **Overview** (45 s). Read the title question. Point at Figure 1 (where the filter sits) and Figure 2 (bottom right is better; the judge blocks more attacks but also blocks one in five harmless requests).
2. **Mailbox** (2 min).
   - Filter: *No filter*. Click the suggestion "Summarize the email about Appointment with Dr. Rothschild - Wed Dec 11 2024". The answer is marked **Hijacked**: it emailed `contact@contact.com`. Open **Sent by assistant** to show the recorded call. Nothing is delivered.
   - Pick *Fine-tuned DeBERTa* and ask again. The email is marked **withheld** and no mail is sent. Open it: the black bar says the model never read it.
   - Pick *Gemma 4 judge*, then *Prompt Guard 2*. The judge blocks it, slower. Prompt Guard 2 misses it and the assistant is hijacked again.
   - Pick *Llama-Guard-3-1B*. It blocks, but it also withholds harmless emails.
3. **Web pages** (1.5 min). Open a page, switch on *Show attacks*, point at the marked hidden text on the right and the clean-looking page on the left. Press "Run all four".
4. **Case studies** (2 min). Case 03 (the classifier misses, the judge catches) and case 09 (hidden div: the classifier catches, the judge misses). Neither filter wins everywhere.
5. **Results** (1 min). Figure 1 (F1), Figure 4 (end to end), Figure 8 (the classifier varies a lot between training seeds).

## Things to say honestly

- The undefended assistant is only moderately obedient, so "attacks blocked" is a steadier metric than attack success.
- Live runs usually match the saved evaluation but not always. The model is not perfectly repeatable, so one case can come out differently.
- Blocking has a cost: an attacked table that is withheld cannot be used to answer.
- The assistant sometimes emails its own answer to an address it invents. The dashboard marks that in ochre, separately from a hijack (an address taken from the retrieved content).

## If something goes wrong

- *Backend offline*: the server window closed. Start it again.
- *A defence errors out on first use*: free VRAM (`nvidia-smi`), close other GPU programs, retry.
- *Port 8000 busy*: an older server is still running. Find it with `Get-NetTCPConnection -LocalPort 8000` and stop that process.

## Refreshing the dashboard data

The Overview, Case studies and Results sections read two snapshot files in `showcase/`. Rebuild them after re-running evaluations:

```
python -m scripts.build_showcase
```

## Checking the interface

With the server running:

```
node scripts/ui_check.mjs 1440 900      # every section: console errors, overflow, screenshots in runs/shots/
node scripts/ui_check.mjs 390 844       # phone width
node scripts/ui_flow.mjs                # live click-through: mailbox, case study, web page, detector, dialog
```
