// End-to-end: the real server against a stand-in Campfire, memory store.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';

const bills = JSON.parse(readFileSync(new URL('./fixtures/ABC_261106.json', import.meta.url), 'utf8'));
const fake = http.createServer((req, res) => {
  if (req.url.startsWith('/coa/api/v1/bill?')) return res.end(JSON.stringify({ count: bills.length, results: bills }));
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
