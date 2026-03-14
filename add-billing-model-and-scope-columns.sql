-- Adds support for package billing model and monthly/term/calendar invoice scopes.
-- Safe to run multiple times on PostgreSQL.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

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

-- Persist package catalog rows (names, descriptions, modules, role access, and prices)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'package_catalog_packageid_enum') THEN
    CREATE TYPE "package_catalog_packageid_enum" AS ENUM ('normal', 'silver', 'golden');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "package_catalog" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "packageId" "package_catalog_packageid_enum" NOT NULL,
  "name" character varying NOT NULL,
  "description" text NOT NULL,
  "modules" jsonb NOT NULL,
  "roleAccess" jsonb NOT NULL,
  "price" numeric(10,2) NOT NULL,
  "currency" character varying NOT NULL DEFAULT 'MK',
  "isActive" boolean NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
  CONSTRAINT "PK_package_catalog_id" PRIMARY KEY ("id"),
  CONSTRAINT "UQ_package_catalog_packageId" UNIQUE ("packageId")
);

INSERT INTO "package_catalog" ("packageId", "name", "description", "modules", "roleAccess", "price", "currency", "isActive")
VALUES
  (
    'normal',
    'Normal Package',
    'Everything except Finance and Library.',
    '["Students","Teachers","Courses","Exams","Reports","Class & Schedule Setup","Notices & Messages"]'::jsonb,
    '{"admin":"All normal modules; no Finance and no Library.","teacher":"Full teaching modules and reports.","student":"Full student learning modules and reports.","finance":"No access in this package."}'::jsonb,
    120,
    'MK',
    true
  ),
  (
    'silver',
    'Silver Package',
    'Normal Package plus Finance.',
    '["Students","Teachers","Courses","Exams","Reports","Class & Schedule Setup","Notices & Messages","Finance"]'::jsonb,
    '{"admin":"Everything in package except Library.","teacher":"Full teaching modules and reports.","student":"Full student learning modules and reports.","finance":"Full package access including Finance."}'::jsonb,
    200,
    'MK',
    true
  ),
  (
    'golden',
    'Golden Package',
    'Silver Package plus Library.',
    '["Students","Teachers","Courses","Exams","Reports","Class & Schedule Setup","Notices & Messages","Finance","Library"]'::jsonb,
    '{"admin":"Full access including Finance and Library.","teacher":"Full teaching modules and reports.","student":"Full student learning modules and reports.","finance":"Full package access including Finance."}'::jsonb,
    300,
    'MK',
    true
  )
ON CONFLICT ("packageId") DO NOTHING;
