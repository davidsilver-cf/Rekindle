// Rekindle web service (Render).
// Screens (sign in with REKINDLE_ADMIN_TOKEN):
//   GET  /            Billback queue
//   GET  /deals       Deals & allocations
//   GET  /approvals   Review & approve
//   GET  /invoices    Invoice preview
//   POST /run-now     Stamp pending lines (only when REKINDLE_WRITE=true)
// Machine endpoints:
//   GET  /health                          is it up, and is writing on?
//   GET  /dry-run?token=…[&bill=NUMBER]   text report
//   POST /run?token=…                     process all open bills (backfill)
//   POST /webhooks/campfire               Bill.created / Bill.updated from Campfire
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { timingSafeEqual } from 'node:crypto';
import { listBills, getBill } from './campfire.js';
import { processBills } from './process.js';
import { planBills } from './engine.js';
import { formatPlan } from './report.js';
import { verifySignature } from './webhook.js';
import { config, writeEnabled } from './config.js';
import { queuePage, dealsPage, approvalsPage, invoicesPage, loginPage } from './ui.js';

const PORT = Number(process.env.PORT || 3000);
const BILL_TOPICS = new Set(['Bill.created', 'Bill.updated']);
const COOKIE = 'rekindle_session';

// Demo mode: no API key yet, or explicitly asked for. Uses the test bill in the repo.
const demoMode = () => process.env.REKINDLE_DEMO === 'true' || !process.env.CAMPFIRE_API_KEY;

async function loadBills(q) {
  if (demoMode()) {
    return JSON.parse(await readFile(new URL('../test/fixtures/ABC_261106.json', import.meta.url), 'utf8'));
  }
  return listBills({ q });
}

function safeEqual(want, got) {
  if (!want || !got) return false;
  const a = Buffer.from(String(want));
  const b = Buffer.from(String(got));
  return a.length === b.length && timingSafeEqual(a, b);
}

function cookieToken(req) {
  const m = (req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

function adminOk(url, req) {
  const want = process.env.REKINDLE_ADMIN_TOKEN;
  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  return safeEqual(want, url.searchParams.get('token')) || safeEqual(want, bearer) || safeEqual(want, cookieToken(req));
}

function send(res, status, body, type = 'text/plain; charset=utf-8', headers = {}) {
  res.writeHead(status, {
    'Content-Type': type,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    ...(type.startsWith('text/html') ? { 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; form-action 'self'; frame-ancestors 'none'" } : {}),
    ...headers,
  });
  res.end(typeof body === 'string' ? body : JSON.stringify(body, null, 2));
}
const html = (res, body, status = 200) => send(res, status, body, 'text/html; charset=utf-8');
const redirect = (res, to, headers = {}) => { res.writeHead(303, { Location: to, ...headers }); res.end(); };

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 5 * 1024 * 1024) { reject(new Error('body too large')); req.destroy(); }
      else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function handleWebhook(req, res) {
  const rawBody = await readBody(req);
  const check = verifySignature({
    secret: process.env.CAMPFIRE_WEBHOOK_SECRET,
    timestamp: req.headers['campfire-webhook-request-timestamp'],
    signature: req.headers['campfire-webhook-signature-v1'],
    rawBody,
  });
  if (!check.ok) {
    console.log(JSON.stringify({ event: 'webhook_rejected', reason: check.reason }));
    return send(res, 401, 'invalid signature');
  }

  // Acknowledge first; Campfire shouldn't wait on our API calls.
  send(res, 200, 'ok');

  let payload;
  try { payload = JSON.parse(rawBody); } catch { return; }
  if (!BILL_TOPICS.has(payload.topic) || !payload.data?.id) return;

  try {
    // Re-read the bill so we act on its current state, not the event snapshot.
    const bill = await getBill(payload.data.id);
    await processBills([bill]);
  } catch (err) {
    console.log(JSON.stringify({ event: 'webhook_error', topic: payload.topic, billId: payload.data.id, error: err.message }));
  }
}

async function screenContext() {
  const bills = await loadBills();
  return {
    config,
    plan: planBills(bills, config),
    demo: demoMode(),
    write: writeEnabled(),
    loadedAt: new Date().toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' }) + ' ET',
  };
}

const SCREENS = {
  '/': (ctx, url) => {
    const s = url.searchParams;
    const flash = s.has('stamped')
      ? { ok: Number(s.get('failed') || 0) === 0, text: `Stamped ${Number(s.get('stamped')) || 0} bill(s)${Number(s.get('failed')) ? `, ${Number(s.get('failed'))} failed (see Render logs)` : ''}.` }
      : null;
    return queuePage(ctx, flash);
  },
  '/deals': (ctx, url) => dealsPage(ctx, url.searchParams.get('deal')),
  '/approvals': (ctx) => approvalsPage(ctx),
  '/invoices': (ctx, url) => invoicesPage(ctx, url.searchParams.get('customer')),
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (req.method === 'GET' && url.pathname === '/health') {
      return send(res, 200, { ok: true, write: writeEnabled(), demo: demoMode() }, 'application/json');
    }

    if (req.method === 'POST' && url.pathname === '/webhooks/campfire') {
      return await handleWebhook(req, res);
    }

    if (url.pathname === '/login') {
      if (req.method === 'GET') return html(res, loginPage());
      if (req.method === 'POST') {
        const token = new URLSearchParams(await readBody(req)).get('token');
        if (!safeEqual(process.env.REKINDLE_ADMIN_TOKEN, token)) return html(res, loginPage('That token is not right.'), 401);
        const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
        return redirect(res, '/', { 'Set-Cookie': `${COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=43200${secure}` });
      }
    }

    if (req.method === 'GET' && SCREENS[url.pathname]) {
      if (!adminOk(url, req)) return redirect(res, '/login');
      return html(res, SCREENS[url.pathname](await screenContext(), url));
    }

    if (req.method === 'POST' && url.pathname === '/run-now') {
      if (!adminOk(url, req)) return redirect(res, '/login');
      if (demoMode() || !writeEnabled()) return redirect(res, '/');
      const { results } = await processBills(await loadBills());
      const failed = results.filter((r) => r.mode === 'failed').length;
      return redirect(res, `/?stamped=${results.length - failed}&failed=${failed}`);
    }

    if (url.pathname === '/dry-run' || url.pathname === '/run') {
      if (!adminOk(url, req)) return send(res, 401, 'unauthorized');
      const bills = await loadBills(url.searchParams.get('bill') || undefined);

      if (req.method === 'GET' && url.pathname === '/dry-run') {
        const { plan } = await processBills(bills, { write: false, log: () => {} });
        return send(res, 200, formatPlan(plan));
      }
      if (req.method === 'POST' && url.pathname === '/run') {
        if (demoMode()) return send(res, 409, 'demo mode: nothing to write');
        const { plan, results } = await processBills(bills);
        return send(res, 200, { write: writeEnabled(), totals: plan.totals, results }, 'application/json');
      }
    }

    send(res, 404, 'not found');
  } catch (err) {
    console.log(JSON.stringify({ event: 'error', path: url.pathname, error: err.message }));
    if (!res.headersSent) send(res, 500, 'Something went wrong. Check the Render logs.');
  }
});

server.listen(PORT, () => {
  console.log(JSON.stringify({ event: 'started', port: PORT, write: writeEnabled(), demo: demoMode() }));
});
