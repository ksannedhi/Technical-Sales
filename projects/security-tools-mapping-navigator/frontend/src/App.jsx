import { useEffect, useMemo, useState } from "react";

const API_BASE = "http://127.0.0.1:8010";

function InfoTip({ text }) {
  return (
    <span
      title={text}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: "16px",
        height: "16px",
        marginLeft: "6px",
        borderRadius: "999px",
        background: "#d9e9ea",
        color: "#114b5f",
        fontSize: "0.75rem",
        fontWeight: 700,
        cursor: "help",
        verticalAlign: "middle",
      }}
      aria-label={text}
    >
      i
    </span>
  );
}

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

function Badge({ text, type }) {
  return <span className={`badge ${type}`}>{text}</span>;
}

function Table({ columns, rows }) {
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
              <tr key={idx}>
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

function DiagramView({ title, nodes = [], edges = [] }) {
  return (
    <div className="diagram">
      <h4>{title}</h4>
      <p className="helper">Nodes</p>
      <div className="nodes">
        {nodes.map((n) => (
          <div className="node" key={n.id}>
            <strong>{n.label}</strong>
            <div>{n.domain}</div>
          </div>
        ))}
      </div>
      <p className="helper">
        Generated Links: {edges.length}
        <InfoTip text="Count of generated relationships between map nodes." />
      </p>
    </div>
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
    <section className="card how-to-use">
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
                upload the CSV and click <em>Run Analysis</em>.
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

  useEffect(() => {
    loadSavedProjects();
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

      const response = await fetch(`${API_BASE}/analyze`, {
        method: "POST",
        body: form,
      });

      if (!response.ok) {
        throw new Error(await parseApiError(response));
      }

      setResult(await response.json());
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

      <section className="card">
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
            <div className="label-row">
              <label htmlFor="framework">Framework Mode</label>
              <InfoTip text="Sets the primary scoring framework and the default for blank framework alignment values." />
            </div>
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
        {error && <p style={{ color: "#c53d3d", fontWeight: 700 }}>{error}</p>}
        {result?.warnings?.length > 0 && (
          <div style={{ marginTop: "12px", padding: "12px", borderRadius: "10px", background: "#fff6e5", color: "#8a5600" }}>
            {result.warnings.map((warning, idx) => (
              <p key={idx} style={{ margin: idx === 0 ? 0 : "8px 0 0" }}>
                {warning}
              </p>
            ))}
          </div>
        )}
        <p className="helper">
          Use the tools-controls mapping template to ensure required columns are present. If project
          name is provided, the result is saved to SQLite.
        </p>
      </section>

      <section className="card">
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
          <button type="button" className="secondary" onClick={loadSavedProjects}>
            Refresh Saved Projects
          </button>
        </div>
      </section>

      <section className="card">
        <h3>Saved Projects</h3>
        <Table
          columns={[
            { key: "id", label: "ID" },
            { key: "project_name", label: "Project" },
            { key: "framework", label: "Framework" },
            { key: "rows_processed", label: "Rows" },
            { key: "created_at", label: "Created" },
            {
              key: "id",
              label: "Action",
              render: (id, row) => (
                <div className="inline-actions">
                  <button type="button" className="secondary" onClick={() => loadProject(id)}>
                    Load
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
        const covered = (result.controls_total ?? 0) - (result.controls_missing ?? 0);
        const savings = (result.redundancies ?? []).reduce(
          (sum, r) => sum + (r.estimated_savings_usd ?? 0), 0
        );
        const savingsFmt = savings > 0
          ? `· Est. savings $${savings.toLocaleString("en-US")}`
          : "";
        return (
          <div className="summary-banner">
            <span>{result.rows_processed ?? 0} tools mapped</span>
            <span className="summary-sep">·</span>
            <span>{covered} controls covered</span>
            <span className="summary-sep">·</span>
            <span>{result.controls_missing ?? 0} gaps found</span>
            <span className="summary-sep">·</span>
            <span>{(result.redundancies ?? []).length} redundancies</span>
            {savingsFmt && (
              <>
                <span className="summary-sep">·</span>
                <span>Est. savings ${savings.toLocaleString("en-US")}</span>
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

      <section className="card grid cols-2">
        <DiagramView
          title="Current Control Map (Generated)"
          nodes={result?.current_state_diagram?.nodes || []}
          edges={result?.current_state_diagram?.edges || []}
        />
        <DiagramView
          title="Target Control Map (Generated)"
          nodes={result?.target_state_diagram?.nodes || []}
          edges={result?.target_state_diagram?.edges || []}
        />
      </section>

      <section className="card">
        <h3>
          Control Gaps
          <InfoTip text="Coverage is inferred from matching tool-control rows." />
        </h3>
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
            { key: "coverage_score", label: "Score" },
          ]}
          rows={result?.gaps || []}
        />
      </section>

      <section className="card">
        <h3>
          Redundancy Opportunities
          <InfoTip text="Groups tools mapped to the same control objective." />
        </h3>
        <Table
          columns={[
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
                Array.isArray(v) && v.length > 0 ? v.join(", ") : <span className="helper">Not captured</span>,
            },
            {
              key: "products",
              label: "Products",
              render: (v) =>
                Array.isArray(v) && v.length > 0 ? v.join(", ") : <span className="helper">Not captured</span>,
            },
            { key: "classification", label: "Classification" },
            { key: "overlap_score", label: "Overlap Score" },
            { key: "estimated_savings_usd", label: "Est. Savings (USD)" },
          ]}
          rows={result?.redundancies || []}
        />
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
