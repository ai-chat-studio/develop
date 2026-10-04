const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

const ROCK = "777ROCK777";
const USER_START = "777USER777";
const USER_END = "777USEROFF777";

const state = {
  history: [],
  updatedAt: null
};

function parseModelAnswer(rawText) {
  const raw = String(rawText || "").trim();

  const rockIndex = raw.indexOf(ROCK);

  if (rockIndex === -1) {
    return {
      ruAI: raw,
      enUser: "",
      enAI: ""
    };
  }

  const ruAI = raw.slice(0, rockIndex).trim();
  const englishSection = raw.slice(rockIndex + ROCK.length).trim();

  const userStartIndex = englishSection.indexOf(USER_START);
  const userEndIndex = englishSection.indexOf(USER_END);

  if (
    userStartIndex === -1 ||
    userEndIndex === -1 ||
    userEndIndex < userStartIndex
  ) {
    return {
      ruAI,
      enUser: "",
      enAI: englishSection
        .replace(USER_START, "")
        .replace(USER_END, "")
        .trim()
    };
  }

  const enUser = englishSection
    .slice(userStartIndex + USER_START.length, userEndIndex)
    .trim();

  const enAI = englishSection
    .slice(userEndIndex + USER_END.length)
    .trim();

  return {
    ruAI,
    enUser,
    enAI
  };
}

function sanitizeFiles(input) {
  if (!Array.isArray(input)) return [];

  const allowedActions = new Set(["created", "updated", "deleted"]);

  return input
    .slice(0, 100)
    .map((file) => {
      const action = String(file?.action || "").toLowerCase();
      const filePath = String(file?.path || "")
        .replace(/\\/g, "/")
        .trim()
        .slice(0, 500);

      if (!allowedActions.has(action)) return null;
      if (!filePath) return null;
      if (filePath.startsWith("/") || filePath.includes("../")) return null;

      const sizeRaw = Number(file?.size);
      const size = Number.isFinite(sizeRaw) && sizeRaw >= 0 ? sizeRaw : 0;

      const extension = String(file?.extension || "")
        .trim()
        .slice(0, 30);

      let content = null;

      if (typeof file?.content === "string") {
        // Keep Live payloads bounded even if Bridge is later configured
        // to return larger files.
        content = file.content.slice(0, 200000);
      }

      return {
        action,
        path: filePath,
        size,
        extension,
        content
      };
    })
    .filter(Boolean);
}

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.redirect("/studio.html");
});

io.on("connection", (socket) => {
  socket.emit("conversation:state", state);

  socket.on("conversation:add", (payload) => {
    const ruUser = String(payload?.ruUser || "").trim().slice(0, 10000);
    const rawAnswer = String(payload?.rawAnswer || "").trim().slice(0, 50000);
    const files = sanitizeFiles(payload?.files);

    if (!ruUser || !rawAnswer) return;

    const parsed = parseModelAnswer(rawAnswer);

    const turn = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      createdAt: new Date().toISOString(),
      ruUser,
      ruAI: parsed.ruAI,
      enUser: parsed.enUser,
      enAI: parsed.enAI,
      rawAnswer,
      files
    };

    state.history.push(turn);

    if (state.history.length > 100) {
      state.history = state.history.slice(-100);
    }

    state.updatedAt = new Date().toISOString();

    io.emit("conversation:turn", turn);
  });

  socket.on("conversation:clear", () => {
    state.history = [];
    state.updatedAt = new Date().toISOString();
    io.emit("conversation:state", state);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`AI Studio MVP v0.6 running on port ${PORT}`);
  console.log(`Studio: http://localhost:${PORT}/studio.html`);
  console.log(`Live:   http://localhost:${PORT}/live.html`);
});
