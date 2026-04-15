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

  // Shared state across steps
  const [intakeProfile,        setIntakeProfile]        = useState(null);
  const [recommendedFrameworks,setRecommendedFrameworks] = useState([]);
  const [selectedFrameworks,   setSelectedFrameworks]   = useState([]);
  const [frameworkWeights,     setFrameworkWeights]     = useState({});
  const [harmonisationResults, setHarmonisationResults] = useState([]);
  const [progress,             setProgress]             = useState({ completed: 0, total: 0, label: '' });
  const [postureMap,           setPostureMap]           = useState({});
  const [roadmap,              setRoadmap]              = useState(null);

  // ── Intake submit ───────────────────────────────────────────────────────────
  async function handleIntakeSubmit(profile) {
    setIntakeProfile(profile);
    try {
      const res  = await fetch('/api/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile)
      });
      const data = await res.json();
      setRecommendedFrameworks(data.recommendedFrameworks || []);

      // Pre-select and pre-weight recommended frameworks
      const preSelected = (data.recommendedFrameworks || []).map(f => f.frameworkId);
      const preWeights  = {};
      (data.recommendedFrameworks || []).forEach(f => { preWeights[f.frameworkId] = f.weight; });
      setSelectedFrameworks(preSelected);
      setFrameworkWeights(preWeights);
    } catch (e) {
      console.error(e);
    }
    setStep('frameworks');
  }

  // ── Start harmonisation via SSE ─────────────────────────────────────────────
  async function handleStartHarmonisation(selected, weights) {
    setSelectedFrameworks(selected);
    setFrameworkWeights(weights);
    setStep('harmonising');
    setProgress({ completed: 0, total: 23, label: 'Starting…' });

    const qs  = `frameworks=${selected.join(',')}`;
    const es  = new EventSource(`/api/harmonise/stream?${qs}`);

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
        alert('Harmonisation failed: ' + msg.message);
        setStep('frameworks');
      }
    };
    es.onerror = () => { es.close(); setStep('frameworks'); };
  }

  // ── Posture submit → generate roadmap ──────────────────────────────────────
  async function handlePostureSubmit(posture) {
    setPostureMap(posture);
    try {
      const res = await fetch('/api/roadmap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ harmonisationResults, postureMap: posture, selectedFrameworks, frameworkWeights })
      });
      const data = await res.json();
      setRoadmap(data);
      setStep('roadmap');
    } catch (e) {
      alert('Roadmap generation failed: ' + e.message);
    }
  }

  return (
    <div className="shell">
      <div className="topbar">
        <div className="brand">
          <div className="brand-mark" />
          <span className="brand-name">Cross-Framework Harmoniser</span>
        </div>
        <div className="tab-row">
          <button className={`tab ${activeTab==='harmoniser'?'tab-active':''}`} onClick={()=>setActiveTab('harmoniser')}>Harmoniser</button>
          <button className={`tab ${activeTab==='change-tracker'?'tab-active':''}`} onClick={()=>setActiveTab('change-tracker')}>Change Tracker</button>
        </div>
      </div>

      {activeTab === 'harmoniser' && (
        <>
          {step === 'intake'      && <IntakeForm onSubmit={handleIntakeSubmit} />}
          {step === 'frameworks'  && <FrameworkSelector recommended={recommendedFrameworks} initialSelected={selectedFrameworks} initialWeights={frameworkWeights} onStart={handleStartHarmonisation} />}
          {step === 'harmonising' && <ProgressBar progress={progress} total={23} />}
          {step === 'matrix'      && <><CoverageMatrix results={harmonisationResults} selectedFrameworks={selectedFrameworks} /><div style={{textAlign:'right',marginTop:'12px'}}><button className="btn btn-primary" onClick={()=>setStep('posture')}>Rate your posture →</button></div></>}
          {step === 'posture'     && <PostureAssessment results={harmonisationResults} onSubmit={handlePostureSubmit} />}
          {step === 'roadmap'     && <><Roadmap roadmap={roadmap} /><ExportPanel harmonisationResults={harmonisationResults} roadmap={roadmap} selectedFrameworks={selectedFrameworks} frameworkWeights={frameworkWeights} /></>}
        </>
      )}

      {activeTab === 'change-tracker' && <ChangeTracker onGoToHarmoniser={() => { setActiveTab('harmoniser'); setStep('frameworks'); }} />}

      {['matrix','posture','roadmap'].includes(step) && activeTab === 'harmoniser' && (
        <div className="disclaimer-bar">
          AI-assisted analysis for presales purposes only. Verify all regulatory obligations with qualified legal counsel before relying on these outputs.
        </div>
      )}
    </div>
  );
}
