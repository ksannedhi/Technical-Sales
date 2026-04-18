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
  const [incidents, setIncidents] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [health, setHealth] = useState({ alerts: 0, incidents: 0, running_scenarios: [] });
  const [kpi, setKpi] = useState({ openAlertsSmoothed: 0 });
  const [viewMode, setViewMode] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get("mode");
    return VALID_MODES.includes(mode) ? mode : "analyst";
  });
  const [activeTab, setActiveTab] = useState("dashboard");
  const [error, setError] = useState("");
  const [exportState, setExportState] = useState("idle");
  const [selectedAlertId, setSelectedAlertId] = useState(null);
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [analysisState, setAnalysisState] = useState("idle");
  const [analysis, setAnalysis] = useState(null);
  const [selectionMessage, setSelectionMessage] = useState("");
  const [selectedTicketId, setSelectedTicketId] = useState(null);
  const [newTicketBanner, setNewTicketBanner] = useState(null);

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

  const fetchIncidents = async () => {
    try {
      const data = await fetch(`${API_BASE}/api/incidents`).then((r) => r.json());
      setIncidents(Array.isArray(data) ? data : []);
    } catch {}
  };

  useEffect(() => {
    const socket = io(WS_BASE, {
      autoConnect: true,
      transports: ["websocket", "polling"]
    });

    fetch(`${API_BASE}/api/alerts?limit=60`)
      .then((r) => r.json())
      .then((data) => setAlerts(data.slice(0, 60)))
      .catch(() => setError("Cannot load initial alerts."));

    fetch(`${API_BASE}/api/tickets`)
      .then((r) => r.json())
      .then((data) => setTickets(Array.isArray(data) ? data : []))
      .catch(() => {});

    fetchIncidents();
    refreshHealth();

    const onNewAlert = (alert) => {
      setAlerts((prev) => [alert, ...prev].slice(0, 60));
    };

    const onReset = () => {
      setAlerts([]);
      setIncidents([]);
      setTickets([]);
      setSelectedAlertId(null);
      setSelectedAlert(null);
      setAnalysis(null);
      setSelectionMessage("");
      setSelectedTicketId(null);
      setNewTicketBanner(null);
      refreshHealth();
    };

    const onTicketCreated = (ticket) => {
      setTickets((prev) => [ticket, ...prev.filter((t) => t.id !== ticket.id)]);
      setNewTicketBanner(ticket);
    };

    const onScenarioEvent = () => {
      refreshHealth();
      fetchIncidents();
    };

    socket.on("alert:new", onNewAlert);
    socket.on("scenario:started", onScenarioEvent);
    socket.on("scenario:ended", onScenarioEvent);
    socket.on("operator:reset", onReset);
    socket.on("ticket:created", onTicketCreated);

    return () => {
      socket.off("alert:new", onNewAlert);
      socket.off("scenario:started", onScenarioEvent);
      socket.off("scenario:ended", onScenarioEvent);
      socket.off("operator:reset", onReset);
      socket.off("ticket:created", onTicketCreated);
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
    if (!res.ok) setError(body.error || "Failed to start scenario.");
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
    setIncidents([]);
    setTickets([]);
    setSelectedAlertId(null);
    setSelectedAlert(null);
    setAnalysis(null);
    setSelectionMessage("");
    setSelectedTicketId(null);
    setNewTicketBanner(null);
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
  const openTicketCount = useMemo(() => tickets.filter((t) => t.status !== "resolved").length, [tickets]);

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
      if (body.ticket) {
        setTickets((prev) => [body.ticket, ...prev.filter((t) => t.id !== body.ticket.id)]);
        setNewTicketBanner(body.ticket);
      }
    } catch {
      setError("Alert analysis failed.");
      setAnalysisState("idle");
    }
  };

  const updateTicketStatus = async (ticketId, status) => {
    try {
      const res = await fetch(`${API_BASE}/api/tickets/${ticketId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        const body = await res.json();
        setTickets((prev) => prev.map((t) => (t.id === body.ticket.id ? body.ticket : t)));
      }
    } catch {}
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
        <h3>Executive Risk Summary</h3>
        <p>Active Incidents: {health.incidents}</p>
        <p>Threats Contained: {tickets.length}</p>
        <p>Open Tickets: {openTicketCount}</p>
        <p>Business Risk: {riskScore >= 60 ? "Material — escalate to leadership" : "Contained — monitoring in progress"}</p>
      </>
    );
  };

  const renderMainPanel = () => {
    if (viewMode === "ciso") {
      return (
        <>
          <h3>Active Incidents</h3>
          {incidents.length === 0 ? (
            <p className="info-banner">No active incidents. Trigger a scenario to generate incidents.</p>
          ) : (
            incidents.map((inc) => {
              const linkedTicket = tickets.find((t) => t.incident_id === inc.id);
              return (
                <div key={inc.id} className="incident-card">
                  <div className="incident-header">
                    <span className={`badge ${inc.severity}`}>{inc.severity}</span>
                    <strong>{inc.title}</strong>
                  </div>
                  <div className="incident-meta">
                    <span>{inc.alert_ids.length} alerts</span>
                    <span>First seen: {timeFmt.format(new Date(inc.first_seen))}</span>
                    <span>Last seen: {timeFmt.format(new Date(inc.last_seen))}</span>
                  </div>
                  {inc.techniques.length > 0 && (
                    <div className="incident-meta" style={{ marginTop: "4px" }}>
                      <span>Techniques: {inc.techniques.join(", ")}</span>
                    </div>
                  )}
                  {inc.impacted_assets.length > 0 && (
                    <div className="incident-meta" style={{ marginTop: "4px" }}>
                      <span>Assets: {inc.impacted_assets.join(", ")}</span>
                      {inc.impacted_users.length > 0 && (
                        <span>Users: {inc.impacted_users.join(", ")}</span>
                      )}
                    </div>
                  )}
                  {linkedTicket && (
                    <div className="incident-meta" style={{ marginTop: "4px" }}>
                      <span className="ticket-ref">
                        Ticket: {linkedTicket.id} ({linkedTicket.status.replace("_", " ")})
                      </span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </>
      );
    }

    const lastColumnTitle = viewMode === "analyst" ? "MITRE" : "Status";
    const lastColumnValue = (a) => (viewMode === "analyst" ? a.mitre_technique_id : a.status);

    return (
      <>
        <h3>{VIEW_LABEL[viewMode]} — Live Alerts</h3>
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
      </>
    );
  };

  const renderTicketsTab = () => {
    const selectedTicket = tickets.find((t) => t.id === selectedTicketId);
    return (
      <>
        <div className="card">
          <h3>Customer Ticket Portal</h3>
          <p className="info-banner">
            MDR Operations raises a ticket when an incident is escalated to Tier-2. Update the status manually as your team works through it.
          </p>
          {tickets.length === 0 ? (
            <p>No tickets yet. Run a scenario and use ARIA to analyze a critical alert.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Ticket</th>
                  <th>Severity</th>
                  <th>Title</th>
                  <th>Created</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => (
                  <tr
                    key={t.id}
                    className={t.id === selectedTicketId ? "selected-row" : ""}
                    onClick={() => setSelectedTicketId(t.id === selectedTicketId ? null : t.id)}
                  >
                    <td><code>{t.id}</code></td>
                    <td><span className={`badge ${t.severity}`}>{t.severity}</span></td>
                    <td>{t.title}</td>
                    <td>{timeFmt.format(new Date(t.created_at))}</td>
                    <td><span className={`status-badge status-${t.status}`}>{t.status.replace("_", " ")}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {selectedTicket && (
          <div className="card ticket-detail">
            <h3>{selectedTicket.id} — {selectedTicket.title}</h3>
            <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "12px" }}>
              <span className={`badge ${selectedTicket.severity}`}>{selectedTicket.severity}</span>
              <span className={`status-badge status-${selectedTicket.status}`}>{selectedTicket.status.replace("_", " ")}</span>
              <span style={{ fontSize: "12px", color: "#9ca3af" }}>
                Created: {timeFmt.format(new Date(selectedTicket.created_at))}
              </span>
            </div>

            <h4>Threat Summary</h4>
            <p>{selectedTicket.threat_summary}</p>
            <p><strong>MITRE Mapping:</strong> {selectedTicket.mitre_mapping}</p>

            <h4>MDR Response Actions Taken</h4>
            <table className="table">
              <thead>
                <tr><th>Time</th><th>Action</th><th>Actor</th></tr>
              </thead>
              <tbody>
                {selectedTicket.response_actions.map((a, i) => (
                  <tr key={i}>
                    <td>{timeFmt.format(new Date(a.ts))}</td>
                    <td>{a.action}</td>
                    <td>{a.actor}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h4>Action Required from Your Team</h4>
            <p className="customer-action">{selectedTicket.customer_action}</p>

            <h4>Update Status</h4>
            <button
              onClick={() => updateTicketStatus(selectedTicket.id, "in_progress")}
              disabled={selectedTicket.status !== "open"}
            >
              Mark In Progress
            </button>
            <button
              onClick={() => updateTicketStatus(selectedTicket.id, "resolved")}
              disabled={selectedTicket.status === "resolved"}
            >
              Mark Resolved
            </button>
            <button
              onClick={() => updateTicketStatus(selectedTicket.id, "open")}
              disabled={selectedTicket.status !== "resolved"}
            >
              Reopen
            </button>
          </div>
        )}
      </>
    );
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

      {newTicketBanner && (
        <div
          className="card ticket-notification"
          onClick={() => {
            setActiveTab("tickets");
            setSelectedTicketId(newTicketBanner.id);
            setNewTicketBanner(null);
          }}
        >
          <p>
            <strong>MDR Operations raised a ticket:</strong> {newTicketBanner.id} — {newTicketBanner.title}.{" "}
            <span style={{ color: "#0ea5e9" }}>Click to view in portal.</span>
          </p>
        </div>
      )}

      <div className="card">
        <button className={activeTab === "dashboard" ? "active" : ""} onClick={() => setActiveTab("dashboard")}>
          SOC Dashboard
        </button>
        <button
          className={activeTab === "tickets" ? "active" : ""}
          onClick={() => { setActiveTab("tickets"); setNewTicketBanner(null); }}
        >
          Customer Tickets{openTicketCount > 0 ? ` (${openTicketCount} open)` : ""}
        </button>
      </div>

      {activeTab === "dashboard" && (
        <>
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
              {renderMainPanel()}
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
        </>
      )}

      {activeTab === "tickets" && renderTicketsTab()}
    </div>
  );
}
