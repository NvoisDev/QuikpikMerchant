import { describe, it, expect } from 'vitest';
import {
  cancellationRefundTypeToEmailStatus,
  type CancellationRefundType,
} from '../shared/schema';
import { buildItemisedRefundEmail } from '../server/email-templates';

// ---------------------------------------------------------------------------
// cancellationRefundTypeToEmailStatus
// ---------------------------------------------------------------------------

describe('cancellationRefundTypeToEmailStatus', () => {
  it('maps "card" → "processed"', () => {
    expect(cancellationRefundTypeToEmailStatus('card')).toBe('processed');
  });

  it('maps "later" → "pending"', () => {
    expect(cancellationRefundTypeToEmailStatus('later')).toBe('pending');
  });

  it('maps "none" → "none"', () => {
    expect(cancellationRefundTypeToEmailStatus('none')).toBe('none');
  });

  it('maps null → "none"', () => {
    expect(cancellationRefundTypeToEmailStatus(null)).toBe('none');
  });

  it('maps undefined → "none"', () => {
    expect(cancellationRefundTypeToEmailStatus(undefined)).toBe('none');
  });
});

// ---------------------------------------------------------------------------
// buildItemisedRefundEmail — correct section rendered per refundStatus
// ---------------------------------------------------------------------------

const baseOptions = {
  customerName: 'Alice',
  orderNumber: 'ORD-001',
  isFullCancellation: true,
  returnedItems: [
    { productName: 'Widget A', quantity: 2, unitPrice: 10 },
  ],
  refundAmount: 20,
  businessName: 'Acme Ltd',
};

describe('buildItemisedRefundEmail — refundStatus: "processed"', () => {
  const html = buildItemisedRefundEmail({ ...baseOptions, refundStatus: 'processed' });

  it('includes "Processing Information" heading', () => {
    expect(html).toContain('Processing Information');
  });

  it('mentions the refund appearing on the original payment method', () => {
    expect(html).toContain('appear on your original payment method');
  });

  it('does NOT include "Refund Pending" heading', () => {
    expect(html).not.toContain('Refund Pending');
  });

  it('does NOT include the no-payment message', () => {
    expect(html).not.toContain('No payment was taken');
  });
});

describe('buildItemisedRefundEmail — refundStatus: "pending"', () => {
  const html = buildItemisedRefundEmail({ ...baseOptions, refundStatus: 'pending' });

  it('includes "Refund Pending" heading', () => {
    expect(html).toContain('Refund Pending');
  });

  it('mentions refund being arranged', () => {
    expect(html).toContain('being arranged');
  });

  it('does NOT include "Processing Information" heading', () => {
    expect(html).not.toContain('Processing Information');
  });

  it('does NOT include the no-payment message', () => {
    expect(html).not.toContain('No payment was taken');
  });
});

describe('buildItemisedRefundEmail — refundStatus: "none"', () => {
  const html = buildItemisedRefundEmail({ ...baseOptions, refundStatus: 'none' });

  it('includes the no-payment message', () => {
    expect(html).toContain('No payment was taken');
  });

  it('does NOT include "Processing Information" heading', () => {
    expect(html).not.toContain('Processing Information');
  });

  it('does NOT include "Refund Pending" heading', () => {
    expect(html).not.toContain('Refund Pending');
  });
});

describe('buildItemisedRefundEmail — refundStatus derived via cancellationRefundTypeToEmailStatus', () => {
  it('card refund type produces processed email section', () => {
    const status = cancellationRefundTypeToEmailStatus('card');
    const html = buildItemisedRefundEmail({ ...baseOptions, refundStatus: status });
    expect(html).toContain('Processing Information');
    expect(html).toContain('appear on your original payment method');
  });

  it('later refund type produces pending email section', () => {
    const status = cancellationRefundTypeToEmailStatus('later');
    const html = buildItemisedRefundEmail({ ...baseOptions, refundStatus: status });
    expect(html).toContain('Refund Pending');
    expect(html).toContain('being arranged');
  });

  it('none refund type produces no-refund email section', () => {
    const status = cancellationRefundTypeToEmailStatus('none');
    const html = buildItemisedRefundEmail({ ...baseOptions, refundStatus: status });
    expect(html).toContain('No payment was taken');
  });

  it('null refund type produces no-refund email section', () => {
    const status = cancellationRefundTypeToEmailStatus(null);
    const html = buildItemisedRefundEmail({ ...baseOptions, refundStatus: status });
    expect(html).toContain('No payment was taken');
  });

  it('undefined refund type produces no-refund email section', () => {
    const status = cancellationRefundTypeToEmailStatus(undefined);
    const html = buildItemisedRefundEmail({ ...baseOptions, refundStatus: status });
    expect(html).toContain('No payment was taken');
  });
});
