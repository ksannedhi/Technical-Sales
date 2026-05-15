import { useState } from 'react';
import OrgProfile from './components/OrgProfile.jsx';
import QuestionnaireWizard from './components/QuestionnaireWizard.jsx';
import ResultsPanel from './components/ResultsPanel.jsx';

const STEPS = [
  { id: 1, label: 'Organization Profile' },
  { id: 2, label: 'Assessment' },
  { id: 3, label: 'Results' }
];

export default function App() {
  const [step, setStep] = useState(1);
  const [orgProfile, setOrgProfile] = useState(null);
  const [frameworkIds, setFrameworkIds] = useState([]);
  // Lifted so answers + pillar position survive step navigation
  const [answers, setAnswers] = useState({});
  const [activePillar, setActivePillar] = useState('identity');
  const [results, setResults] = useState(null);

  function handleProfileComplete(profile, frameworks) {
    setOrgProfile(profile);
    setFrameworkIds(frameworks);
    setStep(2);
  }

  function handleAssessmentComplete(res) {
    setResults(res);
    setStep(3);
  }

  function handleReset() {
    setStep(1);
    setOrgProfile(null);
    setFrameworkIds([]);
    setAnswers({});
    setActivePillar('identity');
    setResults(null);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-brand">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          </svg>
          ZTA Advisor
          <span className="topbar-brand-badge">Beta</span>
        </div>
        {step > 1 && (
          <span className="topbar-step-info">
            {orgProfile?.orgName} &nbsp;·&nbsp; Step {step} of 3
          </span>
        )}
      </header>

      <main className="main-content">
        <StepIndicator current={step} />

        {step === 1 && (
          <OrgProfile
            onComplete={handleProfileComplete}
            initialProfile={orgProfile}
            initialFrameworks={frameworkIds}
          />
        )}
        {step === 2 && (
          <QuestionnaireWizard
            orgProfile={orgProfile}
            frameworkIds={frameworkIds}
            answers={answers}
            onAnswersChange={setAnswers}
            activePillar={activePillar}
            onActivePillarChange={setActivePillar}
            onComplete={handleAssessmentComplete}
            onBack={() => setStep(1)}
          />
        )}
        {step === 3 && results && (
          <ResultsPanel
            results={results}
            orgProfile={orgProfile}
            frameworkIds={frameworkIds}
            onReset={handleReset}
          />
        )}
      </main>
    </div>
  );
}

function StepIndicator({ current }) {
  return (
    <div className="step-indicator">
      {STEPS.map((s, i) => (
        <div key={s.id} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? '1' : 'none' }}>
          <div className={`step-item ${current === s.id ? 'active' : ''} ${current > s.id ? 'done' : ''}`}>
            <div className="step-dot">
              {current > s.id ? '✓' : s.id}
            </div>
            <span>{s.label}</span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={`step-connector ${current > s.id ? 'done' : ''}`} />
          )}
        </div>
      ))}
    </div>
  );
}
