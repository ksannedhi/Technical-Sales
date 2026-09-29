// Renders one question from inputs.json. Multi-selects treat "none" as exclusive.
export default function Field({ input, value, onChange }) {
  const { id, label, type, options = [], rationale } = input;

  if (type === 'text' || type === 'textarea') {
    const Tag = type === 'text' ? 'input' : 'textarea';
    return (
      <label className="field">
        <span className="label">{label}</span>
        <Tag value={value ?? ''} rows={type === 'textarea' ? 2 : undefined} onChange={(e) => onChange(e.target.value)} />
      </label>
    );
  }

  const selected = Array.isArray(value) ? value : value ? [value] : [];
  const toggle = (v) => {
    if (type === 'single') return onChange(v);
    if (v === 'none') return onChange(selected.includes('none') ? [] : ['none']);
    const next = selected.filter((x) => x !== 'none');
    onChange(next.includes(v) ? next.filter((x) => x !== v) : [...next, v]);
  };

  return (
    <fieldset className="field">
      <legend className="label">
        {label} {type === 'multi' && <span className="muted">(pick all that apply)</span>}
      </legend>
      {rationale && <p className="hint">{rationale}</p>}
      <div className="options" role={type === 'single' ? 'radiogroup' : 'group'}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role={type === 'single' ? 'radio' : 'checkbox'}
            aria-checked={selected.includes(o.value)}
            className={`chip ${selected.includes(o.value) ? 'on' : ''}`}
            onClick={() => toggle(o.value)}
            data-field={id}
          >
            {o.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
