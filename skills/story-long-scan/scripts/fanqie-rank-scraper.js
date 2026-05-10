#!/usr/bin/env node
/**
 * 番茄小说排行榜采集脚本
 *
 * 配合 browser-cdp skill 使用。先启动 Chrome CDP 环境，再运行本脚本。
 * 采集策略：从页面 __INITIAL_STATE__ 提取结构化数据，通过 fetch 获取真实标题。
 * 输出 Markdown 格式匹配 scan-output-format.md 规范。
 *
 * 用法：
 *   node fanqie-rank-scraper.js --channel 1 --type 2              # 男频阅读榜
 *   node fanqie-rank-scraper.js --channel 0 --type 1              # 女频新书榜
 *   node fanqie-rank-scraper.js --channel 1 --type 2 --outdir ./  # 指定输出目录
 *   node fanqie-rank-scraper.js --channel all                     # 全部采集
 *
 * 前置：
 *   node {SKILL_DIR}/browser-cdp/scripts/setup-cdp-chrome.js 9222
 */

const fs = require("fs");
const path = require("path");
const { ab, sleep, evalJSON, scrollLoad, getArg } = require("./cdp-utils");

const FANQIE_CATEGORIES = {
  "1": [
    { name: "西方奇幻", catId: "1141" },
    { name: "东方仙侠", catId: "1140" },
    { name: "科幻末世", catId: "8" },
    { name: "都市日常", catId: "261" },
    { name: "都市修真", catId: "124" },
    { name: "都市高武", catId: "1014" },
    { name: "历史古代", catId: "273" },
    { name: "战神赘婿", catId: "27" },
    { name: "都市种田", catId: "263" },
    { name: "传统玄幻", catId: "258" },
    { name: "历史脑洞", catId: "272" },
    { name: "悬疑脑洞", catId: "539" },
    { name: "都市脑洞", catId: "262" },
    { name: "玄幻脑洞", catId: "257" },
    { name: "悬疑灵异", catId: "751" },
    { name: "抗战谍战", catId: "504" },
    { name: "游戏体育", catId: "746" },
    { name: "动漫衍生", catId: "718" },
    { name: "男频衍生", catId: "1016" },
  ],
  "0": [
    { name: "古风世情", catId: "1139" },
    { name: "科幻末世", catId: "8" },
    { name: "游戏体育", catId: "746" },
    { name: "女频衍生", catId: "1015" },
    { name: "玄幻言情", catId: "248" },
    { name: "种田", catId: "23" },
    { name: "年代", catId: "79" },
    { name: "现言脑洞", catId: "267" },
    { name: "宫斗宅斗", catId: "246" },
    { name: "悬疑脑洞", catId: "539" },
    { name: "古言脑洞", catId: "253" },
    { name: "快穿", catId: "24" },
    { name: "青春甜宠", catId: "749" },
    { name: "星光璀璨", catId: "745" },
    { name: "女频悬疑", catId: "747" },
    { name: "职场婚恋", catId: "750" },
    { name: "豪门总裁", catId: "748" },
    { name: "民国言情", catId: "1017" },
  ],
};

// ---------------------------------------------------------------------------
// 页面提取
// ---------------------------------------------------------------------------

/** 提取侧边菜单品类链接 */
function extractCategories(port, channel, type) {
  const prefix = `/rank/${channel}_${type}_`;
  const js = "JSON.stringify(Array.from(document.querySelectorAll('a[href]')).map(a=>({href:a.getAttribute('href'),name:(a.innerText||a.textContent||'').trim()})).filter(x=>x.href&&x.href.indexOf('" + prefix + "')===0&&x.name).filter((x,i,arr)=>arr.findIndex(y=>y.href===x.href)===i))";
  const extracted = evalJSON(port, js) || [];
  if (extracted.length) return extracted;
  return (FANQIE_CATEGORIES[channel] || []).map((x) => ({
    name: x.name,
    href: `/rank/${channel}_${type}_${x.catId}`,
  }));
}

/** 从 __INITIAL_STATE__ 提取当前品类页的作品数据 */
function extractBookList(port) {
  const candidates = [
    "JSON.stringify(window.__INITIAL_STATE__?.rank?.book_list||[])",
    "JSON.stringify(window.__INITIAL_STATE__?.rank?.readRankList||[])",
    "JSON.stringify(window.__INITIAL_STATE__?.rank?.newRankList||[])",
  ];
  for (let i = 0; i < 4; i++) {
    for (const js of candidates) {
      const list = evalJSON(port, js);
      if (Array.isArray(list) && list.length) return list;
    }
    sleep(1500);
  }
  return [];
}

/** 批量获取真实书名、作者和简介：用同步 XHR 请求详情页解析 */
function fetchRealTitles(port, bookIds) {
  if (!bookIds.length) return {};
  const ids = JSON.stringify(bookIds);
  const js = "JSON.stringify((()=>{const map={};var ids=" + ids + ";ids.forEach(function(id){try{var x=new XMLHttpRequest();x.open('GET','/page/'+id,false);x.send();var tm=x.responseText.match(/<title>([^<]+?)完整版/);var am=x.responseText.match(/\"author\":\"([^\"]+)\"/);var dm=x.responseText.match(/<meta\\s+name=\"description\"\\s+content=\"([^\"]+)\"/);if(!dm)dm=x.responseText.match(/\"abstract\":\"([^\"]{10,}?)\"/);map[id]={title:tm?tm[1]:'',author:am?am[1]:'',desc:dm?dm[1]:''}}catch(e){map[id]={title:'',author:'',desc:''}}});return map})())";
  return evalJSON(port, js) || {};
}

/** 格式化在读数 */
function fmtReads(count) {
  if (!count || count === "0") return "未知";
  const n = parseInt(count, 10);
  if (n >= 10000) return (n / 10000).toFixed(1) + "万";
  return String(n);
}

/** 格式化字数 */
function fmtWords(count) {
  if (!count) return "未知";
  const n = parseInt(count, 10);
  if (n >= 10000) return (n / 10000).toFixed(1) + "万";
  return String(n);
}

/** 格式化状态 */
function fmtStatus(s) {
  if (s === "1") return "连载中";
  if (s === "0" || s === "2") return "已完结";
  return s || "未知";
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const PORT = parseInt(getArg(args, "--port") || "9222", 10);
const OUTDIR = getArg(args, "--outdir") || ".";
const CHANNEL = getArg(args, "--channel") || "1";
const TYPE = getArg(args, "--type") || "2";

function channelLabel(ch) {
  return ch === "1" ? "男频" : "女频";
}

function typeLabel(t) {
  return t === "2" ? "阅读榜" : "新书榜";
}

function scrapeChannel(ch, type) {
  const chLabel = channelLabel(ch);
  const tyLabel = typeLabel(type);
  console.log(`\n→ 采集 ${chLabel}${tyLabel}...`);

  // 用已知品类 ID 作为入口，确保菜单只显示当前频道/类型的品类
  const initCatId = ch === "1" ? "1141" : "1139"; // 男频:西方奇幻 / 女频:古风世情
  const initUrl = `https://fanqienovel.com/rank/${ch}_${type}_${initCatId}`;
  ab(PORT, "open", initUrl);
  sleep(3000);

  const categories = extractCategories(PORT, ch, type);
  if (!categories.length) {
    console.log(`  ⚠ 未提取到品类，跳过`);
    return null;
  }
  console.log(`  发现 ${categories.length} 个品类`);

  const now = new Date().toISOString();
  const lines = [
    `# 番茄 · ${chLabel}${tyLabel} · 全 ${categories.length} 题材`,
    "",
    `- 频道参数：channel=${ch}，type=${type}`,
    `- 抓取时间：${now}`,
    `- 每题材上限 ≈ 20`,
    "",
    "---",
    "",
  ];

  for (let ci = 0; ci < categories.length; ci++) {
    const cat = categories[ci];
    console.log(`  [${ci + 1}/${categories.length}] ${cat.name}`);

    ab(PORT, "open", `https://fanqienovel.com${cat.href}`);
    sleep(4000);

    const books = extractBookList(PORT);
    if (!Array.isArray(books) || !books.length) {
      lines.push(`## ${cat.name} — 0 本`, "", "---", "");
      continue;
    }

    // 批量获取真实标题
    const bookIds = books.map((b) => String(b.bookId));
    const titles = fetchRealTitles(PORT, bookIds);

    lines.push(`## ${cat.name} — ${books.length} 本`, "");

    for (let i = 0; i < books.length; i++) {
      const b = books[i];
      const info = titles[String(b.bookId)] || {};
      const title = info.title || `bookId:${b.bookId}`;
      const author = info.author || "未知";
      lines.push(`### #${i + 1} ${title}`);
      lines.push(
        `*${author} · ${fmtStatus(b.creationStatus)} · ${fmtReads(b.read_count)} 在读 · ${fmtWords(b.wordNumber)}字*`
      );
      lines.push(`**最新更新：** ${b.lastChapterTitle || "未知"}`);
      lines.push(`[作品页](https://fanqienovel.com/page/${b.bookId})`);
      if (info.desc) {
        lines.push("");
        lines.push("**简介**");
        lines.push("");
        lines.push(info.desc);
      }
      lines.push("");
    }

    lines.push("---", "");
  }

  return lines.join("\n");
}

function main() {
  const channels = CHANNEL === "all" ? ["1", "0"] : [CHANNEL];
  const types = TYPE === "all" ? ["2", "1"] : [TYPE];

  for (const ch of channels) {
    for (const ty of types) {
      const content = scrapeChannel(ch, ty);
      if (!content) continue;

      const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const filename = `番茄${channelLabel(ch)}${typeLabel(ty)}_全题材_${date}.md`;
      const filepath = path.join(OUTDIR, filename);
      fs.writeFileSync(filepath, content, "utf-8");
      console.log(`  ✓ 已保存: ${filepath}`);
    }
  }
}

main();
