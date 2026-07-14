/**
 * CDP 工具函数 — 各平台采集脚本的公共依赖
 *
 * 使用方式：
 *   const { ab, sleep, evalJSON, evalJSONBase64, scrollLoad, getArg, safeStr } = require("./cdp-utils");
 *
 * 前置：
 *   node {SKILL_DIR}/browser-cdp/scripts/setup-cdp-chrome.js 9222
 */

const { execFileSync } = require("child_process");

const WINDOWS_AGENT_BROWSER_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  "$utf8NoBom = [System.Text.UTF8Encoding]::new($false)",
  "[Console]::InputEncoding = $utf8NoBom",
  "[Console]::OutputEncoding = $utf8NoBom",
  "$OutputEncoding = $utf8NoBom",
  "$payload = [Console]::In.ReadToEnd()",
  "$abArgs = @(ConvertFrom-Json -InputObject $payload)",
  "& agent-browser @abArgs",
  "if ($null -eq $LASTEXITCODE) { exit 1 }",
  "exit $LASTEXITCODE",
].join("; ");

/**
 * Build a shell-free invocation on POSIX. Windows npm executables are `.cmd`
 * shims, so a fixed PowerShell program reads the argument array as JSON from
 * stdin and splats it without evaluating user-controlled command text.
 */
function buildAgentBrowserInvocation(port, args, platform = process.platform) {
  const argv = ["--cdp", String(port), ...args.map(String)];
  if (platform !== "win32") {
    return { file: "agent-browser", args: argv };
  }
  return {
    file: "powershell.exe",
    args: [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-EncodedCommand",
      Buffer.from(WINDOWS_AGENT_BROWSER_SCRIPT, "utf16le").toString("base64"),
    ],
    input: JSON.stringify(argv),
  };
}

// ---------------------------------------------------------------------------
// agent-browser 工具函数
// ---------------------------------------------------------------------------

/**
 * 调用 agent-browser CLI
 * @param {number} port - CDP 端口
 * @param  {...string} args - agent-browser 参数
 * @returns {string} stdout（trim 后）
 */
function ab(port, ...args) {
  const invocation = buildAgentBrowserInvocation(port, args);
  try {
    return execFileSync(
      invocation.file,
      invocation.args,
      {
        encoding: "utf-8",
        input: invocation.input,
        timeout: 20000,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      }
    ).trim();
  } catch (error) {
    const stderr = error && error.stderr ? String(error.stderr).trim() : "";
    const stdout = error && error.stdout ? String(error.stdout).trim() : "";
    const detail = stderr || stdout || (error && error.message) || "unknown error";
    throw new Error(`agent-browser failed: ${detail}`, { cause: error });
  }
}

/** 等待 ms 毫秒（跨平台，不依赖系统 sleep 命令） */
function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function parseJSONResult(raw) {
  if (!raw || raw === "ERR") {
    throw new Error("agent-browser returned no JSON result");
  }
  try {
    let parsed = JSON.parse(raw);
    if (typeof parsed === "string") {
      try { parsed = JSON.parse(parsed); } catch {}
    }
    return parsed;
  } catch (error) {
    throw new Error(`agent-browser returned invalid JSON: ${String(raw).slice(0, 160)}`, {
      cause: error,
    });
  }
}

/** 在浏览器内执行短 JS，并解析 JSON 返回值。 */
function evalJSON(port, js) {
  return parseJSONResult(ab(port, "eval", String(js)));
}

/**
 * 通过 agent-browser 的 base64 参数执行复杂 JS，避免命令行转义和参数边界问题。
 */
function evalJSONBase64(port, js) {
  const encoded = Buffer.from(String(js), "utf8").toString("base64");
  return parseJSONResult(ab(port, "eval", "-b", encoded));
}

/**
 * 安全地将值插入浏览器 eval 字符串。
 * 使用 JSON.stringify 确保值不会因特殊字符（引号、反斜杠等）破坏 eval 字符串。
 * @param {*} val - 要插入的值
 * @returns {string} JSON 字符串表示（含引号）
 */
function safeStr(val) {
  return JSON.stringify(String(val));
}

/**
 * 滚动页面加载更多内容
 * @param {number} port - CDP 端口
 * @param {number} times - 滚动次数
 * @param {number} [interval=1000] - 每次滚动间隔（ms）
 */
function scrollLoad(port, times, interval = 1000) {
  for (let i = 0; i < times; i++) {
    ab(port, "eval", "window.scrollBy(0, window.innerHeight)");
    sleep(interval);
  }
}

/** 解析 --xxx 参数 */
function getArg(args, name) {
  const i = args.indexOf(name);
  if (i >= 0) return i + 1 < args.length ? args[i + 1] : null;
  const prefix = `${name}=`;
  const inline = args.find((arg) => String(arg).startsWith(prefix));
  return inline === undefined ? null : String(inline).slice(prefix.length);
}

/**
 * Run a scraper entrypoint and turn "completed without writing anything" into
 * a real CLI failure. Entrypoints return the number of output files written.
 */
function runCli(main, label) {
  Promise.resolve()
    .then(main)
    .then((written) => {
      if (!Number.isInteger(written) || written < 1) {
        throw new Error("no output was written");
      }
    })
    .catch((error) => {
      const message = error && error.message ? error.message : String(error);
      console.error(`${label} failed: ${message}`);
      process.exitCode = 1;
    });
}

module.exports = {
  ab,
  sleep,
  evalJSON,
  evalJSONBase64,
  buildAgentBrowserInvocation,
  safeStr,
  scrollLoad,
  getArg,
  runCli,
};
