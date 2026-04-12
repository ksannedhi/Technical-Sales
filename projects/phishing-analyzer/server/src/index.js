import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import analyzeRouter from './routes/analyze.js';
import reportRouter from './routes/report.js';

const app = express();
const port = process.env.PORT || 3002;
const clientOrigin = process.env.CLIENT_ORIGIN || 'http://localhost:5175';

app.use(cors({ origin: clientOrigin }));
app.use(express.json({ limit: '5mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/analyze', analyzeRouter);
app.use('/api/report', reportRouter);

app.listen(port, () => {
  console.log(`Phishing Analyzer server listening on http://localhost:${port}`);
});
