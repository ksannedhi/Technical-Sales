import { useState } from 'react';
import IntakeForm        from './components/IntakeForm.jsx';
import FrameworkSelector from './components/FrameworkSelector.jsx';
import ProgressBar       from './components/ProgressBar.jsx';
import CoverageMatrix    from './components/CoverageMatrix.jsx';
import PostureAssessment from './components/PostureAssessment.jsx';
import Roadmap           from './components/Roadmap.jsx';
import ExportPanel       from './components/ExportPanel.jsx';
import ChangeTracker     from './components/ChangeTracker.jsx';

const STEPS = ['intake', 'frameworks', 'harmonising', 'matrix', 'posture', 'roadmap'];

export default function App() {
  const [activeTab, setActiveTab] = useState('harmoniser'); // 'harmoniser' | 'change-tracker'
  const [step,      setStep]      = useState('intake');
  const [error,     setError]     = useState(null);

  // Shared state across steps
  const [intakeProfile,        setIntakeProfile]        = useState(null);
  const [recommendedFrameworks,setRecommendedFrameworks] = useState([]);
  const [selectedFrameworks,   setSelectedFrameworks]   = useState([]);
  const [frameworkWeights,     setFrameworkWeights]     = useState({});
  const [harmonisationResults, setHarmonisationResults] = useState([]);
  const [progress,             setProgress]             = useState({ completed: 0, total: 0, label: '' });
  const [postureMap,           setPostureMap]           = useState({});
  const [roadmap,              setRoadmap]              = useState(null);

  // ── Reset all state to intake ───────────────────────────────────────────────
  function handleReset() {
    setStep('intake');
    setError(null);
    setIntakeProfile(null);
    setRecommendedFrameworks([]);
    setSelectedFrameworks([]);
    setFrameworkWeights({});
    setHarmonisationResults([]);
    setProgress({ completed: 0, total: 0, label: '' });
    setPostureMap({});
    setRoadmap(null);
    // Clear server-side harmonisation cache so next run starts fresh
    fetch('/api/cache/clear', { method: 'POST' }).catch(() => {});
  }

  // ── Intake submit ───────────────────────────────────────────────────────────
  async function handleIntakeSubmit(profile) {
    setError(null);
    setIntakeProfile(profile);
    try {
      const res  = await fetch('/api/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile)
      });
      const data = await res.json();
      setRecommendedFrameworks(data.recommendedFrameworks || []);
      const preSelected = (data.recommendedFrameworks || []).map(f => f.frameworkId);
      const preWeights  = {};
      (data.recommendedFrameworks || []).forEach(f => { preWeights[f.frameworkId] = f.weight; });
      setSelectedFrameworks(preSelected);
      setFrameworkWeights(preWeights);
    } catch (e) {
      setError('Could not retrieve framework recommendations. Check your API key and try again.');
      return;
    }
    setStep('frameworks');
  }

  // ── Start harmonisation via SSE ─────────────────────────────────────────────
  async function handleStartHarmonisation(selected, weights) {
    setError(null);
    setSelectedFrameworks(selected);
    setFrameworkWeights(weights);
    setStep('harmonising');
    setProgress({ completed: 0, total: 24, label: 'Starting…' });

    const qs = `frameworks=${selected.join(',')}`;
    const es = new EventSource(`/api/harmonise/stream?${qs}`);

    es.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === 'progress') {
        setProgress({ completed: msg.completed, total: msg.total, label: msg.domainLabel });
      } else if (msg.type === 'complete') {
        es.close();
        setHarmonisationResults(msg.results);
        setStep('matrix');
      } else if (msg.type === 'error') {
        es.close();
        setError('Harmonisation failed: ' + msg.message);
        setStep('frameworks');
      }
    };
    es.onerror = () => {
      es.close();
      setError('Connection to the analysis server was lost. Please try again.');
      setStep('frameworks');
    };
  }

  // ── Posture submit → generate roadmap ──────────────────────────────────────
  async function handlePostureSubmit(posture) {
    setError(null);
    setPostureMap(posture);
    try {
      const res = await fetch('/api/roadmap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ harmonisationResults, postureMap: posture, selectedFrameworks, frameworkWeights })
      });
      if (!res.ok) {
        const errData = await res.text();
        throw new Error(`Server error (${res.status}): ${errData}`);
      }
      const data = await res.json();
      console.log('[handlePostureSubmit] roadmap received:', data);
      setRoadmap(data);
      setStep('roadmap');
    } catch (e) {
      console.error('[handlePostureSubmit] error:', e);
      setError('Roadmap generation failed: ' + e.message + '. Your posture ratings are saved — try again.');
    }
  }

  const inHarmoniser = activeTab === 'harmoniser';
  const showReset    = inHarmoniser && step !== 'intake' && step !== 'harmonising';

  return (
    <div className="shell">
      <div className="topbar">
        <div className="brand">
          <div className="brand-mark" />
          <span className="brand-name">Cross-Framework Harmoniser</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {showReset && (
            <button
              onClick={handleReset}
              style={{ fontSize: '11px', color: '#64748B', background: 'none', border: '1px solid #E2E8F0', borderRadius: '6px', padding: '5px 12px', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              ↺ New analysis
            </button>
          )}
          <div className="tab-row">
            <button className={`tab ${activeTab==='harmoniser'?'tab-active':''}`} onClick={()=>setActiveTab('harmoniser')}>Harmoniser</button>
            <button className={`tab ${activeTab==='change-tracker'?'tab-active':''}`} onClick={()=>setActiveTab('change-tracker')}>Change Tracker</button>
          </div>
        </div>
      </div>

      {/* ── Inline error banner ─────────────────────────────────────────────── */}
      {error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px', padding: '10px 14px', fontSize: '12px', color: '#991B1B', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>⚠ {error}</span>
          <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: '#991B1B', cursor: 'pointer', fontSize: '14px', lineHeight: 1, padding: '0 4px' }}>✕</button>
        </div>
      )}

      {inHarmoniser && (
        <>
          {step === 'intake'      && <IntakeForm onSubmit={handleIntakeSubmit} initialProfile={intakeProfile} />}
          {step === 'frameworks'  && <FrameworkSelector recommended={recommendedFrameworks} initialSelected={selectedFrameworks} initialWeights={frameworkWeights} onStart={handleStartHarmonisation} onBack={() => setStep('intake')} />}
          {step === 'harmonising' && <ProgressBar progress={progress} total={24} />}

          {step === 'matrix' && (
            <>
              <CoverageMatrix results={harmonisationResults} selectedFrameworks={selectedFrameworks} />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px' }}>
                <button className="btn" onClick={() => setStep('frameworks')}>← Back to frameworks</button>
                <button className="btn btn-primary" onClick={() => setStep('posture')}>Rate your posture →</button>
              </div>
            </>
          )}

          {step === 'posture' && (
            <>
              <PostureAssessment results={harmonisationResults} onSubmit={handlePostureSubmit} onBack={() => setStep('matrix')} initialPosture={postureMap} onPostureChange={setPostureMap} />
            </>
          )}

          {step === 'roadmap' && (
            <>
              <Roadmap roadmap={roadmap} onBack={() => setStep('posture')} />
              <ExportPanel harmonisationResults={harmonisationResults} roadmap={roadmap} selectedFrameworks={selectedFrameworks} frameworkWeights={frameworkWeights} />
            </>
          )}
        </>
      )}

      {activeTab === 'change-tracker' && (
        <ChangeTracker onGoToHarmoniser={() => { setActiveTab('harmoniser'); setStep('frameworks'); }} />
      )}

      {['matrix','posture','roadmap'].includes(step) && inHarmoniser && (
        <div className="disclaimer-bar">
          AI-assisted analysis for presales purposes only. Verify all regulatory obligations with qualified legal counsel before relying on these outputs.
        </div>
      )}
    </div>
  );
}
