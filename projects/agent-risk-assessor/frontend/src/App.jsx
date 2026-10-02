import { useEffect, useState } from 'react';
import Field from './components/Field.jsx';
import ControlsStep from './components/ControlsStep.jsx';
import Results from './components/Results.jsx';

const STEPS = ['Profile', 'Architecture', 'Controls', 'Results'];
// Only the free-text profile fields are optional. Every multi-select needs an answer, with an
// explicit "None" where nothing applies, so a skipped question can't silently drop findings.
const OPTIONAL = new Set(['orgName', 'agentName', 'purpose']);
const STORE = 'agent-risk-assessor:v1';

// sessionStorage: survives a refresh, clears when the tab closes — no leakage between prospects.
function loadState() {
  try { return JSON.parse(sessionStorage.getItem(STORE)) ?? {}; } catch { return {}; }
}

export default function App() {
  const saved = loadState();
  const [meta, setMeta] = useState(null);
  const [step, setStep] = useState(saved.step ?? 0);
  const [answers, setAnswers] = useState(saved.answers ?? {});
  const [controls, setControls] = useState(saved.controls ?? []);
  // A what-if sits on top of the actual design and never overwrites it. Leaving results or
  // editing the actual design discards it.
  const [whatIf, setWhatIf] = useState(saved.whatIf ?? null);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all(['inputs', 'controls', 'scenarios', 'health'].map((p) => fetch(`/api/${p}`).then((r) => r.json())))
      .then(([inputs, controlsData, scenarios, health]) => setMeta({ inputs, controlsData, scenarios, health }))
      .catch(() => setError('Backend not reachable on port 3006.'));
  }, []);

  useEffect(() => {
    try { sessionStorage.setItem(STORE, JSON.stringify({ step, answers, controls, whatIf })); } catch { /* private mode */ }
  }, [step, answers, controls, whatIf]);

  // A new step, or entering/leaving a what-if, is a new page: start it at the top (the button that
  // got you here is usually at the bottom of the previous one, and the what-if banner sits above the verdict).
  const viewKey = `${step}:${whatIf?.changes.length ?? 0}`;
  useEffect(() => { window.scrollTo({ top: 0 }); }, [viewKey]);

  if (error) return <div className="shell"><p className="error">{error}</p></div>;
  if (!meta) return <div className="shell"><p className="muted">Loading…</p></div>;

  const sections = meta.inputs.sections;
  const profile = sections.filter((s) => s.id === 'profile');
  const architecture = sections.filter((s) => s.id !== 'profile');
  const missing = (secs) =>
    secs.flatMap((s) => s.inputs).filter((i) => !OPTIONAL.has(i.id)).filter((i) => {
      const v = answers[i.id];
      return Array.isArray(v) ? v.length === 0 : !v;
    });

  const set = (id, value) => { setWhatIf(null); setAnswers((a) => ({ ...a, [id]: value })); };
  const setActualControls = (c) => { setWhatIf(null); setControls(c); };
  const goStep = (i) => { if (i !== 3) setWhatIf(null); setStep(i); };
  const loadPreset = (s) => { setWhatIf(null); setAnswers(s.answers); setControls(s.controls); setStep(3); };
  const reset = () => { setWhatIf(null); setAnswers({}); setControls([]); setStep(0); };

  // Applies a Path-to-Go step to the current view (actual, or an existing what-if) as a new what-if.
  const applyPath = (pathStep, architecture) => {
    const base = whatIf ?? { answers, controls, changes: [] };
    // A control derived from an Architecture answer (c.fix) changes that answer instead.
    const changes = [
      ...base.changes,
      ...architecture.map((a) => a.change),
      ...pathStep.controls.filter((c) => !base.controls.includes(c.id))
        .map((c) => (c.fix ? c.change : `Control in place: ${c.title}`)),
    ];
    setWhatIf({
      answers: Object.assign({ ...base.answers }, ...architecture.map((a) => a.fix ?? {}), ...pathStep.controls.map((c) => c.fix ?? {})),
      controls: [...new Set([...base.controls, ...pathStep.controls.map((c) => c.id)])],
      changes: [...new Set(changes)],
    });
  };
  const view = whatIf ?? { answers, controls };

  // Answers that contradict each other. Blocking ones must be fixed before moving on; the others
  // explain how the engine resolves them (the engine applies the same rules in normaliseAnswers).
  const optLabel = (id, v) => meta.inputs.sections.flatMap((x) => x.inputs).find((i) => i.id === id)?.options.find((o) => o.value === v)?.label ?? v;
  const list = (v) => [v ?? []].flat();
  const conflicts = {};
  const floorTypes = list(answers.dataTypes).filter((t) => ['personal', 'health', 'financial', 'credentials'].includes(t));
  if (floorTypes.length && ['1', '2'].includes(String(answers.dataSensitivity)))
    conflicts.dataSensitivity = { block: false, text: `${floorTypes.map((t) => optLabel('dataTypes', t)).join(', ')} is at least Level 3, so this design is scored as Level 3. Pick Level 3 or 4 to match.` };
  if (list(answers.hosting).includes('vendor_api') && list(answers.supplyChain).includes('none'))
    conflicts.supplyChain = { block: true, text: `Profile says the model runs on a model vendor's API, which is a component from outside the organisation. Pick "Commercial model API" instead of None.` };
  const blocking = Object.entries(conflicts).filter(([, c]) => c.block).map(([id]) => id);

  const gate = [missing(profile), missing(architecture), []];
  const toFix = [[], blocking, []];
  const canOpen = (i) => gate.slice(0, i).every((m) => m.length === 0) && toFix.slice(0, i).every((m) => m.length === 0);

  return (
    <div className="shell">
      <header className="top">
        <div>
          <h1>Agent Risk Assessor</h1>
          <p className="muted">Can this AI agent go to production? Threats, GCC residency, and a verdict a risk committee can sign against.</p>
        </div>
        <button className="ghost" onClick={reset}>New assessment</button>
      </header>

      <nav className="steps">
        {STEPS.map((label, i) => (
          <button key={label} className={i === step ? 'on' : ''} disabled={!canOpen(i)} onClick={() => goStep(i)}>
            <span>{i + 1}</span> {label}
          </button>
        ))}
      </nav>

      {step === 0 && (
        <section className="presets card">
          <strong>Demo presets</strong>
          <span className="muted"> — fictional organisations, one click to results</span>
          <div className="preset-row">
            {meta.scenarios.scenarios.map((s) => (
              <button key={s.id} className="chip" onClick={() => loadPreset(s)}>{s.label}</button>
            ))}
          </div>
        </section>
      )}

      {(step === 0 || step === 1) && (
        <>
          {(step === 0 ? profile : architecture).map((sec) => (
            <section key={sec.id} className="card">
              <h2>{sec.label}</h2>
              {sec.inputs.map((input) => (
                <Field key={input.id} input={input} value={answers[input.id]} onChange={(v) => set(input.id, v)} warning={conflicts[input.id]?.text} />
              ))}
            </section>
          ))}
          <Footer
            missing={gate[step].length}
            toFix={toFix[step].length}
            onBack={step > 0 ? () => goStep(step - 1) : null}
            onNext={() => goStep(step + 1)}
          />
        </>
      )}

      {step === 2 && (
        <>
          <ControlsStep data={meta.controlsData} value={controls} onChange={setActualControls} answers={answers} />
          <Footer missing={0} onBack={() => goStep(1)} onNext={() => goStep(3)} nextLabel="Assess" />
        </>
      )}

      {step === 3 && (
        <Results
          answers={view.answers} controls={view.controls} whatIf={whatIf?.changes ?? null}
          narrative={meta.health.narrative} onApply={applyPath}
          onExitWhatIf={() => setWhatIf(null)} onEditControls={() => goStep(2)}
          controlTitles={Object.fromEntries(meta.controlsData.controls.map((c) => [c.id, c.title]))}
        />
      )}
    </div>
  );
}

function Footer({ missing, toFix = 0, onBack, onNext, nextLabel = 'Next' }) {
  return (
    <div className="footer">
      {onBack ? <button className="ghost" onClick={onBack}>Back</button> : <span />}
      <div>
        {missing > 0 && <span className="muted">{missing} question{missing > 1 ? 's' : ''} left </span>}
        {toFix > 0 && <span className="muted">{toFix} answer{toFix > 1 ? 's' : ''} to fix (see the note) </span>}
        <button className="primary" disabled={missing > 0 || toFix > 0} onClick={onNext}>{nextLabel}</button>
      </div>
    </div>
  );
}
