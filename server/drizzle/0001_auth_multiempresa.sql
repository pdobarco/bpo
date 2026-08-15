ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "active" boolean DEFAULT true;
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "is_demo" boolean DEFAULT false;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" text NOT NULL,
  "name" text NOT NULL,
  "password_hash" text,
  "role" text DEFAULT 'OPERATOR' NOT NULL,
  "status" text DEFAULT 'ACTIVE' NOT NULL,
  "last_login_at" timestamptz,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "users_email_lower_uq" ON "users" (lower("email"));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_companies" (
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "role" text DEFAULT 'OPERATOR' NOT NULL,
  "created_at" timestamptz DEFAULT now(),
  PRIMARY KEY ("user_id", "company_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "auth_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "token_hash" text NOT NULL,
  "expires_at" timestamptz NOT NULL,
  "last_seen_at" timestamptz DEFAULT now(),
  "created_at" timestamptz DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "auth_sessions_token_hash_uq" ON "auth_sessions" ("token_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_auth_sessions_user" ON "auth_sessions" ("user_id", "expires_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_companies_company" ON "user_companies" ("company_id", "user_id");
--> statement-breakpoint
INSERT INTO "schema_meta" ("key", "value", "updated_at") VALUES ('schema_version','0.4.0',now())
ON CONFLICT ("key") DO UPDATE SET "value"=EXCLUDED."value", "updated_at"=now();
