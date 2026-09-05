import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { afterEach, describe, test } from "node:test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createDashboardServer } from "../skills/story/scripts/dashboard-server.mjs";

const execFileAsync = promisify(execFile);
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
  const root = await mkdtemp(resolve(tmpdir(), "oh-story-annotations-test-"));
  temporaryDirectories.push(root);
  await mkdir(resolve(root, "示例书", "正文"), { recursive: true });
  await writeFile(
    resolve(root, "示例书", "正文", "第001章.md"),
    "第一行内容。\n第二行测试段落。\n第三行结尾。",
    "utf8",
  );
  return root;
}

async function startTestServer(root) {
  const server = createDashboardServer({ root });
  runningServers.push(server);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : null;
  return "http://127.0.0.1:" + port;
}

describe("Dashboard Annotations API", () => {
  test("creates, lists, and deletes chapter annotations", async () => {
    const root = await createWorkspace();
    const origin = await startTestServer(root);
    const chapterPath = "示例书/正文/第001章.md";

    const getRes1 = await fetch(origin + "/api/annotations?path=" + encodeURIComponent(chapterPath));
    assert.equal(getRes1.status, 200);
    const getData1 = await getRes1.json();
    assert.deepEqual(getData1.annotations, []);

    const postRes = await fetch(origin + "/api/annotations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chapterPath,
        line: 2,
        lineText: "第二行测试段落。",
        comment: "此处反差需要进一步拉满",
      }),
    });
    assert.equal(postRes.status, 200);
    const postData = await postRes.json();
    assert.equal(postData.ok, true);
    assert.equal(postData.total, 1);
    const annId = postData.annotation.id;
    assert.ok(annId);

    const getAllRes = await fetch(origin + "/api/annotations/all");
    assert.equal(getAllRes.status, 200);
    const allData = await getAllRes.json();
    assert.equal(allData.ok, true);
    assert.equal(allData.chapters.length, 1);
    assert.equal(allData.chapters[0].chapterPath, chapterPath);
    assert.equal(allData.chapters[0].annotations[0].comment, "此处反差需要进一步拉满");

    const delRes = await fetch(origin + "/api/annotations", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chapterPath,
        id: annId,
      }),
    });
    assert.equal(delRes.status, 200);
    const delData = await delRes.json();
    assert.equal(delData.ok, true);
    assert.equal(delData.total, 0);
  });
});

describe("Dashboard AI Config and Plot Analysis API", () => {
  test("saves AI config and handles chapter analysis dispatch", async () => {
    const root = await createWorkspace();
    const origin = await startTestServer(root);
    const chapterPath = "示例书/正文/第001章.md";

    const putCfgRes = await fetch(origin + "/api/ai-config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-4o-mini",
        apiKey: "sk-test-key",
      }),
    });
    assert.equal(putCfgRes.status, 200);

    const getCfgRes = await fetch(origin + "/api/ai-config");
    assert.equal(getCfgRes.status, 200);
    const cfg = await getCfgRes.json();
    assert.equal(cfg.baseUrl, "https://api.openai.com/v1");
    assert.equal(cfg.model, "gpt-4o-mini");
    assert.equal(cfg.hasApiKey, true);

    await fetch(origin + "/api/ai-config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baseUrl: "", model: "", apiKey: "" }),
    });

    const savedConvId = process.env.ANTIGRAVITY_CONVERSATION_ID;
    delete process.env.ANTIGRAVITY_CONVERSATION_ID;
    try {
      const postAnalysisRes = await fetch(origin + "/api/chapter-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: chapterPath, force: true }),
      });
      assert.equal(postAnalysisRes.status, 400);
      const errData = await postAnalysisRes.json();
      assert.equal(errData.error?.code, "missing_api_key");
    } finally {
      if (savedConvId) {
        process.env.ANTIGRAVITY_CONVERSATION_ID = savedConvId;
      }
    }
  });
});

describe("Python Annotation CLI", () => {
  test("check_annotations.py discovers and clears annotations", async () => {
    const root = await createWorkspace();
    const scriptPath = resolve(process.cwd(), "skills/story/scripts/check_annotations.py");
    const chapterPath = "示例书/正文/第001章.md";

    const annDir = resolve(root, ".story", "annotations", "示例书", "正文");
    await mkdir(annDir, { recursive: true });
    await writeFile(
      resolve(annDir, "第001章.md.json"),
      JSON.stringify({
        chapter_path: chapterPath,
        annotations: [
          { id: "ann_1", line: 1, line_text: "第一行内容。", comment: "需要改写" },
        ],
        updated_at: Date.now(),
      }),
      "utf8",
    );

    const { stdout: stdoutJson } = await execFileAsync("python3", [
      scriptPath,
      "--root",
      root,
      "--json",
    ]);
    const parsed = JSON.parse(stdoutJson);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].chapter_path, chapterPath);
    assert.equal(parsed[0].annotations.length, 1);

    const { stdout: stdoutClear } = await execFileAsync("python3", [
      scriptPath,
      "--root",
      root,
      "--clear",
      "--json",
    ]);
    const clearResult = JSON.parse(stdoutClear);
    assert.equal(clearResult.ok, true);
    assert.equal(clearResult.cleared, 1);

    const { stdout: stdoutAfter } = await execFileAsync("python3", [
      scriptPath,
      "--root",
      root,
      "--json",
    ]);
    const parsedAfter = JSON.parse(stdoutAfter);
    assert.equal(parsedAfter.length, 0);
  });
});
