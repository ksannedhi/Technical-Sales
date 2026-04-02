import { useMemo, useState } from 'react';
import EmailInput from './components/EmailInput.jsx';
import RiskScoreCard from './components/RiskScoreCard.jsx';
import SummaryPanel from './components/SummaryPanel.jsx';
import FindingsPanel from './components/FindingsPanel.jsx';
import EccPanel from './components/EccPanel.jsx';
import RecommendationsPanel from './components/RecommendationsPanel.jsx';
import MetadataStrip from './components/MetadataStrip.jsx';
import AttackTags from './components/AttackTags.jsx';
import { analyzeEmail, downloadReport } from './lib/api.js';

function App() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const topFindings = useMemo(() => result?.findings ?? [], [result]);

  async function handleAnalyze(payload) {
    setLoading(true);
    setError('');
    setResult(null);

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
    if (!result) {
      return;
    }

    try {
      await downloadReport(result);
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
        <p className="eyebrow">Executive-ready phishing narrative</p>
        <p className="hero-copy">
          Paste or upload a suspicious email to generate a fast, balanced report with analyst findings, MITRE ATT&CK
          context, NCA ECC mapping, and owner-based remediation.
        </p>
      </section>

      <EmailInput onAnalyze={handleAnalyze} loading={loading} />

      {error ? <div className="error-banner">{error}</div> : null}

      {result ? (
        <main className="results-grid">
          <section className="results-top">
            <RiskScoreCard result={result} onDownload={handleDownload} />
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
          <FindingsPanel findings={topFindings} />
          <SummaryPanel title="Analyst Summary" body={result.analystSummary} tone="technical" />
          <EccPanel gaps={result.eccComplianceGaps} findings={result.findings} />
          <RecommendationsPanel recommendations={result.recommendations} />
        </main>
      ) : (
        <section className="empty-state">
          <h2>Built for polished demos</h2>
          <p>
            The first version is optimized for fast executive storytelling: strong verdict, evidence-backed findings,
            and clear remediation steps you can present in a customer conversation.
          </p>
        </section>
      )}
    </div>
  );
}

export default App;
