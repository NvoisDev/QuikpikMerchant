/**
 * Regression tests — customer-facing error toasts
 *
 * Covers the four error paths that must surface a destructive toast instead of
 * silently failing or alerting the user:
 *   1. Invoice download (RecentOrdersSection)
 *   2. Invoice download (CustomerOrderHistory)
 *   3. Payment link generation (PayBalanceButton)
 *   4. Delivery address update (DynamicDeliveryAddressDisplay)
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PayBalanceButton } from '../components/customer/CustomerOrderHistory';
import { RecentOrdersSection } from '../components/customer/RecentOrdersSection';
import { DynamicDeliveryAddressDisplay } from '../components/shared/DynamicDeliveryAddressDisplay';

// ─── Mock useToast ────────────────────────────────────────────────────────────
const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

// ─── Mock wouter (routing not needed in these tests) ─────────────────────────
vi.mock('wouter', () => ({
  useLocation: () => ['/customer', vi.fn()],
  Link: (props: { children: unknown }) => props.children,
  useRoute: () => [false, {}],
}));

// ─── Stub browser APIs not available in happy-dom ────────────────────────────
Object.defineProperty(global.URL, 'createObjectURL', {
  value: vi.fn(() => 'blob:mock'),
  writable: true,
});
Object.defineProperty(global.URL, 'revokeObjectURL', {
  value: vi.fn(),
  writable: true,
});

// ─── Minimal Order fixture ────────────────────────────────────────────────────
const MOCK_ORDER = {
  id: 42,
  orderNumber: 'ORD-TEST-001',
  date: '2024-01-01',
  status: 'pending',
  total: '100.00',
  platformFee: '0.00',
  subtotal: '100.00',
  items: [],
  wholesalerId: 'ws-1',
  wholesaler: {
    businessName: 'Acme Wholesale',
    firstName: 'Jane',
    lastName: 'Smith',
  },
  fulfillmentType: 'pickup',
  deliveryCarrier: '',
  shippingTotal: '0.00',
  shippingStatus: 'pending',
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  paymentStatus: 'unpaid',
};

// ─── Test wrapper ─────────────────────────────────────────────────────────────
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function Wrapper(props: { children: React.ReactNode }) {
  return React.createElement(
    QueryClientProvider,
    { client: makeQueryClient() },
    props.children,
  );
}

// ─── URL-aware fetch stub ─────────────────────────────────────────────────────
// Orders-list URLs resolve successfully; everything else (invoice, payment
// link) returns a server-error response.
function makeFetchStub(orderList: object[] = [MOCK_ORDER]) {
  return vi.fn((url: string) => {
    if (
      typeof url === 'string' &&
      url.includes('/api/customer-orders/') &&
      !url.includes('/invoice')
    ) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(orderList),
        blob: () => Promise.resolve(new Blob()),
      });
    }
    return Promise.resolve({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Server Error'),
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. PayBalanceButton — payment link failure
// ─────────────────────────────────────────────────────────────────────────────
describe('PayBalanceButton — payment link failure', () => {
  beforeEach(() => {
    mockToast.mockClear();
  });

  it('shows a destructive toast when the payment-link fetch returns a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500 }),
    );

    render(
      React.createElement(
        Wrapper,
        null,
        React.createElement(PayBalanceButton, {
          order: MOCK_ORDER as any,
          customerPhone: '+447000000001',
        }),
      ),
    );

    const payBtn = screen.getByRole('button', { name: /pay now/i });
    fireEvent.click(payBtn);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive' }),
      );
    });
  });

  it('shows a destructive toast when the payment-link fetch throws (network error)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('Network failure')),
    );

    render(
      React.createElement(
        Wrapper,
        null,
        React.createElement(PayBalanceButton, {
          order: MOCK_ORDER as any,
          customerPhone: '+447000000001',
        }),
      ),
    );

    const payBtn = screen.getByRole('button', { name: /pay now/i });
    fireEvent.click(payBtn);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive' }),
      );
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. RecentOrdersSection — invoice download failure
// ─────────────────────────────────────────────────────────────────────────────
describe('RecentOrdersSection — invoice download failure', () => {
  beforeEach(() => {
    mockToast.mockClear();
    vi.stubGlobal('fetch', makeFetchStub());
  });

  it('shows a destructive toast when the invoice download request returns a non-ok response', async () => {
    // Use userEvent (real timers) so Radix UI's pointer-event sequences fire
    // correctly. The 50 ms deferral in OrderActionsDropdown.handleAction is
    // short enough that waitFor() catches it naturally.
    const user = userEvent.setup();

    render(
      React.createElement(
        Wrapper,
        null,
        React.createElement(RecentOrdersSection, {
          wholesalerId: 'ws-1',
          customerPhone: '+447000000001',
          onViewAllOrders: () => undefined,
          defaultCurrency: 'GBP',
        }),
      ),
    );

    // Wait for orders to load (the fetch mock returns MOCK_ORDER)
    await waitFor(() =>
      expect(screen.getByText('ORD-TEST-001')).toBeInTheDocument(),
    );

    // Open the Actions dropdown — userEvent properly fires the pointer events
    // Radix UI needs to toggle open/closed state
    const actionsBtn = screen.getByRole('button', { name: /actions/i });
    await user.click(actionsBtn);

    // Click the Invoice item in the now-open dropdown
    const invoiceItem = await screen.findByText(/^invoice$/i);
    await user.click(invoiceItem);

    // handleAction defers via setTimeout(fn, 50ms) then downloadInvoice calls
    // fetch (which fails) → toast is shown
    await waitFor(
      () => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({ variant: 'destructive' }),
        );
      },
      { timeout: 3000 },
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. CustomerOrderHistory — invoice download failure
// ─────────────────────────────────────────────────────────────────────────────
describe('CustomerOrderHistory — invoice download failure', () => {
  beforeEach(() => {
    mockToast.mockClear();
    vi.stubGlobal('fetch', makeFetchStub());
  });

  it('shows a destructive toast when the invoice download request returns a non-ok response', async () => {
    const user = userEvent.setup();

    const { CustomerOrderHistory } = await import(
      '../components/customer/CustomerOrderHistory'
    );

    render(
      React.createElement(
        Wrapper,
        null,
        React.createElement(CustomerOrderHistory, {
          wholesalerId: 'ws-1',
          customerPhone: '+447000000001',
          currency: 'GBP',
        }),
      ),
    );

    // Wait for orders to render
    await waitFor(() =>
      expect(screen.getByText('ORD-TEST-001')).toBeInTheDocument(),
    );

    // Open the Actions dropdown for the first order row
    const [actionsBtn] = screen.getAllByRole('button', { name: /actions/i });
    await user.click(actionsBtn);

    // Click the Invoice item
    const invoiceItem = await screen.findByText(/^invoice$/i);
    await user.click(invoiceItem);

    // Wait for the 50ms-deferred downloadInvoice to run and fail → toast
    await waitFor(
      () => {
        expect(mockToast).toHaveBeenCalledWith(
          expect.objectContaining({ variant: 'destructive' }),
        );
      },
      { timeout: 3000 },
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. DynamicDeliveryAddressDisplay — address update failure
// ─────────────────────────────────────────────────────────────────────────────
describe('DynamicDeliveryAddressDisplay — address update failure', () => {
  const ADDRESSES = [
    {
      id: 1,
      addressLine1: '1 Current Street',
      city: 'London',
      postalCode: 'EC1A 1BB',
      country: 'UK',
      label: 'Home',
    },
    {
      id: 2,
      addressLine1: '2 New Road',
      city: 'Manchester',
      postalCode: 'M1 2AB',
      country: 'UK',
      label: 'Office',
    },
  ];

  beforeEach(() => {
    mockToast.mockClear();

    // GET delivery-addresses → success with two addresses
    // PUT change-delivery-address → server error (triggers the catch → toast)
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, options?: RequestInit) => {
        const method = options?.method?.toUpperCase() ?? 'GET';
        if (url.includes('/api/customer/delivery-addresses') && method === 'GET') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve(ADDRESSES),
          });
        }
        // PUT /api/orders/:id/change-delivery-address
        return Promise.resolve({
          ok: false,
          status: 500,
          text: () => Promise.resolve('Server Error'),
        });
      }),
    );
  });

  it('shows a destructive toast when the address update API call fails', async () => {
    render(
      React.createElement(
        Wrapper,
        null,
        React.createElement(DynamicDeliveryAddressDisplay, {
          orderId: 42,
          orderStatus: 'pending', // 'pending' → isAddressChangeable is true
          wholesalerId: 'ws-1',
          addressId: 1,
          staticAddress: JSON.stringify({
            addressLine1: '1 Current Street',
            city: 'London',
            postalCode: 'EC1A 1BB',
            country: 'UK',
            label: 'Home',
          }),
          onAddressChanged: () => undefined,
        }),
      ),
    );

    // Wait for the "Change Address" button (only shown when order is changeable)
    const changeBtn = await screen.findByRole('button', {
      name: /change address/i,
    });
    fireEvent.click(changeBtn);

    // Wait for the second address to appear in the modal
    await screen.findByText(/2 New Road/i);

    // Select the second address (different from current id=1)
    const radios = screen.getAllByRole('radio');
    fireEvent.click(radios[1]);

    // Click "Update Address" to trigger the PUT that will fail
    const updateBtn = screen.getByRole('button', { name: /update address/i });
    fireEvent.click(updateBtn);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive' }),
      );
    });
  });
});
