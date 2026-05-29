const express = require("express");

function createExportRouter(state) {
  const router = express.Router();

  router.get("/report", (req, res) => {
    const scenarioAlerts = state.alerts.filter((a) => a.scenario_id);
    const scenarioIds = [...new Set(scenarioAlerts.map((a) => a.scenario_id))];

    const scenariosRun = scenarioIds.map((id) => ({
      id,
      name: state.playbooks[id]?.name || id,
      alert_count: scenarioAlerts.filter((a) => a.scenario_id === id).length
    }));

    const highestRisk = state.alerts.reduce((max, a) => Math.max(max, a.risk_score || 0), 0);

    const severityRank = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };
    const highestSeverity = state.alerts.reduce((max, a) => {
      return (severityRank[a.severity] || 0) > (severityRank[max] || 0) ? a.severity : max;
    }, "low");

    res.json({
      generated_at: new Date().toISOString(),
      summary: {
        total_alerts: state.alerts.length,
        scenario_alerts: scenarioAlerts.length,
        total_incidents: state.incidents.length,
        total_tickets: state.tickets.length,
        highest_risk_score: highestRisk,
        highest_severity: highestSeverity,
        triage_count: Object.keys(state.triageResults).length
      },
      scenarios_run: scenariosRun,
      attack_timeline: [...scenarioAlerts].sort(
        (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
      ),
      incidents: state.incidents,
      tickets: state.tickets,
      triage_results: Object.values(state.triageResults).sort(
        (a, b) => new Date(a.triaged_at) - new Date(b.triaged_at)
      )
    });
  });

  return router;
}

module.exports = { createExportRouter };
