// Escape HTML special characters in all Claude-generated text before template injection
function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildReportHTML(harmonisationResults, roadmap, selectedFrameworks, taxonomy) {
  const matrixRows = harmonisationResults.map(d => {
    const cells = selectedFrameworks.map(fwId => {
      const cov = d.coverageByFramework?.[fwId]?.coverage || 'unknown';
      const label = cov === 'full' ? 'Full' : cov === 'partial' ? 'Partial' : '—';
      const bg    = cov === 'full' ? '#E1F5EE' : cov === 'partial' ? '#FAEEDA' : '#F5F5F5';
      const color = cov === 'full' ? '#0F6E56' : cov === 'partial' ? '#633806' : '#AAA';
      return `<td style="text-align:center;background:${bg};color:${color};font-size:10px;font-weight:600;padding:5px 4px">${label}</td>`;
    }).join('');
    return `<tr><td style="font-size:11px;font-weight:500;padding:6px 8px">${esc(d.domainLabel)}</td>${cells}</tr>`;
  }).join('');

  const fwHeaders = selectedFrameworks.map(f =>
    `<th style="font-size:9px;padding:5px 4px;text-align:center;white-space:nowrap">${esc(f.replace('-', ' '))}</th>`
  ).join('');

  const roadmapRows = (roadmap?.roadmapItems || []).slice(0, 10).map((item, i) => {
    const priorityColor = { immediate: '#E24B4A', 'short-term': '#D85A30', 'medium-term': '#BA7517', planned: '#3B6D11' }[item.priority] || '#888';
    return `
      <tr style="border-bottom:0.5px solid #f0f0f0">
        <td style="padding:7px 8px;font-size:11px;color:#888">${item.rank || i+1}</td>
        <td style="padding:7px 8px;font-size:11px;font-weight:500">${esc(item.domainLabel)}</td>
        <td style="padding:7px 8px"><span style="background:${priorityColor}20;color:${priorityColor};padding:2px 8px;border-radius:20px;font-size:10px;font-weight:600">${esc(item.priority)}</span></td>
        <td style="padding:7px 8px;font-size:11px;color:#555">${esc((item.recommendedActions||[])[0] || '')}</td>
      </tr>`;
  }).join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 12px; color: #1a1a1a; }
  .header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #1A1A1A; padding-bottom:12px; margin-bottom:20px; }
  .logo { font-size:16px; font-weight:700; }
  .logo-sub { font-size:10px; color:#888; margin-top:2px; }
  .meta { text-align:right; font-size:10px; color:#666; line-height:1.8; }
  .section { margin-bottom:20px; }
  .sec-title { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:.07em; color:#888; border-bottom:0.5px solid #e0e0e0; padding-bottom:5px; margin-bottom:10px; }
  .exec-box { background:#f8f8f8; border-left:3px solid #1A1A1A; padding:10px 14px; font-size:12px; line-height:1.7; color:#333; }
  table { width:100%; border-collapse:collapse; font-size:11px; }
  th { text-align:left; font-weight:700; color:#888; font-size:9px; text-transform:uppercase; padding:6px 8px; background:#f5f5f5; border-bottom:0.5px solid #e0e0e0; }
  .footer { margin-top:24px; border-top:0.5px solid #e0e0e0; padding-top:8px; font-size:9px; color:#bbb; display:flex; justify-content:space-between; }
  .legend { display:flex; gap:16px; margin-bottom:8px; font-size:10px; }
  .leg { display:flex; align-items:center; gap:4px; }
  .leg-dot { width:10px; height:10px; border-radius:2px; }
</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="logo">Cross-Framework Harmoniser</div>
      <div class="logo-sub">GCC Regulatory Compliance Report</div>
    </div>
    <div class="meta">
      <div>Generated: ${new Date().toLocaleString('en-GB')}</div>
      <div>Frameworks: ${selectedFrameworks.join(', ')}</div>
      <div>Domains analysed: ${harmonisationResults.length}</div>
    </div>
  </div>

  ${roadmap?.executiveSummary ? `
  <div class="section">
    <div class="sec-title">Executive summary</div>
    <div class="exec-box">${esc(roadmap.executiveSummary)}</div>
  </div>` : ''}

  <div class="section">
    <div class="sec-title">Coverage matrix</div>
    <div class="legend">
      <div class="leg"><div class="leg-dot" style="background:#E1F5EE;border:1px solid #1D9E75"></div>Full coverage</div>
      <div class="leg"><div class="leg-dot" style="background:#FAEEDA;border:1px solid #BA7517"></div>Partial coverage</div>
      <div class="leg"><div class="leg-dot" style="background:#F5F5F5;border:1px solid #DDD"></div>Not addressed</div>
    </div>
    <table>
      <tr><th>Control domain</th>${fwHeaders}</tr>
      ${matrixRows}
    </table>
  </div>

  ${roadmapRows ? `
  <div class="section">
    <div class="sec-title">Top implementation priorities</div>
    <table>
      <tr><th>#</th><th>Domain</th><th>Priority</th><th>First action</th></tr>
      ${roadmapRows}
    </table>
  </div>` : ''}

  <div class="footer">
    <span>Cross-Framework Harmoniser — Powered by Claude API (Anthropic)</span>
    <span>CONFIDENTIAL — Verify all regulatory obligations with legal counsel</span>
  </div>
</body>
</html>`;
}
