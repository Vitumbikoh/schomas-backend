-- Inventory & Asset Management schema for EduNexus
-- Multi-tenant by schoolId with school-scoped uniqueness constraints

CREATE TABLE IF NOT EXISTS assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "assetTag" varchar NOT NULL,
  name varchar NOT NULL,
  category varchar NOT NULL,
  description text,
  "purchaseDate" date,
  "purchaseCost" numeric(12,2) NOT NULL DEFAULT 0,
  supplier varchar,
  status varchar NOT NULL DEFAULT 'active',
  location varchar,
  department varchar,
  "assignedUserId" uuid,
  "createdById" uuid,
  "schoolId" uuid NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "UQ_assets_school_assetTag" UNIQUE ("schoolId", "assetTag"),
  CONSTRAINT "FK_assets_school" FOREIGN KEY ("schoolId") REFERENCES schools(id) ON DELETE CASCADE,
  CONSTRAINT "FK_assets_assigned_user" FOREIGN KEY ("assignedUserId") REFERENCES "user"(id) ON DELETE SET NULL,
  CONSTRAINT "FK_assets_created_by" FOREIGN KEY ("createdById") REFERENCES "user"(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS asset_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "assetId" uuid NOT NULL,
  "assignedUserId" uuid,
  "assignedLocation" varchar,
  "assignedDepartment" varchar,
  "assignedAt" timestamptz NOT NULL DEFAULT now(),
  "releasedAt" timestamptz,
  "releaseReason" varchar,
  status varchar NOT NULL DEFAULT 'active',
  notes text,
  "assignedById" uuid,
  "schoolId" uuid NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "FK_asset_assignments_asset" FOREIGN KEY ("assetId") REFERENCES assets(id) ON DELETE CASCADE,
  CONSTRAINT "FK_asset_assignments_assigned_user" FOREIGN KEY ("assignedUserId") REFERENCES "user"(id) ON DELETE SET NULL,
  CONSTRAINT "FK_asset_assignments_assigned_by" FOREIGN KEY ("assignedById") REFERENCES "user"(id) ON DELETE SET NULL,
  CONSTRAINT "FK_asset_assignments_school" FOREIGN KEY ("schoolId") REFERENCES schools(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS maintenance_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "assetId" uuid NOT NULL,
  "issueDescription" text NOT NULL,
  "maintenanceType" varchar NOT NULL DEFAULT 'repair',
  "maintenanceDate" timestamptz NOT NULL DEFAULT now(),
  "repairCost" numeric(12,2) NOT NULL DEFAULT 0,
  status varchar NOT NULL DEFAULT 'pending',
  "resolutionNotes" text,
  "nextMaintenanceDate" date,
  "reportedById" uuid,
  "completedById" uuid,
  "expenseId" uuid,
  "schoolId" uuid NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "FK_maintenance_logs_asset" FOREIGN KEY ("assetId") REFERENCES assets(id) ON DELETE CASCADE,
  CONSTRAINT "FK_maintenance_logs_reported_by" FOREIGN KEY ("reportedById") REFERENCES "user"(id) ON DELETE SET NULL,
  CONSTRAINT "FK_maintenance_logs_completed_by" FOREIGN KEY ("completedById") REFERENCES "user"(id) ON DELETE SET NULL,
  CONSTRAINT "FK_maintenance_logs_school" FOREIGN KEY ("schoolId") REFERENCES schools(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "itemCode" varchar NOT NULL,
  name varchar NOT NULL,
  category varchar NOT NULL,
  unit varchar,
  description text,
  "currentStock" integer NOT NULL DEFAULT 0,
  "minimumThreshold" integer NOT NULL DEFAULT 0,
  "unitCost" numeric(12,2) NOT NULL DEFAULT 0,
  supplier varchar,
  "schoolId" uuid NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "UQ_inventory_items_school_itemCode" UNIQUE ("schoolId", "itemCode"),
  CONSTRAINT "FK_inventory_items_school" FOREIGN KEY ("schoolId") REFERENCES schools(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS stock_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "itemId" uuid NOT NULL,
  "transactionType" varchar NOT NULL,
  quantity integer NOT NULL,
  "unitCost" numeric(12,2),
  "totalCost" numeric(12,2) NOT NULL DEFAULT 0,
  "transactionDate" timestamptz NOT NULL DEFAULT now(),
  reference varchar,
  notes text,
  "performedById" uuid,
  "schoolId" uuid NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "FK_stock_transactions_item" FOREIGN KEY ("itemId") REFERENCES inventory_items(id) ON DELETE CASCADE,
  CONSTRAINT "FK_stock_transactions_performed_by" FOREIGN KEY ("performedById") REFERENCES "user"(id) ON DELETE SET NULL,
  CONSTRAINT "FK_stock_transactions_school" FOREIGN KEY ("schoolId") REFERENCES schools(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "IDX_assets_school" ON assets ("schoolId");
CREATE INDEX IF NOT EXISTS "IDX_asset_assignments_school" ON asset_assignments ("schoolId");
CREATE INDEX IF NOT EXISTS "IDX_maintenance_logs_school" ON maintenance_logs ("schoolId");
CREATE INDEX IF NOT EXISTS "IDX_inventory_items_school" ON inventory_items ("schoolId");
CREATE INDEX IF NOT EXISTS "IDX_stock_transactions_school" ON stock_transactions ("schoolId");
