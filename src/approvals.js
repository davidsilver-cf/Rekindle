// Per-deal approval: group the run's lines by deal, fingerprint each group,
// and match it against the latest decision so a change after approval
// (new line, new amount, new split) sends the deal back to Waiting.
import { createHash } from 'node:crypto';
import { isAdmin } from './session.js';

// What was approved for one line: its amount and who pays what. Invoicing
// doesn't change it, so a line stays approved while its shares are billed.
export function linePrint(l) {
  const raw = `${l.amountCents}:${l.billTo.map((b) => `${b.customer.billbackTagId ?? b.customer.name}=${b.cents}`).join('|')}`;
  return createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

export function dealGroups(plan, config) {
  const groups = new Map();
  for (const l of plan.lines) {
    if (l.exception || l.billingType === 'Expense') continue;
    const deal = config.deals.find((d) => d.dealsTag === l.dealsTag);
    if (!deal) continue;
    if (!groups.has(deal.dealsTagId)) groups.set(deal.dealsTagId, { deal, lines: [], cents: 0 });
    const g = groups.get(deal.dealsTagId);
    g.lines.push(l);
    g.cents += l.amountCents;
  }
  for (const g of groups.values()) {
    g.linePrints = Object.fromEntries(g.lines.map((l) => [l.lineId, linePrint(l)]));
    const parts = Object.entries(g.linePrints).map(([id, p]) => `${id}:${p}`).sort();
    g.fingerprint = createHash('sha256').update(parts.join('\n')).digest('hex').slice(0, 32);
  }
  return [...groups.values()].sort((a, b) => b.cents - a.cents);
}

// status: waiting | approved | sent_back | changed
export function withStatus(groups, approvers, decisions) {
  return groups.map((g) => {
    const approver = approvers.get(g.deal.dealsTagId) || null;
    const d = decisions.get(g.deal.dealsTagId);
    let status = 'waiting';
    // A deal stays approved as long as every line still open was approved
    // exactly as it is now. Lines dropping off (fully invoiced) don't undo it;
    // a new line, a new amount or a new split does.
    const coversNow = (prints) => prints && g.lines.every((l) => prints[l.lineId] === g.linePrints[l.lineId]);
    if (d && (d.fingerprint === g.fingerprint || (d.decision === 'approved' && coversNow(d.line_prints)))) status = d.decision;
    else if (d && d.decision === 'approved') status = 'changed';
    return { ...g, approver, decision: d || null, status };
  });
}

// The deal's approver decides; with no approver set, an admin can.
export function canDecide(user, group) {
  if (!user) return false;
  if (group.approver) return String(user.email).toLowerCase() === group.approver.toLowerCase();
  return isAdmin(user);
}

export const runReady = (groups) => groups.length > 0 && groups.every((g) => g.status === 'approved');

// A customer can be invoiced when every line feeding its invoice belongs to
// an approved deal.
export function customerReady(customer, plan, groups) {
  const byLine = new Map();
  for (const g of groups) for (const l of g.lines) byLine.set(l.lineId, g);
  const waiting = new Set();
  for (const s of customer.sources) {
    const g = byLine.get(s.lineId);
    if (!g || g.status !== 'approved') waiting.add(g ? g.deal.dealsTag : `line ${s.lineId}`);
  }
  return { ready: waiting.size === 0, waitingOn: [...waiting].sort() };
}
