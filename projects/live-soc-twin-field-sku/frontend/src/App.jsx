import { useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";

const socket = io("http://localhost:3001", { autoConnect: true });
const timeFmt = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false
});

const VIEW_COPY = {
  analyst: "Analyst View: Triage alerts, validate evidence, and update statuses quickly.",
  manager: "SOC Manager View: Track incident load, severity mix, and response stability.",
  ciso: "CISO View: Show business impact, affected services, and risk reduction signals."
};

const VALID_MODES = ["analyst", "manager", "ciso"];

const VIEW_LABEL = {
  analyst: "Analyst Operations Console",
  manager: "SOC Manager Operations View",
  ciso: "Executive Risk View"
};

export default function App() {
  const [alerts, setAlerts] = useState([]);
  const [health, setHealth] = useState({ alerts: 0, incidents: 0, running_scenarios: [] });
  const [kpi, setKpi] = useState({ openAlertsSmoothed: 0 });
  const [viewMode, setViewMode] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get("mode");
    return VALID_MODES.includes(mode) ? mode : "analyst";
  });
  const [error, setError] = useState("");

  const refreshHealth = async () => {
    try {
      const data = await fetch("http://localhost:3001/api/health").then((r) => r.json());
      setHealth(data);
    } catch {
      setError("Cannot reach backend health endpoint.");
    }
  };

  useEffect(() => {
    fetch("http://localhost:3001/api/alerts?limit=60")
      .then((r) => r.json())
      .then((data) => setAlerts(data.slice(0, 60)))
      .catch(() => setError("Cannot load initial alerts."));

    refreshHealth();

    const onNewAlert = (alert) => {
      setAlerts((prev) => [alert, ...prev].slice(0, 60));
    };

    socket.on("alert:new", onNewAlert);
    socket.on("scenario:started", refreshHealth);
    socket.on("scenario:ended", refreshHealth);
    socket.on("operator:reset", () => {
      setAlerts([]);
      refreshHealth();
    });

    return () => {
      socket.off("alert:new", onNewAlert);
      socket.off("scenario:started", refreshHealth);
      socket.off("scenario:ended", refreshHealth);
      socket.off("operator:reset");
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      setKpi((prev) => ({
        openAlertsSmoothed: Math.round((prev.openAlertsSmoothed * 0.7) + (health.alerts * 0.3))
      }));
    }, 2000);
    return () => clearInterval(id);
  }, [health.alerts]);

  const runScenario = async (scenarioId) => {
    setError("");
    const res = await fetch("http://localhost:3001/api/scenarios/trigger", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenario_id: scenarioId })
    });

    const body = await res.json();
    if (!res.ok) {
      setError(body.error || "Failed to start scenario.");
    }
    refreshHealth();
  };

  const stopScenario = async () => {
    setError("");
    await fetch("http://localhost:3001/api/scenarios/stop", { method: "POST" });
    refreshHealth();
  };

  const reset = async () => {
    setError("");
    await fetch("http://localhost:3001/api/reset", { method: "POST" });
    setAlerts([]);
    refreshHealth();
  };

  const criticalCount = useMemo(() => alerts.filter((a) => a.severity === "critical").length, [alerts]);
  const highCount = useMemo(() => alerts.filter((a) => a.severity === "high").length, [alerts]);
  const serviceCount = useMemo(() => new Set(alerts.map((a) => a.business_service)).size, [alerts]);
  const privilegedHits = useMemo(() => alerts.filter((a) => String(a.dest_user || "").startsWith("svc_")).length, [alerts]);
  const riskScore = Math.min(100, (criticalCount * 15) + (highCount * 7) + (health.incidents * 3));

  const renderModeKPIs = () => {
    if (viewMode === "analyst") {
      return (
        <>
          <h3>Analyst KPIs</h3>
          <p>Open Alerts: {health.alerts}</p>
          <p>Open Alerts (Smoothed): {kpi.openAlertsSmoothed}</p>
          <p>Critical Alerts: {criticalCount}</p>
          <p>Privileged Account Hits: {privilegedHits}</p>
        </>
      );
    }

    if (viewMode === "manager") {
      return (
        <>
          <h3>SOC Manager KPIs</h3>
          <p>Open Incidents: {health.incidents}</p>
          <p>High+Critical Alerts: {highCount + criticalCount}</p>
          <p>Estimated Analyst Load: {Math.max(1, Math.ceil((health.alerts + health.incidents) / 12))} analysts</p>
          <p>Scenario Status: {(health.running_scenarios || []).join(", ") || "No active scenario"}</p>
        </>
      );
    }

    return (
      <>
        <h3>Executive Risk KPIs</h3>
        <p>Risk Posture Index: {riskScore}/100</p>
        <p>Impacted Services: {serviceCount}</p>
        <p>Active Security Incidents: {health.incidents}</p>
        <p>Business Narrative: Incident growth is {(riskScore >= 60 ? "material" : "contained")}.</p>
      </>
    );
  };

  const lastColumnTitle = viewMode === "analyst" ? "MITRE" : viewMode === "manager" ? "Status" : "Service";
  const lastColumnValue = (a) => {
    if (viewMode === "analyst") return a.mitre_technique_id;
    if (viewMode === "manager") return a.status;
    return a.business_service;
  };

  return (
    <div className="app">
      <h2>SOC Twin Demo (Field SKU)</h2>
      <div className="card">
        <button onClick={() => runScenario("phishing-credential-lateral")}>Start Phishing Scenario</button>
        <button onClick={() => runScenario("ransomware-precursor")}>Start Ransomware Scenario</button>
        <button onClick={() => runScenario("cloud-identity-abuse")}>Start Cloud Identity Scenario</button>
        <button onClick={stopScenario}>Stop Scenario</button>
        <button onClick={reset}>Reset</button>
      </div>

      <div className="card">
        <strong>Audience Mode:</strong>
        <button className={viewMode === "analyst" ? "active" : ""} onClick={() => setViewMode("analyst")}>Analyst</button>
        <button className={viewMode === "manager" ? "active" : ""} onClick={() => setViewMode("manager")}>SOC Manager</button>
        <button className={viewMode === "ciso" ? "active" : ""} onClick={() => setViewMode("ciso")}>CISO</button>
        <p><strong>{VIEW_LABEL[viewMode]}</strong></p>
        <p>{VIEW_COPY[viewMode]}</p>
        {error ? <p className="error">{error}</p> : null}
      </div>

      <div className="grid">
        <div className="card">
          <h3>{VIEW_LABEL[viewMode]} - Live Alerts</h3>
          <table className="table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Severity</th>
                <th>Event</th>
                <th>Host</th>
                <th>{lastColumnTitle}</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((a) => (
                <tr key={a.id}>
                  <td>{timeFmt.format(new Date(a.timestamp))}</td>
                  <td><span className={`badge ${a.severity}`}>{a.severity}</span></td>
                  <td>{a.event_type}</td>
                  <td>{a.dest_hostname}</td>
                  <td>{lastColumnValue(a)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          {renderModeKPIs()}
          <p>Demo Data Only</p>
        </div>
      </div>
    </div>
  );
}