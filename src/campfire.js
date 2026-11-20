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

// Calls the Campfire app connection was refused (403) and that were done
// with the API key instead, so Settings can show what the app still can't do.
const keyFallbacks = new Map(); // path pattern -> { count, last }
export const fallbacks = () => [...keyFallbacks.entries()].map(([path, v]) => ({ path, ...v }));
const pattern = (pathname) => pathname.replace(/\/\d+(?=\/|$)/g, '/:id');

async function authHeader({ forceRefresh = false, useKey = false } = {}) {
  await connectionLoaded();
  if (useKey) return `Token ${apiKey()}`;
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
  let useKey = false;
  for (let attempt = 1; attempt <= 5; attempt++) {
    const auth = await authHeader({ useKey });
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
    if (res.status === 403 && conn && !useKey && process.env.CAMPFIRE_API_KEY) {
      // The app isn't allowed this yet; use the API key while it's still set.
      useKey = true;
      const key = `${method} ${pattern(url.pathname)}`;
      keyFallbacks.set(key, { count: (keyFallbacks.get(key)?.count || 0) + 1, last: new Date().toISOString() });
      console.log(JSON.stringify({ event: 'campfire_app_refused_used_key', call: key }));
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

// Tags: Campfire documents /coa/api/tag; try the /v1/ form first (it may be
// the one app connections are allowed), and remember which one works.
let tagPath = null;
async function tagPage(params) {
  if (tagPath) return request(tagPath, params);
  try {
    const page = await request('/coa/api/v1/tag', params);
    tagPath = '/coa/api/v1/tag';
    return page;
  } catch (err) {
    if (![403, 404, 405].includes(err.status)) throw err;
    const page = await request('/coa/api/tag', params);
    tagPath = '/coa/api/tag';
    return page;
  }
}

// Active tags in one tag group (e.g. Deals, Billback Customer), paged.
export async function listTags(group) {
  const limit = 200;
  const all = [];
  for (let offset = 0; offset < 20_000; offset += limit) {
    const page = await tagPage({ group, limit, offset });
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

// Create a journal entry (used for reclasses). Returns it with id and order.
export function createJournalEntry(body) {
  return request('/coa/api/journal_entry', {}, { method: 'POST', body });
}
export function getJournalEntry(id) {
  return request(`/coa/api/journal_entry/${id}`);
}

// Expense-type chart accounts, for choosing where each category's expenses go.
export async function listExpenseAccounts() {
  const limit = 500;
  const all = [];
  for (let offset = 0; offset < 10_000; offset += limit) {
    const page = await request('/coa/api/account/balance-sheet', { account_type: ['OPERATING_EXPENSES', 'COGS', 'OTHER_EXPENSE'], include_inactive: false, limit, offset });
    const rows = Array.isArray(page) ? page : page.results || [];
    all.push(...rows.filter((a) => !a.is_deleted && a.status !== 'INACTIVE'));
    if (rows.length < limit) break;
  }
  return all.map((a) => ({
    id: a.id,
    label: a.name_and_number || [a.number, a.name].filter(Boolean).join(' - '),
    name: a.name || '',
    tagIds: (a.default_tags || []).map((t) => (typeof t === 'object' ? t.id : t)),
  }));
}

// Create a tag (a Deals tag, or a Billback Customer tag). customer is sent in
// case Campfire accepts it; its docs list it as read-only on tags, so Rekindle
// also keeps its own link (see store.saveCustomerLink).
export function createTag({ name, group, customer }) {
  return request('/coa/api/tag', {}, { method: 'POST', body: { name, group, ...(customer ? { customer } : {}) } });
}

// Rename a tag (e.g. a deal). Partial update; PUT with the name if PATCH isn't allowed.
export async function renameTag(id, name) {
  const path = `/coa/api/tag/${id}`;
  try {
    return await request(path, {}, { method: 'PATCH', body: { name } });
  } catch (err) {
    if (err.status !== 405) throw err;
    return request(path, {}, { method: 'PUT', body: { name } });
  }
}

// Retire a tag the way Campfire retires a project: deactivate it, so any
// history keeps its tagging. If Campfire won't take is_active, delete it.
export async function retireTag(id) {
  const path = `/coa/api/tag/${id}`;
  try {
    return await request(path, {}, { method: 'PATCH', body: { is_active: false } });
  } catch (err) {
    if (![400, 405].includes(err.status)) throw err;
    return request(path, {}, { method: 'DELETE' });
  }
}

// Where a tag is used in Campfire: bills (any status) and invoices with a
// line carrying it. Each list is read in full and checked line by line (the
// tag filter is only a hint), stopping at the first few found.
const lineHasTag = (line, id) => (line.tags || []).some((t) => Number(t?.id ?? t) === Number(id)) || (line.tag_ids || []).map(Number).includes(Number(id));
export async function tagUsage(tagId, { max = 5 } = {}) {
  const scan = async (path) => {
    const found = [];
    const limit = 200;
    for (let offset = 0; offset < 100_000 && found.length < max; offset += limit) {
      const page = await request(path, { tag_ids: tagId, limit, offset });
      const rows = Array.isArray(page) ? page : page.results || [];
      for (const r of rows) if (!r.is_deleted && (r.lines || []).some((l) => lineHasTag(l, tagId))) found.push(r);
      if (rows.length < limit) break;
    }
    return found;
  };
  const [bills, invoices] = await Promise.all([scan('/coa/api/v1/bill'), scan('/coa/api/v1/invoice')]);
  return {
    bills: bills.map((b) => ({ id: b.id, number: b.bill_number || String(b.id) })),
    invoices: invoices.map((i) => ({ id: i.id, number: i.invoice_number || String(i.id) })),
  };
}

// Customers live under /coa/api/vendor with vendor_type "customer".
export function createCustomer({ name, email }) {
  return request('/coa/api/vendor', {}, { method: 'POST', body: { vendor_type: 'customer', name, company_name: name, ...(email ? { email } : {}) } });
}
export async function findCustomerByName(name) {
  const page = await request('/coa/api/vendor', { q: name, vendor_type: 'customer', limit: 50 });
  const rows = Array.isArray(page) ? page : page.results || [];
  const n = name.trim().toLowerCase();
  return rows.find((v) => (v.vendor_type || 'customer') === 'customer' && !v.is_deleted && [v.name, v.company_name, v.display_name].some((x) => String(x || '').trim().toLowerCase() === n)) || null;
}

// All active customers (id, name), paged; cached for five minutes.
let customersCache = null;
// Invoices, for the dashboard: only those with a line carrying a tag from
// keepGroup (the Deals tag group), so ordinary sales invoices are skipped.
// Cached 2 minutes.
let invoicesCache = null;
export async function listInvoices({ keepGroup, fresh = false } = {}) {
  if (!fresh && invoicesCache && invoicesCache.group === keepGroup && invoicesCache.at > Date.now() - 120_000) return invoicesCache.rows;
  const limit = 200;
  const all = [];
  for (let offset = 0; offset < 20_000; offset += limit) {
    const page = await request('/coa/api/v1/invoice', { limit, offset });
    const rows = Array.isArray(page) ? page : page.results || [];
    all.push(...rows.filter((inv) => (inv.lines || []).some((l) => (l.tags || []).some((t) => Number(t.group) === Number(keepGroup)))));
    if (rows.length < limit) break;
  }
  invoicesCache = { at: Date.now(), group: keepGroup, rows: all };
  return all;
}

// An entity's invoice settings (Settings → Entities → Invoice). Campfire's
// "Invoice Message" is where firms keep payment instructions. Cached 5 minutes.
const entityCache = new Map();
export async function getEntity(id) {
  const hit = entityCache.get(String(id));
  if (hit && hit.at > Date.now() - 300_000) return hit.row;
  let row = null;
  for (const path of [`/coa/api/entity/${id}`, `/coa/api/v1/entity/${id}`]) {
    try { row = await request(path); break; } catch (err) { if (err.status !== 404 && err.status !== 405) throw err; }
  }
  if (!row) {
    const page = await request('/coa/api/entity', { limit: 500 });
    row = (Array.isArray(page) ? page : page.results || []).find((e) => String(e.id) === String(id)) || null;
  }
  entityCache.set(String(id), { at: Date.now(), row });
  return row;
}
export async function entityInvoiceMessage(id) {
  if (id === null || id === undefined) return null;
  const e = await getEntity(id);
  return String(e?.invoice_message || '').trim() || null;
}

// The entity's logo (Settings → Entities → logo), as bytes for the PDF.
// Public CDN link, so no Campfire credentials go with it. Cached 10 minutes.
const logoCache = new Map();
export async function fetchLogo(url) {
  if (!url || !/^https:\/\//i.test(url)) return null;
  const hit = logoCache.get(url);
  if (hit && hit.at > Date.now() - 600_000) return hit.buf;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000), redirect: 'follow' });
  if (!res.ok) throw new Error(`logo ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > 3_000_000) throw new Error('logo larger than 3 MB');
  logoCache.set(url, { at: Date.now(), buf });
  return buf;
}
export async function entityLogo(id) {
  if (id === null || id === undefined) return null;
  const e = await getEntity(id);
  return e?.logo_url ? fetchLogo(e.logo_url) : null;
}

export async function listCustomers({ fresh = false } = {}) {
  if (!fresh && customersCache && customersCache.at > Date.now() - 300_000) return customersCache.rows;
  const limit = 200;
  const all = [];
  for (let offset = 0; offset < 20_000; offset += limit) {
    const page = await request('/coa/api/vendor', { vendor_type: 'customer', limit, offset });
    const rows = Array.isArray(page) ? page : page.results || [];
    all.push(...rows.filter((v) => !v.is_deleted && (v.vendor_type || 'customer') === 'customer' && v.status !== 'INACTIVE').map((v) => ({ id: v.id, name: v.name || v.company_name || v.display_name || '', expensed: v.custom_field_expensed === true })));
    if (rows.length < limit) break;
  }
  customersCache = { at: Date.now(), rows: all };
  return all;
}
