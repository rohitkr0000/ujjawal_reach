import type { AppContext } from '../context';
import { rebuildStats, runMaintenance } from './analytics';

const HOUR = 3600 * 1000;

/**
 * Background jobs that run inside the API process:
 *  - every hour: recompute the summary tables for the last 3 days
 *  - every day:  delete data past its retention (events after 12 months, stale previews)
 * Running two API instances is fine: the jobs replace the same rows with the same values. Set
 * RUN_JOBS=false on all but one instance to avoid the duplicate work.
 */
export function startJobs(ctx: AppContext, log: (msg: string) => void = console.log): () => void {
  if (ctx.config.RUN_JOBS !== 'true') return () => undefined;

  const stats = async () => {
    try {
      const r = await rebuildStats(ctx.db, { days: 3 });
      log(`stats rebuilt from ${r.from}`);
    } catch (e) {
      console.error('stats job failed', e);
    }
  };
  const maintenance = async () => {
    try {
      const r = await runMaintenance(ctx.db);
      log(`maintenance: deleted ${r.events} events, ${r.previews} previews`);
    } catch (e) {
      console.error('maintenance job failed', e);
    }
  };

  const first = setTimeout(() => void stats(), 30_000);
  const a = setInterval(() => void stats(), HOUR);
  const b = setInterval(() => void maintenance(), 24 * HOUR);
  for (const t of [first, a, b]) t.unref();
  return () => {
    clearTimeout(first);
    clearInterval(a);
    clearInterval(b);
  };
}
