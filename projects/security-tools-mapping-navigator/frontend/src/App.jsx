import { useEffect, useMemo, useState } from "react";

const API_BASE = "http://127.0.0.1:8000";

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
      <p className="helper">Flows: {edges.length}</p>
    </div>
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
        const payload = await response.json();
        throw new Error(payload.detail || "Failed to run analysis.");
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
        const payload = await response.json();
        throw new Error(payload.detail || "Failed to load project.");
      }
      const payload = await response.json();
      setResult(payload.result);
      setProjectName(payload.project_name || "");
    } catch (e) {
      setError(e.message);
    }
  };

  const download = (format) => {
    window.open(`${API_BASE}/export?format=${format}`, "_blank");
  };

  return (
    <div className="container">
      <section className="hero">
        <h1>Security Tools Mapping Navigator</h1>
        <p>
          Upload tools-controls mapping data, choose framework mode (NIST, CIS, or both), and
          generate current/target control maps, gaps, redundancies, and migration roadmap guidance.
        </p>
      </section>

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
            <label htmlFor="framework">Framework Mode</label>
            <select id="framework" value={framework} onChange={(e) => setFramework(e.target.value)}>
              <option value="NIST">NIST CSF 2.0</option>
              <option value="CIS">CIS Controls v8</option>
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
        <p className="helper">
          Use the tools-controls mapping template to ensure required columns are present. If project
          name is provided, the result is saved to SQLite.
        </p>
      </section>

      <section className="card">
        <div className="actions">
          <button type="button" className="secondary" onClick={() => download("json")} disabled={!result}>
            Download JSON
          </button>
          <button type="button" className="secondary" onClick={() => download("csv")} disabled={!result}>
            Download CSV
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
              render: (id) => (
                <button type="button" className="secondary" onClick={() => loadProject(id)}>
                  Load
                </button>
              ),
            },
          ]}
          rows={savedProjects}
        />
      </section>

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
              render: (v) => <Badge text={v} type={v} />,
            },
            {
              key: "severity",
              label: "Severity",
              render: (v) => <Badge text={v} type={v} />,
            },
            { key: "coverage_score", label: "Score" },
          ]}
          rows={result?.gaps || []}
        />
      </section>

      <section className="card">
        <h3>Redundancy Opportunities</h3>
        <Table
          columns={[
            { key: "domain", label: "Domain" },
            { key: "objective", label: "Objective" },
            {
              key: "tools",
              label: "Tools",
              render: (v) => (Array.isArray(v) ? v.join(", ") : v),
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
