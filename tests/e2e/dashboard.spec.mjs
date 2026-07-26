import { expect, test } from "@playwright/test";

test("用现有 demo 浏览拆文库、搜索项目并编辑保存", async ({ page, request }) => {
  const consoleErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await page.goto("/");
  await expect(page).toHaveTitle(/OH STORY/);
  await expect(page.getByText("OH STORY", { exact: true })).toBeVisible();
  await expect(page.locator("#connectionStatus")).toContainText("仅本机");
  await expect(page.locator("#libraryCount")).toHaveText("2");
  await expect(page.locator("#projectCount")).toHaveText("1");
  await expect(page.locator("#fileCount")).not.toHaveText("—");

  await page.locator("#librariesTab").focus();
  await page.locator("#librariesTab").press("ArrowRight");
  await expect(page.locator("#projectsTab")).toHaveAttribute("aria-selected", "true");
  await page.locator("#projectsTab").press("ArrowLeft");
  await expect(page.locator("#librariesTab")).toHaveAttribute("aria-selected", "true");

  await expect(page.locator("#fileTree")).toContainText("盘龙");
  await expect(page.locator("#fileTree")).toContainText("曾将爱意私藏");
  await page.locator(".file-row[data-path='拆文库/盘龙/拆文报告.md']").click();
  await expect(page.locator("#editorTitle")).toHaveText("拆文报告.md");
  await expect(page.locator("#editorInput")).toHaveValue(/盘龙/);

  const marker = `\n\n<!-- dashboard-e2e-${Date.now()} -->`;
  await page.locator("#editorInput").fill(
    `${await page.locator("#editorInput").inputValue()}${marker}`,
  );
  await expect(page.locator("#dirtyStatus")).toContainText("待保存");
  await expect(page.locator("#saveButton")).toBeEnabled();

  const shortcut = process.platform === "darwin" ? "Meta+s" : "Control+s";
  await page.locator("#editorInput").press(shortcut);
  await expect(page.locator("#dirtyStatus")).toContainText("已保存");
  await expect(page.locator("#toastRegion")).toContainText("已保存");

  const activePath = await page.locator(".file-row[data-active='true']").getAttribute("data-path");
  const persisted = await request.get(`/api/file?path=${encodeURIComponent(activePath)}`);
  expect(persisted.ok()).toBeTruthy();
  expect((await persisted.json()).content).toContain(marker.trim());

  await page.locator("#editorInput").fill("<img src=x onerror=alert('unsafe')>\n\n# 安全预览");
  await page.getByRole("button", { name: "预览", exact: true }).click();
  await expect(page.locator("#previewPane")).toContainText("<img src=x onerror=alert('unsafe')>");
  await expect(page.locator("#previewPane img")).toHaveCount(0);
  await expect(page.locator("#previewPane h1")).toHaveText("安全预览");

  await page.getByRole("tab", { name: /写作项目/ }).click();
  await expect(page.locator("#treeTruncationNotice")).toHaveCount(0);
  await expect(page.locator("#fileTree")).toContainText("关系.md");
  const unfilteredRows = await page.locator("#fileTree .file-row").count();
  expect(unfilteredRows).toBeGreaterThan(10);

  // 搜索必须真的筛掉不相关的文稿：只断言命中项还在，等于放过了「过滤形同虚设」
  await page.locator("#treeSearch").fill("江晨");
  await expect(page.locator("#fileTree")).toContainText("江晨.md");
  await expect(page.locator("#fileTree")).not.toContainText("关系.md");
  await expect(page.locator("#fileTree")).not.toContainText("细纲_第003章");
  await expect(page.locator("#fileTree")).not.toContainText("盘龙");
  expect(await page.locator("#fileTree .file-row").count()).toBeLessThan(unfilteredRows);

  // 清空搜索后整棵树要回来（Escape 由浏览器清输入框，这里看的是树本身）
  await page.locator("#treeSearch").press("Escape");
  await expect(page.locator("#treeSearch")).toHaveValue("");
  await expect(page.locator("#fileTree")).toContainText("关系.md");
  expect(await page.locator("#fileTree .file-row").count()).toBe(unfilteredRows);

  expect(consoleErrors).toEqual([]);
});

test("从真实 demo 删除文稿前明确确认并刷新文件树", async ({ page, request }, testInfo) => {
  const retryFiles = [
    "拆文库/盘龙/_progress.md",
    "拆文库/盘龙/快速预览.md",
    "拆文库/盘龙/概要.md",
  ];
  const filePath = retryFiles[testInfo.retry];
  await page.goto("/");
  await expect(page.locator("#fileCount")).not.toHaveText("—");
  const initialFileCount = Number(
    (await page.locator("#fileCount").textContent()).replaceAll(",", ""),
  );
  expect(Number.isFinite(initialFileCount)).toBeTruthy();

  const fileName = filePath.split("/").at(-1);
  await page.locator(`.file-row[data-path='${filePath}']`).click();
  await expect(page.locator("#editorTitle")).toHaveText(fileName);

  // 断言写在 dialog 回调里就等于没写：对话框不弹时回调根本不跑。
  // 先在回调外记录，再在点击之后断言，并且必须先测「取消删除」这条路。
  let dismissed = null;
  page.once("dialog", async (dialog) => {
    dismissed = { type: dialog.type(), message: dialog.message() };
    await dialog.dismiss();
  });
  await page.locator("#deleteButton").click();
  await expect.poll(() => dismissed).not.toBeNull();
  expect(dismissed.type).toBe("confirm");
  expect(dismissed.message).toContain(fileName);
  expect(dismissed.message).toContain("无法撤销");

  await expect(page.locator(`.file-row[data-path='${filePath}']`)).toHaveCount(1);
  await expect(page.locator("#fileCount")).toHaveText(String(initialFileCount));
  await expect(page.locator("#editorTitle")).toHaveText(fileName);
  const survived = await request.get(`/api/file?path=${encodeURIComponent(filePath)}`);
  expect(survived.status()).toBe(200);

  let accepted = null;
  page.once("dialog", async (dialog) => {
    accepted = { type: dialog.type(), message: dialog.message() };
    await dialog.accept();
  });
  await page.locator("#deleteButton").click();
  await expect.poll(() => accepted).not.toBeNull();
  expect(accepted.type).toBe("confirm");
  expect(accepted.message).toContain(fileName);
  expect(accepted.message).toContain("无法撤销");

  await expect(page.locator("#toastRegion")).toContainText("已删除");
  await expect(page.locator("#editorEmpty")).toBeVisible();
  await expect(page.locator(`.file-row[data-path='${filePath}']`)).toHaveCount(0);
  await expect(page.locator("#fileCount")).toHaveText(String(initialFileCount - 1));

  const deleted = await request.get(`/api/file?path=${encodeURIComponent(filePath)}`);
  expect(deleted.status()).toBe(404);
});

test("保存途中切走文稿，结果不能落到新打开的那份上", async ({ page, request }) => {
  const fileA = "拆文库/盘龙/文风.md";
  const fileB = "拆文库/盘龙/拆文报告.md";
  await page.goto("/");
  await expect(page.locator("#fileCount")).not.toHaveText("—");

  // 把 PUT 拖慢，模拟网盘目录、杀软扫描导致的慢保存
  await page.route("**/api/file", async (route) => {
    if (route.request().method() === "PUT") {
      await new Promise((accept) => setTimeout(accept, 1500));
    }
    await route.continue();
  });

  await page.locator(`.file-row[data-path='${fileA}']`).click();
  await expect(page.locator("#editorTitle")).toHaveText("文风.md");
  const markerA = `\n<!-- dashboard-race-a-${Date.now()} -->`;
  await page.locator("#editorInput").fill(
    `${await page.locator("#editorInput").inputValue()}${markerA}`,
  );
  await page.locator("#saveButton").click();
  await expect(page.locator("#dirtyStatus")).toContainText("保存中");

  // 保存还在飞就切到另一份文稿并继续写
  page.once("dialog", (dialog) => dialog.accept());
  await page.locator(`.file-row[data-path='${fileB}']`).click();
  await expect(page.locator("#editorTitle")).toHaveText("拆文报告.md");
  const markerB = `\n<!-- dashboard-race-b-${Date.now()} -->`;
  await page.locator("#editorInput").fill(
    `${await page.locator("#editorInput").inputValue()}${markerB}`,
  );
  await expect(page.locator("#dirtyStatus")).toContainText("待保存");

  // A 的保存落地时只能提示 A，B 仍是未保存状态，不能被算成已保存
  await expect(page.locator("#toastRegion")).toContainText("已保存《文风.md》");
  await expect(page.locator("#dirtyStatus")).toContainText("待保存");
  await expect(page.locator("#saveButton")).toBeEnabled();

  const persistedA = await request.get(`/api/file?path=${encodeURIComponent(fileA)}`);
  expect((await persistedA.json()).content).toContain(markerA.trim());
  const staleB = await request.get(`/api/file?path=${encodeURIComponent(fileB)}`);
  expect((await staleB.json()).content).not.toContain(markerB.trim());

  // B 自己保存时必须带 B 的版本号，不能被 A 的 mtime 污染成假冲突
  await page.locator("#saveButton").click();
  await expect(page.locator("#toastRegion")).toContainText("已保存《拆文报告.md》");
  await expect(page.locator("#dirtyStatus")).toContainText("已保存");
  await expect(page.locator("#conflictDialog")).toBeHidden();
  const savedB = await request.get(`/api/file?path=${encodeURIComponent(fileB)}`);
  expect((await savedB.json()).content).toContain(markerB.trim());
});

test("保存途中继续敲的字仍算未保存", async ({ page, request }) => {
  const filePath = "拆文库/盘龙/文风.md";
  await page.goto("/");
  await expect(page.locator("#fileCount")).not.toHaveText("—");
  await page.route("**/api/file", async (route) => {
    if (route.request().method() === "PUT") {
      await new Promise((accept) => setTimeout(accept, 1500));
    }
    await route.continue();
  });

  await page.locator(`.file-row[data-path='${filePath}']`).click();
  await expect(page.locator("#editorTitle")).toHaveText("文风.md");
  const saveMarker = `\n<!-- dashboard-inflight-saved-${Date.now()} -->`;
  await page.locator("#editorInput").fill(
    `${await page.locator("#editorInput").inputValue()}${saveMarker}`,
  );

  const shortcut = process.platform === "darwin" ? "Meta+s" : "Control+s";
  await page.locator("#editorInput").press(shortcut);
  await expect(page.locator("#dirtyStatus")).toContainText("保存中");
  const lateMarker = "\n<!-- dashboard-inflight-late -->";
  await page.locator("#editorInput").fill(
    `${await page.locator("#editorInput").inputValue()}${lateMarker}`,
  );

  await expect(page.locator("#toastRegion")).toContainText("已保存《文风.md》");
  await expect(page.locator("#dirtyStatus")).toContainText("待保存");
  await expect(page.locator("#saveButton")).toBeEnabled();

  const persisted = await request.get(`/api/file?path=${encodeURIComponent(filePath)}`);
  const content = (await persisted.json()).content;
  expect(content).toContain(saveMarker.trim());
  expect(content).not.toContain(lateMarker.trim());
});

test("CRLF 稿件不会被一次改动重写换行，脏标记也能清干净", async ({ page, request }) => {
  const filePath = "长篇/让你管账号，你高燃混剪炸全网/设定/文风.md";
  const loaded = await request
    .get(`/api/file?path=${encodeURIComponent(filePath)}`)
    .then((response) => response.json());
  const crlfContent = loaded.content.replaceAll("\r\n", "\n").replaceAll("\n", "\r\n");
  const converted = await request.put("/api/file", {
    data: { path: filePath, content: crlfContent, expectedMtimeMs: loaded.mtimeMs },
  });
  expect(converted.ok()).toBeTruthy();
  expect(crlfContent).toContain("\r\n");

  await page.goto("/");
  await page.getByRole("tab", { name: /写作项目/ }).click();
  await page.locator("#treeSearch").fill("文风");
  await page.locator(`.file-row[data-path='${filePath}']`).click();
  await expect(page.locator("#editorTitle")).toHaveText("文风.md");
  await expect(page.locator("#dirtyStatus")).toContainText("已保存");

  // 敲一个字再删掉就该回到「已保存」；基线留着 CRLF 时这里永远卡在待保存
  await page.locator("#editorInput").press("End");
  await page.locator("#editorInput").pressSequentially("改");
  await expect(page.locator("#dirtyStatus")).toContainText("待保存");
  await page.locator("#editorInput").press("Backspace");
  await expect(page.locator("#dirtyStatus")).toContainText("已保存");

  await page.locator("#editorInput").pressSequentially("改");
  await page.locator("#saveButton").click();
  await expect(page.locator("#dirtyStatus")).toContainText("已保存");

  const saved = await request
    .get(`/api/file?path=${encodeURIComponent(filePath)}`)
    .then((response) => response.json());
  expect(saved.content).toContain("\r\n");
  expect(saved.content.replaceAll("\r\n", "")).not.toContain("\n");
  expect(saved.size).toBe(Buffer.byteLength(crlfContent) + Buffer.byteLength("改"));
});

test("打开文稿不会收起正在翻的目录", async ({ page }) => {
  const rowPath = "长篇/让你管账号，你高燃混剪炸全网/大纲/细纲_第002章.md";
  await page.goto("/");
  await page.getByRole("tab", { name: /写作项目/ }).click();
  await expect(page.locator("#fileTree")).toContainText("让你管账号，你高燃混剪炸全网");

  await page.locator("summary").filter({ hasText: "大纲" }).click();
  const row = page.locator(`.file-row[data-path='${rowPath}']`);
  await expect(row).toBeVisible();

  await row.click();
  await expect(page.locator("#editorTitle")).toHaveText("细纲_第002章.md");
  await expect(row).toBeVisible();
  await expect(row).toHaveAttribute("data-active", "true");

  await page.locator("#refreshButton").click();
  await expect(page.locator("#toastRegion")).toContainText("工作区目录已刷新");
  await expect(row).toBeVisible();
  await expect(row).toHaveAttribute("data-active", "true");

  await page.locator("#treeSearch").fill("细纲_第002章");
  await expect(page.locator("#fileTree")).not.toContainText("细纲_第003章");
  await page.locator("#treeSearch").fill("");
  await expect(row).toBeVisible();
});

test("目录树被截断时明确提示，而不是让文件凭空消失", async ({ page }) => {
  await page.route("**/api/workspace", async (route) => {
    const response = await route.fetch();
    const payload = await response.json();
    payload.limits.truncated = true;
    await route.fulfill({ response, json: payload });
  });

  await page.goto("/");
  await expect(page.locator("#treeTruncationNotice")).toContainText("目录树只列到");
  await expect(page.locator("#treeTruncationNotice")).toContainText("搜索也只覆盖已列出的部分");
  await expect(page.locator("#fileCount")).toContainText("+");
});

test("@mobile 手机视口仍可从真实长篇项目打开大纲", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("OH STORY", { exact: true })).toBeVisible();
  await expect(page.locator(".archive-panel")).toBeVisible();

  await page.getByRole("tab", { name: /写作项目/ }).click();
  await expect(page.locator("#fileTree")).toContainText("让你管账号，你高燃混剪炸全网");
  await page.locator("summary").filter({ hasText: "大纲" }).click();
  await page
    .locator(".file-row[data-path='长篇/让你管账号，你高燃混剪炸全网/大纲/大纲.md']")
    .click();

  await expect(page.locator("#editorTitle")).toHaveText("大纲.md");
  await expect(page.locator("#editorWorkspace")).toBeVisible();
  await expect(page.locator("#saveButton")).toBeVisible();
  await expect(page.locator("#editorInput")).toBeVisible();

  if (page.viewportSize().width <= 720) {
    await expect(page.locator(".archive-panel")).toBeHidden();
    await page.locator("#mobileBackButton").click();
    await expect(page.locator(".archive-panel")).toBeVisible();
    await expect(page.locator(".editor-panel")).toBeHidden();
  }
});
