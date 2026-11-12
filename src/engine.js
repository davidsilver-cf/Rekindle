// Rekindle engine: pure functions, no network.
// Turns Campfire bills + Rekindle config into a plan: what to stamp on each
// line, how each line is billed, and what each billback customer owes.
// Money is handled in integer cents to avoid floating-point drift.

export const BILLING_TYPES = ['Deal', 'Fund', 'Allocation', 'Expense'];

const toCents = (amount) => Math.round(Number(amount) * 100);
export const fromCents = (cents) => cents / 100;

function tagInGroup(line, groupId) {
  return (line.tags || []).find((t) => t.group === groupId && !t.is_deleted) || null;
}

// Owners of an Allocation deal on a given date: rows whose start/end cover it.
// A blank start means "from the beginning"; a blank end means "still active".
export function activeOwners(config, dealsTagId, onDate) {
  return config.allocations.filter(
    (a) =>
      a.dealsTagId === dealsTagId &&
      (!a.start || a.start <= onDate) &&
      (!a.end || a.end >= onDate),
  );
}

// Split cents across owners by percent. Each share is rounded down to the
// cent and any leftover cents go to the largest share, so the split always
// adds back to the line amount exactly.
export function splitCents(totalCents, owners) {
  const shares = owners.map((o) => ({
    owner: o,
    cents: Math.floor((totalCents * o.percent) / 100),
  }));
  const leftover = totalCents - shares.reduce((s, x) => s + x.cents, 0);
  if (shares.length && leftover !== 0) {
    const largest = shares.reduce((a, b) => (b.owner.percent > a.owner.percent ? b : a));
    largest.cents += leftover;
  }
  return shares;
}

// Plan one bill line. Returns null for lines Rekindle should not touch
// (wrong account, or not Pending).
export function planLine(bill, line, config) {
  if (line.account_number !== config.unbilledAccountNumber) return null;

  const status = tagInGroup(line, config.tagGroups.billbackStatus);
  if (!status || status.id !== config.billbackStatusTags.Pending) return null;

  const base = {
    billId: bill.id,
    billNumber: bill.bill_number,
    billDate: bill.bill_date,
    lineId: line.id,
    description: line.description,
    amountCents: toCents(line.amount),
    rechargeCategory: tagInGroup(line, config.tagGroups.rechargeCategory)?.name ?? null,
    stamps: [],
    warnings: [],
    exception: null,
    billingType: null,
    billTo: [],
  };

  const dealTag = tagInGroup(line, config.tagGroups.deals);
  if (!dealTag) return { ...base, exception: 'No Deals tag on line' };
  base.dealsTag = dealTag.name;

  const deal = config.deals.find((d) => d.dealsTagId === dealTag.id);
  if (!deal) return { ...base, exception: `Deals tag "${dealTag.name}" has no Tag Setup row` };

  // Billing type: the line's value wins; Rekindle only fills a blank.
  const lineType = line[config.billingTypeField] || null;
  const billingType = lineType || deal.billingType;
  base.billingType = billingType;
  if (!lineType) {
    base.stamps.push({ field: config.billingTypeField, value: billingType });
  } else if (lineType !== deal.billingType) {
    base.warnings.push(`Line says ${lineType}, Tag Setup says ${deal.billingType}; using the line's value`);
  }

  if (billingType === 'Expense') {
    // Not billed back; flagged for reclass.
    return base;
  }

  if (billingType === 'Deal' || billingType === 'Fund') {
    if (!deal.customer) {
      return { ...base, exception: `"${dealTag.name}" is ${billingType} but has no billback customer in Tag Setup` };
    }
    const existing = tagInGroup(line, config.tagGroups.billbackCustomer);
    if (!existing) {
      base.stamps.push({ field: 'billbackCustomerTag', value: deal.customer.name, tagId: deal.customer.billbackTagId });
    } else if (existing.id !== deal.customer.billbackTagId) {
      base.warnings.push(`Line already tagged ${existing.name}, Tag Setup says ${deal.customer.name}; using the line's tag`);
    }
    const customer = existing && existing.id !== deal.customer.billbackTagId
      ? { name: existing.name, billbackTagId: existing.id }
      : deal.customer;
    base.billTo = [{ customer, percent: 100, cents: base.amountCents }];
    return base;
  }

  if (billingType === 'Allocation') {
    const owners = activeOwners(config, dealTag.id, bill.bill_date);
    const totalPct = owners.reduce((s, o) => s + o.percent, 0);
    if (!owners.length) return { ...base, exception: `"${dealTag.name}" has no owners active on ${bill.bill_date}` };
    if (Math.abs(totalPct - 100) > 1e-9) {
      return { ...base, exception: `"${dealTag.name}" owners total ${totalPct}% on ${bill.bill_date}, not 100%` };
    }
    base.billTo = splitCents(base.amountCents, owners).map((s) => ({
      customer: s.owner.customer,
      percent: s.owner.percent,
      cents: s.cents,
    }));
    return base;
  }

  return { ...base, exception: `Unknown billing type "${billingType}"` };
}

export function planBills(bills, config) {
  const lines = [];
  for (const bill of bills) {
    for (const line of bill.lines || []) {
      const p = planLine(bill, line, config);
      if (p) lines.push(p);
    }
  }

  // What each billback customer owes, by recharge category (one invoice line each).
  const byCustomer = new Map();
  for (const l of lines) {
    if (l.exception) continue;
    for (const b of l.billTo) {
      const key = b.customer.name;
      if (!byCustomer.has(key)) byCustomer.set(key, { customer: b.customer, cents: 0, sources: [], categories: new Map() });
      const c = byCustomer.get(key);
      c.cents += b.cents;
      c.sources.push({ lineId: l.lineId, billNumber: l.billNumber, percent: b.percent, cents: b.cents });
      const cat = l.rechargeCategory || 'Uncategorized';
      c.categories.set(cat, (c.categories.get(cat) || 0) + b.cents);
    }
  }

  const pendingCents = lines.reduce((s, l) => s + l.amountCents, 0);
  const billedCents = [...byCustomer.values()].reduce((s, c) => s + c.cents, 0);
  const expenseCents = lines.filter((l) => !l.exception && l.billingType === 'Expense').reduce((s, l) => s + l.amountCents, 0);
  const exceptionCents = lines.filter((l) => l.exception).reduce((s, l) => s + l.amountCents, 0);

  return {
    lines,
    customers: [...byCustomer.values()].sort((a, b) => b.cents - a.cents),
    totals: {
      pendingCents,
      billedCents,
      expenseCents,
      exceptionCents,
      // Every pending cent must land somewhere: billed, expensed, or an exception.
      ties: pendingCents === billedCents + expenseCents + exceptionCents,
    },
  };
}
