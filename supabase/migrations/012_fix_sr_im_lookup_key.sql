-- Fix Sr. IM rate card lookup_key mismatch.
-- engine.ts builds lookups as `${rate_card_name}|${activity}` (e.g. "Master|Sr. Implementation Manager"),
-- but the Excel seed wrote the lookup_key as the abbreviated "Master|Sr. IM", so the map lookup
-- returned 0 and Sr. IM Cost displayed $0 across all scenarios.
UPDATE rate_cards
SET lookup_key = rate_card_name || '|' || activity
WHERE lookup_key <> rate_card_name || '|' || activity;
