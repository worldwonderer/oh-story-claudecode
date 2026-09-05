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
  searching: false,
  searchResults: [],
  searchTruncation: null,
  searchSequence: 0,
  searchTimer: null,
  // 记住作者手动展开/收起过的目录，重绘文件树时不要把人正在翻的章节文件夹关掉
  expandedDirs: new Set(),
  collapsedDirs: new Set(),
  // 行级批注系统
  annotations: [],
  showAnnotationsSidebar: true,
  currentAnnotatingLine: null,
  currentAnnotatingText: "",
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
  editorBody: document.querySelector("#editorBody"),
  editorContainer: document.querySelector("#editorContainer"),
  lineNumbersGutter: document.querySelector("#lineNumbersGutter"),
  lineNumbersButton: document.querySelector("#lineNumbersButton"),
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
  analysisButton: document.querySelector("#analysisButton"),
  analysisBtnLabel: document.querySelector("#analysisBtnLabel"),
  analysisDialog: document.querySelector("#analysisDialog"),
  analysisChapterTitle: document.querySelector("#analysisChapterTitle"),
  analysisWordCountTag: document.querySelector("#analysisWordCountTag"),
  analysisScoreBadge: document.querySelector("#analysisScoreBadge"),
  analysisMethodBadge: document.querySelector("#analysisMethodBadge"),
  reanalyzeButton: document.querySelector("#reanalyzeButton"),
  analysisConfigToggle: document.querySelector("#analysisConfigToggle"),
  closeAnalysisDialogButton: document.querySelector("#closeAnalysisDialogButton"),
  analysisConfigPanel: document.querySelector("#analysisConfigPanel"),
  cfgBaseUrl: document.querySelector("#cfgBaseUrl"),
  cfgModel: document.querySelector("#cfgModel"),
  cfgApiKey: document.querySelector("#cfgApiKey"),
  saveConfigButton: document.querySelector("#saveConfigButton"),
  closeConfigButton: document.querySelector("#closeConfigButton"),
  analysisEmptyView: document.querySelector("#analysisEmptyView"),
  analysisLoadingView: document.querySelector("#analysisLoadingView"),
  analysisLoadingTitle: document.querySelector("#analysisLoadingTitle"),
  analysisLoadingMsg: document.querySelector("#analysisLoadingMsg"),
  analysisProgressBar: document.querySelector("#analysisProgressBar"),
  startAnalysisBtn: document.querySelector("#startAnalysisBtn"),
  analysisResultView: document.querySelector("#analysisResultView"),
  analysisTabs: [...document.querySelectorAll(".analysis-tabs button")],
  tabPanels: {
    overview: document.querySelector("#tabPanelOverview"),
    hooks: document.querySelector("#tabPanelHooks"),
    foreshadows: document.querySelector("#tabPanelForeshadows"),
    emotion: document.querySelector("#tabPanelEmotion"),
    characters: document.querySelector("#tabPanelCharacters"),
    plot_points: document.querySelector("#tabPanelPlotPoints"),
  },
  hooksBadge: document.querySelector("#hooksBadge"),
  foreshadowsBadge: document.querySelector("#foreshadowsBadge"),
  charactersBadge: document.querySelector("#charactersBadge"),
  plotPointsBadge: document.querySelector("#plotPointsBadge"),
  openRegenerateDialogButton: document.querySelector("#openRegenerateDialogButton"),
  regenerateFromSuggestionsButton: document.querySelector("#regenerateFromSuggestionsButton"),
  regenPendingNotice: document.querySelector("#regenPendingNotice"),
  viewPendingMergeButton: document.querySelector("#viewPendingMergeButton"),
  regenerationDialog: document.querySelector("#regenerationDialog"),
  regenChapterTitle: document.querySelector("#regenChapterTitle"),
  closeRegenDialogButton: document.querySelector("#closeRegenDialogButton"),
  cancelRegenButton: document.querySelector("#cancelRegenButton"),
  submitRegenButton: document.querySelector("#submitRegenButton"),
  regenSuggestionsChecklist: document.querySelector("#regenSuggestionsChecklist"),
  regenSelectAllSuggestionsBtn: document.querySelector("#regenSelectAllSuggestionsBtn"),
  regenClearSuggestionsBtn: document.querySelector("#regenClearSuggestionsBtn"),
  regenCustomInstructions: document.querySelector("#regenCustomInstructions"),
  regenPreservePlot: document.querySelector("#regenPreservePlot"),
  regenPreserveStyle: document.querySelector("#regenPreserveStyle"),
  regenStrictDeslop: document.querySelector("#regenStrictDeslop"),
  regenPreserveLength: document.querySelector("#regenPreserveLength"),
  regenTargetWordsInput: document.querySelector("#regenTargetWordsInput"),
  regenStatusFeedback: document.querySelector("#regenStatusFeedback"),
  regenStatusText: document.querySelector("#regenStatusText"),
  diffMergeDialog: document.querySelector("#diffMergeDialog"),
  diffChapterTitle: document.querySelector("#diffChapterTitle"),
  diffStatsInfo: document.querySelector("#diffStatsInfo"),
  diffViewFullBtn: document.querySelector("#diffViewFullBtn"),
  diffViewChangesBtn: document.querySelector("#diffViewChangesBtn"),
  diffAcceptAllBtn: document.querySelector("#diffAcceptAllBtn"),
  diffRejectAllBtn: document.querySelector("#diffRejectAllBtn"),
  closeDiffDialogButton: document.querySelector("#closeDiffDialogButton"),
  cancelDiffButton: document.querySelector("#cancelDiffButton"),
  applyMergeButton: document.querySelector("#applyMergeButton"),
  diffHunksContainer: document.querySelector("#diffHunksContainer"),
  diffFooterStats: document.querySelector("#diffFooterStats"),
  diffMergeSpinner: document.querySelector("#diffMergeSpinner"),
  diffMergeStatusMsg: document.querySelector("#diffMergeStatusMsg"),
  verifyAiStatus: document.querySelector("#verifyAiStatus"),
  verifyAiText: document.querySelector("#verifyAiText"),
  verifyDegenStatus: document.querySelector("#verifyDegenStatus"),
  verifyDegenText: document.querySelector("#verifyDegenText"),
  annotationsToggleBtn: document.querySelector("#annotationsToggleBtn"),
  annotationsCountBadge: document.querySelector("#annotationsCountBadge"),
  annotationsSidebar: document.querySelector("#annotationsSidebar"),
  annotationsSidebarBadge: document.querySelector("#annotationsSidebarBadge"),
  closeAnnotationsSidebarBtn: document.querySelector("#closeAnnotationsSidebarBtn"),
  annotationsList: document.querySelector("#annotationsList"),
  annotationPopover: document.querySelector("#annotationPopover"),
  annotationPopoverTitle: document.querySelector("#annotationPopoverTitle"),
  annotationLineSnippet: document.querySelector("#annotationLineSnippet"),
  annotationInput: document.querySelector("#annotationInput"),
  saveAnnotationBtn: document.querySelector("#saveAnnotationBtn"),
  cancelAnnotationBtn: document.querySelector("#cancelAnnotationBtn"),
  closeAnnotationPopoverBtn: document.querySelector("#closeAnnotationPopoverBtn"),
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

function createTreeEntry(node, depth = 0) {
  const item = document.createElement("li");
  if (node.type === "directory") {
    const details = document.createElement("details");
    details.dataset.path = node.path;
    const shouldOpen =
      state.expandedDirs.has(node.path) ||
      (depth === 0 && !state.collapsedDirs.has(node.path));
    details.open = shouldOpen;
    // 只记录作者亲手的展开/收起；首层程序化展开不算偏好。
    let recorded = shouldOpen;
    details.addEventListener("toggle", () => {
      if (details.open === recorded) return;
      recorded = details.open;
      if (details.open) {
        state.expandedDirs.add(node.path);
        state.collapsedDirs.delete(node.path);
        if (!node.loaded && !node.loading) loadDirectory(node);
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
    if (node.loading) {
      const loading = document.createElement("li");
      loading.className = "tree-inline-status";
      loading.textContent = "正在读取目录…";
      list.append(loading);
    } else if (node.loadError) {
      const retry = document.createElement("li");
      retry.className = "tree-inline-status";
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "目录加载失败，点击重试";
      button.addEventListener("click", () => loadDirectory(node));
      retry.append(button);
      list.append(retry);
    } else if (node.loaded && node.children.length === 0) {
      const empty = document.createElement("li");
      empty.className = "tree-inline-status";
      empty.textContent = "空目录";
      list.append(empty);
    }
    if (node.nextCursor && !node.loading) {
      const more = document.createElement("li");
      more.className = "tree-inline-status";
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "加载更多";
      button.addEventListener("click", () => loadDirectory(node, { append: true }));
      more.append(button);
      list.append(more);
    }
    details.append(list);
    item.append(details);
    if (shouldOpen && !node.loaded && !node.loading && !node.loadError && !node.loadQueued) {
      node.loadQueued = true;
      window.queueMicrotask(() => {
        node.loadQueued = false;
        if (!node.loaded && !node.loading && !node.loadError) loadDirectory(node);
      });
    }
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

function mergeDirectoryEntries(node, entries, append) {
  if (!append) {
    node.children = entries;
    return;
  }
  const existingPaths = new Set(node.children.map((entry) => entry.path));
  node.children.push(...entries.filter((entry) => !existingPaths.has(entry.path)));
}

async function loadDirectory(node, { append = false } = {}) {
  if (node.loading) return;
  node.loading = true;
  node.loadError = "";
  renderTree();
  try {
    const cursor = append && node.nextCursor ? `&cursor=${encodeURIComponent(node.nextCursor)}` : "";
    const page = await requestJson(`/api/tree?path=${encodeURIComponent(node.path)}${cursor}`);
    mergeDirectoryEntries(node, page.entries, append);
    node.nextCursor = page.nextCursor;
    node.loaded = true;
  } catch (error) {
    node.loadError = error.message;
    showToast(error.message, "error");
  } finally {
    node.loading = false;
    renderLoadedFileCount();
    renderTree();
  }
}

function loadedFileCount() {
  const paths = new Set();
  function visit(node) {
    if (node.type === "file") {
      paths.add(node.path);
      return;
    }
    node.children.forEach(visit);
  }
  state.workspace?.libraries.forEach(visit);
  state.workspace?.projects.forEach(visit);
  return paths.size;
}

function renderLoadedFileCount() {
  if (!state.workspace) return;
  const count = loadedFileCount();
  elements.fileCount.textContent = count ? `${formatNumber(count)}+` : "按需";
  elements.fileCount.title = "文稿随目录展开按需加载，不预先遍历整个工作区";
}

// 只改当前高亮行，不重建整棵树——重建会把作者正在翻的目录全部收起
function syncActiveRow() {
  const activePath = state.activeFile?.path;
  elements.fileTree.querySelectorAll(".file-row").forEach((row) => {
    row.dataset.active = String(row.dataset.path === activePath);
  });
}

function searchTruncationMessage() {
  const status = state.searchTruncation;
  if (!status) return "";
  const messages = [];
  if (status.byResults) {
    messages.push(
      `匹配结果超过 ${formatNumber(status.limits.maxResults)} 条，仅显示最先找到的部分，请输入更精确的文件名`,
    );
  }
  if (status.byNodes) {
    messages.push(
      `搜索达到 ${formatNumber(status.limits.maxNodes)} 个节点的扫描上限，后续目录尚未检查，请直接展开目标目录查找`,
    );
  }
  if (status.byDepth) {
    messages.push(
      `部分目录超过 ${formatNumber(status.limits.maxDepth)} 层，更深处未搜索；其他项目已继续搜索`,
    );
  }
  if (status.byReadError) {
    const paths = status.scanErrors.map((entry) => entry.path).filter(Boolean);
    const shown = paths.slice(0, 3).join("、") || "部分目录";
    const more = paths.length > 3 ? `等 ${formatNumber(paths.length)} 处` : "";
    messages.push(
      `${shown}${more}无法读取，搜索结果可能不完整。请检查目录访问权限或外挂盘挂载状态`,
    );
  }
  return messages.join("；");
}

function renderTree() {
  elements.fileTree.replaceChildren();
  elements.treeLoading.hidden = true;
  const query = state.filter.trim();
  const collection = query
    ? state.searchResults
    : state.workspace?.[state.activeView] || [];

  if (query && state.searching) {
    const message = document.createElement("div");
    message.className = "tree-message";
    const text = document.createElement("p");
    text.textContent = `正在搜索“${query}”…`;
    message.append(text);
    elements.fileTree.append(message);
    return;
  }

  if (!collection.length) {
    const message = document.createElement("div");
    message.className = "tree-message";
    const text = document.createElement("p");
    text.textContent = query
      ? state.searchTruncation
        ? `搜索未完成，暂时无法确认是否存在“${query}”`
        : `没有找到“${query}”`
      : state.activeView === "libraries"
        ? "工作区里还没有拆文库。运行拆文 skill 后，档案会出现在这里。"
        : "还没有识别到写作项目。长篇需包含正文、大纲、设定或追踪目录；短篇需包含正文.md，并同时包含小节大纲.md或设定.md。";
    message.append(text);
    elements.fileTree.append(message);
    const truncation = searchTruncationMessage();
    if (query && truncation) {
      const status = document.createElement("div");
      status.className = "tree-message";
      status.setAttribute("role", "status");
      const statusText = document.createElement("p");
      statusText.textContent = truncation;
      status.append(statusText);
      elements.fileTree.append(status);
    }
    return;
  }

  const list = document.createElement("ul");
  collection.forEach((node) => {
    const item = createTreeEntry(node);
    if (item) list.append(item);
  });
  const truncation = searchTruncationMessage();
  if (query && truncation) {
    const status = document.createElement("li");
    status.className = "tree-inline-status";
    status.setAttribute("role", "status");
    status.textContent = truncation;
    list.append(status);
  }
  elements.fileTree.append(list);
}

function truncationMessage(scanErrors = []) {
  const paths = scanErrors.map((entry) => entry.path).filter(Boolean);
  const shown = paths.slice(0, 3).join("、") || "部分目录";
  const more = paths.length > 3 ? `等 ${formatNumber(paths.length)} 处` : "";
  return `${shown}${more}无法读取，其中的文稿没有列出。请检查这些目录的访问权限和外挂盘挂载状态，恢复后刷新目录。`;
}

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
  elements.truncationNotice.querySelector("p").textContent = truncationMessage(scanErrors);
}

function renderWorkspace() {
  const { workspace, stats, libraries, projects, limits, scanErrors } = state.workspace;
  elements.workspaceName.textContent = workspace.name;
  elements.workspacePath.textContent = workspace.path;
  elements.workspacePath.title = workspace.path;
  elements.libraryCount.textContent = formatNumber(stats.libraries);
  elements.projectCount.textContent = formatNumber(stats.projects);
  renderLoadedFileCount();
  elements.librariesBadge.textContent = formatNumber(libraries.length);
  elements.projectsBadge.textContent = formatNumber(projects.length);
  renderTruncationNotice(limits, scanErrors);
  renderTree();
}

async function loadWorkspace({ announce = false } = {}) {
  window.clearTimeout(state.searchTimer);
  state.searchSequence += 1;
  elements.treeLoading.hidden = false;
  elements.fileTree.replaceChildren();
  setConnection("", "连接中");
  try {
    state.workspace = await requestJson("/api/workspace");
    state.searchResults = [];
    state.searchTruncation = null;
    state.searching = Boolean(state.filter.trim());

    // 恢复路由和选中的视图/文件/模式
    const routeParams = getRouteParams();
    const urlView = routeParams.get("view");
    const urlFile = routeParams.get("file");
    const urlMode = routeParams.get("mode");

    let savedFile = null;
    let savedMode = null;
    let savedView = null;
    try {
      savedFile = localStorage.getItem(STORAGE_KEY_LAST_FILE);
      savedMode = localStorage.getItem(STORAGE_KEY_LAST_MODE);
      savedView = localStorage.getItem(STORAGE_KEY_LAST_VIEW);
    } catch {}

    const fileToOpen = urlFile || savedFile;
    const modeToUse = urlMode || savedMode || (state.mode === "preview" ? "preview" : "edit");
    let viewToUse = urlView || (fileToOpen ? deduceViewForPath(fileToOpen) : savedView);

    if (!viewToUse) {
      if (state.workspace.projects?.length > 0 && (!state.workspace.libraries || state.workspace.libraries.length === 0)) {
        viewToUse = "projects";
      } else {
        viewToUse = "libraries";
      }
    }

    if (fileToOpen) {
      expandParentDirs(fileToOpen);
    }

    renderWorkspace();
    setActiveView(viewToUse, { skipUrlSync: true });

    if (fileToOpen && !state.activeFile) {
      await openFile(fileToOpen, { force: true, mode: modeToUse, skipUrlSync: true });
    }

    syncRouteState({ replace: true });

    if (state.filter.trim()) scheduleSearch();
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
  elements.analysisButton.disabled = busy || !state.activeFile;
  updateAnalysisButtonUi();
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

function updateActiveGutterLine() {
  if (!elements.lineNumbersGutter) return;
  const content = elements.editorInput.value;
  const caret = elements.editorInput.selectionStart;
  const before = content.slice(0, caret);
  const currentLine = before.split("\n").length;
  const prevActive = elements.lineNumbersGutter.querySelector(".gutter-line.active");
  if (prevActive && prevActive.dataset.line === String(currentLine)) return;
  if (prevActive) prevActive.classList.remove("active");
  const target = elements.lineNumbersGutter.querySelector(`.gutter-line[data-line='${currentLine}']`);
  if (target) target.classList.add("active");
}

function updateCursorPosition() {
  const content = elements.editorInput.value;
  const caret = elements.editorInput.selectionStart;
  const before = content.slice(0, caret);
  const lines = before.split("\n");
  elements.cursorPosition.textContent = `第 ${lines.length} 行，第 ${[...lines.at(-1)].length + 1} 列`;
  updateActiveGutterLine();
}

let lineMirror = null;
function getLineMirror() {
  if (!lineMirror) {
    lineMirror = document.createElement("div");
    lineMirror.className = "editor-line-mirror";
    document.body.appendChild(lineMirror);
  }
  return lineMirror;
}

function updateLineNumbers() {
  if (!state.showLineNumbers || !elements.lineNumbersGutter || !elements.editorContainer || elements.editorContainer.hidden) return;
  const input = elements.editorInput;
  const text = input.value;
  const lines = text.split("\n");
  const count = lines.length;

  const style = window.getComputedStyle(input);
  const m = getLineMirror();
  m.style.fontFamily = style.fontFamily;
  m.style.fontSize = style.fontSize;
  m.style.fontWeight = style.fontWeight;
  m.style.fontStyle = style.fontStyle;
  m.style.lineHeight = style.lineHeight;
  m.style.letterSpacing = style.letterSpacing;
  m.style.wordSpacing = style.wordSpacing;
  m.style.textTransform = style.textTransform;
  m.style.textIndent = style.textIndent;
  m.style.whiteSpace = "pre-wrap";
  m.style.wordBreak = "break-all";
  m.style.overflowWrap = "break-word";
  m.style.tabSize = style.tabSize || "4";

  const padLeft = parseFloat(style.paddingLeft) || 0;
  const padRight = parseFloat(style.paddingRight) || 0;
  const innerWidth = input.clientWidth - padLeft - padRight;
  if (innerWidth <= 0) return;
  m.style.width = `${innerWidth}px`;

  const gutterWidth = count >= 10000 ? 66 : count >= 1000 ? 56 : 48;
  elements.lineNumbersGutter.style.width = `${gutterWidth}px`;
  elements.lineNumbersGutter.style.flex = `0 0 ${gutterWidth}px`;

  m.innerHTML = lines.map((line) => `<div>${escapeHtml(line) || "&#8203;"}</div>`).join("");

  const caret = input.selectionStart || 0;
  const beforeCaret = text.slice(0, caret);
  const activeLineIndex = beforeCaret.split("\n").length - 1;

  const annotatedLines = new Set((state.annotations || []).map((a) => a.line));

  const lineHeight = parseFloat(style.lineHeight) || 34;
  const children = m.children;
  const gutterHtml = [];
  for (let i = 0; i < count; i++) {
    const rawH = children[i] ? children[i].offsetHeight : lineHeight;
    const visualLines = Math.max(1, Math.round(rawH / lineHeight));
    const h = visualLines * lineHeight;
    const isActive = i === activeLineIndex ? " active" : "";
    const hasAnn = annotatedLines.has(i + 1) ? " has-annotation" : "";
    const annTip = annotatedLines.has(i + 1) ? ` title="第 ${i + 1} 行已有批注，点击可添加或查看"` : ` title="点击为第 ${i + 1} 行添加批注"`;
    gutterHtml.push(`<div class="gutter-line${isActive}${hasAnn}" style="height:${h}px" data-line="${i + 1}"${annTip}>${i + 1}</div>`);
  }
  elements.lineNumbersGutter.innerHTML = gutterHtml.join("");
  elements.lineNumbersGutter.scrollTop = input.scrollTop;
}

const STORAGE_KEY_LINE_NUMBERS = "story_dashboard_show_line_numbers";
const STORAGE_KEY_SHOW_ANNOTATIONS = "story_dashboard_show_annotations";
const STORAGE_KEY_LAST_FILE = "story_dashboard_last_file";
const STORAGE_KEY_LAST_MODE = "story_dashboard_last_mode";
const STORAGE_KEY_LAST_VIEW = "story_dashboard_last_view";

function getRouteParams() {
  let params = new URLSearchParams(window.location.search);
  if (!params.has("file") && window.location.hash) {
    const hashQuery = window.location.hash.replace(/^#\??/, "");
    if (hashQuery.includes("=")) {
      params = new URLSearchParams(hashQuery);
    } else {
      const clean = hashQuery.replace(/^\//, "");
      if (clean) params.set("file", clean);
    }
  }
  return params;
}

function syncRouteState({ replace = true } = {}) {
  const params = new URLSearchParams();
  if (state.activeView) {
    params.set("view", state.activeView);
    try { localStorage.setItem(STORAGE_KEY_LAST_VIEW, state.activeView); } catch {}
  }
  if (state.activeFile?.path) {
    params.set("file", state.activeFile.path);
    try { localStorage.setItem(STORAGE_KEY_LAST_FILE, state.activeFile.path); } catch {}
  } else {
    try { localStorage.removeItem(STORAGE_KEY_LAST_FILE); } catch {}
  }
  if (state.mode && state.activeFile) {
    params.set("mode", state.mode);
    try { localStorage.setItem(STORAGE_KEY_LAST_MODE, state.mode); } catch {}
  }
  const queryString = params.toString();
  const newUrl = queryString ? `${window.location.pathname}?${queryString}` : window.location.pathname;
  const currentUrl = `${window.location.pathname}${window.location.search}`;
  if (newUrl !== currentUrl) {
    if (replace) {
      window.history.replaceState({ file: state.activeFile?.path, mode: state.mode, view: state.activeView }, "", newUrl);
    } else {
      window.history.pushState({ file: state.activeFile?.path, mode: state.mode, view: state.activeView }, "", newUrl);
    }
  }
}

function expandParentDirs(filePath) {
  if (!filePath) return;
  const parts = filePath.split("/");
  let current = "";
  for (let i = 0; i < parts.length - 1; i++) {
    current = current ? `${current}/${parts[i]}` : parts[i];
    state.expandedDirs.add(current);
    state.collapsedDirs.delete(current);
  }
}

function deduceViewForPath(filePath) {
  if (!state.workspace || !filePath) return state.activeView;
  const firstSegment = filePath.split("/")[0];
  if (state.workspace.libraries?.some((lib) => lib.path === firstSegment || filePath.startsWith(lib.path + "/"))) {
    return "libraries";
  }
  if (state.workspace.projects?.some((proj) => proj.path === firstSegment || filePath.startsWith(proj.path + "/"))) {
    return "projects";
  }
  return state.activeView;
}

function setLineNumbersVisible(visible) {
  state.showLineNumbers = visible;
  if (elements.editorBody) {
    elements.editorBody.classList.toggle("show-line-numbers", visible);
  }
  if (elements.lineNumbersButton) {
    elements.lineNumbersButton.setAttribute("aria-pressed", String(visible));
  }
  try {
    localStorage.setItem(STORAGE_KEY_LINE_NUMBERS, String(visible));
  } catch {}
  if (visible && state.mode !== "preview") {
    window.requestAnimationFrame(() => updateLineNumbers());
  }
}

function initLineNumbers() {
  let stored = true;
  try {
    const val = localStorage.getItem(STORAGE_KEY_LINE_NUMBERS);
    if (val !== null) stored = val === "true";
  } catch {}
  setLineNumbersVisible(stored);
}

async function openFile(path, { force = false, mode = null, skipUrlSync = false } = {}) {
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
    expandParentDirs(file.path);
    const expectedView = deduceViewForPath(file.path);
    if (expectedView && expectedView !== state.activeView) {
      setActiveView(expectedView, { skipUrlSync: true });
    }
    const targetMode = mode || (state.mode === "preview" ? "preview" : "edit");
    setMode(targetMode, { skipUrlSync: true });
    updateDocumentMeta();
    updateCursorPosition();
    elements.editorEmpty.hidden = true;
    elements.editorWorkspace.hidden = false;
    document.body.classList.add("document-open");
    syncActiveRow();
    if (!skipUrlSync) {
      syncRouteState({ replace: false });
    }
    if (state.showLineNumbers && targetMode !== "preview") {
      updateLineNumbers();
      window.requestAnimationFrame(() => updateLineNumbers());
    }
    if (targetMode !== "preview") {
      window.requestAnimationFrame(() => elements.editorInput.focus());
    }
    syncChapterAnalysisStatus(file.path);
    loadChapterAnnotations(file.path);
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
  let codeStartLine = 1;
  let listType = null;

  const closeList = () => {
    if (listType) output.push(`</${listType}>`);
    listType = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;
    if (line.trim().startsWith("```")) {
      closeList();
      if (inCode) {
        output.push(`<pre data-line="${codeStartLine}"><code>${codeLines.join("\n")}</code></pre>`);
        codeLines = [];
      } else {
        codeStartLine = lineNum;
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
      output.push(`<h${level} data-line="${lineNum}">${inlineMarkdown(heading[2])}</h${level}>`);
    } else if (unordered || ordered) {
      const nextType = unordered ? "ul" : "ol";
      if (listType !== nextType) {
        closeList();
        listType = nextType;
        output.push(`<${listType}>`);
      }
      output.push(`<li data-line="${lineNum}">${inlineMarkdown((unordered || ordered)[1])}</li>`);
    } else if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
      closeList();
      output.push(`<hr data-line="${lineNum}">`);
    } else if (line.startsWith("&gt; ")) {
      closeList();
      output.push(`<blockquote data-line="${lineNum}">${inlineMarkdown(line.slice(5))}</blockquote>`);
    } else if (line.trim()) {
      closeList();
      output.push(`<p data-line="${lineNum}">${inlineMarkdown(line)}</p>`);
    } else {
      closeList();
    }
  }
  if (inCode) output.push(`<pre data-line="${codeStartLine}"><code>${codeLines.join("\n")}</code></pre>`);
  closeList();
  return output.join("");
}

function setMode(mode, { skipUrlSync = false } = {}) {
  state.mode = mode;
  elements.modeButtons.forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.mode === mode));
  });
  const previewing = mode === "preview";
  if (elements.editorContainer) {
    elements.editorContainer.hidden = previewing;
  } else {
    elements.editorInput.hidden = previewing;
  }
  elements.previewPane.hidden = !previewing;
  if (elements.editorBody) {
    elements.editorBody.classList.toggle("show-annotations", !previewing && state.showAnnotationsSidebar);
  }
  if (previewing) {
    elements.previewPane.innerHTML = markdownToSafeHtml(elements.editorInput.value);
  } else {
    if (state.showLineNumbers) {
      updateLineNumbers();
      window.requestAnimationFrame(() => updateLineNumbers());
    }
    window.requestAnimationFrame(() => elements.editorInput.focus());
  }
  if (!skipUrlSync) {
    syncRouteState({ replace: true });
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
    syncRouteState({ replace: true });
    await loadWorkspace();
    showToast(`已删除《${file.name}》`);
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    state.deleting = false;
    syncActionAvailability();
  }
}

async function searchWorkspace(query, sequence) {
  state.searching = true;
  renderTree();
  try {
    const result = await requestJson(
      `/api/search?q=${encodeURIComponent(query)}&scope=${encodeURIComponent(state.activeView)}`,
    );
    if (sequence !== state.searchSequence) return;
    state.searchResults = result.results;
    state.searchTruncation = result.truncated
      ? {
          ...(result.truncation || {
            byResults: true,
            byNodes: false,
            byDepth: false,
            byReadError: false,
          }),
          scanErrors: result.scanErrors || [],
          limits: result.limits,
        }
      : null;
  } catch (error) {
    if (sequence !== state.searchSequence) return;
    state.searchResults = [];
    state.searchTruncation = null;
    showToast(error.message, "error");
  } finally {
    if (sequence === state.searchSequence) {
      state.searching = false;
      renderTree();
    }
  }
}

function scheduleSearch() {
  window.clearTimeout(state.searchTimer);
  const query = state.filter.trim();
  state.searchSequence += 1;
  const sequence = state.searchSequence;
  if (!query) {
    state.searching = false;
    state.searchResults = [];
    state.searchTruncation = null;
    renderTree();
    return;
  }
  state.searching = true;
  renderTree();
  state.searchTimer = window.setTimeout(() => searchWorkspace(query, sequence), 180);
}

function setActiveView(view, { skipUrlSync = false } = {}) {
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
  if (state.filter.trim()) {
    scheduleSearch();
  } else {
    renderTree();
  }
  if (!skipUrlSync) {
    syncRouteState({ replace: true });
  }
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
  scheduleSearch();
});

elements.treeSearch.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.currentTarget.value = "";
    state.filter = "";
    scheduleSearch();
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
  if (state.showLineNumbers) {
    updateLineNumbers();
  }
});

elements.editorInput.addEventListener("scroll", () => {
  if (elements.lineNumbersGutter) {
    elements.lineNumbersGutter.scrollTop = elements.editorInput.scrollTop;
  }
}, { passive: true });

if (elements.lineNumbersGutter) {
  elements.lineNumbersGutter.addEventListener("wheel", (event) => {
    elements.editorInput.scrollTop += event.deltaY;
  }, { passive: true });
}

if (elements.lineNumbersGutter) {
  elements.lineNumbersGutter.addEventListener("click", (event) => {
    const lineEl = event.target.closest(".gutter-line");
    if (!lineEl) return;
    const lineNum = parseInt(lineEl.dataset.line, 10);
    if (!lineNum) return;
    const lines = elements.editorInput.value.split("\n");
    let charIndex = 0;
    for (let i = 0; i < lineNum - 1; i++) {
      charIndex += lines[i].length + 1;
    }
    elements.editorInput.focus();
    elements.editorInput.setSelectionRange(charIndex, charIndex);
    updateCursorPosition();

    // 呼出行级批注添加框
    const lineText = lines[lineNum - 1] || "";
    openAnnotationPopover(lineNum, lineText);
  });
}

if (elements.lineNumbersButton) {
  elements.lineNumbersButton.addEventListener("click", () => {
    setLineNumbersVisible(!state.showLineNumbers);
  });
}

if (window.ResizeObserver && elements.editorInput) {
  const resizeObserver = new ResizeObserver(() => {
    if (state.showLineNumbers && state.mode !== "preview") {
      updateLineNumbers();
    }
  });
  resizeObserver.observe(elements.editorInput);
} else {
  window.addEventListener("resize", () => {
    if (state.showLineNumbers && state.mode !== "preview") {
      updateLineNumbers();
    }
  });
}

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
  if (modifier && event.key.toLocaleLowerCase() === "l" && event.altKey) {
    event.preventDefault();
    setLineNumbersVisible(!state.showLineNumbers);
  }
});

window.addEventListener("beforeunload", (event) => {
  if (state.dirty) {
    event.preventDefault();
    event.returnValue = "";
  }
});

window.addEventListener("popstate", () => {
  const params = getRouteParams();
  const file = params.get("file");
  const mode = params.get("mode") || "edit";
  const view = params.get("view");
  if (view && view !== state.activeView) {
    setActiveView(view, { skipUrlSync: true });
  }
  if (file) {
    if (file !== state.activeFile?.path) {
      openFile(file, { force: false, mode, skipUrlSync: true });
    } else if (mode !== state.mode) {
      setMode(mode, { skipUrlSync: true });
    }
  } else if (state.activeFile) {
    state.activeFile = null;
    state.originalContent = "";
    elements.editorInput.value = "";
    elements.editorWorkspace.hidden = true;
    elements.editorEmpty.hidden = false;
    document.body.classList.remove("document-open");
    setDirty(false);
    syncActiveRow();
  }
});

// ==========================================
// 章节剧情分析模块 (Chapter Analysis)
// ==========================================

const ANALYSIS_PREF_KEY = "oh_story_analysis_preferred_method";

// 全局后台轮询器映射表: filePath -> timerId (即使弹窗关闭也持续在后台轮询)
const backgroundAnalysisPollers = new Map();

// 本地章节分析状态缓存: filePath -> "none" | "running" | "completed" | "failed"
const chapterAnalysisStatusCache = new Map();

let currentAnalysisTab = "overview";

function getPreferredAnalysisMethod() {
  try {
    return localStorage.getItem(ANALYSIS_PREF_KEY) || null;
  } catch {
    return null;
  }
}

function setPreferredAnalysisMethod(method) {
  try {
    localStorage.setItem(ANALYSIS_PREF_KEY, method);
  } catch {}
}

function updateAnalysisButtonUi() {
  if (!elements.analysisButton) return;
  if (!state.activeFile) {
    elements.analysisButton.classList.remove("is-running");
    if (elements.analysisBtnLabel) elements.analysisBtnLabel.textContent = "剧情分析";
    elements.analysisButton.title = "剧情深度分析";
    return;
  }
  const currentPath = state.activeFile.path;
  const status = chapterAnalysisStatusCache.get(currentPath) || "none";
  const isRunning = status === "running";

  if (isRunning) {
    elements.analysisButton.classList.add("is-running");
    if (elements.analysisBtnLabel) elements.analysisBtnLabel.textContent = "正在分析...";
    elements.analysisButton.title = "剧情深度分析进行中，点击可查看实时进度";
  } else {
    elements.analysisButton.classList.remove("is-running");
    if (elements.analysisBtnLabel) elements.analysisBtnLabel.textContent = "剧情分析";
    elements.analysisButton.title = "剧情深度分析";
  }
}

async function syncChapterAnalysisStatus(filePath) {
  if (!filePath) return;
  try {
    const res = await requestJson(`/api/chapter-analysis/status?path=${encodeURIComponent(filePath)}`);
    const status = res.status || (res.exists ? "completed" : "none");
    chapterAnalysisStatusCache.set(filePath, status);

    if (status === "running") {
      ensureBackgroundAnalysisPolling(filePath, state.activeFile?.name || "");
    }
    if (state.activeFile?.path === filePath) {
      updateAnalysisButtonUi();
    }
  } catch {
    // 忽略轻量状态同步异常
  }
}

function ensureBackgroundAnalysisPolling(filePath, fileName = "") {
  if (backgroundAnalysisPollers.has(filePath)) {
    return; // 已经在后台轮询中
  }

  chapterAnalysisStatusCache.set(filePath, "running");
  if (state.activeFile?.path === filePath) {
    updateAnalysisButtonUi();
  }

  const pollInterval = 2500;
  const pollerId = setInterval(async () => {
    try {
      const res = await requestJson(`/api/chapter-analysis/status?path=${encodeURIComponent(filePath)}`);
      const status = res.status || (res.exists ? "completed" : "none");
      chapterAnalysisStatusCache.set(filePath, status);

      // 如果弹窗正在展示当前文件，同步更新加载文案
      if (elements.analysisDialog.open && state.activeFile?.path === filePath) {
        if (res.message && elements.analysisLoadingMsg) {
          elements.analysisLoadingMsg.textContent = res.message;
        }
      }

      if (status === "completed") {
        clearInterval(pollerId);
        backgroundAnalysisPollers.delete(filePath);

        if (state.activeFile?.path === filePath) {
          updateAnalysisButtonUi();
          if (elements.analysisDialog.open) {
            const fullRes = await requestJson(`/api/chapter-analysis?path=${encodeURIComponent(filePath)}`);
            if (fullRes.exists && fullRes.data) {
              renderAnalysisData(fullRes.data);
            }
          }
        }

        const title = fileName || filePath.split("/").pop() || "当前章节";
        showToast(`《${title}》剧情分析已完成！`, "success");
      } else if (status === "failed") {
        clearInterval(pollerId);
        backgroundAnalysisPollers.delete(filePath);

        if (state.activeFile?.path === filePath) {
          updateAnalysisButtonUi();
          if (elements.analysisDialog.open) {
            elements.analysisLoadingView.hidden = true;
            elements.analysisResultView.hidden = true;
            elements.analysisEmptyView.hidden = false;
          }
        }
        showToast(res.message || "剧情分析失败，请稍后重试", "error");
      }
    } catch {
      // 容忍网络抖动，继续下一次轮询
    }
  }, pollInterval);

  backgroundAnalysisPollers.set(filePath, pollerId);
}

function switchAnalysisTab(targetTab) {
  currentAnalysisTab = targetTab;
  elements.analysisTabs.forEach((tab) => {
    const isSelected = tab.dataset.tab === targetTab;
    tab.setAttribute("aria-selected", isSelected ? "true" : "false");
  });
  Object.entries(elements.tabPanels).forEach(([key, panel]) => {
    if (!panel) return;
    if (key === targetTab) {
      panel.hidden = false;
      panel.classList.add("active");
    } else {
      panel.hidden = true;
      panel.classList.remove("active");
    }
  });
}

async function openAnalysisDialog() {
  if (!state.activeFile) return;
  const filePath = state.activeFile.path;
  const fileName = state.activeFile.name;

  elements.analysisChapterTitle.textContent = fileName;
  const wordCount = (state.activeFile.content || "").replace(/\s+/g, "").length;
  elements.analysisWordCountTag.textContent = `${formatNumber(wordCount)} 字`;
  elements.analysisScoreBadge.hidden = true;
  elements.analysisMethodBadge.hidden = true;
  elements.analysisConfigPanel.hidden = true;

  const currentStatus = chapterAnalysisStatusCache.get(filePath);

  // 1. 如果已在后台运行中：打开弹窗直接展示进度
  if (currentStatus === "running") {
    elements.analysisEmptyView.hidden = true;
    elements.analysisResultView.hidden = true;
    elements.analysisLoadingView.hidden = false;
    elements.analysisLoadingTitle.textContent = "正在进行剧情深度剖析…";
    elements.analysisLoadingMsg.textContent = "分析任务正在后台运行中，已同步分析进度...";
    elements.reanalyzeButton.hidden = true;
    if (!elements.analysisDialog.open) elements.analysisDialog.showModal();
    ensureBackgroundAnalysisPolling(filePath, fileName);
    return;
  }

  // 2. 先展示加载过渡
  elements.analysisEmptyView.hidden = true;
  elements.analysisResultView.hidden = true;
  elements.analysisLoadingView.hidden = false;
  elements.analysisLoadingTitle.textContent = "正在读取分析数据…";
  elements.analysisLoadingMsg.textContent = "请稍候，正在获取本章分析状态...";
  if (!elements.analysisDialog.open) elements.analysisDialog.showModal();

  try {
    const res = await requestJson(`/api/chapter-analysis/status?path=${encodeURIComponent(filePath)}`);
    const status = res.status || (res.exists ? "completed" : "none");
    chapterAnalysisStatusCache.set(filePath, status);

    // 若在异步等待期间用户已切换到其他章节，终止本次UI覆盖
    if (state.activeFile?.path !== filePath) return;

    if (status === "completed") {
      updateAnalysisButtonUi();
      const fullRes = await requestJson(`/api/chapter-analysis?path=${encodeURIComponent(filePath)}`);
      if (state.activeFile?.path !== filePath) return;
      if (fullRes.exists && fullRes.data) {
        renderAnalysisData(fullRes.data);
      } else {
        clearAnalysisDataUi();
        elements.analysisLoadingView.hidden = true;
        elements.analysisEmptyView.hidden = false;
      }
    } else if (status === "running") {
      clearAnalysisDataUi();
      updateAnalysisButtonUi();
      elements.analysisLoadingTitle.textContent = "正在进行剧情深度剖析…";
      elements.analysisLoadingMsg.textContent = res.message || "任务已通知 Antigravity，正在提取剧情钩子与伏笔细节...";
      elements.reanalyzeButton.hidden = true;
      ensureBackgroundAnalysisPolling(filePath, fileName);
    } else {
      // 未分析状态 (none)
      clearAnalysisDataUi();
      const preferredMethod = getPreferredAnalysisMethod();
      if (preferredMethod) {
        // 用户已记住偏好（如 antigravity），自动发起分析任务！
        await startChapterAnalysis({ force: false });
      } else {
        // 首次使用，展示引导选择界面
        elements.analysisLoadingView.hidden = true;
        elements.analysisResultView.hidden = true;
        elements.analysisEmptyView.hidden = false;
        elements.reanalyzeButton.hidden = true;
      }
    }
  } catch (err) {
    if (state.activeFile?.path === filePath) {
      showToast(err.message, "error");
      elements.analysisLoadingView.hidden = true;
      elements.analysisEmptyView.hidden = false;
    }
  }
}

async function startChapterAnalysis({ force = false } = {}) {
  if (!state.activeFile) return;
  const filePath = state.activeFile.path;
  const fileName = state.activeFile.name;

  let hasApiKey = false;
  try {
    const cfg = await requestJson("/api/ai-config");
    hasApiKey = Boolean(cfg?.hasApiKey || cfg?.apiKey);
  } catch {}

  const useAntigravity = !hasApiKey;
  setPreferredAnalysisMethod(useAntigravity ? "antigravity" : "api");

  elements.analysisEmptyView.hidden = true;
  elements.analysisResultView.hidden = true;
  elements.analysisLoadingView.hidden = false;
  elements.analysisLoadingTitle.textContent = "已发起剧情深度剖析…";
  elements.analysisLoadingMsg.textContent = useAntigravity
    ? "任务已发派至 Agent，正在深度梳理全章伏笔、角色状态与钩子设计..."
    : "正在调用配置的模型接口进行全章深度剧情剖析...";
  elements.reanalyzeButton.hidden = true;

  // 立即将顶部按钮更新为正在分析中，启动后台轮询
  chapterAnalysisStatusCache.set(filePath, "running");
  updateAnalysisButtonUi();

  try {
    const res = await requestJson("/api/chapter-analysis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: filePath,
        force,
        useAntigravity,
        method: useAntigravity ? "antigravity" : "external_api",
      }),
    });

    if (res.status === "completed" && res.data) {
      chapterAnalysisStatusCache.set(filePath, "completed");
      if (state.activeFile?.path === filePath) {
        updateAnalysisButtonUi();
        if (elements.analysisDialog.open) {
          renderAnalysisData(res.data);
        }
      }
      showToast(`《${fileName}》剧情分析完成！`, "success");
    } else {
      // 启动后台轮询（即使弹窗关闭也不会停止）
      ensureBackgroundAnalysisPolling(filePath, fileName);
    }
  } catch (err) {
    chapterAnalysisStatusCache.set(filePath, "failed");
    if (state.activeFile?.path === filePath) {
      updateAnalysisButtonUi();
      elements.analysisLoadingView.hidden = true;
      elements.analysisEmptyView.hidden = false;
    }
    showToast(err.message, "error");
  }
}

function clearAnalysisDataUi() {
  currentAnalysisData = null;
  if (elements.analysisScoreBadge) {
    elements.analysisScoreBadge.hidden = true;
    elements.analysisScoreBadge.textContent = "- 分";
  }
  if (elements.analysisMethodBadge) {
    elements.analysisMethodBadge.hidden = true;
  }

  const scoreOverall = document.querySelector("#scoreOverall");
  if (scoreOverall) scoreOverall.textContent = "0.0";
  const scorePacing = document.querySelector("#scorePacing");
  if (scorePacing) scorePacing.textContent = "0.0";
  const scoreEngagement = document.querySelector("#scoreEngagement");
  if (scoreEngagement) scoreEngagement.textContent = "0.0";
  const scoreCoherence = document.querySelector("#scoreCoherence");
  if (scoreCoherence) scoreCoherence.textContent = "0.0";

  const meterOverall = document.querySelector("#meterOverall");
  if (meterOverall) meterOverall.style.width = "0%";
  const meterPacing = document.querySelector("#meterPacing");
  if (meterPacing) meterPacing.style.width = "0%";
  const meterEngagement = document.querySelector("#meterEngagement");
  if (meterEngagement) meterEngagement.style.width = "0%";
  const meterCoherence = document.querySelector("#meterCoherence");
  if (meterCoherence) meterCoherence.style.width = "0%";

  const justEl = document.querySelector("#analysisJustification");
  if (justEl) justEl.textContent = "";
  const repEl = document.querySelector("#analysisSummaryReport");
  if (repEl) repEl.textContent = "";

  const suggestionsList = document.querySelector("#analysisSuggestionsList");
  if (suggestionsList) suggestionsList.replaceChildren();

  if (elements.regenPendingNotice) {
    elements.regenPendingNotice.hidden = true;
  }

  const hooksList = document.querySelector("#hooksList");
  if (hooksList) hooksList.replaceChildren();
  if (elements.hooksBadge) elements.hooksBadge.textContent = "0";

  const foreshadowsList = document.querySelector("#foreshadowsList");
  if (foreshadowsList) foreshadowsList.replaceChildren();
  if (elements.foreshadowsBadge) elements.foreshadowsBadge.textContent = "0";

  const charactersList = document.querySelector("#charactersList");
  if (charactersList) charactersList.replaceChildren();
  if (elements.charactersBadge) elements.charactersBadge.textContent = "0";

  const plotPointsList = document.querySelector("#plotPointsList");
  if (plotPointsList) plotPointsList.replaceChildren();
  if (elements.plotPointsBadge) elements.plotPointsBadge.textContent = "0";
}

async function checkPendingRegenerationNotice(filePath) {
  if (!elements.regenPendingNotice || !filePath) return;
  try {
    const res = await requestJson(`/api/chapter-regenerate/status?path=${encodeURIComponent(filePath)}`);
    if (res.exists && res.status === "completed" && res.newContent) {
      elements.regenPendingNotice.hidden = false;
      if (elements.viewPendingMergeButton) {
        elements.viewPendingMergeButton.onclick = () => {
          openDiffMergeDialog(res.originalContent || state.activeFile?.content || "", res.newContent);
        };
      }
    } else {
      elements.regenPendingNotice.hidden = true;
    }
  } catch {
    elements.regenPendingNotice.hidden = true;
  }
}

function renderAnalysisData(data) {
  currentAnalysisData = data;
  elements.analysisEmptyView.hidden = true;
  elements.analysisLoadingView.hidden = true;
  elements.analysisResultView.hidden = false;
  elements.reanalyzeButton.hidden = false;

  checkPendingRegenerationNotice(state.activeFile?.path);

  const analysis = data.analysis || {};
  const scores = analysis.scores || {};

  if (scores.overall !== undefined) {
    elements.analysisScoreBadge.hidden = false;
    elements.analysisScoreBadge.textContent = `${scores.overall} 分`;
  }
  if (data.method) {
    elements.analysisMethodBadge.hidden = false;
    elements.analysisMethodBadge.textContent = data.method === "antigravity" ? "⚡️ Antigravity" : "🌐 API";
  }

  const scoreOverall = Number(scores.overall || 0);
  const scorePacing = Number(scores.pacing || 0);
  const scoreEngagement = Number(scores.engagement || 0);
  const scoreCoherence = Number(scores.coherence || 0);

  document.querySelector("#scoreOverall").textContent = scoreOverall.toFixed(1);
  document.querySelector("#scorePacing").textContent = scorePacing.toFixed(1);
  document.querySelector("#scoreEngagement").textContent = scoreEngagement.toFixed(1);
  document.querySelector("#scoreCoherence").textContent = scoreCoherence.toFixed(1);

  document.querySelector("#meterOverall").style.width = `${Math.min(100, scoreOverall * 10)}%`;
  document.querySelector("#meterPacing").style.width = `${Math.min(100, scorePacing * 10)}%`;
  document.querySelector("#meterEngagement").style.width = `${Math.min(100, scoreEngagement * 10)}%`;
  document.querySelector("#meterCoherence").style.width = `${Math.min(100, scoreCoherence * 10)}%`;

  document.querySelector("#analysisJustification").textContent = scores.score_justification || "暂无简评";
  document.querySelector("#analysisSummaryReport").textContent = analysis.analysis_report || "";

  const suggestionsList = document.querySelector("#analysisSuggestionsList");
  suggestionsList.replaceChildren();
  const suggestions = analysis.suggestions || [];
  if (suggestions.length === 0) {
    const li = document.createElement("li");
    li.textContent = "本章完成度极高，未发现明显阻滞问题，继续保持节奏！";
    suggestionsList.append(li);
  } else {
    suggestions.forEach((s) => {
      const li = document.createElement("li");
      li.textContent = s;
      suggestionsList.append(li);
    });
  }

  const hooks = analysis.hooks || [];
  elements.hooksBadge.textContent = String(hooks.length);
  const hooksList = document.querySelector("#hooksList");
  hooksList.replaceChildren();
  if (hooks.length === 0) {
    hooksList.innerHTML = '<p class="tree-message">本章暂未识别到显著钩子</p>';
  } else {
    hooks.forEach((hook) => {
      const card = document.createElement("div");
      card.className = "item-card";
      card.innerHTML = `
        <div class="item-card-header">
          <div class="item-card-badges">
            <span class="pill-tag blue">${escapeHtml(hook.type || "钩子")}</span>
            <span class="pill-tag amber">${escapeHtml(hook.position || "中段")}</span>
            <span class="pill-tag red">强度 ${hook.strength || 8}/10</span>
          </div>
        </div>
        <p class="item-description">${escapeHtml(hook.content || "")}</p>
        ${hook.keyword ? `<div class="quote-snippet"><b>原文锚点：</b>"${escapeHtml(hook.keyword)}"</div>` : ""}
      `;
      hooksList.append(card);
    });
  }

  const foreshadows = analysis.foreshadows || [];
  elements.foreshadowsBadge.textContent = String(foreshadows.length);
  const foreshadowsList = document.querySelector("#foreshadowsList");
  foreshadowsList.replaceChildren();
  if (foreshadows.length === 0) {
    foreshadowsList.innerHTML = '<p class="tree-message">本章暂未识别到伏笔</p>';
  } else {
    foreshadows.forEach((f) => {
      const card = document.createElement("div");
      card.className = "item-card";
      const isPlanted = f.type === "planted";
      card.innerHTML = `
        <div class="item-card-header">
          <div class="item-card-badges">
            <span class="pill-tag ${isPlanted ? "green" : "purple"}">${isPlanted ? "已埋下" : "已回收"}</span>
            <span class="pill-tag gray">强度 ${f.strength || 8}/10</span>
            <span class="pill-tag gray">隐藏度 ${f.subtlety || 7}/10</span>
            ${f.reference_chapter ? `<span class="pill-tag blue">呼应第${f.reference_chapter}章</span>` : ""}
          </div>
        </div>
        <div class="item-title">${escapeHtml(f.title || "未命名伏笔")}</div>
        <p class="item-description">${escapeHtml(f.content || "")}</p>
        ${f.keyword ? `<div class="quote-snippet"><b>原文锚点：</b>"${escapeHtml(f.keyword)}"</div>` : ""}
      `;
      foreshadowsList.append(card);
    });
  }

  const emotional = analysis.emotional_arc || {};
  document.querySelector("#primaryEmotion").textContent = emotional.primary_emotion || "平静";
  document.querySelector("#emotionIntensity").textContent = `${emotional.intensity || 5} / 10`;
  document.querySelector("#emotionCurve").textContent = emotional.curve || "平缓起伏";
  const secondaryEmotionsEl = document.querySelector("#secondaryEmotions");
  secondaryEmotionsEl.replaceChildren();
  (emotional.secondary_emotions || []).forEach((e) => {
    const span = document.createElement("span");
    span.className = "pill-tag blue";
    span.textContent = e;
    secondaryEmotionsEl.append(span);
  });

  const conflict = analysis.conflict || {};
  document.querySelector("#conflictLevel").textContent = `${conflict.level || 5} / 10`;
  document.querySelector("#conflictProgress").textContent = `${Math.round((conflict.resolution_progress || 0) * 100)}%`;
  const conflictTypesEl = document.querySelector("#conflictTypes");
  conflictTypesEl.replaceChildren();
  (conflict.types || []).forEach((t) => {
    const span = document.createElement("span");
    span.className = "pill-tag red";
    span.textContent = t;
    conflictTypesEl.append(span);
  });
  const conflictPartiesEl = document.querySelector("#conflictParties");
  conflictPartiesEl.replaceChildren();
  (conflict.parties || []).forEach((p) => {
    const span = document.createElement("span");
    span.className = "pill-tag amber";
    span.textContent = p;
    conflictPartiesEl.append(span);
  });
  document.querySelector("#conflictDescription").textContent = conflict.description || "无显著冲突";

  const characters = analysis.character_states || [];
  elements.charactersBadge.textContent = String(characters.length);
  const charactersList = document.querySelector("#charactersList");
  charactersList.replaceChildren();
  if (characters.length === 0) {
    charactersList.innerHTML = '<p class="tree-message">本章暂未提取到角色状态变动</p>';
  } else {
    characters.forEach((char) => {
      const card = document.createElement("div");
      card.className = "character-state-card";
      let relHtml = "";
      if (char.relationship_changes && Object.keys(char.relationship_changes).length > 0) {
        relHtml = Object.entries(char.relationship_changes)
          .map(([name, change]) => `<span class="pill-tag blue">与 ${escapeHtml(name)}: ${escapeHtml(change)}</span>`)
          .join(" ");
      }
      card.innerHTML = `
        <div class="char-header">
          <span class="char-name">${escapeHtml(char.character_name || "未知角色")}</span>
          ${char.survival_status ? `<span class="pill-tag red">${escapeHtml(char.survival_status)}</span>` : ""}
        </div>
        <div class="char-flow">
          <span class="char-state-tag">${escapeHtml(char.state_before || "初始")}</span>
          <span class="char-arrow">➔</span>
          <span class="char-state-tag"><strong>${escapeHtml(char.state_after || "蜕变")}</strong></span>
        </div>
        ${char.psychological_change ? `<div class="char-detail-row"><strong>心理演变：</strong>${escapeHtml(char.psychological_change)}</div>` : ""}
        ${char.key_event ? `<div class="char-detail-row"><strong>核心诱因：</strong>${escapeHtml(char.key_event)}</div>` : ""}
        ${relHtml ? `<div class="char-detail-row" style="margin-top: 8px;"><strong>关系变化：</strong>${relHtml}</div>` : ""}
      `;
      charactersList.append(card);
    });
  }

  const plotPoints = analysis.plot_points || [];
  elements.plotPointsBadge.textContent = String(plotPoints.length);
  const plotPointsList = document.querySelector("#plotPointsList");
  plotPointsList.replaceChildren();
  if (plotPoints.length === 0) {
    plotPointsList.innerHTML = '<p class="tree-message">本章暂无情节点数据</p>';
  } else {
    plotPoints.forEach((point, index) => {
      const card = document.createElement("div");
      card.className = "item-card";
      card.innerHTML = `
        <div class="item-card-header">
          <div class="item-card-badges">
            <span class="pill-tag blue">节点 ${index + 1}</span>
            <span class="pill-tag amber">${escapeHtml(point.type || "情节")}</span>
            <span class="pill-tag green">关键度 ${Math.round((point.importance || 0.8) * 100)}%</span>
          </div>
        </div>
        <div class="item-title">${escapeHtml(point.content || "")}</div>
        ${point.impact ? `<p class="item-description"><strong>故事影响：</strong>${escapeHtml(point.impact)}</p>` : ""}
        ${point.keyword ? `<div class="quote-snippet"><b>原文锚点：</b>"${escapeHtml(point.keyword)}"</div>` : ""}
      `;
      plotPointsList.append(card);
    });
  }

  switchAnalysisTab("overview");
}

async function loadAiConfig() {
  try {
    const config = await requestJson("/api/ai-config");
    elements.cfgBaseUrl.value = config.baseUrl || "";
    elements.cfgModel.value = config.model || "";
    elements.cfgApiKey.value = config.apiKey || "";
  } catch {}
}

async function saveAiConfig() {
  try {
    await requestJson("/api/ai-config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        baseUrl: elements.cfgBaseUrl.value.trim(),
        model: elements.cfgModel.value.trim(),
        apiKey: elements.cfgApiKey.value.trim(),
      }),
    });
    elements.analysisConfigPanel.hidden = true;
    showToast("模型配置已保存！", "success");
  } catch (err) {
    showToast(err.message, "error");
  }
}

// 绑定分析弹窗事件
elements.analysisButton.addEventListener("click", () => {
  openAnalysisDialog();
});

elements.closeAnalysisDialogButton.addEventListener("click", () => {
  elements.analysisDialog.close();
});

// 关闭弹窗时保持后台任务与轮询继续执行，不中断分析进程
elements.analysisDialog.addEventListener("close", () => {
  // 保持后台轮询 (backgroundAnalysisPollers) 继续运作
});

elements.reanalyzeButton.addEventListener("click", () => {
  startChapterAnalysis({ force: true });
});

elements.startAnalysisBtn.addEventListener("click", () => {
  startChapterAnalysis({ force: false });
});

elements.analysisConfigToggle.addEventListener("click", () => {
  elements.analysisConfigPanel.hidden = !elements.analysisConfigPanel.hidden;
  if (!elements.analysisConfigPanel.hidden) {
    loadAiConfig();
  }
});

elements.closeConfigButton.addEventListener("click", () => {
  elements.analysisConfigPanel.hidden = true;
});

elements.saveConfigButton.addEventListener("click", () => {
  saveAiConfig();
});

let currentAnalysisData = null;
let currentDiffChunks = [];
let currentDiffOriginalText = "";
let currentDiffNewText = "";
let regenPollIntervalId = null;
let verifyPrecheckTimer = null;

function computeLineDiff(originalText, newText) {
  const origLines = (originalText || "").split(/\r?\n/);
  const newLines = (newText || "").split(/\r?\n/);
  const n = origLines.length;
  const m = newLines.length;

  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      if (origLines[i] === newLines[j]) {
        dp[i + 1][j + 1] = dp[i][j] + 1;
      } else {
        dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  let i = n;
  let j = m;
  const edits = [];
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && origLines[i - 1] === newLines[j - 1]) {
      edits.unshift({ type: "equal", line: origLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      edits.unshift({ type: "insert", line: newLines[j - 1] });
      j--;
    } else {
      edits.unshift({ type: "delete", line: origLines[i - 1] });
      i--;
    }
  }

  const chunks = [];
  let currentChunk = null;
  for (let idx = 0; idx < edits.length; idx++) {
    const edit = edits[idx];
    if (edit.type === "equal") {
      if (currentChunk && currentChunk.type !== "equal") {
        chunks.push(currentChunk);
        currentChunk = null;
      }
      if (!currentChunk) {
        currentChunk = { type: "equal", lines: [] };
      }
      currentChunk.lines.push(edit.line);
    } else {
      if (currentChunk && currentChunk.type !== "modified") {
        chunks.push(currentChunk);
        currentChunk = null;
      }
      if (!currentChunk) {
        currentChunk = { type: "modified", origLines: [], newLines: [] };
      }
      if (edit.type === "delete") {
        currentChunk.origLines.push(edit.line);
      } else if (edit.type === "insert") {
        currentChunk.newLines.push(edit.line);
      }
    }
  }
  if (currentChunk) {
    chunks.push(currentChunk);
  }

  let hunkCounter = 0;
  let origLineCursor = 1;
  let newLineCursor = 1;

  chunks.forEach((chunk) => {
    if (chunk.type === "equal") {
      chunk.origStartLine = origLineCursor;
      chunk.newStartLine = newLineCursor;
      origLineCursor += chunk.lines.length;
      newLineCursor += chunk.lines.length;
    } else {
      hunkCounter++;
      chunk.hunkId = hunkCounter;
      chunk.origStartLine = origLineCursor;
      chunk.origEndLine = origLineCursor + Math.max(0, chunk.origLines.length - 1);
      chunk.newStartLine = newLineCursor;
      chunk.newEndLine = newLineCursor + Math.max(0, chunk.newLines.length - 1);
      chunk.accepted = true; // 默认采纳修改，作者可逐块按需取消或一键全选/全不选

      origLineCursor += chunk.origLines.length;
      newLineCursor += chunk.newLines.length;
    }
  });

  return chunks;
}

function buildMergedText(chunks) {
  const resultLines = [];
  for (const chunk of chunks) {
    if (chunk.type === "equal") {
      resultLines.push(...chunk.lines);
    } else {
      if (chunk.accepted) {
        resultLines.push(...chunk.newLines);
      } else {
        resultLines.push(...chunk.origLines);
      }
    }
  }
  return resultLines.join("\n");
}

let diffViewMode = "full"; // "full" | "changes"

function createEqualRow(origLineNum, newLineNum, text) {
  const row = document.createElement("div");
  row.className = "diff-row diff-row-equal";
  row.innerHTML = `
    <div class="diff-cell diff-cell-orig">
      <span class="diff-line-num">${origLineNum}</span>
      <span class="diff-line-text">${escapeHtml(text || " ")}</span>
    </div>
    <div class="diff-cell diff-cell-new">
      <span class="diff-line-num">${newLineNum}</span>
      <span class="diff-line-text">${escapeHtml(text || " ")}</span>
    </div>
  `;
  return row;
}

function updateHunkVisualState(chunk) {
  const controlRow = document.getElementById(`hunk-control-${chunk.hunkId}`);
  if (controlRow) {
    controlRow.className = `diff-hunk-control-row ${chunk.accepted ? "accepted" : "rejected"}`;
    const statusSpan = controlRow.querySelector(".diff-hunk-status");
    if (statusSpan) statusSpan.textContent = chunk.accepted ? "✓ 已采纳修改" : "✕ 保留原稿";
    const toggleBtn = controlRow.querySelector(".diff-hunk-toggle-btn");
    if (toggleBtn) toggleBtn.textContent = chunk.accepted ? "✕ 放弃此块（保留原稿）" : "✓ 采纳此块修改";
  }

  const rows = elements.diffHunksContainer.querySelectorAll(`.diff-row-modified[data-hunk-id="${chunk.hunkId}"]`);
  rows.forEach((row) => {
    row.className = `diff-row diff-row-modified ${chunk.accepted ? "accepted" : "rejected"}`;
  });
}

function openDiffMergeDialog(origText, newText) {
  currentDiffOriginalText = origText || "";
  currentDiffNewText = newText || "";
  currentDiffChunks = computeLineDiff(currentDiffOriginalText, currentDiffNewText);

  elements.diffChapterTitle.textContent = `文本对比与合并 · ${state.activeFile?.name || "当前章节"}`;
  elements.diffMergeSpinner.hidden = true;
  elements.diffMergeStatusMsg.textContent = "";
  elements.applyMergeButton.disabled = false;

  if (elements.diffViewFullBtn && elements.diffViewChangesBtn) {
    if (diffViewMode === "full") {
      elements.diffViewFullBtn.classList.add("active");
      elements.diffViewChangesBtn.classList.remove("active");
    } else {
      elements.diffViewChangesBtn.classList.add("active");
      elements.diffViewFullBtn.classList.remove("active");
    }
  }

  renderDiffHunks();
  updateDiffStats();

  if (elements.diffHunksContainer) {
    elements.diffHunksContainer.scrollTop = 0;
  }

  if (!elements.diffMergeDialog.open) {
    elements.diffMergeDialog.showModal();
  }
  triggerVerificationPrecheck();
}

function renderDiffHunks() {
  const container = elements.diffHunksContainer;
  container.replaceChildren();

  const modifiedHunks = currentDiffChunks.filter((c) => c.type === "modified");
  if (modifiedHunks.length === 0) {
    const emptyHint = document.createElement("div");
    emptyHint.className = "diff-empty-hint";
    emptyHint.textContent = "原稿与重构版本文本完全一致，未检测到行级修改。";
    container.append(emptyHint);
    return;
  }

  currentDiffChunks.forEach((chunk) => {
    if (chunk.type === "equal") {
      const lines = chunk.lines;
      if (diffViewMode === "changes" && lines.length > 6) {
        // 渲染前 2 行上下文
        for (let i = 0; i < 2; i++) {
          container.append(createEqualRow(chunk.origStartLine + i, chunk.newStartLine + i, lines[i]));
        }

        // 折叠提示条
        const collapsedBanner = document.createElement("div");
        collapsedBanner.className = "diff-collapsed-banner";
        collapsedBanner.title = "点击展开此段未改动正文";
        collapsedBanner.textContent = `⋯ 展开 ${lines.length - 4} 行未修改正文 ⋯`;
        collapsedBanner.addEventListener("click", () => {
          const fragment = document.createDocumentFragment();
          for (let i = 2; i < lines.length - 2; i++) {
            fragment.append(createEqualRow(chunk.origStartLine + i, chunk.newStartLine + i, lines[i]));
          }
          collapsedBanner.replaceWith(fragment);
        });
        container.append(collapsedBanner);

        // 渲染后 2 行上下文
        for (let i = lines.length - 2; i < lines.length; i++) {
          container.append(createEqualRow(chunk.origStartLine + i, chunk.newStartLine + i, lines[i]));
        }
      } else {
        // 全景模式：渲染全部相同行
        for (let i = 0; i < lines.length; i++) {
          container.append(createEqualRow(chunk.origStartLine + i, chunk.newStartLine + i, lines[i]));
        }
      }
    } else if (chunk.type === "modified") {
      // 变动块粘性控制栏
      const controlRow = document.createElement("div");
      controlRow.className = `diff-hunk-control-row ${chunk.accepted ? "accepted" : "rejected"}`;
      controlRow.id = `hunk-control-${chunk.hunkId}`;
      controlRow.innerHTML = `
        <div class="diff-hunk-meta">
          <span class="diff-hunk-badge">变动块 #${chunk.hunkId}</span>
          <span class="diff-hunk-range">原稿 L${chunk.origStartLine}-${chunk.origEndLine} ➔ 重写 L${chunk.newStartLine}-${chunk.newEndLine}</span>
          <span class="diff-hunk-status">${chunk.accepted ? "✓ 已采纳修改" : "✕ 保留原稿"}</span>
        </div>
        <button type="button" class="diff-hunk-toggle-btn" data-hunk-id="${chunk.hunkId}">
          ${chunk.accepted ? "✕ 放弃此块（保留原稿）" : "✓ 采纳此块修改"}
        </button>
      `;

      const toggleBtn = controlRow.querySelector(".diff-hunk-toggle-btn");
      toggleBtn.addEventListener("click", () => {
        chunk.accepted = !chunk.accepted;
        updateHunkVisualState(chunk);
        updateDiffStats();
        triggerVerificationPrecheck();
      });

      container.append(controlRow);

      // 逐行严格水平基线对齐渲染
      const origLines = chunk.origLines;
      const newLines = chunk.newLines;
      const maxRows = Math.max(origLines.length, newLines.length);

      for (let r = 0; r < maxRows; r++) {
        const hasOrig = r < origLines.length;
        const hasNew = r < newLines.length;
        const origText = hasOrig ? origLines[r] : "";
        const newText = hasNew ? newLines[r] : "";
        const origNum = hasOrig ? chunk.origStartLine + r : "";
        const newNum = hasNew ? chunk.newStartLine + r : "";

        const row = document.createElement("div");
        row.className = `diff-row diff-row-modified ${chunk.accepted ? "accepted" : "rejected"}`;
        row.dataset.hunkId = String(chunk.hunkId);

        const origCellClass = hasOrig ? "diff-cell diff-cell-orig has-del" : "diff-cell diff-cell-orig is-empty";
        const newCellClass = hasNew ? "diff-cell diff-cell-new has-add" : "diff-cell diff-cell-new is-empty";

        row.innerHTML = `
          <div class="${origCellClass}">
            <span class="diff-line-num">${hasOrig ? origNum : ""}</span>
            <span class="diff-line-text">${hasOrig ? escapeHtml(origText || " ") : '<span class="diff-empty-placeholder"></span>'}</span>
          </div>
          <div class="${newCellClass}">
            <span class="diff-line-num">${hasNew ? newNum : ""}</span>
            <span class="diff-line-text">${hasNew ? escapeHtml(newText || " ") : '<span class="diff-empty-placeholder"></span>'}</span>
          </div>
        `;
        container.append(row);
      }
    }
  });
}

function updateDiffStats() {
  const modifiedHunks = currentDiffChunks.filter((c) => c.type === "modified");
  const acceptedCount = modifiedHunks.filter((c) => c.accepted).length;
  const mergedText = buildMergedText(currentDiffChunks);
  const origWords = countCharacters(currentDiffOriginalText);
  const mergedWords = countCharacters(mergedText);
  const delta = mergedWords - origWords;
  const deltaSign = delta > 0 ? `+${delta}` : `${delta}`;

  const statsStr = `原字数: ${formatNumber(origWords)} | 合并后: ${formatNumber(mergedWords)} (${deltaSign}) | 变动块: ${acceptedCount}/${modifiedHunks.length} 已采纳`;
  elements.diffStatsInfo.textContent = statsStr;
  elements.diffFooterStats.textContent = statsStr;
}

function triggerVerificationPrecheck() {
  clearTimeout(verifyPrecheckTimer);
  verifyPrecheckTimer = setTimeout(async () => {
    if (!elements.diffMergeDialog.open || !state.activeFile) return;
    const mergedText = buildMergedText(currentDiffChunks);
    try {
      const res = await requestJson("/api/chapter-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: state.activeFile.path, content: mergedText }),
      });
      if (res.verification) {
        const v = res.verification;
        const aiItem = elements.verifyAiStatus;
        if (v.aiPatterns?.blocking?.length > 0) {
          aiItem.className = "diff-verify-item error";
          aiItem.querySelector(".verify-icon").textContent = "✕";
          elements.verifyAiText.textContent = `去 AI 味机检：发现 ${v.aiPatterns.blocking.length} 个阻断项`;
        } else {
          aiItem.className = "diff-verify-item";
          aiItem.querySelector(".verify-icon").textContent = "✓";
          elements.verifyAiText.textContent = "去 AI 味机检：0 阻断项";
        }

        const degenItem = elements.verifyDegenStatus;
        if (!v.degeneration?.ok) {
          degenItem.className = "diff-verify-item warning";
          degenItem.querySelector(".verify-icon").textContent = "⚠️";
          elements.verifyDegenText.textContent = "文本退化：检出轻微重复";
        } else {
          degenItem.className = "diff-verify-item";
          degenItem.querySelector(".verify-icon").textContent = "✓";
          elements.verifyDegenText.textContent = "文本退化排查：正常";
        }
      }
    } catch {}
  }, 400);
}

function openRegenerationDialog(precheckAll = false) {
  if (!state.activeFile) return;
  elements.regenChapterTitle.textContent = `根据建议重新生成 · ${state.activeFile.name}`;
  elements.regenStatusFeedback.hidden = true;
  elements.submitRegenButton.disabled = false;
  elements.regenCustomInstructions.value = "";

  const container = elements.regenSuggestionsChecklist;
  container.replaceChildren();

  const suggestions = currentAnalysisData?.analysis?.suggestions || [];
  if (suggestions.length === 0) {
    const p = document.createElement("p");
    p.className = "regen-empty-hint";
    p.textContent = "当前章节暂无显式修改建议，您可在下方输入作者微调指令并保留要素重写。";
    container.append(p);
  } else {
    suggestions.forEach((s, idx) => {
      const label = document.createElement("label");
      label.className = "regen-suggestion-item";
      label.innerHTML = `
        <input type="checkbox" data-index="${idx}" ${precheckAll ? "checked" : ""}>
        <span>${escapeHtml(s)}</span>
      `;
      container.append(label);
    });
  }

  const baseChars = countCharacters(state.activeFile.content || "");
  elements.regenTargetWordsInput.value = "";
  elements.regenTargetWordsInput.placeholder = `原章节约 ${formatNumber(baseChars)} 字`;

  if (!elements.regenerationDialog.open) {
    elements.regenerationDialog.showModal();
  }
}

async function submitChapterRegeneration() {
  if (!state.activeFile) return;
  const filePath = state.activeFile.path;
  const checkedBoxes = elements.regenSuggestionsChecklist.querySelectorAll('input[type="checkbox"]:checked');
  const selectedSuggestions = [];
  const allSuggestions = currentAnalysisData?.analysis?.suggestions || [];
  checkedBoxes.forEach((cb) => {
    const idx = Number(cb.dataset.index);
    if (allSuggestions[idx]) {
      selectedSuggestions.push(allSuggestions[idx]);
    }
  });

  const customInstructions = elements.regenCustomInstructions.value.trim();
  const preserveElements = {
    preserveStructure: elements.regenPreservePlot.checked,
    preserveCharacterTraits: elements.regenPreserveStyle.checked,
    deslopStrict: elements.regenStrictDeslop.checked,
  };
  const targetWordCount = elements.regenTargetWordsInput.value ? Number(elements.regenTargetWordsInput.value) : undefined;

  elements.submitRegenButton.disabled = true;
  elements.regenStatusFeedback.hidden = false;
  elements.regenStatusText.textContent = "正在提交重构指令并派发任务...";

  let hasApiKey = false;
  try {
    const cfg = await requestJson("/api/ai-config");
    hasApiKey = Boolean(cfg?.hasApiKey || cfg?.apiKey);
  } catch {}
  const useAntigravity = !hasApiKey;

  try {
    const res = await requestJson("/api/chapter-regenerate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: filePath,
        selectedSuggestions,
        customInstructions,
        preserveElements,
        targetWordCount,
        useAntigravity,
        method: useAntigravity ? "antigravity" : "external_api",
      }),
    });

    if (res.status === "completed" && res.data?.new_content) {
      elements.regenerationDialog.close();
      openDiffMergeDialog(res.data.original_content || state.activeFile.content, res.data.new_content);
      return;
    }

    elements.regenStatusText.textContent = "重构任务正在后台处理中，即将唤起 Git 式双栏差异比对...";
    ensureRegenStatusPolling(filePath);
  } catch (err) {
    elements.submitRegenButton.disabled = false;
    elements.regenStatusFeedback.hidden = true;
    showToast(err.message, "error");
  }
}

function ensureRegenStatusPolling(filePath) {
  if (regenPollIntervalId) clearInterval(regenPollIntervalId);
  const pollInterval = 1200;
  regenPollIntervalId = setInterval(async () => {
    try {
      const res = await requestJson(`/api/chapter-regenerate/status?path=${encodeURIComponent(filePath)}`);
      if (res.status === "completed" && res.newContent) {
        const orig = (res.originalContent || state.activeFile?.content || "").trim();
        // 若重写文稿与原稿完全一字不差，说明 Agent 实际上仍在生成处理中，保持等待并更新提示
        if (res.newContent.trim() === orig) {
          if (elements.regenStatusText) {
            elements.regenStatusText.textContent = "Agent 正在根据建议深度创作重构正文，请稍候...";
          }
          return;
        }
        clearInterval(regenPollIntervalId);
        regenPollIntervalId = null;
        elements.regenerationDialog.close();
        openDiffMergeDialog(res.originalContent || state.activeFile?.content || "", res.newContent);
        showToast("章节定向重写已完成，已载入差异合并器！", "success");
      } else if (res.status === "failed") {
        clearInterval(regenPollIntervalId);
        regenPollIntervalId = null;
        elements.submitRegenButton.disabled = false;
        elements.regenStatusFeedback.hidden = true;
        showToast(res.error || "重写生成失败，请重试", "error");
      } else if (res.message && elements.regenStatusText) {
        elements.regenStatusText.textContent = res.message;
      }
    } catch {}
  }, pollInterval);
}

async function applyMergedResult() {
  if (!state.activeFile) return;
  const filePath = state.activeFile.path;
  const mergedContent = buildMergedText(currentDiffChunks);

  elements.applyMergeButton.disabled = true;
  elements.diffMergeSpinner.hidden = false;
  elements.diffMergeStatusMsg.className = "diff-status-msg";
  elements.diffMergeStatusMsg.textContent = "正在执行工程化机检与标点规整落盘...";

  try {
    const res = await requestJson("/api/chapter-apply-merge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: filePath,
        content: mergedContent,
        force: false,
      }),
    });

    if (res.blocked) {
      elements.diffMergeSpinner.hidden = true;
      elements.applyMergeButton.disabled = false;
      elements.diffMergeStatusMsg.className = "diff-status-msg error";
      elements.diffMergeStatusMsg.textContent = res.message || "落盘被阻断项拦截";
      showToast(res.message || "落盘被阻断项拦截", "error");
      return;
    }

    const savedContent = res.savedContent || mergedContent;
    elements.editorInput.value = savedContent;
    state.originalContent = savedContent;
    if (state.activeFile) {
      state.activeFile.content = savedContent;
      if (res.file) {
        state.activeFile.version = res.file.version;
        state.activeFile.mtimeMs = res.file.mtimeMs;
        state.activeFile.size = res.file.size;
      }
    }
    setDirty(false);
    updateDocumentMeta();
    updateCursorPosition();
    if (state.mode === "preview") {
      elements.previewPane.innerHTML = markdownToSafeHtml(savedContent);
    } else if (state.showLineNumbers) {
      updateLineNumbers();
    }

    elements.diffMergeSpinner.hidden = true;
    elements.applyMergeButton.disabled = false;
    elements.diffMergeDialog.close();

    // 重点：章节根据建议重新生成并合并后，彻底清理过时的旧分析记录；不自动发起新分析，按需由作者手动触发
    chapterAnalysisStatusCache.delete(filePath);
    currentAnalysisData = null;
    clearAnalysisDataUi();
    updateAnalysisButtonUi();
    if (elements.analysisDialog && elements.analysisDialog.open) {
      elements.analysisDialog.close();
    }

    showToast("✓ 章节合并已成功落盘！已清理旧版剧情分析记录。", "success");
  } catch (err) {
    elements.diffMergeSpinner.hidden = true;
    elements.applyMergeButton.disabled = false;
    elements.diffMergeStatusMsg.className = "diff-status-msg error";
    elements.diffMergeStatusMsg.textContent = err.message || "合并保存失败";
    showToast(err.message, "error");
  }
}

// 绑定重写与差异合并事件
if (elements.openRegenerateDialogButton) {
  elements.openRegenerateDialogButton.addEventListener("click", () => {
    openRegenerationDialog(false);
  });
}

elements.regenerateFromSuggestionsButton.addEventListener("click", () => {
  openRegenerationDialog(true);
});

elements.closeRegenDialogButton.addEventListener("click", () => {
  elements.regenerationDialog.close();
});

elements.cancelRegenButton.addEventListener("click", () => {
  elements.regenerationDialog.close();
});

elements.regenSelectAllSuggestionsBtn.addEventListener("click", () => {
  elements.regenSuggestionsChecklist.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.checked = true;
  });
});

elements.regenClearSuggestionsBtn.addEventListener("click", () => {
  elements.regenSuggestionsChecklist.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.checked = false;
  });
});

document.querySelectorAll(".regen-chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    const tag = chip.dataset.tag || chip.textContent.trim();
    const current = elements.regenCustomInstructions.value.trim();
    if (current) {
      elements.regenCustomInstructions.value = `${current}；${tag}`;
    } else {
      elements.regenCustomInstructions.value = tag;
    }
    elements.regenCustomInstructions.focus();
  });
});

elements.submitRegenButton.addEventListener("click", () => {
  submitChapterRegeneration();
});

elements.diffAcceptAllBtn.addEventListener("click", () => {
  currentDiffChunks.forEach((chunk) => {
    if (chunk.type === "modified") {
      chunk.accepted = true;
      updateHunkVisualState(chunk);
    }
  });
  updateDiffStats();
  triggerVerificationPrecheck();
});

elements.diffRejectAllBtn.addEventListener("click", () => {
  currentDiffChunks.forEach((chunk) => {
    if (chunk.type === "modified") {
      chunk.accepted = false;
      updateHunkVisualState(chunk);
    }
  });
  updateDiffStats();
  triggerVerificationPrecheck();
});

if (elements.diffViewFullBtn) {
  elements.diffViewFullBtn.addEventListener("click", () => {
    if (diffViewMode === "full") return;
    diffViewMode = "full";
    elements.diffViewFullBtn.classList.add("active");
    elements.diffViewChangesBtn?.classList.remove("active");
    renderDiffHunks();
  });
}

if (elements.diffViewChangesBtn) {
  elements.diffViewChangesBtn.addEventListener("click", () => {
    if (diffViewMode === "changes") return;
    diffViewMode = "changes";
    elements.diffViewChangesBtn.classList.add("active");
    elements.diffViewFullBtn?.classList.remove("active");
    renderDiffHunks();
  });
}

elements.closeDiffDialogButton.addEventListener("click", () => {
  elements.diffMergeDialog.close();
});

elements.cancelDiffButton.addEventListener("click", () => {
  elements.diffMergeDialog.close();
});

elements.applyMergeButton.addEventListener("click", () => {
  applyMergedResult();
});

elements.analysisTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    switchAnalysisTab(tab.dataset.tab);
  });
});

// ============================================================================
// 章节行级注解模块 (Chapter Line Annotations)
// ============================================================================

function formatAnnotationTime(timestamp) {
  if (!timestamp) return "";
  const d = new Date(timestamp);
  const pad = (n) => String(n).padStart(2, "0");
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  return `${month}-${day} ${hours}:${minutes}`;
}

async function loadChapterAnnotations(chapterPath) {
  if (!chapterPath) {
    state.annotations = [];
    renderAnnotationsSidebar();
    return;
  }
  try {
    const res = await requestJson(`/api/annotations?path=${encodeURIComponent(chapterPath)}`);
    state.annotations = Array.isArray(res.annotations) ? res.annotations : [];
  } catch (error) {
    console.warn("[story-dashboard] 加载批注失败:", error);
    state.annotations = [];
  }
  renderAnnotationsSidebar();
  if (state.showLineNumbers && state.mode !== "preview") {
    updateLineNumbers();
  }
}

function renderAnnotationsSidebar() {
  const count = (state.annotations || []).length;
  if (elements.annotationsCountBadge) {
    elements.annotationsCountBadge.textContent = count;
    elements.annotationsCountBadge.hidden = count === 0;
  }
  if (elements.annotationsSidebarBadge) {
    elements.annotationsSidebarBadge.textContent = count;
  }

  if (!elements.annotationsList) return;

  if (count === 0) {
    elements.annotationsList.innerHTML = `
      <div class="annotations-empty">
        <svg viewBox="0 0 24 24" aria-hidden="true" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
        </svg>
        <strong>暂无行级注解</strong>
        <p>在编辑模式下，点击正文左侧的行号，即可为此行快速添加批注意见。</p>
      </div>
    `;
    return;
  }

  const html = state.annotations.map((item) => {
    const timeStr = item.created_at ? formatAnnotationTime(item.created_at) : "";
    const quoteHtml = item.line_text
      ? `<div class="annotation-line-quote" title="${escapeHtml(item.line_text)}">“${escapeHtml(item.line_text)}”</div>`
      : "";

    return `
      <div class="annotation-card" data-id="${item.id}" data-line="${item.line}">
        <div class="annotation-card-header">
          <span class="annotation-line-badge">第 ${item.line} 行</span>
          <button class="annotation-card-del-btn" data-id="${item.id}" type="button" title="删除本条注解" aria-label="删除本条注解">
            <svg viewBox="0 0 24 24" aria-hidden="true" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M18 6 6 18M6 6l12 12"></path>
            </svg>
          </button>
        </div>
        ${quoteHtml}
        <div class="annotation-comment-text">${escapeHtml(item.comment)}</div>
        ${timeStr ? `<div class="annotation-time">${timeStr}</div>` : ""}
      </div>
    `;
  }).join("");

  elements.annotationsList.innerHTML = html;
}

function openAnnotationPopover(lineNum, lineText) {
  state.currentAnnotatingLine = lineNum;
  state.currentAnnotatingText = lineText || "";

  if (elements.annotationPopoverTitle) {
    elements.annotationPopoverTitle.textContent = `添加第 ${lineNum} 行注解`;
  }
  if (elements.annotationLineSnippet) {
    const clean = (lineText || "").trim();
    elements.annotationLineSnippet.textContent = clean ? `“${clean.slice(0, 50)}${clean.length > 50 ? "..." : ""}”` : "(空行)";
  }
  if (elements.annotationInput) {
    elements.annotationInput.value = "";
  }
  if (elements.annotationPopover) {
    elements.annotationPopover.showModal();
    if (elements.annotationInput) {
      setTimeout(() => elements.annotationInput.focus(), 60);
    }
  }
}

function closeAnnotationPopover() {
  if (elements.annotationPopover && elements.annotationPopover.open) {
    elements.annotationPopover.close();
  }
  state.currentAnnotatingLine = null;
  state.currentAnnotatingText = "";
}

async function saveCurrentAnnotation() {
  if (!state.activeFile) return;
  const comment = (elements.annotationInput?.value || "").trim();
  if (!comment) {
    showToast("请输入修改意见或批注内容", "error");
    elements.annotationInput?.focus();
    return;
  }

  const lineNum = state.currentAnnotatingLine;
  try {
    const res = await requestJson("/api/annotations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chapterPath: state.activeFile.path,
        line: lineNum,
        lineText: state.currentAnnotatingText,
        comment,
      }),
    });

    state.annotations = res.annotations || [];
    renderAnnotationsSidebar();
    if (state.showLineNumbers && state.mode !== "preview") {
      updateLineNumbers();
    }
    closeAnnotationPopover();
    showToast(`✓ 第 ${lineNum} 行注解已保存`, "success");
  } catch (err) {
    showToast(`保存批注失败: ${err.message}`, "error");
  }
}

async function deleteAnnotation(id) {
  if (!state.activeFile || !id) return;
  try {
    const res = await requestJson("/api/annotations", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chapterPath: state.activeFile.path,
        id,
      }),
    });

    state.annotations = res.annotations || [];
    renderAnnotationsSidebar();
    if (state.showLineNumbers && state.mode !== "preview") {
      updateLineNumbers();
    }
    showToast("注解已删除", "success");
  } catch (err) {
    showToast(`删除批注失败: ${err.message}`, "error");
  }
}

function jumpToLine(lineNum) {
  if (!lineNum || !elements.editorInput) return;
  const lines = elements.editorInput.value.split("\n");
  let charIndex = 0;
  for (let i = 0; i < Math.min(lineNum - 1, lines.length); i++) {
    charIndex += lines[i].length + 1;
  }
  elements.editorInput.focus();
  elements.editorInput.setSelectionRange(charIndex, charIndex);
  updateCursorPosition();

  const style = elements.editorInput ? window.getComputedStyle(elements.editorInput) : null;
  const lineHeight = style ? (parseFloat(style.lineHeight) || 34) : 34;
  const targetScroll = Math.max(0, (lineNum - 5) * lineHeight);
  elements.editorInput.scrollTo({ top: targetScroll, behavior: "smooth" });
}

function setAnnotationsSidebarVisible(visible) {
  state.showAnnotationsSidebar = visible;
  if (elements.editorBody) {
    elements.editorBody.classList.toggle("show-annotations", visible);
  }
  if (elements.annotationsToggleBtn) {
    elements.annotationsToggleBtn.setAttribute("aria-pressed", visible ? "true" : "false");
  }
  try {
    localStorage.setItem(STORAGE_KEY_SHOW_ANNOTATIONS, visible ? "1" : "0");
  } catch {}
}

function initAnnotations() {
  let saved = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY_SHOW_ANNOTATIONS);
  } catch {}
  const shouldShow = saved === null ? true : saved === "1";
  setAnnotationsSidebarVisible(shouldShow);

  if (elements.annotationsToggleBtn) {
    elements.annotationsToggleBtn.addEventListener("click", () => {
      setAnnotationsSidebarVisible(!state.showAnnotationsSidebar);
    });
  }

  if (elements.closeAnnotationsSidebarBtn) {
    elements.closeAnnotationsSidebarBtn.addEventListener("click", () => {
      setAnnotationsSidebarVisible(false);
    });
  }

  if (elements.annotationsList) {
    elements.annotationsList.addEventListener("click", (e) => {
      const delBtn = e.target.closest(".annotation-card-del-btn");
      if (delBtn) {
        e.stopPropagation();
        const id = delBtn.dataset.id;
        if (id) deleteAnnotation(id);
        return;
      }

      const card = e.target.closest(".annotation-card");
      if (card) {
        const lineNum = parseInt(card.dataset.line, 10);
        if (lineNum) jumpToLine(lineNum);
      }
    });
  }

  if (elements.saveAnnotationBtn) {
    elements.saveAnnotationBtn.addEventListener("click", () => {
      saveCurrentAnnotation();
    });
  }

  if (elements.cancelAnnotationBtn) {
    elements.cancelAnnotationBtn.addEventListener("click", () => {
      closeAnnotationPopover();
    });
  }

  if (elements.closeAnnotationPopoverBtn) {
    elements.closeAnnotationPopoverBtn.addEventListener("click", () => {
      closeAnnotationPopover();
    });
  }

  if (elements.annotationInput) {
    elements.annotationInput.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        saveCurrentAnnotation();
      } else if (e.key === "Escape") {
        e.preventDefault();
        closeAnnotationPopover();
      }
    });
  }
}

initLineNumbers();
initAnnotations();
loadWorkspace();
window.__openDiffMergeDialog = openDiffMergeDialog;
window.__openAnnotationPopover = openAnnotationPopover;


