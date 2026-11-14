import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { effectiveConfig, validateSetup, billbackCustomers } from '../src/setup.js';
import { planBills } from '../src/engine.js';

const base = JSON.parse(readFileSync(new URL('../config/rekindle.json', import.meta.url), 'utf8'));
const bills = JSON.parse(readFileSync(new URL('./fixtures/ABC_261106.json', import.meta.url), 'utf8'));
const t = (id, name, customer = null) => ({ id, name, customer });
const tags = {
  deals: [t(1027801, 'Deal XYZ'), t(1027964, 'Fund I'), t(1027965, 'Fund II'), t(1028616, 'Fund II - Employees Only'), t(1029001, 'Project Atlas')],
  billbackCustomers: [t(1027953, 'Fund I', 22874359), t(1027955, 'Fund II Main', 22874366), t(1027954, 'Fund II Co-Invest', 22874367), t(1027956, 'Fund II Employees Only', 22874368), t(1027957, 'Deal XYZ', 22874410)],
};
const customers = billbackCustomers(base, tags);
const c = (id) => customers.find((x) => x.billbackTagId === id);

test('live tags + starter file + saved setup', () => {
  const cfg = effectiveConfig(base, { tags });
  assert.deepEqual(cfg.deals.map((d) => [d.dealsTag, d.billingType, d.source]), [
    ['Deal XYZ', 'Deal', 'file'], ['Fund I', 'Fund', 'file'], ['Fund II', 'Allocation', 'file'],
    ['Fund II - Employees Only', 'Fund', 'file'], ['Project Atlas', null, 'none'],
  ]);
  const saved = effectiveConfig(base, {
    tags,
    setups: new Map([[1029001, { billingType: 'Fund', customer: c(1027953) }]]),
    owners: [{ dealsTagId: 1027965, customer: c(1027955), percent: 70, start: null, end: null }, { dealsTagId: 1027965, customer: c(1027954), percent: 30, start: null, end: null }],
  });
  const atlas = saved.deals.find((d) => d.dealsTag === 'Project Atlas');
  assert.equal(atlas.source, 'rekindle');
  assert.equal(atlas.customer.name, 'Fund I');
  // Saved owners replace the file's for that deal.
  assert.deepEqual(saved.allocations.filter((a) => a.dealsTagId === 1027965).map((a) => [a.customer.name, a.percent]), [['Fund II Main', 70], ['Fund II Co-Invest', 30]]);
  // Customer IDs come from the tag's linked customer.
  assert.equal(c(1027953).customerId, 22874359);
});

test('a renamed Deals tag keeps its setup (matched by id)', () => {
  const renamed = { ...tags, deals: tags.deals.map((d) => (d.id === 1027964 ? { ...d, name: 'Fund I (2026)' } : d)) };
  const deal = effectiveConfig(base, { tags: renamed }).deals.find((d) => d.dealsTagId === 1027964);
  assert.equal(deal.dealsTag, 'Fund I (2026)');
  assert.equal(deal.billingType, 'Fund');
});

test('lines of a deal with no setup are exceptions, unless the line has its own billing type', () => {
  const cfg = effectiveConfig(base, { tags });
  const b = structuredClone(bills);
  const atlas = (id, type) => ({ ...structuredClone(b[0].lines[1]), id, custom_field_defaultbillingtype: type,
    tags: [{ id: 1029001, group: 46588, name: 'Project Atlas' }, { id: 1027811, group: 46589, name: 'Legal' }, { id: 1027943, group: 46610, name: 'Pending' }] });
  b[0].lines.push(atlas(1, undefined), atlas(2, 'Expense'));
  const plan = planBills(b, cfg);
  assert.match(plan.lines.find((l) => l.lineId === 1).exception, /"Project Atlas" needs setup/);
  assert.equal(plan.lines.find((l) => l.lineId === 2).billingType, 'Expense');
  assert.equal(plan.totals.ties, true);
});

test('setup validation', () => {
  const v = (input) => validateSetup(input, customers).errors;
  assert.deepEqual(v({ billingType: 'Fund', customerTagId: '1027953' }), []);
  assert.deepEqual(v({ billingType: 'Expense' }), []);
  assert.match(v({ billingType: 'Maybe' }).join(), /Choose a billing type/);
  assert.match(v({ billingType: 'Deal', customerTagId: '999' }).join(), /needs the billback customer/);
  assert.match(v({ billingType: 'Allocation', owners: [] }).join(), /at least one owner/);
  assert.deepEqual(v({ billingType: 'Allocation', owners: [
    { customerTagId: '1027955', percent: '80' }, { customerTagId: '1027954', percent: '15' }, { customerTagId: '1027956', percent: '5' }, { customerTagId: '', percent: '', start: '', end: '' },
  ] }), []);
  assert.match(v({ billingType: 'Allocation', owners: [{ customerTagId: '1027955', percent: '80' }] }).join(), /Owners total 80%/);
  assert.match(v({ billingType: 'Allocation', owners: [{ customerTagId: '1027955', percent: '0' }] }).join(), /more than 0%/);
  assert.match(v({ billingType: 'Allocation', owners: [{ customerTagId: '1027955', percent: '100', start: '2026-12-01', end: '2026-11-01' }] }).join(), /start date is after end date/);
  // Ownership change: old split ends Oct 31, new split starts Nov 1. Both periods total 100%.
  assert.deepEqual(v({ billingType: 'Allocation', owners: [
    { customerTagId: '1027955', percent: '80', end: '2026-10-31' }, { customerTagId: '1027954', percent: '20', end: '2026-10-31' },
    { customerTagId: '1027955', percent: '50', start: '2026-11-01' }, { customerTagId: '1027954', percent: '50', start: '2026-11-01' },
  ] }), []);
  // Overlap: new split starts before the old one ends.
  assert.match(v({ billingType: 'Allocation', owners: [
    { customerTagId: '1027955', percent: '100', end: '2026-11-15' }, { customerTagId: '1027954', percent: '100', start: '2026-11-01' },
  ] }).join(), /Owners total 200% from 2026-11-01/);
  // Allocation setup keeps only owner rows; Fund keeps none.
  assert.equal(validateSetup({ billingType: 'Fund', customerTagId: '1027953', owners: [{ customerTagId: '1027955', percent: '50' }] }, customers).owners.length, 0);
});
