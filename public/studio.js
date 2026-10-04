const socket = io();

const BRIDGE_URL = "http://127.0.0.1:8787";

const promptEl = document.getElementById("prompt");
const ruChatEl = document.getElementById("ruChat");
const serverStatusEl = document.getElementById("serverStatus");
const bridgeStatusEl = document.getElementById("bridgeStatus");
const sendAIBtn = document.getElementById("sendAI");
const checkBridgeBtn = document.getElementById("checkBridge");
const clearBtn = document.getElementById("clear");
const aiStateEl = document.getElementById("aiState");
const rawAnswerEl = document.getElementById("rawAnswer");

let history = [];

function setServerStatus(online) {
  serverStatusEl.textContent = online ? "● server online" : "● server offline";
  serverStatusEl.className = online ? "status status-online" : "status status-offline";
}

function setBridgeStatus(online) {
  bridgeStatusEl.textContent = online ? "● bridge online" : "● bridge offline";
  bridgeStatusEl.className = online ? "status status-online" : "status status-offline";
}

function formatTime(iso) {
  try {
    return new Intl.DateTimeFormat("ru-RU", {
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

function renderHistory() {
  ruChatEl.innerHTML = "";

  if (!history.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "Диалог пока пуст.";
    ruChatEl.appendChild(empty);
    return;
  }

  for (const turn of history) {
    const time = formatTime(turn.createdAt);
    ruChatEl.appendChild(createMessage("user", turn.ruUser, time));
    ruChatEl.appendChild(createMessage("ai", turn.ruAI, time));
  }

  ruChatEl.scrollTop = ruChatEl.scrollHeight;

  const last = history[history.length - 1];
  rawAnswerEl.textContent = last?.rawAnswer || "Пока ответов нет.";
}

async function checkBridge() {
  try {
    const response = await fetch(`${BRIDGE_URL}/health`, {
      method: "GET",
      cache: "no-store"
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    const ok = Boolean(data.ok);
    setBridgeStatus(ok);
    return ok;
  } catch (error) {
    console.error("Bridge health check failed:", error);
    setBridgeStatus(false);
    return false;
  }
}

socket.on("connect", () => setServerStatus(true));
socket.on("disconnect", () => setServerStatus(false));

socket.on("conversation:state", (state) => {
  history = Array.isArray(state.history) ? state.history : [];
  renderHistory();
});

socket.on("conversation:turn", (turn) => {
  history.push(turn);
  renderHistory();
});

checkBridgeBtn.addEventListener("click", async () => {
  aiStateEl.textContent = "Проверяю локальный Bridge...";
  const ok = await checkBridge();
  aiStateEl.textContent = ok
    ? "Bridge подключён."
    : "Bridge не отвечает. Проверь, что на Mac запущен node bridge.js.";
});

sendAIBtn.addEventListener("click", async () => {
  const ruUser = promptEl.value.trim();

  if (!ruUser) {
    aiStateEl.textContent = "Сначала введи сообщение.";
    return;
  }

  const bridgeOk = await checkBridge();

  if (!bridgeOk) {
    aiStateEl.textContent = "Bridge не отвечает. Запусти node bridge.js на Mac.";
    return;
  }

  const recentContext = history
    .slice(-8)
    .map((turn) => `Пользователь: ${turn.ruUser}\nAI: ${turn.ruAI}`)
    .join("\n\n");

  const bilingualPrompt = `
Ты отвечаешь внутри двуязычной AI Studio.

Текущий разговор ведётся на русском языке.
Ниже может быть краткая история предыдущих реплик.

Ты работаешь внутри разрешённой рабочей папки AI-Studio-Workspace.
Если пользователь просит создать, изменить или удалить проектные файлы,
реально выполни эти файловые действия в рабочей папке.

ИСТОРИЯ:
${recentContext || "(диалог только начинается)"}

НОВЫЙ ВОПРОС ПОЛЬЗОВАТЕЛЯ:
${ruUser}

ФОРМАТ ТЕКСТОВОГО ОТВЕТА ОБЯЗАТЕЛЕН И ДОЛЖЕН БЫТЬ ТОЧНО ТАКИМ:

[Сначала полный естественный ответ AI на русском языке.]

777ROCK777

777USER777
[Здесь дай естественный английский перевод ТОЛЬКО нового вопроса пользователя.]
777USEROFF777

[Здесь дай полный английский эквивалент русского ответа AI.]

ВАЖНО:
- Не используй 777END777.
- 777ROCK777 должен встречаться ровно один раз.
- 777USER777 должен встречаться ровно один раз.
- 777USEROFF777 должен встречаться ровно один раз.
- Не добавляй текст до русского ответа.
- Между 777USER777 и 777USEROFF777 должен быть только перевод вопроса пользователя.
- После 777USEROFF777 должен быть только полный английский ответ AI.
`.trim();

  sendAIBtn.disabled = true;
  promptEl.disabled = true;
  aiStateEl.textContent = "AI отвечает через ChatGPT Plus...";

  try {
    const response = await fetch(`${BRIDGE_URL}/ask`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        prompt: bilingualPrompt
      })
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    const rawAnswer = String(data.answer || "").trim();

    if (!rawAnswer) {
      throw new Error("AI вернул пустой ответ");
    }

    const files = Array.isArray(data.files) ? data.files : [];

    rawAnswerEl.textContent = rawAnswer;

    socket.emit("conversation:add", {
      ruUser,
      rawAnswer,
      files
    });

    promptEl.value = "";

    aiStateEl.textContent = files.length
      ? `Ответ получен. Изменено файлов: ${files.length}.`
      : "Ответ получен. Русский и английский диалоги обновлены.";
  } catch (error) {
    console.error(error);
    aiStateEl.textContent = `Ошибка: ${error.message}`;
  } finally {
    sendAIBtn.disabled = false;
    promptEl.disabled = false;
    promptEl.focus();
  }
});

promptEl.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    event.preventDefault();
    sendAIBtn.click();
  }
});

clearBtn.addEventListener("click", () => {
  socket.emit("conversation:clear");
  promptEl.value = "";
  rawAnswerEl.textContent = "Пока ответов нет.";
  aiStateEl.textContent = "Диалог очищен.";
});

checkBridge();
