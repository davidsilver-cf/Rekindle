// Server-rendered screens for the Rekindle prototype. No framework, no build step.
// Every value from Campfire or config is escaped before it reaches the page.
import { fromCents } from './engine.js';

export const esc = (v) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const usd = (cents) => fromCents(cents).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const pct = (n) => `${(Math.round(n * 100) / 100).toFixed(2)}%`;

const TYPE_STYLE = {
  Deal: 'background:#E8EEF8;color:#1E3A8A',
  Fund: 'background:#EEE8F6;color:#5B21B6',
  Allocation: 'background:#FDECE3;color:#9A3412',
  Expense: 'background:#F1EEE9;color:#3F3B36',
};
const pill = (text, style) => `<span class="pill" style="${style}">${esc(text)}</span>`;
const typePill = (t) => (t ? pill(t, TYPE_STYLE[t] || TYPE_STYLE.Expense) : '');

const CSS = `
:root{--ink:#1C1B19;--quiet:#5F5B55;--line:#E6E2DC;--soft:#EFECE7;--bg:#F7F5F2;--accent:#C2410C;--accent-dark:#9A3412;--accent-tint:#FDECE3;--good:#166534;--good-tint:#E7F4EC;--warn:#854D0E;--warn-tint:#FEF6E0}
*{box-sizing:border-box}
[hidden]{display:none!important}
body{margin:0;font-family:Inter,system-ui,-apple-system,sans-serif;color:var(--ink);background:var(--bg)}
a{color:var(--accent)}a:hover{color:var(--accent-dark)}
.shell{display:flex;flex-wrap:wrap;min-height:100vh}
nav{flex:1 1 220px;max-width:260px;padding:24px 16px;background:#fff;border-right:1px solid var(--line);display:flex;flex-direction:column;gap:4px}
nav .brand{display:flex;align-items:center;gap:10px;padding:4px 12px 20px}
nav .brand b{font-size:17px}nav .brand small{display:block;font-size:12px;color:var(--quiet)}
nav a.item{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-radius:8px;color:#3F3B36;text-decoration:none;font-size:14px;min-height:44px}
nav a.item:hover{background:#F1EEE9;color:var(--ink)}
nav a.on{background:var(--accent-tint);color:var(--accent-dark);font-weight:600}
nav .foot{margin-top:auto;padding:12px;font-size:12px;color:var(--quiet);display:flex;flex-direction:column;gap:4px}
main{flex:999 1 560px;min-width:0;padding:32px 40px;display:flex;flex-direction:column;gap:24px}
@media (max-width:720px){nav{max-width:none;flex-basis:100%}main{padding:20px 16px}}
h1{margin:0;font-size:26px}h2{margin:0;font-size:16px}
.sub{margin:6px 0 0;color:var(--quiet);font-size:14px}
.head{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-end;gap:16px}
.grid4{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px}
.card{background:#fff;border:1px solid var(--line);border-radius:12px}
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
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 16px;border-radius:8px;font-weight:600;font-size:14px;font-family:inherit;cursor:pointer;text-decoration:none;border:1px solid #D6D1C9;background:#fff;color:var(--ink)}
.btn.primary{background:var(--accent);border-color:var(--accent);color:#fff}
.btn[disabled]{opacity:.55;cursor:not-allowed}
.banner{padding:12px 16px;border-radius:10px;font-size:13px}
.banner.demo{background:var(--warn-tint);color:var(--warn)}
.banner.good{background:var(--good-tint);color:var(--good)}
.banner.bad{background:#FDECEC;color:#991B1B}
.bar{height:8px;border-radius:4px;background:var(--accent)}
.split{display:flex;flex-wrap:wrap;gap:24px;align-items:flex-start}
.split>.wide{flex:999 1 480px;min-width:0}.split>.side{flex:1 1 280px;max-width:380px}
.pad{padding:16px 20px;display:flex;flex-direction:column;gap:10px;font-size:13px}
.ok{color:var(--good)}.no{color:#991B1B}
.filters{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;padding:14px 16px;border-bottom:1px solid var(--line)}
.filter{display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--quiet);min-width:140px}
.filter.grow{flex:1 1 220px}
.filter input,.filter select{min-height:40px;padding:0 10px;border:1px solid #D6D1C9;border-radius:8px;font-size:14px;font-family:inherit;color:var(--ink);background:#fff}
.filter-actions{display:flex;gap:8px}
.selbar{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;padding:10px 16px;font-size:13px;color:var(--quiet);border-bottom:1px solid var(--line)}
#sel-count{color:var(--accent-dark);font-weight:600}
td.check,th.check{width:36px;padding-right:0}
td.check input,th.check input{width:18px;height:18px;accent-color:var(--accent);cursor:pointer}
td.check input:disabled{cursor:not-allowed;opacity:.35}
a.kpi.link{text-decoration:none;color:inherit}a.kpi.link:hover{border-color:#D6D1C9;box-shadow:0 1px 0 #D6D1C9}
.dealrow{display:block;padding:12px 14px;border-bottom:1px solid var(--soft);text-decoration:none;color:var(--ink)}
.dealrow.on{background:var(--accent-tint)}
.inline{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end}
.inline input,.inline textarea{min-height:40px;padding:8px 10px;border:1px solid #D6D1C9;border-radius:8px;font-size:14px;font-family:inherit;color:var(--ink);background:#fff}
.inline textarea{min-height:40px;resize:vertical;width:100%}
.decide{display:flex;flex-direction:column;gap:8px;min-width:240px}
.decide .row{display:flex;gap:8px;flex-wrap:wrap}
.who{display:flex;flex-direction:column;gap:2px}
.btn.sm{min-height:36px;padding:0 12px;font-size:13px}
.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
table.owners td{padding:6px 8px}
table.owners select,table.owners input{min-height:36px;padding:0 8px;border:1px solid #D6D1C9;border-radius:8px;font-size:13px;font-family:inherit;background:#fff;color:var(--ink)}
.dealrow b{display:block;font-size:14px}.dealrow span{font-size:12px;color:var(--quiet)}
`;

const FLAME = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#C2410C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3c1 3 4 4.5 4 8.5a4 4 0 0 1-8 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 0-7.5z"></path><path d="M6 21h12"></path></svg>`;

export function layout({ active, title, body, ctx, scripts = [] }) {
  const needSetup = (ctx.config?.deals || []).filter((d) => !d.billingType).length;
  // [href, key, label, count, alert, title]; an alert count is red so it gets noticed.
  const items = [
    ['/', 'queue', 'Billback queue', ctx.plan.lines.length, false, 'Pending lines'],
    ['/deals', 'deals', 'Deals &amp; allocations', needSetup || null, true, `${needSetup} deal${needSetup === 1 ? '' : 's'} need${needSetup === 1 ? 's' : ''} setup`],
    ['/approvals', 'approvals', 'Approvals', ctx.groups ? ctx.groups.filter((g) => g.status !== 'approved').length || null : null, false, 'Deals waiting for approval'],
    ['/invoices', 'invoices', 'Invoices', ctx.plan.customers.length || null, false, 'Invoices in this run'],
  ];
  const nav = items
    .map(([href, key, label, count, alert, title]) => {
      const badge = count == null ? ''
        : `<span class="pill" title="${esc(title)}" style="${alert ? 'background:#991B1B;color:#fff' : 'background:#fff;color:#3F3B36'}">${count}<span class="sr-only"> ${esc(title)}</span></span>`;
      return `<a class="item${active === key ? ' on' : ''}" href="${href}"${active === key ? ' aria-current="page"' : ''}><span>${label}</span>${badge}</a>`;
    })
    .join('');
  const source = ctx.demo
    ? `<div class="banner demo"><b>Demo data.</b> Showing test bill ABC_261106 from the repo. Add <code>CAMPFIRE_API_KEY</code> on Render to read live bills.</div>`
    : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" type="image/svg+xml" href="/favicon.svg">
<title>Rekindle · ${esc(title)}</title><style>${CSS}</style></head><body><div class="shell">
<nav aria-label="Rekindle"><div class="brand">${FLAME}<div><b>Rekindle</b><small>Billback for Campfire</small></div></div>${nav}
<div class="foot">${ctx.user ? `<span class="who"><b style="color:var(--ink)">${esc(ctx.user.name || ctx.user.email)}</b><span>${esc(ctx.user.email)}${ctx.admin ? ' · admin' : ''}</span></span><form method="post" action="/logout"><button class="btn sm" type="submit">Sign out</button></form>` : ''}<span>${ctx.demo ? 'Demo mode' : 'Live from Campfire'}</span><span>Approvals saved: ${ctx.storeKind === 'postgres' ? 'database' : 'not saved (no database)'}</span><span>Writing to Campfire: ${ctx.write ? 'on' : 'off'}</span><span>Loaded ${esc(ctx.loadedAt)}</span></div></nav>
<main>${source}${body}</main></div>${scripts.map((src) => `<script src="${src}" defer></script>`).join('')}</body></html>`;
}

function customerCell(l) {
  if (l.exception) {
    const fix = /needs setup|Tag Setup row/.test(l.exception) && l.dealsTag ? ` <a href="/deals?deal=${encodeURIComponent(l.dealsTag)}">Set up</a>` : '';
    return `<span class="no">${esc(l.exception)}</span>${fix}`;
  }
  if (l.billingType === 'Expense') return '<span class="muted">Not billed back · reclass</span>';
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
  expense: 'background:#F1EEE9;color:#3F3B36',
  exception: 'background:#FDECEC;color:#991B1B',
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
    active: 'queue', title: 'Billback queue', ctx, scripts: ['/static/queue.js'],
    body: `${flashHtml}${review ? reviewBanner(ctx, review) : ''}<div class="head"><div><h1>Billback queue</h1><p class="sub">Pending lines on ${esc(ctx.config.unbilledAccountNumber)} Unbilled Receivable, stamped from each line's Deals tag.</p></div>
<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">${stampButtons}<a class="btn primary" href="/approvals">Review for approval</a></div></div>
<div class="grid4">
<a class="card kpi link" href="/"><span>Pending lines</span><strong>${usd(plan.totals.pendingCents)}</strong><span>${plan.lines.length} lines</span></a>
<a class="card kpi link" href="/?state=to_stamp"><span>To stamp</span><strong>${toStamp.length}</strong><span>of ${plan.lines.length} lines · ${alloc} split at invoicing</span></a>
<a class="card kpi link" href="/approvals"><span>Billback customers</span><strong>${plan.customers.length}</strong><span>after splits</span></a>
<a class="card kpi link" href="/?state=exception"><span>Exceptions</span><strong style="color:${exceptions.length ? '#991B1B' : 'var(--good)'}">${exceptions.length}</strong><span>${usd(plan.totals.exceptionCents)}</span></a>
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

function setupForm(ctx, deal, owners, draft) {
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
<td><input name="owner_${i}_percent" type="number" min="0" max="100" step="0.0001" inputmode="decimal" value="${esc(o.percent)}" aria-label="Owner ${i + 1} share percent" style="width:90px"></td>
<td><input name="owner_${i}_start" type="date" value="${esc(o.start)}" aria-label="Owner ${i + 1} effective from"></td>
<td><input name="owner_${i}_end" type="date" value="${esc(o.end)}" aria-label="Owner ${i + 1} effective to"></td>
<td><button type="button" class="btn sm remove-owner" aria-label="Clear owner ${i + 1}" title="Clear this row">Clear</button></td></tr>`)
    .join('');

  return `<form class="card pad setup" method="post" action="/deals/setup" style="gap:16px"><input type="hidden" name="deal" value="${esc(deal.dealsTagId)}">
<h2>Setup</h2>
<div class="inline">
<label class="filter"><span>Billing type</span><select name="billingType" required>${type ? '' : '<option value="" selected>Choose…</option>'}${typeOptions}</select></label>
<label class="filter grow" id="billed-to"><span>Billed to (Deal or Fund)</span><select name="customer">${custOptions(custId)}</select></label>
</div>
<p class="sub" style="margin:0"><b>Deal</b> and <b>Fund</b> bill 100% to one customer. Several deals can bill the same fund. <b>Allocation</b> splits across the owners below. <b>Expense</b> isn't billed back.</p>
<div id="owners-section"><h2 style="font-size:14px;margin-bottom:8px">Owners (Allocation only)</h2>
<div class="scroll"><table class="owners"><thead><tr><th>Billback customer</th><th>Share %</th><th>Effective from</th><th>Effective to</th><th><span class="sr-only">Clear</span></th></tr></thead><tbody id="owner-rows" data-max="20">${ownerRows}</tbody></table></div>
<div style="display:flex;gap:12px;align-items:center;margin-top:8px;flex-wrap:wrap"><button type="button" class="btn sm" id="add-owner">Add owner</button><span id="owner-total" class="small muted" aria-live="polite"></span></div>
<p class="sub" style="margin:8px 0 0">Leave dates blank for "from the start" and "still active". To change ownership, put an end date on the old rows and add new rows starting the next day. Clear a row to remove it. Need more than 20 owners? Ask for the limit to be raised.</p></div>
${customers.length ? '' : '<div class="banner bad">No Billback Customer tags found in Campfire. Create one per customer first.</div>'}
<div><button class="btn primary" type="submit">Save setup</button></div></form>`;
}

export function dealsPage(ctx, selected, flash = null, draft = null) {
  const { config, plan } = ctx;
  const deals = config.deals;
  if (!deals.length) {
    return layout({ active: 'deals', title: 'Deals & allocations', ctx, body: '<h1>Deals &amp; allocations</h1><p class="sub">No Deals tags found in Campfire yet.</p>' });
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
      return `<a class="dealrow${d === deal ? ' on' : ''}" href="/deals?deal=${encodeURIComponent(d.dealsTag)}"${d === deal ? ' aria-current="true"' : ''}><b>${esc(d.dealsTag)}</b><span${!d.billingType ? ' style="color:#991B1B;font-weight:600"' : ''}>${esc(summary)}${n ? ` · ${n} pending line${n === 1 ? '' : 's'}` : ''}</span></a>`;
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
    summary = `<div class="card"><div class="cardhead"><div style="display:flex;gap:10px;align-items:center"><h2>Owners</h2>${Math.abs(total - 100) < 1e-9 ? pill('Active total 100% · OK', 'background:var(--good-tint);color:var(--good)') : pill(`Active total ${total}% · fix`, 'background:#FDECEC;color:#991B1B')}</div></div>
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
    active: 'deals', title: 'Deals & allocations', ctx, scripts: ['/static/deals.js'],
    body: `${flashHtml}<div class="head"><div><h1>Deals &amp; allocations</h1><p class="sub">Every Deals tag in ${ctx.demo ? 'the demo data' : 'Campfire'}. Its billing type decides who gets invoiced.</p></div>
${needs.length ? pill(`${needs.length} need${needs.length === 1 ? 's' : ''} setup`, 'background:#FDECEC;color:#991B1B;font-size:13px;padding:6px 12px') : pill('All deals set up', 'background:var(--good-tint);color:var(--good);font-size:13px;padding:6px 12px')}</div>
<div class="split"><div class="card side" style="overflow:hidden"><div class="cardhead"><span class="small muted"><b>${deals.length} deals</b></span></div>${list}</div>
<div class="wide" style="display:flex;flex-direction:column;gap:16px">
<div class="card pad" style="flex-direction:row;flex-wrap:wrap;gap:32px">
<div><span class="small muted">Deal</span><div style="font-size:20px;font-weight:700">${esc(deal.dealsTag)}</div></div>
<div><span class="small muted">Billing type</span><div>${deal.billingType ? typePill(deal.billingType) : pill('Needs setup', 'background:#FDECEC;color:#991B1B')}</div></div>
<div><span class="small muted">Setup</span><div class="small">${esc(SETUP_SOURCE[deal.source] || '')}</div></div>
<div><span class="small muted">Campfire Deals tag</span><div class="small">ID ${esc(deal.dealsTagId)}</div></div></div>
${summary}${ctx.admin ? setupForm(ctx, deal, owners, draft) : ''}${approverCard(ctx, deal)}</div></div>`,
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
  sent_back: ['Sent back', 'background:#FDECEC;color:#991B1B'],
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
<textarea id="note-${esc(g.deal.dealsTagId)}" name="note" rows="1" maxlength="500" style="min-height:36px;padding:8px 10px;border:1px solid #D6D1C9;border-radius:8px;font:inherit;font-size:13px"></textarea>
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
  failed: ['Not created', 'background:#FDECEC;color:#991B1B'],
  unknown: ['Check Campfire', 'background:#FDECEC;color:#991B1B'],
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
<td><b>${esc(r.customer_name)}</b><div class="small muted">${esc(r.ref)}</div></td><td>${esc(r.invoice_number || '—')}</td><td class="num">${usd(r.total_cents)}</td>
<td>${pill(label, style)}${r.error ? `<div class="small no" style="white-space:normal;max-width:360px;margin-top:4px">${esc(r.error)}</div>` : ''}</td>
<td style="white-space:normal"><div style="display:flex;gap:6px;flex-wrap:wrap;align-items:flex-end">${actions.join('')}</div></td></tr>`;
  }).join('');
  return `<div class="card"><div class="cardhead"><h2>Invoice history</h2><span class="small muted">Newest first</span></div>
<div class="scroll"><table><thead><tr><th>When</th><th>Customer</th><th>Invoice</th><th class="num">Amount</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}

export function invoicesPage(ctx, selected, flash = null) {
  const { plan } = ctx;
  const pick = plan.customers.find((c) => c.customer.name === selected) || plan.customers[0];
  const durable = ctx.storeKind === 'postgres' || process.env.REKINDLE_ALLOW_MEMORY_STORE === 'true';
  const canCreate = ctx.admin && ctx.write && !ctx.demo && durable;
  const linesById = new Map(plan.lines.map((l) => [l.lineId, l]));

  const rows = plan.customers
    .map((c) => {
      const r = ctx.readiness?.get(c.customer.name) || { ready: false, waitingOn: [] };
      const deals = [...new Set(c.sources.map((s) => linesById.get(s.lineId)?.dealsTag))];
      const linked = Boolean(c.customer.customerId);
      let status;
      if (!r.ready) status = `${pill('Waiting for approval', 'background:var(--warn-tint);color:var(--warn)')}<div class="small muted" style="white-space:normal">${esc(r.waitingOn.join(', '))}</div>`;
      else if (!linked) status = `${pill('Not linked to a Campfire customer', 'background:#FDECEC;color:#991B1B')}`;
      else status = pill('Ready', 'background:var(--good-tint);color:var(--good)');
      const ok = r.ready && linked;
      const box = canCreate && ok
        ? `<input type="checkbox" class="pick" name="customer" value="${esc(c.customer.name)}" form="create-form" aria-label="Select ${esc(c.customer.name)}">`
        : `<input type="checkbox" disabled aria-label="${esc(c.customer.name)} can't be invoiced yet">`;
      return `<tr${c === pick ? ' style="background:var(--accent-tint)"' : ''}><td class="check">${box}</td>
<td><a href="/invoices?customer=${encodeURIComponent(c.customer.name)}"><b>${esc(c.customer.name)}</b></a></td>
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
<tfoot><tr><td style="padding-left:0">Total due</td><td class="num" style="padding-right:0">${usd(pick.cents)}</td></tr></tfoot></table><a class="btn" href="/invoices/pdf?customer=${encodeURIComponent(pick.customer.name)}" target="_blank" rel="noopener">Download PDF (draft)</a></div>`
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
    body: `${flashHtml}${setupNote}<div class="head"><div><h1>Create invoices</h1><p class="sub">One invoice per billback customer, once every deal feeding it is approved.</p></div>
${canCreate ? `<form id="create-form" method="post" action="/invoices/confirm"><button class="btn primary" type="submit" id="stamp-selected" data-verb="Create">Create selected</button></form>` : `<button class="btn primary" type="button" disabled title="${esc(why)}">Create selected</button>`}</div>
${why && ctx.admin ? `<p class="sub" style="margin:0">${esc(why)}</p>` : ''}
<div class="split"><div class="wide" style="display:flex;flex-direction:column;gap:16px"><div class="card">
<div class="selbar"><span>${plan.customers.length} customer${plan.customers.length === 1 ? '' : 's'} to invoice · ${usd(plan.totals.billedCents)}</span>${canCreate ? '<span id="sel-count" aria-live="polite"></span>' : ''}</div>
<div class="scroll"><table><thead><tr><th class="check">${canCreate ? '<input type="checkbox" id="select-all" aria-label="Select all customers ready to invoice">' : ''}</th><th>Customer</th><th>Deals</th><th>Lines</th><th class="num">Amount</th><th>Status</th></tr></thead>
<tbody>${rows || '<tr><td colspan="6" class="muted">Nothing left to invoice.</td></tr>'}</tbody><tfoot><tr><td></td><td colspan="3">Total</td><td class="num">${usd(plan.totals.billedCents)}</td><td></td></tr></tfoot></table></div></div>
</div>
${preview}</div>
${historyTable(ctx)}`,
  });
}

export function confirmInvoicesPage(ctx, chosen) {
  const total = chosen.reduce((s, c) => s + c.customer.cents, 0);
  const rows = chosen.map((c) => `<tr><td><b>${esc(c.customer.customer.name)}</b><input type="hidden" name="customer" value="${esc(c.customer.customer.name)}"></td>
<td>${c.request.lines.length}</td><td>${esc(c.request.invoice_date)}</td><td>${esc(c.request.due_date)}</td><td class="num">${usd(c.customer.cents)}</td>
<td>${c.problems.length ? `<span class="no" style="white-space:normal">${esc(c.problems.join(' '))}</span>` : pill('Ready', 'background:var(--good-tint);color:var(--good)')}</td></tr>`).join('');
  const blocked = chosen.some((c) => c.problems.length);
  return layout({
    active: 'invoices', title: 'Confirm invoices', ctx,
    body: `<div><span class="small muted">Invoices › Confirm</span><h1 style="margin-top:6px">Create ${chosen.length} invoice${chosen.length === 1 ? '' : 's'} · ${usd(total)}</h1>
<p class="sub">This creates real invoices in Campfire, attaches each PDF, and marks the source bill lines Billed. It can't be undone from Rekindle; a mistake is fixed by voiding the invoice in Campfire.</p></div>
<form method="post" action="/invoices/create" class="card"><div class="scroll"><table><thead><tr><th>Customer</th><th>Invoice lines</th><th>Invoice date</th><th>Due date</th><th class="num">Amount</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
<div class="pad" style="flex-direction:row;gap:8px">${blocked ? '<span class="no">Fix the problems above first.</span>' : `<button class="btn primary" type="submit" name="confirm" value="yes">Create ${chosen.length} invoice${chosen.length === 1 ? '' : 's'} in Campfire</button>`}<a class="btn" href="/invoices">Cancel</a></div></form>`,
  });
}

export function loginPage(error, { google = false, token = true } = {}) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" type="image/svg+xml" href="/favicon.svg"><title>Rekindle · Sign in</title><style>${CSS}</style></head>
<body><main style="max-width:420px;margin:12vh auto"><div class="card pad" style="gap:16px;padding:28px">${FLAME}<h1>Rekindle</h1>
${error ? `<div class="banner bad">${esc(error)}</div>` : ''}
${google ? '<a class="btn primary" href="/auth/google">Sign in with Google</a>' : ''}
${google && token ? '<p class="sub" style="margin:0;text-align:center">or, for admins</p>' : ''}
${token ? `<form method="post" action="/login" style="display:flex;flex-direction:column;gap:10px"><label for="token" class="small muted">Access token</label>
<input id="token" name="token" type="password" autocomplete="current-password" required style="min-height:44px;padding:0 12px;border:1px solid #D6D1C9;border-radius:8px;font:inherit">
<button class="btn${google ? '' : ' primary'}" type="submit">Sign in with token</button></form>
<p class="sub" style="margin:0">The token is <code>REKINDLE_ADMIN_TOKEN</code> in the Render service's Environment tab.</p>` : ''}</div></main></body></html>`;
}
