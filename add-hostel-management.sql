-- Hostel Management schema (for production environments without TypeORM synchronize)

CREATE TABLE IF NOT EXISTS hostel (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(255) NOT NULL,
  gender varchar(20) NOT NULL DEFAULT 'mixed',
  capacity integer NOT NULL DEFAULT 0,
  "isActive" boolean NOT NULL DEFAULT true,
  "wardenName" varchar(100),
  "wardenPhone" varchar(30),
  notes text,
  "schoolId" uuid NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "UQ_hostel_school_name" UNIQUE ("schoolId", name)
);

CREATE TABLE IF NOT EXISTS hostel_room (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "hostelId" uuid NOT NULL REFERENCES hostel(id) ON DELETE CASCADE,
  name varchar(50) NOT NULL,
  floor varchar(30),
  capacity integer NOT NULL DEFAULT 0,
  "isActive" boolean NOT NULL DEFAULT true,
  notes text,
  "schoolId" uuid NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "UQ_hostel_room_name" UNIQUE ("hostelId", name)
);

CREATE TABLE IF NOT EXISTS hostel_allocation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "studentId" uuid NOT NULL REFERENCES student(id) ON DELETE CASCADE,
  "hostelId" uuid NOT NULL REFERENCES hostel(id) ON DELETE CASCADE,
  "roomId" uuid NOT NULL REFERENCES hostel_room(id) ON DELETE CASCADE,
  "bedNumber" varchar(20),
  status varchar(20) NOT NULL DEFAULT 'active',
  "assignedAt" timestamp NOT NULL DEFAULT now(),
  "releasedAt" timestamp,
  "releaseReason" varchar(300),
  notes text,
  "schoolId" uuid NOT NULL,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hostel_setup (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "schoolId" uuid NOT NULL UNIQUE,
  "roomNamingMode" varchar(20) NOT NULL DEFAULT 'manual',
  "numericPrefix" varchar(20) NOT NULL DEFAULT 'A',
  "defaultFloor" varchar(30) NOT NULL DEFAULT 'Ground Floor',
  "defaultRoomCapacity" integer NOT NULL DEFAULT 10,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "updatedAt" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "IDX_hostel_school" ON hostel("schoolId");
CREATE INDEX IF NOT EXISTS "IDX_hostel_room_school" ON hostel_room("schoolId");
CREATE INDEX IF NOT EXISTS "IDX_hostel_room_hostel" ON hostel_room("hostelId");
CREATE INDEX IF NOT EXISTS "IDX_hostel_alloc_school" ON hostel_allocation("schoolId");
CREATE INDEX IF NOT EXISTS "IDX_hostel_alloc_student" ON hostel_allocation("studentId");
CREATE INDEX IF NOT EXISTS "IDX_hostel_alloc_hostel" ON hostel_allocation("hostelId");
CREATE INDEX IF NOT EXISTS "IDX_hostel_alloc_room" ON hostel_allocation("roomId");
CREATE INDEX IF NOT EXISTS "IDX_hostel_alloc_status" ON hostel_allocation(status);
CREATE INDEX IF NOT EXISTS "IDX_hostel_setup_school" ON hostel_setup("schoolId");
