# Rekindle

Automated billback for Campfire: unbilled expenses → allocation → invoicing.

1. **Stamp:** fill each Pending bill line's Billing Type and Billback Customer from its Deals tag.
2. **Allocate:** bill Deal and Fund lines directly; split Allocation lines across owners by effective-dated percentages.
3. **Approve:** review what each fund or customer owes before anything is created.
4. **Invoice:** create one invoice per billback customer in Campfire and mark the lines Billed.

## Status

| Piece | State |
|---|---|
| Dry-run engine (stamp + allocate, nothing written) | ✅ working, tested on ABC_261106 |
| Web service for Render: webhooks, dry-run page, backfill | ✅ built; deploy next |
| Write stamps back to Campfire | ✅ built, **off** until `REKINDLE_WRITE=true` |
| Screens: Billback queue, Deals & allocations, Approvals, Invoices | ✅ prototype, read-only; demo mode until an API key is set |
| Per-deal approvers, Google sign-in, approvals saved in Postgres | ✅ built; needs Google client + database on Render |
| Live deal list from Campfire; deal setup (billing type, customer, owners/%) edited on the Deals screen | ✅ built; saved in Postgres |
| Invoice PDF (draft, with supporting detail) | ✅ built; download from the Invoices screen |
| Invoice creation in Campfire (+ attach the PDF) | planned |

## The screens

Sign in at the service's address with `REKINDLE_ADMIN_TOKEN`. Without `CAMPFIRE_API_KEY` (or with `REKINDLE_DEMO=true`) the screens show the ABC_261106 test bill from the repo, marked **Demo data**; with a key they read open bills live from Campfire.

| Screen | Shows | Works today |
|---|---|---|
| Billback queue | Pending 13190 lines, billing type, billback customer, exceptions | Yes; **Stamp now** when writing is on |
| Deals & allocations | Each deal's billing type, customer, owners and % | Read-only (edits come with the database) |
| Approvals | What each customer owes, share of the run, checks | Review only (recording approvals needs the database) |
| Invoices | Draft invoice per customer with source lines | Preview only |

## How it decides

- Only lines on account **13190 – Unbilled Receivable** with Billback Status **Pending** are touched.
- **Billing Type:** the line's value always wins. Rekindle only fills a blank, from the deal's row in `config/rekindle.json`.
- **Deal / Fund:** billed 100% to the deal's billback customer; Rekindle adds the Billback Customer tag if it's missing.
- **Allocation:** split across the owners whose start/end dates cover the bill date. Amounts are worked in cents; leftover cents go to the largest share, so the split always adds back to the line.
- **Expense:** not billed back; flagged for reclass.
- **Exceptions** (no Deals tag, tag not set up, owners not 100%) are reported and left alone.
- Every pending cent must land in billed, expense or exceptions, or the run fails.

## Setup

`config/rekindle.json` holds the tag groups, the deal → billing type → customer mapping (Tag Setup), and the allocation percentages (Allocations). IDs are Campfire IDs.

## Run it

Requires Node 20+. No packages to install.

```bash
npm test                    # engine tests
npm run dry-run:fixture     # offline, against test/fixtures/ABC_261106.json

export CAMPFIRE_API_KEY=... # from Campfire Settings → API Keys; never commit it
npm run dry-run             # live: all open bills
npm run dry-run -- --bill ABC_261106
```

The API key is only ever read from the `CAMPFIRE_API_KEY` environment variable (on Render: the service's **Environment** settings).

## Deploy on Render

1. Render → **New → Blueprint** → pick this repo. `render.yaml` sets up a free web service.
2. When asked, paste the Campfire API key into `CAMPFIRE_API_KEY`. Leave `CAMPFIRE_WEBHOOK_SECRET` blank for now.
3. Open `https://<your-service>.onrender.com/health`. It should show `"write": false`.
4. Open `https://<your-service>.onrender.com/dry-run?token=<REKINDLE_ADMIN_TOKEN>&bill=ABC_261106`. The token is under the service's **Environment** tab.
5. In Campfire: **Settings → Developer → Webhooks → New Webhook**, URL `https://<your-service>.onrender.com/webhooks/campfire`, topics `Bill.created` and `Bill.updated`. Copy the signing token it shows into `CAMPFIRE_WEBHOOK_SECRET` on Render.
6. When the dry run looks right, set `REKINDLE_WRITE=true`. Rekindle then stamps lines as bills are created or edited. `POST /run?token=…` stamps all open bills at once.

| Endpoint | What it does |
|---|---|
| `GET /health` | Up? Writing on? |
| `GET /dry-run?token=…[&bill=…]` | The dry-run report, live from Campfire |
| `POST /run?token=…` | Process every open bill (writes only if `REKINDLE_WRITE=true`) |
| `POST /webhooks/campfire` | Campfire bill events; signature-checked |

Rekindle's own write fires a `Bill.updated` event; the second pass finds nothing left to stamp, so it doesn't loop. The free Render plan sleeps when idle, so the first webhook after a quiet spell can take up to a minute.

**Before turning writes on:** Campfire's bill update replaces every line, so Rekindle sends all lines back with their existing values. The exact shape for writing tags and the Billing Type custom field isn't spelled out in Campfire's API docs, so the first write should be checked on the test bill.

## Approvals and sign-in

Each deal has an **approver** (set by an admin on the Deals screen). On **Approvals**, the run is grouped by deal; only that deal's approver can **Approve** or **Send back** (with an optional note). A deal with no approver can be decided by an admin. If a deal's lines or amounts change after approval, it shows **Changed since approval** and must be approved again. Invoices are ready once every deal is approved.

People sign in with **Google**. Anyone with an `@REKINDLE_ALLOWED_DOMAIN` address (or listed in `REKINDLE_ALLOWED_EMAILS`) can sign in and view; `REKINDLE_ADMINS` can set approvers. The access token still works as an admin sign-in.

Approvers, decisions and an audit log are kept in Postgres (`DATABASE_URL`). Without it they're kept in memory and lost on restart; the Approvals screen says so.

### Setup on Render

1. **Database.** Render → **New → Postgres** (same region as the service). Copy its **Internal Database URL** into the service's `DATABASE_URL`. Tables are created on start.
2. **Google sign-in.** Google Cloud Console → APIs & Services → **Credentials → Create credentials → OAuth client ID** → *Web application*. Authorized redirect URI: `https://<your-service>.onrender.com/auth/google/callback`. Put the client ID and secret in `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`. (The OAuth consent screen should be *Internal* to your Google Workspace.)
3. **People.** `REKINDLE_ADMINS` = comma-separated admin emails. `REKINDLE_ALLOWED_DOMAIN` = your Google Workspace domain.

`/health` reports `"database": true` and `"google": true` when both are connected.

## Invoice PDF

**Invoices → pick a customer → Download PDF.** Page 1 is the invoice: from, bill to, one line per recharge category, total due. It's followed by **supporting detail**: every source bill line (bill, vendor, date, description, line amount, share, billed amount), so the customer can trace each dollar. Drafts carry a DRAFT watermark and "not yet issued" in place of an invoice number; once invoices are created in Campfire, the PDF will carry the Campfire invoice number and can be attached to it.

The PDF is generated by Rekindle itself (`src/pdf.js`, no libraries). Branding lives in `config/rekindle.json` under `invoice`:

| Field | What it does |
|---|---|
| `fromName` | Name at the top. Empty = the Campfire entity on the bill |
| `fromAddress` | Address lines under the name |
| `remitTo` | Payment instructions in the Bill to box |
| `terms`, `termsDays` | e.g. "Net 30" and 30, which adds a due date |
| `footer` | Footer text on every page |
| `accentColor` | The top bar and INVOICE title color |

## Deal setup

The **Deals & allocations** screen lists every **Deals** tag in Campfire, read live. A new tag shows as **Needs setup**, and its pending lines are held as exceptions (with a **Set up** link on the queue) until an admin sets it up:

- **Billing type:** Deal, Fund, Allocation or Expense.
- **Billed to** (Deal or Fund): one of the **Billback Customer** tags in Campfire. Several deals can bill the same fund, e.g. deals in diligence charged to the fund.
- **Owners** (Allocation): billback customer, share %, effective from/to. Wherever ownership changes, the owners in force must total 100%.

Setup is saved in Postgres and wins over `config/rekindle.json`, which is now only a starter for the original test deals. Deals are matched by tag ID, so renaming a tag in Campfire keeps its setup. **Without `DATABASE_URL`, setup is lost when Render restarts.**
