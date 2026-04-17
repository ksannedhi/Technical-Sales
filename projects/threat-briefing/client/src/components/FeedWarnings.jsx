export default function FeedWarnings({ warnings, onDismiss }) {
  if (!warnings || warnings.length === 0) return null;

  return (
    <div className="feed-warnings">
      <div className="feed-warnings-inner">
        <span className="feed-warnings-icon">⚠</span>
        <ul className="feed-warnings-list">
          {warnings.map((w, i) => <li key={i}>{w}</li>)}
        </ul>
        <button className="feed-warnings-dismiss" onClick={onDismiss} title="Dismiss">✕</button>
      </div>
    </div>
  );
}
