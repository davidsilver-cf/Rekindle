// Dashboard screen: the whole firm, or one deal (?deal=). Bars are plain
// HTML so they follow the light/dark and Campfire themes with no library.
import { layout, esc, cfLink } from './ui.js';
import { AGING } from './dashboard.js';

const usd = (cents) => (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const usd0 = (cents) => (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const shortDate = (iso) => {
  const [y, m, d] = String(iso || '').slice(0, 10).split('-');
  return y ? `${m}/${d}/${y}` : '';
};
const pill = (text, style) => `<span class="pill" style="${style}">${esc(text)}</span>`;
const dealHref = (deal) => `/dashboard?deal=${encodeURIComponent(deal)}`;

// Aging runs green → amber → orange → red: older is worse.
const AGE_COLOR = { a30: 'var(--good)', a60: 'var(--warn)', a90: 'var(--accent)', a90p: 'var(--bad)' };
const STAGE_STYLE = {
  'Needs setup': 'background:var(--bad-tint);color:var(--bad)',
  'Waiting for approval': 'background:var(--warn-tint);color:var(--warn)',
  'Approved · ready to invoice': 'background:var(--good-tint);color:var(--good)',
  'Awaiting reclass': 'background:var(--hover);color:var(--nav-ink)',
};
const STATUS_STYLE = {
  paid: 'background:var(--good-tint);color:var(--good)',
  partially_paid: 'background:var(--accent-tint);color:var(--accent-dark)',
  past_due: 'background:var(--bad-tint);color:var(--bad)',
};
const statusLabel = (s) => ({ paid: 'Paid', partially_paid: 'Partly paid', past_due: 'Past due', unpaid: 'Unpaid', sent: 'Sent', draft: 'Draft' }[s] || (s ? s[0].toUpperCase() + s.slice(1).replace(/_/g, ' ') : ''));

const STYLE = `<style>
.dash-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:16px}
.dash-kpis .kpi strong{font-size:24px;font-variant-numeric:tabular-nums}
.dash-kpis .kpi small{font-size:12px;color:var(--quiet)}
.dash-kpis .kpi.alert strong{color:var(--bad)}
.stack{display:flex;height:14px;border-radius:7px;overflow:hidden;background:var(--soft)}
.stack span{display:block;height:100%}
.legend{display:flex;flex-direction:column;gap:8px;font-size:13px}
.legend div{display:flex;align-items:center;gap:8px}.legend b{margin-left:auto;font-variant-numeric:tabular-nums;font-weight:600}
.legend i{width:10px;height:10px;border-radius:2px;flex:none}
.hbars{display:flex;flex-direction:column;gap:12px;font-size:13px}
.hbar{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px 10px;align-items:center}
.hbar .track{grid-column:1/-1;height:10px;border-radius:5px;background:var(--soft);overflow:hidden;display:flex}
.hbar .track span{display:block;height:100%}
.hbar b{font-weight:600;font-variant-numeric:tabular-nums}
.hbar .name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dash-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px}
.tbltools{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.tbltools input{min-height:36px;padding:0 10px;border:1px solid var(--field-line);border-radius:8px;font:inherit;font-size:13px;background:var(--surface);color:var(--ink);min-width:180px}
td.bad{color:var(--bad)}
</style>`;

function kpi(label, value, note = '', alert = false) {
  return `<div class="card kpi${alert ? ' alert' : ''}"><span>${esc(label)}</span><strong>${value}</strong>${note ? `<small>${note}</small>` : ''}</div>`;
}

function agingCard(d) {
  const total = d.aging.reduce((t, b) => t + b.cents, 0);
  const seg = d.aging.filter((b) => b.cents).map((b) => `<span style="width:${(100 * b.cents) / total}%;background:${AGE_COLOR[b.key]}" title="${esc(b.label)}: ${usd(b.cents)}"></span>`).join('');
  const legend = d.aging.map((b) => `<div><i style="background:${AGE_COLOR[b.key]}"></i><span>${esc(b.label)}</span><b>${usd(b.cents)}</b></div>`).join('');
  return `<div class="card pad"><h2>Unbilled by age</h2><p class="sub" style="margin:0">Age is days since the bill date.</p>
${total ? `<div class="stack" role="img" aria-label="Unbilled by age">${seg}</div>` : '<p class="muted" style="margin:0">Nothing unbilled.</p>'}
<div class="legend">${legend}</div></div>`;
}

function barsCard(title, sub, rows) {
  const max = Math.max(1, ...rows.map((r) => r.cents));
  const body = rows.length
    ? rows.map((r) => `<div class="hbar"><span class="name" title="${esc(r.label)}">${r.labelHtml || esc(r.label)}</span><b>${usd(r.cents)}</b><span class="track"><span style="width:${(100 * r.cents) / max}%;background:${r.color || 'var(--accent)'}"></span></span></div>`).join('')
    : '<p class="muted" style="margin:0">Nothing to show.</p>';
  return `<div class="card pad"><h2>${esc(title)}</h2>${sub ? `<p class="sub" style="margin:0">${esc(sub)}</p>` : ''}<div class="hbars">${body}</div></div>`;
}

// Invoiced split into collected (green) and still owed (accent).
function collectionCard(title, rows) {
  const max = Math.max(1, ...rows.map((r) => r.invoicedCents));
  const body = rows.length
    ? rows.map((r) => `<div class="hbar"><span class="name" title="${esc(r.label)}">${r.labelHtml || esc(r.label)}</span><b>${usd(r.invoicedCents)} <span class="muted" style="font-weight:400">· ${usd(r.collectedCents)} collected</span></b><span class="track" title="Collected ${usd(r.collectedCents)} · Outstanding ${usd(r.outstandingCents)}"><span style="width:${(100 * r.collectedCents) / max}%;background:var(--good)"></span><span style="width:${(100 * r.outstandingCents) / max}%;background:var(--accent)"></span></span></div>`).join('')
    : '<p class="muted" style="margin:0">No invoices yet.</p>';
  return `<div class="card pad"><h2>${esc(title)}</h2><div class="legend" style="flex-direction:row;gap:16px"><div><i style="background:var(--good)"></i><span>Collected</span></div><div><i style="background:var(--accent)"></i><span>Outstanding</span></div></div><div class="hbars">${body}</div></div>`;
}

function tableCard({ id, title, note, head, rows, foot, csv, empty }) {
  return `<div class="card"><div class="cardhead"><div><h2>${esc(title)}</h2>${note ? `<p class="sub" style="margin:2px 0 0">${note}</p>` : ''}</div>
<div class="tbltools"><input type="search" data-filter-for="${id}" placeholder="Filter rows" aria-label="Filter ${esc(title)}" hidden><a class="btn sm" href="${esc(csv)}" download>Export CSV</a></div></div>
<div class="scroll"><table id="${id}"><thead><tr>${head}</tr></thead><tbody>${rows || `<tr><td colspan="20" class="muted">${esc(empty)}</td></tr>`}</tbody>${foot ? `<tfoot><tr>${foot}</tr></tfoot>` : ''}</table></div></div>`;
}

const csvHref = (view, deal) => `/dashboard.csv?view=${view}${deal ? `&deal=${encodeURIComponent(deal)}` : ''}`;

export function dashboardPage(ctx, d, { invoicesError = null } = {}) {
  const k = d.kpis;
  const embedded = Boolean(ctx.embed);
  const options = [`<option value="">All deals</option>`, ...d.deals.map((n) => `<option value="${esc(n)}"${n === d.deal ? ' selected' : ''}>${esc(n)}</option>`)].join('');
  const picker = `<form method="get" action="/dashboard" class="inline dash-pick"><label class="filter" style="min-width:220px"><span>Deal</span><select name="deal">${options}</select></label><button class="btn sm" type="submit">Show</button></form>`;
  const errBanner = invoicesError ? `<div class="banner bad">Couldn't read invoices from Campfire, so invoiced and collected amounts are missing: ${esc(invoicesError)}</div>` : '';

  const kpis = `<div class="dash-kpis">
${kpi('Unbilled', usd0(k.unbilledCents), k.unbilledLines ? `${k.unbilledLines} line${k.unbilledLines === 1 ? '' : 's'} · oldest ${k.oldestDays} day${k.oldestDays === 1 ? '' : 's'}` : 'Nothing waiting')}
${kpi('Unbilled over 90 days', usd0(k.over90Cents), k.unbilledCents ? `${Math.round((100 * k.over90Cents) / k.unbilledCents)}% of unbilled` : '', k.over90Cents > 0)}
${kpi('Invoiced', usd0(k.invoicedCents), `${k.invoiceCount} invoice${k.invoiceCount === 1 ? '' : 's'}`)}
${kpi('Collected', usd0(k.collectedCents), k.collectedPct === null ? 'No invoices yet' : `${Math.round(100 * k.collectedPct)}% of invoiced`)}
${kpi('Outstanding', usd0(k.outstandingCents), k.overdueCents ? `${usd0(k.overdueCents)} past due` : 'None past due', k.overdueCents > 0)}
</div>`;

  const stageBars = barsCard('Where unbilled stands', 'What has to happen before each amount can be invoiced.', d.stages.map((s) => ({ label: s.stage, labelHtml: pill(s.stage, STAGE_STYLE[s.stage]), cents: s.cents, color: 'var(--accent)' })));

  let body;
  if (!d.deal) {
    const dealRows = d.byDeal.map((r) => `<tr><td><a href="${esc(dealHref(r.deal))}">${esc(r.deal)}</a></td><td class="num">${usd(r.unbilledCents)}</td>${AGING.map((b) => `<td class="num${b.key === 'a90p' && r.aging[b.key] ? ' bad' : ''}">${r.aging[b.key] ? usd(r.aging[b.key]) : '<span class="muted">—</span>'}</td>`).join('')}<td class="num">${usd(r.invoicedCents)}</td><td class="num">${usd(r.collectedCents)}</td><td class="num${r.overdueCents ? ' bad' : ''}">${usd(r.outstandingCents)}</td></tr>`).join('');
    const tot = (key) => d.byDeal.reduce((t, r) => t + r[key], 0);
    const custRows = d.byCustomer.map((r) => `<tr><td>${esc(r.customer)}</td><td class="num">${usd(r.toInvoiceCents)}</td><td class="num">${usd(r.invoicedCents)}</td><td class="num">${usd(r.collectedCents)}</td><td class="num">${usd(r.outstandingCents)}</td><td class="num${r.overdueCents ? ' bad' : ''}">${r.overdueCents ? usd(r.overdueCents) : '<span class="muted">—</span>'}</td></tr>`).join('');
    body = `${kpis}
<div class="dash-row">${agingCard(d)}${stageBars}${collectionCard('Invoiced by deal', d.byDeal.filter((r) => r.invoicedCents).slice(0, 8).map((r) => ({ ...r, label: r.deal, labelHtml: `<a href="${esc(dealHref(r.deal))}">${esc(r.deal)}</a>` })))}</div>
${tableCard({ id: 'by-deal', title: 'By deal', note: 'Click a deal for its lines and invoices.', head: `<th>Deal</th><th class="num">Unbilled</th>${AGING.map((b) => `<th class="num">${esc(b.label)}</th>`).join('')}<th class="num">Invoiced</th><th class="num">Collected</th><th class="num">Outstanding</th>`, rows: dealRows, foot: d.byDeal.length ? `<td>Total</td><td class="num">${usd(tot('unbilledCents'))}</td>${AGING.map((b) => `<td class="num">${usd(d.byDeal.reduce((t, r) => t + r.aging[b.key], 0))}</td>`).join('')}<td class="num">${usd(tot('invoicedCents'))}</td><td class="num">${usd(tot('collectedCents'))}</td><td class="num">${usd(tot('outstandingCents'))}</td>` : '', csv: csvHref('deals'), empty: 'No deals with unbilled or invoiced amounts.' })}
${tableCard({ id: 'by-customer', title: 'By billback customer', note: '“To invoice” is each customer\'s share of unbilled lines that bill back (not Expense lines or exceptions).', head: '<th>Customer</th><th class="num">To invoice</th><th class="num">Invoiced</th><th class="num">Collected</th><th class="num">Outstanding</th><th class="num">Past due</th>', rows: custRows, csv: csvHref('customers'), empty: 'No billback customers yet.' })}`;
  } else {
    const lineRows = d.unbilled.slice().sort((a, b) => (b.age ?? 0) - (a.age ?? 0)).map((r) => `<tr><td>${r.billId ? cfLink('bill', r.billId, r.billNumber, embedded) : esc(r.billNumber)}<div class="small muted">Line ${esc(r.lineId)}</div></td><td>${esc(r.vendorName || '')}</td><td>${esc(shortDate(r.billDate))}</td><td class="num${r.bucket === 'a90p' ? ' bad' : ''}">${r.age ?? ''}</td><td class="wrap">${esc(r.description || '')}</td><td>${esc(r.category)}</td><td>${pill(r.stage, STAGE_STYLE[r.stage])}</td><td class="num">${usd(r.cents)}</td></tr>`).join('');
    const invRows = d.invoiced.map((r) => `<tr><td>${cfLink('invoice', r.invoiceId, r.number, embedded)}</td><td>${esc(shortDate(r.date))}</td><td>${esc(r.customer)}</td><td>${pill(statusLabel(r.status), STATUS_STYLE[r.status] || 'background:var(--hover);color:var(--nav-ink)')}</td><td class="num">${usd(r.cents)}</td><td class="num">${usd(r.paidCents)}</td><td class="num${r.overdue ? ' bad' : ''}">${usd(r.dueCents)}</td></tr>`).join('');
    const cats = barsCard('Unbilled by recharge category', '', d.categories.map((c) => ({ label: c.category, cents: c.cents })));
    body = `<p class="sub" style="margin:0"><a href="/dashboard">← All deals</a> · <a href="/deals?deal=${encodeURIComponent(d.deal)}">Deal setup</a></p>
${kpis}
<div class="dash-row">${agingCard(d)}${stageBars}${cats}</div>
${tableCard({ id: 'deal-lines', title: 'Unbilled lines', note: 'Oldest first. For split lines, the amount is the part not yet invoiced.', head: '<th>Bill</th><th>Vendor</th><th>Bill date</th><th class="num">Age (days)</th><th>Description</th><th>Category</th><th>Stage</th><th class="num">Amount</th>', rows: lineRows, foot: d.unbilled.length ? `<td colspan="7">Total</td><td class="num">${usd(k.unbilledCents)}</td>` : '', csv: csvHref('unbilled', d.deal), empty: 'Nothing unbilled for this deal.' })}
${tableCard({ id: 'deal-invoices', title: 'Invoices', note: 'Amounts are this deal\'s lines on each invoice; payments are spread over an invoice\'s lines by amount.', head: '<th>Invoice</th><th>Date</th><th>Customer</th><th>Status</th><th class="num">Amount</th><th class="num">Collected</th><th class="num">Outstanding</th>', rows: invRows, foot: d.invoiced.length ? `<td colspan="4">Total</td><td class="num">${usd(k.invoicedCents)}</td><td class="num">${usd(k.collectedCents)}</td><td class="num">${usd(k.outstandingCents)}</td>` : '', csv: csvHref('invoices', d.deal), empty: 'No invoices for this deal yet.' })}`;
  }

  return layout({
    active: 'dashboard', title: d.deal ? `Dashboard · ${d.deal}` : 'Dashboard', ctx, scripts: ['/static/dashboard.js'],
    body: `${STYLE}<div class="head"><div><h1 class="title">${d.deal ? esc(d.deal) : 'Dashboard'}</h1><p class="sub">${d.deal ? `What's unbilled on ${esc(d.deal)}, and what's been invoiced and collected.` : 'What\'s unbilled and how old it is, and what\'s been invoiced and collected.'}</p></div>${picker}</div>${errBanner}${body}`,
  });
}

// CSV for each table, from the same data the page shows.
const cell = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"` : s;
};
const money = (cents) => (cents / 100).toFixed(2);
export function dashboardCsv(d, view) {
  let head;
  let rows;
  if (view === 'deals') {
    head = ['Deal', 'Unbilled', ...AGING.map((b) => b.label), 'Invoiced', 'Collected', 'Outstanding', 'Past due'];
    rows = d.byDeal.map((r) => [r.deal, money(r.unbilledCents), ...AGING.map((b) => money(r.aging[b.key])), money(r.invoicedCents), money(r.collectedCents), money(r.outstandingCents), money(r.overdueCents)]);
  } else if (view === 'customers') {
    head = ['Customer', 'To invoice', 'Invoiced', 'Collected', 'Outstanding', 'Past due'];
    rows = d.byCustomer.map((r) => [r.customer, money(r.toInvoiceCents), money(r.invoicedCents), money(r.collectedCents), money(r.outstandingCents), money(r.overdueCents)]);
  } else if (view === 'invoices') {
    head = ['Invoice', 'Date', 'Due date', 'Customer', 'Deal', 'Status', 'Amount', 'Collected', 'Outstanding'];
    rows = d.invoiced.map((r) => [r.number, r.date, r.dueDate, r.customer, r.deal, statusLabel(r.status), money(r.cents), money(r.paidCents), money(r.dueCents)]);
  } else {
    head = ['Bill', 'Line', 'Vendor', 'Bill date', 'Age (days)', 'Deal', 'Description', 'Category', 'Stage', 'Amount'];
    rows = d.unbilled.map((r) => [r.billNumber, r.lineId, r.vendorName, r.billDate, r.age, r.deal, r.description, r.category, r.stage, money(r.cents)]);
  }
  return [head, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}
