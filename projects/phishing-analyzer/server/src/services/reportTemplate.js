const severityTone = {
  critical: { bg: '#fbe5e2', fg: '#b44336' },
  high: { bg: '#f8ead8', fg: '#b56a22' },
  medium: { bg: '#f7efcf', fg: '#8d6d19' },
  low: { bg: '#e4f0e3', fg: '#3b7044' }
};

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function titleCase(value = '') {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function buildFindings(result) {
  return result.findings
    .map((finding) => {
      const tone = severityTone[finding.severity] ?? severityTone.medium;

      return `
        <article class="finding-item">
          <div class="finding-row">
            <div class="finding-badges">
              <span class="severity-pill" style="background:${tone.bg}; color:${tone.fg};">${escapeHtml(titleCase(finding.severity))}</span>
              <span class="category-label">${escapeHtml(finding.displayCategory || titleCase(finding.category))}</span>
            </div>
            <div class="finding-content">
              <h4>${escapeHtml(finding.detail)}</h4>
              <div class="finding-excerpt">${escapeHtml(finding.excerpt)}</div>
            </div>
          </div>
        </article>
      `;
    })
    .join('');
}

function buildGapRows(result) {
  const categoriesByControl = new Map();
  const gapDetails = new Map((result.eccComplianceGaps || []).map((gap) => [gap.controlId, gap]));

  result.findings.forEach((finding) => {
    finding.eccControls.forEach((controlId) => {
      if (!categoriesByControl.has(controlId)) {
        categoriesByControl.set(controlId, new Set());
      }

      categoriesByControl.get(controlId).add(finding.displayCategory || titleCase(finding.category));
    });
  });

  const rows = (result.eccComplianceGaps || []).map((gap) => {
    const categories = [...(categoriesByControl.get(gap.controlId) || new Set(['General phishing protection']))];
    const categoryMarkup = categories
      .map((category) => `<span class="category-pill">${escapeHtml(category)}</span>`)
      .join('<br/>');

    return `
      <tr>
        <td class="ecc-category-cell">${categoryMarkup}</td>
        <td><div class="ecc-pill">${escapeHtml(gap.controlId)}</div></td>
        <td>${escapeHtml(gap.whyItMatters || gap.gap || 'Relevant security controls should detect, block, or reduce the impact of this indicator.')}</td>
      </tr>
    `;
  });

  return rows.join('');
}

function buildRecommendationRows(result) {
  return result.recommendations
    .map(
      (recommendation, index) => `
        <tr>
          <td class="index-cell">${index + 1}</td>
          <td>${escapeHtml(recommendation.action)}</td>
          <td><span class="meta-pill meta-owner">${escapeHtml(recommendation.owner)}</span></td>
          <td><span class="meta-pill meta-time">${escapeHtml(recommendation.timeframe)}</span></td>
        </tr>
      `
    )
    .join('');
}

function buildMitreTags(result) {
  return result.attackTactics
    .map(
      (item) => `
        <span class="attack-pill">${escapeHtml(item.tactic)}</span>
      `
    )
    .join('');
}

function formatAnalysisSource(value = '') {
  return value ? value.replaceAll('_', ' ') : 'unknown';
}

export function buildReportHtml(result) {
  const verdictLabel = titleCase(result.verdict).replace('Likely Phishing', 'Likely phishing');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Phishing Analyzer Report</title>
  <style>
    :root {
      --accent: #d84f44;
      --border: #d8d0c5;
      --border-soft: #e8e1d8;
      --bg: #fbf8f2;
      --surface: #fffdf9;
      --ink: #2e2a26;
      --muted: #756a61;
      --table-head: #f6f1e8;
    }

    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      font-family: "Segoe UI", Arial, sans-serif;
      color: var(--ink);
      padding: 28px 30px 24px;
      font-size: 12px;
    }

    .header {
      display: flex;
      justify-content: space-between;
      gap: 18px;
      border-bottom: 2px solid #eadfd6;
      padding-bottom: 14px;
      margin-bottom: 18px;
    }

    .brand-title {
      color: var(--accent);
      font-size: 24px;
      font-weight: 700;
      line-height: 1.05;
      margin: 0;
    }

    .brand-subtitle {
      color: #b1887b;
      font-size: 12px;
      margin-top: 3px;
    }

    .meta {
      text-align: right;
      color: var(--muted);
      font-size: 11px;
      line-height: 1.7;
      min-width: 280px;
    }

    .verdict-card {
      border: 1px solid #f1b7b0;
      background: #fff6f4;
      border-radius: 14px;
      padding: 14px 16px;
      display: grid;
      grid-template-columns: 84px 1fr;
      gap: 14px;
      align-items: center;
      margin-bottom: 18px;
    }

    .score-badge {
      width: 66px;
      height: 66px;
      border-radius: 50%;
      background: var(--accent);
      color: white;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      box-shadow: inset 0 -3px 0 rgba(0, 0, 0, 0.08);
    }

    .score-badge strong {
      font-size: 24px;
      line-height: 1;
    }

    .score-badge span {
      font-size: 10px;
      opacity: 0.88;
    }

    .verdict-copy h2 {
      margin: 0 0 4px;
      color: var(--accent);
      font-size: 18px;
      text-transform: uppercase;
      letter-spacing: 0.01em;
    }

    .verdict-copy p {
      margin: 0;
      color: #4f4741;
      line-height: 1.5;
      font-size: 13px;
    }

    .section {
      margin-top: 16px;
    }

    .section-title {
      font-size: 11px;
      font-weight: 700;
      color: var(--muted);
      letter-spacing: 0.06em;
      text-transform: uppercase;
      margin-bottom: 8px;
    }

    .summary-box {
      background: var(--surface);
      border-left: 3px solid var(--accent);
      border-radius: 0 8px 8px 0;
      padding: 12px 14px;
      line-height: 1.6;
      color: #423c37;
    }

    .attack-tags {
      margin-top: 10px;
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .attack-pill,
    .meta-pill,
    .category-pill,
    .severity-pill {
      display: inline-flex;
      align-items: center;
      border-radius: 999px;
      padding: 5px 11px;
      font-size: 11px;
      font-weight: 600;
    }

    .attack-pill {
      background: #f5e7d6;
      color: #8b611d;
    }

    .finding-block {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 16px;
      overflow: hidden;
    }

    .finding-item + .finding-item {
      border-top: 1px solid var(--border-soft);
    }

    .finding-row {
      display: grid;
      grid-template-columns: 165px 1fr;
      gap: 16px;
      padding: 14px 18px;
    }

    .finding-badges {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      flex-wrap: wrap;
      padding-top: 2px;
    }

    .category-label {
      color: var(--muted);
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding-top: 5px;
    }

    .finding-content h4 {
      margin: 0 0 8px;
      font-size: 16px;
      font-weight: 500;
      line-height: 1.35;
      color: #2f2b27;
    }

    .finding-excerpt {
      background: #f4f0e9;
      border-left: 2px solid #b7aea2;
      color: #6c645d;
      padding: 7px 10px;
      font-family: "Consolas", "Courier New", monospace;
      font-size: 11px;
      line-height: 1.45;
      word-break: break-word;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 16px;
      overflow: hidden;
    }

    th {
      background: var(--table-head);
      color: #6c6258;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      text-align: left;
      padding: 11px 14px;
      border-bottom: 1px solid var(--border);
    }

    td {
      padding: 14px;
      vertical-align: top;
      border-top: 1px solid var(--border-soft);
      line-height: 1.55;
    }

    tr:first-child td {
      border-top: none;
    }

    th + th,
    td + td {
      border-left: 1px solid var(--border-soft);
    }

    .ecc-category-cell {
      width: 170px;
    }

    .ecc-pill {
      display: block;
      background: #e7f0fb;
      color: #2b6bb5;
      border-radius: 8px;
      padding: 6px 10px;
      font-size: 11px;
      margin-bottom: 8px;
      width: 100%;
    }

    .ecc-pill:last-child {
      margin-bottom: 0;
    }

    .category-pill {
      background: #f8e6e6;
      color: #bb4338;
      font-size: 12px;
    }

    .meta-owner {
      background: #eaf1fb;
      color: #2a67ab;
    }

    .meta-time {
      background: #faecdc;
      color: #975f12;
    }

    .index-cell {
      width: 44px;
      color: #8a7d72;
      font-weight: 700;
    }
  </style>
</head>
<body>
  <header class="header">
    <div>
      <h1 class="brand-title">Phishing Analyzer</h1>
      <div class="brand-subtitle">AI-Powered Email Threat Report</div>
    </div>
    <div class="meta">
      <div>Analyzed: ${escapeHtml(result.metadata?.analyzedAt || '')}</div>
      <div>From: ${escapeHtml(result.metadata?.emailFrom || 'Unknown')}</div>
      <div>Subject: ${escapeHtml(result.metadata?.emailSubject || 'Unknown')}</div>
      <div>Links: ${escapeHtml(String(result.metadata?.linkCount ?? 0))} | Attachment: ${result.metadata?.attachmentDetected ? 'Yes' : 'No'}</div>
      <div>Source: ${escapeHtml(formatAnalysisSource(result.metadata?.analysisSource || 'unknown'))}</div>
    </div>
  </header>

  <section class="verdict-card">
    <div class="score-badge">
      <strong>${escapeHtml(String(result.riskScore))}</strong>
      <span>/100</span>
    </div>
    <div class="verdict-copy">
      <h2>${escapeHtml(verdictLabel)}</h2>
      <p>${escapeHtml(result.executiveSummary || '')}</p>
    </div>
  </section>

  <section class="section">
    <div class="section-title">Analyst Summary</div>
    <div class="summary-box">${escapeHtml(result.analystSummary || '')}</div>
  </section>

  <section class="section">
    <div class="section-title">MITRE ATT&CK Tactics</div>
    <div class="attack-tags">${buildMitreTags(result)}</div>
  </section>

  <section class="section">
    <div class="section-title">Findings</div>
    <div class="finding-block">
      ${buildFindings(result)}
    </div>
  </section>

  <section class="section">
    <div class="section-title">NCA ECC Compliance Gaps</div>
    <table>
      <thead>
        <tr>
          <th>Finding Category</th>
          <th>NCA ECC Controls Violated</th>
          <th>What The Control Requires</th>
        </tr>
      </thead>
      <tbody>
        ${buildGapRows(result)}
      </tbody>
    </table>
  </section>

  <section class="section">
    <div class="section-title">Recommendations</div>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Action</th>
          <th>Owner</th>
          <th>Timeframe</th>
        </tr>
      </thead>
      <tbody>
        ${buildRecommendationRows(result)}
      </tbody>
    </table>
  </section>
</body>
</html>`;
}
