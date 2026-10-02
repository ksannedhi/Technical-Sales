import { useEffect, useState } from 'react';

// Which ticked controls actually count comes from the engine (/api/assess), not from rules copied
// here: a control with `setBy` follows an Architecture answer and is read-only, and a control with
// `appliesWhen` that doesn't fit this design is flagged as not applicable.
export default function ControlsStep({ data, value, onChange, answers }) {
  const has = new Set(value);
  const toggle = (id) => onChange(has.has(id) ? value.filter((x) => x !== id) : [...value, id]);
  const [engine, setEngine] = useState(null);

  useEffect(() => {
    let live = true;
    fetch('/api/assess', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers, controls: value }) })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => live && d && setEngine({ inPlace: new Set(d.result.controlsInPlace), na: new Set(d.result.notApplicable) }))
      .catch(() => {});
    return () => { live = false; };
  }, [answers, value]);

  const derivedOn = (c) => engine?.inPlace.has(c.id) ?? false;
  const checked = (c) => (c.setBy ? derivedOn(c) : has.has(c.id));

  return (
    <>
      <section className="card">
        <h2>Controls in place</h2>
        <p className="muted">Tick only what is implemented today, not what is planned. Each control in place lowers the residual risk of the threats it mitigates by one level.</p>
      </section>
      {data.groups.map((g) => (
        <section key={g.id} className="card">
          <h3>{g.label}</h3>
          {data.controls.filter((c) => c.group === g.id).map((c) => (
            <label key={c.id} className={`control ${checked(c) ? 'on' : ''}`}>
              <input type="checkbox" checked={checked(c)} disabled={!!c.setBy} onChange={() => toggle(c.id)} />
              <span>
                <strong>{c.title}</strong>
                {c.id === 'audit_logging' && <span className="tag">Required for Go</span>}
                {has.has(c.id) && engine?.na.has(c.id) && <span className="tag warn">Not applicable to this design</span>}
                <span className="muted block">{c.description}</span>
                {c.setBy && (
                  <span className="small block">
                    Set by your Architecture answer to "{c.setBy.question}": in place only when {c.setBy.rule}.
                    {engine && (derivedOn(c) ? ' Your answers meet this.' : ' Your answers don’t meet this yet.')}
                  </span>
                )}
                {has.has(c.id) && engine?.na.has(c.id) && (
                  <span className="small block">Your design doesn't need this, so it counts for nothing in the assessment.</span>
                )}
              </span>
            </label>
          ))}
        </section>
      ))}
    </>
  );
}
