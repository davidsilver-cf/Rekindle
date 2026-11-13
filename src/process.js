// One place that runs the engine on bills and, when allowed, writes the stamps.
import { planBills } from './engine.js';
import { buildBillUpdate } from './writer.js';
import { updateBill } from './campfire.js';
import { config, writeEnabled } from './config.js';

// lineIds (a Set of line ids) limits stamping to those lines; other lines on
// the same bill are sent back unchanged. Omit it to stamp everything pending.
export async function processBills(bills, { write = writeEnabled(), log = console.log, lineIds = null } = {}) {
  const plan = planBills(bills, config);
  const results = [];
  const chosen = lineIds ? plan.lines.filter((l) => lineIds.has(l.lineId)) : plan.lines;

  for (const bill of bills) {
    const update = buildBillUpdate(bill, chosen);
    if (!update) continue;

    if (!write) {
      results.push({ billNumber: bill.bill_number, mode: 'dry-run', changes: update.changes });
      continue;
    }
    try {
      await updateBill(update);
      results.push({ billNumber: bill.bill_number, mode: 'written', changes: update.changes });
    } catch (err) {
      results.push({ billNumber: bill.bill_number, mode: 'failed', error: err.message, changes: update.changes });
    }
  }

  for (const r of results) log(JSON.stringify({ event: 'stamp', ...r }));
  for (const l of plan.lines.filter((x) => x.exception)) {
    log(JSON.stringify({ event: 'exception', billNumber: l.billNumber, lineId: l.lineId, reason: l.exception }));
  }
  return { plan, results };
}
