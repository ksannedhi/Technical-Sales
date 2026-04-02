import { Router } from 'express';
import { parseEmailInput } from '../parsing/emailParser.js';
import { runDeterministicChecks } from '../rules/deterministicChecks.js';
import { analyzeWithOpenAI } from '../services/openaiAnalysis.js';
import { analyzeRateLimit } from '../middleware/rateLimit.js';

const router = Router();

router.post('/', analyzeRateLimit, async (req, res) => {
  const { emailRaw, inputType = 'raw_text' } = req.body || {};

  if (!emailRaw || typeof emailRaw !== 'string') {
    return res.status(400).json({ error: 'No email content provided.' });
  }

  try {
    const parsedEmail = parseEmailInput(emailRaw, inputType);
    const deterministicSignals = runDeterministicChecks(parsedEmail);
    const analysis = await analyzeWithOpenAI({ parsedEmail, deterministicSignals, inputType });
    return res.json(analysis);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message || 'Analysis failed.' });
  }
});

export default router;
