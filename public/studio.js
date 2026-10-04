const socket = io();

const BRIDGE_URL = "http://127.0.0.1:8787";

const promptEl = document.getElementById("prompt");
const sourceEl = document.getElementById("source");
const previewEl = document.getElementById("preview");
const statusEl = document.getElementById("status");
const bridgeStatusEl = document.getElementById("bridgeStatus");
const sendAIBtn = document.getElementById("sendAI");
const checkBridgeBtn = document.getElementById("checkBridge");
const clearBtn = document.getElementById("clear");
const aiStateEl = document.getElementById("aiState");

let applyingRemote = false;

function setServerStatus(online) {
  statusEl.textContent = online ? "● server online" : "● server offline";
  statusEl.className = online ? "status status-online" : "status status-offline";
}

function setBridgeStatus(online) {
  bridgeStatusEl.textContent = online ? "● bridge online" : "● bridge offline";
  bridgeStatusEl.className = online ? "status status-online" : "status status-offline";
}

function setPreview(text) {
  if (!text) {
    previewEl.textContent = "Английский блок пока не найден.";
    previewEl.classList.add("empty");
    return;
  }
  previewEl.textContent = text;
  previewEl.classList.remove("empty");
}

async function checkBridge() {
  try {
    const response = await fetch(`${BRIDGE_URL}/health`, {
      method: "GET",
      cache: "no-store"
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    setBridgeStatus(Boolean(data.ok));
    return Boolean(data.ok);
  } catch (error) {
    console.error("Bridge health check failed:", error);
    setBridgeStatus(false);
    return false;
  }
}

socket.on("connect", () => setServerStatus(true));
socket.on("disconnect", () => setServerStatus(false));

socket.on("state:update", (state) => {
  applyingRemote = true;
  sourceEl.value = state.fullText || "";
  applyingRemote = false;
  setPreview(state.englishText || "");
});

sourceEl.addEventListener("input", () => {
  if (applyingRemote) return;
  socket.emit("studio:update", sourceEl.value);
});

checkBridgeBtn.addEventListener("click", async () => {
  aiStateEl.textContent = "Проверяю локальный Bridge...";
  const ok = await checkBridge();
  aiStateEl.textContent = ok
    ? "Bridge подключён."
    : "Bridge не отвечает. Проверь, что на Mac запущен node bridge.js.";
});

sendAIBtn.addEventListener("click", async () => {
  const userPrompt = promptEl.value.trim();

  if (!userPrompt) {
    aiStateEl.textContent = "Сначала введи сообщение.";
    return;
  }

  const bridgeOk = await checkBridge();

  if (!bridgeOk) {
    aiStateEl.textContent = "Bridge не отвечает. Запусти node bridge.js на Mac.";
    return;
  }

  const bilingualPrompt = `
Ты отвечаешь для двуязычной AI Studio.

ФОРМАТ ОБЯЗАТЕЛЕН:
1. Сначала дай полный ответ на русском языке.
2. Затем на отдельной строке напиши ровно: 777ROCK777
3. После этого дай полный эквивалент того же ответа на английском языке.
4. Не используй маркер 777END777.
5. Не добавляй никакого текста перед русской частью.
6. Английская часть должна передавать весь смысл русской части.

Запрос пользователя:
${userPrompt}
`.trim();

  sendAIBtn.disabled = true;
  aiStateEl.textContent = "AI отвечает через ChatGPT Plus...";

  try {
    const response = await fetch(`${BRIDGE_URL}/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: bilingualPrompt })
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    const answer = String(data.answer || "").trim();

    sourceEl.value = answer;
    socket.emit("studio:update", answer);

    aiStateEl.textContent = "Ответ получен и отправлен в LIVE.";
  } catch (error) {
    console.error(error);
    aiStateEl.textContent = `Ошибка: ${error.message}`;
  } finally {
    sendAIBtn.disabled = false;
  }
});

clearBtn.addEventListener("click", () => {
  socket.emit("state:clear");
  promptEl.value = "";
  aiStateEl.textContent = "Очищено.";
});

checkBridge();
