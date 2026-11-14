// Minimal Campfire API client (read-only for now).
// Auth: Authorization: Token <key>, read from the CAMPFIRE_API_KEY env var.

const BASE_URL = process.env.CAMPFIRE_BASE_URL || 'https://api.meetcampfire.com';

function apiKey() {
  const key = process.env.CAMPFIRE_API_KEY;
  if (!key) throw new Error('CAMPFIRE_API_KEY is not set. Add it as an environment variable (never commit it).');
  return key;
}

async function request(path, params = {}, { method = 'GET', body } = {}) {
  const url = new URL(path, BASE_URL);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    for (const item of [].concat(v)) url.searchParams.append(k, String(item));
  }

  for (let attempt = 1; attempt <= 5; attempt++) {
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Token ${apiKey()}`,
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
  for (let attempt = 1; attempt <= 5; attempt++) {
    const form = new FormData();
    form.append('file', new Blob([data], { type }), filename);
    const res = await fetch(url, { method: 'POST', headers: { Authorization: `Token ${apiKey()}` }, body: form });
    if (res.status === 429) {
      await new Promise((r) => setTimeout(r, Number(res.headers.get('retry-after') || 1) * 1000));
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
