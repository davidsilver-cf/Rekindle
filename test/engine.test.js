import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { planBills, splitCents } from '../src/engine.js';

const load = async (p) => JSON.parse(await readFile(new URL(p, import.meta.url), 'utf8'));
const config = await load('../config/rekindle.json');
const bills = await load('./fixtures/ABC_261106.json');

const owed = (plan) => Object.fromEntries(plan.customers.map((c) => [c.customer.name, c.cents / 100]));

test('ABC_261106 bills each customer the expected amount', () => {
  const plan = planBills(bills, config);
  assert.deepEqual(owed(plan), {
    'Deal XYZ': 10000,
    'Fund II Main': 9600,
    'Fund I': 8000,
    'Fund II Employees Only': 2600, // $2,000 direct + 5% of $12,000
    'Fund II Co-Invest': 1800,
  });
  assert.equal(plan.totals.pendingCents, 3_200_000);
  assert.equal(plan.totals.ties, true);
  assert.equal(plan.lines.filter((l) => l.exception).length, 0);
});

test('stamps Billback Customer on Deal/Fund lines only', () => {
  const plan = planBills(bills, config);
  const stamp = (id) => plan.lines.find((l) => l.lineId === id).stamps.map((s) => s.value);
  assert.deepEqual(stamp(9190921), ['Deal XYZ']);
  assert.deepEqual(stamp(9190922), ['Fund I']);
  assert.deepEqual(stamp(9337492), ['Fund II Employees Only']);
  assert.deepEqual(stamp(9190923), []); // Allocation: split at invoicing, no single tag
});

test('fills a blank Billing Type from Tag Setup but never overwrites one', () => {
  const blank = structuredClone(bills);
  delete blank[0].lines[1].custom_field_defaultbillingtype; // Deal XYZ line
  blank[0].lines[2].custom_field_defaultbillingtype = 'Expense'; // Fund I line set by hand
  const plan = planBills(blank, config);
  const line = (id) => plan.lines.find((l) => l.lineId === id);
  assert.ok(line(9190921).stamps.some((s) => s.field === 'custom_field_defaultbillingtype' && s.value === 'Deal'));
  assert.equal(line(9190922).billingType, 'Expense');
  assert.equal(line(9190922).billTo.length, 0);
  assert.equal(plan.totals.ties, true);
});

test('unknown Deals tag and missing tag go to exceptions', () => {
  const bad = structuredClone(bills);
  bad[0].lines[1].tags = bad[0].lines[1].tags.filter((t) => t.group !== 46588);
  bad[0].lines[2].tags.find((t) => t.group === 46588).id = 999;
  const plan = planBills(bad, config);
  assert.equal(plan.lines.filter((l) => l.exception).length, 2);
  assert.equal(plan.totals.exceptionCents, 1_800_000);
  assert.equal(plan.totals.ties, true);
});

test('allocation that does not total 100% is an exception', () => {
  const cfg = structuredClone(config);
  cfg.allocations[0].percent = 70;
  const plan = planBills(bills, cfg);
  assert.match(plan.lines.find((l) => l.lineId === 9190923).exception, /90%/);
});

test('ownership change: bill keeps the split in force on its bill date', () => {
  const cfg = structuredClone(config);
  cfg.allocations.forEach((a) => (a.end = '2026-10-31'));
  cfg.allocations.push(
    { dealsTagId: 1027965, customer: cfg.allocations[0].customer, percent: 50, start: '2026-11-01', end: null },
    { dealsTagId: 1027965, customer: cfg.allocations[1].customer, percent: 50, start: '2026-11-01', end: null },
  );
  const plan = planBills(bills, cfg);
  assert.equal(owed(plan)['Fund II Main'], 6000);
  assert.equal(owed(plan)['Fund II Co-Invest'], 6000);
});

test('rounding: leftover cents go to the largest share and the split adds up', () => {
  const shares = splitCents(1001, [{ percent: 80 }, { percent: 15 }, { percent: 5 }]);
  assert.deepEqual(shares.map((s) => s.cents), [801, 150, 50]);
  assert.equal(shares.reduce((s, x) => s + x.cents, 0), 1001);
});
