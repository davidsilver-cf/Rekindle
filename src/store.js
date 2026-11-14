// Where Rekindle keeps what Campfire doesn't: approvers, approvals, audit log.
// Postgres when DATABASE_URL is set (Render), otherwise in memory (demo and
// tests; everything is lost on restart, and the screens say so).
import { readFile } from 'node:fs/promises';

export const SQL = {
  approvers: 'SELECT deals_tag_id, approver_email FROM deal_settings WHERE approver_email IS NOT NULL',
  setApprover: `INSERT INTO deal_settings (deals_tag_id, approver_email, updated_by, updated_at)
VALUES ($1, $2, $3, now())
ON CONFLICT (deals_tag_id) DO UPDATE SET approver_email = EXCLUDED.approver_email, updated_by = EXCLUDED.updated_by, updated_at = now()`,
  latest: `SELECT DISTINCT ON (deals_tag_id) deals_tag_id, fingerprint, decision, actor_email, note, amount_cents, line_prints, created_at
FROM approvals ORDER BY deals_tag_id, created_at DESC, id DESC`,
  record: `INSERT INTO approvals (deals_tag_id, fingerprint, decision, actor_email, note, amount_cents, line_ids, line_prints)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
  audit: 'INSERT INTO audit_log (actor_email, action, detail) VALUES ($1, $2, $3)',
  recentAudit: 'SELECT at, actor_email, action, detail FROM audit_log ORDER BY at DESC, id DESC LIMIT $1',
  setups: 'SELECT deals_tag_id, billing_type, customer FROM deal_settings WHERE billing_type IS NOT NULL',
  setSetup: `INSERT INTO deal_settings (deals_tag_id, deals_tag_name, billing_type, customer, updated_by, updated_at)
VALUES ($1, $2, $3, $4, $5, now())
ON CONFLICT (deals_tag_id) DO UPDATE SET deals_tag_name = EXCLUDED.deals_tag_name, billing_type = EXCLUDED.billing_type,
  customer = EXCLUDED.customer, updated_by = EXCLUDED.updated_by, updated_at = now()`,
  owners: `SELECT deals_tag_id, customer, percent, to_char(start_date, 'YYYY-MM-DD') AS start_date, to_char(end_date, 'YYYY-MM-DD') AS end_date
FROM allocation_owners ORDER BY deals_tag_id, start_date NULLS FIRST, percent DESC, id`,
  deleteOwners: 'DELETE FROM allocation_owners WHERE deals_tag_id = $1',
  insertOwner: `INSERT INTO allocation_owners (deals_tag_id, customer, percent, start_date, end_date, updated_by)
VALUES ($1, $2, $3, $4, $5, $6)`,
  shares: 'SELECT line_id, customer_tag_id FROM invoice_items',
  insertRun: `INSERT INTO invoice_runs (ref, customer_tag_id, customer_name, client_id, entity_id, total_cents, invoice_date, due_date, status, payload, created_by)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'creating', $9, $10) RETURNING id`,
  insertItem: `INSERT INTO invoice_items (run_id, line_id, bill_id, customer_tag_id, cents, percent) VALUES ($1, $2, $3, $4, $5, $6)`,
  runs: `SELECT id, ref, customer_tag_id, customer_name, client_id, entity_id, total_cents, to_char(invoice_date, 'YYYY-MM-DD') AS invoice_date,
  to_char(due_date, 'YYYY-MM-DD') AS due_date, status, campfire_invoice_id, invoice_number, error, (pdf IS NOT NULL) AS has_pdf, created_by, created_at, updated_at
FROM invoice_runs ORDER BY created_at DESC, id DESC LIMIT $1`,
  run: `SELECT id, ref, customer_tag_id, customer_name, client_id, entity_id, total_cents, to_char(invoice_date, 'YYYY-MM-DD') AS invoice_date,
  to_char(due_date, 'YYYY-MM-DD') AS due_date, status, campfire_invoice_id, invoice_number, error, pdf, payload, created_by, created_at, updated_at
FROM invoice_runs WHERE id = $1`,
  runItems: 'SELECT line_id, bill_id, customer_tag_id, cents, percent FROM invoice_items WHERE run_id = $1 ORDER BY id',
  itemsForLines: 'SELECT line_id, customer_tag_id FROM invoice_items WHERE line_id = ANY($1::bigint[])',
  releaseItems: 'DELETE FROM invoice_items WHERE run_id = $1',
  connection: `SELECT access_token, refresh_token, token_type, expires_at, scope, workspace, connected_by, connected_at, updated_at FROM campfire_connection WHERE id = 1`,
  saveConnection: `INSERT INTO campfire_connection (id, access_token, refresh_token, token_type, expires_at, scope, workspace, connected_by, connected_at, updated_at)
VALUES (1, $1, $2, $3, $4, $5, $6, $7, now(), now())
ON CONFLICT (id) DO UPDATE SET access_token = EXCLUDED.access_token, refresh_token = EXCLUDED.refresh_token, token_type = EXCLUDED.token_type,
  expires_at = EXCLUDED.expires_at, scope = EXCLUDED.scope, workspace = EXCLUDED.workspace, updated_at = now(),
  connected_by = CASE WHEN $8 THEN EXCLUDED.connected_by ELSE campfire_connection.connected_by END,
  connected_at = CASE WHEN $8 THEN now() ELSE campfire_connection.connected_at END`,
  deleteConnection: 'DELETE FROM campfire_connection WHERE id = 1',
};

export class ShareTakenError extends Error {}

// Fields a run update may set.
const RUN_FIELDS = ['status', 'campfire_invoice_id', 'invoice_number', 'error', 'pdf'];

export function memoryStore() {
  const approvers = new Map();
  const decisions = [];
  const log = [];
  const setups = new Map();
  const owners = [];
  const runs = [];
  const items = [];
  let seq = 0;
  let runSeq = 0;
  let connection = null;
  return {
    kind: 'memory',
    async init() {},
    async getConnection() { return connection && { ...connection }; },
    // fresh = a new connection (sets who connected and when); otherwise a token refresh.
    async saveConnection(c, { fresh = false } = {}) {
      const now = new Date().toISOString();
      connection = { ...c, connected_by: fresh || !connection ? c.connected_by : connection.connected_by, connected_at: fresh || !connection ? now : connection.connected_at, updated_at: now };
    },
    async deleteConnection() { connection = null; },
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
      decisions.push({ ...d, deals_tag_id: d.dealsTagId, actor_email: d.actorEmail, amount_cents: d.amountCents, line_prints: d.linePrints || null, created_at: new Date(), seq: ++seq });
    },
    async audit(actor, action, detail = {}) { log.push({ at: new Date(), actor_email: actor, action, detail }); },
    async recentAudit(limit = 50) { return log.slice(-limit).reverse(); },
    async getSetups() { return new Map([...setups].map(([k, v]) => [k, { ...v }])); },
    async getOwners() { return owners.map((o) => ({ ...o })); },
    async saveDealSetup(dealsTagId, name, setup, ownerRows, actor) {
      setups.set(dealsTagId, { billingType: setup.billingType, customer: setup.customer });
      for (let i = owners.length - 1; i >= 0; i--) if (owners[i].dealsTagId === dealsTagId) owners.splice(i, 1);
      for (const o of ownerRows) owners.push({ dealsTagId, ...o });
      log.push({ at: new Date(), actor_email: actor, action: 'set_deal_setup', detail: { dealsTagId, name, ...setup, owners: ownerRows } });
    },
    async invoicedShares() { return new Set(items.map((i) => `${i.line_id}:${i.customer_tag_id}`)); },
    async reserveInvoice(run, runItems) {
      const taken = runItems.find((i) => items.some((x) => x.line_id === i.lineId && x.customer_tag_id === i.customerTagId));
      if (taken) throw new ShareTakenError(`Line ${taken.lineId} is already on another invoice for this customer.`);
      const id = ++runSeq;
      runs.push({ id, ...run, status: 'creating', campfire_invoice_id: null, invoice_number: null, error: null, pdf: null, created_at: new Date(), updated_at: new Date() });
      for (const i of runItems) items.push({ run_id: id, line_id: i.lineId, bill_id: i.billId, customer_tag_id: i.customerTagId, cents: i.cents, percent: i.percent });
      return id;
    },
    async updateRun(id, fields) {
      const r = runs.find((x) => x.id === id);
      for (const k of RUN_FIELDS) if (k in fields) r[k] = fields[k];
      r.updated_at = new Date();
    },
    async releaseRun(id, error) {
      await this.updateRun(id, { status: 'failed', error });
      for (let i = items.length - 1; i >= 0; i--) if (items[i].run_id === id) items.splice(i, 1);
    },
    async listRuns(limit = 50) {
      return runs.slice().reverse().slice(0, limit).map(({ pdf, payload, ...r }) => ({ ...r, has_pdf: Boolean(pdf) }));
    },
    async getRun(id) { const r = runs.find((x) => x.id === Number(id)); return r ? { ...r } : null; },
    async runItems(id) { return items.filter((i) => i.run_id === Number(id)).map((i) => ({ ...i })); },
    async itemsForLines(lineIds) {
      const want = new Set(lineIds);
      return items.filter((i) => want.has(i.line_id)).map((i) => ({ line_id: i.line_id, customer_tag_id: i.customer_tag_id }));
    },
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
    async getConnection() {
      const { rows } = await q(SQL.connection);
      return rows[0] || null;
    },
    async saveConnection(c, { fresh = false } = {}) {
      await q(SQL.saveConnection, [c.access_token, c.refresh_token, c.token_type, c.expires_at, c.scope, c.workspace == null ? null : JSON.stringify(c.workspace), c.connected_by || 'unknown', fresh]);
    },
    async deleteConnection() { await q(SQL.deleteConnection); },
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
      await q(SQL.record, [d.dealsTagId, d.fingerprint, d.decision, d.actorEmail, d.note || null, d.amountCents, d.lineIds, JSON.stringify(d.linePrints || {})]);
    },
    async audit(actor, action, detail = {}) {
      await q(SQL.audit, [actor, action, JSON.stringify(detail)]);
    },
    async recentAudit(limit = 50) {
      const { rows } = await q(SQL.recentAudit, [limit]);
      return rows;
    },
    async getSetups() {
      const { rows } = await q(SQL.setups);
      return new Map(rows.map((r) => [Number(r.deals_tag_id), { billingType: r.billing_type, customer: r.customer }]));
    },
    async getOwners() {
      const { rows } = await q(SQL.owners);
      return rows.map((r) => ({ dealsTagId: Number(r.deals_tag_id), customer: r.customer, percent: Number(r.percent), start: r.start_date, end: r.end_date }));
    },
    async saveDealSetup(dealsTagId, name, setup, ownerRows, actor) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(SQL.setSetup, [dealsTagId, name, setup.billingType, setup.customer ? JSON.stringify(setup.customer) : null, actor]);
        await client.query(SQL.deleteOwners, [dealsTagId]);
        for (const o of ownerRows) {
          await client.query(SQL.insertOwner, [dealsTagId, JSON.stringify(o.customer), o.percent, o.start, o.end, actor]);
        }
        await client.query(SQL.audit, [actor, 'set_deal_setup', JSON.stringify({ dealsTagId, name, ...setup, owners: ownerRows })]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },
    async invoicedShares() {
      const { rows } = await q(SQL.shares);
      return new Set(rows.map((r) => `${r.line_id}:${r.customer_tag_id}`));
    },
    async reserveInvoice(run, runItems) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows } = await client.query(SQL.insertRun, [run.ref, run.customer_tag_id, run.customer_name, run.client_id, run.entity_id,
          run.total_cents, run.invoice_date, run.due_date, JSON.stringify(run.payload || null), run.created_by]);
        const id = Number(rows[0].id);
        for (const i of runItems) await client.query(SQL.insertItem, [id, i.lineId, i.billId, i.customerTagId, i.cents, i.percent]);
        await client.query('COMMIT');
        return id;
      } catch (err) {
        await client.query('ROLLBACK');
        if (err.code === '23505') throw new ShareTakenError('One of these lines is already on another invoice for this customer.');
        throw err;
      } finally {
        client.release();
      }
    },
    async updateRun(id, fields) {
      const keys = RUN_FIELDS.filter((k) => k in fields);
      if (!keys.length) return;
      const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
      await q(`UPDATE invoice_runs SET ${sets}, updated_at = now() WHERE id = $1`, [id, ...keys.map((k) => fields[k])]);
    },
    async releaseRun(id, error) {
      await this.updateRun(id, { status: 'failed', error });
      await q(SQL.releaseItems, [id]);
    },
    async listRuns(limit = 50) {
      const { rows } = await q(SQL.runs, [limit]);
      return rows.map((r) => ({ ...r, id: Number(r.id), total_cents: Number(r.total_cents), campfire_invoice_id: r.campfire_invoice_id ? Number(r.campfire_invoice_id) : null }));
    },
    async getRun(id) {
      const { rows } = await q(SQL.run, [id]);
      const r = rows[0];
      return r ? { ...r, id: Number(r.id), total_cents: Number(r.total_cents), customer_tag_id: Number(r.customer_tag_id), entity_id: r.entity_id ? Number(r.entity_id) : null, client_id: r.client_id ? Number(r.client_id) : null, campfire_invoice_id: r.campfire_invoice_id ? Number(r.campfire_invoice_id) : null } : null;
    },
    async runItems(id) {
      const { rows } = await q(SQL.runItems, [id]);
      return rows.map((r) => ({ line_id: Number(r.line_id), bill_id: Number(r.bill_id), customer_tag_id: Number(r.customer_tag_id), cents: Number(r.cents), percent: Number(r.percent) }));
    },
    async itemsForLines(lineIds) {
      const { rows } = await q(SQL.itemsForLines, [lineIds]);
      return rows.map((r) => ({ line_id: Number(r.line_id), customer_tag_id: Number(r.customer_tag_id) }));
    },
  };
}

export class StoreError extends Error {}

let current;
export async function getStore() {
  if (!current) {
    try {
      const store = process.env.DATABASE_URL ? await postgresStore(process.env.DATABASE_URL) : memoryStore();
      await store.init();
      current = store; // only keep a store that actually connected; otherwise retry next time
    } catch (err) {
      const host = (() => { try { return new URL(process.env.DATABASE_URL).hostname; } catch { return null; } })();
      throw new StoreError(`Can't reach the database${host ? ` at "${host}"` : ''}: ${err.message}. Check DATABASE_URL on Render: it should be the database's full Internal Database URL.`);
    }
  }
  return current;
}
