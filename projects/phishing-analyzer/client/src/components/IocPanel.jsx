function IocPanel({ iocs }) {
  const rows = [];

  if (iocs.senderDomains?.length) {
    rows.push({ type: 'Sender domain', values: iocs.senderDomains, style: 'domain' });
  }
  if (iocs.replyToDomains?.length) {
    rows.push({ type: 'Reply-To domain', values: iocs.replyToDomains, style: 'domain' });
  }
  if (iocs.returnPathDomains?.length) {
    rows.push({ type: 'Return-Path domain', values: iocs.returnPathDomains, style: 'domain' });
  }
  if (iocs.embeddedUrls?.length) {
    rows.push({ type: 'Suspicious URLs', values: iocs.embeddedUrls.slice(0, 8), style: 'url' });
  }

  if (!rows.length) return null;

  return (
    <section className="panel ioc-panel">
      <div className="panel-heading compact">
        <h2>Indicators of Compromise</h2>
        <span>{iocs.uniqueDomains?.length ?? 0} unique domains</span>
      </div>
      <div className="ioc-table">
        {rows.map((row) => (
          <div key={row.type} className="ioc-row">
            <span className="ioc-type-label">{row.type}</span>
            <div className="ioc-values">
              {row.values.map((v) => (
                <code key={v} className={`ioc-chip ioc-chip-${row.style}`}>{v}</code>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default IocPanel;
