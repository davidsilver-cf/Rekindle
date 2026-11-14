// Creating an invoice in Campfire, as a run of recorded steps:
//
//   1. reserve   Save the run and its bill-line shares in Rekindle's database.
//                The database refuses a share already on another invoice, so
//                two clicks (or two people) can't bill the same thing twice.
//   2. create    Create the invoice in Campfire.             → status created
//   3. pdf       Build the PDF with Campfire's invoice number and attach it.
//                                                            → pdf_attached
//   4. lines     Mark each source bill line Billed (or Allocated Pending
//                Invoice when other owners' shares are still to bill).
//                                                            → complete
//
// If step 2 fails with a clear refusal from Campfire, the shares are released
// (status failed). If its outcome is unknown (timeout, Campfire error), the run
// is held as "unknown" for a person to check in Campfire, never retried blind.
// Steps 3 and 4 can be retried as often as needed.
import { invoiceData, buildInvoicePdf, invoiceFilename } from './invoice-pdf.js';
import { buildStatusUpdate } from './writer.js';

const addDays = (iso, days) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};
export const todayET = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

const productId = (config) => Number(process.env.REKINDLE_INVOICE_PRODUCT_ID || config.invoice?.productId) || null;

// Everything needed to create one customer's invoice, or the reasons it can't be.
export function prepareInvoice({ customer, plan, config, date = todayET(), ref }) {
  const problems = [];
  const product = productId(config);
  if (!product) problems.push('No invoice product is set (REKINDLE_INVOICE_PRODUCT_ID). Choose the Campfire product whose income account is 13190 Unbilled Receivable.');
  const clientId = customer.customer.customerId;
  if (!clientId) problems.push(`"${customer.customer.name}" isn't linked to a Campfire customer. Link its Billback Customer tag to the customer in Campfire.`);

  const linesById = new Map(plan.lines.map((l) => [l.lineId, l]));
  const entities = new Set(customer.sources.map((s) => linesById.get(s.lineId)?.entityId));
  if (entities.size > 1) problems.push('These lines come from bills in more than one Campfire entity. Invoice each entity separately.');
  const entityId = [...entities][0] ?? null;

  const termsDays = Number.isInteger(config.invoice?.termsDays) ? config.invoice.termsDays : 0;
  const dueDate = addDays(date, termsDays);
  const d = invoiceData({ customer, plan, branding: config.invoice || {}, invoice: { date } });

  // One invoice line per deal per recharge category, matching the PDF.
  const lines = [];
  for (const g of d.deals) {
    for (const c of g.categories) {
      const amount = c.cents / 100;
      lines.push({
        product,
        description: d.multiDeal ? `${g.deal} — ${c.category} (reimbursable expenses)` : `${c.category} — reimbursable expenses (${g.deal})`,
        quantity: 1,
        rate: amount,
        amount,
      });
    }
  }
  const body = {
    entity: entityId,
    client: clientId,
    invoice_date: date,
    due_date: dueDate,
    ref_number: ref,
    ...(config.invoice?.message ? { message_on_invoice: config.invoice.message } : {}),
    lines,
  };

  const items = customer.sources.map((s) => {
    const l = linesById.get(s.lineId);
    return { lineId: s.lineId, billId: l.billId, customerTagId: customer.customer.billbackTagId, cents: s.cents, percent: s.percent };
  });
  // Who pays each source line, so step 4 knows when a line is fully billed.
  const lineOwners = Object.fromEntries(customer.sources.map((s) => [s.lineId, linesById.get(s.lineId).billTo.map((b) => b.customer.billbackTagId)]));
  // A snapshot for the PDF, so it can be rebuilt with the invoice number later.
  const pdfInput = {
    customer: { customer: customer.customer, cents: customer.cents, sources: customer.sources },
    plan: { lines: customer.sources.map((s) => linesById.get(s.lineId)) },
    date,
  };

  return {
    problems,
    run: {
      ref, customer_tag_id: customer.customer.billbackTagId, customer_name: customer.customer.name, client_id: clientId,
      entity_id: entityId, total_cents: customer.cents, invoice_date: date, due_date: dueDate,
      payload: { request: body, lineOwners, pdfInput },
    },
    items,
    request: body,
  };
}

const definiteRefusal = (err) => err.status >= 400 && err.status < 500 && ![408, 409, 429].includes(err.status);

// Move a run forward as far as it can go. api = { createInvoice, uploadFile, getBill, updateBill }.
export async function advanceRun(runId, { store, api, config, log = () => {} }) {
  let run = await store.getRun(runId);
  const say = (event, extra = {}) => log(JSON.stringify({ event, run: run.id, ref: run.ref, customer: run.customer_name, ...extra }));

  if (run.status === 'creating') {
    try {
      const inv = await api.createInvoice(run.payload.request);
      await store.updateRun(run.id, { status: 'created', campfire_invoice_id: inv.id, invoice_number: inv.invoice_number || String(inv.id), error: null });
      say('invoice_created', { campfireInvoiceId: inv.id, number: inv.invoice_number });
    } catch (err) {
      if (definiteRefusal(err)) {
        await store.releaseRun(run.id, `Campfire refused the invoice: ${err.message}`);
        say('invoice_refused', { error: err.message });
      } else {
        await store.updateRun(run.id, { status: 'unknown', error: `Not sure whether Campfire created the invoice (${err.message}). Check Campfire for reference ${run.ref} before doing anything else.` });
        say('invoice_unknown', { error: err.message });
      }
      return store.getRun(run.id);
    }
    run = await store.getRun(run.id);
  }

  if (run.status === 'created') {
    try {
      const { customer, plan, date } = run.payload.pdfInput;
      const pdf = buildInvoicePdf({ customer, plan, branding: config.invoice || {}, invoice: { date, number: run.invoice_number, draft: false } });
      await store.updateRun(run.id, { pdf });
      await api.uploadFile({ model: 'invoice', objectId: run.campfire_invoice_id, filename: invoiceFilename(`${run.invoice_number}-${run.customer_name}`, false), data: pdf });
      await store.updateRun(run.id, { status: 'pdf_attached', error: null });
      say('pdf_attached');
    } catch (err) {
      await store.updateRun(run.id, { error: `Invoice created, but attaching the PDF failed: ${err.message}. Retry to try again.` });
      say('pdf_failed', { error: err.message });
      return store.getRun(run.id);
    }
    run = await store.getRun(run.id);
  }

  if (run.status === 'pdf_attached') {
    try {
      const items = await store.runItems(run.id);
      const lineIds = [...new Set(items.map((i) => i.line_id))];
      const onInvoices = await store.itemsForLines(lineIds);
      const billed = config.billbackStatusTags.Billed;
      const partly = config.billbackStatusTags['Allocated Pending Invoice'];
      const statusIds = Object.values(config.billbackStatusTags);
      const byBill = new Map();
      for (const i of items) {
        const owners = run.payload.lineOwners[i.line_id] || [];
        const done = owners.every((tag) => onInvoices.some((x) => x.line_id === i.line_id && x.customer_tag_id === tag));
        if (!byBill.has(i.bill_id)) byBill.set(i.bill_id, new Map());
        byBill.get(i.bill_id).set(i.line_id, done ? billed : partly);
      }
      for (const [billId, statusByLine] of byBill) {
        const bill = await api.getBill(billId);
        const update = buildStatusUpdate(bill, statusByLine, statusIds);
        if (update) await api.updateBill(update);
      }
      await store.updateRun(run.id, { status: 'complete', error: null });
      say('lines_marked', { lines: lineIds.length });
    } catch (err) {
      await store.updateRun(run.id, { error: `Invoice created and PDF attached, but updating the bill lines failed: ${err.message}. Retry to try again.` });
      say('lines_failed', { error: err.message });
    }
  }
  return store.getRun(run.id);
}

export async function startInvoice({ customer, plan, config, store, api, user, date, log }) {
  const ref = `RK-${Date.now().toString(36).toUpperCase()}-${customer.customer.billbackTagId}`;
  const prep = prepareInvoice({ customer, plan, config, date, ref });
  if (prep.problems.length) return { ok: false, problems: prep.problems };
  const id = await store.reserveInvoice({ ...prep.run, created_by: user.email }, prep.items);
  await store.audit(user.email, 'invoice_start', { ref, customer: customer.customer.name, cents: customer.cents, lines: prep.items.map((i) => i.lineId) });
  const run = await advanceRun(id, { store, api, config, log });
  return { ok: true, run };
}
