# -*- coding: utf-8 -*-
"""三个写手/评审 CLI 的统一适配层。

设计约束：
- 一次调用 = 一次无状态纯文本生成，不带工具、不带会话。
- 提示词通过临时文件 + argv 传入（三个 CLI 都没有稳定的 stdin 通道）。
- 失败重试 + 空输出重试；返回 (text, meta)。
"""
import os, re, subprocess, tempfile, time, uuid

MODELS = ("gpt", "ds", "kimi")

_BIN = {
    "gpt":  "/opt/homebrew/bin/codex",
    "ds":   "/opt/homebrew/bin/codewhale",
    "kimi": "/Users/pite/.kimi-code/bin/kimi",
}

# 每个 CLI 各自的干净工作目录，避免读到仓库里的 AGENTS.md / 项目上下文
SANDBOX = "/private/tmp/ab-r5-sandbox"


def _argv(model, prompt_path, prompt_text):
    model = model.rstrip("0123456789")
    if model == "gpt":
        return [_BIN["gpt"], "exec", "--skip-git-repo-check", "-s", "read-only",
                "-C", SANDBOX, prompt_text]
    if model == "ds":
        return [_BIN["ds"], "exec", "-C", SANDBOX, prompt_text]
    if model == "kimi":
        return [_BIN["kimi"], "-p", prompt_text]
    raise ValueError(model)


_STRIP_PREFIX = re.compile(r"^[\s•\-\*]+")
_FENCE = re.compile(r"^```[a-zA-Z]*\s*\n(.*)\n```\s*$", re.S)


def clean(text):
    text = text.replace("\r\n", "\n").strip()
    m = _FENCE.match(text)
    if m:
        text = m.group(1).strip()
    text = _STRIP_PREFIX.sub("", text)
    return text.strip()


def has_cjk(text):
    return bool(re.search(r"[一-鿿]", text))


def call(model, prompt, *, timeout=1800, tries=3, min_chars=1, need_cjk=True):
    """返回 (text, meta)。全部失败时 text 为 None。

    model 末尾的数字只是「同一 CLI 的第二次独立抽样」标记（如 gpt2），不改变可执行文件。"""
    os.makedirs(SANDBOX, exist_ok=True)
    last_err = None
    for attempt in range(1, tries + 1):
        fd, path = tempfile.mkstemp(prefix="prompt-", suffix=".txt", dir=SANDBOX)
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(prompt)
        t0 = time.time()
        try:
            proc = subprocess.run(
                _argv(model, path, prompt),
                capture_output=True, timeout=timeout,
                env={**os.environ, "NO_COLOR": "1", "TERM": "dumb"},
            )
            out = proc.stdout.decode("utf-8", "replace")
            err = proc.stderr.decode("utf-8", "replace")
            text = clean(out)
            ok = len(text) >= min_chars and (not need_cjk or has_cjk(text))
            meta = {"model": model, "attempt": attempt, "rc": proc.returncode,
                    "secs": round(time.time() - t0, 1), "raw_len": len(out),
                    "stderr_tail": err[-400:]}
            if ok:
                os.unlink(path)
                return text, meta
            last_err = meta
        except subprocess.TimeoutExpired:
            last_err = {"model": model, "attempt": attempt, "rc": "timeout",
                        "secs": round(time.time() - t0, 1)}
        finally:
            if os.path.exists(path):
                os.unlink(path)
        time.sleep(4 * attempt)
    return None, (last_err or {"model": model, "rc": "unknown"})
