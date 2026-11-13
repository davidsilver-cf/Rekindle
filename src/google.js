// Google sign-in (OAuth 2.0 authorization code flow), no libraries.
// The ID token comes straight from Google's token endpoint over TLS using our
// client secret, so per Google's guidance its claims can be read without
// re-verifying the signature; we still check issuer, audience, expiry,
// verified email and the nonce.
import { randomBytes } from 'node:crypto';

export const googleConfigured = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export function redirectUri(req) {
  if (process.env.GOOGLE_REDIRECT_URI) return process.env.GOOGLE_REDIRECT_URI;
  const proto = req.headers['x-forwarded-proto'] || 'http';
  return `${proto}://${req.headers.host}/auth/google/callback`;
}

export function startLogin(req) {
  const state = randomBytes(16).toString('base64url');
  const nonce = randomBytes(16).toString('base64url');
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(req),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    nonce,
    prompt: 'select_account',
  });
  const domain = process.env.REKINDLE_ALLOWED_DOMAIN;
  if (domain) params.set('hd', domain);
  return { url: `https://accounts.google.com/o/oauth2/v2/auth?${params}`, state, nonce };
}

export function readIdToken(idToken, { nonce, now = Date.now() }) {
  const part = String(idToken || '').split('.')[1];
  if (!part) throw new Error('no id token');
  const c = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(c.iss)) throw new Error('bad issuer');
  if (c.aud !== process.env.GOOGLE_CLIENT_ID) throw new Error('bad audience');
  if (!c.exp || c.exp * 1000 < now) throw new Error('token expired');
  if (c.nonce !== nonce) throw new Error('bad nonce');
  if (!c.email || c.email_verified !== true) throw new Error('email not verified');
  return { email: String(c.email).toLowerCase(), name: c.name || c.email };
}

export async function finishLogin(req, code, nonce) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri(req),
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed (${res.status})`);
  const body = await res.json();
  return readIdToken(body.id_token, { nonce });
}
