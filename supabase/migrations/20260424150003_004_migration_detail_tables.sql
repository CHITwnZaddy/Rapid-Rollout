-- Migration configuration: one record per proposal with all parameters
CREATE TABLE migration_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE UNIQUE,

  -- Main parameters
  num_projects INTEGER DEFAULT 0,
  hrs_per_import NUMERIC(10,4) DEFAULT 0.75,
  lines_per_import_file INTEGER DEFAULT 2550,
  is_effort_included BOOLEAN DEFAULT false,
  is_workshop_included BOOLEAN DEFAULT false,
  pm_contingency_pct NUMERIC(5,4) DEFAULT 0.15,

  -- Complexity factors
  ba_complexity_factor NUMERIC(5,2) DEFAULT 1.00,
  pm_complexity_factor NUMERIC(5,2) DEFAULT 1.00,

  -- Travel
  ba_trips INTEGER DEFAULT 0,
  pm_trips INTEGER DEFAULT 0,

  -- Document migration parameters (editable defaults)
  doc_avg_mb_per_project NUMERIC(12,2) DEFAULT 150000,
  doc_mb_per_hour NUMERIC(12,2) DEFAULT 15000,

  -- Core data migration effort hours (editable defaults)
  core_requirements_hrs NUMERIC(10,2) DEFAULT 32,
  core_migration_plan_hrs NUMERIC(10,2) DEFAULT 32,
  core_validation_hrs NUMERIC(10,2) DEFAULT 20,
  core_final_qa_hrs NUMERIC(10,2) DEFAULT 16,
  core_pm_oversight_hrs NUMERIC(10,2) DEFAULT 20,

  -- Computed totals (updated by the app whenever inputs change)
  computed_total_cost NUMERIC(12,2) DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Migration detail lines: project, workflow, and cost data rows
CREATE TABLE migration_detail_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  section TEXT NOT NULL CHECK (section IN ('project', 'workflow', 'cost')),
  label TEXT NOT NULL,
  quantity NUMERIC(12,2) DEFAULT 0,
  items_per_object NUMERIC(12,2) DEFAULT 0,
  total_line_items NUMERIC(12,2) DEFAULT 0,
  row_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_migration_config_proposal ON migration_config(proposal_id);
CREATE INDEX idx_migration_detail_proposal ON migration_detail_lines(proposal_id);
CREATE INDEX idx_migration_detail_section ON migration_detail_lines(proposal_id, section);

-- RLS
ALTER TABLE migration_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE migration_detail_lines ENABLE ROW LEVEL SECURITY;

-- migration_config policies (same pattern as other proposal-related tables)
CREATE POLICY "Users can view migration_config for own proposals"
  ON migration_config FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM proposals p
      WHERE p.id = migration_config.proposal_id
        AND (p.created_by = auth.uid()
             OR (auth.jwt()->'app_metadata'->>'role') = 'admin')
    )
  );

CREATE POLICY "Users can insert migration_config for own proposals"
  ON migration_config FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM proposals p
      WHERE p.id = migration_config.proposal_id
        AND (p.created_by = auth.uid()
             OR (auth.jwt()->'app_metadata'->>'role') = 'admin')
    )
  );

CREATE POLICY "Users can update migration_config for own proposals"
  ON migration_config FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM proposals p
      WHERE p.id = migration_config.proposal_id
        AND (p.created_by = auth.uid()
             OR (auth.jwt()->'app_metadata'->>'role') = 'admin')
    )
  );

CREATE POLICY "Users can delete migration_config for own proposals"
  ON migration_config FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM proposals p
      WHERE p.id = migration_config.proposal_id
        AND (p.created_by = auth.uid()
             OR (auth.jwt()->'app_metadata'->>'role') = 'admin')
    )
  );

-- migration_detail_lines policies
CREATE POLICY "Users can view migration_detail_lines for own proposals"
  ON migration_detail_lines FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM proposals p
      WHERE p.id = migration_detail_lines.proposal_id
        AND (p.created_by = auth.uid()
             OR (auth.jwt()->'app_metadata'->>'role') = 'admin')
    )
  );

CREATE POLICY "Users can insert migration_detail_lines for own proposals"
  ON migration_detail_lines FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM proposals p
      WHERE p.id = migration_detail_lines.proposal_id
        AND (p.created_by = auth.uid()
             OR (auth.jwt()->'app_metadata'->>'role') = 'admin')
    )
  );

CREATE POLICY "Users can update migration_detail_lines for own proposals"
  ON migration_detail_lines FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM proposals p
      WHERE p.id = migration_detail_lines.proposal_id
        AND (p.created_by = auth.uid()
             OR (auth.jwt()->'app_metadata'->>'role') = 'admin')
    )
  );

CREATE POLICY "Users can delete migration_detail_lines for own proposals"
  ON migration_detail_lines FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM proposals p
      WHERE p.id = migration_detail_lines.proposal_id
        AND (p.created_by = auth.uid()
             OR (auth.jwt()->'app_metadata'->>'role') = 'admin')
    )
  );
