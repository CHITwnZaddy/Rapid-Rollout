-- ============================================================
-- Migration 009 — Performance indexes on proposals
-- ============================================================
-- Phase 2.1 — the `proposals` table had no indexes beyond the
-- primary key. Every dashboard / report query that filters by
-- customer, creator, or status, or sorts by updated_at, was
-- doing a sequential scan. These indexes are tiny (the table
-- is small per-user) but the query planner loves them, and
-- they future-proof us as row counts grow.
--
-- Rationale per index:
--   idx_proposals_customer_id  — hot path for the customer
--     filter on the dashboard + reports.
--   idx_proposals_created_by   — ownership lookups in RLS
--     and "my proposals" views.
--   idx_proposals_status       — dashboard card filters
--     (Draft / Submitted) and report filters.
--   idx_proposals_updated_at   — dashboard "Recent Proposals"
--     list is ordered by updated_at DESC LIMIT 10 every page
--     load; a DESC index turns that into a range scan.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_proposals_customer_id
  ON proposals(customer_id);

CREATE INDEX IF NOT EXISTS idx_proposals_created_by
  ON proposals(created_by);

CREATE INDEX IF NOT EXISTS idx_proposals_status
  ON proposals(status);

CREATE INDEX IF NOT EXISTS idx_proposals_updated_at
  ON proposals(updated_at DESC);
