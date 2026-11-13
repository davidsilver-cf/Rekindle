import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { planBills } from '../src/engine.js';
import { queuePage, dealsPage, approvalsPage, invoicesPage, esc } from '../src/ui.js';

const load = async (p) => JSON.parse(await readFile(new URL(p, import.meta.url), 'utf8'));
const config = await load('../config/rekindle.json');
const bills = await load('./fixtures/ABC_261106.json');
const ctx = (b = bills) => ({ config, plan: planBills(b, config), demo: true, write: false, loadedAt: 'now' });

test('screens show the expected totals', () => {
  assert.match(queuePage(ctx()), /\$32,000\.00/);
  const approvals = approvalsPage(ctx());
  for (const amt of ['$10,000.00', '$9,600.00', '$8,000.00', '$2,600.00', '$1,800.00']) assert.ok(approvals.includes(amt), amt);
  assert.match(invoicesPage(ctx(), 'Fund II Employees Only'), /\$600\.00/);
  assert.match(dealsPage(ctx(), 'Fund II'), /Total 100% · OK/);
});

test('values from Campfire are escaped', () => {
  const evil = structuredClone(bills);
  evil[0].lines[1].description = '<script>alert(1)</script>';
  evil[0].bill_number = '"><img src=x onerror=alert(1)>';
  const page = queuePage(ctx(evil));
  assert.ok(!page.includes('<script>alert(1)</script>'));
  assert.ok(!page.includes('<img src=x'));
  assert.equal(esc(`<a href="x">'&`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;');
});

test('exceptions show on the queue', () => {
  const bad = structuredClone(bills);
  bad[0].lines[1].tags = bad[0].lines[1].tags.filter((t) => t.group !== 46588);
  assert.match(queuePage(ctx(bad)), /No Deals tag on line/);
});

import { filterLines, lineState, readFilters } from '../src/ui.js';

test('line states and filters', () => {
  const plan = planBills(bills, config);
  assert.deepEqual(plan.lines.map(lineState), ['to_stamp', 'to_stamp', 'to_stamp', 'split']);
  const f = (qs) => filterLines(plan.lines, readFilters(new URLSearchParams(qs))).map((l) => l.lineId);
  assert.deepEqual(f(''), [9337492, 9190921, 9190922, 9190923]);
  assert.deepEqual(f('state=split'), [9190923]);
  assert.deepEqual(f('deal=Fund I'), [9190922]);
  assert.deepEqual(f('type=Fund'), [9337492, 9190922]);
  assert.deepEqual(f('q=employees'), [9337492]);
  assert.deepEqual(f('q=9190921'), [9190921]);
  assert.deepEqual(f('bill=NOPE'), []);
});

test('queue shows checkboxes only for lines that can be stamped, and only when writing is on', () => {
  const live = { ...ctx(), demo: false, write: true };
  const page = queuePage(live);
  assert.equal((page.match(/class="pick"/g) || []).length, 3);
  assert.match(page, /id="select-all"/);
  assert.equal((queuePage(ctx()).match(/class="pick"/g) || []).length, 0); // demo: no selection
});
