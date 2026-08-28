#!/usr/bin/env node
'use strict'

const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

const repoRoot = path.resolve(__dirname, '..')
const verifier = path.join(repoRoot, 'skills/story-short-write/scripts/check-delivery-contract.js')
const skillFile = path.join(repoRoot, 'skills/story-short-write/SKILL.md')
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'delivery-contract-'))

function body(charsPerSection = 1000, sections = 6, style = 'numeric') {
  const rows = []
  for (let index = 1; index <= sections; index++) {
    const marker = style === 'zhihu' ? `${index}.` : `###${index}.`
    rows.push(marker, '字'.repeat(charsPerSection))
  }
  return `${rows.join('\n')}\n`
}

function writeCase(name, text) {
  const dir = path.join(tmpRoot, name)
  fs.mkdirSync(dir, { recursive: true })
  if (text !== null) fs.writeFileSync(path.join(dir, '正文.md'), text, 'utf8')
  return dir
}

function run(dir, values = ['6000', '8000', '6']) {
  const result = spawnSync(process.execPath, [
    verifier, '--json', '--min-chars', values[0], '--max-chars', values[1],
    '--sections', values[2], dir,
  ], { cwd: repoRoot, encoding: 'utf8' })
  const report = result.stdout.trim() ? JSON.parse(result.stdout) : null
  return { ...result, report }
}

function failureIds(result) {
  return result.report.failures.map((failure) => failure.id)
}

try {
  const skill = fs.readFileSync(skillFile, 'utf8')
  assert.match(skill, /用户明确的字数范围优先/)
  assert.match(skill, /check-delivery-contract\.js --json --min-chars/)

  const good = run(writeCase('valid', body()))
  assert.strictEqual(good.status, 0, good.stdout + good.stderr)
  assert.strictEqual(good.report.ok, true)
  assert.strictEqual(good.report.contract.metric, 'non_whitespace_unicode_chars_v1')

  const goodZhihu = run(writeCase('valid-zhihu', body(1000, 6, 'zhihu')))
  assert.strictEqual(goodZhihu.status, 0, goodZhihu.stdout + goodZhihu.stderr)

  const tooLong = run(writeCase('too-long', body(1400)))
  assert.strictEqual(tooLong.status, 1)
  assert.deepStrictEqual(failureIds(tooLong), ['delivery.visible-chars'])

  const wrongSections = run(writeCase('wrong-sections', body(1200, 5)))
  assert.strictEqual(wrongSections.status, 1)
  assert(failureIds(wrongSections).includes('delivery.section-count'))

  const mixed = body().replace('###6.', '6.')
  const mixedStyle = run(writeCase('mixed-style', mixed))
  assert.strictEqual(mixedStyle.status, 1)
  assert.deepStrictEqual(failureIds(mixedStyle), ['delivery.section-style'])

  const duplicateMarker = run(writeCase('duplicate-marker', body().replace('###6.', '###5.')))
  assert.strictEqual(duplicateMarker.status, 1)
  assert.deepStrictEqual(failureIds(duplicateMarker), ['delivery.section-sequence'])

  const blank = body().replace('字\n###2.', '字\n\n另一段\n###2.')
  const blankLines = run(writeCase('blank-lines', blank))
  assert.strictEqual(blankLines.status, 1)
  assert(failureIds(blankLines).includes('delivery.blank-lines'))

  // 文件末尾的空行只是落盘习惯，不算段间空行。
  const trailingBlank = run(writeCase('trailing-blank', `${body()}\n\n`))
  assert.strictEqual(trailingBlank.status, 0, trailingBlank.stdout + trailingBlank.stderr)
  assert.strictEqual(trailingBlank.report.ok, true)

  const missing = run(writeCase('missing', null))
  assert.strictEqual(missing.status, 1)
  assert.deepStrictEqual(failureIds(missing), ['delivery.body-readable'])

  const invalid = spawnSync(process.execPath, [verifier, '--json', '--min-chars', '8000'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  assert.strictEqual(invalid.status, 2)
  assert.match(invalid.stderr, /用法/)

  process.stdout.write('delivery-contract: all tests passed\n')
} finally {
  fs.rmSync(tmpRoot, { recursive: true, force: true })
}
