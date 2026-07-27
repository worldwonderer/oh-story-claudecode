const state = {
  workspace: null,
  activeView: "libraries",
  activeFile: null,
  originalContent: "",
  dirty: false,
  mode: "edit",
  filter: "",
  loadingFile: false,
  saving: false,
  deleting: false,
  // 记住作者手动展开/收起过的目录，重绘文件树时不要把人正在翻的章节文件夹关掉
  expandedDirs: new Set(),
  collapsedDirs: new Set(),
};

const elements = {
  workspaceName: document.querySelector("#workspaceName"),
  workspacePath: document.querySelector("#workspacePath"),
  connectionStatus: document.querySelector("#connectionStatus"),
  treeSearch: document.querySelector("#treeSearch"),
  libraryCount: document.querySelector("#libraryCount"),
  projectCount: document.querySelector("#projectCount"),
  fileCount: document.querySelector("#fileCount"),
  librariesBadge: document.querySelector("#librariesBadge"),
  projectsBadge: document.querySelector("#projectsBadge"),
  archiveTabs: [...document.querySelectorAll(".archive-tabs [role='tab']")],
  treePanel: document.querySelector("#treePanel"),
  treeLoading: document.querySelector("#treeLoading"),
  fileTree: document.querySelector("#fileTree"),
  refreshButton: document.querySelector("#refreshButton"),
  mobileBackButton: document.querySelector("#mobileBackButton"),
  editorEmpty: document.querySelector("#editorEmpty"),
  editorWorkspace: document.querySelector("#editorWorkspace"),
  editorTitle: document.querySelector("#editorTitle"),
  breadcrumbs: document.querySelector("#breadcrumbs"),
  dirtyStatus: document.querySelector("#dirtyStatus"),
  documentMeta: document.querySelector("#documentMeta"),
  editorInput: document.querySelector("#editorInput"),
  previewPane: document.querySelector("#previewPane"),
  modeButtons: [...document.querySelectorAll(".mode-switch button")],
  deleteButton: document.querySelector("#deleteButton"),
  saveButton: document.querySelector("#saveButton"),
  cursorPosition: document.querySelector("#cursorPosition"),
  encodingLabel: document.querySelector("#encodingLabel"),
  toastRegion: document.querySelector("#toastRegion"),
  conflictDialog: document.querySelector("#conflictDialog"),
  reloadConflictButton: document.querySelector("#reloadConflictButton"),
  truncationNotice: null,
};

class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

async function requestJson(url, options) {
  let response;
  try {
    response = await fetch(url, options);
  } catch {
    setConnection("offline", "连接中断");
    throw new ApiError(0, "network_error", "无法连接本地 Dashboard 服务");
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new ApiError(
      response.status,
      payload?.error?.code || "request_failed",
      payload?.error?.message || `请求失败（${response.status}）`,
    );
  }
  setConnection("online", "仅本机");
  return payload;
}

function setConnection(status, label) {
  elements.connectionStatus.dataset.state = status;
  elements.connectionStatus.querySelector("span:last-child").textContent = label;
}

function showToast(message, kind = "success") {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.dataset.kind = kind;
  const text = document.createElement("p");
  text.textContent = message;
  toast.append(text);
  elements.toastRegion.append(toast);
  window.setTimeout(() => toast.remove(), 4200);
}

function formatNumber(value) {
  return new Intl.NumberFormat("zh-CN").format(value || 0);
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function countCharacters(content) {
  return [...content.replace(/\s/g, "")].length;
}

// textarea 的 value 永远是 LF：读盘时先归一化，写盘时再换回原文件的换行符，
// 否则 CRLF 稿件会被一次改动整篇重写，而且脏标记永远对不上、清不掉。
function detectEol(content) {
  let crlf = 0;
  let lf = 0;
  let cr = 0;
  for (let index = 0; index < content.length; index += 1) {
    if (content[index] === "\r") {
      if (content[index + 1] === "\n") {
        crlf += 1;
        index += 1;
      } else {
        cr += 1;
      }
    } else if (content[index] === "\n") {
      lf += 1;
    }
  }
  // 按 LF/CRLF 的主流风格回写；只有纯 CR 文件才保留 CR。一个粘贴进来的孤立 CR
  // 不能把每个 LF 都扩散成 CR，反过来也不能让 CRLF 稿件整篇变成 LF。
  if (crlf > lf) return "\r\n";
  if (lf > 0) return "\n";
  if (cr > 0) return "\r";
  return "\n";
}

function normalizeEol(content) {
  return content.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
}

function applyEol(content, eol) {
  return !eol || eol === "\n" ? content : content.replaceAll("\n", eol);
}

function activeEol() {
  return state.activeFile?.eol || "\n";
}

function currentByteSize() {
  return new TextEncoder().encode(applyEol(elements.editorInput.value, activeEol())).length;
}

function fileExtension(name) {
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index + 1) : "";
}

function iconSvg(kind) {
  if (kind === "folder") {
    return `<svg class="tree-icon folder-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 6.5h6l2 2h9v10h-17z"></path></svg>`;
  }
  return `<svg class="tree-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.5h8l4 4v13H6z"></path><path d="M14 3.5v4h4M9 12h6M9 16h5"></path></svg>`;
}

function nodeMatches(node, query) {
  if (!query) return true;
  if (node.name.toLocaleLowerCase("zh-CN").includes(query)) return true;
  return node.type === "directory" && node.children.some((child) => nodeMatches(child, query));
}

function createTreeEntry(node, depth = 0) {
  const query = state.filter.trim().toLocaleLowerCase("zh-CN");
  if (!nodeMatches(node, query)) return null;

  const item = document.createElement("li");
  if (node.type === "directory") {
    const details = document.createElement("details");
    const shouldOpen = query
      ? true
      : state.expandedDirs.has(node.path) ||
        (depth === 0 && !state.collapsedDirs.has(node.path));
    details.open = shouldOpen;
    // 只记录作者亲手的展开/收起；渲染时的程序化展开（首层、搜索命中）不算偏好
    let recorded = shouldOpen;
    details.addEventListener("toggle", () => {
      if (details.open === recorded) return;
      recorded = details.open;
      if (details.open) {
        state.expandedDirs.add(node.path);
        state.collapsedDirs.delete(node.path);
      } else {
        state.expandedDirs.delete(node.path);
        state.collapsedDirs.add(node.path);
      }
    });
    const summary = document.createElement("summary");
    summary.innerHTML = iconSvg("folder");
    const label = document.createElement("span");
    label.className = "tree-label";
    label.textContent = node.name;
    summary.append(label);
    details.append(summary);

    const list = document.createElement("ul");
    node.children.forEach((child) => {
      const childItem = createTreeEntry(child, depth + 1);
      if (childItem) list.append(childItem);
    });
    details.append(list);
    item.append(details);
    return item;
  }

  const button = document.createElement("button");
  button.type = "button";
  button.className = "file-row";
  button.dataset.path = node.path;
  button.dataset.active = String(state.activeFile?.path === node.path);
  button.disabled = !node.editable;
  button.title = node.editable ? node.path : `${node.path}（此文件类型只展示，不可编辑）`;
  button.innerHTML = iconSvg("file");

  const label = document.createElement("span");
  label.className = "tree-label";
  label.textContent = node.name;
  button.append(label);

  const extension = document.createElement("span");
  extension.className = "file-ext";
  extension.textContent = fileExtension(node.name);
  button.append(extension);
  if (node.editable) {
    button.addEventListener("click", () => openFile(node.path));
  }
  item.append(button);
  return item;
}

// 只改当前高亮行，不重建整棵树——重建会把作者正在翻的目录全部收起
function syncActiveRow() {
  const activePath = state.activeFile?.path;
  elements.fileTree.querySelectorAll(".file-row").forEach((row) => {
    row.dataset.active = String(row.dataset.path === activePath);
  });
}

function renderTree() {
  elements.fileTree.replaceChildren();
  elements.treeLoading.hidden = true;
  const collection = state.workspace?.[state.activeView] || [];
  const matching = collection.filter((node) =>
    nodeMatches(node, state.filter.trim().toLocaleLowerCase("zh-CN")),
  );

  if (!matching.length) {
    const message = document.createElement("div");
    message.className = "tree-message";
    const text = document.createElement("p");
    text.textContent = state.filter
      ? `没有找到“${state.filter}”`
      : state.activeView === "libraries"
        ? "工作区里还没有拆文库。运行拆文 skill 后，档案会出现在这里。"
        : "还没有识别到写作项目。包含正文、大纲、设定或追踪目录的书会显示在这里。";
    message.append(text);
    elements.fileTree.append(message);
    return;
  }

  const list = document.createElement("ul");
  matching.forEach((node) => {
    const item = createTreeEntry(node);
    if (item) list.append(item);
  });
  elements.fileTree.append(list);
}

// 节点预算打满要减量，目录套太深要把嵌套拍平：两种截断的处置办法不同，
// 混成同一句话等于让作者照着错的办法搬文稿，所以按后端报的成因分别成句。
function truncationMessage(limits, scanErrors = []) {
  const byDepth = Boolean(limits.truncatedByDepth);
  const byReadError = Boolean(limits.truncatedByReadError);
  // 老版本后端只给 truncated 一个布尔值，没有成因时按节点上限解释，保持旧文案不回退成空话。
  const byNodes = typeof limits.truncatedByNodes === "boolean" ? limits.truncatedByNodes : !byDepth;
  const reasons = [];
  if (byNodes) {
    reasons.push(`工作区文件太多，目录树只列到 ${formatNumber(limits.maxTreeNodes)} 条上限，部分文稿没有列出`);
  }
  if (byDepth) {
    const depthLimit = Number.isFinite(limits.maxTreeDepth)
      ? `（超过 ${formatNumber(limits.maxTreeDepth)} 层）`
      : "";
    reasons.push(`有目录套得太深${depthLimit}，更深处的文稿没有列出`);
  }
  if (byReadError) {
    const paths = scanErrors.map((entry) => entry.path).filter(Boolean);
    const shown = paths.slice(0, 3).join("、") || "部分目录";
    const more = paths.length > 3 ? `等 ${formatNumber(paths.length)} 处` : "";
    reasons.push(`${shown}${more}无法读取，其中的文稿没有列出`);
  }
  let advice = "请把旧卷或拆文库挪到别处，或直接在编辑器里打开缺失的文件。";
  if (byReadError) {
    advice = "请检查这些目录的访问权限和外挂盘挂载状态，恢复后刷新目录。";
  } else if (byNodes && byDepth) {
    advice = "请把旧卷或拆文库挪到别处、并把过深的子目录拍平，或直接在编辑器里打开缺失的文件。";
  } else if (byDepth) {
    advice = "请把过深的子目录拍平，或直接在编辑器里打开缺失的文件。";
  }
  return `${reasons.join("；")}，搜索也只覆盖已列出的部分。${advice}`;
}

// 扫描碰到上限时目录树和搜索都只覆盖已列出的部分，必须明说，不能让作者以为文件不存在
function renderTruncationNotice(limits, scanErrors) {
  if (!limits?.truncated) {
    elements.truncationNotice?.remove();
    elements.truncationNotice = null;
    return;
  }
  if (!elements.truncationNotice) {
    const notice = document.createElement("div");
    notice.id = "treeTruncationNotice";
    notice.className = "tree-message";
    notice.setAttribute("role", "status");
    notice.append(document.createElement("p"));
    elements.treePanel.insertBefore(notice, elements.fileTree);
    elements.truncationNotice = notice;
  }
  elements.truncationNotice.querySelector("p").textContent = truncationMessage(limits, scanErrors);
}

function renderWorkspace() {
  const { workspace, stats, libraries, projects, limits, scanErrors } = state.workspace;
  elements.workspaceName.textContent = workspace.name;
  elements.workspacePath.textContent = workspace.path;
  elements.workspacePath.title = workspace.path;
  elements.libraryCount.textContent = formatNumber(stats.libraries);
  elements.projectCount.textContent = formatNumber(stats.projects);
  // 树被截断时统计只是下限，用 + 标出来，别把残缺数字当成真相
  elements.fileCount.textContent = formatNumber(stats.editableFiles) + (limits?.truncated ? "+" : "");
  elements.fileCount.title = limits?.truncated ? "目录树已截断，实际文稿数多于此" : "";
  elements.librariesBadge.textContent = formatNumber(libraries.length);
  elements.projectsBadge.textContent = formatNumber(projects.length);
  renderTruncationNotice(limits, scanErrors);
  renderTree();
}

async function loadWorkspace({ announce = false } = {}) {
  elements.treeLoading.hidden = false;
  elements.fileTree.replaceChildren();
  setConnection("", "连接中");
  try {
    state.workspace = await requestJson("/api/workspace");
    renderWorkspace();
    if (announce) showToast("工作区目录已刷新");
  } catch (error) {
    elements.treeLoading.hidden = true;
    const message = document.createElement("div");
    message.className = "tree-message";
    const text = document.createElement("p");
    text.textContent = error.message;
    message.append(text);
    elements.fileTree.replaceChildren(message);
    showToast(error.message, "error");
  }
}

function confirmDiscard() {
  return !state.dirty || window.confirm("当前文稿还有未保存的修改。确定放弃并打开另一份文件吗？");
}

function setDirty(dirty) {
  state.dirty = dirty;
  elements.dirtyStatus.dataset.state = dirty ? "dirty" : "saved";
  elements.dirtyStatus.querySelector("span:last-child").textContent = dirty ? "待保存" : "已保存";
  syncActionAvailability();
}

function syncActionAvailability() {
  const busy = state.loadingFile || state.saving || state.deleting;
  elements.saveButton.disabled = busy || !state.dirty;
  elements.deleteButton.disabled = busy || !state.activeFile;
}

function setSaving(saving) {
  state.saving = saving;
  elements.dirtyStatus.dataset.state = saving ? "saving" : state.dirty ? "dirty" : "saved";
  elements.dirtyStatus.querySelector("span:last-child").textContent = saving
    ? "保存中"
    : state.dirty
      ? "待保存"
      : "已保存";
  syncActionAvailability();
}

function renderBreadcrumbs(path) {
  elements.breadcrumbs.replaceChildren();
  path.split("/").forEach((part, index, parts) => {
    const label = document.createElement("span");
    label.textContent = part;
    elements.breadcrumbs.append(label);
    if (index < parts.length - 1) {
      const divider = document.createElement("i");
      divider.textContent = "／";
      elements.breadcrumbs.append(divider);
    }
  });
}

function updateDocumentMeta() {
  if (!state.activeFile) return;
  const content = elements.editorInput.value;
  elements.documentMeta.textContent = [
    formatBytes(currentByteSize()),
    `${formatNumber(countCharacters(content))} 字符`,
    fileExtension(state.activeFile.name).toUpperCase(),
  ].join("  ·  ");
}

function updateCursorPosition() {
  const content = elements.editorInput.value;
  const caret = elements.editorInput.selectionStart;
  const before = content.slice(0, caret);
  const lines = before.split("\n");
  elements.cursorPosition.textContent = `第 ${lines.length} 行，第 ${[...lines.at(-1)].length + 1} 列`;
}

async function openFile(path, { force = false } = {}) {
  if (state.loadingFile || (!force && !confirmDiscard())) return;
  state.loadingFile = true;
  syncActionAvailability();
  elements.fileTree.setAttribute("aria-busy", "true");
  try {
    const file = await requestJson(`/api/file?path=${encodeURIComponent(path)}`);
    const normalized = normalizeEol(file.content);
    file.eol = detectEol(file.content);
    file.content = normalized;
    state.activeFile = file;
    state.originalContent = normalized;
    elements.editorInput.value = normalized;
    elements.editorTitle.textContent = file.name;
    renderBreadcrumbs(file.path);
    setDirty(false);
    setMode("edit");
    updateDocumentMeta();
    updateCursorPosition();
    elements.editorEmpty.hidden = true;
    elements.editorWorkspace.hidden = false;
    document.body.classList.add("document-open");
    syncActiveRow();
    window.requestAnimationFrame(() => elements.editorInput.focus());
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    state.loadingFile = false;
    syncActionAvailability();
    elements.fileTree.removeAttribute("aria-busy");
  }
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function inlineMarkdown(value) {
  return value
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "<em>$1</em>");
}

function markdownToSafeHtml(markdown) {
  const lines = escapeHtml(markdown).replaceAll("\r\n", "\n").split("\n");
  const output = [];
  let inCode = false;
  let codeLines = [];
  let listType = null;

  const closeList = () => {
    if (listType) output.push(`</${listType}>`);
    listType = null;
  };

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      closeList();
      if (inCode) {
        output.push(`<pre><code>${codeLines.join("\n")}</code></pre>`);
        codeLines = [];
      }
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      codeLines.push(line);
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (heading) {
      closeList();
      const level = heading[1].length;
      output.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
    } else if (unordered || ordered) {
      const nextType = unordered ? "ul" : "ol";
      if (listType !== nextType) {
        closeList();
        listType = nextType;
        output.push(`<${listType}>`);
      }
      output.push(`<li>${inlineMarkdown((unordered || ordered)[1])}</li>`);
    } else if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
      closeList();
      output.push("<hr>");
    } else if (line.startsWith("&gt; ")) {
      closeList();
      output.push(`<blockquote>${inlineMarkdown(line.slice(5))}</blockquote>`);
    } else if (line.trim()) {
      closeList();
      output.push(`<p>${inlineMarkdown(line)}</p>`);
    } else {
      closeList();
    }
  }
  if (inCode) output.push(`<pre><code>${codeLines.join("\n")}</code></pre>`);
  closeList();
  return output.join("");
}

function setMode(mode) {
  state.mode = mode;
  elements.modeButtons.forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
  });
  const previewing = mode === "preview";
  elements.editorInput.hidden = previewing;
  elements.previewPane.hidden = !previewing;
  if (previewing) {
    elements.previewPane.innerHTML = markdownToSafeHtml(elements.editorInput.value);
  } else {
    window.requestAnimationFrame(() => elements.editorInput.focus());
  }
}

async function saveFile() {
  if (!state.activeFile || !state.dirty || state.saving || state.deleting) return;
  // 请求发出前就把身份和正文快照下来：保存期间作者可能换文件、也可能接着敲字，
  // 收尾只允许写回这次真正送出去的那份，绝不能落到别的文稿头上。
  const file = state.activeFile;
  const sent = elements.editorInput.value;
  setSaving(true);
  try {
    const saved = await requestJson("/api/file", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: file.path,
        content: applyEol(sent, file.eol),
        expectedVersion: file.version,
      }),
    });
    file.mtimeMs = saved.mtimeMs;
    file.version = saved.version;
    file.size = saved.size;
    showToast(`已保存《${file.name}》`);
    if (state.activeFile !== file) return;
    state.originalContent = sent;
    // 保存途中敲进来的字仍是未保存修改，不能被这次结果抹平成「已保存」
    setDirty(elements.editorInput.value !== sent);
    updateDocumentMeta();
  } catch (error) {
    if (state.activeFile !== file) {
      showToast(`《${file.name}》保存失败：${error.message}`, "error");
      return;
    }
    setDirty(true);
    if (error instanceof ApiError && error.status === 409) {
      elements.conflictDialog.showModal();
    } else {
      showToast(error.message, "error");
    }
  } finally {
    setSaving(false);
  }
}

async function deleteFile() {
  if (!state.activeFile || state.saving || state.deleting) return;
  const file = state.activeFile;
  const warning = state.dirty
    ? `《${file.name}》还有未保存修改。删除会永久移除磁盘文件并丢弃这些修改，且无法撤销。确定删除吗？`
    : `确定永久删除《${file.name}》吗？此操作无法撤销。`;
  if (!window.confirm(warning)) return;

  state.deleting = true;
  syncActionAvailability();
  try {
    await requestJson("/api/file", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: file.path,
        expectedVersion: file.version,
      }),
    });
    state.activeFile = null;
    state.originalContent = "";
    elements.editorInput.value = "";
    elements.editorWorkspace.hidden = true;
    elements.editorEmpty.hidden = false;
    document.body.classList.remove("document-open");
    setDirty(false);
    await loadWorkspace();
    showToast(`已删除《${file.name}》`);
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    state.deleting = false;
    syncActionAvailability();
  }
}

function setActiveView(view) {
  state.activeView = view;
  elements.archiveTabs.forEach((tab) => {
    const selected = tab.dataset.view === view;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
  });
  elements.treePanel.setAttribute(
    "aria-labelledby",
    view === "libraries" ? "librariesTab" : "projectsTab",
  );
  renderTree();
}

elements.archiveTabs.forEach((tab) => {
  tab.addEventListener("click", () => setActiveView(tab.dataset.view));
  tab.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const current = elements.archiveTabs.indexOf(event.currentTarget);
    const next = elements.archiveTabs.at(
      (current + direction + elements.archiveTabs.length) % elements.archiveTabs.length,
    );
    setActiveView(next.dataset.view);
    next.focus();
  });
});

elements.treeSearch.addEventListener("input", (event) => {
  state.filter = event.currentTarget.value;
  renderTree();
});

elements.treeSearch.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.currentTarget.value = "";
    state.filter = "";
    renderTree();
  }
});

elements.refreshButton.addEventListener("click", () => loadWorkspace({ announce: true }));
elements.mobileBackButton.addEventListener("click", () => {
  document.body.classList.remove("document-open");
  window.requestAnimationFrame(() => elements.treeSearch.focus());
});
elements.saveButton.addEventListener("click", saveFile);
elements.deleteButton.addEventListener("click", deleteFile);

elements.editorInput.addEventListener("input", () => {
  setDirty(elements.editorInput.value !== state.originalContent);
  updateDocumentMeta();
  updateCursorPosition();
});

["click", "keyup", "select"].forEach((eventName) => {
  elements.editorInput.addEventListener(eventName, updateCursorPosition);
});

elements.modeButtons.forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.mode));
});

elements.conflictDialog.addEventListener("close", () => {
  if (elements.conflictDialog.returnValue === "reload" && state.activeFile) {
    openFile(state.activeFile.path, { force: true });
  }
});

document.addEventListener("keydown", (event) => {
  const modifier = event.metaKey || event.ctrlKey;
  if (modifier && event.key.toLocaleLowerCase() === "s") {
    event.preventDefault();
    saveFile();
  }
  if (modifier && event.key.toLocaleLowerCase() === "k") {
    event.preventDefault();
    elements.treeSearch.focus();
    elements.treeSearch.select();
  }
});

window.addEventListener("beforeunload", (event) => {
  if (state.dirty) {
    event.preventDefault();
    event.returnValue = "";
  }
});

loadWorkspace();
