-- Adds support for package billing model and monthly/term/calendar invoice scopes.
-- Safe to run multiple times on PostgreSQL.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'school_billing_plan_cadence_enum'
  ) THEN
    ALTER TYPE "school_billing_plan_cadence_enum" ADD VALUE IF NOT EXISTS 'monthly';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'school_billing_plan_plantype_enum') THEN
    CREATE TYPE "school_billing_plan_plantype_enum" AS ENUM ('per_student', 'package');
  END IF;
END $$;

ALTER TABLE "school_billing_plan"
  ADD COLUMN IF NOT EXISTS "planType" "school_billing_plan_plantype_enum" NOT NULL DEFAULT 'per_student';

ALTER TABLE "school_billing_plan"
  ALTER COLUMN "ratePerStudent" SET DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'billing_invoice_billingscope_enum') THEN
    CREATE TYPE "billing_invoice_billingscope_enum" AS ENUM ('monthly', 'term', 'academic_calendar');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'billing_invoice_plantype_enum') THEN
    CREATE TYPE "billing_invoice_plantype_enum" AS ENUM ('per_student', 'package');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'billing_invoice_packageid_enum') THEN
    CREATE TYPE "billing_invoice_packageid_enum" AS ENUM ('normal', 'silver', 'golden');
  END IF;
END $$;

ALTER TABLE "billing_invoice"
  ADD COLUMN IF NOT EXISTS "billingMonth" character varying(7),
  ADD COLUMN IF NOT EXISTS "billingScope" "billing_invoice_billingscope_enum" NOT NULL DEFAULT 'term',
  ADD COLUMN IF NOT EXISTS "planType" "billing_invoice_plantype_enum" NOT NULL DEFAULT 'per_student',
  ADD COLUMN IF NOT EXISTS "packageId" "billing_invoice_packageid_enum",
  ADD COLUMN IF NOT EXISTS "packageRate" numeric(10,2);

UPDATE "billing_invoice"
SET "billingScope" = CASE
  WHEN "termId" IS NOT NULL THEN 'term'::"billing_invoice_billingscope_enum"
  WHEN "academicCalendarId" IS NOT NULL THEN 'academic_calendar'::"billing_invoice_billingscope_enum"
  ELSE 'term'::"billing_invoice_billingscope_enum"
END
WHERE "billingScope" IS NULL;
