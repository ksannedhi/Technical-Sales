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

export default function QuestionnaireWizard({ orgProfile, frameworkIds, onComplete, onBack }) {
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [activePillar, setActivePillar] = useState('identity');
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

  function pillarQuestions(pillar) {
    return questions.filter(q => q.pillar === pillar);
  }

  function isPillarComplete(pillar) {
    return pillarQuestions(pillar).every(q => answers[q.id] !== undefined);
  }

  function totalAnswered() {
    return Object.keys(answers).length;
  }

  function totalQuestions() {
    return questions.length;
  }

  function allComplete() {
    return questions.length > 0 && questions.every(q => answers[q.id] !== undefined);
  }

  function setAnswer(qId, val) {
    setAnswers(prev => ({ ...prev, [qId]: val }));
  }

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
        <div
          style={{
            height: '100%',
            background: allComplete() ? 'var(--green)' : 'var(--blue)',
            borderRadius: 4,
            width: `${totalQuestions() ? (totalAnswered() / totalQuestions()) * 100 : 0}%`,
            transition: 'width .3s ease'
          }}
        />
      </div>

      {/* Pillar nav */}
      <div className="pillar-nav">
        {PILLAR_ORDER.map(p => (
          <button
            key={p}
            className={`pillar-nav-btn ${activePillar === p ? 'active' : ''} ${isPillarComplete(p) ? 'complete' : ''}`}
            onClick={() => setActivePillar(p)}
            type="button"
          >
            {isPillarComplete(p) && activePillar !== p ? '✓ ' : ''}{PILLAR_LABELS[p]}
          </button>
        ))}
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
            <div className="question-text">
              {idx + 1}. {q.text}
            </div>
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

      {/* Pillar navigation arrows */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, gap: 8 }}>
        <button
          className="btn btn-outline"
          onClick={() => {
            const idx = PILLAR_ORDER.indexOf(activePillar);
            if (idx > 0) setActivePillar(PILLAR_ORDER[idx - 1]);
            else onBack();
          }}
          type="button"
        >
          ← {PILLAR_ORDER.indexOf(activePillar) === 0 ? 'Back to Profile' : `Back to ${PILLAR_LABELS[PILLAR_ORDER[PILLAR_ORDER.indexOf(activePillar) - 1]]}`}
        </button>

        {PILLAR_ORDER.indexOf(activePillar) < PILLAR_ORDER.length - 1 ? (
          <button
            className="btn btn-primary"
            onClick={() => setActivePillar(PILLAR_ORDER[PILLAR_ORDER.indexOf(activePillar) + 1])}
            type="button"
          >
            Next: {PILLAR_LABELS[PILLAR_ORDER[PILLAR_ORDER.indexOf(activePillar) + 1]]} →
          </button>
        ) : (
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={!allComplete() || submitting}
            type="button"
          >
            {submitting ? (
              <><span className="spinner" /> Analyzing…</>
            ) : (
              'Generate Assessment →'
            )}
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
