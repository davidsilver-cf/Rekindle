import { fromCents } from './engine.js';

const usd = (cents) =>
  fromCents(cents).toLocaleString('en-US', { style: 'currency', currency: 'USD' });

export function formatPlan(plan) {
  const out = [];
  out.push('REKINDLE DRY RUN: nothing is written to Campfire', '');

  out.push('Pending lines');
  for (const l of plan.lines) {
    const head = `  ${l.billNumber} · line ${l.lineId} · ${l.dealsTag ?? '(no deal)'} · ${usd(l.amountCents)}`;
    if (l.exception) {
      out.push(`${head}`, `      EXCEPTION: ${l.exception}`);
      continue;
    }
    out.push(`${head} · ${l.billingType}`);
    for (const s of l.stamps) {
      out.push(`      would stamp ${s.field === 'billbackCustomerTag' ? 'Billback Customer' : 'Billing Type'} = ${s.value}`);
    }
    if (!l.stamps.length) out.push('      nothing to stamp');
    for (const w of l.warnings) out.push(`      note: ${w}`);
    for (const b of l.billTo) {
      out.push(`      → ${b.customer.name}${b.percent < 100 ? ` (${b.percent}%)` : ''} ${usd(b.cents)}`);
    }
    if (l.billingType === 'Expense') out.push('      → not billed back; flagged for reclass');
  }

  out.push('', 'Amount owed by billback customer');
  for (const c of plan.customers) {
    out.push(`  ${c.customer.name.padEnd(28)} ${usd(c.cents).padStart(14)}`);
  }

  const t = plan.totals;
  out.push(
    '',
    `Pending ${usd(t.pendingCents)} = billed ${usd(t.billedCents)} + expense ${usd(t.expenseCents)} + exceptions ${usd(t.exceptionCents)}`,
    t.ties ? 'Totals tie ✓' : 'TOTALS DO NOT TIE ✗',
  );
  return out.join('\n');
}
