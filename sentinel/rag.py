"""Minimal in-memory email store with embedding retrieval."""
import numpy as np
from sentence_transformers import SentenceTransformer

_model = None


def embedder():
    global _model
    if _model is None:
        _model = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2", device="cpu")
    return _model


class EmailStore:
    def __init__(self, emails):
        """emails: list of dicts with at least 'id' and 'text'."""
        self.emails = list(emails)
        self.vecs = embedder().encode([e["text"] for e in self.emails], normalize_embeddings=True,
                                      show_progress_bar=False)

    def search(self, query, k=5, extra=(), exclude=()):
        """extra: emails added for this query only. exclude: ids to hide."""
        q = embedder().encode([query], normalize_embeddings=True, show_progress_bar=False)[0]
        pool = [(e, v) for e, v in zip(self.emails, self.vecs) if e["id"] not in exclude]
        if extra:
            ev = embedder().encode([e["text"] for e in extra], normalize_embeddings=True, show_progress_bar=False)
            pool += list(zip(extra, ev))
        pool.sort(key=lambda p: -float(p[1] @ q))
        return [e for e, _ in pool[:k]]
