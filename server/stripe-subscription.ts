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
          support: 'email',
          tier: 'free'
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
          support: 'priority',
          tier: 'standard'
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
          support: 'priority',
          tier: 'premium'
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

// Create or update Stripe customer (with duplicate check)
export async function createOrUpdateStripeCustomer(userId: string, email: string, name?: string) {
  try {
    // First, check if customer already exists
    const existingCustomers = await stripe.customers.list({
      email: email,
      limit: 1
    });

    if (existingCustomers.data.length > 0) {
      const existingCustomer = existingCustomers.data[0];
      console.log(`✅ Found existing Stripe customer: ${existingCustomer.id} for user: ${userId}`);
      
      // Update metadata if needed
      if (existingCustomer.metadata.userId !== userId) {
        await stripe.customers.update(existingCustomer.id, {
          metadata: { userId }
        });
      }
      
      return existingCustomer;
    }

    // Create new customer only if none exists
    const customerData: Stripe.CustomerCreateParams = {
      email,
      metadata: { userId },
    };

    if (name) {
      customerData.name = name;
    }

    const customer = await stripe.customers.create(customerData);
    
    console.log(`✅ Created new Stripe customer: ${customer.id} for user: ${userId}`);
    return customer;

  } catch (error) {
    console.error('❌ Failed to create/update Stripe customer:', error);
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

// Create Stripe Checkout Session for subscription
export async function createCheckoutSession(stripeCustomerId: string, priceId: string, userId: string) {
  try {
    // Get the price to determine the tier
    const price = await stripe.prices.retrieve(priceId, {
      expand: ['product']
    });
    
    const product = price.product as Stripe.Product;
    const tier = product.metadata?.tier || 'standard';

    const session = await stripe.checkout.sessions.create({
      customer: stripeCustomerId,
      payment_method_types: ['card'],
      line_items: [{
        price: priceId,
        quantity: 1,
      }],
      mode: 'subscription',
      success_url: `${process.env.REPLIT_DEV_DOMAIN || 'http://localhost:5000'}/dashboard?upgrade=success`,
      cancel_url: `${process.env.REPLIT_DEV_DOMAIN || 'http://localhost:5000'}/dashboard?upgrade=cancelled`,
      metadata: {
        userId: userId,
        priceId: priceId,
        tier: tier // Include tier for webhook processing
      }
    });

    return session;

  } catch (error) {
    console.error('❌ Failed to create checkout session:', error);
    throw error;
  }
}

// Get all available plans with current pricing (hybrid approach: hardcoded IDs + metadata)
export async function getAvailablePlans() {
  try {
    console.log('🔍 Fetching available plans...');
    
    // Get all prices with product expansion to avoid separate API calls
    const prices = await stripe.prices.list({
      active: true,
      expand: ['data.product'],
      type: 'recurring'
    });

    console.log(`🔍 Found ${prices.data.length} active recurring prices`);

    const availablePlans = [];
    
    for (const price of prices.data) {
      const product = price.product as Stripe.Product;
      
      console.log(`🔍 Checking product: ${product.id} - ${product.name}, metadata:`, product.metadata);
      
      // Support both approaches: hardcoded product IDs and metadata filtering
      const isSubscriptionProduct = Object.values(STRIPE_PRODUCTS).includes(product.id) || 
                                   (product.metadata?.tier && ['free', 'standard', 'premium'].includes(product.metadata.tier));
      
      if (isSubscriptionProduct) {
        // Determine tier from metadata or product name/ID
        let tier = product.metadata?.tier;
        if (!tier) {
          // Fallback: determine tier from product name or ID
          const name = product.name?.toLowerCase() || '';
          if (name.includes('premium') || product.id === STRIPE_PRODUCTS.PREMIUM) {
            tier = 'premium';
          } else if (name.includes('standard') || product.id === STRIPE_PRODUCTS.STANDARD) {
            tier = 'standard';
          } else {
            tier = 'free';
          }
        }
        
        console.log(`✅ Adding plan: ${product.name} (${tier}) - Price: ${price.id}`);
        
        availablePlans.push({
          id: product.id,
          name: product.name || 'Unknown Plan',
          description: product.description || '',
          priceId: price.id,
          amount: price.unit_amount || 0,
          currency: price.currency,
          interval: price.recurring?.interval || 'month',
          metadata: product.metadata,
          tier: tier
        });
      } else {
        console.log(`⏭️ Skipping non-subscription product: ${product.name}`);
      }
    }

    // Sort by tier priority (free, standard, premium)
    const tierOrder = { 'free': 0, 'standard': 1, 'premium': 2 };
    availablePlans.sort((a, b) => tierOrder[a.tier as keyof typeof tierOrder] - tierOrder[b.tier as keyof typeof tierOrder]);

    console.log(`✅ Final plans count: ${availablePlans.length}`);
    return availablePlans;

  } catch (error) {
    console.error('❌ Failed to get available plans:', error);
    throw error;
  }
}