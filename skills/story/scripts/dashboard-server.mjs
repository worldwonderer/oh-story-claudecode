#!/usr/bin/env node

import { spawn } from "node:child_process";
import { realpathSync } from "node:fs";
import { createServer } from "node:http";
import {
  copyFile,
  lstat,
  readFile,
  readdir,
  realpath,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { extname, basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";

const MODULE_PATH = fileURLToPath(import.meta.url);
const ASSET_DIR = fileURLToPath(new URL("../assets/", import.meta.url));
const EDITABLE_EXTENSIONS = new Set([".md", ".txt", ".json", ".yaml", ".yml", ".toml"]);
const PROJECT_MARKERS = new Set(["正文", "大纲", "设定", "追踪"]);
const IGNORED_DIRECTORIES = new Set([
  ".git",
  ".omc",
  ".omx",
  ".claude",
  ".codex",
  ".opencode",
  ".zcode",
  ".agents",
  "node_modules",
  "test-results",
  "playwright-report",
  "__pycache__",
]);
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_REQUEST_BYTES = MAX_FILE_BYTES + 64 * 1024;
const MAX_TREE_DEPTH = 10;
const MAX_TREE_NODES = 5000;
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);

const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
};

export class DashboardError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "DashboardError";
    this.status = status;
    this.code = code;
  }
}

function isPathInside(candidate, root) {
  const relation = relative(root, candidate);
  return relation === "" || (!relation.startsWith(`..${sep}`) && relation !== ".." && !isAbsolute(relation));
}

function toPosixPath(value) {
  return value.split(sep).join("/");
}

function isEditableFile(name) {
  return EDITABLE_EXTENSIONS.has(extname(name).toLowerCase());
}

function shouldIgnoreDirectory(name) {
  return IGNORED_DIRECTORIES.has(name) || (name.startsWith(".") && name !== ".story");
}

function compareTreeEntries(left, right) {
  if (left.type !== right.type) {
    return left.type === "directory" ? -1 : 1;
  }
  return left.name.localeCompare(right.name, "zh-CN", { numeric: true, sensitivity: "base" });
}

async function existingRealRoot(root) {
  const absolute = resolve(root);
  const info = await stat(absolute).catch(() => null);
  if (!info?.isDirectory()) {
    throw new DashboardError(400, "invalid_workspace", `工作区不存在或不是目录：${absolute}`);
  }
  return realpath(absolute);
}

export async function resolveWorkspacePath(root, requestedPath, options = {}) {
  const { editableOnly = false } = options;
  if (typeof requestedPath !== "string" || requestedPath.length === 0) {
    throw new DashboardError(400, "invalid_path", "文件路径不能为空");
  }
  if (
    requestedPath.includes("\0") ||
    isAbsolute(requestedPath) ||
    /^[A-Za-z]:[\\/]/.test(requestedPath)
  ) {
    throw new DashboardError(403, "path_outside_workspace", "只允许访问工作区内的相对路径");
  }

  const realRoot = await existingRealRoot(root);
  const candidate = resolve(realRoot, requestedPath);
  if (!isPathInside(candidate, realRoot)) {
    throw new DashboardError(403, "path_outside_workspace", "路径超出工作区");
  }

  const info = await lstat(candidate).catch((error) => {
    if (error?.code === "ENOENT") {
      throw new DashboardError(404, "file_not_found", "文件不存在");
    }
    throw error;
  });
  if (info.isSymbolicLink()) {
    throw new DashboardError(403, "symlink_not_editable", "Dashboard 不读写符号链接文件");
  }
  if (!info.isFile()) {
    throw new DashboardError(400, "not_a_file", "目标不是普通文件");
  }

  const resolvedFile = await realpath(candidate);
  if (!isPathInside(resolvedFile, realRoot)) {
    throw new DashboardError(403, "path_outside_workspace", "符号链接指向工作区外部");
  }
  if (editableOnly && !isEditableFile(candidate)) {
    throw new DashboardError(415, "unsupported_file_type", "该文件类型不支持在线编辑");
  }

  return { absolutePath: candidate, realRoot, info };
}

async function buildTreeNode(root, absolutePath, relativePath, state, depth = 0) {
  if (state.nodes >= MAX_TREE_NODES || depth > MAX_TREE_DEPTH) {
    return null;
  }
  state.nodes += 1;

  const info = await lstat(absolutePath).catch(() => null);
  if (!info || info.isSymbolicLink()) {
    return null;
  }

  if (info.isFile()) {
    return {
      name: basename(absolutePath),
      path: toPosixPath(relativePath),
      type: "file",
      editable: isEditableFile(absolutePath) && info.size <= MAX_FILE_BYTES,
      size: info.size,
    };
  }
  if (!info.isDirectory()) {
    return null;
  }

  const entries = await readdir(absolutePath, { withFileTypes: true }).catch(() => []);
  const children = [];
  for (const entry of entries) {
    if (entry.isDirectory() && shouldIgnoreDirectory(entry.name)) {
      continue;
    }
    if (entry.isSymbolicLink()) {
      continue;
    }
    const childRelative = relativePath ? `${relativePath}${sep}${entry.name}` : entry.name;
    const child = await buildTreeNode(
      root,
      resolve(absolutePath, entry.name),
      childRelative,
      state,
      depth + 1,
    );
    if (child) {
      children.push(child);
    }
  }
  children.sort(compareTreeEntries);

  return {
    name: relativePath ? basename(absolutePath) : basename(root),
    path: toPosixPath(relativePath),
    type: "directory",
    children,
  };
}

async function listLibraryRoots(root) {
  const roots = [];
  const standardRoot = resolve(root, "拆文库");
  const standardInfo = await lstat(standardRoot).catch(() => null);
  if (standardInfo?.isDirectory() && !standardInfo.isSymbolicLink()) {
    const entries = await readdir(standardRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.isSymbolicLink()) {
        roots.push({ absolutePath: resolve(standardRoot, entry.name), relativePath: `拆文库${sep}${entry.name}` });
      }
    }
  }

  const rootEntries = await readdir(root, { withFileTypes: true });
  for (const entry of rootEntries) {
    if (
      entry.name.startsWith("拆文库-") &&
      entry.isDirectory() &&
      !entry.isSymbolicLink()
    ) {
      roots.push({ absolutePath: resolve(root, entry.name), relativePath: entry.name });
    }
  }

  return roots.sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath, "zh-CN", { numeric: true }),
  );
}

function isUnderAnyPath(candidate, blockedPaths) {
  return blockedPaths.some((blocked) => isPathInside(candidate, blocked));
}

async function findProjectRoots(root, libraryPaths, currentPath = root, depth = 0, projects = []) {
  if (depth > 3 || isUnderAnyPath(currentPath, libraryPaths)) {
    return projects;
  }

  const entries = await readdir(currentPath, { withFileTypes: true }).catch(() => []);
  const childDirectoryNames = new Set(
    entries.filter((entry) => entry.isDirectory() && !entry.isSymbolicLink()).map((entry) => entry.name),
  );
  if ([...PROJECT_MARKERS].some((marker) => childDirectoryNames.has(marker))) {
    projects.push({
      absolutePath: currentPath,
      relativePath: relative(root, currentPath),
    });
    return projects;
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.isSymbolicLink() || shouldIgnoreDirectory(entry.name)) {
      continue;
    }
    await findProjectRoots(
      root,
      libraryPaths,
      resolve(currentPath, entry.name),
      depth + 1,
      projects,
    );
  }
  return projects;
}

function summarizeTrees(libraries, projects) {
  const uniqueFiles = new Set();
  let editableFiles = 0;

  function visit(node) {
    if (node.type === "file") {
      if (!uniqueFiles.has(node.path)) {
        uniqueFiles.add(node.path);
        if (node.editable) {
          editableFiles += 1;
        }
      }
      return;
    }
    node.children.forEach(visit);
  }

  libraries.forEach(visit);
  projects.forEach(visit);
  return {
    libraries: libraries.length,
    projects: projects.length,
    files: uniqueFiles.size,
    editableFiles,
  };
}

export async function scanWorkspace(root) {
  const realRoot = await existingRealRoot(root);
  const libraryRoots = await listLibraryRoots(realRoot);
  const libraryPaths = libraryRoots.map((entry) => entry.absolutePath);
  const projectRoots = await findProjectRoots(realRoot, libraryPaths);

  const state = { nodes: 0 };
  const libraries = (
    await Promise.all(
      libraryRoots.map((entry) =>
        buildTreeNode(realRoot, entry.absolutePath, entry.relativePath, state),
      ),
    )
  ).filter(Boolean);
  const projects = (
    await Promise.all(
      projectRoots.map((entry) =>
        buildTreeNode(realRoot, entry.absolutePath, entry.relativePath, state),
      ),
    )
  ).filter(Boolean);

  libraries.sort(compareTreeEntries);
  projects.sort(compareTreeEntries);
  return {
    workspace: {
      name: basename(realRoot),
      path: realRoot,
    },
    libraries,
    projects,
    stats: summarizeTrees(libraries, projects),
    limits: {
      maxFileBytes: MAX_FILE_BYTES,
      editableExtensions: [...EDITABLE_EXTENSIONS],
      truncated: state.nodes >= MAX_TREE_NODES,
    },
  };
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_REQUEST_BYTES) {
      throw new DashboardError(413, "request_too_large", "保存内容超过 2 MiB 限制");
    }
    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new DashboardError(400, "invalid_json", "请求正文不是有效 JSON");
  }
}

function responseHeaders(contentType) {
  return {
    "Cache-Control": "no-store",
    "Content-Security-Policy":
      "default-src 'self'; base-uri 'none'; connect-src 'self'; img-src 'self' data:; object-src 'none'; script-src 'self'; style-src 'self'",
    "Content-Type": contentType,
    "Cross-Origin-Resource-Policy": "same-origin",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  };
}

function sendJson(response, status, payload) {
  response.writeHead(status, responseHeaders("application/json; charset=utf-8"));
  response.end(JSON.stringify(payload));
}

async function readWorkspaceFile(root, requestedPath) {
  const { absolutePath, info } = await resolveWorkspacePath(root, requestedPath, {
    editableOnly: true,
  });
  if (info.size > MAX_FILE_BYTES) {
    throw new DashboardError(413, "file_too_large", "文件超过 2 MiB，无法在 Dashboard 中打开");
  }
  const content = await readFile(absolutePath, "utf8");
  return {
    path: toPosixPath(relative(await existingRealRoot(root), absolutePath)),
    name: basename(absolutePath),
    content,
    size: Buffer.byteLength(content),
    mtimeMs: info.mtimeMs,
  };
}

async function replaceFileAtomically(target, content, mode) {
  const temporary = resolve(dirname(target), `.${basename(target)}.story-dashboard-${randomUUID()}.tmp`);
  await writeFile(temporary, content, { encoding: "utf8", mode });
  try {
    await rename(temporary, target);
  } catch (error) {
    if (process.platform !== "win32" || !["EACCES", "EPERM", "EEXIST"].includes(error?.code)) {
      await unlink(temporary).catch(() => {});
      throw error;
    }
    await copyFile(temporary, target);
    await unlink(temporary).catch(() => {});
  }
}

async function saveWorkspaceFile(root, payload) {
  if (!payload || typeof payload !== "object") {
    throw new DashboardError(400, "invalid_payload", "缺少保存参数");
  }
  if (typeof payload.content !== "string") {
    throw new DashboardError(400, "invalid_content", "文件内容必须是文本");
  }
  if (Buffer.byteLength(payload.content) > MAX_FILE_BYTES) {
    throw new DashboardError(413, "file_too_large", "文件超过 2 MiB，无法保存");
  }
  if (!Number.isFinite(payload.expectedMtimeMs)) {
    throw new DashboardError(400, "missing_file_version", "保存请求缺少文件版本，请重新载入后再试");
  }

  const { absolutePath, info } = await resolveWorkspacePath(root, payload.path, {
    editableOnly: true,
  });
  if (Math.abs(info.mtimeMs - payload.expectedMtimeMs) > 0.5) {
    throw new DashboardError(
      409,
      "file_changed",
      "文件已被其他程序修改。请重新载入后再保存，避免覆盖新内容。",
    );
  }

  await replaceFileAtomically(absolutePath, payload.content, info.mode);
  const updated = await stat(absolutePath);
  return {
    ok: true,
    path: toPosixPath(relative(await existingRealRoot(root), absolutePath)),
    size: updated.size,
    mtimeMs: updated.mtimeMs,
  };
}

async function deleteWorkspaceFile(root, payload) {
  if (!payload || typeof payload !== "object") {
    throw new DashboardError(400, "invalid_payload", "缺少删除参数");
  }
  if (!Number.isFinite(payload.expectedMtimeMs)) {
    throw new DashboardError(400, "missing_file_version", "删除请求缺少文件版本，请重新载入后再试");
  }

  const { absolutePath, info } = await resolveWorkspacePath(root, payload.path, {
    editableOnly: true,
  });
  if (Math.abs(info.mtimeMs - payload.expectedMtimeMs) > 0.5) {
    throw new DashboardError(
      409,
      "file_changed",
      "文件已被其他程序修改。请重新载入后再删除，避免误删新版本。",
    );
  }

  await unlink(absolutePath);
  return {
    ok: true,
    path: toPosixPath(relative(await existingRealRoot(root), absolutePath)),
  };
}

async function serveStaticFile(requestPath, response) {
  const assetName = requestPath === "/" ? "index.html" : requestPath.slice(1);
  if (!["index.html", "styles.css", "app.js"].includes(assetName)) {
    sendJson(response, 404, { error: { code: "not_found", message: "页面不存在" } });
    return;
  }
  const assetPath = resolve(ASSET_DIR, assetName);
  const body = await readFile(assetPath);
  response.writeHead(200, responseHeaders(CONTENT_TYPES[extname(assetName)] || "application/octet-stream"));
  response.end(body);
}

function normalizedHostname(hostHeader) {
  if (!hostHeader) return "";
  try {
    return new URL(`http://${hostHeader}`).hostname.replace(/^\[|\]$/g, "").toLowerCase();
  } catch {
    return "";
  }
}

function normalizedOriginHostname(origin) {
  try {
    return new URL(origin).hostname.replace(/^\[|\]$/g, "").toLowerCase();
  } catch {
    return "";
  }
}

function assertLocalRequest(request, allowNetwork) {
  if (allowNetwork) return;
  const hostname = normalizedHostname(request.headers.host);
  if (!LOOPBACK_HOSTS.has(hostname)) {
    throw new DashboardError(403, "invalid_host", "Dashboard 只接受本机回环地址请求");
  }
  if (["PUT", "DELETE"].includes(request.method) && request.headers.origin) {
    const originHostname = normalizedOriginHostname(request.headers.origin);
    if (!LOOPBACK_HOSTS.has(originHostname)) {
      throw new DashboardError(403, "invalid_origin", "拒绝来自非本机页面的写入请求");
    }
  }
}

export function createDashboardServer({ root, allowNetwork = false }) {
  const workspaceRoot = resolve(root);
  return createServer(async (request, response) => {
    try {
      assertLocalRequest(request, allowNetwork);
      const url = new URL(request.url || "/", "http://127.0.0.1");
      if (request.method === "GET" && url.pathname === "/health") {
        sendJson(response, 200, { ok: true });
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/workspace") {
        sendJson(response, 200, await scanWorkspace(workspaceRoot));
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/file") {
        sendJson(response, 200, await readWorkspaceFile(workspaceRoot, url.searchParams.get("path") || ""));
        return;
      }
      if (request.method === "PUT" && url.pathname === "/api/file") {
        sendJson(response, 200, await saveWorkspaceFile(workspaceRoot, await readJsonBody(request)));
        return;
      }
      if (request.method === "DELETE" && url.pathname === "/api/file") {
        sendJson(response, 200, await deleteWorkspaceFile(workspaceRoot, await readJsonBody(request)));
        return;
      }
      if (request.method === "GET") {
        await serveStaticFile(url.pathname, response);
        return;
      }
      sendJson(response, 405, {
        error: { code: "method_not_allowed", message: "请求方法不支持" },
      });
    } catch (error) {
      const known = error instanceof DashboardError;
      if (!known) {
        console.error("[story-dashboard]", error);
      }
      sendJson(response, known ? error.status : 500, {
        error: {
          code: known ? error.code : "internal_error",
          message: known ? error.message : "Dashboard 处理请求时发生错误",
        },
      });
    }
  });
}

function parseCliArguments(argv) {
  const options = {
    root: process.cwd(),
    host: process.env.STORY_DASHBOARD_HOST || "127.0.0.1",
    port: Number(process.env.STORY_DASHBOARD_PORT || 43110),
    open: false,
    allowNetwork: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--root") {
      options.root = argv[++index];
    } else if (value === "--host") {
      options.host = argv[++index];
    } else if (value === "--port") {
      options.port = Number(argv[++index]);
    } else if (value === "--open") {
      options.open = true;
    } else if (value === "--allow-network") {
      options.allowNetwork = true;
    } else if (value === "--help" || value === "-h") {
      options.help = true;
    } else {
      throw new DashboardError(400, "unknown_argument", `未知参数：${value}`);
    }
  }

  if (!options.root) {
    throw new DashboardError(400, "missing_root", "--root 需要目录参数");
  }
  if (!Number.isInteger(options.port) || options.port < 0 || options.port > 65535) {
    throw new DashboardError(400, "invalid_port", "端口必须是 0–65535 的整数");
  }
  if (!LOOPBACK_HOSTS.has(options.host) && !options.allowNetwork) {
    throw new DashboardError(
      400,
      "network_binding_requires_opt_in",
      "非本机地址需要显式增加 --allow-network；通常不应把写作文件暴露到局域网",
    );
  }
  return options;
}

async function listen(server, host, preferredPort) {
  const attempts = preferredPort === 0 ? [0] : Array.from({ length: 11 }, (_, index) => preferredPort + index);
  for (const port of attempts) {
    try {
      await new Promise((accept, reject) => {
        const onError = (error) => {
          server.off("listening", onListening);
          reject(error);
        };
        const onListening = () => {
          server.off("error", onError);
          accept();
        };
        server.once("error", onError);
        server.once("listening", onListening);
        server.listen(port, host);
      });
      return server.address().port;
    } catch (error) {
      if (error?.code !== "EADDRINUSE" || port === attempts.at(-1)) {
        throw error;
      }
    }
  }
  throw new Error("No available port");
}

function openBrowser(url) {
  const { command, args } = browserLaunchCommand(url);
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.on("error", () => {});
  child.unref();
}

export function browserLaunchCommand(url, platform = process.platform) {
  if (platform === "darwin") {
    return { command: "open", args: [url] };
  }
  if (platform === "win32") {
    return { command: "cmd", args: ["/c", "start", "", url] };
  }
  return { command: "xdg-open", args: [url] };
}

export function pathsReferToSameFile(left, right) {
  if (!left || !right) return false;
  try {
    return realpathSync(left) === realpathSync(right);
  } catch {
    return false;
  }
}

function printHelp() {
  console.log(`Story Dashboard

Usage:
  node dashboard-server.mjs [--root <dir>] [--host 127.0.0.1] [--port 43110] [--open]

Options:
  --root <dir>       写作工作区，默认当前目录
  --host <host>      监听地址，默认 127.0.0.1
  --port <port>      首选端口，默认 43110；0 表示随机端口
  --open             启动后用系统默认浏览器打开
  --allow-network    显式允许绑定非回环地址（不推荐）
`);
}

async function main() {
  const options = parseCliArguments(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const workspace = await existingRealRoot(options.root);
  const server = createDashboardServer({ root: workspace, allowNetwork: options.allowNetwork });
  const port = await listen(server, options.host, options.port);
  const displayHost = options.host === "::1" ? "[::1]" : options.host;
  const url = `http://${displayHost}:${port}`;

  console.log("Story Dashboard 已启动");
  console.log(`工作区：${workspace}`);
  console.log(`本机地址：${url}`);
  if (options.open) {
    openBrowser(url);
  }

  const shutdown = () => {
    server.close(() => process.exit(0));
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

const isMain = pathsReferToSameFile(process.argv[1], MODULE_PATH);
if (isMain) {
  main().catch((error) => {
    const message = error instanceof DashboardError ? error.message : error?.stack || String(error);
    console.error(`Story Dashboard 启动失败：${message}`);
    process.exitCode = 1;
  });
}
