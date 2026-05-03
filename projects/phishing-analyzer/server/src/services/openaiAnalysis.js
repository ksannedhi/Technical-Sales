import 'dotenv/config';
import OpenAI from 'openai';
import { analysisResultSchema, narrativeJsonSchema } from '../schemas/analysisResultSchema.js';
import { buildNarrativeMessages } from '../prompts/analyzeEmail.js';
import { buildComplianceGaps, getCategoryDisplayLabel, getScenarioSummary } from '../mappings/eccMappings.js';

function normalizeConfidence(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 80;
  if (value <= 1) return Math.round(value * 100);
  return Math.round(value);
}

function scoreToVerdict(riskScore) {
  if (riskScore >= 86) return 'phishing';
  if (riskScore >= 66) return 'likely_phishing';
  if (riskScore >= 41) return 'suspicious';
  return 'clean';
}

function computeFallbackRisk(findings, threatProfiles) {
  const breakdown = [];
  const base = findings.length ? 22 : 12;
  let risk = base;
  breakdown.push({ label: 'Base score', points: base });

  findings.forEach((finding) => {
    const pts = { critical: 24, high: 16, medium: 9, low: 4 }[finding.severity] ?? 4;
    risk += pts;
    breakdown.push({ label: finding.title, points: pts });
  });

  const profileBoosts = [
    ['credential_harvesting', 12, 'Credential harvesting profile'],
    ['business_email_compromise', 10, 'Business email compromise profile'],
    ['financial_fraud', 10, 'Financial fraud profile'],
    ['invoice_fraud', 8, 'Invoice fraud profile'],
    ['malware_delivery', 10, 'Malware delivery profile'],
    ['impersonation', 8, 'Impersonation profile']
  ];

  for (const [profile, pts, label] of profileBoosts) {
    if (threatProfiles.includes(profile)) {
      risk += pts;
      breakdown.push({ label, points: pts });
    }
  }

  return { score: Math.min(100, risk), breakdown };
}

function buildDeterministicAttackTactics(threatProfiles, findings) {
  const tactics = [];
  const categories = new Set((findings || []).map((f) => f.category));

  if (threatProfiles.includes('phishing') || threatProfiles.includes('business_email_compromise') || threatProfiles.includes('invoice_fraud')) {
    tactics.push({
      tactic: 'Initial Access',
      techniqueId: categories.has('links') ? 'T1566.002' : categories.has('payload') ? 'T1566.001' : 'T1566',
      techniqueName: categories.has('links') ? 'Spearphishing Link' : categories.has('payload') ? 'Spearphishing Attachment' : 'Phishing',
      relevance: 'The message is designed to induce user interaction through deceptive email content.'
    });
  }

  if (threatProfiles.includes('credential_harvesting') || threatProfiles.includes('business_email_compromise')) {
    tactics.push({
      tactic: 'Credential Access',
      techniqueId: 'T1056.003',
      techniqueName: 'Web Portal Capture',
      relevance: 'The email directs recipients to a fake login page or form designed to capture account credentials before they reach the legitimate service.'
    });
  }

  if (threatProfiles.includes('impersonation')) {
    tactics.push({
      tactic: 'Resource Development',
      techniqueId: 'T1583',
      techniqueName: 'Acquire Infrastructure',
      relevance: 'The campaign relies on attacker-controlled domains or lookalike infrastructure to deliver and support the phishing message.'
    });
    tactics.push({
      tactic: 'Defense Evasion',
      techniqueId: 'T1036.005',
      techniqueName: 'Masquerading: Match Legitimate Name or Location',
      relevance: 'The message mimics a trusted brand, sender identity, or official notification format to lower recipient suspicion.'
    });
  }

  const hasCssObfuscation = (findings || []).some((f) => f.id === 'content-css-obfuscation');
  if (threatProfiles.includes('malware_delivery') || hasCssObfuscation) {
    tactics.push({
      tactic: 'Defense Evasion',
      techniqueId: 'T1027',
      techniqueName: 'Obfuscated Files or Information',
      relevance: hasCssObfuscation && !threatProfiles.includes('malware_delivery')
        ? 'The email body contains an oversized CSS style block with randomised selectors — a known technique for hiding malicious content from spam filters and email security gateways.'
        : 'Payload-bearing email campaigns often disguise malicious content to bypass user and gateway scrutiny.'
    });
  }

  if (threatProfiles.includes('invoice_fraud') || threatProfiles.includes('financial_fraud')) {
    tactics.push({
      tactic: 'Impact',
      techniqueId: 'T1657',
      techniqueName: 'Financial Theft',
      relevance: 'The campaign is designed to deceive the recipient into transferring funds, disclosing payment details, or engaging in fraudulent financial activity.'
    });
  }

  return tactics;
}

function buildDeterministicRecommendations(threatProfiles) {
  const recommendations = [
    {
      action: 'Block the sender and destination domains at the email and web security layers.',
      owner: 'SOC',
      timeframe: 'immediate',
      rationale: 'This cuts off further user exposure while triage is underway.'
    },
    {
      action: 'Identify recipients of the message and quarantine matching copies across mailboxes.',
      owner: 'SOC',
      timeframe: 'immediate',
      rationale: 'Removing duplicates reduces the chance of additional clicks or replies.'
    }
  ];

  if (threatProfiles.includes('credential_harvesting')) {
    recommendations.push({
      action: 'Force password reset and MFA re-enrollment for any user who clicked or submitted credentials.',
      owner: 'IT',
      timeframe: '24h',
      rationale: 'This helps contain account takeover risk if credentials were exposed.'
    });
  }

  if (threatProfiles.includes('business_email_compromise') || threatProfiles.includes('invoice_fraud') || threatProfiles.includes('financial_fraud')) {
    recommendations.push({
      action: 'Review mailbox activity, recent suspicious replies, and attempted financial request redirection associated with this message.',
      owner: 'SOC',
      timeframe: '24h',
      rationale: 'BEC and invoice fraud campaigns often rely on trusted-message hijacking, impersonation, and reply-chain manipulation.'
    });
  }

  if (threatProfiles.includes('malware_delivery')) {
    recommendations.push({
      action: 'Inspect endpoints that received the message for attachment execution, dropped files, browser downloads, or suspicious child-process activity.',
      owner: 'IT',
      timeframe: '24h',
      rationale: 'Attachment- or payload-based campaigns may lead to execution even without credential theft.'
    });
  }

  if (threatProfiles.includes('impersonation') && !threatProfiles.includes('business_email_compromise')) {
    recommendations.push({
      action: 'Tune inbound impersonation detections for the abused brand, display-name pattern, and lookalike domain variants seen in this message.',
      owner: 'SOC',
      timeframe: '1-week',
      rationale: 'This improves resilience against repeated brand-impersonation campaigns using similar infrastructure.'
    });
  }

  if (threatProfiles.includes('financial_fraud')) {
    recommendations.push({
      action: 'Flag the sender, subject pattern, and scam wording as a reply-based fraud lure so similar advance-fee campaigns are quarantined earlier.',
      owner: 'SOC',
      timeframe: '1-week',
      rationale: 'This type of fraud often relies on recipient engagement by reply rather than links or attachments.'
    });
  }

  return recommendations.slice(0, 4);
}

function mergeNarrativeIntoGaps(deterministicGaps, eccGapExplanations = []) {
  const explanationMap = new Map(eccGapExplanations.map((e) => [e.controlId, e.whyItMatters]));
  return deterministicGaps.map((gap) => ({
    ...gap,
    whyItMatters: explanationMap.get(gap.controlId) || gap.whyItMatters
  }));
}

async function fetchNarrative({ parsedEmail, findings, threatProfiles, riskScore, verdict, eccGaps }) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const { system, user } = buildNarrativeMessages({ parsedEmail, findings, threatProfiles, riskScore, verdict, eccGaps });

  const response = await client.responses.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    reasoning: { effort: 'minimal' },
    max_output_tokens: 1500,
    input: [
      { role: 'system', content: [{ type: 'input_text', text: system }] },
      { role: 'user', content: [{ type: 'input_text', text: user }] }
    ],
    text: {
      format: {
        type: 'json_schema',
        name: narrativeJsonSchema.name,
        schema: narrativeJsonSchema.schema,
        strict: true
      }
    }
  });

  return JSON.parse(response.output_text);
}

function buildGenericSummaries(findings, threatProfiles) {
  const scenarioSummary = getScenarioSummary(threatProfiles);
  return {
    executiveSummary: findings.length
      ? `This email shows suspicious indicators consistent with ${scenarioSummary || 'phishing activity'}, including message deception, social-engineering pressure, and attacker-controlled routing or destinations. Treat it as unsafe until the security team validates impact and user exposure.`
      : 'The current message does not show meaningful phishing indicators based on the available evidence.',
    analystSummary: findings.length
      ? `Deterministic checks identified evidence aligned to ${scenarioSummary || 'phishing activity'}, including suspicious sender and header patterns, link-context mismatches, and social-engineering language. The mapped ECC controls reflect both the finding categories and the likely compromise scenario.`
      : 'Deterministic checks did not identify significant phishing indicators in the supplied email content.'
  };
}

function extractIocs(parsedEmail, deterministicSignals) {
  return deterministicSignals.summary.iocs || {
    senderDomains: [],
    replyToDomains: [],
    returnPathDomains: [],
    embeddedUrls: [],
    uniqueDomains: []
  };
}

export async function analyzeWithOpenAI({ parsedEmail, deterministicSignals, inputType, campaignMatch, campaignMatchedAt }) {
  const findings = deterministicSignals.findings;
  const threatProfiles = deterministicSignals.summary.threatProfiles || [];

  const { score: riskScore, breakdown: scoreBreakdown } = computeFallbackRisk(findings, threatProfiles);
  const verdict = scoreToVerdict(riskScore);
  const attackTactics = buildDeterministicAttackTactics(threatProfiles, findings);
  const recommendations = findings.length
    ? buildDeterministicRecommendations(threatProfiles)
    : [{ action: 'No immediate containment action required; retain the message for monitoring or tuning.', owner: 'SOC', timeframe: '1-week', rationale: 'The supplied evidence does not currently justify a stronger response.' }];
  const eccGaps = buildComplianceGaps(findings, threatProfiles, 'nca_ecc');
  const isoGaps = buildComplianceGaps(findings, threatProfiles, 'iso27001');
  const iocs = extractIocs(parsedEmail, deterministicSignals);

  const normalizedFindings = findings.map((f) => ({
    ...f,
    displayCategory: f.displayCategory || getCategoryDisplayLabel(f.category)
  }));

  const metadata = {
    analyzedAt: new Date().toISOString(),
    emailFrom: parsedEmail.headers.from || 'Unknown',
    replyTo: parsedEmail.headers.replyTo || '',
    emailSubject: parsedEmail.headers.subject || 'Unknown',
    linkCount: parsedEmail.urls.length,
    attachmentDetected: parsedEmail.attachmentDetected,
    inputType,
    ...(campaignMatch ? { campaignMatch: true, campaignMatchedAt } : {})
  };

  if (process.env.OPENAI_API_KEY) {
    try {
      const narrative = await fetchNarrative({ parsedEmail, findings: normalizedFindings, threatProfiles, riskScore, verdict, eccGaps });

      return analysisResultSchema.parse({
        riskScore,
        verdict,
        confidence: normalizeConfidence(narrative.confidence),
        executiveSummary: narrative.executiveSummary,
        analystSummary: narrative.analystSummary,
        findings: normalizedFindings,
        attackTactics,
        eccComplianceGaps: mergeNarrativeIntoGaps(eccGaps, narrative.eccGapExplanations),
        isoComplianceGaps: mergeNarrativeIntoGaps(isoGaps, narrative.eccGapExplanations),
        recommendations,
        scoreBreakdown,
        iocs,
        metadata: { ...metadata, analysisSource: 'openai_structured' }
      });
    } catch (error) {
      console.warn('OpenAI narrative failed, using deterministic summaries.', error.message);
    }
  }

  const { executiveSummary, analystSummary } = buildGenericSummaries(findings, threatProfiles);

  return analysisResultSchema.parse({
    riskScore,
    verdict,
    confidence: findings.length ? 84 : 68,
    executiveSummary,
    analystSummary,
    findings: normalizedFindings,
    attackTactics,
    eccComplianceGaps: eccGaps,
    isoComplianceGaps: isoGaps,
    recommendations,
    scoreBreakdown,
    iocs,
    metadata: { ...metadata, analysisSource: 'deterministic_fallback' }
  });
}
