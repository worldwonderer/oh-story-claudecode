#!/usr/bin/env node
/**
 * 七猫小说排行榜采集脚本
 *
 * 配合 browser-cdp skill 使用。先启动 Chrome CDP 环境，再运行本脚本。
 * 采集策略：tab 切换男生榜/女生榜和榜单类型，滚动加载后从页面文本解析结构化数据。
 * 输出 Markdown 格式匹配 scan-output-format.md 规范。
 *
 * 用法：
 *   node qimao-rank-scraper.js --channel male --type hot       # 男生大热榜
 *   node qimao-rank-scraper.js --channel female --type new      # 女生新书榜
 *   node qimao-rank-scraper.js --channel all --type all         # 全部采集
 *
 * 前置：
 *   node {SKILL_DIR}/browser-cdp/scripts/setup-cdp-chrome.js 9222
 */

const fs = require("fs");
const path = require("path");
const { ab, sleep, evalJSONBase64, safeStr, scrollLoad, getArg, runCli } = require("./cdp-utils");

const RANK_URL = "https://www.qimao.com/paihang";

/** 连通性 + 页面就绪自检 */
function probePage(port) {
  return evalJSONBase64(
    port,
    "JSON.stringify({host:location.host,len:(document.body&&document.body.innerText||'').length})"
  );
}

const CHANNELS = [
  { id: "male", label: "男频", tab: "男生" },
  { id: "female", label: "女频", tab: "女生" },
];

const RANK_TYPES = [
  { id: "hot", label: "大热榜" },
  { id: "new", label: "新书榜" },
  { id: "finish", label: "完结榜" },
  { id: "collect", label: "收藏榜" },
  { id: "update", label: "更新榜" },
];

// ---------------------------------------------------------------------------
// 页面操作
// ---------------------------------------------------------------------------

/** 点击包含指定文本的 tab 元素 */
function clickTab(port, text) {
  const js =
    "JSON.stringify((()=>{" +
    "var all=document.querySelectorAll('div,span,a,button,li');" +
    "var el=Array.from(all).find(function(e){" +
    "var t=e.textContent.trim();" +
    "return t===" + safeStr(text) + "||t===" + safeStr(text + "榜") +
    "});" +
    "if(el){el.click();return true}return false" +
    "})())";
  return evalJSONBase64(port, js);
}

/** 点 tab，失败后等一拍重试一次（tab 异步渲染可能滞后） */
function clickTabRetry(port, text) {
  if (clickTab(port, text)) return true;
  sleep(1500);
  return !!clickTab(port, text);
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

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const PORT = parseInt(getArg(args, "--port") || "9222", 10);
const OUTDIR = getArg(args, "--outdir") || ".";
const CHANNEL = getArg(args, "--channel") || "male";
const RANKTYPE = getArg(args, "--type") || "hot";

function scrapeRank(port, channelId, rankTypeId) {
  const ch = CHANNELS.find((c) => c.id === channelId);
  const rt = RANK_TYPES.find((r) => r.id === rankTypeId);
  if (!ch || !rt) {
    console.log("  ⚠ 未知频道或榜单类型");
    return null;
  }

  console.log(`\n→ 采集 七猫${ch.label}${rt.label}...`);

  let books, urls;
  try {
    ab(port, "open", RANK_URL);
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

    // 切换频道 tab（tab 渲染可能滞后，失败重试一次）
    if (!clickTabRetry(port, ch.tab)) {
      console.log(`  ⚠ 未找到「${ch.tab}」tab`);
      return null;
    }
    console.log(`  ✓ 切换到${ch.tab}频`);
    sleep(2000);

    // 切换榜单类型 tab
    if (!clickTabRetry(port, rt.label)) {
      console.log(`  ⚠ 未找到「${rt.label}」tab`);
      return null;
    }
    console.log(`  ✓ 切换到${rt.label}`);
    sleep(2000);

    // 滚动加载更多
    scrollLoad(port, 5);
    sleep(1000);

    // 文本解析获取书籍数据 + DOM 获取链接
    books = extractBooksFromText(port);
    urls = extractBookUrls(port);
  } catch (err) {
    console.error(`[qimao] ${ch.label}${rt.label} 页面加载或提取出错: ${err.message}`);
    return null;
  }

  if (!books.length) {
    console.error(`[qimao] 采集失败：页面结构可能已变（选择器没匹配到数据），请检查榜单URL或更新选择器 (${RANK_URL} ${ch.label}${rt.label})`);
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

  const linked = books.filter((b) => b.url).length;
  const heated = books.filter((b) => b.heat).length;
  console.log(`  ✓ 提取 ${books.length} 本（链接 ${linked}/${books.length}，热度 ${heated}/${books.length}）`);

  const now = new Date().toISOString();
  const lines = [
    `# 七猫 · ${ch.label} · ${rt.label}`,
    "",
    `- 作品页链接：${linked} / ${books.length}`,
    `- 热度命中：${heated} / ${books.length}`,
    `- 来源：${RANK_URL}`,
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
        b.author,
        b.genre,
        b.subGenre,
        b.status,
        b.words,
        b.heat ? b.heat + "热度" : "",
      ]
        .filter(Boolean)
        .join(" · ");
      lines.push(`*${meta}*`);
      if (b.update) lines.push(`**最新更新：** ${b.update}`);
      if (b.url) lines.push(`[作品页](${b.url})`);
      if (b.desc) {
        lines.push("");
        lines.push("**简介**");
        lines.push("");
        lines.push(b.desc);
      }
      lines.push("", "---", "");
    } catch (bookErr) {
      console.error(`[qimao] ${ch.label}${rt.label} 第${b.rank}条处理出错: ${bookErr.message}`);
      lines.push("", "---", "");
    }
  }

  return lines.join("\n");
}

function main() {
  const channels = CHANNEL === "all" ? CHANNELS.map((c) => c.id) : [CHANNEL];
  const rankTypes = RANKTYPE === "all" ? RANK_TYPES.map((r) => r.id) : [RANKTYPE];
  let written = 0;

  for (const ch of channels) {
    for (const rt of rankTypes) {
      const content = scrapeRank(PORT, ch, rt);
      if (!content) continue;

      const chInfo = CHANNELS.find((c) => c.id === ch);
      const rtInfo = RANK_TYPES.find((r) => r.id === rt);
      const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const filename = `七猫${chInfo.label}${rtInfo.label}_${date}.md`;
      fs.mkdirSync(OUTDIR, { recursive: true });
      const filepath = path.join(OUTDIR, filename);
      fs.writeFileSync(filepath, content, "utf-8");
      written++;
      console.log(`  ✓ 已保存: ${filepath}`);
    }
  }
  return written;
}

if (require.main === module) {
  runCli(main, "七猫采集");
}

module.exports = { extractBooksFromText };
