import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ageDays, bucketOf, unbilledRows, invoiceRows, dashboardData } from '../src/dashboard.js';
import { dashboardCsv } from '../src/dashboard-ui.js';

const config = { tagGroups: { deals: 1 } };
const cust = (name) => ({ name, billbackTagId: name.length });
const line = (o) => ({ lineId: 1, billId: 9, billNumber: 'B1', billDate: '2026-10-01', amountCents: 10000, dealsTag: 'Fund II', rechargeCategory: 'Legal', billingType: 'Deal', exception: null, billTo: [{ customer: cust('Main'), cents: 10000, percent: 100, invoiced: false }], ...o });

test('aging buckets by days since the bill date', () => {
  assert.equal(ageDays('2026-10-01', '2026-11-16'), 46);
  assert.equal(bucketOf(0), 'a30'); assert.equal(bucketOf(30), 'a30'); assert.equal(bucketOf(31), 'a60');
  assert.equal(bucketOf(90), 'a90'); assert.equal(bucketOf(91), 'a90p');
});

test('unbilled: only the uninvoiced part of a split; stages', () => {
  const plan = { lines: [
    line({ lineId: 1 }),
    line({ lineId: 2, billingType: 'Allocation', billTo: [{ customer: cust('Main'), cents: 6000, invoiced: true }, { customer: cust('CoInvest'), cents: 4000, invoiced: false }] }),
    line({ lineId: 3, billingType: 'Expense', billTo: [] }),
    line({ lineId: 4, exception: 'No Deals tag on line', dealsTag: undefined, billTo: [] }),
    line({ lineId: 5, billTo: [{ customer: cust('Main'), cents: 10000, invoiced: true }] }),
  ] };
  const rows = unbilledRows(plan, [{ status: 'approved', lines: [{ lineId: 1 }] }], '2026-11-16');
  assert.deepEqual(rows.map((r) => [r.lineId, r.cents, r.stage]), [
    [1, 10000, 'Approved · ready to invoice'], [2, 4000, 'Waiting for approval'], [3, 10000, 'Awaiting reclass'], [4, 10000, 'Needs setup'],
  ]);
  assert.equal(rows[3].deal, 'No deal');
});

test('invoices: deal lines only, paid spread by amount, voided skipped, past due flagged', () => {
  const inv = (o) => ({ id: 1, invoice_number: 'INV-1', invoice_date: '2026-10-01', due_date: '2026-10-31', status: 'partially_paid', client_name: 'Main (CUST-0000002)', total_amount: '300.00', amount_paid: '150.00', amount_due: '150.00',
    lines: [{ amount: '200.00', tags: [{ group: 1, name: 'A' }] }, { amount: '100.00', tags: [{ group: 1, name: 'B' }] }], ...o });
  const rows = invoiceRows([inv(), inv({ id: 2, status: 'voided' }), inv({ id: 3, lines: [{ amount: '5', tags: [] }] })], config, '2026-11-16');
  assert.deepEqual(rows.map((r) => [r.deal, r.cents, r.paidCents, r.dueCents, r.customer, r.overdue]), [['A', 20000, 10000, 10000, 'Main', true], ['B', 10000, 5000, 5000, 'Main', true]]);
});

test('dashboard data: KPIs, by deal, by customer, one deal, CSV', () => {
  const plan = { lines: [line({ lineId: 1, billDate: '2026-07-01' }), line({ lineId: 2, dealsTag: 'Deal XYZ', billDate: '2026-11-10' })] };
  const invoices = [{ id: 5, invoice_number: 'INV-5', invoice_date: '2026-11-01', due_date: '2026-12-01', status: 'paid', client_name: 'Main', total_amount: '50.00', amount_paid: '50.00', amount_due: '0', lines: [{ amount: '50.00', tags: [{ group: 1, name: 'Fund II' }] }] }];
  const d = dashboardData({ plan, groups: [], invoices, config, today: '2026-11-16' });
  assert.equal(d.kpis.unbilledCents, 20000);
  assert.equal(d.kpis.over90Cents, 10000);
  assert.equal(d.kpis.oldestDays, 138);
  assert.equal(d.kpis.collectedPct, 1);
  assert.deepEqual(d.byDeal.map((r) => [r.deal, r.unbilledCents, r.invoicedCents]), [['Deal XYZ', 10000, 0], ['Fund II', 10000, 5000]]);
  assert.deepEqual(d.byCustomer.map((r) => [r.customer, r.toInvoiceCents, r.collectedCents]), [['Main', 20000, 5000]]);
  const one = dashboardData({ plan, groups: [], invoices, config, today: '2026-11-16', deal: 'Deal XYZ' });
  assert.equal(one.kpis.unbilledCents, 10000);
  assert.equal(one.kpis.invoicedCents, 0);
  assert.match(dashboardCsv(d, 'deals'), /^Deal,Unbilled,0–30 days/);
  assert.match(dashboardCsv({ ...d, unbilled: [{ ...d.unbilled[0], description: '=HYPERLINK("x")' }] }, 'unbilled'), /"'=HYPERLINK\(""x""\)"/);
});
