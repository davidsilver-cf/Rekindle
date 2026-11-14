// Rekindle web service (Render).
// Screens (sign in with Google, or with REKINDLE_ADMIN_TOKEN as an admin):
//   GET  /                 Billback queue
//   GET  /deals            Deals & allocations (admins set each deal's approver)
//   GET  /approvals        Approve or send back, per deal
//   GET  /invoices         Invoice preview
//   POST /run-now          Stamp pending lines (only when REKINDLE_WRITE=true)
// Machine endpoints:
//   GET  /health                          is it up, and is writing on?
//   GET  /dry-run?token=…[&bill=NUMBER]   text report
//   POST /run?token=…                     process all open bills (backfill)
//   POST /webhooks/campfire               Bill.created / Bill.updated from Campfire
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { listBills, getBill } from './campfire.js';
import { processBills } from './process.js';
import { planBills } from './engine.js';
import { formatPlan } from './report.js';
import { verifySignature } from './webhook.js';
import { config, writeEnabled } from './config.js';
import { queuePage, dealsPage, approvalsPage, invoicesPage, loginPage, readFilters } from './ui.js';
import { SESSION_COOKIE, makeSession, readSession, sessionCookie, cookieValue, isAdmin, allowedToSignIn } from './session.js';
import { googleConfigured, startLogin, finishLogin } from './google.js';
import { getStore } from './store.js';
import { dealGroups, withStatus, canDecide } from './approvals.js';
import { buildInvoicePdf, invoiceFilename } from './invoice-pdf.js';

const STATIC = {
  '/static/queue.js': { file: '../public/queue.js', type: 'text/javascript; charset=utf-8' },
};
const BILL_TOPICS = new Set(['Bill.created', 'Bill.updated']);
const OAUTH_COOKIE = 'rekindle_oauth';
const EMAIL_RE = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;

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

const currentUser = (req) => readSession(cookieValue(req, SESSION_COOKIE));

// Machine endpoints (/dry-run, /run): the access token, or a signed-in admin.
function machineOk(url, req) {
  const want = process.env.REKINDLE_ADMIN_TOKEN;
  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  return safeEqual(want, url.searchParams.get('token')) || safeEqual(want, bearer) || isAdmin(currentUser(req));
}

function send(res, status, body, type = 'text/plain; charset=utf-8', headers = {}) {
  res.writeHead(status, {
    'Content-Type': type,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    ...(type.startsWith('text/html') ? { 'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src 'self' data:; form-action 'self' https://accounts.google.com; frame-ancestors 'none'" } : {}),
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

async function screenContext(user) {
  const store = await getStore();
  const plan = planBills(await loadBills(), config);
  const [approvers, decisions] = await Promise.all([store.getApprovers(), store.latestDecisions()]);
  const groups = withStatus(dealGroups(plan, config), approvers, decisions).map((g) => ({ ...g, canDecide: canDecide(user, g) }));
  return {
    config,
    plan,
    groups,
    approvers,
    user,
    admin: isAdmin(user),
    storeKind: store.kind,
    demo: demoMode(),
    write: writeEnabled(),
    loadedAt: new Date().toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' }) + ' ET',
  };
}

const n = (s, k) => Number(s.get(k)) || 0;
const SCREENS = {
  '/': (ctx, url) => {
    const s = url.searchParams;
    let flash = null;
    if (s.has('stamped')) {
      flash = {
        ok: n(s, 'failed') === 0,
        text: `Stamped ${n(s, 'lines')} line${n(s, 'lines') === 1 ? '' : 's'} on ${n(s, 'stamped')} bill${n(s, 'stamped') === 1 ? '' : 's'}${n(s, 'failed') ? `; ${n(s, 'failed')} bill${n(s, 'failed') === 1 ? '' : 's'} failed (see Render logs)` : ''}.`,
      };
    } else if (s.has('nothing')) {
      flash = { ok: false, text: 'Nothing selected to stamp.' };
    }
    return queuePage(ctx, flash, readFilters(s));
  },
  '/deals': (ctx, url) => dealsPage(ctx, url.searchParams.get('deal')),
  '/approvals': (ctx, url) => {
    const r = url.searchParams.get('result');
    const flash = {
      approved: { ok: true, text: 'Approved.' },
      sent_back: { ok: true, text: 'Sent back.' },
      changed: { ok: false, text: 'The lines for that deal changed while you were looking. Review the new amounts and decide again.' },
      denied: { ok: false, text: "You're not the approver for that deal." },
    }[r] || null;
    return approvalsPage(ctx, flash);
  },
  '/invoices': (ctx, url) => invoicesPage(ctx, url.searchParams.get('customer')),
};

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const user = currentUser(req);

  if (req.method === 'GET' && url.pathname === '/health') {
    const store = await getStore();
    return send(res, 200, { ok: true, write: writeEnabled(), demo: demoMode(), database: store.kind === 'postgres', google: googleConfigured() }, 'application/json');
  }

  if (req.method === 'GET' && STATIC[url.pathname]) {
    const { file, type } = STATIC[url.pathname];
    return send(res, 200, await readFile(new URL(file, import.meta.url), 'utf8'), type, { 'Cache-Control': 'public, max-age=300' });
  }

  if (req.method === 'POST' && url.pathname === '/webhooks/campfire') {
    return handleWebhook(req, res);
  }

  // ---- Sign in / out
  const loginOpts = { google: googleConfigured(), token: Boolean(process.env.REKINDLE_ADMIN_TOKEN) };
  if (url.pathname === '/login') {
    if (req.method === 'GET') return html(res, loginPage(null, loginOpts));
    if (req.method === 'POST') {
      const token = new URLSearchParams(await readBody(req)).get('token');
      if (!safeEqual(process.env.REKINDLE_ADMIN_TOKEN, token)) return html(res, loginPage('That token is not right.', loginOpts), 401);
      return redirect(res, '/', { 'Set-Cookie': sessionCookie(makeSession({ email: 'admin@token', name: 'Admin (token)', via: 'token' }), req) });
    }
  }
  if (req.method === 'POST' && url.pathname === '/logout') {
    return redirect(res, '/login', { 'Set-Cookie': sessionCookie('', req, 0) });
  }
  if (req.method === 'GET' && url.pathname === '/auth/google') {
    if (!googleConfigured()) return redirect(res, '/login');
    const { url: to, state, nonce } = startLogin(req);
    const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
    return redirect(res, to, { 'Set-Cookie': `${OAUTH_COOKIE}=${state}.${nonce}; HttpOnly; SameSite=Lax; Path=/auth; Max-Age=600${secure}` });
  }
  if (req.method === 'GET' && url.pathname === '/auth/google/callback') {
    const [state, nonce] = (cookieValue(req, OAUTH_COOKIE) || '').split('.');
    const clear = `${OAUTH_COOKIE}=; HttpOnly; SameSite=Lax; Path=/auth; Max-Age=0`;
    if (!state || !safeEqual(state, url.searchParams.get('state')) || !url.searchParams.get('code')) {
      return html(res, loginPage('Sign-in expired or was interrupted. Try again.', loginOpts), 400);
    }
    try {
      const who = await finishLogin(req, url.searchParams.get('code'), nonce);
      if (!allowedToSignIn(who.email)) {
        console.log(JSON.stringify({ event: 'login_denied', email: who.email }));
        return html(res, loginPage(`${who.email} isn't allowed to use Rekindle. Ask an admin to add you.`, loginOpts), 403);
      }
      const store = await getStore();
      await store.audit(who.email, 'sign_in', { via: 'google' });
      res.writeHead(303, { Location: '/', 'Set-Cookie': [sessionCookie(makeSession({ ...who, via: 'google' }), req), clear] });
      return res.end();
    } catch (err) {
      console.log(JSON.stringify({ event: 'login_error', error: err.message }));
      return html(res, loginPage('Google sign-in failed. Try again.', loginOpts), 400);
    }
  }

  // ---- Screens and actions need a signed-in user
  if (req.method === 'GET' && SCREENS[url.pathname]) {
    if (!user) return redirect(res, '/login');
    return html(res, SCREENS[url.pathname](await screenContext(user), url));
  }

  if (req.method === 'GET' && url.pathname === '/invoices/pdf') {
    if (!user) return redirect(res, '/login');
    const plan = planBills(await loadBills(), config);
    const customer = plan.customers.find((c) => c.customer.name === url.searchParams.get('customer'));
    if (!customer) return send(res, 404, 'No invoice for that customer in the current run.');
    const pdf = buildInvoicePdf({ customer, plan, branding: config.invoice || {}, invoice: { draft: true } });
    res.writeHead(200, {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${invoiceFilename(customer.customer.name)}"`,
      'Content-Length': pdf.length,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    });
    return res.end(pdf);
  }

  if (req.method === 'POST' && url.pathname === '/deals/approver') {
    if (!user) return redirect(res, '/login');
    if (!isAdmin(user)) return send(res, 403, 'Only admins can change approvers.');
    const form = new URLSearchParams(await readBody(req));
    const deal = config.deals.find((d) => d.dealsTagId === Number(form.get('deal')));
    if (!deal) return send(res, 400, 'Unknown deal.');
    const email = (form.get('email') || '').trim().toLowerCase();
    if (email && !EMAIL_RE.test(email)) return send(res, 400, 'That is not a valid email address.');
    const store = await getStore();
    await store.setApprover(deal.dealsTagId, email || null, user.email);
    return redirect(res, `/deals?deal=${encodeURIComponent(deal.dealsTag)}`);
  }

  if (req.method === 'POST' && url.pathname === '/approvals/decide') {
    if (!user) return redirect(res, '/login');
    const form = new URLSearchParams(await readBody(req));
    const decision = form.get('decision');
    if (!['approved', 'sent_back'].includes(decision)) return send(res, 400, 'Unknown decision.');
    const ctx = await screenContext(user);
    const g = ctx.groups.find((x) => x.deal.dealsTagId === Number(form.get('deal')));
    if (!g) return redirect(res, '/approvals?result=changed');
    if (!g.canDecide) return redirect(res, '/approvals?result=denied');
    if (g.fingerprint !== form.get('fingerprint')) return redirect(res, '/approvals?result=changed');
    const store = await getStore();
    const note = (form.get('note') || '').trim().slice(0, 500);
    await store.recordDecision({
      dealsTagId: g.deal.dealsTagId, fingerprint: g.fingerprint, decision, actorEmail: user.email,
      note, amountCents: g.cents, lineIds: g.lines.map((l) => l.lineId),
    });
    await store.audit(user.email, decision, { deal: g.deal.dealsTag, amountCents: g.cents, lines: g.lines.map((l) => l.lineId) });
    return redirect(res, `/approvals?result=${decision}`);
  }

  if (req.method === 'POST' && url.pathname === '/run-now') {
    if (!user) return redirect(res, '/login');
    if (demoMode() || !writeEnabled()) return redirect(res, '/');
    const form = new URLSearchParams(await readBody(req));
    let lineIds = null; // null = every line that needs stamping
    if (form.get('scope') !== 'all') {
      lineIds = new Set(form.getAll('line').map(Number).filter(Number.isInteger));
      if (!lineIds.size) return redirect(res, '/?nothing=1');
    }
    const { results } = await processBills(await loadBills(), { lineIds });
    const failed = results.filter((r) => r.mode === 'failed').length;
    const lines = results.filter((r) => r.mode === 'written').reduce((s, r) => s + new Set(r.changes.map((c) => c.lineId)).size, 0);
    const store = await getStore();
    await store.audit(user.email, 'stamp', { scope: lineIds ? 'selected' : 'all', lines, failed });
    return redirect(res, `/?stamped=${results.length - failed}&lines=${lines}&failed=${failed}`);
  }

  if (url.pathname === '/dry-run' || url.pathname === '/run') {
    if (!machineOk(url, req)) return send(res, 401, 'unauthorized');
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
}

export function createServer() {
  return http.createServer(async (req, res) => {
    try {
      await handle(req, res);
    } catch (err) {
      console.log(JSON.stringify({ event: 'error', path: req.url?.split('?')[0], error: err.message }));
      if (!res.headersSent) send(res, 500, 'Something went wrong. Check the Render logs.');
    }
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const port = Number(process.env.PORT || 3000);
  createServer().listen(port, async () => {
    const store = await getStore().catch((err) => { console.log(JSON.stringify({ event: 'store_error', error: err.message })); return { kind: 'error' }; });
    console.log(JSON.stringify({ event: 'started', port, write: writeEnabled(), demo: demoMode(), store: store.kind, google: googleConfigured() }));
  });
}
