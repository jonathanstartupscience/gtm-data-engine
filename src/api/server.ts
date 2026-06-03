/** Express API entrypoint. Serves API routes + the built React app. Railway runs this. */
import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { config } from '../lib/config.js';
import { health } from './routes/health.js';
import { store } from './routes/store.js';
import { runsRouter } from './routes/runs.js';
import { importRouter } from './routes/import.js';
import { requireAuth, authConfigured } from './auth.js';

const app = express();
app.set('trust proxy', 1); // behind Railway's proxy (and Cloudflare) — correct protocol/IP
app.use(express.json({ limit: '50mb' })); // CSV uploads sent as JSON text

// Public: health + whether the client must authenticate.
app.use('/api/health', health);
app.get('/api/config', (_req, res) => res.json({ authRequired: authConfigured() }));

// Protected: data + recipe execution (open if CLERK_JWKS_URL unset).
app.use('/api/store', requireAuth, store);
app.use('/api/runs', requireAuth, runsRouter);
app.use('/api/import', requireAuth, importRouter);

// Serve the built React app (web/dist) if present; SPA fallback to index.html.
// Resolve robustly: in dev (tsx) the file is src/api/, in prod (tsc) it's dist/src/api/,
// so the repo root — and thus web/dist — sits a different number of levels up.
const here = dirname(fileURLToPath(import.meta.url));
const webDist = [
  join(here, '..', '..', 'web', 'dist'),       // dev: src/api -> repo/web/dist
  join(here, '..', '..', '..', 'web', 'dist'), // prod: dist/src/api -> repo/web/dist
  join(process.cwd(), 'web', 'dist'),          // fallback: cwd-relative
].find((p) => existsSync(p)) ?? '';
if (webDist) {
  app.use(express.static(webDist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(join(webDist, 'index.html')));
} else {
  app.get('/', (_req, res) => res.json({ name: 'gtm-data-engine', status: 'ok (no web build)', env: config.nodeEnv }));
}

app.listen(config.port, () => {
  console.log(`gtm-data-engine listening on :${config.port} (${config.nodeEnv})`);
  console.log(`[auth] CLERK_JWKS_URL ${authConfigured() ? 'SET → auth ON' : 'NOT set → auth OPEN'}`);
});
