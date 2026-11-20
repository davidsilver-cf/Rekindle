import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateOwners, validateSetup, effectiveConfig } from '../src/setup.js';
import { splitCents } from '../src/engine.js';
import { fmtPct, fmtAmount } from '../src/format.js';

const customers = [{ billbackTagId: 1, name: 'Main' }, { billbackTagId: 2, name: 'CoInvest' }, { billbackTagId: 3, name: 'Employees' }];
const row = (customerTagId, amount, percent = '', start = '', end = '') => ({ customerTagId: String(customerTagId), amount, percent, start, end });

test('$ amounts: % worked out from the amounts in force', () => {
  const v = validateOwners([row(1, '$60,000,000'), row(2, '30000000'), row(3, '10,000,000')], customers);
  assert.deepEqual(v.errors, []);
  assert.deepEqual(v.rows.map((r) => [r.customer.name, r.amount, r.percent]), [['Main', 60000000, 60], ['CoInvest', 30000000, 30], ['Employees', 10000000, 10]]);
});

test('$ amounts that don\'t divide evenly still total 100% and split every cent', () => {
  const v = validateOwners([row(1, '1'), row(2, '1'), row(3, '1')], customers);
  assert.deepEqual(v.errors, []);
  assert.equal(fmtPct(v.rows[0].percent), '33.33');
  const shares = splitCents(100001, v.rows);
  assert.equal(shares.reduce((t, s) => t + s.cents, 0), 100001);
});

test('owners in force together must be all $ or all %; % then $ over time is fine', () => {
  assert.match(validateOwners([row(1, '600'), row(2, '', '40')], customers).errors.join(' '), /\$ amount for every owner/);
  const v = validateOwners([
    row(1, '', '70', '', '2026-06-30'), row(2, '', '30', '', '2026-06-30'),
    row(1, '500', '', '2026-07-01'), row(2, '500', '', '2026-07-01'),
  ], customers);
  assert.deepEqual(v.errors, []);
  assert.deepEqual(v.rows.map((r) => r.percent), [70, 30, 50, 50]);
  assert.match(validateOwners([row(1, '-5')], customers).errors.join(' '), /more than 0/);
});

test('deal setup: a saved allocation replaces the deal\'s own owners', () => {
  const saved = [{ id: 7, name: 'Fund II Investors', owners: [] }];
  const r = validateSetup({ billingType: 'Allocation', allocationId: '7', owners: [row(1, '', '100')] }, customers, saved);
  assert.deepEqual(r.errors, []);
  assert.equal(r.setup.allocationId, 7);
  assert.deepEqual(r.owners, []);
  assert.match(validateSetup({ billingType: 'Allocation', allocationId: '99' }, customers, saved).errors.join(' '), /no longer exists/);
});

test('effectiveConfig: deals using a saved allocation get its owners; the list says who uses it', () => {
  const base = { deals: [], allocations: [{ dealsTagId: 11, customer: { name: 'Old' }, percent: 100 }], billbackCustomers: [], tagGroups: {} };
  const tags = { deals: [{ id: 11, name: 'Atlas' }, { id: 12, name: 'Beacon' }], billbackCustomers: [] };
  const setups = new Map([[11, { billingType: 'Allocation', allocationId: 7 }], [12, { billingType: 'Allocation', allocationId: null }]]);
  const saved = [{ id: 7, name: 'Fund II Investors', owners: [{ customer: { name: 'Main' }, amount: 600, percent: 60 }, { customer: { name: 'CoInvest' }, amount: 400, percent: 40 }] }];
  const cfg = effectiveConfig(base, { tags, setups, owners: [{ dealsTagId: 12, customer: { name: 'Solo' }, amount: null, percent: 100 }], saved });
  assert.deepEqual(cfg.allocations.filter((a) => a.dealsTagId === 11).map((a) => [a.customer.name, a.percent, a.amount]), [['Main', 60, 600], ['CoInvest', 40, 400]]);
  assert.deepEqual(cfg.allocations.filter((a) => a.dealsTagId === 12).map((a) => a.customer.name), ['Solo']);
  assert.deepEqual(cfg.deals.find((d) => d.dealsTagId === 11).allocation, { id: 7, name: 'Fund II Investors' });
  assert.deepEqual(cfg.savedAllocations[0].deals, ['Atlas']);
});

test('formatting: % to 2 decimals, $ without needless cents', () => {
  assert.equal(fmtPct(33.3333333333), '33.33');
  assert.equal(fmtPct(60), '60');
  assert.equal(fmtAmount(60000000), '$60,000,000');
  assert.equal(fmtAmount(1250.5), '$1,250.50');
  assert.equal(fmtAmount(null), '');
});
