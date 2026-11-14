// End-to-end invoicing against a stand-in Campfire that records what it's sent
// and applies bill updates, so later reads see the new statuses.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const BILLED = 1027947;
const PARTLY = 1027946;
const PENDING = 1027943;
const bills = JSON.parse(readFileSync(new URL('./fixtures/ABC_261106.json', import.meta.url), 'utf8'));
const tag = (id, name, group, customer = null) => ({ id, name, group, customer, is_active: true, is_deleted: false });
const tags = {
  46588: [tag(1027801, 'Deal XYZ', 46588), tag(1027964, 'Fund I', 46588), tag(1027965, 'Fund II', 46588), tag(1028616, 'Fund II - Employees Only', 46588)],
  46612: [tag(1027957, 'Deal XYZ', 46612, 22874410), tag(1027953, 'Fund I', 46612, 22874359), tag(1027955, 'Fund II Main', 46612, 22874366), tag(1027954, 'Fund II Co-Invest', 46612, 22874367), tag(1027956, 'Fund II Employees Only', 46612, 22874368)],
};
const statusNames = { [PENDING]: 'Pending', [BILLED]: 'Billed', [PARTLY]: 'Allocated Pending Invoice' };

const sent = { invoices: [], uploads: [], patches: [] };
let failNext = null; // 'create400' | 'create500' | 'upload500'
let nextId = 9000;
const fake = http.createServer((req, res) => {
  let body = [];
  req.on('data', (c) => body.push(c));
  req.on('end', () => {
    body = Buffer.concat(body);
    const url = new URL(req.url, 'http://x');
    const json = (status, obj) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
    if (url.pathname === '/coa/api/v1/bill' && req.method === 'GET') return json(200, { count: bills.length, results: bills });
    const billMatch = url.pathname.match(/^\/coa\/api\/v1\/bill\/(\d+)$/);
    if (billMatch && req.method === 'GET') return json(200, bills.find((b) => b.id === Number(billMatch[1])));
    if (billMatch && req.method === 'PATCH') {
      const b = bills.find((x) => x.id === Number(billMatch[1]));
      const update = JSON.parse(body);
      sent.patches.push({ billId: b.id, update });
      for (const l of b.lines) {
        const u = update.lines.find((x) => x.id === l.id);
        l.tags = u.tags.map((t) => b.lines.flatMap((x) => x.tags).find((x) => x.id === t.id) || { id: t.id, group: 46610, name: statusNames[t.id] || `tag ${t.id}`, is_deleted: false });
      }
      return json(200, b);
    }
    if (url.pathname === '/coa/api/tag') { const r = tags[url.searchParams.get('group')] || []; return json(200, { count: r.length, results: r }); }
    if (url.pathname === '/coa/api/v1/invoice' && req.method === 'POST') {
      if (failNext === 'create400') { failNext = null; return json(400, { error: 'client: invalid' }); }
      if (failNext === 'create500') { failNext = null; return json(502, { error: 'bad gateway' }); }
      const inv = JSON.parse(body);
      const id = ++nextId;
      sent.invoices.push({ id, ...inv });
      return json(201, { id, invoice_number: `INV-${id}`, ...inv });
    }
    if (url.pathname === '/ca/api/file/upload' && req.method === 'POST') {
      if (failNext === 'upload500') { failNext = null; return json(500, { error: 'storage down' }); }
      sent.uploads.push({ model: url.searchParams.get('model'), objectId: Number(url.searchParams.get('object_id')), bytes: body.length, isPdf: body.includes(Buffer.from('%PDF-1.4')) });
      return json(200, {});
    }
    res.statusCode = 404; res.end();
  });
});

let base, server, makeSession;
before(async () => {
  await new Promise((r) => fake.listen(0, r));
  Object.assign(process.env, {
    CAMPFIRE_API_KEY: 'fake', CAMPFIRE_BASE_URL: `http://localhost:${fake.address().port}`,
    REKINDLE_ADMIN_TOKEN: 'tok', SESSION_SECRET: 'test-secret', REKINDLE_ADMINS: 'david@campfire.ai',
    REKINDLE_WRITE: 'true', REKINDLE_INVOICE_PRODUCT_ID: '777',
  });
  delete process.env.DATABASE_URL;
  ({ makeSession } = await import('../src/session.js'));
  const { createServer } = await import('../src/server.js');
  server = createServer();
  await new Promise((r) => server.listen(0, r));
  base = `http://localhost:${server.address().port}`;
});
after(() => { server.close(); fake.close(); });

const admin = () => `rekindle_session=${makeSession({ email: 'david@campfire.ai', name: 'David', via: 'google' })}`;
const get = (path) => fetch(base + path, { headers: { cookie: admin() }, redirect: 'manual' });
const post = (path, form) => fetch(base + path, { method: 'POST', redirect: 'manual', headers: { cookie: admin(), 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form) });
const statusOf = (lineId) => bills.flatMap((b) => b.lines).find((l) => l.id === lineId).tags.find((t) => [PENDING, BILLED, PARTLY].includes(t.id))?.id;
async function approveAll() {
  const page = await (await get('/approvals')).text();
  for (const m of page.matchAll(/name="deal" value="(\d+)"><input type="hidden" name="fingerprint" value="([0-9a-f]+)"/g)) {
    await post('/approvals/decide', { deal: m[1], fingerprint: m[2], decision: 'approved' });
  }
}
const createFor = async (...names) => {
  const form = new URLSearchParams();
  for (const n of names) form.append('customer', n);
  form.append('confirm', 'yes');
  return fetch(base + '/invoices/create', { method: 'POST', redirect: 'manual', headers: { cookie: admin(), 'Content-Type': 'application/x-www-form-urlencoded' }, body: form });
};

test('customers wait for approval before they can be invoiced', async () => {
  const page = await (await get('/invoices')).text();
  assert.match(page, /Waiting for approval/);
  assert.equal((page.match(/class="pick"/g) || []).length, 0);
  // Creating without approval does nothing.
  assert.equal((await createFor('Fund I')).headers.get('location'), '/invoices?nothing=1');
  assert.equal(sent.invoices.length, 0);
});

test('confirm page shows what will be created, then invoices are created end to end', async () => {
  await approveAll();
  let page = await (await get('/invoices')).text();
  assert.equal((page.match(/class="pick"/g) || []).length, 5);

  const confirm = await (await post('/invoices/confirm', { customer: 'Fund I' })).text();
  assert.match(confirm, /Create 1 invoice · \$8,000\.00/);
  assert.match(confirm, /This creates real invoices in Campfire/);
  assert.equal(sent.invoices.length, 0); // confirm creates nothing

  const r = await createFor('Fund I', 'Fund II Main');
  assert.equal(r.headers.get('location'), '/invoices?done=2&partial=0&held=0&failed=0');

  // Invoices sent to Campfire: client, entity, product, amounts, a reference.
  const byClient = (id) => sent.invoices.find((i) => i.client === id);
  const fund1 = byClient(22874359);
  const main = byClient(22874366);
  assert.equal(fund1.client, 22874359);
  assert.equal(fund1.entity, 57560);
  assert.match(fund1.ref_number, /^RK-/);
  assert.deepEqual(fund1.lines.map((l) => [l.product, l.amount, l.description]), [[777, 8000, 'Legal — reimbursable expenses (Fund I)']]);
  assert.equal(main.client, 22874366);
  assert.deepEqual(main.lines.map((l) => l.amount), [9600]);

  // Each got its PDF attached.
  assert.deepEqual(sent.uploads.map((u) => [u.model, u.objectId, u.isPdf]).sort((a, b) => a[1] - b[1]), [['invoice', fund1.id, true], ['invoice', main.id, true]].sort((a, b) => a[1] - b[1]));

  // Source lines: Fund I's line is Billed; Fund II's split line is partly invoiced.
  assert.equal(statusOf(9190922), BILLED);
  assert.equal(statusOf(9190923), PARTLY);
  assert.equal(statusOf(9190921), PENDING); // Deal XYZ untouched

  // What's left to invoice: not Fund I or Fund II Main; Fund II's other owners still owe their shares.
  page = await (await get('/invoices')).text();
  assert.doesNotMatch(page, /<b>Fund I<\/b><\/a>/);
  assert.doesNotMatch(page, /<b>Fund II Main<\/b><\/a>/);
  assert.match(page, /<b>Fund II Co-Invest<\/b>/);
  assert.match(page, /\$1,800\.00/);
  // History shows both, complete, with their Campfire numbers and PDFs.
  assert.match(page, new RegExp(`INV-${fund1.id}`));
  assert.equal((page.match(/>Complete</g) || []).length, 2);
  const pdf = await get(page.match(/href="(\/invoices\/run\/\d+\/pdf)"/)[1]);
  assert.equal(pdf.headers.get('content-type'), 'application/pdf');
  const text = [...Buffer.from(await pdf.arrayBuffer()).toString('latin1').matchAll(/stream\n([\s\S]*?)\nendstream/g)]
    .map((m) => inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1')).join('');
  assert.match(text, /\(INV-\d+\) Tj/); // the Campfire invoice number, not "Draft"
  assert.doesNotMatch(text, /\(DRAFT\) Tj/);

  // Fund II stays approved even though it's partly invoiced.
  assert.doesNotMatch(await (await get('/approvals')).text(), /Changed since approval/);
});

test('the last owners of a split mark the line Billed', async () => {
  const r = await createFor('Fund II Co-Invest', 'Fund II Employees Only');
  assert.equal(r.headers.get('location'), '/invoices?done=2&partial=0&held=0&failed=0');
  assert.equal(statusOf(9190923), BILLED);
  assert.equal(statusOf(9337492), BILLED);
  const emp = sent.invoices.find((i) => i.client === 22874368);
  // Employees Only: its own $2,000 line plus its 5% of Fund II, under two deals.
  assert.deepEqual(emp.lines.map((l) => [l.amount, l.description]), [
    [600, 'Fund II — Legal (reimbursable expenses)'],
    [2000, 'Fund II - Employees Only — Legal (reimbursable expenses)'],
  ]);
});

test('the same share can never be invoiced twice', async () => {
  const { getStore, ShareTakenError } = await import('../src/store.js');
  const store = await getStore();
  await assert.rejects(store.reserveInvoice({ ref: 'dup', customer_tag_id: 1027953, customer_name: 'Fund I', total_cents: 800000, invoice_date: '2026-11-14', due_date: '2026-11-14', created_by: 'x' },
    [{ lineId: 9190922, billId: 5913145, customerTagId: 1027953, cents: 800000, percent: 100 }]), ShareTakenError);
});

test('failures: refused, unknown and PDF failures are handled safely', async () => {
  const before = sent.invoices.length;
  // Campfire refuses: nothing created, Deal XYZ's line is released for another try.
  failNext = 'create400';
  assert.equal((await createFor('Deal XYZ')).headers.get('location'), '/invoices?done=0&partial=0&held=0&failed=1');
  let page = await (await get('/invoices')).text();
  assert.match(page, /Not created/);
  assert.match(page, /Campfire refused the invoice/);
  assert.equal(statusOf(9190921), PENDING);

  // Campfire errors: outcome unknown, held for a person; the share stays reserved.
  failNext = 'create500';
  assert.equal((await createFor('Deal XYZ')).headers.get('location'), '/invoices?done=0&partial=0&held=1&failed=0');
  page = await (await get('/invoices')).text();
  assert.match(page, /Check Campfire/);
  assert.doesNotMatch(page, /<b>Deal XYZ<\/b><\/a>/); // not offered again while unknown
  const unknownRun = page.match(/name="run" value="(\d+)">\s*<label class="filter" style="min-width:120px"><span>Campfire invoice ID/)[1];
  // Someone checks Campfire: it wasn't created. The line comes back.
  await post('/invoices/resolve', { run: unknownRun, outcome: 'not_created' });
  assert.match(await (await get('/invoices')).text(), /<b>Deal XYZ<\/b><\/a>/);

  // The invoice is created but the PDF upload fails: held at "created", Retry finishes it.
  failNext = 'upload500';
  assert.equal((await createFor('Deal XYZ')).headers.get('location'), '/invoices?done=0&partial=1&held=0&failed=0');
  page = await (await get('/invoices')).text();
  assert.match(page, /Created · PDF not attached/);
  assert.equal(statusOf(9190921), PENDING);
  const retryRun = page.match(/action="\/invoices\/retry"><input type="hidden" name="run" value="(\d+)"/)[1];
  assert.equal((await post('/invoices/retry', { run: retryRun })).headers.get('location'), '/invoices?retried=complete');
  assert.equal(statusOf(9190921), BILLED);
  // Only one Deal XYZ invoice was ever created in Campfire.
  assert.equal(sent.invoices.length - before, 1);
});
