-- Order Creation Monitoring & Alert System
-- Run this periodically to detect potential order creation issues

-- 1. Check for payment intents without corresponding orders (potential missing orders)
SELECT 
    'ALERT: Potential Missing Orders' as alert_type,
    COUNT(*) as count,
    'Check if payments succeeded but orders were not created' as description
FROM (
    -- This would need to be populated by tracking payment intents
    -- For now, we monitor order creation patterns
    SELECT 1 WHERE FALSE
) missing_orders;

-- 2. Monitor order creation success rate by day
SELECT 
    'Order Success Rate Monitor' as check_type,
    order_date,
    orders_created,
    payment_success_rate,
    CASE 
        WHEN payment_success_rate < 90 THEN '🚨 LOW SUCCESS RATE'
        WHEN payment_success_rate < 95 THEN '⚠️ WARNING'
        ELSE '✅ HEALTHY'
    END as status
FROM order_creation_monitoring
WHERE order_date >= CURRENT_DATE - INTERVAL '3 days'
ORDER BY order_date DESC;

-- 3. Check for orders without payment intents (potential data issues)
SELECT 
    'Data Consistency Check' as check_type,
    COUNT(*) as orders_without_payment_intent,
    CASE 
        WHEN COUNT(*) > 0 THEN '⚠️ INVESTIGATE'
        ELSE '✅ CONSISTENT'
    END as status
FROM orders 
WHERE stripe_payment_intent_id IS NULL 
    AND created_at >= CURRENT_DATE - INTERVAL '1 day';

-- 4. Recent order creation activity
SELECT 
    'Recent Activity' as check_type,
    DATE_TRUNC('hour', created_at) as hour,
    COUNT(*) as orders_created,
    ARRAY_AGG(DISTINCT status) as statuses
FROM orders 
WHERE created_at >= CURRENT_DATE - INTERVAL '24 hours'
GROUP BY DATE_TRUNC('hour', created_at)
ORDER BY hour DESC
LIMIT 10;