#!/usr/bin/env node
/**
 * 晋江文学城排行榜采集脚本
 *
 * 配合 browser-cdp skill 使用。先启动 Chrome CDP 环境，再运行本脚本。
 * 采集策略：晋江 topten.php 页面为纯文本格式，频道名直接出现，
 * 书目以标题/作者交替行呈现（无特殊前缀）。文本解析提取结构化数据。
 * 注：收藏数/营养液/积分等核心指标仅在作品详情页（需逐条访问），
 *     当前版本只提取榜单页可见数据（书名、作者）。
 * 输出 Markdown 格式匹配 scan-output-format.md 规范。
 *
 * 用法：
 *   node jjwxc-rank-scraper.js --type 12              # 收入金榜
 *   node jjwxc-rank-scraper.js --type 7               # 月榜
 *   node jjwxc-rank-scraper.js --type 8               # 季度榜
 *   node jjwxc-rank-scraper.js --type 14              # 完结金榜
 *   node jjwxc-rank-scraper.js --type all             # 全部榜单
 *
 * 前置：
 *   node {SKILL_DIR}/browser-cdp/scripts/setup-cdp-chrome.js 9222
 */

const fs = require("fs");
const path = require("path");
const { ab, sleep, evalJSON, getArg } = require("./cdp-utils");

const BASE_URL = "https://www.jjwxc.net/topten.php";

const RANK_TYPES = [
  { id: "12", label: "收入金榜" },
  { id: "7", label: "月榜" },
  { id: "8", label: "季度榜" },
  { id: "14", label: "完结金榜" },
  { id: "15", label: "新手金榜" },
  { id: "17", label: "千字金榜" },
];

// ---------------------------------------------------------------------------
// 页面提取
// ---------------------------------------------------------------------------

/**
 * 提取晋江榜单数据。
 * 晋江 topten.php 页面为纯文本格式：
 *   频道名（如"古代言情"，无前缀）
 *   书名
 *   作者
 *   书名
 *   作者
 *   ...
 * 按频道分组，标题/作者交替解析。
 */
function extractRankData(port) {
  const js =
    "JSON.stringify((()=>{" +
    "var result={channels:[]};" +
    "var text=document.body.innerText||'';" +
    "var lines=text.split(/\\n/).map(function(l){return l.trim()}).filter(Boolean);" +
    // 已知频道名列表
    "var channels=['古代言情','现代言情','古代穿越','现代都市纯爱','现代幻想纯爱','古代纯爱','衍生纯爱','幻想现言','奇幻言情','未来游戏悬疑','百合','无CP','二次元言情','衍生言情','衍生无cp','未来幻想纯爱','原创轻小说','多元'];" +
    "var channelSet={};channels.forEach(function(c){channelSet[c]=true});" +
    "var curChannel='';" +
    "var channelBooks={};" +
    "var expectTitle=true;" +
    "var pendingTitle='';" +
    "for(var i=0;i<lines.length;i++){" +
    "  var line=lines[i];" +
    // 跳过附录区
    "  if(/上榜天数记录|榜单说明/.test(line)){break}" +
    // 跳过 UI 文字
    "  if(/^(免费强推|vip强推|新晋作者|月榜|季榜|半年榜|长生殿|总分榜|字数榜|收入金榜|霸王票|霸王总榜|勤奋指数|完结金榜|新手金榜|栽培月榜|驻站|完结高分|千字金榜|完结全订榜)/.test(line)){continue}" +
    "  if(line.length>30&&line.indexOf('·')>0)continue;" +
    // 检测频道名
    "  if(channelSet[line]){" +
    "    if(curChannel&&channelBooks[curChannel])channelBooks[curChannel]._finished=true;" +
    "    curChannel=line;" +
    "    if(!channelBooks[curChannel])channelBooks[curChannel]={books:[],_finished:false};" +
    "    expectTitle=true;pendingTitle='';continue" +
    "  }" +
    "  if(!curChannel)continue;" +
    // 标题/作者交替
    "  if(expectTitle){" +
    "    pendingTitle=line;expectTitle=false" +
    "  }else{" +
    // 当前行为作者，上一行为标题
    "    if(pendingTitle){" +
    "      channelBooks[curChannel].books.push({title:pendingTitle,author:line})" +
    "    }" +
    "    expectTitle=true;pendingTitle=''" +
    "  }" +
    "}" +
    // 转换输出
    "for(var name in channelBooks){" +
    "  if(channelBooks[name].books.length>0){" +
    "    result.channels.push({name:name,books:channelBooks[name].books})" +
    "  }" +
    "}" +
    "return result" +
    "})())";
  return evalJSON(port, js);
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const PORT = parseInt(getArg(args, "--port") || "9222", 10);
const OUTDIR = getArg(args, "--outdir") || ".";
const RANKTYPE = getArg(args, "--type") || "12";
const CHANNEL = getArg(args, "--channel") || "0";

function scrapeRank(port, rankTypeId, channelId) {
  const rt = RANK_TYPES.find((r) => r.id === rankTypeId);
  if (!rt) {
    console.log(`  ⚠ 未知榜单类型: ${rankTypeId}`);
    return null;
  }

  const url = `${BASE_URL}?orderstr=${rankTypeId}&t=${channelId}`;
  const chLabel = channelId === "0" ? "全站" : `频道${channelId}`;
  console.log(`\n→ 采集 晋江${rt.label}（${chLabel}）...`);
  console.log(`  URL: ${url}`);

  ab(port, "open", url);
  sleep(4000);

  const data = extractRankData(port);
  if (!data?.channels?.length) {
    console.log("  ⚠ 未提取到数据");
    return null;
  }

  let totalBooks = 0;
  data.channels.forEach((ch) => {
    totalBooks += ch.books.length;
    const authors = new Set(ch.books.map((b) => b.author));
    if (ch.books.length >= 5 && authors.size / ch.books.length < 0.2) {
      console.log(
        `  ⚠ ${ch.name}：${ch.books.length} 本书只有 ${authors.size} 个唯一作者，可能提取有误`
      );
    }
  });
  console.log(
    `  ✓ 提取 ${data.channels.length} 个频道，共 ${totalBooks} 本`
  );

  const now = new Date().toISOString();
  const lines = [
    `# 晋江 · ${rt.label}`,
    "",
    `- 来源：${url}`,
    `- 抓取时间：${now}`,
    `- 频道数：${data.channels.length}`,
    `- 总条目数：${totalBooks}`,
    "",
    "---",
    "",
  ];

  for (const ch of data.channels) {
    lines.push(`## ${ch.name} — ${ch.books.length} 本`, "");
    for (let i = 0; i < ch.books.length; i++) {
      const b = ch.books[i];
      lines.push(`### #${i + 1} ${b.title}`);
      if (b.author) lines.push(`*${b.author}*`);
      lines.push("");
    }
    lines.push("---", "");
  }

  return lines.join("\n");
}

function main() {
  const rankTypes =
    RANKTYPE === "all" ? RANK_TYPES.map((r) => r.id) : [RANKTYPE];
  const channels = [CHANNEL]; // 晋江频道 ID 需从页面获取，默认全站

  for (const rt of rankTypes) {
    for (const ch of channels) {
      const content = scrapeRank(PORT, rt, ch);
      if (!content) continue;

      const rtInfo = RANK_TYPES.find((r) => r.id === rt);
      const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const chLabel = ch === "0" ? "全站" : `频道${ch}`;
      const filename = `晋江${rtInfo.label}_${chLabel}_${date}.md`;
      const filepath = path.join(OUTDIR, filename);
      fs.writeFileSync(filepath, content, "utf-8");
      console.log(`  ✓ 已保存: ${filepath}`);
    }
  }
}

main();
