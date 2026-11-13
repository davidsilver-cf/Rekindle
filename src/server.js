// Rekindle web service (Render).
//   GET  /health                         is it up, and is writing on?
//   GET  /dry-run?token=…[&bill=NUMBER]  what Rekindle would do, as text
//   POST /run?token=…                    process all open bills (backfill)
//   POST /webhooks/campfire              Bill.created / Bill.updated from Campfire
import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { listBills, getBill } from './campfire.js';
import { processBills } from './process.js';
import { formatPlan } from './report.js';
import { verifySignature } from './webhook.js';
import { writeEnabled } from './config.js';

const PORT = Number(process.env.PORT || 3000);
const BILL_TOPICS = new Set(['Bill.created', 'Bill.updated']);

function adminOk(url, req) {
  const want = process.env.REKINDLE_ADMIN_TOKEN;
  if (!want) return false;
  const got = url.searchParams.get('token') || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const a = Buffer.from(want);
  const b = Buffer.from(got);
  return a.length === b.length && timingSafeEqual(a, b);
}

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type });
  res.end(typeof body === 'string' ? body : JSON.stringify(body, null, 2));
}

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

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (req.method === 'GET' && url.pathname === '/health') {
      return send(res, 200, { ok: true, write: writeEnabled() });
    }

    if (req.method === 'POST' && url.pathname === '/webhooks/campfire') {
      return await handleWebhook(req, res);
    }

    if (url.pathname === '/dry-run' || url.pathname === '/run') {
      if (!adminOk(url, req)) return send(res, 401, 'unauthorized');
      const bills = await listBills({ q: url.searchParams.get('bill') || undefined });

      if (req.method === 'GET' && url.pathname === '/dry-run') {
        const { plan } = await processBills(bills, { write: false, log: () => {} });
        return send(res, 200, formatPlan(plan));
      }
      if (req.method === 'POST' && url.pathname === '/run') {
        const { plan, results } = await processBills(bills);
        return send(res, 200, { write: writeEnabled(), totals: plan.totals, results }, 'application/json');
      }
    }

    send(res, 404, 'not found');
  } catch (err) {
    console.log(JSON.stringify({ event: 'error', path: url.pathname, error: err.message }));
    if (!res.headersSent) send(res, 500, 'error: ' + err.message);
  }
});

server.listen(PORT, () => {
  console.log(JSON.stringify({ event: 'started', port: PORT, write: writeEnabled() }));
});
