-- Database Performance Optimization for Live Launch
-- Run these commands to significantly improve loading speeds

-- 1. Products table optimizations (Critical for customer portal loading)
CREATE INDEX IF NOT EXISTS idx_products_wholesaler_status_promo ON products(wholesaler_id, status, promo_active);
CREATE INDEX IF NOT EXISTS idx_products_stock_status ON products(stock, status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_products_category_status ON products(category, status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_products_created_at_desc ON products(created_at DESC);

-- 2. Orders table optimizations (Critical for order processing)
CREATE INDEX IF NOT EXISTS idx_orders_wholesaler_status ON orders(wholesaler_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_retailer_status ON orders(retailer_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at_desc ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);

-- 3. Order items optimizations (Critical for sales analytics)
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);

-- 4. Users table optimizations (Critical for authentication)
CREATE INDEX IF NOT EXISTS idx_users_phone_number ON users(phone_number);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role_wholesaler ON users(role, wholesaler_id);

-- 5. Sessions table optimizations (Critical for fast auth)
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

-- 6. Stock movements optimizations (For inventory tracking)
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_created ON stock_movements(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_wholesaler_created ON stock_movements(wholesaler_id, created_at DESC);

-- 7. Customer groups optimizations (For marketing efficiency)
CREATE INDEX IF NOT EXISTS idx_customer_groups_wholesaler ON customer_groups(wholesaler_id);
CREATE INDEX IF NOT EXISTS idx_customer_group_members_group_customer ON customer_group_members(group_id, customer_id);

-- 8. Broadcasts optimizations (For campaign performance)
CREATE INDEX IF NOT EXISTS idx_broadcasts_wholesaler_created ON broadcasts(wholesaler_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_broadcasts_group_created ON broadcasts(customer_group_id, created_at DESC);

-- 9. Stock alerts optimizations (For real-time notifications)
CREATE INDEX IF NOT EXISTS idx_stock_alerts_wholesaler_unresolved ON stock_alerts(wholesaler_id, is_resolved, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_alerts_product_unresolved ON stock_alerts(product_id, is_resolved);

-- 10. Customer registration requests (For access management)
CREATE INDEX IF NOT EXISTS idx_customer_reg_requests_wholesaler_status ON customer_registration_requests(wholesaler_id, status, created_at DESC);

-- Performance Statistics and Monitoring
-- Create a function to analyze query performance
CREATE OR REPLACE FUNCTION analyze_query_performance()
RETURNS TABLE(
    table_name TEXT,
    index_usage NUMERIC,
    seq_scans BIGINT,
    index_scans BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        schemaname||'.'||tablename as table_name,
        CASE 
            WHEN (seq_scan + idx_scan) > 0 
            THEN ROUND((idx_scan::NUMERIC / (seq_scan + idx_scan)) * 100, 2)
            ELSE 0 
        END as index_usage,
        seq_scan,
        idx_scan
    FROM pg_stat_user_tables 
    WHERE schemaname = 'public'
    ORDER BY (seq_scan + idx_scan) DESC;
END;
$$ LANGUAGE plpgsql;

-- Vacuum and analyze for optimal performance
VACUUM ANALYZE products;
VACUUM ANALYZE orders;
VACUUM ANALYZE order_items;
VACUUM ANALYZE users;
VACUUM ANALYZE sessions;

-- Update table statistics for query planner optimization
ANALYZE products;
ANALYZE orders;
ANALYZE order_items;
ANALYZE users;

-- Set optimal configuration for performance (if you have admin access)
-- These settings optimize for read-heavy workloads (typical for customer portals)
/*
ALTER SYSTEM SET shared_buffers = '256MB';
ALTER SYSTEM SET effective_cache_size = '1GB';
ALTER SYSTEM SET random_page_cost = 1.1;
ALTER SYSTEM SET work_mem = '4MB';
ALTER SYSTEM SET maintenance_work_mem = '64MB';
ALTER SYSTEM SET checkpoint_completion_target = 0.7;
ALTER SYSTEM SET wal_buffers = '16MB';
ALTER SYSTEM SET default_statistics_target = 100;
SELECT pg_reload_conf();
*/

-- Query to check index usage (run this periodically to monitor performance)
-- SELECT * FROM analyze_query_performance();