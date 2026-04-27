import { useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
const DEFAULT_PROFILE = {
  annual_revenue_musd: 250,
  employee_count: 5000,
  internet_exposure: 4,
  security_maturity: 3,
  regulatory_sensitivity: 4,
  crown_jewel_dependency: 4,
};

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatLabel(key) {
  return key
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function slugify(value) {
  return String(value || "analysis")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

const DEFAULT_SECTORS = [
  { id: "financial-services", label: "Financial Services" },
  { id: "healthcare",         label: "Healthcare" },
  { id: "manufacturing",      label: "Manufacturing" },
  { id: "retail",             label: "Retail" },
  { id: "technology",         label: "Technology" },
];

export default function App() {
  const [sectors, setSectors] = useState(DEFAULT_SECTORS);
  const [sector, setSector] = useState("financial-services");
  const [scenarios, setScenarios] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState(DEFAULT_PROFILE);
  const [useCustomProfile, setUseCustomProfile] = useState(false);
  const [rawText, setRawText] = useState("");
  const [sourceFile, setSourceFile] = useState(null);
  const [affectedService, setAffectedService] = useState("");
  const [scenarioLoadError, setScenarioLoadError] = useState("");
  const [reportMode, setReportMode] = useState("scenario");

  useEffect(() => {
    async function bootstrap() {
      try {
        const sectorsResponse = await fetch(`${API_BASE}/api/sectors`);
        if (sectorsResponse.ok) {
          const sectorsPayload = await sectorsResponse.json();
          if (sectorsPayload.sectors?.length) setSectors(sectorsPayload.sectors);
        }
      } catch (_) { /* keep defaults */ }

      try {
        const profileResponse = await fetch(`${API_BASE}/api/default-profile`);
        if (profileResponse.ok) {
          const profilePayload = await profileResponse.json();
          if (profilePayload.profile) setProfile(profilePayload.profile);
        }
      } catch (_) {
        setProfile(DEFAULT_PROFILE);
      }
    }
    bootstrap();
  }, []);

  useEffect(() => {
    async function loadScenarios() {
      let loadedScenarios = [];
      try {
        const scenarioResponse = await fetch(`${API_BASE}/api/scenarios?sector=${sector}`);
        if (!scenarioResponse.ok) throw new Error("Scenario library request failed");
        const scenarioPayload = await scenarioResponse.json();
        loadedScenarios = scenarioPayload.scenarios ?? [];
        setScenarios(loadedScenarios);
        setScenarioLoadError(loadedScenarios.length === 0 ? "No scenarios were returned by the API." : "");
        if (loadedScenarios.length > 0) {
          const firstId = loadedScenarios[0].id;
          setSelectedId(firstId);
          setReport(null);
          // Always load the first scenario when sector changes — the selectedId effect
          // won't fire if the first scenario ID happens to match the previous selection.
          await loadScenario(firstId, false);
        }
      } catch (_) {
        setScenarioLoadError("Unable to load the scenario library. Make sure the backend has been restarted.");
      }
    }
    loadScenarios();
  }, [sector]);

  async function loadScenario(scenarioId, withCustomProfile) {
    try {
      setLoading(true);
      setError("");
      const params = withCustomProfile ? new URLSearchParams(profileToParams(profile)) : new URLSearchParams();
      params.set("sector", sector);
      const response = await fetch(`${API_BASE}/api/translate/${scenarioId}?${params}`);
      if (!response.ok) throw new Error("Failed to load report");
      setReport(await response.json());
      setReportMode("scenario");
    } catch (loadError) {
      setError("Unable to translate the selected scenario.");
    } finally {
      setLoading(false);
    }
  }

  async function handleAnalyze(event) {
    event.preventDefault();
    try {
      setLoading(true);
      setError("");
      const formData = new FormData();
      formData.append("raw_text", rawText);
      formData.append("sector", sector);
      if (sourceFile) {
        formData.append("source_file", sourceFile);
      }
      if (affectedService.trim()) {
        formData.append("affected_service", affectedService.trim());
      }
      if (useCustomProfile) {
        Object.entries(profileToParams(profile)).forEach(([key, value]) => formData.append(key, value));
      }

      const response = await fetch(`${API_BASE}/api/analyze`, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.detail || "Analysis failed");
      }
      const payload = await response.json();
      setReport(payload);
      setReportMode(payload.analysis_type === "scan_report" ? "scanReport" : "adHoc");
      setRawText("");
      setSourceFile(null);
      setAffectedService("");
      window.scrollTo({ top: document.querySelector(".report-panel")?.offsetTop - 24 || 0, behavior: "smooth" });
    } catch (loadError) {
      setError(loadError.message || "Unable to analyze the supplied input.");
    } finally {
      setLoading(false);
    }
  }

  function handleProfileChange(key, value) {
    setProfile((current) => ({ ...current, [key]: Number(value) }));
  }

  function handleDownloadAnalysis() {
    if (!report) {
      return;
    }

    const isAdHoc = report.analysis_type === "ad_hoc";
    const isScanReport = report.analysis_type === "scan_report";
    // Full input for the header line — no truncation so the .md accurately records
    // the exact text the user submitted.
    const inputFull = (report.technical_summary || "").trim();
    // Shorter slug for the filename (filesystem-safe, reasonable length).
    const inputSlug = inputFull.slice(0, 60);

    const lines = [
      "# Threat-to-Business Translator Analysis",
      "",
      isAdHoc || isScanReport
        ? `Input: ${inputFull}`
        : `Scenario: ${report.scenario_name}`,
      `Analysis Type: ${formatLabel(report.analysis_type || "scenario")}`,
      `Audience: ${report.audience}`,
      "",
      "## Leadership Headline",
      report.leadership_output.headline,
      "",
      "## Executive Summary",
      report.leadership_output.executive_summary,
      "",
      "## Risk Snapshot",
      `Overall Risk: ${report.risk_assessment.overall_risk}`,
      `Likelihood: ${report.risk_assessment.likelihood}/5`,
      `Impact: ${report.risk_assessment.impact}/5`,
      `Urgency: ${report.risk_assessment.urgency}/5`,
      `Confidence: ${Math.round(report.risk_assessment.confidence * 100)}%`,
      `Likely Loss: ${formatCurrency(report.business_impact.impact_band.likely_usd)}`,
      "",
      "## Business Impact",
      report.business_impact.summary,
      `Low: ${formatCurrency(report.business_impact.impact_band.low_usd)}`,
      `Likely: ${formatCurrency(report.business_impact.impact_band.likely_usd)}`,
      `High: ${formatCurrency(report.business_impact.impact_band.high_usd)}`,
      `Downtime: ${report.business_impact.impact_band.downtime_hours} hours`,
      `People Affected: ${report.business_impact.impact_band.people_affected.toLocaleString()}`,
      "",
      "## Business Context",
      `Business Unit: ${report.business_context.business_unit}`,
      `Business Service: ${report.business_context.business_service}`,
      `Service Owner: ${report.business_context.service_owner}`,
      `Primary Asset: ${report.business_context.primary_asset} (${report.business_context.primary_asset_type})`,
      `Internet Exposed: ${report.business_context.internet_exposed ? "Yes" : "No"}`,
      `Affected Assets: ${report.business_context.affected_assets.join(", ") || "None listed"}`,
      `Impacted Identities: ${report.business_context.impacted_identities.join(", ") || "None listed"}`,
      "",
      "## Recommended Actions",
      ...report.leadership_output.recommended_actions.map((action) => `- ${action}`),
      "",
    ];

    if (report.report_rollup) {
      lines.push(
        "## Scan Report Roll-Up",
        report.report_rollup.summary,
        `Total Findings: ${report.report_rollup.total_findings}`,
        `Highest Severity: ${formatLabel(report.report_rollup.highest_severity)}`,
        `Severity Counts: Critical ${report.report_rollup.severity_counts.critical}, High ${report.report_rollup.severity_counts.high}, Medium ${report.report_rollup.severity_counts.medium}, Low ${report.report_rollup.severity_counts.low}`,
        `Top Business Services: ${report.report_rollup.top_business_services.join(", ")}`,
        "",
        "## Parsed Findings",
        ...report.finding_summaries.flatMap((finding) => [
          `### ${finding.title}`,
          `Severity: ${formatLabel(finding.severity)}`,
          `Mapped Business Service: ${finding.mapped_business_service}`,
          `Affected Asset: ${finding.affected_asset}`,
          `Overall Risk: ${finding.overall_risk}`,
          `Likely Loss: ${formatCurrency(finding.likely_loss_usd)}`,
          `Headline: ${finding.headline}`,
          ...finding.recommended_actions.map((action) => `- ${action}`),
          "",
        ]),
      );
    } else {
      lines.push("## Technical Input", report.technical_summary, "");
    }

    lines.push(
      "## Scoring Rationale",
      ...report.risk_assessment.rationale.map((item) => `- ${item}`),
      "",
      "## Active Assumptions",
      `Annual Revenue (USD M): ${report.organization_profile.annual_revenue_musd}`,
      `Employee Count: ${report.organization_profile.employee_count}`,
      `Internet Exposure: ${report.organization_profile.internet_exposure}/5`,
      `Security Maturity: ${report.organization_profile.security_maturity}/5`,
      `Regulatory Sensitivity: ${report.organization_profile.regulatory_sensitivity}/5`,
      `Crown Jewel Dependency: ${report.organization_profile.crown_jewel_dependency}/5`,
    );

    const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    const fileBase = isAdHoc || isScanReport
      ? `${isScanReport ? "scan-report" : "ad-hoc"}-${slugify(inputSlug)}`
      : slugify(report.scenario_name);
    anchor.download = `${fileBase}-analysis.md`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="app-shell">
      <section className="hero-band">
        <div className="hero-meta">
          <p className="eyebrow">Threat-to-Business Translator</p>
          <p className="hero-copy">
            Select the customer&apos;s industry sector to load sector-appropriate scenarios. Customer-specific inputs are
            optional and can be applied only when you want to tailor the outcome.
          </p>
        </div>
        <div className="hero-title-wrap">
          <h1>Translate CVEs, SOC alerts, and scan reports into executive impact.</h1>
        </div>
      </section>

      <section className="sector-bar">
        <div className="sector-bar-inner">
          <label className="sector-label" htmlFor="sectorSelect">
            Customer industry sector
          </label>
          <select
            id="sectorSelect"
            className="sector-select"
            value={sector}
            onChange={(event) => setSector(event.target.value)}
          >
            {sectors.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
          <p className="sector-hint">
            Sets the business context for scenario outcomes and ad hoc analysis. The scenario library updates when you change sector.
          </p>
        </div>
      </section>

      <section className="intake-strip">
        <div className="intake-panel">
          <div className="section-label">Optional Customer-Specific Inputs</div>
          <p className="support-copy">
            Use this only when you want to tailor the built-in outcome with customer-specific
            evidence or organization assumptions.
          </p>
          <form onSubmit={handleAnalyze}>
            <div className="intake-row">
              <div className="intake-field grow">
                <label className="input-label" htmlFor="rawText">
                  Optional pasted CVE, SOC alert, or incident summary
                </label>
                <textarea
                  id="rawText"
                  className="text-input"
                  rows="2"
                  value={rawText}
                  onChange={(event) => setRawText(event.target.value)}
                  placeholder="Optional: paste a CVE description, SIEM alert, EDR narrative, or scan finding."
                />
              </div>
              <div className="intake-field compact">
                <label className="input-label" htmlFor="sourceFile">
                  Optional upload: vulnerability scan report for analysis (.pdf, .txt, .csv, .json, .log)
                </label>
                <input
                  key={sourceFile ? sourceFile.name : "empty-file-input"}
                  id="sourceFile"
                  className="file-input"
                  type="file"
                  accept=".pdf,.txt,.csv,.json,.log"
                  onChange={(event) => setSourceFile(event.target.files?.[0] ?? null)}
                />
              </div>
            </div>

            <div className="intake-row">
              <div className="intake-field grow">
                <label className="input-label" htmlFor="affectedService">
                  Affected business service or product <span className="label-optional">(optional — helps map the CVE to the right business context)</span>
                </label>
                <input
                  id="affectedService"
                  className="text-input single-line"
                  type="text"
                  value={affectedService}
                  onChange={(event) => setAffectedService(event.target.value)}
                  placeholder="e.g. payroll, customer portal, supply chain, digital banking"
                />
              </div>
            </div>

            <div className="intake-actions">
              <details className="optional-profile">
                <summary>Optional customer assumptions</summary>
                <div className="profile-grid">
                  <ProfileField label="Annual revenue (USD M)">
                    <input type="number" min="10" value={profile.annual_revenue_musd} onChange={(event) => handleProfileChange("annual_revenue_musd", event.target.value)} />
                  </ProfileField>
                  <ProfileField label="Employee count">
                    <input type="number" min="50" value={profile.employee_count} onChange={(event) => handleProfileChange("employee_count", event.target.value)} />
                  </ProfileField>
                  <ProfileField label="Internet exposure">
                    <select value={profile.internet_exposure} onChange={(event) => handleProfileChange("internet_exposure", event.target.value)}>
                      {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}/5</option>)}
                    </select>
                  </ProfileField>
                  <ProfileField label="Security maturity">
                    <select value={profile.security_maturity} onChange={(event) => handleProfileChange("security_maturity", event.target.value)}>
                      {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}/5</option>)}
                    </select>
                  </ProfileField>
                  <ProfileField label="Regulatory sensitivity">
                    <select value={profile.regulatory_sensitivity} onChange={(event) => handleProfileChange("regulatory_sensitivity", event.target.value)}>
                      {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}/5</option>)}
                    </select>
                  </ProfileField>
                  <ProfileField label="Crown jewel dependency">
                    <select value={profile.crown_jewel_dependency} onChange={(event) => handleProfileChange("crown_jewel_dependency", event.target.value)}>
                      {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value}/5</option>)}
                    </select>
                  </ProfileField>
                </div>
                <label className="checkbox-row">
                  <input type="checkbox" checked={useCustomProfile} onChange={(event) => setUseCustomProfile(event.target.checked)} />
                  <span>Apply these customer assumptions to scenario or ad hoc analysis</span>
                </label>
              </details>

              <div className="action-row">
                <button className="primary-button" type="submit" disabled={loading}>
                  {loading ? "Analyzing..." : "Analyze Input"}
                </button>
                <button className="secondary-button" type="button" onClick={() => selectedId && loadScenario(selectedId, useCustomProfile)} disabled={loading || !selectedId}>
                  {useCustomProfile ? "Apply Optional Assumptions To Scenario" : "Restore Scenario Outcome"}
                </button>
              </div>
            </div>
          </form>
        </div>
      </section>

      <section className="workspace">
        <aside className="scenario-list">
          <div className="section-label">Scenario Library</div>
          <p className="support-copy">Select a scenario to restore its built-in outcome for the chosen sector.</p>
          {scenarioLoadError ? <p className="inline-warning">{scenarioLoadError}</p> : null}
          {scenarios.map((scenario) => (
            <button
              key={scenario.id}
              className={scenario.id === selectedId ? "scenario-card active" : "scenario-card"}
              onClick={() => { setSelectedId(scenario.id); loadScenario(scenario.id, useCustomProfile); }}
              type="button"
            >
              <span className="scenario-category">{scenario.category}</span>
              <strong>{scenario.name}</strong>
              <span>{scenario.business_unit}</span>
              <span>{scenario.business_service}</span>
            </button>
          ))}
        </aside>

        <section className="report-panel">
          {error ? <div className="error-banner">{error}</div> : null}
          {report ? (
            <>
              <div className={`report-context-banner${reportMode !== "scenario" ? " ad-hoc" : ""} risk-${report.risk_assessment.overall_risk}`}>
                <div>
                  <p className="section-label">{reportMode === "scanReport" ? "Scan Report Analysis" : reportMode === "adHoc" ? "Ad Hoc Analysis" : "Scenario Outcome"}</p>
                  <strong>{report.scenario_name}</strong>
                </div>
                <div className="report-context-actions">
                  {reportMode === "scanReport" ? (
                    <p className="context-copy">
                      Showing report-level analysis derived from multiple uploaded scan findings.
                    </p>
                  ) : reportMode === "adHoc" ? (
                    <p className="context-copy">
                      Showing analysis derived from your pasted input or uploaded report.
                    </p>
                  ) : (
                    <p className="context-copy">
                      Showing the built-in synthetic scenario outcome for leadership review.
                    </p>
                  )}
                </div>
              </div>

              <div className="headline-card">
                <p className="section-label">Leadership Headline</p>
                <h2>{report.leadership_output.headline}</h2>
                <p>{report.leadership_output.executive_summary}</p>
                {report.leadership_output.board_brief ? (
                  <div className="board-brief">
                    <p className="section-label">Board Brief</p>
                    <p>{report.leadership_output.board_brief}</p>
                  </div>
                ) : null}
              </div>

              {report.report_rollup ? (
                <div className="scan-rollup-grid">
                  <article className="scan-rollup-card">
                    <p className="section-label">Scan Report Roll-Up</p>
                    <p>{report.report_rollup.summary}</p>
                    <p>Total findings: {report.report_rollup.total_findings}</p>
                    <p>Highest severity: {formatLabel(report.report_rollup.highest_severity)}</p>
                  </article>
                  <article className="scan-rollup-card">
                    <p className="section-label">Severity Distribution</p>
                    <p>Critical: {report.report_rollup.severity_counts.critical}</p>
                    <p>High: {report.report_rollup.severity_counts.high}</p>
                    <p>Medium: {report.report_rollup.severity_counts.medium}</p>
                    <p>Low: {report.report_rollup.severity_counts.low}</p>
                  </article>
                </div>
              ) : null}

              <details className="technical-summary-card">
                <summary className="technical-summary-toggle">
                  <span className="section-label">Technical Input</span>
                  <span className="toggle-hint">click to expand</span>
                </summary>
                <pre className="technical-summary-text">{report.technical_summary}</pre>
              </details>

              <div className="metrics-grid">
                <MetricCard label="Overall Risk" value={report.risk_assessment.overall_risk} tone={report.risk_assessment.overall_risk} featured />
                <MetricCard label="Likely Loss" value={formatCurrency(report.business_impact.impact_band.likely_usd)} featured />
                <MetricCard label="Likelihood" value={`${report.risk_assessment.likelihood}/5`} />
                <MetricCard label="Impact" value={`${report.risk_assessment.impact}/5`} />
                <MetricCard label="Urgency" value={`${report.risk_assessment.urgency}/5`} />
                <MetricCard label="Confidence" value={`${Math.round(report.risk_assessment.confidence * 100)}%`} />
              </div>

              <div className="detail-grid">
                <Panel title="Recommended Actions" className="panel-actions">
                  <ol className="action-list">
                    {report.leadership_output.recommended_actions.map((action) => (
                      <li key={action}>{action}</li>
                    ))}
                  </ol>
                </Panel>

                {report.finding_summaries?.length ? (
                  <Panel title="Parsed Findings" className="panel-full">
                    <div className="finding-list">
                      {report.finding_summaries.map((finding) => (
                        <article className="finding-card" key={finding.finding_id}>
                          <div className="finding-head">
                            <strong>{finding.title}</strong>
                            <span className={`severity-pill ${finding.severity}`}>{formatLabel(finding.severity)}</span>
                          </div>
                          <p>{finding.headline}</p>
                          <p>Business service: {finding.mapped_business_service}</p>
                          <p>Affected asset: {finding.affected_asset}</p>
                          <p>Likely loss: {formatCurrency(finding.likely_loss_usd)}</p>
                        </article>
                      ))}
                    </div>
                  </Panel>
                ) : null}

                <Panel title="Exposure Profile">
                  {Object.entries(report.exposure_scores).map(([key, value]) => (
                    <ExposureBar key={key} label={formatLabel(key)} value={value} />
                  ))}
                </Panel>

                <Panel title="Risk Reduction If Fixed">
                  <p>{report.risk_reduction_if_fixed.summary}</p>
                  <p>Residual likelihood: {report.risk_reduction_if_fixed.residual_likelihood}/5</p>
                  <p>Residual impact: {report.risk_reduction_if_fixed.residual_impact}/5</p>
                  <p>Residual risk: {report.risk_reduction_if_fixed.residual_risk}</p>
                  <p>Likely loss avoided: {formatCurrency(report.risk_reduction_if_fixed.likely_loss_avoided_usd)}</p>
                  <p>Downtime avoided: {report.risk_reduction_if_fixed.downtime_avoided_hours} hours</p>
                </Panel>

                <Panel title="Business Context">
                  <p><strong>{report.business_context.business_service}</strong> supports {report.business_context.business_unit} and is owned by {report.business_context.service_owner}.</p>
                  <p>Primary asset: {report.business_context.primary_asset} ({report.business_context.primary_asset_type})</p>
                  <p>Internet exposed: {report.business_context.internet_exposed ? "Yes" : "No"}</p>
                  <p>Affected assets: {report.business_context.affected_assets.join(", ")}</p>
                  <p>Impacted identities: {report.business_context.impacted_identities.join(", ")}</p>
                </Panel>

                <Panel title="Impact Band">
                  <p>Low: {formatCurrency(report.business_impact.impact_band.low_usd)}</p>
                  <p>Likely: {formatCurrency(report.business_impact.impact_band.likely_usd)}</p>
                  <p>High: {formatCurrency(report.business_impact.impact_band.high_usd)}</p>
                  <p>Downtime: {report.business_impact.impact_band.downtime_hours} hours</p>
                  <p>People affected: {report.business_impact.impact_band.people_affected.toLocaleString()}</p>
                </Panel>

                <Panel title="Active Assumptions">
                  <p>Annual revenue: {formatCurrency(report.organization_profile.annual_revenue_musd * 1000000)}</p>
                  <p>Employee count: {report.organization_profile.employee_count.toLocaleString()}</p>
                  <p>Internet exposure: {report.organization_profile.internet_exposure}/5</p>
                  <p>Security maturity: {report.organization_profile.security_maturity}/5</p>
                  <p>Regulatory sensitivity: {report.organization_profile.regulatory_sensitivity}/5</p>
                  <p>Crown jewel dependency: {report.organization_profile.crown_jewel_dependency}/5</p>
                </Panel>

                <Panel title="Control Posture">
                  {report.business_context.control_posture.map((item) => (
                    <p key={item}>{item}</p>
                  ))}
                </Panel>

                <Panel title="Scoring Rationale">
                  {report.risk_assessment.rationale.map((item) => (
                    <p key={item}>{item}</p>
                  ))}
                </Panel>
              </div>

              <div className="report-download-bar">
                <button className="secondary-button download-button" type="button" onClick={handleDownloadAnalysis}>
                  Download Analysis
                </button>
              </div>
            </>
          ) : (
            <div className="empty-state">Select any of the five scenarios to restore its outcome, or optionally add customer-specific input.</div>
          )}
        </section>
      </section>
    </main>
  );
}

function profileToParams(profile) {
  return Object.fromEntries(Object.entries(profile).map(([key, value]) => [key, String(value)]));
}

function ProfileField({ label, children }) {
  return (
    <label className="profile-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function MetricCard({ label, value, tone, featured }) {
  return (
    <article className={`metric-card${featured ? " metric-card-featured" : ""}`}>
      <span className="metric-label">{label}</span>
      {tone
        ? <strong className={`risk-badge risk-badge-${tone}`}>{value}</strong>
        : <strong className="metric-value">{value}</strong>
      }
    </article>
  );
}

function Panel({ title, children, className }) {
  return (
    <article className={className ? `panel ${className}` : "panel"}>
      <p className="section-label">{title}</p>
      {children}
    </article>
  );
}

function ExposureBar({ label, value }) {
  const tone = value >= 80 ? "critical" : value >= 60 ? "high" : value >= 40 ? "medium" : "low";
  const toneLabel = value >= 80 ? "Critical" : value >= 60 ? "High" : value >= 40 ? "Moderate" : "Low";
  return (
    <div className="exposure-row">
      <div className="exposure-meta">
        <span>{label}</span>
        <div className="exposure-value-group">
          <span className={`exposure-tone-label tone-${tone}`}>{toneLabel}</span>
          <strong>{value}%</strong>
        </div>
      </div>
      <div className="exposure-track">
        <div className={`exposure-fill ${tone}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
