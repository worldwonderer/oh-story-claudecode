import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, test } from "node:test";
import {
  DashboardError,
  browserLaunchCommand,
  createDashboardServer,
  pathsReferToSameFile,
  resolveWorkspacePath,
  scanWorkspace,
} from "../skills/story/scripts/dashboard-server.mjs";

const temporaryDirectories = [];
const runningServers = [];

afterEach(async () => {
  await Promise.all(
    runningServers.splice(0).map(
      (server) => new Promise((accept) => server.close(accept)),
    ),
  );
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

async function createWorkspace() {
  const root = await mkdtemp(resolve(tmpdir(), "oh-story-dashboard-test-"));
  temporaryDirectories.push(root);
  await mkdir(resolve(root, "拆文库", "盘龙", "章节"), { recursive: true });
  await mkdir(resolve(root, "长篇", "示例书", "大纲"), { recursive: true });
  await mkdir(resolve(root, "长篇", "示例书", "正文"), { recursive: true });
  await mkdir(resolve(root, ".git", "objects"), { recursive: true });
  await mkdir(resolve(root, "node_modules", "fake-package"), { recursive: true });
  await writeFile(resolve(root, "拆文库", "盘龙", "拆文报告.md"), "# 盘龙\n", "utf8");
  await writeFile(resolve(root, "拆文库", "盘龙", "章节", "第1章.md"), "第一章", "utf8");
  await writeFile(resolve(root, "长篇", "示例书", "大纲", "总纲.md"), "# 总纲\n", "utf8");
  await writeFile(resolve(root, "长篇", "示例书", "正文", "第001章.md"), "初稿", "utf8");
  await writeFile(resolve(root, ".git", "config"), "secret", "utf8");
  await writeFile(resolve(root, "node_modules", "fake-package", "index.js"), "x", "utf8");
  await writeFile(resolve(root, "长篇", "示例书", "封面.png"), "not-an-image", "utf8");
  return root;
}

async function startServer(root) {
  const server = createDashboardServer({ root });
  await new Promise((accept, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", accept);
  });
  runningServers.push(server);
  const { port } = server.address();
  return `http://127.0.0.1:${port}`;
}

describe("workspace scanning", () => {
  test("discovers canonical demo libraries and the real writing project", async () => {
    const workspace = await scanWorkspace(resolve("demo"));
    assert.deepEqual(
      workspace.libraries.map((entry) => entry.path),
      ["拆文库/曾将爱意私藏", "拆文库/盘龙"],
    );
    assert.deepEqual(
      workspace.projects.map((entry) => entry.path),
      ["长篇/让你管账号，你高燃混剪炸全网"],
    );
    assert.equal(workspace.stats.libraries, 2);
    assert.equal(workspace.stats.projects, 1);
    assert.ok(workspace.stats.editableFiles > 100);
  });

  test("ignores infrastructure folders and marks unsupported files read-only", async () => {
    const root = await createWorkspace();
    const workspace = await scanWorkspace(root);
    const serialized = JSON.stringify(workspace);
    assert.doesNotMatch(serialized, /\.git|node_modules|fake-package/);

    const project = workspace.projects[0];
    const cover = project.children.find((entry) => entry.name === "封面.png");
    assert.equal(cover.editable, false);
    assert.equal(workspace.stats.libraries, 1);
    assert.equal(workspace.stats.projects, 1);
  });
});

describe("path boundary", () => {
  test("rejects traversal and absolute paths", async () => {
    const root = await createWorkspace();
    await assert.rejects(
      resolveWorkspacePath(root, "../outside.md"),
      (error) => error instanceof DashboardError && error.code === "path_outside_workspace",
    );
    await assert.rejects(
      resolveWorkspacePath(root, "/etc/hosts"),
      (error) => error instanceof DashboardError && error.code === "path_outside_workspace",
    );
  });

  test("does not follow file symlinks", async (context) => {
    const root = await createWorkspace();
    const outside = resolve(root, "..", `outside-${Date.now()}.md`);
    await writeFile(outside, "outside", "utf8");
    temporaryDirectories.push(outside);
    try {
      await symlink(outside, resolve(root, "逃逸.md"));
    } catch (error) {
      if (error?.code === "EPERM") {
        context.skip("当前平台不允许创建测试符号链接");
        return;
      }
      throw error;
    }
    await assert.rejects(
      resolveWorkspacePath(root, "逃逸.md", { editableOnly: true }),
      (error) => error instanceof DashboardError && error.code === "symlink_not_editable",
    );
  });
});

describe("CLI portability", () => {
  test("uses each operating system's default-browser command", () => {
    const url = "http://127.0.0.1:43110";
    assert.deepEqual(browserLaunchCommand(url, "darwin"), {
      command: "open",
      args: [url],
    });
    assert.deepEqual(browserLaunchCommand(url, "linux"), {
      command: "xdg-open",
      args: [url],
    });
    assert.deepEqual(browserLaunchCommand(url, "win32"), {
      command: "cmd",
      args: ["/c", "start", "", url],
    });
  });

  test("recognizes the CLI entrypoint through a symlinked install path", async (context) => {
    const root = await createWorkspace();
    const alias = `${root}-alias`;
    temporaryDirectories.push(alias);
    try {
      await symlink(root, alias, process.platform === "win32" ? "junction" : "dir");
    } catch (error) {
      if (error?.code === "EPERM") {
        context.skip("当前平台不允许创建测试目录链接");
        return;
      }
      throw error;
    }

    assert.equal(
      pathsReferToSameFile(
        resolve(root, "长篇", "示例书", "正文", "第001章.md"),
        resolve(alias, "长篇", "示例书", "正文", "第001章.md"),
      ),
      true,
    );
  });
});

describe("HTTP API", () => {
  test("loads and atomically saves an editable file", async () => {
    const root = await createWorkspace();
    const baseUrl = await startServer(root);
    const filePath = "长篇/示例书/正文/第001章.md";

    const loadedResponse = await fetch(
      `${baseUrl}/api/file?path=${encodeURIComponent(filePath)}`,
    );
    assert.equal(loadedResponse.status, 200);
    assert.match(loadedResponse.headers.get("content-security-policy"), /default-src 'self'/);
    const loaded = await loadedResponse.json();
    assert.equal(loaded.content, "初稿");

    const savedResponse = await fetch(`${baseUrl}/api/file`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: filePath,
        content: "修改后的正文",
        expectedMtimeMs: loaded.mtimeMs,
      }),
    });
    assert.equal(savedResponse.status, 200);
    const saved = await savedResponse.json();
    assert.equal(saved.ok, true);
    assert.equal(await readFile(resolve(root, filePath), "utf8"), "修改后的正文");
  });

  test("returns 409 instead of overwriting an externally changed file", async () => {
    const root = await createWorkspace();
    const baseUrl = await startServer(root);
    const filePath = "长篇/示例书/正文/第001章.md";
    const loaded = await fetch(
      `${baseUrl}/api/file?path=${encodeURIComponent(filePath)}`,
    ).then((response) => response.json());

    await new Promise((accept) => setTimeout(accept, 20));
    await writeFile(resolve(root, filePath), "外部程序的新内容", "utf8");

    const response = await fetch(`${baseUrl}/api/file`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: filePath,
        content: "Dashboard 里的旧内容",
        expectedMtimeMs: loaded.mtimeMs,
      }),
    });
    assert.equal(response.status, 409);
    const payload = await response.json();
    assert.equal(payload.error.code, "file_changed");
    assert.equal(await readFile(resolve(root, filePath), "utf8"), "外部程序的新内容");
  });

  test("deletes an unchanged editable file but rejects cross-origin deletion", async () => {
    const root = await createWorkspace();
    const baseUrl = await startServer(root);
    const filePath = "长篇/示例书/正文/第001章.md";
    const loaded = await fetch(
      `${baseUrl}/api/file?path=${encodeURIComponent(filePath)}`,
    ).then((response) => response.json());

    const rejected = await fetch(`${baseUrl}/api/file`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://example.com",
      },
      body: JSON.stringify({
        path: filePath,
        expectedMtimeMs: loaded.mtimeMs,
      }),
    });
    assert.equal(rejected.status, 403);
    assert.equal((await rejected.json()).error.code, "invalid_origin");
    assert.equal(await readFile(resolve(root, filePath), "utf8"), "初稿");

    const deletedResponse = await fetch(`${baseUrl}/api/file`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: filePath,
        expectedMtimeMs: loaded.mtimeMs,
      }),
    });
    assert.equal(deletedResponse.status, 200);
    const deleted = await deletedResponse.json();
    assert.deepEqual(deleted, { ok: true, path: filePath });
    await assert.rejects(
      readFile(resolve(root, filePath), "utf8"),
      (error) => error?.code === "ENOENT",
    );
  });

  test("does not delete a file changed after it was opened", async () => {
    const root = await createWorkspace();
    const baseUrl = await startServer(root);
    const filePath = "长篇/示例书/正文/第001章.md";
    const loaded = await fetch(
      `${baseUrl}/api/file?path=${encodeURIComponent(filePath)}`,
    ).then((response) => response.json());

    await new Promise((accept) => setTimeout(accept, 20));
    await writeFile(resolve(root, filePath), "外部程序的新内容", "utf8");

    const response = await fetch(`${baseUrl}/api/file`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: filePath,
        expectedMtimeMs: loaded.mtimeMs,
      }),
    });
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error.code, "file_changed");
    assert.equal(await readFile(resolve(root, filePath), "utf8"), "外部程序的新内容");
  });

  test("rejects unsupported files, traversal, and malformed JSON", async () => {
    const root = await createWorkspace();
    const baseUrl = await startServer(root);

    const unsupported = await fetch(
      `${baseUrl}/api/file?path=${encodeURIComponent("长篇/示例书/封面.png")}`,
    );
    assert.equal(unsupported.status, 415);

    const traversal = await fetch(
      `${baseUrl}/api/file?path=${encodeURIComponent("../outside.md")}`,
    );
    assert.equal(traversal.status, 403);

    const malformed = await fetch(`${baseUrl}/api/file`, {
      method: "PUT",
      body: "{bad",
    });
    assert.equal(malformed.status, 400);
    assert.equal((await malformed.json()).error.code, "invalid_json");

    const versionless = await fetch(`${baseUrl}/api/file`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: "长篇/示例书/正文/第001章.md",
        content: "不能无版本覆盖",
      }),
    });
    assert.equal(versionless.status, 400);
    assert.equal((await versionless.json()).error.code, "missing_file_version");
  });
});
