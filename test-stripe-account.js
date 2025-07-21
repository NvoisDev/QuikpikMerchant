#!/usr/bin/env node

// Test script to check Stripe Connect account status  
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

async function checkStripeAccount() {
  try {
    // Import Stripe
    const Stripe = require('stripe');
    
    // Get Stripe secret key from environment
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      throw new Error('STRIPE_SECRET_KEY environment variable not found');
    }
    
    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2023-10-16',
    });

    const accountId = 'acct_1RnJiIPkpmhGjyKR';
    console.log(`🔍 Checking Stripe Connect account: ${accountId}`);
    console.log('');
    
    // Retrieve account details
    const account = await stripe.accounts.retrieve(accountId);
    
    console.log('📋 Account Status:');
    console.log(`   Account ID: ${account.id}`);
    console.log(`   Type: ${account.type}`);
    console.log(`   Country: ${account.country}`);
    console.log(`   Email: ${account.email || 'Not set'}`);
    console.log('');
    
    console.log('✅ Capabilities:');
    console.log(`   Card Payments: ${account.capabilities?.card_payments || 'Not set'}`);
    console.log(`   Transfers: ${account.capabilities?.transfers || 'Not set'}`);
    console.log('');
    
    console.log('🏢 Business Profile:');
    console.log(`   Business Name: ${account.business_profile?.name || 'Not set'}`);
    console.log(`   Support Email: ${account.business_profile?.support_email || 'Not set'}`);
    console.log('');
    
    console.log('🔐 Account Status:');
    console.log(`   Details Submitted: ${account.details_submitted ? '✅ YES' : '❌ NO'}`);
    console.log(`   Charges Enabled: ${account.charges_enabled ? '✅ YES' : '❌ NO'}`);
    console.log(`   Payouts Enabled: ${account.payouts_enabled ? '✅ YES' : '❌ NO'}`);
    console.log('');
    
    if (account.requirements) {
      console.log('⚠️  Requirements:');
      if (account.requirements.currently_due?.length > 0) {
        console.log(`   Currently Due: ${account.requirements.currently_due.join(', ')}`);
      }
      if (account.requirements.eventually_due?.length > 0) {
        console.log(`   Eventually Due: ${account.requirements.eventually_due.join(', ')}`);
      }
      if (account.requirements.past_due?.length > 0) {
        console.log(`   Past Due: ${account.requirements.past_due.join(', ')}`);
      }
      if (account.requirements.pending_verification?.length > 0) {
        console.log(`   Pending Verification: ${account.requirements.pending_verification.join(', ')}`);
      }
      console.log('');
    }
    
    // Determine overall status
    const canAcceptPayments = account.charges_enabled && account.details_submitted;
    console.log('🎯 Summary:');
    console.log(`   Ready for Payments: ${canAcceptPayments ? '✅ YES' : '❌ NO'}`);
    
    if (!canAcceptPayments) {
      console.log('');
      console.log('🔧 Action Required:');
      if (!account.details_submitted) {
        console.log('   ⚡ Complete Stripe Connect onboarding process');
      }
      if (!account.charges_enabled) {
        console.log('   ⚡ Enable charge capabilities (usually done during onboarding)');
      }
    }
    
  } catch (error) {
    console.error('❌ Error checking Stripe account:', error.message);
    
    if (error.type === 'StripeInvalidRequestError') {
      console.log('');
      console.log('💡 Possible issues:');
      console.log('   • Account ID might be incorrect');
      console.log('   • Account might have been deleted');
      console.log('   • API key might not have access to this account');
    }
  }
}

checkStripeAccount();