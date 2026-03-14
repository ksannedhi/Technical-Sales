import { useEffect, useState } from "react";

const API_BASE = "http://127.0.0.1:8000";
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

export default function App() {
  const [scenarios, setScenarios] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState(DEFAULT_PROFILE);
  const [useCustomProfile, setUseCustomProfile] = useState(false);
  const [rawText, setRawText] = useState("");
  const [sourceFile, setSourceFile] = useState(null);
  const [scenarioLoadError, setScenarioLoadError] = useState("");

  useEffect(() => {
    async function bootstrap() {
      let loadedScenarios = [];

      try {
        const scenarioResponse = await fetch(`${API_BASE}/api/scenarios`);
        if (!scenarioResponse.ok) {
          throw new Error("Scenario library request failed");
        }
        const scenarioPayload = await scenarioResponse.json();
        loadedScenarios = scenarioPayload.scenarios ?? [];
        setScenarios(loadedScenarios);
        setScenarioLoadError(loadedScenarios.length === 0 ? "No scenarios were returned by the API." : "");
        if (loadedScenarios.length > 0) {
          setSelectedId((current) => current || loadedScenarios[0].id);
        }
      } catch (loadError) {
        setScenarioLoadError("Unable to load the scenario library. Make sure the backend has been restarted.");
      }

      try {
        const profileResponse = await fetch(`${API_BASE}/api/default-profile`);
        if (!profileResponse.ok) {
          throw new Error("Profile request failed");
        }
        const profilePayload = await profileResponse.json();
        if (profilePayload.profile) {
          setProfile(profilePayload.profile);
        }
      } catch (loadError) {
        setProfile(DEFAULT_PROFILE);
        if (loadedScenarios.length === 0) {
          setError("The backend may still be running an older version. Restart it and reload the page.");
        }
      }
    }

    bootstrap();
  }, []);

  useEffect(() => {
    if (!selectedId) {
      return;
    }

    loadScenario(selectedId, false);
  }, [selectedId]);

  async function loadScenario(scenarioId, withCustomProfile) {
    try {
      setLoading(true);
      setError("");
      const params = withCustomProfile ? new URLSearchParams(profileToParams(profile)) : new URLSearchParams();
      const suffix = params.toString() ? `?${params}` : "";
      const response = await fetch(`${API_BASE}/api/translate/${scenarioId}${suffix}`);
      if (!response.ok) {
        throw new Error("Failed to load report");
      }
      setReport(await response.json());
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
      if (sourceFile) {
        formData.append("source_file", sourceFile);
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
      setReport(await response.json());
    } catch (loadError) {
      setError(loadError.message || "Unable to analyze the supplied input.");
    } finally {
      setLoading(false);
    }
  }

  function handleProfileChange(key, value) {
    setProfile((current) => ({ ...current, [key]: Number(value) }));
  }

  return (
    <main className="app-shell">
      <section className="hero-band">
        <div className="hero-meta">
          <p className="eyebrow">Threat-to-Business Translator</p>
          <p className="hero-copy">
            The five built-in scenarios are ready out of the box. Customer-specific inputs are
            optional and can be applied only when you want to tailor the outcome.
          </p>
        </div>
        <div className="hero-title-wrap">
          <h1>Translate CVEs, SOC alerts, and scan reports into executive impact.</h1>
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
                  Optional upload: vulnerability scan report for analysis
                </label>
                <input
                  id="sourceFile"
                  className="file-input"
                  type="file"
                  accept=".txt,.csv,.json,.xml,.log"
                  onChange={(event) => setSourceFile(event.target.files?.[0] ?? null)}
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
                  {loading ? "Analyzing..." : "Analyze Optional Input"}
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
          <p className="support-copy">Select any of the five scenarios to restore its built-in outcome.</p>
          {scenarioLoadError ? <p className="inline-warning">{scenarioLoadError}</p> : null}
          {scenarios.map((scenario) => (
            <button
              key={scenario.id}
              className={scenario.id === selectedId ? "scenario-card active" : "scenario-card"}
              onClick={() => setSelectedId(scenario.id)}
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
              <div className="headline-card">
                <p className="section-label">Leadership Headline</p>
                <h2>{report.leadership_output.headline}</h2>
                <p>{report.leadership_output.executive_summary}</p>
              </div>

              <div className="metrics-grid">
                <MetricCard label="Overall Risk" value={report.risk_assessment.overall_risk} />
                <MetricCard label="Likelihood" value={`${report.risk_assessment.likelihood}/5`} />
                <MetricCard label="Impact" value={`${report.risk_assessment.impact}/5`} />
                <MetricCard label="Urgency" value={`${report.risk_assessment.urgency}/5`} />
                <MetricCard label="Confidence" value={`${Math.round(report.risk_assessment.confidence * 100)}%`} />
                <MetricCard label="Likely Loss" value={formatCurrency(report.business_impact.impact_band.likely_usd)} />
              </div>

              <div className="detail-grid">
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

                <Panel title="Active Assumptions">
                  <p>Annual revenue: {formatCurrency(report.organization_profile.annual_revenue_musd * 1000000)}</p>
                  <p>Employee count: {report.organization_profile.employee_count.toLocaleString()}</p>
                  <p>Internet exposure: {report.organization_profile.internet_exposure}/5</p>
                  <p>Security maturity: {report.organization_profile.security_maturity}/5</p>
                  <p>Regulatory sensitivity: {report.organization_profile.regulatory_sensitivity}/5</p>
                  <p>Crown jewel dependency: {report.organization_profile.crown_jewel_dependency}/5</p>
                </Panel>

                <Panel title="Impact Band">
                  <p>Low: {formatCurrency(report.business_impact.impact_band.low_usd)}</p>
                  <p>Likely: {formatCurrency(report.business_impact.impact_band.likely_usd)}</p>
                  <p>High: {formatCurrency(report.business_impact.impact_band.high_usd)}</p>
                  <p>Downtime: {report.business_impact.impact_band.downtime_hours} hours</p>
                  <p>People affected: {report.business_impact.impact_band.people_affected.toLocaleString()}</p>
                </Panel>

                <Panel title="Control Posture">
                  {report.business_context.control_posture.map((item) => (
                    <p key={item}>{item}</p>
                  ))}
                </Panel>

                <Panel title="Recommended Actions">
                  {report.leadership_output.recommended_actions.map((action) => (
                    <p key={action}>{action}</p>
                  ))}
                </Panel>

                <Panel title="Technical Trigger">
                  <p>{report.technical_summary}</p>
                </Panel>

                <Panel title="Scoring Rationale">
                  {report.risk_assessment.rationale.map((item) => (
                    <p key={item}>{item}</p>
                  ))}
                </Panel>
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

function MetricCard({ label, value }) {
  return (
    <article className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function Panel({ title, children }) {
  return (
    <article className="panel">
      <p className="section-label">{title}</p>
      {children}
    </article>
  );
}

function ExposureBar({ label, value }) {
  const tone = value >= 85 ? "critical" : value >= 70 ? "high" : value >= 45 ? "medium" : "low";
  return (
    <div className="exposure-row">
      <div className="exposure-meta">
        <span>{label}</span>
        <strong>{value}%</strong>
      </div>
      <div className="exposure-track">
        <div className={`exposure-fill ${tone}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}