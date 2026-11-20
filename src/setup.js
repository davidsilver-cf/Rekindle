// Deal setup: which deals exist (live Deals tags from Campfire), how each one
// bills, and who owns what share. Setup saved in Rekindle's database wins;
// the starter file (config/rekindle.json) fills in deals not set up yet;
// anything else is "Needs setup".

export const BILLING_TYPES = ['Deal', 'Fund', 'Allocation', 'Expense'];

const fileCustomer = (c) => (c ? { name: c.name, billbackTagId: c.billbackTagId, customerId: c.customerId ?? null, campfireId: c.campfireId ?? null } : null);

// Billback customers someone can pick: live Billback Customer tags, or (demo)
// the customers named in the starter file.
export function billbackCustomers(base, tags, links = new Map()) {
  if (tags?.billbackCustomers) {
    return tags.billbackCustomers
      .map((t) => {
        const known = [...base.deals.map((d) => d.customer), ...base.allocations.map((a) => a.customer)].find((c) => c && c.billbackTagId === t.id);
        return { name: t.name, billbackTagId: t.id, customerId: t.customer ?? links.get(Number(t.id)) ?? known?.customerId ?? null, campfireId: known?.campfireId ?? null };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  const seen = new Map();
  for (const c of [...base.deals.map((d) => d.customer), ...base.allocations.map((a) => a.customer)]) {
    if (c && !seen.has(c.billbackTagId)) seen.set(c.billbackTagId, fileCustomer(c));
  }
  return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// Build the config the engine runs on.
//   base:    the starter file
//   tags:    { deals, billbackCustomers } from Campfire, or null in demo mode
//   setups:  Map dealsTagId → { billingType, customer } saved in Rekindle
//   owners:  [{ dealsTagId, customer, percent, start, end }] saved in Rekindle
//   saved:   [{ id, name, owners: [{ customer, amount, percent, start, end }] }] saved allocations
export function effectiveConfig(base, { tags = null, setups = new Map(), owners = [], links = new Map(), groups = new Map(), saved = [] } = {}) {
  const customers = billbackCustomers(base, tags, links);
  const dealTags = tags?.deals
    ? tags.deals.map((t) => ({ id: t.id, name: t.name }))
    : base.deals.map((d) => ({ id: d.dealsTagId, name: d.dealsTag }));

  const deals = dealTags
    .map((t) => {
      const saved = setups.get(t.id);
      const file = base.deals.find((d) => d.dealsTagId === t.id);
      if (saved?.billingType) {
        return { dealsTag: t.name, dealsTagId: t.id, billingType: saved.billingType, customer: saved.customer || null, allocationId: saved.allocationId || null, source: 'rekindle' };
      }
      if (file) return { dealsTag: t.name, dealsTagId: t.id, billingType: file.billingType, customer: fileCustomer(file.customer), source: 'file' };
      return { dealsTag: t.name, dealsTagId: t.id, billingType: null, customer: null, source: 'none' };
    })
    .sort((a, b) => a.dealsTag.localeCompare(b.dealsTag));

  // Owners: a deal using a saved allocation takes that allocation's owners;
  // a deal with its own saved owners uses only those; otherwise the file's.
  const savedById = new Map(saved.map((a) => [Number(a.id), a]));
  const fromSaved = [];
  for (const d of deals) {
    const a = d.billingType === 'Allocation' && d.allocationId ? savedById.get(Number(d.allocationId)) : null;
    d.allocation = a ? { id: Number(a.id), name: a.name } : null;
    if (a) for (const o of a.owners) fromSaved.push({ dealsTagId: d.dealsTagId, customer: o.customer, amount: o.amount ?? null, percent: Number(o.percent), start: o.start || null, end: o.end || null });
  }
  const viaSaved = new Set(fromSaved.map((o) => o.dealsTagId));
  const savedDeals = new Set([...owners.map((o) => o.dealsTagId), ...viaSaved]);
  const allocations = [
    ...fromSaved,
    ...owners.filter((o) => !viaSaved.has(o.dealsTagId)).map((o) => ({ dealsTagId: o.dealsTagId, customer: o.customer, amount: o.amount ?? null, percent: Number(o.percent), start: o.start || null, end: o.end || null })),
    ...base.allocations.filter((a) => !savedDeals.has(a.dealsTagId)).map((a) => ({ ...a, customer: fileCustomer(a.customer) })),
  ];

  // Billing Group: a tag per deal, from the Billing Group tag group.
  for (const d of deals) d.billingGroup = groups.get(d.dealsTagId) || null;
  const billingGroups = (tags?.billingGroups || []).map((t) => ({ id: t.id, name: t.name })).sort((a, b) => a.name.localeCompare(b.name));
  const savedAllocations = saved.map((a) => ({ id: Number(a.id), name: a.name, owners: a.owners, deals: deals.filter((d) => d.allocation && d.allocation.id === Number(a.id)).map((d) => d.dealsTag) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { ...base, deals, allocations, billbackCustomers: customers, billingGroups, savedAllocations };
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (s) => ISO.test(s) && !Number.isNaN(Date.parse(s));

// Check owner rows (a deal's own split, or a saved allocation's). Each row is
// { customerTagId, amount, percent, start, end }. A row with a $ amount gets
// its % worked out: its amount over the total of the owners in force on the
// same date. A row with no amount keeps the % typed. Owners in force on the
// same date must be all $ or all % (an older period may be % and a newer $).
// Returns { errors, rows: [{ customer, amount, percent, start, end }] }.
export function validateOwners(owners, customers, what = 'An Allocation deal') {
  const errors = [];
  const byTag = new Map(customers.map((c) => [c.billbackTagId, c]));
  const rows = [];
  const filled = owners.filter((o) => o.customerTagId || o.percent || o.amount || o.start || o.end);
  const hasAmount = (o) => String(o.amount ?? '').trim() !== '';
  const money = (v) => Number(String(v ?? '').replace(/[$,\s]/g, ''));
  for (const [i, o] of owners.entries()) {
    if (!filled.includes(o)) continue;
    const n = i + 1;
    const c = byTag.get(Number(o.customerTagId));
    if (!c) errors.push(`Owner ${n}: choose a billback customer.`);
    if (o.start && !validDate(o.start)) errors.push(`Owner ${n}: start date isn't a date.`);
    if (o.end && !validDate(o.end)) errors.push(`Owner ${n}: end date isn't a date.`);
    if (o.start && o.end && validDate(o.start) && validDate(o.end) && o.start > o.end) errors.push(`Owner ${n}: start date is after end date.`);
    if (hasAmount(o)) {
      const amt = money(o.amount);
      if (!(amt > 0) || !Number.isFinite(amt)) errors.push(`Owner ${n}: $ amount must be more than 0.`);
      rows.push({ customer: c || null, amount: Math.round(amt * 100) / 100, percent: 0, start: o.start || null, end: o.end || null });
    } else {
      const pct = Number(o.percent);
      if (!(pct > 0 && pct <= 100)) errors.push(`Owner ${n}: share must be more than 0% and at most 100%.`);
      rows.push({ customer: c || null, amount: null, percent: pct, start: o.start || null, end: o.end || null });
    }
  }
  if (!rows.length) errors.push(`${what} needs at least one owner.`);
  const dated = rows.filter((r) => (!r.start || validDate(r.start)) && (!r.end || validDate(r.end)));
  const activeOn = (p) => dated.filter((r) => (p === '' ? !r.start : !r.start || r.start <= p) && (p === '' || !r.end || r.end >= p));
  // $ → %: share of the amounts in force on the row's start date.
  for (const r of dated) {
    if (r.amount === null) continue;
    const total = activeOn(r.start || '').reduce((t, x) => t + (x.amount || 0), 0);
    r.percent = total > 0 ? Math.round(((r.amount / total) * 100) * 1e10) / 1e10 : 0;
  }
  // Wherever the owners change (the beginning, each start date, the day
  // after each end date), the owners in force must total 100%.
  const dayAfter = (d) => new Date(Date.parse(d) + 864e5).toISOString().slice(0, 10);
  const points = new Set(['', ...dated.map((r) => r.start).filter(Boolean), ...dated.map((r) => r.end).filter(Boolean).map(dayAfter)]);
  const reported = new Set();
  for (const p of [...points].sort()) {
    const active = activeOn(p);
    if (!active.length) continue;
    const mixed = active.some((r) => r.amount !== null) && active.some((r) => r.amount === null);
    if (mixed) {
      if (!reported.has(`mixed:${p}`)) { reported.add(`mixed:${p}`); errors.push(`Enter a $ amount for every owner${p ? ` in force from ${p}` : ''}, or clear them all to type percentages.`); }
      continue;
    }
    const byAmount = active.some((r) => r.amount !== null);
    const total = active.reduce((t, r) => t + r.percent, 0);
    if (Math.abs(total - 100) > 1e-6) {
      const shown = Math.round(total * 10000) / 10000;
      if (reported.has(`${p}:${shown}`)) continue;
      reported.add(`${p}:${shown}`);
      errors.push(byAmount
        ? `The owners' $ amounts overlap unevenly${p ? ` from ${p}` : ''}: give every period its own set of owners (use Change the split).`
        : `Owners total ${shown}%${p ? ` from ${p}` : ''}; they must total 100%.`);
    }
  }
  return { errors, rows };
}

// Check a deal setup submitted from the Deals screen. Returns { errors, setup, owners }.
// An Allocation deal either has its own owners or uses a saved allocation
// (allocationId), in which case its own owners are cleared.
export function validateSetup({ billingType, customerTagId, owners = [], allocationId = null }, customers, savedAllocations = []) {
  const errors = [];
  const byTag = new Map(customers.map((c) => [c.billbackTagId, c]));
  if (!BILLING_TYPES.includes(billingType)) errors.push('Choose a billing type.');

  let customer = null;
  if (billingType === 'Deal' || billingType === 'Fund') {
    customer = byTag.get(Number(customerTagId)) || null;
    if (!customer) errors.push(`A ${billingType} deal needs the billback customer it bills.`);
  }

  let rows = [];
  let allocation = null;
  if (billingType === 'Allocation') {
    if (allocationId) {
      allocation = savedAllocations.find((a) => Number(a.id) === Number(allocationId)) || null;
      if (!allocation) errors.push('That saved allocation no longer exists; pick another or use Own split.');
    } else {
      const v = validateOwners(owners, customers);
      errors.push(...v.errors);
      rows = v.rows;
    }
  }
  return { errors, setup: { billingType, customer, allocationId: allocation ? Number(allocation.id) : null }, owners: billingType === 'Allocation' && !allocation ? rows : [] };
}
