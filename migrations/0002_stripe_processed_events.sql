CREATE TABLE IF NOT EXISTS "stripe_processed_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "event_id" varchar NOT NULL UNIQUE,
  "created_at" timestamp DEFAULT now() NOT NULL
);
