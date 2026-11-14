// Reclass: moving Expense lines (deal costs not billed back) off the unbilled
// account with one Campfire journal entry per batch, as recorded steps:
//
//   1. reserve  Save the run and its bill lines; a line already on a reclass
//               is refused, so nothing is reclassed twice.
//   2. create   Post the journal entry in Campfire:          → created
//               Dr the Recharge Category's expense account / Cr the line's
//               unbilled account, one pair per source line, each carrying the
//               line's department, vendor and tags (Billback Status = Expensed).
//   3. lines    Mark the source bill lines Expensed.          → complete
//
// A clear refusal from Campfire at step 2 releases the lines (failed); an
// unknown outcome is held for a person to check (unknown), never retried blind.
import { buildStatusUpdate } from './writer.js';
import { todayET } from './invoicing.js';
export const todayISO = todayET;

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const money = (cents) => Math.round(cents) / 100;

// Tags for a reclass line: the bill line's own tags except its billback status
// and billback customer, plus Billback Status = Expensed.
export function reclassLineTags(sourceTags, config) {
  const skip = new Set([config.tagGroups.billbackStatus, config.tagGroups.billbackCustomer]);
  const ids = (sourceTags || []).filter((t) => !skip.has(t.group)).map((t) => t.id);
  if (config.billbackStatusTags?.Expensed) ids.push(config.billbackStatusTags.Expensed);
  return [...new Set(ids)].map((id) => ({ id }));
}

// Expense lines still waiting for a reclass.
export function waitingLines(plan, reclassed) {
  return plan.lines.filter((l) => !l.exception && l.billingType === 'Expense' && !reclassed.has(l.lineId));
}

// What can't be reclassed yet, per line.
export function lineProblem(l, accounts) {
  if (!l.rechargeCategoryId) return 'No Recharge Category tag on the line';
  if (!accounts.get(Number(l.rechargeCategoryId))) return `No expense account set for ${l.rechargeCategory} (Settings → Reclass accounts)`;
  if (!l.accountId) return "The line's account isn't known";
  return null;
}

// Build one journal entry per entity for the chosen lines.
export function prepareReclass({ lines, accounts, config, date = todayET(), ref }) {
  const problems = [];
  if (!ISO_DATE.test(date || '')) problems.push('Pick a journal entry date.');
  for (const l of lines) {
    const p = lineProblem(l, accounts);
    if (p) problems.push(`${l.billNumber} line ${l.lineId}: ${p}`);
  }
  if (!lines.length) problems.push('Select at least one line.');
  if (problems.length) return { problems, runs: [] };

  const byEntity = new Map();
  for (const l of lines) {
    const k = l.entityId ?? 'none';
    if (!byEntity.has(k)) byEntity.set(k, []);
    byEntity.get(k).push(l);
  }
  const runs = [...byEntity.entries()].map(([entity, ls], i) => {
    const runRef = byEntity.size > 1 ? `${ref}-${i + 1}` : ref;
    const transactions = [];
    for (const l of ls) {
      const tags = reclassLineTags(l.sourceTags, config);
      const what = `${l.dealsTag || 'No deal'} · ${l.rechargeCategory}: ${l.description || 'expense'} (${l.vendorName ? `${l.vendorName} ` : ''}${l.billNumber})`.slice(0, 250);
      const common = {
        ...(l.departmentId ? { department: l.departmentId } : {}),
        ...(l.vendorId ? { vendor: l.vendorId } : {}),
        tags,
        bank_description: what,
      };
      const amt = money(l.amountCents);
      transactions.push({ account: Number(accounts.get(Number(l.rechargeCategoryId)).account_id), debit_amount_native: amt, debit_amount: amt, ...common });
      transactions.push({ account: Number(l.accountId), credit_amount_native: amt, credit_amount: amt, ...common });
    }
    const total = ls.reduce((s, l) => s + l.amountCents, 0);
    const request = {
      date,
      type: 'journal_entry',
      ...(entity !== 'none' ? { entity: Number(entity) } : {}),
      memo: `Rekindle reclass ${runRef}: ${ls.length} deal expense line${ls.length === 1 ? '' : 's'} not billed back`,
      ref_number: runRef,
      transactions,
    };
    const summary = ls.map((l) => ({ lineId: l.lineId, billId: l.billId, billNumber: l.billNumber, vendorName: l.vendorName, description: l.description, deal: l.dealsTag, category: l.rechargeCategory, account: accounts.get(Number(l.rechargeCategoryId)).account_label, cents: l.amountCents }));
    return {
      run: { ref: runRef, entity_id: entity === 'none' ? null : Number(entity), je_date: date, total_cents: total, payload: { request, lines: summary } },
      items: ls.map((l) => ({ lineId: l.lineId, billId: l.billId, cents: l.amountCents })),
    };
  });
  return { problems, runs };
}

const definiteRefusal = (err) => err.status >= 400 && err.status < 500 && ![408, 409, 429].includes(err.status);

// Move a run forward as far as it can go. api = { createJournalEntry, getBill, updateBill }.
export async function advanceReclass(runId, { store, api, config, log = () => {} }) {
  let run = await store.getReclass(runId);
  const say = (event, extra = {}) => log(JSON.stringify({ event, reclass: run.id, ref: run.ref, ...extra }));

  if (run.status === 'creating') {
    try {
      const je = await api.createJournalEntry(run.payload.request);
      await store.updateReclass(run.id, { status: 'created', campfire_je_id: je.id, je_number: je.order ? String(je.order) : String(je.id), error: null });
      say('reclass_created', { campfireJeId: je.id, order: je.order });
    } catch (err) {
      if (definiteRefusal(err)) {
        await store.releaseReclass(run.id, `Campfire refused the journal entry: ${err.message}`);
        say('reclass_refused', { error: err.message });
      } else {
        await store.updateReclass(run.id, { status: 'unknown', error: `Not sure whether Campfire created the journal entry (${err.message}). Check Campfire for reference ${run.ref} before doing anything else.` });
        say('reclass_unknown', { error: err.message });
      }
      return store.getReclass(run.id);
    }
    run = await store.getReclass(run.id);
  }

  if (run.status === 'created') {
    try {
      const items = await store.reclassRunItems(run.id);
      const expensed = config.billbackStatusTags.Expensed;
      const statusIds = Object.values(config.billbackStatusTags);
      const byBill = new Map();
      for (const i of items) {
        if (!byBill.has(i.bill_id)) byBill.set(i.bill_id, new Map());
        byBill.get(i.bill_id).set(i.line_id, expensed);
      }
      for (const [billId, statusByLine] of byBill) {
        const bill = await api.getBill(billId);
        const update = buildStatusUpdate(bill, statusByLine, statusIds);
        if (update) await api.updateBill(update);
      }
      await store.updateReclass(run.id, { status: 'complete', error: null });
      say('reclass_lines_marked', { lines: items.length });
    } catch (err) {
      await store.updateReclass(run.id, { error: `Journal entry posted, but marking the bill lines Expensed failed: ${err.message}. Retry to try again.` });
      say('reclass_lines_failed', { error: err.message });
    }
  }
  return store.getReclass(run.id);
}

export async function startReclass({ lines, accounts, config, store, api, user, date, log }) {
  const ref = `RK-RC-${Date.now().toString(36).toUpperCase()}`;
  const prep = prepareReclass({ lines, accounts, config, date, ref });
  if (prep.problems.length) return { ok: false, problems: prep.problems, runs: [] };
  const runs = [];
  for (const r of prep.runs) {
    const id = await store.reserveReclass({ ...r.run, created_by: user.email }, r.items);
    await store.audit(user.email, 'reclass_start', { ref: r.run.ref, cents: r.run.total_cents, lines: r.items.map((i) => i.lineId) });
    runs.push(await advanceReclass(id, { store, api, config, log }));
  }
  return { ok: true, runs };
}
