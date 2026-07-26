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

// ---------------------------------------------------------------------------
// 采集脚本 end-to-end 夹具：一个按 eval 载荷分派响应的 agent-browser 替身，
// 加一个把 sleep/scrollLoad 掉空的预加载，让整条 main() 流程能在毫秒级跑完。
// ---------------------------------------------------------------------------

const SCRIPTED_AGENT_BROWSER = `#!/usr/bin/env node
"use strict";
const argv = process.argv.slice(2);
const evalIdx = argv.indexOf("eval");
const idx = evalIdx >= 0 ? evalIdx : argv.indexOf("open");
function out(value) {
  process.stdout.write(JSON.stringify(JSON.stringify(value)));
  process.exit(0);
}
if (argv[idx] === "open") {
  const url = argv[idx + 1] || "";
  if (process.env.SCAN_FAKE_FAIL_OPEN && url.indexOf(process.env.SCAN_FAKE_FAIL_OPEN) > -1) {
    process.stderr.write("navigate timeout\\n");
    process.exit(3);
  }
  process.exit(0);
}
const js =
  argv[idx + 1] === "-b"
    ? Buffer.from(argv[idx + 2] || "", "base64").toString("utf8")
    : argv[idx + 1] || "";
if (js.indexOf("host:location.host") > -1) {
  out({ host: process.env.SCAN_FAKE_HOST || "www.jjwxc.net", len: 5000 });
}
if (js.indexOf("onebook.php") > -1) {
  // 晋江详情批次：模拟 ab() 的 20s 超时/非 JSON 返回
  if (process.env.SCAN_FAKE_FAIL_DETAIL) {
    process.stderr.write("spawnSync agent-browser ETIMEDOUT\\n");
    process.exit(1);
  }
  out({ 1: { id: "1", collect: "12345", words: "300000", status: "连载中" } });
}
if (js.indexOf("result={channels:[]}") > -1) {
  out({ channels: [{ name: "古代言情", books: [{ title: "甲书", author: "作者甲", novelid: "1" }] }] });
}
if (js.indexOf("blocked") > -1) out({ blocked: false, reason: "" });
if (js.indexOf("book-img-text") > -1) {
  out([
    {
      rank: 1,
      title: "起点甲书",
      url: "https://www.qidian.com/book/1/",
      author: "起作者",
      genre: "玄幻",
      status: "连载中",
      descText: "简介",
      updateText: "",
    },
  ]);
}
out({});
`;

const SLEEP_STUB = `// 预加载：掉空 sleep/scrollLoad，采集脚本的真实等待不必在测试里等
const utils = require(process.env.SCAN_TEST_UTILS);
utils.sleep = () => {};
if (process.env.SCAN_TEST_STUB_SCROLL) utils.scrollLoad = () => {};
`;

/** 在 tmpDir 里铺好 agent-browser 替身（含 Windows 的 .cmd shim）+ sleep 预加载 */
function makeScraperHarness(tmpDir) {
  const program = path.join(tmpDir, "fake-agent-browser.js");
  fs.writeFileSync(program, SCRIPTED_AGENT_BROWSER, "utf8");
  if (process.platform === "win32") {
    fs.writeFileSync(
      path.join(tmpDir, "agent-browser.cmd"),
      `@echo off\r\n"${process.execPath}" "%~dp0fake-agent-browser.js" %*\r\n`,
      "utf8"
    );
  } else {
    const bin = path.join(tmpDir, "agent-browser");
    fs.writeFileSync(bin, SCRIPTED_AGENT_BROWSER, "utf8");
    fs.chmodSync(bin, 0o755);
  }
  const preload = path.join(tmpDir, "stub-sleep.js");
  fs.writeFileSync(preload, SLEEP_STUB, "utf8");
  return preload;
}

/** 跑一个采集脚本的 CLI 主流程，返回 { status, stdout, stderr, files } */
function runScraper(scraperPath, args, env) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "story-scan-e2e-"));
  try {
    const preload = makeScraperHarness(tmpDir);
    const outdir = path.join(tmpDir, "out");
    const result = spawnSync(
      process.execPath,
      ["--require", preload, scraperPath, ...args, "--outdir", outdir],
      {
        cwd: repoRoot,
        encoding: "utf8",
        timeout: 60000,
        env: {
          ...process.env,
          PATH: `${tmpDir}${path.delimiter}${process.env.PATH}`,
          SCAN_TEST_UTILS: path.join(path.dirname(scraperPath), "cdp-utils.js"),
          ...env,
        },
      }
    );
    const files = fs.existsSync(outdir) ? fs.readdirSync(outdir).sort() : [];
    const contents = files.map((name) =>
      fs.readFileSync(path.join(outdir, name), "utf8")
    );
    return { ...result, files, contents };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
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

function listScraperPaths() {
  return [
    ...fs
      .readdirSync(path.join(repoRoot, "skills/story-long-scan/scripts"))
      .filter((name) => name.endsWith("-scraper.js"))
      .map((name) => path.join(repoRoot, "skills/story-long-scan/scripts", name)),
    ...fs
      .readdirSync(path.join(repoRoot, "skills/story-short-scan/scripts"))
      .filter((name) => name.endsWith("-scraper.js"))
      .map((name) => path.join(repoRoot, "skills/story-short-scan/scripts", name)),
  ].sort();
}

function testScraperImports() {
  const scraperPaths = listScraperPaths();

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

// 输出文件名的日期戳必须是本地日历日。用 UTC（toISOString）的话，UTC+8 作者在本地
// 00:00-08:00 之间采集会退回前一天的文件名——文件名是唯一去重键，前一晚的报告被静默覆盖。
function testLocalDateStamp(modulePath) {
  const utils = loadFresh(modulePath);
  assert.strictEqual(typeof utils.localDateStamp, "function");

  // new Date(y,m,d,...) 按本地时间构造，因此这两条断言与宿主时区无关
  assert.strictEqual(utils.localDateStamp(new Date(2026, 6, 27, 0, 30)), "20260727");
  assert.strictEqual(utils.localDateStamp(new Date(2026, 0, 1, 23, 59)), "20260101");
  assert.match(utils.localDateStamp(), /^\d{8}$/);

  // 回归点本体：北京时间 2026-07-27 07:30 的那一刻，UTC 日期还是 07-26
  const probe = spawnSync(
    process.execPath,
    [
      "-e",
      "const {localDateStamp}=require(process.argv[1]);" +
        'const d=new Date("2026-07-26T23:30:00Z");' +
        "process.stdout.write(JSON.stringify({local:localDateStamp(d)," +
        'utc:d.toISOString().slice(0,10).replace(/-/g,""),offset:d.getTimezoneOffset()}));',
      modulePath,
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: 5000,
      env: { ...process.env, TZ: "Asia/Shanghai" },
    }
  );
  assert.strictEqual(probe.status, 0, probe.stderr);
  const seen = JSON.parse(probe.stdout);
  // 只有运行时真的认了 TZ=Asia/Shanghai 才断言跨日界行为（Windows 上 TZ 可能被忽略）
  if (seen.offset === -480) {
    assert.strictEqual(seen.utc, "20260726", "UTC 日期确实落在前一天");
    assert.strictEqual(seen.local, "20260727", "文件名日期必须跟本地日历日");
  }
}

// 静态守卫：任何采集脚本都不许再用 UTC 日期拼文件名
function testScraperFilenameDatesAreLocal() {
  for (const scraperPath of listScraperPaths()) {
    const src = fs.readFileSync(scraperPath, "utf8");
    const name = path.basename(scraperPath);
    assert(
      !/toISOString\(\)\s*\.slice\(0,\s*10\)/.test(src),
      `${name}: 文件名日期不能用 UTC（toISOString().slice(0,10)），必须用 localDateStamp()`
    );
    assert(
      src.includes("localDateStamp()"),
      `${name}: 输出文件名必须用 localDateStamp() 取本地日历日`
    );
  }
}

// 晋江：详情批次瞬时失败只该丢详情，不该丢已解析的列表，更不该掐掉后面的榜单
function testJjwxcDetailFailureIsolation() {
  const scraper = path.join(
    repoRoot,
    "skills/story-long-scan/scripts/jjwxc-rank-scraper.js"
  );
  const run = runScraper(scraper, ["--type", "all"], {
    SCAN_FAKE_FAIL_DETAIL: "1",
  });
  assert.strictEqual(
    run.status,
    0,
    `详情失败不该让整轮采集失败: ${run.stderr || run.stdout}`
  );
  assert.strictEqual(
    run.files.length,
    6,
    `--type all 的 6 个榜单都应落盘，实际 ${run.files.length}: ${run.files.join(", ")}`
  );
  assert.match(run.stderr, /详情批次 1（1 本）获取失败，跳过/);
  for (const content of run.contents) {
    assert.match(content, /数据质量：\[详情解析异常\/登录态缺失\]/);
    assert.match(content, /### #1 甲书/, "已解析的列表数据必须保住");
  }

  // 对照：详情正常时质量门不误报
  const healthy = runScraper(scraper, ["--type", "12"], {});
  assert.strictEqual(healthy.status, 0, healthy.stderr);
  assert.strictEqual(healthy.files.length, 1);
  assert.match(healthy.contents[0], /数据质量：\[OK\]/);
  assert.match(healthy.contents[0], /收藏 1\.2万/);
}

// 起点：一个榜单打不开只跳这一个，剩下 9 个照采（--type all 不再被一次超时掐死）
function testQidianRankIsolation() {
  const scraper = path.join(
    repoRoot,
    "skills/story-long-scan/scripts/qidian-rank-scraper.js"
  );
  const run = runScraper(scraper, ["--type", "all", "--mode", "cdp"], {
    SCAN_FAKE_FAIL_OPEN: "hotsales",
    SCAN_FAKE_HOST: "www.qidian.com",
    SCAN_TEST_STUB_SCROLL: "1",
  });
  assert.strictEqual(
    run.status,
    0,
    `单个榜单失败不该让整轮采集失败: ${run.stderr || run.stdout}`
  );
  assert.match(run.stderr, /\[qidian\] 畅销榜 采集失败，跳过/);
  assert.strictEqual(
    run.files.length,
    9,
    `失败的畅销榜之外 9 个榜单都应落盘，实际 ${run.files.length}: ${run.files.join(", ")}`
  );
  assert(
    !run.files.some((name) => name.startsWith("起点畅销榜_")),
    "打不开的榜单不该写出空文件"
  );

  // 参数错误仍要快速失败，不能被 per-榜单隔离吞掉
  const badMode = runScraper(scraper, ["--type", "all", "--mode", "bogus"], {});
  assert.strictEqual(badMode.status, 1, "未知 --mode 必须失败");
  assert.match(badMode.stderr, /未知 --mode: bogus/);
  assert.strictEqual(badMode.files.length, 0);
}

// 黑岩：字段漂移必须拦在写盘前，字数格式不许随宿主 locale 变
function testHeiyanFieldDriftAndWordFormat() {
  const heiyan = loadFresh(
    path.join(repoRoot, "skills/story-short-scan/scripts/heiyan-booklist-scraper.js")
  );
  assert.strictEqual(typeof heiyan.fmtWords, "function");
  assert.strictEqual(heiyan.fmtWords(123456), "123,456字");
  assert.strictEqual(heiyan.fmtWords("123456"), "123,456字");
  assert.strictEqual(heiyan.fmtWords(0), "");
  assert.strictEqual(heiyan.fmtWords(undefined), "");

  // toLocaleString() 在 de_* 下会写成 123.456（读起来像 123 字），fmtWords 必须不受影响
  const probe = spawnSync(
    process.execPath,
    [
      "-e",
      "const {fmtWords}=require(process.argv[1]);process.stdout.write(fmtWords(123456));",
      path.join(repoRoot, "skills/story-short-scan/scripts/heiyan-booklist-scraper.js"),
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: 5000,
      env: { ...process.env, LC_ALL: "de_DE.UTF-8", LANG: "de_DE.UTF-8" },
    }
  );
  assert.strictEqual(probe.status, 0, probe.stderr);
  assert.strictEqual(probe.stdout, "123,456字", "字数格式不能跟宿主 locale 变");

  // 缺字段不能被拼成 "undefined/undefined" 写进报告
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "story-scan-heiyan-"));
  try {
    const filepath = path.join(tmpDir, "out.md");
    const books = [
      { name: "甲书", userName: "作者甲", classifyStr: "男频", typeDesc: "都市", words: 123456 },
      { name: "乙书", userName: "作者乙", classifyStr: "女频", typeDesc: null, words: 50000 },
    ];
    const origLog = console.log;
    console.log = () => {};
    try {
      heiyan.buildAndSave(books, 2, books, filepath);
    } finally {
      console.log = origLog;
    }
    const written = fs.readFileSync(filepath, "utf8");
    assert(!written.includes("undefined"), `报告里不能出现 undefined:\n${written}`);
    assert(!written.includes("/null"), `报告里不能出现 null:\n${written}`);
    assert(written.includes("*作者甲 · 男频/都市 · 123,456字 · 未公开*"), written);
    assert(written.includes("*作者乙 · 女频 · 50,000字 · 未公开*"), written);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

testCdpUtils(longUtilsPath);
testCdpUtils(shortUtilsPath);
testWindowsInvocationBuilder(longUtilsPath);
testLocalDateStamp(longUtilsPath);
testLocalDateStamp(shortUtilsPath);
testScraperFilenameDatesAreLocal();
testScraperImports();
testCliResultGate(longUtilsPath);
testJjwxcDetailFailureIsolation();
testQidianRankIsolation();
testHeiyanFieldDriftAndWordFormat();
console.log("OK: scan runtime uses shell-safe CDP calls and side-effect-free scraper modules");
