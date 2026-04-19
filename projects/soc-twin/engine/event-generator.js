const { randomUUID } = require("crypto");

function randomItem(items, fallback) {
  return items && items.length ? items[Math.floor(Math.random() * items.length)] : fallback;
}

const SEVERITY_BASE   = { critical: 8, high: 6, medium: 4, low: 2 };
const CRITICALITY_BONUS = { critical: 2, high: 1, medium: 0, low: -1 };

function computeRiskScore(severity, assetCriticality) {
  const base    = SEVERITY_BASE[severity]        || 2;
  const bonus   = CRITICALITY_BONUS[assetCriticality] || 0;
  const variance = Math.floor(Math.random() * 3) - 1; // -1, 0, +1
  return Math.max(1, Math.min(10, base + bonus + variance));
}

function mitreName(state, techniqueId) {
  const t = state.mitre.find((m) => m.technique_id === techniqueId);
  return t ? t.technique_name : "Unknown Technique";
}

function makeRawLog(eventType, src, dst) {
  return `<134>1 ${new Date().toISOString()} SOC-TWIN ${eventType.replace(/\s+/g, "_")} - src=${src} dst=${dst}`;
}

function buildAlert(state, seed) {
  const pinned = seed.dest_hostname ? state.hosts.find((h) => h.hostname === seed.dest_hostname) : null;
  const host = pinned || randomItem(state.hosts, { hostname: "WS-01", ip: "10.0.20.10", criticality: "medium", business_service: "Endpoint" });
  const user = randomItem(state.users, { username: "user1" });
  const geo = randomItem(state.geos, { country: "United States", city: "Ashburn", lat: 39.0438, lon: -77.4874 });

  const alert = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    severity: seed.severity || "low",
    status: "new",
    event_type: seed.event_type || "Suspicious Activity",
    mitre_tactic: seed.mitre_tactic || "Discovery",
    mitre_technique_id: seed.mitre_technique_id || "T1087",
    mitre_technique_name: seed.mitre_technique_name || mitreName(state, seed.mitre_technique_id || "T1087"),
    source_ip: seed.source_ip || `185.${Math.floor(Math.random() * 220)}.${Math.floor(Math.random() * 220)}.${Math.floor(Math.random() * 220)}`,
    source_geo: geo,
    dest_ip: host.ip,
    dest_hostname: host.hostname,
    dest_user: user.username,
    process_name: seed.process_name || "powershell.exe",
    cve_id: seed.cve_id || null,
    raw_log: makeRawLog(seed.event_type || "Suspicious Activity", seed.source_ip || "internet", host.ip),
    scenario_id: seed.scenario_id || null,
    incident_id: null,
    business_service: host.business_service,
    asset_criticality: host.criticality,
    risk_score: computeRiskScore(seed.severity || "low", host.criticality)
  };

  return alert;
}

module.exports = { buildAlert };