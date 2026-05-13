import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Router } from 'express';

const __dirname = dirname(fileURLToPath(import.meta.url));
const { questions } = JSON.parse(readFileSync(join(__dirname, '../data/questions.json'), 'utf8'));

export const questionsRouter = Router();

questionsRouter.get('/', (_req, res) => {
  res.json({ questions });
});
