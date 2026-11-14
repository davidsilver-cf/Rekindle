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

// kind: a session cookie has none; a link token says k:'link'. Each is only
// accepted where its own kind is expected.
export function readSession(value, now = Date.now(), kind = undefined) {
  if (!value || !value.includes('.')) return null;
  const [data, mac] = value.split('.');
  const expected = sign(data);
  const a = Buffer.from(expected);
  const b = Buffer.from(mac || '');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const s = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (!s.exp || s.exp * 1000 < now) return null;
    if (s.k !== kind) return null;
    return s;
  } catch {
    return null;
  }
}

// Over HTTPS the cookie is SameSite=None so Rekindle still knows you when it's
// shown inside Campfire (panels, navigation). Cross-site POSTs are refused by
// the server's origin check instead.
// Set from inside Campfire's frame, the cookie is also Partitioned: browsers
// that block third-party cookies still keep it, just for Rekindle-in-Campfire.
export function sessionCookie(value, req, maxAge = TTL_SECONDS) {
  const https = req.headers['x-forwarded-proto'] === 'https';
  const framed = req.headers['sec-fetch-dest'] === 'iframe';
  return `${SESSION_COOKIE}=${value}; HttpOnly; ${https ? `SameSite=None; Secure${framed ? '; Partitioned' : ''}` : 'SameSite=Lax'}; Path=/; Max-Age=${maxAge}`;
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
  const admins = emails(process.env.REKINDLE_ADMINS);
  if (user.campfireUserId != null && admins.includes(`campfire:${user.campfireUserId}`)) return true;
  const e = String(user.email).toLowerCase();
  return admins.includes(e) || settingsAdmins.has(e);
}

// Admins added on the Settings screen, kept in the database; the server
// refreshes this copy (see refreshAdmins in server.js).
let settingsAdmins = new Set();
export const setSettingsAdmins = (list) => { settingsAdmins = new Set(list.map((e) => String(e).toLowerCase())); };
export const envAdmins = () => emails(process.env.REKINDLE_ADMINS).filter((e) => !e.startsWith('campfire:'));

// Campfire user IDs linked to Rekindle emails: REKINDLE_CAMPFIRE_USERS =
// "1234=david@firm.com, 5678=jane@firm.com". A linked person signed in from
// inside Campfire is that email: same admin rights and deal approvals.
export function linkedEmail(campfireUserId) {
  if (campfireUserId == null) return null;
  for (const pair of (process.env.REKINDLE_CAMPFIRE_USERS || '').split(',')) {
    const [id, email] = pair.split('=').map((x) => (x || '').trim());
    if (id && email && id === String(campfireUserId)) return email.toLowerCase();
  }
  return null;
}

// Someone Campfire vouches for with a signed context (no email in it): allowed
// when their workspace is one Rekindle serves. REKINDLE_CAMPFIRE_WORKSPACES
// (comma-separated customer IDs) limits which; unset, any workspace that has
// the Rekindle app installed is accepted.
export function allowedWorkspace(id) {
  const list = emails(process.env.REKINDLE_CAMPFIRE_WORKSPACES);
  return id != null && (!list.length || list.includes(String(id)));
}

// Who may sign in with Google: the allowed domain and/or listed people.
export function allowedToSignIn(email) {
  const e = String(email || '').toLowerCase();
  const domain = (process.env.REKINDLE_ALLOWED_DOMAIN || '').toLowerCase().trim();
  const extra = emails(process.env.REKINDLE_ALLOWED_EMAILS);
  if (extra.includes(e) || emails(process.env.REKINDLE_ADMINS).includes(e) || settingsAdmins.has(e)) return true;
  return Boolean(domain) && e.endsWith(`@${domain}`);
}

// A short-lived, signed "link my account" token for a Campfire user who is
// signed in from inside Campfire (their ID came from a verified cf_ctx).
// Opened in a new tab, it ties that ID to whoever then signs in there.
export const LINK_COOKIE = 'rekindle_link';
const LINK_TTL = 10 * 60;
export function makeLinkToken({ campfireUserId, workspace }, now = Date.now()) {
  const data = b64(JSON.stringify({ cu: String(campfireUserId), ws: workspace == null ? null : String(workspace), exp: Math.floor(now / 1000) + LINK_TTL, k: 'link' }));
  return `${data}.${sign(data)}`;
}
export function readLinkToken(value, now = Date.now()) {
  const s = readSession(value, now, 'link');
  return s && s.k === 'link' && s.cu ? { campfireUserId: s.cu, workspace: s.ws } : null;
}
export const isUnlinkedCampfireUser = (user) => Boolean(user && user.campfireUserId != null && String(user.email || '').startsWith('campfire-user-'));
