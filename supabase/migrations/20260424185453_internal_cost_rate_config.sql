-- ─────────────────────────────────────────────────────────────
-- Migration 022: seed Master|Internal Cost Rate in rate_cards
-- ─────────────────────────────────────────────────────────────
-- Phase 1 APP-01: Fail-closed internal cost rate loading.
--
--   src/lib/calculations/migration-engine.ts previously hardcoded
--     const INTERNAL_COST_RATE = 135;
--   inside calculateMigrationTotals, which is the same landmine
--   that migration 007 fixed for BURDEN_RATE: if the real internal
--   delivery cost ever diverges from 135, every margin calculation
--   silently uses the stale value.
--
--   Following the 007 precedent: seed Master|Internal Cost Rate in
--   rate_cards using the Category|Role lookup_key convention. The
--   proposal summary and bid sheet pages fetch this row at request
--   time and fail closed if it's missing.
--
-- Applied to prod via Supabase MCP apply_migration on 2026-04-24.
-- ─────────────────────────────────────────────────────────────

INSERT INTO rate_cards (rate_card_name, activity, rate, role_category, status, lookup_key)
VALUES ('Master', 'Internal Cost Rate', 135, 'Internal', 'Active', 'Master|Internal Cost Rate')
ON CONFLICT (lookup_key) DO NOTHING;
