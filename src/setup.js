// Deal setup: which deals exist (live Deals tags from Campfire), how each one
// bills, and who owns what share. Setup saved in Rekindle's database wins;
// the starter file (config/rekindle.json) fills in deals not set up yet;
// anything else is "Needs setup".

export const BILLING_TYPES = ['Deal', 'Fund', 'Allocation', 'Expense'];

const fileCustomer = (c) => (c ? { name: c.name, billbackTagId: c.billbackTagId, customerId: c.customerId ?? null, campfireId: c.campfireId ?? null } : null);

// Billback customers someone can pick: live Billback Customer tags, or (demo)
// the customers named in the starter file.
export function billbackCustomers(base, tags) {
  if (tags?.billbackCustomers) {
    return tags.billbackCustomers
      .map((t) => {
        const known = [...base.deals.map((d) => d.customer), ...base.allocations.map((a) => a.customer)].find((c) => c && c.billbackTagId === t.id);
        return { name: t.name, billbackTagId: t.id, customerId: t.customer ?? known?.customerId ?? null, campfireId: known?.campfireId ?? null };
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
export function effectiveConfig(base, { tags = null, setups = new Map(), owners = [] } = {}) {
  const customers = billbackCustomers(base, tags);
  const dealTags = tags?.deals
    ? tags.deals.map((t) => ({ id: t.id, name: t.name }))
    : base.deals.map((d) => ({ id: d.dealsTagId, name: d.dealsTag }));

  const deals = dealTags
    .map((t) => {
      const saved = setups.get(t.id);
      const file = base.deals.find((d) => d.dealsTagId === t.id);
      if (saved?.billingType) {
        return { dealsTag: t.name, dealsTagId: t.id, billingType: saved.billingType, customer: saved.customer || null, source: 'rekindle' };
      }
      if (file) return { dealsTag: t.name, dealsTagId: t.id, billingType: file.billingType, customer: fileCustomer(file.customer), source: 'file' };
      return { dealsTag: t.name, dealsTagId: t.id, billingType: null, customer: null, source: 'none' };
    })
    .sort((a, b) => a.dealsTag.localeCompare(b.dealsTag));

  // Owners: a deal with any saved owners uses only those; otherwise the file's.
  const savedDeals = new Set(owners.map((o) => o.dealsTagId));
  const allocations = [
    ...owners.map((o) => ({ dealsTagId: o.dealsTagId, customer: o.customer, percent: Number(o.percent), start: o.start || null, end: o.end || null })),
    ...base.allocations.filter((a) => !savedDeals.has(a.dealsTagId)).map((a) => ({ ...a, customer: fileCustomer(a.customer) })),
  ];

  return { ...base, deals, allocations, billbackCustomers: customers };
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (s) => ISO.test(s) && !Number.isNaN(Date.parse(s));

// Check a deal setup submitted from the Deals screen. Returns { errors, setup, owners }.
export function validateSetup({ billingType, customerTagId, owners = [] }, customers) {
  const errors = [];
  const byTag = new Map(customers.map((c) => [c.billbackTagId, c]));
  if (!BILLING_TYPES.includes(billingType)) errors.push('Choose a billing type.');

  let customer = null;
  if (billingType === 'Deal' || billingType === 'Fund') {
    customer = byTag.get(Number(customerTagId)) || null;
    if (!customer) errors.push(`A ${billingType} deal needs the billback customer it bills.`);
  }

  const rows = [];
  if (billingType === 'Allocation') {
    for (const [i, o] of owners.entries()) {
      const blank = !o.customerTagId && !o.percent && !o.start && !o.end;
      if (blank) continue;
      const n = i + 1;
      const c = byTag.get(Number(o.customerTagId));
      const pct = Number(o.percent);
      if (!c) errors.push(`Owner ${n}: choose a billback customer.`);
      if (!(pct > 0 && pct <= 100)) errors.push(`Owner ${n}: share must be more than 0% and at most 100%.`);
      if (o.start && !validDate(o.start)) errors.push(`Owner ${n}: start date isn't a date.`);
      if (o.end && !validDate(o.end)) errors.push(`Owner ${n}: end date isn't a date.`);
      if (o.start && o.end && validDate(o.start) && validDate(o.end) && o.start > o.end) errors.push(`Owner ${n}: start date is after end date.`);
      rows.push({ customer: c || null, percent: pct, start: o.start || null, end: o.end || null });
    }
    if (!rows.length) errors.push('An Allocation deal needs at least one owner.');
    // Wherever the owners change (the beginning, each start date, the day
    // after each end date), the owners in force must total 100%.
    const dayAfter = (d) => new Date(Date.parse(d) + 864e5).toISOString().slice(0, 10);
    const dated = rows.filter((r) => (!r.start || validDate(r.start)) && (!r.end || validDate(r.end)));
    const points = new Set(['', ...dated.map((r) => r.start).filter(Boolean), ...dated.map((r) => r.end).filter(Boolean).map(dayAfter)]);
    const reported = new Set();
    for (const p of [...points].sort()) {
      const active = dated.filter((r) => (p === '' ? !r.start : !r.start || r.start <= p) && (p === '' || !r.end || r.end >= p));
      if (!active.length) continue;
      const total = Math.round(active.reduce((s, r) => s + r.percent, 0) * 10000) / 10000;
      if (Math.abs(total - 100) > 1e-6 && !reported.has(`${p}:${total}`)) {
        reported.add(`${p}:${total}`);
        errors.push(`Owners total ${total}%${p ? ` from ${p}` : ''}; they must total 100%.`);
      }
    }
  }
  return { errors, setup: { billingType, customer }, owners: billingType === 'Allocation' ? rows : [] };
}
