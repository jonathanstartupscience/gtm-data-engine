/** Express API entrypoint. Boots the server; mounts routes. Railway runs this. */
import express from 'express';
import { config } from '../lib/config.js';
import { health } from './routes/health.js';

const app = express();
app.use(express.json({ limit: '25mb' }));

app.use('/api/health', health);

app.get('/', (_req, res) => {
  res.json({ name: 'gtm-data-engine', status: 'ok', env: config.nodeEnv });
});

app.listen(config.port, () => {
  console.log(`gtm-data-engine listening on :${config.port} (${config.nodeEnv})`);
});
