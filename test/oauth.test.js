// The Campfire OAuth app: connect (PKCE), API calls with the connection's
// token, refresh on expiry and on 401, Sign in with Campfire, the Manage URL's
// signed cf_ctx, and disconnect. Against a stand-in Campfire.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createHash, createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';

const bills = JSON.parse(readFileSync(new URL('./fixtures/ABC_261106.json', import.meta.url), 'utf8'));
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (claims, secret) => {
  const data = `${b64({ alg: secret ? 'HS256' : 'none', typ: 'JWT' })}.${b64(claims)}`;
  return `${data}.${secret ? createHmac('sha256', secret).update(data).digest('base64url') : ''}`;
};

const seen = { auth: [], token: [], api: [], revoked: [] };
let who = 'david@campfire.ai';
let tokenN = 0;
let expiresIn = 3600;
let rejectToken = null;
let noIdentity = false;
let forbidTags = false; // Campfire sends no ID token (identity scopes not granted) // an access token the API should refuse with 401
const codes = new Map();
const fake = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const url = new URL(req.url, 'http://x');
    const json = (status, o) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    const base = `http://localhost:${fake.address().port}`;
    if (url.pathname === '/.well-known/oauth-authorization-server') {
      return json(200, { issuer: base, authorization_endpoint: `${base}/oauth/authorize`, token_endpoint: `${base}/oauth/token`, revocation_endpoint: `${base}/oauth/revoke`,
        scopes_supported: ['accounting:read', 'accounting:write', 'openid', 'email', 'profile'], token_endpoint_auth_methods_supported: ['client_secret_post'] });
    }
    if (url.pathname === '/oauth/token') {
      const f = new URLSearchParams(body);
      seen.token.push(Object.fromEntries(f));
      if (f.get('client_secret') !== 'shh') return json(401, { error: 'invalid_client' });
      if (f.get('grant_type') === 'authorization_code') {
        const c = codes.get(f.get('code'));
        if (!c || createHash('sha256').update(f.get('code_verifier') || '').digest('base64url') !== c.challenge) return json(400, { error: 'invalid_grant' });
        codes.delete(f.get('code'));
        tokenN++;
        if (noIdentity) return json(200, { access_token: `at${tokenN}`, refresh_token: `rt${tokenN}`, token_type: 'bearer', expires_in: expiresIn, scope: 'accounting:read accounting:write' });
        return json(200, { access_token: `at${tokenN}`, refresh_token: `rt${tokenN}`, token_type: 'bearer', expires_in: expiresIn, scope: c.scope || 'accounting:read accounting:write openid email profile',
          id_token: jwt({ iss: base, aud: 'cid', email: c.who, email_verified: true, name: 'David Silver', nonce: c.nonce, exp: Math.floor(Date.now() / 1000) + 600, workspace: { id: 57560, name: 'David Silver - Rekindle' } }) });
      }
      if (f.get('grant_type') === 'refresh_token') {
        if (!/^rt\d+$/.test(f.get('refresh_token'))) return json(400, { error: 'invalid_grant' });
        tokenN++;
        return json(200, { access_token: `at${tokenN}`, token_type: 'Bearer', expires_in: 3600 });
      }
    }
    if (url.pathname === '/oauth/revoke') { seen.revoked.push(new URLSearchParams(body).get('token')); return json(200, {}); }
    if (url.pathname.startsWith('/coa/') || url.pathname.startsWith('/rr/')) {
      seen.api.push(req.headers.authorization);
      if (req.headers.authorization === `Bearer ${rejectToken}`) return json(401, { detail: 'token revoked' });
      if (url.pathname === '/coa/api/v1/bill') return json(200, { results: bills });
      if (url.pathname === '/coa/api/v1/tag') return json(404, { detail: 'Not found.' });
      if (url.pathname === '/coa/api/tag') {
        if (forbidTags && req.headers.authorization.startsWith('Bearer')) return json(403, { detail: 'You do not have permission to perform this action.' });
        return json(200, { results: [] });
      }
      return json(200, {});
    }
    res.statusCode = 404; res.end();
  });
});

let base, server, makeSession;
before(async () => {
  await new Promise((r) => fake.listen(0, r));
  Object.assign(process.env, {
    CAMPFIRE_BASE_URL: `http://localhost:${fake.address().port}`, CAMPFIRE_CLIENT_ID: 'cid', CAMPFIRE_CLIENT_SECRET: 'shh',
    REKINDLE_ADMIN_TOKEN: 'tok', SESSION_SECRET: 'test-secret', REKINDLE_ADMINS: 'david@campfire.ai', REKINDLE_ALLOWED_DOMAIN: 'campfire.ai',
    CAMPFIRE_OAUTH_SCOPES: 'accounting:read accounting:write',
  });
  delete process.env.CAMPFIRE_API_KEY;
  delete process.env.DATABASE_URL;
  ({ makeSession } = await import('../src/session.js'));
  const { createServer } = await import('../src/server.js');
  server = createServer();
  await new Promise((r) => server.listen(0, r));
  base = `http://localhost:${server.address().port}`;
});
after(() => { server.close(); fake.close(); });

const cookieOf = (res) => (res.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).filter((c) => !c.endsWith('=')).join('; ');
// Run the whole browser dance: start → Campfire authorize (approve) → callback.
async function dance(start, extraCookie = '') {
  const r1 = await fetch(base + start, { redirect: 'manual', headers: { cookie: extraCookie } });
  assert.equal(r1.status, 303, await r1.clone().text());
  const to = new URL(r1.headers.get('location'));
  assert.equal(to.pathname, '/oauth/authorize');
  const p = to.searchParams;
  seen.auth.push(Object.fromEntries(p));
  const code = `code${seen.auth.length}`;
  codes.set(code, { challenge: p.get('code_challenge'), nonce: p.get('nonce'), scope: p.get('scope'), who });
  const cookie = [cookieOf(r1), extraCookie].filter(Boolean).join('; ');
  return fetch(`${base}/auth/campfire/callback?code=${code}&state=${p.get('state')}`, { redirect: 'manual', headers: { cookie } });
}

test('Settings shows not connected and the endpoints Campfire publishes', async () => {
  const page = await (await fetch(`${base}/settings`, { headers: { cookie: `rekindle_session=${makeSession({ email: 'david@campfire.ai', name: 'D', via: 'google' })}` } })).text();
  assert.match(page, /Not connected\./);
  assert.match(page, /href="\/connect\/campfire">Connect Campfire/);
  assert.match(page, /\/oauth\/authorize/);
  assert.match(page, /Demo data/);
});

test('connecting: PKCE, scopes, tokens stored encrypted, then the API uses the connection', async () => {
  const r = await dance('/connect/campfire');
  assert.equal(r.status, 303);
  assert.equal(r.headers.get('location'), '/settings?connected=1');
  const a = seen.auth.at(-1);
  assert.equal(a.code_challenge_method, 'S256');
  assert.equal(a.client_id, 'cid');
  assert.match(a.redirect_uri, /\/auth\/campfire\/callback$/);
  assert.deepEqual(a.scope.split(' ').sort(), ['accounting:read', 'accounting:write', 'email', 'openid', 'profile']);
  assert.ok(seen.token.at(-1).code_verifier);

  const { getStore } = await import('../src/store.js');
  const row = await (await getStore()).getConnection();
  assert.match(row.access_token, /^v1\./); // sealed, not the raw token
  assert.ok(!row.access_token.includes('at1'));
  assert.equal(row.connected_by, 'david@campfire.ai');

  // Live now (not demo), calling Campfire with the bearer token.
  const cookie = cookieOf(r);
  const page = await (await fetch(`${base}/`, { headers: { cookie } })).text();
  assert.doesNotMatch(page, /Demo data/);
  assert.match(page, /Live from Campfire · Campfire app/);
  assert.equal(seen.api.at(-1), 'Bearer at1');
  const settings = await (await fetch(`${base}/settings`, { headers: { cookie } })).text();
  assert.match(settings, /Connected to Campfire<\/b> · David Silver - Rekindle/);
  assert.match(settings, /renewed automatically/);
});

test('a refused token is refreshed once and the call retried', async () => {
  rejectToken = 'at1';
  const cookie = `rekindle_session=${makeSession({ email: 'david@campfire.ai', name: 'D', via: 'campfire' })}`;
  const before = seen.api.length;
  const refreshesBefore = seen.token.filter((t) => t.grant_type === 'refresh_token').length;
  const res = await fetch(`${base}/`, { headers: { cookie } });
  assert.equal(res.status, 200);
  const calls = seen.api.slice(before);
  assert.ok(calls.includes('Bearer at1') && calls.at(-1) === 'Bearer at2', calls.join());
  // Calls made in parallel share one refresh.
  assert.equal(seen.token.filter((t) => t.grant_type === 'refresh_token').length - refreshesBefore, 1);
  assert.equal(seen.token.at(-1).grant_type, 'refresh_token');
  assert.equal(seen.token.at(-1).refresh_token, 'rt1'); // kept from the first grant
  rejectToken = null;
});

test('only admins can connect; others can still sign in with Campfire', async () => {
  who = 'pat@campfire.ai';
  const denied = await dance('/connect/campfire');
  assert.equal(denied.status, 403);
  assert.match(await denied.text(), /Only Rekindle admins can connect Campfire/);
  const ok = await dance('/auth/campfire');
  assert.equal(ok.headers.get('location'), '/');
  assert.deepEqual(seen.auth.at(-1).scope.split(' ').sort(), ['email', 'openid', 'profile']); // sign-in asks only who you are
  who = 'someone@elsewhere.com';
  assert.equal((await dance('/auth/campfire')).status, 403);
  who = 'david@campfire.ai';
  // The connection is still the admin's.
  const { getStore } = await import('../src/store.js');
  assert.equal((await (await getStore()).getConnection()).connected_by, 'david@campfire.ai');
});

test('callback refuses a wrong state, and shows Campfire errors', async () => {
  const r1 = await fetch(`${base}/auth/campfire`, { redirect: 'manual' });
  const r = await fetch(`${base}/auth/campfire/callback?code=x&state=wrong`, { headers: { cookie: cookieOf(r1) } });
  assert.equal(r.status, 400);
  assert.match(await r.text(), /expired or was interrupted/);
  const e = await fetch(`${base}/auth/campfire/callback?error=access_denied&error_description=User%20declined`);
  assert.match(await e.text(), /Campfire said: User declined/);
});

test('Manage URL: a valid signed cf_ctx signs in; a forged or unsigned one falls back to Campfire sign-in', async () => {
  const claims = { email: 'pat@campfire.ai', name: 'Pat', workspace: 57560, aud: 'cid', exp: Math.floor(Date.now() / 1000) + 300 };
  const good = await fetch(`${base}/campfire/manage?cf_ctx=${jwt(claims, 'shh')}`, { redirect: 'manual' });
  assert.equal(good.headers.get('location'), '/');
  assert.match(cookieOf(good), /rekindle_session=/);
  for (const bad of [jwt(claims, 'not-the-secret'), jwt(claims, null), jwt({ ...claims, exp: 1 }, 'shh'), jwt({ ...claims, aud: 'other' }, 'shh'), 'garbage']) {
    const r = await fetch(`${base}/campfire/manage?cf_ctx=${bad}`, { redirect: 'manual' });
    assert.equal(r.headers.get('location'), '/auth/campfire', bad);
    assert.equal(cookieOf(r), '');
  }
  // Someone Rekindle doesn't allow, even with a valid context, isn't signed in.
  const outsider = await fetch(`${base}/campfire/manage?cf_ctx=${jwt({ ...claims, email: 'x@elsewhere.com' }, 'shh')}`, { redirect: 'manual' });
  assert.equal(cookieOf(outsider), '');
});

test('a call the app is refused uses the API key while it is set, and Settings lists it', async () => {
  forbidTags = true;
  process.env.CAMPFIRE_API_KEY = 'key';
  try {
    const cookie = `rekindle_session=${makeSession({ email: 'david@campfire.ai', name: 'D', via: 'campfire' })}`;
    const before = seen.api.length;
    assert.equal((await fetch(`${base}/`, { headers: { cookie } })).status, 200);
    assert.ok(seen.api.slice(before).includes('Token key'));
    assert.ok(seen.api.slice(before).includes('Bearer at2'));
    const page = await (await fetch(`${base}/settings`, { headers: { cookie } })).text();
    assert.match(page, /Still using the API key/);
    assert.match(page, /GET \/coa\/api\/tag/);
  } finally { forbidTags = false; delete process.env.CAMPFIRE_API_KEY; }
});

test('login page offers Sign in with Campfire; health reports the connection', async () => {
  assert.match(await (await fetch(`${base}/login`)).text(), /href="\/auth\/campfire">Sign in with Campfire/);
  const h = await (await fetch(`${base}/health`)).json();
  assert.equal(h.campfireApp, true);
  assert.equal(h.campfireConnected, true);
});

test('disconnect revokes the tokens and goes back to demo', async () => {
  const cookie = `rekindle_session=${makeSession({ email: 'david@campfire.ai', name: 'D', via: 'campfire' })}`;
  const notAdmin = `rekindle_session=${makeSession({ email: 'pat@campfire.ai', name: 'P', via: 'campfire' })}`;
  assert.equal((await fetch(`${base}/connect/campfire/disconnect`, { method: 'POST', headers: { cookie: notAdmin }, redirect: 'manual' })).status, 403);
  const r = await fetch(`${base}/connect/campfire/disconnect`, { method: 'POST', headers: { cookie }, redirect: 'manual' });
  assert.equal(r.headers.get('location'), '/settings?disconnected=1');
  assert.ok(seen.revoked.includes('rt1'));
  assert.match(await (await fetch(`${base}/`, { headers: { cookie } })).text(), /Demo data/);
});

test('without identity from Campfire: an admin signed in to Rekindle can still connect; sign-in explains', async () => {
  noIdentity = true;
  try {
    const cookie = `rekindle_session=${makeSession({ email: 'david@campfire.ai', name: 'D', via: 'google' })}`;
    const r = await dance('/connect/campfire', cookie);
    assert.equal(r.headers.get('location'), '/settings?connected=1');
    const { getStore } = await import('../src/store.js');
    assert.equal((await (await getStore()).getConnection()).connected_by, 'david@campfire.ai');
    // Not signed in to Rekindle: can't tell it's an admin.
    const anon = await dance('/connect/campfire');
    assert.equal(anon.status, 400);
    assert.match(await anon.text(), /Sign in to Rekindle first/);
    const login = await dance('/auth/campfire');
    assert.match(await login.text(), /Campfire didn&#39;t say who you are|Campfire didn't say who you are/);
  } finally { noIdentity = false; }
});
