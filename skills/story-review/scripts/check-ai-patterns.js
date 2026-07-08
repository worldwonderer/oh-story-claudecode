#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const USAGE = `Usage: node check-ai-patterns.js [--check] [--json] [--fail-on=blocking|all] <file...>

Detect high-risk AI-flavor prose patterns that need human rewrite:
  - negative setup followed by positive flip in the same sentence
  - comma/semicolon/colon + positive flip
  - sentence break + positive flip
  - repeated negative setup followed by positive flip
  - em-dash (按功能改写), 碎句号 (连续短叙述句), 长段落 (按镜头断段)
  - 微动作复读 (「了下/了一下」式轻量补语高密度，电报体指纹)
  - 抽象总结复读 (命运/棋局/这一刻终于明白/才刚刚开始，AI 结尾腔)
  - 套词密度过高 (仿佛/一丝/深吸一口气/平静无波等禁用词聚集)
  - 比喻密度过高 (像/好像/仿佛/如同等比喻标记成片复现)
  - 解释链密度过高 (知道/明白/这意味着/必须/需要等判断链聚集)
  - 系统公告公文腔过密 (方括号系统/规则行里硬规则词聚集)
  - 过度精炼短段 (长文本里短叙述段过密且自然连接偏少)
  - 低连接密度 (引号外叙述功能词/白话连接偏少且中长句不足，像提纲/电报体)
  - 监控摄像头式动作清单 (同段连续摆放动作动词，缺少视角温度/情绪缓冲)

Each finding carries severity: blocking by default for generation/deslop cleanup (not-is-comparison / em-dash). This is a local style/readability gate, not an AIGC detector score; functional human text can be marked for review instead of hard-edited for a detector.
或 advisory (period-stutter / long-paragraph / micro-action-tic / action-list-tic / abstract-summary-tic / cliche-density-tic / metaphor-density-tic / reasoning-chain-tic / system-notice-formality-tic / overcompressed-prose-tic / low-connective-density-tic，是提示，justified 的长推理/氛围段可保留)。
--fail-on=blocking 只在出现 blocking finding 时退出 1；默认 --fail-on=all 有任何 finding 即退出 1。

The script reports findings only. It never rewrites text, because the safe fix is
contextual: usually delete the negative setup, write the positive term directly,
or show it via action/detail.`;

const STOP_CHARS = new Set(['。', '！', '？', '!', '?', '\n']);
const SOFT_SEPARATORS = new Set(['，', ',', '、', '；', ';', '：', ':']);
const HARD_SEPARATORS = new Set(['。', '.', '！', '!', '？', '?']);
const MAX_NEGATIVE_SPAN = 80;
const MAX_POSITIVE_SPAN = 80;

// 碎句号：连续 STUTTER_MIN_RUN 个「叙述」短句（每句可见字数 ≤ STUTTER_MAX_SENTENCE）无呼吸。
// 只数叙述句，跳过对话/弹幕/系统播报（成片短句是这些体裁的正常形态，不算碎句号）。
const STUTTER_MIN_RUN = 6;
const STUTTER_MAX_SENTENCE = 5;
// 长段落：单段原始字符数超过阈值即提示按镜头断段（手机阅读保守阈值，正常单段远低于此）。
const LONG_PARAGRAPH_CHARS = 200;

// 微动作复读：「V了下 / V了一下 / 拍了两下 / 松了半圈」式轻量补语在叙述里高密度复现，
// 容易形成删减过头的电报体指纹。只扫引号外叙述；密度与次数双门槛同时达标才报，
// 单次出现是正常中文。
const MICRO_TIC_PATTERN = /了(?:[一两三几半])?[下阵圈道声眼口气会]/g;
const MICRO_TIC_MIN_HITS = 5;
const MICRO_TIC_PER_KILO = 6;

// 监控摄像头式动作清单：同一段连续堆叠通用动作动词（伸手/拿起/取过/挑开/放下/转身等），
// 且用逗号/顿号串联成步骤表时，读感像无视角温度的监控记录。只做 advisory；
// 打斗/追逐等功能性动作编排可保留或人工复核。
const ACTION_LIST_VERB_PATTERN = /伸手|抬手|探手|拿起|拿过|取出|取过|掏出|摸出|抓起|攥住|握住|捏住|按住|推开|拉开|打开|关上|放下|递给|挑开|掀开|扯开|拧开|倒出|端起|转身|回头|抬头|低头|弯腰|俯身|走到|走向|坐下|站起|看向|看着|盯着|扫过/g;
const ACTION_LIST_MIN_HITS = 5;
const ACTION_LIST_MIN_SEPARATORS = 4;

// 抽象总结复读：模板化段落常把角色当下经历拔成「命运/棋局/
// 这一刻终于明白/才刚刚开始」的作者总结。单个词可能服务题材；高密度聚集才报。
const ABSTRACT_SUMMARY_PATTERNS = [
  /这一刻[，,]?[^\n。！？!?]{0,24}(?:终于|才)(?:明白|意识到)/g,
  /从这一刻开始/g,
  /(?:命运|宿命)[^\n。！？!?]{0,28}(?:齿轮|棋局|獠牙|改写|推向|安排)/g,
  /早已[^\n。！？!?]{0,8}(?:布好|安排好)[^\n。！？!?]{0,8}(?:棋局|局)/g,
  /前所未有的(?:决意|清醒|勇气|力量|恐惧|平静|信念)/g,
  /(?:反击|复仇|战争|较量|故事|命运)[^\n。！？!?]{0,12}才刚刚开始/g,
  /(?:新的开始|全新的开始)/g,
];
const ABSTRACT_SUMMARY_MIN_HITS = 3;
const ABSTRACT_SUMMARY_PER_KILO = 4;

// 套词密度：单个「仿佛/一丝」可能是正常中文，高密度聚集才会形成模板腔。
// 词表只收本 repo banned-words 中已明确标为高危的形态，避免把普通功能词一网打尽。
const CLICHE_PATTERNS = [
  /仿佛|犹如|宛若|如同/g,
  /一丝|一抹|些许|几分|隐约/g,
  /深吸一口气|缓缓|微微|轻轻|淡淡/g,
  /眼中闪过|嘴角勾起|眸光微微一闪|指节泛白|目光锐利|眼神锐利/g,
  /心中涌起一股|心头一震|心中一动|心下了然|心中暗道|心中一凛/g,
  /不容置疑|不容置喙|不易察觉|显而易见|毫无疑问|不可否认/g,
  /声音不大[，,]?却带着|语气平静无波|平静无波|声音平直|听不出情绪/g,
  /不知何时|唾手可得|无声翻涌|沉默(?:在[^。！？!?\n]{0,16})?蔓延|难以言说/g,
  /散发着一股|冰冷的光|格外刺眼|深邃而冰冷/g,
];
const CLICHE_DENSITY_MIN_HITS = 8;
const CLICHE_DENSITY_PER_KILO = 12;

// 比喻密度：单个生活化比喻可服务画面；“像/好像/仿佛/如同”成片复现时，
// 容易变成 AI 式修辞堆叠。只做 advisory，修法是删到必要数量并回到具体画面，
// 不是把“像”换成另一组比喻词。
const METAPHOR_MARKER_PATTERN = /好像|像是|仿佛|宛如|如同|犹如|(?<![不头图画影录摄肖])像(?![头像素])/g;
const METAPHOR_LIKE_PHRASE_PATTERN = /(?:死|水|冰|火|潮水|石头|木头|机器|纸|铁|鬼|死人|刀|针|网|墙)一样/g;
const METAPHOR_DENSITY_MIN_HITS = 7;
const METAPHOR_DENSITY_PER_KILO = 3;

// 解释链密度：常见“他知道/他明白/这意味着/必须需要”
// 连续替读者推理，读感像报告。单个判断词可服务推理；高密度聚集才提示回到角色当下证据。
const REASONING_CHAIN_PATTERNS = [
  { key: 'mental', core: true, pattern: /(?<![不没未无])(?:他|她|我)?(?:知道|明白|意识到|清楚|判断|确认|分析)/g },
  { key: 'connector', core: true, pattern: /这意味着|也就是说|换句话说|真正的问题(?:在于)?|问题在于|关键在于|在这种情况下|按照这个逻辑|只有这样|想到这里/g },
  { key: 'modal', core: true, pattern: /(?:(?<!不)(?:必须|需要|应该|只要|就会|可能|可以|能够|无法)|不能)[^。！？!?\n]{0,16}(?:判断|确认|承担|维持|稳住|控制|扩大|失控|带来|造成|理解|默认|回家|进门|核对|筛选|减少|建立|风险|结果|秩序|责任)/g },
  { key: 'abstract', core: false, pattern: /(?:任务|条件|风险|来源|逻辑|局面|结果|责任|秩序|规则|信息不足|决策能力)/g },
];
const REASONING_CHAIN_MIN_HITS = 8;
const REASONING_CHAIN_CORE_MIN_HITS = 4;
const REASONING_CHAIN_MIN_BUCKETS = 2;
const REASONING_CHAIN_PER_KILO = 18;

// 系统公告公文腔：只看成片方括号规则/面板行里的硬规则词。
// 这不是特定题材词表；单条严肃规则、日常叙述或普通对话不触发。
const NOTICE_FORMAL_PATTERNS = [
  /不得|必须|不可|禁止|严禁|应当|须|需|务必/g,
  /当前|本公告|本规则|本系统|提示|任务失败|临时权限|权限|状态|等级/g,
  /维持|公共区域|秩序|优先|惩罚|处罚|违规|指令|执行/g,
  /被视为|同样计入|计入|承担|责任|单位|撤回|转发|截图/g,
];
const NOTICE_FORMAL_CORE_PATTERN = /不得|必须|不可|禁止|严禁|应当|须|需|务必|被视为|同样计入|计入/g;
const NOTICE_FORMAL_MIN_LINES = 4;
const NOTICE_FORMAL_MIN_HITS = 12;
const NOTICE_FORMAL_CORE_MIN_HITS = 5;
const NOTICE_FORMAL_PER_KILO = 60;

// 过度精炼短段：过度处理样本里常见大量 15 字以内叙述段，且“的/了/就/着/过/呢/吧/啊”等
// 自然连接偏少；对照文本通常保留更多自然连接。此项只做 advisory，禁止机械注水。
const OVERCOMPRESSED_PROSE_PARTICLE_PATTERN = /[的了就着过呢吧啊呀嘛]/g;
const OVERCOMPRESSED_PROSE_MIN_CHARS = 1200;
const OVERCOMPRESSED_PROSE_MIN_PARAS = 45;
const OVERCOMPRESSED_PROSE_SHORT_MAX_CHARS = 15;
const OVERCOMPRESSED_PROSE_SHORT_RATIO = 0.58;
const OVERCOMPRESSED_PROSE_PARTICLE_PER_KILO = 85;

// 低连接密度：单纯低功能词会误抓有大量中长句的文本；
// 因此必须叠加“中长句不足”，并只看引号外叙述。这是 overcompressed 的短窗口补充，只做 advisory。
const LOW_CONNECTIVE_FUNCTION_TERMS = ['的', '了', '就', '在', '是', '也', '都', '还', '又', '把', '被', '给', '这个', '那个', '里面', '以后', '时候', '现在', '因为', '所以', '但是', '不过', '然后', '已经', '还是', '起来', '出来', '下去'];
const LOW_CONNECTIVE_PLAIN_TERMS = ['的', '了', '就', '也', '还', '又', '这个', '那个', '东西', '事情', '时候', '里面', '以后', '一下', '一点', '有点', '还是'];
const LOW_CONNECTIVE_MIN_CHARS = 800;
const LOW_CONNECTIVE_FUNCTION_PER_KILO = 100;
const LOW_CONNECTIVE_PLAIN_PER_KILO = 65;
const LOW_CONNECTIVE_LONG_SENTENCE_CHARS = 30;
const LOW_CONNECTIVE_LONG_SENTENCE_RATIO = 0.08;

// either-or「不是A就是B / 不是A也是B」里紧贴的「是」是连词的一部分，不是肯定项系动词。
// 含「不」以沿用「不是A，也不是B」第二个否定段不算翻转的旧排除。
const COMPACT_EITHER_OR_PREV = new Set(['不', '就', '也']);
// 句尾语气/反问助词；「…，是吗 / 是吧 / 是嘛」是反问尾巴，不是否定后的肯定翻转。
const TAG_PARTICLES = new Set(['吗', '吧', '嘛']);
// 段首确认语；「不是第一次来。是的，他还记得……」里的「是的/是啊」
// 是承接确认，不是「不是 A，是 B」的肯定翻转。
const AFFIRMATION_TAG_PARTICLES = new Set(['的', '啊', '呀', '呢']);
const AFFIRMATION_TAG_BOUNDARY = new Set(['', '，', ',', '。', '.', '！', '!', '？', '?', '、', '；', ';', '：', ':', '\n', '\r', '\t', ' ']);

// 成对引号（台词/系统播报/弹幕）的字符对，stripQuoted 与 quotedRanges 共用一份来源。
const QUOTE_PAIRS = [['「', '」'], ['『', '』'], ['【', '】'], ['“', '”'], ['‘', '’'], ['"', '"'], ["'", "'"]];
const QUOTE_SOURCES = QUOTE_PAIRS.map(([open, close]) => `${escapeRegExp(open)}[^${escapeRegExpCharClass(close)}]*${escapeRegExp(close)}`);

const options = {
  json: false,
  files: [],
  failOn: 'all',
};

for (let i = 2; i < process.argv.length; i += 1) {
  const arg = process.argv[i];
  if (arg === '--check') {
    // Accepted for symmetry with normalize-punctuation.js; detection is always check-only.
  } else if (arg === '--json') {
    options.json = true;
  } else if (arg.startsWith('--fail-on=')) {
    const v = arg.slice('--fail-on='.length);
    if (v !== 'blocking' && v !== 'all') die(`--fail-on must be 'blocking' or 'all'`);
    options.failOn = v;
  } else if (arg === '-h' || arg === '--help') {
    process.stdout.write(`${USAGE}\n`);
    process.exit(0);
  } else if (arg.startsWith('-')) {
    die(`Unknown option: ${arg}`);
  } else {
    options.files.push(arg);
  }
}

if (options.files.length === 0) {
  die('No files provided');
}

let failed = false;
const allFindings = [];

for (const file of options.files) {
  const fullPath = path.resolve(file);
  let input;
  try {
    input = fs.readFileSync(fullPath, 'utf8');
  } catch (error) {
    failed = true;
    if (!options.json) console.error(`${file}: unable to read (${error.message})`);
    continue;
  }

  const findings = scanDocument(input).map((finding) => ({ file, ...finding }));
  allFindings.push(...findings);
}

if (options.json) {
  process.stdout.write(`${JSON.stringify({ findings: allFindings }, null, 2)}\n`);
} else {
  for (const finding of allFindings) {
    console.log(`${finding.file}:${finding.line}:${finding.column}: [${finding.severity}] ${finding.type}: ${finding.message} (${finding.excerpt})`);
  }
}

if (failed) process.exit(2);
// --fail-on=blocking 只在出现 blocking finding 时退出 1（advisory 仅报告）；默认 all 沿用「有任何 finding 即 1」。
const hasBlocking = allFindings.some((f) => f.severity === 'blocking');
if (options.failOn === 'blocking' ? hasBlocking : allFindings.length > 0) process.exit(1);

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeRegExpCharClass(text) {
  return text.replace(/[\\\]^-]/g, '\\$&');
}

function die(message) {
  console.error(message);
  console.error(USAGE.trimEnd());
  process.exit(2);
}

function scanDocument(input) {
  const lines = input.split(/\r?\n/);
  const findings = [];
  let fence = null;
  let inFrontMatter = hasYamlFrontMatter(lines);
  let block = [];
  const proseLines = [];

  const flushBlock = () => {
    if (block.length === 0) return;
    findings.push(...scanBlock(block));
    block = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

    if (inFrontMatter) {
      if (index > 0 && trimmed === '---') inFrontMatter = false;
      continue;
    }

    const fenceMarker = parseFenceMarker(trimmed);
    if (fence) {
      if (fenceMarker && fenceMarker.char === fence.char && fenceMarker.length >= fence.length) {
        fence = null;
      }
      continue;
    }

    if (fenceMarker) {
      flushBlock();
      fence = fenceMarker;
      continue;
    }

    block.push({ text: line, lineNo: index + 1 });
    proseLines.push({ text: line, lineNo: index + 1 });
  }

  flushBlock();
  findings.push(...scanProsePatterns(proseLines));
  findings.sort((a, b) => a.line - b.line || a.column - b.column);
  return findings;
}

// 段落级检测：碎句号（连续短叙述句）、长段落、破折号（按功能改写，非机械替换）。
function scanProsePatterns(proseLines) {
  const findings = [];

  for (const { text, lineNo } of proseLines) {
    const trimmed = text.trim();
    if (!trimmed || isDivider(trimmed) || isStructural(trimmed)) continue;

    const dashPattern = /——|—|--+/g;
    let dash;
    while ((dash = dashPattern.exec(text)) !== null) {
      findings.push({
        line: lineNo,
        column: dash.index + 1,
        type: 'em-dash',
        severity: 'blocking',
        message: '破折号按功能改写：打断→动作 beat/短句，拖长音→省略或动作，插入说明→逗号/冒号；勿一律改句号。',
        excerpt: compact(text.slice(Math.max(0, dash.index - 8), dash.index + dash[0].length + 8)),
      });
    }

    if (trimmed.length > LONG_PARAGRAPH_CHARS) {
      findings.push({
        line: lineNo,
        column: 1,
        type: 'long-paragraph',
        severity: 'advisory',
        message: `段落过长（${trimmed.length} 字）：按镜头/新动作/新线索/视线切换断段，别一段到底。`,
        excerpt: compact(trimmed.slice(0, 40)),
      });
    }
  }

  findings.push(...findPeriodStutter(proseLines));
  findings.push(...findMicroActionTic(proseLines));
  findings.push(...findActionListTic(proseLines));
  findings.push(...findAbstractSummaryTic(proseLines));
  findings.push(...findClicheDensityTic(proseLines));
  findings.push(...findMetaphorDensityTic(proseLines));
  findings.push(...findReasoningChainTic(proseLines));
  findings.push(...findNoticeFormalityTic(proseLines));
  findings.push(...findOvercompressedProseTic(proseLines));
  findings.push(...findLowConnectiveDensityTic(proseLines));
  return findings;
}

// 微动作复读：统计引号外叙述里「了X量词」轻量补语的密度。次数与每千字密度双门槛，
// 全文只报一条（这是分布级指纹，不是逐处问题）。
function findMicroActionTic(proseLines) {
  let hits = 0;
  let narrativeChars = 0;
  let firstLine = null;
  const samples = [];

  for (const { text, lineNo } of proseLines) {
    const trimmed = text.trim();
    if (!trimmed || isDivider(trimmed) || isStructural(trimmed)) continue;
    const narrative = stripQuoted(trimmed);
    narrativeChars += visibleLength(narrative);
    MICRO_TIC_PATTERN.lastIndex = 0;
    let match;
    while ((match = MICRO_TIC_PATTERN.exec(narrative)) !== null) {
      hits += 1;
      if (firstLine === null) firstLine = lineNo;
      if (samples.length < 6 && !samples.includes(match[0])) samples.push(match[0]);
    }
  }

  if (narrativeChars === 0 || hits < MICRO_TIC_MIN_HITS) return [];
  const perKilo = (hits / narrativeChars) * 1000;
  if (perKilo < MICRO_TIC_PER_KILO) return [];

  return [{
    line: firstLine,
    column: 1,
    type: 'micro-action-tic',
    severity: 'advisory',
    message: `微动作复读：「了下/了一下」式轻量补语 ${hits} 处（${perKilo.toFixed(1)}/千字）；同一反应模板高密度复现是机械指纹，合并动作 beat、换具体细节，别每个动作都补一个轻反应尾巴。`,
    excerpt: compact(samples.join(' ')),
  }];
}

function findActionListTic(proseLines) {
  const findings = [];

  for (const { text, lineNo } of proseLines) {
    const trimmed = text.trim();
    if (!trimmed || isDivider(trimmed) || isStructural(trimmed)) continue;
    const narrative = stripQuoted(trimmed).trim();
    if (!narrative) continue;

    ACTION_LIST_VERB_PATTERN.lastIndex = 0;
    const verbs = [];
    let match;
    while ((match = ACTION_LIST_VERB_PATTERN.exec(narrative)) !== null) {
      verbs.push(match[0]);
    }

    if (verbs.length < ACTION_LIST_MIN_HITS) continue;
    const separators = (narrative.match(/[，、；;]/g) || []).length;
    if (separators < ACTION_LIST_MIN_SEPARATORS) continue;

    findings.push({
      line: lineNo,
      column: 1,
      type: 'action-list-tic',
      severity: 'advisory',
      message: `监控摄像头式动作清单：同段连续动作动词 ${verbs.length} 个、分隔符 ${separators} 个；合并琐碎步骤，只保留有情绪/情节功能的动作，必要时用角色犹豫、误判或环境反馈做缓冲。`,
      excerpt: compact(verbs.slice(0, 8).join(' ')),
    });
  }

  return findings;
}

// 套词密度：统计引号外叙述中的高危禁用词聚集。不是逐词替换器；只在密度高到
// 形成模板腔时提示，修法是删总结、换具体动作/物件/对话，不是同义词轮换。
function findClicheDensityTic(proseLines) {
  let hits = 0;
  let narrativeChars = 0;
  let firstLine = null;
  const samples = [];

  for (const { text, lineNo } of proseLines) {
    const trimmed = text.trim();
    if (!trimmed || isDivider(trimmed) || isStructural(trimmed)) continue;
    const narrative = stripQuoted(trimmed);
    narrativeChars += visibleLength(narrative);

    for (const pattern of CLICHE_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(narrative)) !== null) {
        hits += 1;
        if (firstLine === null) firstLine = lineNo;
        if (samples.length < 8 && !samples.includes(match[0])) samples.push(match[0]);
      }
    }
  }

  if (narrativeChars === 0 || hits < CLICHE_DENSITY_MIN_HITS) return [];
  const perKilo = (hits / narrativeChars) * 1000;
  if (perKilo < CLICHE_DENSITY_PER_KILO) return [];

  return [{
    line: firstLine,
    column: 1,
    type: 'cliche-density-tic',
    severity: 'advisory',
    message: `套词密度过高：高危 AI 套词 ${hits} 处（${perKilo.toFixed(1)}/千字）；不要同义词轮换，改成角色当下可见的动作、物件、对话和具体后果。`,
    excerpt: compact(samples.join(' ')),
  }];
}

// 比喻密度：统计引号外叙述中“像/好像/仿佛/如同”等比喻标记。
// 单个比喻不是问题；高密度成片时才提示，避免把文本改成另一种修辞模板。
function findMetaphorDensityTic(proseLines) {
  let hits = 0;
  let narrativeChars = 0;
  let firstLine = null;
  const samples = [];

  for (const { text, lineNo } of proseLines) {
    const trimmed = text.trim();
    if (!trimmed || isDivider(trimmed) || isStructural(trimmed)) continue;
    const narrative = stripQuoted(trimmed);
    narrativeChars += visibleLength(narrative);

    METAPHOR_MARKER_PATTERN.lastIndex = 0;
    let match;
    while ((match = METAPHOR_MARKER_PATTERN.exec(narrative)) !== null) {
      hits += 1;
      if (firstLine === null) firstLine = lineNo;
      const sample = sentenceAround(narrative, match.index);
      if (samples.length < 6 && sample && !samples.includes(sample)) samples.push(sample);
    }

    METAPHOR_LIKE_PHRASE_PATTERN.lastIndex = 0;
    while ((match = METAPHOR_LIKE_PHRASE_PATTERN.exec(narrative)) !== null) {
      const prefix = narrative.slice(Math.max(0, match.index - 8), match.index);
      if (/好像|像是|像|仿佛|宛如|如同|犹如/.test(prefix)) continue;
      hits += 1;
      if (firstLine === null) firstLine = lineNo;
      const sample = sentenceAround(narrative, match.index);
      if (samples.length < 6 && sample && !samples.includes(sample)) samples.push(sample);
    }
  }

  if (narrativeChars === 0 || hits < METAPHOR_DENSITY_MIN_HITS) return [];
  const perKilo = (hits / narrativeChars) * 1000;
  if (perKilo < METAPHOR_DENSITY_PER_KILO) return [];

  return [{
    line: firstLine,
    column: 1,
    type: 'metaphor-density-tic',
    severity: 'advisory',
    message: `比喻密度过高：像/好像/仿佛/如同等比喻标记 ${hits} 处（${perKilo.toFixed(1)}/千字）；保留最有叙事功能的少数比喻，其余回到具体动作、物件、声音或后果，不要换成新比喻。`,
    excerpt: compact(samples.join(' | ')),
  }];
}

// 解释链密度：统计引号外叙述中“知道/明白/这意味着/必须需要”等判断链。
// 全篇只报一条；修法不是补结构虚词，而是把判断落到动作、物件、对话和现场反馈。
function findReasoningChainTic(proseLines) {
  let hits = 0;
  let coreHits = 0;
  let narrativeChars = 0;
  let firstLine = null;
  const samples = [];
  const buckets = new Set();

  for (const { text, lineNo } of proseLines) {
    const trimmed = text.trim();
    if (!trimmed || isDivider(trimmed) || isStructural(trimmed)) continue;
    const narrative = stripQuoted(trimmed);
    narrativeChars += visibleLength(narrative);

    for (const { pattern, key, core } of REASONING_CHAIN_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(narrative)) !== null) {
        hits += 1;
        if (core) coreHits += 1;
        buckets.add(key);
        if (firstLine === null) firstLine = lineNo;
        const sample = compact(match[0]);
        if (samples.length < 8 && !samples.includes(sample)) samples.push(sample);
      }
    }
  }

  if (narrativeChars === 0 || hits < REASONING_CHAIN_MIN_HITS) return [];
  if (coreHits < REASONING_CHAIN_CORE_MIN_HITS || buckets.size < REASONING_CHAIN_MIN_BUCKETS) return [];
  const perKilo = (hits / narrativeChars) * 1000;
  if (perKilo < REASONING_CHAIN_PER_KILO) return [];

  return [{
    line: firstLine,
    column: 1,
    type: 'reasoning-chain-tic',
    severity: 'advisory',
    message: `解释链密度过高：知道/明白/这意味着/必须/需要等判断链 ${hits} 处（${perKilo.toFixed(1)}/千字）；像逻辑报告时，把判断落到角色当下可见的动作、物件、对话和现场反馈。`,
    excerpt: compact(samples.join(' | ')),
  }];
}

// 系统/规则行如果连续像 API 文档或政府公文，读者容易闻到机器味。
// 修法不是删除规则，而是保留功能后把一部分硬词改成白话或具体后果。
function findNoticeFormalityTic(proseLines) {
  let hits = 0;
  let noticeChars = 0;
  let noticeLines = 0;
  let coreHits = 0;
  let firstLine = null;
  const samples = [];

  for (const { text, lineNo } of proseLines) {
    const trimmed = text.trim();
    if (!/^【[^】]+】$/.test(trimmed)) continue;
    noticeLines += 1;
    noticeChars += visibleLength(trimmed);

    NOTICE_FORMAL_CORE_PATTERN.lastIndex = 0;
    while (NOTICE_FORMAL_CORE_PATTERN.exec(trimmed) !== null) coreHits += 1;

    for (const pattern of NOTICE_FORMAL_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(trimmed)) !== null) {
        hits += 1;
        if (firstLine === null) firstLine = lineNo;
        const sample = compact(match[0]);
        if (samples.length < 8 && !samples.includes(sample)) samples.push(sample);
      }
    }
  }

  if (noticeLines < NOTICE_FORMAL_MIN_LINES || noticeChars === 0 || hits < NOTICE_FORMAL_MIN_HITS || coreHits < NOTICE_FORMAL_CORE_MIN_HITS) return [];
  const perKilo = (hits / noticeChars) * 1000;
  if (perKilo < NOTICE_FORMAL_PER_KILO) return [];

  return [{
    line: firstLine,
    column: 1,
    type: 'system-notice-formality-tic',
    severity: 'advisory',
    message: `系统公告公文腔过密：方括号规则行中硬规则词 ${hits} 处（${perKilo.toFixed(1)}/千字）；保留为角色看见的屏幕/公告/规则载体，只在载体内部白话化部分硬词，或补角色当场看懂的具体后果，不改成叙述者解释。`,
    excerpt: compact(samples.join(' | ')),
  }];
}

// 长文本整体过于“精炼”：短段很多、自然连接偏少，读起来像处理过的梗概/分镜表。
// 修法是通读后补断裂处，不是为凑阈值全局加“的/了/就”。
function findOvercompressedProseTic(proseLines) {
  let narrativeChars = 0;
  let narrativeParas = 0;
  let shortParas = 0;
  let particles = 0;
  let firstLine = null;
  const samples = [];

  for (const { text, lineNo } of proseLines) {
    const trimmed = text.trim();
    if (!trimmed || isDivider(trimmed) || isStructural(trimmed) || /^【[^】]+】$/.test(trimmed)) continue;
    const narrative = stripQuoted(trimmed).trim();
    const len = visibleLength(narrative);
    if (len === 0) continue;

    if (firstLine === null) firstLine = lineNo;
    narrativeParas += 1;
    narrativeChars += len;
    if (len <= OVERCOMPRESSED_PROSE_SHORT_MAX_CHARS) {
      shortParas += 1;
      if (samples.length < 6) samples.push(narrative);
    }

    OVERCOMPRESSED_PROSE_PARTICLE_PATTERN.lastIndex = 0;
    while (OVERCOMPRESSED_PROSE_PARTICLE_PATTERN.exec(narrative) !== null) particles += 1;
  }

  if (narrativeChars < OVERCOMPRESSED_PROSE_MIN_CHARS || narrativeParas < OVERCOMPRESSED_PROSE_MIN_PARAS) return [];
  const shortRatio = shortParas / narrativeParas;
  if (shortRatio < OVERCOMPRESSED_PROSE_SHORT_RATIO) return [];
  const particlePerKilo = (particles / narrativeChars) * 1000;
  if (particlePerKilo >= OVERCOMPRESSED_PROSE_PARTICLE_PER_KILO) return [];

  return [{
    line: firstLine,
    column: 1,
    type: 'overcompressed-prose-tic',
    severity: 'advisory',
    message: `过度精炼短段：叙述段 ${narrativeParas} 个，其中 ${shortParas} 个≤${OVERCOMPRESSED_PROSE_SHORT_MAX_CHARS}字（${(shortRatio * 100).toFixed(0)}%），自然连接 ${particlePerKilo.toFixed(1)}/千字偏少；先通读判断，确有提纲感再补断裂处和必要结构虚词，有意短镜头可留，别机械注水。`,
    excerpt: compact(samples.join(' | ')),
  }];

}

// 低连接密度：长文本/中短窗口里，引号外叙述的功能词和白话连接同时偏低，且缺少中长承接句，
// 会呈现“提纲/电报体”分布。修法是恢复必要连接和句群，不是全局补词。
function findLowConnectiveDensityTic(proseLines) {
  let bodyChars = 0;
  let functionHits = 0;
  let plainHits = 0;
  let firstLine = null;
  const sentences = [];
  const samples = [];

  for (const { text, lineNo } of proseLines) {
    const trimmed = text.trim();
    if (!trimmed || isDivider(trimmed) || isStructural(trimmed)) continue;

    // 只看引号外叙述。台词/弹幕/系统播报可以天然短促，混入统计会把体裁特征误当电报体。
    const narrative = stripQuoted(trimmed).trim();
    const narrativeLen = visibleLength(narrative);
    if (narrativeLen === 0) continue;

    if (firstLine === null) firstLine = lineNo;
    bodyChars += narrativeLen;
    functionHits += countTerms(narrative, LOW_CONNECTIVE_FUNCTION_TERMS);
    plainHits += countTerms(narrative, LOW_CONNECTIVE_PLAIN_TERMS);

    for (const sentence of splitSentences(narrative)) {
      const len = visibleLength(sentence);
      if (len === 0) continue;
      sentences.push(len);
      if (len <= 12 && samples.length < 6) samples.push(sentence);
    }
  }

  if (bodyChars < LOW_CONNECTIVE_MIN_CHARS || sentences.length === 0) return [];
  const functionPerKilo = (functionHits / bodyChars) * 1000;
  if (functionPerKilo >= LOW_CONNECTIVE_FUNCTION_PER_KILO) return [];
  const plainPerKilo = (plainHits / bodyChars) * 1000;
  if (plainPerKilo >= LOW_CONNECTIVE_PLAIN_PER_KILO) return [];
  const longSentenceRatio = sentences.filter((len) => len >= LOW_CONNECTIVE_LONG_SENTENCE_CHARS).length / sentences.length;
  if (longSentenceRatio >= LOW_CONNECTIVE_LONG_SENTENCE_RATIO) return [];

  return [{
    line: firstLine,
    column: 1,
    type: 'low-connective-density-tic',
    severity: 'advisory',
    message: `低连接密度：引号外叙述功能词 ${functionPerKilo.toFixed(1)}/千字、白话连接 ${plainPerKilo.toFixed(1)}/千字，且≥${LOW_CONNECTIVE_LONG_SENTENCE_CHARS}字承接句仅 ${(longSentenceRatio * 100).toFixed(0)}%；容易像提纲/电报体。通读后补必要连接和中长句群，别机械注水。`,
    excerpt: compact(samples.join(' | ')),
  }];
}

// 抽象总结复读：统计引号外叙述中的高抽象收束模板。全篇只报一条，提醒回到角色
// 当下可见的文件、动作、对话或物理后果；不要用命运大词替读者总结。
function findAbstractSummaryTic(proseLines) {
  let hits = 0;
  let narrativeChars = 0;
  let firstLine = null;
  const samples = [];

  for (const { text, lineNo } of proseLines) {
    const trimmed = text.trim();
    if (!trimmed || isDivider(trimmed) || isStructural(trimmed)) continue;
    const narrative = stripQuoted(trimmed);
    narrativeChars += visibleLength(narrative);

    for (const pattern of ABSTRACT_SUMMARY_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(narrative)) !== null) {
        hits += 1;
        if (firstLine === null) firstLine = lineNo;
        const sample = compact(match[0]);
        if (samples.length < 6 && !samples.includes(sample)) samples.push(sample);
      }
    }
  }

  if (narrativeChars === 0 || hits < ABSTRACT_SUMMARY_MIN_HITS) return [];
  const perKilo = (hits / narrativeChars) * 1000;
  if (perKilo < ABSTRACT_SUMMARY_PER_KILO) return [];

  return [{
    line: firstLine,
    column: 1,
    type: 'abstract-summary-tic',
    severity: 'advisory',
    message: `抽象总结复读：命运/棋局/这一刻终于明白/才刚刚开始等作者总结 ${hits} 处（${perKilo.toFixed(1)}/千字）；回到角色当下可见的文件、动作、对话或物理后果，别替读者盖章。`,
    excerpt: compact(samples.join(' | ')),
  }];
}

function findPeriodStutter(proseLines) {
  const findings = [];
  let runLen = 0;
  let runStartLine = null;
  let runSample = [];

  const flush = () => {
    if (runLen >= STUTTER_MIN_RUN) {
      findings.push({
        line: runStartLine,
        column: 1,
        type: 'period-stutter',
        severity: 'advisory',
        message: `碎句号：连续 ${runLen} 个短句无呼吸；按目标句长把碎句合并成中长句、补回画面与连接（见本 skill 句长/疏密节奏规则）。`,
        excerpt: compact(runSample.join(' ')),
      });
    }
    runLen = 0;
    runStartLine = null;
    runSample = [];
  };

  for (const { text, lineNo } of proseLines) {
    const trimmed = text.trim();
    if (!trimmed) continue; // 空行是一句一段排版，不打断叙述连贯
    if (isDivider(trimmed) || isStructural(trimmed)) {
      flush(); // 分隔线/markdown 结构行：重置碎句计数
      continue;
    }
    const narrative = stripQuoted(trimmed);
    if (visibleLength(narrative) === 0) {
      flush(); // 纯对话/弹幕/系统播报：成片短句是正常形态，重置碎句计数
      continue;
    }
    // 只数引号外叙述句：混合行（叙述+引号内物件/短台词）的引号外片段仍参与碎句计数。
    for (const sentence of splitSentences(narrative)) {
      if (visibleLength(sentence) <= STUTTER_MAX_SENTENCE) {
        if (runLen === 0) runStartLine = lineNo;
        runLen += 1;
        if (runSample.length < 6) runSample.push(sentence);
      } else {
        flush();
      }
    }
  }
  flush();
  return findings;
}

function isDivider(trimmed) {
  return /^-{3,}$/.test(trimmed) || /^[*_]{3,}$/.test(trimmed);
}

// markdown 结构行（标题/列表/引用/表格）不是叙述正文，长段落/碎句号/破折号检测都跳过。
function isStructural(trimmed) {
  return /^(#{1,6}\s|>\s?|[-*+]\s|\d+[.)]\s|\|)/.test(trimmed)
    || /^第[零一二三四五六七八九十百千万\d]+章(?:\s|_|$)/.test(trimmed);
}

// 去掉成对引号内的片段（台词/系统播报），只留引号外叙述。碎句号判定用：纯对话/弹幕成片短句
// 是体裁正常形态（豁免），但「叙述 + 引号内物件/短台词」混合行的引号外叙述仍要参与短句计数。
function stripQuoted(text) {
  let out = text;
  for (const src of QUOTE_SOURCES) out = out.replace(new RegExp(src, 'g'), '');
  return out;
}

// 返回引号内片段（含引号本身）的 [start, end) 区间，供 not-is 对比句豁免台词用。
function quotedRanges(text) {
  const ranges = [];
  for (const src of QUOTE_SOURCES) {
    const re = new RegExp(src, 'g');
    let match;
    while ((match = re.exec(text)) !== null) ranges.push([match.index, match.index + match[0].length]);
  }
  return ranges;
}

function insideRanges(pos, ranges) {
  return ranges.some(([start, end]) => pos >= start && pos < end);
}

function splitSentences(trimmed) {
  return trimmed
    .split(/[。！？!?]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function sentenceAround(text, index) {
  let start = index;
  while (start > 0 && !STOP_CHARS.has(text[start - 1])) start -= 1;
  let end = index;
  while (end < text.length && !STOP_CHARS.has(text[end])) end += 1;
  return compact(text.slice(start, end).trim());
}

function visibleLength(sentence) {
  const matched = sentence.match(/[一-鿿Ａ-ｚA-Za-z0-9]/g);
  return matched ? matched.length : 0;
}

function countTerms(text, terms) {
  let count = 0;
  for (const term of terms) {
    let index = text.indexOf(term);
    while (index !== -1) {
      count += 1;
      index = text.indexOf(term, index + term.length);
    }
  }
  return count;
}

function parseFenceMarker(trimmedLine) {
  const match = /^(?:`{3,}|~{3,})/.exec(trimmedLine);
  if (!match) return null;
  return { char: match[0][0], length: match[0].length };
}

function hasYamlFrontMatter(lines) {
  if (!lines[0] || lines[0].trim() !== '---') return false;
  let sawYamlField = false;
  for (let i = 1; i < Math.min(lines.length, 40); i += 1) {
    const trimmed = lines[i].trim();
    if (trimmed === '---') return sawYamlField;
    if (/^[A-Za-z0-9_-]+:\s*/.test(trimmed)) sawYamlField = true;
  }
  return false;
}

function scanBlock(block) {
  const text = block.map((entry) => entry.text).join('\n');
  const lineStarts = [];
  let cursor = 0;

  for (const entry of block) {
    lineStarts.push({ offset: cursor, lineNo: entry.lineNo });
    cursor += entry.text.length + 1;
  }

  return findNotIsComparisons(text, (offset) => positionForOffset(lineStarts, offset));
}

function positionForOffset(lineStarts, offset) {
  let low = 0;
  let high = lineStarts.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const current = lineStarts[mid];
    const next = lineStarts[mid + 1];

    if (offset < current.offset) {
      high = mid - 1;
    } else if (next && offset >= next.offset) {
      low = mid + 1;
    } else {
      return {
        line: current.lineNo,
        column: offset - current.offset + 1,
      };
    }
  }

  return { line: lineStarts[0].lineNo, column: 1 };
}

function findNotIsComparisons(text, getPosition) {
  const findings = [];
  const quoted = quotedRanges(text);
  let offset = 0;

  while (offset < text.length) {
    const start = text.indexOf('不是', offset);
    if (start === -1) break;

    // 引号内是台词/系统播报：口语里「不是A，是B」是自然辩解/反问，不算叙述层 AI 对比句式
    // （与碎句号一致豁免引号内容）。
    if (insideRanges(start, quoted)) {
      offset = start + 2;
      continue;
    }

    // Avoid the common yes/no question fragment “是不是”.
    if (start > 0 && text[start - 1] === '是') {
      offset = start + 2;
      continue;
    }

    const candidate = text.slice(start);
    const markerEnd = findPositiveFlipEnd(candidate);

    if (markerEnd === -1) {
      offset = start + 2;
      continue;
    }

    const raw = trimTrailingNoise(extractFinding(candidate, markerEnd));
    if (raw.length >= 4) {
      const position = getPosition(start);
      findings.push({
        line: position.line,
        column: position.column,
        type: 'not-is-comparison',
        severity: 'blocking',
        message: '高频 AI 对比句式；删掉否定铺垫，直接写后项，或改成动作/细节呈现。',
        excerpt: compact(raw),
      });
    }

    offset = start + Math.max(raw.length, 2);
  }

  return findings;
}

function findPositiveFlipEnd(candidate) {
  let index = 2; // after “不是”
  let scanned = 0;
  let crossedSeparator = false;

  while (index < candidate.length && scanned <= MAX_NEGATIVE_SPAN) {
    const char = candidate[index];

    if (startsWithAt(candidate, index, '而是')) return index + 2;

    if (SOFT_SEPARATORS.has(char)) {
      const next = skipGap(candidate, index + 1);
      if (startsWithAt(candidate, next, '而是')) return next + 2;
      if (candidate[next] === '是' && !TAG_PARTICLES.has(candidate[next + 1]) && !isAffirmationTagAt(candidate, next)) return next + 1;
      crossedSeparator = true;
    }

    if (HARD_SEPARATORS.has(char)) {
      const next = skipGap(candidate, index + 1);
      if (candidate[next] === '是' && !TAG_PARTICLES.has(candidate[next + 1]) && !isAffirmationTagAt(candidate, next)) return next + 1;
      if (char !== '.') break;
      crossedSeparator = true;
    }

    if (STOP_CHARS.has(char)) break;

    // Catch compact forms such as “不是A是B”, but only within the first clause —
    // before any separator. After a separator the trailing “是” of a conjunction
    // (只是/可是/但是/还是/于是/倒是/总是…) is part of that word, not a positive
    // copula (issue #166 false-positive class). Post-separator flips are still
    // caught when separator-adjacent (“，是”/“，而是”) by the separator branches
    // above; subject-present flips like “，他是”/“，那是” are intentionally NOT
    // caught here — there is no separator-local way to tell them from a
    // conjunction without a word list, and on a hard rescan-to-0 gate a false
    // positive (forcing a rewrite of good prose) costs more than missing this
    // rarer form. The “是” in the either-or idiom “不是A就是B / 也是B” is part of
    // the 就是/也是 conjunction, not a copula, so 就/也 are excluded too. Also never
    // treat the “是” inside a second negative fragment (“不是A，也不是B”) as the flip.
    if (char === '是' && !COMPACT_EITHER_OR_PREV.has(candidate[index - 1]) && !crossedSeparator) {
      return index + 1;
    }

    index += 1;
    scanned += 1;
  }

  return -1;
}

function extractFinding(candidate, markerEnd) {
  let end = markerEnd;
  const limit = Math.min(candidate.length, markerEnd + MAX_POSITIVE_SPAN);

  while (end < limit) {
    if (STOP_CHARS.has(candidate[end])) break;
    end += 1;
  }

  return candidate.slice(0, end);
}

function startsWithAt(text, index, needle) {
  return text.slice(index, index + needle.length) === needle;
}

function isAffirmationTagAt(text, index) {
  if (text[index] !== '是') return false;
  const particle = text[index + 1];
  if (!AFFIRMATION_TAG_PARTICLES.has(particle)) return false;
  const boundary = text[index + 2] || '';
  return AFFIRMATION_TAG_BOUNDARY.has(boundary);
}

// 跳过行内空白与换行（含空行/段落间距），停在下一个实义字符。原实现只吞一个换行，
// 会漏掉跨空行的「不是A。（空行）是B」这类分段揭示句。
function skipGap(text, index) {
  while (index < text.length && (isInlineSpace(text[index]) || text[index] === '\n')) index += 1;
  return index;
}

function isInlineSpace(char) {
  return char === ' ' || char === '\t' || char === '\r';
}

function trimTrailingNoise(text) {
  return text.replace(/[\s|）)】\]]+$/u, '');
}

function compact(text) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length > 80 ? `${normalized.slice(0, 77)}...` : normalized;
}
