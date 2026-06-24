import { bisonClientFor } from './src/engine/adapters/emailbison.ts';
try {
  const bison = await bisonClientFor(1); // eso
  const senders = await bison.listSenders();
  console.log('ESO SENDERS:', JSON.stringify(senders.map(s=>({id:s.id,email:s.email,daily:s.daily_limit}))));
  const camps = await bison.listCampaigns();
  console.log('ESO BISON CAMPAIGNS:', JSON.stringify(camps.map(c=>({id:c.id,name:c.name,status:c.status}))));
} catch(e){ console.error('BISON ERR:', e.message); }
process.exit(0);
