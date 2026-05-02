-- Phase 1 sales ops dashboard foundation:
--   - Manager-aware role helper functions
--   - KPI targets
--   - Editable stale thresholds
--   - Editable variance reasons
--   - Proposal closeout fields
--   - Manager-aware RLS for settings, proposal updates, status history, and change log

BEGIN;

-- =====================================================================
-- Role helpers
-- =====================================================================

CREATE OR REPLACE FUNCTION public.current_app_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(((SELECT auth.jwt()) -> 'app_metadata' ->> 'role'), 'user');
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT public.current_app_role() = 'admin';
$$;

CREATE OR REPLACE FUNCTION public.is_manager_or_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT public.current_app_role() IN ('manager', 'admin');
$$;

GRANT EXECUTE ON FUNCTION public.current_app_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_manager_or_admin() TO authenticated;

-- =====================================================================
-- KPI targets
-- =====================================================================

CREATE TABLE public.kpi_year_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year INTEGER NOT NULL UNIQUE,
  label TEXT NOT NULL,
  team_quota NUMERIC(14,2) NOT NULL CHECK (team_quota >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.kpi_user_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  year INTEGER NOT NULL REFERENCES public.kpi_year_targets(year) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_amount NUMERIC(14,2) NOT NULL CHECK (target_amount >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (year, user_id)
);

CREATE INDEX idx_kpi_user_targets_user_year
  ON public.kpi_user_targets(user_id, year);

INSERT INTO public.kpi_year_targets (year, label, team_quota)
VALUES
  (2026, 'FY26', 8000000.00),
  (2027, 'FY27', 9000000.00),
  (2028, 'FY28', 10000000.00),
  (2029, 'FY29', 11000000.00)
ON CONFLICT (year)
DO UPDATE SET
  label = EXCLUDED.label,
  team_quota = EXCLUDED.team_quota,
  is_active = true,
  updated_at = now();

ALTER TABLE public.kpi_year_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_user_targets ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.kpi_year_targets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kpi_user_targets TO authenticated;

CREATE POLICY "Authenticated users can read active KPI year targets"
  ON public.kpi_year_targets FOR SELECT
  TO authenticated
  USING (is_active OR public.is_manager_or_admin());

CREATE POLICY "Managers can insert KPI year targets"
  ON public.kpi_year_targets FOR INSERT
  TO authenticated
  WITH CHECK (public.is_manager_or_admin());

CREATE POLICY "Managers can update KPI year targets"
  ON public.kpi_year_targets FOR UPDATE
  TO authenticated
  USING (public.is_manager_or_admin())
  WITH CHECK (public.is_manager_or_admin());

CREATE POLICY "Managers can delete KPI year targets"
  ON public.kpi_year_targets FOR DELETE
  TO authenticated
  USING (public.is_manager_or_admin());

CREATE POLICY "Users can read own KPI target or managers can read all"
  ON public.kpi_user_targets FOR SELECT
  TO authenticated
  USING ((user_id = (SELECT auth.uid())) OR public.is_manager_or_admin());

CREATE POLICY "Managers can insert KPI user targets"
  ON public.kpi_user_targets FOR INSERT
  TO authenticated
  WITH CHECK (public.is_manager_or_admin());

CREATE POLICY "Managers can update KPI user targets"
  ON public.kpi_user_targets FOR UPDATE
  TO authenticated
  USING (public.is_manager_or_admin())
  WITH CHECK (public.is_manager_or_admin());

CREATE POLICY "Managers can delete KPI user targets"
  ON public.kpi_user_targets FOR DELETE
  TO authenticated
  USING (public.is_manager_or_admin());

-- =====================================================================
-- Stale thresholds
-- =====================================================================

CREATE TABLE public.proposal_stale_thresholds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL UNIQUE,
  threshold_days INTEGER NOT NULL CHECK (threshold_days > 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.proposal_stale_thresholds (status, threshold_days)
VALUES
  ('Discovery', 21),
  ('Scoping', 21),
  ('Proposal Draft', 5),
  ('Sent for Review', 3),
  ('Negotiations', 3),
  ('Awaiting Sig', 14)
ON CONFLICT (status)
DO UPDATE SET
  threshold_days = EXCLUDED.threshold_days,
  is_active = true,
  updated_at = now();

ALTER TABLE public.proposal_stale_thresholds ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.proposal_stale_thresholds TO authenticated;

CREATE POLICY "Authenticated users can read active stale thresholds"
  ON public.proposal_stale_thresholds FOR SELECT
  TO authenticated
  USING (is_active OR public.is_manager_or_admin());

CREATE POLICY "Managers can insert stale thresholds"
  ON public.proposal_stale_thresholds FOR INSERT
  TO authenticated
  WITH CHECK (public.is_manager_or_admin());

CREATE POLICY "Managers can update stale thresholds"
  ON public.proposal_stale_thresholds FOR UPDATE
  TO authenticated
  USING (public.is_manager_or_admin())
  WITH CHECK (public.is_manager_or_admin());

CREATE POLICY "Managers can delete stale thresholds"
  ON public.proposal_stale_thresholds FOR DELETE
  TO authenticated
  USING (public.is_manager_or_admin());

-- =====================================================================
-- Variance reasons
-- =====================================================================

CREATE TABLE public.proposal_variance_reasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.proposal_variance_reasons (
  code,
  label,
  description,
  sort_order
)
VALUES
  ('ae_discount', 'AE discount', 'Sr. AE discounted before signature', 10),
  ('scope_removed', 'Scope removed', 'Client removed optional work', 20),
  ('pricing_correction', 'Pricing correction', 'Error caught before LoE', 30),
  (
    'client_negotiation',
    'Client negotiation',
    'Final commercial negotiation changed price',
    40
  )
ON CONFLICT (code)
DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  is_active = true,
  updated_at = now();

ALTER TABLE public.proposal_variance_reasons ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.proposal_variance_reasons TO authenticated;

CREATE POLICY "Authenticated users can read active variance reasons"
  ON public.proposal_variance_reasons FOR SELECT
  TO authenticated
  USING (is_active OR public.is_manager_or_admin());

CREATE POLICY "Managers can insert variance reasons"
  ON public.proposal_variance_reasons FOR INSERT
  TO authenticated
  WITH CHECK (public.is_manager_or_admin());

CREATE POLICY "Managers can update variance reasons"
  ON public.proposal_variance_reasons FOR UPDATE
  TO authenticated
  USING (public.is_manager_or_admin())
  WITH CHECK (public.is_manager_or_admin());

CREATE POLICY "Managers can delete variance reasons"
  ON public.proposal_variance_reasons FOR DELETE
  TO authenticated
  USING (public.is_manager_or_admin());

-- =====================================================================
-- Proposal closeout fields
-- =====================================================================

ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS sold_price NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS loe_value NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS loe_signed_date DATE,
  ADD COLUMN IF NOT EXISTS variance_reason_code TEXT
    REFERENCES public.proposal_variance_reasons(code),
  ADD COLUMN IF NOT EXISTS variance_note TEXT,
  ADD COLUMN IF NOT EXISTS closed_lost_reason TEXT,
  ADD COLUMN IF NOT EXISTS closed_lost_note TEXT,
  ADD COLUMN IF NOT EXISTS closed_financials_corrected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_financials_corrected_by UUID
    REFERENCES auth.users(id);

ALTER TABLE public.proposals
  ADD CONSTRAINT proposals_sold_price_nonnegative
    CHECK (sold_price IS NULL OR sold_price >= 0),
  ADD CONSTRAINT proposals_loe_value_nonnegative
    CHECK (loe_value IS NULL OR loe_value >= 0);

CREATE INDEX IF NOT EXISTS idx_proposals_loe_signed_date
  ON public.proposals(loe_signed_date);

CREATE INDEX IF NOT EXISTS idx_proposals_variance_reason_code
  ON public.proposals(variance_reason_code);

-- =====================================================================
-- Manager-aware RLS updates
-- =====================================================================

DROP POLICY IF EXISTS "Users can update own proposals or admin"
  ON public.proposals;
CREATE POLICY "Users can update own proposals or manager"
  ON public.proposals FOR UPDATE
  TO authenticated
  USING (
    (created_by = (SELECT auth.uid()))
    OR public.is_manager_or_admin()
  )
  WITH CHECK (
    (created_by = (SELECT auth.uid()))
    OR public.is_manager_or_admin()
  );

DROP POLICY IF EXISTS "Users can read change_log via proposal"
  ON public.change_log;
CREATE POLICY "Users can read change_log via proposal or manager"
  ON public.change_log FOR SELECT
  TO authenticated
  USING (
    public.is_manager_or_admin()
    OR (proposal_id IS NULL)
    OR EXISTS (
      SELECT 1
      FROM public.proposals
      WHERE proposals.id = change_log.proposal_id
        AND proposals.created_by = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can insert proposal_status_history via owned proposal or "
  ON public.proposal_status_history;
DROP POLICY IF EXISTS "Users can insert proposal_status_history via owned proposal or admin"
  ON public.proposal_status_history;
CREATE POLICY "Users can insert proposal_status_history via owned proposal or manager"
  ON public.proposal_status_history FOR INSERT
  TO authenticated
  WITH CHECK (
    (changed_by = (SELECT auth.uid()))
    AND EXISTS (
      SELECT 1
      FROM public.proposals
      WHERE proposals.id = proposal_status_history.proposal_id
        AND (
          proposals.created_by = (SELECT auth.uid())
          OR public.is_manager_or_admin()
        )
    )
  );

COMMIT;
