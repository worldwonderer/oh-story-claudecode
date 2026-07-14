#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "..");
const normalizer = path.join(
  repoRoot,
  "skills/story-deslop/scripts/normalize-punctuation.js"
);
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "normalize-punctuation-"));

function run(args) {
  return spawnSync(process.execPath, [normalizer, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

try {
  const prose = path.join(tmpDir, "prose.md");
  const original = [
    "---",
    "title: fixture",
    "---",
    "# 标题",
    "他说……答案就是这样——真的。",
    "10--20",
    "---",
    "```text",
    "围栏内……与---必须保留",
    "```",
    "「引号……保留样式」",
    "",
  ].join("\r\n");
  fs.writeFileSync(prose, original, "utf8");

  const check = run(["--check", prose]);
  assert.strictEqual(check.status, 1, check.stderr);
  assert.match(check.stdout, /ellipsis/);
  assert.match(check.stdout, /em-dash/);
  assert.match(check.stdout, /double-hyphen/);
  assert.match(check.stdout, /markdown-divider/);
  assert.strictEqual(fs.readFileSync(prose, "utf8"), original, "--check must not write");

  const write = run([prose]);
  assert.strictEqual(write.status, 0, write.stderr);
  const normalized = fs.readFileSync(prose, "utf8");
  assert(normalized.includes("title: fixture\r\n---"), "frontmatter must remain intact");
  assert(normalized.includes("围栏内……与---必须保留"), "fenced text must remain intact");
  assert(normalized.includes("10到20"), "numeric ranges must use 到");
  assert(normalized.includes("「引号，保留样式」"), "default mode must keep quote style");
  assert(!normalized.split("\r\n").includes("---", 3), "body divider must be removed");
  assert(normalized.includes("\r\n"), "CRLF input must keep CRLF output");
  const normalizedProse = normalized
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "")
    .replace(/```[\s\S]*?```/g, "");
  assert(!/(?:……|——|--)/m.test(normalizedProse));

  const second = run([prose]);
  assert.strictEqual(second.status, 0, second.stderr);
  assert.match(second.stdout, /Changed files: 0/);
  assert.strictEqual(fs.readFileSync(prose, "utf8"), normalized, "normalization must be idempotent");

  const fences = path.join(tmpDir, "fences.md");
  const fencedOriginal = [
    "~~~markdown",
    "tilde 围栏内……必须保留",
    "```",
    "不同标记不能关闭——仍须保留",
    "~~",
    "更短的波浪线不能关闭--仍须保留",
    "~~~",
    "波浪线围栏外……必须归一化",
    "````markdown",
    "```javascript",
    "四反引号围栏内……必须保留",
    "```",
    "较短的反引号不能关闭——仍须保留",
    "````",
    "反引号围栏外……必须归一化",
    "",
  ].join("\n");
  fs.writeFileSync(fences, fencedOriginal, "utf8");

  const fencedWrite = run([fences]);
  assert.strictEqual(fencedWrite.status, 0, fencedWrite.stderr);
  const fencedNormalized = fs.readFileSync(fences, "utf8");
  assert(fencedNormalized.includes("tilde 围栏内……必须保留"));
  assert(fencedNormalized.includes("不同标记不能关闭——仍须保留"));
  assert(fencedNormalized.includes("更短的波浪线不能关闭--仍须保留"));
  assert(fencedNormalized.includes("四反引号围栏内……必须保留"));
  assert(fencedNormalized.includes("较短的反引号不能关闭——仍须保留"));
  assert(fencedNormalized.includes("波浪线围栏外，必须归一化"));
  assert(fencedNormalized.includes("反引号围栏外，必须归一化"));

  const ascii = path.join(tmpDir, "ascii.md");
  fs.writeFileSync(ascii, "「甲」与“乙”\n", "utf8");
  assert.strictEqual(run(["--quote-mode=ascii", ascii]).status, 0);
  assert.strictEqual(fs.readFileSync(ascii, "utf8"), '"甲"与"乙"\n');

  const yan = path.join(tmpDir, "yan.md");
  fs.writeFileSync(yan, '"甲"和“乙”\n', "utf8");
  assert.strictEqual(run(["--quote-mode", "yan", yan]).status, 0);
  assert.strictEqual(fs.readFileSync(yan, "utf8"), "「甲」和「乙」\n");

  const missing = run([path.join(tmpDir, "missing.md")]);
  assert.strictEqual(missing.status, 2);
  assert.match(missing.stderr, /unable to read/);

  console.log("OK: punctuation normalizer check/write, robust fences, CRLF, quote modes, and errors");
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
