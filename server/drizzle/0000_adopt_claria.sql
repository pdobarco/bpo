-- Baseline de adoção do Drizzle para bancos Claria existentes.
-- O bootstrap legado-idempotente garante as tabelas antes desta migration.
CREATE TABLE IF NOT EXISTS "schema_meta" (
  "key" text PRIMARY KEY NOT NULL,
  "value" text NOT NULL,
  "updated_at" timestamptz DEFAULT now()
);
--> statement-breakpoint
INSERT INTO "schema_meta" ("key", "value", "updated_at")
VALUES ('schema_version', '0.3.0', now())
ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value", "updated_at" = now();
