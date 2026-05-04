ALTER TABLE "business_profiles" ADD COLUMN IF NOT EXISTS "bank_name" varchar(100);--> statement-breakpoint
ALTER TABLE "business_profiles" ADD COLUMN IF NOT EXISTS "account_name" varchar(100);--> statement-breakpoint
ALTER TABLE "business_profiles" ADD COLUMN IF NOT EXISTS "account_number" varchar(100);--> statement-breakpoint
ALTER TABLE "business_profiles" ADD COLUMN IF NOT EXISTS "sort_code" varchar(20);--> statement-breakpoint
ALTER TABLE "business_profiles" ADD COLUMN IF NOT EXISTS "iban" varchar(100);--> statement-breakpoint
ALTER TABLE "business_profiles" ADD COLUMN IF NOT EXISTS "swift" varchar(20);
