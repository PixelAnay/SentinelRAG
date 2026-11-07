"""Fine-tune DeBERTa-v3-base as a binary injection classifier.

Run: python -m sentinel.train_deberta
"""
import json
import random
import sys
import time

import numpy as np
import torch
from sklearn.metrics import f1_score
from transformers import AutoModelForSequenceClassification, AutoTokenizer, get_linear_schedule_with_warmup

from .config import DEBERTA_BASE, DEBERTA_FT, PROCESSED, SEED

MAX_LEN, BATCH, EPOCHS, LR = 512, 8, 2, 2e-5


def load(name):
    return [json.loads(line) for line in open(PROCESSED / f"{name}.jsonl", encoding="utf8")]


def batches(rows, tok, shuffle):
    idx = list(range(len(rows)))
    if shuffle:
        random.shuffle(idx)
    for i in range(0, len(idx), BATCH):
        chunk = [rows[j] for j in idx[i:i + BATCH]]
        enc = tok([r["text"] for r in chunk], truncation=True, max_length=MAX_LEN, padding=True, return_tensors="pt")
        enc["labels"] = torch.tensor([r["label"] for r in chunk])
        yield {k: v.to("cuda") for k, v in enc.items()}


@torch.no_grad()
def evaluate(model, rows, tok):
    model.eval()
    preds, gold = [], []
    for b in batches(rows, tok, False):
        out = model(**{k: v for k, v in b.items() if k != "labels"})
        preds += out.logits.argmax(-1).tolist()
        gold += b["labels"].tolist()
    return f1_score(gold, preds)


def main(seed=SEED):
    random.seed(seed)
    torch.manual_seed(seed)
    out_dir = DEBERTA_FT if seed == SEED else DEBERTA_FT.parent / f"deberta_ft_s{seed}"
    tok = AutoTokenizer.from_pretrained(str(DEBERTA_BASE))
    model = AutoModelForSequenceClassification.from_pretrained(str(DEBERTA_BASE), num_labels=2, dtype=torch.float32).to("cuda")
    train, val = load("train"), load("val")
    opt = torch.optim.AdamW(model.parameters(), lr=LR, weight_decay=0.01)
    steps = EPOCHS * ((len(train) + BATCH - 1) // BATCH)
    sched = get_linear_schedule_with_warmup(opt, int(0.1 * steps), steps)
    best = -1.0
    for ep in range(EPOCHS):
        model.train()
        t0, tot = time.time(), 0.0
        for n, b in enumerate(batches(train, tok, True), 1):
            with torch.autocast("cuda", dtype=torch.bfloat16):
                loss = model(**b).loss
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step()
            sched.step()
            opt.zero_grad()
            tot += loss.item()
            if n % 50 == 0:
                print(f"ep{ep} step{n} loss {tot / n:.4f}", flush=True)
        f1 = evaluate(model, val, tok)
        print(f"epoch {ep} val F1 {f1:.4f} ({time.time() - t0:.0f}s)", flush=True)
        if f1 > best:
            best = f1
            out_dir.mkdir(parents=True, exist_ok=True)
            model.save_pretrained(out_dir)
            tok.save_pretrained(out_dir)
    print("best val F1", best)


if __name__ == "__main__":
    main(int(sys.argv[1]) if len(sys.argv) > 1 else SEED)
