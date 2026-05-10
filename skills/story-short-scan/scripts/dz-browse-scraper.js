#!/usr/bin/env node
/**
 * 点众阅读短篇采集脚本
 *
 * 配合 browser-cdp skill 使用。先启动 Chrome CDP 环境，再运行本脚本。
 * 采集策略：从 ishugui.com/browse 页面提取短篇故事列表（含评分/简介/字数）。
 * 输出 Markdown 格式。
 *
 * 用法：
 *   node dz-browse-scraper.js --channel male              # 男频
 *   node dz-browse-scraper.js --channel female             # 女频
 *   node dz-browse-scraper.js --channel all                # 全部
 *
 * 前置：
 *   node {SKILL_DIR}/browser-cdp/scripts/setup-cdp-chrome.js 9222
 */

const fs = require("fs");
const path = require("path");
const { ab, sleep, evalJSON, safeStr, scrollLoad, getArg } = require("./cdp-utils");

const BROWSE_URL = "https://www.ishugui.com/browse";

const CHANNELS = [
  { id: "male", label: "男频", tab: "男频", url: "https://www.ishugui.com/browse" },
  { id: "female", label: "女频", tab: "女频", url: "https://www.ishugui.com/browse/on3" },
];

// ---------------------------------------------------------------------------
// 页面提取
// ---------------------------------------------------------------------------

/** 点击指定文本的 tab */
function clickTab(port, text) {
  const js =
    "JSON.stringify((()=>{" +
    "var all=document.querySelectorAll('div,span,a,button,li');" +
    "var el=Array.from(all).find(function(e){return e.textContent.trim()===" + safeStr(text) + "});" +
    "if(el){el.click();return true}return false" +
    "})())";
  return evalJSON(port, js);
}

/**
 * 从 browse 页面解析故事列表。
 * 每个故事卡片包含：标题、评分、简介、作者·标签·状态·字数、最新章节
 */
function extractStories(port) {
  const js =
    "JSON.stringify((()=>{" +
    "var items=[];" +
    // 点众页面故事卡片结构：标题 + 评分 + 简介 + 元数据行 + 最新章节
    // 尝试用固定选择器定位
    "var cards=document.querySelectorAll('.book-list-item,.story-item,.book-item,[class*=\"book-card\"],[class*=\"story-card\"]');" +
    "if(!cards.length){" +
    // 兜底：找到所有评分标记（X.X分），向上找容器
    "  var scores=document.querySelectorAll('[class*=\"score\"],[class*=\"rating\"]');" +
    "  if(scores.length){" +
    "    scores.forEach(function(s,idx){" +
    "      var el=s;" +
    "      for(var j=0;j<5;j++){if(el.parentElement)el=el.parentElement}" +
    "      var text=el.innerText||'';" +
    "      items.push({rank:idx+1,raw:text.replace(/\\s+/g,' ').trim().substring(0,500)})" +
    "    });" +
    "    return items" +
    "  }" +
    // 最终兜底：用文本解析
    "  return null" +
    "}" +
    "cards.forEach(function(card,idx){" +
    "  var text=card.innerText||'';" +
    "  items.push({rank:idx+1,raw:text.replace(/\\s+/g,' ').trim().substring(0,500)})" +
    "});" +
    "return items" +
    "})())";
  return evalJSON(port, js);
}

/**
 * 文本解析模式：从页面整体文本解析故事条目。
 * 点众故事格式：
 *   {书名}
 *   {X.X分}
 *   {简介文本}
 *   {作者} · {标签} · {状态} · {XXXX字}
 *   最新章节: 第X章 {日期}
 */
function extractStoriesFromText(port) {
  const js =
    "JSON.stringify((()=>{" +
    "var text=document.body.innerText||'';" +
    "var scoreIdx=text.indexOf('分');" +
    "if(scoreIdx<0)return[];" +
    "var filters=['全部','玄幻','仙侠','科幻','历史','都市','游戏','悬疑','故事','脑洞','同人衍生','连载','完本'];" +
    "var lines=text.split(/\\n/).map(function(l){return l.trim()}).filter(Boolean);" +
    "var stories=[];var cur=null;var prevLine='';" +
    "for(var i=0;i<lines.length;i++){" +
    "  var line=lines[i];" +
    // 评分行作为条目起始：X.X分
    "  var sm=line.match(/^([\\d.]+)分$/);" +
    "  if(sm){" +
    "    if(cur&&cur.title)stories.push(cur);" +
    "    cur={score:sm[1]+'分',title:prevLine,author:'',tag:'',status:'',words:'',desc:'',update:''};" +
    "    prevLine='';continue" +
    "  }" +
    // 元数据行：作者 · 标签 · 状态 · 字数
    "  var metaM=line.match(/^(.+?)\\s*·\\s*(.+?)\\s*·\\s*(完结|连载)\\s*·\\s*([\\d]+字)$/);" +
    "  if(metaM&&cur){" +
    "    cur.author=metaM[1];cur.tag=metaM[2];cur.status=metaM[3];cur.words=metaM[4];continue" +
    "  }" +
    // 最新章节
    "  if(line.indexOf('最新章节')===0){" +
    "    if(cur)cur.update=line.replace(/^最新章节[:\\s]*/,'');continue" +
    "  }" +
    // 跳过 UI 文字
    "  if(filters.indexOf(line)>=0)continue;" +
    "  if(/^(首页|分类|排行榜|下载|手机版|男频|女频|字数|状态)/.test(line))continue;" +
    "  if(line.length>300)continue;" +
    // 如果有当前条目且未填过 desc，填入简介
    "  if(cur&&cur.title&&!cur.author){" +
    "    if(!cur.desc)cur.desc=line.substring(0,200);" +
    "  }" +
    "  prevLine=line" +
    "}" +
    "if(cur&&cur.title)stories.push(cur);" +
    // 兜底：用评分标记分割
    "if(!stories.length){" +
    "  var parts=text.split(/([\\d.]+分)/);" +
    "  for(var p=1;p<parts.length-1;p+=2){" +
    "    var score=parts[p];" +
    "    var after=(parts[p+1]||'').substring(0,300).trim();" +
    "    if(after)stories.push({score:score,desc:after.replace(/\\n/g,' ').trim().substring(0,300)})" +
    "  }" +
    "}" +
    "return stories" +
    "})())";
  return evalJSON(port, js) || [];
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const PORT = parseInt(getArg(args, "--port") || "9222", 10);
const OUTDIR = getArg(args, "--outdir") || ".";
const CHANNEL = getArg(args, "--channel") || "male";

function scrapeChannel(port, channelId) {
  const ch = CHANNELS.find((c) => c.id === channelId);
  if (!ch) return null;

  console.log(`\n→ 采集 点众${ch.label}短篇...`);

  ab(port, "open", ch.url);
  sleep(3000);

  // 切换频道
  if (clickTab(port, ch.tab)) {
    console.log(`  ✓ 切换到${ch.tab}`);
    sleep(2000);
  }

  // 滚动加载更多
  scrollLoad(port, 8);
  sleep(1000);

  // 优先使用文本解析（返回完整字段），DOM 仅作兜底
  let stories = extractStoriesFromText(port);
  if (!stories.length) {
    const domStories = extractStories(port);
    if (domStories) {
      // DOM 返回 {rank, raw}，解析 raw 文本提取字段
      stories = domStories.map((d) => {
        const raw = d.raw || "";
        const scoreM = raw.match(/([\d.]+)分/);
        const metaM = raw.match(/(.+?)·(.+?)·(完结|连载)·([\d]+字)/);
        const updateM = raw.match(/最新章节[:\s]*(.+)/);
        const parts = raw.split(/[\s·]+/).filter(Boolean);
        return {
          title: parts[0] || "",
          score: scoreM ? scoreM[1] + "分" : "",
          author: metaM ? metaM[1].trim() : "",
          tag: metaM ? metaM[2].trim() : "",
          status: metaM ? metaM[3] : "",
          words: metaM ? metaM[4] : "",
          update: updateM ? updateM[1] : "",
          desc: "",
        };
      });
    }
  }

  if (!stories.length) {
    console.log("  ⚠ 未提取到故事");
    return null;
  }
  console.log(`  ✓ 提取 ${stories.length} 条`);

  const now = new Date().toISOString();
  const lines = [
    `# 点众 · ${ch.label}短篇`,
    "",
    `- 来源：${ch.url}`,
    `- 抓取时间：${now}`,
    `- 条目数：${stories.length}`,
    "",
    "---",
    "",
  ];

  stories.forEach((s, i) => {
    lines.push(`### #${i + 1} ${s.title || "未命名"}`);
    const meta = [s.author, s.tag, s.status, s.words, s.score].filter(Boolean).join(" · ");
    if (meta) lines.push(`*${meta}*`);
    if (s.update) lines.push(`**最新：** ${s.update}`);
    if (s.desc) {
      lines.push("");
      lines.push(`> ${s.desc.substring(0, 150)}${s.desc.length > 150 ? "..." : ""}`);
    }
    lines.push("", "---", "");
  });

  return lines.join("\n");
}

function main() {
  const channels = CHANNEL === "all" ? CHANNELS.map((c) => c.id) : [CHANNEL];

  for (const ch of channels) {
    const content = scrapeChannel(PORT, ch);
    if (!content) continue;

    const chInfo = CHANNELS.find((c) => c.id === ch);
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const filename = `点众${chInfo.label}短篇_${date}.md`;
    const filepath = path.join(OUTDIR, filename);
    fs.writeFileSync(filepath, content, "utf-8");
    console.log(`  ✓ 已保存: ${filepath}`);
  }
}

main();
