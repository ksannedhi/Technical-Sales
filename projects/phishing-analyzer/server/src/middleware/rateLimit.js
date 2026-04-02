const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 10;
const buckets = new Map();

function prune(now) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

export function analyzeRateLimit(req, res, next) {
  const now = Date.now();
  prune(now);

  const key = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return next();
  }

  if (current.count >= MAX_REQUESTS_PER_WINDOW) {
    const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
    res.set('Retry-After', String(retryAfterSeconds));
    return res.status(429).json({
      error: 'Too many analysis requests. Please wait about a minute and try again.'
    });
  }

  current.count += 1;
  return next();
}
