CREATE TABLE "admin_audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"admin_email" varchar NOT NULL,
	"action" varchar NOT NULL,
	"target_wholesaler_id" varchar,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "broadcasts" (
	"id" serial PRIMARY KEY NOT NULL,
	"wholesaler_id" varchar NOT NULL,
	"product_id" integer NOT NULL,
	"customer_group_id" integer NOT NULL,
	"message" text NOT NULL,
	"custom_message" text,
	"special_price" numeric(10, 2),
	"quantity" integer DEFAULT 1 NOT NULL,
	"promotional_offers" jsonb DEFAULT '[]'::jsonb,
	"status" varchar DEFAULT 'pending' NOT NULL,
	"recipient_count" integer DEFAULT 0 NOT NULL,
	"sent_at" timestamp,
	"scheduled_at" timestamp,
	"open_rate" integer,
	"click_rate" integer,
	"message_id" varchar,
	"error_message" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "business_intelligence" (
	"id" serial PRIMARY KEY NOT NULL,
	"wholesaler_id" varchar NOT NULL,
	"report_date" timestamp NOT NULL,
	"report_type" varchar NOT NULL,
	"total_revenue" numeric(12, 2) DEFAULT '0.00',
	"total_orders" integer DEFAULT 0,
	"average_order_value" numeric(10, 2) DEFAULT '0.00',
	"top_selling_product_id" integer,
	"top_selling_product_revenue" numeric(12, 2) DEFAULT '0.00',
	"total_products_sold" integer DEFAULT 0,
	"new_customers" integer DEFAULT 0,
	"returning_customers" integer DEFAULT 0,
	"customer_retention_rate" numeric(5, 2) DEFAULT '0.00',
	"campaigns_sent" integer DEFAULT 0,
	"campaign_revenue" numeric(12, 2) DEFAULT '0.00',
	"campaign_conversion_rate" numeric(5, 2) DEFAULT '0.00',
	"revenue_growth_rate" numeric(5, 2) DEFAULT '0.00',
	"order_growth_rate" numeric(5, 2) DEFAULT '0.00',
	"customer_growth_rate" numeric(5, 2) DEFAULT '0.00',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "business_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"wholesaler_id" varchar NOT NULL,
	"name" varchar NOT NULL,
	"logo_url" varchar,
	"address" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "campaign_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"campaign_id" integer,
	"template_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collection_addresses" (
	"id" serial PRIMARY KEY NOT NULL,
	"wholesaler_id" varchar NOT NULL,
	"name" varchar NOT NULL,
	"address_line1" varchar NOT NULL,
	"address_line2" varchar,
	"city" varchar NOT NULL,
	"postcode" varchar NOT NULL,
	"country" varchar DEFAULT 'United Kingdom' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "customer_group_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"customer_id" varchar NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "customer_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"wholesaler_id" varchar NOT NULL,
	"name" varchar NOT NULL,
	"description" text,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "customer_insights" (
	"id" serial PRIMARY KEY NOT NULL,
	"wholesaler_id" varchar NOT NULL,
	"customer_id" varchar NOT NULL,
	"customer_name" varchar,
	"customer_email" varchar,
	"total_orders" integer DEFAULT 0,
	"total_spent" numeric(12, 2) DEFAULT '0.00',
	"average_order_value" numeric(10, 2) DEFAULT '0.00',
	"last_order_date" timestamp,
	"first_order_date" timestamp,
	"days_since_last_order" integer DEFAULT 0,
	"campaigns_received" integer DEFAULT 0,
	"campaigns_opened" integer DEFAULT 0,
	"purchases_from_campaigns" integer DEFAULT 0,
	"favorite_category" varchar,
	"most_ordered_product_id" integer,
	"total_unique_products" integer DEFAULT 0,
	"loyalty_score" integer DEFAULT 0,
	"risk_level" varchar DEFAULT 'low',
	"customer_tier" varchar DEFAULT 'standard',
	"predicted_next_order_date" timestamp,
	"churn_risk" numeric(5, 2) DEFAULT '0.00',
	"recommended_products" jsonb DEFAULT '[]'::jsonb,
	"last_updated" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "customer_invitation_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"token" varchar NOT NULL,
	"wholesaler_id" varchar NOT NULL,
	"email" varchar NOT NULL,
	"phone_number" varchar,
	"first_name" varchar,
	"last_name" varchar,
	"custom_message" text,
	"status" varchar DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "customer_invitation_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "customer_phone_verifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"phone_number" varchar(30) NOT NULL,
	"code" varchar(6) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"is_used" boolean DEFAULT false NOT NULL,
	"used_at" timestamp,
	"attempts" integer DEFAULT 0 NOT NULL,
	"ip_address" varchar(45)
);
--> statement-breakpoint
CREATE TABLE "customer_profile_update_notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" varchar NOT NULL,
	"wholesaler_id" varchar NOT NULL,
	"update_type" varchar NOT NULL,
	"old_value" text,
	"new_value" text,
	"changes_applied" jsonb NOT NULL,
	"notification_sent" boolean DEFAULT false,
	"notification_method" varchar,
	"notification_sent_at" timestamp,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_registration_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"wholesaler_id" varchar NOT NULL,
	"customer_phone" varchar(20) NOT NULL,
	"customer_name" varchar(255) NOT NULL,
	"customer_email" varchar(255),
	"business_name" varchar(255),
	"customer_type" varchar(20),
	"business_type" varchar(20),
	"request_message" text,
	"products_interested" text,
	"order_frequency" varchar(255),
	"status" varchar DEFAULT 'pending' NOT NULL,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"responded_at" timestamp,
	"responded_by" varchar,
	"response_message" text
);
--> statement-breakpoint
CREATE TABLE "customer_wholesaler_relationships" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" varchar NOT NULL,
	"wholesaler_id" varchar NOT NULL,
	"relationship_type" varchar DEFAULT 'standard',
	"added_by" varchar,
	"notes" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "delivery_addresses" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" varchar NOT NULL,
	"address_line1" varchar NOT NULL,
	"address_line2" varchar,
	"city" varchar NOT NULL,
	"state" varchar,
	"postal_code" varchar NOT NULL,
	"country" varchar DEFAULT 'United Kingdom' NOT NULL,
	"label" varchar,
	"instructions" text,
	"is_default" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "financial_performance" (
	"id" serial PRIMARY KEY NOT NULL,
	"wholesaler_id" varchar NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp NOT NULL,
	"period_type" varchar NOT NULL,
	"gross_revenue" numeric(12, 2) DEFAULT '0.00',
	"discounted_revenue" numeric(12, 2) DEFAULT '0.00',
	"net_revenue" numeric(12, 2) DEFAULT '0.00',
	"cost_of_goods_sold" numeric(12, 2) DEFAULT '0.00',
	"gross_profit" numeric(12, 2) DEFAULT '0.00',
	"gross_profit_margin" numeric(5, 2) DEFAULT '0.00',
	"total_transactions" integer DEFAULT 0,
	"average_transaction_value" numeric(10, 2) DEFAULT '0.00',
	"stripe_fees" numeric(10, 2) DEFAULT '0.00',
	"platform_fees" numeric(10, 2) DEFAULT '0.00',
	"net_after_fees" numeric(12, 2) DEFAULT '0.00',
	"previous_period_revenue" numeric(12, 2),
	"revenue_growth" numeric(5, 2) DEFAULT '0.00',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "inventory_insights" (
	"id" serial PRIMARY KEY NOT NULL,
	"wholesaler_id" varchar NOT NULL,
	"product_id" integer NOT NULL,
	"daily_average_sales" numeric(8, 2) DEFAULT '0.00',
	"weekly_average_sales" numeric(8, 2) DEFAULT '0.00',
	"monthly_average_sales" numeric(8, 2) DEFAULT '0.00',
	"days_of_stock_remaining" integer DEFAULT 0,
	"suggested_reorder_quantity" integer DEFAULT 0,
	"suggested_reorder_date" timestamp,
	"turnover_rate" numeric(5, 2) DEFAULT '0.00',
	"profit_margin" numeric(5, 2) DEFAULT '0.00',
	"seasonality_index" numeric(5, 2) DEFAULT '1.00',
	"is_slow_moving" boolean DEFAULT false,
	"is_fast_moving" boolean DEFAULT false,
	"is_overstocked" boolean DEFAULT false,
	"is_understocked" boolean DEFAULT false,
	"cost_per_unit" numeric(10, 2),
	"selling_price" numeric(10, 2),
	"gross_profit_per_unit" numeric(10, 2),
	"last_updated" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "message_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"wholesaler_id" varchar NOT NULL,
	"name" varchar NOT NULL,
	"title" varchar NOT NULL,
	"description" text,
	"custom_message" text,
	"include_contact" boolean DEFAULT true,
	"include_purchase_link" boolean DEFAULT true,
	"status" varchar DEFAULT 'active',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "onboarding_milestones" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"milestone_id" varchar NOT NULL,
	"milestone_name" varchar NOT NULL,
	"milestone_description" text,
	"required_actions" jsonb DEFAULT '[]'::jsonb,
	"completed_actions" jsonb DEFAULT '[]'::jsonb,
	"is_completed" boolean DEFAULT false,
	"completed_at" timestamp,
	"experience_reward" integer DEFAULT 0,
	"badge_reward" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "order_cancellation_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"customer_id" varchar NOT NULL,
	"wholesaler_id" varchar NOT NULL,
	"reason_category" varchar(50) NOT NULL,
	"reason_notes" text,
	"status" varchar DEFAULT 'pending' NOT NULL,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"responded_at" timestamp,
	"responded_by" varchar,
	"response_message" text,
	"refund_type" varchar,
	"refund_amount" numeric(10, 2)
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"product_id" integer,
	"quantity" integer NOT NULL,
	"unit_price" numeric(10, 2) NOT NULL,
	"total" numeric(10, 2) NOT NULL,
	"selling_type" varchar(10) DEFAULT 'units',
	"applied_offer_label" varchar(255),
	"free_items" integer DEFAULT 0,
	"batch_id" integer
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_number" varchar NOT NULL,
	"sequence_number" integer,
	"prefix_used" varchar,
	"wholesaler_id" varchar NOT NULL,
	"retailer_id" varchar NOT NULL,
	"customer_name" varchar,
	"customer_email" varchar,
	"customer_phone" varchar,
	"status" varchar DEFAULT 'pending' NOT NULL,
	"subtotal" numeric(10, 2) NOT NULL,
	"platform_fee" numeric(10, 2) NOT NULL,
	"customer_transaction_fee" numeric(10, 2) DEFAULT '0.00',
	"fee_percentage_used" numeric(5, 4),
	"fixed_fee_used" numeric(6, 2),
	"vat_amount" numeric(10, 2) DEFAULT '0.00',
	"vat_rate_applied" numeric(5, 4),
	"total" numeric(10, 2) NOT NULL,
	"stripe_payment_intent_id" varchar,
	"stripe_transfer_id" varchar,
	"delivery_address" text,
	"delivery_address_id" integer,
	"order_images" jsonb DEFAULT '[]'::jsonb,
	"notes" text,
	"fulfillment_type" varchar DEFAULT 'delivery' NOT NULL,
	"delivery_cost" numeric(10, 2) DEFAULT '0.00',
	"delivery_carrier" varchar,
	"delivery_service_id" varchar,
	"delivery_quote_id" varchar,
	"delivery_tracking_number" varchar,
	"estimated_delivery_date" timestamp,
	"shipping_order_id" varchar,
	"shipping_hash" varchar,
	"shipping_total" numeric(10, 2),
	"shipping_status" varchar,
	"ready_to_collect_at" timestamp,
	"is_quote" boolean DEFAULT false,
	"stripe_payment_link_id" varchar,
	"stripe_payment_link_url" varchar,
	"quote_expires_at" timestamp,
	"quote_sent_at" timestamp,
	"quote_sent_via" varchar,
	"last_edited_at" timestamp,
	"deposit_percentage" integer DEFAULT 100,
	"balance_due_days" integer DEFAULT 0,
	"amount_paid" numeric(10, 2) DEFAULT '0.00',
	"amount_outstanding" numeric(10, 2) DEFAULT '0.00',
	"payment_status" varchar DEFAULT 'unpaid',
	"payment_method" varchar,
	"stripe_actual_fee" numeric(10, 2),
	"amount_refunded" numeric(10, 2) DEFAULT '0.00',
	"refund_reason" text,
	"refunded_at" timestamp,
	"cancelled_at" timestamp,
	"stock_restored" boolean DEFAULT false,
	"stock_restored_count" integer DEFAULT 0,
	"restock_status" varchar,
	"placed_by_name" varchar,
	"business_profile_id" integer,
	"collection_address_id" integer,
	"idempotency_key" varchar(64),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "platform_fee_configs" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_percentage_fee" numeric(5, 4) NOT NULL,
	"customer_fixed_fee" numeric(6, 2) NOT NULL,
	"notes" varchar,
	"effective_from" timestamp DEFAULT now() NOT NULL,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "price_list_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"price_list_id" integer NOT NULL,
	"customer_id" varchar,
	"customer_group_id" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "price_list_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"price_list_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"custom_price" numeric(10, 2),
	"discount_percentage" numeric(5, 2),
	"custom_pallet_price" numeric(10, 2),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "price_lists" (
	"id" serial PRIMARY KEY NOT NULL,
	"wholesaler_id" varchar NOT NULL,
	"name" varchar NOT NULL,
	"description" text,
	"start_date" date,
	"end_date" date,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_locked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "product_batches" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"batch_number" varchar,
	"quantity" integer DEFAULT 0 NOT NULL,
	"cost_price" numeric(10, 2),
	"expiry_date" date,
	"status" varchar DEFAULT 'active' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "product_performance_summary" (
	"id" serial PRIMARY KEY NOT NULL,
	"wholesaler_id" varchar NOT NULL,
	"product_id" integer NOT NULL,
	"total_campaigns" integer DEFAULT 0,
	"active_campaigns" integer DEFAULT 0,
	"total_promotion_views" integer DEFAULT 0,
	"total_promotion_orders" integer DEFAULT 0,
	"total_promotion_revenue" numeric(12, 2) DEFAULT '0.00',
	"total_revenue_loss" numeric(12, 2) DEFAULT '0.00',
	"average_discount_percentage" numeric(5, 2) DEFAULT '0.00',
	"best_performing_campaign_id" varchar,
	"best_conversion_rate" numeric(5, 2) DEFAULT '0.00',
	"regular_price_orders" integer DEFAULT 0,
	"regular_price_revenue" numeric(12, 2) DEFAULT '0.00',
	"promotion_effectiveness" varchar DEFAULT 'unknown',
	"last_updated" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"wholesaler_id" varchar NOT NULL,
	"name" varchar NOT NULL,
	"description" text,
	"price" numeric(10, 2) NOT NULL,
	"promo_price" numeric(10, 2),
	"promo_active" boolean DEFAULT false,
	"promotional_offers" jsonb DEFAULT '[]'::jsonb,
	"currency" varchar DEFAULT 'GBP',
	"moq" integer DEFAULT 1 NOT NULL,
	"base_unit_stock" integer DEFAULT 0 NOT NULL,
	"stock" integer DEFAULT 0 NOT NULL,
	"image_url" varchar,
	"images" jsonb DEFAULT '[]'::jsonb,
	"category" varchar,
	"status" varchar DEFAULT 'active' NOT NULL,
	"price_visible" boolean DEFAULT true NOT NULL,
	"edit_count" integer DEFAULT 0 NOT NULL,
	"quantity_in_pack" integer DEFAULT 1 NOT NULL,
	"units_per_pallet" integer DEFAULT 1 NOT NULL,
	"selling_format" varchar DEFAULT 'units',
	"pallet_price" numeric(10, 2),
	"pallet_moq" integer DEFAULT 1,
	"pallet_stock" integer DEFAULT 0,
	"pallet_weight" numeric(10, 2),
	"unit_weight" numeric(10, 2),
	"unit_weight_legacy" numeric(10, 2),
	"pallet_weight_legacy" numeric(10, 2),
	"delivery_excluded" boolean DEFAULT false,
	"low_stock_threshold" integer DEFAULT 50 NOT NULL,
	"last_stock_alert_sent_at" timestamp,
	"unit" varchar DEFAULT 'units',
	"unit_format" varchar,
	"pack_quantity" integer,
	"unit_of_measure" varchar(20),
	"size_per_unit" numeric(12, 3),
	"total_package_weight" numeric(10, 3),
	"individual_unit_weight" numeric(10, 3),
	"package_dimensions" jsonb DEFAULT '{}'::jsonb,
	"unit_configuration" jsonb DEFAULT '{}'::jsonb,
	"unit_size" numeric(10, 3),
	"unit_weight_kg" numeric(10, 3),
	"temperature_requirement" varchar DEFAULT 'ambient',
	"special_handling" jsonb DEFAULT '{}'::jsonb,
	"shelf_life" integer,
	"expiry_date" date,
	"content_category" varchar DEFAULT 'general',
	"cost_price" numeric(10, 2),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "promotion_analytics" (
	"id" serial PRIMARY KEY NOT NULL,
	"wholesaler_id" varchar NOT NULL,
	"product_id" integer NOT NULL,
	"campaign_id" varchar NOT NULL,
	"campaign_type" varchar NOT NULL,
	"campaign_title" varchar NOT NULL,
	"original_price" numeric(10, 2) NOT NULL,
	"promotional_price" numeric(10, 2) NOT NULL,
	"discount_amount" numeric(10, 2) NOT NULL,
	"discount_percentage" numeric(5, 2) NOT NULL,
	"customer_group_id" integer,
	"recipient_count" integer DEFAULT 0,
	"view_count" integer DEFAULT 0,
	"click_count" integer DEFAULT 0,
	"order_count" integer DEFAULT 0,
	"units_ordered" integer DEFAULT 0,
	"revenue_generated" numeric(12, 2) DEFAULT '0.00',
	"potential_revenue" numeric(12, 2) DEFAULT '0.00',
	"revenue_loss" numeric(12, 2) DEFAULT '0.00',
	"conversion_rate" numeric(5, 2) DEFAULT '0.00',
	"campaign_sent_at" timestamp,
	"first_order_at" timestamp,
	"last_order_at" timestamp,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "quote_activity_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"quote_id" integer NOT NULL,
	"action_type" varchar(50) NOT NULL,
	"entity_type" varchar(30),
	"entity_id" varchar(255),
	"old_value" jsonb,
	"new_value" jsonb,
	"description" text NOT NULL,
	"performed_by" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sms_verification_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" varchar(255) NOT NULL,
	"wholesaler_id" varchar(255) NOT NULL,
	"code" varchar(6) NOT NULL,
	"phone_number" varchar(20) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"ip_address" varchar(45),
	"attempts" integer DEFAULT 0 NOT NULL,
	"is_used" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"wholesaler_id" varchar NOT NULL,
	"alert_type" varchar DEFAULT 'low_stock' NOT NULL,
	"current_stock" integer NOT NULL,
	"threshold" integer NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"is_resolved" boolean DEFAULT false NOT NULL,
	"notification_sent" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"resolved_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"wholesaler_id" varchar NOT NULL,
	"movement_type" varchar NOT NULL,
	"quantity" integer NOT NULL,
	"unit_type" varchar DEFAULT 'units' NOT NULL,
	"stock_before" integer NOT NULL,
	"stock_after" integer NOT NULL,
	"reason" varchar,
	"order_id" integer,
	"customer_name" varchar,
	"business_profile_id" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "stock_update_notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"campaign_id" integer,
	"template_campaign_id" integer,
	"wholesaler_id" varchar NOT NULL,
	"notification_type" varchar NOT NULL,
	"previous_stock" integer,
	"new_stock" integer,
	"previous_price" varchar,
	"new_price" varchar,
	"messages_sent" integer DEFAULT 0,
	"status" varchar DEFAULT 'pending',
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"event_type" varchar NOT NULL,
	"from_tier" varchar,
	"to_tier" varchar,
	"amount" numeric(10, 2),
	"currency" varchar(3) DEFAULT 'GBP',
	"stripe_subscription_id" varchar,
	"stripe_customer_id" varchar,
	"reason" text,
	"metadata" text,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"ip_address" varchar(45),
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "subscription_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar NOT NULL,
	"plan_id" varchar NOT NULL,
	"stripe_product_id" varchar,
	"stripe_price_id" varchar,
	"monthly_price" numeric(10, 2) NOT NULL,
	"currency" varchar DEFAULT 'GBP',
	"description" text,
	"features" jsonb DEFAULT '[]'::jsonb,
	"limits" jsonb DEFAULT '{}'::jsonb,
	"billing_interval" varchar DEFAULT 'monthly',
	"version" integer DEFAULT 1,
	"is_active" boolean DEFAULT true,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "subscription_plans_plan_id_unique" UNIQUE("plan_id")
);
--> statement-breakpoint
CREATE TABLE "system_error_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"error_type" varchar NOT NULL,
	"message" text NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb,
	"wholesaler_id" varchar,
	"severity" varchar DEFAULT 'error' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tab_permissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"wholesaler_id" varchar NOT NULL,
	"tab_name" varchar NOT NULL,
	"is_restricted" boolean DEFAULT false,
	"allowed_roles" jsonb DEFAULT '["owner","admin","member"]'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"wholesaler_id" varchar NOT NULL,
	"email" varchar NOT NULL,
	"phone_number" varchar(50),
	"first_name" varchar,
	"last_name" varchar,
	"role" varchar DEFAULT 'member' NOT NULL,
	"permissions" jsonb DEFAULT '{}'::jsonb,
	"status" varchar DEFAULT 'pending' NOT NULL,
	"invite_token" varchar,
	"invited_at" timestamp DEFAULT now(),
	"joined_at" timestamp,
	"last_login_at" timestamp,
	"last_seen_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "template_campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"template_id" integer NOT NULL,
	"customer_group_id" integer NOT NULL,
	"wholesaler_id" varchar NOT NULL,
	"campaign_url" varchar,
	"sent_at" timestamp,
	"status" varchar DEFAULT 'pending',
	"recipient_count" integer DEFAULT 0,
	"click_count" integer DEFAULT 0,
	"order_count" integer DEFAULT 0,
	"total_revenue" varchar DEFAULT '0.00',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "template_products" (
	"id" serial PRIMARY KEY NOT NULL,
	"template_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"special_price" varchar,
	"promotional_offers" jsonb DEFAULT '[]'::jsonb,
	"display_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_badges" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"badge_id" varchar NOT NULL,
	"badge_type" varchar NOT NULL,
	"badge_name" varchar NOT NULL,
	"badge_description" text,
	"badge_icon" varchar,
	"badge_color" varchar DEFAULT '#10B981',
	"experience_points" integer DEFAULT 0,
	"unlocked_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" varchar NOT NULL,
	"plan_id" varchar NOT NULL,
	"stripe_subscription_id" varchar,
	"status" varchar DEFAULT 'active' NOT NULL,
	"current_period_start" timestamp,
	"current_period_end" timestamp,
	"cancel_at_period_end" boolean DEFAULT false,
	"canceled_at" timestamp,
	"trial_start" timestamp,
	"trial_end" timestamp,
	"internal_note" text,
	"is_custom_pricing" boolean DEFAULT false,
	"custom_price_expires_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "user_subscriptions_stripe_subscription_id_unique" UNIQUE("stripe_subscription_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY NOT NULL,
	"email" varchar,
	"first_name" varchar,
	"last_name" varchar,
	"profile_image_url" varchar,
	"google_id" varchar,
	"role" varchar DEFAULT 'wholesaler' NOT NULL,
	"custom_fee_percentage" numeric(5, 2),
	"wholesaler_id" varchar,
	"business_name" varchar,
	"business_address" varchar,
	"business_phone" varchar,
	"logo_url" varchar,
	"logo_type" varchar DEFAULT 'initials',
	"stripe_account_id" varchar,
	"stripe_customer_id" varchar,
	"stripe_subscription_id" varchar,
	"stripe_verified_email_sent_at" timestamp,
	"subscription_status" varchar DEFAULT 'free',
	"current_plan" varchar DEFAULT 'free',
	"subscription_tier" varchar DEFAULT 'free',
	"product_limit" integer DEFAULT 10,
	"subscription_period_start" timestamp,
	"subscription_period_end" timestamp,
	"subscription_ends_at" timestamp,
	"whatsapp_enabled" boolean DEFAULT false,
	"whatsapp_access_token" varchar,
	"whatsapp_business_phone_id" varchar,
	"whatsapp_business_name" varchar,
	"whatsapp_app_id" varchar,
	"whatsapp_provider" varchar DEFAULT 'twilio',
	"whatsapp_business_phone" varchar,
	"twilio_account_sid" varchar,
	"twilio_auth_token" varchar,
	"twilio_phone_number" varchar,
	"preferred_currency" varchar DEFAULT 'GBP',
	"timezone" varchar DEFAULT 'UTC',
	"phone_number" varchar,
	"street_address" varchar,
	"address_line2" varchar,
	"city" varchar,
	"state" varchar,
	"postal_code" varchar,
	"country" varchar,
	"archived" boolean DEFAULT false,
	"archived_at" timestamp,
	"notification_preferences" jsonb DEFAULT '{"email":true,"sms":true,"orderUpdates":true,"stockAlerts":true,"marketingEmails":false}'::jsonb,
	"store_tagline" varchar DEFAULT 'Premium wholesale products',
	"default_country_code" varchar DEFAULT '+44',
	"order_number_prefix" varchar DEFAULT 'ORD',
	"order_number_counter" integer DEFAULT 0,
	"show_prices_to_wholesalers" boolean DEFAULT false,
	"onboarding_completed" boolean DEFAULT false,
	"onboarding_step" integer DEFAULT 0,
	"onboarding_skipped" boolean DEFAULT false,
	"is_first_login" boolean DEFAULT true,
	"experience_points" integer DEFAULT 0,
	"current_level" integer DEFAULT 1,
	"total_badges" integer DEFAULT 0,
	"completed_achievements" jsonb DEFAULT '[]'::jsonb,
	"onboarding_progress" jsonb DEFAULT '{"completedSteps":[],"currentMilestone":"getting_started","progressPercentage":0}'::jsonb,
	"default_low_stock_threshold" integer DEFAULT 50,
	"default_deposit_percentage" integer DEFAULT 100,
	"balance_due_days" integer DEFAULT 0,
	"business_description" text,
	"business_email" varchar,
	"business_type" varchar,
	"estimated_monthly_volume" varchar,
	"default_currency" varchar DEFAULT 'GBP',
	"send_order_dispatched_emails" boolean DEFAULT true,
	"auto_mark_fulfilled" boolean DEFAULT false,
	"enable_tracking_notifications" boolean DEFAULT true,
	"send_delivery_confirmations" boolean DEFAULT true,
	"enable_pickup" boolean DEFAULT true,
	"enable_delivery" boolean DEFAULT true,
	"delivery_flat_rate" numeric(10, 2),
	"delivery_note" text,
	"pickup_address" text,
	"pickup_instructions" text,
	"password_hash" varchar,
	"password_reset_token" varchar,
	"password_reset_expires" timestamp,
	"parcel2go_credentials" jsonb,
	"customer_type" varchar(20),
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"geocode_status" varchar(10),
	"is_suspicious" boolean DEFAULT false,
	"is_test_account" boolean DEFAULT false,
	"last_login_at" timestamp,
	"last_seen_at" timestamp,
	"last_real_user_activity_at" timestamp,
	"enable_multi_profile" boolean DEFAULT false,
	"legal_business_name" varchar,
	"vat_number" varchar,
	"company_registration_number" varchar,
	"vat_enabled" boolean DEFAULT false,
	"vat_rate" numeric(5, 4) DEFAULT '0.2000',
	"store_slug" varchar(60),
	"allow_pay_later" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_google_id_unique" UNIQUE("google_id")
);
--> statement-breakpoint
CREATE TABLE "wholesaler_customer_relationships" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" varchar NOT NULL,
	"wholesaler_id" varchar NOT NULL,
	"status" varchar DEFAULT 'pending' NOT NULL,
	"invited_at" timestamp DEFAULT now(),
	"accepted_at" timestamp,
	"last_accessed_at" timestamp,
	"notes" text,
	"custom_pricing" boolean DEFAULT false,
	"payment_terms" varchar DEFAULT 'immediate',
	"credit_limit" numeric(10, 2),
	"display_name" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_target_wholesaler_id_users_id_fk" FOREIGN KEY ("target_wholesaler_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_wholesaler_id_users_id_fk" FOREIGN KEY ("wholesaler_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "broadcasts" ADD CONSTRAINT "broadcasts_customer_group_id_customer_groups_id_fk" FOREIGN KEY ("customer_group_id") REFERENCES "public"."customer_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_intelligence" ADD CONSTRAINT "business_intelligence_wholesaler_id_users_id_fk" FOREIGN KEY ("wholesaler_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_intelligence" ADD CONSTRAINT "business_intelligence_top_selling_product_id_products_id_fk" FOREIGN KEY ("top_selling_product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_profiles" ADD CONSTRAINT "business_profiles_wholesaler_id_users_id_fk" FOREIGN KEY ("wholesaler_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_orders" ADD CONSTRAINT "campaign_orders_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_orders" ADD CONSTRAINT "campaign_orders_campaign_id_template_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."template_campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_orders" ADD CONSTRAINT "campaign_orders_template_id_message_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."message_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_addresses" ADD CONSTRAINT "collection_addresses_wholesaler_id_users_id_fk" FOREIGN KEY ("wholesaler_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_group_members" ADD CONSTRAINT "customer_group_members_group_id_customer_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."customer_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_group_members" ADD CONSTRAINT "customer_group_members_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_groups" ADD CONSTRAINT "customer_groups_wholesaler_id_users_id_fk" FOREIGN KEY ("wholesaler_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_insights" ADD CONSTRAINT "customer_insights_wholesaler_id_users_id_fk" FOREIGN KEY ("wholesaler_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_insights" ADD CONSTRAINT "customer_insights_most_ordered_product_id_products_id_fk" FOREIGN KEY ("most_ordered_product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_invitation_tokens" ADD CONSTRAINT "customer_invitation_tokens_wholesaler_id_users_id_fk" FOREIGN KEY ("wholesaler_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_profile_update_notifications" ADD CONSTRAINT "customer_profile_update_notifications_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_profile_update_notifications" ADD CONSTRAINT "customer_profile_update_notifications_wholesaler_id_users_id_fk" FOREIGN KEY ("wholesaler_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_registration_requests" ADD CONSTRAINT "customer_registration_requests_wholesaler_id_users_id_fk" FOREIGN KEY ("wholesaler_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_registration_requests" ADD CONSTRAINT "customer_registration_requests_responded_by_users_id_fk" FOREIGN KEY ("responded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_wholesaler_relationships" ADD CONSTRAINT "customer_wholesaler_relationships_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_wholesaler_relationships" ADD CONSTRAINT "customer_wholesaler_relationships_wholesaler_id_users_id_fk" FOREIGN KEY ("wholesaler_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_wholesaler_relationships" ADD CONSTRAINT "customer_wholesaler_relationships_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_addresses" ADD CONSTRAINT "delivery_addresses_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_performance" ADD CONSTRAINT "financial_performance_wholesaler_id_users_id_fk" FOREIGN KEY ("wholesaler_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_insights" ADD CONSTRAINT "inventory_insights_wholesaler_id_users_id_fk" FOREIGN KEY ("wholesaler_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_insights" ADD CONSTRAINT "inventory_insights_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_templates" ADD CONSTRAINT "message_templates_wholesaler_id_users_id_fk" FOREIGN KEY ("wholesaler_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_milestones" ADD CONSTRAINT "onboarding_milestones_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_cancellation_requests" ADD CONSTRAINT "order_cancellation_requests_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_cancellation_requests" ADD CONSTRAINT "order_cancellation_requests_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_cancellation_requests" ADD CONSTRAINT "order_cancellation_requests_wholesaler_id_users_id_fk" FOREIGN KEY ("wholesaler_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_cancellation_requests" ADD CONSTRAINT "order_cancellation_requests_responded_by_users_id_fk" FOREIGN KEY ("responded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_batch_id_product_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."product_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_wholesaler_id_users_id_fk" FOREIGN KEY ("wholesaler_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_retailer_id_users_id_fk" FOREIGN KEY ("retailer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_address_id_delivery_addresses_id_fk" FOREIGN KEY ("delivery_address_id") REFERENCES "public"."delivery_addresses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_business_profile_id_business_profiles_id_fk" FOREIGN KEY ("business_profile_id") REFERENCES "public"."business_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_collection_address_id_collection_addresses_id_fk" FOREIGN KEY ("collection_address_id") REFERENCES "public"."collection_addresses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_list_assignments" ADD CONSTRAINT "price_list_assignments_price_list_id_price_lists_id_fk" FOREIGN KEY ("price_list_id") REFERENCES "public"."price_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_list_assignments" ADD CONSTRAINT "price_list_assignments_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_list_assignments" ADD CONSTRAINT "price_list_assignments_customer_group_id_customer_groups_id_fk" FOREIGN KEY ("customer_group_id") REFERENCES "public"."customer_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_list_items" ADD CONSTRAINT "price_list_items_price_list_id_price_lists_id_fk" FOREIGN KEY ("price_list_id") REFERENCES "public"."price_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_list_items" ADD CONSTRAINT "price_list_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "price_lists" ADD CONSTRAINT "price_lists_wholesaler_id_users_id_fk" FOREIGN KEY ("wholesaler_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_batches" ADD CONSTRAINT "product_batches_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_performance_summary" ADD CONSTRAINT "product_performance_summary_wholesaler_id_users_id_fk" FOREIGN KEY ("wholesaler_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_performance_summary" ADD CONSTRAINT "product_performance_summary_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_wholesaler_id_users_id_fk" FOREIGN KEY ("wholesaler_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_analytics" ADD CONSTRAINT "promotion_analytics_wholesaler_id_users_id_fk" FOREIGN KEY ("wholesaler_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_analytics" ADD CONSTRAINT "promotion_analytics_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_analytics" ADD CONSTRAINT "promotion_analytics_customer_group_id_customer_groups_id_fk" FOREIGN KEY ("customer_group_id") REFERENCES "public"."customer_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_activity_logs" ADD CONSTRAINT "quote_activity_logs_quote_id_orders_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_alerts" ADD CONSTRAINT "stock_alerts_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_alerts" ADD CONSTRAINT "stock_alerts_wholesaler_id_users_id_fk" FOREIGN KEY ("wholesaler_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_wholesaler_id_users_id_fk" FOREIGN KEY ("wholesaler_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_business_profile_id_business_profiles_id_fk" FOREIGN KEY ("business_profile_id") REFERENCES "public"."business_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_update_notifications" ADD CONSTRAINT "stock_update_notifications_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_update_notifications" ADD CONSTRAINT "stock_update_notifications_campaign_id_broadcasts_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."broadcasts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_update_notifications" ADD CONSTRAINT "stock_update_notifications_template_campaign_id_template_campaigns_id_fk" FOREIGN KEY ("template_campaign_id") REFERENCES "public"."template_campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_update_notifications" ADD CONSTRAINT "stock_update_notifications_wholesaler_id_users_id_fk" FOREIGN KEY ("wholesaler_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_audit_logs" ADD CONSTRAINT "subscription_audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_error_logs" ADD CONSTRAINT "system_error_logs_wholesaler_id_users_id_fk" FOREIGN KEY ("wholesaler_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tab_permissions" ADD CONSTRAINT "tab_permissions_wholesaler_id_users_id_fk" FOREIGN KEY ("wholesaler_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_wholesaler_id_users_id_fk" FOREIGN KEY ("wholesaler_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_campaigns" ADD CONSTRAINT "template_campaigns_template_id_message_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."message_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_campaigns" ADD CONSTRAINT "template_campaigns_customer_group_id_customer_groups_id_fk" FOREIGN KEY ("customer_group_id") REFERENCES "public"."customer_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_campaigns" ADD CONSTRAINT "template_campaigns_wholesaler_id_users_id_fk" FOREIGN KEY ("wholesaler_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_products" ADD CONSTRAINT "template_products_template_id_message_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."message_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_products" ADD CONSTRAINT "template_products_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_badges" ADD CONSTRAINT "user_badges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD CONSTRAINT "user_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_subscriptions" ADD CONSTRAINT "user_subscriptions_plan_id_subscription_plans_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("plan_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wholesaler_customer_relationships" ADD CONSTRAINT "wholesaler_customer_relationships_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wholesaler_customer_relationships" ADD CONSTRAINT "wholesaler_customer_relationships_wholesaler_id_users_id_fk" FOREIGN KEY ("wholesaler_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_audit_admin_email_idx" ON "admin_audit_logs" USING btree ("admin_email");--> statement-breakpoint
CREATE INDEX "admin_audit_created_at_idx" ON "admin_audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "broadcasts_wholesaler_id_idx" ON "broadcasts" USING btree ("wholesaler_id");--> statement-breakpoint
CREATE INDEX "business_profiles_wholesaler_id_idx" ON "business_profiles" USING btree ("wholesaler_id");--> statement-breakpoint
CREATE INDEX "collection_addresses_wholesaler_id_idx" ON "collection_addresses" USING btree ("wholesaler_id");--> statement-breakpoint
CREATE INDEX "customer_group_members_customer_id_idx" ON "customer_group_members" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "customer_group_members_group_id_idx" ON "customer_group_members" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "customer_groups_wholesaler_id_idx" ON "customer_groups" USING btree ("wholesaler_id");--> statement-breakpoint
CREATE INDEX "cit_token_idx" ON "customer_invitation_tokens" USING btree ("token");--> statement-breakpoint
CREATE INDEX "cit_wholesaler_id_idx" ON "customer_invitation_tokens" USING btree ("wholesaler_id");--> statement-breakpoint
CREATE INDEX "cit_email_idx" ON "customer_invitation_tokens" USING btree ("email");--> statement-breakpoint
CREATE INDEX "cit_status_idx" ON "customer_invitation_tokens" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cpv_phone_idx" ON "customer_phone_verifications" USING btree ("phone_number");--> statement-breakpoint
CREATE INDEX "cpv_code_idx" ON "customer_phone_verifications" USING btree ("code");--> statement-breakpoint
CREATE INDEX "cpv_created_at_idx" ON "customer_phone_verifications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "profile_updates_customer_id_idx" ON "customer_profile_update_notifications" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "profile_updates_wholesaler_id_idx" ON "customer_profile_update_notifications" USING btree ("wholesaler_id");--> statement-breakpoint
CREATE INDEX "profile_updates_type_idx" ON "customer_profile_update_notifications" USING btree ("update_type");--> statement-breakpoint
CREATE INDEX "profile_updates_sent_idx" ON "customer_profile_update_notifications" USING btree ("notification_sent");--> statement-breakpoint
CREATE INDEX "profile_updates_created_at_idx" ON "customer_profile_update_notifications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "registration_requests_wholesaler_id_idx" ON "customer_registration_requests" USING btree ("wholesaler_id");--> statement-breakpoint
CREATE INDEX "registration_requests_customer_phone_idx" ON "customer_registration_requests" USING btree ("customer_phone");--> statement-breakpoint
CREATE INDEX "registration_requests_status_idx" ON "customer_registration_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "registration_requests_requested_at_idx" ON "customer_registration_requests" USING btree ("requested_at");--> statement-breakpoint
CREATE INDEX "delivery_addresses_customer_id_idx" ON "delivery_addresses" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "cancellation_requests_order_id_idx" ON "order_cancellation_requests" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "cancellation_requests_customer_id_idx" ON "order_cancellation_requests" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "cancellation_requests_wholesaler_id_idx" ON "order_cancellation_requests" USING btree ("wholesaler_id");--> statement-breakpoint
CREATE INDEX "cancellation_requests_status_idx" ON "order_cancellation_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cancellation_requests_requested_at_idx" ON "order_cancellation_requests" USING btree ("requested_at");--> statement-breakpoint
CREATE INDEX "order_items_order_id_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_items_product_id_idx" ON "order_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "orders_wholesaler_created_idx" ON "orders" USING btree ("wholesaler_id","created_at");--> statement-breakpoint
CREATE INDEX "orders_retailer_idx" ON "orders" USING btree ("retailer_id");--> statement-breakpoint
CREATE INDEX "orders_payment_status_idx" ON "orders" USING btree ("payment_status");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "orders_created_at_idx" ON "orders" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "orders_customer_phone_idx" ON "orders" USING btree ("customer_phone");--> statement-breakpoint
CREATE INDEX "price_list_assignments_list_id_idx" ON "price_list_assignments" USING btree ("price_list_id");--> statement-breakpoint
CREATE INDEX "price_list_items_list_id_idx" ON "price_list_items" USING btree ("price_list_id");--> statement-breakpoint
CREATE INDEX "price_list_items_product_id_idx" ON "price_list_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "price_lists_wholesaler_id_idx" ON "price_lists" USING btree ("wholesaler_id");--> statement-breakpoint
CREATE INDEX "pb_product_id_idx" ON "product_batches" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "pb_product_expiry_idx" ON "product_batches" USING btree ("product_id","expiry_date");--> statement-breakpoint
CREATE INDEX "pb_status_idx" ON "product_batches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "products_wholesaler_id_idx" ON "products" USING btree ("wholesaler_id");--> statement-breakpoint
CREATE INDEX "products_status_idx" ON "products" USING btree ("status");--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");--> statement-breakpoint
CREATE INDEX "sms_codes_customer_id_idx" ON "sms_verification_codes" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "sms_codes_wholesaler_id_idx" ON "sms_verification_codes" USING btree ("wholesaler_id");--> statement-breakpoint
CREATE INDEX "sms_codes_code_idx" ON "sms_verification_codes" USING btree ("code");--> statement-breakpoint
CREATE INDEX "sms_codes_created_at_idx" ON "sms_verification_codes" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "subscription_audit_user_id_idx" ON "subscription_audit_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "subscription_audit_event_type_idx" ON "subscription_audit_logs" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "subscription_audit_timestamp_idx" ON "subscription_audit_logs" USING btree ("timestamp");--> statement-breakpoint
CREATE INDEX "subscription_audit_stripe_sub_idx" ON "subscription_audit_logs" USING btree ("stripe_subscription_id");--> statement-breakpoint
CREATE INDEX "system_errors_type_idx" ON "system_error_logs" USING btree ("error_type");--> statement-breakpoint
CREATE INDEX "system_errors_created_at_idx" ON "system_error_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "system_errors_wholesaler_id_idx" ON "system_error_logs" USING btree ("wholesaler_id");--> statement-breakpoint
CREATE INDEX "team_members_wholesaler_id_idx" ON "team_members" USING btree ("wholesaler_id");--> statement-breakpoint
CREATE INDEX "user_subscriptions_user_id_idx" ON "user_subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_subscriptions_stripe_id_idx" ON "user_subscriptions" USING btree ("stripe_subscription_id");--> statement-breakpoint
CREATE INDEX "user_subscriptions_status_idx" ON "user_subscriptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "wcr_customer_id_idx" ON "wholesaler_customer_relationships" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "wcr_wholesaler_id_idx" ON "wholesaler_customer_relationships" USING btree ("wholesaler_id");--> statement-breakpoint
CREATE INDEX "wcr_status_idx" ON "wholesaler_customer_relationships" USING btree ("status");--> statement-breakpoint
CREATE INDEX "wcr_customer_wholesaler_unique" ON "wholesaler_customer_relationships" USING btree ("customer_id","wholesaler_id");