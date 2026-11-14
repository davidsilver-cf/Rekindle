// Connect Rekindle to Campfire as an OAuth app (Settings → Apps in Campfire),
// no libraries. Authorization-code flow with PKCE; tokens are kept in the
// database, encrypted, and refreshed before they expire.
//
// Endpoints come from Campfire's OAuth discovery document unless set with
// CAMPFIRE_AUTHORIZE_URL / CAMPFIRE_TOKEN_URL. Scopes: CAMPFIRE_OAUTH_SCOPES
// (space- or comma-separated); blank asks for the app's own allowed scopes.
import { randomBytes, createHash, createCipheriv, createDecipheriv, createHmac, createPublicKey, verify as verifySig, timingSafeEqual } from 'node:crypto';

const BASE = () => process.env.CAMPFIRE_BASE_URL || 'https://api.meetcampfire.com';
export const oauthConfigured = () => Boolean(process.env.CAMPFIRE_CLIENT_ID && process.env.CAMPFIRE_CLIENT_SECRET);
export const IDENTITY_SCOPES = ['openid', 'email', 'profile'];

export function redirectUri(req) {
  if (process.env.CAMPFIRE_REDIRECT_URI) return process.env.CAMPFIRE_REDIRECT_URI;
  const proto = req.headers['x-forwarded-proto'] || 'http';
  return `${proto}://${req.headers.host}/auth/campfire/callback`;
}

// ---- Discovery (cached for an hour; a failure isn't cached)
let discovered = null;
export async function discovery({ fresh = false } = {}) {
  if (!fresh && discovered && discovered.at > Date.now() - 3600_000) return discovered.doc;
  const tries = [];
  if (process.env.CAMPFIRE_OAUTH_ISSUER) tries.push(new URL('/.well-known/oauth-authorization-server', process.env.CAMPFIRE_OAUTH_ISSUER).href);
  tries.push(new URL('/.well-known/oauth-authorization-server', BASE()).href, new URL('/.well-known/openid-configuration', BASE()).href);
  let doc = {};
  const errors = [];
  for (const url of tries) {
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (res.ok) { doc = { ...(await res.json()), _from: url }; break; }
      errors.push(`${url}: ${res.status}`);
    } catch (err) { errors.push(`${url}: ${err.message}`); }
  }
  doc = {
    ...doc,
    authorization_endpoint: process.env.CAMPFIRE_AUTHORIZE_URL || doc.authorization_endpoint,
    token_endpoint: process.env.CAMPFIRE_TOKEN_URL || doc.token_endpoint,
    _errors: doc._from ? [] : errors,
  };
  if (!doc.authorization_endpoint || !doc.token_endpoint) {
    throw new Error(`Couldn't find Campfire's OAuth endpoints (${errors.join('; ') || 'not in discovery'}). Set CAMPFIRE_AUTHORIZE_URL and CAMPFIRE_TOKEN_URL on Render.`);
  }
  discovered = { at: Date.now(), doc };
  return doc;
}
export const resetDiscovery = () => { discovered = null; };

const resourceScopes = () => (process.env.CAMPFIRE_OAUTH_SCOPES || '').split(/[\s,]+/).filter(Boolean);

// Start the flow. purpose: 'connect' (Rekindle gets API access to the
// workspace) or 'login' (just who you are). Returns the URL and the values the
// callback must check, which the caller keeps in a short-lived cookie.
export async function startAuth(req, purpose) {
  const doc = await discovery();
  const state = randomBytes(16).toString('base64url');
  const nonce = randomBytes(16).toString('base64url');
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const scopes = purpose === 'connect' ? [...new Set([...resourceScopes(), ...IDENTITY_SCOPES])] : IDENTITY_SCOPES;
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.CAMPFIRE_CLIENT_ID,
    redirect_uri: redirectUri(req),
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  // Connecting with no scopes configured: leave scope off, so Campfire offers
  // the app's own allowed scopes, plus identity so we know who connected.
  params.set('scope', scopes.join(' '));
  if (purpose === 'connect' && !resourceScopes().length) params.delete('scope');
  return { url: `${doc.authorization_endpoint}?${params}`, state, nonce, verifier, purpose };
}

async function tokenRequest(form) {
  const doc = await discovery();
  const methods = doc.token_endpoint_auth_methods_supported || ['client_secret_post'];
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' };
  const body = new URLSearchParams(form);
  if (!methods.includes('client_secret_post') && methods.includes('client_secret_basic')) {
    headers.Authorization = `Basic ${Buffer.from(`${encodeURIComponent(process.env.CAMPFIRE_CLIENT_ID)}:${encodeURIComponent(process.env.CAMPFIRE_CLIENT_SECRET)}`).toString('base64')}`;
  } else {
    body.set('client_id', process.env.CAMPFIRE_CLIENT_ID);
    body.set('client_secret', process.env.CAMPFIRE_CLIENT_SECRET);
  }
  const res = await fetch(doc.token_endpoint, { method: 'POST', headers, body });
  const text = await res.text();
  let json = {};
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  if (!res.ok) {
    const err = new Error(`Campfire token request failed (${res.status}): ${json.error_description || json.error || text.slice(0, 200)}`);
    err.status = res.status;
    err.code = json.error;
    throw err;
  }
  return json;
}

// The token response as a connection record (tokens still in the clear here).
function toConnection(tok, previous = {}) {
  return {
    access_token: tok.access_token,
    refresh_token: tok.refresh_token || previous.refresh_token || null,
    token_type: tok.token_type || 'Bearer',
    expires_at: tok.expires_in ? new Date(Date.now() + Number(tok.expires_in) * 1000).toISOString() : null,
    scope: tok.scope || previous.scope || null,
    workspace: tok.workspace || tok.organization || previous.workspace || null,
  };
}

export async function finishAuth(req, code, { verifier, nonce }) {
  const tok = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri(req), code_verifier: verifier });
  // What came back (names only, never values), to see what Campfire sends.
  console.log(JSON.stringify({ event: 'campfire_token_response', fields: Object.keys(tok), scope: tok.scope || null, idToken: Boolean(tok.id_token) }));
  const who = await identify(tok, nonce);
  return { who, connection: toConnection(tok) };
}

// Who signed in: the ID token's claims (it came straight from the token
// endpoint over TLS with our secret, so the claims can be read as-is; we still
// check audience, expiry and nonce), else the userinfo endpoint.
async function identify(tok, nonce) {
  let c = null;
  const part = String(tok.id_token || '').split('.')[1];
  if (part) {
    c = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
    const aud = [].concat(c.aud || []);
    if (aud.length && !aud.includes(process.env.CAMPFIRE_CLIENT_ID)) throw new Error('ID token is for another app');
    if (c.exp && c.exp * 1000 < Date.now()) throw new Error('ID token expired');
    if (c.nonce && c.nonce !== nonce) throw new Error('ID token nonce mismatch');
  }
  if (!c?.email) {
    const doc = await discovery();
    if (doc.userinfo_endpoint) {
      const res = await fetch(doc.userinfo_endpoint, { headers: { Authorization: `${tok.token_type || 'Bearer'} ${tok.access_token}`, Accept: 'application/json' } });
      if (res.ok) c = await res.json();
      console.log(JSON.stringify({ event: 'campfire_userinfo', status: res.status, fields: res.ok && c ? Object.keys(c) : [] }));
    }
  }
  // Some token responses carry the user alongside the token.
  if (!c?.email && (tok.user?.email || tok.email)) c = { ...(tok.user || {}), email: tok.user?.email || tok.email };
  if (!c?.email) return null; // the caller decides whether it needs to know
  if (c.email_verified === false) throw new Error('Campfire email not verified');
  return {
    email: String(c.email).toLowerCase(),
    name: c.name || [c.given_name, c.family_name].filter(Boolean).join(' ') || c.email,
    workspace: c.workspace || c.workspace_id || c.org || c.organization || null,
  };
}

export async function refreshConnection(conn) {
  if (!conn.refresh_token) throw Object.assign(new Error('The Campfire connection has expired and has no refresh token. Reconnect on the Settings screen.'), { status: 401 });
  const tok = await tokenRequest({ grant_type: 'refresh_token', refresh_token: conn.refresh_token });
  return { ...conn, ...toConnection(tok, conn) };
}

export async function revoke(conn) {
  const doc = await discovery().catch(() => ({}));
  if (!doc.revocation_endpoint) return false;
  for (const [token, hint] of [[conn.refresh_token, 'refresh_token'], [conn.access_token, 'access_token']]) {
    if (!token) continue;
    await fetch(doc.revocation_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token, token_type_hint: hint, client_id: process.env.CAMPFIRE_CLIENT_ID, client_secret: process.env.CAMPFIRE_CLIENT_SECRET }),
    }).catch(() => {});
  }
  return true;
}

// ---- Tokens at rest: AES-256-GCM with a key derived from SESSION_SECRET.
const tokenKey = () => createHash('sha256').update(`rekindle-campfire-tokens:${process.env.SESSION_SECRET || process.env.REKINDLE_ADMIN_TOKEN || ''}`).digest();
export function seal(text) {
  if (text == null) return null;
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', tokenKey(), iv);
  const data = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return `v1.${iv.toString('base64url')}.${c.getAuthTag().toString('base64url')}.${data.toString('base64url')}`;
}
export function unseal(sealed) {
  if (sealed == null) return null;
  const [v, iv, tag, data] = String(sealed).split('.');
  if (v !== 'v1') throw new Error('unknown token format');
  const d = createDecipheriv('aes-256-gcm', tokenKey(), Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(data, 'base64url')), d.final()]).toString('utf8');
}

// ---- cf_ctx: the signed context Campfire adds when it opens the Manage URL.
// Accepted only as a JWT whose signature checks out: HS256 with
// CAMPFIRE_CONTEXT_SECRET (or the client secret), or RS256/ES256 with a key
// from Campfire's JWKS. Anything else is refused; the caller falls back to a
// normal Campfire sign-in.
let jwksCache = null;
async function jwks() {
  if (jwksCache && jwksCache.at > Date.now() - 3600_000) return jwksCache.keys;
  const doc = await discovery().catch(() => ({}));
  if (!doc.jwks_uri) return [];
  const res = await fetch(doc.jwks_uri, { headers: { Accept: 'application/json' } });
  const keys = res.ok ? (await res.json()).keys || [] : [];
  jwksCache = { at: Date.now(), keys };
  return keys;
}

export async function verifyContext(token, { now = Date.now() } = {}) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('cf_ctx is not a signed token');
  const [h, p, s] = parts;
  const header = JSON.parse(Buffer.from(h, 'base64url').toString('utf8'));
  const claims = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
  const signed = Buffer.from(`${h}.${p}`);
  const sig = Buffer.from(s, 'base64url');
  let ok = false;
  if (header.alg === 'HS256') {
    for (const secret of [process.env.CAMPFIRE_CONTEXT_SECRET, process.env.CAMPFIRE_CLIENT_SECRET].filter(Boolean)) {
      const want = createHmac('sha256', secret).update(signed).digest();
      if (want.length === sig.length && timingSafeEqual(want, sig)) { ok = true; break; }
    }
  } else if (['RS256', 'ES256'].includes(header.alg)) {
    const key = (await jwks()).find((k) => !header.kid || k.kid === header.kid);
    if (key) {
      const pub = createPublicKey({ key, format: 'jwk' });
      ok = verifySig('sha256', signed, header.alg === 'ES256' ? { key: pub, dsaEncoding: 'ieee-p1363' } : pub, sig);
    }
  } else {
    throw new Error(`cf_ctx uses ${header.alg || 'no'} signing, which Rekindle doesn't accept`);
  }
  if (!ok) throw new Error("cf_ctx signature didn't check out");
  if (claims.exp && claims.exp * 1000 < now - 60_000) throw new Error('cf_ctx expired');
  if (claims.iat && claims.iat * 1000 < now - 15 * 60_000 && !claims.exp) throw new Error('cf_ctx too old');
  const aud = [].concat(claims.aud || []);
  if (aud.length && !aud.includes(process.env.CAMPFIRE_CLIENT_ID)) throw new Error('cf_ctx is for another app');
  const email = claims.email || claims.user?.email;
  return {
    email: email ? String(email).toLowerCase() : null,
    name: claims.name || claims.user?.name || email,
    workspace: claims.workspace || claims.workspace_id || claims.org || null,
    claims,
  };
}
