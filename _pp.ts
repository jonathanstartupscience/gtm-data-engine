import { previewPush } from './src/engine/stages/push.js';
const p = await previewPush({ limit: 100, sampleCap: 5 }, ()=>{});
console.log('PREVIEW:', JSON.stringify({total:p.total,toCreate:p.toCreate,toUpdate:p.toUpdate,unchanged:p.unchanged,truncated:p.truncated}));
console.log('sample changes:');
for (const c of p.changes) console.log(`  ${c.action} ${c.domain}: ${c.changes.map(x=>`${x.field} ${x.from}→${x.to}`).join('; ')}`);
process.exit(0);
