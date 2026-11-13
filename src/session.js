// Signed session cookie: base64url(JSON) + "." + HMAC-SHA256.
// Holds { email, name, via, exp }. Nothing secret is stored in it.
import { createHmac, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'rekindle_session';
const TTL_SECONDS = 12 * 60 * 60;

function secret() {
  const s = process.env.SESSION_SECRET || process.env.REKINDLE_ADMIN_TOKEN;
  if (!s) throw new Error('SESSION_SECRET is not set');
  return s;
}

const b64 = (s) => Buffer.from(s).toString('base64url');
const sign = (data) => createHmac('sha256', secret()).update(data).digest('base64url');

export function makeSession(user, now = Date.now()) {
  const data = b64(JSON.stringify({ ...user, exp: Math.floor(now / 1000) + TTL_SECONDS }));
  return `${data}.${sign(data)}`;
}

export function readSession(value, now = Date.now()) {
  if (!value || !value.includes('.')) return null;
  const [data, mac] = value.split('.');
  const expected = sign(data);
  const a = Buffer.from(expected);
  const b = Buffer.from(mac || '');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const s = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (!s.exp || s.exp * 1000 < now) return null;
    return s;
  } catch {
    return null;
  }
}

export function sessionCookie(value, req, maxAge = TTL_SECONDS) {
  const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`;
}

export function cookieValue(req, name) {
  const m = (req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

const emails = (v) => (v || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);

// Admins: REKINDLE_ADMINS emails, or anyone who signed in with the access token.
export function isAdmin(user) {
  if (!user) return false;
  if (user.via === 'token') return true;
  return emails(process.env.REKINDLE_ADMINS).includes(String(user.email).toLowerCase());
}

// Who may sign in with Google: the allowed domain and/or listed people.
export function allowedToSignIn(email) {
  const e = String(email || '').toLowerCase();
  const domain = (process.env.REKINDLE_ALLOWED_DOMAIN || '').toLowerCase().trim();
  const extra = emails(process.env.REKINDLE_ALLOWED_EMAILS);
  if (extra.includes(e) || emails(process.env.REKINDLE_ADMINS).includes(e)) return true;
  return Boolean(domain) && e.endsWith(`@${domain}`);
}
