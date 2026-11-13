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
.dealrow{display:block;padding:12px 14px;border-bottom:1px solid var(--soft);text-decoration:none;color:var(--ink)}
.dealrow.on{background:var(--accent-tint)}
.dealrow b{display:block;font-size:14px}.dealrow span{font-size:12px;color:var(--quiet)}
`;

const FLAME = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#C2410C" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3c1 3 4 4.5 4 8.5a4 4 0 0 1-8 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 0-7.5z"></path><path d="M6 21h12"></path></svg>`;

export function layout({ active, title, body, ctx }) {
  const items = [
    ['/', 'queue', 'Billback queue', ctx.plan.lines.length],
    ['/deals', 'deals', 'Deals &amp; allocations', null],
    ['/approvals', 'approvals', 'Approvals', null],
    ['/invoices', 'invoices', 'Invoices', ctx.plan.customers.length || null],
  ];
  const nav = items
    .map(([href, key, label, count]) =>
      `<a class="item${active === key ? ' on' : ''}" href="${href}"${active === key ? ' aria-current="page"' : ''}><span>${label}</span>${count != null ? `<span class="pill" style="background:#fff;color:#3F3B36">${count}</span>` : ''}</a>`)
    .join('');
  const source = ctx.demo
    ? `<div class="banner demo"><b>Demo data.</b> Showing test bill ABC_261106 from the repo. Add <code>CAMPFIRE_API_KEY</code> on Render to read live bills.</div>`
    : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Rekindle · ${esc(title)}</title><style>${CSS}</style></head><body><div class="shell">
<nav aria-label="Rekindle"><div class="brand">${FLAME}<div><b>Rekindle</b><small>Billback for Campfire</small></div></div>${nav}
<div class="foot"><span>${ctx.demo ? 'Demo mode' : 'Live from Campfire'}</span><span>Writing to Campfire: ${ctx.write ? 'on' : 'off'}</span><span>Loaded ${esc(ctx.loadedAt)}</span></div></nav>
<main>${source}${body}</main></div></body></html>`;
}

function customerCell(l) {
  if (l.exception) return `<span class="no">${esc(l.exception)}</span>`;
  if (l.billingType === 'Expense') return '<span class="muted">Not billed back · reclass</span>';
  if (l.billingType === 'Allocation') {
    return `<a href="/deals?deal=${encodeURIComponent(l.dealsTag)}">Split ${l.billTo.map((b) => b.percent).join(' / ')}</a>`;
  }
  const name = l.billTo[0]?.customer.name;
  const pending = l.stamps.some((s) => s.field === 'billbackCustomerTag');
  return `${esc(name)} <span class="small" style="color:${pending ? 'var(--warn)' : 'var(--good)'};font-weight:600">· ${pending ? 'to stamp' : 'stamped'}</span>`;
}

export function queuePage(ctx, flash) {
  const { plan } = ctx;
  const exceptions = plan.lines.filter((l) => l.exception);
  const toStamp = plan.lines.filter((l) => !l.exception && l.stamps.length);
  const alloc = plan.lines.filter((l) => !l.exception && l.billingType === 'Allocation').length;

  const rows = plan.lines
    .map(
      (l) => `<tr><td>${esc(l.billNumber)}</td><td class="muted">${esc(l.lineId)}</td><td class="wrap">${esc(l.description)}</td><td class="wrap">${esc(l.dealsTag ?? '—')}</td>
<td>${typePill(l.billingType)}${l.stamps.some((s) => s.field !== 'billbackCustomerTag') ? ' <span class="small" style="color:var(--warn)">· to fill</span>' : ''}</td>
<td>${customerCell(l)}</td><td class="num">${usd(l.amountCents)}</td></tr>`,
    )
    .join('');

  const flashHtml = flash ? `<div class="banner ${flash.ok ? 'good' : 'bad'}">${esc(flash.text)}</div>` : '';
  const runBtn = ctx.write && !ctx.demo
    ? `<form method="post" action="/run-now"><button class="btn" type="submit">Stamp ${toStamp.length} line${toStamp.length === 1 ? '' : 's'} now</button></form>`
    : `<button class="btn" type="button" disabled title="${ctx.demo ? 'Demo mode' : 'Turn on REKINDLE_WRITE to stamp'}">Stamp now (${ctx.demo ? 'demo' : 'writing off'})</button>`;

  return layout({
    active: 'queue', title: 'Billback queue', ctx,
    body: `${flashHtml}<div class="head"><div><h1>Billback queue</h1><p class="sub">Pending lines on ${esc(ctx.config.unbilledAccountNumber)} Unbilled Receivable, stamped from each line's Deals tag.</p></div>
<div style="display:flex;gap:8px;flex-wrap:wrap">${runBtn}<a class="btn primary" href="/approvals">Review for approval</a></div></div>
<div class="grid4">
<div class="card kpi"><span>Pending lines</span><strong>${usd(plan.totals.pendingCents)}</strong><span>${plan.lines.length} lines</span></div>
<div class="card kpi"><span>To stamp</span><strong>${toStamp.length}</strong><span>of ${plan.lines.length} lines · ${alloc} split at invoicing</span></div>
<div class="card kpi"><span>Billback customers</span><strong>${plan.customers.length}</strong><span>after splits</span></div>
<div class="card kpi"><span>Exceptions</span><strong style="color:${exceptions.length ? '#991B1B' : 'var(--good)'}">${exceptions.length}</strong><span>${usd(plan.totals.exceptionCents)}</span></div>
</div>
<div class="card"><div class="scroll"><table><thead><tr><th>Bill</th><th>Line</th><th>Description</th><th>Deals tag</th><th>Billing type</th><th>Billback customer</th><th class="num">Amount</th></tr></thead>
<tbody>${rows || '<tr><td colspan="7" class="muted">No pending lines.</td></tr>'}</tbody>
<tfoot><tr><td colspan="6">Total</td><td class="num">${usd(plan.totals.pendingCents)}</td></tr></tfoot></table></div></div>
<p class="sub">Rekindle only fills a blank Billing Type or a missing Billback Customer tag. Anything AP set by hand stays as entered.</p>`,
  });
}

export function dealsPage(ctx, selected) {
  const { config } = ctx;
  const deal = config.deals.find((d) => d.dealsTag === selected) || config.deals.find((d) => d.billingType === 'Allocation') || config.deals[0];
  const list = config.deals
    .map((d) => {
      const summary = d.billingType === 'Allocation'
        ? `Allocation · ${config.allocations.filter((a) => a.dealsTagId === d.dealsTagId).length} owners`
        : `${d.billingType} · bills ${d.customer?.name ?? '—'}`;
      return `<a class="dealrow${d === deal ? ' on' : ''}" href="/deals?deal=${encodeURIComponent(d.dealsTag)}"${d === deal ? ' aria-current="true"' : ''}><b>${esc(d.dealsTag)}</b><span>${esc(summary)}</span></a>`;
    })
    .join('');

  const owners = config.allocations.filter((a) => a.dealsTagId === deal.dealsTagId);
  const active = owners.filter((a) => !a.end);
  const total = active.reduce((s, a) => s + a.percent, 0);
  const ownerRows = owners
    .map((a) => `<tr><td>${esc(a.customer.name)}</td><td class="muted">${esc(a.customer.campfireId)}</td><td class="num"><b>${esc(a.percent)}%</b></td><td>${esc(a.start || 'From the start')}</td><td>${esc(a.end || 'Active')}</td></tr>`)
    .join('');

  const detail = deal.billingType === 'Allocation'
    ? `<div class="card"><div class="cardhead"><div style="display:flex;gap:10px;align-items:center"><h2>Owners</h2>${Math.abs(total - 100) < 1e-9 ? pill('Total 100% · OK', 'background:var(--good-tint);color:var(--good)') : pill(`Total ${total}% · fix`, 'background:#FDECEC;color:#991B1B')}</div></div>
<div class="scroll"><table><thead><tr><th>Billback customer</th><th>Campfire ID</th><th class="num">Share</th><th>Effective from</th><th>Effective to</th></tr></thead><tbody>${ownerRows}</tbody></table></div>
<p class="sub" style="padding:0 16px 14px">Bills use the split in force on their bill date. Leftover cents go to the largest share.</p></div>`
    : `<div class="card pad"><h2>Billed to</h2><div style="font-size:15px"><b>${esc(deal.customer?.name ?? 'Not set')}</b> <span class="muted">${esc(deal.customer?.campfireId ?? '')}</span></div><p class="sub" style="margin:0">Every Pending line tagged ${esc(deal.dealsTag)} is billed 100% to this customer.</p></div>`;

  return layout({
    active: 'deals', title: 'Deals & allocations', ctx,
    body: `<div class="head"><div><h1>Deals &amp; allocations</h1><p class="sub">Each deal is a Deals tag in Campfire. Its billing type decides who gets invoiced.</p></div>
<button class="btn" type="button" disabled title="Editing needs the database step">Edit setup (coming)</button></div>
<div class="split"><div class="card side" style="overflow:hidden"><div class="cardhead"><span class="small muted"><b>${config.deals.length} deals</b></span></div>${list}</div>
<div class="wide" style="display:flex;flex-direction:column;gap:16px">
<div class="card pad" style="flex-direction:row;flex-wrap:wrap;gap:32px">
<div><span class="small muted">Deal</span><div style="font-size:20px;font-weight:700">${esc(deal.dealsTag)}</div></div>
<div><span class="small muted">Billing type</span><div>${typePill(deal.billingType)}</div></div>
<div><span class="small muted">Campfire Deals tag</span><div>ID ${esc(deal.dealsTagId)}</div></div></div>
${detail}</div></div>`,
  });
}

function checks(ctx) {
  const { plan } = ctx;
  const ex = plan.lines.filter((l) => l.exception);
  return [
    [!plan.lines.some((l) => l.exception?.startsWith('No Deals tag')), 'Every line has a Deals tag'],
    [!plan.lines.some((l) => /Tag Setup row/.test(l.exception || '')), 'Every Deals tag has a setup row'],
    [!plan.lines.some((l) => /not 100%|no owners/.test(l.exception || '')), 'Every allocation totals 100%'],
    [plan.totals.ties, 'Run total ties to pending lines'],
    [ex.length === 0, ex.length ? `${ex.length} exception${ex.length === 1 ? '' : 's'} held back` : 'No exceptions'],
  ];
}

export function approvalsPage(ctx) {
  const { plan } = ctx;
  const billed = plan.totals.billedCents || 1;
  const largest = Math.max(1, ...plan.customers.map((c) => c.cents));
  const rows = plan.customers
    .map((c) => {
      const share = (c.cents / billed) * 100;
      const sources = c.sources.map((s) => `line ${esc(s.lineId)}${s.percent < 100 ? ` (${esc(s.percent)}%)` : ''} ${usd(s.cents)}`).join(' · ');
      return `<tr><td><b>${esc(c.customer.name)}</b><div class="small muted" style="white-space:normal;margin-top:4px">${sources}</div></td>
<td style="width:160px"><div class="bar" style="width:${((c.cents / largest) * 100).toFixed(1)}%"></div></td><td class="num">${pct(share)}</td><td class="num">${usd(c.cents)}</td></tr>`;
    })
    .join('');
  const list = checks(ctx).map(([ok, text]) => `<span class="${ok ? 'ok' : 'no'}">${ok ? '✓' : '✗'} ${esc(text)}</span>`).join('');

  return layout({
    active: 'approvals', title: 'Review & approve', ctx,
    body: `<div><span class="small muted">Approvals › Current run</span><h1 style="margin-top:6px">Billback run · ${usd(plan.totals.billedCents)}</h1><p class="sub">What each fund and customer will be invoiced, before anything is created in Campfire.</p></div>
<div class="split"><div class="card wide"><div class="cardhead"><h2>Amount owed by billback customer</h2><span class="small muted">${plan.customers.length} customers · ${plan.lines.length - plan.lines.filter((l) => l.exception).length} lines</span></div>
<div class="scroll"><table><thead><tr><th>Billback customer</th><th>Share of run</th><th class="num">%</th><th class="num">Amount</th></tr></thead><tbody>${rows || '<tr><td colspan="4" class="muted">Nothing to bill.</td></tr>'}</tbody>
<tfoot><tr><td colspan="2">Total</td><td class="num">100%</td><td class="num">${usd(plan.totals.billedCents)}</td></tr></tfoot></table></div></div>
<div class="side" style="display:flex;flex-direction:column;gap:16px">
<div class="card pad"><h2>Checks</h2>${list}</div>
<div class="card pad"><h2>Approval</h2><p class="sub" style="margin:0">Recording approvals needs the database step. For now this page is the review.</p>
<a class="btn primary" href="/invoices">Preview invoices</a></div></div></div>`,
  });
}

export function invoicesPage(ctx, selected) {
  const { plan } = ctx;
  const pick = plan.customers.find((c) => c.customer.name === selected) || plan.customers[0];
  const rows = plan.customers
    .map((c) => {
      const cats = [...c.categories.keys()];
      return `<tr${c === pick ? ' style="background:var(--accent-tint)"' : ''}><td><a href="/invoices?customer=${encodeURIComponent(c.customer.name)}"><b>${esc(c.customer.name)}</b></a></td><td class="muted">${esc(c.customer.campfireId ?? '')}</td><td>${c.sources.length} · ${esc(cats.join(', '))}</td><td class="num">${usd(c.cents)}</td><td>${pill('Draft', 'background:#F1EEE9;color:#3F3B36')}</td></tr>`;
    })
    .join('');

  const lineRows = pick
    ? pick.sources
        .map((s) => {
          const l = plan.lines.find((x) => x.lineId === s.lineId);
          const label = s.percent < 100 ? `${esc(l.rechargeCategory ?? 'Other')} · ${esc(l.dealsTag)} allocation (${esc(s.percent)}%)` : `${esc(l.rechargeCategory ?? 'Other')} · ${esc(l.dealsTag)}`;
          const note = s.percent < 100 ? `${esc(s.percent)}% of ${usd(l.amountCents)} · ${esc(l.billNumber)}` : `${esc(l.description)} · ${esc(l.billNumber)}`;
          return `<tr><td style="padding-left:0;white-space:normal">${label}<div class="small muted">${note}</div></td><td class="num" style="padding-right:0">${usd(s.cents)}</td></tr>`;
        })
        .join('')
    : '';

  const preview = pick
    ? `<div class="card side pad" style="gap:16px"><div><span class="small muted">Invoice preview</span><div style="font-size:18px;font-weight:700">${esc(pick.customer.name)}</div></div>
<table><thead><tr><th style="padding-left:0">Description</th><th class="num" style="padding-right:0">Amount</th></tr></thead><tbody>${lineRows}</tbody>
<tfoot><tr><td style="padding-left:0">Total due</td><td class="num" style="padding-right:0">${usd(pick.cents)}</td></tr></tfoot></table></div>`
    : '';

  return layout({
    active: 'invoices', title: 'Invoices', ctx,
    body: `<div class="head"><div><h1>Create invoices</h1><p class="sub">One invoice per billback customer. Lines show where each amount came from.</p></div>
<button class="btn primary" type="button" disabled title="Invoice creation is the next build step">Create ${plan.customers.length} invoices (coming)</button></div>
<div class="split"><div class="wide" style="display:flex;flex-direction:column;gap:16px"><div class="card"><div class="scroll"><table><thead><tr><th>Customer</th><th>Campfire ID</th><th>Lines</th><th class="num">Amount</th><th>Status</th></tr></thead>
<tbody>${rows || '<tr><td colspan="5" class="muted">Nothing to invoice.</td></tr>'}</tbody><tfoot><tr><td colspan="3">Total</td><td class="num">${usd(plan.totals.billedCents)}</td><td></td></tr></tfoot></table></div></div>
<div class="card pad"><h2>When invoicing is built, Rekindle will</h2><span>1. Post these invoices in Campfire, crediting ${esc(ctx.config.unbilledAccountNumber)} Unbilled Receivable</span><span>2. Set Billback Status to Billed on the source lines</span><span>3. Keep a record of which line went on which invoice</span></div></div>
${preview}</div>`,
  });
}

export function loginPage(error) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Rekindle · Sign in</title><style>${CSS}</style></head>
<body><main style="max-width:420px;margin:12vh auto"><div class="card pad" style="gap:16px;padding:28px">${FLAME}<h1>Rekindle</h1>
${error ? `<div class="banner bad">${esc(error)}</div>` : ''}
<form method="post" action="/login" style="display:flex;flex-direction:column;gap:10px"><label for="token" class="small muted">Access token</label>
<input id="token" name="token" type="password" autocomplete="current-password" required style="min-height:44px;padding:0 12px;border:1px solid #D6D1C9;border-radius:8px;font:inherit">
<button class="btn primary" type="submit">Sign in</button></form>
<p class="sub" style="margin:0">The token is <code>REKINDLE_ADMIN_TOKEN</code> in the Render service's Environment tab.</p></div></main></body></html>`;
}
