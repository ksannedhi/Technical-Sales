import cron from 'node-cron';

// Import runPipeline from index after it is defined
let _runner = null;
export function registerRunner(fn) { _runner = fn; }

// 06:00 AST (Arabia Standard Time, UTC+3)
// node-cron's { timezone } option is unreliable on Windows (produces Invalid Date
// via Intl.DateTimeFormat string parsing), so we do not use it.
// Instead, TZ=Asia/Kuwait in .env pins the Node.js process clock to Kuwait time,
// making '0 6 * * *' fire at 06:00 AST on any host regardless of system locale.
cron.schedule('0 6 * * *', async () => {
  if (!_runner) return;
  console.log('[Scheduler] Running daily threat briefing pipeline…');
  try {
    await _runner();
    console.log('[Scheduler] Briefing generated successfully.');
  } catch (e) {
    console.error('[Scheduler] Pipeline error:', e.message);
  }
});
