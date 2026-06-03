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
import { discoverRouter } from './routes/discover.js';
import { exportRouter } from './routes/export.js';
import { requireAuth, authConfigured, assertAuthSafe } from './auth.js';
import { securityHeaders, errorHandler, installProcessGuards } from './middleware.js';

installProcessGuards();
assertAuthSafe(); // refuse to boot in prod if auth is unconfigured (fail closed)

const app = express();
app.set('trust proxy', 1); // behind Railway's proxy (and Cloudflare)
app.disable('x-powered-by');
app.use(securityHeaders);

// Small default body limit; large CSV uploads get a scoped limit on the import routes only.
app.use(express.json({ limit: '256kb' }));

// Public: health + whether the client must authenticate.
app.use('/api/health', health);
app.get('/api/config', (_req, res) => res.json({ authRequired: authConfigured() }));

// Protected: data + recipe execution + import (open only in dev when JWKS unset).
app.use('/api/store', requireAuth, store);
app.use('/api/runs', requireAuth, runsRouter);
app.use('/api/import', requireAuth, express.json({ limit: '30mb' }), importRouter);
app.use('/api/discover', requireAuth, discoverRouter);
app.use('/api/export', requireAuth, exportRouter);

// Serve the built React app (web/dist); SPA fallback to index.html.
const here = dirname(fileURLToPath(import.meta.url));
const webDist = [
  join(here, '..', '..', 'web', 'dist'),
  join(here, '..', '..', '..', 'web', 'dist'),
  join(process.cwd(), 'web', 'dist'),
].find((p) => existsSync(p)) ?? '';
if (webDist) {
  app.use(express.static(webDist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(join(webDist, 'index.html')));
} else {
  app.get('/', (_req, res) => res.json({ name: 'gtm-data-engine', status: 'ok (no web build)', env: config.nodeEnv }));
}

app.use(errorHandler); // terminal error handler — must be last

app.listen(config.port, () => {
  console.log(`gtm-data-engine listening on :${config.port} (${config.nodeEnv})`);
  console.log(`[auth] ${authConfigured() ? 'ON (Clerk JWKS configured)' : 'OPEN (dev — no CLERK_JWKS_URL)'}`);
});
