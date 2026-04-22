import { describe, it, expect } from 'vitest';
import {
  getEmailLogoUrl,
  wrapCustomerEmail,
  emailButton,
  emailCard,
  emailHeading,
  emailTable,
  emailBadge,
  emailDivider,
  generateWholesalerOrderNotificationEmail,
  generateReadyForCollectionEmail,
  generateDowngradeScheduledEmail,
  generateDowngradeEffectiveEmail,
  type OrderEmailData,
  type ReadyForCollectionEmailData,
  type DowngradeScheduledEmailData,
  type DowngradeEffectiveEmailData,
} from '../server/email-templates';

// ---------------------------------------------------------------------------
// getEmailLogoUrl
// ---------------------------------------------------------------------------

describe('getEmailLogoUrl', () => {
  it('returns undefined when logoUrl is falsy', () => {
    expect(getEmailLogoUrl('ws1', 'custom', null)).toBeUndefined();
    expect(getEmailLogoUrl('ws1', 'custom', '')).toBeUndefined();
    expect(getEmailLogoUrl('ws1', 'custom', undefined)).toBeUndefined();
  });

  it('returns the hosted logo API URL for custom logos with a wholesaler id', () => {
    const url = getEmailLogoUrl('ws123', 'custom', 'data:image/png;base64,abc');
    expect(url).toBe('https://quikpik.app/api/logo/ws123');
  });

  it('returns the URL as-is when it already starts with http', () => {
    const hostedUrl = 'https://cdn.example.com/logo.png';
    expect(getEmailLogoUrl('ws1', 'default', hostedUrl)).toBe(hostedUrl);
  });

  it('returns undefined for a non-http, non-custom logo', () => {
    expect(getEmailLogoUrl('ws1', 'default', '/relative/logo.png')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Primitive email helpers
// ---------------------------------------------------------------------------

describe('emailButton', () => {
  it('renders an anchor tag with the given text and URL', () => {
    const html = emailButton('Click Me', 'https://example.com');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('Click Me');
  });

  it('uses the default green background colour', () => {
    const html = emailButton('Go', 'https://example.com');
    expect(html).toContain('#10b981');
  });

  it('uses a custom background colour when provided', () => {
    const html = emailButton('Go', 'https://example.com', '#ff0000');
    expect(html).toContain('#ff0000');
    expect(html).not.toContain('#10b981');
  });
});

describe('emailCard', () => {
  it('wraps content in a div', () => {
    const html = emailCard('<p>Hello</p>');
    expect(html).toContain('<p>Hello</p>');
    expect(html).toContain('<div');
    expect(html).toContain('</div>');
  });

  it('uses custom border and background colour', () => {
    const html = emailCard('content', { borderColor: '#aabbcc', bgColor: '#112233' });
    expect(html).toContain('#aabbcc');
    expect(html).toContain('#112233');
  });
});

describe('emailHeading', () => {
  it('renders an h2 with the given text', () => {
    const html = emailHeading('My Heading');
    expect(html).toContain('<h2');
    expect(html).toContain('My Heading');
    expect(html).toContain('</h2>');
  });

  it('applies custom colour and size', () => {
    const html = emailHeading('Test', { color: '#ff0000', size: '24px' });
    expect(html).toContain('#ff0000');
    expect(html).toContain('24px');
  });
});

describe('emailTable', () => {
  it('renders headers and rows', () => {
    const html = emailTable(['Name', 'Price'], [['Widget', '£5.00']]);
    expect(html).toContain('Name');
    expect(html).toContain('Price');
    expect(html).toContain('Widget');
    expect(html).toContain('£5.00');
  });

  it('includes thead and tbody elements', () => {
    const html = emailTable(['A'], [['B']]);
    expect(html).toContain('<thead>');
    expect(html).toContain('<tbody>');
  });
});

describe('emailBadge', () => {
  it('renders the badge text', () => {
    const html = emailBadge('NEW');
    expect(html).toContain('NEW');
  });

  it('uses the default green colour', () => {
    const html = emailBadge('OK');
    expect(html).toContain('#10b981');
  });

  it('uses a custom colour when provided', () => {
    const html = emailBadge('WARN', '#ff9900');
    expect(html).toContain('#ff9900');
  });
});

describe('emailDivider', () => {
  it('renders an hr element', () => {
    expect(emailDivider()).toContain('<hr');
  });
});

// ---------------------------------------------------------------------------
// wrapCustomerEmail
// ---------------------------------------------------------------------------

describe('wrapCustomerEmail', () => {
  it('wraps body in a valid HTML structure', () => {
    const html = wrapCustomerEmail('<p>Body</p>', { businessName: 'Acme' });
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<p>Body</p>');
    expect(html).toContain('Acme');
  });

  it('includes the preheader text when provided', () => {
    const html = wrapCustomerEmail('<p>Hi</p>', { businessName: 'Acme' }, { preheader: 'Preview text' });
    expect(html).toContain('Preview text');
  });

  it('does not include a preheader span when omitted', () => {
    const html = wrapCustomerEmail('<p>Hi</p>', { businessName: 'Acme' });
    expect(html).not.toContain('display:none');
  });

  it('renders a hosted logo image when logoUrl starts with http', () => {
    const html = wrapCustomerEmail('<p>Hi</p>', {
      businessName: 'Acme',
      logoUrl: 'https://cdn.example.com/logo.png',
    });
    expect(html).toContain('<img');
    expect(html).toContain('https://cdn.example.com/logo.png');
  });

  it('renders initials avatar when no hosted logo is present', () => {
    const html = wrapCustomerEmail('<p>Hi</p>', { businessName: 'Acme Corp' });
    expect(html).toContain('AC');
    expect(html).not.toContain('<img');
  });
});

// ---------------------------------------------------------------------------
// generateWholesalerOrderNotificationEmail
// ---------------------------------------------------------------------------

const baseOrderData: OrderEmailData = {
  orderNumber: 'ORD-999',
  customerName: 'Bob Smith',
  customerEmail: 'bob@example.com',
  customerPhone: '07700900123',
  total: '50.00',
  subtotal: '48.00',
  platformFee: '2.21',
  customerTransactionFee: '0.00',
  wholesalerPlatformFee: '2.21',
  fulfillmentType: 'delivery',
  items: [
    { productName: 'Apple Juice', quantity: 3, unitPrice: '16.00', total: '48.00' },
  ],
  wholesaler: {
    id: 'ws1',
    businessName: 'Fresh Foods Ltd',
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@freshfoods.com',
  },
  orderDate: '2025-04-20T10:00:00Z',
};

describe('generateWholesalerOrderNotificationEmail — delivery order', () => {
  const result = generateWholesalerOrderNotificationEmail(baseOrderData);

  it('generates a subject containing the order number and customer name', () => {
    expect(result.subject).toContain('ORD-999');
    expect(result.subject).toContain('Bob Smith');
  });

  it('HTML contains order number', () => {
    expect(result.html).toContain('ORD-999');
  });

  it('HTML contains customer name and email', () => {
    expect(result.html).toContain('Bob Smith');
    expect(result.html).toContain('bob@example.com');
  });

  it('HTML contains item product name', () => {
    expect(result.html).toContain('Apple Juice');
  });

  it('HTML contains subtotal', () => {
    expect(result.html).toContain('48.00');
  });

  it('HTML contains "View Orders" button', () => {
    expect(result.html).toContain('View Orders');
  });

  it('plain text contains order number and customer details', () => {
    expect(result.text).toContain('ORD-999');
    expect(result.text).toContain('Bob Smith');
    expect(result.text).toContain('bob@example.com');
  });

  it('plain text does NOT contain pickup card for delivery orders', () => {
    expect(result.html).not.toContain('Customer Collection');
  });
});

describe('generateWholesalerOrderNotificationEmail — pickup order', () => {
  const pickupData: OrderEmailData = { ...baseOrderData, fulfillmentType: 'pickup' };
  const result = generateWholesalerOrderNotificationEmail(pickupData);

  it('HTML contains "Customer Collection" notice', () => {
    expect(result.html).toContain('Customer Collection');
  });

  it('plain text mentions Customer Pickup', () => {
    expect(result.text).toContain('Customer Pickup');
  });
});

describe('generateWholesalerOrderNotificationEmail — with shipping', () => {
  const dataWithShipping: OrderEmailData = {
    ...baseOrderData,
    shippingTotal: '5.00',
    shippingAddress: '123 High St, London',
  };
  const result = generateWholesalerOrderNotificationEmail(dataWithShipping);

  it('HTML includes shipping row', () => {
    expect(result.html).toContain('Shipping:');
  });

  it('plain text includes shipping amount', () => {
    expect(result.text).toContain('Shipping:');
  });

  it('HTML includes delivery address', () => {
    expect(result.html).toContain('123 High St, London');
  });
});

// ---------------------------------------------------------------------------
// generateReadyForCollectionEmail
// ---------------------------------------------------------------------------

const baseReadyData: ReadyForCollectionEmailData = {
  orderNumber: 'ORD-100',
  customerName: 'Carol White',
  wholesalerName: 'Fresh Foods Ltd',
  orderTotal: '75.50',
  readyTime: '14:00 today',
  orderUrl: 'https://quikpik.app/orders/ORD-100',
};

describe('generateReadyForCollectionEmail — collection (default)', () => {
  const result = generateReadyForCollectionEmail(baseReadyData);

  it('subject says "Ready for Collection"', () => {
    expect(result.subject).toContain('Ready for Collection');
    expect(result.subject).toContain('ORD-100');
  });

  it('HTML contains READY TO COLLECT badge', () => {
    expect(result.html).toContain('READY TO COLLECT');
  });

  it('HTML addresses the customer by name', () => {
    expect(result.html).toContain('Carol White');
  });

  it('HTML contains order number', () => {
    expect(result.html).toContain('ORD-100');
  });

  it('HTML contains formatted order total', () => {
    expect(result.html).toContain('75.50');
  });

  it('HTML contains "Collect From" label', () => {
    expect(result.html).toContain('Collect From:');
  });

  it('HTML contains View Order button linking to orderUrl', () => {
    expect(result.html).toContain('https://quikpik.app/orders/ORD-100');
  });

  it('plain text contains order number and total', () => {
    expect(result.text).toContain('ORD-100');
    expect(result.text).toContain('75.50');
  });

  it('plain text instructs customer to contact wholesaler for collection', () => {
    expect(result.text).toContain('arrange a collection time');
  });
});

describe('generateReadyForCollectionEmail — collection with optional address & phone', () => {
  const dataWithExtras: ReadyForCollectionEmailData = {
    ...baseReadyData,
    businessAddress: '10 Baker St, London',
    businessPhone: '02012345678',
  };
  const result = generateReadyForCollectionEmail(dataWithExtras);

  it('HTML includes business address', () => {
    expect(result.html).toContain('10 Baker St, London');
  });

  it('HTML includes clickable phone link', () => {
    expect(result.html).toContain('tel:02012345678');
  });

  it('plain text includes business address', () => {
    expect(result.text).toContain('10 Baker St, London');
  });
});

describe('generateReadyForCollectionEmail — delivery fulfillment', () => {
  const deliveryData: ReadyForCollectionEmailData = {
    ...baseReadyData,
    fulfillmentType: 'delivery',
    deliveryAddress: '5 Elm Ave, Manchester',
    businessPhone: '01612345678',
  };
  const result = generateReadyForCollectionEmail(deliveryData);

  it('subject says "Ready for Delivery"', () => {
    expect(result.subject).toContain('Ready for Delivery');
  });

  it('HTML contains READY FOR DELIVERY badge', () => {
    expect(result.html).toContain('READY FOR DELIVERY');
  });

  it('HTML shows "Delivery To" label', () => {
    expect(result.html).toContain('Delivery To:');
  });

  it('HTML contains delivery address', () => {
    expect(result.html).toContain('5 Elm Ave, Manchester');
  });

  it('plain text mentions dispatched shortly', () => {
    expect(result.text).toContain('dispatched shortly');
  });
});

// ---------------------------------------------------------------------------
// generateDowngradeScheduledEmail
// ---------------------------------------------------------------------------

const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days from now

const baseDowngradeScheduledData: DowngradeScheduledEmailData = {
  firstName: 'Dave',
  email: 'dave@business.com',
  businessName: 'Dave\'s Shop',
  currentPlan: 'premium',
  effectiveDate: futureDate,
};

describe('generateDowngradeScheduledEmail — premium plan, future date', () => {
  const result = generateDowngradeScheduledEmail(baseDowngradeScheduledData);

  it('returns a subject about downgrade', () => {
    expect(result.subject).toContain('downgrade');
  });

  it('HTML contains "Downgrade Scheduled" heading', () => {
    expect(result.html).toContain('Downgrade Scheduled');
  });

  it('HTML greets the user by first name', () => {
    expect(result.html).toContain('Dave');
  });

  it('HTML mentions Premium plan', () => {
    expect(result.html).toContain('Premium');
  });

  it('HTML shows Free plan limits table', () => {
    expect(result.html).toContain('2 maximum');
  });

  it('HTML includes upgrade button', () => {
    expect(result.html).toContain('View Plan Options');
  });

  it('plain text contains downgrade date reference', () => {
    expect(result.text).toContain('Downgrade Scheduled');
  });
});

describe('generateDowngradeScheduledEmail — standard plan with impact items', () => {
  const dataWithImpact: DowngradeScheduledEmailData = {
    firstName: 'Eve',
    email: 'eve@biz.com',
    businessName: 'Eve\'s Store',
    currentPlan: 'standard',
    effectiveDate: futureDate,
    productsToLock: 12,
    totalProducts: 30,
    teamMembersToSuspend: 2,
    groupsToArchive: 3,
  };
  const result = generateDowngradeScheduledEmail(dataWithImpact);

  it('HTML mentions locked products count', () => {
    expect(result.html).toContain('12');
  });

  it('HTML mentions team members losing access', () => {
    expect(result.html).toContain('team member');
  });

  it('HTML mentions groups being archived', () => {
    expect(result.html).toContain('archived');
  });

  it('plain text includes impact bullet points', () => {
    expect(result.text).toContain('will be locked');
    expect(result.text).toContain('will lose access');
    expect(result.text).toContain('will be archived');
  });
});

describe('generateDowngradeScheduledEmail — immediate downgrade', () => {
  const immediateDate = new Date(Date.now() + 30_000); // 30 seconds from now — within the 1-minute threshold
  const result = generateDowngradeScheduledEmail({
    ...baseDowngradeScheduledData,
    effectiveDate: immediateDate,
  });

  it('HTML says "Today" rather than a future date label', () => {
    expect(result.html).toContain('Today');
  });

  it('HTML says plan is being downgraded immediately', () => {
    expect(result.html).toContain('now');
  });
});

// ---------------------------------------------------------------------------
// generateDowngradeEffectiveEmail
// ---------------------------------------------------------------------------

const baseDowngradeEffectiveData: DowngradeEffectiveEmailData = {
  firstName: 'Frank',
  email: 'frank@biz.com',
  businessName: 'Frank\'s Bakery',
};

describe('generateDowngradeEffectiveEmail — no items affected', () => {
  const result = generateDowngradeEffectiveEmail(baseDowngradeEffectiveData);

  it('returns the correct subject', () => {
    expect(result.subject).toContain('Free');
  });

  it('HTML contains "Your plan is now Free" heading', () => {
    expect(result.html).toContain('Your plan is now Free');
  });

  it('HTML greets the user by first name', () => {
    expect(result.html).toContain('Frank');
  });

  it('HTML shows Free plan limits table', () => {
    expect(result.html).toContain('2 maximum');
  });

  it('HTML includes "Upgrade My Plan" button', () => {
    expect(result.html).toContain('Upgrade My Plan');
  });

  it('plain text contains upgrade URL', () => {
    expect(result.text).toContain('https://quikpik.app/subscription-pricing');
  });
});

describe('generateDowngradeEffectiveEmail — with affected items', () => {
  const dataWithEffects: DowngradeEffectiveEmailData = {
    firstName: 'Grace',
    email: 'grace@biz.com',
    businessName: 'Grace\'s Deli',
    productsLocked: 5,
    teamMembersSuspended: 2,
    groupsArchived: 1,
  };
  const result = generateDowngradeEffectiveEmail(dataWithEffects);

  it('HTML mentions products locked', () => {
    expect(result.html).toContain('5 products locked');
  });

  it('HTML mentions team members suspended', () => {
    expect(result.html).toContain('suspended');
  });

  it('HTML mentions groups archived', () => {
    expect(result.html).toContain('archived');
  });

  it('plain text lists locked products', () => {
    expect(result.text).toContain('5 product(s) locked');
  });

  it('plain text lists suspended members', () => {
    expect(result.text).toContain('team member(s) suspended');
  });

  it('plain text lists archived groups', () => {
    expect(result.text).toContain('group(s) archived');
  });
});
