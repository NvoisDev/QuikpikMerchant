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
    let freeProduct;
    try {
      freeProduct = await stripe.products.retrieve(STRIPE_PRODUCTS.FREE);
    } catch {
      freeProduct = await stripe.products.create({
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
    }

    // Create prices (only if they don't exist)
    let freePrice;
    try {
      const existingPrices = await stripe.prices.list({
        product: STRIPE_PRODUCTS.FREE,
        active: true
      });
      freePrice = existingPrices.data[0] || await stripe.prices.create({
        product: STRIPE_PRODUCTS.FREE,
        unit_amount: 0, // $0
        currency: 'gbp',
        recurring: { interval: 'month' },
        metadata: {
          tier: 'free'
        }
      });
    } catch (error) {
      freePrice = await stripe.prices.create({
        product: STRIPE_PRODUCTS.FREE,
        unit_amount: 0, // $0
        currency: 'gbp',
        recurring: { interval: 'month' },
        metadata: {
          tier: 'free'
        }
      });
    }

    // Create or update Standard Plan
    let standardProduct;
    try {
      standardProduct = await stripe.products.retrieve(STRIPE_PRODUCTS.STANDARD);
    } catch {
      standardProduct = await stripe.products.create({
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
    }

    let standardPrice;
    try {
      const existingPrices = await stripe.prices.list({
        product: STRIPE_PRODUCTS.STANDARD,
        active: true
      });
      standardPrice = existingPrices.data[0] || await stripe.prices.create({
        product: STRIPE_PRODUCTS.STANDARD,
        unit_amount: 999, // £9.99
        currency: 'gbp',
        recurring: { interval: 'month' },
        metadata: {
          tier: 'standard'
        }
      });
    } catch (error) {
      standardPrice = await stripe.prices.create({
        product: STRIPE_PRODUCTS.STANDARD,
        unit_amount: 999, // £9.99
        currency: 'gbp',
        recurring: { interval: 'month' },
        metadata: {
          tier: 'standard'
        }
      });
    }

    // Create or update Premium Plan
    let premiumProduct;
    try {
      premiumProduct = await stripe.products.retrieve(STRIPE_PRODUCTS.PREMIUM);
    } catch {
      premiumProduct = await stripe.products.create({
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
    }

    let premiumPrice;
    try {
      const existingPrices = await stripe.prices.list({
        product: STRIPE_PRODUCTS.PREMIUM,
        active: true
      });
      premiumPrice = existingPrices.data[0] || await stripe.prices.create({
        product: STRIPE_PRODUCTS.PREMIUM,
        unit_amount: 1999, // £19.99
        currency: 'gbp',
        recurring: { interval: 'month' },
        metadata: {
          tier: 'premium'
        }
      });
    } catch (error) {
      premiumPrice = await stripe.prices.create({
        product: STRIPE_PRODUCTS.PREMIUM,
        unit_amount: 1999, // £19.99
        currency: 'gbp',
        recurring: { interval: 'month' },
        metadata: {
          tier: 'premium'
        }
      });
    }

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
    // Get all prices for our products
    const prices = await stripe.prices.list({
      active: true,
      expand: ['data.product']
    });

    const availablePlans = [];
    
    for (const price of prices.data) {
      const product = price.product as Stripe.Product;
      
      // Only include our subscription products
      if (Object.values(STRIPE_PRODUCTS).includes(product.id)) {
        availablePlans.push({
          id: product.id,
          name: product.name || 'Unknown Plan',
          description: product.description || '',
          priceId: price.id,
          amount: price.unit_amount || 0,
          currency: price.currency,
          interval: price.recurring?.interval || 'month',
          metadata: product.metadata,
          tier: product.metadata.tier || 'free'
        });
      }
    }

    return availablePlans;

  } catch (error) {
    console.error('❌ Failed to get available plans:', error);
    throw error;
  }
}