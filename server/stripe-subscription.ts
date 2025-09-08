import Stripe from 'stripe';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY environment variable is required');
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16',
});

// Stripe Product IDs for each subscription tier
export const STRIPE_PRODUCTS = {
  FREE: 'prod_free_plan', // Will be created as $0/month product
  STANDARD: 'prod_standard_plan', 
  PREMIUM: 'prod_premium_plan'
} as const;

// Initialize Stripe products and prices
export async function initializeStripeProducts() {
  try {
    console.log('🔧 Initializing Stripe products and prices...');
    
    // Create or update Free Plan ($0/month)
    const freeProduct = await stripe.products.upsert({
      id: STRIPE_PRODUCTS.FREE,
      name: 'Free Plan',
      description: 'Basic features for getting started',
      metadata: {
        productLimit: '3',
        teamMembers: '1',
        whatsappIntegration: 'basic',
        support: 'email'
      }
    });

    const freePrice = await stripe.prices.create({
      product: STRIPE_PRODUCTS.FREE,
      unit_amount: 0, // $0
      currency: 'gbp',
      recurring: { interval: 'month' },
      metadata: {
        tier: 'free'
      }
    });

    // Create or update Standard Plan
    const standardProduct = await stripe.products.upsert({
      id: STRIPE_PRODUCTS.STANDARD,
      name: 'Standard Plan', 
      description: 'Enhanced features for growing businesses',
      metadata: {
        productLimit: '50',
        teamMembers: '3',
        whatsappIntegration: 'advanced',
        support: 'priority'
      }
    });

    const standardPrice = await stripe.prices.create({
      product: STRIPE_PRODUCTS.STANDARD,
      unit_amount: 999, // £9.99
      currency: 'gbp',
      recurring: { interval: 'month' },
      metadata: {
        tier: 'standard'
      }
    });

    // Create or update Premium Plan
    const premiumProduct = await stripe.products.upsert({
      id: STRIPE_PRODUCTS.PREMIUM,
      name: 'Premium Plan',
      description: 'All features including team management and marketplace access',
      metadata: {
        productLimit: '-1', // Unlimited
        teamMembers: '-1', // Unlimited
        whatsappIntegration: 'full',
        marketplaceAccess: 'true',
        support: 'priority'
      }
    });

    const premiumPrice = await stripe.prices.create({
      product: STRIPE_PRODUCTS.PREMIUM,
      unit_amount: 1999, // £19.99
      currency: 'gbp',
      recurring: { interval: 'month' },
      metadata: {
        tier: 'premium'
      }
    });

    console.log('✅ Stripe products initialized successfully');
    return {
      free: { product: freeProduct, price: freePrice },
      standard: { product: standardProduct, price: standardPrice },
      premium: { product: premiumProduct, price: premiumPrice }
    };

  } catch (error) {
    console.error('❌ Failed to initialize Stripe products:', error);
    throw error;
  }
}

// Get user's current subscription from Stripe
export async function getUserSubscription(stripeCustomerId: string, stripeSubscriptionId?: string) {
  try {
    if (!stripeSubscriptionId) {
      // No subscription ID - user might have Free plan or no subscription
      return {
        tier: 'free',
        status: 'active',
        productLimit: 3,
        teamMembers: 1,
        features: {
          whatsappIntegration: 'basic',
          marketplaceAccess: false,
          support: 'email'
        }
      };
    }

    const subscription = await stripe.subscriptions.retrieve(stripeSubscriptionId, {
      expand: ['items.data.price.product']
    });

    const product = subscription.items.data[0]?.price?.product as Stripe.Product;
    const metadata = product?.metadata || {};

    return {
      tier: metadata.tier || 'free',
      status: subscription.status,
      productLimit: parseInt(metadata.productLimit || '3'),
      teamMembers: parseInt(metadata.teamMembers || '1'),
      features: {
        whatsappIntegration: metadata.whatsappIntegration || 'basic',
        marketplaceAccess: metadata.marketplaceAccess === 'true',
        support: metadata.support || 'email'
      },
      currentPeriodEnd: subscription.current_period_end,
      cancelAtPeriodEnd: subscription.cancel_at_period_end
    };

  } catch (error) {
    console.error('❌ Failed to get user subscription:', error);
    // Fallback to free plan
    return {
      tier: 'free',
      status: 'active',
      productLimit: 3,
      teamMembers: 1,
      features: {
        whatsappIntegration: 'basic',
        marketplaceAccess: false,
        support: 'email'
      }
    };
  }
}

// Create or update Stripe customer
export async function createOrUpdateStripeCustomer(userId: string, email: string, name?: string) {
  try {
    const customerData: Stripe.CustomerCreateParams = {
      email,
      metadata: { userId },
    };

    if (name) {
      customerData.name = name;
    }

    const customer = await stripe.customers.create(customerData);
    
    console.log(`✅ Created Stripe customer: ${customer.id} for user: ${userId}`);
    return customer;

  } catch (error) {
    console.error('❌ Failed to create Stripe customer:', error);
    throw error;
  }
}

// Create subscription for a user
export async function createSubscription(stripeCustomerId: string, priceId: string) {
  try {
    const subscription = await stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      expand: ['latest_invoice.payment_intent'],
    });

    return subscription;

  } catch (error) {
    console.error('❌ Failed to create subscription:', error);
    throw error;
  }
}

// Get all available plans with current pricing
export async function getAvailablePlans() {
  try {
    const products = await stripe.products.list({
      ids: Object.values(STRIPE_PRODUCTS),
      expand: ['data.default_price']
    });

    return products.data.map(product => {
      const price = product.default_price as Stripe.Price;
      return {
        id: product.id,
        name: product.name,
        description: product.description,
        priceId: price.id,
        amount: price.unit_amount || 0,
        currency: price.currency,
        interval: price.recurring?.interval,
        metadata: product.metadata,
        tier: product.metadata.tier
      };
    });

  } catch (error) {
    console.error('❌ Failed to get available plans:', error);
    throw error;
  }
}