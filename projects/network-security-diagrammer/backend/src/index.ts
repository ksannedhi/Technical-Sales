import "dotenv/config";
import cors from "cors";
import express from "express";
import { analyzeRoute } from "./routes/analyze.js";
import { generateRoute } from "./routes/generate.js";
import { followupRoute } from "./routes/followup.js";

const app = express();
const port = Number(process.env.PORT || 8787);

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/analyze", analyzeRoute);
app.post("/api/generate", generateRoute);
app.post("/api/followup", followupRoute);

app.listen(port, () => {
  console.log(`Network Security Diagrammer backend listening on http://localhost:${port}`);
});
