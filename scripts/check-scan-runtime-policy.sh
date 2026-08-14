#!/bin/bash
# Static dependency policies that isolated helper tests cannot prove.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

node - "$ROOT" <<'JS'
const fs = require("fs")
const path = require("path")

const root = process.argv[2]
const failures = []
const scraperDirs = [
  "skills/story-long-scan/scripts",
  "skills/story-short-scan/scripts",
]
const scrapers = scraperDirs.flatMap((relative) => {
  const directory = path.join(root, relative)
  return fs.readdirSync(directory)
    .filter((name) => name.endsWith("-scraper.js"))
    .map((name) => path.join(directory, name))
})

if (!scrapers.length) failures.push("no scraper files found")
for (const file of scrapers) {
  const source = fs.readFileSync(file, "utf8")
  const name = path.relative(root, file)
  if (/toISOString\(\)\s*\.slice\(0,\s*10\)/.test(source)) {
    failures.push(`${name}: output dates must not use UTC toISOString().slice(0,10)`)
  }
  if (!source.includes("localDateStamp()")) {
    failures.push(`${name}: output filenames must depend on localDateStamp()`)
  }
}

const setupPath = path.join(root, "skills/browser-cdp/scripts/setup-cdp-chrome.js")
const setup = fs.readFileSync(setupPath, "utf8")
if (!/http\.get\([^\n]+\{[^\n]*agent:\s*false/.test(setup)) {
  failures.push("setup-cdp-chrome.js: CDP probes must disable the keep-alive agent")
}
const listenerStart = setup.indexOf("function listPortListenerPids(port)")
const listenerEnd = setup.indexOf("/** 全机", listenerStart)
const listener = listenerStart >= 0 && listenerEnd > listenerStart
  ? setup.slice(listenerStart, listenerEnd)
  : ""
if (!listener.includes("Get-NetTCPConnection")) {
  failures.push("setup-cdp-chrome.js: Windows listener lookup must use structured OwningProcess data")
}
if (/LISTENING\\s/.test(listener)) {
  failures.push("setup-cdp-chrome.js: netstat fallback must not depend on localized LISTENING text")
}

if (failures.length) {
  for (const failure of failures) console.error(`FAIL: ${failure}`)
  process.exit(1)
}
console.log(`PASS: ${scrapers.length} scraper date dependencies and CDP source policies`)
JS
