import cron from 'node-cron';

// Import runPipeline from index after it is defined
let _runner = null;
export function registerRunner(fn) { _runner = fn; }

// 06:00 Kuwait Time (AST, UTC+3) = 03:00 UTC
cron.schedule('0 3 * * *', async () => {
  if (!_runner) return;
  console.log('[Scheduler] Running daily threat briefing pipeline…');
  try {
    await _runner();
    console.log('[Scheduler] Briefing generated successfully.');
  } catch (e) {
    console.error('[Scheduler] Pipeline error:', e.message);
  }
});
