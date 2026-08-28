#!/usr/bin/env node
'use strict'

const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

const repoRoot = path.resolve(__dirname, '..')
const verifier = path.join(repoRoot, 'skills/story-long-write/scripts/check-outline-contract.js')
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'outline-contract-'))

const FIELDS = [
  ['核心事件', '江晨拿到伴奏后决定去老兵家里听故事'],
  ['字数目标', '2300 字'],
  ['字数口径', 'visible_chars_v1'],
  ['阶段位置', '收尾期 · 第2阶段第11章'],
  ['单元ID/位置', 'U03；单元内第 1 拍'],
  ['目标情绪', '踏实的期待 → 被托付的沉重'],
  ['主角目标/关键选择', '要真实素材；在报批与先去听故事之间选一个'],
  ['章节定位', '推进'],
  ['本章结构公式', '接到邀约 + 上门 + 老兵开口 + 立下承诺'],
  ['章首钩子', '悬念前置 — 老人把铁盒推过来'],
  ['爽点', '无显性爽点，功能是把宏大叙事落到具体的人身上'],
  ['本章禁止提前释放', '铁盒内容与终局表彰的关系'],
  ['契约风险', '契约安全'],
]

function outline(overrides = {}) {
  const fields = FIELDS
    .filter(([name]) => overrides.dropField !== name)
    .map(([name, value]) => `- ${name}：${overrides.fieldValues?.[name] ?? value}`)
  const table = overrides.plotTable ?? [
    '| # | 情节点（谁做了什么） | 功能标签 | 执行边界 |',
    '|---|---|---|---|',
    '| 1 | 江晨接到邀约 | 铺垫 | 只给邀约，不提铁盒 |',
    '| 2 | 老人推过铁盒 | 高潮 | 只讲当年，不评价当下 |',
  ].join('\n')
  const acts = ['起因', '发展', '转折', '高潮', '结尾']
    .filter((act) => overrides.dropAct !== act)
    .map((act) => `- ${act}：本章${act}内容`)
  return [
    '## 细纲（第 21 章）',
    '',
    '### 第 21 章：新的伴奏',
    ...fields,
    '',
    '#### 内容概括（五段式）',
    ...acts,
    '',
    '#### 情节安排（多线）',
    '- 主线推进：新作品素材来源确定',
    '- 辅线推进：无',
    '- 逻辑线：拿到伴奏 → 缺素材 → 接受邀约 → 背上承诺',
    '',
    '#### 人物关系和出场顺序',
    '- 出场顺序：江晨、赵大柱',
    '- 人物关系变化：陌生受访者 → 托付关系',
    '',
    '#### 情节细化',
    '- 情节点序列（逐行填下表）：',
    '',
    table,
    '',
  ].join('\n')
}

function writeCase(name, body) {
  const dir = path.join(tmpRoot, name, '大纲')
  fs.mkdirSync(dir, { recursive: true })
  if (body !== null) fs.writeFileSync(path.join(dir, '细纲_第021章.md'), body, 'utf8')
  return path.join(tmpRoot, name)
}

function run(project, chapter = '21') {
  const result = spawnSync(process.execPath, [verifier, '--json', '--project', project, '--chapter', chapter], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  let report = null
  if (result.stdout.trim()) report = JSON.parse(result.stdout)
  return { ...result, report }
}

const failureIds = (result) => result.report.failures.map((failure) => failure.id)

try {
  // 模板齐全的细纲必须通过 —— 这是误报防线，先测它。
  const good = run(writeCase('valid', outline()))
  assert.strictEqual(good.status, 0, good.stdout + good.stderr)
  assert.strictEqual(good.report.ok, true)
  assert.deepStrictEqual(good.report.failures, [])

  // 值未定时写 [待补充] 是契约允许的写法，不能因此判失败。
  const pending = run(writeCase('pending-value', outline({
    fieldValues: { 契约风险: '[待补充]', 单元ID位置: '[待补充]' },
  })))
  assert.strictEqual(pending.status, 0, pending.stdout + pending.stderr)
  assert.strictEqual(pending.report.ok, true)

  // 加粗字段名与半角冒号也要认，否则会误伤正常写法。
  const boldHalfWidth = outline().replace('- 目标情绪：', '- **目标情绪**: ')
  const bold = run(writeCase('bold-halfwidth', boldHalfWidth))
  assert.strictEqual(bold.status, 0, bold.stdout + bold.stderr)

  const dropped = run(writeCase('missing-field', outline({ dropField: '目标情绪' })))
  assert.strictEqual(dropped.status, 1)
  assert.deepStrictEqual(failureIds(dropped), ['outline.required-fields'])
  assert.match(dropped.report.failures[0].evidence, /目标情绪/)
  assert.strictEqual(dropped.report.repair_scope.length, 1)
  assert.match(dropped.report.repair_scope[0].repair, /\[待补充\]/)

  const noAct = run(writeCase('missing-act', outline({ dropAct: '转折' })))
  assert.strictEqual(noAct.status, 1)
  assert.deepStrictEqual(failureIds(noAct), ['outline.five-act'])

  // 情节点写成编号列表（当前最常见的偏离）必须被判出来。
  const listStyle = run(writeCase('plot-as-list', outline({
    plotTable: '1. 江晨接到邀约【铺垫】\n2. 老人推过铁盒【高潮】',
  })))
  assert.strictEqual(listStyle.status, 1)
  assert.deepStrictEqual(failureIds(listStyle), ['outline.plotpoint-table'])

  // 三列表格缺执行边界，也是偏离。
  const threeCol = run(writeCase('plot-three-col', outline({
    plotTable: '| # | 情节点 | 功能标签 |\n|---|---|---|\n| 1 | 江晨接到邀约 | 铺垫 |',
  })))
  assert.strictEqual(threeCol.status, 1)
  assert.deepStrictEqual(failureIds(threeCol), ['outline.plotpoint-table'])

  const badTarget = run(writeCase('bad-target', outline({ fieldValues: { 字数目标: '很多字' } })))
  assert.strictEqual(badTarget.status, 1)
  assert(failureIds(badTarget).includes('outline.wordcount-target'))

  const noCaliber = run(writeCase('no-caliber', outline({ fieldValues: { 字数口径: 'chars' } })))
  assert.strictEqual(noCaliber.status, 1)
  assert.deepStrictEqual(failureIds(noCaliber), ['outline.wordcount-target'])

  const missingFile = run(writeCase('missing-file', null))
  assert.strictEqual(missingFile.status, 2)
  assert.match(missingFile.stderr, /没有第 21 章细纲/)

  const invalid = spawnSync(process.execPath, [verifier, '--unknown'], { cwd: repoRoot, encoding: 'utf8' })
  assert.strictEqual(invalid.status, 2)
  assert.match(invalid.stderr, /用法/)

  process.stdout.write('outline-contract: all tests passed\n')
} finally {
  fs.rmSync(tmpRoot, { recursive: true, force: true })
}
