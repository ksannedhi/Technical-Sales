import { useEffect, useMemo, useState } from "react";

const API_BASE = "http://127.0.0.1:8010";

async function parseApiError(response) {
  let payload = null;

  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  const detail = payload?.detail;

  if (response.status === 404) {
    return (
      detail ||
      "Backend route not found. Make sure the Navigator backend is running on http://127.0.0.1:8010 and restart both windows if needed."
    );
  }

  if (response.status === 422) {
    return (
      detail ||
      "Request validation failed. The frontend and backend may be out of sync. Restart the app and try again."
    );
  }

  if (response.status === 400 && typeof detail === "string" && detail.includes("Missing required columns")) {
    return `${detail}. This app expects the tools-controls mapping format, not the older inventory format.`;
  }

  if (typeof detail === "string" && detail.trim()) {
    return detail;
  }

  return `Request failed (${response.status}).`;
}

/** Convert a SQLite CURRENT_TIMESTAMP string ("2026-04-24 09:29:42", stored in UTC)
 *  to a human-readable local-timezone string. */
function formatLocalTime(utcStr) {
  if (!utcStr) return "";
  // Append "Z" so Date() treats it as UTC, not local
  const d = new Date(utcStr.replace(" ", "T") + "Z");
  if (isNaN(d.getTime())) return utcStr;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function Badge({ text, type }) {
  return <span className={`badge ${type}`}>{text}</span>;
}

function Table({ columns, rows, rowStyle }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="helper">
                No records found.
              </td>
            </tr>
          ) : (
            rows.map((row, idx) => (
              <tr key={idx} style={rowStyle ? rowStyle(row) : undefined}>
                {columns.map((c) => (
                  <td key={c.key}>{c.render ? c.render(row[c.key], row) : row[c.key]}</td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Per-domain summary: which tools are active, how many controls covered/partial/missing. */
function DomainCoverageMatrix({ result }) {
  // Tool names per domain — from current_state_diagram tool nodes.
  // Domain-header node IDs are "cur-domain-{domain}".
  // Tool node IDs are "cur-domain-{domain}-tool-{n}" — they contain "-tool-".
  // Skip anything that is NOT a tool node.
  const toolsByDomain = {};
  for (const node of (result.current_state_diagram?.nodes || [])) {
    if (!node.id.includes("-tool-")) continue;
    if (!toolsByDomain[node.domain]) toolsByDomain[node.domain] = [];
    toolsByDomain[node.domain].push(node.label);
  }

  // Per-domain coverage counts from the gaps list
  const domainStats = {};
  for (const gap of (result.gaps || [])) {
    if (!domainStats[gap.domain]) domainStats[gap.domain] = { covered: 0, partial: 0, missing: 0 };
    domainStats[gap.domain][gap.status] = (domainStats[gap.domain][gap.status] || 0) + 1;
  }

  const allDomains = [
    ...new Set([...Object.keys(toolsByDomain), ...Object.keys(domainStats)]),
  ].sort();

  const DOMAIN_WHAT_IT_MEANS = {
    Identity: "IAM, SSO, MFA, PAM",
    Endpoint: "EDR, XDR, CSPM, patching",
    Network:  "NGFW, NDR, ZTNA, SASE",
    Data:     "DLP, email security, classification",
    Cloud:    "CSPM, CNAPP, cloud workload",
    AppSec:   "WAF, DAST/SAST, API security",
    SOC:      "SIEM, SOAR, threat detection",
  };

  return (
    <section className="card">
      <h3>Domain Coverage at a Glance</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Domain</th>
              <th>Covers</th>
              <th>Tools mapped</th>
              <th>Controls</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {allDomains.map((domain) => {
              const tools = toolsByDomain[domain] || [];
              const s = domainStats[domain] || { covered: 0, partial: 0, missing: 0 };
              const total = s.covered + s.partial + s.missing;
              // total === 0 means this domain exists in the customer's CSV but has no controls
              // in the currently selected framework (e.g. AppSec/Cloud tools in NIST-only mode).
              const notInMode = total === 0;
              const badgeType = notInMode ? null : s.missing > 0 ? "missing" : s.partial > 0 ? "partial" : "covered";
              const badgeText = notInMode ? null : s.missing > 0 ? "Gap" : s.partial > 0 ? "Partial" : "Covered";
              return (
                <tr key={domain}>
                  <td><strong>{domain}</strong></td>
                  <td style={{ color: "var(--muted)", fontSize: "0.88rem" }}>
                    {DOMAIN_WHAT_IT_MEANS[domain] ?? "—"}
                  </td>
                  <td>
                    {tools.length > 0
                      ? tools.join(", ")
                      : <span className="helper">None mapped</span>}
                  </td>
                  <td style={{ whiteSpace: "nowrap", fontSize: "0.88rem" }}>
                    {notInMode ? (
                      <span className="helper">No controls in this mode</span>
                    ) : (
                      <>
                        {[
                          s.covered > 0 && <span key="c" style={{ color: "var(--ok)" }}>{s.covered} covered</span>,
                          s.partial > 0 && <span key="p" style={{ color: "var(--warn)" }}>{s.partial} partial</span>,
                          s.missing > 0 && <span key="m" style={{ color: "var(--danger)" }}>{s.missing} missing</span>,
                        ]
                          .filter(Boolean)
                          .reduce((acc, el, i) => [...acc, i > 0 && <span key={`sep-${i}`} style={{ color: "var(--muted)" }}> · </span>, el], [])}
                        <span style={{ color: "var(--muted)" }}> / {total}</span>
                      </>
                    )}
                  </td>
                  <td>
                    {notInMode
                      ? <span className="helper" style={{ fontStyle: "italic" }}>Switch to CIS or Both</span>
                      : <Badge text={badgeText} type={badgeType} />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function triggerDownload(filename, content, contentType) {
  const blob = new Blob([content], { type: contentType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function listJoin(items) {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function buildNarrative(result) {
  const frameworkLabel = {
    NIST: "NIST CSF 2.0",
    CIS: "CIS Controls v8.1",
    BOTH: "NIST CSF 2.0 and CIS Controls v8.1",
  }[result.framework_selected] ?? result.framework_selected;

  const toolCount    = result.rows_processed ?? 0;
  const totalCtrls   = result.controls_total ?? 0;
  const missing      = result.controls_missing ?? 0;
  const partial      = result.controls_partial ?? 0;
  const covered      = result.controls_covered ?? 0;
  const gaps         = result.gaps ?? [];
  const redundancies = result.redundancies ?? [];

  // Per-domain coverage breakdown from the gaps list
  const domainStatus = {};
  for (const gap of gaps) {
    if (!domainStatus[gap.domain])
      domainStatus[gap.domain] = { missing: 0, partial: 0, covered: 0 };
    domainStatus[gap.domain][gap.status] =
      (domainStatus[gap.domain][gap.status] || 0) + 1;
  }
  const coveredDomains = Object.entries(domainStatus)
    .filter(([, s]) => s.missing === 0 && s.partial === 0 && s.covered > 0)
    .map(([d]) => d);
  const missingDomains = Object.entries(domainStatus)
    .filter(([, s]) => s.missing > 0)
    .map(([d]) => d);

  // Sentence 1 — scope
  const s1 = `${toolCount} security tool${toolCount !== 1 ? "s" : ""} analysed against ${frameworkLabel} across ${totalCtrls} control objective${totalCtrls !== 1 ? "s" : ""}.`;

  // Sentence 2 — coverage headline
  let s2;
  if (missing === 0 && partial === 0) {
    s2 = "All controls are fully covered — no gaps identified.";
  } else if (coveredDomains.length > 0 && missingDomains.length > 0) {
    s2 = `Coverage is strongest in ${listJoin(coveredDomains)}; gaps were identified in ${listJoin(missingDomains)}.`;
  } else if (coveredDomains.length === 0 && missingDomains.length > 0) {
    s2 = `Coverage gaps span ${listJoin(missingDomains)}, with ${missing} control${missing !== 1 ? "s" : ""} entirely unaddressed.`;
  } else {
    s2 = `${covered} control${covered !== 1 ? "s" : ""} fully covered, ${partial} partially covered, ${missing} with no coverage.`;
  }

  // Sentence 3 — top gap
  const topGap = gaps.find((g) => g.severity === "high");
  let s3;
  if (topGap) {
    s3 = `Highest-priority gap: ${topGap.control_name} (${topGap.control_id}) — no dedicated tool covers this control.`;
  } else if (partial > 0) {
    s3 = `No critical gaps found; ${partial} control${partial !== 1 ? "s" : ""} rely on a single tool and would benefit from a second-layer defence.`;
  } else {
    s3 = "";
  }

  // Sentence 4 — redundancy savings
  const totalSavings = redundancies.reduce((s, r) => s + (r.estimated_savings_usd ?? 0), 0);
  const s4 =
    redundancies.length > 0
      ? `${redundancies.length} redundancy opportunit${redundancies.length !== 1 ? "ies" : "y"} identified with an estimated $${totalSavings.toLocaleString("en-US")} in potential consolidation savings.`
      : "";

  return [s1, s2, s3, s4].filter(Boolean).join(" ");
}

function ExecutiveSummary({ result }) {
  const [copied, setCopied] = useState(false);
  const text = buildNarrative(result);

  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    });
  };

  return (
    <section className="card exec-summary">
      <div className="exec-summary-header">
        <h3 style={{ margin: 0 }}>Executive Summary</h3>
        <button
          type="button"
          className="copy-btn"
          onClick={copy}
          title="Copy narrative to clipboard"
        >
          {copied ? "✓ Copied" : "Copy"}
        </button>
      </div>
      <p className="exec-narrative">{text}</p>
    </section>
  );
}

function HowToUse() {
  const [open, setOpen] = useState(false);
  return (
    <section className="card how-to-use no-print">
      <button
        type="button"
        className="how-to-use-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span>How to Use</span>
        <span className="how-to-use-chevron">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <ol className="steps">
          <li>
            <div>
              <strong>Download the template</strong>
              <p>
                Click <em>Download Sample Template</em> below to get the Excel workbook.
                The <em>Instructions</em> tab explains every field and lists valid values
                for each dropdown column.
              </p>
            </div>
          </li>
          <li>
            <div>
              <strong>Fill in your security tools</strong>
              <p>
                Add one row per tool in the <em>Tool Inventory</em> tab. The three
                required fields are <code>tool_name</code>, <code>control_domain</code>,
                and <code>control_objective</code>. Be specific in the objective — it
                drives the gap analysis. Delete the seven example rows before uploading.
              </p>
            </div>
          </li>
          <li>
            <div>
              <strong>Export as CSV</strong>
              <p>
                Save the file as <em>CSV (Comma delimited)</em> via File → Save As.
                Only CSV files are accepted for upload — Excel dropdowns and formatting
                are for your convenience during data entry only.
              </p>
            </div>
          </li>
          <li>
            <div>
              <strong>Choose a framework mode</strong>
              <p>
                Select <em>NIST CSF 2.0</em>, <em>CIS Controls v8.1</em>, or{" "}
                <em>Both</em> to match your organisation's compliance target. Rows
                with a blank <code>framework_alignment</code> column will inherit
                this selection automatically.
              </p>
            </div>
          </li>
          <li>
            <div>
              <strong>Run the analysis</strong>
              <p>
                Optionally enter a project name to save results for later, then
                upload the CSV and click <em>Run Analysis</em>. If your inventory
                contains tools with vague objectives or niche vendors not in the
                built-in alias dictionary, enable{" "}
                <em>Use AI enrichment</em> (requires an Anthropic API key set in{" "}
                <code>backend/.env</code>) — Claude will suggest the best-matching
                control ID for those rows before analysis runs.
              </p>
            </div>
          </li>
          <li>
            <div>
              <strong>Review your results</strong>
              <p>
                Explore <em>Control Gaps</em> (with severity ratings),{" "}
                <em>Redundancy Opportunities</em> (with estimated savings), and
                a phased <em>Migration Roadmap</em>. Download outputs as JSON or
                CSV for use in reports and proposals.
              </p>
            </div>
          </li>
        </ol>
      )}
    </section>
  );
}

export default function App() {
  const [framework, setFramework] = useState("BOTH");
  const [projectName, setProjectName] = useState("");
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [savedProjects, setSavedProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [loadedProjectId, setLoadedProjectId] = useState(null);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [useAiEnrichment, setUseAiEnrichment] = useState(false);

  const loadSavedProjects = async () => {
    try {
      const response = await fetch(`${API_BASE}/projects`);
      if (!response.ok) return;
      const payload = await response.json();
      setSavedProjects(payload.projects || []);
    } catch {
      // Keep UI usable even if backend is not reachable.
    }
  };

  const checkAiStatus = async () => {
    try {
      const response = await fetch(`${API_BASE}/ai-status`);
      if (!response.ok) return;
      const payload = await response.json();
      setAiEnabled(!!payload.enabled);
    } catch {
      // Not critical — AI toggle stays hidden.
    }
  };

  useEffect(() => {
    loadSavedProjects();
    checkAiStatus();
  }, []);

  const stats = useMemo(() => {
    if (!result) {
      return [
        { label: "Rows Processed", value: 0 },
        { label: "Controls Total", value: 0 },
        { label: "Missing", value: 0 },
        { label: "Redundancies", value: 0 },
      ];
    }

    return [
      { label: "Rows Processed", value: result.rows_processed },
      { label: "Controls Total", value: result.controls_total },
      { label: "Missing", value: result.controls_missing },
      { label: "Redundancies", value: result.redundancies.length },
    ];
  }, [result]);

  const handleAnalyze = async (evt) => {
    evt.preventDefault();
    setError("");

    if (!file) {
      setError("Please select a tools-controls mapping CSV file.");
      return;
    }

    try {
      setLoading(true);
      const form = new FormData();
      form.append("framework", framework);
      form.append("mapping_file", file);
      form.append("project_name", projectName);
      form.append("use_ai_enrichment", useAiEnrichment ? "true" : "false");

      const response = await fetch(`${API_BASE}/analyze`, {
        method: "POST",
        body: form,
      });

      if (!response.ok) {
        throw new Error(await parseApiError(response));
      }

      const r = await response.json();
      setResult(r);
      setLoadedProjectId(r.project_id ?? null);
      await loadSavedProjects();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const loadProject = async (id) => {
    try {
      const response = await fetch(`${API_BASE}/projects/${id}`);
      if (!response.ok) {
        throw new Error(await parseApiError(response));
      }
      const payload = await response.json();
      setResult(payload.result);
      setProjectName(payload.project_name || "");
      setLoadedProjectId(id);
    } catch (e) {
      setError(e.message);
    }
  };

  const deleteProject = async (id, name) => {
    const confirmed = window.confirm(`Delete saved project "${name || id}"?`);
    if (!confirmed) {
      return;
    }

    try {
      setError("");
      const response = await fetch(`${API_BASE}/projects/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error(await parseApiError(response));
      }

      setSavedProjects((current) => current.filter((project) => project.id !== id));
      setResult((current) => (current?.project_id === id ? null : current));
      setLoadedProjectId((cur) => (cur === id ? null : cur));
      if (projectName === name) {
        setProjectName("");
      }
    } catch (e) {
      setError(e.message);
    }
  };

  const download = (format) => {
    if (!result) {
      return;
    }

    if (format === "json") {
      const output = { ...result, narrative: buildNarrative(result) };
      triggerDownload("tools_mapping_result.json", JSON.stringify(output, null, 2), "application/json");
      return;
    }

    const lines = [
      ["control_id", "framework", "control_name", "domain", "status", "severity", "coverage_score", "rationale"],
      ...result.gaps.map((gap) => [
        gap.control_id,
        gap.framework,
        gap.control_name,
        gap.domain,
        gap.status,
        gap.severity,
        gap.coverage_score,
        gap.rationale,
      ]),
    ];
    const csv = lines
      .map((row) =>
        row
          .map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`)
          .join(",")
      )
      .join("\n");
    triggerDownload("tools_control_gap_summary.csv", csv, "text/csv");
  };

  const downloadTemplate = () => {
    window.open(`${window.location.origin}/Security_Tools_Mapping_Template.xlsx`, "_blank");
  };

  return (
    <div className="container">
      <section className="hero">
        <h1>Security Tools Mapping Navigator</h1>
        <p>
          Map your existing security tools to NIST CSF 2.0 and CIS Controls v8.1, identify
          coverage gaps, flag redundancies, and generate a prioritised remediation roadmap.
        </p>
      </section>

      <HowToUse />

      <section className="card no-print">
        <form className="grid cols-4" onSubmit={handleAnalyze}>
          <div>
            <label htmlFor="projectName">Project Name (for save)</label>
            <input
              id="projectName"
              type="text"
              placeholder="Example: Finance-2026-Q1"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="framework">Framework Mode</label>
            <select id="framework" value={framework} onChange={(e) => setFramework(e.target.value)}>
              <option value="NIST">NIST CSF 2.0</option>
              <option value="CIS">CIS Controls v8.1</option>
              <option value="BOTH">Both (Dual Mapping)</option>
            </select>
          </div>
          <div>
            <label htmlFor="file">Tools-Control Mapping CSV</label>
            <input
              id="file"
              type="file"
              accept=".csv"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </div>
          <div>
            <label>Actions</label>
            <button type="submit" disabled={loading}>
              {loading ? "Analyzing..." : "Run Analysis"}
            </button>
          </div>
        </form>
        {aiEnabled && (
          <div style={{ marginTop: "12px" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", marginBottom: 0 }}>
              <input
                type="checkbox"
                style={{ width: "auto", margin: 0 }}
                checked={useAiEnrichment}
                onChange={(e) => setUseAiEnrichment(e.target.checked)}
              />
              <span style={{ color: "var(--muted)", fontWeight: 600, fontSize: "0.9rem" }}>
                Use AI enrichment — Claude suggests control IDs for rows with vague or non-standard objectives
              </span>
            </label>
          </div>
        )}
        {error && <p style={{ color: "#c53d3d", fontWeight: 700, marginTop: "10px" }}>{error}</p>}
        {result?.warnings?.length > 0 && (
          <div style={{ marginTop: "12px", padding: "12px", borderRadius: "10px", background: "#fff6e5", color: "#8a5600" }}>
            {result.warnings.map((warning, idx) => (
              <p key={idx} style={{ margin: idx === 0 ? 0 : "8px 0 0" }}>
                {warning}
              </p>
            ))}
          </div>
        )}
        {(result?.enriched_count > 0) && (
          <div style={{ marginTop: "10px", padding: "10px 14px", borderRadius: "10px", background: "#edf7f3", color: "var(--accent-2)", fontSize: "0.9rem", fontWeight: 600 }}>
            ✨ {result.enriched_count} row{result.enriched_count !== 1 ? "s" : ""} had a control ID suggested by AI enrichment. Review before sharing results.
          </div>
        )}
        <p className="helper">
          Use the tools-controls mapping template to ensure required columns are present. If project
          name is provided, the result is saved to SQLite.
        </p>
      </section>

      <section className="card no-print">
        <div className="actions">
          <button type="button" className="secondary" onClick={downloadTemplate}>
            Download Sample Template
          </button>
          <button type="button" className="secondary" onClick={() => download("json")} disabled={!result}>
            Download JSON Output
          </button>
          <button type="button" className="secondary" onClick={() => download("csv")} disabled={!result}>
            Download CSV Output
          </button>
          <button type="button" className="secondary" onClick={() => window.print()} disabled={!result}>
            Print / Save as PDF
          </button>
          <button type="button" className="secondary" onClick={loadSavedProjects}>
            Refresh Saved Projects
          </button>
        </div>
      </section>

      <section className="card no-print">
        <h3>Saved Projects</h3>
        <Table
          rowStyle={(row) =>
            row.id === loadedProjectId
              ? { background: "#e7f7ea", borderLeft: "3px solid #1a7f37" }
              : undefined
          }
          columns={[
            { key: "id", label: "ID" },
            { key: "project_name", label: "Project" },
            { key: "framework", label: "Framework" },
            { key: "rows_processed", label: "Rows" },
            {
              key: "created_at",
              label: "Created",
              render: (v) => formatLocalTime(v),
            },
            {
              key: "id",
              label: "Action",
              render: (id, row) => (
                <div className="inline-actions">
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => loadProject(id)}
                    disabled={id === loadedProjectId}
                    style={id === loadedProjectId ? { background: "#1a7f37", opacity: 1 } : undefined}
                  >
                    {id === loadedProjectId ? "✓ Loaded" : "Load"}
                  </button>
                  <button type="button" className="secondary danger" onClick={() => deleteProject(id, row.project_name)}>
                    Delete
                  </button>
                </div>
              ),
            },
          ]}
          rows={savedProjects}
        />
      </section>

      {result && (() => {
        const savings = (result.redundancies ?? []).reduce(
          (sum, r) => sum + (r.estimated_savings_usd ?? 0), 0
        );
        return (
          <div className="summary-banner">
            <span>{result.rows_processed ?? 0} tools mapped</span>
            <span className="summary-sep">·</span>
            <span>{result.controls_covered ?? 0} fully covered</span>
            <span className="summary-sep">·</span>
            <span>{result.controls_partial ?? 0} partial</span>
            <span className="summary-sep">·</span>
            <span>{result.controls_missing ?? 0} gaps</span>
            <span className="summary-sep">·</span>
            <span>{(result.redundancies ?? []).length} redundancies</span>
            {savings > 0 && (
              <>
                <span className="summary-sep">·</span>
                <span>Est. savings ${savings.toLocaleString("en-US")}</span>
              </>
            )}
            {(result.enriched_count > 0) && (
              <>
                <span className="summary-sep">·</span>
                <span>✨ {result.enriched_count} AI-enriched</span>
              </>
            )}
          </div>
        );
      })()}

      {result && <ExecutiveSummary result={result} />}

      <section className="card grid cols-4">
        {stats.map((s) => (
          <div className="kpi" key={s.label}>
            <div className="value">{s.value}</div>
            <div className="label">{s.label}</div>
          </div>
        ))}
      </section>

      {result && <DomainCoverageMatrix result={result} />}

      <section className="card">
        <h3>Control Gaps</h3>
        <Table
          columns={[
            { key: "control_id", label: "Control ID" },
            { key: "framework", label: "Framework" },
            { key: "control_name", label: "Control" },
            { key: "domain", label: "Domain" },
            {
              key: "status",
              label: "Status",
              render: (v, row) => (
                <span title={row.rationale}>
                  <Badge text={v} type={v} />
                </span>
              ),
            },
            {
              key: "severity",
              label: "Severity",
              render: (v, row) => (
                <span title={row.rationale}>
                  <Badge text={v} type={v} />
                </span>
              ),
            },
            {
              key: "recommended_tools",
              label: "Recommended",
              render: (v, row) => {
                if (!v) return <span className="helper">—</span>;
                const prefix = row.status === "missing" ? "Consider: " : "Strengthen: ";
                return (
                  <span style={{ fontSize: "0.83rem", color: "var(--muted)", fontStyle: "italic" }}>
                    {prefix}{v}
                  </span>
                );
              },
            },
          ]}
          rows={result?.gaps || []}
        />
      </section>

      <section className="card">
        <h3>Redundancy Opportunities</h3>
        <Table
          columns={[
            { key: "framework", label: "Framework" },
            { key: "domain", label: "Domain" },
            { key: "objective", label: "Objective" },
            {
              key: "tools",
              label: "Tools",
              render: (v) => (Array.isArray(v) ? v.join(", ") : v),
            },
            {
              key: "vendors",
              label: "Vendors",
              render: (v) =>
                Array.isArray(v) && v.length > 0 ? v.join(", ") : <span className="helper">—</span>,
            },
            {
              key: "products",
              label: "Products",
              render: (v) =>
                Array.isArray(v) && v.length > 0 ? v.join(", ") : <span className="helper">—</span>,
            },
            {
              key: "classification",
              label: "Classification",
              render: (v) => {
                const labels = { likely_redundant: "Likely Redundant", healthy_overlap: "Healthy Overlap" };
                const types  = { likely_redundant: "high", healthy_overlap: "low" };
                return <Badge text={labels[v] ?? v} type={types[v] ?? "medium"} />;
              },
            },
            {
              key: "estimated_savings_usd",
              label: "Est. Savings (USD)",
              render: (v) => (v > 0 ? `$${Number(v).toLocaleString("en-US")}` : "—"),
            },
          ]}
          rows={result?.redundancies || []}
        />
        {(() => {
          const hasCosts = (result?.redundancies ?? []).some((r) => r.estimated_savings_usd > 0);
          return hasCosts ? (
            <p className="helper" style={{ marginTop: "10px" }}>
              Est. savings = (overlapping tools − 1) × avg. annual tool cost × 20% consolidation factor.
              Based on annual costs entered in the uploaded CSV.
            </p>
          ) : null;
        })()}
      </section>

      <section className="card">
        <h3>Migration Roadmap</h3>
        <Table
          columns={[
            { key: "phase", label: "Phase" },
            { key: "initiative", label: "Initiative" },
            { key: "framework_focus", label: "Framework" },
            { key: "priority", label: "Priority" },
            { key: "effort", label: "Effort" },
            { key: "expected_outcome", label: "Expected Outcome" },
            { key: "depends_on", label: "Depends On" },
          ]}
          rows={result?.roadmap || []}
        />
      </section>
    </div>
  );
}
