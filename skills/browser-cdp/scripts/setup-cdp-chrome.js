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
// 说明：CDP 端口已在监听时默认直接复用现有 Chrome 并退出 0；但传了 --reset 或显式
//       --profile 时不复用——这两个参数就是要重建 debug profile（登录态过期即走这条路），
//       会先关闭现有 Chrome（非 TTY 下需 --yes，否则 exit 3 报 NEEDS_CONSENT）。
//       重建路径上有两道硬闸门：关完进程后端口必须真的不再应答（否则在动 profile 之前就
//       exit 1 中止，绝不删一个还在运行的 Chrome 的 profile）；启动后应答的实例身份必须
//       与重建前不同且 spawn 出的进程还活着（否则拒绝报成功，避免把旧会话当新浏览器交出去）。
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
  // 是否显式传了 --profile：默认值 "Default" 无法区分「没传」和「传了 Default」，
  // 而这两种情况在"CDP 已就绪"分支上的语义不同（复用 vs 按指定 profile 重建）
  let profileExplicit = false;
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
        profileExplicit = true;
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

  return { flags, profile, profileExplicit, port };
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

/**
 * HTTP GET 检查 CDP 端点。拒绝 4xx/5xx；自动 drain 掉响应体。
 * agent:false 是必须的——Node 19+ 的 http.globalAgent 默认 keepAlive，探测用过的 socket 会留在
 * 连接池里；而本脚本用 sleepSync 死堵事件循环（等进程退出/等启动），期间服务端按 5s 空闲把这条
 * 连接关掉，客户端来不及处理 FIN。下一次探测复用这条死 socket 就是 ECONNRESET，于是"端口还活着"
 * 被误判成"没人应答"。这种假阴性会直接骗过下面的端口闸门，必须一次一条新连接。
 */
function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: 3000, agent: false }, (res) => {
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

/**
 * 从 /json/version 响应里取一个能区分「实例」的标识。
 * Chrome 每次启动都会换一个新的 browser GUID（webSocketDebuggerUrl 尾段），最适合做这件事。
 * 取不到就返回 null——调用方必须把 null 当作「无法比对」，绝不能当作「相同」或「不同」。
 */
function cdpIdentity(version) {
  if (!version) return null;
  try {
    const obj = JSON.parse(version);
    if (obj.webSocketDebuggerUrl) return String(obj.webSocketDebuggerUrl);
  } catch {}
  return null;
}

/**
 * 等 CDP 端口真的不再应答；true = 端口已空出来，false = 超时后仍有人应答。
 * 要连续 needQuiet 次都探不到才算空——单次探测失败（瞬时重置、连接被丢）不足以解锁后面
 * 那些破坏性操作（删 profile、启新进程）。端口真的关了的话连接是立刻被拒的，代价很小。
 */
async function waitForPortFree(port, maxMs = 8000, stepMs = 500, needQuiet = 2) {
  const start = Date.now();
  let quiet = 0;
  for (;;) {
    if (await probeCDP(port)) {
      quiet = 0;
    } else if (++quiet >= needQuiet) {
      return true;
    }
    if (Date.now() - start >= maxMs) return false;
    sleepSync(stepMs);
  }
}

/** 尽力查出占用端口的进程，只用于诊断（查不到就返回 null，不影响判定） */
function describePortHolder(port) {
  const cmd =
    PLATFORM === "win32"
      ? `netstat -ano -p tcp | findstr LISTENING | findstr :${port}`
      : `lsof -nP -iTCP:${port} -sTCP:LISTEN`;
  try {
    const out = execSync(cmd, {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const line = out
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !/^COMMAND\s/.test(l))[0];
    return line ? line.slice(0, 200) : null;
  } catch {
    return null;
  }
}

/** spawn 出来的 Chrome 是否还活着（exitCode/signalCode 权威，兜底 kill(pid,0)） */
function isChildAlive(child) {
  if (!child || !child.pid) return false;
  if (child.exitCode !== null || child.signalCode !== null) return false;
  try {
    process.kill(child.pid, 0);
    return true;
  } catch {
    return false;
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
    // --reset / 显式 --profile 会跳过复用（见下方第 3 步），dry-run 必须照实说
    const willReuse = cdpAlive && !ARGS.flags.reset && !ARGS.profileExplicit;
    const cdpNote = !cdpAlive
      ? "未监听"
      : willReuse
        ? "已就绪（实际运行时会直接复用）"
        : "已就绪（但传了 --reset/--profile，实际运行会重建，不复用）";
    log(`Chrome profile: ${defaultProfile} (${hasProfile ? "存在" : "不存在"})`);
    log(`CDP 端口 ${CDP_PORT}: ${cdpNote}`);
    const runningPids = config.listChromePids();
    log(`检测到 ${runningPids.length} 个 Chrome 进程`);
    log("\n--- dry-run 模式：只打印操作，不执行 ---");
    if (willReuse) {
      log("0. CDP 已就绪，实际运行会直接复用并退出 0（以下步骤仅供参考）");
    } else if (cdpAlive) {
      log("0. CDP 已就绪，但传了 --reset/--profile：实际运行不复用，按下列步骤重建");
    }
    // 步骤号按真实执行顺序动态编号：先杀进程、再确认端口空了，之后才碰 profile 目录
    let stepNo = 0;
    const step = (msg) => log(`${++stepNo}. ${msg}`);
    if (runningPids.length > 0) {
      step(`${ARGS.flags.yes ? "（已同意）" : "请求同意后 "}杀死 ${runningPids.length} 个 Chrome 进程`);
    } else {
      step("无 Chrome 进程，无需杀死");
    }
    if (cdpAlive) {
      step(`确认端口 ${CDP_PORT} 上的旧实例已不再应答（仍在应答则中止：不删 profile、不启动）`);
    }
    if (ARGS.flags.reset) step(`删除 ${debugProfile}`);
    if (hasProfile) {
      step(`复制 profile: ${defaultProfile} -> ${debugProfile}/Default`);
    } else {
      step("⚠️ 无用户 profile，将以空 profile 启动");
    }
    step("清理 SingletonLock / SingletonCookie / SingletonSocket");
    step("启动 Chrome（含 --remote-allow-origins=*, --no-first-run 等）");
    step(`验证 http://127.0.0.1:${CDP_PORT}/json/version 来自新实例（身份已变 + 进程存活）`);
    ok("dry-run 完成。");
    process.exit(0);
  }

  // 3) 若 CDP 已就绪 → 复用，直接退出。
  //    但 --reset / 显式 --profile 的语义就是"重建 debug profile"：登录态过期时文档正是
  //    让用户跑 --reset，而那时 CDP 恰恰是活着的（过期是从这个会话里发现的）。若照旧复用，
  //    这两个参数会被静默丢掉，还以 exit 0 报"成功"。因此这两种情况不复用，继续往下重建。
  const existing = await probeCDP(CDP_PORT);
  if (existing) {
    if (!ARGS.flags.reset && !ARGS.profileExplicit) {
      ok("CDP 已就绪，复用现有 Chrome。");
      log(existing.split("\n").slice(0, 5).join("\n"));
      process.exit(0);
    }
    const requested = ARGS.flags.reset ? "--reset" : `--profile ${ARGS.profile}`;
    warn(`CDP 端口 ${CDP_PORT} 已在监听，但传了 ${requested}：不复用，将关闭现有 Chrome 后重建 debug profile。`);
  }
  // 重建前那个实例的身份：第 10 步要靠它证明「应答的是新起的实例」，而不只是「有人应答」
  const staleIdentity = cdpIdentity(existing);

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

  // 5.5) 硬闸门：端口必须真的空出来，才允许动 profile 目录、才允许启动新实例。
  //      顺序是刻意的——闸门在删 profile 之前。旧实例还活着就往下走会撞上最坏的一种结果：
  //      先删掉一个正在运行的 Chrome 的 profile（本身就是破坏性的），新进程又因端口被占起不来，
  //      而第 10 步的 probeCDP 恰好被旧端点答上，于是 exit 0 报「重建成功」——调用方以为拿到了
  //      新浏览器，之后每一次采集读的都是旧会话/别人的会话。这里只能硬失败。
  //      仅在重建前确实探到过 CDP 时才等（existing 为空时端口本来就没人应答，不给复用路径加开销）。
  if (existing) {
    // 杀过进程才值得给宽限期（Chrome 退出到端口真正释放有延迟）；一个 Chrome 进程都没找到时
    // 没人被要求退出，端口不会自己空出来，确认几次还在应答就直接报错，不干等。
    const graceMs = runningPids.length > 0 ? 8000 : 1000;
    if (!(await waitForPortFree(CDP_PORT, graceMs))) {
      const remain = config.listChromePids();
      err(`CDP 端口 ${CDP_PORT} 上的旧实例仍在应答，已中止。`);
      if (remain.length > 0) {
        err(`原因：${remain.length} 个 Chrome 进程没能退出（kill 无效，可能权限不足或进程卡死）。`);
      } else if (runningPids.length === 0) {
        err("原因：端口被无法识别的进程占用——没找到任何 Chrome 进程，脚本无从关闭它。");
      } else {
        err("原因：Chrome 进程已退出，但端口仍被占用（另有进程守着这个端口）。");
      }
      const holder = describePortHolder(CDP_PORT);
      if (holder) err(`占用者：${holder}`);
      err("未删除、未改动 debug profile，也未启动新 Chrome——状态保持原样。");
      err(`处理办法：手动结束占用 ${CDP_PORT} 的进程后重跑，或换一个端口（node setup-cdp-chrome.js <其他端口> ...）。`);
      process.exit(1);
    }
    ok(`CDP 端口 ${CDP_PORT} 已释放。`);
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
  let spawnError = null;
  child.on("error", (e) => { spawnError = e; });
  child.unref();

  /** 启动后验证没过：只清掉自己刚起的进程（端口上那个不是我们的，不该连坐杀别人的 Chrome） */
  function abortAfterLaunch(reasons) {
    for (const line of reasons) err(line);
    err("正在清理刚启动的 Chrome 进程...");
    if (childPid) {
      try { process.kill(childPid); } catch {}
    }
    process.exit(1);
  }

  // 10) 等待启动并验证。光有人应答不算成功——那可能是没被关掉的旧实例。三条都过才算：
  //     ① 第 5.5 步已确认旧端点消失过；② 新端点的 browser GUID 与重建前不同；
  //     ③ 刚 spawn 的进程还活着（它死了，端口上应答的就一定不是本次启动的实例）。
  log("等待 Chrome 启动...");
  for (let i = 1; i <= 15; i++) {
    sleepSync(2000);
    if (spawnError) {
      abortAfterLaunch([`启动 Chrome 失败: ${spawnError.message}`]);
    }
    const version = await probeCDP(CDP_PORT);
    if (version) {
      const identity = cdpIdentity(version);
      if (staleIdentity && identity && identity === staleIdentity) {
        abortAfterLaunch([
          `端口 ${CDP_PORT} 应答的仍是重建前那个实例（${identity}），不是新启动的 Chrome。`,
          "拒绝报成功：再往下用，每一次采集读到的都会是旧会话。",
        ]);
      }
      if (!isChildAlive(child)) {
        const holder = describePortHolder(CDP_PORT);
        abortAfterLaunch([
          `端口 ${CDP_PORT} 上有 CDP 应答，但刚启动的 Chrome（pid ${childPid}）已经退出。`,
          "拒绝报成功：这个端点不属于本次启动的实例。",
          ...(holder ? [`占用者：${holder}`] : []),
          `处理办法：确认 ${CDP_PORT} 没被别的进程占用，或换一个端口重跑。`,
        ]);
      }
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
