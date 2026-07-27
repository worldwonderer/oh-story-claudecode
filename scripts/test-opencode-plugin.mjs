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

  fs.mkdirSync("bare/正文", { recursive: true });
  await expectBlocked(
    () =>
      hooks["tool.execute.before"](
        { tool: "write" },
        { args: { filePath: "bare/正文/第1章_首章.md" } }
      ),
    "bare long project without scaffolding must fail closed"
  );

  fs.mkdirSync("cwd-book/正文", { recursive: true });
  fs.mkdirSync("cwd-book/大纲", { recursive: true });
  await assert.rejects(
    () =>
      hooks["tool.execute.before"](
        { tool: "bash" },
        {
          args: {
            command: "cat draft.md > 正文/第8章_相对.md",
            workdir: path.join(tmp, "cwd-book"),
          },
        }
      ),
    /cwd-book\/大纲/,
    "relative Bash target must resolve from the tool workdir"
  );
  fs.writeFileSync("cwd-book/大纲/细纲_第8章.md", "# 细纲\n", "utf8");
  await hooks["tool.execute.before"](
    { tool: "bash" },
    {
      args: {
        command: "cat draft.md > 正文/第8章_相对.md",
        workdir: path.join(tmp, "cwd-book"),
      },
    }
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

  // apply_patch 是 OpenCode 的 edit 类工具，且 gpt-5 系模型只暴露它、隐藏 write/edit：
  // 守卫与落盘兜底都必须认它，否则那类模型整场没有大纲守卫和正文兜底。
  const addPatch = (target) =>
    `*** Begin Patch\n*** Add File: ${target}\n+正文第一句。\n*** End Patch\n`;
  await expectBlocked(
    () =>
      hooks["tool.execute.before"](
        { tool: "apply_patch" },
        { args: { patchText: addPatch("book/正文/第004章_补丁.md") } }
      ),
    "apply_patch must not bypass the outline guard"
  );
  fs.writeFileSync("book/大纲/细纲_第4章.md", "# 细纲\n", "utf8");
  await hooks["tool.execute.before"](
    { tool: "apply_patch" },
    { args: { patchText: addPatch("book/正文/第004章_补丁.md") } }
  );

  // *** Move to: 是 apply_patch 的搬家/改名形态（Update/Delete File 段的子指令），落盘路径是
  // 目的地。只认 Add/Update File 时「Update draft.md + Move to 书/正文/第N章.md」只抽到
  // draft.md：细纲门整条空过、写后兜底网扫的还是已不存在的源，等于把无细纲草稿直接搬成新章。
  const movePatch = (source, destination, verb = "Update") =>
    `*** Begin Patch\n*** ${verb} File: ${source}\n*** Move to: ${destination}\n+正文第一句。\n*** End Patch\n`;
  fs.writeFileSync("draft.md", "草稿一句。\n", "utf8");
  await expectBlocked(
    () =>
      hooks["tool.execute.before"](
        { tool: "apply_patch" },
        { args: { patchText: movePatch("draft.md", "book/正文/第009章_搬家.md") } }
      ),
    "apply_patch *** Move to: must not bypass the outline guard"
  );
  // 判据必须落在目的地那一章（第 9 章），而不是源 draft.md（源不是正文，本就不该被判）
  await assert.rejects(
    () =>
      hooks["tool.execute.before"](
        { tool: "apply_patch" },
        { args: { patchText: movePatch("draft.md", "book/正文/第009章_搬家.md") } }
      ),
    /第 9 章缺少细纲/,
    "Move 的拦截判据必须算在目的地章号上"
  );
  // Delete File + Move to（搬走后删源）也是搬家：目的地同样要进表
  await expectBlocked(
    () =>
      hooks["tool.execute.before"](
        { tool: "apply_patch" },
        { args: { patchText: movePatch("draft.md", "book/正文/第010章_搬家.md", "Delete") } }
      ),
    "*** Delete File: + *** Move to: must gate the destination too"
  );
  // 补上细纲就放行：门是补细纲能过的门，不是把 Move 一律拦死
  fs.writeFileSync("book/大纲/细纲_第9章.md", "# 细纲\n", "utf8");
  await hooks["tool.execute.before"](
    { tool: "apply_patch" },
    { args: { patchText: movePatch("draft.md", "book/正文/第009章_搬家.md") } }
  );
  // 反向：把正文搬出 正文/（目的地不是正文）不该被拦——源不再被当成写入目标
  await hooks["tool.execute.before"](
    { tool: "apply_patch" },
    { args: { patchText: movePatch("book/正文/第002章_续写.md", "draft_out.md") } }
  );
  // 纯 Delete 不入表（共享核里写明的取舍）：删一个不存在、也没细纲的章号不该被误报成写正文
  await hooks["tool.execute.before"](
    { tool: "apply_patch" },
    {
      args: {
        patchText: "*** Begin Patch\n*** Delete File: book/正文/第011章_删稿.md\n*** End Patch\n",
      },
    }
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

  fs.writeFileSync(
    "book/正文/第004章_补丁.md",
    `${"街灯一盏盏亮起。".repeat(30)}\nTODO 此处待补`,
    "utf8"
  );
  const patchAfterOutput = { output: "patch applied" };
  await hooks["tool.execute.after"](
    { tool: "apply_patch", args: { patchText: addPatch("book/正文/第004章_补丁.md") } },
    patchAfterOutput
  );
  assert.match(patchAfterOutput.output, /正文兜底检测/);
  assert.match(patchAfterOutput.output, /占位符/);

  const nonProsePatchOutput = { output: "unchanged" };
  await hooks["tool.execute.after"](
    { tool: "apply_patch", args: { patchText: addPatch("notes.md") } },
    nonProsePatchOutput
  );
  assert.equal(nonProsePatchOutput.output, "unchanged");

  // 搬家式补丁的写后兜底：要扫的是**目的地**那一章。只认 Add/Update File 时这里抽到 draft.md，
  // 网整条空过——搬进 正文/ 的章带着 TODO 也没人回话。
  fs.writeFileSync(
    "book/正文/第009章_搬家.md",
    `${"街灯一盏盏亮起。".repeat(30)}\nTODO 此处待补`,
    "utf8"
  );
  const moveAfterOutput = { output: "patch applied" };
  await hooks["tool.execute.after"](
    {
      tool: "apply_patch",
      args: { patchText: movePatch("draft.md", "book/正文/第009章_搬家.md") },
    },
    moveAfterOutput
  );
  assert.match(moveAfterOutput.output, /正文兜底检测（book\/正文\/第009章_搬家\.md）/);
  assert.match(moveAfterOutput.output, /占位符/);

  // 反向：搬出 正文/ 的补丁不该拿源去扫（源已不存在；目的地不是正文）——结果原样返回
  const moveOutAfterOutput = { output: "unchanged" };
  await hooks["tool.execute.after"](
    {
      tool: "apply_patch",
      args: { patchText: movePatch("book/正文/第009章_搬家.md", "draft_out.md") },
    },
    moveOutAfterOutput
  );
  assert.equal(moveOutAfterOutput.output, "unchanged");

  // 非写类工具必须在 dispatch 前返回，不为 read/grep/... fork 一次 git rev-parse
  // （插件常驻 OpenCode 服务进程，这笔同步 execSync 会卡事件循环）。
  // 用只记账的 git shim 顶掉 PATH：读类工具后账本必须为空，写类工具后必须有记录——
  // 后一条防止这个断言变成永真。
  if (process.platform !== "win32") {
    const shimDir = path.join(tmp, "bin");
    const gitLog = path.join(tmp, "git-calls.log");
    fs.mkdirSync(shimDir, { recursive: true });
    fs.writeFileSync(
      path.join(shimDir, "git"),
      `#!/bin/sh\nprintf '%s\\n' "$*" >> ${JSON.stringify(gitLog)}\nprintf '%s\\n' ${JSON.stringify(tmp)}\n`,
      { mode: 0o755 }
    );
    const realPath = process.env.PATH;
    process.env.PATH = shimDir;
    try {
      for (const tool of ["read", "grep", "glob", "list", "todowrite", "webfetch"]) {
        await hooks["tool.execute.before"]({ tool, args: {} }, { args: {} });
      }
      assert.equal(
        fs.existsSync(gitLog),
        false,
        "non-write tools must not fork git rev-parse"
      );
      await hooks["tool.execute.before"](
        { tool: "write" },
        { args: { filePath: "book/正文/第002章_续写.md" } }
      );
      assert.match(
        fs.readFileSync(gitLog, "utf8"),
        /rev-parse/,
        "git shim must actually intercept projectRoot()"
      );
    } finally {
      process.env.PATH = realPath;
    }
  }

  const compact = { context: [] };
  await hooks["experimental.session.compacting"]({}, compact);
  assert(compact.context.some((entry) => entry.includes("Writing context: book/追踪/上下文.md")));

  console.log("OK: OpenCode plugin guards outlines and reports after-write findings behaviorally");
} finally {
  process.chdir(originalCwd);
  fs.rmSync(tmp, { recursive: true, force: true });
}
