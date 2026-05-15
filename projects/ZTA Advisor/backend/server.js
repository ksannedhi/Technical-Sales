import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
// Load .env from project root (one level above backend/)
config({ path: join(dirname(fileURLToPath(import.meta.url)), '../.env') });
import express from 'express';
import cors from 'cors';
import { frameworksRouter } from './routes/frameworks.js';
import { questionsRouter } from './routes/questions.js';
import { analyzeRouter } from './routes/analyze.js';
import { exportRouter } from './routes/export.js';

const app = express();
const PORT = process.env.PORT || 3005;

app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5180' }));
app.use(express.json({ limit: '1mb' }));

app.use('/api/frameworks', frameworksRouter);
app.use('/api/questions', questionsRouter);
app.use('/api/analyze', analyzeRouter);
app.use('/api/export', exportRouter);

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => console.log(`ZTA Advisor backend running on port ${PORT}`));
