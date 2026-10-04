const socket = io();

const source = document.getElementById("source");
const preview = document.getElementById("preview");
const statusEl = document.getElementById("status");
const exampleBtn = document.getElementById("example");
const clearBtn = document.getElementById("clear");

let applyingRemote = false;

function setStatus(online) {
  statusEl.textContent = online ? "● online" : "● offline";
  statusEl.className = online ? "status status-online" : "status status-offline";
}

function setPreview(text) {
  if (!text) {
    preview.textContent = "Английский блок пока не найден.";
    preview.classList.add("empty");
    return;
  }
  preview.textContent = text;
  preview.classList.remove("empty");
}

socket.on("connect", () => setStatus(true));
socket.on("disconnect", () => setStatus(false));

socket.on("state:update", (state) => {
  applyingRemote = true;
  source.value = state.fullText || "";
  applyingRemote = false;
  setPreview(state.englishText || "");
});

source.addEventListener("input", () => {
  if (applyingRemote) return;
  socket.emit("studio:update", source.value);
});

exampleBtn.addEventListener("click", () => {
  source.value = `777ROCK777
Hello! This is the English version that should appear in the second window.
Everything inside this block is visible to the English-speaking audience.
777END777

Русский:
Привет! Это русская часть ответа. Она останется только в рабочем окне.`;
  socket.emit("studio:update", source.value);
});

clearBtn.addEventListener("click", () => {
  socket.emit("state:clear");
});
