/**
 * Regression tests — wholesaler-side payment link button (WholesalerPaymentLinkButton)
 *
 * Verifies that:
 *   1. A destructive toast is shown when the API returns a non-ok response
 *   2. A destructive toast is shown when the fetch throws (network error)
 *   3. Only one request is sent even when the button is clicked multiple times rapidly
 *      (the useRef in-flight guard must prevent duplicate Stripe session creation)
 *   4. Cross-button mutual exclusion — when two instances share a lockRef, clicking one
 *      blocks the other for the duration of the in-flight request
 */

import React, { useRef, useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WholesalerPaymentLinkButton } from '../pages/order-detail';

// ─── Mock useToast ────────────────────────────────────────────────────────────
const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

// ─── Mock wouter (not needed in these tests) ──────────────────────────────────
vi.mock('wouter', () => ({
  useLocation: () => ['/orders/1', vi.fn()],
  useParams: () => ({ id: '1' }),
  Link: (props: { children: unknown }) => props.children,
  useRoute: () => [false, {}],
}));

// ─── Mock useAuth ─────────────────────────────────────────────────────────────
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({ user: null }),
}));

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

/**
 * Renders two WholesalerPaymentLinkButton instances that share the same
 * lockRef and isLocked/onLockChange state — mirrors exactly how they appear
 * together in order-detail.tsx (payment panel + sticky action bar).
 */
function TwoButtonHarness({ onSuccess }: { onSuccess: ReturnType<typeof vi.fn> }) {
  const lockRef = useRef(false);
  const [isLocked, setIsLocked] = useState(false);

  return React.createElement(
    Wrapper,
    null,
    React.createElement(
      'div',
      null,
      React.createElement(WholesalerPaymentLinkButton, {
        orderId: 42,
        onSuccess,
        lockRef,
        isLocked,
        onLockChange: setIsLocked,
        label: 'Panel Button',
      }),
      React.createElement(WholesalerPaymentLinkButton, {
        orderId: 42,
        onSuccess,
        lockRef,
        isLocked,
        onLockChange: setIsLocked,
        label: 'Sticky Button',
      }),
    ),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WholesalerPaymentLinkButton — API error handling (single instance)
// ─────────────────────────────────────────────────────────────────────────────
describe('WholesalerPaymentLinkButton — API error handling', () => {
  beforeEach(() => {
    mockToast.mockClear();
  });

  it('shows a destructive toast when the API returns success:false', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: false, error: 'Stripe not configured' }),
      }),
    );

    const onSuccess = vi.fn();

    render(
      React.createElement(
        Wrapper,
        null,
        React.createElement(WholesalerPaymentLinkButton, {
          orderId: 42,
          onSuccess,
        }),
      ),
    );

    const btn = screen.getByRole('button', { name: /generate payment link/i });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive' }),
      );
    });

    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('shows a destructive toast when the fetch throws (network error)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('Network failure')),
    );

    const onSuccess = vi.fn();

    render(
      React.createElement(
        Wrapper,
        null,
        React.createElement(WholesalerPaymentLinkButton, {
          orderId: 42,
          onSuccess,
        }),
      ),
    );

    const btn = screen.getByRole('button', { name: /generate payment link/i });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive' }),
      );
    });

    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('calls onSuccess when the API returns a valid payment link', async () => {
    const paymentLinkData = {
      success: true,
      paymentLink: 'https://checkout.stripe.com/pay/test_abc123',
      smsMessage: 'Pay here',
      customerPhone: '+447000000001',
    };

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(paymentLinkData),
      }),
    );

    const onSuccess = vi.fn();

    render(
      React.createElement(
        Wrapper,
        null,
        React.createElement(WholesalerPaymentLinkButton, {
          orderId: 42,
          onSuccess,
        }),
      ),
    );

    const btn = screen.getByRole('button', { name: /generate payment link/i });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith(paymentLinkData);
    });

    expect(mockToast).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// WholesalerPaymentLinkButton — same-button double-click prevention
// ─────────────────────────────────────────────────────────────────────────────
describe('WholesalerPaymentLinkButton — same-button double-click prevention', () => {
  beforeEach(() => {
    mockToast.mockClear();
  });

  it('only sends one fetch request even when clicked three times in rapid succession', async () => {
    let resolveFirst: (value: unknown) => void;
    const firstRequestResolved = new Promise((res) => { resolveFirst = res; });

    const fetchMock = vi.fn(() =>
      firstRequestResolved.then(() => ({
        ok: true,
        json: () => Promise.resolve({ success: false, error: 'test error' }),
      })),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(
      React.createElement(
        Wrapper,
        null,
        React.createElement(WholesalerPaymentLinkButton, {
          orderId: 42,
          onSuccess: vi.fn(),
        }),
      ),
    );

    const btn = screen.getByRole('button', { name: /generate payment link/i });

    fireEvent.click(btn);
    fireEvent.click(btn);
    fireEvent.click(btn);

    resolveFirst!(undefined);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive' }),
      );
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('allows a second request after the first one fully completes', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: false, error: 'test error' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(
      React.createElement(
        Wrapper,
        null,
        React.createElement(WholesalerPaymentLinkButton, {
          orderId: 42,
          onSuccess: vi.fn(),
        }),
      ),
    );

    const btn = screen.getByRole('button', { name: /generate payment link/i });

    fireEvent.click(btn);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(btn).not.toBeDisabled());

    fireEvent.click(btn);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// WholesalerPaymentLinkButton — cross-button mutual exclusion (shared lock)
// ─────────────────────────────────────────────────────────────────────────────
describe('WholesalerPaymentLinkButton — cross-button mutual exclusion', () => {
  beforeEach(() => {
    mockToast.mockClear();
  });

  it('clicking one button blocks the other — only one fetch fires even when both are clicked', async () => {
    let resolveFirst: (value: unknown) => void;
    const firstRequestResolved = new Promise((res) => { resolveFirst = res; });

    const fetchMock = vi.fn(() =>
      firstRequestResolved.then(() => ({
        ok: true,
        json: () => Promise.resolve({ success: false, error: 'test error' }),
      })),
    );
    vi.stubGlobal('fetch', fetchMock);

    const onSuccess = vi.fn();
    render(React.createElement(TwoButtonHarness, { onSuccess }));

    const panelBtn = screen.getByRole('button', { name: /panel button/i });
    const stickyBtn = screen.getByRole('button', { name: /sticky button/i });

    // Click the panel button — starts the request
    fireEvent.click(panelBtn);
    // Immediately click the sticky button — should be blocked
    fireEvent.click(stickyBtn);
    // Click the panel button again — still blocked
    fireEvent.click(panelBtn);

    resolveFirst!(undefined);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive' }),
      );
    });

    // Only one fetch should have been made, not two or three
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('after one button finishes, the sibling becomes clickable again', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: false, error: 'test error' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const onSuccess = vi.fn();
    render(React.createElement(TwoButtonHarness, { onSuccess }));

    const panelBtn = screen.getByRole('button', { name: /panel button/i });
    const stickyBtn = screen.getByRole('button', { name: /sticky button/i });

    // Click panel button and wait for it to finish
    fireEvent.click(panelBtn);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    // Both buttons should be re-enabled after the request completes
    await waitFor(() => {
      expect(panelBtn).not.toBeDisabled();
      expect(stickyBtn).not.toBeDisabled();
    });

    // The sticky button should now be able to fire its own request
    fireEvent.click(stickyBtn);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});
