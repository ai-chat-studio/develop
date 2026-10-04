const socket = io();

const liveChatEl = document.getElementById("liveChat");
const statusEl = document.getElementById("status");

let history = [];

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

function createMessage(role, text, time) {
  const wrap = document.createElement("article");
  wrap.className = `message ${role === "user" ? "message-user" : "message-ai"}`;

  const meta = document.createElement("div");
  meta.className = "message-meta";
  meta.textContent = `${role === "user" ? "YOU" : "AI"}${time ? ` · ${time}` : ""}`;

  const body = document.createElement("div");
  body.className = "message-body";
  body.textContent = text || "—";

  wrap.append(meta, body);
  return wrap;
}

function render() {
  liveChatEl.innerHTML = "";

  const usable = history.filter((turn) => turn.enUser || turn.enAI);

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
      liveChatEl.appendChild(createMessage("user", turn.enUser, time));
    }

    if (turn.enAI) {
      liveChatEl.appendChild(createMessage("ai", turn.enAI, time));
    }
  }

  liveChatEl.scrollTop = liveChatEl.scrollHeight;
}

socket.on("connect", () => setStatus(true));
socket.on("disconnect", () => setStatus(false));

socket.on("conversation:state", (state) => {
  history = Array.isArray(state.history) ? state.history : [];
  render();
});

socket.on("conversation:turn", (turn) => {
  history.push(turn);
  render();
});
