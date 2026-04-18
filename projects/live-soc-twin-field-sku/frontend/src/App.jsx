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
  const [ticketCreateState, setTicketCreateState] = useState("idle");
  const [privilegedHitsCount, setPrivilegedHitsCount] = useState(0);
  const [speedMultiplier, setSpeedMultiplier] = useState(1);
  const [scenarioProgress, setScenarioProgress] = useState({ name: "", step: 0, total: 0 });
  const [connected, setConnected] = useState(true);

  const riskBand = (score) => {
    if (score >= 9) return "critical";
    if (score >= 7) return "high";
    if (score >= 4) return "medium";
    return "low";
  };

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
      setHealth((prev) => ({ ...prev, alerts: prev.alerts + 1 }));
      if (String(alert.dest_user || "").startsWith("svc_")) {
        setPrivilegedHitsCount((prev) => prev + 1);
      }
    };

    const onReset = () => {
      setAlerts([]);
      setIncidents([]);
      setSelectedAlertId(null);
      setSelectedAlert(null);
      setAnalysis(null);
      setSelectionMessage("");
      setPrivilegedHitsCount(0);
      setHealth((prev) => ({ ...prev, alerts: 0, incidents: 0 }));
      refreshHealth();
    };

    const onTicketCreated = (ticket) => {
      setTickets((prev) => [ticket, ...prev.filter((t) => t.id !== ticket.id)]);
      setNewTicketBanner(ticket);
    };

    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    const onIncidentUpdated = (incident) => {
      setIncidents((prev) => {
        const idx = prev.findIndex((i) => i.id === incident.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = incident;
          return next;
        }
        return [incident, ...prev];
      });
    };

    const onScenarioStarted = (data) => {
      setScenarioProgress({ name: data.name || data.scenario_id, step: 0, total: data.total_events || 0 });
      refreshHealth();
      fetchIncidents();
    };

    const onScenarioEnded = () => {
      setScenarioProgress({ name: "", step: 0, total: 0 });
      refreshHealth();
      fetchIncidents();
    };

    const onScenarioEventProgress = (data) => {
      setScenarioProgress((prev) => ({ ...prev, step: prev.step + 1, lastEvent: data.event_type }));
    };

    socket.on("alert:new", onNewAlert);
    socket.on("incident:updated", onIncidentUpdated);
    socket.on("scenario:started", onScenarioStarted);
    socket.on("scenario:ended", onScenarioEnded);
    socket.on("scenario:event", onScenarioEventProgress);
    socket.on("operator:reset", onReset);
    socket.on("ticket:created", onTicketCreated);

    return () => {
      socket.off("alert:new", onNewAlert);
      socket.off("incident:updated", onIncidentUpdated);
      socket.off("scenario:started", onScenarioStarted);
      socket.off("scenario:ended", onScenarioEnded);
      socket.off("scenario:event", onScenarioEventProgress);
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
      body: JSON.stringify({ scenario_id: scenarioId, speed_multiplier: speedMultiplier })
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
  const privilegedHits = privilegedHitsCount;
  const riskScore = useMemo(() => {
    const activeHighCrit = incidents.filter((i) => {
      if (i.severity !== "high" && i.severity !== "critical") return false;
      const t = tickets.find((tk) => tk.incident_id === i.id);
      return !t || t.status !== "resolved";
    });
    const criticals = activeHighCrit.filter((i) => i.severity === "critical").length;
    const highs = activeHighCrit.filter((i) => i.severity === "high").length;
    return Math.min(100, criticals * 15 + highs * 7);
  }, [incidents, tickets]);
  const openTicketCount = useMemo(() => tickets.filter((t) => t.status !== "resolved").length, [tickets]);
  const hostServiceMap = useMemo(() => {
    const map = {};
    alerts.forEach((a) => { if (a.dest_hostname && a.business_service) map[a.dest_hostname] = a.business_service; });
    return map;
  }, [alerts]);

  const ageLabel = (isoString) => {
    const mins = Math.floor((Date.now() - new Date(isoString).getTime()) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
  };
  const ticketForAlert = useMemo(
    () => (selectedAlert ? tickets.find((t) => t.alert_id === selectedAlert.id) : null),
    [tickets, selectedAlert]
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
      if (body.ticket) {
        setTickets((prev) => [body.ticket, ...prev.filter((t) => t.id !== body.ticket.id)]);
        setNewTicketBanner(body.ticket);
      }
    } catch {
      setError("Alert analysis failed.");
      setAnalysisState("idle");
    }
  };

  const createTicket = async () => {
    if (!selectedAlert || !analysis) return;
    try {
      setTicketCreateState("working");
      const res = await fetch(`${API_BASE}/api/tickets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alert_id: selectedAlert.id, summary: analysis })
      });
      const body = await res.json();
      if (res.ok) {
        setTickets((prev) => [body.ticket, ...prev.filter((t) => t.id !== body.ticket.id)]);
        setNewTicketBanner(body.ticket);
      }
    } catch {}
    setTicketCreateState("idle");
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
          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-value">{health.alerts}</div>
              <div className="kpi-label">Alerts in Queue</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-value">{criticalCount}</div>
              <div className="kpi-label">Critical</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-value">{highCount}</div>
              <div className="kpi-label">High</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-value">{privilegedHits}</div>
              <div className="kpi-label">Privileged Account Hits</div>
            </div>
          </div>
        </>
      );
    }

    if (viewMode === "manager") {
      const resolvedTickets = tickets.filter((t) => t.status === "resolved").length;
      const inProgressTickets = tickets.filter((t) => t.status === "in_progress").length;
      const openTickets = tickets.filter((t) => t.status === "open").length;
      const orphanedTickets = tickets.filter((t) => t.status !== "resolved" && !incidents.find((i) => i.id === t.incident_id));
      const activeIncidentTickets = incidents.filter((i) => {
        const t = tickets.find((tk) => tk.incident_id === i.id);
        const hasActiveTicket = t && t.status !== "resolved";
        const isHighOrCritical = i.severity === "high" || i.severity === "critical";
        return (isHighOrCritical || hasActiveTicket) && (!t || t.status !== "resolved");
      });
      const activeThreats = activeIncidentTickets.length + orphanedTickets.length;
      return (
        <>
          <h3>SOC Manager KPIs</h3>
          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-value">{activeThreats}</div>
              <div className="kpi-label">Active Threats</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-value">{openTickets}</div>
              <div className="kpi-label">Open Tickets</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-value">{inProgressTickets}</div>
              <div className="kpi-label">In Progress</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-value">{resolvedTickets}</div>
              <div className="kpi-label">Resolved</div>
            </div>
          </div>
        </>
      );
    }

    // CISO executive risk summary
    const cisoOrphaned = tickets.filter((t) => t.status !== "resolved" && !incidents.find((i) => i.id === t.incident_id)).length;
    const activeIncidentCount = incidents.filter((i) => {
      const t = tickets.find((tk) => tk.incident_id === i.id);
      const hasActiveTicket = t && t.status !== "resolved";
      const isHighOrCritical = i.severity === "high" || i.severity === "critical";
      return (isHighOrCritical || hasActiveTicket) && (!t || t.status !== "resolved");
    }).length + cisoOrphaned;
    const resolvedCount = tickets.filter((t) => t.status === "resolved").length;
    const affectedServices = new Set(alerts.filter((a) => a.severity === "high" || a.severity === "critical").map((a) => a.business_service)).size;
    const riskLabel = riskScore >= 60 ? "Critical" : riskScore >= 30 ? "Elevated" : "Normal";
    const riskColor = riskScore >= 60 ? "#fca5a5" : riskScore >= 30 ? "#fcd34d" : "#86efac";
    return (
      <>
        <h3>Executive Risk Summary</h3>
        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="kpi-value">{activeIncidentCount}</div>
            <div className="kpi-label">Active Incidents</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-value">{resolvedCount}</div>
            <div className="kpi-label">Threats Contained</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-value">{affectedServices || 0}</div>
            <div className="kpi-label">Services Affected</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-value" style={{ color: riskColor }}>{riskLabel}</div>
            <div className="kpi-label">Business Risk</div>
          </div>
        </div>
      </>
    );
  };

  const renderMainPanel = () => {
    if (viewMode === "manager") {
      const activeIncidents = incidents.filter((i) => {
        const t = tickets.find((tk) => tk.incident_id === i.id);
        const hasActiveTicket = t && t.status !== "resolved";
        const isHighOrCritical = i.severity === "high" || i.severity === "critical";
        return (isHighOrCritical || hasActiveTicket) && (!t || t.status !== "resolved");
      });
      const orphanedTickets = tickets.filter((t) => t.status !== "resolved" && !incidents.find((i) => i.id === t.incident_id));
      const campaignLabel = scenarioRunning
        ? `Active threat campaign: ${runningScenarioLabel.replace(/-/g, " ")}`
        : "No active threat campaign detected";
      const hasRows = activeIncidents.length > 0 || orphanedTickets.length > 0;
      return (
        <>
          <h3>Incident Response Overview</h3>
          <p className={`info-banner ${scenarioRunning ? "banner-warning" : ""}`}>{campaignLabel}</p>
          {!hasRows ? (
            <p className="info-banner">No active threats. Environment stable.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Incident</th>
                  <th>Severity</th>
                  <th>Alerts</th>
                  <th>Assets</th>
                  <th>Ticket</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {activeIncidents.map((inc) => {
                  const t = tickets.find((tk) => tk.incident_id === inc.id);
                  return (
                    <tr key={inc.id}>
                      <td>{inc.title}</td>
                      <td><span className={`badge ${inc.severity}`}>{inc.severity}</span></td>
                      <td>{inc.alert_ids.length}</td>
                      <td>{inc.impacted_assets.join(", ")}</td>
                      <td>{t ? t.id : <span style={{ color: "var(--muted)" }}>—</span>}</td>
                      <td>{t ? <span className={`status-badge status-${t.status}`}>{t.status.replace("_", " ")}</span> : <span style={{ color: "var(--muted)" }}>pending</span>}</td>
                    </tr>
                  );
                })}
                {orphanedTickets.map((t) => (
                  <tr key={t.id}>
                    <td style={{ color: "#9ca3af", fontStyle: "italic" }}>{t.title}</td>
                    <td><span className={`badge ${t.severity}`}>{t.severity}</span></td>
                    <td style={{ color: "var(--muted)" }}>—</td>
                    <td style={{ color: "#9ca3af", fontSize: "11px" }}>incident cleared</td>
                    <td>{t.id}</td>
                    <td><span className={`status-badge status-${t.status}`}>{t.status.replace("_", " ")}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      );
    }

    if (viewMode === "ciso") {
      return (
        <>
          <h3>Active Incidents</h3>
          {(() => {
            const significant = incidents.filter((i) => {
              const linkedTicket = tickets.find((t) => t.incident_id === i.id);
              const hasActiveTicket = linkedTicket && linkedTicket.status !== "resolved";
              const isHighOrCritical = i.severity === "high" || i.severity === "critical";
              return (isHighOrCritical || hasActiveTicket) && (!linkedTicket || linkedTicket.status !== "resolved");
            });
            const orphaned = tickets.filter((t) => t.status !== "resolved" && !incidents.find((i) => i.id === t.incident_id));
            if (significant.length === 0 && orphaned.length === 0) return <p className="info-banner">No active high or critical incidents. Monitoring in progress.</p>;
            return [
              ...significant.map((inc) => {
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
                        <span>
                          Services: {inc.impacted_assets.map((h) => hostServiceMap[h] ? `${hostServiceMap[h]} (${h})` : h).join(", ")}
                        </span>
                        {inc.impacted_users.length > 0 && (
                          <span>Users: {inc.impacted_users.join(", ")}</span>
                        )}
                      </div>
                    )}
                    {linkedTicket && (
                      <div className="incident-meta" style={{ marginTop: "4px" }}>
                        <span className="ticket-ref">
                          Ticket: {linkedTicket.id} · {linkedTicket.assignee} · {linkedTicket.status.replace("_", " ")}
                        </span>
                      </div>
                    )}
                  </div>
                );
              }),
              ...orphaned.map((t) => (
                <div key={t.id} className="incident-card" style={{ borderColor: "#374151" }}>
                  <div className="incident-header">
                    <span className={`badge ${t.severity}`}>{t.severity}</span>
                    <strong>{t.title}</strong>
                  </div>
                  <div className="incident-meta">
                    <span style={{ color: "#9ca3af", fontStyle: "italic" }}>Incident cleared by reset — ticket open</span>
                  </div>
                  <div className="incident-meta" style={{ marginTop: "4px" }}>
                    <span className="ticket-ref">Ticket: {t.id} · {t.assignee} · {t.status.replace("_", " ")}</span>
                  </div>
                </div>
              ))
            ];
          })()}
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
              <th>Criticality</th>
              <th>Risk</th>
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
                <td><span className={`badge ${a.asset_criticality}`}>{a.asset_criticality}</span></td>
                <td><span className={`risk-score risk-${riskBand(a.risk_score)}`}>{a.risk_score}</span></td>
                <td title={a.mitre_technique_name || ""}>{lastColumnValue(a)}</td>
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
                  <th>Assignee</th>
                  <th>Source</th>
                  <th>Opened</th>
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
                    <td style={{ fontSize: "11px", color: "#9ca3af" }}>{t.assignee || "MDR Operations"}</td>
                    <td><span className={`source-badge source-${t.source || "auto"}`}>{t.source === "analyst" ? "Analyst" : "Auto"}</span></td>
                    <td style={{ fontSize: "11px" }}>{ageLabel(t.created_at)}</td>
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
            <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", marginBottom: "12px" }}>
              <span className={`badge ${selectedTicket.severity}`}>{selectedTicket.severity}</span>
              <span className={`status-badge status-${selectedTicket.status}`}>{selectedTicket.status.replace("_", " ")}</span>
              <span style={{ fontSize: "12px", color: "#9ca3af" }}>Opened {ageLabel(selectedTicket.created_at)}</span>
              <span style={{ fontSize: "12px", color: "#9ca3af" }}>· Assignee: {selectedTicket.assignee || "MDR Operations"}</span>
            </div>

            <h4>Threat Summary</h4>
            <p>{selectedTicket.threat_summary}</p>
            <p><strong>MITRE Mapping:</strong> {selectedTicket.mitre_mapping}</p>

            <h4>MDR Response Timeline</h4>
            <div className="timeline">
              {selectedTicket.response_actions.map((a, i) => (
                <div key={i} className="timeline-entry">
                  <div className="timeline-time">{timeFmt.format(new Date(a.ts))}</div>
                  <div className="timeline-track"><div className="timeline-dot" />{i < selectedTicket.response_actions.length - 1 && <div className="timeline-line" />}</div>
                  <div className="timeline-content"><strong>{a.actor}</strong> — {a.action}</div>
                </div>
              ))}
            </div>

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
            {selectedTicket.status === "resolved" && (
              <button onClick={() => updateTicketStatus(selectedTicket.id, "open")}>
                Reopen
              </button>
            )}
          </div>
        )}
      </>
    );
  };

  return (
    <div className="app">
      <h2>SOC Twin Demo</h2>

      <div className="card">
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
          <span className={`health-dot ${connected ? "health-ok" : "health-err"}`} title={connected ? "Backend connected" : "Backend disconnected"} />
          <span style={{ fontSize: "11px", color: connected ? "#86efac" : "#fca5a5" }}>{connected ? "Connected" : "Disconnected"}</span>
          <span style={{ marginLeft: "auto", fontSize: "11px", color: "#9ca3af" }}>Speed:</span>
          {[1, 2, 5].map((s) => (
            <button key={s} className={speedMultiplier === s ? "active speed-btn" : "speed-btn"} onClick={() => setSpeedMultiplier(s)} disabled={scenarioRunning}>{s}×</button>
          ))}
        </div>
        <button disabled={scenarioRunning} onClick={() => runScenario("phishing-credential-lateral")}>Start Phishing Scenario</button>
        <button disabled={scenarioRunning} onClick={() => runScenario("ransomware-precursor")}>Start Ransomware Scenario</button>
        <button disabled={scenarioRunning} onClick={() => runScenario("cloud-identity-abuse")}>Start Cloud Identity Scenario</button>
        <button onClick={stopScenario}>Stop Scenario</button>
        <button onClick={reset}>Reset</button>
        <button onClick={exportCurrentView}>
          {exportState === "working" ? "Exporting..." : "Export Current View"}
        </button>
        {scenarioRunning && (
          <p className="info-banner banner-warning" style={{ marginTop: "8px" }}>
            {scenarioProgress.total > 0
              ? `▶ ${scenarioProgress.name} — Stage ${scenarioProgress.step}/${scenarioProgress.total}${scenarioProgress.lastEvent ? `: ${scenarioProgress.lastEvent}` : ""}`
              : `▶ ${runningScenarioLabel} running`}
          </p>
        )}
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
                    <hr style={{ borderColor: "#1f2937", margin: "10px 0" }} />
                    {ticketForAlert ? (
                      <p className="info-banner">
                        Ticket raised: <strong>{ticketForAlert.id}</strong> ({ticketForAlert.status.replace("_", " ")})
                      </p>
                    ) : (
                      <button onClick={createTicket} disabled={ticketCreateState === "working"}>
                        {ticketCreateState === "working" ? "Creating..." : "Create Ticket"}
                      </button>
                    )}
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
