ALTER TABLE "business_profiles" ADD COLUMN IF NOT EXISTS "bank_name" varchar(100);--> statement-breakpoint
ALTER TABLE "business_profiles" ADD COLUMN IF NOT EXISTS "account_name" varchar(100);--> statement-breakpoint
ALTER TABLE "business_profiles" ADD COLUMN IF NOT EXISTS "account_number" varchar(100);--> statement-breakpoint
ALTER TABLE "business_profiles" ADD COLUMN IF NOT EXISTS "sort_code" varchar(20);--> statement-breakpoint
ALTER TABLE "business_profiles" ADD COLUMN IF NOT EXISTS "iban" varchar(100);--> statement-breakpoint
ALTER TABLE "business_profiles" ADD COLUMN IF NOT EXISTS "swift" varchar(20);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "stripe_processed_events" (
"id" serial PRIMARY KEY NOT NULL,
"event_id" varchar NOT NULL,
"created_at" timestamp DEFAULT now() NOT NULL,
CONSTRAINT "stripe_processed_events_event_id_unique" UNIQUE("event_id")
);--> statement-breakpoint
ALTER TABLE "product_batches" ADD COLUMN IF NOT EXISTS "original_quantity" integer;--> statement-breakpoint
UPDATE "product_batches" pb
SET original_quantity = COALESCE(
  (
    SELECT sm.quantity
    FROM stock_movements sm
    WHERE sm.product_id = pb.product_id
      AND sm.movement_type IN ('manual_increase', 'stock_in')
      AND sm.created_at >= pb.created_at - INTERVAL '30 seconds'
      AND sm.created_at <= pb.created_at + INTERVAL '120 seconds'
    ORDER BY ABS(EXTRACT(EPOCH FROM (sm.created_at - pb.created_at))) ASC
    LIMIT 1
  ),
  pb.quantity
)
WHERE pb.original_quantity IS NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "customer_fee_percentage" numeric(6, 4);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "customer_fixed_fee" numeric(6, 2);
