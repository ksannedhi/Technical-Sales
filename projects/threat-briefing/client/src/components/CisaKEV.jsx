const PRIORITY_PILL = {
  'immediate':   'pill-imm',
  'this-week':   'pill-24h',
  'this-month':  'pill-1week',
};

export default function CisaKEV({ briefing }) {
  const kevs = briefing.cisaKEVHighlights || [];

  return (
    <div className="card">
      <div className="card-heading">CISA KEV highlights</div>
      {kevs.length === 0 && (
        <p style={{ fontSize: '12px', color: '#aaa' }}>No new KEV entries today.</p>
      )}
      {kevs.map(k => (
        <div key={k.cveId} className="kev-row">
          <span className="kev-id">{k.cveId}</span>
          <div className="kev-body">
            <div className="kev-product">
              {k.product}
              {k.ransomwareLinked && (
                <span className="tag tag-ransomware" style={{ marginLeft: '6px' }}>
                  Ransomware
                </span>
              )}
            </div>
            <div className="kev-deadline">
              Patch deadline: {k.patchDeadline || 'TBD'}
              &nbsp;·&nbsp;
              <span className={`pill ${PRIORITY_PILL[k.priority] || 'pill-1week'}`}>
                {k.priority}
              </span>
            </div>
          </div>
        </div>
      ))}

      <div className="feed-footer">
        <div className="feed-dot-item">
          <div className="feed-dot" style={{ background: '#1D9E75' }} />
          OTX: {briefing.feedStats?.otxPulsesProcessed ?? 0} pulses
        </div>
        <div className="feed-dot-item">
          <div className="feed-dot" style={{ background: '#E24B4A' }} />
          CISA KEV: {briefing.feedStats?.cisaKEVAdded ?? 0} added
        </div>
        <div className="feed-dot-item">
          <div className="feed-dot" style={{ background: '#BA7517' }} />
          Bazaar: {briefing.feedStats?.malwareSamplesAnalysed ?? 0} samples
        </div>
      </div>
    </div>
  );
}
