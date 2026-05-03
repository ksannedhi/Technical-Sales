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

function buildFingerprint(parsedEmail) {
  const fromDomain = (parsedEmail.headers.from.match(/@([^>\s]+)/)?.[1] || '').toLowerCase();
  const returnPath = (parsedEmail.headers.returnPath.match(/@([^>\s]+)/)?.[1] || '').toLowerCase();
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

    // Campaign cluster detection
    const fingerprint = buildFingerprint(parsedEmail);
    const matchedEntry = fingerprint.length > 2
      ? recentFingerprints.find((e) => e.fingerprint === fingerprint)
      : null;

    // Persist this fingerprint for future comparisons
    recentFingerprints.unshift({ fingerprint, analyzedAt: new Date().toISOString() });
    if (recentFingerprints.length > MAX_FINGERPRINTS) recentFingerprints.pop();

    const analysis = await analyzeWithOpenAI({
      parsedEmail,
      deterministicSignals,
      inputType,
      campaignMatch: !!matchedEntry,
      campaignMatchedAt: matchedEntry?.analyzedAt
    });

    return res.json(analysis);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message || 'Analysis failed.' });
  }
});

export default router;
