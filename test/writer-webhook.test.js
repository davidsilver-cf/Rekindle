import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHmac } from 'node:crypto';
import { planBills } from '../src/engine.js';
import { buildBillUpdate } from '../src/writer.js';
import { verifySignature } from '../src/webhook.js';

const load = async (p) => JSON.parse(await readFile(new URL(p, import.meta.url), 'utf8'));
const config = await load('../config/rekindle.json');
const bills = await load('./fixtures/ABC_261106.json');

test('update sends every line, adds Billback Customer tags, keeps existing tags', () => {
  const plan = planBills(bills, config);
  const update = buildBillUpdate(bills[0], plan.lines);
  assert.equal(update.lines.length, 4);

  const tags = (id) => update.lines.find((l) => l.id === id).tags.map((t) => t.id);
  assert.deepEqual(tags(9190921), [1027801, 1027811, 1027943, 1027957]); // + Deal XYZ billback tag
  assert.deepEqual(tags(9190922), [1027811, 1027943, 1027964, 1027953]); // + Fund I
  assert.deepEqual(tags(9337492), [1027811, 1027943, 1028616, 1027956]); // + Employees Only
  assert.deepEqual(tags(9190923), [1027811, 1027943, 1027965]); // allocation: unchanged

  // Billing type and other values carried through untouched.
  assert.equal(update.lines.find((l) => l.id === 9190923).custom_field_defaultbillingtype, 'Allocation');
  assert.equal(update.lines.find((l) => l.id === 9190921).amount, '10000.00');
  assert.equal(update.changes.length, 3);
});

test('a bill that is already stamped produces no update (no webhook loop)', () => {
  const plan1 = planBills(bills, config);
  const update = buildBillUpdate(bills[0], plan1.lines);
  const stamped = structuredClone(bills);
  stamped[0].lines.forEach((l) => {
    const sent = update.lines.find((u) => u.id === l.id);
    l.tags = sent.tags.map((t) => ({ ...t, group: t.id === 1027957 || t.id === 1027953 || t.id === 1027956 ? 46612 : bills[0].lines.flatMap((x) => x.tags).find((x) => x.id === t.id).group, is_deleted: false }));
  });
  const plan2 = planBills(stamped, config);
  assert.equal(buildBillUpdate(stamped[0], plan2.lines), null);
});

test('blank billing type is written as a custom field', () => {
  const blank = structuredClone(bills);
  delete blank[0].lines[1].custom_field_defaultbillingtype;
  const update = buildBillUpdate(blank[0], planBills(blank, config).lines);
  assert.equal(update.lines.find((l) => l.id === 9190921).custom_field_defaultbillingtype, 'Deal');
});

test('webhook signature: accepts a good one, rejects tampering and stale timestamps', () => {
  const secret = 'whsec_test';
  const rawBody = '{"topic":"Bill.updated","data":{"id":5913145}}';
  const now = Date.now();
  const timestamp = String(Math.floor(now / 1000));
  const signature = createHmac('sha256', secret).update(`${timestamp}:${rawBody}`).digest('hex');

  assert.equal(verifySignature({ secret, timestamp, signature, rawBody, now }).ok, true);
  assert.equal(verifySignature({ secret, timestamp, signature, rawBody: rawBody + ' ', now }).ok, false);
  assert.equal(verifySignature({ secret, timestamp, signature, rawBody, now: now + 10 * 60 * 1000 }).ok, false);
  assert.equal(verifySignature({ secret: undefined, timestamp, signature, rawBody, now }).ok, false);
});

test('update carries the bill header unchanged for a full PUT', () => {
  const update = buildBillUpdate(bills[0], planBills(bills, config).lines);
  for (const k of ['bill_number', 'bill_date', 'due_date', 'entity', 'vendor']) {
    assert.equal(update.header[k], bills[0][k], k);
  }
  assert.ok(!('lines' in update.header));
  assert.ok(!('total_amount' in update.header));
});

test('updateBill tries PATCH first and falls back to PUT with the header on 405', async () => {
  process.env.CAMPFIRE_API_KEY = 'test-key';
  const { updateBill } = await import('../src/campfire.js');
  const update = buildBillUpdate(bills[0], planBills(bills, config).lines);
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    calls.push({ method: opts.method, body: JSON.parse(opts.body) });
    if (opts.method === 'PATCH') return new Response('not allowed', { status: 405 });
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    await updateBill(update);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.CAMPFIRE_API_KEY;
  }
  assert.deepEqual(calls.map((c) => c.method), ['PATCH', 'PUT']);
  assert.deepEqual(Object.keys(calls[0].body), ['lines']);
  assert.equal(calls[1].body.bill_number, 'ABC_261106');
  assert.equal(calls[1].body.due_date, '2026-12-06');
  assert.equal(calls[1].body.lines.length, 4);
});

test('stamping selected lines only changes those lines', async () => {
  process.env.CAMPFIRE_API_KEY = 'test-key';
  process.env.REKINDLE_WRITE = 'true';
  const { processBills } = await import('../src/process.js');
  const sent = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    sent.push(JSON.parse(opts.body));
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const { results } = await processBills(structuredClone(bills), { lineIds: new Set([9190922]), log: () => {} });
    assert.equal(results.length, 1);
    assert.deepEqual(results[0].changes.map((c) => c.lineId), [9190922]);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.CAMPFIRE_API_KEY;
    delete process.env.REKINDLE_WRITE;
  }
  const tags = (id) => sent[0].lines.find((l) => l.id === id).tags.map((t) => t.id);
  assert.deepEqual(tags(9190922), [1027811, 1027943, 1027964, 1027953]); // Fund I tag added
  assert.deepEqual(tags(9190921), [1027801, 1027811, 1027943]); // Deal XYZ untouched
  assert.deepEqual(tags(9337492), [1027811, 1027943, 1028616]); // Employees Only untouched
});
