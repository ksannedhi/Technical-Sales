export default function ExecutiveSummary({ briefing }) {
  return (
    <div className="card">
      <div className="card-heading">Executive summary</div>
      <p className="exec-text">{briefing.executiveSummary}</p>

      {briefing.analystSummary && <>
        <div className="card-heading" style={{ marginTop: '14px' }}>Analyst summary</div>
        <p className="exec-text">{briefing.analystSummary}</p>
      </>}

      {(briefing.malwareFamiliesActive || []).length > 0 && <>
        <div className="card-heading" style={{ marginTop: '14px' }}>Active malware families</div>
        <div className="tags">
          {briefing.malwareFamiliesActive.map(f => (
            <span key={f} className="tag tag-high">{f}</span>
          ))}
        </div>
      </>}
    </div>
  );
}
