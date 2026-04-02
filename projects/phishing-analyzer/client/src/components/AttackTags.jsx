function AttackTags({ attackTactics }) {
  return (
    <section className="panel">
      <div className="panel-heading compact">
        <h2>MITRE ATT&CK Tactics</h2>
      </div>
      <div className="tags-wrap">
        {attackTactics.map((item) => (
          <div key={`${item.techniqueId}-${item.tactic}`} className="tag-pill">
            <strong>{item.tactic}</strong>
            <span>{item.techniqueId} · {item.techniqueName}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export default AttackTags;
