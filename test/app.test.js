// End-to-end: the real server against a stand-in Campfire, memory store.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';

const bills = JSON.parse(readFileSync(new URL('./fixtures/ABC_261106.json', import.meta.url), 'utf8'));
// Live tags in the stand-in Campfire: the four starter deals plus a new one
// ("Project Atlas") that has no setup yet, and the Billback Customer tags.
const tag = (id, name, group, customer = null) => ({ id, name, group, customer, is_active: true, is_deleted: false });
const tags = {
  46588: [tag(1027801, 'Deal XYZ', 46588), tag(1027964, 'Fund I', 46588), tag(1027965, 'Fund II', 46588), tag(1028616, 'Fund II - Employees Only', 46588), tag(1029001, 'Project Atlas', 46588)],
  46612: [tag(1027957, 'Deal XYZ', 46612, 22874410), tag(1027953, 'Fund I', 46612, 22874359), tag(1027955, 'Fund II Main', 46612, 22874366), tag(1027954, 'Fund II Co-Invest', 46612, 22874367), tag(1027956, 'Fund II Employees Only', 46612, 22874368)],
};
const atlasBill = structuredClone(bills[0]);
atlasBill.id = 5990001; atlasBill.bill_number = 'HP-24117';
atlasBill.lines = [{ ...structuredClone(bills[0].lines[1]), id: 9500101, description: 'Legal due diligence, Atlas', amount: '14250.00',
  tags: [{ id: 1029001, group: 46588, name: 'Project Atlas', is_deleted: false }, { id: 1027811, group: 46589, name: 'Legal', is_deleted: false }, { id: 1027943, group: 46610, name: 'Pending', is_deleted: false }] }];
delete atlasBill.lines[0].custom_field_defaultbillingtype;
let served = bills;
const fake = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/coa/api/v1/bill') return res.end(JSON.stringify({ count: served.length, results: served }));
  if (url.pathname === '/coa/api/tag') { const r = tags[url.searchParams.get('group')] || []; return res.end(JSON.stringify({ count: r.length, results: r })); }
  res.statusCode = 404; res.end();
});

let base, server, makeSession, readIdToken, allowedToSignIn;
before(async () => {
  await new Promise((r) => fake.listen(0, r));
  Object.assign(process.env, {
    CAMPFIRE_API_KEY: 'fake', CAMPFIRE_BASE_URL: `http://localhost:${fake.address().port}`,
    REKINDLE_ADMIN_TOKEN: 'tok', SESSION_SECRET: 'test-secret', REKINDLE_ADMINS: 'david@campfire.ai',
    REKINDLE_ALLOWED_DOMAIN: 'campfire.ai', GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'csecret',
  });
  delete process.env.DATABASE_URL;
  ({ makeSession, allowedToSignIn } = await import('../src/session.js'));
  ({ readIdToken } = await import('../src/google.js'));
  const { createServer } = await import('../src/server.js');
  server = createServer();
  await new Promise((r) => server.listen(0, r));
  base = `http://localhost:${server.address().port}`;
});
after(() => { server.close(); fake.close(); });

const as = (email) => `rekindle_session=${makeSession({ email, name: email, via: 'google' })}`;
const get = (path, cookie) => fetch(base + path, { headers: cookie ? { cookie } : {}, redirect: 'manual' });
const post = (path, form, cookie) => fetch(base + path, {
  method: 'POST', redirect: 'manual',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...(cookie ? { cookie } : {}) },
  body: new URLSearchParams(form),
});
const approveForms = (html) => [...html.matchAll(/name="deal" value="(\d+)"><input type="hidden" name="fingerprint" value="([0-9a-f]+)"/g)].map((m) => ({ deal: m[1], fp: m[2] }));

test('screens need sign-in; login page offers Google', async () => {
  const r = await get('/approvals');
  assert.equal(r.status, 303);
  assert.equal(r.headers.get('location'), '/login');
  const login = await (await get('/login')).text();
  assert.match(login, /Sign in with Google/);
  assert.equal((await get('/auth/google')).headers.get('location').startsWith('https://accounts.google.com/'), true);
});

test('per-deal approval: only the approver decides; changes need re-approval', async () => {
  const admin = as('david@campfire.ai');
  const lee = as('lee@campfire.ai');
  const pat = as('pat@campfire.ai');

  // Non-admins can't set approvers.
  assert.equal((await post('/deals/approver', { deal: '1027965', email: 'lee@campfire.ai' }, pat)).status, 403);
  // Admin sets Lee as Fund II's approver.
  assert.equal((await post('/deals/approver', { deal: '1027965', email: 'lee@campfire.ai' }, admin)).status, 303);
  assert.match(await (await get('/deals?deal=Fund%20II', admin)).text(), /<b>lee@campfire\.ai<\/b> approves/);

  // Lee sees exactly one Approve form (Fund II); admin sees the other three (no approver set).
  const leePage = await (await get('/approvals', lee)).text();
  const leeForms = approveForms(leePage);
  assert.deepEqual(leeForms.map((f) => f.deal), ['1027965']);
  assert.equal(approveForms(await (await get('/approvals', admin)).text()).length, 3);
  assert.equal(approveForms(await (await get('/approvals', pat)).text()).length, 0);

  // Pat can't approve Fund II.
  const denied = await post('/approvals/decide', { deal: '1027965', fingerprint: leeForms[0].fp, decision: 'approved' }, pat);
  assert.equal(denied.headers.get('location'), '/approvals?result=denied');

  // Lee approves.
  const ok = await post('/approvals/decide', { deal: '1027965', fingerprint: leeForms[0].fp, decision: 'approved', note: 'Split checked' }, lee);
  assert.equal(ok.headers.get('location'), '/approvals?result=approved');
  let page = await (await get('/approvals', admin)).text();
  assert.match(page, /Approved by lee@campfire\.ai/);
  assert.match(page, /Split checked/);
  assert.match(page, /1 of 4 deals approved/);

  // The Fund II line changes amount in Campfire: approval no longer matches.
  bills[0].lines[3].amount = '12500.00';
  page = await (await get('/approvals', admin)).text();
  assert.match(page, /Changed since approval/);
  assert.match(page, /0 of 4 deals approved/);
  // An approval posted against the old numbers is refused.
  const stale = await post('/approvals/decide', { deal: '1027965', fingerprint: leeForms[0].fp, decision: 'approved' }, lee);
  assert.equal(stale.headers.get('location'), '/approvals?result=changed');
  bills[0].lines[3].amount = '12000.00';
});

test('everything approved → ready to invoice', async () => {
  const admin = as('david@campfire.ai');
  const lee = as('lee@campfire.ai');
  for (const f of approveForms(await (await get('/approvals', lee)).text())) {
    await post('/approvals/decide', { deal: f.deal, fingerprint: f.fp, decision: 'approved' }, lee);
  }
  for (const f of approveForms(await (await get('/approvals', admin)).text())) {
    await post('/approvals/decide', { deal: f.deal, fingerprint: f.fp, decision: 'approved' }, admin);
  }
  const page = await (await get('/approvals', admin)).text();
  assert.match(page, /4 of 4 deals approved/);
  assert.match(page, /All approved · preview invoices/);
});

test('bad input is refused', async () => {
  const admin = as('david@campfire.ai');
  assert.equal((await post('/deals/approver', { deal: '1027965', email: 'not-an-email' }, admin)).status, 400);
  assert.equal((await post('/deals/approver', { deal: '999', email: 'a@b.co' }, admin)).status, 400);
  assert.equal((await post('/approvals/decide', { deal: '1027965', fingerprint: 'x', decision: 'maybe' }, admin)).status, 400);
  // A forged or expired cookie is not a session.
  assert.equal((await get('/approvals', 'rekindle_session=eyJlbWFpbCI6ImRhdmlkQGNhbXBmaXJlLmFpIn0.fake')).status, 303);
});

test('Google sign-in rules', () => {
  assert.equal(allowedToSignIn('anyone@campfire.ai'), true);
  assert.equal(allowedToSignIn('someone@gmail.com'), false);
  assert.equal(allowedToSignIn('someone@evil-campfire.ai'), false);
  const tok = (claims) => `x.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.y`;
  const good = { iss: 'https://accounts.google.com', aud: 'cid', exp: Date.now() / 1000 + 60, nonce: 'n1', email: 'Lee@Campfire.ai', email_verified: true, name: 'Lee' };
  assert.deepEqual(readIdToken(tok(good), { nonce: 'n1' }), { email: 'lee@campfire.ai', name: 'Lee' });
  assert.throws(() => readIdToken(tok({ ...good, aud: 'other' }), { nonce: 'n1' }), /audience/);
  assert.throws(() => readIdToken(tok(good), { nonce: 'n2' }), /nonce/);
  assert.throws(() => readIdToken(tok({ ...good, email_verified: false }), { nonce: 'n1' }), /verified/);
  assert.throws(() => readIdToken(tok({ ...good, exp: 1 }), { nonce: 'n1' }), /expired/);
});

test('invoice PDF downloads for a customer in the run', async () => {
  const admin = as('david@campfire.ai');
  const r = await get('/invoices/pdf?customer=Fund%20II%20Employees%20Only', admin);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'application/pdf');
  assert.match(r.headers.get('content-disposition'), /Invoice-Fund-II-Employees-Only-DRAFT\.pdf/);
  const buf = Buffer.from(await r.arrayBuffer());
  assert.equal(buf.subarray(0, 5).toString(), '%PDF-');
  assert.match(buf.subarray(-6).toString(), /%%EOF/);
  assert.equal((await get('/invoices/pdf?customer=Nobody', admin)).status, 404);
  assert.equal((await get('/invoices/pdf?customer=Fund%20I')).status, 303); // needs sign-in
  assert.match(await (await get('/invoices?customer=Fund%20I', admin)).text(), /Download PDF/);
});


test('a new Deals tag shows as Needs setup; an admin sets it up and its lines bill', async () => {
  const admin = as('david@campfire.ai');
  served = [...bills, atlasBill];
  try {
    // The Atlas line is held as an exception until the deal is set up.
    let queue = await (await get('/?state=exception', admin)).text();
    assert.match(queue, /&quot;Project Atlas&quot; needs setup on the Deals screen/);
    let deals = await (await get('/deals', admin)).text();
    assert.match(deals, /1 needs setup/);
    assert.match(deals, /<b>Project Atlas<\/b><span style="color:#991B1B;font-weight:600">Needs setup · 1 pending line/);

    // Non-admins can't set up deals; bad setups are refused with a reason.
    assert.equal((await post('/deals/setup', { deal: '1029001', billingType: 'Fund', customer: '1027953' }, as('pat@campfire.ai'))).status, 403);
    let bad = await post('/deals/setup', { deal: '1029001', billingType: 'Fund', customer: '' }, admin);
    assert.equal(bad.status, 400);
    assert.match(await bad.text(), /A Fund deal needs the billback customer it bills/);
    bad = await post('/deals/setup', { deal: '1029001', billingType: 'Allocation', owner_0_customer: '1027953', owner_0_percent: '60', owner_1_customer: '1027955', owner_1_percent: '30' }, admin);
    assert.match(await bad.text(), /Owners total 90%; they must total 100%/);

    // Set Atlas up as a Fund deal billing Fund I.
    const ok = await post('/deals/setup', { deal: '1029001', billingType: 'Fund', customer: '1027953' }, admin);
    assert.equal(ok.headers.get('location'), '/deals?deal=Project%20Atlas&saved=1');
    deals = await (await get('/deals?deal=Project%20Atlas&saved=1', admin)).text();
    assert.match(deals, /All deals set up/);
    assert.match(deals, /Fund · bills Fund I/);

    // Its line now bills Fund I, alongside Fund I's own line.
    queue = await (await get('/?deal=Project%20Atlas', admin)).text();
    assert.match(queue, /To stamp/);
    const inv = await (await get('/invoices?customer=Fund%20I', admin)).text();
    assert.match(inv, /\$22,250\.00/); // $8,000 Fund I + $14,250 Atlas

    // Change Fund II's split on the Deals screen: 70 / 20 / 10.
    const split = await post('/deals/setup', { deal: '1027965', billingType: 'Allocation',
      owner_0_customer: '1027955', owner_0_percent: '70', owner_1_customer: '1027954', owner_1_percent: '20', owner_2_customer: '1027956', owner_2_percent: '10' }, admin);
    assert.equal(split.status, 303);
    const appr = await (await get('/approvals', admin)).text();
    assert.match(appr, /\$8,400\.00/); // 70% of $12,000 to Fund II Main
  } finally {
    served = bills;
  }
});
