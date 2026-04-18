require("dotenv").config();

const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");

const state = require("./state");
const runner = require("../engine/scenario-runner");
const { errorHandler } = require("./middleware/errorHandler");
const { createAlertsRouter } = require("./routes/alerts");
const { createAnalystRouter } = require("./routes/analyst");
const { createIncidentsRouter } = require("./routes/incidents");
const { createScenariosRouter } = require("./routes/scenarios");
const { createControlRouter } = require("./routes/control");

const LOCALHOST_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:3001",
  "http://127.0.0.1:3001"
];

const app = express();
app.use(cors({ origin: LOCALHOST_ORIGINS }));
app.use(express.json());

// Reject requests that didn't originate from the local machine.
app.use((req, res, next) => {
  const ip = req.socket.remoteAddress || "";
  const isLocal = ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
  if (!isLocal) return res.status(403).json({ error: "Local access only" });
  next();
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: LOCALHOST_ORIGINS } });

app.get("/", (_req, res) => {
  res.json({ name: process.env.DEMO_BRAND || "SOC Twin Demo", status: "ok" });
});

app.use("/api/alerts", createAlertsRouter(state));
app.use("/api/analyst", createAnalystRouter(state));
app.use("/api/incidents", createIncidentsRouter(state));
app.use("/api/scenarios", createScenariosRouter(state, io, runner));
app.use("/api", createControlRouter(state, io, runner));

app.use(errorHandler);

io.on("connection", (socket) => {
  socket.emit("status", { connected: true, ts: new Date().toISOString() });
});

const port = Number(process.env.PORT || 3001);
server.listen(port, () => {
  console.log(`[API] SOC Twin backend listening on ${port}`);
});

const backgroundTimer = runner.startBackgroundNoise(state, io);

function shutdown() {
  clearInterval(backgroundTimer);
  runner.stopAllScenarios(state, io);
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
