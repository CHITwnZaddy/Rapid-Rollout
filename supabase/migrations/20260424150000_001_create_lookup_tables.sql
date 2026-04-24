-- Rate card: labor costs per role
CREATE TABLE rate_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_card_name TEXT NOT NULL,
  activity TEXT NOT NULL,
  rate NUMERIC(10,2) NOT NULL,
  role_category TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Active',
  lookup_key TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Service hours: effort by module and scope selection
CREATE TABLE service_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name TEXT NOT NULL,
  scope_value TEXT NOT NULL,
  ba_hours NUMERIC(8,2) DEFAULT 0,
  pm_hours NUMERIC(8,2) DEFAULT 0,
  sr_im_hours NUMERIC(8,2) DEFAULT 0,
  scope_label TEXT NOT NULL,
  service_group TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Active',
  lookup_key TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Customer list
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for lookup performance
CREATE INDEX idx_service_hours_lookup ON service_hours(lookup_key);
CREATE INDEX idx_service_hours_name ON service_hours(service_name);
CREATE INDEX idx_rate_cards_lookup ON rate_cards(lookup_key);
CREATE INDEX idx_customers_name ON customers(company_name);
