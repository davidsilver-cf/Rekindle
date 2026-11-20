// Customers marked Expensed (custom field on the Campfire customer): their
// shares are reclassed to the P&L, not invoiced. Uses the starter config with
// Fund II split 80 / 15 / 5 and "Fund II Employees Only" (1027956) marked
// Expensed, standing in for a management company.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planBills } from '../src/engine.js';
import { dealGroups } from '../src/approvals.js';
import { waitingLines, prepareReclass, advanceReclass } from '../src/reclass.js';
import { unbilledRows } from '../src/dashboard.js';

const base = JSON.parse(readFileSync(new URL('../config/rekindle.json', import.meta.url), 'utf8'));
const bills = JSON.parse(readFileSync(new URL('./fixtures/ABC_261106.json', import.meta.url), 'utf8'));
for (const l of bills[0].lines) l.account = 1484989;
const MGMT = 1027956;
const config = { ...base, expensedTagIds: new Set([MGMT]) };
const SPLIT = 9190923; // $12,000 Fund II legal, split 80/15/5
const DIRECT = 9337492; // $2,000 to "Fund II - Employees Only" (a Fund deal billing the expensed customer 100%)

test('a split line: the expensed share is left off invoices and goes to Reclass', () => {
  const plan = planBills(bills, config);
  const l = plan.lines.find((x) => x.lineId === SPLIT);
  assert.deepEqual(l.billTo.map((b) => [b.customer.billbackTagId, b.cents, b.expensed]), [[1027955, 960000, false], [1027954, 180000, false], [MGMT, 60000, true]]);
  assert.equal(l.reclassCents, 60000);
  assert.equal(l.wholeExpense, false);
  assert.ok(!plan.customers.some((c) => c.customer.billbackTagId === MGMT));
  assert.ok(plan.totals.ties);
  assert.ok(waitingLines(plan, new Set()).some((x) => x.lineId === SPLIT));
  // Approval still covers the line (its billed shares).
  assert.ok(dealGroups(plan, config).some((g) => g.lines.some((x) => x.lineId === SPLIT)));
  // Dashboard: two rows, the billed part and the part awaiting reclass.
  const rows = unbilledRows(plan, [], '2026-11-20').filter((r) => r.lineId === SPLIT);
  assert.deepEqual(rows.map((r) => [r.stage, r.cents]), [['Waiting for approval', 1140000], ['Awaiting reclass', 60000]]);
});

test('a line billed 100% to an expensed customer is expensed in full, without approval', () => {
  const plan = planBills(bills, config);
  const l = plan.lines.find((x) => x.lineId === DIRECT);
  assert.equal(l.wholeExpense, true);
  assert.equal(l.reclassCents, 200000);
  assert.ok(l.stamps.some((s) => s.field === 'billbackStatusTag' && s.value === 'To be expensed'));
  assert.ok(!dealGroups(plan, config).some((g) => g.lines.some((x) => x.lineId === DIRECT)));
});

test('the reclass entry moves only the expensed share, tagged to that customer', () => {
  const plan = planBills(bills, config);
  const l = plan.lines.find((x) => x.lineId === SPLIT);
  const accounts = new Map([[Number(l.rechargeCategoryId), { account_id: 1514521, account_label: '60030 Legal' }]]);
  const prep = prepareReclass({ lines: [l], accounts, config, date: '2026-11-30', ref: 'RK-T' });
  assert.deepEqual(prep.problems, []);
  const { request, billedOwners } = prep.runs[0].run.payload;
  assert.equal(request.transactions.length, 2);
  for (const t of request.transactions) {
    assert.equal(t.debit_amount ?? t.credit_amount, 600);
    assert.ok(t.tags.some((x) => x.id === MGMT));
    assert.match(t.bank_description, /5% share expensed for Fund II Employees Only/);
  }
  assert.deepEqual(billedOwners[SPLIT], [1027955, 1027954]);
  assert.equal(prep.runs[0].items[0].cents, 60000);
});

test('after the reclass posts: a split line is Allocated Pending Invoice until its other shares are invoiced, then Billed', async () => {
  const plan = planBills(bills, config);
  const l = plan.lines.find((x) => x.lineId === SPLIT);
  const accounts = new Map([[Number(l.rechargeCategoryId), { account_id: 1514521, account_label: '60030 Legal' }]]);
  const prep = prepareReclass({ lines: [l], accounts, config, date: '2026-11-30', ref: 'RK-T' });
  const statusSet = async (invoicedTags) => {
    const run = { id: 1, ref: 'RK-T', status: 'created', payload: prep.runs[0].run.payload };
    const updates = [];
    const store = {
      getReclass: async () => ({ ...run }),
      updateReclass: async (id, f) => Object.assign(run, f),
      reclassRunItems: async () => [{ line_id: SPLIT, bill_id: bills[0].id, cents: 60000 }],
      itemsForLines: async () => invoicedTags.map((t) => ({ line_id: SPLIT, customer_tag_id: t })),
    };
    const api = { getBill: async () => structuredClone(bills[0]), updateBill: async (u) => updates.push(u) };
    await advanceReclass(1, { store, api, config, log: () => {} });
    const line = updates[0].lines.find((x) => x.id === SPLIT);
    return line.tags.find((t) => Object.values(config.billbackStatusTags).includes(t.id ?? t)).id ?? null;
  };
  assert.equal(await statusSet([]), config.billbackStatusTags['Allocated Pending Invoice']);
  assert.equal(await statusSet([1027955, 1027954]), config.billbackStatusTags.Billed);
});
