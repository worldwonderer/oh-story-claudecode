#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const USAGE = `Usage: node normalize-punctuation.js [--check] [--quote-mode keep|ascii|yan] <file...>

Normalize正文 punctuation deterministically:
  - replace ellipses, em dashes, and double hyphens with Chinese punctuation
  - remove markdown divider lines (---) from正文
  - keep quote style by default; convert quotes only when explicitly requested
`;

const options = {
  check: false,
  quoteMode: 'keep',
  files: [],
};

for (let i = 2; i < process.argv.length; i += 1) {
  const arg = process.argv[i];
  if (arg === '--check') {
    options.check = true;
  } else if (arg === '--quote-mode') {
    const value = process.argv[i + 1];
    if (!value) die('--quote-mode requires keep, ascii, or yan');
    options.quoteMode = value;
    i += 1;
  } else if (arg.startsWith('--quote-mode=')) {
    options.quoteMode = arg.slice('--quote-mode='.length);
  } else if (arg === '-h' || arg === '--help') {
    process.stdout.write(USAGE);
    process.exit(0);
  } else if (arg.startsWith('-')) {
    die(`Unknown option: ${arg}`);
  } else {
    options.files.push(arg);
  }
}

if (!['keep', 'ascii', 'yan'].includes(options.quoteMode)) {
  die(`Invalid --quote-mode: ${options.quoteMode}`);
}
if (options.files.length === 0) {
  die('No files provided');
}

let totalFindings = 0;
let changedFiles = 0;
let failed = false;

for (const file of options.files) {
  const fullPath = path.resolve(file);
  let input;
  try {
    input = fs.readFileSync(fullPath, 'utf8');
  } catch (error) {
    failed = true;
    console.error(`${file}: unable to read (${error.message})`);
    continue;
  }

  const result = normalizeDocument(input, options.quoteMode);
  totalFindings += result.findings.length;

  if (options.check) {
    for (const finding of result.findings) {
      console.log(`${file}:${finding.line}:${finding.column}: ${finding.type}: ${finding.message}`);
    }
    continue;
  }

  if (result.output !== input) {
    fs.writeFileSync(fullPath, result.output, 'utf8');
    changedFiles += 1;
    console.log(`${file}: normalized (${result.findings.length} issue${result.findings.length === 1 ? '' : 's'})`);
  }
}

if (failed) {
  process.exit(2);
}
if (options.check && totalFindings > 0) {
  process.exit(1);
}
if (!options.check) {
  console.log(`Done. Changed files: ${changedFiles}`);
}

function die(message) {
  console.error(message);
  console.error(USAGE.trimEnd());
  process.exit(2);
}

function normalizeDocument(input, quoteMode) {
  const newline = input.includes('\r\n') ? '\r\n' : '\n';
  const trailingNewline = input.endsWith('\n');
  const lines = input.split(/\r?\n/);
  if (trailingNewline) lines.pop();

  const findings = [];
  const outputLines = [];
  let fence = null;
  let inFrontMatter = hasYamlFrontMatter(lines);
  let quoteOpen = false;

  for (let index = 0; index < lines.length; index += 1) {
    const lineNo = index + 1;
    let line = lines[index];
    const trimmed = line.trim();

    if (inFrontMatter) {
      outputLines.push(line);
      if (index > 0 && trimmed === '---') inFrontMatter = false;
      continue;
    }

    if (fence) {
      outputLines.push(line);
      if (isClosingFence(line, fence)) fence = null;
      continue;
    }

    const openingFence = parseOpeningFence(line);
    if (openingFence) {
      fence = openingFence;
      outputLines.push(line);
      continue;
    }

    if (trimmed === '---') {
      findings.push({
        line: lineNo,
        column: line.indexOf('-') + 1,
        type: 'markdown-divider',
        message: '正文中不要使用 markdown 分隔线；建议移除该行。',
      });
      continue;
    }

    const punctuationResult = normalizePausePunctuation(line, lineNo);
    findings.push(...punctuationResult.findings);
    line = punctuationResult.line;

    const quoteResult = normalizeQuotes(line, quoteMode, quoteOpen, lineNo);
    findings.push(...quoteResult.findings);
    line = quoteResult.line;
    quoteOpen = quoteResult.quoteOpen;

    outputLines.push(line);
  }

  return {
    output: outputLines.join(newline) + (trailingNewline ? newline : ''),
    findings,
  };
}

function parseOpeningFence(line) {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
  if (!match) return null;

  const marker = match[1];
  const rest = match[2];
  if (marker[0] === '`' && rest.includes('`')) return null;

  return { marker: marker[0], minimumLength: marker.length };
}

function isClosingFence(line, fence) {
  const marker = fence.marker === '`' ? '`' : '~';
  const match = line.match(new RegExp(`^ {0,3}(${marker}{3,})[\\t ]*$`));
  return Boolean(match && match[1].length >= fence.minimumLength);
}

function normalizePausePunctuation(line, lineNo) {
  const findings = [];
  const original = line;
  const pattern = /…+|\.{3,}|——|—|--+/g;
  let output = '';
  let lastIndex = 0;
  let match;

  while ((match = pattern.exec(original)) !== null) {
    output += original.slice(lastIndex, match.index);
    const token = match[0];
    const replacement = choosePauseReplacement(original, match.index, token.length);
    output += replacement;
    findings.push({
      line: lineNo,
      column: match.index + 1,
      type: getPauseType(token),
      message: replacement ? `替换为「${replacement}」。` : '移除重复标点。',
    });
    lastIndex = match.index + token.length;
  }

  output += original.slice(lastIndex);
  return { line: output, findings };
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

function getPauseType(token) {
  if (token.startsWith('-')) return 'double-hyphen';
  if (token.includes('—')) return 'em-dash';
  return 'ellipsis';
}

function choosePauseReplacement(text, start, length) {
  const before = previousNonSpace(text, start - 1);
  const after = nextNonSpace(text, start + length);
  const rest = text.slice(start + length).trimStart();

  // 正文产物不保留 `……`、`——`、`—` 或 `--`；对话打断和数字区间不设例外。
  if (before === '') return '';
  // 紧跟开引号/开括号的停顿符号属于句首边界，删空即可，避免产出 `「，…」` 或 `「。」`。
  if (isOpeningDelimiter(before)) return '';
  if (/\d/.test(before) && /\d/.test(after)) return '到';
  if (isClosingQuote(after)) return isSentencePunctuation(before) ? '' : '。';

  if (!after) return isSentencePunctuation(before) ? '' : '。';
  if (isSentencePunctuation(before) || isPunctuation(after)) return '';
  if (/^(因为|原来|这是|那是|也就是|换句话|说白了|所谓|答案|原因|结果|真相|问题在于)/.test(rest)) return '：';
  if (/(原因|答案|真相|结果|结论|问题|选择|意思)$/.test(text.slice(0, start).trim())) return '：';
  return '，';
}

function previousNonSpace(text, index) {
  for (let i = index; i >= 0; i -= 1) {
    if (!/\s/.test(text[i])) return text[i];
  }
  return '';
}

function nextNonSpace(text, index) {
  for (let i = index; i < text.length; i += 1) {
    if (!/\s/.test(text[i])) return text[i];
  }
  return '';
}

function isSentencePunctuation(ch) {
  return /[，,。.!！?？;；:：…]$/.test(ch || '');
}

function isPunctuation(ch) {
  return /[，,。.!！?？;；:：、…"“”'‘’」』）)]/.test(ch || '');
}

function isClosingQuote(ch) {
  return /["”」』]/.test(ch || '');
}

function isOpeningDelimiter(ch) {
  return /[「『（(“‘]/.test(ch || '');
}

function normalizeQuotes(line, quoteMode, quoteOpen, lineNo) {
  if (quoteMode === 'keep') {
    return { line, findings: [], quoteOpen };
  }

  const findings = [];
  let output = '';

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoteMode === 'ascii' && /[「」『』“”]/.test(ch)) {
      output += '"';
      findings.push({ line: lineNo, column: i + 1, type: 'quote-style', message: '按显式 quote-mode 转为半角双引号。' });
      continue;
    }
    if (quoteMode === 'yan' && (ch === '"' || ch === '“' || ch === '”')) {
      const replacement = quoteOpen || ch === '”' ? '」' : '「';
      output += replacement;
      quoteOpen = replacement === '「';
      findings.push({ line: lineNo, column: i + 1, type: 'quote-style', message: '按显式 quote-mode 转为盐言引号。' });
      continue;
    }
    output += ch;
  }

  return { line: output, findings, quoteOpen };
}
