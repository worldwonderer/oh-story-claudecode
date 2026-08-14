#!/usr/bin/env node
/**
 * 七猫小说排行榜采集脚本
 *
 * 配合 browser-cdp skill 使用。先启动 Chrome CDP 环境，再运行本脚本。
 * 采集策略：tab 切换男生榜/女生榜和榜单类型，滚动加载后从页面文本解析结构化数据。
 * 输出 Markdown 格式匹配 scan-output-format.md 规范。
 *
 * 用法：
 *   node qimao-rank-scraper.js --channel male --type hot --period day    # 男生大热榜日榜
 *   node qimao-rank-scraper.js --channel male --type hot --period month  # 男生大热榜月榜
 *   node qimao-rank-scraper.js --channel male --type hot --period all    # 日榜+月榜
 *   node qimao-rank-scraper.js --channel female --type new      # 女生新书榜
 *   node qimao-rank-scraper.js --channel all --type all         # 全部采集
 *
 * 前置：
 *   node {SKILL_DIR}/browser-cdp/scripts/setup-cdp-chrome.js 9222
 */

const fs = require("fs");
const path = require("path");
const { ab, sleep, evalJSONBase64, scrollLoad, getArg, localDateStamp, runCli } = require("./cdp-utils");

const RANK_URL = "https://www.qimao.com/paihang";

/** 连通性 + 页面就绪自检 */
function probePage(port) {
  return evalJSONBase64(
    port,
    "JSON.stringify({host:location.host,path:location.pathname,len:(document.body&&document.body.innerText||'').length})"
  );
}

const CHANNELS = [
  { id: "male", label: "男频", tab: "男生榜", path: "boy" },
  { id: "female", label: "女频", tab: "女生榜", path: "girl" },
];

const RANK_TYPES = [
  { id: "hot", label: "大热榜", path: "hot" },
  { id: "new", label: "新书榜", path: "new" },
  { id: "finish", label: "完结榜", path: "over" },
  { id: "collect", label: "收藏榜", path: "collect" },
  { id: "update", label: "更新榜", path: "update" },
];

const PERIODS = [
  { id: "day", label: "日榜", path: "date" },
  { id: "month", label: "月榜", path: "month" },
];

// ---------------------------------------------------------------------------
// 页面操作
// ---------------------------------------------------------------------------

function rankUrl(channelId, rankTypeId, periodId) {
  const channel = CHANNELS.find((item) => item.id === channelId);
  const rankType = RANK_TYPES.find((item) => item.id === rankTypeId);
  const period = PERIODS.find((item) => item.id === (periodId || "day"));
  if (!channel || !rankType || !period) return "";
  return `${RANK_URL}/${channel.path}/${rankType.path}/${period.path}/`;
}

/** 读取页面实际 active 状态；输出文件标签必须由该状态校验后才能使用。 */
function extractObservedSelection(port) {
  const js = `JSON.stringify((function(){
    function text(selector){var e=document.querySelector(selector);return e?(e.textContent||'').replace(/\\s+/g,'').trim():'';}
    return {path:location.pathname,channel:text('.qm-switch-tab .item.active'),rankType:text('.child-tabs-item.menu-tab.active'),period:text('.date-type-tabs .tab.active')};
  })())`;
  return evalJSONBase64(port, js) || {};
}

function selectionMatches(observed, channelId, rankTypeId, periodId) {
  const channel = CHANNELS.find((item) => item.id === channelId);
  const rankType = RANK_TYPES.find((item) => item.id === rankTypeId);
  const period = periodId ? PERIODS.find((item) => item.id === periodId) : null;
  if (!channel || !rankType) return false;
  const expectedUrl = rankUrl(channelId, rankTypeId, periodId);
  if (!expectedUrl) return false;
  const expectedPath = new URL(expectedUrl).pathname;
  const actualPath = String(observed && observed.path || "").replace(/\/+$/, "/");
  return !!(
    actualPath === expectedPath &&
    String(observed.channel || "").includes(channel.tab) &&
    observed.rankType === rankType.label &&
    (!period || observed.period === period.label)
  );
}

/**
 * 从 DOM 获取书籍链接。每本书有多个 anchor（排名数字/书名/最近更新），
 * 按 bookId 聚合后取最像书名的文本（非纯数字、非"最近更新"前缀、最长），
 * 否则书名会被排名数字 anchor 覆盖，导致后续按书名回填链接全失败。
 */
function extractBookUrls(port) {
  const js = `JSON.stringify((function(){
    var byId={};var order=[];
    Array.from(document.querySelectorAll('a')).forEach(function(a){
      var h=a.getAttribute('href')||a.href||'';
      var m=h.match(/\\/(?:shuku|book)\\/([0-9]+)/);
      if(!m)return; var id=m[1];
      var t=(a.innerText||a.textContent||'').replace(/\\s+/g,' ').trim();
      if(!byId[id]){byId[id]='';order.push(id);}
      if(t&&!/^[0-9]+$/.test(t)&&!/^(最近更新|最新章节|最新)/.test(t)){
        if(t.length>byId[id].length)byId[id]=t;
      }
    });
    return order.map(function(id){return {bookId:id,title:byId[id],url:'https://www.qimao.com/shuku/'+id+'/'};});
  })())`;
  return evalJSONBase64(port, js) || [];
}

/**
 * 从页面 innerText 解析结构化书籍数据。
 * 七猫页面文本结构固定：排名→书名→作者→题材→子分类→状态→字数→简介→更新→热度
 */
function extractBooksFromText(port) {
  const js =
    "JSON.stringify((()=>{" +
    "var text=document.body.innerText||'';" +
    // 找到榜单数据起始位置
    "var start=-1;" +
    "['日榜','月榜'].forEach(function(m){if(start<0)start=text.indexOf(m)});" +
    "if(start<0)return[];" +
    "var lines=text.substring(start).split(/\\n/);" +
    "var books=[];var cur=null;var fieldIdx=0;" +
    "for(var i=0;i<lines.length;i++){" +
    "  var line=lines[i].trim();" +
    "  if(!line)continue;" +
    // 排行数据结束后的分页器/页脚必须立刻截断；否则“5 / 下一页 / 跳转 / 友情链接”
    // 会被串成一条字段齐全的假书目。
    "  if(/^(上一页|下一页|跳转|友情链接[:：]?)$/.test(line)){if(cur&&cur.title)books.push(cur);cur=null;break}" +
    // 排名标记：独立数字 1-99
    "  if(/^\\d{1,2}$/.test(line)&&parseInt(line)<100){" +
    "    if(cur&&cur.title)books.push(cur);" +
    "    cur={rank:parseInt(line),title:'',author:'',genre:'',subGenre:'',status:'',words:'',heat:'',update:'',desc:''};" +
    "    fieldIdx=0;continue" +
    "  }" +
    "  if(!cur)continue;" +
    // 跳过 UI 文字
    "  if(/^(加入书架|立即阅读|蝉联|榜首)/.test(line))continue;" +
    // 热度
    "  var hm=line.match(/([\\d.]+)\\s*万\\s*热度/);" +
    "  if(hm){cur.heat=hm[1]+'万';continue}" +
    // 最新更新
    "  if(line.indexOf('最近更新')===0){cur.update=line.replace(/^最近更新\\s*/,'');continue}" +
    // 状态
    "  if(/^(连载中|已完结)$/.test(line)){cur.status=line;continue}" +
    // 字数
    "  if(/^[\\d.]+万字$/.test(line)){cur.words=line;continue}" +
    // 按序填充：书名→作者→题材→子分类
    "  if(fieldIdx===0){cur.title=line;fieldIdx=1;continue}" +
    "  if(fieldIdx===1){cur.author=line;fieldIdx=2;continue}" +
    "  if(fieldIdx===2){cur.genre=line;fieldIdx=3;continue}" +
    "  if(fieldIdx===3){cur.subGenre=line;fieldIdx=4;continue}" +
    // 其余为简介
    "  cur.desc+=(cur.desc?' ':'')+line" +
    "}" +
    "if(cur&&cur.title)books.push(cur);" +
    "return books" +
    "})())";
  return evalJSONBase64(port, js) || [];
}

/**
 * 排除分页器等被正文文本解析器误认成的伪书目。
 * 七猫榜单尾部会出现“5 / 下一页”这类纯 UI 文本；有效条目必须同时有正排名、书名和作者。
 */
function isUsableBook(book) {
  return !!(
    book &&
    Number.isInteger(book.rank) &&
    book.rank > 0 &&
    book.title &&
    book.author &&
    !/^(上一页|下一页|跳转)$/.test(book.title) &&
    !/^(上一页|下一页|跳转|友情链接[:：]?)$/.test(book.author)
  );
}

function cleanDesc(value) {
  const text = String(value || "")
    .replace(/\s*(?:飙升|上升|下降)\s*\d+\s*名\s*$/g, "")
    .replace(/\s*(?:上一页|下一页)\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= 100) return text;
  const cut = text.slice(0, 100);
  const sentence = cut.match(/^[\s\S]*[。！？]/);
  return (sentence ? sentence[0] : cut) + "...";
}

function summarizeQuality(books, rawCount) {
  const linked = books.filter((book) => book.url).length;
  const heated = books.filter((book) => book.heat).length;
  const fieldCounts = [
    ["题材", "genre"],
    ["子分类", "subGenre"],
    ["状态", "status"],
    ["字数", "words"],
    ["热度", "heat"],
  ].map(([label, field]) => ({
    label,
    missing: books.filter((book) => !book[field]).length,
  }));
  const problems = [];
  if (rawCount > books.length) problems.push(`移除无效/UI条目 ${rawCount - books.length} 条`);
  if (linked < books.length) problems.push(`作品页链接缺失 ${books.length - linked} 条`);
  for (const field of fieldCounts) {
    if (field.missing) problems.push(`${field.label}缺失 ${field.missing} 条`);
  }
  if (books.length < 15) problems.push(`[数据稀疏] 实际采集 ${books.length} 条`);
  return {
    linked,
    heated,
    problems,
    quality: problems.length ? "[存在问题]" : "[OK]",
  };
}

function renderMarkdown(ch, rt, period, url, books, rawCount, now = new Date().toISOString()) {
  const periodLabel = period ? period.label : "";
  const summary = summarizeQuality(books, rawCount);
  const lines = [
    `# 七猫 · ${ch.label} · ${rt.label}${periodLabel}`,
    "",
    `- 数据质量：${summary.quality}`,
    `- 有效条目：${books.length} / ${rawCount}`,
    `- 问题摘要：${summary.problems.length ? summary.problems.join("；") : "无"}`,
    `- 作品页链接：${summary.linked} / ${books.length}`,
    `- 热度命中：${summary.heated} / ${books.length}`,
    `- 来源：${url}`,
    `- 抓取时间：${now}`,
    `- 条目数：${books.length}`,
    "",
    "---",
    "",
  ];

  for (const b of books) {
    try {
      lines.push(`### #${b.rank} ${b.title}`);
      const meta = [
        b.author || "[待补]",
        b.genre || "[待补]",
        b.subGenre || "[待补]",
        b.status || "[待补]",
        b.words || "[待补]",
        b.heat ? b.heat + "热度" : "[待补]",
      ].join(" · ");
      lines.push(`*${meta}*`);
      if (b.update) lines.push(`**最新更新：** ${b.update}`);
      if (b.url) lines.push(`[作品页](${b.url})`);
      const desc = cleanDesc(b.desc);
      if (desc) {
        lines.push("");
        lines.push("**简介**");
        lines.push("");
        lines.push(desc);
      }
      lines.push("", "---", "");
    } catch (bookErr) {
      console.error(`[qimao] ${ch.label}${rt.label} 第${b.rank}条处理出错: ${bookErr.message}`);
      lines.push("", "---", "");
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const PORT = parseInt(getArg(args, "--port") || "9222", 10);
const OUTDIR = getArg(args, "--outdir") || ".";
const CHANNEL = getArg(args, "--channel") || "male";
const RANKTYPE = getArg(args, "--type") || "hot";
const PERIOD = getArg(args, "--period") || "day";

function scrapeRank(port, channelId, rankTypeId, periodId) {
  const ch = CHANNELS.find((c) => c.id === channelId);
  const rt = RANK_TYPES.find((r) => r.id === rankTypeId);
  const period = periodId ? PERIODS.find((p) => p.id === periodId) : null;
  if (!ch || !rt) {
    console.log("  ⚠ 未知频道或榜单类型");
    return null;
  }

  const periodLabel = period ? period.label : "";
  const url = rankUrl(channelId, rankTypeId, periodId);
  console.log(`\n→ 采集 七猫${ch.label}${rt.label}${periodLabel}...`);

  let books, urls, rawCount;
  try {
    ab(port, "open", url);
    sleep(3000);

    // 连通性自检：CDP 未起/被重定向时给可操作报错，而非静默产空
    const probe = probePage(port);
    if (!probe) {
      console.error(
        `  ✗ CDP 无响应。请确认已用 browser-cdp 启动 Chrome（端口 ${port}），且 agent-browser 可用。`
      );
      return null;
    }
    if (probe.host && probe.host.indexOf("qimao") === -1) {
      console.error(`  ✗ 当前页面非七猫（host=${probe.host}），可能被重定向，已跳过。`);
      return null;
    }
    const observed = extractObservedSelection(port);
    if (!selectionMatches(observed, channelId, rankTypeId, periodId)) {
      console.error(
        `  ✗ 页面实际榜单与请求不一致（请求 ${ch.tab}/${rt.label}/${periodLabel || "日榜"}，` +
        `实际 ${observed.channel || "?"}/${observed.rankType || "?"}/${observed.period || "?"}，path=${observed.path || probe.path || "?"}），已跳过。`
      );
      return null;
    }
    console.log(`  ✓ 已验证页面实际榜单：${observed.channel}/${observed.rankType}${observed.period ? "/" + observed.period : ""}`);

    // 滚动加载更多
    scrollLoad(port, 5);
    sleep(1000);

    // 文本解析获取书籍数据 + DOM 获取链接
    const rawBooks = extractBooksFromText(port);
    rawCount = rawBooks.length;
    books = rawBooks.filter(isUsableBook);
    urls = extractBookUrls(port);
  } catch (err) {
    console.error(`[qimao] ${ch.label}${rt.label}${periodLabel} 页面加载或提取出错: ${err.message}`);
    return null;
  }

  if (!books.length) {
    console.error(`[qimao] 采集失败：页面结构可能已变（选择器没匹配到数据），请检查榜单URL或更新选择器 (${RANK_URL} ${ch.label}${rt.label}${periodLabel})`);
    return null;
  }

  // 按标题匹配 URL（书名归一后比对，吸收空白差异）
  const norm = (s) => (s || "").replace(/\s+/g, "");
  for (const b of books) {
    try {
      const matched = urls.find((u) => norm(u.title) === norm(b.title));
      if (matched) b.url = matched.url;
    } catch (matchErr) {
      console.error(`[qimao] URL匹配出错（#${b.rank} ${b.title}）: ${matchErr.message}`);
    }
  }

  const summary = summarizeQuality(books, rawCount);
  console.log(
    `  ✓ 提取 ${books.length} 本（链接 ${summary.linked}/${books.length}，热度 ${summary.heated}/${books.length}）`
  );
  return renderMarkdown(ch, rt, period, url, books, rawCount);
}

function buildTargets(channel, rankType, period) {
  const channels = channel === "all" ? CHANNELS.map((item) => item.id) : [channel];
  const rankTypes = rankType === "all" ? RANK_TYPES.map((item) => item.id) : [rankType];
  const targets = [];
  for (const channelId of channels) {
    for (const rankTypeId of rankTypes) {
      if (rankTypeId === "hot") {
        const periods = period === "all" ? PERIODS.map((item) => item.id) : [period];
        for (const periodId of periods) {
          targets.push({ channel: channelId, rankType: rankTypeId, period: periodId });
        }
      } else {
        targets.push({ channel: channelId, rankType: rankTypeId, period: null });
      }
    }
  }
  return targets;
}

function outputFilename(channelId, rankTypeId, periodId, date) {
  const channel = CHANNELS.find((item) => item.id === channelId);
  const rankType = RANK_TYPES.find((item) => item.id === rankTypeId);
  const period = periodId ? PERIODS.find((item) => item.id === periodId) : null;
  return `七猫${channel.label}${rankType.label}${period ? period.label : ""}_${date}.md`;
}

function main() {
  if (CHANNEL !== "all" && !CHANNELS.some((channel) => channel.id === CHANNEL)) {
    throw new Error(`未知 --channel: ${CHANNEL}`);
  }
  if (RANKTYPE !== "all" && !RANK_TYPES.some((rank) => rank.id === RANKTYPE)) {
    throw new Error(`未知 --type: ${RANKTYPE}`);
  }
  if (PERIOD !== "all" && !PERIODS.some((period) => period.id === PERIOD)) {
    throw new Error(`未知 --period: ${PERIOD}`);
  }
  const targets = buildTargets(CHANNEL, RANKTYPE, PERIOD);
  let written = 0;
  let failed = 0;

  for (const target of targets) {
    const content = scrapeRank(PORT, target.channel, target.rankType, target.period);
    if (!content) {
      failed++;
      continue;
    }

    const filename = outputFilename(target.channel, target.rankType, target.period, localDateStamp());
    fs.mkdirSync(OUTDIR, { recursive: true });
    const filepath = path.join(OUTDIR, filename);
    fs.writeFileSync(filepath, content, "utf-8");
    written++;
    console.log(`  ✓ 已保存: ${filepath}`);
  }
  return {
    planned: targets.length,
    written,
    failed,
    partial: failed > 0,
    partialReasons: [],
  };
}

if (require.main === module) {
  runCli(main, "七猫采集");
}

module.exports = {
  extractBooksFromText,
  isUsableBook,
  cleanDesc,
  renderMarkdown,
  rankUrl,
  selectionMatches,
  buildTargets,
  outputFilename,
};
