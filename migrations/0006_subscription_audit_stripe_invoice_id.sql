-- Add stripe_invoice_id to subscription_audit_logs for idempotent backfill deduplication
ALTER TABLE "subscription_audit_logs" ADD COLUMN IF NOT EXISTS "stripe_invoice_id" varchar;
