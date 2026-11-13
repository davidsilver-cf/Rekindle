// Turns a line plan's stamps into a Campfire bill update.
// Campfire's PUT replaces all of a bill's lines, so the payload carries every
// line with its existing values, and changes only the stamped ones.

const WRITABLE = [
  'id', 'account', 'amount', 'tax', 'tax_rate', 'bill_customer', 'department',
  'description', 'tax_description', 'source', 'source_id', 'currency',
];

function lineForUpdate(line) {
  const out = {};
  for (const k of WRITABLE) if (k in line) out[k] = line[k];
  // Keep every custom field the line already has.
  for (const [k, v] of Object.entries(line)) if (k.startsWith('custom_field_')) out[k] = v;
  out.tags = (line.tags || []).filter((t) => !t.is_deleted).map((t) => ({ id: t.id }));
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

  return { billId: bill.id, billNumber: bill.bill_number, lines, changes };
}
