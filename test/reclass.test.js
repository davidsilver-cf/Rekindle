// Reclass end to end against a stand-in Campfire: an Expense line is stamped
// To be expensed, an admin sets the Legal expense account, posts the reclass
// journal entry, and the line is marked Expensed. Nothing is posted twice.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';

const PENDING = 1027943, TO_EXPENSE = 1027949, EXPENSED = 1027950, LEGAL = 1027811;
const bills = JSON.parse(readFileSync(new URL('./fixtures/ABC_261106.json', import.meta.url), 'utf8'));
// Fund I's line is not billed back: AP marked it Expense. It has a department and a vendor.
for (const l of bills[0].lines) l.account = 1484989; // 13190's account id, as Campfire sends it
const line = bills[0].lines.find((l) => l.id === 9190922);
line.custom_field_defaultbillingtype = 'Expense';
line.department = 137571;
const statusNames = { [PENDING]: 'Pending', [TO_EXPENSE]: 'To be expensed', [EXPENSED]: 'Expensed' };
const tag = (id, name, group, customer = null) => ({ id, name, group, customer, is_active: true, is_deleted: false });
const tags = {
  46588: [tag(1027801, 'Deal XYZ', 46588), tag(1027964, 'Fund I', 46588), tag(1027965, 'Fund II', 46588), tag(1028616, 'Fund II - Employees Only', 46588)],
  46612: [tag(1027957, 'Deal XYZ', 46612, 22874410), tag(1027953, 'Fund I', 46612, 22874359), tag(1027955, 'Fund II Main', 46612, 22874366), tag(1027954, 'Fund II Co-Invest', 46612, 22874367), tag(1027956, 'Fund II Employees Only', 46612, 22874368)],
  47765: [tag(1078262, 'Deal', 47765), tag(1078263, 'Fund', 47765)],
  46589: [tag(LEGAL, 'Legal', 46589), tag(1027806, 'Expense - Meals', 46589), tag(1027807, 'Expense - Travel', 46589), tag(1027999, 'Zebra', 46589)],
};
const sent = { jes: [], patches: [], tags: [], customers: [] };
const customers = [];
let failNext = null;
const fake = http.createServer((req, res) => {
  let body = [];
  req.on('data', (c) => body.push(c));
  req.on('end', () => {
    body = Buffer.concat(body).toString();
    const url = new URL(req.url, 'http://x');
    const json = (status, obj) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
    if (url.pathname === '/coa/api/v1/bill' && req.method === 'GET') return json(200, { results: bills });
    const m = url.pathname.match(/^\/coa\/api\/v1\/bill\/(\d+)$/);
    if (m && req.method === 'GET') return json(200, bills.find((b) => b.id === Number(m[1])));
    if (m && req.method === 'PATCH') {
      const b = bills.find((x) => x.id === Number(m[1]));
      const update = JSON.parse(body);
      sent.patches.push(update);
      for (const l of b.lines) {
        const u = update.lines.find((x) => x.id === l.id);
        for (const [k, v] of Object.entries(u)) if (k.startsWith('custom_field_')) l[k] = v;
        l.tags = u.tags.map((t) => b.lines.flatMap((x) => x.tags).find((x) => x.id === t.id) || { id: t.id, group: 46610, name: statusNames[t.id], is_deleted: false });
      }
      return json(200, b);
    }
    if (url.pathname === '/coa/api/tag' && req.method === 'POST') {
      const t = JSON.parse(body);
      sent.tags.push(t);
      const made = tag(2000000 + sent.tags.length, t.name, t.group, null); // Campfire ignores customer on create
      (tags[t.group] = tags[t.group] || []).push(made);
      return json(201, made);
    }
    if (url.pathname === '/coa/api/v1/tag' || url.pathname === '/coa/api/tag') { const r = tags[url.searchParams.get('group')] || []; return json(200, { results: r }); }
    if (url.pathname === '/coa/api/vendor' && req.method === 'GET') return json(200, { results: customers.filter((c) => c.name.toLowerCase().includes((url.searchParams.get('q') || '').toLowerCase())) });
    if (url.pathname === '/coa/api/vendor' && req.method === 'POST') {
      const c = { id: 3000000 + customers.length + 1, vendor_type: 'customer', ...JSON.parse(body) };
      customers.push(c);
      sent.customers.push(c);
      return json(201, c);
    }
    if (url.pathname === '/coa/api/account/balance-sheet') return json(200, { results: [{ id: 6100, name: 'Legal expense', number: '6100', name_and_number: '6100 - Legal expense', status: 'ACTIVE' }, { id: 6200, name: 'Travel', number: '6200', status: 'ACTIVE' }, { id: 6300, name: 'Expense - Meals', number: '6300', name_and_number: '6300 - Expense - Meals', status: 'ACTIVE', default_tags: [{ id: 1027806, name: 'Expense - Meals', group: 46589 }] }] });
    if (url.pathname === '/coa/api/journal_entry' && req.method === 'POST') {
      if (failNext === '400') { failNext = null; return json(400, { transactions: ['bad account'] }); }
      const je = JSON.parse(body);
      sent.jes.push(je);
      return json(201, { id: 880 + sent.jes.length, order: `JE-${sent.jes.length}`, ...je });
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
    REKINDLE_WRITE: 'true', REKINDLE_ALLOW_MEMORY_STORE: 'true', REKINDLE_INVOICE_PRODUCT_ID: '777',
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
const get = (p) => fetch(base + p, { headers: { cookie: admin() }, redirect: 'manual' });
const post = (p, form) => fetch(base + p, { method: 'POST', redirect: 'manual', headers: { cookie: admin(), 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form) });
const statusOf = (id) => bills[0].lines.find((l) => l.id === id).tags.find((t) => statusNames[t.id])?.id;

test('stamping an Expense line marks it To be expensed', async () => {
  const r = await post('/run-now', { scope: 'all' });
  assert.equal(r.status, 303);
  assert.equal(statusOf(9190922), TO_EXPENSE);
  assert.equal(statusOf(9190921), PENDING); // billable lines keep Pending
});

test('Reclass screen waits for an expense account, then posts one journal entry and marks the line Expensed', async () => {
  let page = await (await get('/reclass')).text();
  assert.match(page, /1 line waiting · \$8,000\.00/);
  assert.match(page, /No expense account for Legal/);
  assert.equal((page.match(/class="pick"/g) || []).length, 0);

  // Settings lists categories and expense accounts; set Legal → 6100.
  const settings = await (await get('/settings')).text();
  assert.match(settings, /Reclass accounts/);
  assert.match(settings, /<option value="6100\|6100 - Legal expense">/);
  assert.equal((await post('/settings/reclass-account', { category: String(LEGAL), category_name: 'Legal', account: '6100|6100 - Legal expense' })).headers.get('location'), '/settings?reclass=saved#reclass-accounts');

  page = await (await get('/reclass')).text();
  assert.equal((page.match(/class="pick"/g) || []).length, 1);
  assert.match(page, /6100 - Legal expense/);

  const confirm = await (await post('/reclass/confirm', { line: '9190922', date: '2026-11-30' })).text();
  assert.match(confirm, /Dr 6100 - Legal expense/);
  assert.match(confirm, /dated 2026-11-30/);
  assert.equal(sent.jes.length, 0);

  const r = await post('/reclass/create', { line: '9190922', date: '2026-11-30', confirm: 'yes' });
  assert.equal(r.headers.get('location'), '/reclass?done=1&partial=0&held=0&failed=0');
  const je = sent.jes[0];
  assert.equal(je.date, '2026-11-30');
  assert.equal(je.type, 'journal_entry');
  assert.equal(je.entity, 57560);
  assert.match(je.ref_number, /^RK-RC-/);
  const [dr, cr] = je.transactions;
  assert.deepEqual([dr.account, dr.debit_amount_native, dr.credit_amount_native], [6100, 8000, undefined]);
  assert.deepEqual([cr.account, cr.credit_amount_native], [line.account, 8000]);
  assert.equal(dr.department, 137571);
  // Tags: the line's deal and category, Billback Status = Expensed (not Pending / To be expensed).
  for (const t of [dr, cr]) assert.deepEqual(t.tags.map((x) => x.id).sort(), [1027964, EXPENSED, LEGAL].sort());
  assert.equal(statusOf(9190922), EXPENSED);

  page = await (await get('/reclass')).text();
  assert.match(page, /No Expense lines waiting/);
  assert.match(page, /<a href="https:\/\/app\.meetcampfire\.com\/v2\/accounting\/journal-entry\/881" target="_blank" rel="noopener" title="Open in Campfire">JE-1<\/a>/);
  assert.match(page, />Complete</);
  // The bill panel shows it.
  assert.match(await (await fetch(`${base}/campfire/panel/bill/${bills[0].id}`, { headers: { cookie: admin(), 'sec-fetch-dest': 'iframe' } })).text(), /Reclassed · JE <a href="https:\/\/app\.meetcampfire\.com\/v2\/accounting\/journal-entry\/881" target="_top"/);
  // Posting again does nothing.
  assert.equal((await post('/reclass/create', { line: '9190922', date: '2026-11-30', confirm: 'yes' })).headers.get('location'), '/reclass?nothing=1');
  assert.equal(sent.jes.length, 1);
});

test('a refused journal entry releases the line; non-admins cannot post', async () => {
  const { getStore } = await import('../src/store.js');
  const store = await getStore();
  // Put a second Expense line in play: Deal XYZ's line.
  const l2 = bills[0].lines.find((l) => l.id === 9190921);
  l2.custom_field_defaultbillingtype = 'Expense';
  failNext = '400';
  const r = await post('/reclass/create', { line: '9190921', date: '2026-11-30', confirm: 'yes' });
  assert.equal(r.headers.get('location'), '/reclass?done=0&partial=0&held=0&failed=1');
  assert.ok(!(await store.reclassedLines()).has(9190921));
  assert.match(await (await get('/reclass')).text(), /Campfire refused the journal entry/);
  const viewer = `rekindle_session=${makeSession({ email: 'pat@campfire.ai', name: 'Pat', via: 'google' })}`;
  assert.equal((await fetch(`${base}/reclass/create`, { method: 'POST', headers: { cookie: viewer, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'line=9190921&confirm=yes' })).status, 403);
});

test('matchAccount: default tag first, then same name, then contains', async () => {
  const { matchAccount } = await import('../src/reclass.js');
  const accts = [{ id: 1, name: 'Legal' }, { id: 2, name: 'Legal & Professional', tagIds: [] }, { id: 3, name: 'Meals', tagIds: [99] }, { id: 4, name: 'Travel and Expense' }];
  assert.equal(matchAccount({ id: 99, name: 'Expense - Meals' }, accts).id, 3);
  assert.equal(matchAccount({ id: 5, name: 'legal' }, accts).id, 1);
  assert.equal(matchAccount({ id: 6, name: 'Travel & Expense' }, accts).id, 4);
  assert.equal(matchAccount({ id: 7, name: 'Zebra' }, accts), null);
});

test('Fill by name sets unset categories and leaves set ones alone', async () => {
  const page = await (await get('/settings')).text();
  assert.match(page, /Fill by name \(2\)/); // Legal already set; Meals matches by tag; Expense - Travel contains Travel; Zebra has none
  assert.match(page, /Suggested: 6300 - Expense - Meals/);
  assert.equal((await post('/settings/reclass-accounts/fill', {})).headers.get('location'), '/settings?reclass=filled&n=2#reclass-accounts');
  const { getStore } = await import('../src/store.js');
  const saved = await (await getStore()).getReclassAccounts();
  assert.equal(saved.get(1027806).account_id, 6300);
  assert.equal(saved.get(1027807).account_id, 6200);
  assert.equal(saved.get(LEGAL).account_id, 6100);
  assert.ok(!saved.get(1027999));
});

test('New deal: creates the company, its Billback Customer tag and the Deals tag in Campfire, sets it up, and never duplicates', async () => {
  const page = await (await get('/deals')).text();
  assert.match(page, /href="\/deals\/new">New deal</);
  assert.match(await (await get('/deals/new')).text(), /<option value="new">New company…<\/option>/);
  // Validation: a deal that exists, a missing company name.
  let r = await post('/deals/create', { name: 'Fund I', billingType: 'Fund', customer: '1027953' });
  assert.equal(r.status, 400);
  assert.match(await r.text(), /already a deal called/);
  r = await post('/deals/create', { name: 'Project Atlas', billingType: 'Deal', customer: 'new', companyName: '' });
  assert.match(await r.text(), /Enter the new company/);

  r = await post('/deals/create', { name: 'Project Atlas', billingType: 'Deal', customer: 'new', companyName: 'Atlas Holdings', companyEmail: 'ap@atlas.com', approver: 'pat@campfire.ai' });
  assert.equal(r.headers.get('location'), '/deals?deal=Project%20Atlas&created=1');
  assert.deepEqual(sent.customers.map((c) => [c.vendor_type, c.name, c.email]), [['customer', 'Atlas Holdings', 'ap@atlas.com']]);
  assert.deepEqual(sent.tags.map((t) => [t.name, t.group]), [['Atlas Holdings', 46612], ['Project Atlas', 46588]]);
  assert.equal(sent.tags[0].customer, sent.customers[0].id);
  const page2 = await (await get('/deals?deal=Project%20Atlas')).text();
  assert.match(page2, /Deal · bills Atlas Holdings/);
  assert.match(page2, /<b>pat@campfire\.ai<\/b> approves/);
  // The Billback Customer is linked to the new customer even though Campfire didn't store it on the tag.
  const { loadConfig } = await import('../src/config.js');
  const cfg = await loadConfig();
  assert.equal(cfg.billbackCustomers.find((c) => c.name === 'Atlas Holdings').customerId, sent.customers[0].id);
  // A second try with the same names doesn't create anything new.
  r = await post('/deals/create', { name: 'Project Atlas', billingType: 'Deal', customer: 'new', companyName: 'Atlas Holdings' });
  assert.equal(r.status, 400);
  assert.equal(sent.customers.length, 1);
  assert.equal(sent.tags.length, 2);
  // Allocation: created, then owners next.
  r = await post('/deals/create', { name: 'Project Beacon', billingType: 'Allocation' });
  assert.equal(r.headers.get('location'), '/deals?deal=Project%20Beacon&created=1&owners=1');
  // Non-admins can't.
  const viewer = `rekindle_session=${makeSession({ email: 'pat@campfire.ai', name: 'Pat', via: 'google' })}`;
  assert.equal((await fetch(`${base}/deals/new`, { headers: { cookie: viewer } })).status, 403);
});

test('Change the split: current owners end the day before, new ones start on the date, and bad totals are refused', async () => {
  const bad = await post('/deals/change-split', { deal: '1027965', date: '2026-07-01', new_0_customer: '1027955', new_0_percent: '70', new_1_customer: '1027954', new_1_percent: '20' });
  assert.equal(bad.status, 400);
  assert.match(await bad.text(), /Not saved: Owners total 90% from 2026-07-01/);
  const ok = await post('/deals/change-split', { deal: '1027965', date: '2026-07-01', new_0_customer: '1027955', new_0_percent: '70', new_1_customer: '1027954', new_1_percent: '25', new_2_customer: '1027956', new_2_percent: '5' });
  assert.equal(ok.headers.get('location'), '/deals?deal=Fund%20II&saved=1');
  const { loadConfig } = await import('../src/config.js');
  const rows = (await loadConfig()).allocations.filter((a) => a.dealsTagId === 1027965).map((a) => [a.customer.name, a.percent, a.start, a.end]);
  assert.deepEqual(rows, [
    ['Fund II Main', 80, null, '2026-06-30'], ['Fund II Co-Invest', 15, null, '2026-06-30'], ['Fund II Employees Only', 5, null, '2026-06-30'],
    ['Fund II Main', 70, '2026-07-01', null], ['Fund II Co-Invest', 25, '2026-07-01', null], ['Fund II Employees Only', 5, '2026-07-01', null],
  ]);
  // A bill dated before the change keeps the old split; one after uses the new one.
  const { activeOwners } = await import('../src/engine.js');
  const cfg = await loadConfig();
  assert.deepEqual(activeOwners(cfg, 1027965, '2026-06-15').map((a) => a.percent), [80, 15, 5]);
  assert.deepEqual(activeOwners(cfg, 1027965, '2026-07-15').map((a) => a.percent), [70, 25, 5]);
});

test('Billing Group: a dropdown on the deal, saved per deal, and only admins can change it', async () => {
  let page = await (await get('/deals?deal=Fund%20I')).text();
  assert.match(page, /<span class="small muted">Billing group<\/span>/);
  assert.match(page, /<option value="1078263">Fund<\/option>/);
  assert.equal((await post('/deals/billing-group', { deal: '1027964', group: '1078263' })).headers.get('location'), '/deals?deal=Fund%20I&saved=1');
  page = await (await get('/deals?deal=Fund%20I')).text();
  assert.match(page, /<option value="1078263" selected>Fund<\/option>/);
  const { loadConfig } = await import('../src/config.js');
  assert.deepEqual((await loadConfig()).deals.find((d) => d.dealsTagId === 1027964).billingGroup, { id: 1078263, name: 'Fund' });
  assert.equal((await post('/deals/billing-group', { deal: '1027964', group: '999' })).status, 400);
  assert.equal((await post('/deals/billing-group', { deal: '1027964', group: '' })).status, 303);
  assert.equal((await loadConfig()).deals.find((d) => d.dealsTagId === 1027964).billingGroup, null);
  const viewer = `rekindle_session=${makeSession({ email: 'pat@campfire.ai', name: 'Pat', via: 'google' })}`;
  assert.equal((await fetch(`${base}/deals/billing-group`, { method: 'POST', headers: { cookie: viewer, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'deal=1027964&group=1078262' })).status, 403);
});

test('Invoices: Billing Group filter limits customers and amounts to that group\'s deals, and carries through to create', async () => {
  await post('/deals/billing-group', { deal: '1027965', group: '1078263' }); // Fund II → Fund
  let page = await (await get('/invoices')).text();
  assert.match(page, /<span>Billing group<\/span><select name="group">/);
  const names = (p) => [...p.matchAll(/<a href="\/invoices\?customer=([^"&]+)/g)].map((m) => decodeURIComponent(m[1])).sort();
  const all = names(page);
  page = await (await get('/invoices?group=1078263')).text();
  assert.match(page, /Showing only <b>Fund<\/b> deals/);
  const fund = names(page);
  assert.ok(fund.length > 0 && fund.every((n) => n.startsWith('Fund II')), fund.join());
  assert.match(page, /&amp;group=1078263|&group=1078263/);
  assert.match(page, /<input type="hidden" name="group" value="1078263">/);
  page = await (await get('/invoices?group=none')).text();
  assert.deepEqual(names(page), all.filter((n) => !fund.includes(n) || n === 'Fund II Employees Only'));
});

test('a Billback Customer tag with no customer attached links to the Campfire customer with the same name', async () => {
  tags[46612].push(tag(1077715, 'Caribbean Oil', 46612, null));
  customers.push({ id: 23409329, vendor_type: 'customer', name: 'Caribbean  oil', status: 'ACTIVE' });
  const { loadConfig } = await import('../src/config.js');
  const cfg = await loadConfig();
  assert.equal(cfg.billbackCustomers.find((c) => c.name === 'Caribbean Oil').customerId, 23409329);
});
