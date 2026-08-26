ALTER TABLE "source_files" ADD COLUMN IF NOT EXISTS "content" bytea;
--> statement-breakpoint
ALTER TABLE "source_files" ADD COLUMN IF NOT EXISTS "mime_type" text;
--> statement-breakpoint
ALTER TABLE "source_files" ADD COLUMN IF NOT EXISTS "import_scope" text DEFAULT 'GENERAL';
--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "custom_title" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "title_rewrite_rules" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid REFERENCES "companies"("id") ON DELETE CASCADE,
  "pattern" text NOT NULL,
  "normalized_party" text,
  "custom_title" text NOT NULL,
  "active" boolean DEFAULT true,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "title_rewrite_rules_company_pattern_uq" ON "title_rewrite_rules" ("company_id","pattern");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payables" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid REFERENCES "companies"("id") ON DELETE CASCADE,
  "source_file_id" uuid REFERENCES "source_files"("id") ON DELETE SET NULL,
  "transaction_id" uuid REFERENCES "transactions"("id") ON DELETE SET NULL,
  "origin_type" text NOT NULL DEFAULT 'MANUAL',
  "supplier" text,
  "supplier_document" text,
  "description" text NOT NULL,
  "issue_date" date,
  "due_date" date NOT NULL,
  "amount" numeric(14,2) NOT NULL,
  "category" text,
  "account_id" uuid REFERENCES "chart_accounts"("id") ON DELETE SET NULL,
  "classification_status" text DEFAULT 'PENDING',
  "classification_source" text,
  "payment_status" text DEFAULT 'OPEN',
  "paid_amount" numeric(14,2) DEFAULT 0,
  "paid_at" timestamptz,
  "payment_method" text,
  "invoice_ref" text,
  "fingerprint" text NOT NULL,
  "raw" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "payables_company_fingerprint_uq" ON "payables" ("company_id","fingerprint");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reconciliation_ignores" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid REFERENCES "companies"("id") ON DELETE CASCADE,
  "transaction_id" uuid REFERENCES "transactions"("id") ON DELETE CASCADE,
  "reason" text,
  "created_at" timestamptz DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "reconciliation_ignores_company_transaction_uq" ON "reconciliation_ignores" ("company_id","transaction_id");
--> statement-breakpoint
INSERT INTO "schema_meta" ("key", "value", "updated_at") VALUES ('schema_version','0.6.0',now())
ON CONFLICT ("key") DO UPDATE SET "value"=EXCLUDED."value", "updated_at"=now();
