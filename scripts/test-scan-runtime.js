#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..");
const longUtilsPath = path.join(
  repoRoot,
  "skills/story-long-scan/scripts/cdp-utils.js"
);
const shortUtilsPath = path.join(
  repoRoot,
  "skills/story-short-scan/scripts/cdp-utils.js"
);

function makeFakeAgentBrowser(tmpDir) {
  const fakeProgram = `#!/usr/bin/env node
const fs = require("fs");
if (process.env.AGENT_BROWSER_CAPTURE) {
  fs.writeFileSync(process.env.AGENT_BROWSER_CAPTURE, JSON.stringify(process.argv.slice(2)));
}
process.stdout.write(process.env.AGENT_BROWSER_STDOUT || "");
if (process.env.AGENT_BROWSER_STDERR) {
  process.stderr.write(process.env.AGENT_BROWSER_STDERR);
}
if (process.env.AGENT_BROWSER_EXIT) {
  process.exit(Number(process.env.AGENT_BROWSER_EXIT));
}
`;
  if (process.platform === "win32") {
    const program = path.join(tmpDir, "fake-agent-browser.js");
    fs.writeFileSync(program, fakeProgram, "utf8");
    // `npm install -g agent-browser` writes an agent-browser.cmd whose `%*` line
    // forwards to the real target (the native .exe, or here the Node wrapper).
    // cdp-utils reads that shim and execs the target directly, so the argv array
    // is passed verbatim instead of collapsing through cmd.exe `%*` or a
    // PowerShell splat.
    fs.writeFileSync(
      path.join(tmpDir, "agent-browser.cmd"),
      `@echo off\r\n"${process.execPath}" "%~dp0fake-agent-browser.js" %*\r\n`,
      "utf8"
    );
    return path.join(tmpDir, "agent-browser.cmd");
  }

  const bin = path.join(tmpDir, "agent-browser");
  fs.writeFileSync(bin, fakeProgram, "utf8");
  fs.chmodSync(bin, 0o755);
  return bin;
}

function withFakeAgentBrowser(testFn) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "story-scan-runtime-"));
  const oldPath = process.env.PATH;
  const oldCapture = process.env.AGENT_BROWSER_CAPTURE;
  const oldStdout = process.env.AGENT_BROWSER_STDOUT;
  const oldStderr = process.env.AGENT_BROWSER_STDERR;
  const oldExit = process.env.AGENT_BROWSER_EXIT;
  try {
    delete process.env.AGENT_BROWSER_STDERR;
    delete process.env.AGENT_BROWSER_EXIT;
    makeFakeAgentBrowser(tmpDir);
    process.env.PATH = `${tmpDir}${path.delimiter}${oldPath}`;
    testFn(tmpDir);
  } finally {
    process.env.PATH = oldPath;
    if (oldCapture === undefined) delete process.env.AGENT_BROWSER_CAPTURE;
    else process.env.AGENT_BROWSER_CAPTURE = oldCapture;
    if (oldStdout === undefined) delete process.env.AGENT_BROWSER_STDOUT;
    else process.env.AGENT_BROWSER_STDOUT = oldStdout;
    if (oldStderr === undefined) delete process.env.AGENT_BROWSER_STDERR;
    else process.env.AGENT_BROWSER_STDERR = oldStderr;
    if (oldExit === undefined) delete process.env.AGENT_BROWSER_EXIT;
    else process.env.AGENT_BROWSER_EXIT = oldExit;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function loadFresh(modulePath) {
  delete require.cache[require.resolve(modulePath)];
  return require(modulePath);
}

function testCdpUtils(modulePath) {
  withFakeAgentBrowser((tmpDir) => {
    const capture = path.join(tmpDir, "argv.json");
    const injected = path.join(tmpDir, "must-not-exist");
    process.env.AGENT_BROWSER_CAPTURE = capture;
    process.env.AGENT_BROWSER_STDOUT = "ok\n";

    const utils = loadFresh(modulePath);
    assert.strictEqual(typeof utils.evalJSONBase64, "function");

    // argv 合约：① 注入安全——参数绝不进 shell 求值；② 逐字透传真实参数里会出现的元字符
    // ——空格、& | ^ ; $()、中文，以及 URL 里的 & 和 =。裸双引号/反斜杠不在合约内：带引号的
    // eval 载荷一律经 base64 下发（evalJSONBase64 / evalJSON），命令行参数只会是 base64 串、
    // URL 和这类无引号 token，Windows 的 .cmd/PowerShell 无法逐字透传裸双引号。
    const shellLikeArg = `$(touch ${injected})`;
    const urlLikeArg = "https://x.example/rank?a=1&b=2&c=d#top";
    const unicodeSpecialArg = `中文参数 / 空 格 & | ^ ! $() ; [] {} = '`;
    assert.strictEqual(
      utils.ab(
        9222,
        "eval",
        shellLikeArg,
        urlLikeArg,
        "space arg",
        unicodeSpecialArg
      ),
      "ok"
    );
    assert.strictEqual(fs.existsSync(injected), false, "ab() must not invoke a shell");
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(capture, "utf8")), [
      "--cdp",
      "9222",
      "eval",
      shellLikeArg,
      urlLikeArg,
      "space arg",
      unicodeSpecialArg,
    ]);

    process.env.AGENT_BROWSER_STDOUT = JSON.stringify(
      JSON.stringify({ ok: true, nested: "中文" })
    );
    assert.deepStrictEqual(utils.evalJSON(9222, "({ok:true})"), {
      ok: true,
      nested: "中文",
    });

    process.env.AGENT_BROWSER_CAPTURE = capture;
    assert.deepStrictEqual(utils.evalJSONBase64(9222, "window.__x = '$()'"), {
      ok: true,
      nested: "中文",
    });
    const base64Args = JSON.parse(fs.readFileSync(capture, "utf8"));
    assert.deepStrictEqual(base64Args.slice(0, 4), ["--cdp", "9222", "eval", "-b"]);
    assert.strictEqual(
      Buffer.from(base64Args[4], "base64").toString("utf8"),
      "window.__x = '$()'"
    );

    assert.strictEqual(utils.getArg(["--type=hot", "--top", "15"], "--type"), "hot");
    assert.strictEqual(utils.getArg(["--type=hot", "--top", "15"], "--top"), "15");
    assert.strictEqual(utils.getArg(["--top"], "--top"), null);

    process.env.AGENT_BROWSER_STDOUT = "";
    process.env.AGENT_BROWSER_STDERR = "CDP connection refused\n";
    process.env.AGENT_BROWSER_EXIT = "7";
    assert.throws(
      () => utils.ab(9222, "open", "https://example.com"),
      /agent-browser failed.*CDP connection refused/
    );

    delete process.env.AGENT_BROWSER_EXIT;
    delete process.env.AGENT_BROWSER_STDERR;
    process.env.AGENT_BROWSER_STDOUT = "not-json";
    assert.throws(
      () => utils.evalJSON(9222, "JSON.stringify({ok:true})"),
      /invalid JSON/
    );
  });
}

function testWindowsInvocationBuilder(modulePath) {
  const utils = loadFresh(modulePath);
  assert.strictEqual(typeof utils.buildAgentBrowserInvocation, "function");
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "story-scan-win-"));
  const oldPath = process.env.PATH;
  try {
    // npm's Windows shim: the `%*` line points to the real target (here the
    // native binary). buildAgentBrowserInvocation must resolve the shim to that
    // target and hand every argument to it as a distinct array element — never a
    // shell, never a space-joined string.
    fs.writeFileSync(
      path.join(tmpDir, "agent-browser.cmd"),
      `@ECHO off\r\n"%~dp0node_modules\\agent-browser\\bin\\agent-browser-win32-x64.exe" %*\r\n`,
      "utf8"
    );
    process.env.PATH = `${tmpDir}${path.delimiter}${oldPath}`;
    const shellLikeArg = '& calc.exe | echo "unsafe"';
    const unicodeSpecialArg = `中文参数 / 空 格 & | ^ ! $() ; [] {} = ' " \\`;
    const invocation = utils.buildAgentBrowserInvocation(
      9222,
      ["eval", shellLikeArg, "space arg", unicodeSpecialArg],
      "win32"
    );
    // Resolves to the native binary (Node refuses the .cmd; PowerShell collapses
    // the array) with every argument a distinct element — nothing shell-evaluated
    // or space-joined.
    assert.match(invocation.file, /agent-browser-win32-x64\.exe$/);
    assert.deepStrictEqual(invocation.args, [
      "--cdp",
      "9222",
      "eval",
      shellLikeArg,
      "space arg",
      unicodeSpecialArg,
    ]);
  } finally {
    process.env.PATH = oldPath;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function testScraperImports() {
  const scraperPaths = [
    ...fs
      .readdirSync(path.join(repoRoot, "skills/story-long-scan/scripts"))
      .filter((name) => name.endsWith("-scraper.js"))
      .map((name) => path.join(repoRoot, "skills/story-long-scan/scripts", name)),
    ...fs
      .readdirSync(path.join(repoRoot, "skills/story-short-scan/scripts"))
      .filter((name) => name.endsWith("-scraper.js"))
      .map((name) => path.join(repoRoot, "skills/story-short-scan/scripts", name)),
  ].sort();

  assert(scraperPaths.length >= 7, "expected all rank scraper modules");
  for (const scraperPath of scraperPaths) {
    const probe = spawnSync(
      process.execPath,
      [
        "-e",
        "const m=require(process.argv[1]); process.stdout.write(JSON.stringify(Object.keys(m).sort()));",
        scraperPath,
      ],
      { cwd: repoRoot, encoding: "utf8", timeout: 2000 }
    );
    assert.strictEqual(
      probe.error && probe.error.code,
      undefined,
      `${path.basename(scraperPath)} import timed out or failed to start`
    );
    assert.strictEqual(
      probe.status,
      0,
      `${path.basename(scraperPath)} import failed: ${probe.stderr || probe.stdout}`
    );
    assert.strictEqual(
      probe.stderr,
      "",
      `${path.basename(scraperPath)} emitted stderr while imported`
    );
    const exported = JSON.parse(probe.stdout || "[]");
    assert(
      exported.length > 0,
      `${path.basename(scraperPath)} must export testable helpers`
    );
  }
}

function testCliResultGate(modulePath) {
  const probe = (body) =>
    spawnSync(
      process.execPath,
      ["-e", `const {runCli}=require(process.argv[1]);${body}`, modulePath],
      { cwd: repoRoot, encoding: "utf8", timeout: 2000 }
    );

  const success = probe("runCli(() => 2, 'probe');");
  assert.strictEqual(success.status, 0, success.stderr);

  const empty = probe("runCli(() => 0, 'probe');");
  assert.strictEqual(empty.status, 1, "zero-output CLI runs must fail");
  assert.match(empty.stderr, /probe failed: no output was written/);

  const rejected = probe("runCli(async () => { throw new Error('boom'); }, 'probe');");
  assert.strictEqual(rejected.status, 1, "rejected CLI runs must fail");
  assert.match(rejected.stderr, /probe failed: boom/);
}

testCdpUtils(longUtilsPath);
testCdpUtils(shortUtilsPath);
testWindowsInvocationBuilder(longUtilsPath);
testScraperImports();
testCliResultGate(longUtilsPath);
console.log("OK: scan runtime uses shell-safe CDP calls and side-effect-free scraper modules");
