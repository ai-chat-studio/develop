const socket = io();

const liveText = document.getElementById("liveText");
const statusEl = document.getElementById("status");

function setStatus(online) {
  statusEl.textContent = online ? "● online" : "● offline";
  statusEl.className = online ? "status status-online" : "status status-offline";
}

function render(text) {
  if (!text) {
    liveText.textContent = "Waiting for English text…";
    liveText.classList.add("empty");
    return;
  }

  liveText.textContent = text;
  liveText.classList.remove("empty");
}

socket.on("connect", () => setStatus(true));
socket.on("disconnect", () => setStatus(false));

socket.on("state:update", (state) => {
  render(state.englishText || "");
});
