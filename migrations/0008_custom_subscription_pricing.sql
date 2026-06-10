ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "custom_monthly_price" numeric(10, 2);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "custom_annual_price" numeric(10, 2);
