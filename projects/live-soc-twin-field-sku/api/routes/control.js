const express = require("express");

function createControlRouter(state, io, runner) {
  const router = express.Router();

  router.post("/reset", (_req, res) => {
    runner.stopAllScenarios(state, io);
    state.alerts = [];
    state.incidents = [];
    io.emit("operator:reset", { ts: new Date().toISOString() });
    res.json({ ok: true });
  });

  router.post("/seed", (req, res) => {
    const count = Number(req.body.count || 20);
    const SEED_EVENTS = [
      { severity: "low",    event_type: "Routine Auth Success",        mitre_tactic: "Discovery",         mitre_technique_id: "T1087"     },
      { severity: "low",    event_type: "File Share Access",           mitre_tactic: "Discovery",         mitre_technique_id: "T1087"     },
      { severity: "low",    event_type: "Outbound DNS Query",          mitre_tactic: "Discovery",         mitre_technique_id: "T1087"     },
      { severity: "low",    event_type: "Scheduled Task Execution",    mitre_tactic: "Persistence",       mitre_technique_id: "T1098"     },
      { severity: "medium", event_type: "Multiple Failed Logins",      mitre_tactic: "Credential Access", mitre_technique_id: "T1110.003" },
      { severity: "medium", event_type: "Account Permission Modified", mitre_tactic: "Persistence",       mitre_technique_id: "T1098"     },
    ];
    for (let i = 0; i < count; i += 1) {
      runner.emitAlert(state, io, SEED_EVENTS[i % SEED_EVENTS.length]);
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