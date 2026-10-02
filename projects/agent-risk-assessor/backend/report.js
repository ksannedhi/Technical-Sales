// HTML for the PDF export. Kept separate from the React UI so the PDF has no build step.
const esc = (s) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const COLORS = { Critical: '#b91c1c', High: '#c2410c', Medium: '#a16207', Low: '#15803d', Advisory: '#475569' };
const STATUS_COLORS = { Gap: '#b91c1c', Partial: '#a16207', Addressed: '#15803d' };
const VERDICT_COLORS = { not_yet: '#b91c1c', go_with_conditions: '#c2410c', go: '#15803d' };
// Blast-radius bands reuse the risk colours.
const BAND_LEVEL = { Low: 'Low', Moderate: 'Medium', High: 'High', Severe: 'Critical' };
const badge = (level) => `<span class="badge" style="background:${COLORS[level] ?? '#475569'}">${esc(level)}</span>`;
const list = (items) => (items?.length ? items.map(esc).join(', ') : '—');

const SHORT = {
  jurisdictions: 'Jurisdictions', hosting: 'Model runs on', hostingCountry: 'Inference countries',
  dataSensitivity: 'Highest data classification', actions: 'Agent can', users: 'Used by', autonomy: 'Human oversight',
};

export function buildReportHtml({ profile = {}, controls = [], result, path, register, brief, aiRmf, inputs, controlsData, coverage = [], whatIf = null }) {
  const v = result.verdict;
  const date = new Date().toISOString().slice(0, 10);
  const t = result.trifecta;
  const bc = result.blastRadius.components;
  const count = (p) => result.threats.filter((x) => x.priority === p).length;


  const optionLabel = (input, v) => input.options?.find((o) => o.value === v)?.label ?? v;
  const answerText = (input) => {
    const v = profile[input.id];
    const vals = Array.isArray(v) ? v : v ? [v] : [];
    return vals.length ? vals.map((x) => esc(optionLabel(input, x))).join('<br>') : '<span class="muted">—</span>';
  };
  const controlTitles = controls.map((id) => esc(controlsData?.controls.find((c) => c.id === id)?.title ?? id));
  const inputById =Object.fromEntries((inputs?.sections ?? []).flatMap((sec) => sec.inputs).map((i) => [i.id, i]));
  const SUMMARY = ['jurisdictions', 'hosting', 'hostingCountry', 'dataSensitivity', 'actions', 'users', 'autonomy'];
  const summaryHtml = inputs ? `<h2 id="scope">What was assessed</h2>
    <table class="scope">${SUMMARY.map((id) => `<tr><td class="k">${esc(SHORT[id])}</td><td>${answerText(inputById[id]).replace(/<br>/g, ', ')}</td></tr>`).join('')}
      ${result.adjustments?.length ? `<tr><td class="k">Adjusted for scoring</td><td>${result.adjustments.map(esc).join('<br>')}</td></tr>` : ''}
      <tr><td class="k">Controls in place</td><td>${controlTitles.length ? controlTitles.join('; ') : '<span class="muted">None</span>'}</td></tr>
    </table>
    <p class="muted small">Every answer and control is listed in the <a href="#appendix-design">appendix</a>.</p>` : '';

  const designHtml = inputs ? `<h2 id="appendix-design" class="newpage">Appendix A — Design as assessed${whatIf ? ' (what-if)' : ''}</h2>
    <p class="muted">Every answer this verdict is based on. If the deployment changes, re-assess.</p>
    <table>${inputs.sections.flatMap((sec) => sec.inputs)
      .filter((i) => !['orgName', 'agentName', 'purpose'].includes(i.id))
      .map((i) => `<tr><td style="width:40%">${esc(i.label)}</td><td>${answerText(i)}</td></tr>`).join('')}
      <tr><td>Controls in place</td><td>${controlTitles.length ? controlTitles.join('<br>') : '<span class="muted">None</span>'}</td></tr>
      ${result.notApplicable?.length ? `<tr><td>Ticked but not applicable (not counted)</td><td>${result.notApplicable.map((id) => {
        const c = controlsData?.controls.find((x) => x.id === id);
        return `${esc(c?.title ?? id)}${c?.appliesNote ? ` <span class="muted">— ${esc(c.appliesNote)}</span>` : ''}`;
      }).join('<br>')}</td></tr>` : ''}
    </table>` : '';

  const sections = [
    ['verdict', 'Verdict'],
    ...(path?.steps?.length ? [['path', 'Path to Go']] : []),
    ...(brief?.decision ? [['brief', 'Brief']] : []),
    ['findings', 'Regulatory findings'], ['register', 'Risk register'], ['gaps', 'Control gaps'],
    ...(inputs ? [['appendix-design', 'Appendix A: Design']] : []), ['appendix-rmf', 'Appendix B: AI RMF coverage'],
  ];
  const contentsHtml = `<nav class="contents"><strong>Contents</strong> ${sections.map(([id, label]) => `<a href="#${id}">${label}</a>`).join(' · ')}</nav>`;

  const pathHtml = path?.steps?.length
    ? `<h2 id="path">Path to Go</h2>
      ${path.architecture.map((a) => `<p><strong>Architecture change:</strong> ${esc(a.change)} <span class="muted">(${esc(a.id)})</span></p>`).join('')}
      <table><tr><th>Target</th><th>Add these controls</th><th>Also required</th></tr>
      ${path.steps.map((s) => `<tr><td>${esc(s.label)}</td>
        <td>${!s.controls ? 'Not reachable with controls alone'
          : !s.controls.length ? 'No new controls needed'
          : (s.controls.some((c) => c.fromPrevious) ? '<em>Everything under Go with conditions, plus:</em><br>' : '')
            + s.controls.filter((c) => !c.fromPrevious).map((c) => c.change ? `${esc(c.change)} <span class="muted">(architecture change)</span>` : esc(c.title)).join('<br>')}</td>
        <td>${s.approvals?.length ? s.approvals.map((a) => esc(a.action)).join('<br>') : '—'}</td></tr>`).join('')}
      </table>`
    : '';

  // Chrome writes <title> into the PDF's Title metadata, which viewers show in the tab.
  // Without it the title is "about:blank".
  const title = `${whatIf ? 'What-if — ' : ''}AI Agent Risk Assessment — ${profile.orgName || 'Organisation'} — ${profile.agentName || 'Agent'}`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
    body { font-family: Segoe UI, Arial, sans-serif; color: #0f172a; font-size: 10.5pt; margin: 0 14mm; }
    h1 { font-size: 18pt; margin: 0 0 2mm; } h2 { font-size: 12.5pt; margin: 7mm 0 2mm; border-bottom: 1px solid #cbd5e1; padding-bottom: 1mm; page-break-after: avoid; }
    thead { display: table-header-group; }
    .muted { color: #64748b; } .verdict { padding: 4mm 5mm; border-radius: 2mm; color: #fff; margin: 4mm 0; }
    .verdict b { font-size: 16pt; } .kpis { display: flex; gap: 6mm; margin: 2mm 0 4mm; }
    .kpi { border: 1px solid #cbd5e1; border-radius: 2mm; padding: 2mm 4mm; flex: 1; display: flex; flex-direction: column; gap: 1mm; }
    .kpi b { display: block; font-size: 13pt; } .kpi.wide { flex: 1.6; } .kpi.alarm { border-color: #b91c1c; border-left-width: 1.2mm; }
    .legs { display: flex; flex-wrap: wrap; gap: 1mm; } .leg { font-size: 7.5pt; border: 1px solid #cbd5e1; color: #64748b; border-radius: 3mm; padding: 0.3mm 2mm; }
    .leg.on { border-color: #b91c1c; color: #b91c1c; background: #fef2f2; } .legs.blocked .leg.on { border-color: #94a3b8; color: #334155; background: #f1f5f9; } .counts { display: grid; grid-template-columns: auto auto; gap: 1.5mm 5mm; justify-content: start; margin-top: 1mm; }
    .cnt { display: flex; align-items: center; gap: 1.5mm; } .cnt .badge { min-width: 13mm; text-align: center; } .cnt b { font-size: 10pt; } .trifecta-def { margin: 0 0 3mm; }
    table { width: 100%; border-collapse: collapse; margin: 2mm 0; font-size: 9pt; page-break-inside: auto; }
    tr { page-break-inside: avoid; } th, td { border: 1px solid #e2e8f0; padding: 1.5mm 2mm; text-align: left; vertical-align: top; }
    th { background: #f1f5f9; } .badge { color: #fff; border-radius: 1mm; padding: 0.3mm 1.5mm; font-size: 8pt; white-space: nowrap; }
    .scope { width: auto; min-width: 60%; font-size: 9.5pt; } .scope td { border: 0; border-bottom: 1px solid #eef2f6; padding: 1mm 3mm 1mm 0; }
    .scope .k { color: #64748b; white-space: nowrap; width: 1%; padding-right: 6mm; }
    .contents { margin: 4mm 0 2mm; padding: 2mm 3mm; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 2mm; font-size: 9pt; }
    .contents a { color: #1d4ed8; text-decoration: none; } a { color: #1d4ed8; }
    .small { font-size: 8.5pt; } .newpage { page-break-before: always; }
    .tid { font-family: Consolas, monospace; font-size: 7.5pt; color: #64748b; white-space: nowrap; }
    .whatif { border: 1.2mm solid #7c3aed; background: #f5f3ff; padding: 3mm 4mm; margin: 3mm 0; border-radius: 2mm; }
    .whatif ul { margin: 1.5mm 0; padding-left: 6mm; }
    .brief { line-height: 1.5; } .brief li { margin-bottom: 1.5mm; } .brief ul, .brief ol { margin: 0; padding-left: 6mm; }
    .brief h3 { font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; margin: 4mm 0 1.5mm; }
    .brief-decision { font-size: 11pt; margin: 0; padding: 2.5mm 4mm; background: #f8fafc; border-left: 1.2mm solid #1d4ed8; } .foot { font-size: 8pt; color: #64748b; margin-top: 8mm; }
  </style></head><body>
    <h1>${whatIf ? 'What-if assessment' : 'AI Agent Risk Assessment'}</h1>
    ${whatIf ? `<div class="whatif"><strong>What-if, not the current state.</strong> This report assumes these changes, which are not yet made:
      <ul>${whatIf.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
      "Controls in place" below includes the assumed controls. Re-assess the actual design before anyone relies on this report.</div>` : ''}
    <div class="muted">${esc(profile.orgName || 'Organisation')} · ${esc(profile.agentName || 'Agent')} · ${date}</div>
    <p>${esc(profile.purpose)}</p>

    <div id="verdict" class="verdict" style="background:${VERDICT_COLORS[v.decision]}"><b>${esc(v.label)}</b></div>
    <div class="kpis">
      <div class="kpi"><span class="muted">Blast radius</span><b>${result.blastRadius.score}/100 <span class="badge" style="background:${COLORS[BAND_LEVEL[result.blastRadius.band]]}">${esc(result.blastRadius.band)}</span></b>
        <span class="muted small">actions ${bc.action} × autonomy ${bc.autonomy} × data ${bc.data}</span>
        <span class="muted small">Worst case if the agent is compromised, before controls count.</span>
        ${result.blastRadius.lever ? `<span class="small">Biggest single reduction: ${esc(result.blastRadius.lever.change)} (${result.blastRadius.score} → ${result.blastRadius.lever.score}).</span>` : ''}</div>
      <div class="kpi wide${t.present && !t.broken ? ' alarm' : ''}"><span class="muted">Lethal trifecta</span><b>${esc(t.status)}</b>
        <span class="small">${esc(t.explanation)}</span>
        ${t.broken ? `<span class="small">Blocked by: ${list(t.breakerLabels)}</span>` : ''}
        <span class="legs${t.broken ? ' blocked' : ''}">${[['privateData', 'Private data'], ['untrustedContent', 'Untrusted content'], ['externalChannel', 'Outbound channel']]
          .map(([k, l]) => `<span class="leg${t.legs[k] ? ' on' : ''}">${l}${t.legs[k] ? '' : ' (absent)'}</span>`).join('')}</span></div>
      <div class="kpi"><span class="muted">Threats by residual risk</span>
        <span class="counts">${['Critical', 'High', 'Medium', 'Low'].map((p) => `<span class="cnt">${badge(p)}<b>${count(p)}</b></span>`).join('')}</span></div>
    </div>
    <p class="muted small trifecta-def">${esc(t.definition)} ${esc(t.reference)}</p>
    ${summaryHtml}
    ${contentsHtml}
    ${v.blockers.length ? `<h2>Blockers</h2><ul>${v.blockers.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}
    ${v.conditions.length ? `<h2>Go-live conditions</h2><ul>${v.conditions.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
    ${pathHtml}

    ${brief?.decision ? `<h2 id="brief">Risk committee brief</h2><div class="brief">
      <p class="brief-decision">${esc(brief.decision)}</p>
      <h3>Why</h3><ul>${brief.reasons.map((r) => `<li><strong>${esc(r.headline)}.</strong> ${esc(r.detail)}</li>`).join('')}</ul>
      <h3>${v.decision === 'go' ? 'Recommended before go-live' : 'Before go-live'}</h3><ol>${brief.actions.map((a) => `<li>${esc(a)}</li>`).join('')}</ol></div>
      <div class="muted" style="font-size:8pt">Written by Claude from the assessment above; adds no findings of its own.</div>` : ''}

    <h2 id="findings">Regulatory and residency findings</h2>
    <p class="muted small">Finding IDs (KW-01 …) are this tool's own labels, not regulators' clause numbers. Cite the regulation and clause in each finding's source line.</p>
    ${result.residency.length ? `<table><tr><th>Finding</th><th>Level</th><th>Detail</th><th>Source</th></tr>
      ${result.residency.map((r) => `<tr><td>${esc(r.title)}</td><td>${badge(r.level)}</td><td>${esc(r.finding)}<br><em>${esc(r.remediation)}</em></td>
        <td>${r.sources.map((s) => `${esc(s.instrument)} — ${esc(s.clause)}`).join('<br>')}</td></tr>`).join('')}</table>`
      : '<p class="muted">No findings for the selected jurisdictions.</p>'}
    ${result.pendingInstruments.length ? `<p class="muted">Not assessed (not yet verified): ${list(result.pendingInstruments.map((p) => p.instrument))}</p>` : ''}

    <h2 id="register">Risk register</h2>
    <p class="muted small">Threat IDs (T-…) are this tool's own labels, used to cross-reference blockers, gaps, and the CSV. The standard references are the OWASP and MITRE ATLAS IDs.</p>
    <table><tr><th>Risk</th><th>Inherent</th><th>Residual</th><th>Treatment</th><th>OWASP</th><th>ATLAS</th><th>NIST AI RMF</th></tr>
    ${register.map((r) => `<tr><td><strong>${esc(r.risk)}</strong> <span class="tid">${esc(r.id)}</span><br><span class="muted">${esc(r.description)}</span></td>
      <td>${badge(r.inherent)}</td><td>${badge(r.residual)}</td><td>${r.treatment.length ? r.treatment.map(esc).join('<br>') : 'Controls in place'}</td>
      <td>${list([...r.owaspLlm, ...r.owaspAgentic])}</td><td>${list(r.atlas)}</td><td>${list(r.aiRmf)}</td></tr>`).join('')}
    </table>

    <h2 id="gaps">Control gaps</h2>
    <table><tr><th>Control</th><th>Priority</th><th>Timeline</th><th>Reduces</th></tr>
    ${result.gaps.map((g) => `<tr><td><strong>${esc(g.control.setBy ? g.control.setBy.change : g.control.title)}</strong><br><span class="muted">${esc(g.control.description)}</span></td>
      <td>${badge(g.priority)}</td><td>${g.control.setBy ? 'architecture change' : esc(g.control.timeline)}</td>
      <td>${g.threats.map((id) => `${esc(result.threats.find((t) => t.id === id)?.title ?? id)} <span class="tid">${esc(id)}</span>`).join('<br>')}</td></tr>`).join('')}
    </table>

    ${designHtml}

    <h2 id="appendix-rmf">Appendix B — NIST AI RMF coverage</h2>
    <p class="muted">Each NIST AI RMF subcategory that the controls for this design's risks map to. Rows are NIST AI RMF subcategories, not controls; one control can count towards several. <strong>Gap</strong>: none of those controls are in place. <strong>Partial</strong>: some are. <strong>Addressed</strong>: all are.</p>
    ${coverage.length ? `<table><thead><tr><th>Subcategory</th><th>Status</th><th>Risks</th><th>In place</th><th>Missing</th></tr></thead>
      ${coverage.map((c) => `<tr><td><strong>${esc(c.id)}</strong><br><span class="muted">${esc(c.text)}</span></td>
        <td><span class="badge" style="background:${STATUS_COLORS[c.status]}">${esc(c.status)}</span></td>
        <td>${c.risks.length}</td><td>${c.inPlace.length ? c.inPlace.map(esc).join('<br>') : '—'}</td>
        <td>${c.missing.length ? c.missing.map(esc).join('<br>') : '—'}</td></tr>`).join('')}</table>`
      : '<p class="muted">No risks triggered, so no subcategories to report.</p>'}
    <p class="muted small">This report also evidences ${aiRmf.reportEvidence.map((e) => `${esc(e.subcategories.join(' / '))} (${esc(e.output.toLowerCase())})`).join('; ')}.</p>

    <div class="foot">Deterministic assessment: the same inputs always give the same verdict. Threat IDs verified against OWASP Top 10 for LLM Applications (2025),
    OWASP Top 10 for Agentic Applications (2026), and MITRE ATLAS (2026.09). AI RMF mappings are this tool's judgement.
    This is a design-stage risk assessment, not a legal opinion or certification.</div>
  </body></html>`;
}
