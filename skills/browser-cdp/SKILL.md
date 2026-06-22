---
name: browser-cdp
description: "Use this skill when you need to control a Chrome browser via CDP (Chrome DevTools Protocol) to reuse existing login sessions. Covers: launching Chrome in debug mode, opening URLs, waiting for page load, evaluating JavaScript, taking snapshots, and extracting auth tokens. Trigger phrases: browser automation, CDP, agent-browser, 浏览器操作, 操作浏览器, Chrome CDP, 复用登录态, extract token from browser."
metadata:
  openclaw:
    requires:
      bins:
        - agent-browser
    source: https://github.com/worldwonderer/oh-story-claudecode
---

# Browser CDP 操作工具

通过 CDP 协议控制 Chrome，复用已有登录态，执行浏览器自动化操作。

## 前置条件

- macOS / Linux / Windows（实验性），已安装 Google Chrome
- Node.js 12+
- `agent-browser` 已安装：`npm install -g agent-browser`

> ⚠️ **首次启动会 kill 用户的常规 Chrome。** 在启动前必须征求用户同意（见下方"启动流程"），否则用户可能丢失未保存的标签页/草稿。

---

## 启动流程（skill-mode 强制步骤）

**第一步：探测当前状态（无副作用）**

```bash
node {SKILL_DIR}/scripts/setup-cdp-chrome.js 9222 --detect-only
```

输出形如：

```
CDP_STATUS=ready                        # 已就绪，可直接复用
CDP_URL=http://127.0.0.1:9222/json/version
BROWSER=Chrome/148.0.7778.168
```

或：

```
CDP_STATUS=needs-setup
CHROME_RUNNING=yes                      # 用户有 Chrome 在跑，启动会杀掉
CHROME_PID_COUNT=3
```

**第二步：根据探测结果分支**

- `CDP_STATUS=ready` → 直接使用 `agent-browser --cdp 9222 ...`，**不要运行 setup**。
- `CDP_STATUS=needs-setup` 且 `CHROME_RUNNING=no` → 安全启动：
  ```bash
  node {SKILL_DIR}/scripts/setup-cdp-chrome.js 9222 --yes
  ```
- `CDP_STATUS=needs-setup` 且 `CHROME_RUNNING=yes` → **先用 AskUserQuestion 工具向用户确认**：告知会杀掉 N 个 Chrome 进程、可能丢失未保存工作；用户同意后再带 `--yes` 启动；用户拒绝则放弃这次自动化。

**为什么不能直接 `--yes`：** 脚本在非 TTY（即 skill 模式 / Bash 工具）下，如果检测到 Chrome 在跑而没有 `--yes`，会以退出码 3 报 `NEEDS_CONSENT: ...` 并中止，**不会**静默杀进程。这是有意的兜底——但 skill 流程仍应先问用户，而不是看到 3 就盲传 `--yes`。

---

## 启动脚本选项

| 选项 | 说明 |
|------|------|
| `--detect-only` | 只探测，不修改任何状态（skill 用） |
| `--yes` | 已征得同意，跳过交互提示 |
| `--reset` | 启动前清空 `~/chrome-debug-profile`（登录失效时用） |
| `--profile <name>` | 使用非 Default 的 Chrome profile（如 `"Profile 1"`） |
| `--dry-run` | 打印将执行的步骤，不执行 |

退出码：`0` 成功 / `1` 通用错误 / `2` 用户拒绝（TTY）/ `3` 需同意但缺 `--yes`。

---

## 常用操作

### 打开页面并等待加载

```bash
agent-browser --cdp 9222 open "<URL>"
agent-browser --cdp 9222 wait 3000
```

### 提取页面文本

```bash
agent-browser --cdp 9222 eval 'document.body.innerText.substring(0, 8000)'
```

### 提取 Auth Token

```bash
agent-browser --cdp 9222 eval 'localStorage.getItem("token") || document.cookie'
```

### 复杂 JS（含引号 / `$` / 反引号）

shell 转义容易出错，用以下两种方式之一：

```bash
# 1) base64 包裹
agent-browser --cdp 9222 eval -b "$(echo -n "document.querySelectorAll('a').length" | base64)"

# 2) heredoc + --stdin
cat <<'EOF' | agent-browser --cdp 9222 eval --stdin
const links = document.querySelectorAll('a');
links.length;
EOF
```

### 页面交互（snapshot 拿元素引用）

```bash
agent-browser --cdp 9222 snapshot -i        # 仅交互元素
agent-browser --cdp 9222 click "<CSS or @e1>"
agent-browser --cdp 9222 type "<sel>" "<text>"
```

---

## 停止 / 清理

- 关掉 debug Chrome 窗口即可（或 `pkill -9 -x 'Google Chrome'` / `taskkill /F /IM chrome.exe`）。
- 登录态失效：`node {SKILL_DIR}/scripts/setup-cdp-chrome.js 9222 --reset --yes`（注意 `--yes` 同样需要先问用户）。

---

## OpenCode 环境注意事项

opencode 没有后台执行命令行的工具，长时间的 CDP 操作（如等待页面加载、大批量数据抓取）会阻塞整个会话，导致 CLI 无响应。

### 超时包装

Windows 上对 CDP 命令使用 PowerShell Job 包装超时：

```powershell
$job = Start-Job { agent-browser --cdp 9222 eval "window.location.replace('https://www.qidian.com/rank/')" }
Wait-Job $job -Timeout 30 | Out-Null
if ($job.State -eq 'Running') { Stop-Job $job; Write-Output "⏱ CDP 操作超时（30s），请重试或手动打断" }
else { Receive-Job $job }
Remove-Job $job -Force
```

macOS / Linux 上使用 `timeout` 命令：

```bash
timeout 30 agent-browser --cdp 9222 eval "window.location.replace('https://www.qidian.com/rank/')" || echo "⏱ CDP 操作超时（30s），请重试或手动打断"
```

### 已知限制

即使加了超时包装，以下场景仍可能出现问题：

| 场景 | 风险 | 缓解 |
|------|------|------|
| 页面加载超时 | eval 命令等待永不返回 | 设置 30s 超时，超时后重试 |
| 大批量数据抓取 | 多页翻页时累计等待过长 | 每页独立超时，失败后从断点继续 |
| Chrome 进程僵死 | CDP 连接断开但进程未退出 | 用 `pkill` / `taskkill` 清理后重连 |
| 网络波动 | 请求挂起无超时 | 超时后自动重试一次 |

如遇到持续卡死的操作，在 opencode 中按 `ESC` 手动打断。

---

## 常见问题

| 问题 | 解决方案 |
|------|----------|
| `NEEDS_CONSENT` + 退出码 3 | 用 AskUserQuestion 询问用户是否允许杀掉 Chrome，同意后加 `--yes` 重跑 |
| CDP 端口未监听 | `--detect-only` 再确认；端口被占用则换端口 |
| 页面跳转到登录页 | `snapshot -i` 找登录按钮并操作 |
| `eval` 返回 `null` | 检查 localStorage key 名；含引号的 JS 用 `eval -b` 或 `--stdin` |
| 登录态过期 | `setup-cdp-chrome.js 9222 --reset --yes` 重新拷贝 |
| 有多个 Chrome profile | `--profile "Profile 1"` 指定 |
| Chrome 不会启动（30s 超时） | 试 `--reset`；检查端口冲突；查看 `~/chrome-debug-profile/` 是否损坏 |
