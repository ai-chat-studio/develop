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
  workspace: {
    rootName: "AI-Studio-Workspace",
    files: [],
    truncated: false,
    updatedAt: null
  },
  updatedAt: null
};

function parseModelAnswer(rawText) {
  const raw = String(rawText || "").trim();
  const rockIndex = raw.indexOf(ROCK);

  if (rockIndex === -1) {
    return { ruAI: raw, enUser: "", enAI: "" };
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

  return {
    ruAI,
    enUser: englishSection
      .slice(userStartIndex + USER_START.length, userEndIndex)
      .trim(),
    enAI: englishSection
      .slice(userEndIndex + USER_END.length)
      .trim()
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

      return {
        action,
        path: filePath,
        size,
        extension: String(file?.extension || "").slice(0, 30),
        content:
          typeof file?.content === "string"
            ? file.content.slice(0, 200000)
            : null
      };
    })
    .filter(Boolean);
}

function sanitizeWorkspace(input) {
  const source = input && typeof input === "object" ? input : {};
  const rawFiles = Array.isArray(source.files) ? source.files : [];

  let totalContentChars = 0;
  const maxTotalContentChars = 2_000_000;

  const files = rawFiles
    .slice(0, 250)
    .map((file) => {
      const filePath = String(file?.path || "")
        .replace(/\\/g, "/")
        .trim()
        .slice(0, 500);

      if (!filePath) return null;
      if (filePath.startsWith("/") || filePath.includes("../")) return null;

      const sizeRaw = Number(file?.size);
      const size = Number.isFinite(sizeRaw) && sizeRaw >= 0 ? sizeRaw : 0;

      let content = null;

      if (typeof file?.content === "string") {
        const remaining = maxTotalContentChars - totalContentChars;

        if (remaining > 0) {
          content = file.content.slice(0, Math.min(200000, remaining));
          totalContentChars += content.length;
        }
      }

      return {
        path: filePath,
        size,
        extension: String(file?.extension || "").slice(0, 30),
        mtimeMs: Number(file?.mtimeMs) || 0,
        content
      };
    })
    .filter(Boolean);

  return {
    rootName: "AI-Studio-Workspace",
    files,
    truncated: Boolean(source.truncated),
    updatedAt: new Date().toISOString()
  };
}

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.redirect("/studio.html");
});

io.on("connection", (socket) => {
  socket.emit("conversation:state", {
    history: state.history,
    updatedAt: state.updatedAt
  });

  socket.emit("workspace:state", state.workspace);

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

  socket.on("workspace:update", (workspace) => {
    state.workspace = sanitizeWorkspace(workspace);
    io.emit("workspace:state", state.workspace);
  });

  socket.on("conversation:clear", () => {
    state.history = [];
    state.updatedAt = new Date().toISOString();

    io.emit("conversation:state", {
      history: state.history,
      updatedAt: state.updatedAt
    });
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`AI Studio MVP v0.7 running on port ${PORT}`);
});
