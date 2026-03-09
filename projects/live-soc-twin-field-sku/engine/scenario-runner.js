const { buildAlert } = require("./event-generator");
const { upsertIncident } = require("./correlator");

function emitAlert(state, io, seed) {
  const alert = buildAlert(state, seed);
  state.alerts.unshift(alert);

  // Bound memory growth for long demo sessions on 8GB laptops.
  if (state.alerts.length > 500) {
    state.alerts.length = 500;
  }

  const incident = upsertIncident(state, alert);
  io.emit("alert:new", alert);
  io.emit("incident:updated", incident);
  return alert;
}

function stopAllScenarios(state, io) {
  for (const run of state.scenarioRuns.values()) {
    for (const timer of run.timers) clearTimeout(timer);
    if (run.noiseTimer) clearInterval(run.noiseTimer);
    io.emit("scenario:ended", { scenario_id: run.id });
  }
  state.scenarioRuns.clear();
}

function runScenario(state, io, scenarioId, speedMultiplier = 1) {
  const playbook = state.playbooks[scenarioId];
  if (!playbook) {
    throw new Error(`Unknown scenario: ${scenarioId}`);
  }

  if (state.scenarioRuns.size > 0) {
    throw new Error("Another scenario is already running. Stop it before starting a new one.");
  }

  const run = {
    id: playbook.id,
    status: "running",
    startedAt: Date.now(),
    speedMultiplier,
    timers: [],
    noiseTimer: null
  };

  for (const event of playbook.events) {
    const delay = Math.max(0, Math.floor((event.delay_seconds * 1000) / speedMultiplier));
    const timer = setTimeout(() => {
      if (run.status !== "running") return;
      const alert = emitAlert(state, io, { ...event, scenario_id: playbook.id });
      io.emit("scenario:event", { scenario_id: playbook.id, alert_id: alert.id, event_type: event.event_type });
    }, delay);
    run.timers.push(timer);
  }

  const incidentRateMs = Number(process.env.SCENARIO_NOISE_MS || 1200);
  const traffic = state.trafficProfiles.incident_spike || { background_rate_ms: incidentRateMs };
  run.noiseTimer = setInterval(() => {
    if (run.status !== "running") return;
    emitAlert(state, io, {
      severity: "low",
      event_type: "Background Noise Event",
      mitre_tactic: "Discovery",
      mitre_technique_id: "T1087"
    });
  }, Math.max(500, Number(traffic.background_rate_ms || incidentRateMs)));

  const endTimer = setTimeout(() => {
    if (run.noiseTimer) clearInterval(run.noiseTimer);
    run.status = "completed";
    io.emit("scenario:ended", { scenario_id: playbook.id });
    state.scenarioRuns.delete(playbook.id);
  }, Math.floor((playbook.duration_seconds * 1000) / speedMultiplier));
  run.timers.push(endTimer);

  state.scenarioRuns.set(playbook.id, run);
  io.emit("scenario:started", { scenario_id: playbook.id, speedMultiplier });
  return playbook;
}

function pauseScenario(state, io, scenarioId) {
  const run = state.scenarioRuns.get(scenarioId);
  if (!run) return false;
  run.status = "paused";
  if (run.noiseTimer) clearInterval(run.noiseTimer);
  io.emit("scenario:paused", { scenario_id: scenarioId });
  return true;
}

function resumeScenario(state, io, scenarioId) {
  const run = state.scenarioRuns.get(scenarioId);
  if (!run) return false;
  run.status = "running";
  const incidentRateMs = Number(process.env.SCENARIO_NOISE_MS || 1200);
  const traffic = state.trafficProfiles.incident_spike || { background_rate_ms: incidentRateMs };
  run.noiseTimer = setInterval(() => {
    if (run.status !== "running") return;
    emitAlert(state, io, {
      severity: "low",
      event_type: "Background Noise Event",
      mitre_tactic: "Discovery",
      mitre_technique_id: "T1087"
    });
  }, Math.max(500, Number(traffic.background_rate_ms || incidentRateMs)));
  io.emit("scenario:resumed", { scenario_id: scenarioId });
  return true;
}

function startBackgroundNoise(state, io) {
  const envRate = Number(process.env.EVENT_RATE_MS || 3200);
  const profile = state.trafficProfiles.business_hours || { background_rate_ms: envRate };
  const interval = Math.max(1000, Number(profile.background_rate_ms || envRate));
  return setInterval(() => {
    emitAlert(state, io, {
      severity: "low",
      event_type: "Routine Authentication Event",
      mitre_tactic: "Discovery",
      mitre_technique_id: "T1087"
    });
  }, interval);
}

module.exports = {
  runScenario,
  pauseScenario,
  resumeScenario,
  stopAllScenarios,
  startBackgroundNoise,
  emitAlert
};