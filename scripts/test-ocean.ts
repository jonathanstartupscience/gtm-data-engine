/** Live smoke-test of the Ocean adapter. Note: lookalike SEARCH is plan-gated on the
 *  current Ocean tier ("Plan version not supported"); ENRICH works. */
import { creditBalance, enrichCompany, searchCompanies, domainOf } from '../src/engine/adapters/ocean.js';

const bal = await creditBalance();
console.log('Ocean balance:', JSON.stringify(bal.credits), '| dailyLeft:', bal.dailyLimitRateLeft);

console.log('\nEnrich techstars.com:');
const c = await enrichCompany('techstars.com');
console.log('  size:', c.companySize, '| country:', c.primaryCountry,
  '| revenue:', c.revenue, '| founded:', c.yearFounded,
  '| industries:', (c.industries ?? []).slice(0, 3).join(', '));

console.log('\nLookalike search (expected to fail on current plan):');
try {
  const { companies } = await searchCompanies({ lookalikeDomains: ['techstars.com'], size: 5 });
  console.log(`  returned ${companies.length}:`, companies.map(domainOf).join(', '));
} catch (e) {
  console.log('  SEARCH unavailable:', (e as Error).message.slice(0, 120));
}
process.exit(0);
