import cron from 'node-cron';

// Import runPipeline from index after it is defined
let _runner = null;
export function registerRunner(fn) { _runner = fn; }

// 06:00 AST (Arabia Standard Time, UTC+3)
// node-cron's timezone option is unreliable on Windows (produces Invalid Date
// via Intl.DateTimeFormat string parsing). Using system clock directly instead —
// the host machine is set to AST so '0 6 * * *' fires at 06:00 AST as intended.
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
