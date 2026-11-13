// Per-deal approval: group the run's lines by deal, fingerprint each group,
// and match it against the latest decision so a change after approval
// (new line, new amount, new split) sends the deal back to Waiting.
import { createHash } from 'node:crypto';
import { isAdmin } from './session.js';

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
    const parts = g.lines
      .map((l) => `${l.lineId}:${l.amountCents}:${l.billTo.map((b) => `${b.customer.name}=${b.cents}`).join('|')}`)
      .sort();
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
    if (d && d.fingerprint === g.fingerprint) status = d.decision;
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
