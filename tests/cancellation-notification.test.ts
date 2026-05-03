import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../server/sendgrid-service', () => ({
  sendEmail: vi.fn().mockResolvedValue(true),
}));

vi.mock('../server/services/whatsappService', () => ({
  sendWhatsAppMessage: vi.fn().mockResolvedValue(true),
}));

vi.mock('../server/storage', () => ({
  storage: {
    getProduct: vi.fn().mockResolvedValue({
      id: 1,
      name: 'Test Product',
      packQuantity: null,
      quantityInPack: null,
      sizePerUnit: null,
      unitSize: null,
      unitOfMeasure: null,
    }),
  },
}));

import { sendEmail } from '../server/sendgrid-service';
import { sendCancellationNotification } from '../server/services/orderCancellationNotificationService';

const mockOrder = {
  id: 42,
  orderNumber: 'ORD-0042',
  retailerId: 'customer-1',
  wholesalerId: 'wholesaler-1',
  deliveryCost: '5.00',
  amountPaid: '50.00',
};

const mockOrderItems = [
  { productId: 1, quantity: 2, unitPrice: '20.00', sellingType: 'units' },
  { productId: 2, quantity: 1, unitPrice: '10.00', sellingType: 'units' },
];

const mockCustomer = {
  firstName: 'Alice',
  businessName: null,
  phoneNumber: null,
  email: 'alice@example.com',
};

const mockWholesaler = {
  id: 'wholesaler-1',
  firstName: 'Bob',
  businessName: 'Bobs Wholesale',
  phoneNumber: '07700900001',
  email: 'bob@example.com',
  logoType: null,
  logoUrl: null,
};

describe('sendCancellationNotification — full cancellation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls sendEmail with a subject containing "Cancelled"', async () => {
    await sendCancellationNotification({
      order: mockOrder,
      orderItems: mockOrderItems,
      customer: mockCustomer,
      wholesaler: mockWholesaler,
      isFullCancellation: true,
      returnedItems: null,
      refundDelivery: false,
      stripeRefundTotalPounds: 50,
      refundAmount: 50,
    });

    expect(sendEmail).toHaveBeenCalledOnce();
    const call = (sendEmail as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.subject).toContain('Cancelled');
    expect(call.to).toBe('alice@example.com');
  });

  it('does not call sendEmail when customer has no email', async () => {
    await sendCancellationNotification({
      order: mockOrder,
      orderItems: mockOrderItems,
      customer: { ...mockCustomer, email: null },
      wholesaler: mockWholesaler,
      isFullCancellation: true,
      returnedItems: null,
      refundDelivery: false,
      stripeRefundTotalPounds: 0,
      refundAmount: 0,
    });

    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe('sendCancellationNotification — partial return', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls sendEmail with a subject containing "Partial Return"', async () => {
    await sendCancellationNotification({
      order: mockOrder,
      orderItems: mockOrderItems,
      customer: mockCustomer,
      wholesaler: mockWholesaler,
      isFullCancellation: false,
      returnedItems: [{ productId: 1, quantity: 1, sellingType: 'units' }],
      refundDelivery: false,
      stripeRefundTotalPounds: 20,
      refundAmount: 20,
    });

    expect(sendEmail).toHaveBeenCalledOnce();
    const call = (sendEmail as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(call.subject).toContain('Partial Return');
    expect(call.to).toBe('alice@example.com');
  });

  it('does nothing when wholesaler is null', async () => {
    await sendCancellationNotification({
      order: mockOrder,
      orderItems: mockOrderItems,
      customer: mockCustomer,
      wholesaler: null,
      isFullCancellation: false,
      returnedItems: [{ productId: 1, quantity: 1 }],
      refundDelivery: false,
      stripeRefundTotalPounds: 0,
      refundAmount: 20,
    });

    expect(sendEmail).not.toHaveBeenCalled();
  });
});
