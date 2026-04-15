-- ─────────────────────────────────────────────────────────────
-- Migration 007: seed Master|Burden Rate in rate_cards
-- ─────────────────────────────────────────────────────────────
-- Phase 1.3 — Fail-closed rate loading:
--   The proposal summary page previously hardcoded
--   `const BURDEN_RATE = 150;` in TypeScript, which is a landmine:
--   if the real burden rate ever diverges from 150, every margin
--   calculation in the app silently uses the stale value.
--
--   We move burden rate into the existing `rate_cards` lookup
--   table using the same `Category|Role` lookup_key convention
--   as the other Master rates (Business Analyst, Program Manager,
--   Travel Cost/Trip). The proposal summary page now fetches
--   this row at request time and fails closed if it's missing.
-- ─────────────────────────────────────────────────────────────

INSERT INTO rate_cards (rate_card_name, activity, rate, role_category, status, lookup_key)
VALUES ('Master', 'Burden Rate', 150, 'Internal', 'Active', 'Master|Burden Rate')
ON CONFLICT (lookup_key) DO NOTHING;
