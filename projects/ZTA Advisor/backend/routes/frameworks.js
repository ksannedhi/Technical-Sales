import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Router } from 'express';

const __dirname = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(__dirname, '../data/frameworks.json'), 'utf8'));

export const frameworksRouter = Router();

frameworksRouter.get('/', (_req, res) => {
  res.json({ frameworks: data.frameworks, pillars: data.pillars, geoOptions: data.geoOptions });
});

// Industry → additional framework IDs to inject regardless of geo
const INDUSTRY_FRAMEWORK_NUDGE = {
  'Defense / DoD': ['dod-zt'],
};

frameworksRouter.get('/suggest', (req, res) => {
  const { geo, industry } = req.query;
  if (!geo) return res.status(400).json({ error: 'geo parameter required' });

  const geoIds = data.geoMapping[geo] || data.geoMapping['Global'];
  const nudgeIds = INDUSTRY_FRAMEWORK_NUDGE[industry] || [];

  // Merge, preserving order and deduplicating
  const merged = [...new Set([...geoIds, ...nudgeIds])];
  const frameworks = merged.map(id => data.frameworks.find(f => f.id === id)).filter(Boolean);

  res.json({ suggested: frameworks, all: data.frameworks });
});
