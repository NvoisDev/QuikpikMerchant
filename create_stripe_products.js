const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

async function createProducts() {
  try {
    // Create Standard product
    const standardProduct = await stripe.products.create({
      name: 'Quikpik Standard Plan',
      description: 'Up to 10 products, unlimited edits, advanced features',
      metadata: {
        plan: 'standard'
      }
    });

    const standardPrice = await stripe.prices.create({
      product: standardProduct.id,
      unit_amount: 1099, // £10.99 in pence
      currency: 'gbp',
      recurring: {
        interval: 'month'
      },
      metadata: {
        plan: 'standard'
      }
    });

    // Create Premium product
    const premiumProduct = await stripe.products.create({
      name: 'Quikpik Premium Plan',
      description: 'Unlimited products, unlimited edits, all features',
      metadata: {
        plan: 'premium'
      }
    });

    const premiumPrice = await stripe.prices.create({
      product: premiumProduct.id,
      unit_amount: 1999, // £19.99 in pence
      currency: 'gbp',
      recurring: {
        interval: 'month'
      },
      metadata: {
        plan: 'premium'
      }
    });

    console.log('Standard Price ID:', standardPrice.id);
    console.log('Premium Price ID:', premiumPrice.id);
    
    console.log('\nUpdate your server/routes.ts with these price IDs:');
    console.log(`const SUBSCRIPTION_PRICES = {`);
    console.log(`  standard: '${standardPrice.id}',`);
    console.log(`  premium: '${premiumPrice.id}'`);
    console.log(`};`);

  } catch (error) {
    console.error('Error creating products:', error);
  }
}

createProducts();
