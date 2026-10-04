const socket = io();

const liveChatEl = document.getElementById("liveChat");
const statusEl = document.getElementById("status");
const fakeInputTextEl = document.getElementById("fakeInputText");
const typingCaretEl = document.getElementById("typingCaret");
const fakeSendButtonEl = document.getElementById("fakeSendButton");
const typingStatusEl = document.getElementById("typingStatus");

const workspaceNameEl = document.getElementById("workspaceName");
const workspaceMetaEl = document.getElementById("workspaceMeta");
const workspaceTreeEl = document.getElementById("workspaceTree");
const editorFilenameEl = document.getElementById("editorFilename");
const editorLanguageEl = document.getElementById("editorLanguage");
const editorEmptyEl = document.getElementById("editorEmpty");
const codeEditorEl = document.getElementById("codeEditor");
const codeLinesEl = document.getElementById("codeLines");

let history = [];
let animationQueue = Promise.resolve();
let workspace = {
  rootName: "AI-Studio-Workspace",
  files: [],
  truncated: false,
  updatedAt: null
};
let selectedFilePath = null;
const expandedFolders = new Set();

function setStatus(online) {
  statusEl.textContent = online ? "● live" : "● offline";
  statusEl.className = online ? "status status-online" : "status status-offline";
}

function formatTime(iso) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

function formatBytes(bytes) {
  const value = Number(bytes) || 0;

  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    liveChatEl.scrollTop = liveChatEl.scrollHeight;
  });
}

function createMessage(role, text, time) {
  const wrap = document.createElement("article");
  wrap.className = `message ${role === "user" ? "message-user" : "message-ai"} message-enter`;

  const meta = document.createElement("div");
  meta.className = "message-meta";
  meta.textContent = `${role === "user" ? "YOU" : "AI"}${time ? ` · ${time}` : ""}`;

  const body = document.createElement("div");
  body.className = "message-body";
  body.textContent = text || "—";

  wrap.append(meta, body);
  return wrap;
}

function appendMessage(role, text, time, animate = true) {
  const message = createMessage(role, text, time);

  if (!animate) {
    message.classList.remove("message-enter");
  }

  liveChatEl.appendChild(message);
  scrollToBottom();
}

function createFileCard(file, animate = true) {
  const card = document.createElement("article");
  card.className = "file-card";

  if (animate) {
    card.classList.add("file-card-enter");
  }

  const action = String(file.action || "updated").toUpperCase();

  const header = document.createElement("div");
  header.className = "file-card-header";

  const badge = document.createElement("div");
  badge.className = `file-action file-action-${String(file.action || "updated")}`;
  badge.textContent = `FILE ${action}`;

  const size = document.createElement("div");
  size.className = "file-size";
  size.textContent = formatBytes(file.size);

  header.append(badge, size);

  const path = document.createElement("div");
  path.className = "file-path";
  path.textContent = file.path || "unknown file";

  card.append(header, path);
  return card;
}

function appendFiles(files, animate = true) {
  if (!Array.isArray(files) || !files.length) return;

  for (const file of files) {
    liveChatEl.appendChild(createFileCard(file, animate));
  }

  scrollToBottom();
}

function renderExistingHistory() {
  liveChatEl.innerHTML = "";

  const usable = history.filter(
    (turn) =>
      turn.enUser ||
      turn.enAI ||
      (Array.isArray(turn.files) && turn.files.length)
  );

  if (!usable.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Waiting for the conversation…";
    liveChatEl.appendChild(empty);
    return;
  }

  for (const turn of usable) {
    const time = formatTime(turn.createdAt);

    if (turn.enUser) appendMessage("user", turn.enUser, time, false);
    if (turn.enAI) appendMessage("ai", turn.enAI, time, false);
    appendFiles(turn.files, false);
  }

  scrollToBottom();
}

function clearEmptyState() {
  const empty = liveChatEl.querySelector(".empty");
  if (empty) empty.remove();
}

function typingDelayForChar(char) {
  let base = 58 + Math.random() * 42;

  if (char === " ") base += 15;
  if (/[,.!?;:]/.test(char)) base += 70 + Math.random() * 90;
  if (char === "\n") base += 110;

  return Math.round(base);
}

async function typeLikeHuman(text) {
  fakeInputTextEl.textContent = "";
  typingCaretEl.classList.add("typing-caret-active");
  typingStatusEl.textContent = "typing…";

  for (const char of text) {
    fakeInputTextEl.textContent += char;
    await sleep(typingDelayForChar(char));
  }

  typingStatusEl.textContent = "ready to send";
  await sleep(450);
}

async function pressSendButton() {
  fakeSendButtonEl.classList.add("fake-send-button-press");
  typingStatusEl.textContent = "sending…";

  await sleep(170);

  fakeSendButtonEl.classList.remove("fake-send-button-press");
  await sleep(120);

  fakeInputTextEl.textContent = "";
  typingCaretEl.classList.remove("typing-caret-active");
  typingStatusEl.textContent = "sent";

  await sleep(220);
}

async function animateTurn(turn) {
  clearEmptyState();

  const time = formatTime(turn.createdAt);

  if (turn.enUser) {
    await typeLikeHuman(turn.enUser);
    await pressSendButton();

    appendMessage("user", turn.enUser, time, true);
    await sleep(420);
  }

  if (turn.enAI) {
    appendMessage("ai", turn.enAI, time, true);
    await sleep(450);
  }

  if (Array.isArray(turn.files) && turn.files.length) {
    appendFiles(turn.files, true);
  }

  typingStatusEl.textContent = "Ready";
}

function queueTurnAnimation(turn) {
  animationQueue = animationQueue
    .then(() => animateTurn(turn))
    .catch((error) => {
      console.error("Live animation error:", error);
      typingStatusEl.textContent = "Ready";
      fakeInputTextEl.textContent = "";
      typingCaretEl.classList.remove("typing-caret-active");

      const time = formatTime(turn.createdAt);
      clearEmptyState();

      if (turn.enUser) appendMessage("user", turn.enUser, time, false);
      if (turn.enAI) appendMessage("ai", turn.enAI, time, false);
      appendFiles(turn.files, false);
    });
}

/* ---------- Workspace explorer ---------- */

function extensionLanguage(ext) {
  const map = {
    ".js": "JavaScript",
    ".mjs": "JavaScript",
    ".cjs": "JavaScript",
    ".jsx": "JavaScript",
    ".ts": "TypeScript",
    ".tsx": "TypeScript",
    ".html": "HTML",
    ".htm": "HTML",
    ".css": "CSS",
    ".json": "JSON",
    ".md": "Markdown",
    ".py": "Python",
    ".sh": "Shell",
    ".xml": "XML",
    ".yml": "YAML",
    ".yaml": "YAML",
    ".toml": "TOML",
    ".txt": "Text",
    ".svg": "SVG",
    ".go": "Go",
    ".rs": "Rust",
    ".java": "Java",
    ".php": "PHP",
    ".rb": "Ruby",
    ".swift": "Swift",
    ".kt": "Kotlin"
  };

  return map[String(ext || "").toLowerCase()] || "Text";
}

function fileIcon(ext) {
  const language = extensionLanguage(ext);

  if (language === "JavaScript" || language === "TypeScript") return "JS";
  if (language === "HTML") return "<>";
  if (language === "CSS") return "#";
  if (language === "JSON") return "{}";
  if (language === "Markdown") return "M↓";
  if (language === "Python") return "PY";
  if (language === "Shell") return "$";
  return "•";
}

function buildTree(files) {
  const root = { name: workspace.rootName, type: "folder", children: new Map() };

  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean);
    let node = root;

    parts.forEach((part, index) => {
      const isFile = index === parts.length - 1;

      if (!node.children.has(part)) {
        node.children.set(
          part,
          isFile
            ? { name: part, type: "file", file }
            : { name: part, type: "folder", children: new Map() }
        );
      }

      node = node.children.get(part);
    });
  }

  return root;
}

function sortedChildren(folder) {
  return Array.from(folder.children.values()).sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

function renderTreeNode(node, parentEl, depth, parentPath) {
  if (node.type === "file") {
    const row = document.createElement("button");
    row.className = "tree-row tree-file";
    row.style.setProperty("--depth", depth);

    if (node.file.path === selectedFilePath) {
      row.classList.add("tree-row-selected");
    }

    const icon = document.createElement("span");
    icon.className = "tree-file-icon";
    icon.textContent = fileIcon(node.file.extension);

    const name = document.createElement("span");
    name.className = "tree-name";
    name.textContent = node.name;

    row.append(icon, name);

    row.addEventListener("click", () => {
      selectedFilePath = node.file.path;
      renderWorkspaceTree();
      openFile(node.file);
    });

    parentEl.appendChild(row);
    return;
  }

  const currentPath = parentPath ? `${parentPath}/${node.name}` : node.name;
  const isRoot = depth === 0;
  const isExpanded = isRoot || expandedFolders.has(currentPath);

  const row = document.createElement("button");
  row.className = "tree-row tree-folder";
  row.style.setProperty("--depth", depth);

  const caret = document.createElement("span");
  caret.className = "tree-caret";
  caret.textContent = isExpanded ? "⌄" : "›";

  const icon = document.createElement("span");
  icon.className = "tree-folder-icon";
  icon.textContent = isExpanded ? "▾" : "▸";

  const name = document.createElement("span");
  name.className = "tree-name";
  name.textContent = node.name;

  row.append(caret, icon, name);
  parentEl.appendChild(row);

  if (!isRoot) {
    row.addEventListener("click", () => {
      if (expandedFolders.has(currentPath)) {
        expandedFolders.delete(currentPath);
      } else {
        expandedFolders.add(currentPath);
      }

      renderWorkspaceTree();
    });
  }

  if (isExpanded) {
    for (const child of sortedChildren(node)) {
      renderTreeNode(child, parentEl, depth + 1, currentPath);
    }
  }
}

function renderWorkspaceTree() {
  const files = Array.isArray(workspace.files) ? workspace.files : [];

  workspaceNameEl.textContent = workspace.rootName || "AI-Studio-Workspace";
  workspaceMetaEl.textContent = `${files.length} file${files.length === 1 ? "" : "s"}${workspace.truncated ? " · partial" : ""}`;

  workspaceTreeEl.innerHTML = "";

  if (!files.length) {
    const empty = document.createElement("div");
    empty.className = "workspace-empty";
    empty.textContent = "Workspace is empty";
    workspaceTreeEl.appendChild(empty);
    clearEditor();
    return;
  }

  const tree = buildTree(files);
  renderTreeNode(tree, workspaceTreeEl, 0, "");

  if (selectedFilePath) {
    const selected = files.find((file) => file.path === selectedFilePath);

    if (selected) {
      openFile(selected, false);
    } else {
      selectedFilePath = null;
      clearEditor();
    }
  }
}

function clearEditor() {
  editorFilenameEl.textContent = "No file selected";
  editorLanguageEl.textContent = "";
  editorEmptyEl.classList.remove("hidden");
  codeEditorEl.classList.add("hidden");
  codeLinesEl.innerHTML = "";
}

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function highlightLine(rawLine, language) {
  let line = escapeHTML(rawLine);

  if (language === "JavaScript" || language === "TypeScript") {
    line = line.replace(
      /(\b(?:const|let|var|function|return|if|else|for|while|class|new|async|await|try|catch|throw|import|from|export|default|switch|case|break|continue|true|false|null|undefined)\b)/g,
      '<span class="tok-keyword">$1</span>'
    );
    line = line.replace(
      /(&quot;.*?&quot;|'.*?'|`.*?`)/g,
      '<span class="tok-string">$1</span>'
    );
    line = line.replace(
      /(\/\/.*$)/g,
      '<span class="tok-comment">$1</span>'
    );
  } else if (language === "HTML" || language === "XML" || language === "SVG") {
    line = line.replace(
      /(&lt;\/?)([A-Za-z0-9:_-]+)/g,
      '$1<span class="tok-tag">$2</span>'
    );
    line = line.replace(
      /([A-Za-z_:][-A-Za-z0-9_:.]*)(=)(&quot;.*?&quot;)/g,
      '<span class="tok-attr">$1</span>$2<span class="tok-string">$3</span>'
    );
  } else if (language === "CSS") {
    line = line.replace(
      /([.#]?[A-Za-z_-][A-Za-z0-9_-]*)(\s*\{)/g,
      '<span class="tok-tag">$1</span>$2'
    );
    line = line.replace(
      /([A-Za-z-]+)(\s*:)/g,
      '<span class="tok-attr">$1</span>$2'
    );
    line = line.replace(
      /(&quot;.*?&quot;|'.*?')/g,
      '<span class="tok-string">$1</span>'
    );
  } else if (language === "JSON") {
    line = line.replace(
      /(&quot;.*?&quot;)(\s*:)/g,
      '<span class="tok-attr">$1</span>$2'
    );
    line = line.replace(
      /(:\s*)(&quot;.*?&quot;)/g,
      '$1<span class="tok-string">$2</span>'
    );
    line = line.replace(
      /\b(true|false|null)\b/g,
      '<span class="tok-keyword">$1</span>'
    );
  } else if (language === "Python") {
    line = line.replace(
      /(\b(?:def|class|return|if|elif|else|for|while|in|import|from|as|try|except|raise|with|lambda|True|False|None|and|or|not|async|await)\b)/g,
      '<span class="tok-keyword">$1</span>'
    );
    line = line.replace(
      /(&quot;.*?&quot;|'.*?')/g,
      '<span class="tok-string">$1</span>'
    );
    line = line.replace(
      /(#.*$)/g,
      '<span class="tok-comment">$1</span>'
    );
  } else if (language === "Markdown") {
    line = line.replace(
      /^(#{1,6}\s.*)$/g,
      '<span class="tok-heading">$1</span>'
    );
    line = line.replace(
      /(`[^`]+`)/g,
      '<span class="tok-string">$1</span>'
    );
  } else {
    line = line.replace(
      /(&quot;.*?&quot;|'.*?')/g,
      '<span class="tok-string">$1</span>'
    );
  }

  line = line.replace(
    /(\b\d+(?:\.\d+)?\b)/g,
    '<span class="tok-number">$1</span>'
  );

  return line || " ";
}

function openFile(file, rerenderTree = true) {
  editorFilenameEl.textContent = file.path;
  const language = extensionLanguage(file.extension);
  editorLanguageEl.textContent = `${language} · ${formatBytes(file.size)}`;

  if (typeof file.content !== "string") {
    editorEmptyEl.textContent = "Preview unavailable for this file";
    editorEmptyEl.classList.remove("hidden");
    codeEditorEl.classList.add("hidden");
    codeLinesEl.innerHTML = "";
    return;
  }

  editorEmptyEl.classList.add("hidden");
  codeEditorEl.classList.remove("hidden");
  codeLinesEl.innerHTML = "";

  const lines = file.content.replace(/\r\n/g, "\n").split("\n");

  lines.forEach((line, index) => {
    const row = document.createElement("div");
    row.className = "code-line";

    const number = document.createElement("div");
    number.className = "code-line-number";
    number.textContent = String(index + 1);

    const code = document.createElement("div");
    code.className = "code-line-code";
    code.innerHTML = highlightLine(line, language);

    row.append(number, code);
    codeLinesEl.appendChild(row);
  });

  if (rerenderTree) {
    renderWorkspaceTree();
  }
}

socket.on("connect", () => setStatus(true));
socket.on("disconnect", () => setStatus(false));

socket.on("conversation:state", (state) => {
  history = Array.isArray(state.history) ? state.history : [];
  renderExistingHistory();
});

socket.on("conversation:turn", (turn) => {
  history.push(turn);
  queueTurnAnimation(turn);
});

socket.on("workspace:state", (nextWorkspace) => {
  workspace = nextWorkspace && typeof nextWorkspace === "object"
    ? nextWorkspace
    : workspace;

  renderWorkspaceTree();
});
