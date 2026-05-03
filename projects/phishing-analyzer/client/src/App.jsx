import { useMemo, useState } from 'react';
import EmailInput from './components/EmailInput.jsx';
import RiskScoreCard from './components/RiskScoreCard.jsx';
import SummaryPanel from './components/SummaryPanel.jsx';
import FindingsPanel from './components/FindingsPanel.jsx';
import EccPanel from './components/EccPanel.jsx';
import RecommendationsPanel from './components/RecommendationsPanel.jsx';
import MetadataStrip from './components/MetadataStrip.jsx';
import AttackTags from './components/AttackTags.jsx';
import IocPanel from './components/IocPanel.jsx';
import { analyzeEmail, downloadReport } from './lib/api.js';

function App() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [framework, setFramework] = useState('nca_ecc');
  const [analystNote, setAnalystNote] = useState('');

  const topFindings = useMemo(() => result?.findings ?? [], [result]);

  async function handleAnalyze(payload) {
    setLoading(true);
    setError('');
    setResult(null);
    setAnalystNote('');

    try {
      const analysis = await analyzeEmail(payload);
      setResult(analysis);
    } catch (analysisError) {
      setError(analysisError.message);
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleDownload() {
    if (!result) return;
    try {
      await downloadReport(result, analystNote);
    } catch (reportError) {
      setError(reportError.message);
    }
  }

  return (
    <div className="page-shell">
      <header className="app-bar">
        <div className="brand-lockup">
          <div className="brand-mark">P</div>
          <div>
            <h1>Phishing Analyzer</h1>
            <p>AI-assisted email threat review</p>
          </div>
        </div>
        <div className="hero-badge">Hybrid analysis: rules + OpenAI</div>
      </header>

      <section className="hero panel">
        <p className="eyebrow">Drop a suspicious email. Get a boardroom-ready verdict.</p>
        <p className="hero-copy">
          Paste raw email text or upload an .eml file and get back a risk score, a plain-English verdict,
          severity-ranked findings with email evidence, MITRE ATT&CK context, NCA ECC or ISO 27001 compliance gaps,
          and owner-assigned remediation steps — in seconds.
        </p>
      </section>

      <EmailInput onAnalyze={handleAnalyze} loading={loading} />

      {error ? <div className="error-banner">{error}</div> : null}

      {result ? (
        <main className="results-grid">
          {result.metadata?.campaignMatch ? (
            <div className="campaign-match-banner">
              Infrastructure matches a previously analyzed email in this session — possible campaign reuse.
              {result.metadata.campaignMatchedAt ? ` (first seen: ${new Date(result.metadata.campaignMatchedAt).toLocaleTimeString()})` : ''}
            </div>
          ) : null}

          <section className="results-top">
            <RiskScoreCard result={result} onDownload={handleDownload} scoreBreakdown={result.scoreBreakdown} />
            <div className="stacked-panels">
              <SummaryPanel
                title="Executive Summary"
                body={result.executiveSummary}
                verdict={result.verdict}
                confidence={result.confidence}
                analysisSource={result.metadata?.analysisSource}
              />
              <AttackTags attackTactics={result.attackTactics} />
            </div>
          </section>

          <MetadataStrip metadata={result.metadata} />

          {result.iocs && (result.iocs.embeddedUrls?.length > 0 || result.iocs.uniqueDomains?.length > 0) ? (
            <IocPanel iocs={result.iocs} />
          ) : null}

          <FindingsPanel findings={topFindings} framework={framework} />
          <SummaryPanel title="Analyst Summary" body={result.analystSummary} tone="technical" />
          <EccPanel
            eccGaps={result.eccComplianceGaps}
            isoGaps={result.isoComplianceGaps ?? []}
            findings={result.findings}
            framework={framework}
            onFrameworkChange={setFramework}
          />
          <RecommendationsPanel recommendations={result.recommendations} />

          <div className="analyst-note-section panel">
            <label className="analyst-note-label" htmlFor="analyst-note">
              Analyst notes
              <span className="analyst-note-hint">Appended to the PDF export</span>
            </label>
            <textarea
              id="analyst-note"
              className="analyst-note-textarea"
              placeholder="Add context, incident reference, or observations before downloading the report…"
              value={analystNote}
              onChange={(e) => setAnalystNote(e.target.value)}
              rows={3}
            />
            <div className="analyst-note-actions">
              <button className="download-button" type="button" onClick={handleDownload}>
                Download PDF report
              </button>
            </div>
          </div>
        </main>
      ) : null}
    </div>
  );
}

export default App;
