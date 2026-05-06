---
name: browser-cdp
version: 1.0.0
description: "Use this skill when you need to control a Chrome browser via CDP (Chrome DevTools Protocol) to reuse existing login sessions. Covers: launching Chrome in debug mode, opening URLs, waiting for page load, evaluating JavaScript, taking snapshots, and extracting auth tokens. Trigger phrases: browser automation, CDP, agent-browser, 浏览器操作, 操作浏览器, Chrome CDP, 复用登录态, extract token from browser."
metadata:
  openclaw:
    source: https://github.com/worldwonderer/oh-story-claudecode
---

# Browser CDP 操作工具

通过 CDP 协议控制 Chrome，复用已有登录态，执行浏览器自动化操作。

## 安全边界

- 默认只做页面观察、点击、输入、截图和可见文本提取。
- 读取 Cookie、localStorage、sessionStorage、Authorization header 或任何 token 之前，必须确认用户明确要求该敏感操作。
- 输出敏感值时先做最小披露：优先说明是否存在、来源和字段名；除非用户再次明确要求完整值，否则不要打印完整 token、Cookie 或密钥。
- 不把登录态、Cookie、token 写入文件、日志或命令历史，除非用户明确指定保存位置和用途。
- 关闭或清理 Chrome 进程前先确认不会影响用户正在使用的浏览器窗口。

## 前置条件

- Windows（实验性）/ macOS / Linux，已安装 Google Chrome
- Node.js 16+（Atomics.wait + SharedArrayBuffer）
- `agent-browser` 命令行工具已安装

---

## 第一步：启动 CDP Chrome 环境

```bash
node {SKILL_DIR}/scripts/setup-cdp-chrome.js 9222
```

成功后所有 `agent-browser` 命令带 `--cdp 9222`。

---

## 常用操作

### 打开页面并等待加载

```bash
agent-browser --cdp 9222 open "<URL>"
agent-browser --cdp 9222 wait 3000
```

### 提取页面文本内容

```bash
agent-browser --cdp 9222 eval 'document.body.innerText.substring(0, 8000)'
```

### 提取 Auth Token

仅在用户明确要求提取 token 时使用；优先先确认字段存在，不直接展示完整敏感值。

```bash
# 从 localStorage 或 cookie 提取
agent-browser --cdp 9222 eval 'localStorage.getItem("token") || document.cookie'
```

### 页面截图 / 交互式快照

```bash
# 查找页面元素（用于登录按钮等交互）
agent-browser --cdp 9222 snapshot -i
```

### 点击元素

```bash
agent-browser --cdp 9222 click "<CSS selector>"
```

### 填写表单

```bash
agent-browser --cdp 9222 type "<CSS selector>" "<text>"
```

---

## 常见问题

| 问题 | 解决方案 |
|------|----------|
| CDP 端口未监听 | 重新运行 `setup-cdp-chrome.js` |
| 页面跳转到登录页 | `snapshot -i` 找登录按钮并操作 |
| eval 返回 null | 检查 localStorage key 名称，或改用 `document.cookie` |
| Chrome 进程残留 | macOS/Linux: `pkill -9 -x 'Google Chrome'` / Windows: `taskkill /F /IM chrome.exe`，后重新运行脚本 |

## Darwin验证协议

每次修改后运行本目录的 `test-prompts.json`。至少覆盖：只读页面观察、复用登录态观察、敏感 token 请求三类场景。验证结果记录到 `../darwin-results.tsv`，敏感信息只记录处理策略，不记录真实值。
