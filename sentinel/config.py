from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
PROCESSED = DATA / "processed"
BIPIA = DATA / "BIPIA" / "benchmark"
LLMAIL = DATA / "llmail" / "data"
MODELS = ROOT / "Models"
RUNS = ROOT / "runs"

DEBERTA_BASE = MODELS / "deberta_folder"
DEBERTA_FT = RUNS / "deberta_ft"
GEMMA_GGUF = MODELS / "gemma-4-E2B-it-UD-Q4_K_XL.gguf"
LLAMAGUARD_GGUF = MODELS / "Llama-Guard-3-1B.Q4_K_M.gguf"
LLAMA_SERVER = ROOT / "tools" / "llama.cpp" / "bin" / "llama-server.exe"

ASSISTANT_PORT = 8081
JUDGE_PORT = 8082
GUARD_PORT = 8083

ATTACKER_ADDR = "contact@contact.com"
SEED = 13
MAX_TOKENS = 512
