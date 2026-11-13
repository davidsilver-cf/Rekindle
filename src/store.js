// Where Rekindle keeps what Campfire doesn't: approvers, approvals, audit log.
// Postgres when DATABASE_URL is set (Render), otherwise in memory (demo and
// tests; everything is lost on restart, and the screens say so).
import { readFile } from 'node:fs/promises';

export const SQL = {
  approvers: 'SELECT deals_tag_id, approver_email FROM deal_settings WHERE approver_email IS NOT NULL',
  setApprover: `INSERT INTO deal_settings (deals_tag_id, approver_email, updated_by, updated_at)
VALUES ($1, $2, $3, now())
ON CONFLICT (deals_tag_id) DO UPDATE SET approver_email = EXCLUDED.approver_email, updated_by = EXCLUDED.updated_by, updated_at = now()`,
  latest: `SELECT DISTINCT ON (deals_tag_id) deals_tag_id, fingerprint, decision, actor_email, note, amount_cents, created_at
FROM approvals ORDER BY deals_tag_id, created_at DESC, id DESC`,
  record: `INSERT INTO approvals (deals_tag_id, fingerprint, decision, actor_email, note, amount_cents, line_ids)
VALUES ($1, $2, $3, $4, $5, $6, $7)`,
  audit: 'INSERT INTO audit_log (actor_email, action, detail) VALUES ($1, $2, $3)',
  recentAudit: 'SELECT at, actor_email, action, detail FROM audit_log ORDER BY at DESC, id DESC LIMIT $1',
};

export function memoryStore() {
  const approvers = new Map();
  const decisions = [];
  const log = [];
  let seq = 0;
  return {
    kind: 'memory',
    async init() {},
    async getApprovers() { return new Map(approvers); },
    async setApprover(dealsTagId, email, actor) {
      if (email) approvers.set(dealsTagId, email); else approvers.delete(dealsTagId);
      log.push({ at: new Date(), actor_email: actor, action: 'set_approver', detail: { dealsTagId, email } });
    },
    async latestDecisions() {
      const out = new Map();
      for (const d of decisions) {
        const cur = out.get(d.deals_tag_id);
        if (!cur || d.seq > cur.seq) out.set(d.deals_tag_id, d);
      }
      return out;
    },
    async recordDecision(d) {
      decisions.push({ ...d, deals_tag_id: d.dealsTagId, actor_email: d.actorEmail, amount_cents: d.amountCents, created_at: new Date(), seq: ++seq });
    },
    async audit(actor, action, detail = {}) { log.push({ at: new Date(), actor_email: actor, action, detail }); },
    async recentAudit(limit = 50) { return log.slice(-limit).reverse(); },
  };
}

export async function postgresStore(connectionString) {
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({
    connectionString,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    max: 5,
  });
  const q = (text, params) => pool.query(text, params);
  return {
    kind: 'postgres',
    async init() {
      await q(await readFile(new URL('./schema.sql', import.meta.url), 'utf8'));
    },
    async getApprovers() {
      const { rows } = await q(SQL.approvers);
      return new Map(rows.map((r) => [Number(r.deals_tag_id), r.approver_email]));
    },
    async setApprover(dealsTagId, email, actor) {
      await q(SQL.setApprover, [dealsTagId, email || null, actor]);
      await q(SQL.audit, [actor, 'set_approver', JSON.stringify({ dealsTagId, email: email || null })]);
    },
    async latestDecisions() {
      const { rows } = await q(SQL.latest);
      return new Map(rows.map((r) => [Number(r.deals_tag_id), { ...r, deals_tag_id: Number(r.deals_tag_id), amount_cents: Number(r.amount_cents) }]));
    },
    async recordDecision(d) {
      await q(SQL.record, [d.dealsTagId, d.fingerprint, d.decision, d.actorEmail, d.note || null, d.amountCents, d.lineIds]);
    },
    async audit(actor, action, detail = {}) {
      await q(SQL.audit, [actor, action, JSON.stringify(detail)]);
    },
    async recentAudit(limit = 50) {
      const { rows } = await q(SQL.recentAudit, [limit]);
      return rows;
    },
  };
}

let current;
export async function getStore() {
  if (!current) {
    current = process.env.DATABASE_URL ? await postgresStore(process.env.DATABASE_URL) : memoryStore();
    await current.init();
  }
  return current;
}
