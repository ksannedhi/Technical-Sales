function truncate(text, maxLength) {
  if (!text) {
    return '';
  }

  return text.length <= maxLength ? text : `${text.slice(0, maxLength)}...`;
}

// Gap 3 fix: accepts both NCA ECC and ISO 27001 gap lists so the AI produces
// narrative explanations for all compliance controls, not just NCA ones.
export function buildNarrativeMessages({ parsedEmail, findings, threatProfiles, riskScore, verdict, eccGaps, isoGaps = [] }) {
  const system = `You are a senior email threat analyst. Write the narrative sections of a verified phishing analysis report for a CISO and presales audience.

The structured findings, risk score, verdict, and compliance controls have already been determined by the analysis engine. Your role is only to write clear, authoritative explanations grounded in that evidence.

Rules:
- Do not invent new findings or reference indicators not in the provided list
- Do not change the verdict or risk score
- Only explain controls from the provided complianceControls list — do not add or remove controls
- Keep writing restrained, authoritative, and presentation-ready`;

  // Deduplicated list of all compliance controls across both frameworks.
  // The AI returns one explanation per controlId; mergeNarrativeIntoGaps
  // applies the matching entry to whichever framework gap has that ID.
  const seen = new Set();
  const complianceControls = [...eccGaps, ...isoGaps]
    .filter((g) => { if (seen.has(g.controlId)) return false; seen.add(g.controlId); return true; })
    .map((g) => ({ controlId: g.controlId, controlName: g.controlName }));

  const user = {
    verdict,
    riskScore,
    threatProfiles,
    emailMetadata: {
      from: parsedEmail.headers.from,
      replyTo: parsedEmail.headers.replyTo || null,
      subject: parsedEmail.headers.subject,
      urlCount: parsedEmail.urls.length,
      attachmentDetected: parsedEmail.attachmentDetected
    },
    findings: findings.map((f) => ({
      category: f.category,
      severity: f.severity,
      title: f.title,
      detail: f.detail,
      excerpt: truncate(f.excerpt, 120)
    })),
    complianceControls,
    task: {
      executiveSummary: '2-3 plain-English sentences for a CISO — summarise the threat, the deception method, and recommended posture',
      analystSummary: '2-3 concise technical sentences — describe the evidence pattern and likely attack objective',
      confidence: 'numeric 0-100 reflecting certainty in the verdict given the available evidence',
      eccGapExplanations: 'for each controlId in complianceControls, write one sentence explaining why this specific control matters for this specific email threat'
    }
  };

  return { system, user: JSON.stringify(user, null, 2) };
}
