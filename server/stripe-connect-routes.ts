import { Request, Response } from 'express';
import { db } from './db';
import { users } from '../shared/schema';
import { eq } from 'drizzle-orm';
import stripeConnectV2 from './stripe-connect-v2';

/**
 * NEW STRIPE CONNECT V2 API ROUTES
 * These routes implement the "Separate Charges and Transfers" architecture
 * Safe to add alongside existing routes without conflicts
 */

/**
 * Create Express connected account for wholesaler
 * POST /api/stripe-v2/create-account
 */
export async function createConnectAccountV2(req: Request, res: Response) {
  try {
    const { wholesalerId } = req.body;

    if (!wholesalerId) {
      return res.status(400).json({ error: 'wholesalerId is required' });
    }

    // Get wholesaler details
    const wholesaler = await db.query.users.findFirst({
      where: eq(users.id, wholesalerId)
    });

    if (!wholesaler) {
      return res.status(404).json({ error: 'Wholesaler not found' });
    }

    if (wholesaler.stripeAccountIdV2) {
      return res.status(400).json({ error: 'Wholesaler already has a V2 account' });
    }

    // Create Express account
    const account = await stripeConnectV2.createExpressAccount({
      businessName: wholesaler.businessName || undefined,
      email: wholesaler.email!,
      country: 'GB'
    });

    // Update wholesaler record
    await db.update(users)
      .set({
        stripeAccountIdV2: account.id,
        stripeAccountStatusV2: 'pending',
        stripeOnboardingCompletedV2: false,
        stripeCapabilities: account.capabilities
      })
      .where(eq(users.id, wholesalerId));

    res.json({
      success: true,
      accountId: account.id,
      account: {
        id: account.id,
        business_profile: account.business_profile,
        requirements: account.requirements,
        capabilities: account.capabilities
      }
    });

  } catch (error: any) {
    console.error('Error creating Connect account V2:', error);
    res.status(500).json({ 
      error: 'Failed to create Connect account',
      details: error.message 
    });
  }
}

/**
 * Create onboarding link for Express account
 * POST /api/stripe-v2/create-account-link
 */
export async function createAccountLinkV2(req: Request, res: Response) {
  try {
    const { wholesalerId } = req.body;

    if (!wholesalerId) {
      return res.status(400).json({ error: 'wholesalerId is required' });
    }

    // Get wholesaler with V2 account
    const wholesaler = await db.query.users.findFirst({
      where: eq(users.id, wholesalerId)
    });

    if (!wholesaler || !wholesaler.stripeAccountIdV2) {
      return res.status(404).json({ error: 'Wholesaler V2 account not found' });
    }

    // Create account link
    const returnUrl = `${process.env.BASE_URL || 'https://quikpik.app'}/onboarding/stripe-v2/return/${wholesalerId}`;
    const refreshUrl = `${process.env.BASE_URL || 'https://quikpik.app'}/onboarding/stripe-v2/refresh/${wholesalerId}`;

    const accountLink = await stripeConnectV2.createAccountLink(
      wholesaler.stripeAccountIdV2,
      returnUrl,
      refreshUrl
    );

    res.json({
      success: true,
      url: accountLink.url,
      expires_at: accountLink.expires_at
    });

  } catch (error: any) {
    console.error('Error creating account link V2:', error);
    res.status(500).json({ 
      error: 'Failed to create account link',
      details: error.message 
    });
  }
}

/**
 * Check account status and capabilities
 * GET /api/stripe-v2/account-status/:wholesalerId
 */
export async function getAccountStatusV2(req: Request, res: Response) {
  try {
    const { wholesalerId } = req.params;

    // Get wholesaler with V2 account
    const wholesaler = await db.query.users.findFirst({
      where: eq(users.id, wholesalerId)
    });

    if (!wholesaler || !wholesaler.stripeAccountIdV2) {
      return res.status(404).json({ error: 'Wholesaler V2 account not found' });
    }

    // Check account status with Stripe
    const accountStatus = await stripeConnectV2.checkAccountStatus(wholesaler.stripeAccountIdV2);

    // Update local database with latest status
    const updates: any = {
      stripeCapabilities: accountStatus.account.capabilities,
      stripeAccountStatusV2: accountStatus.account.details_submitted ? 'active' : 'pending'
    };

    if (accountStatus.canReceiveTransfers && !wholesaler.stripeOnboardingCompletedV2) {
      updates.stripeOnboardingCompletedV2 = true;
    }

    await db.update(users)
      .set(updates)
      .where(eq(users.id, wholesalerId));

    res.json({
      success: true,
      accountId: wholesaler.stripeAccountIdV2,
      canReceiveTransfers: accountStatus.canReceiveTransfers,
      requirements: accountStatus.requirements,
      onboardingCompleted: accountStatus.canReceiveTransfers,
      account: {
        id: accountStatus.account.id,
        charges_enabled: accountStatus.account.charges_enabled,
        details_submitted: accountStatus.account.details_submitted,
        payouts_enabled: accountStatus.account.payouts_enabled,
        capabilities: accountStatus.account.capabilities,
        requirements: accountStatus.account.requirements
      }
    });

  } catch (error: any) {
    console.error('Error checking account status V2:', error);
    res.status(500).json({ 
      error: 'Failed to check account status',
      details: error.message 
    });
  }
}

/**
 * Calculate payment split for order
 * POST /api/stripe-v2/calculate-payment
 */
export async function calculatePaymentV2(req: Request, res: Response) {
  try {
    const { 
      productSubtotal, 
      deliveryFee = 0, 
      customerPlatformFeeRate = 0.055, // 5.5%
      wholesalerPlatformFeeRate = 0.033, // 3.3%
      transactionFeeFixed = 0.50 
    } = req.body;

    if (!productSubtotal || productSubtotal <= 0) {
      return res.status(400).json({ error: 'Valid productSubtotal is required' });
    }

    const calculation = stripeConnectV2.calculatePaymentSplit({
      productSubtotal: parseFloat(productSubtotal),
      deliveryFee: parseFloat(deliveryFee),
      customerPlatformFeeRate,
      wholesalerPlatformFeeRate,
      transactionFeeFixed
    });

    res.json({
      success: true,
      calculation
    });

  } catch (error: any) {
    console.error('Error calculating payment V2:', error);
    res.status(500).json({ 
      error: 'Failed to calculate payment',
      details: error.message 
    });
  }
}

/**
 * Create platform payment intent (platform receives all funds)
 * POST /api/stripe-v2/create-payment-intent
 */
export async function createPaymentIntentV2(req: Request, res: Response) {
  try {
    const { 
      calculation, 
      orderId, 
      wholesalerId, 
      customerId,
      metadata = {} 
    } = req.body;

    if (!calculation || !orderId || !wholesalerId || !customerId) {
      return res.status(400).json({ 
        error: 'calculation, orderId, wholesalerId, and customerId are required' 
      });
    }

    const paymentIntent = await stripeConnectV2.createPlatformPaymentIntent(
      calculation,
      {
        orderId,
        wholesalerId,
        customerId,
        ...metadata
      }
    );

    res.json({
      success: true,
      client_secret: paymentIntent.client_secret,
      payment_intent_id: paymentIntent.id,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency
    });

  } catch (error: any) {
    console.error('Error creating payment intent V2:', error);
    res.status(500).json({ 
      error: 'Failed to create payment intent',
      details: error.message 
    });
  }
}

/**
 * Process complete payment flow (payment + transfer)
 * POST /api/stripe-v2/process-payment
 */
export async function processPaymentV2(req: Request, res: Response) {
  try {
    const { 
      paymentIntentId,
      orderId,
      wholesalerId,
      customerId,
      calculation 
    } = req.body;

    if (!paymentIntentId || !orderId || !wholesalerId || !customerId || !calculation) {
      return res.status(400).json({ 
        error: 'paymentIntentId, orderId, wholesalerId, customerId, and calculation are required' 
      });
    }

    // Get wholesaler account ID
    const wholesaler = await db.query.users.findFirst({
      where: eq(users.id, wholesalerId)
    });

    if (!wholesaler?.stripeAccountIdV2) {
      return res.status(400).json({ error: 'Wholesaler V2 account not found' });
    }

    // Process complete payment flow
    const result = await stripeConnectV2.processCompletePayment({
      calculation,
      wholesalerAccountId: wholesaler.stripeAccountIdV2,
      paymentIntentId,
      orderId,
      customerId
    });

    if (!result.success) {
      return res.status(400).json({
        error: result.error
      });
    }

    res.json({
      success: true,
      transfer: {
        id: result.transfer?.id,
        amount: result.transfer?.amount,
        currency: result.transfer?.currency,
        destination: result.transfer?.destination
      }
    });

  } catch (error: any) {
    console.error('Error processing payment V2:', error);
    res.status(500).json({ 
      error: 'Failed to process payment',
      details: error.message 
    });
  }
}

/**
 * Get platform balance
 * GET /api/stripe-v2/platform-balance
 */
export async function getPlatformBalanceV2(req: Request, res: Response) {
  try {
    const balance = await stripeConnectV2.getPlatformBalance();

    res.json({
      success: true,
      balance: {
        available: balance.available,
        pending: balance.pending,
        livemode: balance.livemode
      }
    });

  } catch (error: any) {
    console.error('Error getting platform balance V2:', error);
    res.status(500).json({ 
      error: 'Failed to get platform balance',
      details: error.message 
    });
  }
}

/**
 * Get recent transfers
 * GET /api/stripe-v2/recent-transfers
 */
export async function getRecentTransfersV2(req: Request, res: Response) {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const transfers = await stripeConnectV2.getRecentTransfers(limit);

    res.json({
      success: true,
      transfers: transfers.data.map(transfer => ({
        id: transfer.id,
        amount: transfer.amount,
        currency: transfer.currency,
        destination: transfer.destination,
        description: transfer.description,
        created: transfer.created,
        metadata: transfer.metadata
      }))
    });

  } catch (error: any) {
    console.error('Error getting recent transfers V2:', error);
    res.status(500).json({ 
      error: 'Failed to get recent transfers',
      details: error.message 
    });
  }
}

export default {
  createConnectAccountV2,
  createAccountLinkV2,
  getAccountStatusV2,
  calculatePaymentV2,
  createPaymentIntentV2,
  processPaymentV2,
  getPlatformBalanceV2,
  getRecentTransfersV2
};