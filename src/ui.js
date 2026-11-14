// Server-rendered screens for the Rekindle prototype. No framework, no build step.
// Every value from Campfire or config is escaped before it reaches the page.
import { fromCents } from './engine.js';

export const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const usd = (cents) => fromCents(cents).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const pct = (n) => `${(Math.round(n * 100) / 100).toFixed(2)}%`;

const TYPE_STYLE = {
  Deal: 'background:var(--t-deal-bg);color:var(--t-deal)',
  Fund: 'background:var(--t-fund-bg);color:var(--t-fund)',
  Allocation: 'background:var(--accent-tint);color:var(--accent-dark)',
  Expense: 'background:var(--hover);color:var(--nav-ink)',
};
const pill = (text, style) => `<span class="pill" style="${style}">${esc(text)}</span>`;
const typePill = (t) => (t ? pill(t, TYPE_STYLE[t] || TYPE_STYLE.Expense) : '');

// Colors: Rekindle's own (orange) on its own site, Campfire's (green) when
// shown inside Campfire; each light or dark. data-theme on <html> is set from
// the person's choice; without one, the device's light/dark setting decides.
const PALETTES = {
  light: '--ink:#1C1B19;--quiet:#5F5B55;--line:#E6E2DC;--soft:#EFECE7;--bg:#F7F5F2;--surface:#fff;--nav-ink:#3F3B36;--hover:#F1EEE9;--field-line:#D6D1C9;--accent:#C2410C;--accent-dark:#9A3412;--accent-tint:#FDECE3;--on-accent:#fff;--good:#166534;--good-tint:#E7F4EC;--warn:#854D0E;--warn-tint:#FEF6E0;--bad:#991B1B;--bad-tint:#FDECEC;--t-deal-bg:#E8EEF8;--t-deal:#1E3A8A;--t-fund-bg:#EEE8F6;--t-fund:#5B21B6;color-scheme:light',
  dark: '--ink:#EDEAE6;--quiet:#A8A29B;--line:#3A3632;--soft:#2C2A27;--bg:#1A1917;--surface:#23211F;--nav-ink:#D6D1CA;--hover:#2E2B28;--field-line:#4A4540;--accent:#E0662A;--accent-dark:#FDBA8C;--accent-tint:#3B2418;--on-accent:#fff;--good:#7AD39F;--good-tint:#17301F;--warn:#F3C969;--warn-tint:#3A2F12;--bad:#F49A9A;--bad-tint:#3A1C1C;--t-deal-bg:#1C2A45;--t-deal:#A9C1F5;--t-fund-bg:#2A2141;--t-fund:#C9B3F5;color-scheme:dark',
  campfireLight: '--bg:#F6F7F5;--surface:#fff;--line:#E1E5E1;--soft:#ECEFEB;--hover:#EEF1EC;--accent:#4D6B1F;--accent-dark:#3B5317;--accent-tint:#ECF2E1;--on-accent:#fff',
  campfireDark: '--ink:#E9EEEA;--quiet:#9FAEA5;--line:#33433A;--soft:#26322C;--bg:#17201B;--surface:#1E2924;--nav-ink:#CFD8D2;--hover:#26332D;--field-line:#3D4E45;--accent:#8DB33A;--accent-dark:#B5D46A;--accent-tint:#2B3A1C;--on-accent:#10170F',
};
const THEMES = `:root{${PALETTES.light}}html.embedded{${PALETTES.campfireLight}}
html[data-theme=dark]{${PALETTES.dark}}html.embedded[data-theme=dark]{${PALETTES.campfireDark}}
@media (prefers-color-scheme:dark){html:not([data-theme=light]){${PALETTES.dark}}html.embedded:not([data-theme=light]){${PALETTES.campfireDark}}}`;

const CSS = `
${THEMES}
*{box-sizing:border-box}
[hidden]{display:none!important}
body{margin:0;font-family:Inter,system-ui,-apple-system,sans-serif;color:var(--ink);background:var(--bg)}
a{color:var(--accent)}a:hover{color:var(--accent-dark)}
.shell{display:flex;flex-wrap:wrap;min-height:100vh}
nav{flex:1 1 220px;max-width:260px;padding:24px 16px;background:var(--surface);border-right:1px solid var(--line);display:flex;flex-direction:column;gap:4px}
nav .brand{display:flex;align-items:center;gap:10px;padding:4px 12px 20px}
nav .brand b{font-size:17px}nav .brand small{display:block;font-size:12px;color:var(--quiet)}
nav a.item{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-radius:8px;color:var(--nav-ink);text-decoration:none;font-size:14px;min-height:44px}
nav a.item:hover{background:var(--hover);color:var(--ink)}
nav a.on{background:var(--accent-tint);color:var(--accent-dark);font-weight:600}
nav .foot{margin-top:auto;padding:12px;font-size:12px;color:var(--quiet);display:flex;flex-direction:column;gap:4px}
main{flex:999 1 560px;min-width:0;padding:32px 40px;display:flex;flex-direction:column;gap:24px}
@media (max-width:720px){nav{max-width:none;flex-basis:100%}main{padding:20px 16px}}
h1{margin:0;font-size:26px}h2{margin:0;font-size:16px}
.sub{margin:6px 0 0;color:var(--quiet);font-size:14px}
.head{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-end;gap:16px}
.grid4{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px}
.card{background:var(--surface);border:1px solid var(--line);border-radius:12px}
table.owners{table-layout:fixed;width:100%}table.owners th,table.owners td{padding-left:4px;padding-right:4px}
table.owners select,table.owners input{width:100%;min-width:0;box-sizing:border-box}
table.owners col.c-cust{width:30%}table.owners col.c-pct{width:15%}table.owners col.c-date{width:23%}table.owners col.c-x{width:9%}
@media (max-width:700px){table.owners{table-layout:auto;min-width:640px}}
.embedded h1.title{display:none}.embedded h1.title+.sub{margin-top:0;font-size:20px;font-weight:600;color:var(--ink);line-height:1.3}
.embedded .shell{display:block;min-height:0}.embedded main{padding:16px 20px;gap:16px}
.tabs{display:flex;flex-wrap:wrap;gap:4px;padding:8px 16px;background:var(--surface);border-bottom:1px solid var(--line);align-items:center}
.tabs a{padding:6px 12px;border-radius:8px;color:var(--nav-ink);text-decoration:none;font-size:13px;min-height:32px;display:inline-flex;align-items:center;gap:6px}
.tabs .theme-switch{margin-right:12px}
.theme-switch a,.tabs .theme-switch a{color:var(--quiet);text-decoration:none;padding:0;min-height:0;display:inline}.theme-switch a:hover{color:var(--ink)}
.tabs a.on{background:var(--accent-tint);color:var(--accent-dark);font-weight:600}.tabs .spacer{flex:1}.tabs .who{font-size:12px;color:var(--quiet)}
.panel{padding:12px;display:flex;flex-direction:column;gap:12px;font-size:13px}.panel h2{font-size:14px;margin:0}
.panel table{font-size:12px}.panel .btn{min-height:32px;padding:0 12px;font-size:13px}
.kpi{padding:18px;display:flex;flex-direction:column;gap:6px}
.kpi span{font-size:13px;color:var(--quiet)}.kpi strong{font-size:26px}
.cardhead{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid var(--line)}
.scroll{overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:13px}
th{text-align:left;font-weight:600;color:var(--quiet);font-size:12px;padding:10px 12px;border-bottom:1px solid var(--line);white-space:nowrap}
td{padding:12px;border-bottom:1px solid var(--soft);white-space:nowrap;vertical-align:top}
tfoot td{font-weight:700;border-bottom:none}
.num{text-align:right;font-variant-numeric:tabular-nums}
.wrap{white-space:normal;min-width:160px}
.muted{color:var(--quiet)}.small{font-size:12px}
.pill{display:inline-block;padding:3px 9px;border-radius:999px;font-size:12px;font-weight:500}
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 16px;border-radius:8px;font-weight:600;font-size:14px;font-family:inherit;cursor:pointer;text-decoration:none;border:1px solid var(--field-line);background:var(--surface);color:var(--ink)}
.btn.primary{background:var(--accent);border-color:var(--accent);color:var(--on-accent)}
.btn[disabled]{opacity:.55;cursor:not-allowed}
.banner{padding:12px 16px;border-radius:10px;font-size:13px}
.banner.demo{background:var(--warn-tint);color:var(--warn)}
.banner.good{background:var(--good-tint);color:var(--good)}
.banner.bad{background:var(--bad-tint);color:var(--bad)}
.bar{height:8px;border-radius:4px;background:var(--accent)}
.split{display:flex;flex-wrap:wrap;gap:24px;align-items:flex-start}
.split>.wide{flex:999 1 480px;min-width:0}.split>.side{flex:1 1 280px;max-width:380px}
.pad{padding:16px 20px;display:flex;flex-direction:column;gap:10px;font-size:13px}
.ok{color:var(--good)}.no{color:var(--bad)}
.filters{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;padding:14px 16px;border-bottom:1px solid var(--line)}
.filter{display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--quiet);min-width:140px}
.filter.grow{flex:1 1 220px}
.filter input,.filter select{min-height:40px;padding:0 10px;border:1px solid var(--field-line);border-radius:8px;font-size:14px;font-family:inherit;color:var(--ink);background:var(--surface)}
.filter-actions{display:flex;gap:8px}
.selbar{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;padding:10px 16px;font-size:13px;color:var(--quiet);border-bottom:1px solid var(--line)}
#sel-count{color:var(--accent-dark);font-weight:600}
td.check,th.check{width:36px;padding-right:0}
td.check input,th.check input{width:18px;height:18px;accent-color:var(--accent);cursor:pointer}
td.check input:disabled{cursor:not-allowed;opacity:.35}
a.kpi.link{text-decoration:none;color:inherit}a.kpi.link:hover{border-color:var(--field-line);box-shadow:0 1px 0 var(--field-line)}
.dealrow{display:block;padding:12px 14px;border-bottom:1px solid var(--soft);text-decoration:none;color:var(--ink)}
.dealrow.on{background:var(--accent-tint)}
.inline{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end}
.inline input,.inline textarea{min-height:40px;padding:8px 10px;border:1px solid var(--field-line);border-radius:8px;font-size:14px;font-family:inherit;color:var(--ink);background:var(--surface)}
.inline textarea{min-height:40px;resize:vertical;width:100%}
.decide{display:flex;flex-direction:column;gap:8px;min-width:240px}
.decide .row{display:flex;gap:8px;flex-wrap:wrap}
.who{display:flex;flex-direction:column;gap:2px}
.btn.sm{min-height:36px;padding:0 12px;font-size:13px}
.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
table.owners td{padding:6px 8px}
table.owners select,table.owners input{min-height:36px;padding:0 6px;border:1px solid var(--field-line);border-radius:8px;font-size:13px;font-family:inherit;background:var(--surface);color:var(--ink)}
.dealrow b{display:block;font-size:14px}.dealrow span{font-size:12px;color:var(--quiet)}
`;

const FLAME = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" style="stroke:var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3c1 3 4 4.5 4 8.5a4 4 0 0 1-8 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 0-7.5z"></path><path d="M6 21h12"></path></svg>`;

// Links to Campfire transactions. Inside Campfire they replace the Campfire
// page (target _top); on Rekindle's own site they open a new tab.
const CAMPFIRE_APP = () => (process.env.CAMPFIRE_APP_URL || 'https://app.meetcampfire.com').replace(/\/$/, '');
const CF_PATHS = { invoice: '/v2/accounting/invoices/', je: '/v2/accounting/journal-entry/' };
export function cfLink(kind, id, text, embedded = false) {
  if (!id) return esc(text);
  return `<a href="${esc(CAMPFIRE_APP() + CF_PATHS[kind] + encodeURIComponent(id))}" target="${embedded ? '_top' : '_blank'}" rel="noopener" title="Open in Campfire">${esc(text)}</a>`;
}

// For someone signed in from Campfire who isn't linked to an email yet.
export function linkBanner(ctx) {
  if (!ctx.linkUrl || ctx.admin) return '';
  return `<div class="banner demo" style="display:flex;flex-direction:column;gap:10px"><div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between"><span>Link your Campfire account to Rekindle to stamp, approve and invoice. You'll sign in once in a new tab.</span><a class="btn sm primary" href="${esc(ctx.linkUrl)}" target="_blank" rel="noopener">Link my account</a></div>
<details><summary class="small">New tab shows a security error?</summary><div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:8px"><span class="small">Copy this link into a new browser tab instead (it works for 10 minutes). If you can't sign in there, send it to a Rekindle admin to link you:</span><input id="link-url" readonly value="${esc(ctx.linkUrl)}" style="flex:1 1 260px;min-height:32px;padding:0 8px;border:1px solid var(--field-line);border-radius:6px;font:inherit;font-size:12px;background:var(--surface);color:var(--ink)"><button type="button" class="btn sm" data-copy-link="link-url">Copy link</button></div></details></div><script src="/static/link.js" defer></script>`;
}

// Light / Dark / Auto links; back = the page you're on.
export function themeSwitch(current, back = '/') {
  const opt = (v, label) => `<a href="/theme?set=${v}&amp;back=${encodeURIComponent(back)}"${(current || 'auto') === v ? ' aria-current="true" style="font-weight:700;color:var(--ink)"' : ''}>${label}</a>`;
  return `<span class="theme-switch small muted" aria-label="Appearance">${opt('light', 'Light')} · ${opt('dark', 'Dark')} · ${opt('auto', 'Auto')}</span>`;
}

export function layout({ active, title, body, ctx, scripts = [] }) {
  const needSetup = (ctx.config?.deals || []).filter((d) => !d.billingType).length;
  // [href, key, label, count, alert, title]; an alert count is red so it gets noticed.
  const items = [
    ['/', 'queue', 'Billback Queue', ctx.plan.lines.length, false, 'Pending lines'],
    ['/deals', 'deals', 'Deals &amp; Allocations', needSetup || null, true, `${needSetup} deal${needSetup === 1 ? '' : 's'} need${needSetup === 1 ? 's' : ''} setup`],
    ['/approvals', 'approvals', 'Approvals', ctx.groups ? ctx.groups.filter((g) => g.status !== 'approved').length || null : null, false, 'Deals waiting for approval'],
    ['/invoices', 'invoices', 'Invoices', ctx.plan.customers.length || null, false, 'Invoices in this run'],
    ['/reclass', 'reclass', 'Reclass', ctx.reclass?.waiting?.length || null, false, 'Expense lines waiting to be reclassed'],
    ['/settings', 'settings', 'Settings', null, false, ''],
  ];
  const nav = items
    .map(([href, key, label, count, alert, title]) => {
      const badge = count == null ? ''
        : `<span class="pill" title="${esc(title)}" style="${alert ? 'background:var(--bad);color:var(--on-accent)' : 'background:var(--surface);color:var(--nav-ink)'}">${count}<span class="sr-only"> ${esc(title)}</span></span>`;
      return `<a class="item${active === key ? ' on' : ''}" href="${href}"${active === key ? ' aria-current="page"' : ''}><span>${label}</span>${badge}</a>`;
    })
    .join('');
  // Signed in from Campfire but not linked to a Rekindle email: say why buttons are missing.
  const unlinked = linkBanner(ctx);
  const source = unlinked + (ctx.demo
    ? `<div class="banner demo"><b>Demo data.</b> Showing test bill ABC_261106 from the repo. <a href="/settings">Connect Campfire</a> to read live bills.</div>`
    : '');
  if (ctx.embed) {
    // Inside Campfire: Campfire has the main menu, so a slim tab bar instead of the sidebar.
    const tabs = items.map(([href, key, label, count, alert, title]) => `<a href="${href}"${active === key ? ' class="on" aria-current="page"' : ''}>${label}${count == null ? '' : `<span class="pill" title="${esc(title)}" style="${alert ? 'background:var(--bad);color:var(--on-accent)' : 'background:var(--hover);color:var(--nav-ink)'}">${count}</span>`}</a>`).join('');
    return `<!doctype html><html lang="en" class="embedded"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" type="image/svg+xml" href="/favicon.svg">
<title>Rekindle · ${esc(title)}</title><style>${CSS}</style></head><body><div class="shell"><div class="tabs" role="navigation" aria-label="Rekindle">${tabs}<span class="spacer"></span>${themeSwitch(ctx.theme, ctx.path)}<span class="who">${ctx.demo ? 'Demo data · ' : ''}${ctx.write ? '' : 'Writing off · '}${esc(ctx.user?.email || '')}</span></div>
<main>${source}${body}</main></div>${scripts.map((src) => `<script src="${src}" defer></script>`).join('')}</body></html>`;
  }
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" type="image/svg+xml" href="/favicon.svg">
<title>Rekindle · ${esc(title)}</title><style>${CSS}</style></head><body><div class="shell">
<nav aria-label="Rekindle"><div class="brand">${FLAME}<div><b>Rekindle</b><small>Billback for Campfire</small></div></div>${nav}
<div class="foot">${ctx.user ? `<span class="who"><b style="color:var(--ink)">${esc(ctx.user.name || ctx.user.email)}</b><span>${esc(ctx.user.email)}${ctx.admin ? ' · admin' : ''}</span></span><form method="post" action="/logout"><button class="btn sm" type="submit">Sign out</button></form>` : ''}<span>${ctx.demo ? 'Demo mode' : `Live from Campfire${ctx.via ? ` · ${esc(ctx.via)}` : ''}`}</span><span>Approvals saved: ${ctx.storeKind === 'postgres' ? 'database' : 'not saved (no database)'}</span><span>Writing to Campfire: ${ctx.write ? 'on' : 'off'}</span><span>Loaded ${esc(ctx.loadedAt)}</span>${themeSwitch(ctx.theme, ctx.path)}</div></nav>
<main>${source}${body}</main></div>${scripts.map((src) => `<script src="${src}" defer></script>`).join('')}</body></html>`;
}

function customerCell(l) {
  if (l.exception) {
    const fix = /needs setup|Tag Setup row/.test(l.exception) && l.dealsTag ? ` <a href="/deals?deal=${encodeURIComponent(l.dealsTag)}">Set up</a>` : '';
    return `<span class="no">${esc(l.exception)}</span>${fix}`;
  }
  if (l.billingType === 'Expense') return `<span class="muted">Not billed back · <a href="/reclass">${l.status === 'To be expensed' ? 'to be expensed' : 'reclass'}</a></span>`;
  if (l.billingType === 'Allocation') {
    return `<a href="/deals?deal=${encodeURIComponent(l.dealsTag)}">Split ${l.billTo.map((b) => b.percent).join(' / ')}</a>`;
  }
  return esc(l.billTo[0]?.customer.name);
}

// Where a line stands, for filters and the status column.
export function lineState(l) {
  if (l.exception) return 'exception';
  if (l.stamps.length) return 'to_stamp';
  if (l.billingType === 'Allocation') return 'split';
  if (l.billingType === 'Expense') return 'expense';
  return 'stamped';
}
const STATES = { to_stamp: 'To stamp', stamped: 'Stamped', split: 'Split at invoicing', expense: 'Expense', exception: 'Exception' };
const STATE_STYLE = {
  to_stamp: 'background:var(--warn-tint);color:var(--warn)',
  stamped: 'background:var(--good-tint);color:var(--good)',
  split: 'background:var(--accent-tint);color:var(--accent-dark)',
  expense: 'background:var(--hover);color:var(--nav-ink)',
  exception: 'background:var(--bad-tint);color:var(--bad)',
};

// Filters come from the query string: q, bill, deal, type, state.
export function readFilters(params) {
  const get = (k) => (params.get(k) || '').trim().slice(0, 200);
  return { q: get('q'), bill: get('bill'), deal: get('deal'), type: get('type'), state: get('state'), review: get('review') };
}

export function filterLines(lines, f) {
  const q = f.q.toLowerCase();
  return lines.filter((l) =>
    (!f.bill || l.billNumber === f.bill) &&
    (!f.deal || l.dealsTag === f.deal) &&
    (!f.type || l.billingType === f.type) &&
    (!f.state || lineState(l) === f.state) &&
    (!q || [l.billNumber, l.description, l.dealsTag, l.lineId, l.rechargeCategory].some((v) => String(v ?? '').toLowerCase().includes(q))));
}

const select = (name, label, current, options) =>
  `<label class="filter"><span>${label}</span><select name="${name}"><option value="">All</option>${options
    .map(([v, t]) => `<option value="${esc(v)}"${v === current ? ' selected' : ''}>${esc(t)}</option>`)
    .join('')}</select></label>`;

const uniq = (xs) => [...new Set(xs.filter(Boolean))].sort();

function reviewBanner(ctx, g) {
  const [label, style] = APPROVAL[g.status];
  const held = ctx.plan.lines.filter((l) => l.dealsTag === g.deal.dealsTag && (l.exception || l.billingType === 'Expense')).length;
  return `<div class="card pad review" style="gap:12px;border-color:var(--accent)">
<div style="display:flex;flex-wrap:wrap;justify-content:space-between;gap:12px;align-items:flex-start">
<div><span class="small muted">Reviewing for approval</span><h2 style="font-size:18px;margin-top:4px">${esc(g.deal.dealsTag)} · ${usd(g.cents)}</h2>
<p class="sub" style="margin:4px 0 0">${g.lines.length} line${g.lines.length === 1 ? '' : 's'} in this approval${held ? ` · ${held} held back (exception or expense) and not included` : ''} · Approver: ${esc(g.approver || 'an admin')}</p></div>
<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">${pill(label, style)}<a class="btn sm" href="/approvals#deal-${esc(g.deal.dealsTagId)}">Back to approvals</a></div></div>
${g.status === 'approved' ? '' : decisionCell(ctx, g)}</div>`;
}

export function queuePage(ctx, flash, requested = readFilters(new URLSearchParams())) {
  const { plan } = ctx;
  // Drill-through from Approvals: show exactly the lines in that deal's approval.
  const review = requested.review ? (ctx.groups || []).find((g) => String(g.deal.dealsTagId) === requested.review) : null;
  const filters = review ? { ...requested, deal: review.deal.dealsTag, review: '' } : { ...requested, review: '' };
  const exceptions = plan.lines.filter((l) => l.exception);
  const toStamp = plan.lines.filter((l) => lineState(l) === 'to_stamp');
  const alloc = plan.lines.filter((l) => lineState(l) === 'split').length;
  const shown = filterLines(plan.lines, filters);
  const shownCents = shown.reduce((s, l) => s + l.amountCents, 0);
  const canStamp = ctx.write && !ctx.demo;
  const active = Object.values(filters).some(Boolean);

  const rows = shown
    .map((l) => {
      const st = lineState(l);
      const box = st === 'to_stamp' && canStamp
        ? `<input type="checkbox" name="line" value="${esc(l.lineId)}" form="stamp-form" class="pick" aria-label="Select line ${esc(l.lineId)}">`
        : `<input type="checkbox" disabled aria-label="Line ${esc(l.lineId)} cannot be stamped">`;
      return `<tr><td class="check">${box}</td><td>${esc(l.billNumber)}</td><td class="muted">${esc(l.lineId)}</td><td class="wrap">${esc(l.description)}</td><td class="wrap">${esc(l.dealsTag ?? '—')}</td>
<td>${typePill(l.billingType)}</td><td>${customerCell(l)}</td><td>${pill(STATES[st], STATE_STYLE[st])}</td><td class="num">${usd(l.amountCents)}</td></tr>`;
    })
    .join('');

  const flashHtml = flash ? `<div class="banner ${flash.ok ? 'good' : 'bad'}">${esc(flash.text)}</div>` : '';
  const why = ctx.demo ? 'demo' : 'writing off';
  const stampButtons = canStamp
    ? `<form id="stamp-form" method="post" action="/run-now" style="display:flex;gap:8px;flex-wrap:wrap">
<button class="btn" type="submit" name="scope" value="selected" id="stamp-selected">Stamp selected</button>
<button class="btn" type="submit" name="scope" value="all"${toStamp.length ? '' : ' disabled'}>Stamp all ${toStamp.length}</button></form>`
    : `<button class="btn" type="button" disabled title="${ctx.demo ? 'Demo mode' : 'Turn on REKINDLE_WRITE to stamp'}">Stamp (${why})</button>`;

  const filterBar = `<form class="filters" method="get" action="/" role="search">
<label class="filter grow"><span>Search</span><input type="search" name="q" value="${esc(filters.q)}" placeholder="Bill, description, deal, line"></label>
${select('state', 'Status', filters.state, Object.entries(STATES))}
${select('type', 'Billing type', filters.type, uniq(plan.lines.map((l) => l.billingType)).map((t) => [t, t]))}
${select('deal', 'Deal', filters.deal, uniq(plan.lines.map((l) => l.dealsTag)).map((t) => [t, t]))}
${select('bill', 'Bill', filters.bill, uniq(plan.lines.map((l) => l.billNumber)).map((t) => [t, t]))}
<div class="filter-actions"><button class="btn" type="submit">Apply</button>${active ? '<a class="btn" href="/">Clear</a>' : ''}</div></form>`;

  return layout({
    active: 'queue', title: 'Billback Queue', ctx, scripts: ['/static/queue.js'],
    body: `${flashHtml}${review ? reviewBanner(ctx, review) : ''}<div class="head"><div><h1 class="title">Billback Queue</h1><p class="sub">Deal expenses waiting to be billed back.</p></div>
<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">${stampButtons}<a class="btn primary" href="/approvals">Review for approval</a></div></div>
<div class="grid4">
<a class="card kpi link" href="/"><span>Pending lines</span><strong>${usd(plan.totals.pendingCents)}</strong><span>${plan.lines.length} lines</span></a>
<a class="card kpi link" href="/?state=to_stamp"><span>To stamp</span><strong>${toStamp.length}</strong><span>of ${plan.lines.length} lines · ${alloc} split at invoicing</span></a>
<a class="card kpi link" href="/approvals"><span>Billback customers</span><strong>${plan.customers.length}</strong><span>after splits</span></a>
<a class="card kpi link" href="/?state=exception"><span>Exceptions</span><strong style="color:${exceptions.length ? 'var(--bad)' : 'var(--good)'}">${exceptions.length}</strong><span>${usd(plan.totals.exceptionCents)}</span></a>
</div>
<div class="card">${filterBar}
<div class="selbar"><span>Showing <b>${shown.length}</b> of ${plan.lines.length} lines · ${usd(shownCents)}</span>${canStamp ? '<span id="sel-count" aria-live="polite"></span>' : ''}</div>
<div class="scroll"><table><thead><tr><th class="check">${canStamp ? '<input type="checkbox" id="select-all" aria-label="Select all lines shown that can be stamped">' : ''}</th><th>Bill</th><th>Line</th><th>Description</th><th>Deals tag</th><th>Billing type</th><th>Billback customer</th><th>Status</th><th class="num">Amount</th></tr></thead>
<tbody>${rows || `<tr><td colspan="9" class="muted">${active ? 'No lines match these filters.' : 'No pending lines.'}</td></tr>`}</tbody>
<tfoot><tr><td></td><td colspan="7">${active ? 'Total shown' : 'Total'}</td><td class="num">${usd(shownCents)}</td></tr></tfoot></table></div></div>
<p class="sub">Only lines marked To stamp can be selected. Rekindle only fills a blank Billing Type or a missing Billback Customer tag; anything AP set by hand stays as entered.</p>`,
  });
}

function approverCard(ctx, deal) {
  const current = ctx.approvers?.get(deal.dealsTagId) || '';
  const form = ctx.admin
    ? `<form class="inline" method="post" action="/deals/approver"><input type="hidden" name="deal" value="${esc(deal.dealsTagId)}">
<label class="filter grow"><span>Approver email</span><input type="email" name="email" value="${esc(current)}" placeholder="name@company.com" autocomplete="off"></label>
<button class="btn" type="submit">Save</button></form>`
    : '';
  return `<div class="card pad"><h2>Approver</h2>
<div>${current ? `<b>${esc(current)}</b> approves this deal's billbacks.` : '<span class="muted">No approver yet. Until one is set, an admin approves this deal.</span>'}</div>
${form}${!ctx.admin ? '<p class="sub" style="margin:0">Only admins can change approvers.</p>' : ''}</div>`;
}

const SETUP_SOURCE = {
  rekindle: 'Set up in Rekindle',
  file: 'From the starter setup file; saving here takes over',
  none: 'Not set up yet',
};

function setupForm(ctx, deal, owners, draft, flash = null) {
  const customers = ctx.config.billbackCustomers || [];
  const type = draft?.billingType ?? deal.billingType ?? '';
  const custId = String(draft?.customerTagId ?? deal.customer?.billbackTagId ?? '');
  const rows = draft
    ? draft.owners.map((o) => ({ customerTagId: String(o.customerTagId || ''), percent: o.percent || '', start: o.start || '', end: o.end || '' }))
    : owners.map((o) => ({ customerTagId: String(o.customer?.billbackTagId ?? ''), percent: String(o.percent), start: o.start || '', end: o.end || '' }));
  while ((rows.length < owners.length + 1 || rows.length < 3) && rows.length < 20) rows.push({ customerTagId: '', percent: '', start: '', end: '' });

  const custOptions = (selected) => `<option value="">Choose…</option>${customers
    .map((c) => `<option value="${esc(c.billbackTagId)}"${String(c.billbackTagId) === selected ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}`;
  const typeOptions = ['Deal', 'Fund', 'Allocation', 'Expense']
    .map((t) => `<option value="${t}"${t === type ? ' selected' : ''}>${t}</option>`).join('');
  const ownerRows = rows
    .map((o, i) => `<tr><td><select name="owner_${i}_customer" aria-label="Owner ${i + 1} customer">${custOptions(o.customerTagId)}</select></td>
<td><input name="owner_${i}_percent" type="number" min="0" max="100" step="0.0001" inputmode="decimal" value="${esc(o.percent)}" aria-label="Owner ${i + 1} share percent"></td>
<td><input name="owner_${i}_start" type="date" value="${esc(o.start)}" aria-label="Owner ${i + 1} effective from"></td>
<td><input name="owner_${i}_end" type="date" value="${esc(o.end)}" aria-label="Owner ${i + 1} effective to"></td>
<td><button type="button" class="btn sm remove-owner" aria-label="Clear owner ${i + 1}" title="Clear this row" style="padding:0 10px">&times;</button></td></tr>`)
    .join('');

  return `<form class="card pad setup" method="post" action="/deals/setup" style="gap:16px"><input type="hidden" name="deal" value="${esc(deal.dealsTagId)}">
<h2>Setup</h2>
<div class="inline">
<label class="filter"><span>Billing type</span><select name="billingType" required>${type ? '' : '<option value="" selected>Choose…</option>'}${typeOptions}</select></label>
<label class="filter grow" id="billed-to"><span>Billed to (Deal or Fund)</span><select name="customer">${custOptions(custId)}</select></label>
</div>
<p class="sub" style="margin:0"><b>Deal</b> and <b>Fund</b> bill 100% to one customer. Several deals can bill the same fund. <b>Allocation</b> splits across the owners below. <b>Expense</b> isn't billed back.</p>
<div id="owners-section"><h2 style="font-size:14px;margin-bottom:8px">Owners (Allocation only)</h2>
<div class="scroll"><table class="owners"><colgroup><col class="c-cust"><col class="c-pct"><col class="c-date"><col class="c-date"><col class="c-x"></colgroup><thead><tr><th>Billback customer</th><th>Share %</th><th>Effective from</th><th>Effective to</th><th><span class="sr-only">Clear</span></th></tr></thead><tbody id="owner-rows" data-max="20">${ownerRows}</tbody></table></div>
<div style="display:flex;gap:12px;align-items:center;margin-top:8px;flex-wrap:wrap"><button type="button" class="btn sm" id="add-owner">Add owner</button><span id="owner-total" class="small muted" aria-live="polite"></span></div>
<p class="sub" style="margin:8px 0 0">Leave dates blank for "from the start" and "still active". To change ownership, put an end date on the old rows and add new rows starting the next day. Clear a row to remove it. Need more than 20 owners? Ask for the limit to be raised.</p></div>
${customers.length ? '' : '<div class="banner bad">No Billback Customer tags found in Campfire. Create one per customer first.</div>'}
${draft && flash && !flash.ok ? `<div class="banner bad" role="alert">Not saved: ${esc(flash.text)}</div>` : ''}
<div><button class="btn primary" type="submit">Save setup</button></div></form>`;
}

export function dealsPage(ctx, selected, flash = null, draft = null) {
  const { config, plan } = ctx;
  const deals = config.deals;
  if (!deals.length) {
    return layout({ active: 'deals', title: 'Deals & Allocations', ctx, body: `<h1 class="title">Deals &amp; Allocations</h1><p class="sub">No Deals tags found in Campfire yet.</p>${ctx.admin ? '<div><a class="btn primary" href="/deals/new">New deal</a></div>' : ''}` });
  }
  const pendingBy = new Map();
  for (const l of plan.lines) if (l.dealsTag) pendingBy.set(l.dealsTag, (pendingBy.get(l.dealsTag) || 0) + 1);
  const needs = deals.filter((d) => !d.billingType);
  const deal = deals.find((d) => d.dealsTag === selected) || needs[0] || deals[0];

  const list = deals
    .map((d) => {
      const n = pendingBy.get(d.dealsTag) || 0;
      const summary = !d.billingType
        ? 'Needs setup'
        : d.billingType === 'Allocation'
          ? `Allocation · ${config.allocations.filter((a) => a.dealsTagId === d.dealsTagId).length} owners`
          : d.billingType === 'Expense' ? 'Expense · not billed back' : `${d.billingType} · bills ${d.customer?.name ?? '—'}`;
      return `<a class="dealrow${d === deal ? ' on' : ''}" href="/deals?deal=${encodeURIComponent(d.dealsTag)}"${d === deal ? ' aria-current="true"' : ''}><b>${esc(d.dealsTag)}</b><span${!d.billingType ? ' style="color:var(--bad);font-weight:600"' : ''}>${esc(summary)}${n ? ` · ${n} pending line${n === 1 ? '' : 's'}` : ''}</span></a>`;
    })
    .join('');

  const owners = config.allocations.filter((a) => a.dealsTagId === deal.dealsTagId);
  const active = owners.filter((a) => !a.end);
  const total = Math.round(active.reduce((s, a) => s + a.percent, 0) * 10000) / 10000;
  const ownerRows = owners
    .map((a) => `<tr><td>${esc(a.customer?.name)}</td><td class="num"><b>${esc(a.percent)}%</b></td><td>${esc(a.start || 'From the start')}</td><td>${esc(a.end || 'Active')}</td></tr>`)
    .join('');

  let summary = '';
  if (deal.billingType === 'Allocation') {
    summary = `${splitsCard(owners)}<div class="card"><div class="cardhead"><div style="display:flex;gap:10px;align-items:center"><h2>Owner rows</h2>${Math.abs(total - 100) < 1e-9 ? pill('Open-ended rows total 100% · OK', 'background:var(--good-tint);color:var(--good)') : pill(`Open-ended rows total ${total}%`, 'background:var(--warn-tint);color:var(--warn)')}</div></div>
<div class="scroll"><table><thead><tr><th>Billback customer</th><th class="num">Share</th><th>Effective from</th><th>Effective to</th></tr></thead><tbody>${ownerRows || '<tr><td colspan="4" class="muted">No owners yet.</td></tr>'}</tbody></table></div>
<p class="sub" style="padding:0 16px 14px">Bills use the split in force on their bill date. Leftover cents go to the largest share.</p></div>`;
  } else if (deal.billingType === 'Deal' || deal.billingType === 'Fund') {
    summary = `<div class="card pad"><h2>Billed to</h2><div style="font-size:15px"><b>${esc(deal.customer?.name ?? 'Not set')}</b></div><p class="sub" style="margin:0">Every Pending line tagged ${esc(deal.dealsTag)} is billed 100% to this customer.</p></div>`;
  } else if (deal.billingType === 'Expense') {
    summary = '<div class="card pad"><h2>Not billed back</h2><p class="sub" style="margin:0">Lines tagged with this deal are flagged for reclass instead of invoiced.</p></div>';
  } else {
    summary = `<div class="banner bad"><b>${esc(deal.dealsTag)} isn't set up.</b> Its pending lines are held as exceptions until it has a billing type${ctx.admin ? '' : '. Ask an admin to set it up'}.</div>`;
  }

  const flashHtml = flash ? `<div class="banner ${flash.ok ? 'good' : 'bad'}">${esc(flash.text)}</div>` : '';
  return layout({
    active: 'deals', title: 'Deals & Allocations', ctx, scripts: ['/static/deals.js'],
    body: `${flashHtml}<div class="head"><div><h1 class="title">Deals &amp; Allocations</h1><p class="sub">Every Deals tag in ${ctx.demo ? 'the demo data' : 'Campfire'}. Its billing type decides who gets invoiced.</p></div>
<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">${ctx.admin ? '<a class="btn primary" href="/deals/new">New deal</a>' : ''}${needs.length ? pill(`${needs.length} need${needs.length === 1 ? 's' : ''} setup`, 'background:var(--bad-tint);color:var(--bad);font-size:13px;padding:6px 12px') : pill('All deals set up', 'background:var(--good-tint);color:var(--good);font-size:13px;padding:6px 12px')}</div></div>
<div class="split"><div class="card side" style="overflow:hidden"><div class="cardhead"><span class="small muted"><b>${deals.length} deals</b></span></div>${list}</div>
<div class="wide" style="display:flex;flex-direction:column;gap:16px">
<div class="card pad" style="flex-direction:row;flex-wrap:wrap;gap:32px">
<div><span class="small muted">Deal</span><div style="font-size:20px;font-weight:700">${esc(deal.dealsTag)}</div></div>
<div><span class="small muted">Billing type</span><div>${deal.billingType ? typePill(deal.billingType) : pill('Needs setup', 'background:var(--bad-tint);color:var(--bad)')}</div></div>
<div><span class="small muted">Billing group</span><div>${billingGroupControl(ctx, deal)}</div></div>
<div><span class="small muted">Setup</span><div class="small">${esc(SETUP_SOURCE[deal.source] || '')}</div></div>
<div><span class="small muted">Campfire Deals tag</span><div class="small">ID ${esc(deal.dealsTagId)}</div></div></div>
${summary}${ctx.admin && deal.billingType === 'Allocation' && owners.length ? changeSplitForm(ctx, deal, owners, flash) : ''}${ctx.admin ? setupForm(ctx, deal, owners, draft, flash) : `<div class="banner demo">Only Rekindle admins can change a deal's setup. You're signed in as <b>${esc(ctx.user?.email || '')}</b>, which isn't in <code>REKINDLE_ADMINS</code>.</div>`}${approverCard(ctx, deal)}</div></div>`,
  });
}

function checks(ctx) {
  const { plan } = ctx;
  const ex = plan.lines.filter((l) => l.exception);
  return [
    [!plan.lines.some((l) => l.exception?.startsWith('No Deals tag')), 'Every line has a Deals tag'],
    [!plan.lines.some((l) => /Tag Setup row|needs setup/.test(l.exception || '')), 'Every deal is set up'],
    [!plan.lines.some((l) => /not 100%|no owners/.test(l.exception || '')), 'Every allocation totals 100%'],
    [plan.totals.ties, 'Run total ties to pending lines'],
    [ex.length === 0, ex.length ? `${ex.length} exception${ex.length === 1 ? '' : 's'} held back` : 'No exceptions'],
  ];
}

const APPROVAL = {
  waiting: ['Waiting', 'background:var(--warn-tint);color:var(--warn)'],
  approved: ['Approved', 'background:var(--good-tint);color:var(--good)'],
  sent_back: ['Sent back', 'background:var(--bad-tint);color:var(--bad)'],
  changed: ['Changed since approval', 'background:var(--warn-tint);color:var(--warn)'],
};
const when = (d) => new Date(d).toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' }) + ' ET';

function decisionCell(ctx, g) {
  const parts = [];
  if (g.decision) {
    const verb = g.decision.decision === 'approved' ? 'Approved' : 'Sent back';
    parts.push(`<span class="small muted">${verb} by ${esc(g.decision.actor_email)} · ${esc(when(g.decision.created_at))}${g.status === 'changed' ? ' (before lines changed)' : ''}</span>`);
    if (g.decision.note) parts.push(`<span class="small">“${esc(g.decision.note)}”</span>`);
  }
  if (g.canDecide && g.status !== 'approved') {
    parts.push(`<form class="decide" method="post" action="/approvals/decide">
<input type="hidden" name="deal" value="${esc(g.deal.dealsTagId)}"><input type="hidden" name="fingerprint" value="${esc(g.fingerprint)}">
<label class="sr" for="note-${esc(g.deal.dealsTagId)}" style="font-size:12px;color:var(--quiet)">Note (optional)</label>
<textarea id="note-${esc(g.deal.dealsTagId)}" name="note" rows="1" maxlength="500" style="min-height:36px;padding:8px 10px;border:1px solid var(--field-line);border-radius:8px;font:inherit;font-size:13px"></textarea>
<div class="row"><button class="btn primary sm" type="submit" name="decision" value="approved">Approve ${usd(g.cents)}</button><button class="btn sm" type="submit" name="decision" value="sent_back">Send back</button></div></form>`);
  } else if (!g.canDecide && g.status !== 'approved') {
    parts.push(`<span class="small muted">Waiting on ${esc(g.approver || 'an admin')}</span>`);
  }
  return `<div class="decide">${parts.join('')}</div>`;
}

export function approvalsPage(ctx, flash) {
  const { plan } = ctx;
  const groups = ctx.groups || [];
  const ready = groups.length > 0 && groups.every((g) => g.status === 'approved');
  const approvedCents = groups.filter((g) => g.status === 'approved').reduce((s, g) => s + g.cents, 0);
  const billed = plan.totals.billedCents || 1;
  const largest = Math.max(1, ...plan.customers.map((c) => c.cents));

  const dealRows = groups
    .map((g) => {
      const [label, style] = APPROVAL[g.status];
      return `<tr id="deal-${esc(g.deal.dealsTagId)}"><td><a href="/deals?deal=${encodeURIComponent(g.deal.dealsTag)}" title="Deal setup"><b>${esc(g.deal.dealsTag)}</b></a><div class="small muted"><a href="/?review=${esc(g.deal.dealsTagId)}" title="See the lines in this approval">${g.lines.length} line${g.lines.length === 1 ? '' : 's'}</a> · ${esc(g.deal.billingType)}</div></td>
<td class="wrap">${g.approver ? esc(g.approver) : '<span class="muted">Admin (no approver set)</span>'}</td>
<td class="num">${usd(g.cents)}</td><td>${pill(label, style)}</td><td style="white-space:normal">${decisionCell(ctx, g)}</td></tr>`;
    })
    .join('');

  const custRows = plan.customers
    .map((c) => {
      const share = (c.cents / billed) * 100;
      const sources = c.sources.map((s) => `line ${esc(s.lineId)}${s.percent < 100 ? ` (${esc(s.percent)}%)` : ''} ${usd(s.cents)}`).join(' · ');
      return `<tr><td><b>${esc(c.customer.name)}</b><div class="small muted" style="white-space:normal;margin-top:4px">${sources}</div></td>
<td style="width:160px"><div class="bar" style="width:${((c.cents / largest) * 100).toFixed(1)}%"></div></td><td class="num">${pct(share)}</td><td class="num">${usd(c.cents)}</td></tr>`;
    })
    .join('');
  const list = checks(ctx).map(([ok, text]) => `<span class="${ok ? 'ok' : 'no'}">${ok ? '✓' : '✗'} ${esc(text)}</span>`).join('');
  const flashHtml = flash ? `<div class="banner ${flash.ok ? 'good' : 'bad'}">${esc(flash.text)}</div>` : '';
  const storeNote = ctx.storeKind !== 'postgres'
    ? '<div class="banner demo">No database connected: approvals and approvers are kept only until Rekindle restarts. Add <code>DATABASE_URL</code> on Render to keep them.</div>'
    : '';

  return layout({
    active: 'approvals', title: 'Review & approve', ctx,
    body: `${flashHtml}${storeNote}<div class="head"><div><span class="small muted">Approvals › Current run</span><h1 style="margin-top:6px">Billback run · ${usd(plan.totals.billedCents)}</h1><p class="sub">Each deal's approver signs off on that deal. Invoices can go out once every deal is approved.</p></div>
${ready ? '<a class="btn primary" href="/invoices">All approved · preview invoices</a>' : `<span class="pill" style="background:var(--warn-tint);color:var(--warn);font-size:13px;padding:6px 12px">${usd(approvedCents)} of ${usd(groups.reduce((s, g) => s + g.cents, 0))} approved</span>`}</div>
<div class="card"><div class="cardhead"><h2>Approval by deal</h2><span class="small muted">${groups.filter((g) => g.status === 'approved').length} of ${groups.length} deals approved</span></div>
<div class="scroll"><table><thead><tr><th>Deal</th><th>Approver</th><th class="num">Amount</th><th>Status</th><th>Decision</th></tr></thead>
<tbody>${dealRows || '<tr><td colspan="5" class="muted">Nothing waiting for approval.</td></tr>'}</tbody></table></div></div>
<div class="split"><div class="card wide"><div class="cardhead"><h2>Amount owed by billback customer</h2><span class="small muted">${plan.customers.length} customers</span></div>
<div class="scroll"><table><thead><tr><th>Billback customer</th><th>Share of run</th><th class="num">%</th><th class="num">Amount</th></tr></thead><tbody>${custRows || '<tr><td colspan="4" class="muted">Nothing to bill.</td></tr>'}</tbody>
<tfoot><tr><td colspan="2">Total</td><td class="num">100%</td><td class="num">${usd(plan.totals.billedCents)}</td></tr></tfoot></table></div></div>
<div class="side card pad"><h2>Checks</h2>${list}</div></div>`,
  });
}

const RUN_STATUS = {
  creating: ['Creating…', 'background:var(--warn-tint);color:var(--warn)'],
  created: ['Created · PDF not attached', 'background:var(--warn-tint);color:var(--warn)'],
  pdf_attached: ['Created · lines not marked', 'background:var(--warn-tint);color:var(--warn)'],
  complete: ['Complete', 'background:var(--good-tint);color:var(--good)'],
  failed: ['Not created', 'background:var(--bad-tint);color:var(--bad)'],
  unknown: ['Check Campfire', 'background:var(--bad-tint);color:var(--bad)'],
};

function historyTable(ctx) {
  const runs = ctx.runs || [];
  if (!runs.length) return '';
  const rows = runs.map((r) => {
    const [label, style] = RUN_STATUS[r.status] || [r.status, ''];
    const actions = [];
    if (r.has_pdf) actions.push(`<a class="btn sm" href="/invoices/run/${esc(r.id)}/pdf" target="_blank" rel="noopener">PDF</a>`);
    if (ctx.admin && (r.status === 'created' || r.status === 'pdf_attached')) {
      actions.push(`<form method="post" action="/invoices/retry"><input type="hidden" name="run" value="${esc(r.id)}"><button class="btn sm" type="submit">Retry</button></form>`);
    }
    if (ctx.admin && r.campfire_invoice_id && ['created', 'pdf_attached', 'complete'].includes(r.status)) {
      actions.push(`<form method="post" action="/invoices/retag"><input type="hidden" name="run" value="${esc(r.id)}"><button class="btn sm" type="submit" title="Copy tags and department from the source bill lines onto this invoice's lines">Re-apply tags</button></form>`);
    }
    if (ctx.admin && r.status === 'unknown') {
      actions.push(`<form class="inline" method="post" action="/invoices/resolve"><input type="hidden" name="run" value="${esc(r.id)}">
<label class="filter" style="min-width:120px"><span>Campfire invoice ID</span><input name="campfire_id" inputmode="numeric" pattern="[0-9]*" placeholder="if it was created"></label>
<button class="btn sm" type="submit" name="outcome" value="found">It was created</button>
<button class="btn sm" type="submit" name="outcome" value="not_created">It wasn't created</button></form>`);
    }
    return `<tr><td>${esc(new Date(r.created_at).toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' }))}</td>
<td><b>${esc(r.customer_name)}</b><div class="small muted">${esc(r.ref)}</div></td><td>${r.invoice_number ? cfLink('invoice', r.campfire_invoice_id, r.invoice_number, ctx.embed) : '—'}</td><td class="num">${usd(r.total_cents)}</td>
<td>${pill(label, style)}${r.error ? `<div class="small no" style="white-space:normal;max-width:360px;margin-top:4px">${esc(r.error)}</div>` : ''}</td>
<td style="white-space:normal"><div style="display:flex;gap:6px;flex-wrap:wrap;align-items:flex-end">${actions.join('')}</div></td></tr>`;
  }).join('');
  return `<div class="card"><div class="cardhead"><h2>Invoice history</h2><span class="small muted">Newest first</span></div>
<div class="scroll"><table><thead><tr><th>When</th><th>Customer</th><th>Invoice</th><th class="num">Amount</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}

// Waiting deals as links to their row on Approvals.
function waitingLinks(ctx, names) {
  return names.map((n) => {
    const d = ctx.config.deals.find((x) => x.dealsTag === n);
    return d ? `<a href="/approvals#deal-${esc(d.dealsTagId)}">${esc(n)}</a>` : esc(n);
  }).join(', ');
}

export function invoicesPage(ctx, selected, flash = null) {
  const { plan } = ctx;
  const pick = plan.customers.find((c) => c.customer.name === selected) || plan.customers[0];
  const durable = ctx.storeKind === 'postgres' || process.env.REKINDLE_ALLOW_MEMORY_STORE === 'true';
  const canCreate = ctx.admin && ctx.write && !ctx.demo && durable;
  const linesById = new Map(plan.lines.map((l) => [l.lineId, l]));
  const grp = ctx.billingGroupFilter || '';
  const keep = grp ? `&group=${encodeURIComponent(grp)}` : '';
  const groups = ctx.config.billingGroups || [];
  const groupName = grp === 'none' ? 'No billing group' : groups.find((g) => String(g.id) === grp)?.name;
  const groupBar = groups.length ? `<form class="filters" method="get" action="/invoices" role="search">
<label class="filter"><span>Billing group</span><select name="group"><option value="">All</option>${groups.map((g) => `<option value="${esc(g.id)}"${String(g.id) === grp ? ' selected' : ''}>${esc(g.name)}</option>`).join('')}<option value="none"${grp === 'none' ? ' selected' : ''}>No billing group</option></select></label>
<div class="filter-actions"><button class="btn" type="submit">Apply</button>${grp ? '<a class="btn" href="/invoices">Clear</a>' : ''}</div></form>` : '';

  const rows = plan.customers
    .map((c) => {
      const r = ctx.readiness?.get(c.customer.name) || { ready: false, waitingOn: [] };
      const deals = [...new Set(c.sources.map((s) => linesById.get(s.lineId)?.dealsTag))];
      const linked = Boolean(c.customer.customerId);
      let status;
      if (!linked) status = `${pill('Not linked to a Campfire customer', 'background:var(--bad-tint);color:var(--bad)')}<div class="small muted" style="white-space:normal">No Campfire customer is named exactly "${esc(c.customer.name)}". Rename one to match, or attach a customer to the Billback Customer tag in Campfire.</div>`;
      else if (!r.ready) status = `${pill('Not all deals approved', 'background:var(--warn-tint);color:var(--warn)')}<div class="small muted" style="white-space:normal">Waiting: ${waitingLinks(ctx, r.waitingOn)}</div>`;
      else status = pill('Approved · ready', 'background:var(--good-tint);color:var(--good)');
      const ok = linked;
      const box = canCreate && ok
        ? `<input type="checkbox" class="pick" name="customer" value="${esc(c.customer.name)}" form="create-form" aria-label="Select ${esc(c.customer.name)}">`
        : `<input type="checkbox" disabled aria-label="${esc(c.customer.name)} can't be invoiced yet">`;
      return `<tr${c === pick ? ' style="background:var(--accent-tint)"' : ''}><td class="check">${box}</td>
<td><a href="/invoices?customer=${encodeURIComponent(c.customer.name)}${keep}"><b>${esc(c.customer.name)}</b></a></td>
<td class="wrap">${esc(deals.join(', '))}</td><td>${c.sources.length}</td><td class="num">${usd(c.cents)}</td><td>${status}</td></tr>`;
    })
    .join('');

  const lineRows = pick
    ? pick.sources
        .map((s) => {
          const l = linesById.get(s.lineId);
          const label = s.percent < 100 ? `${esc(l.rechargeCategory ?? 'Other')} · ${esc(l.dealsTag)} allocation (${esc(s.percent)}%)` : `${esc(l.rechargeCategory ?? 'Other')} · ${esc(l.dealsTag)}`;
          const note = s.percent < 100 ? `${esc(s.percent)}% of ${usd(l.amountCents)} · ${esc(l.billNumber)}` : `${esc(l.description)} · ${esc(l.billNumber)}`;
          return `<tr><td style="padding-left:0;white-space:normal">${label}<div class="small muted">${note}</div></td><td class="num" style="padding-right:0">${usd(s.cents)}</td></tr>`;
        })
        .join('')
    : '';
  const preview = pick
    ? `<div class="card side pad" style="gap:16px"><div><span class="small muted">Invoice preview</span><div style="font-size:18px;font-weight:700">${esc(pick.customer.name)}</div></div>
<table><thead><tr><th style="padding-left:0">Description</th><th class="num" style="padding-right:0">Amount</th></tr></thead><tbody>${lineRows}</tbody>
<tfoot><tr><td style="padding-left:0">Total due</td><td class="num" style="padding-right:0">${usd(pick.cents)}</td></tr></tfoot></table><a class="btn" href="/invoices/pdf?customer=${encodeURIComponent(pick.customer.name)}${keep}" target="_blank" rel="noopener">Download PDF (draft)</a></div>`
    : '';

  let why = '';
  if (!ctx.admin) why = 'Only admins can create invoices.';
  else if (ctx.demo) why = 'Demo mode: connect Campfire to create invoices.';
  else if (!ctx.write) why = 'Writing to Campfire is off (REKINDLE_WRITE).';
  else if (!durable) why = 'Connect the database (DATABASE_URL) first, so Rekindle keeps a permanent record of what it has billed.';
  const setupNote = !ctx.productMissing ? ''
    : ctx.productValue
      ? `<div class="banner bad"><b>Invoice product isn't a number.</b> <code>REKINDLE_INVOICE_PRODUCT_ID</code> is "${esc(ctx.productValue.slice(0, 60))}". Use the product's number (e.g. 699767), not its long ID.</div>`
      : '<div class="banner bad"><b>Invoice product not set.</b> Set <code>REKINDLE_INVOICE_PRODUCT_ID</code> on Render to the number of the Campfire product used on invoice lines. Its Invoice Credit Account should be 13190 Unbilled Receivable, so invoices clear the unbilled balance.</div>';
  const flashHtml = flash ? `<div class="banner ${flash.ok ? 'good' : 'bad'}" style="white-space:pre-line">${esc(flash.text)}</div>` : '';

  return layout({
    active: 'invoices', title: 'Invoices', ctx, scripts: ['/static/queue.js'],
    body: `${flashHtml}${setupNote}<div class="head"><div><h1 class="title">Create invoices</h1><p class="sub">One invoice per billback customer. Approval status is shown for each; you decide when to invoice.</p></div>
${canCreate ? `<form id="create-form" method="post" action="/invoices/confirm" class="inline">${grp ? `<input type="hidden" name="group" value="${esc(grp)}">` : ''}<label class="filter" style="min-width:160px"><span>Invoice date</span><input type="date" name="date" value="${esc(todayLocal())}" required></label><button class="btn primary" type="submit" id="stamp-selected" data-verb="Create">Create selected</button></form>` : `<button class="btn primary" type="button" disabled title="${esc(why)}">Create selected</button>`}</div>
${why && ctx.admin ? `<p class="sub" style="margin:0">${esc(why)}</p>` : ''}
${groupBar}${grp ? `<p class="sub" style="margin:0">Showing only <b>${esc(groupName || grp)}</b> deals. Invoices created now include only their lines; other deals' lines stay for their own invoices.</p>` : ''}
<div class="split"><div class="wide" style="display:flex;flex-direction:column;gap:16px"><div class="card">
<div class="selbar"><span>${plan.customers.length} customer${plan.customers.length === 1 ? '' : 's'} to invoice · ${usd(plan.totals.billedCents)}</span>${canCreate ? '<span id="sel-count" aria-live="polite"></span>' : ''}</div>
<div class="scroll"><table><thead><tr><th class="check">${canCreate ? '<input type="checkbox" id="select-all" aria-label="Select all customers ready to invoice">' : ''}</th><th>Customer</th><th>Deals</th><th>Lines</th><th class="num">Amount</th><th>Status</th></tr></thead>
<tbody>${rows || `<tr><td colspan="6" class="muted">${grp ? 'Nothing to invoice in this billing group.' : 'Nothing left to invoice.'}</td></tr>`}</tbody><tfoot><tr><td></td><td colspan="3">Total</td><td class="num">${usd(plan.totals.billedCents)}</td><td></td></tr></tfoot></table></div></div>
</div>
${preview}</div>
${historyTable(ctx)}`,
  });
}

export function confirmInvoicesPage(ctx, chosen, date = null) {
  const total = chosen.reduce((s, c) => s + c.customer.cents, 0);
  const rows = chosen.map((c) => `<tr><td><b>${esc(c.customer.customer.name)}</b><input type="hidden" name="customer" value="${esc(c.customer.customer.name)}"></td>
<td>${c.request.lines.length}</td><td>${esc(c.request.invoice_date)}</td><td>${esc(c.request.due_date)}</td><td class="num">${usd(c.customer.cents)}</td>
<td>${c.problems.length ? `<span class="no" style="white-space:normal">${esc(c.problems.join(' '))}</span>` : (ctx.readiness?.get(c.customer.customer.name)?.ready === false
  ? `${pill('Includes unapproved deals', 'background:var(--warn-tint);color:var(--warn)')}<div class="small muted" style="white-space:normal">${waitingLinks(ctx, ctx.readiness.get(c.customer.customer.name).waitingOn)}</div>`
  : pill('Approved · ready', 'background:var(--good-tint);color:var(--good)'))}</td></tr>`).join('');
  const unapproved = chosen.filter((c) => ctx.readiness?.get(c.customer.customer.name)?.ready === false).length;
  const blocked = chosen.some((c) => c.problems.length);
  return layout({
    active: 'invoices', title: 'Confirm invoices', ctx,
    body: `<div><span class="small muted">Invoices › Confirm</span><h1 style="margin-top:6px">Create ${chosen.length} invoice${chosen.length === 1 ? '' : 's'} · ${usd(total)}</h1>
<p class="sub">This creates real invoices in Campfire, attaches each PDF, and marks the source bill lines Billed. It can't be undone from Rekindle; a mistake is fixed by voiding the invoice in Campfire.</p></div>
${unapproved ? `<div class="banner demo"><b>${unapproved} of these invoice${unapproved === 1 ? ' includes' : 's include'} lines from deals that aren't approved yet.</b> You can still create ${unapproved === 1 ? 'it' : 'them'}; check the deals named below first.</div>` : ''}
${date && date < todayLocal() ? `<div class="banner demo"><b>Backdated to ${esc(date)}.</b> The invoices post in that period; make sure it isn't locked in Campfire.</div>` : ''}
<form method="post" action="/invoices/create" class="card">${date ? `<input type="hidden" name="date" value="${esc(date)}">` : ''}${ctx.billingGroupFilter ? `<input type="hidden" name="group" value="${esc(ctx.billingGroupFilter)}">` : ''}<div class="scroll"><table><thead><tr><th>Customer</th><th>Invoice lines</th><th>Invoice date</th><th>Due date</th><th class="num">Amount</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
<div class="pad" style="flex-direction:row;gap:8px">${blocked ? '<span class="no">Fix the problems above first.</span>' : `<button class="btn primary" type="submit" name="confirm" value="yes">Create ${chosen.length} invoice${chosen.length === 1 ? '' : 's'} in Campfire</button>`}<a class="btn" href="/invoices${ctx.billingGroupFilter ? `?group=${encodeURIComponent(ctx.billingGroupFilter)}` : ''}">Cancel</a></div></form>`,
  });
}

export function loginPage(error, { google = false, campfire = false, token = true, embed = false } = {}) {
  if (embed) {
    // Inside Campfire. Campfire's and Google's sign-in pages won't open in a
    // frame, so: the access token here, or sign in in a new tab and reload.
    return `<!doctype html><html lang="en" class="embedded"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Rekindle · Sign in</title><style>${CSS}</style></head>
<body><div class="panel" style="max-width:420px">${error ? `<div class="banner bad">${esc(error)}</div>` : ''}<div style="display:flex;align-items:center;gap:8px">${FLAME}<b>Rekindle</b></div>
<p class="sub" style="margin:0">Campfire didn't sign you in to Rekindle automatically.</p>
${token ? `<form method="post" action="/login" style="display:flex;flex-direction:column;gap:8px"><label for="token" class="small muted">Access token (admins)</label>
<input id="token" name="token" type="password" autocomplete="current-password" required style="min-height:36px;padding:0 10px;border:1px solid var(--field-line);border-radius:8px;font:inherit">
<button class="btn primary" type="submit">Sign in with token</button></form>` : ''}
<div style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn" href="/login" target="_blank" rel="noopener">Sign in in a new tab</a><a class="btn" href="">Reload</a></div>
<p class="small muted" style="margin:0">After signing in in a new tab, press Reload. If it still asks, your browser is blocking Rekindle's sign-in inside Campfire; use the token here instead.</p></div></body></html>`;
  }
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" type="image/svg+xml" href="/favicon.svg"><title>Rekindle · Sign in</title><style>${CSS}</style></head>
<body><main style="max-width:420px;margin:12vh auto"><div class="card pad" style="gap:16px;padding:28px">${FLAME}<h1>Rekindle</h1>
${error ? `<div class="banner bad">${esc(error)}</div>` : ''}
${campfire ? '<a class="btn primary" href="/auth/campfire">Sign in with Campfire</a>' : ''}
${google ? `<a class="btn${campfire ? '' : ' primary'}" href="/auth/google">Sign in with Google</a>` : ''}
${(google || campfire) && token ? '<p class="sub" style="margin:0;text-align:center">or, for admins</p>' : ''}
${token ? `<form method="post" action="/login" style="display:flex;flex-direction:column;gap:10px"><label for="token" class="small muted">Access token</label>
<input id="token" name="token" type="password" autocomplete="current-password" required style="min-height:44px;padding:0 12px;border:1px solid var(--field-line);border-radius:8px;font:inherit">
<button class="btn${google || campfire ? '' : ' primary'}" type="submit">Sign in with token</button></form>
<p class="sub" style="margin:0">The token is <code>REKINDLE_ADMIN_TOKEN</code> in the Render service's Environment tab.</p>` : ''}</div></main></body></html>`;
}

const atET = (v) => (v ? new Date(v).toLocaleString('en-US', { timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' }) + ' ET' : '—');
const workspaceName = (w) => (w == null ? null : typeof w === 'object' ? w.name || w.title || w.id || JSON.stringify(w) : String(w));

export function settingsPage(ctx, flash = null) {
  const st = ctx.settings;
  const c = st.connection;
  const flashHtml = flash ? `<div class="banner ${flash.ok ? 'good' : 'bad'}">${esc(flash.text)}</div>` : '';
  const row = (k, v) => `<tr><th style="width:200px">${k}</th><td>${v}</td></tr>`;
  let status;
  if (!st.appConfigured) {
    status = `<div class="banner bad"><b>The Campfire app isn't set up in Rekindle.</b> Add <code>CAMPFIRE_CLIENT_ID</code> and <code>CAMPFIRE_CLIENT_SECRET</code> on Render (Environment), from the app under Settings → Apps in Campfire.</div>`;
  } else if (c) {
    status = `<div class="banner good"><b>Connected to Campfire</b>${workspaceName(c.workspace) ? ` · ${esc(workspaceName(c.workspace))}` : ''}. Rekindle reads bills and creates invoices with this connection${st.apiKey ? (st.fallbacks?.length ? '; some calls still need the API key (below)' : '; once this has worked for a while with nothing listed under "Still using the API key", the API key on Render can be deleted') : ''}.</div>`;
  } else {
    status = `<div class="banner ${st.apiKey ? 'demo' : 'bad'}"><b>Not connected.</b> ${st.apiKey ? 'Rekindle is using the API key on Render for now.' : 'Rekindle is showing demo data.'} Connect to use the Rekindle app in Campfire instead.</div>`;
  }
  const actions = !st.appConfigured ? '' : ctx.admin
    ? `<div class="pad" style="flex-direction:row;gap:8px;align-items:center"><a class="btn primary" href="/connect/campfire">${c ? 'Reconnect Campfire' : 'Connect Campfire'}</a>${c ? '<form method="post" action="/connect/campfire/disconnect"><button class="btn" type="submit">Disconnect</button></form>' : ''}<span class="small muted">Campfire asks you to approve Rekindle's access and pick the workspace.</span></div>`
    : '<div class="pad"><span class="small muted">Only admins can connect or disconnect Campfire.</span></div>';
  const details = c ? `<div class="scroll"><table><tbody>
${row('Workspace', esc(workspaceName(c.workspace) || 'not reported by Campfire'))}
${row('Connected by', esc(c.connectedBy))}
${row('Connected', esc(atET(c.connectedAt)))}
${row('Access', esc(c.scope || 'not reported by Campfire'))}
${row('Current token expires', `${esc(atET(c.expiresAt))}${c.refreshable ? ' · renewed automatically' : ' · <span class="no">no refresh token: reconnect when it expires</span>'}`)}
</tbody></table></div>` : '';
  const ep = st.endpoints;
  const tech = !st.appConfigured ? '' : `<details class="card pad"><summary><b>Technical details</b></summary><div class="scroll"><table><tbody>
${row('Redirect URI', '<code>/auth/campfire/callback</code> on this site')}
${row('Connect URL', '<code>/connect/campfire</code>')}
${row('Manage URL', '<code>/campfire/manage</code>')}
${row('Scopes requested', st.scopesWanted ? esc(st.scopesWanted) : "the app's allowed scopes (set <code>CAMPFIRE_OAUTH_SCOPES</code> to narrow them)")}
${ep?.error ? row('Endpoints', `<span class="no">${esc(ep.error)}</span>`) : ep ? `${row('Authorize', `<code>${esc(ep.authorize)}</code>`)}${row('Token', `<code>${esc(ep.token)}</code>`)}${row('Found via', esc(ep.from))}${ep.scopes ? row('Scopes Campfire offers', esc(ep.scopes.join(' '))) : ''}` : ''}
</tbody></table></div></details>`;
  return layout({
    active: 'settings', title: 'Settings', ctx,
    body: `${flashHtml}<div class="head"><div><h1 class="title">Settings</h1><p class="sub">How Rekindle connects to Campfire.</p></div></div>
${ctx.user?.campfireUserId != null ? `<div class="banner ${ctx.admin ? 'good' : 'demo'}">Signed in from Campfire as user <b>${esc(ctx.user.campfireUserId)}</b>${ctx.user.workspace != null ? ` in workspace <b>${esc(ctx.user.workspace)}</b>` : ''}. ${String(ctx.user.email || '').startsWith('campfire-user-') ? 'Not linked to a Rekindle email yet: use <b>Link my account</b>, or an admin can add it in <code>REKINDLE_CAMPFIRE_USERS</code>.' : `Linked to <b>${esc(ctx.user.email)}</b>.`} ${ctx.admin ? 'You are an admin.' : ''}${ctx.user.workspace != null ? ` To accept only this workspace, set <code>REKINDLE_CAMPFIRE_WORKSPACES</code> to <code>${esc(ctx.user.workspace)}</code>.` : ''}</div>` : ''}
${ctx.loadError ? `<div class="banner bad">Couldn't read Campfire just now: ${esc(ctx.loadError)}</div>` : ''}
<div class="card"><div class="pad"><h2 style="margin:0">Campfire connection</h2>${status}</div>${details}${actions}</div>
${st.fallbacks?.length ? `<div class="card"><div class="pad"><h2 style="margin:0">Still using the API key</h2><p class="sub" style="margin:0">Campfire refused the app these calls, so Rekindle made them with <code>CAMPFIRE_API_KEY</code>. Give the Rekindle app the matching permission in Campfire (Settings → Apps), reconnect, and keep the API key until this list stays empty.</p></div><div class="scroll"><table><thead><tr><th>Call</th><th class="num">Times</th><th>Last</th></tr></thead><tbody>${st.fallbacks.map((f) => `<tr><td><code>${esc(f.path)}</code></td><td class="num">${f.count}</td><td>${esc(atET(f.last))}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
${ctx.admin && ctx.admins ? adminsCard(ctx.admins, ctx.user) : ''}
${ctx.admin && ctx.reclassSetup ? reclassAccountsCard(ctx.reclassSetup) : ''}
${ctx.admin ? linkedPeople(ctx.links || []) : ''}
${tech}`,
  });
}

function adminsCard(admins, me) {
  const mine = String(me?.email || '').toLowerCase();
  const fromEnv = new Set(admins.env);
  const rows = [
    ...admins.settings.filter((a) => !fromEnv.has(a.email)).map((a) => `<tr><td>${esc(a.email)}</td><td class="muted">Added by ${esc(a.added_by)} · ${esc(atET(a.added_at))}</td><td>${a.email === mine ? '<span class="small muted">You</span>' : `<form method="post" action="/admins/remove"><input type="hidden" name="email" value="${esc(a.email)}"><button class="btn sm" type="submit">Remove</button></form>`}</td></tr>`),
    ...admins.env.map((e) => `<tr><td>${esc(e)}</td><td class="muted">Set on Render (REKINDLE_ADMINS)</td><td><span class="small muted">Change on Render</span></td></tr>`),
  ].join('');
  return `<div class="card"><div class="pad"><h2 style="margin:0">Admins</h2><p class="sub" style="margin:0">Admins set up deals, create invoices, connect Campfire and manage people. Anyone signed in with the access token is also an admin.</p></div>
<div class="scroll"><table><thead><tr><th>Email</th><th>How</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="3" class="muted">No admins by email yet.</td></tr>'}</tbody></table></div>
<form method="post" action="/admins/add" class="pad" style="flex-direction:row;flex-wrap:wrap;gap:8px;align-items:flex-end"><label class="filter grow"><span>Add an admin by email</span><input name="email" type="email" required placeholder="name@firm.com"></label><button class="btn primary" type="submit">Add admin</button></form></div>`;
}

function linkedPeople(links) {
  const rows = links.map((l) => `<tr><td>${esc(l.email)}</td><td>${esc(l.campfire_user_id)}</td><td>${esc(l.workspace ?? '')}</td><td>${esc(atET(l.linked_at))}</td><td><form method="post" action="/link/remove"><input type="hidden" name="campfire_user" value="${esc(l.campfire_user_id)}"><button class="btn sm" type="submit">Unlink</button></form></td></tr>`).join('');
  return `<div class="card"><div class="pad"><h2 style="margin:0">People linked from Campfire</h2><p class="sub" style="margin:0">Each person links once with <b>Link my account</b> inside Campfire. Their admin rights and deal approvals then follow them there.</p></div>
${links.length ? `<div class="scroll"><table><thead><tr><th>Email</th><th>Campfire user</th><th>Workspace</th><th>Linked</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="pad"><span class="small muted">No one yet.</span></div>'}</div>`;
}

export function linkPage({ state, email, link, error, loginOpts = {} }) {
  const body = {
    signin: `<p class="sub" style="margin:0">Sign in to link your Campfire account to your Rekindle email. You only do this once.</p>
${loginOpts.campfire ? '<a class="btn primary" href="/auth/campfire">Sign in with Campfire</a>' : ''}${loginOpts.google ? `<a class="btn${loginOpts.campfire ? '' : ' primary'}" href="/auth/google">Sign in with Google</a>` : ''}
${!loginOpts.campfire && !loginOpts.google ? '<div class="banner bad">No sign-in with an email is set up, so this can\'t be linked here. Ask an admin to add you in <code>REKINDLE_CAMPFIRE_USERS</code>.</div>' : ''}`,
    assign: `<p class="sub" style="margin:0">You're signed in as an admin with the access token. Enter the email Campfire user <b>${esc(link?.campfireUserId)}</b> should be in Rekindle (their admin rights and deal approvals follow it).</p>
${error ? `<div class="banner bad">${esc(error)}</div>` : ''}<form method="post" action="/link/assign" style="display:flex;flex-direction:column;gap:10px"><label for="email" class="small muted">Email</label><input id="email" name="email" type="email" required autocomplete="email" style="min-height:44px;padding:0 12px;border:1px solid var(--field-line);border-radius:8px;font:inherit;background:var(--surface);color:var(--ink)"><button class="btn primary" type="submit">Link</button></form>`,
    done: `<div class="banner good">Linked to <b>${esc(email || '')}</b>.</div><p class="sub" style="margin:0">Go back to Campfire and press Reload in Rekindle. You can close this tab.</p>`,
    expired: '<div class="banner bad">This link has expired or isn\'t valid.</div><p class="sub" style="margin:0">Go back to Rekindle in Campfire and press <b>Link my account</b> again. Links last 10 minutes.</p>',
    workspace: '<div class="banner bad">This Campfire workspace isn\'t one Rekindle serves.</div>',
  }[state];
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" type="image/svg+xml" href="/favicon.svg"><title>Rekindle · Link your account</title><style>${CSS}</style></head>
<body><main style="max-width:440px;margin:12vh auto"><div class="card pad" style="gap:16px;padding:28px">${FLAME}<h1>Link your account</h1>${body}</div></main></body></html>`;
}

// ---- Panels inside Campfire's bill and invoice pages
const cfStatus = (line, config) => (line.tags || []).find((t) => t.group === config.tagGroups.billbackStatus && !t.is_deleted)?.name || '—';
const dealOf = (line, config) => (line.tags || []).find((t) => t.group === config.tagGroups.deals && !t.is_deleted)?.name || null;

export function panelPage(p) {
  const open = (href, label, primary = false) => `<a class="btn${primary ? ' primary' : ''}" href="${esc(href)}" target="_blank" rel="noopener">${label}</a>`;
  let body;
  if (p.error) {
    body = `<div class="banner bad">Rekindle couldn't load this: ${esc(p.error)}</div>`;
  } else if (p.kind === 'bill') {
    if (p.missing) {
      body = '<p class="sub" style="margin:0">Rekindle can\'t find this bill.</p>';
    } else if (!p.lines.length) {
      body = `<p class="sub" style="margin:0">No lines on ${esc(p.config.unbilledAccountNumber)} Unbilled Receivable, so nothing to bill back.</p>`;
    } else {
      const rows = p.lines.map(({ line, plan }) => {
        const inv = p.invoices.filter((i) => i.line_id === line.id);
        let billed;
        if (plan?.exception) billed = `<span class="no">${esc(plan.exception)}</span>`;
        else if (plan?.billingType === 'Expense') billed = '<span class="muted">Not billed back</span>';
        else if (plan?.billTo?.length) billed = plan.billTo.map((b) => `${esc(b.customer.name)}${b.percent < 100 ? ` ${b.percent}%` : ''}`).join('<br>');
        else billed = '<span class="muted">—</span>';
        const rc = (p.reclasses || []).find((r) => r.line_id === line.id);
        const invoices = rc ? `Reclassed · JE ${rc.je_number ? cfLink('je', rc.campfire_je_id, rc.je_number, true) : 'posting…'}` : inv.length
          ? inv.map((i) => `${i.invoice_number ? cfLink('invoice', i.campfire_invoice_id, i.invoice_number, true) : 'creating…'} <span class="muted">${esc(i.customer_name || '')}</span>`).join('<br>')
          : '<span class="muted">Not invoiced</span>';
        return `<tr><td>${esc(line.description || '')}<div class="muted">${esc(dealOf(line, p.config) || 'No deal')}${plan?.billingType ? ` · ${pill(plan.billingType, TYPE_STYLE[plan.billingType] || '')}` : ''}</div></td>
<td class="num">${usd(Math.round(Number(line.amount) * 100))}</td><td>${esc(cfStatus(line, p.config))}</td><td>${billed}</td><td>${invoices}</td></tr>`;
      }).join('');
      body = `<div class="scroll"><table><thead><tr><th>Line</th><th class="num">Amount</th><th>Billback status</th><th>Billed to</th><th>Invoice / reclass</th></tr></thead><tbody>${rows}</tbody></table></div>
<div style="display:flex;gap:8px;flex-wrap:wrap">${open(`/?bill=${encodeURIComponent(p.bill.bill_number || '')}`, 'Open in Rekindle', true)}${open('/approvals', 'Approvals')}</div>`;
    }
  } else if (!p.run) {
    body = '<p class="sub" style="margin:0">Rekindle didn\'t create this invoice, so there are no billback details for it.</p>';
  } else {
    const r = p.run;
    const lines = new Map((r.payload?.pdfInput?.plan?.lines || []).map((l) => [l.lineId, l]));
    const rows = p.items.map((i) => {
      const l = lines.get(i.line_id) || {};
      return `<tr><td>${esc(l.billNumber || i.bill_id)}</td><td>${esc(l.dealsTag || '')}</td><td>${esc(l.rechargeCategory || '')}</td><td>${esc(l.description || '')}</td><td class="num">${i.percent < 100 ? `${i.percent}% · ` : ''}${usd(i.cents)}</td></tr>`;
    }).join('');
    const flash = p.flash ? `<div class="banner ${p.flash === 'yes' ? 'good' : 'bad'}">${p.flash === 'yes' ? 'Tags and departments applied to this invoice\'s lines.' : 'Tags weren\'t applied; see the note below.'}</div>` : '';
    const retag = p.admin && p.write && r.campfire_invoice_id
      ? `<form method="post" action="/invoices/retag" style="display:inline"><input type="hidden" name="run" value="${esc(r.id)}"><input type="hidden" name="back" value="${esc(p.back)}"><button class="btn" type="submit">Re-apply tags</button></form>` : '';
    body = `${flash}<div><b>${esc(r.customer_name)}</b> · ${usd(r.total_cents)} · Rekindle ref <code>${esc(r.ref)}</code> · ${esc(r.status)}</div>
${r.error ? `<div class="banner bad">${esc(r.error)}</div>` : ''}
<div class="scroll"><table><thead><tr><th>Bill</th><th>Deal</th><th>Category</th><th>Description</th><th class="num">Billed</th></tr></thead><tbody>${rows}</tbody></table></div>
<div style="display:flex;gap:8px;flex-wrap:wrap">${r.has_pdf !== false && r.pdf !== null ? open(`/invoices/run/${r.id}/pdf`, 'Rekindle PDF', true) : ''}${retag}${open('/invoices', 'Open in Rekindle')}</div>`;
  }
  return `<!doctype html><html lang="en" class="embedded"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Rekindle</title><style>${CSS}</style></head>
<body><div class="panel">${p.demo ? '<div class="banner demo">Demo data</div>' : ''}${linkBanner(p)}${body}</div></body></html>`;
}

// ---- Reclass: Expense lines moved off the unbilled account
const RECLASS_STATUS = {
  creating: ['Posting…', 'background:var(--warn-tint);color:var(--warn)'],
  created: ['Posted · lines not marked', 'background:var(--warn-tint);color:var(--warn)'],
  complete: ['Complete', 'background:var(--good-tint);color:var(--good)'],
  failed: ['Not posted', 'background:var(--bad-tint);color:var(--bad)'],
  unknown: ['Check Campfire', 'background:var(--bad-tint);color:var(--bad)'],
};

function reclassHistory(ctx) {
  const runs = ctx.reclass?.runs || [];
  if (!runs.length) return '';
  const rows = runs.map((r) => {
    const [label, style] = RECLASS_STATUS[r.status] || [r.status, ''];
    const actions = [];
    if (ctx.admin && r.status === 'created') actions.push(`<form method="post" action="/reclass/retry"><input type="hidden" name="run" value="${esc(r.id)}"><button class="btn sm" type="submit">Retry</button></form>`);
    if (ctx.admin && r.status === 'unknown') {
      actions.push(`<form class="inline" method="post" action="/reclass/resolve"><input type="hidden" name="run" value="${esc(r.id)}">
<label class="filter" style="min-width:120px"><span>Campfire journal entry ID</span><input name="campfire_id" inputmode="numeric" pattern="[0-9]*" placeholder="if it was posted"></label>
<button class="btn sm" type="submit" name="outcome" value="found">It was posted</button>
<button class="btn sm" type="submit" name="outcome" value="not_created">It wasn't posted</button></form>`);
    }
    return `<tr><td>${esc(atET(r.created_at))}</td><td>${esc(r.je_date)}<div class="small muted">${esc(r.ref)}</div></td><td>${r.je_number ? cfLink('je', r.campfire_je_id, r.je_number, ctx.embed) : '—'}</td><td>${esc(r.line_count)}</td><td class="num">${usd(r.total_cents)}</td>
<td>${pill(label, style)}${r.error ? `<div class="small no" style="white-space:normal;max-width:360px;margin-top:4px">${esc(r.error)}</div>` : ''}</td>
<td style="white-space:normal"><div style="display:flex;gap:6px;flex-wrap:wrap;align-items:flex-end">${actions.join('')}</div></td></tr>`;
  }).join('');
  return `<div class="card"><div class="cardhead"><h2>Reclass history</h2><span class="small muted">Newest first</span></div>
<div class="scroll"><table><thead><tr><th>When</th><th>JE date</th><th>Journal entry</th><th>Lines</th><th class="num">Amount</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}

export function reclassPage(ctx, flash = null) {
  const { waiting = [], accounts = new Map() } = ctx.reclass || {};
  const durable = ctx.storeKind === 'postgres' || process.env.REKINDLE_ALLOW_MEMORY_STORE === 'true';
  const canPost = ctx.admin && ctx.write && !ctx.demo && durable;
  const total = waiting.reduce((t, l) => t + l.amountCents, 0);
  const problemOf = (l) => {
    if (!l.rechargeCategoryId) return 'No Recharge Category tag on the line';
    if (!accounts.get(Number(l.rechargeCategoryId))) return `No expense account for ${l.rechargeCategory}`;
    return null;
  };
  const rows = waiting.map((l) => {
    const problem = problemOf(l);
    const acct = accounts.get(Number(l.rechargeCategoryId));
    const box = canPost && !problem
      ? `<input type="checkbox" class="pick" name="line" value="${esc(l.lineId)}" form="reclass-form" aria-label="Select line ${esc(l.lineId)}">`
      : '<input type="checkbox" disabled aria-label="Can\'t be reclassed yet">';
    const to = problem ? `<span class="no">${esc(problem)}</span>${ctx.admin ? ' <a href="/settings#reclass-accounts">Set</a>' : ''}` : esc(acct.account_label || `Account ${acct.account_id}`);
    return `<tr><td class="check">${box}</td><td>${esc(l.billNumber)}<div class="small muted">${esc(l.vendorName || '')}</div></td><td class="wrap">${esc(l.description || '')}</td><td>${esc(l.dealsTag || '')}</td><td>${esc(l.rechargeCategory || '—')}</td>
<td class="wrap">${to}</td><td>${pill(l.status, l.status === 'To be expensed' ? 'background:var(--warn-tint);color:var(--warn)' : 'background:var(--hover);color:var(--nav-ink)')}</td><td class="num">${usd(l.amountCents)}</td></tr>`;
  }).join('');
  let why = '';
  if (!ctx.admin) why = 'Only admins can post reclass entries.';
  else if (ctx.demo) why = 'Demo mode: connect Campfire to post reclasses.';
  else if (!ctx.write) why = 'Writing to Campfire is off (REKINDLE_WRITE).';
  else if (!durable) why = 'Connect the database (DATABASE_URL) first.';
  const flashHtml = flash ? `<div class="banner ${flash.ok ? 'good' : 'bad'}" style="white-space:pre-line">${esc(flash.text)}</div>` : '';
  return layout({
    active: 'reclass', title: 'Reclass', ctx, scripts: ['/static/queue.js'],
    body: `${flashHtml}<div class="head"><div><h1 class="title">Reclass</h1><p class="sub">Deal expenses that won't be billed back, moved off unbilled receivable.</p></div>
${canPost ? `<form id="reclass-form" method="post" action="/reclass/confirm" class="inline"><label class="filter" style="min-width:160px"><span>Journal entry date</span><input type="date" name="date" value="${esc(todayLocal())}" required></label><button class="btn primary" type="submit" id="stamp-selected" data-verb="Reclass">Reclass selected</button></form>` : `<button class="btn primary" type="button" disabled title="${esc(why)}">Reclass selected</button>`}</div>
${why && ctx.admin ? `<p class="sub" style="margin:0">${esc(why)}</p>` : ''}
<div class="card"><div class="selbar"><span>${waiting.length} line${waiting.length === 1 ? '' : 's'} waiting · ${usd(total)}</span>${canPost ? '<span id="sel-count" aria-live="polite"></span>' : ''}</div>
<div class="scroll"><table><thead><tr><th class="check">${canPost ? '<input type="checkbox" id="select-all" aria-label="Select all lines ready to reclass">' : ''}</th><th>Bill</th><th>Description</th><th>Deal</th><th>Category</th><th>Debit account</th><th>Status</th><th class="num">Amount</th></tr></thead>
<tbody>${rows || '<tr><td colspan="8" class="muted">No Expense lines waiting.</td></tr>'}</tbody>${waiting.length ? `<tfoot><tr><td></td><td colspan="6">Total</td><td class="num">${usd(total)}</td></tr></tfoot>` : ''}</table></div></div>
<p class="sub" style="margin:0">Each selected line becomes a debit to its category's expense account and a credit to the unbilled account, with the line's deal, department and tags, in one journal entry. The lines are then marked Expensed.</p>
${reclassHistory(ctx)}`,
  });
}
const todayLocal = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

export function confirmReclassPage(ctx, { lines, date, preview }) {
  const total = lines.reduce((t, l) => t + l.amountCents, 0);
  const problems = preview.problems || [];
  const byAccount = new Map();
  for (const r of preview.runs || []) for (const l of r.run.payload.lines) byAccount.set(l.account, (byAccount.get(l.account) || 0) + l.cents);
  const rows = [...byAccount.entries()].map(([acct, cents]) => `<tr><td>Dr ${esc(acct)}</td><td class="num">${usd(cents)}</td><td></td></tr>`).join('')
    + `<tr><td>Cr unbilled receivable (each line's account)</td><td></td><td class="num">${usd(total)}</td></tr>`;
  const hidden = lines.map((l) => `<input type="hidden" name="line" value="${esc(l.lineId)}">`).join('');
  return layout({
    active: 'reclass', title: 'Confirm reclass', ctx,
    body: `<div><span class="small muted">Reclass › Confirm</span><h1 style="margin-top:6px">Reclass ${lines.length} line${lines.length === 1 ? '' : 's'} · ${usd(total)}</h1>
<p class="sub">This posts a real journal entry in Campfire dated ${esc(date)}${(preview.runs || []).length > 1 ? ` (one per entity: ${preview.runs.length})` : ''} and marks the lines Expensed. A mistake is fixed by reversing the entry in Campfire.</p></div>
${problems.length ? `<div class="banner bad">${problems.map(esc).join('<br>')}</div>` : ''}
<div class="card"><div class="scroll"><table><thead><tr><th>Account</th><th class="num">Debit</th><th class="num">Credit</th></tr></thead><tbody>${rows}</tbody></table></div>
<form method="post" action="/reclass/create" class="pad" style="flex-direction:row;gap:8px">${hidden}<input type="hidden" name="date" value="${esc(date)}">
${problems.length ? '<span class="no">Fix the problems above first.</span>' : `<button class="btn primary" type="submit" name="confirm" value="yes">Post reclass in Campfire</button>`}<a class="btn" href="/reclass">Cancel</a></form></div>`,
  });
}

function reclassAccountsCard(setup) {
  const { categories = [], accounts, accountsError, saved = new Map(), suggestions = new Map() } = setup;
  const unsetWithGuess = categories.filter((c) => !saved.get(Number(c.id)) && suggestions.get(Number(c.id))).length;
  const rows = categories.map((c) => {
    const cur = saved.get(Number(c.id));
    const guess = !cur && suggestions.get(Number(c.id));
    const choice = accounts
      ? `<select name="account" required style="min-height:36px;max-width:320px;padding:0 8px;border:1px solid var(--field-line);border-radius:8px;font:inherit;background:var(--surface);color:var(--ink)"><option value="">Choose an expense account</option>${accounts.map((a) => `<option value="${esc(`${a.id}|${a.label}`)}"${(cur && Number(cur.account_id) === Number(a.id)) || (guess && Number(guess.id) === Number(a.id)) ? ' selected' : ''}>${esc(a.label)}</option>`).join('')}</select>`
      : `<input name="account" required inputmode="numeric" placeholder="Campfire account ID" value="${esc(cur ? `${cur.account_id}${cur.account_label ? `|${cur.account_label}` : ''}` : '')}" style="min-height:36px;padding:0 8px;border:1px solid var(--field-line);border-radius:8px;font:inherit;background:var(--surface);color:var(--ink)">`;
    return `<tr><td><b>${esc(c.name)}</b></td><td>${cur ? esc(cur.account_label || `Account ${cur.account_id}`) : `<span class="no">Not set</span>${guess ? `<div class="small muted">Suggested: ${esc(guess.label)}</div>` : ''}`}</td>
<td><form method="post" action="/settings/reclass-account" class="inline"><input type="hidden" name="category" value="${esc(c.id)}"><input type="hidden" name="category_name" value="${esc(c.name)}">${choice}<button class="btn sm" type="submit">Save</button></form></td></tr>`;
  }).join('');
  return `<div class="card" id="reclass-accounts"><div class="pad"><h2 style="margin:0">Reclass accounts</h2><p class="sub" style="margin:0">Where each Recharge Category's expenses go when a deal cost isn't billed back. The reclass entry debits this account and credits unbilled receivable.</p>
${accountsError ? `<div class="banner bad">Couldn't list expense accounts from Campfire (${esc(accountsError)}). Enter the account's Campfire ID instead.</div>` : ''}
${unsetWithGuess ? `<form method="post" action="/settings/reclass-accounts/fill" class="inline"><button class="btn primary" type="submit">Fill by name (${unsetWithGuess})</button><span class="small muted">Sets each unset category to the expense account tagged with it or named the same. Review after.</span></form>` : ''}</div>
${rows ? `<div class="scroll"><table><thead><tr><th>Recharge category</th><th>Expense account</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="pad"><span class="small muted">No Recharge Category tags found.</span></div>'}</div>`;
}

// ---- New deal
export function newDealPage(ctx, { canCreate, form = {}, errors = [] }) {
  const customers = ctx.config.billbackCustomers || [];
  const type = form.billingType || '';
  const typeOptions = ['Deal', 'Fund', 'Allocation', 'Expense'].map((t) => `<option value="${t}"${t === type ? ' selected' : ''}>${t}</option>`).join('');
  const cust = form.customer || '';
  const custOptions = `<option value="">Choose…</option><option value="new"${cust === 'new' ? ' selected' : ''}>New company…</option>${customers.map((c) => `<option value="${esc(c.billbackTagId)}"${String(c.billbackTagId) === cust ? ' selected' : ''}>${esc(c.name)}${c.customerId ? '' : ' (not linked to a customer)'}</option>`).join('')}`;
  const field = 'min-height:40px;padding:0 10px;border:1px solid var(--field-line);border-radius:8px;font:inherit;background:var(--surface);color:var(--ink)';
  return layout({
    active: 'deals', title: 'New deal', ctx, scripts: ['/static/newdeal.js'],
    body: `<div><span class="small muted"><a href="/deals">Deals &amp; Allocations</a> › New deal</span><h1 class="title" style="margin-top:6px">New deal</h1><p class="sub">Creates the deal in Campfire and sets it up here, in one step.</p></div>
${errors.length ? `<div class="banner bad">${errors.map(esc).join('<br>')}</div>` : ''}
${canCreate ? '' : '<div class="banner demo">Creating deals needs a live Campfire connection with writing on (REKINDLE_WRITE).</div>'}
<form class="card pad newdeal" method="post" action="/deals/create" style="gap:16px;max-width:720px">
<label class="filter" style="flex:none;width:100%"><span>Deal name</span><input name="name" required maxlength="250" value="${esc(form.name || '')}" placeholder="e.g. Project Atlas" style="${field}"></label>
<label class="filter" style="flex:none;width:100%"><span>Billing type</span><select name="billingType" required style="${field}">${type ? '' : '<option value="" selected>Choose…</option>'}${typeOptions}</select></label>
<p class="sub" style="margin:0"><b>Deal</b>: the company itself reimburses. <b>Fund</b>: a fund pays (e.g. a deal in diligence). <b>Allocation</b>: split across owners, which you add next. <b>Expense</b>: not billed back.</p>
<div id="nd-billed-to" style="display:flex;flex-direction:column;gap:12px">
<label class="filter" style="flex:none;width:100%"><span>Billed to</span><select name="customer" style="${field}">${custOptions}</select></label>
<div id="nd-new-company" class="card pad" style="gap:12px;background:var(--soft);flex:none"><b>New company</b><span class="small muted">Rekindle creates the customer in Campfire and its Billback Customer tag, linked together.</span>
<label class="filter" style="flex:none;width:100%"><span>Company name</span><input name="companyName" value="${esc(form.companyName || '')}" maxlength="250" style="${field}"></label>
<label class="filter" style="flex:none;width:100%"><span>Billing email (optional)</span><input name="companyEmail" type="email" value="${esc(form.companyEmail || '')}" style="${field}"></label></div></div>
<label class="filter" style="flex:none;width:100%"><span>Approver email (optional)</span><input name="approver" type="email" value="${esc(form.approver || '')}" placeholder="Who approves this deal's billbacks" style="${field}"></label>
<div style="display:flex;gap:8px">${canCreate ? '<button class="btn primary" type="submit">Create deal</button>' : '<button class="btn primary" type="button" disabled>Create deal</button>'}<a class="btn" href="/deals">Cancel</a></div></form>`,
  });
}

// ---- Allocation splits over time
const dayAfterISO = (d) => new Date(Date.parse(d) + 864e5).toISOString().slice(0, 10);
const dayBeforeISO = (d) => new Date(Date.parse(d) - 864e5).toISOString().slice(0, 10);
// The periods a deal's owners define: each with its dates and the owners in force.
export function splitPeriods(owners) {
  const points = [...new Set(['', ...owners.map((o) => o.start).filter(Boolean), ...owners.map((o) => o.end).filter(Boolean).map(dayAfterISO)])].sort();
  const periods = [];
  points.forEach((p, i) => {
    const next = points[i + 1];
    const on = p || '0000-01-01';
    const rows = owners.filter((o) => (!o.start || o.start <= on) && (!o.end || o.end >= on));
    if (!rows.length) return;
    const total = Math.round(rows.reduce((t, o) => t + Number(o.percent), 0) * 10000) / 10000;
    periods.push({ from: p || null, to: next ? dayBeforeISO(next) : null, rows, total });
  });
  return periods;
}

function splitsCard(owners) {
  const periods = splitPeriods(owners);
  if (!periods.length) return '';
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const items = periods.map((p) => {
    const now = (!p.from || p.from <= today) && (!p.to || p.to >= today);
    const when = `${p.from ? `From ${esc(p.from)}` : 'From the start'}${p.to ? ` to ${esc(p.to)}` : ' onwards'}`;
    const ok = Math.abs(p.total - 100) < 1e-6;
    return `<div class="card pad" style="gap:8px;${now ? 'border-color:var(--accent);box-shadow:inset 3px 0 0 var(--accent)' : ''}"><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><b>${when}</b>${now ? pill('In force today', 'background:var(--accent-tint);color:var(--accent-dark)') : ''}${ok ? pill('100%', 'background:var(--good-tint);color:var(--good)') : pill(`${p.total}% · must be 100%`, 'background:var(--bad-tint);color:var(--bad)')}</div>
<div class="small">${p.rows.map((o) => `${esc(o.customer?.name ?? '?')} <b>${esc(o.percent)}%</b>`).join(' · ')}</div></div>`;
  }).join('');
  return `<div style="display:flex;flex-direction:column;gap:8px"><h2 style="margin:0">Splits over time</h2><p class="sub" style="margin:0">Each bill line uses the split in force on its bill date.</p>${items}</div>`;
}

// Change the split from a date: ends today's open rows the day before and
// starts the new owners on that date.
function changeSplitForm(ctx, deal, owners, flash) {
  const customers = ctx.config.billbackCustomers || [];
  const periods = splitPeriods(owners);
  const latest = periods[periods.length - 1]?.rows || [];
  const rows = [...latest.map((o) => ({ id: String(o.customer?.billbackTagId ?? ''), pct: String(o.percent) })), { id: '', pct: '' }, { id: '', pct: '' }];
  const opts = (sel) => `<option value="">Choose…</option>${customers.map((c) => `<option value="${esc(c.billbackTagId)}"${String(c.billbackTagId) === sel ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}`;
  const field = 'min-height:36px;padding:0 8px;border:1px solid var(--field-line);border-radius:8px;font:inherit;background:var(--surface);color:var(--ink)';
  return `<form class="card pad" method="post" action="/deals/change-split" style="gap:12px"><input type="hidden" name="deal" value="${esc(deal.dealsTagId)}">
<h2 style="margin:0">Change the split</h2><p class="sub" style="margin:0">Pick the date the new split starts and the new owners. Rekindle ends the current owners the day before. Bills dated earlier keep the old split.</p>
<label class="filter" style="flex:none;max-width:220px"><span>New split starts</span><input type="date" name="date" required style="${field}"></label>
<div class="scroll"><table><thead><tr><th>Billback customer</th><th>Share %</th></tr></thead><tbody>${rows.map((r, i) => `<tr><td><select name="new_${i}_customer" aria-label="New owner ${i + 1}" style="${field}">${opts(r.id)}</select></td><td><input name="new_${i}_percent" type="number" min="0" max="100" step="0.0001" inputmode="decimal" value="${esc(r.pct)}" aria-label="New owner ${i + 1} share" style="${field};width:110px"></td></tr>`).join('')}</tbody></table></div>
${flash && !flash.ok && flash.split ? `<div class="banner bad" role="alert">Not saved: ${esc(flash.text)}</div>` : ''}
<div><button class="btn primary" type="submit">Save new split</button></div></form>`;
}

function billingGroupControl(ctx, deal) {
  const groups = ctx.config.billingGroups || [];
  const cur = deal.billingGroup;
  if (!ctx.admin || !groups.length) return cur ? esc(cur.name) : '<span class="muted">—</span>';
  return `<form method="post" action="/deals/billing-group" class="inline billing-group" style="gap:6px"><input type="hidden" name="deal" value="${esc(deal.dealsTagId)}">
<select name="group" aria-label="Billing group" style="min-height:32px;padding:0 8px;border:1px solid var(--field-line);border-radius:8px;font:inherit;font-size:13px;background:var(--surface);color:var(--ink)"><option value="">None</option>${groups.map((g) => `<option value="${esc(g.id)}"${cur && Number(cur.id) === Number(g.id) ? ' selected' : ''}>${esc(g.name)}</option>`).join('')}</select>
<button class="btn sm" type="submit">Save</button></form>`;
}
