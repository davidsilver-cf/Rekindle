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
