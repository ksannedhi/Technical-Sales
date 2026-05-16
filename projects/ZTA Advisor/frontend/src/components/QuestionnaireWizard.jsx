import { useState, useEffect } from 'react';

const PILLAR_ORDER = ['identity', 'devices', 'networks', 'applications', 'data', 'visibility'];
const PILLAR_LABELS = {
  identity: 'Identity',
  devices: 'Devices',
  networks: 'Networks',
  applications: 'Applications & Workloads',
  data: 'Data',
  visibility: 'Visibility & Analytics'
};

export default function QuestionnaireWizard({
  orgProfile, frameworkIds,
  answers, onAnswersChange,
  activePillar, onActivePillarChange,
  onComplete, onBack
}) {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/api/questions')
      .then(r => r.json())
      .then(d => {
        setQuestions(d.questions || []);
        setLoading(false);
      })
      .catch(() => {
        setError('Failed to load questions.');
        setLoading(false);
      });
  }, []);

  // Warn before accidental page close if assessment is in progress
  useEffect(() => {
    if (Object.keys(answers).length === 0) return;
    const handler = e => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [answers]);

  function pillarQuestions(pillar) {
    return questions.filter(q => q.pillar === pillar);
  }

  function isPillarComplete(pillar) {
    return pillarQuestions(pillar).every(q => answers[q.id] !== undefined);
  }

  function totalAnswered() { return Object.keys(answers).length; }
  function totalQuestions() { return questions.length; }
  function allComplete() {
    return questions.length > 0 && questions.every(q => answers[q.id] !== undefined);
  }

  function setAnswer(qId, val) {
    onAnswersChange(prev => ({ ...prev, [qId]: val }));
  }

  function goToPillar(pillar) { onActivePillarChange(pillar); window.scrollTo({ top: 0, behavior: 'smooth' }); }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgProfile, answers, frameworkIds })
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      onComplete(data);
    } catch (e) {
      setError('Analysis failed. Please try again.');
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="loading-overlay">
        <div className="loading-spinner-lg" />
        <span>Loading assessment questions…</span>
      </div>
    );
  }

  const currentQuestions = pillarQuestions(activePillar);
  const currentAnswered = currentQuestions.filter(q => answers[q.id] !== undefined).length;
  const progressPct = currentQuestions.length ? (currentAnswered / currentQuestions.length) * 100 : 0;
  const pillarIdx = PILLAR_ORDER.indexOf(activePillar);

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: 'var(--navy)' }}>
          ZTA Assessment — {orgProfile?.orgName}
        </h2>
        <p className="text-muted mt-4">
          {totalAnswered()} of {totalQuestions()} questions answered across all pillars.
        </p>
      </div>

      {/* Global progress */}
      <div style={{ background: 'var(--border)', borderRadius: 4, height: 4, marginBottom: 20, overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          background: allComplete() ? 'var(--green)' : 'var(--blue)',
          borderRadius: 4,
          width: `${totalQuestions() ? (totalAnswered() / totalQuestions()) * 100 : 0}%`,
          transition: 'width .3s ease'
        }} />
      </div>

      {/* Pillar nav — all pillars freely navigable; completion enforced only at submit */}
      <div className="pillar-nav">
        {PILLAR_ORDER.map(p => {
          const complete = isPillarComplete(p);
          const isCurrent = activePillar === p;
          return (
            <button
              key={p}
              className={`pillar-nav-btn ${isCurrent ? 'active' : ''} ${complete ? 'complete' : ''}`}
              onClick={() => goToPillar(p)}
              type="button"
            >
              {complete && !isCurrent ? '✓ ' : ''}{PILLAR_LABELS[p]}
              <span style={{ fontSize: 10, opacity: 0.7, marginLeft: 4 }}>
                ({pillarQuestions(p).filter(q => answers[q.id] !== undefined).length}/{pillarQuestions(p).length})
              </span>
            </button>
          );
        })}
      </div>

      {/* Active pillar questions */}
      <div className="card">
        <div className="pillar-header">
          <span className="pillar-badge">{PILLAR_LABELS[activePillar]}</span>
          <div className="pillar-progress-bar">
            <div className="pillar-progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
          <span className="text-muted text-sm">{currentAnswered}/{currentQuestions.length}</span>
        </div>

        {currentQuestions.map((q, idx) => (
          <div key={q.id} className="question-block">
            <div className="question-text">{idx + 1}. {q.text}</div>
            <div className="question-rationale">{q.rationale}</div>
            <div className="option-list">
              {q.options.map(opt => (
                <div
                  key={opt.value}
                  className={`option-item ${answers[q.id] === opt.value ? 'selected' : ''}`}
                  onClick={() => setAnswer(q.id, opt.value)}
                  role="radio"
                  aria-checked={answers[q.id] === opt.value}
                  tabIndex={0}
                  onKeyDown={e => e.key === 'Enter' && setAnswer(q.id, opt.value)}
                >
                  <div className="option-radio">
                    <div className="option-radio-dot" />
                  </div>
                  <div>
                    <div className="option-label">{opt.label}</div>
                    <div className="option-desc">{opt.description}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Pillar navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, gap: 8 }}>
        <button
          className="btn btn-outline"
          onClick={() => pillarIdx > 0 ? goToPillar(PILLAR_ORDER[pillarIdx - 1]) : onBack()}
          type="button"
        >
          ← {pillarIdx === 0 ? 'Back to Profile' : `Back to ${PILLAR_LABELS[PILLAR_ORDER[pillarIdx - 1]]}`}
        </button>

        {pillarIdx < PILLAR_ORDER.length - 1 ? (
          <button
            className="btn btn-primary"
            onClick={() => goToPillar(PILLAR_ORDER[pillarIdx + 1])}
            disabled={!isPillarComplete(activePillar)}
            title={!isPillarComplete(activePillar) ? 'Answer all questions in this pillar first' : undefined}
            type="button"
          >
            Next: {PILLAR_LABELS[PILLAR_ORDER[pillarIdx + 1]]} →
          </button>
        ) : (
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={!allComplete() || submitting}
            type="button"
          >
            {submitting ? <><span className="spinner" /> Analyzing…</> : 'Generate Assessment →'}
          </button>
        )}
      </div>

      {!allComplete() && (
        <div className="text-muted text-sm" style={{ textAlign: 'right', marginTop: 8 }}>
          {totalQuestions() - totalAnswered()} question{totalQuestions() - totalAnswered() !== 1 ? 's' : ''} remaining across all pillars
        </div>
      )}

      {error && (
        <div style={{ marginTop: 12, color: 'var(--red)', fontSize: 13 }}>{error}</div>
      )}
    </div>
  );
}
