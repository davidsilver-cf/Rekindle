// Rekindle web service (Render).
// Screens (sign in with Google, or with REKINDLE_ADMIN_TOKEN as an admin):
//   GET  /                 Billback Queue
//   GET  /deals            Deals & Allocations (admins set each deal's approver)
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
import { listBills, getBill, updateBill, createInvoice, uploadFile, getInvoice, updateInvoice, createJournalEntry, listExpenseAccounts, listTags, createTag, createCustomer, findCustomerByName, entityInvoiceMessage, listInvoices, entityLogo, fetchLogo } from './campfire.js';
import { dashboardData } from './dashboard.js';
import { dashboardPage, dashboardCsv } from './dashboard-ui.js';
import { validateNewDeal, createDeal } from './newdeal.js';
import { waitingLines, prepareReclass, startReclass, advanceReclass, todayISO, matchAccount } from './reclass.js';
import { processBills } from './process.js';
import { planBills, planLine, customersFor } from './engine.js';
import { formatPlan } from './report.js';
import { verifySignature } from './webhook.js';
import { loadConfig, writeEnabled, demoMode } from './config.js';
import { validateSetup, validateOwners } from './setup.js';
import { queuePage, dealsPage, approvalsPage, invoicesPage, confirmInvoicesPage, loginPage, readFilters, settingsPage, panelPage, linkPage, reclassPage, confirmReclassPage, newDealPage, allocationsPage } from './ui.js';
import { SESSION_COOKIE, makeSession, readSession, sessionCookie, cookieValue, isAdmin, allowedToSignIn, allowedWorkspace, linkedEmail, LINK_COOKIE, makeLinkToken, readLinkToken, isUnlinkedCampfireUser, setSettingsAdmins, envAdmins } from './session.js';
import { googleConfigured, startLogin, finishLogin } from './google.js';
import { oauthConfigured, startAuth, finishAuth, verifyContext, revoke, discovery } from './campfire-oauth.js';
import { connectionLoaded, connection, saveConnection, clearConnection, loadConnection, fallbacks } from './campfire.js';
import { getStore, StoreError, ShareTakenError } from './store.js';

const campfireApi = { createInvoice, uploadFile, getBill, updateBill, getInvoice, updateInvoice, createJournalEntry, entityInvoiceMessage, entityLogo, fetchLogo };
import { dealGroups, withStatus, canDecide, customerReady } from './approvals.js';
import { startInvoice, advanceRun, prepareInvoice, retagRun, paymentInfoFor, logoFor, rebuildPdf, todayET } from './invoicing.js';
import { buildInvoicePdf, invoiceFilename } from './invoice-pdf.js';

const STATIC = {
  '/static/queue.js': { file: '../public/queue.js', type: 'text/javascript; charset=utf-8' },
  '/static/deals.js': { file: '../public/deals.js', type: 'text/javascript; charset=utf-8' },
  '/static/dashboard.js': { file: '../public/dashboard.js', type: 'text/javascript; charset=utf-8' },
  '/static/link.js': { file: '../public/link.js', type: 'text/javascript; charset=utf-8' },
  '/static/newdeal.js': { file: '../public/newdeal.js', type: 'text/javascript; charset=utf-8' },
  // The Rekindle flame as the browser-tab icon (/favicon.ico for browsers that ask for it directly).
  '/favicon.svg': { file: '../public/favicon.svg', type: 'image/svg+xml' },
  '/favicon.ico': { file: '../public/favicon.svg', type: 'image/svg+xml' },
};
const BILL_TOPICS = new Set(['Bill.created', 'Bill.updated']);
const OAUTH_COOKIE = 'rekindle_oauth';
const CF_COOKIE = 'rekindle_cf';
const EMAIL_RE = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;


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

// Who may show Rekindle inside a frame: Rekindle itself and Campfire.
const frameAncestors = () => process.env.REKINDLE_FRAME_ANCESTORS || "'self' https://*.meetcampfire.com https://meetcampfire.com https://*.campfire.ai";

// Shown inside Campfire (a panel or navigation entry)?
const isEmbedded = (req, url) => req.headers['sec-fetch-dest'] === 'iframe' || url.searchParams.get('embed') === '1';

// Refuse form posts that come from another site (the session cookie is
// SameSite=None so it works inside Campfire).
function crossSitePost(req) {
  if (req.method !== 'POST') return false;
  // Browsers say where a request came from; trust that first.
  const site = req.headers['sec-fetch-site'];
  if (site) return site === 'cross-site';
  const origin = req.headers.origin;
  if (!origin || origin === 'null') return false;
  const proto = req.headers['x-forwarded-proto'] || 'http';
  return origin !== `${proto}://${req.headers.host}`;
}

// The Rekindle user for a verified Campfire context: by email when Campfire
// sends one, else by Campfire user ID within an allowed workspace, as the
// email that ID is linked to (REKINDLE_CAMPFIRE_USERS, or linked by the
// person themselves), else as an unlinked Campfire user.
async function contextUser(who) {
  if (who.email) return allowedToSignIn(who.email) ? { email: who.email, name: who.name, via: 'campfire', campfireUserId: who.userId } : null;
  if (who.userId == null || !allowedWorkspace(who.workspace)) return null;
  const linked = await linkedFor(who.userId);
  if (linked) return { email: linked, name: linked, via: 'campfire', campfireUserId: who.userId, workspace: who.workspace };
  return { email: `campfire-user-${who.userId}`, name: `Campfire user ${who.userId}`, via: 'campfire', campfireUserId: who.userId, workspace: who.workspace };
}
async function linkedFor(campfireUserId) {
  const fromEnv = linkedEmail(campfireUserId);
  if (fromEnv) return fromEnv;
  try {
    const l = await (await getStore()).getUserLink(campfireUserId);
    return l && allowedToSignIn(l.email) ? l.email : null;
  } catch { return null; }
}

// After a sign-in in a tab opened by "Link my account": tie the Campfire user to this email.
const campfireSignIn = () => oauthConfigured() && process.env.REKINDLE_CAMPFIRE_SIGNIN === 'true';
const linkUrlFor = (user, req) => (isUnlinkedCampfireUser(user) ? `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}/link/start?t=${encodeURIComponent(makeLinkToken(user))}` : null);
const linkPending = (req) => readLinkToken(cookieValue(req, LINK_COOKIE));
const clearLink = (req) => `${LINK_COOKIE}=; HttpOnly; Path=/; Max-Age=0${req.headers['x-forwarded-proto'] === 'https' ? '; Secure; SameSite=Lax' : '; SameSite=Lax'}`;

// Diagnostics for a cf_ctx that didn't verify: its header and claim names, never values.
function describeToken(t) {
  try {
    const [h, p] = String(t).split('.');
    return { header: JSON.parse(Buffer.from(h, 'base64url').toString('utf8')), claims: Object.keys(JSON.parse(Buffer.from(p, 'base64url').toString('utf8'))) };
  } catch { return { shape: `${String(t).split('.').length} parts, ${String(t).length} chars` }; }
}

function send(res, status, body, type = 'text/plain; charset=utf-8', headers = {}) {
  res.writeHead(status, {
    'Content-Type': type,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    ...(type.startsWith('text/html') ? { 'Content-Security-Policy': `default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src 'self' data:; form-action 'self' https://accounts.google.com; frame-ancestors ${frameAncestors()}` } : {}),
    ...headers,
  });
  res.end(typeof body === 'string' ? body : JSON.stringify(body, null, 2));
}
// Every page gets the person's light/dark choice on <html> (none = follow the device).
const html = (res, body, status = 200) => send(res, status, res.rekindleTheme ? String(body).replace('<html lang="en"', `<html lang="en" data-theme="${res.rekindleTheme}"`) : body, 'text/html; charset=utf-8');
const THEME_COOKIE = 'rekindle_theme';
const THEMES = ['light', 'dark'];
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
  const [config, bills, invoiced, reclassed] = await Promise.all([loadConfig(), loadBills(), store.invoicedShares(), store.reclassedLines()]);
  const plan = planBills(bills, config, { invoiced, reclassed });
  const [approvers, decisions, runs, reclassAccounts, reclassRuns] = await Promise.all([store.getApprovers(), store.latestDecisions(), store.listRuns(30), store.getReclassAccounts(), store.listReclass(30)]);
  const groups = withStatus(dealGroups(plan, config), approvers, decisions).map((g) => ({ ...g, canDecide: canDecide(user, g) }));
  const readiness = new Map(plan.customers.map((c) => [c.customer.name, customerReady(c, plan, groups)]));
  return {
    config,
    plan,
    reclass: { waiting: waitingLines(plan, reclassed), accounts: reclassAccounts, runs: reclassRuns },
    groups,
    approvers,
    readiness,
    runs,
    productMissing: !(Number(process.env.REKINDLE_INVOICE_PRODUCT_ID || config.invoice?.productId) > 0),
    productValue: (process.env.REKINDLE_INVOICE_PRODUCT_ID || '').trim(),
    user,
    admin: isAdmin(user),
    storeKind: store.kind,
    demo: demoMode(),
    via: connection() ? 'Campfire app' : 'API key',
    write: writeEnabled(),
    loadedAt: new Date().toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' }) + ' ET',
  };
}

const n = (s, k) => Number(s.get(k)) || 0;
// Where a form may send you back to: only a Rekindle panel path.
const backTo = (form, fallback) => (/^\/campfire\/panel\/(bill|invoice)\/\d+$/.test(form.get('back') || '') ? form.get('back') : fallback);
const SCREENS = {
  '/reclass': (ctx, url) => {
    const s = url.searchParams;
    let flash = null;
    if (s.has('done')) {
      flash = { ok: n(s, 'failed') === 0 && n(s, 'held') === 0 && n(s, 'partial') === 0, text: [
        n(s, 'done') ? `Posted ${n(s, 'done')} reclass journal entr${n(s, 'done') === 1 ? 'y' : 'ies'} in Campfire and marked the lines Expensed.` : '',
        n(s, 'partial') ? `${n(s, 'partial')} posted but the lines weren't all marked; see Reclass history and press Retry.` : '',
        n(s, 'held') ? `${n(s, 'held')} need${n(s, 'held') === 1 ? 's' : ''} checking in Campfire; see Reclass history.` : '',
        n(s, 'failed') ? `${n(s, 'failed')} not posted; see Reclass history for why.` : '',
      ].filter(Boolean).join('\n') };
    } else if (s.has('nothing')) {
      flash = { ok: false, text: 'Select at least one line that is ready to reclass.' };
    } else if (s.has('problems')) {
      flash = { ok: false, text: s.get('problems') };
    } else if (s.has('retried')) {
      flash = { ok: s.get('retried') === 'complete', text: s.get('retried') === 'complete' ? 'Finished.' : 'Still not finished; see the message in Reclass history.' };
    }
    return reclassPage(ctx, flash);
  },
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
  '/deals': (ctx, url) => dealsPage(ctx, url.searchParams.get('deal'), url.searchParams.has('created')
    ? { ok: true, text: url.searchParams.has('owners') ? 'Deal created in Campfire. Add its owners and shares below, then Save setup.' : 'Deal created in Campfire and set up. AP can code bills to it now.' }
    : url.searchParams.has('saved') ? { ok: true, text: 'Deal setup saved. The queue and approvals use it right away.' } : null),
  '/allocations': (ctx, url) => {
    const s = url.searchParams;
    const text = s.has('created') ? 'Allocation created. Pick it in each Allocation deal\'s Setup.' : s.has('saved') ? 'Allocation saved. Every deal using it follows from now on.' : s.has('deleted') ? 'Allocation deleted.' : null;
    return allocationsPage(ctx, { selected: s.get('a'), creating: s.has('new'), flash: text ? { ok: true, text } : null });
  },
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
  '/invoices': (ctx, url) => {
    const s = url.searchParams;
    let flash = null;
    if (s.has('done')) {
      flash = { ok: n(s, 'failed') === 0 && n(s, 'held') === 0 && n(s, 'partial') === 0, text: [
        n(s, 'done') ? `Created ${n(s, 'done')} invoice${n(s, 'done') === 1 ? '' : 's'} in Campfire.` : '',
        n(s, 'partial') ? `${n(s, 'partial')} created but not finished; see Invoice history and press Retry.` : '',
        n(s, 'held') ? `${n(s, 'held')} need${n(s, 'held') === 1 ? 's' : ''} checking in Campfire; see Invoice history.` : '',
        n(s, 'failed') ? `${n(s, 'failed')} not created; see Invoice history for why.` : '',
      ].filter(Boolean).join('\n') };
    } else if (s.has('baddate')) {
      flash = { ok: false, text: 'Pick a valid invoice date.' };
    } else if (s.has('nothing')) {
      flash = { ok: false, text: 'Select at least one customer that is ready to invoice.' };
    } else if (s.has('rebuilt')) {
      const r = s.get('rebuilt');
      flash = { ok: r === 'yes', text: { yes: 'New PDF attached to the invoice in Campfire, with the logo. The earlier PDF is still there too.', nologo: "New PDF attached, but without a logo: Rekindle couldn't use the entity's logo (it needs a PNG or JPEG). See entity_logo_failed in Render's Logs.", failed: "The PDF couldn't be attached; see Render's Logs (pdf_rebuild_failed).", no: 'Only issued invoices can have their PDF rebuilt.' }[r] || 'Done.' };
    } else if (s.has('retagged')) {
      flash = { ok: s.get('retagged') === 'yes', text: s.get('retagged') === 'yes' ? 'Tags and departments applied to the invoice lines in Campfire.' : "Tags weren't applied; see the message in Invoice history." };
    } else if (s.has('retried')) {
      flash = { ok: s.get('retried') === 'complete', text: s.get('retried') === 'complete' ? 'Finished.' : 'Still not finished; see the message in Invoice history.' };
    }
    return invoicesPage(invoiceView(ctx, invoiceFilter(s)), s.get('customer'), flash);
  },
};

// Change the split from a date: the existing owners end the day before (rows
// starting on or after it are replaced) and the new owners start that day.
// Returns owner rows for validateOwners/validateSetup, or null if none given.
function newSplitRows(form, date, existing) {
  const fresh = [];
  for (let i = 0; i < 20; i++) {
    const c = form.get(`new_${i}_customer`);
    const amount = form.get(`new_${i}_amount`) || '';
    const pct = form.get(`new_${i}_percent`);
    if (!c && !pct && !amount) continue;
    fresh.push({ customerTagId: c, amount, percent: pct, start: date, end: '' });
  }
  if (!fresh.length) return null;
  const dayBefore = new Date(Date.parse(date) - 864e5).toISOString().slice(0, 10);
  const kept = [];
  for (const o of existing) {
    if (o.start && o.start >= date) continue; // replaced by the new split
    const end = !o.end || o.end >= date ? dayBefore : o.end;
    // Old rows keep their shares, as $ or % as they were entered.
    const amount = o.amount === null || o.amount === undefined ? '' : String(o.amount);
    kept.push({ customerTagId: String(o.customer?.billbackTagId ?? ''), amount, percent: String(o.percent), start: o.start || '', end });
  }
  return [...kept, ...fresh];
}

// The Invoices screen's filters, from a query string or a posted form:
// billing group ("none" = deals without one), bill dates from/to, customer.
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
function invoiceFilter(params) {
  const day = (k) => (ISO_DAY.test(params.get(k) || '') ? params.get(k) : '');
  return { group: params.get('group') || '', from: day('from'), to: day('to'), cust: params.get('cust') || '' };
}
export function filterQuery(f) {
  return ['group', 'from', 'to', 'cust'].filter((k) => f?.[k]).map((k) => `${k}=${encodeURIComponent(f[k])}`).join('&');
}

// What can be invoiced now: only lines from approved deals, within the
// filters (billing group, bill date range, customer). Each customer's amount,
// lines and PDF count only those; lines from deals not yet approved are
// listed as waiting and stay for a later invoice, and lines outside the
// filters stay for their own invoices.
function invoiceView(ctx, filter = {}) {
  const f = typeof filter === 'string' ? { group: filter } : { group: '', from: '', to: '', cust: '', ...filter };
  const group = f.group;
  const groupOf = new Map(ctx.config.deals.map((d) => [d.dealsTag, d.billingGroup ? String(d.billingGroup.id) : 'none']));
  const inDates = (l) => (!f.from || (l.billDate || '') >= f.from) && (!f.to || (l.billDate || '') <= f.to);
  const inGroup = (l) => (!group || groupOf.get(l.dealsTag) === String(group)) && inDates(l);
  const approved = new Set((ctx.groups || []).filter((g) => g.status === 'approved').flatMap((g) => g.lines.map((l) => l.lineId)));
  const ready = customersFor(ctx.plan, (l) => inGroup(l) && approved.has(l.lineId));
  const held = customersFor(ctx.plan, (l) => inGroup(l) && !approved.has(l.lineId));
  const byId = new Map(ctx.plan.lines.map((l) => [l.lineId, l]));
  const waiting = new Map(held.map((c) => [c.customer.name, { cents: c.cents, sources: c.sources, deals: [...new Set(c.sources.map((x) => byId.get(x.lineId)?.dealsTag).filter(Boolean))].sort() }]));
  // Customers with nothing approved yet still get a row, with nothing to invoice.
  const allCustomers = [...ready, ...held.filter((c) => !ready.some((r) => r.customer.name === c.customer.name)).map((c) => ({ customer: c.customer, cents: 0, sources: [], categories: new Map() }))];
  const customers = f.cust ? allCustomers.filter((c) => c.customer.name === f.cust) : allCustomers;
  const shown = new Set(customers.map((c) => c.customer.name));
  const plan = { ...ctx.plan, customers, totals: { ...ctx.plan.totals, billedCents: ready.filter((c) => shown.has(c.customer.name)).reduce((t, c) => t + c.cents, 0) } };
  const readiness = new Map(customers.map((c) => [c.customer.name, { ready: c.cents > 0, waitingOn: waiting.get(c.customer.name)?.deals || [] }]));
  const customerNames = allCustomers.map((c) => c.customer.name).sort((a, b) => a.localeCompare(b));
  return { ...ctx, plan, readiness, waiting, billingGroupFilter: group ? String(group) : '', invoiceFilter: { ...f, group: group ? String(group) : '' }, customerNames };
}
const byBillingGroup = invoiceView;

// Admins from Settings, re-read from the database at most every 15 seconds.
let adminsAt = 0;
async function refreshAdmins(force = false) {
  if (!force && Date.now() - adminsAt < 15_000) return;
  adminsAt = Date.now();
  try { setSettingsAdmins((await (await getStore()).listAdmins()).map((a) => a.email)); } catch { /* keep the last copy */ }
}

async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  await refreshAdmins();
  let user = currentUser(req);
  await connectionLoaded();
  const embed = isEmbedded(req, url);
  const theme = url.searchParams.get('theme') || cookieValue(req, THEME_COOKIE);
  if (THEMES.includes(theme)) res.rekindleTheme = theme;

  // Light / Dark / Auto, remembered in a cookie. Harmless to follow as a link.
  if (req.method === 'GET' && url.pathname === '/theme') {
    const set = url.searchParams.get('set');
    const back = url.searchParams.get('back') || '/';
    const to = /^\/(?!\/)[^\s]*$/.test(back) ? back : '/';
    const https = req.headers['x-forwarded-proto'] === 'https';
    const attrs = `HttpOnly; Path=/; ${https ? `SameSite=None; Secure${req.headers['sec-fetch-dest'] === 'iframe' ? '; Partitioned' : ''}` : 'SameSite=Lax'}`;
    const cookie = THEMES.includes(set) ? `${THEME_COOKIE}=${set}; ${attrs}; Max-Age=31536000` : `${THEME_COOKIE}=; ${attrs}; Max-Age=0`;
    return redirect(res, to, { 'Set-Cookie': cookie });
  }

  // Signed in from Campfire before linking: pick up a link made since.
  if (isUnlinkedCampfireUser(user)) {
    const linked = await linkedFor(user.campfireUserId);
    if (linked) {
      user = { email: linked, name: linked, via: 'campfire', campfireUserId: user.campfireUserId, workspace: user.workspace };
      res.setHeader('Set-Cookie', sessionCookie(makeSession(user), req));
    }
  }

  // Server-to-server and token calls carry no cookie; everything else must come from Rekindle's own pages.
  const tokenCall = url.searchParams.has('token') || /^Bearer\s/i.test(req.headers.authorization || '');
  if (url.pathname !== '/webhooks/campfire' && !tokenCall && crossSitePost(req)) {
    console.log(JSON.stringify({ event: 'cross_site_post_refused', path: url.pathname, origin: req.headers.origin || null }));
    return send(res, 403, 'Refused: this form was sent from another site.');
  }

  // Campfire adds a signed cf_ctx when it opens a Rekindle page (Manage URL,
  // panels, navigation, buttons). A valid one signs the person in.
  if (url.searchParams.has('cf_ctx') && url.pathname !== '/campfire/manage') {
    const t = url.searchParams.get('cf_ctx');
    try {
      const who = await verifyContext(t);
      const u = await contextUser(who);
      if (u) {
        user = u;
        res.setHeader('Set-Cookie', sessionCookie(makeSession(user), req));
        console.log(JSON.stringify({ event: 'cf_ctx_signed_in', campfireUser: who.userId, workspace: who.workspace, signedWith: who.signedWith, admin: isAdmin(user) }));
      } else {
        console.log(JSON.stringify({ event: 'cf_ctx_not_allowed', email: who.email || null, campfireUser: who.userId, workspace: who.workspace }));
      }
    } catch (err) {
      console.log(JSON.stringify({ event: 'cf_ctx_rejected', error: err.message, token: describeToken(t) }));
    }
  }

  if (req.method === 'GET' && url.pathname === '/health') {
    let database = false;
    let databaseError;
    try { database = (await getStore()).kind === 'postgres'; } catch (err) { databaseError = err.message; }
    return send(res, 200, { ok: true, write: writeEnabled(), demo: demoMode(), database, ...(databaseError ? { databaseError } : {}), google: googleConfigured(), campfireApp: oauthConfigured(), campfireConnected: Boolean(connection()), apiKey: Boolean(process.env.CAMPFIRE_API_KEY) }, 'application/json');
  }

  if (req.method === 'GET' && STATIC[url.pathname]) {
    const { file, type } = STATIC[url.pathname];
    return send(res, 200, await readFile(new URL(file, import.meta.url), 'utf8'), type, { 'Cache-Control': 'public, max-age=300' });
  }

  if (req.method === 'POST' && url.pathname === '/webhooks/campfire') {
    return handleWebhook(req, res);
  }

  // ---- Sign in / out
  // "Sign in with Campfire" needs the app to be allowed openid/email/profile,
  // which Campfire doesn't offer yet, so it's off unless REKINDLE_CAMPFIRE_SIGNIN=true.
  const loginOpts = { google: googleConfigured(), campfire: campfireSignIn(), token: Boolean(process.env.REKINDLE_ADMIN_TOKEN), embed };
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
      res.writeHead(303, { Location: linkPending(req) ? '/link/finish' : '/', 'Set-Cookie': [sessionCookie(makeSession({ ...who, via: 'google' }), req), clear] });
      return res.end();
    } catch (err) {
      console.log(JSON.stringify({ event: 'login_error', error: err.message }));
      return html(res, loginPage('Google sign-in failed. Try again.', loginOpts), 400);
    }
  }

  // ---- Link my account: a Campfire user (known only by ID) ties themselves to
  // their email by signing in once in a new tab.
  if (req.method === 'GET' && url.pathname === '/link/start') {
    const t = url.searchParams.get('t');
    const link = readLinkToken(t);
    if (!link) return html(res, linkPage({ state: 'expired', loginOpts }), 400);
    const cookie = `${LINK_COOKIE}=${t}; HttpOnly; Path=/; Max-Age=600; SameSite=Lax${req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : ''}`;
    // Already signed in here with a real email (not the access token): link now.
    if (user?.email && user.via !== 'token' && !isUnlinkedCampfireUser(user) && allowedToSignIn(user.email)) {
      return redirect(res, '/link/finish', { 'Set-Cookie': cookie });
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Set-Cookie': cookie, 'Content-Security-Policy': `default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; form-action 'self'; frame-ancestors 'none'`, 'Referrer-Policy': 'same-origin' });
    // An admin signed in with the access token (no email) says which email it is.
    return res.end(linkPage({ state: isAdmin(user) ? 'assign' : 'signin', link, loginOpts }));
  }
  if (req.method === 'GET' && url.pathname === '/link/finish') {
    const link = linkPending(req);
    if (!link) return html(res, linkPage({ state: 'expired', loginOpts }), 400);
    if (!user?.email || user.via === 'token' || isUnlinkedCampfireUser(user) || !allowedToSignIn(user.email)) {
      return html(res, linkPage({ state: 'signin', loginOpts }));
    }
    if (!allowedWorkspace(link.workspace)) return html(res, linkPage({ state: 'workspace', loginOpts }), 403);
    const store = await getStore();
    await store.saveUserLink({ campfireUserId: link.campfireUserId, workspace: link.workspace, email: user.email });
    await store.audit(user.email, 'campfire_user_linked', { campfireUserId: link.campfireUserId, workspace: link.workspace });
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Set-Cookie': clearLink(req) });
    return res.end(linkPage({ state: 'done', email: user.email, loginOpts }));
  }
  // An admin links a Campfire user to an email they name (when Campfire won't say who signed in).
  if (req.method === 'POST' && url.pathname === '/link/assign') {
    if (!isAdmin(user)) return send(res, 403, 'Only admins can link people.');
    const link = linkPending(req);
    if (!link) return html(res, linkPage({ state: 'expired', loginOpts }), 400);
    const email = String(new URLSearchParams(await readBody(req)).get('email') || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email) || !allowedToSignIn(email)) return html(res, linkPage({ state: 'assign', link, loginOpts, error: `${email || 'That'} isn't an email Rekindle allows (REKINDLE_ALLOWED_DOMAIN, REKINDLE_ALLOWED_EMAILS or REKINDLE_ADMINS).` }), 400);
    if (!allowedWorkspace(link.workspace)) return html(res, linkPage({ state: 'workspace', loginOpts }), 403);
    const store = await getStore();
    await store.saveUserLink({ campfireUserId: link.campfireUserId, workspace: link.workspace, email });
    await store.audit(user.email, 'campfire_user_linked', { campfireUserId: link.campfireUserId, workspace: link.workspace, email, by: 'admin' });
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Set-Cookie': clearLink(req) });
    return res.end(linkPage({ state: 'done', email, loginOpts }));
  }
  // Admins managed on Settings.
  if (req.method === 'POST' && (url.pathname === '/admins/add' || url.pathname === '/admins/remove')) {
    if (!isAdmin(user)) return send(res, 403, 'Only admins can change admins.');
    const email = String(new URLSearchParams(await readBody(req)).get('email') || '').trim().toLowerCase();
    const store = await getStore();
    if (url.pathname === '/admins/add') {
      if (!EMAIL_RE.test(email)) return redirect(res, '/settings?admin=bad');
      await store.addAdmin(email, user.email);
      await store.audit(user.email, 'admin_added', { email });
    } else {
      if (email === String(user.email).toLowerCase()) return redirect(res, '/settings?admin=self');
      await store.removeAdmin(email);
      await store.audit(user.email, 'admin_removed', { email });
    }
    await refreshAdmins(true);
    return redirect(res, `/settings?admin=${url.pathname === '/admins/add' ? 'added' : 'removed'}`);
  }

  if (req.method === 'POST' && url.pathname === '/link/remove') {
    if (!isAdmin(user)) return send(res, 403, 'Only admins can unlink people.');
    const id = new URLSearchParams(await readBody(req)).get('campfire_user');
    if (id) {
      const store = await getStore();
      await store.deleteUserLink(id);
      await store.audit(user.email, 'campfire_user_unlinked', { campfireUserId: id });
    }
    return redirect(res, '/settings');
  }

  // ---- Campfire OAuth app.
  // /connect/campfire is the app's Connect URL (Campfire's Connections page
  // sends people here): Rekindle gets API access to the workspace.
  // /auth/campfire is "Sign in with Campfire": only who you are.
  if (req.method === 'GET' && (url.pathname === '/connect/campfire' || url.pathname === '/auth/campfire')) {
    if (!oauthConfigured()) return html(res, loginPage('The Campfire app isn\'t set up yet: add CAMPFIRE_CLIENT_ID and CAMPFIRE_CLIENT_SECRET on Render.', loginOpts), 503);
    const purpose = url.pathname === '/connect/campfire' ? 'connect' : 'login';
    if (purpose === 'login' && !campfireSignIn()) return redirect(res, '/login');
    try {
      const a = await startAuth(req, purpose);
      const secure = req.headers['x-forwarded-proto'] === 'https' ? '; Secure' : '';
      return redirect(res, a.url, { 'Set-Cookie': `${CF_COOKIE}=${[a.state, a.nonce, a.verifier, a.purpose].join('.')}; HttpOnly; SameSite=Lax; Path=/auth; Max-Age=600${secure}` });
    } catch (err) {
      console.log(JSON.stringify({ event: 'campfire_auth_error', error: err.message }));
      return html(res, loginPage(err.message, loginOpts), 502);
    }
  }
  if (req.method === 'GET' && url.pathname === '/auth/campfire/callback') {
    const [state, nonce, verifier, purpose] = (cookieValue(req, CF_COOKIE) || '').split('.');
    const clear = `${CF_COOKIE}=; HttpOnly; SameSite=Lax; Path=/auth; Max-Age=0`;
    const fail = (msg, status = 400) => { res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Set-Cookie': clear }); res.end(loginPage(msg, loginOpts)); };
    if (url.searchParams.get('error')) return fail(`Campfire said: ${url.searchParams.get('error_description') || url.searchParams.get('error')}.`);
    if (!state || !safeEqual(state, url.searchParams.get('state')) || !url.searchParams.get('code')) return fail('Campfire sign-in expired or was interrupted. Try again.');
    try {
      const { who: found, connection: conn } = await finishAuth(req, url.searchParams.get('code'), { verifier, nonce });
      // Connecting from Rekindle while signed in as an admin doesn't need
      // Campfire to say who you are; signing in does.
      const who = found || (purpose === 'connect' && isAdmin(user) ? { email: user.email, name: user.name, workspace: null, fromSession: true } : null);
      if (!who) {
        return fail(purpose === 'connect'
          ? "Campfire connected but didn't say who you are, so Rekindle can't tell you're an admin. Sign in to Rekindle first (Google or token), then press Connect Campfire on Settings."
          : "Campfire didn't say who you are (no email), so Rekindle can't sign you in. Add the openid, email and profile scopes to the Rekindle app in Campfire, or sign in with Google.");
      }
      if (!who.fromSession && !allowedToSignIn(who.email)) {
        console.log(JSON.stringify({ event: 'login_denied', email: who.email, via: 'campfire' }));
        return fail(`${who.email} isn't allowed to use Rekindle. Ask an admin to add you.`, 403);
      }
      const store = await getStore();
      let to = '/';
      if (purpose === 'connect') {
        // Only an admin may (re)point Rekindle at a Campfire workspace.
        if (!isAdmin(who) && !isAdmin(user)) return fail(`Only Rekindle admins can connect Campfire. ${who.email} isn't in REKINDLE_ADMINS.`, 403);
        await saveConnection({ ...conn, workspace: conn.workspace || who.workspace || null }, { connectedBy: who.email, fresh: true });
        await store.audit(who.email, 'campfire_connected', { scope: conn.scope || null });
        to = '/settings?connected=1';
      } else {
        await store.audit(who.email, 'sign_in', { via: 'campfire' });
      }
      const session = who.fromSession ? [] : [sessionCookie(makeSession({ email: who.email, name: who.name, via: 'campfire' }), req)];
      res.writeHead(303, { Location: purpose === 'login' && linkPending(req) ? '/link/finish' : to, 'Set-Cookie': [...session, clear] });
      return res.end();
    } catch (err) {
      console.log(JSON.stringify({ event: 'campfire_callback_error', error: err.message }));
      return fail(`Campfire sign-in failed: ${err.message}`);
    }
  }
  // The app's Manage URL: Campfire opens it with a signed cf_ctx naming the
  // person and workspace. A valid one signs them straight in; otherwise they
  // go through "Sign in with Campfire" (one click if they're signed in there).
  if (req.method === 'GET' && url.pathname === '/campfire/manage') {
    const ctxToken = url.searchParams.get('cf_ctx');
    if (ctxToken) {
      try {
        const who = await verifyContext(ctxToken);
        const u = await contextUser(who);
        if (u) {
          const store = await getStore();
          await store.audit(u.email, 'sign_in', { via: 'campfire_manage', workspace: who.workspace });
          return redirect(res, '/', { 'Set-Cookie': sessionCookie(makeSession(u), req) });
        }
        console.log(JSON.stringify({ event: 'manage_denied', email: who.email, campfireUser: who.userId, workspace: who.workspace }));
      } catch (err) {
        console.log(JSON.stringify({ event: 'manage_ctx_rejected', error: err.message, token: describeToken(ctxToken) }));
      }
    }
    if (user) return redirect(res, '/');
    return redirect(res, campfireSignIn() ? '/auth/campfire' : '/login');
  }

  // ---- Settings: the Campfire connection
  if (req.method === 'GET' && url.pathname === '/settings') {
    if (!user) return redirect(res, '/login');
    let ctx;
    try { ctx = await screenContext(user); } catch (err) {
      // Still show Settings when Campfire can't be read: that's where it's fixed.
      const store = await getStore().catch(() => ({ kind: 'error' }));
      ctx = { config: { deals: [] }, plan: { lines: [], customers: [] }, groups: null, user, admin: isAdmin(user), storeKind: store.kind, demo: demoMode(), write: writeEnabled(), loadedAt: '—', loadError: err.message };
    }
    let endpoints = null;
    if (oauthConfigured()) {
      try { const d = await discovery(); endpoints = { authorize: d.authorization_endpoint, token: d.token_endpoint, scopes: d.scopes_supported || null, from: d._from || 'Render settings' }; }
      catch (err) { endpoints = { error: err.message }; }
    }
    const conn = connection();
    const s = url.searchParams;
    const flash = s.has('connected') ? { ok: true, text: 'Connected to Campfire. Rekindle now reads and writes with this connection.' }
      : s.has('disconnected') ? { ok: true, text: 'Disconnected from Campfire.' }
      : s.get('reclass') === 'saved' ? { ok: true, text: 'Reclass account saved.' }
      : s.get('reclass') === 'bad' ? { ok: false, text: 'Pick an account (or enter its ID).' }
      : s.get('reclass') === 'filled' ? { ok: true, text: `Filled ${s.get('n') || 0} categor${s.get('n') === '1' ? 'y' : 'ies'} by name. Check them below; change any that are wrong.` }
      : s.get('reclass') === 'fillfailed' ? { ok: false, text: `Couldn't read categories or accounts from Campfire: ${s.get('why') || ''}` }
      : s.get('reclass') === 'demo' ? { ok: false, text: 'Connect Campfire first; demo mode has no chart of accounts.' }
      : s.get('admin') === 'added' ? { ok: true, text: 'Admin added. They have admin rights the next time they load a page.' }
      : s.get('admin') === 'removed' ? { ok: true, text: 'Admin removed.' }
      : s.get('admin') === 'self' ? { ok: false, text: "You can't remove yourself. Ask another admin." }
      : s.get('admin') === 'bad' ? { ok: false, text: "That isn't an email address." } : null;
    const links = isAdmin(user) ? await (await getStore()).listUserLinks().catch(() => []) : [];
    const admins = isAdmin(user) ? { settings: await (await getStore()).listAdmins().catch(() => []), env: envAdmins() } : null;
    let reclassSetup = null;
    if (isAdmin(user)) {
      const config = ctx.config?.tagGroups ? ctx.config : await loadConfig().catch(() => null);
      let categories = [];
      let accounts = null;
      let accountsError = null;
      if (!demoMode() && config) {
        categories = await listTags(config.tagGroups.rechargeCategory).then((t) => t.map((x) => ({ id: x.id, name: x.name }))).catch(() => []);
        accounts = await listExpenseAccounts().catch((err) => { accountsError = err.message; return null; });
      } else if (ctx.plan) {
        const seen = new Map(ctx.plan.lines.filter((l) => l.rechargeCategoryId).map((l) => [l.rechargeCategoryId, l.rechargeCategory]));
        categories = [...seen].map(([id, name]) => ({ id, name }));
      }
      const suggestions = new Map(accounts ? categories.map((c) => [Number(c.id), matchAccount(c, accounts)]).filter(([, a]) => a) : []);
      reclassSetup = { categories, accounts, accountsError, suggestions, saved: await (await getStore()).getReclassAccounts().catch(() => new Map()) };
    }
    return html(res, settingsPage({ ...ctx, embed, theme: res.rekindleTheme, path: '/settings', linkUrl: linkUrlFor(user, req), links, admins, reclassSetup, settings: {
      appConfigured: oauthConfigured(),
      apiKey: Boolean(process.env.CAMPFIRE_API_KEY),
      scopesWanted: process.env.CAMPFIRE_OAUTH_SCOPES || '',
      endpoints,
      fallbacks: conn ? fallbacks() : [],
      connection: conn && { connectedBy: conn.connected_by, connectedAt: conn.connected_at, expiresAt: conn.expires_at, scope: conn.scope, workspace: conn.workspace, refreshable: Boolean(conn.refresh_token) },
    } }, flash));
  }
  if (req.method === 'POST' && url.pathname === '/connect/campfire/disconnect') {
    if (!isAdmin(user)) return send(res, 403, 'Only admins can disconnect Campfire.');
    const conn = connection();
    if (conn) {
      await revoke(conn).catch(() => {});
      await clearConnection();
      await (await getStore()).audit(user.email, 'campfire_disconnected', {});
    }
    return redirect(res, '/settings?disconnected=1');
  }

  // ---- Inside Campfire: panels on bills and invoices, and the invoice PDF button.
  const panel = req.method === 'GET' && url.pathname.match(/^\/campfire\/panel\/(bill|invoice)\/(\d+)$/);
  if (panel) {
    if (!user) return redirect(res, '/login');
    const id = Number(panel[2]);
    const store = await getStore();
    const base = { user, admin: isAdmin(user), write: writeEnabled(), demo: demoMode(), back: url.pathname, flash: url.searchParams.get('retagged'), linkUrl: linkUrlFor(user, req) };
    try {
      if (panel[1] === 'bill') {
        const [config, bill] = await Promise.all([loadConfig(), demoMode() ? loadBills().then((b) => b.find((x) => x.id === id)) : getBill(id)]);
        if (!bill) return html(res, panelPage({ ...base, kind: 'bill', missing: true }));
        const lines = (bill.lines || []).filter((l) => l.account_number === config.unbilledAccountNumber);
        const invoices = lines.length ? await store.invoicesForLines(lines.map((l) => l.id)) : [];
        const reclasses = lines.length ? await store.reclassForLines(lines.map((l) => l.id)) : [];
        return html(res, panelPage({ ...base, kind: 'bill', bill, config, lines: lines.map((l) => ({ line: l, plan: planLine(bill, l, config) })), invoices, reclasses }));
      }
      const run = await store.runByInvoice(id);
      const items = run ? await store.runItems(run.id) : [];
      return html(res, panelPage({ ...base, kind: 'invoice', run, items }));
    } catch (err) {
      console.log(JSON.stringify({ event: 'panel_error', path: url.pathname, error: err.message }));
      return html(res, panelPage({ ...base, kind: panel[1], error: err.message }), 502);
    }
  }
  const invPdf = req.method === 'GET' && url.pathname.match(/^\/campfire\/invoice\/(\d+)\/pdf$/);
  if (invPdf) {
    if (!user) return redirect(res, '/login');
    const run = await (await getStore()).runByInvoice(Number(invPdf[1]));
    if (!run?.pdf) return html(res, panelPage({ user, kind: 'invoice', run: null, items: [] }), 404);
    return redirect(res, `/invoices/run/${run.id}/pdf`);
  }

  // ---- Screens and actions need a signed-in user
  if (req.method === 'GET' && (url.pathname === '/dashboard' || url.pathname === '/dashboard.csv')) {
    if (!user) return redirect(res, '/login');
    const ctx = await screenContext(user);
    let invoices = [];
    let invoicesError = null;
    if (!ctx.demo) {
      try { invoices = await listInvoices({ keepGroup: ctx.config.tagGroups.deals }); } catch (err) {
        invoicesError = err.message;
        console.log(JSON.stringify({ event: 'dashboard_invoices_failed', error: err.message }));
      }
    }
    const deal = url.searchParams.get('deal') || null;
    const d = dashboardData({ plan: ctx.plan, groups: ctx.groups, invoices, config: ctx.config, today: todayET(), deal });
    if (url.pathname === '/dashboard.csv') {
      const view = ['deals', 'customers', 'invoices', 'unbilled'].includes(url.searchParams.get('view')) ? url.searchParams.get('view') : 'unbilled';
      const name = `Rekindle-${view}${deal ? `-${deal.replace(/[^A-Za-z0-9]+/g, '-')}` : ''}-${d.today}.csv`;
      res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
      return res.end('\uFEFF' + dashboardCsv(d, view));
    }
    return html(res, dashboardPage({ ...ctx, embed, theme: res.rekindleTheme, path: url.pathname + url.search, linkUrl: linkUrlFor(user, req) }, d, { invoicesError }));
  }

  if (req.method === 'GET' && SCREENS[url.pathname]) {
    if (!user) return redirect(res, '/login');
    return html(res, SCREENS[url.pathname]({ ...(await screenContext(user)), embed, theme: res.rekindleTheme, path: url.pathname + url.search, linkUrl: linkUrlFor(user, req) }, url));
  }

  if (req.method === 'GET' && url.pathname === '/invoices/pdf') {
    if (!user) return redirect(res, '/login');
    const store = await getStore();
    const [config, bills, invoiced] = await Promise.all([loadConfig(), loadBills(), store.invoicedShares()]);
    const plan = invoiceView(await screenContext(user), invoiceFilter(url.searchParams)).plan;
    const customer = plan.customers.find((c) => c.customer.name === url.searchParams.get('customer'));
    if (!customer) return send(res, 404, 'No invoice for that customer in the current run.');
    const paymentInfo = await paymentInfoFor(customer, plan, { config, api: campfireApi, log: console.log });
    const logo = await logoFor(customer, plan, { config, api: campfireApi, log: console.log });
    const pdf = buildInvoicePdf({ customer, plan, branding: { ...(config.invoice || {}), ...(paymentInfo ? { paymentInfo } : {}), ...(logo ? { logo } : {}) }, invoice: { draft: true } });
    res.writeHead(200, {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${invoiceFilename(customer.customer.name)}"`,
      'Content-Length': pdf.length,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    });
    return res.end(pdf);
  }

  // ---- Invoicing
  const invoiceRoute = ['/invoices/confirm', '/invoices/create', '/invoices/retry', '/invoices/resolve', '/invoices/retag', '/invoices/rebuild-pdf'].includes(url.pathname);
  if (req.method === 'POST' && invoiceRoute) {
    if (!user) return redirect(res, '/login');
    if (!isAdmin(user)) return send(res, 403, 'Only admins can create invoices.');
    if (demoMode() || !writeEnabled()) return redirect(res, '/invoices');
    const form = new URLSearchParams(await readBody(req));
    const store = await getStore();
    // What's been invoiced must survive restarts, or a partly invoiced split
    // could be billed again. Only tests may use the in-memory store.
    if (store.kind !== 'postgres' && process.env.REKINDLE_ALLOW_MEMORY_STORE !== 'true') {
      return send(res, 409, 'Connect the database (DATABASE_URL) before creating invoices, so Rekindle keeps a permanent record of what it has billed.');
    }

    if (url.pathname === '/invoices/confirm' || url.pathname === '/invoices/create') {
      const ctx = invoiceView({ ...(await screenContext(user)), embed, theme: res.rekindleTheme, path: '/invoices' }, invoiceFilter(form));
      const names = new Set(form.getAll('customer'));
      // Approval is advice, not a gate: people decide when lines are charged.
      // The screens and the confirmation page say which deals aren't approved.
      const chosen = ctx.plan.customers.filter((c) => names.has(c.customer.name) && c.customer.customerId && c.cents > 0);
      const back = filterQuery(ctx.invoiceFilter) ? `&${filterQuery(ctx.invoiceFilter)}` : '';
      if (!chosen.length) return redirect(res, `/invoices?nothing=1${back}`);
      // Invoice date: today unless the person picked another (backdating allowed).
      const date = form.get('date') || todayISO();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return redirect(res, `/invoices?baddate=1${back}`);

      if (url.pathname === '/invoices/confirm' || form.get('confirm') !== 'yes') {
        const preview = chosen.map((customer) => ({ customer, ...prepareInvoice({ customer, plan: ctx.plan, config: ctx.config, date, ref: 'preview' }) }));
        return html(res, confirmInvoicesPage(ctx, preview, date));
      }

      const tally = { done: 0, partial: 0, held: 0, failed: 0 };
      for (const customer of chosen) {
        try {
          const out = await startInvoice({ customer, plan: ctx.plan, config: ctx.config, store, api: campfireApi, user, date, log: console.log });
          if (!out.ok) { tally.failed++; console.log(JSON.stringify({ event: 'invoice_blocked', customer: customer.customer.name, problems: out.problems })); continue; }
          const st = out.run.status;
          if (st === 'complete') tally.done++;
          else if (st === 'unknown') tally.held++;
          else if (st === 'failed') tally.failed++;
          else tally.partial++;
        } catch (err) {
          tally.failed++;
          console.log(JSON.stringify({ event: 'invoice_error', customer: customer.customer.name, error: err.message, taken: err instanceof ShareTakenError }));
        }
      }
      return redirect(res, `/invoices?done=${tally.done}&partial=${tally.partial}&held=${tally.held}&failed=${tally.failed}${back}`);
    }

    const run = await store.getRun(Number(form.get('run')));
    if (!run) return send(res, 404, 'No such invoice run.');
    const config = await loadConfig();

    if (url.pathname === '/invoices/retag') {
      if (!run.campfire_invoice_id) return redirect(res, '/invoices');
      try {
        const note = await retagRun(run.id, { store, api: campfireApi, config, log: console.log });
        await store.audit(user.email, 'invoice_retag', { ref: run.ref, ok: !note });
        return redirect(res, `${backTo(form, '/invoices')}?retagged=${note ? 'no' : 'yes'}`);
      } catch (err) {
        await store.updateRun(run.id, { error: `Re-apply tags failed: ${err.message}` });
        return redirect(res, `${backTo(form, '/invoices')}?retagged=no`);
      }
    }

    if (url.pathname === '/invoices/rebuild-pdf') {
      try {
        const out = await rebuildPdf(run.id, { store, api: campfireApi, config, log: console.log });
        await store.audit(user.email, 'invoice_pdf_rebuilt', { ref: run.ref, ok: out.ok, logo: out.logo ?? null });
        return redirect(res, `${backTo(form, '/invoices')}?rebuilt=${out.ok ? (out.logo ? 'yes' : 'nologo') : 'no'}`);
      } catch (err) {
        console.log(JSON.stringify({ event: 'pdf_rebuild_failed', run: run.id, error: err.message }));
        return redirect(res, `${backTo(form, '/invoices')}?rebuilt=failed`);
      }
    }

    if (url.pathname === '/invoices/retry') {
      if (!['created', 'pdf_attached'].includes(run.status)) return redirect(res, '/invoices');
      const after = await advanceRun(run.id, { store, api: campfireApi, config, log: console.log });
      await store.audit(user.email, 'invoice_retry', { ref: run.ref, status: after.status });
      return redirect(res, `/invoices?retried=${after.status}`);
    }

    // Resolve a run whose outcome was unknown, after checking Campfire.
    if (run.status !== 'unknown') return redirect(res, '/invoices');
    if (form.get('outcome') === 'not_created') {
      await store.releaseRun(run.id, `Checked in Campfire by ${user.email}: not created. Lines released.`);
      await store.audit(user.email, 'invoice_resolve', { ref: run.ref, outcome: 'not_created' });
      return redirect(res, '/invoices');
    }
    const id = Number(form.get('campfire_id'));
    if (!Number.isInteger(id) || id <= 0) return send(res, 400, 'Enter the Campfire invoice ID you found.');
    await store.updateRun(run.id, { status: 'created', campfire_invoice_id: id, invoice_number: String(id), error: null });
    await store.audit(user.email, 'invoice_resolve', { ref: run.ref, outcome: 'found', campfireInvoiceId: id });
    const after = await advanceRun(run.id, { store, api: campfireApi, config, log: console.log });
    return redirect(res, `/invoices?retried=${after.status}`);
  }

  // ---- Reclass: Expense lines moved off the unbilled account by journal entry.
  const reclassRoute = ['/reclass/confirm', '/reclass/create', '/reclass/retry', '/reclass/resolve'].includes(url.pathname);
  if (req.method === 'POST' && reclassRoute) {
    if (!user) return redirect(res, '/login');
    if (!isAdmin(user)) return send(res, 403, 'Only admins can post reclass entries.');
    if (demoMode() || !writeEnabled()) return redirect(res, '/reclass');
    const form = new URLSearchParams(await readBody(req));
    const store = await getStore();
    if (store.kind !== 'postgres' && process.env.REKINDLE_ALLOW_MEMORY_STORE !== 'true') {
      return send(res, 409, 'Connect the database (DATABASE_URL) before posting reclasses, so Rekindle keeps a permanent record of what it has posted.');
    }
    if (url.pathname === '/reclass/confirm' || url.pathname === '/reclass/create') {
      const ctx = { ...(await screenContext(user)), embed, theme: res.rekindleTheme, path: '/reclass' };
      const ids = new Set(form.getAll('line').map(Number));
      const lines = ctx.reclass.waiting.filter((l) => ids.has(l.lineId));
      if (!lines.length) return redirect(res, '/reclass?nothing=1');
      const date = form.get('date') || todayISO();
      if (url.pathname === '/reclass/confirm' || form.get('confirm') !== 'yes') {
        const preview = prepareReclass({ lines, accounts: ctx.reclass.accounts, config: ctx.config, date, ref: 'preview' });
        return html(res, confirmReclassPage(ctx, { lines, date, preview }));
      }
      const tally = { done: 0, partial: 0, held: 0, failed: 0 };
      try {
        const out = await startReclass({ lines, accounts: ctx.reclass.accounts, config: ctx.config, store, api: campfireApi, user, date, log: console.log });
        if (!out.ok) return redirect(res, `/reclass?problems=${encodeURIComponent(out.problems.join(' '))}`);
        for (const r of out.runs) {
          if (r.status === 'complete') tally.done++;
          else if (r.status === 'unknown') tally.held++;
          else if (r.status === 'failed') tally.failed++;
          else tally.partial++;
        }
      } catch (err) {
        tally.failed++;
        console.log(JSON.stringify({ event: 'reclass_error', error: err.message, taken: err instanceof ShareTakenError }));
      }
      return redirect(res, `/reclass?done=${tally.done}&partial=${tally.partial}&held=${tally.held}&failed=${tally.failed}`);
    }
    const run = await store.getReclass(Number(form.get('run')));
    if (!run) return send(res, 404, 'No such reclass run.');
    const config = await loadConfig();
    if (url.pathname === '/reclass/retry') {
      if (run.status !== 'created') return redirect(res, '/reclass');
      const after = await advanceReclass(run.id, { store, api: campfireApi, config, log: console.log });
      await store.audit(user.email, 'reclass_retry', { ref: run.ref, status: after.status });
      return redirect(res, `/reclass?retried=${after.status}`);
    }
    if (run.status !== 'unknown') return redirect(res, '/reclass');
    if (form.get('outcome') === 'not_created') {
      await store.releaseReclass(run.id, `Checked in Campfire by ${user.email}: not created. Lines released.`);
      await store.audit(user.email, 'reclass_resolve', { ref: run.ref, outcome: 'not_created' });
      return redirect(res, '/reclass');
    }
    const id = Number(form.get('campfire_id'));
    if (!Number.isInteger(id) || id <= 0) return send(res, 400, 'Enter the Campfire journal entry ID you found.');
    await store.updateReclass(run.id, { status: 'created', campfire_je_id: id, je_number: String(id), error: null });
    await store.audit(user.email, 'reclass_resolve', { ref: run.ref, outcome: 'found', campfireJeId: id });
    const after = await advanceReclass(run.id, { store, api: campfireApi, config, log: console.log });
    return redirect(res, `/reclass?retried=${after.status}`);
  }

  // Settings → Reclass accounts: the expense account for each Recharge Category.
  // Fill every unset Recharge Category with its best-guess account by name.
  if (req.method === 'POST' && url.pathname === '/settings/reclass-accounts/fill') {
    if (!isAdmin(user)) return send(res, 403, 'Only admins can set reclass accounts.');
    if (demoMode()) return redirect(res, '/settings?reclass=demo#reclass-accounts');
    const config = await loadConfig();
    const store = await getStore();
    let filled = 0;
    try {
      const [categories, accounts, saved] = await Promise.all([listTags(config.tagGroups.rechargeCategory), listExpenseAccounts(), store.getReclassAccounts()]);
      for (const c of categories) {
        if (saved.get(Number(c.id))) continue;
        const a = matchAccount(c, accounts);
        if (!a) continue;
        await store.saveReclassAccount({ categoryTagId: c.id, categoryName: c.name, accountId: a.id, accountLabel: a.label, by: user.email });
        filled++;
      }
    } catch (err) {
      return redirect(res, `/settings?reclass=fillfailed&why=${encodeURIComponent(err.message.slice(0, 200))}#reclass-accounts`);
    }
    await store.audit(user.email, 'reclass_accounts_filled', { filled });
    return redirect(res, `/settings?reclass=filled&n=${filled}#reclass-accounts`);
  }

  if (req.method === 'POST' && url.pathname === '/settings/reclass-account') {
    if (!isAdmin(user)) return send(res, 403, 'Only admins can set reclass accounts.');
    const form = new URLSearchParams(await readBody(req));
    const categoryTagId = Number(form.get('category'));
    const store = await getStore();
    if (!Number.isInteger(categoryTagId) || categoryTagId <= 0) return redirect(res, '/settings?reclass=bad');
    if (form.get('clear') === '1') {
      await store.deleteReclassAccount(categoryTagId);
    } else {
      const [accountId, ...label] = String(form.get('account') || '').split('|');
      if (!(Number(accountId) > 0)) return redirect(res, '/settings?reclass=bad');
      await store.saveReclassAccount({ categoryTagId, categoryName: form.get('category_name') || String(categoryTagId), accountId: Number(accountId), accountLabel: label.join('|') || null, by: user.email });
    }
    await store.audit(user.email, 'reclass_account', { categoryTagId, account: form.get('account') || null });
    return redirect(res, '/settings?reclass=saved#reclass-accounts');
  }

  const pdfMatch = req.method === 'GET' && url.pathname.match(/^\/invoices\/run\/(\d+)\/pdf$/);
  if (pdfMatch) {
    if (!user) return redirect(res, '/login');
    const run = await (await getStore()).getRun(Number(pdfMatch[1]));
    if (!run?.pdf) return send(res, 404, 'No PDF for that invoice.');
    const pdf = Buffer.from(run.pdf);
    res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="Invoice-${String(run.invoice_number || run.ref).replace(/[^A-Za-z0-9-]+/g, '-')}.pdf"`, 'Content-Length': pdf.length, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store' });
    return res.end(pdf);
  }

  // ---- New deal: create it in Campfire (and a new company, if asked) and set it up.
  if (url.pathname === '/deals/new' || url.pathname === '/deals/create') {
    if (!user) return redirect(res, '/login');
    if (!isAdmin(user)) return send(res, 403, 'Only admins can create deals.');
    const ctx = { ...(await screenContext(user)), embed, theme: res.rekindleTheme, path: '/deals/new' };
    const canCreate = !demoMode() && writeEnabled();
    if (req.method === 'GET' && url.pathname === '/deals/new') return html(res, newDealPage(ctx, { canCreate }));
    if (req.method !== 'POST' || url.pathname !== '/deals/create') return send(res, 405, 'Method not allowed');
    const form = Object.fromEntries(new URLSearchParams(await readBody(req)));
    if (!canCreate) return html(res, newDealPage(ctx, { canCreate, form, errors: [demoMode() ? 'Demo mode: connect Campfire to create deals.' : 'Writing to Campfire is off (REKINDLE_WRITE).'] }), 400);
    const plan = validateNewDeal(form, ctx.config);
    if (plan.errors.length) return html(res, newDealPage(ctx, { canCreate, form, errors: plan.errors }), 400);
    try {
      const store = await getStore();
      const out = await createDeal(plan, { config: ctx.config, store, api: { createTag, createCustomer, findCustomerByName, listTags }, user, log: console.log });
      const next = plan.billingType === 'Allocation' ? '&owners=1' : '';
      return redirect(res, `/deals?deal=${encodeURIComponent(plan.name)}&created=1${next}`);
    } catch (err) {
      console.log(JSON.stringify({ event: 'deal_create_failed', deal: plan.name, error: err.message }));
      return html(res, newDealPage(ctx, { canCreate, form, errors: [`Campfire refused part of this: ${err.message}. Anything already created is kept and will be reused when you try again.`] }), 502);
    }
  }

  // ---- Saved allocations (Allocations tab)
  if (req.method === 'POST' && ['/allocations/save', '/allocations/change-split', '/allocations/delete'].includes(url.pathname)) {
    if (!user) return redirect(res, '/login');
    if (!isAdmin(user)) return send(res, 403, 'Only admins can change allocations.');
    const form = new URLSearchParams(await readBody(req));
    const config = await loadConfig();
    const store = await getStore();
    const page = async (opts, status = 400) => html(res, allocationsPage({ ...(await screenContext(user)), embed, theme: res.rekindleTheme, path: '/allocations' }, opts), status);
    const id = form.get('id') ? Number(form.get('id')) : null;
    const current = id ? config.savedAllocations.find((a) => a.id === id) : null;
    if (id && !current) return redirect(res, '/allocations');

    if (url.pathname === '/allocations/delete') {
      if (current.deals.length) return page({ selected: id, flash: { ok: false, text: `Still used by ${current.deals.join(', ')}; change those deals first.` } });
      await store.deleteAllocation(id, user.email);
      return redirect(res, '/allocations?deleted=1');
    }

    if (url.pathname === '/allocations/change-split') {
      const date = form.get('date') || '';
      const fail = (text) => page({ selected: id, flash: { ok: false, split: true, text } });
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail('Pick the date the new split starts.');
      const split = newSplitRows(form, date, current.owners);
      if (!split) return fail('Add at least one new owner.');
      const v = validateOwners(split, config.billbackCustomers, 'An allocation');
      if (v.errors.length) return fail(v.errors.join(' '));
      await store.saveAllocation({ id, name: current.name, owners: v.rows }, user.email);
      return redirect(res, `/allocations?a=${id}&saved=1`);
    }

    // Create or edit: name and owners.
    const name = String(form.get('name') || '').trim().replace(/\s+/g, ' ');
    const owners = [];
    for (let i = 0; i < 20; i++) {
      if (!form.has(`owner_${i}_customer`)) continue;
      owners.push({ customerTagId: form.get(`owner_${i}_customer`), amount: form.get(`owner_${i}_amount`) || '', percent: form.get(`owner_${i}_percent`), start: form.get(`owner_${i}_start`), end: form.get(`owner_${i}_end`) });
    }
    const v = validateOwners(owners, config.billbackCustomers, 'An allocation');
    const errors = [...(name ? [] : ['Give the allocation a name.']), ...(name.length > 120 ? ['Names can be at most 120 characters.'] : []), ...v.errors];
    const draft = { name, owners };
    if (errors.length) return page({ selected: id, creating: !id, draft, flash: { ok: false, text: errors.join(' ') } });
    try {
      const savedId = await store.saveAllocation({ id, name, owners: v.rows }, user.email);
      return redirect(res, `/allocations?a=${savedId}&${id ? 'saved' : 'created'}=1`);
    } catch (err) {
      return page({ selected: id, creating: !id, draft, flash: { ok: false, text: err.message } });
    }
  }

  if (req.method === 'POST' && url.pathname === '/deals/setup') {
    if (!user) return redirect(res, '/login');
    if (!isAdmin(user)) return send(res, 403, 'Only admins can change deal setup.');
    const form = new URLSearchParams(await readBody(req));
    const config = await loadConfig();
    const deal = config.deals.find((d) => d.dealsTagId === Number(form.get('deal')));
    if (!deal) return send(res, 400, 'Unknown deal.');
    const owners = [];
    for (let i = 0; i < 20; i++) {
      if (!form.has(`owner_${i}_customer`)) continue;
      owners.push({
        customerTagId: form.get(`owner_${i}_customer`), amount: form.get(`owner_${i}_amount`) || '', percent: form.get(`owner_${i}_percent`),
        start: form.get(`owner_${i}_start`), end: form.get(`owner_${i}_end`),
      });
    }
    const allocationId = form.get('allocation') || null;
    const result = validateSetup({ billingType: form.get('billingType'), customerTagId: form.get('customer'), owners, allocationId }, config.billbackCustomers, config.savedAllocations);
    if (result.errors.length) {
      return html(res, dealsPage(await screenContext(user), deal.dealsTag, { ok: false, text: result.errors.join(' ') }, { billingType: form.get('billingType'), customerTagId: form.get('customer'), owners, allocationId }), 400);
    }
    const store = await getStore();
    await store.saveDealSetup(deal.dealsTagId, deal.dealsTag, result.setup, result.owners, user.email);
    return redirect(res, `/deals?deal=${encodeURIComponent(deal.dealsTag)}&saved=1`);
  }

  // Change an Allocation deal's split from a date.
  if (req.method === 'POST' && url.pathname === '/deals/change-split') {
    if (!user) return redirect(res, '/login');
    if (!isAdmin(user)) return send(res, 403, 'Only admins can change deal setup.');
    const form = new URLSearchParams(await readBody(req));
    const config = await loadConfig();
    const deal = config.deals.find((d) => d.dealsTagId === Number(form.get('deal')));
    if (!deal) return send(res, 400, 'Unknown deal.');
    const date = form.get('date') || '';
    const fail = async (text) => html(res, dealsPage({ ...(await screenContext(user)), embed, theme: res.rekindleTheme, path: '/deals' }, deal.dealsTag, { ok: false, split: true, text }), 400);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail('Pick the date the new split starts.');
    const split = newSplitRows(form, date, config.allocations.filter((a) => a.dealsTagId === deal.dealsTagId));
    if (!split) return fail('Add at least one new owner.');
    const result = validateSetup({ billingType: 'Allocation', owners: split }, config.billbackCustomers);
    if (result.errors.length) return fail(result.errors.join(' '));
    const store = await getStore();
    await store.saveDealSetup(deal.dealsTagId, deal.dealsTag, result.setup, result.owners, user.email);
    return redirect(res, `/deals?deal=${encodeURIComponent(deal.dealsTag)}&saved=1`);
  }

  if (req.method === 'POST' && url.pathname === '/deals/billing-group') {
    if (!user) return redirect(res, '/login');
    if (!isAdmin(user)) return send(res, 403, 'Only admins can change deal setup.');
    const form = new URLSearchParams(await readBody(req));
    const config = await loadConfig();
    const deal = config.deals.find((d) => d.dealsTagId === Number(form.get('deal')));
    if (!deal) return send(res, 400, 'Unknown deal.');
    const id = Number(form.get('group'));
    const group = id ? config.billingGroups.find((g) => g.id === id) : null;
    if (id && !group) return send(res, 400, 'Unknown billing group.');
    await (await getStore()).setBillingGroup(deal.dealsTagId, deal.dealsTag, group, user.email);
    return redirect(res, `/deals?deal=${encodeURIComponent(deal.dealsTag)}&saved=1`);
  }

  if (req.method === 'POST' && url.pathname === '/deals/approver') {
    if (!user) return redirect(res, '/login');
    if (!isAdmin(user)) return send(res, 403, 'Only admins can change approvers.');
    const form = new URLSearchParams(await readBody(req));
    const config = await loadConfig();
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
      note, amountCents: g.cents, lineIds: g.lines.map((l) => l.lineId), linePrints: g.linePrints,
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
      if (!res.headersSent) {
        send(res, err instanceof StoreError ? 503 : 500, err instanceof StoreError ? err.message : 'Something went wrong. Check the Render logs.');
      }
    }
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const port = Number(process.env.PORT || 3000);
  createServer().listen(port, async () => {
    const store = await getStore().catch((err) => { console.log(JSON.stringify({ event: 'store_error', error: err.message })); return { kind: 'error' }; });
    await loadConnection();
    console.log(JSON.stringify({ event: 'started', port, write: writeEnabled(), demo: demoMode(), store: store.kind, google: googleConfigured(), campfireConnected: Boolean(connection()) }));
  });
}
