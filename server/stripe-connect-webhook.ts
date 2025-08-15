import { Request, Response } from 'express';
import Stripe from 'stripe';
import { db } from './db';
import { orders, users, stripeTransfersV2, paymentCalculationsV2 } from '../shared/schema';
import { eq } from 'drizzle-orm';
import stripeConnectV2 from './stripe-connect-v2';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY environment variable is required');
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-06-30.basil',
});

/**
 * NEW STRIPE CONNECT V2 WEBHOOK HANDLER
 * Handles webhooks for the "Separate Charges and Transfers" architecture
 * This runs alongside the existing webhook system without conflicts
 */

export async function handleStripeWebhookV2(req: Request, res: Response) {
  const sig = req.headers['stripe-signature'] as string;
  
  if (!sig) {
    console.error('❌ V2 Webhook: Missing Stripe signature');
    return res.status(400).send('Missing Stripe signature');
  }

  let event: Stripe.Event;

  try {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET_V2 || process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      throw new Error('STRIPE_WEBHOOK_SECRET or STRIPE_WEBHOOK_SECRET_V2 required');
    }

    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    console.log(`🔔 V2 Webhook received: ${event.type} - ${event.id}`);

  } catch (err: any) {
    console.error('❌ V2 Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentSucceededV2(event.data.object as Stripe.PaymentIntent);
        break;
        
      case 'transfer.created':
        await handleTransferCreatedV2(event.data.object as Stripe.Transfer);
        break;
        
      case 'transfer.updated':
        await handleTransferUpdatedV2(event.data.object as Stripe.Transfer);
        break;
        
      case 'account.updated':
        await handleAccountUpdatedV2(event.data.object as Stripe.Account);
        break;
        
      default:
        console.log(`🔍 V2 Webhook: Unhandled event type ${event.type}`);
    }

    res.json({ received: true, event_type: event.type });

  } catch (error: any) {
    console.error(`❌ V2 Webhook error processing ${event.type}:`, error);
    res.status(500).json({ error: 'Webhook processing failed', details: error.message });
  }
}

/**
 * Handle successful payment - trigger transfer to wholesaler
 */
async function handlePaymentSucceededV2(paymentIntent: Stripe.PaymentIntent) {
  console.log(`💳 V2 Payment succeeded: ${paymentIntent.id} - £${(paymentIntent.amount / 100).toFixed(2)}`);

  // Check if this is a V2 payment (platform-first)
  if (paymentIntent.metadata.payment_type !== 'platform_first_v2') {
    console.log(`⏭️ V2 Webhook: Skipping non-V2 payment ${paymentIntent.id}`);
    return;
  }

  const orderId = paymentIntent.metadata.orderId || paymentIntent.metadata.order_id;
  const wholesalerId = paymentIntent.metadata.wholesalerId || paymentIntent.metadata.wholesaler_id;
  const customerId = paymentIntent.metadata.customerId || paymentIntent.metadata.customer_id;

  if (!orderId || !wholesalerId) {
    console.error('❌ V2 Webhook: Missing orderId or wholesalerId in payment metadata');
    return;
  }

  try {
    // Get order and wholesaler details
    const order = await db.query.orders.findFirst({
      where: eq(orders.id, orderId)
    });

    const wholesaler = await db.query.users.findFirst({
      where: eq(users.id, wholesalerId)
    });

    if (!order || !wholesaler) {
      console.error(`❌ V2 Webhook: Order ${orderId} or wholesaler ${wholesalerId} not found`);
      return;
    }

    if (!wholesaler.stripeAccountIdV2) {
      console.error(`❌ V2 Webhook: Wholesaler ${wholesalerId} has no V2 account`);
      return;
    }

    // Calculate payment split using stored metadata or reconstruct
    const wholesalerShare = parseFloat(paymentIntent.metadata.wholesaler_share || '0');
    const platformTotal = parseFloat(paymentIntent.metadata.platform_total || '0');

    if (wholesalerShare <= 0) {
      console.error(`❌ V2 Webhook: Invalid wholesaler share: ${wholesalerShare}`);
      return;
    }

    // Check if transfer already exists
    const existingTransfer = await db.query.stripeTransfersV2.findFirst({
      where: eq(stripeTransfersV2.stripePaymentIntentId, paymentIntent.id)
    });

    if (existingTransfer) {
      console.log(`⚠️ V2 Webhook: Transfer already exists for payment ${paymentIntent.id}`);
      return;
    }

    // Create transfer to wholesaler
    console.log(`💸 V2 Creating transfer: £${wholesalerShare} to ${wholesaler.stripeAccountIdV2}`);
    
    const transfer = await stripeConnectV2.transferToWholesaler(
      wholesaler.stripeAccountIdV2,
      wholesalerShare,
      orderId,
      {
        customer_id: customerId,
        payment_intent: paymentIntent.id,
        wholesaler_id: wholesalerId
      }
    );

    // Record transfer in database
    await db.insert(stripeTransfersV2).values({
      orderId,
      wholesalerId,
      stripeTransferId: transfer.id,
      stripeAccountId: wholesaler.stripeAccountIdV2,
      amount: wholesalerShare.toString(),
      currency: 'GBP',
      status: 'succeeded',
      platformFee: platformTotal.toString(),
      deliveryFee: (parseFloat(order.shippingTotal || '0')).toString(),
      stripePaymentIntentId: paymentIntent.id,
      transferredAt: new Date(),
      metadata: {
        transfer_stripe_id: transfer.id,
        original_payment_amount: paymentIntent.amount / 100
      }
    });

    // Store payment calculation for audit
    await db.insert(paymentCalculationsV2).values({
      orderId,
      stripePaymentIntentId: paymentIntent.id,
      totalAmount: (paymentIntent.amount / 100).toString(),
      productSubtotal: order.subtotal || '0',
      deliveryFee: order.shippingTotal || '0',
      transactionFee: '0.50', // Fixed transaction fee
      customerPlatformFee: '0', // Will be calculated properly in production
      wholesalerPlatformFee: (platformTotal - parseFloat(order.shippingTotal || '0') - 0.50).toString(),
      platformTotal: platformTotal.toString(),
      wholesalerShare: wholesalerShare.toString(),
      customerPlatformFeeRate: '0.0550', // 5.5%
      wholesalerPlatformFeeRate: '0.0330' // 3.3%
    });

    console.log(`✅ V2 Transfer completed: ${transfer.id} for £${wholesalerShare}`);

  } catch (error: any) {
    console.error(`❌ V2 Webhook: Error processing transfer for payment ${paymentIntent.id}:`, error);
  }
}

/**
 * Handle transfer creation
 */
async function handleTransferCreatedV2(transfer: Stripe.Transfer) {
  console.log(`💸 V2 Transfer created: ${transfer.id} - £${(transfer.amount / 100).toFixed(2)}`);

  // Update transfer status in database if it exists
  const existingTransfer = await db.query.stripeTransfersV2.findFirst({
    where: eq(stripeTransfersV2.stripeTransferId, transfer.id)
  });

  if (existingTransfer) {
    await db.update(stripeTransfersV2)
      .set({ status: 'succeeded' })
      .where(eq(stripeTransfersV2.stripeTransferId, transfer.id));
  }
}

/**
 * Handle transfer updates (succeeded, failed, etc.)
 */
async function handleTransferUpdatedV2(transfer: Stripe.Transfer) {
  console.log(`🔄 V2 Transfer updated: ${transfer.id} - Status: ${transfer.status || 'unknown'}`);

  // Update transfer status in database
  const existingTransfer = await db.query.stripeTransfersV2.findFirst({
    where: eq(stripeTransfersV2.stripeTransferId, transfer.id)
  });

  if (existingTransfer) {
    await db.update(stripeTransfersV2)
      .set({ 
        status: transfer.status || 'unknown',
        metadata: {
          ...existingTransfer.metadata,
          last_updated: new Date().toISOString(),
          stripe_status: transfer.status
        }
      })
      .where(eq(stripeTransfersV2.stripeTransferId, transfer.id));

    console.log(`✅ V2 Transfer ${transfer.id} status updated to: ${transfer.status}`);
  }
}

/**
 * Handle account updates (onboarding completion, capability changes)
 */
async function handleAccountUpdatedV2(account: Stripe.Account) {
  console.log(`👤 V2 Account updated: ${account.id}`);

  // Find wholesaler with this account ID
  const wholesaler = await db.query.users.findFirst({
    where: eq(users.stripeAccountIdV2, account.id)
  });

  if (!wholesaler) {
    console.log(`⚠️ V2 Webhook: No wholesaler found for account ${account.id}`);
    return;
  }

  // Update account status and capabilities
  const canReceiveTransfers = 
    account.capabilities?.transfers === 'active' &&
    account.requirements?.currently_due?.length === 0;

  await db.update(users)
    .set({
      stripeAccountStatusV2: account.details_submitted ? 'active' : 'pending',
      stripeOnboardingCompletedV2: canReceiveTransfers,
      stripeCapabilities: account.capabilities || {}
    })
    .where(eq(users.id, wholesaler.id));

  console.log(`✅ V2 Account ${account.id} updated - Can receive transfers: ${canReceiveTransfers}`);
}

export default {
  handleStripeWebhookV2
};