-- Bid sheet enhancement: dollar-based discount before percent discount
ALTER TABLE bid_sheets
ADD COLUMN IF NOT EXISTS discount_dollars NUMERIC(12,2) NOT NULL DEFAULT 0;
