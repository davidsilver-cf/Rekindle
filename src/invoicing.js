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

// Tags for an invoice line: everything on the source bill line (Deals, Class,
// Recharge Category, ...) except its billback status and billback customer,
// plus the customer this share is billed to and Billback Status = Billed.
export function invoiceLineTags(sourceTags, customerTagId, config) {
  const skip = new Set([config.tagGroups.billbackStatus, config.tagGroups.billbackCustomer]);
  const ids = (sourceTags || []).filter((t) => !skip.has(t.group)).map((t) => t.id);
  if (customerTagId) ids.push(customerTagId);
  if (config.billbackStatusTags?.Billed) ids.push(config.billbackStatusTags.Billed);
  return [...new Set(ids)];
}

const productId = (config) => Number(process.env.REKINDLE_INVOICE_PRODUCT_ID || config.invoice?.productId) || null;

// Everything needed to create one customer's invoice, or the reasons it can't be.
export function prepareInvoice({ customer, plan, config, date = todayET(), ref }) {
  const problems = [];
  const product = productId(config);
  if (!product) problems.push('No invoice product is set (REKINDLE_INVOICE_PRODUCT_ID). Use the number of the Campfire product whose Invoice Credit Account is 13190 Unbilled Receivable.');
  const clientId = customer.customer.customerId;
  if (!clientId) problems.push(`"${customer.customer.name}" isn't linked to a Campfire customer. Link its Billback Customer tag to the customer in Campfire.`);

  const linesById = new Map(plan.lines.map((l) => [l.lineId, l]));
  const entities = new Set(customer.sources.map((s) => linesById.get(s.lineId)?.entityId));
  if (entities.size > 1) problems.push('These lines come from bills in more than one Campfire entity. Invoice each entity separately.');
  const entityId = [...entities][0] ?? null;

  const termsDays = Number.isInteger(config.invoice?.termsDays) ? config.invoice.termsDays : 0;
  const dueDate = addDays(date, termsDays);
  const d = invoiceData({ customer, plan, branding: config.invoice || {}, invoice: { date } });

  // One Campfire invoice line per source bill line (or per share of a split
  // line), so the transaction in Campfire keeps every expense. The PDF
  // summarises them: one line per deal per category on the invoice page, each
  // source line in the supporting detail. Same order as the PDF detail.
  const lines = [];
  const lineSources = []; // source bill line id behind each invoice line, in order
  for (const g of d.deals) {
    for (const c of g.categories) {
      for (const src of c.sources) {
        const l = src.line;
        const share = src.percent < 100 ? `, ${src.percent}% share of ${(l.amountCents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })}` : '';
        const amount = src.cents / 100;
        lines.push({
          product,
          description: `${g.deal} — ${c.category}: ${l.description || 'expense'} (${l.vendorName ? `${l.vendorName} ` : ''}${l.billNumber}${share})`.slice(0, 1000),
          service_date: l.billDate || undefined,
          quantity: 1,
          rate: amount,
          amount,
          ...(l.departmentId ? { department: l.departmentId } : {}),
          tags: invoiceLineTags(l.sourceTags, customer.customer.billbackTagId, config).map((id) => ({ id })),
        });
        lineSources.push(src.lineId);
      }
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
      payload: { request: body, lineOwners, pdfInput, lineSources },
    },
    items,
    request: body,
  };
}

// Make sure each Campfire invoice line carries the tags and department it was
// sent with. If Campfire dropped them on create, set them on the existing
// lines. Returns a note for the run when they still didn't stick, else null.
export const TAG_NOTE = 'Tags:';
const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
const lineTagIds = (line) => (line.tag_ids || (line.tags || []).map((t) => t.id) || []).map(Number);

const LINE_FIELDS = ['id', 'product', 'description', 'quantity', 'rate', 'amount', 'service_date', 'department', 'tax', 'tax_rate'];
const idOf = (v) => (v && typeof v === 'object' ? v.id : v);
export function invoiceLineForUpdate(line) {
  const out = {};
  for (const k of LINE_FIELDS) if (line[k] !== undefined && line[k] !== null) out[k] = ['product', 'department', 'tax_rate'].includes(k) ? idOf(line[k]) : line[k];
  return out;
}

export async function ensureLineTags(run, invoice, { api, say = () => {} }) {
  const wanted = run.payload?.request?.lines || [];
  if (!api.updateInvoice || !invoice?.lines?.length || invoice.lines.length !== wanted.length) return null;
  const missing = (inv) => inv.lines.some((l, i) => !sameSet(lineTagIds(l), wanted[i].tags.map((t) => t.id))
    || (wanted[i].department && Number(l.department) !== Number(wanted[i].department)));
  if (!missing(invoice)) return null;
  try {
    // Campfire replaces every line on update, so each line goes back whole,
    // with only its tags and department changed.
    const lines = invoice.lines.map((l, i) => ({
      ...invoiceLineForUpdate(l),
      tags: wanted[i].tags,
      ...(wanted[i].department ? { department: wanted[i].department } : {}),
    }));
    await api.updateInvoice(invoice, lines);
    const after = api.getInvoice ? await api.getInvoice(invoice.id) : null;
    if (after && missing(after)) {
      say('invoice_tags_not_kept');
      return `${TAG_NOTE} Campfire didn't keep the tags or department on this invoice's lines. Add them in Campfire, or ask Campfire support whether invoice line tags can be set through the API.`;
    }
    say('invoice_tags_set');
    return null;
  } catch (err) {
    say('invoice_tags_failed', { error: err.message });
    return `${TAG_NOTE} setting the invoice line tags failed: ${err.message}. Use Re-apply tags to try again.`;
  }
}

// Re-apply tags to an invoice Rekindle already created (e.g. one made before
// tags were sent), from the source bill lines as they are now.
export async function retagRun(runId, { store, api, config, log = () => {} }) {
  const run = await store.getRun(runId);
  if (!run?.campfire_invoice_id) throw new Error('This run has no Campfire invoice.');
  const say = (event, extra = {}) => log(JSON.stringify({ event, run: run.id, ref: run.ref, ...extra }));
  const invoice = await api.getInvoice(run.campfire_invoice_id);
  // Which source line is behind each invoice line: saved with newer runs;
  // for older ones, the same order the PDF detail uses.
  let order = run.payload?.lineSources;
  if (!order) {
    const { customer, plan } = run.payload.pdfInput;
    order = invoiceData({ customer, plan, branding: {}, invoice: {} }).deals
      .flatMap((g) => g.categories.flatMap((c) => c.sources.map((x) => x.lineId)));
  }
  const items = await store.runItems(run.id);
  const bills = new Map();
  for (const billId of new Set(items.map((i) => i.bill_id))) bills.set(billId, await api.getBill(billId));
  const billLine = (id) => [...bills.values()].flatMap((b) => b.lines).find((l) => l.id === id);
  const wanted = order.map((lineId) => {
    const l = billLine(lineId);
    const tags = invoiceLineTags((l?.tags || []).filter((t) => !t.is_deleted).map((t) => ({ id: t.id, group: t.group })), run.customer_tag_id, config);
    return { tags: tags.map((id) => ({ id })), ...(l?.department ? { department: l.department } : {}) };
  });
  const note = invoice.lines?.length !== wanted.length
    ? `${TAG_NOTE} the Campfire invoice has ${invoice.lines?.length || 0} lines but Rekindle expected ${wanted.length}, so they weren't changed. Set them in Campfire.`
    : await ensureLineTags({ ...run, payload: { ...run.payload, request: { lines: wanted } } }, invoice, { api, say });
  const keep = run.error && !run.error.startsWith(TAG_NOTE) ? run.error : null;
  await store.updateRun(run.id, { error: note || keep });
  return note;
}

const tagNoteOf = (run) => (run.error?.startsWith(TAG_NOTE) ? run.error : null);

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
      run = await store.getRun(run.id);
      const tagNote = await ensureLineTags(run, inv, { api, say });
      if (tagNote) await store.updateRun(run.id, { error: tagNote });
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
      await store.updateRun(run.id, { status: 'pdf_attached', error: tagNoteOf(run) });
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
      await store.updateRun(run.id, { status: 'complete', error: tagNoteOf(run) });
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
