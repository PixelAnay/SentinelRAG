# SentinelRAG results

## Detection (per document)

| Defence | Test set | Precision | Recall | F1 | False-positive rate | Median ms | p95 ms |
|---|---|---|---|---|---|---|---|
| classifier | testA_bipia_email | 1.000 | 0.965 | 0.982 | 0.0% | 23 | 25 |
| classifier | testB_llmail | 1.000 | 0.657 | 0.793 | 0.0% | 24 | 45 |
| classifier | testC_table | 1.000 | 0.950 | 0.974 | 0.0% | 24 | 45 |
| classifier | testD_web | 0.982 | 0.932 | 0.957 | 1.7% | 45 | 46 |
| slm_judge | testA_bipia_email | 0.886 | 0.815 | 0.849 | 18.0% | 92 | 110 |
| slm_judge | testB_llmail | 1.000 | 0.867 | 0.929 | 0.0% | 110 | 191 |
| slm_judge | testC_table | 0.745 | 0.760 | 0.752 | 17.3% | 119 | 168 |
| slm_judge | testD_web | 0.925 | 0.627 | 0.747 | 5.1% | 144 | 186 |
| llamaguard | testA_bipia_email | 0.623 | 0.820 | 0.708 | 85.1% | 61 | 72 |
| llamaguard | testB_llmail | 0.951 | 0.751 | 0.839 | 20.6% | 72 | 135 |
| llamaguard | testC_table | 0.458 | 0.440 | 0.449 | 34.7% | 72 | 118 |
| llamaguard | testD_web | 1.000 | 0.042 | 0.081 | 0.0% | 95 | 111 |

## End to end (assistant: Gemma 4 E2B, thinking off, k=5)

| Mode | Attacks retrieved | ASR set A | ASR set B | Attacks blocked A | Attacks blocked B | False block (clean) | False block (hard negative) | Table acc clean | Table acc attacked | Defence ms median | Defence ms p95 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| none | 168/199 | 2.0% | 24.3% | 0.0% | 0.0% | 0.0% | 0.0% | 82.0% | 61.0% | 0 | 0 |
| classifier | 168/199 | 0.0% | 7.1% | 100.0% | 67.1% | 0.0% | 0.0% | 82.0% | 12.0% | 207 | 290 |
| slm_judge | 168/199 | 0.0% | 2.9% | 100.0% | 85.7% | 0.0% | 20.0% | 83.0% | 23.0% | 412 | 530 |
| llamaguard | 168/199 | 0.0% | 10.0% | 96.9% | 71.4% | 96.0% | 100.0% | 58.0% | 41.0% | 234 | 307 |

## 95% confidence intervals (Wilson)

| Defence | Test B recall | Test A false-positive rate | Test B false-positive rate |
|---|---|---|---|
| classifier | 65.7% [63.3, 68.1] | 0.0% [0.0, 1.1] | 0.0% [0.0, 1.3] |
| slm_judge | 86.7% [84.9, 88.4] | 18.0% [14.3, 22.4] | 0.0% [0.0, 1.3] |
| llamaguard | 75.1% [72.8, 77.2] | 85.1% [81.0, 88.5] | 20.6% [16.3, 25.7] |

| Mode | ASR set B | Attacks blocked, set B | False block, hard negatives |
|---|---|---|---|
| none | 24.3% [15.8, 35.5] | 0.0% [0.0, 5.2] | 0.0% [0.0, 3.7] |
| classifier | 7.1% [3.1, 15.7] | 67.1% [55.5, 77.0] | 0.0% [0.0, 3.7] |
| slm_judge | 2.9% [0.8, 9.8] | 85.7% [75.7, 92.1] | 20.0% [13.3, 28.9] |
| llamaguard | 10.0% [4.9, 19.2] | 71.4% [59.9, 80.7] | 100.0% [96.3, 100.0] |

## Web pages, end to end (80 poisoned and 40 clean pages, 95% Wilson intervals)

| Mode | ASR | Attacks blocked | False block (clean pages) | Defence ms median |
|---|---|---|---|---|
| none | 3.8% [1.3, 10.5] | 0.0% [0.0, 4.6] | 0.0% [0.0, 8.8] | 0 |
| classifier | 0.0% [0.0, 4.6] | 92.5% [84.6, 96.5] | 2.5% [0.4, 12.9] | 44 |
| slm_judge | 0.0% [0.0, 4.6] | 62.5% [51.5, 72.3] | 0.0% [0.0, 8.8] | 139 |
| llamaguard | 3.8% [1.3, 10.5] | 5.0% [2.0, 12.2] | 0.0% [0.0, 8.8] | 90 |

## How to read this

- Test A (BIPIA emails, held-out attack wording) is the easiest set. The classifier trained on the same benchmark family, so its 0.982 F1 there is optimistic. Test B (LLMail-Inject) was never used in training and is the fairer number: recall 0.657.
- "Defence ms" in the end-to-end table is per query and covers up to 5 retrieved documents, so it is roughly 5 times the per-document latency above. The SLM judge shares the assistant's server in that run.
- The undefended baseline is only moderately vulnerable (ASR 2.0% on set A, 24.3% on set B). Gemma 4 E2B often summarises an injected instruction instead of obeying it. "Attacks blocked" is therefore the stronger signal, since it does not depend on how obedient the model happens to be.
- Table accuracy under attack drops for every filter because a blocked table is withheld, so the assistant has nothing to answer from. That is the usability cost of block-only defences.
- Llama-Guard-3-1B with a custom category flags almost everything (96% of clean queries had a false block), so in this setup it is not usable. A fine-tuned or recalibrated version would be a separate experiment.
- The assistant runs with thinking disabled. With thinking on, the model reasons about the injection but needs a much larger token budget.
- LLMail-Inject submissions that Microsoft's judge labelled "not an attack" were excluded as negatives. Several still asked the assistant to email the attacker.
- Single run, seed 13, one machine (RTX 4050 6 GB). Intervals cover case sampling only, not training variance.
- Test D (web pages) is 59 Wikipedia articles wrapped in HTML, with held-out attack wording hidden in a comment, a hidden div, the meta description, visible text, image alt text, or 1px white text. The content is the raw HTML, as an agent without a tag-stripper would see it. Neither defence was trained on HTML. Wikipedia text is cleaner than typical web pages, so this is a small, friendly sample.
- On web pages the ranking flips. The classifier catches 93.2% of attacks (hidden div 17/18, image alt 17/17), while the Gemma judge catches 62.7% (hidden div 9/18, image alt 6/17). The judge seems to treat markup as noise. Llama-Guard catches 4.2%.
- Web-page ASR is uninformative: the undefended assistant obeyed only 3.8% of the injections (3 of 80), so use "attacks blocked".

## Which defence fits which situation

| Situation | Pick | Why |
|---|---|---|
| High volume, strict latency, many benign emails that contain requests | Fine-tuned DeBERTa | About 26 ms per document, 0% false positives on real safe emails in both tests. It misses about a third of unseen LLMail attacks, so retrain on new attack styles regularly. |
| Attacks are the bigger worry in email and some false blocks are tolerable | Prompted Gemma judge | Highest recall on unseen email attacks (86.7% on LLMail). About 4 times slower, blocks about 1 in 5 benign emails that give instructions to humans, and misses many injections hidden in HTML (62.7% recall on web pages). |
| Content is web pages or raw HTML | Fine-tuned DeBERTa | 93.2% recall and 1.7% false positives on web pages, against 62.7% and 5.1% for the judge. |
| Either of the two above is too weak alone | Run both in sequence | Not measured here. The classifier is cheap enough to run first. |
| Llama-Guard-3-1B | Not recommended as configured | Its built-in categories do not cover injection, and a prompted custom category flags nearly everything. |

Filters lower risk and never remove it: the best result here still lets 2.9% of retrieved set B attacks succeed, and each filter can be bypassed by wording it has not seen. Structural controls matter more than the choice of filter:

- Require user approval before any tool call that sends data out (here, `send_email`).
- Use a dual-LLM split. A quarantined model reads untrusted text and has no tools. A privileged model holds the tools and only sees the quarantined model's structured output. This is described, not built or tested in this project.
- Treat a blocked document as lost data. Table accuracy under attack fell to 12-23% with the filters, so a real deployment needs a sanitise-and-continue path rather than only block.
