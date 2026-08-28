#!/usr/bin/env node
/**
 * Deterministic 细纲 structural verifier for story-long-write.
 *
 * Usage:
 *   node scripts/check-outline-contract.js --json <细纲路径...>
 *   node scripts/check-outline-contract.js --json --project <书目录> --chapter N
 * Exit: 0 = pass, 1 = blocking contract failures, 2 = invalid invocation.
 *
 * Scope is structural only: it decides whether the blueprint carries the fields,
 * subsections and table shape the authoritative template names. It never judges
 * whether a value is good. The contract itself sets this granularity —
 * artifact-protocols.md 要求未知字段写 `[待补充]`，所以字段必须在场，值可以未知。
 */

'use strict'

const fs = require('fs')
const path = require('path')

// 权威模板：references/workflow-setup.md「细纲（全书每章）」
const FIELDS = [
  '核心事件', '字数目标', '字数口径', '阶段位置', '单元ID/位置', '目标情绪',
  '主角目标/关键选择', '章节定位', '本章结构公式', '章首钩子', '爽点',
  '本章禁止提前释放', '契约风险',
]
const SUBSECTIONS = ['内容概括', '情节安排', '人物关系和出场顺序', '情节细化']
const FIVE_ACT = ['起因', '发展', '转折', '高潮', '结尾']
const PLOT_HEADER_FIRST = /^(?:#|序号)$/
// 这两个字段实测直接影响正文质量，必须有实际内容
const INTENT_FIELDS = ['目标情绪', '主角目标/关键选择']
const CALIBER = 'visible_chars_v1'

function fieldPattern(name) {
  // 允许 -/*/+ 项目符号、可选 ** 加粗、全角或半角冒号
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^\\s*[-*+]\\s*\\*{0,2}${escaped}\\*{0,2}\\s*[：:]`, 'm')
}

function readUtf8(file) {
  try {
    const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '')
    return { ok: text.trim().length > 0, text }
  } catch (error) {
    return { ok: false, text: '', error: error.message }
  }
}

function makeCheck(id, ok, file, evidence, expected, repair) {
  return {
    id,
    ok,
    severity: 'blocking',
    file,
    evidence,
    expected,
    references: ['references/workflow-setup.md', 'references/artifact-protocols.md'],
    repair,
  }
}

function parseTableRow(line) {
  const trimmed = line.trim()
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return null
  return trimmed.slice(1, -1).split('|').map((cell) => cell.replace(/\*\*/g, '').replace(/`/g, '').trim())
}

function verify(file) {
  const name = path.basename(file)
  const read = readUtf8(file)
  const checks = []

  checks.push(makeCheck(
    'outline.readable',
    read.ok,
    name,
    read.ok ? '文件存在且非空' : (read.error || '文件为空'),
    '细纲文件存在且非空',
    '只补建缺失的细纲文件，不改动同批其他章。'
  ))
  if (!read.ok) return report(file, checks)
  const text = read.text

  const missingFields = FIELDS.filter((field) => !fieldPattern(field).test(text))
  checks.push(makeCheck(
    'outline.required-fields',
    missingFields.length === 0,
    name,
    missingFields.length ? `缺字段：${missingFields.join('、')}` : `${FIELDS.length} 个字段齐全`,
    `按权威模板列出全部字段：${FIELDS.join('、')}；值未知时写 [待补充]，不杜撰剧情`,
    '只补报告里缺的字段行；确实还定不下来的写 [待补充]，不为补字段新增副线或人物关系。'
  ))

  // 隔离实验（同章、同写作流程，只改细纲）：只补这两个字段就能复现补齐全部字段的收益，
  // 盲评 3/3 胜过不补；补满五个字段与只补这两个不可区分。所以这两个字段不接受占位符，
  // 其余字段仍按契约允许 [待补充]。
  const hollow = INTENT_FIELDS.filter((field) => {
    const match = text.match(new RegExp(`^\\s*[-*+]\\s*\\*{0,2}${field.replace('/', '\\/')}\\*{0,2}\\s*[：:]\\s*(.*)$`, 'm'))
    if (!match) return false
    const value = match[1].replace(/\[待补充\]/g, '').replace(/[\s、，,。;；]/g, '')
    return value.length === 0
  })
  checks.push(makeCheck(
    'outline.intent-fields-substantive',
    hollow.length === 0,
    name,
    hollow.length ? `只有占位符，没有实际内容：${hollow.join('、')}` : '目标情绪与主角目标/关键选择都写了实际内容',
    '目标情绪写清前状态→后状态；主角目标/关键选择写清本章要什么、必须做出的判断。这两项不接受 [待补充]',
    '只把这两个字段替换成本章的实际情绪变化与实际取舍；其余字段不动。'
  ))

  const missingSubs = SUBSECTIONS.filter((sub) => !new RegExp(`^#{3,4}\\s*${sub}`, 'm').test(text))
  checks.push(makeCheck(
    'outline.subsections',
    missingSubs.length === 0,
    name,
    missingSubs.length ? `缺小节：${missingSubs.join('、')}` : '四个小节齐全',
    '包含 内容概括 / 情节安排 / 人物关系和出场顺序 / 情节细化 四个小节',
    '只补缺失的小节标题及其条目，不重写已成立的内容。'
  ))

  const missingActs = FIVE_ACT.filter((act) => !fieldPattern(act).test(text))
  checks.push(makeCheck(
    'outline.five-act',
    missingActs.length === 0,
    name,
    missingActs.length ? `五段式缺：${missingActs.join('、')}` : '五段式齐全',
    '内容概括写全 起因 / 发展 / 转折 / 高潮 / 结尾',
    '只补缺的那一段，不改其余四段。'
  ))

  const lines = text.split(/\r?\n/)
  let header = null
  for (const line of lines) {
    const cells = parseTableRow(line)
    if (cells && cells.length === 4 && PLOT_HEADER_FIRST.test(cells[0])) {
      header = cells
      break
    }
  }
  const headerOk = Boolean(header) && header[2].includes('功能标签') && header[3].includes('执行边界')
  checks.push(makeCheck(
    'outline.plotpoint-table',
    headerOk,
    name,
    header ? `表头：${header.join(' | ')}` : '未找到 | # | 情节点 | 功能标签 | 执行边界 | 表头',
    '情节细化使用四列表格：# / 情节点（谁做了什么） / 功能标签 / 执行边界',
    '只把情节点序列改成四列表格，逐点补功能标签与执行边界；不增删情节点本身。'
  ))

  const targetMatch = text.match(/字数目标\s*[：:]\s*(?:约\s*)?([\d,，]+)/)
  const target = targetMatch ? Number(targetMatch[1].replace(/[,，]/g, '')) : null
  const caliberOk = new RegExp(`字数口径\\s*[：:]\\s*${CALIBER}`).test(text)
  checks.push(makeCheck(
    'outline.wordcount-target',
    Boolean(target) && Number.isFinite(target) && target >= 500 && target <= 20000 && caliberOk,
    name,
    `字数目标：${target === null ? '未识别' : target}；字数口径 ${CALIBER}：${caliberOk}`,
    `字数目标为 500-20000 的正整数，并声明 字数口径：${CALIBER}`,
    '只补字数目标或字数口径行，不调整情节安排。'
  ))

  return report(file, checks)
}

function report(file, checks) {
  const failures = checks.filter((check) => !check.ok)
  return {
    schema_version: 1,
    verifier: 'story-long-write.outline-contract',
    file: path.resolve(file),
    ok: failures.length === 0,
    checks,
    failures,
    repair_scope: failures.map((failure) => ({
      id: failure.id,
      file: failure.file,
      evidence: failure.evidence,
      expected: failure.expected,
      references: failure.references,
      repair: failure.repair,
    })),
  }
}

function resolveChapter(project, chapter) {
  const dir = path.join(project, '大纲')
  let entries
  try {
    entries = fs.readdirSync(dir)
  } catch (error) {
    return { error: `无法读取 ${dir}：${error.message}` }
  }
  const wanted = Number(chapter)
  const hit = entries.find((entry) => {
    const match = entry.match(/^细纲_第0*(\d+)章.*\.md$/)
    return match && Number(match[1]) === wanted
  })
  if (!hit) return { error: `${dir} 下没有第 ${wanted} 章细纲` }
  return { file: path.join(dir, hit) }
}

function parseArgs(argv) {
  const files = []
  let project = null
  let chapter = null
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    if (arg === '--json') continue
    if (arg === '--project' || arg === '--chapter') {
      if (index + 1 >= argv.length || argv[index + 1].startsWith('--')) return null
      const value = argv[++index]
      if (arg === '--project') project = value
      else chapter = value
      continue
    }
    if (arg.startsWith('--')) return null
    files.push(arg)
  }
  if (project || chapter) {
    if (!project || !chapter || files.length || !/^\d+$/.test(chapter)) return null
    return { project, chapter }
  }
  if (!files.length) return null
  return { files }
}

function main(argv) {
  const parsed = parseArgs(argv)
  if (!parsed) {
    process.stderr.write('用法: node scripts/check-outline-contract.js --json <细纲路径...> | --json --project <书目录> --chapter N\n')
    return 2
  }
  let targets = parsed.files
  if (!targets) {
    const resolved = resolveChapter(parsed.project, parsed.chapter)
    if (resolved.error) {
      process.stderr.write(`${resolved.error}\n`)
      return 2
    }
    targets = [resolved.file]
  }
  const reports = targets.map((file) => verify(file))
  const ok = reports.every((entry) => entry.ok)
  process.stdout.write(`${JSON.stringify(reports.length === 1 ? reports[0] : reports, null, 2)}\n`)
  return ok ? 0 : 1
}

if (require.main === module) process.exitCode = main(process.argv.slice(2))

module.exports = { verify, FIELDS, SUBSECTIONS, FIVE_ACT }
