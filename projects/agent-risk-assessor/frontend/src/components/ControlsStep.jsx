export default function ControlsStep({ data, value, onChange }) {
  const has = new Set(value);
  const toggle = (id) => onChange(has.has(id) ? value.filter((x) => x !== id) : [...value, id]);

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
            <label key={c.id} className={`control ${has.has(c.id) ? 'on' : ''}`}>
              <input type="checkbox" checked={has.has(c.id)} onChange={() => toggle(c.id)} />
              <span>
                <strong>{c.title}</strong>
                {c.id === 'audit_logging' && <span className="tag">Required for Go</span>}
                <span className="muted block">{c.description}</span>
              </span>
            </label>
          ))}
        </section>
      ))}
    </>
  );
}
