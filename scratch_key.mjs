import { bisonKeyFor, bisonBaseFor } from './src/lib/secrets.ts';
const key = await bisonKeyFor('eso');
const base = await bisonBaseFor(null);
console.log('eso key present:', !!key, 'len:', key?.length||0, 'prefix:', key? key.slice(0,4)+'...' : '(none)');
console.log('base:', base);
// try a direct call to a couple of candidate endpoints to see which auth shape works
const tryUrl = async (u) => {
  try { const r = await fetch(u, { headers: { Authorization:`Bearer ${key}` }}); console.log(u, '->', r.status); }
  catch(e){ console.log(u, 'ERR', e.message); }
};
await tryUrl(`${base}/sender-emails`);
await tryUrl(`${base}/campaigns?page=1`);
process.exit(0);
