import { useEffect, useState } from 'react';

const VERDICT_CLASS = { not_yet: 'v-no', go_with_conditions: 'v-cond', go: 'v-go' };
const FLAG_LABELS = {
  untrustedContent: 'Reads untrusted content', sensitiveData: 'Reaches sensitive data',
  externalChannel: 'Has an outbound channel', highImpactAction: 'Can take high-impact actions',
  trifecta: 'Lethal trifecta', personalData: 'Handles personal data',
};

const post = (url, body) =>
  fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

async function download(url, body, fallbackName) {
  const res = await post(url, body);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || `HTTP ${res.status}`);
  const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '')?.[1] || fallbackName;
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(await res.blob()), download: name });
  a.click();
  URL.revokeObjectURL(a.href);
}

const Badge = ({ level }) => <span className={`badge b-${String(level).toLowerCase()}`}>{level}</span>;

export default function Results({ answers, controls, whatIf, narrative, onApply, onExitWhatIf, onEditControls }) {
  const [data, setData] = useState(null);
  const [brief, setBrief] = useState({ state: narrative ? 'loading' : 'off', text: null });
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(null);
  const [exportError, setExportError] = useState(null);

  useEffect(() => {
    let live = true;
    setData(null);
    post('/api/assess', { answers, controls }).then((r) => r.json()).then((d) => live && setData(d));
    if (narrative) {
      setBrief({ state: 'loading', text: null });
      post('/api/brief', { answers, controls })
        .then((r) => r.json())
        .then((d) => live && setBrief(d.brief ? { state: 'ok', text: d.brief } : { state: 'failed', text: null }))
        .catch(() => live && setBrief({ state: 'failed', text: null }));
    }
    return () => { live = false; };
  }, [answers, controls, narrative]);

  if (!data) return <p className="muted">Assessing…</p>;
  const { result, path, register, coverage = [] } = data;
  const v = result.verdict;
  const t = result.trifecta;
  const counts = ['Critical', 'High', 'Medium', 'Low'].map((p) => [p, result.threats.filter((x) => x.priority === p).length]);

  const exportFile = async (kind) => {
    setBusy(kind); setExportError(null);
    try {
      if (kind === 'pdf') await download('/api/export/pdf', { answers, controls, whatIf, brief: brief.text }, 'agent-risk-assessment.pdf');
      else await download('/api/export/register', { answers, controls, whatIf }, 'ai-risk-register.csv');
    } catch (e) { setExportError(e.message); }
    setBusy(null);
  };

  return (
    <div className="results">
      {whatIf && (
        <section className="whatif-banner" role="status">
          <div>
            <strong>What-if, not your actual design.</strong> These results assume changes that haven't been made:
            <ul>{whatIf.map((c) => <li key={c}>{c}</li>)}</ul>
            <span className="small">Exports from this view are titled and labelled as what-if.</span>
          </div>
          <button className="primary" onClick={onExitWhatIf}>Back to actual design</button>
        </section>
      )}
      <section className={`verdict ${VERDICT_CLASS[v.decision]}`}>
        <div>
          <span className="eyebrow">{whatIf ? 'What-if verdict' : 'Production-readiness verdict'}</span>
          <div className="verdict-label">{v.label}</div>
          <span>{answers.agentName || 'Agent'} · {answers.orgName || 'Organisation'}</span>
        </div>
        <div className="exports">
          <button onClick={() => exportFile('pdf')} disabled={!!busy}>{busy === 'pdf' ? 'Building PDF…' : 'Export PDF'}</button>
          <button onClick={() => exportFile('csv')} disabled={!!busy}>Risk register (CSV)</button>
        </div>
      </section>
      {exportError && <p className="error">Export failed: {exportError}</p>}

      <div className="kpis">
        <div className="card kpi">
          <span className="muted">Blast radius</span>
          <b>{result.blastRadius.score}<small>/100</small></b>
          <span className="muted small">actions {result.blastRadius.components.action} × autonomy {result.blastRadius.components.autonomy} × data {result.blastRadius.components.data}</span>
        </div>
        <div className={`card kpi ${t.present && !t.broken ? 'alarm' : ''}`}>
          <span className="muted">Lethal trifecta</span>
          <b>{t.present ? (t.broken ? 'Broken' : 'Unbroken') : 'Not present'}</b>
          {t.present && t.broken && <span className="small">Broken by: {t.breakerLabels.join('; ')}</span>}
          <span className="legs">
            {[['privateData', 'Private data'], ['untrustedContent', 'Untrusted content'], ['externalChannel', 'Outbound channel']].map(([k, l]) => (
              <span key={k} className={t.legs[k] ? 'leg on' : 'leg'}>{l}</span>
            ))}
          </span>
        </div>
        <div className="card kpi">
          <span className="muted">Threats by residual risk</span>
          <span className="counts">{counts.map(([p, n]) => <span key={p}><Badge level={p} /> {n}</span>)}</span>
        </div>
      </div>

      {path.steps.length > 0 && (
        <section className="card">
          <h2>Path to Go</h2>
          <p className="muted">Fewest changes that move the verdict up. <strong>Try this path</strong> shows the result as a what-if; your actual design stays unchanged.</p>
          {path.architecture.map((a) => (
            <p key={a.id} className="arch"><strong>Architecture change first:</strong> {a.change} <span className="muted">({a.id} — {a.title})</span></p>
          ))}
          <div className="path">
            {path.steps.map((s) => (
              <div key={s.target} className="card inner">
                <h3>To reach {s.label}</h3>
                {s.controls ? (
                  <>
                    {s.controls.length === 0 && <p className="muted">No new controls needed.</p>}
                    <ol>{s.controls.map((c) => <li key={c.id}>{c.title} <span className="muted small">({c.timeline} term)</span></li>)}</ol>
                    {s.approvals.length > 0 && (
                      <p className="small"><strong>Plus approvals:</strong> {s.approvals.map((a) => a.action).join(' ')}</p>
                    )}
                    {s.reachable && (s.controls.length > 0 || path.architecture.length > 0) && (
                      <button className="ghost" onClick={() => onApply(s, path.architecture)}>Try this path</button>
                    )}
                  </>
                ) : <p className="muted">Not reachable with controls alone.</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {(v.blockers.length > 0 || v.conditions.length > 0) && (
        <section className="card two">
          {v.blockers.length > 0 && <div><h2>Blockers</h2><ul>{v.blockers.map((b) => <li key={b}>{b}</li>)}</ul></div>}
          {v.conditions.length > 0 && <div><h2>Go-live conditions</h2><ul>{v.conditions.map((c) => <li key={c}>{c}</li>)}</ul></div>}
        </section>
      )}

      <section className="card">
        <h2>Risk committee brief</h2>
        {brief.state === 'off' && <p className="muted">Add ANTHROPIC_API_KEY to <code>.env</code> to generate a plain-language brief. Everything else works without it.</p>}
        {brief.state === 'loading' && <p className="muted">Writing the brief…</p>}
        {brief.state === 'failed' && <p className="muted">The brief couldn't be generated this time. The assessment above is unaffected.</p>}
        {brief.state === 'ok' && (
          <div className="brief">
            <p className="brief-decision">{brief.text.decision}</p>
            <h3>Why</h3>
            <ul className="brief-reasons">
              {brief.text.reasons.map((r, i) => <li key={i}><strong>{r.headline}.</strong> {r.detail}</li>)}
            </ul>
            <h3>Before go-live</h3>
            <ol className="brief-actions">{brief.text.actions.map((a, i) => <li key={i}>{a}</li>)}</ol>
            <p className="muted small">Written by Claude from the assessment on this page. It adds no findings of its own.</p>
          </div>
        )}
      </section>

      <section className="card">
        <h2>Regulatory and residency findings</h2>
        {result.residency.length === 0 && <p className="muted">No findings for the selected jurisdictions.</p>}
        {result.residency.map((r) => (
          <div key={r.id} className="finding">
            <div><Badge level={r.level} /> <strong>{r.title}</strong> <span className="muted">({r.id})</span></div>
            <p>{r.finding}</p>
            <p className="small"><strong>Action:</strong> {r.remediation}</p>
            <p className="muted small">{r.sources.map((s) => `${s.instrument} — ${s.clause}`).join(' · ')}</p>
          </div>
        ))}
        {result.pendingInstruments.length > 0 && (
          <p className="muted small">Not assessed yet (not verified): {result.pendingInstruments.map((p) => p.instrument).join(', ')}</p>
        )}
      </section>

      <section className="card">
        <h2>Threat register</h2>
        <p className="muted">Click a threat to see what triggered it and how it maps to OWASP, MITRE ATLAS, and NIST AI RMF.</p>
        {result.threats.length === 0 && <p className="muted">No threats triggered by this design.</p>}
        {result.threats.map((th) => {
          const reg = register.find((r) => r.id === th.id);
          return (
            <div key={th.id} className={`threat ${open === th.id ? 'open' : ''}`}>
              <button className="threat-head" onClick={() => setOpen(open === th.id ? null : th.id)} aria-expanded={open === th.id}>
                <Badge level={th.priority} />
                <span className="grow">{th.title}</span>
                <span className="muted small">inherent {['', 'Low', 'Medium', 'High', 'Critical'][th.severity]}</span>
              </button>
              {open === th.id && (
                <div className="threat-body">
                  <p>{th.description}</p>
                  <p className="small"><strong>Triggered by:</strong> {th.triggeredBy.map((x) => x.flag ? FLAG_LABELS[x.flag] : `${x.label}: ${x.values.join(', ')}`).join(' · ')}</p>
                  <p className="small"><strong>In place:</strong> {th.controlsPresent.length ? th.controlsPresent.join(', ') : 'none'} · <strong>Missing:</strong> {th.controlsMissing.join(', ') || 'none'}</p>
                  <p className="small mono">{[...th.owaspLlm, ...th.owaspAgentic, ...th.atlas].join(' · ')}</p>
                  <p className="small mono">NIST AI RMF: {reg?.aiRmf.join(' · ')}</p>
                </div>
              )}
            </div>
          );
        })}
      </section>

      <section className="card">
        <h2>Control gaps</h2>
        <table>
          <thead><tr><th>Control</th><th>Priority</th><th>Timeline</th><th>Reduces</th></tr></thead>
          <tbody>
            {result.gaps.map((g) => (
              <tr key={g.control.id}>
                <td><strong>{g.control.title}</strong><br /><span className="muted small">{g.control.description}</span></td>
                <td><Badge level={g.priority} /></td>
                <td>{g.control.timeline}</td>
                <td className="mono small">{g.threats.join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="ghost" onClick={onEditControls}>{whatIf ? 'Edit actual controls' : 'Change controls'}</button>
        <span className="muted small"> Goes back to step 3 to update what is actually in place, then re-assesses.</span>
      </section>

      <section className="card">
        <h2>NIST AI RMF coverage</h2>
        <p className="muted">Each AI RMF subcategory that the controls for this design's risks map to. <strong>Gap</strong>: none in place. <strong>Partial</strong>: some. <strong>Addressed</strong>: all.</p>
        {coverage.length === 0 ? <p className="muted">No risks triggered.</p> : (
          <table>
            <thead><tr><th>Subcategory</th><th>Status</th><th>Risks</th><th>Missing</th></tr></thead>
            <tbody>
              {coverage.map((c) => (
                <tr key={c.id}>
                  <td><strong className="mono">{c.id}</strong><br /><span className="muted small">{c.text}</span></td>
                  <td><span className={`badge s-${c.status.toLowerCase()}`}>{c.status}</span></td>
                  <td>{c.risks.length}</td>
                  <td className="small">{c.missing.length ? c.missing.join('; ') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
