const socket = io();

const liveChatEl = document.getElementById("liveChat");
const statusEl = document.getElementById("status");
const fakeInputTextEl = document.getElementById("fakeInputText");
const typingCaretEl = document.getElementById("typingCaret");
const fakeSendButtonEl = document.getElementById("fakeSendButton");
const typingStatusEl = document.getElementById("typingStatus");

let history = [];
let animationQueue = Promise.resolve();

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

  if (typeof file.content === "string" && file.content.length) {
    const details = document.createElement("details");
    details.className = "file-preview";

    const summary = document.createElement("summary");
    summary.textContent = "View file";

    const pre = document.createElement("pre");
    pre.textContent = file.content;

    details.append(summary, pre);
    card.appendChild(details);
  }

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

    if (turn.enUser) {
      appendMessage("user", turn.enUser, time, false);
    }

    if (turn.enAI) {
      appendMessage("ai", turn.enAI, time, false);
    }

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
