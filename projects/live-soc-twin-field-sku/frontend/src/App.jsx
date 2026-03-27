import { useEffect, useMemo, useState } from "react";
import html2canvas from "html2canvas";
import { io } from "socket.io-client";

const API_BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:3001";
const WS_BASE = import.meta.env.VITE_WS_URL || API_BASE;
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
  const [exportState, setExportState] = useState("idle");
  const [selectedAlertId, setSelectedAlertId] = useState(null);
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [analysisState, setAnalysisState] = useState("idle");
  const [analysis, setAnalysis] = useState(null);
  const [selectionMessage, setSelectionMessage] = useState("");
  const scenarioRunning = (health.running_scenarios || []).length > 0;
  const runningScenarioLabel = (health.running_scenarios || []).join(", ");

  const refreshHealth = async () => {
    try {
      const data = await fetch(`${API_BASE}/api/health`).then((r) => r.json());
      setHealth(data);
    } catch {
      setError("Cannot reach backend health endpoint.");
    }
  };

  useEffect(() => {
    const socket = io(WS_BASE, {
      autoConnect: true,
      transports: ["websocket", "polling"]
    });

    fetch(`${API_BASE}/api/alerts?limit=60`)
      .then((r) => r.json())
      .then((data) => {
        const nextAlerts = data.slice(0, 60);
        setAlerts(nextAlerts);
      })
      .catch(() => setError("Cannot load initial alerts."));

    refreshHealth();

    const onNewAlert = (alert) => {
      setAlerts((prev) => [alert, ...prev].slice(0, 60));
    };
    const onReset = () => {
      setAlerts([]);
      setSelectedAlertId(null);
      setSelectedAlert(null);
      setAnalysis(null);
      setSelectionMessage("");
      refreshHealth();
    };

    socket.on("alert:new", onNewAlert);
    socket.on("scenario:started", refreshHealth);
    socket.on("scenario:ended", refreshHealth);
    socket.on("operator:reset", onReset);

    return () => {
      socket.off("alert:new", onNewAlert);
      socket.off("scenario:started", refreshHealth);
      socket.off("scenario:ended", refreshHealth);
      socket.off("operator:reset", onReset);
      socket.disconnect();
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
    const res = await fetch(`${API_BASE}/api/scenarios/trigger`, {
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
    await fetch(`${API_BASE}/api/scenarios/stop`, { method: "POST" });
    refreshHealth();
  };

  const reset = async () => {
    setError("");
    await fetch(`${API_BASE}/api/reset`, { method: "POST" });
    setAlerts([]);
    setSelectedAlertId(null);
    setSelectedAlert(null);
    setAnalysis(null);
    setSelectionMessage("");
    refreshHealth();
  };

  const exportCurrentView = async () => {
    try {
      setError("");
      setExportState("working");
      const canvas = await html2canvas(document.body, {
        backgroundColor: "#0b1220",
        scale: 2,
        useCORS: true,
        logging: false,
        width: window.innerWidth,
        height: window.innerHeight,
        x: window.scrollX,
        y: window.scrollY,
        scrollX: window.scrollX,
        scrollY: -window.scrollY,
        windowWidth: document.documentElement.clientWidth,
        windowHeight: document.documentElement.clientHeight
      });
      const link = document.createElement("a");
      link.download = `soc-twin-${viewMode}-${Date.now()}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      setExportState("done");
      window.setTimeout(() => setExportState("idle"), 2000);
    } catch {
      setExportState("idle");
      setError("Screenshot export failed. Try again after the dashboard fully loads.");
    }
  };

  const criticalCount = useMemo(() => alerts.filter((a) => a.severity === "critical").length, [alerts]);
  const highCount = useMemo(() => alerts.filter((a) => a.severity === "high").length, [alerts]);
  const serviceCount = useMemo(() => new Set(alerts.map((a) => a.business_service)).size, [alerts]);
  const privilegedHits = useMemo(() => alerts.filter((a) => String(a.dest_user || "").startsWith("svc_")).length, [alerts]);
  const riskScore = useMemo(
    () => Math.min(100, (criticalCount * 15) + (highCount * 7) + (health.incidents * 3)),
    [criticalCount, highCount, health.incidents]
  );
  const analyzeSelectedAlert = async () => {
    if (!selectedAlert) return;

    try {
      setError("");
      setAnalysisState("working");
      const res = await fetch(`${API_BASE}/api/analyst/triage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alert_id: selectedAlert.id })
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error || "Alert analysis failed.");
        setAnalysisState("idle");
        return;
      }
      setAnalysis(body.summary);
      setAnalysisState("done");
    } catch {
      setError("Alert analysis failed.");
      setAnalysisState("idle");
    }
  };

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
      <h2>SOC Twin Demo</h2>
      <div className="card">
        <button disabled={scenarioRunning} onClick={() => runScenario("phishing-credential-lateral")}>Start Phishing Scenario</button>
        <button disabled={scenarioRunning} onClick={() => runScenario("ransomware-precursor")}>Start Ransomware Scenario</button>
        <button disabled={scenarioRunning} onClick={() => runScenario("cloud-identity-abuse")}>Start Cloud Identity Scenario</button>
        <button onClick={stopScenario}>Stop Scenario</button>
        <button onClick={reset}>Reset</button>
        <button onClick={exportCurrentView}>
          {exportState === "working" ? "Exporting..." : "Export Current View"}
        </button>
        {scenarioRunning ? <p className="info-banner">Scenario running: {runningScenarioLabel}. Stop it before starting another.</p> : null}
      </div>

      <div className="card">
        <strong>Audience Mode:</strong>
        <button className={viewMode === "analyst" ? "active" : ""} onClick={() => setViewMode("analyst")}>Analyst</button>
        <button className={viewMode === "manager" ? "active" : ""} onClick={() => setViewMode("manager")}>SOC Manager</button>
        <button className={viewMode === "ciso" ? "active" : ""} onClick={() => setViewMode("ciso")}>CISO</button>
        <p><strong>{VIEW_LABEL[viewMode]}</strong></p>
        <p>{VIEW_COPY[viewMode]}</p>
        {exportState === "done" ? <p className="success">Screenshot exported.</p> : null}
        {error ? <p className="error">{error}</p> : null}
      </div>

      <div className="grid">
        <div className="card">
          <h3>{VIEW_LABEL[viewMode]} - Live Alerts</h3>
          {viewMode === "analyst" ? (
            <p className="info-banner">
              {selectionMessage || "Alerts are selectable. Click any alert row to investigate it."}
            </p>
          ) : null}
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
                <tr
                  key={a.id}
                  className={a.id === selectedAlertId ? "selected-row" : ""}
                  onClick={() => {
                    setSelectedAlertId(a.id);
                    setSelectedAlert(a);
                    setAnalysis(null);
                    setAnalysisState("idle");
                    setSelectionMessage("Alert selected. Scroll to the bottom to review details and run ARIA analysis.");
                  }}
                >
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

      {viewMode === "analyst" ? (
        <div className="grid analyst-grid">
          <div className="card">
            <h3>Selected Alert</h3>
            {selectedAlert ? (
              <>
                <p><strong>Event:</strong> {selectedAlert.event_type}</p>
                <p><strong>Host:</strong> {selectedAlert.dest_hostname}</p>
                <p><strong>User:</strong> {selectedAlert.dest_user}</p>
                <p><strong>Severity:</strong> {selectedAlert.severity}</p>
                <p><strong>ATT&CK:</strong> {selectedAlert.mitre_technique_id} ({selectedAlert.mitre_technique_name})</p>
                <button onClick={analyzeSelectedAlert}>
                  {analysisState === "working" ? "Analyzing..." : "Analyze Selected Alert"}
                </button>
              </>
            ) : (
              <p>Select an alert from the table to analyze it.</p>
            )}
          </div>

          <div className="card">
            <h3>ARIA (Automated Response & Investigation Assistant) Analysis</h3>
            {analysis ? (
              <>
                <p><strong>Provider:</strong> {analysis.provider}</p>
                <p><strong>Threat Assessment:</strong> {analysis.threat_assessment}</p>
                <p><strong>Context:</strong> {analysis.context_correlation}</p>
                <p><strong>MITRE Mapping:</strong> {analysis.mitre_mapping}</p>
                <p><strong>Risk Score:</strong> {analysis.risk_score}</p>
                <p><strong>Recommended Action:</strong> {analysis.recommended_action}</p>
                <p><strong>Next Steps:</strong></p>
                <ul className="plain-list">
                  {analysis.next_steps?.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ul>
                {analysis.note ? <p><strong>Note:</strong> {analysis.note}</p> : null}
              </>
            ) : (
              <p>Run analysis on a selected alert to see ARIA's triage summary.</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
