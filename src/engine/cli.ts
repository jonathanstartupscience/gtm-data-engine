/**
 * Engine CLI — run a recipe from the command line.
 * Usage:
 *   npm run engine -- verify-stale --dry-run
 *   npm run engine -- verify-stale --limit 500
 */
import { runVerifyStale } from './recipes.js';

const args = process.argv.slice(2);
const recipe = args[0];
const flag = (name: string) => args.includes(`--${name}`);
const val = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

async function main() {
  switch (recipe) {
    case 'verify-stale': {
      const r = await runVerifyStale({
        limit: val('limit') ? Number(val('limit')) : undefined,
        dryRun: flag('dry-run'),
      });
      console.log('\nRun', r.runId, 'done:', JSON.stringify(r.stats, null, 2));
      break;
    }
    default:
      console.log('Usage: npm run engine -- <recipe> [flags]');
      console.log('Recipes: verify-stale [--dry-run] [--limit N]');
      process.exit(recipe ? 1 : 0);
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
