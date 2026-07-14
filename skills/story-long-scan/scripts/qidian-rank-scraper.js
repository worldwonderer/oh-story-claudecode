#!/usr/bin/env node
/**
 * 起点中文网 排行榜采集脚本
 *
 * 配合 browser-cdp skill 使用。先启动 Chrome CDP 环境，再运行本脚本。
 * 采集策略：
 *   1. 默认优先读取 m.qidian.com 的 SSR pageContext JSON（不依赖 CDP，规避 PC 站风控页）。
 *   2. 移动端不可用时再回退到 Chrome CDP 采集 PC 页面。
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
 *   node qidian-rank-scraper.js --type hotsales --mode mobile  # 仅使用移动端 SSR
 *   node qidian-rank-scraper.js --type hotsales --mode cdp     # 仅使用备用 CDP/PC 页面
 *
 * 前置：
 *   默认 mobile/auto 模式不需要 Chrome。
 *   cdp 模式需要：node {SKILL_DIR}/browser-cdp/scripts/setup-cdp-chrome.js 9222
 */

const fs = require("fs");
const https = require("https");
const path = require("path");
const { ab, sleep, evalJSON, scrollLoad, getArg, runCli } = require("./cdp-utils");

const PC_BASE_URL = "https://www.qidian.com/rank";
const MOBILE_BASE_URL = "https://m.qidian.com";

/** 验证码自动重试最大次数 */
const MAX_CAPTCHA_RETRIES = 3;
/** 等待用户手动解决验证码的最大秒数 */
const MAX_CAPTCHA_WAIT_SEC = 120;
/** 轮询验证码是否解除的间隔（毫秒） */
const CAPTCHA_POLL_INTERVAL = 5000;

const MOBILE_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) " +
    "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
  "Accept-Encoding": "identity",
};

const RANK_TYPES = [
  { id: "hotsales", label: "畅销榜", mobilePath: "/rank/hotsales/" },
  { id: "yuepiao", label: "月票榜", mobilePath: "/rank/yuepiao/" },
  {
    id: "signnewbook",
    label: "签约作者新书榜",
    mobilePath: "/rank/sign/",
    mobileLabel: "签约榜",
  },
  {
    id: "pubnewbook",
    label: "公众作者新书榜",
    mobilePath: "/rank/newbook/",
    mobileLabel: "新书榜",
  },
  { id: "newauthor", label: "新人作者新书榜", mobilePath: "/rank/newauthor/", mobileLabel: "新人榜" },
  {
    id: "newsign",
    label: "新人签约新书榜",
    mobilePath: "/rank/sign/",
    mobileLabel: "签约榜",
  },
  { id: "recom", label: "原创推荐榜", mobilePath: "/rank/rec/", mobileLabel: "推荐榜" },
  { id: "readindex", label: "阅读指数榜", mobilePath: "/rank/readindex/" },
  {
    id: "collect",
    label: "收藏榜",
    mobilePath: "/rank/newfans/",
    mobileLabel: "书友榜（移动端替代）",
  },
  {
    id: "sanjiang",
    label: "三江推荐",
    baseUrl: "https://www.qidian.com/sanjiang/",
    mobilePath: "/sanjiang/",
  },
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

/**
 * 检测当前页面是否被验证码/安全验证拦截。
 * 起点常见拦截页面特征：页面中出现验证码关键词，或页面缺少榜单 DOM 元素。
 * @returns {{ blocked: boolean, reason: string } | null} 若被拦截返回原因对象，否则 null
 */
function isCaptchaPage(port) {
  const js =
    "JSON.stringify((()=>{" +
    "var bodyText=document.body?(document.body.innerText||'').substring(0,3000):'';" +
    "var lower=bodyText.toLowerCase();" +
    "var keywords=['验证','captcha','verify','安全验证','滑块','拖动','请完成验证'," +
    "'混元','人机验证','异常请求','访问验证','操作频繁','请求过于频繁','waf','请稍后再试'];" +
    "for(var i=0;i<keywords.length;i++){" +
    "  if(lower.indexOf(keywords[i])>-1){" +
    "    return {blocked:true,reason:keywords[i]};" +
    "  }" +
    "}" +
    "var hasContent=document.querySelector('.book-img-text ul li,.rank-body,.rank-list,.book-img-text');" +
    "if(!hasContent){" +
    "  return {blocked:true,reason:'页面无榜单内容(可能被拦截)'};" +
    "}" +
    "return {blocked:false,reason:''};" +
    "})())";
  const result = evalJSON(port, js);
  return result && result.blocked === true ? result : null;
}

/**
 * 打开 URL 并等待页面加载，自动处理验证码拦截。
 * 重试策略：
 *   1. 正常加载页面
 *   2. 检测到验证码 → 等待递增延时后刷新重试（最多 MAX_CAPTCHA_RETRIES 次）
 *   3. 仍被拦截 → 提示用户在 Chrome CDP 窗口手动完成验证，轮询等待直到解除或超时
 *
 * @returns {boolean} true=页面已就绪，false=无法通过验证码
 */
function openWithCaptchaHandling(port, url) {
  for (let attempt = 1; attempt <= MAX_CAPTCHA_RETRIES; attempt++) {
    ab(port, "open", url);
    // 首次 3 秒，后续每次多等 2 秒
    sleep(3000 + (attempt - 1) * 2000);

    const captcha = isCaptchaPage(port);
    if (!captcha) {
      return true;
    }
    console.log(`  ⚠ 检测到安全拦截 (${captcha.reason})，第 ${attempt}/${MAX_CAPTCHA_RETRIES} 次重试...`);
    // 递增等待后再次尝试
    sleep(attempt * 5000);
  }

  // 自动重试全部失败 → 等待用户手动处理
  console.log(`  ⚠ 自动重试未通过验证码，请在 Chrome CDP 窗口手动完成验证`);
  console.log(`  ⏳ 等待手动验证（最长 ${MAX_CAPTCHA_WAIT_SEC} 秒）...`);

  const startTime = Date.now();
  while (Date.now() - startTime < MAX_CAPTCHA_WAIT_SEC * 1000) {
    sleep(CAPTCHA_POLL_INTERVAL);
    // 刷新页面检查验证码是否已解除
    ab(port, "open", url);
    sleep(3000);
    const captcha = isCaptchaPage(port);
    if (!captcha) {
      console.log(`  ✓ 验证码已解除，继续采集`);
      return true;
    }
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    process.stdout.write(`  等待中... (${elapsed}s)\r`);
  }
  console.log(`  ✗ 等待超时，验证码仍未解除`);
  return false;
}

// ---------------------------------------------------------------------------
// 移动端 SSR 提取（默认路径）
// ---------------------------------------------------------------------------

function mobileUrl(pathname) {
  if (!pathname) return "";
  return pathname.startsWith("http") ? pathname : `${MOBILE_BASE_URL}${pathname}`;
}

function fetchText(url, redirects = 3) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: MOBILE_HEADERS, timeout: 15000 }, (res) => {
      if (
        redirects > 0 &&
        res.statusCode >= 300 &&
        res.statusCode < 400 &&
        res.headers.location
      ) {
        res.resume();
        const nextUrl = new URL(res.headers.location, url).toString();
        fetchText(nextUrl, redirects - 1).then(resolve, reject);
        return;
      }

      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        resolve(body);
      });
    });

    req.on("timeout", () => {
      req.destroy(new Error("request timeout"));
    });
    req.on("error", reject);
  });
}

function extractMobilePageContext(html) {
  const m = html.match(
    /<script[^>]+id=["']vite-plugin-ssr_pageContext["'][^>]*>([\s\S]*?)<\/script>/i
  );
  if (!m) return null;
  try {
    return JSON.parse(m[1]);
  } catch (e) {
    console.log(`  ⚠ 移动端 pageContext JSON 解析失败: ${e.message}`);
    return null;
  }
}

function normalizeMobileBook(record, idx) {
  const title = record.bName || record.bookName || "";
  const bid = record.bid || record.bookId || "";
  const genre = [record.cat, record.subCat].filter(Boolean).join("·");
  const stats = [];
  if (record.cnt) stats.push(record.cnt);
  if (record.rankCnt) stats.push(`榜单值 ${record.rankCnt}`);

  return {
    rank: record.rankNum || idx + 1,
    title,
    url: bid ? `${MOBILE_BASE_URL}/book/${bid}/` : "",
    author: record.bAuth || record.author || "",
    genre,
    status: stats.join(" · "),
    descText: record.desc || "",
    updateText: "",
  };
}

function renderMarkdown(rt, books, url, sourceMode, extraLines = []) {
  const now = new Date().toISOString();
  const lines = [
    `# 起点 · ${rt.label}`,
    "",
    `- 来源：${url}`,
    `- 抓取方式：${sourceMode}`,
    `- 抓取时间：${now}`,
    `- 条目数：${books.length}`,
    ...extraLines,
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

async function scrapeRankMobile(rankTypeId) {
  const rt = RANK_TYPES.find((r) => r.id === rankTypeId);
  if (!rt) {
    console.log(`  ⚠ 未知榜单类型: ${rankTypeId}`);
    return null;
  }
  if (!rt.mobilePath) {
    console.log(`  ⚠ 榜单 ${rankTypeId} 暂无移动端 SSR 路径`);
    return null;
  }

  const url = mobileUrl(rt.mobilePath);
  console.log(`\n→ 采集 起点${rt.label}（移动端 SSR）...`);
  console.log(`  URL: ${url}`);

  const html = await fetchText(url);
  const pageContext = extractMobilePageContext(html);
  const pageData = pageContext?.pageContext?.pageProps?.pageData;
  const records = pageData?.records || [];
  const books = records.map(normalizeMobileBook).filter((b) => b.title);

  if (!books.length) {
    console.log("  ⚠ 移动端 SSR 未提取到书籍");
    return null;
  }

  console.log(`  ✓ 提取 ${books.length} 本`);

  const extraLines = [];
  if (rt.mobileLabel && rt.mobileLabel !== rt.label) {
    extraLines.push(`- 移动端实际榜单：${rt.mobileLabel}`);
  }
  if (FETCH_DETAIL) {
    extraLines.push("- 说明：移动端 SSR 已包含简介；--detail 在 mobile/auto 模式下不会额外打开详情页。");
  }

  return renderMarkdown(rt, books, url, "mobile-ssr", extraLines);
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const PORT = parseInt(getArg(args, "--port") || "9222", 10);
const OUTDIR = getArg(args, "--outdir") || ".";
const RANKTYPE = getArg(args, "--type") || "hotsales";
const SCRAPE_MODE = getArg(args, "--mode") || "auto"; // auto | mobile | cdp
const FETCH_DETAIL = (getArg(args, "--detail") || "no") === "yes";

function scrapeRankCDP(port, rankTypeId) {
  const rt = RANK_TYPES.find((r) => r.id === rankTypeId);
  if (!rt) {
    console.log(`  ⚠ 未知榜单类型: ${rankTypeId}`);
    return null;
  }

  const url = rt.baseUrl || `${PC_BASE_URL}/${rankTypeId}/`;
  console.log(`\n→ 采集 起点${rt.label}（CDP/PC）...`);
  console.log(`  URL: ${url}`);

  const pageReady = openWithCaptchaHandling(port, url);
  if (!pageReady) {
    console.log("  ✗ 起点采集失败：页面无法通过验证码拦截");
    return null;
  }

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

  return renderMarkdown(rt, books, url, "cdp-pc");
}

async function scrapeRank(rankTypeId) {
  if (!["auto", "mobile", "cdp"].includes(SCRAPE_MODE)) {
    throw new Error(`未知 --mode: ${SCRAPE_MODE}（可选 auto/mobile/cdp）`);
  }

  if (SCRAPE_MODE !== "cdp") {
    try {
      const content = await scrapeRankMobile(rankTypeId);
      if (content || SCRAPE_MODE === "mobile") return content;
    } catch (e) {
      console.log(`  ⚠ 移动端 SSR 采集失败: ${e.message}`);
      if (SCRAPE_MODE === "mobile") return null;
    }
  }

  if (SCRAPE_MODE !== "mobile") {
    console.log("  → 回退到 CDP/PC 页面采集");
    return scrapeRankCDP(PORT, rankTypeId);
  }

  return null;
}

async function main() {
  const rankTypes = RANKTYPE === "all" ? RANK_TYPES.map((r) => r.id) : [RANKTYPE];
  let written = 0;

  for (const rt of rankTypes) {
    const content = await scrapeRank(rt);
    if (!content) continue;

    const rtInfo = RANK_TYPES.find((r) => r.id === rt);
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const filename = `起点${rtInfo.label}_${date}.md`;
    fs.mkdirSync(OUTDIR, { recursive: true });
    const filepath = path.join(OUTDIR, filename);
    fs.writeFileSync(filepath, content, "utf-8");
    written++;
    console.log(`  ✓ 已保存: ${filepath}`);
  }
  return written;
}

if (require.main === module) {
  runCli(main, "起点采集");
}

module.exports = {
  extractBookList,
  mobileUrl,
  extractMobilePageContext,
  normalizeMobileBook,
  renderMarkdown,
};
