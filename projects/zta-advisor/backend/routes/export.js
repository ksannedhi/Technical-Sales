import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Router } from 'express';
import puppeteer from 'puppeteer';

const __dirname = dirname(fileURLToPath(import.meta.url));
const frameworksData = JSON.parse(readFileSync(join(__dirname, '../data/frameworks.json'), 'utf8'));

export const exportRouter = Router();

const PILLAR_LABELS = {
  identity: 'Identity',
  devices: 'Devices',
  networks: 'Networks',
  applications: 'Applications & Workloads',
  data: 'Data',
  visibility: 'Visibility & Analytics'
};

const CISA_LABELS = ['Traditional', 'Initial', 'Advanced', 'Optimal'];

// Use labels passed from analyze response; fall back to first framework with 4 labels, then CISA defaults
function resolveMaturityLabels(passedLabels, frameworkIds = []) {
  if (Array.isArray(passedLabels) && passedLabels.length === 4) return passedLabels;
  for (const id of frameworkIds) {
    const fw = frameworksData.frameworks.find(f => f.id === id);
    if (fw?.maturityLabels?.length === 4) return fw.maturityLabels;
  }
  return CISA_LABELS;
}

function maturityLabel(score, labels = CISA_LABELS) {
  if (score < 1.5) return labels[0];
  if (score < 2.5) return labels[1];
  if (score < 3.5) return labels[2];
  return labels[3];
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

const RADAR_LABELS = {
  identity: 'Identity', devices: 'Devices', networks: 'Networks',
  applications: 'Apps', data: 'Data', visibility: 'Visibility'
};

function buildRadarSvg(pillarScores) {
  const cx = 140, cy = 140, R = 95, N = 6;
  const pillars = ['identity', 'devices', 'networks', 'applications', 'data', 'visibility'];

  function toXY(i, fraction) {
    const rad = (-90 + i * (360 / N)) * Math.PI / 180;
    return [cx + R * fraction * Math.cos(rad), cy + R * fraction * Math.sin(rad)];
  }

  function pts(fractions) {
    return fractions.map((f, i) => toXY(i, f).join(',')).join(' ');
  }

  const scores = pillars.map(p => (pillarScores[p]?.current || 1) / 4);
  const grids = [0.25, 0.5, 0.75, 1];

  const gridLines = grids.map(f =>
    `<polygon points="${pts(pillars.map(() => f))}" fill="none" stroke="#e5e7eb" stroke-width="1"/>`
  ).join('');

  const axes = pillars.map((_, i) => {
    const [x, y] = toXY(i, 1);
    return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#e5e7eb" stroke-width="1"/>`;
  }).join('');

  const target = `<polygon points="${pts(pillars.map(() => 3 / 4))}" fill="#3b82f610" stroke="#3b82f6" stroke-width="1.5" stroke-dasharray="4 3"/>`;
  const scorePolygon = `<polygon points="${pts(scores)}" fill="#0f172a20" stroke="#0f172a" stroke-width="2"/>`;

  const dots = pillars.map((p, i) => {
    const f = (pillarScores[p]?.current || 1) / 4;
    const [x, y] = toXY(i, f);
    return `<circle cx="${x}" cy="${y}" r="4" fill="${maturityColor(pillarScores[p]?.current || 1)}" stroke="#fff" stroke-width="1.5"/>`;
  }).join('');

  const labelEls = pillars.map((p, i) => {
    const [x, y] = toXY(i, 1.28);
    return `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-size="11" fill="#374151" font-weight="600">${RADAR_LABELS[p]}</text>`;
  }).join('');

  const gridValues = grids.map(f => {
    const [x, y] = toXY(0, f);
    return `<text x="${x + 5}" y="${y}" font-size="9" fill="#9ca3af" dominant-baseline="middle">${f * 4}</text>`;
  }).join('');

  return `<svg width="280" height="280" xmlns="http://www.w3.org/2000/svg">${gridLines}${axes}${target}${scorePolygon}${dots}${labelEls}${gridValues}</svg>`;
}

function buildHtml({ meta, pillarScores, roadmap, overallScore, narrative, maturityLabels: passedLabels, notes }) {
  const { orgProfile, frameworkIds, assessedAt } = meta;
  const dateStr = new Date(assessedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const frameworks = (frameworkIds || [])
    .map(id => frameworksData.frameworks.find(f => f.id === id)?.shortName || id.toUpperCase())
    .join(', ') || 'N/A';

  const labels = resolveMaturityLabels(passedLabels, frameworkIds || []);

  const overallColor = maturityColor(overallScore);
  const overallLabel = maturityLabel(overallScore, labels);

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
            <span style="font-size:12px;font-weight:600;color:${maturityColor(s.current)};min-width:70px;">${escapeHtml(maturityLabel(s.current, labels))} (${s.current.toFixed(1)})</span>
          </div>
        </td>
        <td style="padding:10px 12px;color:#6b7280;">${escapeHtml(labels[2])} (3.0)</td>
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
    const itemsHtml = items.map(ctrl => {
      const matchingFw = (ctrl.frameworks || [])
        .filter(id => (frameworkIds || []).includes(id))
        .map(id => frameworksData.frameworks.find(f => f.id === id)?.shortName)
        .filter(Boolean);
      const fwChips = matchingFw.length
        ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:6px;">${matchingFw.map(name => `<span style="font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px;background:#dbeafe;color:#1d4ed8;">${escapeHtml(name)}</span>`).join('')}</div>`
        : '';
      return `
      <div style="background:#fff;border-radius:6px;padding:12px 14px;margin-bottom:8px;border-left:3px solid ${color};">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;">
          <div>
            <div style="font-weight:600;font-size:13px;color:#111827;">${escapeHtml(ctrl.title)}</div>
            <div style="font-size:12px;color:#6b7280;margin-top:4px;">${escapeHtml(ctrl.description)}</div>
            ${fwChips}
          </div>
          <span style="background:#f3f4f6;padding:2px 8px;border-radius:10px;font-size:11px;color:#374151;white-space:nowrap;margin-left:12px;">${escapeHtml(PILLAR_LABELS[ctrl.pillar] || ctrl.pillar)}</span>
        </div>
      </div>`;
    }).join('');
    return `
      <div style="margin-bottom:24px;">
        <div style="background:${bg};border-radius:8px;padding:8px 14px;margin-bottom:12px;display:inline-block;">
          <span style="color:${color};font-weight:700;font-size:13px;">${escapeHtml(label)}</span>
          <span style="color:${color};font-size:12px;margin-left:8px;">${items.length} action${items.length !== 1 ? 's' : ''}</span>
        </div>
        ${itemsHtml}
      </div>`;
  }).join('');

  const totalActions = ['short','medium','long'].reduce((s, k) => s + (roadmap[k]?.length || 0), 0);
  const excellentHtml = totalActions === 0
    ? `<div style="color:#10b981;font-weight:600;padding:12px 0;font-size:14px;">All pillars are at or above target maturity. Excellent ZT posture!</div>`
    : '';

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

  <!-- Maturity Radar -->
  <section style="margin-bottom:36px;">
    <h2 style="font-size:16px;font-weight:700;color:#111827;border-bottom:2px solid #e5e7eb;padding-bottom:8px;margin-bottom:16px;">Maturity Radar</h2>
    <div style="display:flex;align-items:center;gap:40px;">
      <div style="flex-shrink:0;">${buildRadarSvg(pillarScores)}</div>
      <div style="font-size:12px;color:#6b7280;line-height:2;">
        <div style="margin-bottom:8px;"><span style="display:inline-block;width:24px;height:2px;background:#0f172a;vertical-align:middle;margin-right:6px;"></span>Current maturity</div>
        <div><span style="display:inline-block;width:24px;border-top:2px dashed #3b82f6;vertical-align:middle;margin-right:6px;"></span>Target (3.0)</div>
        <div style="margin-top:16px;border-top:1px solid #e5e7eb;padding-top:12px;">
          ${['identity','devices','networks','applications','data','visibility'].map(p => {
            const s = pillarScores[p];
            return `<div style="display:flex;justify-content:space-between;gap:24px;margin-bottom:4px;">
              <span style="font-weight:600;color:#374151;">${PILLAR_LABELS[p]}</span>
              <span style="color:${maturityColor(s.current)};font-weight:600;">${s.current.toFixed(1)}</span>
            </div>`;
          }).join('')}
        </div>
      </div>
    </div>
  </section>

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
    ${excellentHtml}
    ${roadmapHtml}
  </section>

  ${notes ? `
  <!-- PE Session Notes -->
  <section style="margin-bottom:36px;">
    <h2 style="font-size:16px;font-weight:700;color:#111827;border-bottom:2px solid #e5e7eb;padding-bottom:8px;margin-bottom:16px;">Session Notes</h2>
    <div style="font-size:13px;color:#374151;line-height:1.8;white-space:pre-wrap;background:#f9fafb;border-radius:6px;padding:14px 16px;border-left:3px solid #e5e7eb;">${escapeHtml(notes)}</div>
  </section>` : ''}

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
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
      ...(process.env.PUPPETEER_EXECUTABLE_PATH
        ? { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH }
        : {})
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdfBuffer = Buffer.from(await page.pdf({
      format: 'A4',
      margin: { top: '12mm', right: '0', bottom: '12mm', left: '0' },
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
