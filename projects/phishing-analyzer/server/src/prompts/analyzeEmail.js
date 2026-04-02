function truncate(text, maxLength) {
  if (!text) {
    return '';
  }

  return text.length <= maxLength ? text : `${text.slice(0, maxLength)}...`;
}

function extractEvidenceSnippets(parsedEmail) {
  const lines = parsedEmail.body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const interesting = lines.filter((line) =>
    /(urgent|verify|login|sign in|password|invoice|payment|wire|mfa|suspend|expire|action required|click)/i.test(line)
  );

  return interesting.slice(0, 6);
}

function compactDeterministicSignals(deterministicSignals) {
  return deterministicSignals.findings.map((finding) => ({
    category: finding.category,
    severity: finding.severity,
    title: finding.title,
    detail: finding.detail,
    excerpt: truncate(finding.excerpt, 180),
    eccControls: finding.eccControls
  }));
}

export function buildAnalysisMessages({ parsedEmail, deterministicSignals, inputType }) {
  const system = `You are a senior email threat analyst creating a polished phishing report for a CISO and presales demo audience.

Use only the supplied email evidence and trusted deterministic findings.
Do not invent indicators or controls.

Threat scope: phishing, business email compromise, malware delivery, credential harvesting, impersonation, invoice fraud.
Allowed verdicts: clean, suspicious, likely_phishing, phishing.
Allowed categories: sender, headers, links, urgency, impersonation, payload, content, financial_fraud, credential_harvesting.

Scoring:
- 0-20 clean
- 21-40 low suspicion
- 41-65 suspicious
- 66-85 likely phishing
- 86-100 phishing

Writing:
- executiveSummary: 2-3 plain-English sentences for a CISO
- analystSummary: 2-3 concise technical sentences
- confidence: 0-100 numeric score, where 100 means very high confidence
- recommendations: owner-based and actionable
- compliance gaps: deduplicated, plain English, practical
- findings: most important first
- prefer 3-6 findings unless the email is clearly clean

MITRE:
- only include directly relevant tactics/techniques
- keep tactic names aligned to MITRE ATT&CK tactic labels such as Initial Access, Credential Access, Resource Development, Collection, and Defense Evasion when supported by the evidence

NCA ECC:
- use the provided ECC mappings as the baseline
- use both finding-category mappings and threat-profile overlays when deciding which controls are most relevant
- only use the exact provided ECC IDs; do not shorten, rewrite, or invent control IDs
- make the reported compliance gaps reflect the likely compromise type so BEC, malware delivery, credential harvesting, and invoice fraud do not all look the same
- explain why each control matters in plain English

Keep the output authoritative, restrained, and presentation-ready.`;

  const user = {
    goal: 'Analyze this email for phishing, BEC, malware delivery, credential harvesting, impersonation, and invoice fraud indicators.',
    inputType,
    responsePriorities: {
      audience: 'CISO / presales demo',
      mode: 'balanced',
      explainNcaControlsInPlainEnglish: true,
      recommendationsMustBeOwnerBased: true
    },
    evidence: {
      headers: parsedEmail.headers,
      urls: parsedEmail.urls.slice(0, 10),
      attachmentDetected: parsedEmail.attachmentDetected,
      bodyPreview: truncate(parsedEmail.body, 1600),
      suspiciousSnippets: extractEvidenceSnippets(parsedEmail)
    },
    deterministicSignals: {
      summary: deterministicSignals.summary,
      findings: compactDeterministicSignals(deterministicSignals)
    }
  };

  return { system, user: JSON.stringify(user, null, 2) };
}
