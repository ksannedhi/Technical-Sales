import { Router } from 'express';
import { buildReportBuffer } from '../services/pdfReport.js';

const router = Router();

router.post('/', async (req, res) => {
  const { result, analystNote = '' } = req.body || {};

  if (!result) {
    return res.status(400).json({ error: 'No analysis result provided.' });
  }

  try {
    const pdf = await buildReportBuffer(result, analystNote);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="phishing-report-${Date.now()}.pdf"`
    });
    return res.send(pdf);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message || 'Report generation failed.' });
  }
});

export default router;
