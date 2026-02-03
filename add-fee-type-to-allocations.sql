-- Add feeType column to payment_allocations table
-- This allows tracking which specific fee type (Tuition, Boarding, etc.) each payment portion covers

ALTER TABLE payment_allocations 
ADD COLUMN IF NOT EXISTS "feeType" VARCHAR(255) NULL;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_payment_allocations_fee_type ON payment_allocations("feeType");

COMMENT ON COLUMN payment_allocations."feeType" IS 'The specific fee type this allocation covers (e.g., Tuition, Boarding, Transport)';
