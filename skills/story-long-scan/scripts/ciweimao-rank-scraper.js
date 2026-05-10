#!/usr/bin/env node
/**
 * 刺猬猫阅读排行榜采集脚本
 *
 * 配合 browser-cdp skill 使用。先启动 Chrome CDP 环境，再运行本脚本。
 * 采集策略：刺猬猫 rank-index 页面单页展示所有榜单，文本解析提取结构化数据。
 * 输出 Markdown 格式匹配 scan-output-format.md 规范。
 *
 * 用法：
 *   node ciweimao-rank-scraper.js --type click       # 点击榜
 *   node ciweimao-rank-scraper.js --type monthly      # 月票榜
 *   node ciweimao-rank-scraper.js --type all           # 全部榜单
 *
 * 前置：
 *   node {SKILL_DIR}/browser-cdp/scripts/setup-cdp-chrome.js 9222
 */

const fs = require("fs");
const path = require("path");
const { ab, sleep, evalJSON, scrollLoad, getArg } = require("./cdp-utils");

const RANK_URL = "https://www.ciweimao.com/rank-index";

const RANK_TYPES = [
  { id: "click", label: "点击榜", header: "点击榜" },
  { id: "favor", label: "收藏榜", header: "收藏榜" },
  { id: "recommend", label: "推荐榜", header: "推荐榜" },
  { id: "subscribe", label: "订阅榜", header: "订阅榜" },
  { id: "monthly", label: "月票榜", header: "月票榜" },
  { id: "tsukkomi", label: "吐槽榜", header: "吐槽榜" },
  { id: "newbook", label: "新书榜", header: "新书榜" },
  { id: "blade", label: "刀片榜", header: "刀片榜" },
  { id: "update", label: "更新榜", header: "更新榜" },
];

// ---------------------------------------------------------------------------
// 页面提取
// ---------------------------------------------------------------------------

/**
 * 从 rank-index 单页解析所有榜单。
 * 页面结构：每个榜单有标题行（如"点击榜"），后跟 NO.1 特殊条目 + #2-10 普通条目。
 * NO.1 格式：标题 / 作者 / 指标值（三行）
 * #2-10 格式：N[题材]书名 / 指标值（两行）
 */
function extractAllRanks(port) {
  const js =
    "JSON.stringify((()=>{" +
    "var text=document.body.innerText||'';" +
    "var lines=text.split(/\\n/).map(function(l){return l.trim()}).filter(Boolean);" +
    "var headers=['点击榜','收藏榜','推荐榜','订阅榜','月票榜','吐槽榜','新书榜','刀片榜','更新榜'];" +
    "var sections=[];var curName='';var curEntries=[];" +
    "for(var i=0;i<lines.length;i++){" +
    "  var line=lines[i];" +
    // 检测新 section
    "  var headerIdx=headers.indexOf(line);" +
    "  if(headerIdx>=0){" +
    "    if(curName&&curEntries.length)sections.push({name:curName,entries:curEntries});" +
    "    curName=headers[headerIdx];curEntries=[];continue" +
    "  }" +
    "  if(!curName)continue;" +
    // 跳过周期 tab 和 UI 文字
    "  if(/^(周榜|月榜|总榜)$/.test(line))continue;" +
    // NO.1 条目
    "  if(line==='NO.1'&&i+3<lines.length){" +
    "    var t=lines[i+1]||'';var a=lines[i+2]||'';var v=lines[i+3]||'';" +
    "    if(headers.indexOf(v)>=0)continue;" +
    "    curEntries.push({rank:1,title:t,author:a,genre:'',metric:v});" +
    "    i+=2;continue" +
    "  }" +
    // #2-10 条目：N[题材]书名
    "  var rm=line.match(/^(\\d{1,2})\\[(.+?)\\](.+)$/);" +
    "  if(rm){" +
    "    var nextVal=i+1<lines.length?lines[i+1]:'';" +
    "    var metric='';" +
    "    if(/^[\\d.]+(万)?$/.test(nextVal)){metric=nextVal;i++}" +
    "    curEntries.push({rank:parseInt(rm[1]),title:rm[3],author:'',genre:rm[2],metric:metric});" +
    "    continue" +
    "  }" +
    "}" +
    "if(curName&&curEntries.length)sections.push({name:curName,entries:curEntries});" +
    "return sections" +
    "})())";
  return evalJSON(port, js) || [];
}

/** 从 DOM 获取书籍链接（去重，含标题用于匹配） */
function extractBookUrls(port) {
  const js =
    "JSON.stringify((()=>{" +
    "var seen=new Set();var urls=[];" +
    "Array.from(document.querySelectorAll('a[href*=\"/book/\"]')).forEach(function(a){" +
    "var h=a.getAttribute('href')||a.href||'';" +
    "var m=h.match(/\\/book\\/(\\d+)/);" +
    "if(m&&!seen.has(m[1])){seen.add(m[1]);urls.push({bookId:m[1],title:a.textContent.trim(),url:'https://www.ciweimao.com/book/'+m[1]})}" +
    "});return urls" +
    "})())";
  return evalJSON(port, js) || [];
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const PORT = parseInt(getArg(args, "--port") || "9222", 10);
const OUTDIR = getArg(args, "--outdir") || ".";
const RANKTYPE = getArg(args, "--type") || "all";

function main() {
  console.log("\n→ 采集 刺猬猫排行榜...");
  console.log(`  URL: ${RANK_URL}`);

  ab(PORT, "open", RANK_URL);
  sleep(4000);
  scrollLoad(PORT, 3);
  sleep(1000);

  const sections = extractAllRanks(PORT);
  if (!sections.length) {
    console.log("  ⚠ 未提取到榜单数据");
    return;
  }

  const urls = extractBookUrls(PORT);
  console.log(`  ✓ 提取 ${sections.length} 个榜单，${urls.length} 个书籍链接`);

  // 筛选需要的榜单类型
  const targetTypes =
    RANKTYPE === "all"
      ? RANK_TYPES
      : RANK_TYPES.filter((r) => r.id === RANKTYPE);

  for (const rt of targetTypes) {
    const section = sections.find((s) => s.name === rt.header);
    if (!section || !section.entries.length) {
      console.log(`  ⚠ ${rt.label} 无数据，跳过`);
      continue;
    }

    const now = new Date().toISOString();
    const lines = [
      `# 刺猬猫 · ${rt.label}`,
      "",
      `- 来源：${RANK_URL}`,
      `- 抓取时间：${now}`,
      `- 条目数：${section.entries.length}`,
      "",
      "---",
      "",
    ];

    for (const entry of section.entries) {
      lines.push(`### #${entry.rank} ${entry.title}`);
      const meta = [
        entry.author,
        entry.genre,
        entry.metric || "",
      ].filter(Boolean).join(" · ");
      if (meta) lines.push(`*${meta}*`);

      // 按标题匹配书籍链接
      const matched = urls.find((u) => u.title === entry.title);
      if (matched) {
        lines.push(`[作品页](${matched.url})`);
      }

      lines.push("", "---", "");
    }

    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const filename = `刺猬猫${rt.label}_${date}.md`;
    const filepath = path.join(OUTDIR, filename);
    fs.writeFileSync(filepath, lines.join("\n"), "utf-8");
    console.log(`  ✓ ${rt.label}：${section.entries.length} 条 → ${filepath}`);
  }
}

main();
