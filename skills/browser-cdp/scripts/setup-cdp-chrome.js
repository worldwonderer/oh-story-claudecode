#!/usr/bin/env node
// setup-cdp-chrome.js
// 准备带有 CDP（Chrome DevTools Protocol）调试功能的 Chrome 环境（跨平台）。
// 通过此脚本，agent-browser 可以复用用户的 Chrome 登录态。
//
// 用法: node setup-cdp-chrome.js [端口号] [--dry-run]
//   端口号: CDP 调试端口（默认: 9222）
//   --dry-run: 只打印检测到的路径和操作，不执行

"use strict";

const { execSync, spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const net = require("net");
const os = require("os");
const path = require("path");

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const CDP_PORT = parseInt(args.find((a) => a !== "--dry-run") || "9222", 10);
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
    findChrome: () => {
      for (const p of PLATFORM_CONFIG.darwin.chromePaths) {
        if (fs.existsSync(p)) return p;
      }
      return null;
    },
    listChromePids: () => {
      try {
        const out = execSync("pgrep -x 'Google Chrome'", {
          encoding: "utf-8",
        }).trim();
        return out
          .split("\n")
          .map(Number)
          .filter((n) => n > 0);
      } catch {
        return [];
      }
    },
    killChrome: () => {
      try { execSync("pkill -9 -x 'Google Chrome'", { stdio: "ignore" }); } catch {}
    },
  },
  win32: {
    chromePaths: [
      path.join(
        process.env["PROGRAMFILES(X86)"] || "",
        "Google",
        "Chrome",
        "Application",
        "chrome.exe"
      ),
      path.join(
        process.env.PROGRAMFILES || "",
        "Google",
        "Chrome",
        "Application",
        "chrome.exe"
      ),
      path.join(
        process.env.LOCALAPPDATA || "",
        "Google",
        "Chrome",
        "Application",
        "chrome.exe"
      ),
    ],
    profileDir: path.join(
      process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local"),
      "Google",
      "Chrome",
      "User Data"
    ),
    findChrome: () => {
      for (const p of PLATFORM_CONFIG.win32.chromePaths) {
        if (p && fs.existsSync(p)) return p;
      }
      return null;
    },
    listChromePids: () => {
      try {
        const out = execSync('tasklist /FI "IMAGENAME eq chrome.exe" /NH /FO CSV', {
          encoding: "utf-8",
        }).trim();
        return out
          .split("\n")
          .map((line) => {
            const m = line.match(/"chrome.exe","(\d+)"/i);
            return m ? parseInt(m[1], 10) : 0;
          })
          .filter((n) => n > 0);
      } catch {
        return [];
      }
    },
    killChrome: () => {
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
    findChrome: () => {
      for (const p of PLATFORM_CONFIG.linux.chromePaths) {
        if (fs.existsSync(p)) return p;
      }
      return null;
    },
    listChromePids: () => {
      try {
        const out = execSync("pgrep -x chrome", { encoding: "utf-8" }).trim();
        return out
          .split("\n")
          .map(Number)
          .filter((n) => n > 0);
      } catch {
        return [];
      }
    },
    killChrome: () => {
      try { execSync("pkill -9 -x chrome", { stdio: "ignore" }); } catch {}
    },
  },
};

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

function log(msg) {
  console.log(msg);
}

function warn(msg) {
  console.warn("⚠️  " + msg);
}

function ok(msg) {
  console.log("✅ " + msg);
}

function err(msg) {
  console.error("❌ " + msg);
}

function getConfig() {
  const config = PLATFORM_CONFIG[PLATFORM];
  if (!config) {
    err(`不支持的平台: ${PLATFORM}。支持 darwin/win32/linux。`);
    process.exit(1);
  }
  return config;
}

/** 检查端口是否被占用 */
function isPortListening(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(true));
    server.once("listening", () => {
      server.close(() => resolve(false));
    });
    server.listen(port, "127.0.0.1");
  });
}

/** HTTP GET 检查 CDP 端点 */
function httpGet(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: 3000 }, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => resolve(body));
    });
    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("timeout"));
    });
  });
}

/** 同步等待 ms 毫秒 */
function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** 复制 profile 文件（单个文件） */
function copyFileSafe(src, dest) {
  try {
    fs.copyFileSync(src, dest);
    return true;
  } catch {
    return false;
  }
}

/** 递归复制目录 */
function copyDirRecursive(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      copyFileSafe(srcPath, destPath);
    }
  }
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

async function main() {
  const config = getConfig();
  const debugProfile = path.join(os.homedir(), "chrome-debug-profile");

  log("=== CDP Chrome 环境准备 ===");
  log(`平台: ${PLATFORM} | CDP 端口: ${CDP_PORT}`);

  // 第一步：检测 Chrome 路径
  const chromePath = config.findChrome();
  if (!chromePath) {
    err("未找到 Google Chrome。请确保已安装。");
    err(`搜索路径: ${JSON.stringify(config.chromePaths, null, 2)}`);
    process.exit(1);
  }
  log(`Chrome 路径: ${chromePath}`);

  // 第二步：检测 profile
  const defaultProfile = path.join(config.profileDir, "Default");
  const hasProfile = fs.existsSync(defaultProfile);

  if (DRY_RUN) {
    log(`Chrome profile: ${config.profileDir} (${hasProfile ? "存在" : "不存在"})`);
    log("\n--- dry-run 模式：只打印操作，不执行 ---");
    if (hasProfile) {
      log(`1. 复制 profile: ${config.profileDir}/Default → ${debugProfile}/Default`);
      log(`2. 刷新 Cookie 和 Login Data`);
    } else {
      log(`1. ⚠️ 无用户 profile，将以空 profile 启动 Chrome`);
    }
    log(`3. 停止现有 Chrome 进程`);
    log(`4. 启动 Chrome: ${chromePath} --remote-debugging-port=${CDP_PORT} --user-data-dir=${debugProfile}`);
    log(`5. 验证 CDP 端口 http://127.0.0.1:${CDP_PORT}/json/version`);
    ok("dry-run 完成。");
    process.exit(0);
  }

  if (!hasProfile) {
    err(`未找到 Chrome 默认 profile: ${defaultProfile}`);
    err("请确保已安装 Google Chrome 并至少使用过一次。");
    process.exit(1);
  }
  log(`Chrome profile: ${config.profileDir}`);

  // 第三步：检查 CDP 端口是否已就绪
  const portInUse = await isPortListening(CDP_PORT);
  if (portInUse) {
    log(`CDP 端口 ${CDP_PORT} 已在监听。`);
    try {
      const version = await httpGet(
        `http://127.0.0.1:${CDP_PORT}/json/version`
      );
      ok("CDP 连接已验证，Chrome 就绪。");
      log(version.split("\n").slice(0, 5).join("\n"));
      process.exit(0);
    } catch {
      warn("端口正在监听但无响应，将重启 Chrome。");
    }
  }

  // 第四步：复制 Chrome profile 到调试目录
  const debugDefault = path.join(debugProfile, "Default");
  if (!fs.existsSync(debugDefault)) {
    log("正在复制 Chrome profile 到调试目录...");
    fs.mkdirSync(debugProfile, { recursive: true });
    copyDirRecursive(defaultProfile, debugDefault);
    ok(`Profile 已复制到: ${debugProfile}`);
  } else {
    ok(`调试用 profile 已存在于: ${debugProfile}`);
    log("正在刷新 Cookie 和登录数据...");
    const srcDir = path.join(config.profileDir, "Default");
    copyFileSafe(
      path.join(srcDir, "Cookies"),
      path.join(debugDefault, "Cookies")
    );
    copyFileSafe(
      path.join(srcDir, "Login Data"),
      path.join(debugDefault, "Login Data")
    );
  }

  // 第五步：关闭现有 Chrome 进程
  log("正在停止已有的 Chrome 进程...");
  config.killChrome();
  sleepSync(3000);

  const remaining = config.listChromePids();
  if (remaining.length > 0) {
    warn("等待 Chrome 进程完全退出...");
    sleepSync(3000);
    config.killChrome();
    sleepSync(2000);
  }

  // 第六步：以 CDP 调试模式启动 Chrome
  log(`正在以 CDP 模式启动 Chrome（端口 ${CDP_PORT}）...`);
  const child = spawn(
    chromePath,
    [
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=${debugProfile}`,
    ],
    { detached: true, stdio: "ignore" }
  );
  child.unref();

  // 第七步：等待启动并验证
  log("等待 Chrome 启动...");
  for (let i = 1; i <= 15; i++) {
    sleepSync(2000);
    try {
      const version = await httpGet(
        `http://127.0.0.1:${CDP_PORT}/json/version`
      );
      if (version) {
        ok(`Chrome 已成功以 CDP 模式启动（端口 ${CDP_PORT}）`);
        log(version.split("\n").slice(0, 5).join("\n"));
        process.exit(0);
      }
    } catch {
      // 还没准备好
    }
    log(`   尝试 ${i}/15...`);
  }

  err("30 秒内未能启动 Chrome CDP 环境。");
  err("可能原因：");
  err("  - Chrome 不支持 --remote-debugging-port");
  err(`  - 端口 ${CDP_PORT} 已被其他进程占用`);
  err("  - user-data-dir 目录已损坏");
  process.exit(1);
}

main().catch((e) => {
  err(`启动失败: ${e.message}`);
  process.exit(1);
});
