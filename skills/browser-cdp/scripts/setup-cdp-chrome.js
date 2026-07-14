#!/usr/bin/env node
// setup-cdp-chrome.js
// 准备带有 CDP（Chrome DevTools Protocol）调试功能的 Chrome 环境（跨平台）。
// 通过此脚本，agent-browser 可以复用用户的 Chrome 登录态。
//
// 用法:
//   node setup-cdp-chrome.js [port] [options]
//
// Options:
//   --detect-only            只探测当前状态（结构化输出），不做任何修改
//   --yes                    确认杀死现有 Chrome，跳过交互提示
//   --reset                  清空 ~/chrome-debug-profile 后重新复制
//   --profile <name>         使用指定 Chrome profile（默认: Default）
//   --dry-run                打印将执行的操作，不实际执行
//
// 退出码:
//   0  成功 / detect-only 完成
//   1  通用错误（环境缺失、超时等）
//   2  用户拒绝（TTY 模式下回答 N）
//   3  需要同意但当前为非 TTY 且未传 --yes
//
// detect-only 结构化输出（stdout，每行 KEY=value）:
//   CDP_STATUS=ready|needs-setup
//   CDP_URL=...                    (仅当 ready)
//   BROWSER=...                    (仅当 ready)
//   CHROME_RUNNING=yes|no
//   CHROME_PID_COUNT=N             (仅当 CHROME_RUNNING=yes)

"use strict";

const { execSync, spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");
const readline = require("readline");

// ---------------------------------------------------------------------------
// 参数解析
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const flags = { dryRun: false, yes: false, detectOnly: false, reset: false };
  let profile = "Default";
  let port = null;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "--dry-run": flags.dryRun = true; break;
      case "--yes": case "-y": flags.yes = true; break;
      case "--detect-only": flags.detectOnly = true; break;
      case "--reset": flags.reset = true; break;
      case "--profile":
        profile = argv[++i];
        if (!profile) {
          console.error("❌ --profile 需要一个参数（例如: --profile \"Profile 1\"）");
          process.exit(1);
        }
        break;
      default:
        if (/^\d+$/.test(a)) {
          port = parseInt(a, 10);
        } else if (a.startsWith("--")) {
          console.error(`⚠️  未知参数: ${a}`);
        } else {
          console.error(`⚠️  忽略参数: ${a}`);
        }
    }
  }

  if (port === null) port = 9222;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    console.error(`❌ 端口非法: ${port}。必须是 1-65535 的整数。`);
    process.exit(1);
  }

  return { flags, profile, port };
}

const ARGS = parseArgs(process.argv.slice(2));
const CDP_PORT = ARGS.port;
const PLATFORM = os.platform();

// ---------------------------------------------------------------------------
// 平台配置映射
// ---------------------------------------------------------------------------

const PLATFORM_CONFIG = {
  darwin: {
    chromePaths: [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    ],
    profileDir: path.join(
      os.homedir(),
      "Library",
      "Application Support",
      "Google",
      "Chrome"
    ),
    findChrome() {
      for (const p of this.chromePaths) if (fs.existsSync(p)) return p;
      return null;
    },
    listChromePids() {
      try {
        const out = execSync("pgrep -x 'Google Chrome'", { encoding: "utf-8" }).trim();
        return out.split("\n").map(Number).filter((n) => n > 0);
      } catch { return []; }
    },
    killChrome() {
      try { execSync("pkill -9 -x 'Google Chrome'", { stdio: "ignore" }); } catch {}
    },
  },
  win32: {
    chromePaths: [
      path.join(process.env["PROGRAMFILES(X86)"] || "", "Google", "Chrome", "Application", "chrome.exe"),
      path.join(process.env.PROGRAMFILES || "", "Google", "Chrome", "Application", "chrome.exe"),
      path.join(process.env.LOCALAPPDATA || "", "Google", "Chrome", "Application", "chrome.exe"),
    ],
    profileDir: path.join(
      process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"),
      "Google", "Chrome", "User Data"
    ),
    findChrome() {
      for (const p of this.chromePaths) if (p && fs.existsSync(p)) return p;
      return null;
    },
    listChromePids() {
      try {
        const out = execSync('tasklist /FI "IMAGENAME eq chrome.exe" /NH /FO CSV', { encoding: "utf-8" }).trim();
        return out.split("\n").map((line) => {
          const m = line.match(/"chrome.exe","(\d+)"/i);
          return m ? parseInt(m[1], 10) : 0;
        }).filter((n) => n > 0);
      } catch { return []; }
    },
    killChrome() {
      try { execSync("taskkill /F /IM chrome.exe", { stdio: "ignore" }); } catch {}
    },
  },
  linux: {
    chromePaths: [
      "/usr/bin/google-chrome-stable",
      "/usr/bin/google-chrome",
      "/opt/google/chrome/google-chrome",
    ],
    profileDir: path.join(os.homedir(), ".config", "google-chrome"),
    findChrome() {
      for (const p of this.chromePaths) if (fs.existsSync(p)) return p;
      return null;
    },
    listChromePids() {
      // 覆盖常见的 Chrome 进程命名
      const patterns = ["google-chrome-stable", "google-chrome", "chrome"];
      const pids = new Set();
      for (const pat of patterns) {
        try {
          const out = execSync(`pgrep -x ${pat}`, { encoding: "utf-8" }).trim();
          out.split("\n").map(Number).filter((n) => n > 0).forEach((n) => pids.add(n));
        } catch {}
      }
      return [...pids];
    },
    killChrome() {
      for (const pat of ["google-chrome-stable", "google-chrome", "chrome"]) {
        try { execSync(`pkill -9 -x ${pat}`, { stdio: "ignore" }); } catch {}
      }
    },
  },
};

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

function log(msg) { console.log(msg); }
function warn(msg) { console.warn("⚠️  " + msg); }
function ok(msg) { console.log("✅ " + msg); }
function err(msg) { console.error("❌ " + msg); }

function getConfig() {
  const config = PLATFORM_CONFIG[PLATFORM];
  if (!config) {
    err(`不支持的平台: ${PLATFORM}。支持 darwin/win32/linux。`);
    process.exit(1);
  }
  return config;
}

/** 同步等待 ms 毫秒（不依赖 setTimeout / 系统 sleep） */
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** HTTP GET 检查 CDP 端点。拒绝 4xx/5xx；自动 drain 防止 keep-alive 残留连接。 */
function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: 3000 }, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}`));
        } else {
          resolve(body);
        }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
  });
}

async function probeCDP(port) {
  try {
    const version = await httpGet(`http://127.0.0.1:${port}/json/version`);
    return version;
  } catch {
    return null;
  }
}

/** 复制文件（吞掉 ENOENT；其他错误打印一次警告供用户排查） */
function copyFileSafe(src, dest) {
  try {
    fs.copyFileSync(src, dest);
    return true;
  } catch (e) {
    if (e.code !== "ENOENT") {
      warn(`复制失败: ${src} -> ${dest} (${e.code || e.message})`);
    }
    return false;
  }
}

/** 递归复制目录 */
function copyDirRecursive(src, dest) {
  fs.cpSync(src, dest, { recursive: true, force: true });
}

/** 递归删除目录 */
function rmDirSafe(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

/**
 * 刷新登录态相关文件（在 debugProfile 已存在的"增量"路径上使用）。
 * 同时尝试 Chrome 当前可能存在的 Default/Cookies 与 Default/Network/Cookies，
 * 包含各类 -journal / -wal / -shm 旁路文件，以及 Google 账号登录数据。
 */
function refreshAuthFiles(srcDefault, destDefault) {
  const targets = [
    "Cookies", "Cookies-journal",
    "Login Data", "Login Data-journal",
    "Login Data For Account", "Login Data For Account-journal",
    "Web Data", "Web Data-journal",
    path.join("Network", "Cookies"),
    path.join("Network", "Cookies-journal"),
  ];
  let copied = 0;
  for (const rel of targets) {
    const src = path.join(srcDefault, rel);
    if (!fs.existsSync(src)) continue;
    const dest = path.join(destDefault, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (copyFileSafe(src, dest)) copied++;
  }
  return copied;
}

/** 清理 Chrome singleton 锁，避免上次崩溃后下次启动失败 */
function clearSingletonLocks(profileDir) {
  const names = ["SingletonLock", "SingletonCookie", "SingletonSocket"];
  for (const n of names) {
    try { fs.unlinkSync(path.join(profileDir, n)); } catch {}
  }
}

/** 等待 Chrome PID 列表为空 */
function waitForChromeExit(config, maxMs = 8000, stepMs = 500) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if (config.listChromePids().length === 0) return true;
    sleepSync(stepMs);
  }
  return false;
}

/** TTY 交互式问询 */
function promptYesNo(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(/^y(es)?$/i.test((answer || "").trim()));
    });
  });
}

// ---------------------------------------------------------------------------
// detect-only 模式
// ---------------------------------------------------------------------------

async function runDetectOnly(config) {
  const version = await probeCDP(CDP_PORT);
  if (version) {
    log("CDP_STATUS=ready");
    log(`CDP_URL=http://127.0.0.1:${CDP_PORT}/json/version`);
    // 尝试从 JSON 提取浏览器版本（容错）
    try {
      const obj = JSON.parse(version);
      if (obj.Browser) log(`BROWSER=${obj.Browser}`);
    } catch {}
    process.exit(0);
  }
  log("CDP_STATUS=needs-setup");
  const pids = config.listChromePids();
  if (pids.length > 0) {
    log("CHROME_RUNNING=yes");
    log(`CHROME_PID_COUNT=${pids.length}`);
  } else {
    log("CHROME_RUNNING=no");
  }
  process.exit(0);
}

// ---------------------------------------------------------------------------
// 同意流程：返回 true 继续，false 用户拒绝
// ---------------------------------------------------------------------------

async function ensureConsentToKill(pids) {
  if (pids.length === 0) return true;
  if (ARGS.flags.yes) return true;

  // 非 TTY：拒绝静默杀进程，给调用方（Claude / 上层脚本）一个明确信号
  if (!process.stdin.isTTY) {
    err(`NEEDS_CONSENT: ${pids.length} running Chrome process(es) will be killed.`);
    err(`Pass --yes to confirm (after asking the user), or stop Chrome manually first.`);
    process.exit(3);
  }

  // TTY：交互问询
  warn(`检测到 ${pids.length} 个正在运行的 Chrome 进程。`);
  warn("继续将杀死它们，你在常规 Chrome 中未保存的工作可能丢失。");
  return promptYesNo("继续？[y/N] ");
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

async function main() {
  const config = getConfig();
  const debugProfile = path.join(os.homedir(), "chrome-debug-profile");

  // 1) 检测 Chrome 可执行路径（detect-only 也需要 profileDir）
  const chromePath = config.findChrome();

  // detect-only：不修改任何状态
  if (ARGS.flags.detectOnly) {
    if (!chromePath) {
      log("CDP_STATUS=needs-setup");
      log("CHROME_INSTALLED=no");
      process.exit(0);
    }
    return runDetectOnly(config);
  }

  log("=== CDP Chrome 环境准备 ===");
  log(`平台: ${PLATFORM} | CDP 端口: ${CDP_PORT} | profile: ${ARGS.profile}`);

  if (!chromePath) {
    err("未找到 Google Chrome。请确保已安装。");
    err(`搜索路径: ${JSON.stringify(config.chromePaths, null, 2)}`);
    process.exit(1);
  }
  log(`Chrome 路径: ${chromePath}`);

  // 2) dry-run：先于任何副作用（包括"复用现有 CDP"）打印计划，让用户能看到真要执行时的步骤
  const defaultProfile = path.join(config.profileDir, ARGS.profile);
  const hasProfile = fs.existsSync(defaultProfile);

  if (ARGS.flags.dryRun) {
    const cdpAlive = !!(await probeCDP(CDP_PORT));
    log(`Chrome profile: ${defaultProfile} (${hasProfile ? "存在" : "不存在"})`);
    log(`CDP 端口 ${CDP_PORT}: ${cdpAlive ? "已就绪（实际运行时会直接复用）" : "未监听"}`);
    const runningPids = config.listChromePids();
    log(`检测到 ${runningPids.length} 个 Chrome 进程`);
    log("\n--- dry-run 模式：只打印操作，不执行 ---");
    if (cdpAlive) {
      log("0. CDP 已就绪，实际运行会直接复用并退出 0（以下步骤仅供参考）");
    }
    if (ARGS.flags.reset) log(`1. 删除 ${debugProfile}`);
    if (runningPids.length > 0) {
      log(`2. ${ARGS.flags.yes ? "（已同意）" : "请求同意后 "}杀死 ${runningPids.length} 个 Chrome 进程`);
    } else {
      log("2. 无 Chrome 进程，无需杀死");
    }
    if (hasProfile) {
      log(`3. 复制 profile: ${defaultProfile} -> ${debugProfile}/Default`);
    } else {
      log("3. ⚠️ 无用户 profile，将以空 profile 启动");
    }
    log("4. 清理 SingletonLock / SingletonCookie / SingletonSocket");
    log(`5. 启动 Chrome（含 --remote-allow-origins=*, --no-first-run 等）`);
    log(`6. 验证 http://127.0.0.1:${CDP_PORT}/json/version`);
    ok("dry-run 完成。");
    process.exit(0);
  }

  // 3) 若 CDP 已就绪 → 复用，直接退出
  const existing = await probeCDP(CDP_PORT);
  if (existing) {
    ok("CDP 已就绪，复用现有 Chrome。");
    log(existing.split("\n").slice(0, 5).join("\n"));
    process.exit(0);
  }

  if (!hasProfile) {
    err(`未找到 Chrome profile: ${defaultProfile}`);
    err("请确保已安装 Google Chrome 并至少使用过一次，或用 --profile <name> 指定其他 profile。");
    process.exit(1);
  }

  // 4) 同意流程：如有 Chrome 进程要杀，先征得同意
  const runningPids = config.listChromePids();
  const consented = await ensureConsentToKill(runningPids);
  if (!consented) {
    err("用户拒绝，已中止。");
    process.exit(2);
  }

  // 5) 杀死现有 Chrome 进程，等待退出
  if (runningPids.length > 0) {
    log(`正在停止 ${runningPids.length} 个 Chrome 进程...`);
    config.killChrome();
    if (!waitForChromeExit(config, 6000)) {
      warn("首轮 kill 后仍有 Chrome 进程，再试一次...");
      config.killChrome();
      waitForChromeExit(config, 4000);
    }
    const remain = config.listChromePids();
    if (remain.length > 0) {
      warn(`仍有 ${remain.length} 个 Chrome 进程未退出，继续尝试启动（可能失败）`);
    } else {
      ok("Chrome 已退出。");
    }
  }

  // 6) --reset：清空 debug profile
  if (ARGS.flags.reset) {
    log(`正在删除 debug profile: ${debugProfile}`);
    rmDirSafe(debugProfile);
  }

  // 7) 复制 / 刷新 profile（此时 Chrome 已关闭，SQLite 一致）
  const debugDefault = path.join(debugProfile, "Default");
  if (!fs.existsSync(debugDefault)) {
    log("正在复制 Chrome profile 到 debug 目录...");
    fs.mkdirSync(debugProfile, { recursive: true });
    try { fs.chmodSync(debugProfile, 0o700); } catch {}
    copyDirRecursive(defaultProfile, debugDefault);
    ok(`Profile 已复制到: ${debugProfile}`);
  } else {
    log("debug profile 已存在，刷新登录态相关文件...");
    try { fs.chmodSync(debugProfile, 0o700); } catch {}
    const n = refreshAuthFiles(defaultProfile, debugDefault);
    ok(`已刷新 ${n} 个登录态文件`);
  }

  // 8) 清理 singleton 锁
  clearSingletonLocks(debugProfile);

  // 9) 以 CDP 模式启动 Chrome
  log(`正在以 CDP 模式启动 Chrome（端口 ${CDP_PORT}）...`);
  const chromeArgs = [
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${debugProfile}`,
    "--remote-allow-origins=*",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-features=ChromeWhatsNewUI",
  ];
  const child = spawn(chromePath, chromeArgs, { detached: true, stdio: "ignore" });
  const childPid = child.pid;
  child.unref();

  // 10) 等待启动并验证
  log("等待 Chrome 启动...");
  for (let i = 1; i <= 15; i++) {
    sleepSync(2000);
    const version = await probeCDP(CDP_PORT);
    if (version) {
      ok(`Chrome 已成功以 CDP 模式启动（端口 ${CDP_PORT}）`);
      log(version.split("\n").slice(0, 5).join("\n"));
      process.exit(0);
    }
    log(`   尝试 ${i}/15...`);
  }

  // 11) 失败清理：杀死刚才启动的孤儿 Chrome
  err("30 秒内未能启动 Chrome CDP 环境。");
  err("正在清理刚启动的 Chrome 进程...");
  if (childPid) {
    try { process.kill(childPid); } catch {}
  }
  config.killChrome();
  err("可能原因：");
  err("  - Chrome 不支持 --remote-debugging-port");
  err(`  - 端口 ${CDP_PORT} 已被其他进程占用`);
  err("  - debug profile 目录已损坏（试试 --reset）");
  process.exit(1);
}

main().catch((e) => {
  err(`启动失败: ${e.message}`);
  process.exit(1);
});
