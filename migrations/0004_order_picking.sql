CREATE TABLE IF NOT EXISTS "order_picking" (
  "id" serial PRIMARY KEY NOT NULL,
  "order_id" integer NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
  "picking_status" varchar(20) NOT NULL DEFAULT 'not_started',
  "completed_at" timestamp,
  "completed_by" varchar(255),
  "reset_at" timestamp,
  "reset_by" varchar(255),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_picking_order_id_idx" ON "order_picking" ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "order_picking_order_id_uniq" ON "order_picking" ("order_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "order_item_picks" (
  "id" serial PRIMARY KEY NOT NULL,
  "order_id" integer NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
  "order_item_id" integer NOT NULL REFERENCES "order_items"("id") ON DELETE CASCADE,
  "is_picked" boolean NOT NULL DEFAULT false,
  "picked_at" timestamp,
  "picked_by" varchar(255),
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_item_picks_order_id_idx" ON "order_item_picks" ("order_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_item_picks_item_id_idx" ON "order_item_picks" ("order_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "order_item_picks_order_item_id_uniq" ON "order_item_picks" ("order_item_id");
