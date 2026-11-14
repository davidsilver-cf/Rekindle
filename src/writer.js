// Turns a line plan's stamps into a Campfire bill update.
// Campfire's PUT replaces all of a bill's lines, so the payload carries every
// line with its existing values, and changes only the stamped ones.

const WRITABLE = [
  'id', 'account', 'amount', 'tax', 'tax_rate', 'bill_customer', 'department',
  'description', 'tax_description', 'source', 'source_id', 'currency',
];

export function lineForUpdate(line) {
  const out = {};
  for (const k of WRITABLE) if (k in line) out[k] = line[k];
  // Keep every custom field the line already has.
  for (const [k, v] of Object.entries(line)) if (k.startsWith('custom_field_')) out[k] = v;
  out.tags = (line.tags || []).filter((t) => !t.is_deleted).map((t) => ({ id: t.id }));
  return out;
}

// Header fields sent back unchanged when Campfire needs a full PUT.
// Only fields the bill actually has are copied.
const HEADER = [
  'bill_number', 'bill_date', 'due_date', 'item_date', 'entity', 'vendor',
  'payment_term', 'ap_account', 'currency', 'exchange_rate', 'message_on_bill',
  'mailing_address', 'terms', 'tax_rate', 'tax_behavior', 'bill_type',
  'source', 'source_id', 'posts_opening_balance_offset',
];

export function headerForUpdate(bill) {
  const out = {};
  for (const k of HEADER) if (k in bill) out[k] = bill[k];
  for (const [k, v] of Object.entries(bill)) if (k.startsWith('custom_field_')) out[k] = v;
  return out;
}

// Returns null when nothing on this bill needs stamping.
export function buildBillUpdate(bill, linePlans) {
  const stampsByLine = new Map(
    linePlans
      .filter((p) => p.billId === bill.id && !p.exception && p.stamps.length)
      .map((p) => [p.lineId, p.stamps]),
  );
  if (!stampsByLine.size) return null;

  const changes = [];
  const lines = bill.lines.map((line) => {
    const out = lineForUpdate(line);
    for (const s of stampsByLine.get(line.id) || []) {
      if (s.field === 'billbackCustomerTag') {
        if (!out.tags.some((t) => t.id === s.tagId)) out.tags.push({ id: s.tagId });
      } else {
        out[s.field] = s.value;
      }
      changes.push({ lineId: line.id, ...s });
    }
    return out;
  });

  return { billId: bill.id, billNumber: bill.bill_number, header: headerForUpdate(bill), lines, changes };
}

// Set the Billback Status tag on some lines of a bill (replacing whatever
// status tag they have). statusByLine: Map lineId -> status tag id.
export function buildStatusUpdate(bill, statusByLine, statusTagIds) {
  const statusIds = new Set(statusTagIds);
  const changes = [];
  const lines = bill.lines.map((line) => {
    const out = lineForUpdate(line);
    const want = statusByLine.get(line.id);
    if (want) {
      const before = out.tags.find((t) => statusIds.has(t.id));
      if (!before || before.id !== want) {
        out.tags = out.tags.filter((t) => !statusIds.has(t.id)).concat({ id: want });
        changes.push({ lineId: line.id, from: before?.id ?? null, to: want });
      }
    }
    return out;
  });
  return changes.length ? { billId: bill.id, billNumber: bill.bill_number, header: headerForUpdate(bill), lines, changes } : null;
}
