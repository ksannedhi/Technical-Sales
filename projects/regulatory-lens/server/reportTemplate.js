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

  const allItems     = roadmap?.roadmapItems || [];
  const highPriority = allItems.filter(item => item.priority === 'immediate' || item.priority === 'short-term');
  const remaining    = allItems.filter(item => item.priority !== 'immediate' && item.priority !== 'short-term');

  // Full-detail blocks for immediate + short-term only
  const roadmapBlocks = highPriority.map((item, i) => {
    const priorityColor  = { immediate: '#A32D2D', 'short-term': '#993C1D' }[item.priority] || '#555';
    const priorityBg     = { immediate: '#FCEBEB', 'short-term': '#FAECE7' }[item.priority] || '#F5F5F5';
    const effortKey      = (item.estimatedEffort || '').toLowerCase().replace(/\s+/g, '-');
    const effortColor    = { low: '#27500A', medium: '#633806', high: '#993C1D', 'very-high': '#A32D2D' }[effortKey] || '#555';
    const effortBg       = { low: '#EAF3DE', medium: '#FAEEDA', high: '#FAECE7', 'very-high': '#FCEBEB' }[effortKey] || '#F5F5F5';
    const actions        = (item.recommendedActions || []).slice(0, 5);
    const wins           = (item.quickWins || []).slice(0, 2);
    const gaps           = item.mandatoryFrameworkGaps || [];

    const gapPills = gaps.map(g =>
      `<span style="background:#FCEBEB;color:#A32D2D;font-size:9px;font-weight:600;padding:1px 6px;border-radius:10px;margin-right:3px">${esc(g)}</span>`
    ).join('');

    const actionLines = actions.map(a =>
      `<div style="font-size:10px;color:#334155;padding:2px 0 2px 8px;border-left:2px solid #E2E8F0;margin-top:2px;line-height:1.4">${esc(a)}</div>`
    ).join('');

    const winLines = wins.map(w =>
      `<div style="font-size:10px;color:#166534;margin-top:2px">• ${esc(w)}</div>`
    ).join('');

    return `
      <div style="padding:10px 0;border-bottom:0.5px solid #F0F0F0;display:flex;gap:10px;align-items:flex-start">
        <div style="font-size:11px;font-weight:700;color:#CBD5E1;min-width:20px;text-align:center;padding-top:1px">${item.rank || i+1}</div>
        <div style="flex:1">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:5px">
            <span style="font-size:11px;font-weight:600;color:#0F172A">${esc(item.domainLabel)}</span>
            <span style="background:${priorityBg};color:${priorityColor};font-size:9px;font-weight:700;padding:2px 7px;border-radius:20px">${esc(item.priority || '')}</span>
            ${item.estimatedEffort ? `<span style="background:${effortBg};color:${effortColor};font-size:9px;font-weight:600;padding:2px 7px;border-radius:20px">Effort: ${esc(item.estimatedEffort)}</span>` : ''}
            ${item.weightedScore != null ? `<span style="margin-left:auto;font-size:9px;color:#94A3B8;font-weight:600">Score ${item.weightedScore}</span>` : ''}
          </div>
          ${gaps.length > 0 ? `<div style="margin-bottom:5px"><span style="font-size:9px;font-weight:700;color:#A32D2D;margin-right:4px">Mandatory gaps:</span>${gapPills}</div>` : ''}
          ${actions.length > 0 ? `
            <div style="margin-bottom:5px">
              <div style="font-size:9px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px">Recommended actions</div>
              ${actionLines}
            </div>` : ''}
          ${wins.length > 0 ? `
            <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-radius:5px;padding:5px 8px">
              <div style="font-size:9px;font-weight:700;color:#166534;text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px">⚡ Quick wins (≤ 2 weeks)</div>
              ${winLines}
            </div>` : ''}
        </div>
      </div>`;
  }).join('');

  // Compact summary table for medium-term + planned
  const remainingRows = remaining.map((item, i) => {
    const priorityColor = { 'medium-term': '#633806', planned: '#27500A' }[item.priority] || '#555';
    const priorityBg    = { 'medium-term': '#FAEEDA', planned: '#EAF3DE' }[item.priority] || '#F5F5F5';
    const gaps          = (item.mandatoryFrameworkGaps || []).join(', ');
    return `<tr style="border-bottom:0.5px solid #F0F0F0">
      <td style="padding:5px 6px;font-size:10px;color:#94A3B8;text-align:center">${item.rank || ''}</td>
      <td style="padding:5px 6px;font-size:10px;font-weight:500">${esc(item.domainLabel)}</td>
      <td style="padding:5px 6px"><span style="background:${priorityBg};color:${priorityColor};font-size:9px;font-weight:600;padding:1px 6px;border-radius:10px">${esc(item.priority || '')}</span></td>
      <td style="padding:5px 6px;font-size:10px;color:#555">${esc(item.estimatedEffort || '—')}</td>
      <td style="padding:5px 6px;font-size:9px;color:#A32D2D">${esc(gaps)}</td>
      <td style="padding:5px 6px;font-size:10px;color:#475569">${esc((item.recommendedActions || [])[0] || '')}</td>
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

  ${allItems.length > 0 ? `
  <div class="section">
    <div class="sec-title">Implementation roadmap — ${allItems.length} domains</div>
    ${roadmap?.criticalGaps != null ? `<div style="font-size:10px;color:#A32D2D;font-weight:600;margin-bottom:8px">⚠ ${roadmap.criticalGaps} critical gaps &nbsp;·&nbsp; <span style="color:#888;font-weight:400">${roadmap.totalGaps} total gaps identified</span></div>` : ''}

    ${highPriority.length > 0 ? `
    <div style="font-size:9px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">Immediate &amp; Short-term — full detail</div>
    ${roadmapBlocks}` : ''}

    ${remaining.length > 0 ? `
    <div style="font-size:9px;font-weight:700;color:#64748B;text-transform:uppercase;letter-spacing:.06em;margin:14px 0 6px">Medium-term &amp; Planned — summary</div>
    <table>
      <tr><th>#</th><th>Domain</th><th>Priority</th><th>Effort</th><th>Mandatory gaps</th><th>First action</th></tr>
      ${remainingRows}
    </table>` : ''}
  </div>` : ''}

  <div class="footer">
    <span>Cross-Framework Harmoniser — Powered by Claude API (Anthropic)</span>
    <span>CONFIDENTIAL — Verify all regulatory obligations with legal counsel</span>
  </div>
</body>
</html>`;
}
