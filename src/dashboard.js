// Dashboard numbers, from two sources:
//   Unbilled  the open bill lines Rekindle reads (what still sits in the
//             unbilled account), aged by bill date.
//   Invoiced  Campfire invoices whose lines carry a Deals tag (Rekindle's own
//             and any made by hand), with what's been paid against them.
// Pure functions: the server fetches, these shape.

export const AGING = [
  { key: 'a30', label: '0–30 days', min: 0, max: 30 },
  { key: 'a60', label: '31–60 days', min: 31, max: 60 },
  { key: 'a90', label: '61–90 days', min: 61, max: 90 },
  { key: 'a90p', label: 'Over 90 days', min: 91, max: Infinity },
];

const toCents = (v) => Math.round(Number(v || 0) * 100);
const dayNum = (iso) => {
  const [y, m, d] = String(iso || '').slice(0, 10).split('-').map(Number);
  return y ? Date.UTC(y, m - 1, d) / 86_400_000 : null;
};
export const ageDays = (iso, today) => {
  const a = dayNum(iso);
  const b = dayNum(today);
  return a === null || b === null ? null : Math.max(0, b - a);
};
export const bucketOf = (age) => (age === null ? null : AGING.find((b) => age >= b.min && age <= b.max).key);
const cleanCustomer = (name) => String(name || '').replace(/\s*\((CUST|VEN)-\d+\)\s*$/, '').trim();

// Where an open line stands on its way to an invoice.
export const STAGES = ['Needs setup', 'Waiting for approval', 'Approved · ready to invoice', 'Awaiting reclass'];

// One row per open line, with the part not yet invoiced.
export function unbilledRows(plan, groups, today) {
  const approved = new Set((groups || []).filter((g) => g.status === 'approved').flatMap((g) => g.lines.map((l) => l.lineId)));
  const rows = [];
  for (const l of plan.lines) {
    const age = ageDays(l.billDate, today);
    const row = (stage, cents, shares = []) => rows.push({
      lineId: l.lineId, billId: l.billId, billNumber: l.billNumber, vendorName: l.vendorName, billDate: l.billDate,
      age, bucket: bucketOf(age), description: l.description, deal: l.dealsTag || 'No deal',
      category: l.rechargeCategory || 'Uncategorized', billingType: l.billingType, stage, cents, shares,
    });
    if (l.exception) { row('Needs setup', l.amountCents); continue; }
    if (l.billingType === 'Expense') { row('Awaiting reclass', l.amountCents); continue; }
    // Shares to invoice, and shares for Expensed customers (reclassed, not invoiced).
    const toBill = l.billTo.filter((b) => !b.invoiced && !b.expensed);
    const toExpense = l.billTo.filter((b) => b.expensed && !b.reclassed);
    const billCents = toBill.reduce((t, b) => t + b.cents, 0);
    if (billCents) row(approved.has(l.lineId) ? 'Approved · ready to invoice' : 'Waiting for approval', billCents, toBill.map((b) => ({ customer: b.customer.name, cents: b.cents })));
    const expCents = toExpense.reduce((t, b) => t + b.cents, 0);
    if (expCents) row('Awaiting reclass', expCents);
  }
  return rows;
}

// One row per invoice per deal on it. Paid is spread over the invoice's
// lines by amount. Voided and deleted invoices are left out.
export function invoiceRows(invoices, config, today) {
  const dealsGroup = Number(config.tagGroups.deals);
  const rows = [];
  for (const inv of invoices || []) {
    const status = String(inv.status || '').toLowerCase();
    if (inv.is_deleted || status === 'voided') continue;
    const byDeal = new Map();
    for (const line of inv.lines || []) {
      const deal = (line.tags || []).find((t) => Number(t.group) === dealsGroup && !t.is_deleted);
      if (!deal) continue;
      byDeal.set(deal.name, (byDeal.get(deal.name) || 0) + toCents(line.amount));
    }
    if (!byDeal.size) continue;
    const total = toCents(inv.total_amount);
    const paid = toCents(inv.amount_paid);
    const overdue = status === 'past_due' || (toCents(inv.amount_due) > 0 && inv.due_date && inv.due_date < today);
    const deals = [...byDeal.entries()];
    let paidLeft = paid;
    deals.forEach(([deal, cents], i) => {
      const paidCents = i === deals.length - 1 ? Math.min(paidLeft, cents) : (total ? Math.round((paid * cents) / total) : 0);
      paidLeft -= paidCents;
      rows.push({
        invoiceId: inv.id, number: inv.invoice_number || String(inv.id), date: inv.invoice_date, dueDate: inv.due_date,
        customer: cleanCustomer(inv.client_name), status, deal, cents, paidCents, dueCents: cents - paidCents,
        overdue: Boolean(overdue) && cents - paidCents > 0, daysPastDue: overdue ? ageDays(inv.due_date, today) : 0,
      });
    });
  }
  return rows.sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.number).localeCompare(String(a.number)));
}

const sum = (list, k = 'cents') => list.reduce((t, x) => t + x[k], 0);
const groupBy = (list, key) => {
  const m = new Map();
  for (const x of list) {
    const k = typeof key === 'function' ? key(x) : x[key];
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
};
const agingOf = (rows) => Object.fromEntries(AGING.map((b) => [b.key, sum(rows.filter((r) => r.bucket === b.key))]));

// Everything the dashboard shows, optionally for one deal.
export function dashboardData({ plan, groups, invoices, config, today, deal = null }) {
  const allUnbilled = unbilledRows(plan, groups, today);
  const allInvoiced = invoiceRows(invoices, config, today);
  const unbilled = deal ? allUnbilled.filter((r) => r.deal === deal) : allUnbilled;
  const invoiced = deal ? allInvoiced.filter((r) => r.deal === deal) : allInvoiced;

  const oldest = unbilled.reduce((m, r) => (r.age !== null && r.age > m ? r.age : m), 0);
  const kpis = {
    unbilledCents: sum(unbilled),
    unbilledLines: unbilled.length,
    oldestDays: unbilled.length ? oldest : null,
    over90Cents: sum(unbilled.filter((r) => r.bucket === 'a90p')),
    invoicedCents: sum(invoiced),
    invoiceCount: new Set(invoiced.map((r) => r.invoiceId)).size,
    collectedCents: sum(invoiced, 'paidCents'),
    outstandingCents: sum(invoiced, 'dueCents'),
    overdueCents: sum(invoiced.filter((r) => r.overdue), 'dueCents'),
  };
  kpis.collectedPct = kpis.invoicedCents ? kpis.collectedCents / kpis.invoicedCents : null;

  const aging = AGING.map((b) => ({ ...b, cents: sum(unbilled.filter((r) => r.bucket === b.key)) }));
  const stages = STAGES.map((s) => ({ stage: s, cents: sum(unbilled.filter((r) => r.stage === s)), lines: unbilled.filter((r) => r.stage === s).length })).filter((s) => s.cents);
  const categories = [...groupBy(unbilled, 'category').entries()].map(([category, rs]) => ({ category, cents: sum(rs) })).sort((a, b) => b.cents - a.cents);

  // By deal: every deal with unbilled or invoiced amounts.
  const dealNames = [...new Set([...allUnbilled.map((r) => r.deal), ...allInvoiced.map((r) => r.deal)])].sort((a, b) => a.localeCompare(b));
  const ub = groupBy(allUnbilled, 'deal');
  const iv = groupBy(allInvoiced, 'deal');
  const byDeal = dealNames.map((name) => {
    const u = ub.get(name) || [];
    const i = iv.get(name) || [];
    return { deal: name, unbilledCents: sum(u), aging: agingOf(u), invoicedCents: sum(i), collectedCents: sum(i, 'paidCents'), outstandingCents: sum(i, 'dueCents'), overdueCents: sum(i.filter((r) => r.overdue), 'dueCents') };
  }).sort((a, b) => (b.unbilledCents + b.outstandingCents) - (a.unbilledCents + a.outstandingCents) || a.deal.localeCompare(b.deal));

  // By customer: shares still to invoice (billed-back lines only), and invoices.
  const owed = new Map();
  for (const r of unbilled) for (const s of r.shares) owed.set(s.customer, (owed.get(s.customer) || 0) + s.cents);
  const ic = groupBy(invoiced, 'customer');
  const byCustomer = [...new Set([...owed.keys(), ...ic.keys()])].map((name) => {
    const i = ic.get(name) || [];
    return { customer: name, toInvoiceCents: owed.get(name) || 0, invoicedCents: sum(i), collectedCents: sum(i, 'paidCents'), outstandingCents: sum(i, 'dueCents'), overdueCents: sum(i.filter((r) => r.overdue), 'dueCents') };
  }).sort((a, b) => (b.toInvoiceCents + b.outstandingCents) - (a.toInvoiceCents + a.outstandingCents) || a.customer.localeCompare(b.customer));

  return { deal, deals: dealNames, kpis, aging, stages, categories, byDeal, byCustomer, unbilled, invoiced, today };
}
