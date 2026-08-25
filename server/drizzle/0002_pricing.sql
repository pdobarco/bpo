CREATE TABLE IF NOT EXISTS "pricing_models" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid REFERENCES "companies"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "mode" text DEFAULT 'SALE' NOT NULL,
  "lines" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "target_margin" numeric DEFAULT 20,
  "markup" numeric DEFAULT 2,
  "active" boolean DEFAULT true,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pricing_models_company_name_uq" ON "pricing_models" ("company_id","name");
--> statement-breakpoint
INSERT INTO "schema_meta" ("key", "value", "updated_at") VALUES ('schema_version','0.5.0',now())
ON CONFLICT ("key") DO UPDATE SET "value"=EXCLUDED."value", "updated_at"=now();
