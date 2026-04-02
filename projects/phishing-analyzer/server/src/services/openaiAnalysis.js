import 'dotenv/config';
import OpenAI from 'openai';
import { analysisJsonSchema, analysisResultSchema } from '../schemas/analysisResultSchema.js';
import { buildAnalysisMessages } from '../prompts/analyzeEmail.js';
import { getCategoryDisplayLabel, getControlName, getScenarioSummary } from '../mappings/eccMappings.js';

function normalizeConfidence(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 80;
  }

  if (value <= 1) {
    return Math.round(value * 100);
  }

  return Math.round(value);
}

function severityWeight(severity) {
  if (severity === 'critical') {
    return 4;
  }

  if (severity === 'high') {
    return 3;
  }

  if (severity === 'medium') {
    return 2;
  }

  return 1;
}

function shouldUseFallbackOverModel(parsed, deterministicSignals) {
  const deterministicFindings = deterministicSignals.findings || [];
  const auth = deterministicSignals.summary?.auth || {};
  const strongAuth = auth.spfPass && (auth.dkimPass || auth.dmarcPass);

  if (deterministicFindings.length === 0) {
    if (strongAuth && (parsed.riskScore >= 55 || (parsed.findings || []).length >= 2)) {
      return true;
    }

    return false;
  }

  const strongestDeterministic = Math.max(...deterministicFindings.map((finding) => severityWeight(finding.severity)));
  const modelFindings = parsed.findings || [];
  const strongestModel = modelFindings.length ? Math.max(...modelFindings.map((finding) => severityWeight(finding.severity))) : 0;

  if ((parsed.verdict === 'clean' || parsed.riskScore < 25) && strongestDeterministic >= 2) {
    return true;
  }

  if (modelFindings.length === 0 && deterministicFindings.length >= 2) {
    return true;
  }

  if (strongestDeterministic - strongestModel >= 2) {
    return true;
  }

  return false;
}

function computeFallbackRisk(findings, threatProfiles) {
  let risk = findings.length ? 22 : 12;

  findings.forEach((finding) => {
    if (finding.severity === 'critical') {
      risk += 24;
    } else if (finding.severity === 'high') {
      risk += 16;
    } else if (finding.severity === 'medium') {
      risk += 9;
    } else {
      risk += 4;
    }
  });

  if (threatProfiles.includes('credential_harvesting')) {
    risk += 12;
  }

  if (threatProfiles.includes('business_email_compromise')) {
    risk += 10;
  }

  if (threatProfiles.includes('financial_fraud')) {
    risk += 10;
  }

  if (threatProfiles.includes('invoice_fraud')) {
    risk += 8;
  }

  if (threatProfiles.includes('malware_delivery')) {
    risk += 10;
  }

  return Math.min(100, risk);
}

function buildFallbackRecommendations(threatProfiles) {
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

  if (
    threatProfiles.includes('business_email_compromise') ||
    threatProfiles.includes('invoice_fraud') ||
    threatProfiles.includes('financial_fraud')
  ) {
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

function buildFallbackAttackTactics(threatProfiles, findings) {
  const tactics = [];
  const categories = new Set((findings || []).map((finding) => finding.category));

  if (threatProfiles.includes('phishing') || threatProfiles.includes('business_email_compromise') || threatProfiles.includes('invoice_fraud')) {
    tactics.push({
      tactic: 'Initial Access',
      techniqueId: categories.has('links') ? 'T1566.002' : categories.has('payload') ? 'T1566.001' : 'T1566',
      techniqueName: categories.has('links')
        ? 'Spearphishing Link'
        : categories.has('payload')
          ? 'Spearphishing Attachment'
          : 'Phishing',
      relevance: 'The message is designed to induce user interaction through deceptive email content.'
    });
  }

  if (threatProfiles.includes('credential_harvesting') || threatProfiles.includes('business_email_compromise')) {
    tactics.push({
      tactic: 'Credential Access',
      techniqueId: 'T1078',
      techniqueName: 'Valid Accounts',
      relevance: 'The email attempts to obtain or abuse legitimate credentials.'
    });
  }

  if (threatProfiles.includes('impersonation')) {
    tactics.push({
      tactic: 'Resource Development',
      techniqueId: 'T1583',
      techniqueName: 'Acquire Infrastructure',
      relevance: 'The campaign appears to rely on attacker-controlled domains or lookalike infrastructure.'
    });
  }

  if (threatProfiles.includes('malware_delivery')) {
    tactics.push({
      tactic: 'Defense Evasion',
      techniqueId: 'T1027',
      techniqueName: 'Obfuscated Files or Information',
      relevance: 'Payload-bearing email campaigns often disguise malicious content to bypass user and gateway scrutiny.'
    });
  }

  if (threatProfiles.includes('invoice_fraud')) {
    tactics.push({
      tactic: 'Collection',
      techniqueId: 'T1114',
      techniqueName: 'Email Collection',
      relevance: 'Invoice-fraud and BEC campaigns often rely on access to or abuse of trusted email communication flows.'
    });
  }

  if (threatProfiles.includes('financial_fraud')) {
    tactics.push({
      tactic: 'Collection',
      techniqueId: 'T1114',
      techniqueName: 'Email Collection',
      relevance: 'Reply-based scam campaigns depend on drawing the victim into continued email interaction and harvesting trust or follow-on information.'
    });
  }

  return tactics;
}

function isValidTechniqueId(value) {
  return /^T\d{4}(?:\.\d{3})?$/.test(value || '');
}

function normalizeAttackTactics(parsed, deterministicSignals) {
  const fallbackTactics = buildFallbackAttackTactics(
    deterministicSignals.summary.threatProfiles || [],
    deterministicSignals.findings || []
  );

  if (fallbackTactics.length > 0) {
    return fallbackTactics;
  }

  if (!Array.isArray(parsed.attackTactics) || parsed.attackTactics.length === 0) {
    return fallbackTactics;
  }

  const modelLooksLoose = parsed.attackTactics.some(
    (item) =>
      !isValidTechniqueId(item.techniqueId) ||
      !item.tactic ||
      /credentialing|impersonation|phishing/i.test(item.tactic)
  );

  if (modelLooksLoose || fallbackTactics.length > parsed.attackTactics.length) {
    return fallbackTactics.length ? fallbackTactics : parsed.attackTactics;
  }

  return parsed.attackTactics;
}

function recommendationsNeedFallback(recommendations = [], threatProfiles = []) {
  const combined = recommendations
    .map((item) => `${item.action} ${item.rationale}`.toLowerCase())
    .join(' ');

  if (threatProfiles.includes('credential_harvesting') && !/password|credential|mfa|reset/.test(combined)) {
    return true;
  }

  if (
    (threatProfiles.includes('business_email_compromise') ||
      threatProfiles.includes('invoice_fraud') ||
      threatProfiles.includes('financial_fraud')) &&
    !/mailbox|reply|payment|invoice|wire|financial|scam/.test(combined)
  ) {
    return true;
  }

  if (threatProfiles.includes('malware_delivery') && !/endpoint|attachment|download|process|payload/.test(combined)) {
    return true;
  }

  if (threatProfiles.includes('impersonation') && !/impersonation|lookalike|brand/.test(combined)) {
    return true;
  }

  return false;
}

function mergeRecommendations(modelRecommendations = [], threatProfiles = []) {
  const fallbackRecommendations = buildFallbackRecommendations(threatProfiles);

  if (!modelRecommendations.length || recommendationsNeedFallback(modelRecommendations, threatProfiles)) {
    return fallbackRecommendations;
  }

  const merged = [];
  const seen = new Set();

  for (const recommendation of [...fallbackRecommendations, ...modelRecommendations]) {
    const key = recommendation.action.trim().toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    merged.push(recommendation);

    if (merged.length === 4) {
      break;
    }
  }

  return merged;
}

function fallbackAnalysis({ parsedEmail, deterministicSignals, inputType, source = 'deterministic_fallback' }) {
  const findings = deterministicSignals.findings;
  const threatProfiles = deterministicSignals.summary.threatProfiles || [];
  const riskScore = computeFallbackRisk(findings, threatProfiles);
  const verdict = riskScore >= 86 ? 'phishing' : riskScore >= 66 ? 'likely_phishing' : riskScore >= 41 ? 'suspicious' : 'clean';

  const uniqueControls = [...new Set(findings.flatMap((finding) => finding.eccControls))];
  const scenarioSummary = getScenarioSummary(threatProfiles);

  return analysisResultSchema.parse({
    riskScore,
    verdict,
    confidence: findings.length ? 84 : 68,
    executiveSummary: findings.length
      ? `This email shows suspicious indicators consistent with ${scenarioSummary || 'phishing activity'}, including message deception, social-engineering pressure, and attacker-controlled routing or destinations. Treat it as unsafe until the security team validates impact and user exposure.`
      : 'The current message does not show meaningful phishing indicators based on the available evidence.',
    analystSummary: findings.length
      ? `Deterministic checks identified evidence aligned to ${scenarioSummary || 'phishing activity'}, including suspicious sender and header patterns, link-context mismatches, and social-engineering language. The mapped ECC controls reflect both the finding categories and the likely compromise scenario.`
      : 'Deterministic checks did not identify significant phishing indicators in the supplied email content.',
    findings: findings.map((finding) => ({
      ...finding,
      displayCategory: finding.displayCategory || getCategoryDisplayLabel(finding.category)
    })),
    attackTactics: findings.length ? buildFallbackAttackTactics(threatProfiles, findings) : [],
    eccComplianceGaps: uniqueControls.map((controlId) => ({
      controlId,
      controlName: getControlName(controlId),
      gap: `Current evidence suggests the relevant protective control did not stop or sufficiently reduce the ${scenarioSummary || 'email compromise'} path.`,
      whyItMatters: `This control helps reduce user exposure and downstream impact for ${scenarioSummary || 'email-driven compromise'}.`,
      priority:
        controlId === 'ECC-1-5-1' || controlId === 'ECC-2-3-2' || controlId === 'ECC-2-1-3' ? 'immediate' : 'short-term'
    })),
    recommendations: findings.length
      ? buildFallbackRecommendations(threatProfiles)
      : [
          {
            action: 'No immediate containment action required; retain the message for monitoring or tuning.',
            owner: 'SOC',
            timeframe: '1-week',
            rationale: 'The supplied evidence does not currently justify a stronger response.'
          }
        ],
    metadata: {
      analyzedAt: new Date().toISOString(),
      emailFrom: parsedEmail.headers.from || 'Unknown',
      replyTo: parsedEmail.headers.replyTo || '',
      emailSubject: parsedEmail.headers.subject || 'Unknown',
      linkCount: parsedEmail.urls.length,
      attachmentDetected: parsedEmail.attachmentDetected,
      inputType,
      analysisSource: source
    }
  });
}

export async function analyzeWithOpenAI({ parsedEmail, deterministicSignals, inputType }) {
  if (!process.env.OPENAI_API_KEY) {
    return fallbackAnalysis({ parsedEmail, deterministicSignals, inputType });
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const { system, user } = buildAnalysisMessages({ parsedEmail, deterministicSignals, inputType });

  let response;

  try {
    response = await client.responses.create({
      model: process.env.OPENAI_MODEL || 'gpt-5-nano',
      reasoning: {
        effort: 'minimal'
      },
      max_output_tokens: 2500,
      input: [
        { role: 'system', content: [{ type: 'input_text', text: system }] },
        { role: 'user', content: [{ type: 'input_text', text: user }] }
      ],
      text: {
        format: {
          type: 'json_schema',
          name: analysisJsonSchema.name,
          schema: analysisJsonSchema.schema,
          strict: true
        },
        verbosity: 'low'
      }
    });
  } catch (error) {
    error.message = `OpenAI analysis failed: ${error.message}`;
    throw error;
  }

  let parsed;

  try {
    parsed = JSON.parse(response.output_text);
  } catch (error) {
    console.warn('Structured output parsing failed, falling back to deterministic analysis.', error);
    return fallbackAnalysis({ parsedEmail, deterministicSignals, inputType });
  }

  if (shouldUseFallbackOverModel(parsed, deterministicSignals)) {
    console.warn('Model output underweighted deterministic evidence, using fallback analysis instead.');
    return fallbackAnalysis({ parsedEmail, deterministicSignals, inputType, source: 'deterministic_override' });
  }

  const threatProfiles = deterministicSignals.summary.threatProfiles || [];
  const normalizedRecommendations = mergeRecommendations(parsed.recommendations, threatProfiles);
  const normalizedAttackTactics = normalizeAttackTactics(parsed, deterministicSignals);

  return analysisResultSchema.parse({
    ...parsed,
    confidence: normalizeConfidence(parsed.confidence),
    attackTactics: normalizedAttackTactics,
    recommendations: normalizedRecommendations,
    findings: parsed.findings.map((finding) => ({
      ...finding,
      displayCategory: finding.displayCategory || getCategoryDisplayLabel(finding.category)
    })),
    metadata: {
      ...parsed.metadata,
      analyzedAt: parsed.metadata?.analyzedAt || new Date().toISOString(),
      emailFrom: parsed.metadata?.emailFrom || parsedEmail.headers.from || 'Unknown',
      replyTo: parsed.metadata?.replyTo || parsedEmail.headers.replyTo || '',
      emailSubject: parsed.metadata?.emailSubject || parsedEmail.headers.subject || 'Unknown',
      linkCount: typeof parsed.metadata?.linkCount === 'number' ? parsed.metadata.linkCount : parsedEmail.urls.length,
      attachmentDetected:
        typeof parsed.metadata?.attachmentDetected === 'boolean'
          ? parsed.metadata.attachmentDetected
          : parsedEmail.attachmentDetected,
      inputType,
      analysisSource: 'openai_structured'
    },
    eccComplianceGaps: parsed.eccComplianceGaps.map((gap) => ({
      ...gap,
      controlName: gap.controlName || getControlName(gap.controlId)
    }))
  });
}
