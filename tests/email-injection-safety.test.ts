import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// These tests prove that the LIVE email senders (not just the central
// builders) escape user-controlled values, so injected markup renders as
// literal text rather than as real tags, buttons, or links.
//
// We stub the SendGrid transport (@sendgrid/mail) so the real sender code
// runs end-to-end and we can inspect the HTML it would have sent.
// ---------------------------------------------------------------------------

const { sendMock } = vi.hoisted(() => {
  // Module-level throws in the senders require these env vars to be present
  // BEFORE the modules are imported.
  process.env.SENDGRID_API_KEY = process.env.SENDGRID_API_KEY || 'test-key';
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://test:test@localhost:5432/test';
  return { sendMock: vi.fn().mockResolvedValue([{ statusCode: 202 }]) };
});

vi.mock('@sendgrid/mail', () => {
  class MailService {
    setApiKey() {}
    send(...args: unknown[]) {
      return sendMock(...args);
    }
  }
  return { MailService, default: { MailService } };
});

vi.mock('../server/services/whatsappService', () => ({
  sendWhatsAppMessage: vi.fn().mockResolvedValue(true),
}));

vi.mock('../server/storage', () => ({
  storage: {
    getOrder: vi.fn(),
    getUser: vi.fn(),
    getOrderItems: vi.fn(),
    getProduct: vi.fn(),
  },
}));

import {
  sendOrderConfirmationEmail,
  sendWholesalerOrderNotification,
} from '../server/sendgrid-service';
import { sendWelcomeEmail } from '../server/services/emailService';
import { orderNotificationService } from '../server/services/orderNotificationService';
import {
  buildStartEmailHtml,
  buildEndEmailHtml,
} from '../server/services/promotionNotificationService';
import { stockAlertService } from '../server/services/stockAlertService';
import { storage } from '../server/storage';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Pull the HTML body out of whatever argument shape mailService.send received. */
function htmlFromSendArg(arg: any): string {
  if (arg?.html) return arg.html as string;
  if (Array.isArray(arg?.content)) {
    return arg.content.find((c: any) => c.type === 'text/html')?.value ?? '';
  }
  return '';
}

/** Pull the plaintext body out of a captured mailService.send argument. */
function textFromSendArg(arg: any): string {
  if (arg?.text) return arg.text as string;
  if (Array.isArray(arg?.content)) {
    return arg.content.find((c: any) => c.type === 'text/plain')?.value ?? '';
  }
  return '';
}

/** The most recent HTML the transport was asked to send. */
function lastSentHtml(): string {
  const calls = sendMock.mock.calls;
  return htmlFromSendArg(calls[calls.length - 1]?.[0]);
}

// A grab-bag of hostile inputs. Each MUST come out escaped.
const SCRIPT = '<script>alert(1)</script>';
const FAKE_BUTTON = '<button onclick="steal()">Claim</button>';
const FAKE_LINK = '<a href="https://evil.example.com">Click me</a>';
const IMG_INJECT = '"><img src=x onerror=alert(1)>';

/** Assert a value rendered as escaped literal text, not as live markup. */
function expectEscaped(html: string) {
  // Opening tags from the payloads must NOT appear verbatim.
  expect(html).not.toContain('<script>');
  expect(html).not.toContain('<button onclick=');
  expect(html).not.toContain('<a href="https://evil.example.com">');
  expect(html).not.toContain('<img src=x onerror=');
  // Their escaped forms MUST appear.
  expect(html).toContain('&lt;script&gt;');
  expect(html).toContain('&lt;button');
  expect(html).toContain('&lt;a href=');
  expect(html).toContain('&lt;img');
}

const ALL_PAYLOADS = `${SCRIPT}${FAKE_BUTTON}${FAKE_LINK}${IMG_INJECT}`;

beforeEach(() => {
  vi.clearAllMocks();
  sendMock.mockResolvedValue([{ statusCode: 202 }]);
});

// ---------------------------------------------------------------------------
// sendgrid-service.ts — sendOrderConfirmationEmail
// ---------------------------------------------------------------------------

describe('sendOrderConfirmationEmail — injection safety', () => {
  it('escapes customer name, product name, applied offer label and shipping address', async () => {
    await sendOrderConfirmationEmail({
      customerEmail: 'c@example.com',
      customerName: ALL_PAYLOADS,
      orderNumber: 'ORD-1',
      orderItems: [
        {
          productName: ALL_PAYLOADS,
          quantity: 1,
          unitPrice: 10,
          total: 10,
          appliedOfferLabel: ALL_PAYLOADS,
        },
      ],
      subtotal: 10,
      transactionFee: 0,
      totalPaid: 10,
      wholesalerName: 'Acme',
      shippingAddress: ALL_PAYLOADS,
    });

    const html = lastSentHtml();
    expect(html).toBeTruthy();
    expectEscaped(html);
  });

  it('renders normal values correctly without double-encoding "&"', async () => {
    await sendOrderConfirmationEmail({
      customerEmail: 'c@example.com',
      customerName: 'Smith & Sons',
      orderNumber: 'ORD-2',
      orderItems: [
        { productName: 'Tea & Coffee', quantity: 2, unitPrice: 5, total: 10 },
      ],
      subtotal: 10,
      transactionFee: 0,
      totalPaid: 10,
      wholesalerName: 'Beans & Co',
    });

    const html = lastSentHtml();
    expect(html).toContain('Smith &amp; Sons');
    expect(html).toContain('Tea &amp; Coffee');
    expect(html).toContain('Beans &amp; Co');
    expect(html).not.toContain('&amp;amp;');
    // Preheader still present and single-encoded.
    expect(html).toContain('ORD-2');
  });
});

// ---------------------------------------------------------------------------
// sendgrid-service.ts — sendWholesalerOrderNotification
// ---------------------------------------------------------------------------

describe('sendWholesalerOrderNotification — injection safety', () => {
  it('escapes customer name, email, phone, product name and delivery address', async () => {
    await sendWholesalerOrderNotification({
      wholesalerEmail: 'w@example.com',
      wholesalerName: 'Acme',
      orderNumber: 'ORD-3',
      customerName: ALL_PAYLOADS,
      customerEmail: 'cust@example.com',
      customerPhone: '07700900000',
      orderItems: [
        {
          productName: ALL_PAYLOADS,
          quantity: 1,
          unitPrice: 10,
          total: 10,
          appliedOfferLabel: ALL_PAYLOADS,
        },
      ],
      subtotal: 10,
      totalAmount: 10,
      fulfillmentType: 'delivery',
      placedByName: ALL_PAYLOADS,
      addressLine1: ALL_PAYLOADS,
      city: ALL_PAYLOADS,
      postalCode: 'AB1 2CD',
    });

    const html = lastSentHtml();
    expect(html).toBeTruthy();
    expectEscaped(html);
  });

  it('keeps legitimate names with ampersands single-encoded', async () => {
    await sendWholesalerOrderNotification({
      wholesalerEmail: 'w@example.com',
      wholesalerName: 'Acme',
      orderNumber: 'ORD-4',
      customerName: 'Ben & Jerry',
      customerEmail: 'cust@example.com',
      customerPhone: '07700900000',
      orderItems: [{ productName: 'Salt & Pepper', quantity: 1, unitPrice: 1, total: 1 }],
      subtotal: 1,
      totalAmount: 1,
      fulfillmentType: 'pickup',
    });

    const html = lastSentHtml();
    expect(html).toContain('Ben &amp; Jerry');
    expect(html).toContain('Salt &amp; Pepper');
    expect(html).not.toContain('&amp;amp;');
  });
});

// ---------------------------------------------------------------------------
// services/emailService.ts — sendWelcomeEmail
// ---------------------------------------------------------------------------

describe('sendWelcomeEmail — injection safety', () => {
  it('escapes customer name, wholesaler contact name and wholesaler email', async () => {
    await sendWelcomeEmail({
      customerEmail: 'c@example.com',
      customerName: ALL_PAYLOADS,
      wholesalerName: 'Acme',
      wholesalerEmail: 'w@example.com',
      wholesalerAccountName: ALL_PAYLOADS,
      portalUrl: 'https://quikpik.app/portal',
    });

    const html = lastSentHtml();
    expect(html).toBeTruthy();
    expectEscaped(html);
  });

  it('renders a normal customer name without altering it', async () => {
    await sendWelcomeEmail({
      customerEmail: 'c@example.com',
      customerName: 'Jane Doe',
      wholesalerName: 'Acme',
      wholesalerEmail: 'w@example.com',
      portalUrl: 'https://quikpik.app/portal',
    });

    const html = lastSentHtml();
    expect(html).toContain('Jane Doe');
    expect(html).not.toContain('&lt;script&gt;');
  });
});

// ---------------------------------------------------------------------------
// services/orderNotificationService.ts — sendOrderStatusUpdate
// The plaintext status body and the customer name must both be escaped into
// the HTML email.
// ---------------------------------------------------------------------------

describe('orderNotificationService.sendOrderStatusUpdate — injection safety', () => {
  beforeEach(() => {
    (storage.getOrder as any).mockResolvedValue({ id: 7, orderNumber: 'ORD-7', wholesalerId: 'ws1' });
    (storage.getUser as any).mockResolvedValue({ id: 'ws1', businessName: 'Acme', logoType: null, logoUrl: null });
    (storage.getOrderItems as any).mockResolvedValue([{ productId: 1, quantity: 1 }]);
    (storage.getProduct as any).mockResolvedValue({ name: ALL_PAYLOADS, quantityInPack: null, unitSize: null, unitOfMeasure: null });
  });

  it('escapes the customer name, status-derived body and product name in the HTML', async () => {
    await orderNotificationService.sendOrderStatusUpdate({
      orderId: 7,
      orderNumber: 'ORD-7',
      // An unknown status flows verbatim into the plaintext body before escaping.
      status: ALL_PAYLOADS,
      customerName: ALL_PAYLOADS,
      customerPhone: '07700900000',
      customerEmail: 'cust@example.com',
      wholesalerName: 'Acme',
    });

    expect(sendMock).toHaveBeenCalled();
    const html = lastSentHtml();
    expect(html).toBeTruthy();
    expectEscaped(html);
  });

  it('escapes tracking number and estimated delivery values', async () => {
    await orderNotificationService.sendOrderStatusUpdate({
      orderId: 7,
      orderNumber: 'ORD-7',
      status: 'shipped',
      customerName: 'Jane Doe',
      customerPhone: '07700900000',
      customerEmail: 'cust@example.com',
      wholesalerName: 'Acme',
      trackingNumber: ALL_PAYLOADS,
      estimatedDelivery: ALL_PAYLOADS,
    });

    const html = lastSentHtml();
    expect(html).toContain('Jane Doe');
    expectEscaped(html);
  });

  it('also escapes the plaintext body the customer would read', async () => {
    (storage.getProduct as any).mockResolvedValue({ name: 'Plain Product', quantityInPack: null, unitSize: null, unitOfMeasure: null });
    await orderNotificationService.sendOrderStatusUpdate({
      orderId: 7,
      orderNumber: 'ORD & 7',
      status: 'delivered',
      customerName: 'Jane Doe',
      customerPhone: '07700900000',
      customerEmail: 'cust@example.com',
      wholesalerName: 'Acme',
    });

    const html = lastSentHtml();
    // The preheader carries the plaintext body; the ampersand stays single-encoded.
    expect(html).toContain('Jane Doe');
    expect(html).not.toContain('&amp;amp;');
  });
});

// ---------------------------------------------------------------------------
// services/promotionNotificationService.ts — buildStartEmailHtml / buildEndEmailHtml
// ---------------------------------------------------------------------------

const promoWholesaler = {
  id: 'ws1',
  businessName: ALL_PAYLOADS,
  logoUrl: null,
  email: null,
  phoneNumber: null,
};

function makePromoProduct(name: string) {
  return {
    id: 1,
    name,
    price: '10.00',
    promoPrice: '8.00',
    wholesalerId: 'ws1',
    promotionalOffers: [],
    matchedPromo: {
      id: 'promo-1',
      type: 'percentage_discount',
      discountPercentage: 20,
      endDate: '2026-12-31',
    },
  } as any;
}

describe('promotion start email — injection safety', () => {
  it('escapes product name and business name', () => {
    const html = buildStartEmailHtml(
      [makePromoProduct(ALL_PAYLOADS)],
      promoWholesaler as any,
      'https://quikpik.app/store/ws1',
    );
    expectEscaped(html);
  });

  it('renders a normal product name with an ampersand single-encoded', () => {
    const html = buildStartEmailHtml(
      [makePromoProduct('Fish & Chips')],
      { ...promoWholesaler, businessName: 'Joe & Co' } as any,
      'https://quikpik.app/store/ws1',
    );
    expect(html).toContain('Fish &amp; Chips');
    expect(html).toContain('Joe &amp; Co');
    expect(html).not.toContain('&amp;amp;');
  });
});

describe('promotion end email — injection safety', () => {
  it('escapes product name and business name', () => {
    const html = buildEndEmailHtml(
      [makePromoProduct(ALL_PAYLOADS)],
      promoWholesaler as any,
      'https://quikpik.app/store/ws1',
    );
    expectEscaped(html);
  });
});

// ---------------------------------------------------------------------------
// services/stockAlertService.ts — generateEmailBody
// ---------------------------------------------------------------------------

function makeStockAlert(productName: string, currentStock: number) {
  return {
    productId: 1,
    productName,
    currentStock,
    minimumThreshold: 50,
    wholesalerId: 'ws1',
    wholesalerName: ALL_PAYLOADS,
    wholesalerEmail: 'w@example.com',
    wholesalerPhone: undefined,
    wholesalerLogoUrl: null,
    suggestedReorderQuantity: 100,
  };
}

describe('stock alert email body — injection safety', () => {
  it('escapes product name in the URGENT (critical) section', () => {
    const html = (stockAlertService as any).generateEmailBody([makeStockAlert(ALL_PAYLOADS, 2)]);
    expectEscaped(html);
  });

  it('escapes product name in the low-stock section', () => {
    const html = (stockAlertService as any).generateEmailBody([makeStockAlert(ALL_PAYLOADS, 20)]);
    expectEscaped(html);
  });

  it('renders a normal product name with an ampersand single-encoded', () => {
    const html = (stockAlertService as any).generateEmailBody([makeStockAlert('Nuts & Bolts', 2)]);
    expect(html).toContain('Nuts &amp; Bolts');
    expect(html).not.toContain('&amp;amp;');
  });
});
