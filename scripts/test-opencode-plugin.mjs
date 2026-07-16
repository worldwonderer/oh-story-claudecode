#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = path.join(repoRoot, "skills/story-setup/references/opencode");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "story-opencode-plugin-"));
const originalCwd = process.cwd();

// plugin.ts imports "./lib/story_hook_core.js"（与 ZCode 共享的 prose-guard 核，部署到
// .opencode/plugins/lib/）。仓库源码里核是平铺的，只有部署布局才有 lib/ 子目录；在 tmp 里
// 复刻部署布局，import 才能解析到核。
const deployDir = path.join(tmp, "plugins");
fs.mkdirSync(path.join(deployDir, "lib"), { recursive: true });
fs.copyFileSync(path.join(srcDir, "plugin.ts"), path.join(deployDir, "plugin.ts"));
fs.copyFileSync(
  path.join(srcDir, "story_hook_core.js"),
  path.join(deployDir, "lib", "story_hook_core.js")
);
const pluginPath = path.join(deployDir, "plugin.ts");

async function expectBlocked(action, label) {
  await assert.rejects(action, /写正文被拦截/, label);
}

try {
  execFileSync("git", ["init", "-q", tmp]);
  process.chdir(tmp);
  const imported = await import(`${pathToFileURL(pluginPath).href}?test=${Date.now()}`);
  const hooks = await imported.default({});
  assert.equal(typeof hooks["tool.execute.before"], "function");
  assert.equal(typeof hooks["tool.execute.after"], "function");
  assert.equal(typeof hooks["experimental.session.compacting"], "function");

  fs.mkdirSync("book/正文", { recursive: true });
  fs.mkdirSync("book/大纲", { recursive: true });
  fs.mkdirSync("book/追踪", { recursive: true });
  fs.writeFileSync("book/追踪/上下文.md", "# 上下文\n当前位置\n", "utf8");
  fs.writeFileSync(".active-book", "book\n", "utf8");

  await expectBlocked(
    () =>
      hooks["tool.execute.before"](
        { tool: "write" },
        { args: { filePath: "book/正文/第001章_开局.md" } }
      ),
    "new long prose without an outline"
  );

  fs.writeFileSync("book/大纲/细纲_第1章.md", "# 细纲\n", "utf8");
  await hooks["tool.execute.before"](
    { tool: "write" },
    { args: { filePath: "book/正文/第001章_开局.md" } }
  );

  fs.writeFileSync("book/正文/第002章_续写.md", "已有正文。\n", "utf8");
  await hooks["tool.execute.before"](
    { tool: "edit" },
    { args: { filePath: "book/正文/第002章_续写.md" } }
  );

  await expectBlocked(
    () =>
      hooks["tool.execute.before"](
        { tool: "bash" },
        { args: { command: "cat draft.md > book/正文/第003章_绕过.md" } }
      ),
    "bash redirect must not bypass the outline guard"
  );
  await hooks["tool.execute.before"](
    { tool: "bash" },
    { args: { command: "grep 'book/正文/第003章_绕过.md' notes.md" } }
  );

  fs.mkdirSync("short", { recursive: true });
  fs.writeFileSync("short/设定.md", "# 设定\n", "utf8");
  await expectBlocked(
    () =>
      hooks["tool.execute.before"](
        { tool: "write" },
        { args: { filePath: "short/正文.md" } }
      ),
    "new short prose without section outline"
  );
  fs.writeFileSync("short/小节大纲.md", "# 小节大纲\n", "utf8");
  await hooks["tool.execute.before"](
    { tool: "write" },
    { args: { filePath: "short/正文.md" } }
  );

  fs.writeFileSync(
    "book/正文/第001章_开局.md",
    `${"街灯一盏盏亮起。".repeat(30)}\nTODO 此处待补`,
    "utf8"
  );
  const afterOutput = { output: "write complete" };
  await hooks["tool.execute.after"](
    { tool: "write", args: { filePath: "book/正文/第001章_开局.md" } },
    afterOutput
  );
  assert.match(afterOutput.output, /正文兜底检测/);
  assert.match(afterOutput.output, /占位符/);

  const nonProseOutput = { output: "unchanged" };
  fs.writeFileSync("notes.md", "TODO\n", "utf8");
  await hooks["tool.execute.after"](
    { tool: "write", args: { filePath: "notes.md" } },
    nonProseOutput
  );
  assert.equal(nonProseOutput.output, "unchanged");

  const compact = { context: [] };
  await hooks["experimental.session.compacting"]({}, compact);
  assert(compact.context.some((entry) => entry.includes("Writing context: book/追踪/上下文.md")));

  console.log("OK: OpenCode plugin guards outlines and reports after-write findings behaviorally");
} finally {
  process.chdir(originalCwd);
  fs.rmSync(tmp, { recursive: true, force: true });
}
