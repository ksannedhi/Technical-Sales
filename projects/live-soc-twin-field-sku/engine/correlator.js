const { randomUUID } = require("crypto");

function buildIncidentKey(alert) {
  if (alert.scenario_id) return `scenario:${alert.scenario_id}`;
  return `${alert.mitre_tactic}:${alert.dest_hostname}`;
}

function upsertIncident(state, alert) {
  const key = buildIncidentKey(alert);
  const now = new Date().toISOString();
  let incident = state.incidents.find((i) => i.key === key);

  if (!incident) {
    incident = {
      id: randomUUID(),
      key,
      title: `${alert.mitre_tactic} activity on ${alert.dest_hostname}`,
      severity: alert.severity,
      status: "open",
      first_seen: now,
      last_seen: now,
      alert_ids: [],
      primary_tactic: alert.mitre_tactic,
      techniques: [],
      impacted_assets: [alert.dest_hostname],
      impacted_users: alert.dest_user ? [alert.dest_user] : [],
      recommended_action: "INVESTIGATE"
    };
    state.incidents.unshift(incident);
  }

  incident.last_seen = now;
  if (!incident.alert_ids.includes(alert.id)) incident.alert_ids.push(alert.id);
  if (!incident.techniques.includes(alert.mitre_technique_id)) {
    incident.techniques.push(alert.mitre_technique_id);
  }
  if (!incident.impacted_assets.includes(alert.dest_hostname)) {
    incident.impacted_assets.push(alert.dest_hostname);
  }
  if (alert.dest_user && !incident.impacted_users.includes(alert.dest_user)) {
    incident.impacted_users.push(alert.dest_user);
  }
  const severityRank = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };
  if (severityRank[alert.severity] > severityRank[incident.severity]) {
    incident.severity = alert.severity;
  }
  alert.incident_id = incident.id;
  return incident;
}

module.exports = { upsertIncident };