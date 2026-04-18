const express = require("express");
const { triageAlert } = require("../../analyst/triage-agent");
const { shouldEscalate } = require("../../analyst/escalation");

function createAnalystRouter(state) {
  const router = express.Router();

  router.post("/triage", async (req, res, next) => {
    try {
      const alertId = req.body.alert_id;
      if (!alertId) {
        return res.status(400).json({ error: "alert_id is required" });
      }

      const alert = state.alerts.find((item) => item.id === alertId);
      if (!alert) {
        return res.status(404).json({ error: "Alert not found" });
      }

      const relatedAlerts = state.alerts
        .filter((item) => item.incident_id && item.incident_id === alert.incident_id)
        .slice(0, 10)
        .map((item) => ({
          id: item.id,
          timestamp: item.timestamp,
          severity: item.severity,
          event_type: item.event_type,
          dest_hostname: item.dest_hostname,
          mitre_technique_id: item.mitre_technique_id
        }));

      const incident = state.incidents.find((item) => item.id === alert.incident_id);
      const summary = await triageAlert(alert, {
        incident: incident || null,
        relatedAlerts
      });

      if (shouldEscalate(summary, alert)) {
        summary.recommended_action = "ESCALATE TO TIER-2";
      }

      res.json({
        ok: true,
        alert_id: alert.id,
        summary
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { createAnalystRouter };
