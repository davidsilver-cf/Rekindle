// Minimal Campfire API client.
// Auth: the OAuth connection made on Rekindle's Settings screen when there is
// one (refreshed automatically), else Authorization: Token <CAMPFIRE_API_KEY>.
import { getStore } from './store.js';
import { seal, unseal, refreshConnection } from './campfire-oauth.js';

const BASE_URL = process.env.CAMPFIRE_BASE_URL || 'https://api.meetcampfire.com';

function apiKey() {
  const key = process.env.CAMPFIRE_API_KEY;
  if (!key) throw new Error('Rekindle isn\'t connected to Campfire. Connect it on the Settings screen (or set CAMPFIRE_API_KEY).');
  return key;
}

// ---- The OAuth connection (cached in memory; the database is the record).
let conn; // undefined = not loaded yet, null = none
let refreshing = null;
const normType = (t) => (String(t || 'Bearer').toLowerCase() === 'bearer' ? 'Bearer' : t);

export async function loadConnection() {
  try {
    const row = await (await getStore()).getConnection();
    conn = row ? { ...row, access_token: unseal(row.access_token), refresh_token: unseal(row.refresh_token) } : null;
  } catch (err) {
    console.log(JSON.stringify({ event: 'connection_load_failed', error: err.message }));
    conn = null;
  }
  return conn;
}
export const connection = () => conn || null;
export const isConnected = () => Boolean(conn);
export async function connectionLoaded() { if (conn === undefined) await loadConnection(); return conn; }

export async function saveConnection(c, { connectedBy, fresh = true } = {}) {
  const store = await getStore();
  await store.saveConnection({ ...c, access_token: seal(c.access_token), refresh_token: seal(c.refresh_token), connected_by: connectedBy }, { fresh });
  return loadConnection();
}
export async function clearConnection() {
  await (await getStore()).deleteConnection();
  conn = null;
}

// One refresh at a time, shared by every request that needs it.
async function refreshNow() {
  if (!refreshing) {
    refreshing = (async () => {
      const next = await refreshConnection(conn);
      await saveConnection(next, { fresh: false });
      console.log(JSON.stringify({ event: 'campfire_token_refreshed' }));
    })().finally(() => { refreshing = null; });
  }
  return refreshing;
}

async function authHeader({ forceRefresh = false } = {}) {
  await connectionLoaded();
  if (conn) {
    const expiring = conn.expires_at && new Date(conn.expires_at).getTime() < Date.now() + 60_000;
    if (forceRefresh || expiring) await refreshNow();
    return `${normType(conn.token_type)} ${conn.access_token}`;
  }
  return `Token ${apiKey()}`;
}

async function request(path, params = {}, { method = 'GET', body } = {}) {
  const url = new URL(path, BASE_URL);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    for (const item of [].concat(v)) url.searchParams.append(k, String(item));
  }

  let refreshed = false;
  for (let attempt = 1; attempt <= 5; attempt++) {
    const auth = await authHeader();
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: auth,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429) {
      // Campfire allows 10 requests/second per API user and says how long to wait.
      const wait = Number(res.headers.get('retry-after') || 1);
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    if (res.status === 401 && conn && !refreshed) {
      // The access token may have been revoked or expired early: refresh once.
      refreshed = true;
      // Another call may already have refreshed it; only refresh a token that's still current.
      if (conn && `${normType(conn.token_type)} ${conn.access_token}` === auth) await authHeader({ forceRefresh: true });
      continue;
    }
    if (!res.ok) {
      const body = await res.text();
      const err = new Error(`Campfire ${res.status} on ${url.pathname}: ${body.slice(0, 300)}`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  }
  throw new Error(`Campfire kept rate-limiting ${url.pathname}`);
}

// List open bills, paging with limit/offset. Handles either a plain array
// or a { results: [...] } envelope.
export async function listBills({ status = 'open', startDate, endDate, entity, q } = {}) {
  const limit = 200;
  const all = [];
  for (let offset = 0; offset < 50_000; offset += limit) {
    const page = await request('/coa/api/v1/bill', {
      status, start_date: startDate, end_date: endDate, entity, q, limit, offset,
    });
    const rows = Array.isArray(page) ? page : page.results || [];
    all.push(...rows);
    if (rows.length < limit) break;
  }
  return all;
}

// Active tags in one tag group (e.g. Deals, Billback Customer), paged.
export async function listTags(group) {
  const limit = 200;
  const all = [];
  for (let offset = 0; offset < 20_000; offset += limit) {
    const page = await request('/coa/api/tag', { group, limit, offset });
    const rows = Array.isArray(page) ? page : page.results || [];
    all.push(...rows.filter((t) => !t.is_deleted && t.is_active !== false));
    if (rows.length < limit) break;
  }
  return all;
}

export function getBill(id) {
  return request(`/coa/api/v1/bill/${id}`);
}

// Write a bill update built by writer.js. Tries a partial update (PATCH)
// first, which leaves every header field alone. If Campfire doesn't allow
// PATCH on bills, falls back to a full PUT carrying the bill's own header
// values unchanged, because PUT replaces the whole bill.
export async function updateBill(update) {
  const path = `/coa/api/v1/bill/${update.billId}`;
  try {
    return await request(path, {}, { method: 'PATCH', body: { lines: update.lines } });
  } catch (err) {
    if (err.status !== 405) throw err;
    return request(path, {}, { method: 'PUT', body: { ...update.header, lines: update.lines } });
  }
}

// Create an invoice. Returns Campfire's invoice (id, invoice_number, ...).
export function createInvoice(body) {
  return request('/coa/api/v1/invoice', {}, { method: 'POST', body });
}

// Attach a file to a record, e.g. a PDF to an invoice.
export async function uploadFile({ model, objectId, filename, data, type = 'application/pdf' }) {
  const url = new URL('/ca/api/file/upload', BASE_URL);
  url.searchParams.set('model', model);
  url.searchParams.set('object_id', String(objectId));
  let refreshed = false;
  for (let attempt = 1; attempt <= 5; attempt++) {
    const form = new FormData();
    form.append('file', new Blob([data], { type }), filename);
    const auth = await authHeader();
    const res = await fetch(url, { method: 'POST', headers: { Authorization: auth }, body: form });
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, Number(res.headers.get('retry-after') || 1) * 1000));
      continue;
    }
    if (res.status === 401 && conn && !refreshed) {
      refreshed = true;
      if (`${normType(conn.token_type)} ${conn.access_token}` === auth) await authHeader({ forceRefresh: true });
      continue;
    }
    if (!res.ok) {
      const err = new Error(`Campfire ${res.status} on file upload: ${(await res.text()).slice(0, 300)}`);
      err.status = res.status;
      throw err;
    }
    return true;
  }
  throw new Error('Campfire kept rate-limiting the file upload');
}

export function getInvoice(id) {
  return request(`/coa/api/v1/invoice/${id}`);
}

// Update an invoice's lines (used to set their tags and department).
// PATCH first; if Campfire doesn't allow it, PUT with the invoice's own
// header values unchanged, because PUT replaces the whole invoice.
const INVOICE_HEADER = ['entity', 'client', 'invoice_date', 'due_date', 'ref_number', 'invoice_number', 'message_on_invoice', 'currency', 'terms'];
export async function updateInvoice(invoice, lines) {
  const path = `/coa/api/v1/invoice/${invoice.id}`;
  try {
    return await request(path, {}, { method: 'PATCH', body: { lines } });
  } catch (err) {
    if (err.status !== 405) throw err;
    const header = {};
    for (const k of INVOICE_HEADER) {
      const v = invoice[k];
      if (v !== undefined && v !== null) header[k] = v && typeof v === 'object' ? v.id : v;
    }
    return request(path, {}, { method: 'PUT', body: { ...header, lines } });
  }
}
