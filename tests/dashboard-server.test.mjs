import assert from "node:assert/strict";
import { chmod, mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
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
  // 基建目录必须落在被扫描的库/项目内部：放在工作区根下永远进不了树，
  // 断言就成了空转，测不出忽略规则有没有失效。
  await mkdir(resolve(root, "长篇", "示例书", ".git", "objects"), { recursive: true });
  await mkdir(resolve(root, "长篇", "示例书", "正文", "node_modules", "fake-package"), {
    recursive: true,
  });
  await mkdir(resolve(root, "拆文库", "盘龙", ".omc", "state"), { recursive: true });
  await writeFile(resolve(root, "拆文库", "盘龙", "拆文报告.md"), "# 盘龙\n", "utf8");
  await writeFile(resolve(root, "拆文库", "盘龙", "章节", "第1章.md"), "第一章", "utf8");
  await writeFile(resolve(root, "长篇", "示例书", "大纲", "总纲.md"), "# 总纲\n", "utf8");
  await writeFile(resolve(root, "长篇", "示例书", "正文", "第001章.md"), "初稿", "utf8");
  await writeFile(resolve(root, "长篇", "示例书", ".git", "config"), "secret", "utf8");
  await writeFile(
    resolve(root, "长篇", "示例书", "正文", "node_modules", "fake-package", "index.js"),
    "x",
    "utf8",
  );
  await writeFile(resolve(root, "拆文库", "盘龙", ".omc", "state", "secrets.json"), "{}", "utf8");
  await writeFile(resolve(root, "长篇", "示例书", "封面.png"), "not-an-image", "utf8");
  return root;
}

// 真造一棵超过 MAX_TREE_DEPTH 的目录：深度上限是靠 buildTreeNode 剪子树实现的，
// 只有走真实 scanWorkspace 才能测出「文件被剪掉却不报截断」这类静默漏文件。
async function createDeepWorkspace(nesting = 12) {
  const root = await mkdtemp(resolve(tmpdir(), "oh-story-dashboard-deep-"));
  temporaryDirectories.push(root);
  const projectRoot = resolve(root, "长篇", "深书");
  await mkdir(resolve(projectRoot, "大纲"), { recursive: true });
  await mkdir(resolve(projectRoot, "正文"), { recursive: true });
  await writeFile(resolve(projectRoot, "正文", "第001章.md"), "初稿", "utf8");
  // 正文 从项目根算起是第 1 层，再往下套 nesting 层，最深的文稿必然越过深度上限
  const deepDirectory = resolve(
    projectRoot,
    "正文",
    ...Array.from({ length: nesting }, (_, index) => `卷${index + 1}`),
  );
  await mkdir(deepDirectory, { recursive: true });
  await writeFile(resolve(deepDirectory, "埋掉的一章.md"), "深处的正文", "utf8");
  return root;
}

// 节点预算同样会真的丢文件，用一棵扁平但超量的项目树顶到 MAX_TREE_NODES。
async function createOversizedWorkspace(fileCount = 5010) {
  const root = await mkdtemp(resolve(tmpdir(), "oh-story-dashboard-oversized-"));
  temporaryDirectories.push(root);
  const body = resolve(root, "长篇", "巨书", "正文");
  await mkdir(resolve(root, "长篇", "巨书", "大纲"), { recursive: true });
  await mkdir(body, { recursive: true });
  for (let start = 0; start < fileCount; start += 200) {
    await Promise.all(
      Array.from({ length: Math.min(200, fileCount - start) }, (_, offset) =>
        writeFile(
          resolve(body, `第${String(start + offset + 1).padStart(5, "0")}章.md`),
          "初稿",
          "utf8",
        ),
      ),
    );
  }
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
    // 前端要靠这几个字段判断「树是否被截断」，缺一个就会又变成静默漏文件
    assert.equal(workspace.limits.truncated, false);
    assert.equal(workspace.limits.truncatedByNodes, false);
    assert.equal(workspace.limits.truncatedByDepth, false);
    assert.ok(workspace.limits.maxTreeNodes > 0);
    assert.ok(workspace.limits.maxTreeDepth > 0);
  });

  test("reports truncation when the depth cap prunes a subtree", async () => {
    const root = await createDeepWorkspace();
    const workspace = await scanWorkspace(root);

    // 深度上限确实剪掉了文稿，那就必须报截断：这里报 false 就是让文件凭空消失
    assert.equal(workspace.limits.truncated, true);
    assert.equal(workspace.limits.truncatedByDepth, true);
    assert.equal(workspace.limits.truncatedByNodes, false);
    // 只有深度触顶，节点预算根本没打满，别把两种成因搅在一起
    assert.ok(workspace.limits.maxTreeDepth > 0);

    const serialized = JSON.stringify(workspace);
    assert.doesNotMatch(serialized, /埋掉的一章/);
    // 剪掉深处子树不能连带毁掉整棵树：浅层正文和项目本身都要照常列出
    assert.match(serialized, /第001章\.md/);
    assert.equal(workspace.projects.length, 1);
  });

  test("keeps depth truncation quiet when every file fits inside the cap", async () => {
    const root = await createDeepWorkspace(6);
    const workspace = await scanWorkspace(root);

    // 没越线就不能报截断，否则提示条恒亮，等于又变成没人看的噪音
    assert.equal(workspace.limits.truncated, false);
    assert.equal(workspace.limits.truncatedByDepth, false);
    assert.match(JSON.stringify(workspace), /埋掉的一章/);
  });

  test("reports truncation when the node budget runs out", async () => {
    const root = await createOversizedWorkspace();
    const workspace = await scanWorkspace(root);

    assert.equal(workspace.limits.truncated, true);
    assert.equal(workspace.limits.truncatedByNodes, true);
    assert.equal(workspace.limits.truncatedByDepth, false);
    assert.ok(workspace.stats.files <= workspace.limits.maxTreeNodes);
  });

  test("ignores infrastructure folders and marks unsupported files read-only", async () => {
    const root = await createWorkspace();
    const workspace = await scanWorkspace(root);
    const serialized = JSON.stringify(workspace);
    assert.doesNotMatch(serialized, /\.git|node_modules|fake-package|\.omc|secrets\.json/);
    assert.match(serialized, /第001章\.md/);

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
        expectedVersion: loaded.version,
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
        expectedVersion: loaded.version,
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
        expectedVersion: loaded.version,
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
        expectedVersion: loaded.version,
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
        expectedVersion: loaded.version,
      }),
    });
    assert.equal(response.status, 409);
    assert.equal((await response.json()).error.code, "file_changed");
    assert.equal(await readFile(resolve(root, filePath), "utf8"), "外部程序的新内容");
  });

  test("accepts only one of several simultaneous saves based on the same version", async () => {
    const root = await createWorkspace();
    const baseUrl = await startServer(root);
    const filePath = "长篇/示例书/正文/第001章.md";
    const loaded = await fetch(
      `${baseUrl}/api/file?path=${encodeURIComponent(filePath)}`,
    ).then((response) => response.json());

    const responses = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        fetch(`${baseUrl}/api/file`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            path: filePath,
            content: `并发写入-${index}`,
            expectedVersion: loaded.version,
          }),
        }),
      ),
    );
    const statuses = responses.map((response) => response.status);
    assert.equal(statuses.filter((status) => status === 200).length, 1, statuses);
    assert.equal(statuses.filter((status) => status === 409).length, 7, statuses);
    assert.match(await readFile(resolve(root, filePath), "utf8"), /^并发写入-[0-7]$/);
  });

  test("serializes simultaneous save and delete operations on the same version", async () => {
    const root = await createWorkspace();
    const baseUrl = await startServer(root);
    const filePath = "长篇/示例书/正文/第001章.md";
    const loaded = await fetch(
      `${baseUrl}/api/file?path=${encodeURIComponent(filePath)}`,
    ).then((response) => response.json());
    const versionedPath = { path: filePath, expectedVersion: loaded.version };

    const [saved, deleted] = await Promise.all([
      fetch(`${baseUrl}/api/file`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...versionedPath, content: "保存胜出时的正文" }),
      }),
      fetch(`${baseUrl}/api/file`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(versionedPath),
      }),
    ]);
    assert.deepEqual([saved.status, deleted.status].sort(), [200, 409]);
    if (saved.status === 200) {
      assert.equal(await readFile(resolve(root, filePath), "utf8"), "保存胜出时的正文");
    } else {
      await assert.rejects(
        readFile(resolve(root, filePath), "utf8"),
        (error) => error?.code === "ENOENT",
      );
    }
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

    // 删除同样必须带版本号：409 那道比较挡不住它（NaN > 0.5 恒为 false），
    // 少了这条断言，去掉守卫也能一路绿灯把章节删干净。
    const chapterPath = "长篇/示例书/正文/第001章.md";
    const versionlessDelete = await fetch(`${baseUrl}/api/file`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: chapterPath }),
    });
    assert.equal(versionlessDelete.status, 400);
    assert.equal((await versionlessDelete.json()).error.code, "missing_file_version");
    assert.equal(await readFile(resolve(root, chapterPath), "utf8"), "初稿");
  });

  test("keeps the saved file's permission bits instead of letting umask narrow them", async (context) => {
    if (process.platform === "win32") {
      context.skip("Windows 不使用 POSIX 权限位");
      return;
    }
    const root = await createWorkspace();
    const baseUrl = await startServer(root);
    const filePath = "长篇/示例书/正文/第001章.md";
    const absolutePath = resolve(root, filePath);
    await chmod(absolutePath, 0o664);

    const previousUmask = process.umask(0o022);
    try {
      const loaded = await fetch(
        `${baseUrl}/api/file?path=${encodeURIComponent(filePath)}`,
      ).then((response) => response.json());
      const saved = await fetch(`${baseUrl}/api/file`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: filePath,
          content: "改过的正文",
          expectedVersion: loaded.version,
        }),
      });
      assert.equal(saved.status, 200);
      assert.equal((await stat(absolutePath)).mode & 0o777, 0o664);
    } finally {
      process.umask(previousUmask);
    }
  });

  test("still serves the rest of the workspace when one library directory is unreadable", async (context) => {
    if (process.platform === "win32" || process.getuid?.() === 0) {
      context.skip("当前平台或用户无法制造不可读目录");
      return;
    }
    const root = await createWorkspace();
    const baseUrl = await startServer(root);
    const libraryRoot = resolve(root, "拆文库");
    await chmod(libraryRoot, 0o000);
    try {
      const response = await fetch(`${baseUrl}/api/workspace`);
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.deepEqual(payload.libraries, []);
      assert.equal(payload.limits.truncated, true);
      assert.equal(payload.limits.truncatedByReadError, true);
      assert.deepEqual(
        payload.scanErrors.map(({ path, code }) => ({ path, code })),
        [{ path: "拆文库", code: "EACCES" }],
      );
      assert.deepEqual(
        payload.projects.map((entry) => entry.path),
        ["长篇/示例书"],
      );
    } finally {
      await chmod(libraryRoot, 0o755);
    }
  });

  test("reports an actionable error when the workspace root itself is unreadable", async (context) => {
    if (process.platform === "win32" || process.getuid?.() === 0) {
      context.skip("当前平台或用户无法制造不可读目录");
      return;
    }
    const root = await createWorkspace();
    const baseUrl = await startServer(root);
    await chmod(root, 0o000);
    try {
      const response = await fetch(`${baseUrl}/api/workspace`);
      assert.equal(response.status, 403);
      const payload = await response.json();
      assert.equal(payload.error.code, "workspace_unreadable");
      assert.match(payload.error.message, /工作区目录无法读取/);
    } finally {
      await chmod(root, 0o755);
    }
  });
});
