"""Start and talk to llama.cpp servers."""
import subprocess
import time

import requests

from .config import LLAMA_SERVER


class Server:
    def __init__(self, model, port, ctx=8192, extra=()):
        self.port = port
        self.url = f"http://127.0.0.1:{port}"
        self.cmd = [str(LLAMA_SERVER), "-m", str(model), "--port", str(port), "-c", str(ctx),
                    "-ngl", "99", "--jinja", "--no-webui", *extra]
        self.proc = None

    def start(self, timeout=180):
        if self.proc:
            return self
        self.proc = subprocess.Popen(self.cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        t0 = time.time()
        while time.time() - t0 < timeout:
            if self.proc.poll() is not None:
                raise RuntimeError(f"llama-server exited early: {' '.join(self.cmd)}")
            try:
                if requests.get(self.url + "/health", timeout=2).status_code == 200:
                    return self
            except requests.RequestException:
                pass
            time.sleep(1)
        self.stop()
        raise TimeoutError("llama-server did not become ready")

    def stop(self):
        if self.proc:
            self.proc.terminate()
            try:
                self.proc.wait(10)
            except subprocess.TimeoutExpired:
                self.proc.kill()
            self.proc = None

    def __enter__(self):
        return self.start()

    def __exit__(self, *a):
        self.stop()

    def chat(self, messages, tools=None, max_tokens=512, temperature=0.0, **kw):
        body = dict(messages=messages, max_tokens=max_tokens, temperature=temperature, **kw)
        if tools:
            body["tools"] = tools
        r = requests.post(self.url + "/v1/chat/completions", json=body, timeout=300)
        r.raise_for_status()
        return r.json()["choices"][0]["message"]

    def complete(self, prompt, max_tokens=8, **kw):
        body = dict(prompt=prompt, n_predict=max_tokens, temperature=0.0, **kw)
        r = requests.post(self.url + "/completion", json=body, timeout=300)
        r.raise_for_status()
        return r.json()["content"]
