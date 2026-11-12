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
| Write stamps back to Campfire | next |
| Webhooks (`Bill.created`, `Bill.updated`) on Render | next |
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
