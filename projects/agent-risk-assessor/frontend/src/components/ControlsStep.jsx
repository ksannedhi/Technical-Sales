// A control with `setBy` restates an Architecture answer, so it is read-only here and follows that
// answer (the engine ignores its checkbox). Same rule as effectiveControls() in the engine.
const derivedHolds = (c, answers) => {
  const v = [answers[c.setBy.field] ?? []].flat();
  return v.length > 0 && v.every((x) => c.setBy.only.includes(x));
};

export default function ControlsStep({ data, value, onChange, answers }) {
  const has = new Set(value);
  const toggle = (id) => onChange(has.has(id) ? value.filter((x) => x !== id) : [...value, id]);
  const checked = (c) => (c.setBy ? derivedHolds(c, answers) : has.has(c.id));

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
                <span className="muted block">{c.description}</span>
                {c.setBy && (
                  <span className="small block">
                    Set by your Architecture answer to "Whose permissions does the agent use?": {checked(c)
                      ? "every identity is the requesting user's own, so this is in place."
                      : "it counts only when every identity the agent uses is the requesting user's own."}
                  </span>
                )}
              </span>
            </label>
          ))}
        </section>
      ))}
    </>
  );
}
