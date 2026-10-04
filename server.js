const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const START_KEY = "777ROCK777";
const END_KEY = "777END777";

const state = {
  fullText: "",
  englishText: "",
  updatedAt: null
};

function extractEnglish(text) {
  const src = String(text ?? "");
  const start = src.indexOf(START_KEY);
  if (start === -1) return "";

  const contentStart = start + START_KEY.length;
  const end = src.indexOf(END_KEY, contentStart);

  const english = end === -1
    ? src.slice(contentStart)
    : src.slice(contentStart, end);

  return english.trim();
}

function publishState() {
  io.emit("state:update", state);
}

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.redirect("/studio.html");
});

io.on("connection", (socket) => {
  socket.emit("state:update", state);

  socket.on("studio:update", (text) => {
    state.fullText = String(text ?? "").slice(0, 20000);
    state.englishText = extractEnglish(state.fullText);
    state.updatedAt = new Date().toISOString();
    publishState();
  });

  socket.on("state:clear", () => {
    state.fullText = "";
    state.englishText = "";
    state.updatedAt = new Date().toISOString();
    publishState();
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Text Mirror MVP v0.2 running on port ${PORT}`);
  console.log(`Studio: http://localhost:${PORT}/studio.html`);
  console.log(`Live:   http://localhost:${PORT}/live.html`);
});
