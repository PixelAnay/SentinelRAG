from .config import (ASSISTANT_PORT, GEMMA_GGUF, GUARD_PORT, JUDGE_PORT, LLAMAGUARD_GGUF)
from .defenses import DebertaGuard, LlamaGuard, NoDefense, SLMJudge
from .llm import Server

NAMES = ["none", "classifier", "slm_judge", "llamaguard"]
MAX_CHARS = 12000


def assistant_server():
    return Server(GEMMA_GGUF, ASSISTANT_PORT, ctx=8192, extra=("-np", "1"))


class Truncating:
    """Wrap a defence so very long texts do not overflow a small model's context."""

    def __init__(self, inner):
        self.inner, self.name = inner, inner.name

    def check(self, text):
        return self.inner.check(text[:MAX_CHARS])

    def close(self):
        self.inner.close()


def make_defense(name, share_assistant=None):
    """share_assistant: an already running Server to reuse as the judge (saves VRAM)."""
    if name == "none":
        return NoDefense()
    if name == "classifier":
        return DebertaGuard()
    if name == "slm_judge":
        srv = share_assistant or Server(GEMMA_GGUF, JUDGE_PORT, ctx=8192, extra=("-np", "1")).start()
        d = Truncating(SLMJudge(srv))
        if share_assistant:
            d.close = lambda: None
        return d
    if name == "llamaguard":
        return Truncating(LlamaGuard(Server(LLAMAGUARD_GGUF, GUARD_PORT, ctx=8192, extra=("-np", "1")).start()))
    raise ValueError(name)
