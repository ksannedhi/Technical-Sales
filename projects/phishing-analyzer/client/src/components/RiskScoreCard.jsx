import { useState } from 'react';

function RiskScoreCard({ result, onDownload, scoreBreakdown }) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const circumference = 2 * Math.PI * 48;
  const dash = (result.riskScore / 100) * circumference;

  return (
    <section className="panel score-panel">
      <div className="score-ring-wrap">
        <svg className="score-ring" viewBox="0 0 120 120" aria-hidden="true">
          <circle cx="60" cy="60" r="48" className="score-track" />
          <circle
            cx="60"
            cy="60"
            r="48"
            className="score-progress"
            style={{ strokeDasharray: `${dash} ${circumference}` }}
          />
        </svg>
        <div className="score-center">
          <strong>{result.riskScore}</strong>
          <span>/ 100</span>
        </div>
      </div>
      <span className={`verdict-pill verdict-${result.verdict}`}>{result.verdict.replace('_', ' ')}</span>

      {scoreBreakdown?.length ? (
        <div className="breakdown-section">
          <button
            className="breakdown-toggle"
            type="button"
            onClick={() => setShowBreakdown((v) => !v)}
          >
            {showBreakdown ? 'Hide' : 'Show'} score breakdown
          </button>
          {showBreakdown ? (
            <ul className="breakdown-list">
              {scoreBreakdown.map((item, i) => (
                <li key={i} className="breakdown-item">
                  <span className="breakdown-label">{item.label}</span>
                  <span className="breakdown-points">+{item.points}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export default RiskScoreCard;
