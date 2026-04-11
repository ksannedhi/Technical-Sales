const SEV_COLOR = {
  critical: '#e24b4a',
  high:     '#d85a30',
  medium:   '#ba7517',
  low:      '#3b6d11'
};

const PRIORITY_COLOR = {
  immediate:   '#e24b4a',
  'this-week': '#ba7517',
  'this-month':'#3b6d11'
};

export function buildReportHTML(r) {
  const topThreatsRows = (r.topThreats || []).map(t => `
    <tr>
      <td>${t.rank}</td>
      <td><span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:600;background:${SEV_COLOR[t.severity]}20;color:${SEV_COLOR[t.severity]}">${t.severity}</span></td>
      <td style="font-weight:500">${t.title}</td>
      <td style="font-size:11px;color:#555">${(t.iocs||[]).slice(0,2).join(', ') || '—'}</td>
      <td><span style="display:inline-block;padding:1px 6px;border-radius:20px;font-size:10px;font-weight:500;background:#eeedfe;color:#3c3489">${t.gccRelevance}</span></td>
    </tr>
  `).join('');

  const kevRows = (r.cisaKEVHighlights || []).map(k => `
    <tr>
      <td style="font-family:monospace;font-size:11px;color:#185fa5;font-weight:600">${k.cveId}</td>
      <td>${k.product} ${k.ransomwareLinked ? '<span style="display:inline-block;padding:1px 6px;border-radius:20px;font-size:9px;font-weight:600;background:#fcebeb;color:#a32d2d;margin-left:4px">Ransomware</span>' : ''}</td>
      <td>${k.patchDeadline || 'TBD'}</td>
      <td><span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:500;background:${PRIORITY_COLOR[k.priority] || '#888'}20;color:${PRIORITY_COLOR[k.priority] || '#888'}">${k.priority}</span></td>
    </tr>
  `).join('');

  const recRows = (r.recommendations || []).map((rec, i) => `
    <tr>
      <td style="color:#888">${i + 1}</td>
      <td>${rec.action}</td>
      <td><span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:500;background:#e6f1fb;color:#185fa5">${rec.owner}</span></td>
      <td><span style="display:inline-block;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:500;background:#fcebeb;color:#a32d2d">${rec.timeframe}</span></td>
    </tr>
  `).join('');

  const threatColor = SEV_COLOR[r.threatLevel] || '#888';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; color: #1a1a1a; }
  .header { display: flex; justify-content: space-between; align-items: flex-start;
            border-bottom: 2px solid ${threatColor}; padding-bottom: 12px; margin-bottom: 20px; }
  .logo    { font-size: 16px; font-weight: 700; color: ${threatColor}; }
  .logo-sub{ font-size: 10px; color: #888; margin-top: 2px; }
  .meta    { text-align: right; font-size: 10px; color: #666; line-height: 1.8; }
  .banner  { display: flex; align-items: center; gap: 16px;
             background: ${threatColor}12; border: 1px solid ${threatColor}50;
             border-radius: 8px; padding: 12px 16px; margin-bottom: 16px; }
  .badge   { width: 56px; height: 56px; border-radius: 8px; background: ${threatColor};
             color: white; display: flex; flex-direction: column; align-items: center;
             justify-content: center; flex-shrink: 0; }
  .badge-l { font-size: 8px; opacity: .8; text-transform: uppercase; letter-spacing: .05em; }
  .badge-v { font-size: 17px; font-weight: 700; text-transform: capitalize; }
  .banner-text h2 { font-size: 13px; font-weight: 700; color: ${threatColor}; }
  .banner-text p  { font-size: 11px; color: #444; margin-top: 3px; line-height: 1.55; }
  .section  { margin-bottom: 18px; }
  .sec-title{ font-size: 10px; font-weight: 700; text-transform: uppercase;
              letter-spacing: .07em; color: #888; border-bottom: 0.5px solid #e0e0e0;
              padding-bottom: 5px; margin-bottom: 10px; }
  .box      { background: #f9f9f9; border-left: 3px solid ${threatColor};
              padding: 10px 14px; font-size: 12px; line-height: 1.7; color: #333; margin-bottom: 10px; }
  table     { width: 100%; border-collapse: collapse; font-size: 11px; }
  th        { text-align: left; font-weight: 700; color: #888; font-size: 9px;
              text-transform: uppercase; padding: 6px 8px; background: #f5f5f5;
              border-bottom: 0.5px solid #e0e0e0; }
  td        { padding: 7px 8px; border-bottom: 0.5px solid #f0f0f0; vertical-align: top; }
  .footer   { margin-top: 24px; border-top: 0.5px solid #e0e0e0; padding-top: 8px;
              font-size: 9px; color: #bbb; display: flex; justify-content: space-between; }
</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="logo">Threat Intel Briefing</div>
      <div class="logo-sub">AI-Powered Daily Threat Report · GCC Region</div>
    </div>
    <div class="meta">
      <div>Generated: ${new Date(r.briefingDate || Date.now()).toLocaleString('en-GB')}</div>
      <div>OTX pulses: ${r.feedStats?.otxPulsesProcessed ?? 0}</div>
      <div>CISA KEV added: ${r.feedStats?.cisaKEVAdded ?? 0}</div>
      <div>Malware samples: ${r.feedStats?.malwareSamplesAnalysed ?? 0}</div>
    </div>
  </div>

  <div class="banner">
    <div class="badge">
      <span class="badge-l">Threat</span>
      <span class="badge-v">${r.threatLevel || '—'}</span>
    </div>
    <div class="banner-text">
      <h2>Regional threat level: ${(r.threatLevel || '').toUpperCase()}</h2>
      <p>${r.executiveSummary || ''}</p>
    </div>
  </div>

  <div class="section">
    <div class="sec-title">Analyst summary</div>
    <div class="box">${r.analystSummary || ''}</div>
  </div>

  <div class="section">
    <div class="sec-title">Top threats</div>
    <table>
      <tr><th>#</th><th>Severity</th><th>Threat</th><th>Key IOCs</th><th>GCC relevance</th></tr>
      ${topThreatsRows || '<tr><td colspan="5" style="color:#aaa">No threats identified</td></tr>'}
    </table>
  </div>

  <div class="section">
    <div class="sec-title">CISA KEV highlights</div>
    <table>
      <tr><th>CVE ID</th><th>Product</th><th>Patch deadline</th><th>Priority</th></tr>
      ${kevRows || '<tr><td colspan="4" style="color:#aaa">No new KEV entries today</td></tr>'}
    </table>
  </div>

  <div class="section">
    <div class="sec-title">Recommended actions</div>
    <table>
      <tr><th>#</th><th>Action</th><th>Owner</th><th>Timeframe</th></tr>
      ${recRows}
    </table>
  </div>

  <div class="footer">
    <span>Threat Intel Briefing — Powered by Claude API (Anthropic)</span>
    <span>CONFIDENTIAL — For internal use only</span>
  </div>
</body>
</html>`;
}
