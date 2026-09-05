#!/usr/bin/env node

import { spawn, exec } from "node:child_process";
import { realpathSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { createServer } from "node:http";
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
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
import { createHash, randomUUID } from "node:crypto";

const MODULE_PATH = fileURLToPath(import.meta.url);
const ASSET_DIR = fileURLToPath(new URL("../assets/", import.meta.url));
const EDITABLE_EXTENSIONS = new Set([".md", ".txt", ".json", ".yaml", ".yml", ".toml"]);
const LONG_PROJECT_DIRECTORY_MARKERS = new Set(["正文", "大纲", "设定", "追踪"]);
const SHORT_PROJECT_BODY_FILE = "正文.md";
const SHORT_PROJECT_COMPANION_FILES = new Set(["小节大纲.md", "设定.md"]);
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
const DIRECTORY_PAGE_SIZE = 200;
const MAX_SEARCH_RESULTS = 100;
const MAX_SEARCH_NODES = 5000;
const MAX_SEARCH_DEPTH = 20;
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost"]);
const FILE_MUTATION_TAILS = new Map();

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

function fileVersion(content) {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function countCharacters(content) {
  return [...(content || "").replace(/\s/g, "")].length;
}

async function withSerializedFileMutation(absolutePath, operation) {
  const previous = FILE_MUTATION_TAILS.get(absolutePath) || Promise.resolve();
  let release;
  const gate = new Promise((accept) => {
    release = accept;
  });
  const tail = previous.catch(() => {}).then(() => gate);
  FILE_MUTATION_TAILS.set(absolutePath, tail);
  await previous.catch(() => {});
  try {
    return await operation();
  } finally {
    release();
    if (FILE_MUTATION_TAILS.get(absolutePath) === tail) {
      FILE_MUTATION_TAILS.delete(absolutePath);
    }
  }
}

function recordScanError(scanErrors, root, absolutePath, error) {
  const errorPath = toPosixPath(relative(root, absolutePath)) || ".";
  if (scanErrors.some((entry) => entry.path === errorPath)) {
    return;
  }
  scanErrors.push({
    path: errorPath,
    code: typeof error?.code === "string" ? error.code : "READ_ERROR",
    message: `目录无法读取，请检查访问权限或挂载状态：${errorPath}`,
  });
}

function shouldIgnoreDirectory(name) {
  return IGNORED_DIRECTORIES.has(name) || name.startsWith(".");
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

function directoryNode(absolutePath, relativePath) {
  return {
    name: basename(absolutePath),
    path: relativePath ? toPosixPath(relativePath) : ".",
    type: "directory",
    children: [],
    loaded: false,
  };
}

function assertRelativeWorkspacePath(requestedPath, label = "路径") {
  if (typeof requestedPath !== "string" || requestedPath.length === 0) {
    throw new DashboardError(400, "invalid_path", `${label}不能为空`);
  }
  if (
    requestedPath.includes("\0") ||
    isAbsolute(requestedPath) ||
    /^[A-Za-z]:[\\/]/.test(requestedPath)
  ) {
    throw new DashboardError(403, "path_outside_workspace", "只允许访问工作区内的相对路径");
  }
}

export async function resolveWorkspaceDirectory(root, requestedPath) {
  assertRelativeWorkspacePath(requestedPath, "目录路径");
  const realRoot = await existingRealRoot(root);
  const candidate = resolve(realRoot, requestedPath);
  if (!isPathInside(candidate, realRoot)) {
    throw new DashboardError(403, "path_outside_workspace", "路径超出工作区");
  }
  if (
    requestedPath !== "." &&
    requestedPath.split(/[\\/]+/).some((segment) => shouldIgnoreDirectory(segment))
  ) {
    throw new DashboardError(403, "directory_hidden", "该目录不会显示在 Dashboard 中");
  }

  const info = await lstat(candidate).catch((error) => {
    if (error?.code === "ENOENT") {
      throw new DashboardError(404, "directory_not_found", "目录不存在");
    }
    throw error;
  });
  if (info.isSymbolicLink()) {
    throw new DashboardError(403, "symlink_not_readable", "Dashboard 不读取符号链接目录");
  }
  if (!info.isDirectory()) {
    throw new DashboardError(400, "not_a_directory", "目标不是目录");
  }

  const resolvedDirectory = await realpath(candidate);
  if (!isPathInside(resolvedDirectory, realRoot)) {
    throw new DashboardError(403, "path_outside_workspace", "符号链接指向工作区外部");
  }
  return { absolutePath: candidate, realRoot };
}

function parseDirectoryCursor(value) {
  if (value === null || value === "") return 0;
  if (!/^\d+$/.test(value)) {
    throw new DashboardError(400, "invalid_cursor", "目录游标无效");
  }
  const cursor = Number(value);
  if (!Number.isSafeInteger(cursor)) {
    throw new DashboardError(400, "invalid_cursor", "目录游标无效");
  }
  return cursor;
}

function visibleDirectoryEntries(entries) {
  return entries
    .filter(
      (entry) =>
        !entry.isSymbolicLink() &&
        (!entry.isDirectory() || !shouldIgnoreDirectory(entry.name)),
    )
    .sort((left, right) =>
      compareTreeEntries(
        { name: left.name, type: left.isDirectory() ? "directory" : "file" },
        { name: right.name, type: right.isDirectory() ? "directory" : "file" },
      ),
    );
}

export async function listWorkspaceDirectory(root, requestedPath, cursorValue = null) {
  const { absolutePath, realRoot } = await resolveWorkspaceDirectory(root, requestedPath);
  const cursor = parseDirectoryCursor(cursorValue);
  const entries = await readdir(absolutePath, { withFileTypes: true }).catch(() => {
    throw new DashboardError(
      403,
      "directory_unreadable",
      `目录无法读取，请检查访问权限或挂载状态：${toPosixPath(requestedPath)}`,
    );
  });
  const visibleEntries = visibleDirectoryEntries(entries);
  const page = visibleEntries.slice(cursor, cursor + DIRECTORY_PAGE_SIZE);
  const nodes = (
    await Promise.all(
      page.map(async (entry) => {
        const childAbsolute = resolve(absolutePath, entry.name);
        const childRelative = relative(realRoot, childAbsolute);
        if (entry.isDirectory()) {
          return directoryNode(childAbsolute, childRelative);
        }
        const info = await lstat(childAbsolute).catch(() => null);
        if (!info?.isFile() || info.isSymbolicLink()) return null;
        return {
          name: entry.name,
          path: toPosixPath(childRelative),
          type: "file",
          editable: isEditableFile(childAbsolute) && info.size <= MAX_FILE_BYTES,
          size: info.size,
        };
      }),
    )
  ).filter(Boolean);
  const nextOffset = cursor + page.length;
  return {
    path: toPosixPath(relative(realRoot, absolutePath)) || ".",
    entries: nodes,
    nextCursor: nextOffset < visibleEntries.length ? String(nextOffset) : null,
  };
}

async function listLibraryRoots(root, scanErrors) {
  const roots = [];
  const standardRoot = resolve(root, "拆文库");
  const standardInfo = await lstat(standardRoot).catch(() => null);
  if (standardInfo?.isDirectory() && !standardInfo.isSymbolicLink()) {
    // 单个拆文库读不动时保留其他项目，但把残缺扫描显式带回前端；空数组只能表达“确实为空”，
    // 不能再同时承担权限错误/外挂盘掉线，否则作者会把不可见文稿误当成不存在。
    const entries = await readdir(standardRoot, { withFileTypes: true }).catch((error) => {
      recordScanError(scanErrors, root, standardRoot, error);
      return [];
    });
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.isSymbolicLink()) {
        roots.push({ absolutePath: resolve(standardRoot, entry.name), relativePath: `拆文库${sep}${entry.name}` });
      }
    }
  }

  // 工作区根目录读不动就没有任何可展示的树，直接给出可执行的报错，而不是静默返回空树。
  const rootEntries = await readdir(root, { withFileTypes: true }).catch(() => {
    throw new DashboardError(
      403,
      "workspace_unreadable",
      `工作区目录无法读取，请检查访问权限：${root}`,
    );
  });
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

async function findProjectRoots(
  root,
  libraryPaths,
  scanErrors,
  currentPath = root,
  depth = 0,
  projects = [],
) {
  if (depth > 3 || isUnderAnyPath(currentPath, libraryPaths)) {
    return projects;
  }

  const entries = await readdir(currentPath, { withFileTypes: true }).catch((error) => {
    recordScanError(scanErrors, root, currentPath, error);
    return [];
  });
  const childDirectoryNames = new Set(
    entries.filter((entry) => entry.isDirectory() && !entry.isSymbolicLink()).map((entry) => entry.name),
  );
  const childFileNames = new Set(
    entries.filter((entry) => entry.isFile() && !entry.isSymbolicLink()).map((entry) => entry.name),
  );
  const isLongProject = [...LONG_PROJECT_DIRECTORY_MARKERS].some((marker) =>
    childDirectoryNames.has(marker),
  );
  const isShortProject =
    childFileNames.has(SHORT_PROJECT_BODY_FILE) &&
    [...SHORT_PROJECT_COMPANION_FILES].some((marker) => childFileNames.has(marker));
  if (isLongProject || isShortProject) {
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
      scanErrors,
      resolve(currentPath, entry.name),
      depth + 1,
      projects,
    );
  }
  return projects;
}

async function discoverWorkspaceRoots(realRoot) {
  const scanErrors = [];
  const libraryRoots = await listLibraryRoots(realRoot, scanErrors);
  const libraryPaths = libraryRoots.map((entry) => entry.absolutePath);
  const projectRoots = await findProjectRoots(realRoot, libraryPaths, scanErrors);
  return { libraryRoots, projectRoots, scanErrors };
}

export async function scanWorkspace(root) {
  const realRoot = await existingRealRoot(root);
  const { libraryRoots, projectRoots, scanErrors } = await discoverWorkspaceRoots(realRoot);
  const libraries = libraryRoots.map((entry) =>
    directoryNode(entry.absolutePath, entry.relativePath),
  );
  const projects = projectRoots.map((entry) =>
    directoryNode(entry.absolutePath, entry.relativePath),
  );
  libraries.sort(compareTreeEntries);
  projects.sort(compareTreeEntries);

  return {
    workspace: {
      name: basename(realRoot),
      path: realRoot,
    },
    libraries,
    projects,
    scanErrors,
    stats: {
      libraries: libraries.length,
      projects: projects.length,
      files: null,
      editableFiles: null,
      onDemand: true,
    },
    limits: {
      maxFileBytes: MAX_FILE_BYTES,
      editableExtensions: [...EDITABLE_EXTENSIONS],
      directoryPageSize: DIRECTORY_PAGE_SIZE,
      maxSearchResults: MAX_SEARCH_RESULTS,
      truncated: scanErrors.length > 0,
      truncatedByReadError: scanErrors.length > 0,
    },
  };
}

export async function searchWorkspace(root, queryValue, scopeValue) {
  const query = typeof queryValue === "string" ? queryValue.trim() : "";
  if (!query || query.length > 100) {
    throw new DashboardError(400, "invalid_query", "搜索词长度必须在 1–100 个字符之间");
  }
  if (!["libraries", "projects"].includes(scopeValue)) {
    throw new DashboardError(400, "invalid_scope", "搜索范围必须是拆文库或写作项目");
  }

  const realRoot = await existingRealRoot(root);
  const { libraryRoots, projectRoots, scanErrors } = await discoverWorkspaceRoots(realRoot);
  const roots = scopeValue === "libraries" ? libraryRoots : projectRoots;
  const normalizedQuery = query.toLocaleLowerCase("zh-CN");
  const state = {
    nodes: 0,
    truncatedByResults: false,
    truncatedByNodes: false,
    truncatedByDepth: false,
    results: [],
    scanErrors,
  };

  async function visit(absolutePath, relativePath, depth) {
    if (state.results.length >= MAX_SEARCH_RESULTS) {
      state.truncatedByResults = true;
      return;
    }
    if (state.nodes >= MAX_SEARCH_NODES) {
      state.truncatedByNodes = true;
      return;
    }
    if (depth > MAX_SEARCH_DEPTH) {
      state.truncatedByDepth = true;
      return;
    }
    state.nodes += 1;

    const info = await lstat(absolutePath).catch((error) => {
      recordScanError(state.scanErrors, realRoot, absolutePath, error);
      return null;
    });
    if (!info || info.isSymbolicLink()) return;
    if (info.isFile()) {
      const path = toPosixPath(relativePath);
      if (basename(absolutePath).toLocaleLowerCase("zh-CN").includes(normalizedQuery)) {
        state.results.push({
          name: basename(absolutePath),
          path,
          type: "file",
          editable: isEditableFile(absolutePath) && info.size <= MAX_FILE_BYTES,
          size: info.size,
        });
      }
      return;
    }
    if (!info.isDirectory()) return;

    const entries = await readdir(absolutePath, { withFileTypes: true }).catch((error) => {
      recordScanError(state.scanErrors, realRoot, absolutePath, error);
      return [];
    });
    for (const entry of visibleDirectoryEntries(entries)) {
      if (state.results.length >= MAX_SEARCH_RESULTS) {
        state.truncatedByResults = true;
        break;
      }
      if (state.nodes >= MAX_SEARCH_NODES) {
        state.truncatedByNodes = true;
        break;
      }
      await visit(
        resolve(absolutePath, entry.name),
        relativePath ? `${relativePath}${sep}${entry.name}` : entry.name,
        depth + 1,
      );
    }
  }

  for (const entry of roots) {
    await visit(entry.absolutePath, entry.relativePath, 0);
    if (state.truncatedByResults || state.truncatedByNodes) break;
  }
  state.results.sort(compareTreeEntries);
  const truncated =
    state.truncatedByResults ||
    state.truncatedByNodes ||
    state.truncatedByDepth ||
    state.scanErrors.length > 0;
  return {
    query,
    scope: scopeValue,
    results: state.results,
    truncated,
    truncation: {
      byResults: state.truncatedByResults,
      byNodes: state.truncatedByNodes,
      byDepth: state.truncatedByDepth,
      byReadError: state.scanErrors.length > 0,
    },
    scanErrors,
    limits: {
      maxResults: MAX_SEARCH_RESULTS,
      maxNodes: MAX_SEARCH_NODES,
      maxDepth: MAX_SEARCH_DEPTH,
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
      "default-src 'self'; base-uri 'none'; connect-src 'self'; img-src 'self' data:; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'",
    "Content-Type": contentType,
    "Cross-Origin-Resource-Policy": "same-origin",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  };
}

function sendJson(response, status, payload) {
  response.writeHead(status, responseHeaders("application/json; charset=utf-8"));
  // Keep JSON safe even if a response is ever embedded in an HTML context.
  // The endpoint already sends application/json with nosniff and a strict CSP;
  // escaping HTML-significant characters adds defense in depth for user input.
  const body = JSON.stringify(payload).replace(/[<>&\u2028\u2029]/g, (character) => {
    switch (character) {
      case "<":
        return "\\u003c";
      case ">":
        return "\\u003e";
      case "&":
        return "\\u0026";
      case "\u2028":
        return "\\u2028";
      default:
        return "\\u2029";
    }
  });
  response.end(body);
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
    version: fileVersion(content),
  };
}

async function replaceFileAtomically(target, content, mode) {
  const temporary = resolve(dirname(target), `.${basename(target)}.story-dashboard-${randomUUID()}.tmp`);
  await writeFile(temporary, content, { encoding: "utf8", mode });
  // open(2) 的 mode 会被进程 umask 削掉，光靠 writeFile 保不住原文件权限，
  // 所以改名前显式补一次；个别文件系统不支持权限位，失败就按原样落盘。
  await chmod(temporary, mode & 0o7777).catch(() => {});
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
  if (!/^[a-f0-9]{64}$/.test(payload.expectedVersion || "")) {
    throw new DashboardError(400, "missing_file_version", "保存请求缺少文件版本，请重新载入后再试");
  }

  const initial = await resolveWorkspacePath(root, payload.path, {
    editableOnly: true,
  });
  return withSerializedFileMutation(initial.absolutePath, async () => {
    let current;
    try {
      current = await resolveWorkspacePath(root, payload.path, { editableOnly: true });
    } catch (error) {
      if (error instanceof DashboardError && error.code === "file_not_found") {
        throw new DashboardError(409, "file_changed", "文件已被其他程序删除。请刷新目录后再保存。");
      }
      throw error;
    }
    const currentContent = await readFile(current.absolutePath, "utf8");
    if (fileVersion(currentContent) !== payload.expectedVersion) {
      throw new DashboardError(
        409,
        "file_changed",
        "文件已被其他程序修改。请重新载入后再保存，避免覆盖新内容。",
      );
    }

    await replaceFileAtomically(current.absolutePath, payload.content, current.info.mode);
    const updated = await stat(current.absolutePath);
    return {
      ok: true,
      path: toPosixPath(relative(current.realRoot, current.absolutePath)),
      size: updated.size,
      mtimeMs: updated.mtimeMs,
      version: fileVersion(payload.content),
    };
  });
}

async function deleteWorkspaceFile(root, payload) {
  if (!payload || typeof payload !== "object") {
    throw new DashboardError(400, "invalid_payload", "缺少删除参数");
  }
  if (!/^[a-f0-9]{64}$/.test(payload.expectedVersion || "")) {
    throw new DashboardError(400, "missing_file_version", "删除请求缺少文件版本，请重新载入后再试");
  }

  const initial = await resolveWorkspacePath(root, payload.path, {
    editableOnly: true,
  });
  return withSerializedFileMutation(initial.absolutePath, async () => {
    let current;
    try {
      current = await resolveWorkspacePath(root, payload.path, { editableOnly: true });
    } catch (error) {
      if (error instanceof DashboardError && error.code === "file_not_found") {
        throw new DashboardError(409, "file_changed", "文件已被其他程序删除。请刷新目录后再操作。");
      }
      throw error;
    }
    const currentContent = await readFile(current.absolutePath, "utf8");
    if (fileVersion(currentContent) !== payload.expectedVersion) {
      throw new DashboardError(
        409,
        "file_changed",
        "文件已被其他程序修改。请重新载入后再删除，避免误删新版本。",
      );
    }

    await unlink(current.absolutePath);
    return {
      ok: true,
      path: toPosixPath(relative(current.realRoot, current.absolutePath)),
    };
  });
}

// ==========================================
// 章节剧情分析相关逻辑 (Chapter Analysis)
// ==========================================

function getChapterAnalysisPath(root, requestedPath) {
  if (typeof requestedPath !== "string" || requestedPath.length === 0) {
    throw new DashboardError(400, "invalid_path", "章节路径不能为空");
  }
  if (requestedPath.includes("\0") || isAbsolute(requestedPath) || /^[A-Za-z]:[\\/]/.test(requestedPath)) {
    throw new DashboardError(403, "path_outside_workspace", "只允许访问工作区内的相对路径");
  }
  const clean = requestedPath.replace(/^[/\\]+/, "").split(sep).join("/");
  if (clean.includes("..")) {
    throw new DashboardError(403, "path_outside_workspace", "路径不合法");
  }
  return resolve(root, ".story", "chapter-analysis", `${clean}.json`);
}

async function readAiConfig(root) {
  const configPath = resolve(root, ".story", "config.json");
  try {
    const raw = await readFile(configPath, "utf8");
    const json = JSON.parse(raw);
    return {
      baseUrl: json.baseUrl || process.env.OPENAI_BASE_URL || "",
      model: json.model || process.env.OPENAI_MODEL || "",
      apiKey: json.apiKey || "",
      hasApiKey: Boolean(json.apiKey || process.env.OPENAI_API_KEY),
    };
  } catch {
    return {
      baseUrl: process.env.OPENAI_BASE_URL || "",
      model: process.env.OPENAI_MODEL || "",
      apiKey: "",
      hasApiKey: Boolean(process.env.OPENAI_API_KEY),
    };
  }
}

async function saveAiConfig(root, payload) {
  const configPath = resolve(root, ".story", "config.json");
  await mkdir(dirname(configPath), { recursive: true });
  let existing = {};
  try {
    existing = JSON.parse(await readFile(configPath, "utf8"));
  } catch {}
  const merged = {
    ...existing,
    baseUrl: payload.baseUrl !== undefined ? payload.baseUrl : existing.baseUrl,
    model: payload.model !== undefined ? payload.model : existing.model,
    apiKey: payload.apiKey !== undefined ? payload.apiKey : existing.apiKey,
  };
  await writeFile(configPath, JSON.stringify(merged, null, 2), "utf8");
  return { ok: true };
}

function cleanJsonResponse(text) {
  if (!text) return "";
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const start = cleaned.search(/[{\[]/);
  if (start >= 0) {
    cleaned = cleaned.slice(start);
  }
  const end = cleaned.lastIndexOf("}");
  if (end >= 0) {
    cleaned = cleaned.slice(0, end + 1);
  }
  return cleaned;
}

function resolveAgentApiBin() {
  if (process.env.ANTIGRAVITY_BIN && existsSync(process.env.ANTIGRAVITY_BIN)) {
    return process.env.ANTIGRAVITY_BIN;
  }
  const defaultMacPath = resolve(homedir(), ".gemini", "antigravity", "bin", "agentapi");
  if (existsSync(defaultMacPath)) {
    return defaultMacPath;
  }
  return "agentapi";
}

async function getAntigravityConversationId(root) {
  let convId = process.env.ANTIGRAVITY_CONVERSATION_ID;
  if (!convId) {
    try {
      convId = (await readFile(resolve(root, ".story", ".antigravity_conversation_id"), "utf8")).trim();
    } catch {}
  }
  return convId || null;
}

async function notifyAntigravityAnalysis(root, chapterPath) {
  const convId = await getAntigravityConversationId(root);
  if (!convId) {
    console.warn("[story-dashboard] 未检测到 ANTIGRAVITY_CONVERSATION_ID 环境变量或 .story/.antigravity_conversation_id 文件");
    return;
  }
  const agentapiBin = resolveAgentApiBin();
  const prompt = `【剧情分析任务】请对章节文稿《${chapterPath}》进行剧情分析，并将完整结构化分析 JSON 写入文件：.story/chapter-analysis/${chapterPath}.json`;
  exec(`${agentapiBin} send-message --title="章节剧情分析任务" "${convId}" "${prompt.replace(/"/g, '\\"')}"`, (err) => {
    if (err) {
      console.error("[story-dashboard] agentapi 通知 Antigravity 失败:", err.message);
    } else {
      console.log(`[story-dashboard] 已通知 Antigravity 分析章节: ${chapterPath}`);
    }
  });
}

async function readChapterAnalysis(root, requestedPath) {
  const analysisPath = getChapterAnalysisPath(root, requestedPath);
  try {
    const content = await readFile(analysisPath, "utf8");
    const parsed = JSON.parse(content);
    return { exists: true, data: parsed };
  } catch (error) {
    if (error.code === "ENOENT") {
      return { exists: false };
    }
    throw error;
  }
}

async function getChapterAnalysisStatus(root, requestedPath) {
  const analysisPath = getChapterAnalysisPath(root, requestedPath);
  try {
    const content = await readFile(analysisPath, "utf8");
    const parsed = JSON.parse(content);
    return {
      exists: true,
      status: parsed.status || "completed",
      progress: parsed.progress || (parsed.status === "running" ? 45 : 100),
      message: parsed.status_message || (parsed.status === "running" ? "AI 正在分析剧情要素与伏笔..." : "分析完成"),
      updatedAt: parsed.updated_at || parsed.created_at || null,
      data: parsed.status === "completed" ? parsed : null,
    };
  } catch (error) {
    if (error.code === "ENOENT") {
      return { exists: false, status: "none", progress: 0 };
    }
    throw error;
  }
}

async function callExternalLlmAnalysis({ root, chapterPath, chapterContent, apiKey, baseUrl, model }) {
  const chapterNumberMatch = basename(chapterPath).match(/(?:第\s*(\d+)\s*章|(\d+))/);
  const chapterNumber = chapterNumberMatch ? (chapterNumberMatch[1] || chapterNumberMatch[2]) : "1";
  const title = basename(chapterPath).replace(/\.[^.]+$/, "");

  let existingForeshadowsText = "（暂无已埋入的伏笔）";
  try {
    const projectDir = resolve(root, dirname(chapterPath).split("/")[0]);
    const trackingFile = resolve(projectDir, "追踪", "_tracking-state.json");
    const raw = await readFile(trackingFile, "utf8");
    const tracking = JSON.parse(raw);
    if (tracking.foreshadows && Array.isArray(tracking.foreshadows)) {
      existingForeshadowsText = tracking.foreshadows
        .map((f, i) => `${i + 1}. 【ID: ${f.id || i}】${f.title || f.content}（第${f.plant_chapter || "?"}章埋入）`)
        .join("\n");
    }
  } catch {}

  const prompt = `你是专业的小说编辑和剧情分析师。请对以下章节进行深度剧情剖析。
【章节信息】
章节：第${chapterNumber}章
标题：${title}
字数：${chapterContent.length}字

【已埋入伏笔列表（用于回收匹配）】
${existingForeshadowsText}

【章节内容】
${chapterContent.slice(0, 10000)}

【输出格式】
必须返回合法纯 JSON（不要包含 markdown 代码块标签），数据结构如下：
{
  "scores": {
    "pacing": 8.0,
    "engagement": 8.5,
    "coherence": 8.0,
    "overall": 8.2,
    "score_justification": "评分理由简述"
  },
  "analysis_report": "章节整体剖析摘要",
  "suggestions": ["改进建议1", "改进建议2"],
  "hooks": [
    {
      "type": "悬念",
      "position": "中段",
      "strength": 8,
      "content": "具体描述",
      "keyword": "从原文逐字摘录8-25字"
    }
  ],
  "foreshadows": [
    {
      "type": "planted",
      "title": "伏笔标题",
      "content": "伏笔内容与预期作用",
      "strength": 8,
      "subtlety": 7,
      "category": "mystery",
      "reference_chapter": null,
      "keyword": "从原文逐字摘录8-25字"
    }
  ],
  "conflict": {
    "types": ["人与人", "人与环境"],
    "parties": ["主角方", "反派方"],
    "level": 8,
    "description": "核心冲突描述",
    "resolution_progress": 0.3
  },
  "emotional_arc": {
    "primary_emotion": "主导情绪",
    "intensity": 8,
    "curve": "情绪变化轨迹",
    "secondary_emotions": ["愤怒", "快意"]
  },
  "character_states": [
    {
      "character_name": "角色名",
      "state_before": "初始状态",
      "state_after": "变化后状态",
      "psychological_change": "心理变化",
      "key_event": "关键事件",
      "relationship_changes": {"相关角色": "关系变动"}
    }
  ],
  "plot_points": [
    {
      "content": "核心情节点",
      "type": "revelation",
      "importance": 0.9,
      "impact": "对故事推动作用",
      "keyword": "从原文逐字摘录"
    }
  ]
}`;

  const cleanUrl = (baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
  const endpoint = cleanUrl.endsWith("/chat/completions") ? cleanUrl : `${cleanUrl}/chat/completions`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || "gpt-4o-mini",
      temperature: 0.3,
      messages: [
        { role: "system", content: "你是一位专业的小说编辑和剧情分析师。严格返回纯JSON，不带Markdown格式。" },
        { role: "user", content: prompt },
      ],
    }),
    signal: controller.signal,
  });
  clearTimeout(timeoutId);

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`模型接口调用失败 (${res.status}): ${errorText.slice(0, 200)}`);
  }

  const json = await res.json();
  const rawContent = json?.choices?.[0]?.message?.content || "";
  const cleaned = cleanJsonResponse(rawContent);
  return JSON.parse(cleaned);
}

async function triggerChapterAnalysis(root, payload) {
  if (!payload || !payload.path) {
    throw new DashboardError(400, "invalid_payload", "缺少 path 参数");
  }
  const requestedPath = payload.path;
  const analysisPath = getChapterAnalysisPath(root, requestedPath);
  await mkdir(dirname(analysisPath), { recursive: true });

  if (!payload.force) {
    const current = await readChapterAnalysis(root, requestedPath);
    if (current.exists && current.data?.status === "completed") {
      return { ok: true, status: "completed", data: current.data };
    }
  }

  const config = await readAiConfig(root);
  const apiKey = (payload.apiKey || config.apiKey || process.env.OPENAI_API_KEY || "").trim();
  const baseUrl = (payload.baseUrl || config.baseUrl || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").trim();
  const model = (payload.model || config.model || process.env.OPENAI_MODEL || "gpt-4o-mini").trim();

  const convId = await getAntigravityConversationId(root);
  const shouldUseApi = Boolean(apiKey && (payload.method === "external_api" || !payload.useAntigravity || !convId));

  if (!shouldUseApi) {
    if (!convId) {
      throw new DashboardError(
        400,
        "missing_api_key",
        "未配置模型 API Key，且当前未检测到活跃的 Antigravity 会话。请点击右上角⚙️设置配置 API Key（支持 DeepSeek / SiliconFlow / OpenAI 兼容接口）。"
      );
    }
    const runningTask = {
      chapter_path: requestedPath,
      status: "running",
      progress: 25,
      method: "antigravity",
      created_at: Date.now(),
      status_message: "任务已发派至 Antigravity，正在分析剧情与伏笔...",
    };
    await writeFile(analysisPath, JSON.stringify(runningTask, null, 2), "utf8");
    notifyAntigravityAnalysis(root, requestedPath);
    return { ok: true, status: "running", method: "antigravity" };
  }

  try {
    const fileInfo = await readWorkspaceFile(root, requestedPath);
    const analysisResult = await callExternalLlmAnalysis({
      root,
      chapterPath: requestedPath,
      chapterContent: fileInfo.content,
      apiKey,
      baseUrl,
      model,
    });

    const fullResult = {
      chapter_path: requestedPath,
      status: "completed",
      progress: 100,
      method: "external_api",
      updated_at: Date.now(),
      analysis: analysisResult,
    };
    await writeFile(analysisPath, JSON.stringify(fullResult, null, 2), "utf8");
    return { ok: true, status: "completed", data: fullResult };
  } catch (err) {
    const failedTask = {
      chapter_path: requestedPath,
      status: "failed",
      progress: 0,
      error_message: err.message,
      updated_at: Date.now(),
    };
    await writeFile(analysisPath, JSON.stringify(failedTask, null, 2), "utf8").catch(() => {});
    throw new DashboardError(500, "analysis_failed", `AI 分析失败：${err.message}`);
  }
}

function execAsync(cmd, options = {}) {
  return new Promise((resolve) => {
    exec(cmd, { encoding: "utf8", ...options }, (error, stdout, stderr) => {
      resolve({
        code: error ? (error.code ?? 1) : 0,
        stdout: stdout || "",
        stderr: stderr || "",
        error,
      });
    });
  });
}

function getChapterAnnotationsPath(root, requestedPath) {
  if (!requestedPath || typeof requestedPath !== "string") {
    throw new DashboardError(400, "invalid_path", "缺少文件路径");
  }
  const clean = requestedPath.replace(/^[/\\]+/, "").split(sep).join("/");
  if (clean.includes("..")) {
    throw new DashboardError(403, "path_outside_workspace", "路径不合法");
  }
  return resolve(root, ".story", "annotations", `${clean}.json`);
}

async function getChapterAnnotations(root, requestedPath) {
  if (!requestedPath) return { chapterPath: "", annotations: [], updatedAt: null };
  const annPath = getChapterAnnotationsPath(root, requestedPath);
  try {
    const raw = await readFile(annPath, "utf8");
    const parsed = JSON.parse(raw);
    return {
      chapterPath: requestedPath,
      annotations: Array.isArray(parsed.annotations) ? parsed.annotations : [],
      updatedAt: parsed.updated_at || null,
    };
  } catch (error) {
    if (error.code === "ENOENT") {
      return { chapterPath: requestedPath, annotations: [], updatedAt: null };
    }
    throw error;
  }
}

async function saveChapterAnnotation(root, payload) {
  const { chapterPath, line, lineText, comment } = payload || {};
  if (!chapterPath || typeof chapterPath !== "string") {
    throw new DashboardError(400, "invalid_path", "缺少章节路径");
  }
  const lineNum = parseInt(line, 10);
  if (!lineNum || lineNum < 1) {
    throw new DashboardError(400, "invalid_line", "行号不合法");
  }
  if (!comment || typeof comment !== "string" || !comment.trim()) {
    throw new DashboardError(400, "invalid_comment", "注解内容不能为空");
  }

  const annPath = getChapterAnnotationsPath(root, chapterPath);
  await mkdir(dirname(annPath), { recursive: true });

  let existing = { chapter_path: chapterPath, annotations: [] };
  try {
    const raw = await readFile(annPath, "utf8");
    existing = JSON.parse(raw);
    if (!Array.isArray(existing.annotations)) existing.annotations = [];
  } catch {}

  const newAnnotation = {
    id: `ann_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    line: lineNum,
    line_text: typeof lineText === "string" ? lineText.slice(0, 300) : "",
    comment: comment.trim(),
    created_at: Date.now(),
  };

  existing.annotations.push(newAnnotation);
  existing.annotations.sort((a, b) => a.line - b.line);
  existing.updated_at = Date.now();

  await writeFile(annPath, JSON.stringify(existing, null, 2), "utf8");
  return { ok: true, annotation: newAnnotation, total: existing.annotations.length, annotations: existing.annotations };
}

async function deleteChapterAnnotation(root, payload) {
  const { chapterPath, id } = payload || {};
  if (!chapterPath || typeof chapterPath !== "string") {
    throw new DashboardError(400, "invalid_path", "缺少章节路径");
  }
  const annPath = getChapterAnnotationsPath(root, chapterPath);
  let existing = { chapter_path: chapterPath, annotations: [] };
  try {
    const raw = await readFile(annPath, "utf8");
    existing = JSON.parse(raw);
    if (!Array.isArray(existing.annotations)) existing.annotations = [];
  } catch (error) {
    if (error.code === "ENOENT") {
      return { ok: true, total: 0, annotations: [] };
    }
    throw error;
  }

  if (id === "all") {
    existing.annotations = [];
  } else if (id) {
    existing.annotations = existing.annotations.filter((a) => a.id !== id);
  }
  existing.updated_at = Date.now();
  await writeFile(annPath, JSON.stringify(existing, null, 2), "utf8");
  return { ok: true, total: existing.annotations.length, annotations: existing.annotations };
}

async function getAllAnnotations(root) {
  const annDir = resolve(root, ".story", "annotations");
  const results = [];
  async function scan(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const fullPath = resolve(dir, ent.name);
      if (ent.isDirectory()) {
        await scan(fullPath);
      } else if (ent.isFile() && ent.name.endsWith(".json") && !ent.name.endsWith(".applied.json")) {
        try {
          const content = await readFile(fullPath, "utf8");
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed.annotations) && parsed.annotations.length > 0) {
            results.push({
              chapterPath: parsed.chapter_path || relative(annDir, fullPath).replace(/\.json$/, ""),
              annotations: parsed.annotations,
              updatedAt: parsed.updated_at || null,
            });
          }
        } catch {}
      }
    }
  }
  await scan(annDir);
  return { ok: true, chapters: results, totalCount: results.reduce((acc, c) => acc + c.annotations.length, 0) };
}

function getChapterRegenerationPath(root, requestedPath) {
  if (!requestedPath || typeof requestedPath !== "string") {
    throw new DashboardError(400, "invalid_path", "缺少文件路径");
  }
  const clean = requestedPath.replace(/^[/\\]+/, "").split(sep).join("/");
  if (clean.includes("..")) {
    throw new DashboardError(403, "path_outside_workspace", "路径不合法");
  }
  return resolve(root, ".story", "chapter-regenerations", `${clean}.json`);
}

async function getChapterRegenerationStatus(root, requestedPath) {
  const regenPath = getChapterRegenerationPath(root, requestedPath);
  try {
    const content = await readFile(regenPath, "utf8");
    const parsed = JSON.parse(content);
    const isCompleted = parsed.status === "completed" && Boolean(parsed.new_content);
    return {
      exists: true,
      status: isCompleted ? "completed" : (parsed.status || "running"),
      progress: parsed.progress || (isCompleted ? 100 : 40),
      message: parsed.status_message || (isCompleted ? "重写完成" : "AI 正在根据建议重写章节..."),
      originalContent: parsed.original_content || "",
      newContent: parsed.new_content || "",
      selectedSuggestions: parsed.selected_suggestions || [],
      customInstructions: parsed.custom_instructions || "",
      preserveElements: parsed.preserve_elements || {},
      updatedAt: parsed.updated_at || parsed.created_at || null,
      error: parsed.error_message || null,
    };
  } catch (error) {
    if (error.code === "ENOENT") {
      return { exists: false, status: "none", progress: 0 };
    }
    throw error;
  }
}

function generateRefinedProse(content, selectedSuggestions = [], customInstructions = "") {
  let lines = content.split(/\r?\n/);

  // 1. 深度去除网文典型 AI 味句式与弱动词，替换为更有压迫感的具象动作
  const deslopReplacements = [
    [/不由得/g, "顿"],
    [/心中暗道[：:]?/g, ""],
    [/眼中闪过一丝/g, "眼底压下"],
    [/只见那/g, "那"],
    [/只见/g, ""],
    [/仿佛在诉说着/g, "正如"],
    [/不知不觉间/g, "转瞬间"],
    [/深吸了一口气/g, "五指骤紧"],
    [/嘴角勾起一抹/g, "唇角扯出半点冷"],
    [/冷笑一声道/g, "寒声道"],
    [/整截手腕光洁平整/g, "整截如霜白玉般的手腕光洁平整，骨肉匀停"],
  ];

  lines = lines.map((line) => {
    let l = line;
    for (const [pattern, repl] of deslopReplacements) {
      l = l.replace(pattern, repl);
    }
    return l;
  });

  // 2. 针对作者补充指令进行细节增强（如情绪张力与节奏压缩）
  const hasTension = customInstructions.includes("情绪") || customInstructions.includes("压迫") || selectedSuggestions.some((s) => s.includes("爽点") || s.includes("反差"));
  if (hasTension && lines.length > 8) {
    let enhanced = 0;
    for (let i = 0; i < lines.length && enhanced < 2; i++) {
      if (lines[i].includes("“") && lines[i].length > 25) {
        lines[i] = lines[i].replace(/，”/g, "，神色没有半分动摇。”");
        enhanced++;
      }
    }
  }

  return lines.join("\n");
}

async function notifyAntigravityRegeneration(root, chapterPath, selectedSuggestions = [], customInstructions = "", preserveElements = {}) {
  const convId = await getAntigravityConversationId(root);
  if (convId) {
    const agentapiBin = resolveAgentApiBin();
    const suggestionsFormatted = selectedSuggestions.length > 0
      ? selectedSuggestions.map((s, idx) => `${idx + 1}. ${s}`).join("\n")
      : "（全面提升文笔节奏与爽点反差）";

    const prompt = `【章节重构润色任务（贯彻 novel-writing 白金级 SOP）】
请对章节文稿《${chapterPath}》执行高质量定向重写（混合模式）。

## 🎯 必须重点融入的采纳建议：
${suggestionsFormatted}

${customInstructions ? `## ✍️ 作者补充要求：\n${customInstructions}\n` : ""}
## 🔒 白金作家工艺规范与硬性铁律（必须严格执行）：
1. 【大纲与白皮书深度对齐】：必须对齐本项目《000_创作者全景设定与续写白皮书.md》与对应章节细纲（大纲/细纲_第N章*.md），严格遵守境界战力、核心因果与人设语气档案；
2. 【贯彻网文五大核心法则】：
   - 战力鸿沟压弹簧（敌我天堑越悬殊，反杀越震撼）；
   - 反差爽感极致释放（破除反派虚伪假面，恶有恶报直击爽点）；
   - 突破与极道威压具象细节（体感描写、环境崩碎、视线空间严格自洽）；
   - 对白刀锋与留白（字字如刀，剔除一切废话嘴炮）；
   - 命名阶梯与设定契约（命名体系与境界称谓严密对齐设定白皮书）；
3. 【确定性去 AI 味与排版】：全篇坚决杜绝“不由得”、“心中暗道”、“只见”、“仿佛在诉说”等模板词；段落之间严禁留空行；章节标题汉字加标点严格不超过 12 个字符；各角色自称与语气严格符合人设档案；
4. 【落盘与交付】：
   - 必须先运行 check-ai-patterns.js 与 normalize-punctuation.js 确保 0 阻断项；
   - 随后结构化写入文件：.story/chapter-regenerations/${chapterPath}.json
   - 格式规范：{"chapter_path":"${chapterPath}","status":"completed","progress":100,"method":"antigravity","original_content":"...","new_content":"...","selected_suggestions":${JSON.stringify(selectedSuggestions)},"custom_instructions":${JSON.stringify(customInstructions)},"preserve_elements":${JSON.stringify(preserveElements)},"updated_at":Date.now(),"status_message":"定向重构完成"}
   - 写入完成后，工作台将自动呼出 Git 式双栏差异比对界面供作者检视合并。`;


    exec(`${agentapiBin} send-message --title="章节定向重构任务（SOP）" "${convId}" "${prompt.replace(/"/g, '\\"')}"`, (err) => {
      if (err) {
        console.error("[story-dashboard] agentapi 通知 Antigravity 失败:", err.message);
      } else {
        console.log(`[story-dashboard] 已通知 Antigravity 执行白金级重写: ${chapterPath}`);
      }
    });
  }
}

async function callExternalLlmRegeneration({
  root,
  chapterPath,
  originalContent,
  selectedSuggestions,
  customInstructions,
  preserveElements,
  targetWordCount,
  apiKey,
  baseUrl,
  model,
}) {
  const chapterTitle = basename(chapterPath).replace(/\.[^.]+$/, "");
  const suggestionsText = selectedSuggestions.length > 0
    ? selectedSuggestions.map((s, idx) => `${idx + 1}. ${s}`).join("\n")
    : "（全面提升文笔与网文节奏，强化反差与对白张力）";

  let whitepaperText = "";
  let outlineText = "";
  let contextText = "";
  try {
    const projectDirName = dirname(chapterPath).split("/")[0];
    const projectDir = resolve(root, projectDirName);

    try {
      const wp = await readFile(resolve(projectDir, "000_创作者全景设定与续写白皮书.md"), "utf8");
      whitepaperText = `\n## 📜 本书核心设定与白皮书硬性红线（必须绝对遵守）\n${wp.slice(0, 3500)}\n`;
    } catch {}

    try {
      const matchNum = chapterPath.match(/(?:第\s*0*(\d+)\s*章|(\d+))/);
      if (matchNum) {
        const num = matchNum[1] || matchNum[2];
        const numStr = num.padStart(3, "0");
        const outlineDir = resolve(projectDir, "大纲");
        const outlineFiles = await readdir(outlineDir).catch(() => []);
        const found = outlineFiles.find(f => f.includes(numStr) || f.includes(num));
        if (found) {
          const ot = await readFile(resolve(outlineDir, found), "utf8");
          outlineText = `\n## 📋 本章细纲指引（13字段标准）\n${ot.slice(0, 3000)}\n`;
        }
      }
    } catch {}

    try {
      const ctx = await readFile(resolve(projectDir, "追踪", "上下文.md"), "utf8");
      contextText = `\n## 🔄 当前剧情上下文\n${ctx.slice(0, 2000)}\n`;
    } catch {}
  } catch {}

  const prompt = `你是一位顶级中文网络小说白金作家与资深文学总监。
现在需要对章节文稿《${chapterTitle}》执行高水准的定向重构与文笔升级（混合模式）。

## 📖 原始章节正文
${originalContent}

## 🎯 本次必须重点融入的采纳建议（核心执行目标）
${suggestionsText}

${customInstructions ? `## ✍️ 作者补充自定义修改要求\n${customInstructions}\n` : ""}
## 🔒 白金作家工艺规范与网文五大核心法则
1. 【战力鸿沟压弹簧】：越阶对抗或强敌突袭时，先将压迫感压缩至窒息极限，让各方反应凸显战力天堑，反杀与破局时才具备摧枯拉朽的反差爽感；
2. 【反差爽感极致释放】：彻底打碎反派的自矜与虚伪道德绑架，绝不留任何拖泥带水的说教嘴炮；
3. 【突破与极道威压具象细节】：描写神能与法象时，杜绝空洞大词，聚焦于具象的肉身颤栗、虚空如琉璃碎裂、神纹生灭等体感与视听细节；
4. 【空间视线严密自洽】：室内外、刑台与正座、山门与主殿之间的视线与距离严密闭环，严禁透视；
5. 【对白刀锋与留白】：削减多余问答，对话如同刀锋交击，人物性格鲜明凌厉；
6. 【命名阶梯与设定契约】：功法、体质、武器、丹药等严格对齐白皮书命名体系；角色人称与语气严格遵守人设语气档案；
7. 【排版与格式】：章节标题严格不超过 12 个字符；**所有段落之间严禁留空行**；目标字数控制在 ${targetWordCount} 字左右。

${whitepaperText}
${outlineText}
${contextText}

## ⚠️ 输出绝对规范
1. 直接输出润色重构后的完整章节正文内容。
2. 严禁包含任何前言、后记、说明、Markdown 标题以外的解释文字、代码块标记（不要带有 \`\`\` 标记）。
3. 严格去AI味：坚决杜绝“不由得”、“心中暗道”、“只见”、“仿佛”等套路词。`;

  const cleanUrl = (baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
  const endpoint = cleanUrl.endsWith("/chat/completions") ? cleanUrl : `${cleanUrl}/chat/completions`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || "gpt-4o-mini",
      temperature: 0.7,
      messages: [
        { role: "system", content: "你是一位顶级中文网络小说白金作家。直接输出高水准润色重构后的正文全文，绝不输出任何多余废话或解释。" },
        { role: "user", content: prompt },
      ],
    }),
    signal: controller.signal,
  });
  clearTimeout(timeoutId);

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`重写接口调用失败 (${res.status}): ${errorText.slice(0, 200)}`);
  }

  const json = await res.json();
  let rawContent = json?.choices?.[0]?.message?.content || "";
  rawContent = rawContent.replace(/^```(?:markdown)?\s*/i, "").replace(/\s*```$/i, "").trim();

  // 标点规整与确定性去AI味后处理
  try {
    rawContent = await normalizeContentPunctuation(root, rawContent);
  } catch {}

  return rawContent;
}

async function triggerChapterRegeneration(root, payload) {
  if (!payload || !payload.path) {
    throw new DashboardError(400, "invalid_payload", "缺少 path 参数");
  }
  const requestedPath = payload.path;
  const regenPath = getChapterRegenerationPath(root, requestedPath);
  await mkdir(dirname(regenPath), { recursive: true });

  const fileInfo = await readWorkspaceFile(root, requestedPath);
  const originalContent = fileInfo.content;
  const selectedSuggestions = Array.isArray(payload.selectedSuggestions) ? payload.selectedSuggestions : [];
  const customInstructions = (payload.customInstructions || "").trim();
  const preserveElements = payload.preserveElements || {
    preserveStructure: true,
    preserveCharacterTraits: true,
    deslopStrict: true,
  };
  const targetWordCount = Number(payload.targetWordCount) || countCharacters(originalContent) || 3000;

  const config = await readAiConfig(root);
  const apiKey = (payload.apiKey || config.apiKey || process.env.OPENAI_API_KEY || "").trim();
  const baseUrl = (payload.baseUrl || config.baseUrl || process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").trim();
  const model = (payload.model || config.model || process.env.OPENAI_MODEL || "gpt-4o-mini").trim();

  const convId = await getAntigravityConversationId(root);
  const shouldUseApi = Boolean(apiKey && (payload.method === "external_api" || !payload.useAntigravity || !convId));

  if (!shouldUseApi) {
    if (!convId) {
      throw new DashboardError(
        400,
        "missing_api_key",
        "未配置模型 API Key，且当前未检测到活跃的 Antigravity 会话。请点击右上角⚙️设置配置 API Key。"
      );
    }
    const runningTask = {
      chapter_path: requestedPath,
      status: "running",
      progress: 30,
      method: "antigravity",
      original_content: originalContent,
      new_content: "",
      selected_suggestions: selectedSuggestions,
      custom_instructions: customInstructions,
      preserve_elements: preserveElements,
      target_word_count: targetWordCount,
      created_at: Date.now(),
      status_message: "任务已发派至 Antigravity，正在根据建议定向润色重写...",
    };
    await writeFile(regenPath, JSON.stringify(runningTask, null, 2), "utf8");
    notifyAntigravityRegeneration(root, requestedPath, selectedSuggestions, customInstructions, preserveElements);
    return { ok: true, status: "running", method: "antigravity" };
  }

  try {
    const newContent = await callExternalLlmRegeneration({
      root,
      chapterPath: requestedPath,
      originalContent,
      selectedSuggestions,
      customInstructions,
      preserveElements,
      targetWordCount,
      apiKey,
      baseUrl,
      model,
    });

    const fullResult = {
      chapter_path: requestedPath,
      status: "completed",
      progress: 100,
      method: "external_api",
      original_content: originalContent,
      new_content: newContent,
      selected_suggestions: selectedSuggestions,
      custom_instructions: customInstructions,
      preserve_elements: preserveElements,
      target_word_count: targetWordCount,
      updated_at: Date.now(),
    };
    await writeFile(regenPath, JSON.stringify(fullResult, null, 2), "utf8");
    return { ok: true, status: "completed", data: fullResult };
  } catch (err) {
    const failedTask = {
      chapter_path: requestedPath,
      status: "failed",
      progress: 0,
      error_message: err.message,
      original_content: originalContent,
      updated_at: Date.now(),
    };
    await writeFile(regenPath, JSON.stringify(failedTask, null, 2), "utf8").catch(() => {});
    throw new DashboardError(500, "regeneration_failed", `重写生成失败：${err.message}`);
  }
}

async function runChapterVerification(root, chapterPath, content) {
  const tmpDir = resolve(root, ".story", "temp");
  await mkdir(tmpDir, { recursive: true });
  const hash = createHash("sha256").update(chapterPath + Date.now().toString()).digest("hex").slice(0, 8);
  const tmpFile = resolve(tmpDir, `verify_${hash}.md`);
  await writeFile(tmpFile, content, "utf8");

  const deslopScriptsDir = resolve(root, ".agents", "skills", "story-deslop", "scripts");
  const normScript = resolve(deslopScriptsDir, "normalize-punctuation.js");
  const aiScript = resolve(deslopScriptsDir, "check-ai-patterns.js");
  const degenScript = resolve(deslopScriptsDir, "check-degeneration.js");

  let punctuationResult = { ok: true, output: "" };
  let aiPatternsResult = { ok: true, blocking: [], advisories: [] };
  let degenerationResult = { ok: true, findings: [] };

  try {
    const puncRes = await execAsync(`node "${normScript}" --check "${tmpFile}"`);
    punctuationResult = {
      ok: puncRes.code === 0,
      output: (puncRes.stdout || puncRes.stderr).trim(),
    };

    const aiRes = await execAsync(`node "${aiScript}" --check --json --fail-on=blocking "${tmpFile}"`);
    let aiFindings = [];
    try {
      const parsed = JSON.parse(aiRes.stdout || "{}");
      aiFindings = Array.isArray(parsed.findings) ? parsed.findings : [];
    } catch {}
    const blocking = aiFindings.filter((f) => f.severity === "blocking");
    const advisories = aiFindings.filter((f) => f.severity !== "blocking");
    aiPatternsResult = {
      ok: blocking.length === 0,
      blocking,
      advisories,
    };

    const degenRes = await execAsync(`node "${degenScript}" --check --json "${tmpFile}"`);
    let degenFindings = [];
    try {
      const parsed = JSON.parse(degenRes.stdout || "{}");
      degenFindings = Array.isArray(parsed.findings) ? parsed.findings : [];
    } catch {}
    degenerationResult = {
      ok: degenFindings.length === 0,
      findings: degenFindings,
    };
  } finally {
    await unlink(tmpFile).catch(() => {});
  }

  const charCount = [...content.replace(/\s/g, "")].length;
  const passed = punctuationResult.ok && aiPatternsResult.ok && degenerationResult.ok;
  return {
    passed,
    hasBlocking: !aiPatternsResult.ok,
    punctuation: punctuationResult,
    aiPatterns: aiPatternsResult,
    degeneration: degenerationResult,
    wordCount: { count: charCount },
  };
}

async function normalizeContentPunctuation(root, content) {
  const tmpDir = resolve(root, ".story", "temp");
  await mkdir(tmpDir, { recursive: true });
  const hash = createHash("sha256").update(Date.now().toString()).digest("hex").slice(0, 8);
  const tmpFile = resolve(tmpDir, `norm_${hash}.md`);
  await writeFile(tmpFile, content, "utf8");
  const deslopScriptsDir = resolve(root, ".agents", "skills", "story-deslop", "scripts");
  const normScript = resolve(deslopScriptsDir, "normalize-punctuation.js");
  try {
    await execAsync(`node "${normScript}" "${tmpFile}"`);
    return await readFile(tmpFile, "utf8");
  } catch {
    return content;
  } finally {
    await unlink(tmpFile).catch(() => {});
  }
}

async function runTrackingCommitIfPossible(root, chapterPath) {
  const clean = chapterPath.replace(/^[/\\]+/, "").split(sep).join("/");
  const parts = clean.split("/");
  if (parts.length >= 2) {
    const projectName = parts[0];
    const chapterFilename = parts[parts.length - 1];
    const match = chapterFilename.match(/(?:第\s*(\d+)\s*章|(\d+))/);
    const chapterNum = match ? (match[1] || match[2]) : null;
    const projectDir = resolve(root, projectName);
    const trackingStatePath = resolve(projectDir, "追踪", "_tracking-state.json");
    try {
      await stat(trackingStatePath);
      if (chapterNum) {
        const storyctlScript = resolve(root, ".agents", "skills", "story-long-write", "scripts", "storyctl.py");
        const res = await execAsync(`python3 "${storyctlScript}" chapter check --project "${projectDir}" --chapter ${chapterNum}`);
        return { attempted: true, code: res.code, stdout: res.stdout.trim() };
      }
    } catch {}
  }
  return { attempted: false };
}

async function applyMergedChapter(root, payload) {
  if (!payload || !payload.path || payload.content === undefined) {
    throw new DashboardError(400, "invalid_payload", "缺少 path 或 content 参数");
  }
  const requestedPath = payload.path;
  let content = payload.content;

  const verification = await runChapterVerification(root, requestedPath, content);
  if (verification.hasBlocking && !payload.force) {
    return {
      ok: false,
      blocked: true,
      message: "落盘拦截：检测到阻断级去AI味禁词，请先核改或勾选强制覆盖",
      verification,
    };
  }

  content = await normalizeContentPunctuation(root, content);
  const resolved = await resolveWorkspacePath(root, requestedPath, { editableOnly: true });
  const currentFileContent = await readFile(resolved.absolutePath, "utf8");
  const expectedVersion = payload.expectedVersion || fileVersion(currentFileContent);

  const saveRes = await saveWorkspaceFile(root, { path: requestedPath, content, expectedVersion });
  const trackingRes = await runTrackingCommitIfPossible(root, requestedPath);

  try {
    const regenPath = getChapterRegenerationPath(root, requestedPath);
    const raw = await readFile(regenPath, "utf8");
    const json = JSON.parse(raw);
    json.status = "applied";
    json.applied_at = Date.now();
    await writeFile(regenPath, JSON.stringify(json, null, 2), "utf8");
  } catch {}

  // 重点：章节重构合并落盘后，旧剧情分析数据已过时失效（建议已被采纳），物理删除过时分析缓存
  try {
    const analysisPath = getChapterAnalysisPath(root, requestedPath);
    await unlink(analysisPath).catch(() => {});
  } catch {}

  return {
    ok: true,
    path: requestedPath,
    wordCount: countCharacters(content),
    verification,
    tracking: trackingRes,
    file: saveRes,
    savedContent: content,
    analysisCleared: true,
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
  if (["PUT", "DELETE", "POST"].includes(request.method) && request.headers.origin) {
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
      if (request.method === "GET" && url.pathname === "/api/tree") {
        sendJson(
          response,
          200,
          await listWorkspaceDirectory(
            workspaceRoot,
            url.searchParams.get("path") || "",
            url.searchParams.get("cursor"),
          ),
        );
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/search") {
        sendJson(
          response,
          200,
          await searchWorkspace(
            workspaceRoot,
            url.searchParams.get("q") || "",
            url.searchParams.get("scope") || "",
          ),
        );
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
      if (request.method === "GET" && url.pathname === "/api/chapter-analysis") {
        sendJson(
          response,
          200,
          await readChapterAnalysis(workspaceRoot, url.searchParams.get("path") || ""),
        );
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/chapter-analysis/status") {
        sendJson(
          response,
          200,
          await getChapterAnalysisStatus(workspaceRoot, url.searchParams.get("path") || ""),
        );
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/chapter-analysis") {
        sendJson(
          response,
          200,
          await triggerChapterAnalysis(workspaceRoot, await readJsonBody(request)),
        );
        return;
      }
      if (request.method === "DELETE" && url.pathname === "/api/chapter-analysis") {
        const requestedPath = url.searchParams.get("path") || "";
        if (requestedPath) {
          try {
            const analysisPath = getChapterAnalysisPath(workspaceRoot, requestedPath);
            await unlink(analysisPath).catch(() => {});
          } catch {}
        }
        sendJson(response, 200, { ok: true, cleared: true });
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/chapter-regenerate/status") {
        sendJson(
          response,
          200,
          await getChapterRegenerationStatus(workspaceRoot, url.searchParams.get("path") || ""),
        );
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/chapter-regenerate") {
        sendJson(
          response,
          200,
          await triggerChapterRegeneration(workspaceRoot, await readJsonBody(request)),
        );
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/chapter-verify") {
        const body = await readJsonBody(request);
        sendJson(
          response,
          200,
          await runChapterVerification(workspaceRoot, body.path || "", body.content || ""),
        );
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/chapter-apply-merge") {
        sendJson(
          response,
          200,
          await applyMergedChapter(workspaceRoot, await readJsonBody(request)),
        );
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/annotations") {
        sendJson(
          response,
          200,
          await getChapterAnnotations(workspaceRoot, url.searchParams.get("path") || ""),
        );
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/annotations/all") {
        sendJson(
          response,
          200,
          await getAllAnnotations(workspaceRoot),
        );
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/annotations") {
        sendJson(
          response,
          200,
          await saveChapterAnnotation(workspaceRoot, await readJsonBody(request)),
        );
        return;
      }
      if (request.method === "DELETE" && url.pathname === "/api/annotations") {
        const isJson = request.headers["content-type"]?.includes("application/json");
        const body = isJson
          ? await readJsonBody(request)
          : { chapterPath: url.searchParams.get("path") || "", id: url.searchParams.get("id") || "" };
        sendJson(
          response,
          200,
          await deleteChapterAnnotation(workspaceRoot, body),
        );
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/ai-config") {
        sendJson(response, 200, await readAiConfig(workspaceRoot));
        return;
      }
      if (request.method === "PUT" && url.pathname === "/api/ai-config") {
        sendJson(response, 200, await saveAiConfig(workspaceRoot, await readJsonBody(request)));
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
