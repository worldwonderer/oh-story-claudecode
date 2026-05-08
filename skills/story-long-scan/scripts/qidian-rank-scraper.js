#!/usr/bin/env node
/**
 * 起点中文网 排行榜采集脚本
 *
 * 配合 browser-cdp skill 使用。先启动 Chrome CDP 环境，再运行本脚本。
 * 采集策略：起点 SSR 直出 HTML，列表页直接包含排名/书名/作者/题材/字数/推荐等。
 * 输出 Markdown 格式匹配 scan-output-format.md 规范。
 *
 * 用法：
 *   node qidian-rank-scraper.js --type hotsales               # 畅销榜
 *   node qidian-rank-scraper.js --type yuepiao                 # 月票榜
 *   node qidian-rank-scraper.js --type signnewbook             # 签约作者新书榜
 *   node qidian-rank-scraper.js --type pubnewbook              # 公众作者新书榜
 *   node qidian-rank-scraper.js --type newauthor               # 新人作者新书榜
 *   node qidian-rank-scraper.js --type newsign                 # 新人签约新书榜
 *   node qidian-rank-scraper.js --type recom                   # 原创推荐榜
 *   node qidian-rank-scraper.js --type sanjiang                 # 三江推荐（/sanjiang/，非 /rank/ 路径）
 *   node qidian-rank-scraper.js --type all                     # 全部榜单
 *
 * 前置：
 *   node {SKILL_DIR}/browser-cdp/scripts/setup-cdp-chrome.js 9222
 */

const fs = require("fs");
const path = require("path");
const { ab, sleep, evalJSON, scrollLoad, getArg } = require("./cdp-utils");

const BASE_URL = "https://www.qidian.com/rank";

const RANK_TYPES = [
  { id: "hotsales", label: "畅销榜" },
  { id: "yuepiao", label: "月票榜" },
  { id: "signnewbook", label: "签约作者新书榜" },
  { id: "pubnewbook", label: "公众作者新书榜" },
  { id: "newauthor", label: "新人作者新书榜" },
  { id: "newsign", label: "新人签约新书榜" },
  { id: "recom", label: "原创推荐榜" },
  { id: "readindex", label: "阅读指数榜" },
  { id: "collect", label: "收藏榜" },
  { id: "sanjiang", label: "三江推荐", baseUrl: "https://www.qidian.com/sanjiang/" },
];

// ---------------------------------------------------------------------------
// 页面提取
// ---------------------------------------------------------------------------

/**
 * 提取起点 SSR 榜单页面的书籍列表。
 * 起点页面结构：.book-img-text ul > li，每个 li 内：
 *   h2 > a          → 书名+链接
 *   p.author         → 作者 | 题材 · 子题材 | 状态
 *   p.intro          → 简介
 *   p.update > a+span → 最新更新章节+日期
 */
function extractBookList(port) {
  const js =
    "JSON.stringify((()=>{" +
    "var items=[];" +
    "var lis=document.querySelectorAll('.book-img-text ul li');" +
    "if(!lis.length){" +
    // 兜底：用 H2 链接定位
    "  var h2s=document.querySelectorAll('h2 a[href*=\"/book/\"]');" +
    "  h2s.forEach(function(a,idx){" +
    "    var c=a.parentElement;" +
    "    for(var j=0;j<3;j++){if(c.parentElement)c=c.parentElement}" +
    "    var text=c.innerText||'';" +
    "    var href=a.getAttribute('href')||a.href||'';" +
    "    var url=href?(href.indexOf('http')===0?href:'https:'+href):'';" +
    "    items.push({rank:idx+1,title:a.textContent.trim(),url:url,author:'',genre:'',status:'',descText:'',updateText:text.replace(/\\s+/g,' ').trim().substring(0,300)})" +
    "  });" +
    "  return items" +
    "}" +
    "lis.forEach(function(li,idx){" +
    "  var titleEl=li.querySelector('h2 a');" +
    "  if(!titleEl)return;" +
    "  var title=titleEl.textContent.trim();" +
    "  var href=titleEl.getAttribute('href')||titleEl.href||'';" +
    "  var url=href?(href.indexOf('http')===0?href:'https:'+href):'';" +
    // 作者：p.author > a.name
    "  var authorEl=li.querySelector('p.author a.name');" +
    "  var author=authorEl?authorEl.textContent.trim():'';" +
    // 题材：p.author > a (非 .name 非 .go-sub-type)
    "  var genreEls=li.querySelectorAll('p.author a');" +
    "  var genre='';var subGenre='';" +
    "  genreEls.forEach(function(a){" +
    "    if(a.classList.contains('name'))return;" +
    "    if(!genre){genre=a.textContent.trim()}else if(!subGenre){subGenre=a.textContent.trim()}" +
    "  });" +
    // 状态：p.author > span:last-child
    "  var statusEl=li.querySelector('p.author span');" +
    "  var status=statusEl?statusEl.textContent.trim():'';" +
    // 简介：p.intro
    "  var introEl=li.querySelector('p.intro');" +
    "  var descText=introEl?introEl.textContent.trim():'';" +
    // 更新：p.update
    "  var updateEl=li.querySelector('p.update');" +
    "  var updateText=updateEl?updateEl.textContent.replace(/\\s+/g,' ').trim():'';" +
    "  if(title){" +
    "    items.push({rank:idx+1,title:title,url:url,author:author,genre:genre+(subGenre?'·'+subGenre:''),status:status,descText:descText,updateText:updateText})" +
    "  }" +
    "});" +
    "return items" +
    "})())";
  return evalJSON(port, js) || [];
}

/** 从详情页提取标签和简介 */
function extractDetail(port) {
  const js =
    "JSON.stringify((()=>{" +
    "var tags=Array.from(document.querySelectorAll('[class*=\"tag\"] a,[class*=\"label\"] a')).map(function(a){return a.textContent.trim()});" +
    "var intro=document.querySelector('[class*=\"intro\"],[class*=\"summary\"],[class*=\"desc\"]');" +
    "var introText=intro?intro.textContent.trim():'';" +
    "var update=document.querySelector('[class*=\"update\"],[class*=\"latest\"]');" +
    "var updateText=update?update.textContent.trim():'';" +
    "return {tags:tags,intro:introText,update:updateText}" +
    "})())";
  return evalJSON(port, js);
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const PORT = parseInt(getArg(args, "--port") || "9222", 10);
const OUTDIR = getArg(args, "--outdir") || ".";
const RANKTYPE = getArg(args, "--type") || "hotsales";
const FETCH_DETAIL = (getArg(args, "--detail") || "no") === "yes";

function scrapeRank(port, rankTypeId) {
  const rt = RANK_TYPES.find((r) => r.id === rankTypeId);
  if (!rt) {
    console.log(`  ⚠ 未知榜单类型: ${rankTypeId}`);
    return null;
  }

  const url = rt.baseUrl || `${BASE_URL}/${rankTypeId}/`;
  console.log(`\n→ 采集 起点${rt.label}...`);
  console.log(`  URL: ${url}`);

  ab(port, "open", url);
  sleep(3000);
  scrollLoad(port, 3);
  sleep(1000);

  const books = extractBookList(port);
  if (!books.length) {
    console.log("  ⚠ 未提取到书籍");
    return null;
  }
  console.log(`  ✓ 提取 ${books.length} 本`);

  // 可选：逐条获取详情页补充数据
  if (FETCH_DETAIL) {
    console.log("  正在获取详情页补充数据...");
    for (let i = 0; i < Math.min(books.length, 20); i++) {
      const b = books[i];
      if (!b.url) continue;
      ab(port, "open", b.url);
      sleep(1500);
      const detail = extractDetail(port);
      if (detail) {
        if (detail.tags?.length) b.tags = detail.tags;
        if (detail.intro) b.descText = detail.intro;
        if (detail.update) b.updateText = detail.update;
      }
      console.log(`    [${i + 1}/${books.length}] ${b.title}`);
    }
    // 返回榜单页
    ab(port, "open", url);
    sleep(2000);
  }

  const now = new Date().toISOString();
  const lines = [
    `# 起点 · ${rt.label}`,
    "",
    `- 来源：${url}`,
    `- 抓取时间：${now}`,
    `- 条目数：${books.length}`,
    "",
    "---",
    "",
  ];

  for (let i = 0; i < books.length; i++) {
    const b = books[i];
    lines.push(`## #${b.rank || i + 1} ${b.title}`);
    const meta = [b.author, b.genre, b.status].filter(Boolean).join(" · ");
    if (meta) lines.push(`*${meta}*`);
    if (b.updateText) lines.push(`**最新更新：** ${b.updateText}`);
    if (b.tags?.length) lines.push(`**标签：** ${b.tags.join("、")}`);
    if (b.url) lines.push(`[作品页](${b.url})`);
    if (b.descText) {
      lines.push("");
      lines.push("**简介**");
      lines.push("");
      lines.push(b.descText);
    }
    lines.push("", "---", "");
  }

  return lines.join("\n");
}

function main() {
  const rankTypes =
    RANKTYPE === "all" ? RANK_TYPES.map((r) => r.id) : [RANKTYPE];

  for (const rt of rankTypes) {
    const content = scrapeRank(PORT, rt);
    if (!content) continue;

    const rtInfo = RANK_TYPES.find((r) => r.id === rt);
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const filename = `起点${rtInfo.label}_${date}.md`;
    const filepath = path.join(OUTDIR, filename);
    fs.writeFileSync(filepath, content, "utf-8");
    console.log(`  ✓ 已保存: ${filepath}`);
  }
}

main();
