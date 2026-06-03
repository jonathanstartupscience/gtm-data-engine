/** Drizzle DB client (postgres-js driver). Import `db` everywhere. */
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from '../lib/config.js';
import * as schema from './schema.js';

if (!config.databaseUrl) {
  throw new Error('DATABASE_URL is not set — add Postgres in Railway or set it in .env');
}

const client = postgres(config.databaseUrl, { max: 10 });
export const db = drizzle(client, { schema });
export { schema };
