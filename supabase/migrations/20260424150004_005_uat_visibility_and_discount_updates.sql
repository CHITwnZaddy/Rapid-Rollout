-- Bid sheet enhancement: dollar-based discount before percent discount
ALTER TABLE bid_sheets
ADD COLUMN IF NOT EXISTS discount_dollars NUMERIC(12,2) NOT NULL DEFAULT 0;

-- Customers: allow authenticated users to manage customers (not just admins)
DROP POLICY IF EXISTS "Admins can modify customers" ON customers;
CREATE POLICY "Authenticated users can modify customers"
  ON customers FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

-- Proposals: all authenticated can read, but only owner/admin can modify
DROP POLICY IF EXISTS "Users can read own proposals" ON proposals;
DROP POLICY IF EXISTS "Users can insert own proposals" ON proposals;
DROP POLICY IF EXISTS "Users can update own proposals" ON proposals;
DROP POLICY IF EXISTS "Users can delete own proposals" ON proposals;

CREATE POLICY "Authenticated users can read proposals"
  ON proposals FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "Users can insert own proposals"
  ON proposals FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
CREATE POLICY "Users can update own proposals or admin"
  ON proposals FOR UPDATE TO authenticated
  USING (
    created_by = auth.uid()
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );
CREATE POLICY "Users can delete own proposals or admin"
  ON proposals FOR DELETE TO authenticated
  USING (
    created_by = auth.uid()
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

-- Scenarios
DROP POLICY IF EXISTS "Users can read scenarios via proposal" ON scenarios;
DROP POLICY IF EXISTS "Users can modify scenarios via proposal" ON scenarios;
CREATE POLICY "Authenticated users can read scenarios via proposal"
  ON scenarios FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM proposals
      WHERE proposals.id = scenarios.proposal_id
    )
  );
CREATE POLICY "Users can modify scenarios via owned proposal or admin"
  ON scenarios FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM proposals
      WHERE proposals.id = scenarios.proposal_id
        AND (
          proposals.created_by = auth.uid()
          OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM proposals
      WHERE proposals.id = scenarios.proposal_id
        AND (
          proposals.created_by = auth.uid()
          OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
        )
    )
  );

-- Scenario lines
DROP POLICY IF EXISTS "Users can read scenario_lines via proposal" ON scenario_lines;
DROP POLICY IF EXISTS "Users can modify scenario_lines via proposal" ON scenario_lines;
CREATE POLICY "Authenticated users can read scenario_lines via proposal"
  ON scenario_lines FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM scenarios
      JOIN proposals ON proposals.id = scenarios.proposal_id
      WHERE scenarios.id = scenario_lines.scenario_id
    )
  );
CREATE POLICY "Users can modify scenario_lines via owned proposal or admin"
  ON scenario_lines FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM scenarios
      JOIN proposals ON proposals.id = scenarios.proposal_id
      WHERE scenarios.id = scenario_lines.scenario_id
        AND (
          proposals.created_by = auth.uid()
          OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM scenarios
      JOIN proposals ON proposals.id = scenarios.proposal_id
      WHERE scenarios.id = scenario_lines.scenario_id
        AND (
          proposals.created_by = auth.uid()
          OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
        )
    )
  );

-- Scoped services
DROP POLICY IF EXISTS "Users can read scoped_services via proposal" ON scoped_services;
DROP POLICY IF EXISTS "Users can modify scoped_services via proposal" ON scoped_services;
CREATE POLICY "Authenticated users can read scoped_services via proposal"
  ON scoped_services FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM proposals
      WHERE proposals.id = scoped_services.proposal_id
    )
  );
CREATE POLICY "Users can modify scoped_services via owned proposal or admin"
  ON scoped_services FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM proposals
      WHERE proposals.id = scoped_services.proposal_id
        AND (
          proposals.created_by = auth.uid()
          OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM proposals
      WHERE proposals.id = scoped_services.proposal_id
        AND (
          proposals.created_by = auth.uid()
          OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
        )
    )
  );

-- Migration services
DROP POLICY IF EXISTS "Users can read migration_services via proposal" ON migration_services;
DROP POLICY IF EXISTS "Users can modify migration_services via proposal" ON migration_services;
CREATE POLICY "Authenticated users can read migration_services via proposal"
  ON migration_services FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM proposals
      WHERE proposals.id = migration_services.proposal_id
    )
  );
CREATE POLICY "Users can modify migration_services via owned proposal or admin"
  ON migration_services FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM proposals
      WHERE proposals.id = migration_services.proposal_id
        AND (
          proposals.created_by = auth.uid()
          OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM proposals
      WHERE proposals.id = migration_services.proposal_id
        AND (
          proposals.created_by = auth.uid()
          OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
        )
    )
  );

-- Bid sheets
DROP POLICY IF EXISTS "Users can read bid_sheets via proposal" ON bid_sheets;
DROP POLICY IF EXISTS "Users can modify bid_sheets via proposal" ON bid_sheets;
CREATE POLICY "Authenticated users can read bid_sheets via proposal"
  ON bid_sheets FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM proposals
      WHERE proposals.id = bid_sheets.proposal_id
    )
  );
CREATE POLICY "Users can modify bid_sheets via owned proposal or admin"
  ON bid_sheets FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM proposals
      WHERE proposals.id = bid_sheets.proposal_id
        AND (
          proposals.created_by = auth.uid()
          OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM proposals
      WHERE proposals.id = bid_sheets.proposal_id
        AND (
          proposals.created_by = auth.uid()
          OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
        )
    )
  );

-- Migration config and detail lines policies were created in migration 004.
DROP POLICY IF EXISTS "Users can view migration_config for own proposals" ON migration_config;
DROP POLICY IF EXISTS "Users can insert migration_config for own proposals" ON migration_config;
DROP POLICY IF EXISTS "Users can update migration_config for own proposals" ON migration_config;
DROP POLICY IF EXISTS "Users can delete migration_config for own proposals" ON migration_config;

CREATE POLICY "Authenticated users can view migration_config via proposal"
  ON migration_config FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM proposals p
      WHERE p.id = migration_config.proposal_id
    )
  );
CREATE POLICY "Users can insert migration_config via owned proposal or admin"
  ON migration_config FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM proposals p
      WHERE p.id = migration_config.proposal_id
        AND (
          p.created_by = auth.uid()
          OR (auth.jwt()->'app_metadata'->>'role') = 'admin'
        )
    )
  );
CREATE POLICY "Users can update migration_config via owned proposal or admin"
  ON migration_config FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM proposals p
      WHERE p.id = migration_config.proposal_id
        AND (
          p.created_by = auth.uid()
          OR (auth.jwt()->'app_metadata'->>'role') = 'admin'
        )
    )
  );
CREATE POLICY "Users can delete migration_config via owned proposal or admin"
  ON migration_config FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM proposals p
      WHERE p.id = migration_config.proposal_id
        AND (
          p.created_by = auth.uid()
          OR (auth.jwt()->'app_metadata'->>'role') = 'admin'
        )
    )
  );

DROP POLICY IF EXISTS "Users can view migration_detail_lines for own proposals" ON migration_detail_lines;
DROP POLICY IF EXISTS "Users can insert migration_detail_lines for own proposals" ON migration_detail_lines;
DROP POLICY IF EXISTS "Users can update migration_detail_lines for own proposals" ON migration_detail_lines;
DROP POLICY IF EXISTS "Users can delete migration_detail_lines for own proposals" ON migration_detail_lines;

CREATE POLICY "Authenticated users can view migration_detail_lines via proposal"
  ON migration_detail_lines FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM proposals p
      WHERE p.id = migration_detail_lines.proposal_id
    )
  );
CREATE POLICY "Users can insert migration_detail_lines via owned proposal or admin"
  ON migration_detail_lines FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM proposals p
      WHERE p.id = migration_detail_lines.proposal_id
        AND (
          p.created_by = auth.uid()
          OR (auth.jwt()->'app_metadata'->>'role') = 'admin'
        )
    )
  );
CREATE POLICY "Users can update migration_detail_lines via owned proposal or admin"
  ON migration_detail_lines FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM proposals p
      WHERE p.id = migration_detail_lines.proposal_id
        AND (
          p.created_by = auth.uid()
          OR (auth.jwt()->'app_metadata'->>'role') = 'admin'
        )
    )
  );
CREATE POLICY "Users can delete migration_detail_lines via owned proposal or admin"
  ON migration_detail_lines FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM proposals p
      WHERE p.id = migration_detail_lines.proposal_id
        AND (
          p.created_by = auth.uid()
          OR (auth.jwt()->'app_metadata'->>'role') = 'admin'
        )
    )
  );
