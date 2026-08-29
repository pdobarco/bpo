CREATE TABLE IF NOT EXISTS receivables(
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  source_file_id UUID REFERENCES source_files(id) ON DELETE SET NULL,
  transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  origin_type TEXT NOT NULL DEFAULT 'MANUAL',
  customer TEXT,
  customer_document TEXT,
  description TEXT NOT NULL,
  issue_date DATE,
  due_date DATE NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  category TEXT,
  account_id UUID REFERENCES chart_accounts(id) ON DELETE SET NULL,
  classification_status TEXT DEFAULT 'PENDING',
  classification_source TEXT,
  receipt_status TEXT DEFAULT 'OPEN',
  received_amount NUMERIC(14,2) DEFAULT 0,
  received_at TIMESTAMPTZ,
  payment_method TEXT,
  invoice_ref TEXT,
  fingerprint TEXT NOT NULL,
  raw JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(company_id,fingerprint)
);

CREATE INDEX IF NOT EXISTS idx_payables_due ON payables(company_id,due_date,payment_status);
CREATE INDEX IF NOT EXISTS idx_receivables_due ON receivables(company_id,due_date,receipt_status);

INSERT INTO schema_meta(key,value,updated_at)
VALUES('schema_version','0.7.0',now())
ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=now();
