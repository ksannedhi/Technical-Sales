function summarizeAlert(alert) {
  return {
    threat_assessment: `Potential ${alert.mitre_tactic} activity: ${alert.event_type}`,
    mitre_mapping: `${alert.mitre_technique_id} (${alert.mitre_technique_name})`,
    risk_score: ["critical", "high"].includes(alert.severity) ? 8 : 5,
    recommended_action: ["critical", "high"].includes(alert.severity) ? "ESCALATE TO TIER-2" : "INVESTIGATE"
  };
}

async function triageWithOpenAI(_apiKey, _model, alert) {
  // v1 stub keeps the build provider-ready without making network calls.
  return summarizeAlert(alert);
}

module.exports = { triageWithOpenAI, summarizeAlert };