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
| Screens (queue, deals, approvals, invoices) | planned |
| Invoice creation | planned |

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
