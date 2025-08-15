import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY environment variable is required');
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-06-30.basil',
});

/**
 * NEW STRIPE CONNECT V2 SERVICE
 * Implements "Separate Charges and Transfers" architecture
 * Platform receives ALL funds first, then transfers wholesaler share
 */

export interface ConnectV2Config {
  productSubtotal: number;
  deliveryFee: number;
  customerPlatformFeeRate: number; // e.g., 0.055 for 5.5%
  wholesalerPlatformFeeRate: number; // e.g., 0.033 for 3.3%
  transactionFeeFixed: number; // e.g., 0.50 for £0.50
}

export interface PaymentCalculation {
  totalAmount: number;
  customerPlatformFee: number;
  wholesalerPlatformFee: number;
  platformTotal: number; // Total kept by platform
  wholesalerShare: number; // Amount transferred to wholesaler
  breakdown: {
    productSubtotal: number;
    deliveryFee: number;
    transactionFee: number;
    customerPlatformFee: number;
    wholesalerPlatformFee: number;
  };
}

/**
 * Calculate payment amounts for new architecture
 */
export function calculatePaymentSplit(config: ConnectV2Config): PaymentCalculation {
  const {
    productSubtotal,
    deliveryFee,
    customerPlatformFeeRate,
    wholesalerPlatformFeeRate,
    transactionFeeFixed
  } = config;

  // Customer pays platform fee on products only (not delivery)
  const customerPlatformFee = productSubtotal * customerPlatformFeeRate;
  const transactionFee = transactionFeeFixed;
  
  // Total amount customer pays
  const totalAmount = productSubtotal + deliveryFee + customerPlatformFee + transactionFee;
  
  // Wholesaler platform fee (deducted from their share)
  const wholesalerPlatformFee = productSubtotal * wholesalerPlatformFeeRate;
  
  // Wholesaler receives product amount minus their platform fee
  const wholesalerShare = productSubtotal - wholesalerPlatformFee;
  
  // Platform keeps: customer fee + wholesaler fee + delivery fee + transaction fee
  const platformTotal = customerPlatformFee + wholesalerPlatformFee + deliveryFee + transactionFee;

  return {
    totalAmount,
    customerPlatformFee,
    wholesalerPlatformFee,
    platformTotal,
    wholesalerShare,
    breakdown: {
      productSubtotal,
      deliveryFee,
      transactionFee,
      customerPlatformFee,
      wholesalerPlatformFee
    }
  };
}

/**
 * Create Express connected account for wholesaler
 */
export async function createExpressAccount(wholesaler: {
  businessName?: string;
  email: string;
  country?: string;
}): Promise<Stripe.Account> {
  const account = await stripe.accounts.create({
    type: 'express',
    country: wholesaler.country || 'GB',
    email: wholesaler.email,
    business_profile: wholesaler.businessName ? {
      name: wholesaler.businessName,
    } : undefined,
    capabilities: {
      transfers: { requested: true },
    },
    metadata: {
      created_via: 'quikpik_v2',
      wholesaler_email: wholesaler.email,
    }
  });

  return account;
}

/**
 * Create onboarding link for Express account
 */
export async function createAccountLink(
  accountId: string,
  returnUrl: string,
  refreshUrl: string
): Promise<Stripe.AccountLink> {
  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    return_url: returnUrl,
    refresh_url: refreshUrl,
    type: 'account_onboarding',
  });

  return accountLink;
}

/**
 * Create payment intent - Platform receives all funds
 */
export async function createPlatformPaymentIntent(
  calculation: PaymentCalculation,
  metadata: {
    orderId: string;
    wholesalerId: string;
    customerId: string;
    [key: string]: string;
  }
): Promise<Stripe.PaymentIntent> {
  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(calculation.totalAmount * 100), // Convert to cents
    currency: 'gbp',
    // NO on_behalf_of - payment goes directly to platform
    // NO transfer_data - we'll handle transfers separately
    metadata: {
      ...metadata,
      payment_type: 'platform_first_v2',
      wholesaler_share: calculation.wholesalerShare.toFixed(2),
      platform_total: calculation.platformTotal.toFixed(2),
    },
    description: `Order ${metadata.orderId} - Platform Payment`,
  });

  return paymentIntent;
}

/**
 * Transfer wholesaler share after successful payment
 */
export async function transferToWholesaler(
  wholesalerAccountId: string,
  amount: number,
  orderId: string,
  metadata?: Record<string, string>
): Promise<Stripe.Transfer> {
  const transfer = await stripe.transfers.create({
    amount: Math.round(amount * 100), // Convert to cents
    currency: 'gbp',
    destination: wholesalerAccountId,
    description: `Payment for Order #${orderId}`,
    metadata: {
      order_id: orderId,
      transfer_type: 'wholesaler_payment_v2',
      ...metadata,
    },
  });

  return transfer;
}

/**
 * Check if account is ready for transfers
 */
export async function checkAccountStatus(accountId: string): Promise<{
  canReceiveTransfers: boolean;
  requirements: string[];
  account: Stripe.Account;
}> {
  const account = await stripe.accounts.retrieve(accountId);
  
  const canReceiveTransfers = 
    account.capabilities?.transfers === 'active' &&
    account.requirements?.currently_due?.length === 0;
  
  return {
    canReceiveTransfers,
    requirements: account.requirements?.currently_due || [],
    account,
  };
}

/**
 * Get platform balance
 */
export async function getPlatformBalance(): Promise<Stripe.Balance> {
  return await stripe.balance.retrieve();
}

/**
 * List recent transfers
 */
export async function getRecentTransfers(limit = 10): Promise<Stripe.ApiList<Stripe.Transfer>> {
  return await stripe.transfers.list({ limit });
}

/**
 * Process complete payment flow
 */
export async function processCompletePayment(config: {
  calculation: PaymentCalculation;
  wholesalerAccountId: string;
  paymentIntentId: string;
  orderId: string;
  customerId: string;
}): Promise<{
  success: boolean;
  transfer?: Stripe.Transfer;
  error?: string;
}> {
  try {
    // Check if payment intent succeeded
    const paymentIntent = await stripe.paymentIntents.retrieve(config.paymentIntentId);
    
    if (paymentIntent.status !== 'succeeded') {
      return {
        success: false,
        error: 'Payment not completed'
      };
    }

    // Check if account can receive transfers
    const accountStatus = await checkAccountStatus(config.wholesalerAccountId);
    if (!accountStatus.canReceiveTransfers) {
      return {
        success: false,
        error: `Account not ready for transfers. Missing: ${accountStatus.requirements.join(', ')}`
      };
    }

    // Transfer to wholesaler
    const transfer = await transferToWholesaler(
      config.wholesalerAccountId,
      config.calculation.wholesalerShare,
      config.orderId,
      {
        customer_id: config.customerId,
        payment_intent: config.paymentIntentId,
      }
    );

    return {
      success: true,
      transfer,
    };

  } catch (error: any) {
    console.error('Error processing complete payment:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

export default {
  calculatePaymentSplit,
  createExpressAccount,
  createAccountLink,
  createPlatformPaymentIntent,
  transferToWholesaler,
  checkAccountStatus,
  getPlatformBalance,
  getRecentTransfers,
  processCompletePayment,
};