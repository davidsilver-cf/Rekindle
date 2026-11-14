import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { planBills } from '../src/engine.js';
import { buildInvoicePdf, invoiceData } from '../src/invoice-pdf.js';
import { textWidth, wrap } from '../src/pdf.js';

const config = JSON.parse(readFileSync(new URL('../config/rekindle.json', import.meta.url), 'utf8'));
const bills = JSON.parse(readFileSync(new URL('./fixtures/ABC_261106.json', import.meta.url), 'utf8'));
const plan = planBills(bills, config);
const emp = plan.customers.find((c) => c.customer.name === 'Fund II Employees Only');

// Pull the text drawn on each page out of the PDF's content streams.
const pageText = (buf) => [...buf.toString('latin1').matchAll(/stream\n([\s\S]*?)\nendstream/g)]
  .map((m) => inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1'))
  .map((ops) => [...ops.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)]
    .map((x) => x[1].replace(/\\([0-7]{3})/g, (_, o) => String.fromCharCode(parseInt(o, 8))).replace(/\\([()\\])/g, '$1')).join(' | '));

test('invoice data: one line per recharge category, totals match', () => {
  const d = invoiceData({ customer: emp, plan, branding: config.invoice, invoice: { date: '2026-11-13' } });
  assert.deepEqual(d.categories.map(({ category, cents, count }) => ({ category, cents, count })), [{ category: 'Legal', cents: 260000, count: 2 }]);
  assert.equal(d.totalCents, 260000);
  assert.equal(d.from, 'David Silver - Rekindle');
  assert.equal(d.due, null); // no terms configured
  const withTerms = invoiceData({ customer: emp, plan, branding: { termsDays: 30 }, invoice: { date: '2026-11-13' } });
  assert.equal(withTerms.due, '2026-12-13');
});

test('PDF is well-formed and shows the right amounts', () => {
  const buf = buildInvoicePdf({ customer: emp, plan, branding: config.invoice, invoice: { date: '2026-11-13' } });
  const s = buf.toString('latin1');
  assert.ok(s.startsWith('%PDF-1.4'));
  const xref = Number(s.match(/startxref\n(\d+)/)[1]);
  assert.equal(s.slice(xref, xref + 4), 'xref');
  const text = pageText(buf).join('\n');
  for (const t of ['INVOICE', 'Fund II Employees Only', '$2,600.00', '$2,000.00', '$600.00', '5%', 'DRAFT', 'ABC_261106', 'ABC Law Firm', 'Page 1 of 2', 'Fund II total', 'Fund II - Employees Only total']) {
    assert.ok(text.includes(t), t);
  }
});

test('long detail paginates with a footer on every page', () => {
  const big = structuredClone(bills[0]);
  big.lines = Array.from({ length: 40 }, (_, i) => ({ ...structuredClone(bills[0].lines[1]), id: 8000000 + i, amount: '100.00' }));
  const p2 = planBills([big], config);
  const pages = pageText(buildInvoicePdf({ customer: p2.customers[0], plan: p2, branding: {}, invoice: {} }));
  assert.ok(pages.length > 1);
  pages.forEach((t, i) => assert.ok(t.includes(`Page ${i + 1} of ${pages.length}`), `footer on page ${i + 1}`));
  assert.ok(pages.at(-1).includes('$4,000.00'));
});

test('text helpers', () => {
  assert.equal(textWidth('Hello', 10), 22.78);
  assert.deepEqual(wrap('one two three four', 40, 10), ['one two', 'three', 'four']);
});

test('multi-bill, multi-deal, multi-category scenario ties out to the cent', () => {
  const multi = JSON.parse(readFileSync(new URL('./fixtures/multi.json', import.meta.url), 'utf8'));
  const mp = planBills(multi, config);
  assert.equal(mp.totals.pendingCents, 6792835);
  assert.equal(mp.totals.ties, true);
  const owed = Object.fromEntries(mp.customers.map((c) => [c.customer.name, c.cents]));
  assert.deepEqual(owed, {
    'Fund II Main': 3312041, 'Deal XYZ': 1081240, 'Fund I': 1021000, 'Fund II Employees Only': 757549, 'Fund II Co-Invest': 621005,
  });
  // Every allocation split adds back to its line.
  for (const l of mp.lines.filter((x) => x.billingType === 'Allocation')) {
    assert.equal(l.billTo.reduce((s, b) => s + b.cents, 0), l.amountCents, `line ${l.lineId}`);
  }
  // Employees Only: six categories, mixing direct lines and 5% shares from three bills.
  const emp = mp.customers.find((c) => c.customer.name === 'Fund II Employees Only');
  const d = invoiceData({ customer: emp, plan: mp, branding: {}, invoice: { date: '2026-11-13' } });
  assert.deepEqual(d.categories.map((c) => [c.category, c.cents]), [
    ['Airfare', 7189], ['Consulting', 406250], ['Ground Transportation', 9633], ['Hotel Charges', 11582], ['Legal', 292416], ['Meals', 30479],
  ]);
  assert.equal(d.categories.reduce((s, c) => s + c.cents, 0), d.totalCents);
  // The PDF shows each category's line, its subtotal, and the deal behind each source line.
  const text = pageText(buildInvoicePdf({ customer: emp, plan: mp, branding: {}, invoice: { date: '2026-11-13' } })).join('\n');
  // Two deals feed this invoice: Fund II (5% shares) and its own deal (direct).
  assert.deepEqual(d.deals.map((g) => [g.deal, g.cents]), [['Fund II', 207000], ['Fund II - Employees Only', 550549]]);
  for (const t of ['Fund II total', '$2,070.00', 'Fund II - Employees Only total', '$5,505.49', 'Legal subtotal', '$924.16', '5% allocation', 'direct', 'Summit Advisory LLC', 'American Express', '$7,575.49']) {
    assert.ok(text.includes(t), t);
  }
});

test('diligence scenario: several deals billed to one fund, grouped by deal on the invoice', () => {
  const fx = JSON.parse(readFileSync(new URL('./fixtures/diligence.json', import.meta.url), 'utf8'));
  const cfg = { ...config, deals: [...config.deals, ...fx.deals] };
  const dp = planBills(fx.bills, cfg);
  assert.equal(dp.totals.ties, true);
  assert.equal(dp.lines.filter((l) => l.exception).length, 0);
  // Deal XYZ's line on the shared Amex bill stays off Fund I's invoice.
  assert.deepEqual(Object.fromEntries(dp.customers.map((c) => [c.customer.name, c.cents])), { 'Fund I': 7557296, 'Deal XYZ': 22010 });
  // The Cedar line with no Billing Type gets "Fund" from its deal's setup.
  assert.ok(dp.lines.find((l) => l.lineId === 9500103).stamps.some((s) => s.value === 'Fund'));

  const f1 = dp.customers.find((c) => c.customer.name === 'Fund I');
  const d = invoiceData({ customer: f1, plan: dp, branding: {}, invoice: { date: '2026-11-13' } });
  assert.equal(d.multiDeal, true);
  assert.deepEqual(d.deals.map((g) => [g.deal, g.cents]), [
    ['Fund I', 221000], ['Project Atlas', 4139693], ['Project Beacon', 2735468], ['Project Cedar', 461135],
  ]);
  for (const g of d.deals) assert.equal(g.categories.reduce((s, c) => s + c.cents, 0), g.cents, g.deal);
  assert.equal(d.deals.reduce((s, g) => s + g.cents, 0), d.totalCents);

  const pages = pageText(buildInvoicePdf({ customer: f1, plan: dp, branding: {}, invoice: { date: '2026-11-13' } }));
  const text = pages.join('\n');
  for (const t of ['Deal and category', 'Project Atlas total', '$41,396.93', 'Project Beacon total', '$27,354.68', 'Project Cedar total', '$4,611.35', 'Fund I total', 'Total due', '$75,572.96', '13 lines · 4 deals · 7 categories']) {
    assert.ok(text.includes(t), t);
  }
  // Total due is never alone on a page: it shares a page with at least one invoice line.
  const totalPage = pages.find((t) => t.includes('Total due'));
  assert.match(totalPage, /reimbursable expenses/);
});

test('single-deal invoices keep the simple layout', () => {
  const fund1Only = plan.customers.find((c) => c.customer.name === 'Fund I');
  const d = invoiceData({ customer: fund1Only, plan, branding: {}, invoice: {} });
  assert.equal(d.multiDeal, false);
  assert.ok(!pageText(buildInvoicePdf({ customer: fund1Only, plan, branding: {}, invoice: {} })).join('\n').includes('Deal and category'));
});

import { prepareInvoice } from '../src/invoicing.js';
test('three legal fees for one deal: three Campfire invoice lines, one summary line on the PDF', () => {
  const b = structuredClone(bills);
  const xyz = b[0].lines.find((l) => l.id === 9190921);
  b[0].lines.push({ ...structuredClone(xyz), id: 1, description: 'Legal Fee - Deal XYZ, round 2', amount: '2500.00' },
                  { ...structuredClone(xyz), id: 2, description: 'Legal Fee - Deal XYZ, closing', amount: '1250.50' });
  const p = planBills(b, config);
  const customer = p.customers.find((c) => c.customer.name === 'Deal XYZ');
  const prep = prepareInvoice({ customer, plan: p, config: { ...config, invoice: { ...config.invoice, productId: 777 } }, date: '2026-11-14', ref: 'RK-T' });
  assert.equal(prep.request.lines.length, 3);
  assert.deepEqual(prep.request.lines.map((l) => l.amount).sort((a, b) => a - b), [1250.5, 2500, 10000]);
  assert.equal(prep.request.lines.reduce((s, l) => s + Math.round(l.amount * 100), 0), customer.cents);
  const d = invoiceData({ customer, plan: p, branding: {}, invoice: {} });
  assert.deepEqual(d.categories.map((c) => [c.category, c.cents, c.count]), [['Legal', 1375050, 3]]);
  const text = pageText(buildInvoicePdf({ customer, plan: p, branding: {}, invoice: {} })).join('\n');
  // Exactly one summary line on the invoice page (the dash is stored as a WinAnsi byte).
  assert.equal((text.match(/Legal \x97 reimbursable expenses/g) || []).length, 1);
  assert.ok(text.includes('3 source lines'));
});
