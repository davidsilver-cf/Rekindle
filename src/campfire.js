// Minimal Campfire API client (read-only for now).
// Auth: Authorization: Token <key>, read from the CAMPFIRE_API_KEY env var.

const BASE_URL = process.env.CAMPFIRE_BASE_URL || 'https://api.meetcampfire.com';

function apiKey() {
  const key = process.env.CAMPFIRE_API_KEY;
  if (!key) throw new Error('CAMPFIRE_API_KEY is not set. Add it as an environment variable (never commit it).');
  return key;
}

async function request(path, params = {}) {
  const url = new URL(path, BASE_URL);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    for (const item of [].concat(v)) url.searchParams.append(k, String(item));
  }

  for (let attempt = 1; attempt <= 5; attempt++) {
    const res = await fetch(url, {
      headers: { Authorization: `Token ${apiKey()}`, Accept: 'application/json' },
    });
    if (res.status === 429) {
      // Campfire allows 10 requests/second per API user and says how long to wait.
      const wait = Number(res.headers.get('retry-after') || 1);
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Campfire ${res.status} on ${url.pathname}: ${body.slice(0, 300)}`);
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
