const express = require("express");

function createControlRouter(state, io, runner) {
  const router = express.Router();

  router.post("/reset", (_req, res) => {
    runner.stopAllScenarios(state, io);
    state.alerts = [];
    state.incidents = [];
    state.tickets = [];
    io.emit("operator:reset", { ts: new Date().toISOString() });
    res.json({ ok: true });
  });

  router.post("/seed", (req, res) => {
    const count = Number(req.body.count || 20);
    for (let i = 0; i < count; i += 1) {
      runner.emitAlert(state, io, {
        severity: i % 10 === 0 ? "high" : "low",
        event_type: i % 10 === 0 ? "Multiple Failed Logins" : "Routine Auth Success",
        mitre_tactic: i % 10 === 0 ? "Credential Access" : "Discovery",
        mitre_technique_id: i % 10 === 0 ? "T1110.003" : "T1087"
      });
    }
    res.json({ ok: true, count });
  });

  router.get("/health", (_req, res) => {
    res.json({
      ok: true,
      alerts: state.alerts.length,
      incidents: state.incidents.length,
      running_scenarios: Array.from(state.scenarioRuns.keys())
    });
  });

  return router;
}

module.exports = { createControlRouter };