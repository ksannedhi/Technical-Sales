const express = require("express");
const { triageAlert } = require("../../analyst/triage-agent");
const { shouldEscalate } = require("../../analyst/escalation");

function buildResponseActions(alert) {
  const now = Date.now();
  const actions = [
    { ts: new Date(now).toISOString(), action: "Incident escalated to Tier-2 MDR analyst", actor: "ARIA" }
  ];
  if (alert.dest_hostname) {
    actions.push({ ts: new Date(now + 2000).toISOString(), action: `Host ${alert.dest_hostname} isolated from network`, actor: "MDR Operations" });
    actions.push({ ts: new Date(now + 12000).toISOString(), action: `Forensic snapshot initiated on ${alert.dest_hostname}`, actor: "MDR Operations" });
  }
  if (alert.source_ip) {
    actions.push({ ts: new Date(now + 5000).toISOString(), action: `Source IP ${alert.source_ip} blocked at perimeter firewall`, actor: "MDR Operations" });
  }
  if (alert.dest_user) {
    actions.push({ ts: new Date(now + 8000).toISOString(), action: `User account ${alert.dest_user} suspended pending investigation`, actor: "MDR Operations" });
  }
  return actions.sort((a, b) => new Date(a.ts) - new Date(b.ts));
}

function deriveCustomerAction(alert) {
  const tactic = (alert.mitre_tactic || "").toLowerCase();
  const user = alert.dest_user || "the affected user";
  const host = alert.dest_hostname || "the affected host";

  if (tactic.includes("credential") || tactic.includes("initial access")) {
    return `Reset credentials for ${user} immediately and enable MFA if not already active.`;
  }
  if (tactic.includes("lateral")) {
    return `Audit ${user} access across all systems and confirm whether ${host} has any legitimate remote sessions in progress.`;
  }
  if (tactic.includes("impact")) {
    return `Do not power off ${host}. Verify backup integrity and await further instructions from MDR Operations before taking any action.`;
  }
  if (tactic.includes("persistence")) {
    return `Audit privileged accounts on ${host} and review recent configuration changes in your identity provider.`;
  }
  if (tactic.includes("execution")) {
    return `Confirm whether ${host} is in active use and notify MDR Operations of any user-observed symptoms immediately.`;
  }
  return `Review the incident and confirm with MDR Operations whether ${host} requires physical inspection or user notification.`;
}

function createAnalystRouter(state, io) {
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

      let ticket = null;
      if (summary.recommended_action === "ESCALATE TO TIER-2") {
        const alreadyTicketed = state.tickets.find((t) => t.alert_id === alert.id);
        if (!alreadyTicketed) {
          const ticketNum = String(state.tickets.length + 1).padStart(4, "0");
          ticket = {
            id: `TKT-${ticketNum}`,
            incident_id: alert.incident_id || null,
            alert_id: alert.id,
            created_at: new Date().toISOString(),
            severity: alert.severity,
            status: "open",
            title: `${alert.mitre_tactic}: ${alert.event_type} on ${alert.dest_hostname || "Unknown Host"}`,
            threat_summary: summary.threat_assessment,
            mitre_mapping: summary.mitre_mapping,
            response_actions: buildResponseActions(alert),
            customer_action: deriveCustomerAction(alert)
          };
          state.tickets.push(ticket);
          io.emit("ticket:created", ticket);
        } else {
          ticket = alreadyTicketed;
        }
      }

      res.json({
        ok: true,
        alert_id: alert.id,
        summary,
        ticket
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { createAnalystRouter };
