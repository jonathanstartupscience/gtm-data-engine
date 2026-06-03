/** Run pending Drizzle migrations. Usage: npm run db:migrate */
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { config } from '../lib/config.js';

const client = postgres(config.databaseUrl, { max: 1 });
const db = drizzle(client);

console.log('Running migrations…');
await migrate(db, { migrationsFolder: './drizzle' });
console.log('Migrations complete.');
await client.end();
