import { Router } from 'express';
import { parseEmailInput } from '../parsing/emailParser.js';
import { runDeterministicChecks } from '../rules/deterministicChecks.js';
import { analyzeWithOpenAI } from '../services/openaiAnalysis.js';
import { analyzeRateLimit } from '../middleware/rateLimit.js';

const router = Router();

// Campaign fingerprinting — keeps the last 20 analysis fingerprints in memory.
// A fingerprint is a lightweight hash of infrastructure signals that persist across
// campaign iterations even when attacker rotates Reply-To or tracking URLs.
const MAX_FINGERPRINTS = 20;
const recentFingerprints = [];

function domainFromHeader(value) {
  // Use lastIndexOf so SRS-encoded Return-Path values like
  // "bounces+...@pot=hotmail.com@em.quantinsti.com" resolve to the actual
  // sending domain rather than the encoded recipient fragment.
  const lastAt = value.lastIndexOf('@');
  if (lastAt === -1) return '';
  return value.slice(lastAt + 1).replace(/[>\s].*/, '').toLowerCase().trim();
}

function buildFingerprint(parsedEmail) {
  const fromDomain = domainFromHeader(parsedEmail.headers.from);
  const returnPath = domainFromHeader(parsedEmail.headers.returnPath);
  const css = parsedEmail.cssObfuscationDetected ? '1' : '0';
  return `${fromDomain}|${returnPath}|${css}`;
}

router.post('/', analyzeRateLimit, async (req, res) => {
  const { emailRaw, inputType = 'raw_text' } = req.body || {};

  if (!emailRaw || typeof emailRaw !== 'string') {
    return res.status(400).json({ error: 'No email content provided.' });
  }

  try {
    const parsedEmail = parseEmailInput(emailRaw, inputType);
    const deterministicSignals = await runDeterministicChecks(parsedEmail);

    // Run analysis first — verdict is needed before fingerprint decisions.
    const analysis = await analyzeWithOpenAI({
      parsedEmail,
      deterministicSignals,
      inputType,
      campaignMatch: false,
      campaignMatchedAt: undefined
    });

    // Campaign cluster detection — only for non-clean emails.
    // Clean emails must not pollute the fingerprint store or trigger the
    // campaign reuse banner, which would be misleading for legitimate mail.
    const fingerprint = buildFingerprint(parsedEmail);
    const isClean = analysis.verdict === 'clean';

    if (!isClean && fingerprint.length > 2) {
      const matchedEntry = recentFingerprints.find((e) => e.fingerprint === fingerprint);
      if (matchedEntry) {
        analysis.metadata.campaignMatch = true;
        analysis.metadata.campaignMatchedAt = matchedEntry.analyzedAt;
      }
      recentFingerprints.unshift({ fingerprint, analyzedAt: new Date().toISOString() });
      if (recentFingerprints.length > MAX_FINGERPRINTS) recentFingerprints.pop();
    }

    return res.json(analysis);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message || 'Analysis failed.' });
  }
});

export default router;
