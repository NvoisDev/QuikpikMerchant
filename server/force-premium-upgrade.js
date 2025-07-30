// Emergency Premium Upgrade Script
// Run this with: node server/force-premium-upgrade.js

import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function forcePremiumUpgrade() {
  try {
    console.log('🚀 Starting Premium upgrade for michael@nvois.co...');
    
    const result = await pool.query(`
      UPDATE users 
      SET 
        subscription_tier = 'premium',
        subscription_status = 'active',
        product_limit = -1,
        subscription_ends_at = '2026-12-31 23:59:59'
      WHERE email = 'michael@nvois.co'
      RETURNING id, email, subscription_tier, product_limit;
    `);
    
    if (result.rows.length > 0) {
      console.log('✅ Premium upgrade successful:');
      console.log(result.rows[0]);
    } else {
      console.log('❌ No user found with email michael@nvois.co');
    }
    
  } catch (error) {
    console.error('❌ Error during upgrade:', error);
  } finally {
    await pool.end();
  }
}

forcePremiumUpgrade();