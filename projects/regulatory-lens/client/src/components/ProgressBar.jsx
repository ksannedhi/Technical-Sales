export default function ProgressBar({ progress, total }) {
  const pct = total > 0 ? Math.round((progress.completed / total) * 100) : 0;
  return (
    <div className="card" style={{ maxWidth: '520px', margin: '40px auto', textAlign: 'center' }}>
      <div className="step-label">Analysing frameworks…</div>
      <h2 className="step-title" style={{ marginBottom: '24px' }}>Running parallel domain analysis</h2>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#888', marginTop: '8px' }}>
        <span>{progress.label || 'Processing…'}</span>
        <span>{progress.completed} / {total} domains</span>
      </div>
      <p style={{ fontSize: '12px', color: '#aaa', marginTop: '16px' }}>Claude is reasoning across all selected frameworks simultaneously. This takes 20–40 seconds.</p>
    </div>
  );
}
