-- Enable RLS on all tables
ALTER TABLE rate_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE scenario_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE scoped_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE migration_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE bid_sheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE change_log ENABLE ROW LEVEL SECURITY;

-- Lookup tables: anyone authenticated can read, only admins can modify
CREATE POLICY "Authenticated users can read rate_cards"
  ON rate_cards FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can modify rate_cards"
  ON rate_cards FOR ALL TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Authenticated users can read service_hours"
  ON service_hours FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can modify service_hours"
  ON service_hours FOR ALL TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Authenticated users can read customers"
  ON customers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can modify customers"
  ON customers FOR ALL TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Proposals: users see own, admins see all
CREATE POLICY "Users can read own proposals"
  ON proposals FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );
CREATE POLICY "Users can insert own proposals"
  ON proposals FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
CREATE POLICY "Users can update own proposals"
  ON proposals FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );
CREATE POLICY "Users can delete own proposals"
  ON proposals FOR DELETE TO authenticated
  USING (
    created_by = auth.uid()
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

-- Scenarios: access through proposal ownership
CREATE POLICY "Users can read scenarios via proposal"
  ON scenarios FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM proposals
      WHERE proposals.id = scenarios.proposal_id
      AND (proposals.created_by = auth.uid()
           OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
    )
  );
CREATE POLICY "Users can modify scenarios via proposal"
  ON scenarios FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM proposals
      WHERE proposals.id = scenarios.proposal_id
      AND (proposals.created_by = auth.uid()
           OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
    )
  );

-- Scenario lines: access through scenario -> proposal
CREATE POLICY "Users can read scenario_lines via proposal"
  ON scenario_lines FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM scenarios
      JOIN proposals ON proposals.id = scenarios.proposal_id
      WHERE scenarios.id = scenario_lines.scenario_id
      AND (proposals.created_by = auth.uid()
           OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
    )
  );
CREATE POLICY "Users can modify scenario_lines via proposal"
  ON scenario_lines FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM scenarios
      JOIN proposals ON proposals.id = scenarios.proposal_id
      WHERE scenarios.id = scenario_lines.scenario_id
      AND (proposals.created_by = auth.uid()
           OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
    )
  );

-- Scoped services: access through proposal
CREATE POLICY "Users can read scoped_services via proposal"
  ON scoped_services FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM proposals
      WHERE proposals.id = scoped_services.proposal_id
      AND (proposals.created_by = auth.uid()
           OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
    )
  );
CREATE POLICY "Users can modify scoped_services via proposal"
  ON scoped_services FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM proposals
      WHERE proposals.id = scoped_services.proposal_id
      AND (proposals.created_by = auth.uid()
           OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
    )
  );

-- Migration services: same pattern
CREATE POLICY "Users can read migration_services via proposal"
  ON migration_services FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM proposals
      WHERE proposals.id = migration_services.proposal_id
      AND (proposals.created_by = auth.uid()
           OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
    )
  );
CREATE POLICY "Users can modify migration_services via proposal"
  ON migration_services FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM proposals
      WHERE proposals.id = migration_services.proposal_id
      AND (proposals.created_by = auth.uid()
           OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
    )
  );

-- Bid sheets: same pattern
CREATE POLICY "Users can read bid_sheets via proposal"
  ON bid_sheets FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM proposals
      WHERE proposals.id = bid_sheets.proposal_id
      AND (proposals.created_by = auth.uid()
           OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
    )
  );
CREATE POLICY "Users can modify bid_sheets via proposal"
  ON bid_sheets FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM proposals
      WHERE proposals.id = bid_sheets.proposal_id
      AND (proposals.created_by = auth.uid()
           OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
    )
  );

-- Change log: read access through proposal, insert for authenticated
CREATE POLICY "Users can read change_log via proposal"
  ON change_log FOR SELECT TO authenticated
  USING (
    proposal_id IS NULL
    OR EXISTS (
      SELECT 1 FROM proposals
      WHERE proposals.id = change_log.proposal_id
      AND (proposals.created_by = auth.uid()
           OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
    )
  );
CREATE POLICY "Authenticated users can insert change_log"
  ON change_log FOR INSERT TO authenticated
  WITH CHECK (true);
