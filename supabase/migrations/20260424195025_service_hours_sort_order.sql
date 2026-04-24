-- Migration 024: Deterministic service_hours ordering for proposal bundle seeding
--
-- Addresses APP-02 from the Solution Architect Review.
--
-- Problem: create_proposal_bundle seeds scenario_lines by selecting DISTINCT
-- service_name FROM service_hours and ordering alphabetically:
--     ROW_NUMBER() OVER (ORDER BY service_name) - 1 AS row_order
-- This means renaming or adding a service silently changes row_order for all
-- NEW proposals, while existing proposals keep a row_order that may no longer
-- match. save_scenario_grid (migration 020) enforces "every line must be
-- included" on save, so any drift between the seeded set and the on-disk set
-- is a hard failure. There is also no guarantee that the number of distinct
-- service_names matches what the grid save expects.
--
-- Fix: introduce an explicit sort_order column on service_hours, backfill it
-- with the current alphabetical ordering (so existing proposals stay stable),
-- then rewrite create_proposal_bundle to use it.
--
-- Important: the column is NOT NULL, and we backfill in a single statement
-- before adding the constraint to avoid a failed default-value dance. New
-- rows inserted by admins will need a sort_order value explicitly; the admin
-- UI will be updated in a follow-up.

BEGIN;

-- ---------------------------------------------------------------
-- 1. Add sort_order column (nullable first, backfill, then NOT NULL)
-- ---------------------------------------------------------------

ALTER TABLE public.service_hours
  ADD COLUMN IF NOT EXISTS sort_order INTEGER;

-- Backfill: one sort_order value per DISTINCT service_name (alphabetical) so
-- the row_order emitted by create_proposal_bundle stays byte-for-byte the
-- same as it was before this migration. Every service_hours row that shares
-- a service_name gets the same sort_order — this matches the DISTINCT seed.
WITH ordered AS (
  SELECT
    service_name,
    (ROW_NUMBER() OVER (ORDER BY service_name) - 1) AS so
  FROM (
    SELECT DISTINCT service_name
    FROM public.service_hours
    WHERE status = 'Active'
  ) active_services
),
all_services AS (
  -- Include Inactive rows too so the column is populated everywhere; they'll
  -- get a sort_order appended after the active ones.
  SELECT
    service_name,
    (ROW_NUMBER() OVER (ORDER BY service_name) - 1)
      + (SELECT COUNT(*) FROM ordered) AS so
  FROM (
    SELECT DISTINCT service_name
    FROM public.service_hours
    WHERE status <> 'Active' OR status IS NULL
  ) inactive_services
)
UPDATE public.service_hours sh
SET sort_order = COALESCE(o.so, a.so)
FROM (
  SELECT service_name, so FROM ordered
) o
FULL OUTER JOIN (
  SELECT service_name, so FROM all_services
) a USING (service_name)
WHERE sh.service_name = COALESCE(o.service_name, a.service_name);

-- Verify no nulls remain before locking the constraint.
DO $$
DECLARE
  null_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO null_count
  FROM public.service_hours
  WHERE sort_order IS NULL;

  IF null_count > 0 THEN
    RAISE EXCEPTION
      'Backfill incomplete: % service_hours rows still have NULL sort_order',
      null_count;
  END IF;
END $$;

ALTER TABLE public.service_hours
  ALTER COLUMN sort_order SET NOT NULL;

-- Helpful for ORDER BY sort_order queries; non-unique because multiple rows
-- with the same service_name share a sort_order.
CREATE INDEX IF NOT EXISTS idx_service_hours_sort_order
  ON public.service_hours (sort_order);

-- ---------------------------------------------------------------
-- 2. Rewrite create_proposal_bundle to use sort_order
-- ---------------------------------------------------------------
-- Body is identical to the prior version except the DISTINCT seed now
-- orders by MIN(sort_order) per service_name. Everything else byte-for-byte
-- unchanged to minimize behavioral drift.

CREATE OR REPLACE FUNCTION public.create_proposal_bundle(
  p_name TEXT,
  p_customer_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_proposal_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to create a proposal.';
  END IF;

  INSERT INTO proposals (
    name,
    customer_id,
    created_by
  )
  VALUES (
    p_name,
    p_customer_id,
    auth.uid()
  )
  RETURNING id INTO v_proposal_id;

  INSERT INTO scenarios (proposal_id, scenario_type, is_active)
  VALUES
    (v_proposal_id, 'P1', true),
    (v_proposal_id, 'P2', false),
    (v_proposal_id, 'Opt1', false),
    (v_proposal_id, 'Opt2', false);

  -- CHANGED: order by sort_order (deterministic, admin-controlled) instead
  -- of alphabetical service_name. ROW_NUMBER is still used to compact any
  -- gaps in sort_order into a contiguous 0..N-1 range for scenario_lines.
  INSERT INTO scenario_lines (scenario_id, row_order, module)
  SELECT
    s.id,
    modules.row_order,
    modules.service_name
  FROM scenarios s
  JOIN (
    SELECT
      service_name,
      ROW_NUMBER() OVER (ORDER BY min_sort_order, service_name) - 1 AS row_order
    FROM (
      SELECT
        service_name,
        MIN(sort_order) AS min_sort_order
      FROM service_hours
      WHERE status = 'Active'
      GROUP BY service_name
    ) distinct_services
  ) modules ON true
  WHERE s.proposal_id = v_proposal_id;

  INSERT INTO bid_sheets (proposal_id, customer_id)
  VALUES (v_proposal_id, p_customer_id);

  INSERT INTO migration_config (proposal_id, doc_avg_mb_per_project)
  VALUES (v_proposal_id, 0);

  INSERT INTO migration_detail_lines (
    proposal_id,
    section,
    label,
    quantity,
    items_per_object,
    total_line_items,
    row_order
  )
  VALUES
    (v_proposal_id, 'project', 'Project Info/Detail', 0, 0, 0, 0),
    (v_proposal_id, 'project', 'Schedules', 0, 0, 0, 1),
    (v_proposal_id, 'workflow', 'WF Object Name', 0, 0, 0, 0),
    (v_proposal_id, 'workflow', 'WF Object Name', 0, 0, 0, 1),
    (v_proposal_id, 'workflow', 'WF Object Name', 0, 0, 0, 2),
    (v_proposal_id, 'workflow', 'WF Object Name', 0, 0, 0, 3),
    (v_proposal_id, 'workflow', 'WF Object Name', 0, 0, 0, 4),
    (v_proposal_id, 'workflow', 'WF Object Name', 0, 0, 0, 5),
    (v_proposal_id, 'workflow', 'WF Object Name', 0, 0, 0, 6),
    (v_proposal_id, 'workflow', 'WF Object Name', 0, 0, 0, 7),
    (v_proposal_id, 'workflow', 'WF Object Name', 0, 0, 0, 8),
    (v_proposal_id, 'workflow', 'WF Object Name', 0, 0, 0, 9),
    (v_proposal_id, 'workflow', 'WF Object Name', 0, 0, 0, 10),
    (v_proposal_id, 'cost', 'Budgets', 1, 0, 0, 0),
    (v_proposal_id, 'cost', 'Commitments', 0, 0, 0, 1),
    (v_proposal_id, 'cost', 'Commitment Changes', 0, 0, 0, 2),
    (v_proposal_id, 'cost', 'Commitment Invoices', 0, 0, 0, 3),
    (v_proposal_id, 'cost', 'General Invoices', 0, 0, 0, 4),
    (v_proposal_id, 'cost', 'TBD', 0, 0, 0, 5),
    (v_proposal_id, 'cost', 'TBD', 0, 0, 0, 6),
    (v_proposal_id, 'cost', 'TBD', 0, 0, 0, 7),
    (v_proposal_id, 'cost', 'TBD', 0, 0, 0, 8);

  RETURN v_proposal_id;
END;
$function$;

-- ---------------------------------------------------------------
-- 3. Sanity check: the new RPC must produce the same row count and same
--    (service_name, row_order) pairs it produced before for Active services.
--    We can't run it as part of this migration without creating a proposal,
--    but we can verify the seed query matches the old seed query on the
--    current data:
-- ---------------------------------------------------------------

DO $$
DECLARE
  old_count INTEGER;
  new_count INTEGER;
  mismatch_count INTEGER;
BEGIN
  -- Old seed (alphabetical service_name)
  WITH old_seed AS (
    SELECT
      service_name,
      (ROW_NUMBER() OVER (ORDER BY service_name) - 1) AS row_order
    FROM (
      SELECT DISTINCT service_name
      FROM public.service_hours
      WHERE status = 'Active'
    ) d
  ),
  -- New seed (sort_order-based)
  new_seed AS (
    SELECT
      service_name,
      (ROW_NUMBER() OVER (ORDER BY min_sort_order, service_name) - 1) AS row_order
    FROM (
      SELECT service_name, MIN(sort_order) AS min_sort_order
      FROM public.service_hours
      WHERE status = 'Active'
      GROUP BY service_name
    ) d
  )
  SELECT
    (SELECT COUNT(*) FROM old_seed),
    (SELECT COUNT(*) FROM new_seed),
    (SELECT COUNT(*) FROM (
      SELECT service_name, row_order FROM old_seed
      EXCEPT
      SELECT service_name, row_order FROM new_seed
    ) diff)
  INTO old_count, new_count, mismatch_count;

  IF old_count <> new_count THEN
    RAISE EXCEPTION
      'Seed row count changed: old=%, new=%. Refusing to commit.',
      old_count, new_count;
  END IF;

  IF mismatch_count > 0 THEN
    RAISE EXCEPTION
      'Seed (service_name, row_order) pairs differ between old and new queries: % mismatches. Refusing to commit.',
      mismatch_count;
  END IF;

  RAISE NOTICE
    'Seed parity verified: % active services, identical (service_name, row_order) mapping.',
    old_count;
END $$;

COMMIT;
