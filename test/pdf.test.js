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
  .map((ops) => [...ops.matchAll(/\(((?:\\.|[^\\)])*)\) Tj/g)].map((x) => x[1].replace(/\\([()\\])/g, '$1')).join(' | '));

test('invoice data: one line per recharge category, totals match', () => {
  const d = invoiceData({ customer: emp, plan, branding: config.invoice, invoice: { date: '2026-11-13' } });
  assert.deepEqual(d.categories, [{ category: 'Legal', cents: 260000, count: 2 }]);
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
  for (const t of ['INVOICE', 'Fund II Employees Only', '$2,600.00', '$2,000.00', '$600.00', '5%', 'DRAFT', 'ABC_261106', 'ABC Law Firm', 'Page 1 of 1']) {
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
