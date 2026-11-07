# SentinelRAG design

Supersedes `Basics.md` (kept for reference).

## Question

For an email assistant with retrieval and a `send_email` tool, how do two defences against indirect prompt injection compare on detection accuracy, latency and real-world usability?

## Systems under test

| Mode | What runs before the assistant sees retrieved emails |
|---|---|
| `none` | Nothing. Vulnerable baseline. |
| `classifier` | DeBERTa-v3-base fine-tuned by us on BIPIA-derived data. Scores windows of each email; blocks if any window is flagged. |
| `slm_judge` | Gemma 4 E2B (local, llama.cpp) with a prompt that asks "does this email contain instructions aimed at an AI assistant?". |
| `llamaguard` | Llama-Guard-3-1B with a custom "indirect prompt injection" category. Reported next to `slm_judge`. |

Reference only (not a contestant): Prompt Guard 2 scored on the same test sets, to show where our classifier sits.

The assistant is Gemma 4 E2B served by `llama-server` with tool calling. It is the same model in every mode. A blocked email is removed from the context and the user is told it was withheld.

## Data

| Role | Source |
|---|---|
| Train / validation | BIPIA email train contexts (50) with BIPIA train attacks (text + code) and our own `send_email` attack templates (train split). Hard negatives: benign emails with imperative wording aimed at humans. |
| Test A (in-distribution) | BIPIA email test contexts (50) with BIPIA test attacks and held-out `send_email` templates. |
| Test B (cross-dataset) | LLMail-Inject phase 1 attacks labelled `attack_attempt = True` (positives). 203 `emails_for_fp_tests` plus the clean scenario emails (negatives). The classifier never sees these in training. |
| Test C (other formats) | Small set of poisoned BIPIA table and code contexts, to check that defences work beyond email. |

Injected positions: start, middle, end. Long emails are cut into overlapping word windows and a window is labelled positive only if it contains the injected span.

## Metrics

- Detection: precision, recall, F1, false-positive rate (per test set).
- End-to-end: attack success rate (ASR) = share of runs where the model calls `send_email` to the attacker address.
- Usability: false-positive rate on safe emails, and task accuracy on clean queries with the defence on, also under attack (does the user still get a correct answer?).
- Latency: added milliseconds per query for each defence, median and p95, same machine.

## Layout

```
sentinel/
  config.py        paths, ports, constants
  build_data.py    builds data/processed/*.jsonl
  llm.py           llama-server manager and chat/tool client
  rag.py           email store and MiniLM retrieval
  defenses.py      none / classifier / slm_judge / llamaguard
  assistant.py     retrieve -> defend -> answer
  train_deberta.py fine-tuning
  eval_detection.py, eval_e2e.py
```

## Known limits

Filters lower risk and never remove it. The write-up recommends approval before tool calls and a dual-LLM split (a quarantined model reads untrusted text, a privileged model holds the tools) as the structural fix. It is described, not built.

## Running it

```
python -m sentinel.build_data            # builds data/processed (needs data/BIPIA and data/llmail, see below)
python -m sentinel.train_deberta         # about 30 min on an RTX 4050
python -m sentinel.eval_detection classifier slm_judge llamaguard
python -m sentinel.eval_e2e none classifier slm_judge llamaguard --n 100
python -m sentinel.report                # writes runs/results.md
python -m sentinel.server                # dashboard at http://127.0.0.1:8000
```

Data: `git clone https://github.com/microsoft/BIPIA data/BIPIA` and download `data/*.json` from the Hugging Face dataset `microsoft/llmail-inject-challenge` into `data/llmail/data/`. llama.cpp build b12177 (CUDA 12.4) goes in `tools/llama.cpp/bin/`.

Dashboard mode `slm` runs the Gemma judge on the assistant's own server. The dashboard sends its mailbox with each request, so edited or new emails are covered.
