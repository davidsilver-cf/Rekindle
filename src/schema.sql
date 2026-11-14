-- Rekindle database. Safe to run on every start.

-- Per-deal settings kept by Rekindle (Campfire tags can't hold custom fields).
CREATE TABLE IF NOT EXISTS deal_settings (
  deals_tag_id   bigint PRIMARY KEY,
  approver_email text,
  updated_by     text NOT NULL,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- Every approve / send-back decision. The fingerprint identifies exactly
-- which lines and amounts were approved; if they change, the deal needs
-- approving again.
CREATE TABLE IF NOT EXISTS approvals (
  id           bigserial PRIMARY KEY,
  deals_tag_id bigint NOT NULL,
  fingerprint  text NOT NULL,
  decision     text NOT NULL CHECK (decision IN ('approved', 'sent_back')),
  actor_email  text NOT NULL,
  note         text,
  amount_cents bigint NOT NULL,
  line_ids     bigint[] NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS approvals_deal_idx ON approvals (deals_tag_id, created_at DESC, id DESC);

-- Who did what, for the record.
CREATE TABLE IF NOT EXISTS audit_log (
  id          bigserial PRIMARY KEY,
  at          timestamptz NOT NULL DEFAULT now(),
  actor_email text NOT NULL,
  action      text NOT NULL,
  detail      jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- Deal setup edited on the Deals screen (added after the first release).
ALTER TABLE deal_settings ADD COLUMN IF NOT EXISTS deals_tag_name text;
ALTER TABLE deal_settings ADD COLUMN IF NOT EXISTS billing_type text;
ALTER TABLE deal_settings ADD COLUMN IF NOT EXISTS customer jsonb;
DO $$ BEGIN
  ALTER TABLE deal_settings ADD CONSTRAINT deal_settings_billing_type_check
    CHECK (billing_type IS NULL OR billing_type IN ('Deal', 'Fund', 'Allocation', 'Expense'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Owners of Allocation deals, effective-dated. Saving a deal's owners
-- replaces its rows; the audit log keeps what changed.
CREATE TABLE IF NOT EXISTS allocation_owners (
  id           bigserial PRIMARY KEY,
  deals_tag_id bigint NOT NULL,
  customer     jsonb NOT NULL,
  percent      numeric(9,4) NOT NULL CHECK (percent > 0 AND percent <= 100),
  start_date   date,
  end_date     date,
  updated_by   text NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CHECK (start_date IS NULL OR end_date IS NULL OR start_date <= end_date)
);
CREATE INDEX IF NOT EXISTS allocation_owners_deal_idx ON allocation_owners (deals_tag_id);
