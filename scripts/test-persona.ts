/** Quick parity check: Node persona classifier vs the known-good ESO Python outputs. */
import { classifyPersona } from '../src/engine/persona.js';

const cases: [string, string | null][] = [
  ['Managing Partner', 'ESO Founder/GP'],
  ['Program Director, Japan', 'ESO Program'],
  ['Program Manager', 'ESO Program'],
  ['Head of Accelerator Ops', null],
  ['Chief Executive Officer', 'ESO Leadership'],
  ['Global Mentor to Startup Founders', null],
  ['Startup Program Manager', 'ESO Program'],
  ['Executive Director', 'ESO Leadership'],
  ['Intern', null],
  ['Student Volunteer', null],
  ['Program Coordinator', 'ESO Program'],
  ['Marketing Coordinator', null],
  ['Director of Community', 'ESO Partnerships'],
  ['VP of Business Development', 'ESO Partnerships'],
  ['Founder & CEO', 'ESO Leadership'],
  ['Co-Founder', 'ESO Founder/GP'],
  ['Alumni Relations Manager', null],
  ['Mentor', null],
  ['COO', 'ESO Leadership'],
  ['CEO', 'ESO Leadership'],
  ['President', 'ESO Leadership'],
  ['General Partner', 'ESO Founder/GP'],
  ['Community Manager', 'ESO Partnerships'],
  ['Incubator Director', 'ESO Program'],
  ['Membership Director', 'ESO Partnerships'],
  ['GP', 'ESO Founder/GP'],
];

let pass = 0;
for (const [title, expected] of cases) {
  const got = classifyPersona(title);
  const ok = got === expected;
  if (ok) pass++;
  console.log(`${ok ? 'OK ' : 'FAIL'}  ${title.padEnd(38)} -> ${got}  ${ok ? '' : `(expected ${expected})`}`);
}
console.log(`\n${pass}/${cases.length} passed`);
process.exit(pass === cases.length ? 0 : 1);
