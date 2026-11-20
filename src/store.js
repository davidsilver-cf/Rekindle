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
  setups: 'SELECT deals_tag_id, billing_type, customer, allocation_id FROM deal_settings WHERE billing_type IS NOT NULL',
  billingGroups: 'SELECT deals_tag_id, billing_group FROM deal_settings WHERE billing_group IS NOT NULL',
  setBillingGroup: `INSERT INTO deal_settings (deals_tag_id, deals_tag_name, billing_group, updated_by, updated_at) VALUES ($1, $2, $3, $4, now())
ON CONFLICT (deals_tag_id) DO UPDATE SET deals_tag_name = EXCLUDED.deals_tag_name, billing_group = EXCLUDED.billing_group, updated_by = EXCLUDED.updated_by, updated_at = now()`,
  setSetup: `INSERT INTO deal_settings (deals_tag_id, deals_tag_name, billing_type, customer, allocation_id, updated_by, updated_at)
VALUES ($1, $2, $3, $4, $6, $5, now())
ON CONFLICT (deals_tag_id) DO UPDATE SET deals_tag_name = EXCLUDED.deals_tag_name, billing_type = EXCLUDED.billing_type,
  customer = EXCLUDED.customer, allocation_id = EXCLUDED.allocation_id, updated_by = EXCLUDED.updated_by, updated_at = now()`,
  owners: `SELECT deals_tag_id, customer, amount, percent, to_char(start_date, 'YYYY-MM-DD') AS start_date, to_char(end_date, 'YYYY-MM-DD') AS end_date
FROM allocation_owners ORDER BY deals_tag_id, start_date NULLS FIRST, percent DESC, id`,
  deleteOwners: 'DELETE FROM allocation_owners WHERE deals_tag_id = $1',
  insertOwner: `INSERT INTO allocation_owners (deals_tag_id, customer, percent, start_date, end_date, updated_by, amount)
VALUES ($1, $2, $3, $4, $5, $6, $7)`,
  savedAllocations: 'SELECT id, name FROM saved_allocations ORDER BY lower(name)',
  savedAllocationOwners: `SELECT allocation_id, customer, amount, percent, to_char(start_date, 'YYYY-MM-DD') AS start_date, to_char(end_date, 'YYYY-MM-DD') AS end_date
FROM saved_allocation_owners ORDER BY allocation_id, start_date NULLS FIRST, percent DESC, id`,
  insertSavedAllocation: 'INSERT INTO saved_allocations (name, created_by, updated_by) VALUES ($1, $2, $2) RETURNING id',
  renameSavedAllocation: 'UPDATE saved_allocations SET name = $2, updated_by = $3, updated_at = now() WHERE id = $1',
  deleteSavedAllocationOwners: 'DELETE FROM saved_allocation_owners WHERE allocation_id = $1',
  insertSavedAllocationOwner: `INSERT INTO saved_allocation_owners (allocation_id, customer, amount, percent, start_date, end_date) VALUES ($1, $2, $3, $4, $5, $6)`,
  deleteSavedAllocation: 'DELETE FROM saved_allocations WHERE id = $1 AND NOT EXISTS (SELECT 1 FROM deal_settings WHERE allocation_id = $1 AND billing_type = \'Allocation\')',
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
  userLink: 'SELECT campfire_user_id, workspace, email, linked_at FROM campfire_user_links WHERE campfire_user_id = $1',
  userLinks: 'SELECT campfire_user_id, workspace, email, linked_at FROM campfire_user_links ORDER BY linked_at DESC',
  saveUserLink: `INSERT INTO campfire_user_links (campfire_user_id, workspace, email, linked_at) VALUES ($1, $2, $3, now())
ON CONFLICT (campfire_user_id) DO UPDATE SET workspace = EXCLUDED.workspace, email = EXCLUDED.email, linked_at = now()`,
  deleteUserLink: 'DELETE FROM campfire_user_links WHERE campfire_user_id = $1',
  admins: 'SELECT email, added_by, added_at FROM rekindle_admins ORDER BY email',
  customerLinks: 'SELECT tag_id, customer_id FROM billback_customer_links',
  saveCustomerLink: 'INSERT INTO billback_customer_links (tag_id, customer_id, created_by) VALUES ($1, $2, $3) ON CONFLICT (tag_id) DO UPDATE SET customer_id = EXCLUDED.customer_id',
  reclassAccounts: 'SELECT category_tag_id, category_name, account_id, account_label, updated_by, updated_at FROM reclass_accounts',
  saveReclassAccount: `INSERT INTO reclass_accounts (category_tag_id, category_name, account_id, account_label, updated_by, updated_at) VALUES ($1, $2, $3, $4, $5, now())
ON CONFLICT (category_tag_id) DO UPDATE SET category_name = EXCLUDED.category_name, account_id = EXCLUDED.account_id, account_label = EXCLUDED.account_label, updated_by = EXCLUDED.updated_by, updated_at = now()`,
  deleteReclassAccount: 'DELETE FROM reclass_accounts WHERE category_tag_id = $1',
  insertReclass: `INSERT INTO reclass_runs (ref, entity_id, je_date, total_cents, status, payload, created_by) VALUES ($1, $2, $3, $4, 'creating', $5, $6) RETURNING id`,
  insertReclassItem: 'INSERT INTO reclass_items (run_id, line_id, bill_id, cents) VALUES ($1, $2, $3, $4)',
  reclassRuns: `SELECT id, ref, entity_id, to_char(je_date, 'YYYY-MM-DD') AS je_date, total_cents, status, campfire_je_id, je_number, error, created_by, created_at, updated_at,
  (SELECT count(*) FROM reclass_items i WHERE i.run_id = r.id) AS line_count FROM reclass_runs r ORDER BY created_at DESC, id DESC LIMIT $1`,
  reclassRun: `SELECT id, ref, entity_id, to_char(je_date, 'YYYY-MM-DD') AS je_date, total_cents, status, campfire_je_id, je_number, error, payload, created_by, created_at, updated_at FROM reclass_runs WHERE id = $1`,
  reclassItems: 'SELECT line_id, bill_id, cents FROM reclass_items WHERE run_id = $1 ORDER BY id',
  reclassedLines: 'SELECT line_id FROM reclass_items',
  reclassForLines: `SELECT i.line_id, r.id AS run_id, r.je_number, r.campfire_je_id, r.status FROM reclass_items i JOIN reclass_runs r ON r.id = i.run_id WHERE i.line_id = ANY($1::bigint[])`,
  releaseReclassItems: 'DELETE FROM reclass_items WHERE run_id = $1',
  addAdmin: 'INSERT INTO rekindle_admins (email, added_by) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING',
  removeAdmin: 'DELETE FROM rekindle_admins WHERE email = $1',
  runByInvoice: `SELECT id FROM invoice_runs WHERE campfire_invoice_id = $1 ORDER BY id DESC LIMIT 1`,
  invoicesForLines: `SELECT i.line_id, i.customer_tag_id, i.cents, i.percent, r.id AS run_id, r.invoice_number, r.campfire_invoice_id, r.status, r.customer_name
FROM invoice_items i JOIN invoice_runs r ON r.id = i.run_id WHERE i.line_id = ANY($1::bigint[]) ORDER BY r.id`,
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
  const savedAllocs = [];
  let allocSeq = 0;
  const runs = [];
  const items = [];
  let seq = 0;
  let runSeq = 0;
  let connection = null;
  const userLinks = new Map();
  const admins = new Map();
  const customerLinks = new Map();
  const billingGroups = new Map();
  const reclassAccounts = new Map();
  const reclassRuns = [];
  const reclassItems = [];
  let reclassSeq = 0;
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
    async getUserLink(id) { const l = userLinks.get(String(id)); return l ? { ...l } : null; },
    async listUserLinks() { return [...userLinks.values()].reverse(); },
    async saveUserLink({ campfireUserId, workspace, email }) { userLinks.delete(String(campfireUserId)); userLinks.set(String(campfireUserId), { campfire_user_id: String(campfireUserId), workspace: workspace == null ? null : String(workspace), email, linked_at: new Date().toISOString() }); },
    async deleteUserLink(id) { userLinks.delete(String(id)); },
    async listAdmins() { return [...admins.values()].sort((a, b) => a.email.localeCompare(b.email)); },
    async getCustomerLinks() { return new Map(customerLinks); },
    async saveCustomerLink(tagId, customerId) { customerLinks.set(Number(tagId), Number(customerId)); },
    async getReclassAccounts() { return new Map([...reclassAccounts.values()].map((a) => [Number(a.category_tag_id), { ...a }])); },
    async saveReclassAccount({ categoryTagId, categoryName, accountId, accountLabel, by }) { reclassAccounts.set(Number(categoryTagId), { category_tag_id: Number(categoryTagId), category_name: categoryName, account_id: Number(accountId), account_label: accountLabel || null, updated_by: by, updated_at: new Date().toISOString() }); },
    async deleteReclassAccount(id) { reclassAccounts.delete(Number(id)); },
    async reserveReclass(run, lines) {
      if (lines.some((l) => reclassItems.some((i) => i.line_id === l.lineId))) throw new ShareTakenError('already reclassed');
      const id = ++reclassSeq;
      reclassRuns.push({ id, ...run, status: 'creating', campfire_je_id: null, je_number: null, error: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
      for (const l of lines) reclassItems.push({ run_id: id, line_id: l.lineId, bill_id: l.billId, cents: l.cents });
      return id;
    },
    async updateReclass(id, fields) { const r = reclassRuns.find((x) => x.id === Number(id)); Object.assign(r, fields, { updated_at: new Date().toISOString() }); },
    async releaseReclass(id, error) { await this.updateReclass(id, { status: 'failed', error }); for (let i = reclassItems.length - 1; i >= 0; i--) if (reclassItems[i].run_id === Number(id)) reclassItems.splice(i, 1); },
    async listReclass(limit = 30) { return reclassRuns.slice().reverse().slice(0, limit).map(({ payload, ...r }) => ({ ...r, line_count: reclassItems.filter((i) => i.run_id === r.id).length })); },
    async getReclass(id) { const r = reclassRuns.find((x) => x.id === Number(id)); return r ? { ...r } : null; },
    async reclassRunItems(id) { return reclassItems.filter((i) => i.run_id === Number(id)).map((i) => ({ ...i })); },
    async reclassedLines() { return new Set(reclassItems.map((i) => i.line_id)); },
    async reclassForLines(lineIds) { const want = new Set(lineIds.map(Number)); return reclassItems.filter((i) => want.has(i.line_id)).map((i) => { const r = reclassRuns.find((x) => x.id === i.run_id); return { line_id: i.line_id, run_id: r.id, je_number: r.je_number, campfire_je_id: r.campfire_je_id, status: r.status }; }); },
    async addAdmin(email, by) { if (!admins.has(email)) admins.set(email, { email, added_by: by, added_at: new Date().toISOString() }); },
    async removeAdmin(email) { admins.delete(email); },
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
    async getBillingGroups() { return new Map(billingGroups); },
    async setBillingGroup(dealsTagId, name, group, actor) {
      if (group) billingGroups.set(Number(dealsTagId), group); else billingGroups.delete(Number(dealsTagId));
      log.push({ at: new Date(), actor_email: actor, action: 'set_billing_group', detail: { dealsTagId, name, group } });
    },
    async getOwners() { return owners.map((o) => ({ ...o })); },
    async saveDealSetup(dealsTagId, name, setup, ownerRows, actor) {
      setups.set(dealsTagId, { billingType: setup.billingType, customer: setup.customer, allocationId: setup.allocationId || null });
      for (let i = owners.length - 1; i >= 0; i--) if (owners[i].dealsTagId === dealsTagId) owners.splice(i, 1);
      for (const o of ownerRows) owners.push({ dealsTagId, ...o });
      log.push({ at: new Date(), actor_email: actor, action: 'set_deal_setup', detail: { dealsTagId, name, ...setup, owners: ownerRows } });
    },
    async getSavedAllocations() { return savedAllocs.map((a) => ({ id: a.id, name: a.name, owners: a.owners.map((o) => ({ ...o })) })); },
    async saveAllocation({ id = null, name, owners: rows }, actor) {
      const clash = savedAllocs.find((a) => a.name.toLowerCase() === name.toLowerCase() && a.id !== Number(id));
      if (clash) throw new Error(`There's already an allocation called "${clash.name}".`);
      let a = id ? savedAllocs.find((x) => x.id === Number(id)) : null;
      if (id && !a) throw new Error('That allocation no longer exists.');
      if (!a) { a = { id: ++allocSeq, name, owners: [] }; savedAllocs.push(a); }
      a.name = name;
      a.owners = rows.map((o) => ({ ...o }));
      log.push({ at: new Date(), actor_email: actor, action: id ? 'update_allocation' : 'create_allocation', detail: { id: a.id, name, owners: rows } });
      return a.id;
    },
    async deleteAllocation(id, actor) {
      const inUse = [...setups.values()].some((v) => v.billingType === 'Allocation' && Number(v.allocationId) === Number(id));
      const i = savedAllocs.findIndex((a) => a.id === Number(id));
      if (inUse || i < 0) return false;
      const [a] = savedAllocs.splice(i, 1);
      log.push({ at: new Date(), actor_email: actor, action: 'delete_allocation', detail: { id: a.id, name: a.name } });
      return true;
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
    async runByInvoice(campfireId) {
      const r = runs.slice().reverse().find((x) => Number(x.campfire_invoice_id) === Number(campfireId));
      return r ? { ...r } : null;
    },
    async invoicesForLines(lineIds) {
      const want = new Set(lineIds.map(Number));
      return items.filter((i) => want.has(i.line_id)).map((i) => {
        const r = runs.find((x) => x.id === i.run_id) || {};
        return { line_id: i.line_id, customer_tag_id: i.customer_tag_id, cents: i.cents, percent: i.percent, run_id: i.run_id, invoice_number: r.invoice_number, campfire_invoice_id: r.campfire_invoice_id, status: r.status, customer_name: r.customer_name };
      });
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
    async getUserLink(id) { const { rows } = await q(SQL.userLink, [String(id)]); return rows[0] || null; },
    async listUserLinks() { return (await q(SQL.userLinks)).rows; },
    async saveUserLink({ campfireUserId, workspace, email }) { await q(SQL.saveUserLink, [String(campfireUserId), workspace == null ? null : String(workspace), email]); },
    async deleteUserLink(id) { await q(SQL.deleteUserLink, [String(id)]); },
    async listAdmins() { return (await q(SQL.admins)).rows; },
    async getCustomerLinks() { return new Map((await q(SQL.customerLinks)).rows.map((r) => [Number(r.tag_id), Number(r.customer_id)])); },
    async saveCustomerLink(tagId, customerId, by = 'rekindle') { await q(SQL.saveCustomerLink, [tagId, customerId, by]); },
    async getReclassAccounts() { return new Map((await q(SQL.reclassAccounts)).rows.map((a) => [Number(a.category_tag_id), { ...a, category_tag_id: Number(a.category_tag_id), account_id: Number(a.account_id) }])); },
    async saveReclassAccount({ categoryTagId, categoryName, accountId, accountLabel, by }) { await q(SQL.saveReclassAccount, [categoryTagId, categoryName, accountId, accountLabel || null, by]); },
    async deleteReclassAccount(id) { await q(SQL.deleteReclassAccount, [id]); },
    async reserveReclass(run, lines) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows } = await client.query(SQL.insertReclass, [run.ref, run.entity_id, run.je_date, run.total_cents, JSON.stringify(run.payload), run.created_by]);
        for (const l of lines) await client.query(SQL.insertReclassItem, [rows[0].id, l.lineId, l.billId, l.cents]);
        await client.query('COMMIT');
        return Number(rows[0].id);
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        if (err.code === '23505') throw new ShareTakenError('already reclassed');
        throw err;
      } finally { client.release(); }
    },
    async updateReclass(id, fields) {
      const keys = Object.keys(fields).filter((k) => ['status', 'campfire_je_id', 'je_number', 'error'].includes(k));
      if (!keys.length) return;
      await q(`UPDATE reclass_runs SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')}, updated_at = now() WHERE id = $1`, [id, ...keys.map((k) => fields[k])]);
    },
    async releaseReclass(id, error) { await this.updateReclass(id, { status: 'failed', error }); await q(SQL.releaseReclassItems, [id]); },
    async listReclass(limit = 30) { return (await q(SQL.reclassRuns, [limit])).rows.map((r) => ({ ...r, id: Number(r.id), total_cents: Number(r.total_cents), line_count: Number(r.line_count), campfire_je_id: r.campfire_je_id ? Number(r.campfire_je_id) : null })); },
    async getReclass(id) { const r = (await q(SQL.reclassRun, [id])).rows[0]; return r ? { ...r, id: Number(r.id), total_cents: Number(r.total_cents), entity_id: r.entity_id ? Number(r.entity_id) : null, campfire_je_id: r.campfire_je_id ? Number(r.campfire_je_id) : null } : null; },
    async reclassRunItems(id) { return (await q(SQL.reclassItems, [id])).rows.map((r) => ({ line_id: Number(r.line_id), bill_id: Number(r.bill_id), cents: Number(r.cents) })); },
    async reclassedLines() { return new Set((await q(SQL.reclassedLines)).rows.map((r) => Number(r.line_id))); },
    async reclassForLines(lineIds) { return (await q(SQL.reclassForLines, [lineIds])).rows.map((r) => ({ ...r, line_id: Number(r.line_id), run_id: Number(r.run_id), campfire_je_id: r.campfire_je_id ? Number(r.campfire_je_id) : null })); },
    async addAdmin(email, by) { await q(SQL.addAdmin, [email, by]); },
    async removeAdmin(email) { await q(SQL.removeAdmin, [email]); },
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
    async getBillingGroups() {
      const { rows } = await q(SQL.billingGroups);
      return new Map(rows.map((r) => [Number(r.deals_tag_id), r.billing_group]));
    },
    async setBillingGroup(dealsTagId, name, group, actor) {
      await q(SQL.setBillingGroup, [dealsTagId, name, group ? JSON.stringify(group) : null, actor]);
      await q(SQL.audit, [actor, 'set_billing_group', JSON.stringify({ dealsTagId, name, group })]);
    },
    async getSetups() {
      const { rows } = await q(SQL.setups);
      return new Map(rows.map((r) => [Number(r.deals_tag_id), { billingType: r.billing_type, customer: r.customer, allocationId: r.allocation_id ? Number(r.allocation_id) : null }]));
    },
    async getOwners() {
      const { rows } = await q(SQL.owners);
      return rows.map((r) => ({ dealsTagId: Number(r.deals_tag_id), customer: r.customer, amount: r.amount === null ? null : Number(r.amount), percent: Number(r.percent), start: r.start_date, end: r.end_date }));
    },
    async saveDealSetup(dealsTagId, name, setup, ownerRows, actor) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query(SQL.setSetup, [dealsTagId, name, setup.billingType, setup.customer ? JSON.stringify(setup.customer) : null, actor, setup.allocationId || null]);
        await client.query(SQL.deleteOwners, [dealsTagId]);
        for (const o of ownerRows) {
          await client.query(SQL.insertOwner, [dealsTagId, JSON.stringify(o.customer), o.percent, o.start, o.end, actor, o.amount ?? null]);
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
    async getSavedAllocations() {
      const [{ rows: list }, { rows: owners }] = await Promise.all([q(SQL.savedAllocations), q(SQL.savedAllocationOwners)]);
      return list.map((a) => ({
        id: Number(a.id), name: a.name,
        owners: owners.filter((o) => Number(o.allocation_id) === Number(a.id)).map((o) => ({ customer: o.customer, amount: o.amount === null ? null : Number(o.amount), percent: Number(o.percent), start: o.start_date, end: o.end_date })),
      }));
    },
    async saveAllocation({ id = null, name, owners: rows }, actor) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        let allocId = id ? Number(id) : null;
        if (allocId) {
          const r = await client.query(SQL.renameSavedAllocation, [allocId, name, actor]);
          if (!r.rowCount) throw new Error('That allocation no longer exists.');
        } else {
          allocId = Number((await client.query(SQL.insertSavedAllocation, [name, actor])).rows[0].id);
        }
        await client.query(SQL.deleteSavedAllocationOwners, [allocId]);
        for (const o of rows) await client.query(SQL.insertSavedAllocationOwner, [allocId, JSON.stringify(o.customer), o.amount ?? null, o.percent, o.start, o.end]);
        await client.query(SQL.audit, [actor, id ? 'update_allocation' : 'create_allocation', JSON.stringify({ id: allocId, name, owners: rows })]);
        await client.query('COMMIT');
        return allocId;
      } catch (err) {
        await client.query('ROLLBACK');
        if (err.code === '23505') throw new Error(`There's already an allocation called "${name}".`);
        throw err;
      } finally {
        client.release();
      }
    },
    async deleteAllocation(id, actor) {
      const r = await q(SQL.deleteSavedAllocation, [Number(id)]);
      if (r.rowCount) await q(SQL.audit, [actor, 'delete_allocation', JSON.stringify({ id: Number(id) })]);
      return r.rowCount > 0;
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
    async runByInvoice(campfireId) {
      const { rows } = await q(SQL.runByInvoice, [campfireId]);
      return rows[0] ? this.getRun(Number(rows[0].id)) : null;
    },
    async invoicesForLines(lineIds) {
      const { rows } = await q(SQL.invoicesForLines, [lineIds]);
      return rows.map((r) => ({ ...r, line_id: Number(r.line_id), customer_tag_id: Number(r.customer_tag_id), cents: Number(r.cents), percent: Number(r.percent), run_id: Number(r.run_id), campfire_invoice_id: r.campfire_invoice_id ? Number(r.campfire_invoice_id) : null }));
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
