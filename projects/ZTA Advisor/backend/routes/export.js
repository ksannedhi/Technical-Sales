import { Router } from 'express';
import puppeteer from 'puppeteer';

export const exportRouter = Router();

const PILLAR_LABELS = {
  identity: 'Identity',
  devices: 'Devices',
  networks: 'Networks',
  applications: 'Applications & Workloads',
  data: 'Data',
  visibility: 'Visibility & Analytics'
};

const MATURITY_LABELS = ['', 'Traditional', 'Initial', 'Advanced', 'Optimal'];
const MATURITY_COLORS = ['', '#dc2626', '#f59e0b', '#3b82f6', '#10b981'];

function maturityLabel(score) {
  if (score < 1.5) return 'Traditional';
  if (score < 2.5) return 'Initial';
  if (score < 3.5) return 'Advanced';
  return 'Optimal';
}

function maturityColor(score) {
  if (score < 1.5) return '#dc2626';
  if (score < 2.5) return '#f59e0b';
  if (score < 3.5) return '#3b82f6';
  return '#10b981';
}

function gapBadge(gap) {
  if (gap >= 2) return { label: 'Critical', color: '#dc2626' };
  if (gap >= 1) return { label: 'High', color: '#f59e0b' };
  if (gap > 0) return { label: 'Medium', color: '#3b82f6' };
  return { label: 'On Target', color: '#10b981' };
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildHtml({ meta, pillarScores, roadmap, overallScore, narrative }) {
  const { orgProfile, frameworkIds, assessedAt } = meta;
  const dateStr = new Date(assessedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const frameworks = (frameworkIds || []).join(', ').toUpperCase() || 'N/A';

  const overallColor = maturityColor(overallScore);
  const overallLabel = maturityLabel(overallScore);

  const pillars = ['identity', 'devices', 'networks', 'applications', 'data', 'visibility'];

  const gapRows = pillars.map(p => {
    const s = pillarScores[p];
    const badge = gapBadge(s.gap);
    const barWidth = Math.round((s.current / 4) * 100);
    return `
      <tr>
        <td style="font-weight:600;padding:10px 12px;">${escapeHtml(PILLAR_LABELS[p])}</td>
        <td style="padding:10px 12px;">
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="flex:1;background:#e5e7eb;border-radius:4px;height:8px;">
              <div style="width:${barWidth}%;background:${maturityColor(s.current)};height:8px;border-radius:4px;"></div>
            </div>
            <span style="font-size:12px;font-weight:600;color:${maturityColor(s.current)};min-width:70px;">${escapeHtml(maturityLabel(s.current))} (${s.current.toFixed(1)})</span>
          </div>
        </td>
        <td style="padding:10px 12px;color:#6b7280;">Advanced (3.0)</td>
        <td style="padding:10px 12px;">
          <span style="background:${badge.color}20;color:${badge.color};font-weight:600;padding:3px 10px;border-radius:12px;font-size:12px;">${badge.label}</span>
        </td>
      </tr>`;
  }).join('');

  const roadmapSections = [
    { key: 'short', label: 'Immediate (0–90 days)', color: '#dc2626', bg: '#fef2f2' },
    { key: 'medium', label: 'Medium-term (90–180 days)', color: '#f59e0b', bg: '#fffbeb' },
    { key: 'long', label: 'Strategic (180+ days)', color: '#3b82f6', bg: '#eff6ff' }
  ];

  const roadmapHtml = roadmapSections.map(({ key, label, color, bg }) => {
    const items = roadmap[key] || [];
    if (!items.length) return '';
    const itemsHtml = items.map(ctrl => `
      <div style="background:#fff;border-radius:6px;padding:12px 14px;margin-bottom:8px;border-left:3px solid ${color};">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;">
          <div>
            <div style="font-weight:600;font-size:13px;color:#111827;">${escapeHtml(ctrl.title)}</div>
            <div style="font-size:12px;color:#6b7280;margin-top:4px;">${escapeHtml(ctrl.description)}</div>
          </div>
          <span style="background:#f3f4f6;padding:2px 8px;border-radius:10px;font-size:11px;color:#374151;white-space:nowrap;margin-left:12px;">${escapeHtml(PILLAR_LABELS[ctrl.pillar] || ctrl.pillar)}</span>
        </div>
      </div>`).join('');

    return `
      <div style="margin-bottom:24px;">
        <div style="background:${bg};border-radius:8px;padding:8px 14px;margin-bottom:12px;display:inline-block;">
          <span style="color:${color};font-weight:700;font-size:13px;">${escapeHtml(label)}</span>
          <span style="color:${color};font-size:12px;margin-left:8px;">${items.length} action${items.length !== 1 ? 's' : ''}</span>
        </div>
        ${itemsHtml}
      </div>`;
  }).join('');

  const narrativeHtml = narrative
    ? `<section style="margin-bottom:36px;">
        <h2 style="font-size:16px;font-weight:700;color:#111827;border-bottom:2px solid #e5e7eb;padding-bottom:8px;margin-bottom:16px;">Executive Summary</h2>
        <div style="font-size:13px;color:#374151;line-height:1.8;white-space:pre-wrap;">${escapeHtml(narrative)}</div>
       </section>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<title>ZTA Assessment Report — ${escapeHtml(orgProfile?.orgName || 'Organization')}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #111827; margin: 0; padding: 0; background: #fff; }
  * { box-sizing: border-box; }
</style>
</head>
<body>
<div style="max-width:900px;margin:0 auto;padding:40px 36px;">

  <!-- Header -->
  <div style="border-bottom:3px solid #0f172a;padding-bottom:20px;margin-bottom:32px;">
    <div style="display:flex;justify-content:space-between;align-items:flex-end;">
      <div>
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#6b7280;font-weight:600;margin-bottom:6px;">Zero Trust Architecture Assessment</div>
        <h1 style="font-size:26px;font-weight:800;color:#0f172a;margin:0;">${escapeHtml(orgProfile?.orgName || 'Organization')}</h1>
        <div style="font-size:13px;color:#6b7280;margin-top:6px;">Industry: ${escapeHtml(orgProfile?.industry || '—')} &nbsp;|&nbsp; Size: ${escapeHtml(orgProfile?.orgSize || '—')} &nbsp;|&nbsp; Frameworks: ${escapeHtml(frameworks)}</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:11px;color:#9ca3af;">${escapeHtml(dateStr)}</div>
        <div style="font-size:32px;font-weight:800;color:${overallColor};">${overallScore.toFixed(1)}<span style="font-size:16px;color:#9ca3af;">/4.0</span></div>
        <div style="font-size:12px;font-weight:600;color:${overallColor};">${overallLabel} Maturity</div>
      </div>
    </div>
  </div>

  ${narrativeHtml}

  <!-- Gap Analysis -->
  <section style="margin-bottom:36px;">
    <h2 style="font-size:16px;font-weight:700;color:#111827;border-bottom:2px solid #e5e7eb;padding-bottom:8px;margin-bottom:16px;">Pillar Maturity & Gap Analysis</h2>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead>
        <tr style="background:#f9fafb;">
          <th style="text-align:left;padding:10px 12px;font-weight:600;color:#374151;border-bottom:1px solid #e5e7eb;">Pillar</th>
          <th style="text-align:left;padding:10px 12px;font-weight:600;color:#374151;border-bottom:1px solid #e5e7eb;">Current Maturity</th>
          <th style="text-align:left;padding:10px 12px;font-weight:600;color:#374151;border-bottom:1px solid #e5e7eb;">Target</th>
          <th style="text-align:left;padding:10px 12px;font-weight:600;color:#374151;border-bottom:1px solid #e5e7eb;">Gap Priority</th>
        </tr>
      </thead>
      <tbody>
        ${gapRows}
      </tbody>
    </table>
  </section>

  <!-- Roadmap -->
  <section style="margin-bottom:36px;">
    <h2 style="font-size:16px;font-weight:700;color:#111827;border-bottom:2px solid #e5e7eb;padding-bottom:8px;margin-bottom:16px;">Prioritized Remediation Roadmap</h2>
    ${roadmapHtml}
  </section>

  <!-- Footer -->
  <div style="border-top:1px solid #e5e7eb;padding-top:16px;font-size:11px;color:#9ca3af;display:flex;justify-content:space-between;">
    <span>ZTA Advisor — Confidential Assessment</span>
    <span>Generated ${escapeHtml(dateStr)}</span>
  </div>

</div>
</body>
</html>`;
}

exportRouter.post('/pdf', async (req, res) => {
  try {
    const payload = req.body;
    const html = buildHtml(payload);

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      ...(process.env.PUPPETEER_EXECUTABLE_PATH
        ? { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH }
        : {})
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdfBuffer = Buffer.from(await page.pdf({
      format: 'A4',
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
      printBackground: true
    }));

    await browser.close();

    const org = payload.meta?.orgProfile?.orgName?.replace(/[^a-z0-9]/gi, '-').toLowerCase() || 'org';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="zta-assessment-${org}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('PDF export error:', err);
    res.status(500).json({ error: 'PDF generation failed', detail: err.message });
  }
});
