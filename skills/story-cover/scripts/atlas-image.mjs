#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const DEFAULT_BASE_URL = "https://api.atlascloud.ai/api/v1";
const DEFAULT_MODEL = "bytedance/seedream-v5.0-lite";
const DEFAULT_SIZE = "1664*2496";
const DEFAULT_SUBMIT_PATH = "model/generateVideo";
const DEFAULT_RESULT_PATH = "model/result";

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`invalid argument: ${key ?? ""}`);
    }
    values[key.slice(2)] = value;
  }
  return values;
}

function unwrap(payload) {
  return payload?.data && typeof payload.data === "object" ? payload.data : payload;
}

function apiError(payload) {
  if (payload?.error) {
    return typeof payload.error === "string"
      ? payload.error
      : payload.error.message || JSON.stringify(payload.error);
  }
  if (payload?.code !== undefined && ![0, 200].includes(payload.code)) {
    return payload.message || `Atlas Cloud API returned code ${payload.code}`;
  }
  return null;
}

async function readJson(response, stage) {
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`${stage} returned non-JSON response (HTTP ${response.status})`);
  }

  const error = apiError(payload);
  if (!response.ok || error) {
    throw new Error(`${stage} failed: ${error || `HTTP ${response.status}`}`);
  }
  return payload;
}

function joinUrl(baseUrl, path) {
  return `${baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

function outputUrl(payload) {
  const data = unwrap(payload);
  const outputs = data?.outputs ?? data?.output;
  if (Array.isArray(outputs)) return outputs.find(Boolean);
  return typeof outputs === "string" ? outputs : undefined;
}

function isImage(bytes) {
  const png =
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47;
  const jpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  return png || jpeg;
}

const sleep = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const prompt = args.prompt?.trim();
  const output = args.output ? resolve(args.output) : "";
  const apiKey = process.env.ATLASCLOUD_API_KEY;

  if (!apiKey) throw new Error("ATLASCLOUD_API_KEY is required");
  if (!prompt) throw new Error("--prompt is required");
  if (!output) throw new Error("--output is required");

  const baseUrl = process.env.ATLASCLOUD_API_BASE_URL || DEFAULT_BASE_URL;
  const model = args.model || process.env.ATLASCLOUD_IMAGE_MODEL || DEFAULT_MODEL;
  const size = args.size || process.env.ATLASCLOUD_IMAGE_SIZE || DEFAULT_SIZE;
  const submitPath = process.env.ATLASCLOUD_IMAGE_SUBMIT_PATH || DEFAULT_SUBMIT_PATH;
  const resultPath = process.env.ATLASCLOUD_IMAGE_RESULT_PATH || DEFAULT_RESULT_PATH;
  const pollInterval = Number(process.env.ATLASCLOUD_POLL_INTERVAL_MS || 3000);
  const timeout = Number(process.env.ATLASCLOUD_TIMEOUT_MS || 180000);

  const submitResponse = await fetch(joinUrl(baseUrl, submitPath), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, prompt, size, output_format: "png" }),
  });
  const submitted = await readJson(submitResponse, "image submission");
  const predictionId = unwrap(submitted)?.id;
  if (!predictionId) throw new Error("image submission did not return a prediction id");

  const deadline = Date.now() + timeout;
  let imageUrl;
  while (Date.now() < deadline) {
    const resultResponse = await fetch(joinUrl(baseUrl, `${resultPath}/${encodeURIComponent(predictionId)}`), {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const result = await readJson(resultResponse, "prediction polling");
    const status = String(unwrap(result)?.status || "").toLowerCase();
    if (["completed", "succeeded"].includes(status)) {
      imageUrl = outputUrl(result);
      if (!imageUrl) throw new Error("completed prediction did not return an output URL");
      break;
    }
    if (["failed", "canceled", "cancelled"].includes(status)) {
      throw new Error(`prediction ${predictionId} ended with status ${status}`);
    }
    await sleep(pollInterval);
  }
  if (!imageUrl) throw new Error(`prediction ${predictionId} timed out after ${timeout}ms`);

  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) throw new Error(`image download failed: HTTP ${imageResponse.status}`);
  const bytes = new Uint8Array(await imageResponse.arrayBuffer());
  if (!isImage(bytes)) throw new Error("downloaded output is not a PNG or JPEG image");

  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, bytes);
  await writeFile(`${output.replace(/\.[^.]+$/, "")}.prompt.txt`, `${prompt}\n`, "utf8");
  process.stdout.write(`${output}\n`);
}

main().catch((error) => {
  process.stderr.write(`Atlas Cloud cover generation failed: ${error.message}\n`);
  process.exitCode = 1;
});
