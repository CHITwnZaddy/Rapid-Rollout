-- Top-level proposal container
CREATE TABLE proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  customer_id UUID REFERENCES customers(id),
  created_by UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'Draft',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Each proposal has up to 4 scenarios
CREATE TABLE scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID REFERENCES proposals(id) ON DELETE CASCADE NOT NULL,
  scenario_type TEXT NOT NULL CHECK (scenario_type IN ('P1','P2','Opt1','Opt2')),
  is_active BOOLEAN DEFAULT false,
  summary_total_hours NUMERIC(10,2) DEFAULT 0,
  summary_total_cost NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(proposal_id, scenario_type)
);

-- Scenario line items (the 39+ rows per scenario sheet)
CREATE TABLE scenario_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id UUID REFERENCES scenarios(id) ON DELETE CASCADE NOT NULL,
  row_order INTEGER NOT NULL,
  module TEXT NOT NULL,
  scope_selection TEXT,
  sr_im_hours NUMERIC(8,2) DEFAULT 0,
  sr_im_cost NUMERIC(10,2) DEFAULT 0,
  pm_hours NUMERIC(8,2) DEFAULT 0,
  pm_cost NUMERIC(10,2) DEFAULT 0,
  ba_hours NUMERIC(8,2) DEFAULT 0,
  ba_cost NUMERIC(10,2) DEFAULT 0,
  total_hours NUMERIC(10,2) DEFAULT 0,
  total_cost NUMERIC(12,2) DEFAULT 0,
  is_locked BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Scoped (ad-hoc) professional services
CREATE TABLE scoped_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID REFERENCES proposals(id) ON DELETE CASCADE NOT NULL,
  service_type TEXT NOT NULL,
  description TEXT,
  hours NUMERIC(8,2) NOT NULL DEFAULT 0,
  rate_card_lookup_key TEXT NOT NULL,
  cost NUMERIC(10,2) DEFAULT 0,
  row_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Migration services
CREATE TABLE migration_services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID REFERENCES proposals(id) ON DELETE CASCADE NOT NULL,
  line_label TEXT NOT NULL,
  sales_price NUMERIC(10,2) DEFAULT 0,
  migration_detail JSONB,
  row_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Bid sheet (one per proposal)
CREATE TABLE bid_sheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID REFERENCES proposals(id) ON DELETE CASCADE UNIQUE NOT NULL,
  customer_id UUID REFERENCES customers(id),
  p1_hours NUMERIC(10,2) DEFAULT 0,
  p1_cost NUMERIC(12,2) DEFAULT 0,
  p2_hours NUMERIC(10,2) DEFAULT 0,
  p2_cost NUMERIC(12,2) DEFAULT 0,
  opt1_hours NUMERIC(10,2) DEFAULT 0,
  opt1_cost NUMERIC(12,2) DEFAULT 0,
  opt2_hours NUMERIC(10,2) DEFAULT 0,
  opt2_cost NUMERIC(12,2) DEFAULT 0,
  migration_cost NUMERIC(12,2) DEFAULT 0,
  scoped_services_cost NUMERIC(12,2) DEFAULT 0,
  discount_percent NUMERIC(5,2) DEFAULT 0,
  recommended_scenario TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Audit change log
CREATE TABLE change_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID REFERENCES proposals(id) ON DELETE CASCADE,
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  action TEXT NOT NULL,
  changed_by UUID,
  old_values JSONB,
  new_values JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_proposals_created_by ON proposals(created_by);
CREATE INDEX idx_proposals_status ON proposals(status);
CREATE INDEX idx_scenarios_proposal ON scenarios(proposal_id);
CREATE INDEX idx_scenario_lines_scenario ON scenario_lines(scenario_id);
CREATE INDEX idx_scoped_services_proposal ON scoped_services(proposal_id);
CREATE INDEX idx_migration_services_proposal ON migration_services(proposal_id);
CREATE INDEX idx_change_log_proposal ON change_log(proposal_id);
