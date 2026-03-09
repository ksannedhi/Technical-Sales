const express = require("express");

function createScenariosRouter(state, io, runner) {
  const router = express.Router();

  router.post("/trigger", (req, res, next) => {
    try {
      const scenarioId = req.body.scenario_id;
      const speedMultiplier = Number(req.body.speed_multiplier || 1);
      const playbook = runner.runScenario(state, io, scenarioId, speedMultiplier);
      res.json({ ok: true, playbook });
    } catch (err) {
      if (String(err.message || "").includes("already running")) {
        return res.status(409).json({ ok: false, error: err.message });
      }
      next(err);
    }
  });

  router.post("/stop", (_req, res) => {
    runner.stopAllScenarios(state, io);
    res.json({ ok: true });
  });

  router.post("/pause", (req, res) => {
    const ok = runner.pauseScenario(state, io, req.body.scenario_id);
    res.json({ ok });
  });

  router.post("/resume", (req, res) => {
    const ok = runner.resumeScenario(state, io, req.body.scenario_id);
    res.json({ ok });
  });

  return router;
}

module.exports = { createScenariosRouter };