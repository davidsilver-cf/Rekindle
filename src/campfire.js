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
