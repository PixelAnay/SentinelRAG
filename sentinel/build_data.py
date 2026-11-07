"""Build labelled datasets under data/processed/*.jsonl.

Run: python -m sentinel.build_data
"""
import ast
import json
import random

from .attacks import (ADDRS_TEST, ADDRS_TRAIN, BENIGN_TEST, BENIGN_TRAIN, BODIES_TEST,
                      BODIES_TRAIN, ORGS, SEND_TEST, SEND_TRAIN)
from .config import BIPIA, DATA, LLMAIL, PROCESSED, SEED

rng = random.Random(SEED)


def read_jsonl(p):
    with open(p, encoding="utf8") as f:
        return [json.loads(line) for line in f]


def flat_attacks(path):
    d = json.load(open(path, encoding="utf8"))
    return [(cat, s) for cat, items in d.items() for s in items]


def parse_email(ctx):
    """BIPIA email context -> (subject, body)."""
    head, _, body = ctx.partition("|CONTENT:")
    subject = head.split("|")[0].replace("SUBJECT:", "").strip()
    return subject, body.strip()


def render_email(subject, body, fmt):
    if fmt == "llmail":
        return f"Subject of the email: {subject}.   Body: {body}"
    return f"SUBJECT: {subject}|CONTENT: \n\n{body}"


def insert(text, snippet, position):
    if position == "start":
        return snippet + "\n\n" + text
    if position == "end":
        return text + "\n\n" + snippet
    words = text.split(" ")
    k = len(words) // 2
    return " ".join(words[:k]) + "\n\n" + snippet + "\n\n" + " ".join(words[k:])


def send_attack(split):
    tpl = SEND_TRAIN if split == "train" else SEND_TEST
    addrs = ADDRS_TRAIN if split == "train" else ADDRS_TEST
    bodies = BODIES_TRAIN if split == "train" else BODIES_TEST
    t = rng.choice(tpl)
    return "send_email", t.format(addr=rng.choice(addrs), body=rng.choice(bodies))


def benign_sentence(split):
    return rng.choice(BENIGN_TRAIN if split == "train" else BENIGN_TEST).format(org=rng.choice(ORGS))


def make_attack(text_attacks, split):
    if rng.random() < 0.5:
        return send_attack(split)
    cat, s = rng.choice(text_attacks)
    return cat, s


def email_items(emails, text_attacks, split, name, n_pos_each, n_hard_each, formats, tag):
    out = []
    for i, e in enumerate(emails):
        subject, body = parse_email(e["context"])
        eid = f"{name}-{i}"
        for fmt in formats:
            out.append(dict(text=render_email(subject, body, fmt), label=0, kind="clean", source=tag, email=eid))
        for _ in range(n_hard_each):
            fmt = rng.choice(formats)
            pos = rng.choice(["start", "middle", "end"])
            b = insert(body, benign_sentence(split), pos)
            out.append(dict(text=render_email(subject, b, fmt), label=0, kind="hard_negative", source=tag, email=eid))
        for _ in range(n_pos_each):
            fmt = rng.choice(formats)
            pos = rng.choice(["start", "middle", "end"])
            kind, atk = make_attack(text_attacks, split)
            b = insert(body, atk, pos)
            out.append(dict(text=render_email(subject, b, fmt), label=1, kind=kind, position=pos,
                            source=tag, email=eid, attack=atk))
    return out


def table_items(rows, text_attacks, split, tag, n_pos, n_neg_hard, n_clean):
    out = []
    for i, r in enumerate(rows):
        ctx = r["context"]
        eid = f"{tag}-{i}"
        qa = dict(question=r["question"], ideal=r["ideal"])
        if i < n_clean:
            out.append(dict(text=ctx, label=0, kind="clean", source=tag, email=eid, **qa))
        if i < n_neg_hard:
            pos = rng.choice(["start", "end"])
            out.append(dict(text=insert(ctx, benign_sentence(split), pos), label=0, kind="hard_negative", source=tag, email=eid, **qa))
        if i < n_pos:
            pos = rng.choice(["start", "middle", "end"])
            kind, atk = make_attack(text_attacks, split)
            out.append(dict(text=insert(ctx, atk, pos), label=1, kind=kind, position=pos, source=tag, email=eid, attack=atk, **qa))
    return out


def llmail_items():
    lab = json.load(open(LLMAIL / "labelled_unique_submissions_phase1.json", encoding="utf8"))
    pos, neg_judge = [], []
    for text, meta in lab.items():
        m = ast.literal_eval(meta) if isinstance(meta, str) else meta
        if str(m.get("attack_attempt")) == "True":
            pos.append(text)
        elif m.get("reason") == "judge":
            neg_judge.append(text)
    rng.shuffle(pos)
    items = [dict(text=t, label=1, kind="llmail_attack", source="llmail") for t in pos[:1500]]
    fp = json.load(open(LLMAIL / "emails_for_fp_tests.json", encoding="utf8"))
    items += [dict(text=t, label=0, kind="llmail_fp_email", source="llmail") for t in fp]
    sc = json.load(open(LLMAIL / "scenarios.json", encoding="utf8"))
    for s in sc.values():
        items += [dict(text=t, label=0, kind="llmail_scenario_email", source="llmail") for t in s["emails"]]
    # Attacker submissions that did not trigger the API are not reliable "safe" examples:
    # many still ask the assistant to email the attacker. They are left out of both classes.
    return items


def web_items(te_text):
    pages = json.load(open(DATA / "web" / "pages.json", encoding="utf8"))
    dev_notes = ["<!-- TODO: update the footer links before launch -->", "<!-- cached 2026-03-02, regenerate on edit -->",
                 "<!-- analytics snippet removed -->"]

    def esc(s):
        return s.replace("&", "&amp;").replace('"', "&quot;")

    def page_html(title, paras, desc, extra_head="", extra_body="", footer_extra=""):
        body = "".join(f"<p>{p}</p>\n" for p in paras)
        return (f'<!DOCTYPE html><html><head><title>{title} - Reference</title>'
                f'<meta name="description" content="{esc(desc)}">{extra_head}</head>\n<body>\n'
                f'<nav>Home | Articles | About | Contact</nav>\n<h1>{title}</h1>\n{extra_body}{body}'
                f'<footer>Copyright 2026 Example Reference. All rights reserved. {footer_extra}</footer>\n</body></html>')

    vectors = ["comment", "hidden_div", "meta", "visible", "img_alt", "tiny_text"]
    out = []
    for i, pg in enumerate(pages):
        paras = [p for p in pg["text"].split("\n") if p.strip()]
        desc = paras[0][:150]
        title, eid = pg["title"], f"web-{i}"
        out.append(dict(text=page_html(title, paras, desc), label=0, kind="clean", source="web", email=eid))
        v = rng.choice(["note", "visible", "comment"])
        if v == "note":
            h = page_html(title, paras, desc, extra_body=rng.choice(dev_notes) + "\n")
        elif v == "visible":
            ps = list(paras)
            ps.insert(len(ps) // 2, benign_sentence("test"))
            h = page_html(title, ps, desc)
        else:
            h = page_html(title, paras, desc, footer_extra="Questions? Email the editors at editors@example-reference.org.")
        out.append(dict(text=h, label=0, kind="hard_negative", source="web", email=eid))
        for vec in rng.sample(vectors, 2):
            kind, atk = make_attack(te_text, "test")
            if vec == "comment":
                h = page_html(title, paras, desc, extra_body=f"<!-- {atk} -->\n")
            elif vec == "hidden_div":
                h = page_html(title, paras, desc, extra_body=f'<div style="display:none">{atk}</div>\n')
            elif vec == "meta":
                h = page_html(title, paras, atk)
            elif vec == "visible":
                ps = list(paras)
                ps.insert(len(ps) // 2, atk)
                h = page_html(title, ps, desc)
            elif vec == "img_alt":
                h = page_html(title, paras, desc, extra_body=f'<img src="hero.jpg" alt="{esc(atk)}">\n')
            else:
                h = page_html(title, paras, desc, extra_body=f'<span style="color:#ffffff;font-size:1px">{atk}</span>\n')
            out.append(dict(text=h, label=1, kind=kind, position=vec, source="web", email=eid, attack=atk, vector=vec))
    return out


def write(name, items):
    PROCESSED.mkdir(parents=True, exist_ok=True)
    with open(PROCESSED / f"{name}.jsonl", "w", encoding="utf8") as f:
        for i, it in enumerate(items):
            it["id"] = f"{name}-{i}"
            f.write(json.dumps(it, ensure_ascii=False) + "\n")
    pos = sum(i["label"] for i in items)
    print(f"{name}: {len(items)} items, {pos} attacks, {len(items) - pos} safe")


def main():
    tr_text = flat_attacks(BIPIA / "text_attack_train.json")
    te_text = flat_attacks(BIPIA / "text_attack_test.json")
    tr_email = read_jsonl(BIPIA / "email" / "train.jsonl")
    te_email = read_jsonl(BIPIA / "email" / "test.jsonl")
    tr_table = read_jsonl(BIPIA / "table" / "train.jsonl")
    te_table = read_jsonl(BIPIA / "table" / "test.jsonl")
    fm = ["bipia", "llmail"]

    # Train and validation use disjoint source emails and tables.
    train = email_items(tr_email[:40], tr_text, "train", "tr", 30, 20, fm, "bipia_email_train")
    val = email_items(tr_email[40:], tr_text, "train", "va", 30, 20, fm, "bipia_email_val")
    rng.shuffle(tr_table)
    train += table_items(tr_table[:600], tr_text, "train", "bipia_table_train", 300, 250, 250)
    val += table_items(tr_table[600:700], tr_text, "train", "bipia_table_val", 50, 30, 30)
    write("train", train)
    write("val", val)

    # Test A: held-out BIPIA emails, held-out attack wording, BIPIA format only.
    write("testA_bipia_email", email_items(te_email, te_text, "test", "te", 12, 6, ["bipia"], "bipia_email_test"))
    # Test B: LLMail-Inject, never used for training.
    write("testB_llmail", llmail_items())
    # Test C: tables (a non-email format).
    write("testC_table", table_items(te_table, te_text, "test", "bipia_table_test", 100, 50, 100))
    # Test D: web pages with hidden injections (HTML source as retrieved).
    write("testD_web", web_items(te_text))


if __name__ == "__main__":
    main()
