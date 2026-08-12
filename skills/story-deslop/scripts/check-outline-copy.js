#!/usr/bin/env node
/**
 * check-outline-copy.js — 细纲照搬检测
 *
 * 治的病：细纲把情节点写成成品散文句，正文只剩誊抄，质量被锁死在细纲水平。
 * 实测正文与细纲连续重合最高 13.5%、单段最长 40 字，且重合段落多为叙述而非台词
 * ——即全章最好的那几句在细纲阶段就写完了。
 *
 * 判定：正文与同章细纲连续重合 > 阈值（默认 15 字）即判誊抄
 * ——细纲只锁功能与结果，句子一律在正文现场写。
 *
 * 唯一例外：细纲「复沓锚句」字段下列出的原话允许逐字落地——誓言、系统面板、
 * 旧案原话等写细纲时判定必须原文出现的部分，逐行一条。
 * 豁免量单独统计并在报告末尾列出，滥用锚句绕过检测时一眼可见。
 *
 * 由 narrative-writer 落盘后自查、主会话收尾复扫时调用（两侧同一份实现，口径一致）。
 * 不进 hook：正文兜底 hook 的共享核是四端共用的，不为单项检测扩面。
 *
 * 用法：
 *   node check-outline-copy.js <正文路径>            # 自动找同章细纲
 *   node check-outline-copy.js <正文路径> <细纲路径>  # 指定细纲
 *
 * 退出码：0 = 干净或无法判定（缺细纲/非分章正文）；1 = 命中誊抄。
 * 无发现时完全静默，不污染上下文。
 */

'use strict'
const fs = require('fs')
const path = require('path')

const MIN_RUN = 16 // 判定阈值：连续重合 >15 字，即 >=16
const REPORT_TOP = 8 // 最多列出的片段数

function read(p) {
  try {
    return fs.readFileSync(p, 'utf8').replace(/^﻿/, '')
  } catch {
    return null
  }
}

/** 只留汉字——剥掉标点/加粗/【】后比对，防止细纲标注造成假阴性 */
function hanOnly(s) {
  return s.replace(/[^一-鿿]/g, '')
}

/**
 * 抽出细纲「复沓锚句」字段下的原话，一行一条。
 * 只认这一个字段，不扫情节点序列——锚句集中在固定区块，情节点保持只写「要发生什么」。
 * 区块终止于行首无缩进的下一个字段（`- xxx`）或下一个小节标题，因此条目本身
 * 用 `1.` 编号、缩进 `-` 列表或纯文本都能正确提取，不必额外标记。
 */
function extractAnchors(outline) {
  const m = outline.match(/复沓锚句[^：:\n]*[：:]([\s\S]*?)(?=\n[-*+]\s|\n#{1,6}\s|$)/)
  if (!m) return []
  return m[1]
    .split("\n")
    // 去掉列表符号与「点N：」这类落点前缀，只留原话本身
    .map((line) => line.replace(/^\s*[-*+]?\s*(?:\d+[.、)]\s*)?(?:点\s*\d+\s*[：:])?/, ""))
    .map((line) => hanOnly(line))
    .filter((a) => a.length >= 2)
}

/** 定位同章细纲：遍历 大纲/ 按章号正则匹配，支持带后缀的文件名 */
function findOutline(proseFile) {
  const m = path.basename(proseFile).match(/^第\s*0*(\d+)\s*章/)
  if (!m) return null
  const chapter = m[1]
  const dir = path.join(path.dirname(path.dirname(proseFile)), '大纲')
  try {
    for (const file of fs.readdirSync(dir)) {
      const fm = file.match(/^细纲_第0*(\d+)章.*\.md$/)
      if (fm && fm[1] === chapter) return path.join(dir, file)
    }
  } catch {}
  return null
}

function main() {
  const proseFile = process.argv[2]
  if (!proseFile) {
    process.stderr.write('用法: node check-outline-copy.js <正文路径> [细纲路径]\n')
    return 0
  }
  const prose = read(proseFile)
  if (prose === null) return 0

  const outlineFile = process.argv[3] || findOutline(proseFile)
  if (!outlineFile) return 0
  const outline = read(outlineFile)
  if (outline === null) return 0

  // 正文去掉标题行后比对
  const P = hanOnly(prose.replace(/^#.*$/gm, ''))
  const O = hanOnly(outline)
  if (P.length < MIN_RUN || O.length < MIN_RUN) return 0

  // 复沓锚句列出的原话允许逐字落地，命中后计入豁免、不判誊抄
  const anchors = extractAnchors(outline)
  const isAnchored = (frag) => anchors.some((a) => a.includes(frag) || frag.includes(a))

  // 贪心扫描：每个起点二分求「仍是细纲子串」的最长延伸，命中区间不重叠
  const hits = []
  let copied = 0
  let anchored = 0
  let anchoredCount = 0
  let i = 0
  while (i < P.length) {
    let best = 0
    if (i + MIN_RUN <= P.length && O.includes(P.substr(i, MIN_RUN))) {
      best = MIN_RUN
      let lo = MIN_RUN
      let hi = Math.min(P.length - i, 200)
      while (lo <= hi) {
        const mid = (lo + hi) >> 1
        if (O.includes(P.substr(i, mid))) {
          best = mid
          lo = mid + 1
        } else hi = mid - 1
      }
    }
    if (best) {
      const frag = P.substr(i, best)
      if (isAnchored(frag)) {
        anchored += best
        anchoredCount++
      } else {
        hits.push({ frag, len: best })
        copied += best
      }
      i += best
    } else i++
  }
  if (!hits.length) {
    // 全部命中都是锚句豁免：静默放行，但把豁免量报出来供人工复核滥用
    if (anchoredCount) {
      process.stdout.write(
        `细纲照搬检测（${path.basename(proseFile)}）：无未授权誊抄；` +
          `另有 ${anchoredCount} 处 ${anchored} 字为复沓锚句的逐字落地。\n`
      )
    }
    return 0
  }

  const rate = ((copied * 100) / P.length).toFixed(1)
  const out = [
    `=== 细纲照搬检测（${path.basename(proseFile)}）===`,
    `正文 ${P.length} 字，与 ${path.basename(outlineFile)} 连续重合 >${MIN_RUN - 1} 字的片段 ${hits.length} 处，共 ${copied} 字（${rate}%）。`,
    `判定：誊抄。这些段落必须重写——细纲只锁功能与结果，句子在正文现场写，不把细纲措辞原样搬进叙述。`,
  ]
  hits
    .sort((a, b) => b.len - a.len)
    .slice(0, REPORT_TOP)
    .forEach((h) => out.push(`  · ${h.len} 字「${h.frag}」`))
  if (hits.length > REPORT_TOP) out.push(`  · …另有 ${hits.length - REPORT_TOP} 处`)
  if (anchoredCount) out.push(`（另有 ${anchoredCount} 处 ${anchored} 字为复沓锚句的逐字落地，不计入誊抄）`)
  process.stdout.write(out.join('\n') + '\n')
  return 1
}

try {
  process.exit(main())
} catch {
  process.exit(0)
}
