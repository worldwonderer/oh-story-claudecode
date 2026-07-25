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
  await page.locator("#treeSearch").fill("江晨");
  await expect(page.locator("#fileTree")).toContainText("江晨.md");
  await expect(page.locator("#fileTree")).not.toContainText("盘龙");
  await page.locator("#treeSearch").press("Escape");
  await expect(page.locator("#treeSearch")).toHaveValue("");

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

  await page.locator(`.file-row[data-path='${filePath}']`).click();
  await expect(page.locator("#editorTitle")).toHaveText(filePath.split("/").at(-1));

  page.once("dialog", async (dialog) => {
    expect(dialog.type()).toBe("confirm");
    expect(dialog.message()).toContain(filePath.split("/").at(-1));
    expect(dialog.message()).toContain("无法撤销");
    await dialog.accept();
  });
  await page.locator("#deleteButton").click();

  await expect(page.locator("#toastRegion")).toContainText("已删除");
  await expect(page.locator("#editorEmpty")).toBeVisible();
  await expect(page.locator(`.file-row[data-path='${filePath}']`)).toHaveCount(0);
  await expect(page.locator("#fileCount")).toHaveText(String(initialFileCount - 1));

  const deleted = await request.get(`/api/file?path=${encodeURIComponent(filePath)}`);
  expect(deleted.status()).toBe(404);
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
