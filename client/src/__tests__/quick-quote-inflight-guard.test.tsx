/**
 * Component-level regression tests: in-flight guard for quick-quote buttons.
 *
 * These tests render the REAL QuoteActionBar exported from quick-quote.tsx —
 * the exact same component that users interact with on the quick-quote page.
 * Network calls are made via the production apiRequest helper (fetch is stubbed)
 * so assertions are at the request level (how many times fetch fired), not just
 * at the JS function call level.
 *
 * Save Draft guard:
 *   QuoteActionBar.onClick → acquire() → onSaveDraftMutate() → apiRequest POST /api/orders/draft
 *
 * Create & Send guard:
 *   QuoteActionBar.onClick → isLocked() check → onCreateQuote() → acquire() → apiRequest POST /api/quotes
 *
 * Both guards live in QuoteActionBar (exported from quick-quote.tsx) so a future
 * refactor that removes either guard will immediately break these assertions.
 *
 * Relevant production files:
 *   client/src/pages/quick-quote.tsx  — QuoteActionBar (exported)
 *   client/src/lib/inflight-guard.ts  — createInFlightGuard factory
 */

import React, { useRef } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, afterEach } from 'vitest';
import { createInFlightGuard } from '@/lib/inflight-guard';
import { apiRequest } from '@/lib/queryClient';
import { QuoteActionBar } from '@/pages/quick-quote';

// ---------------------------------------------------------------------------
// Shared fetch helpers
// ---------------------------------------------------------------------------
function makeHangingFetch() {
  let settle: (v: unknown) => void;
  const done = new Promise((res) => { settle = res; });
  const fetchMock = vi.fn(() =>
    done.then(() => ({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    })),
  );
  return { fetchMock, settle: () => settle(undefined) };
}

function makeImmediateFetch(payload = { success: true }) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(payload),
  });
}

// ---------------------------------------------------------------------------
// Minimal props that put the action bar in a "ready" state (buttons enabled)
// ---------------------------------------------------------------------------
const BASE_PROPS = {
  isDesktopCollapsed: false,
  hasCustomer: true,
  itemCount: 1,
  hasInvalidItems: false,
  fulfillmentType: 'pickup' as const,
  editingDraftId: null,
  totalText: '£100.00',
  isSaveDraftPending: false,
  isCreateQuotePending: false,
};

// ---------------------------------------------------------------------------
// Harness: owns the guard refs; onSaveDraftMutate and onCreateQuote make
// real network calls via apiRequest so fetch stubs are captured correctly.
// ---------------------------------------------------------------------------
function Harness({
  onSaveDraftMutate,
  onCreateQuote,
}: {
  onSaveDraftMutate: () => void;
  onCreateQuote: () => void;
}) {
  const saveAsDraftGuard = useRef(createInFlightGuard());
  const createQuoteGuard = useRef(createInFlightGuard());

  return (
    <QuoteActionBar
      {...BASE_PROPS}
      saveAsDraftGuard={saveAsDraftGuard}
      createQuoteGuard={createQuoteGuard}
      onSaveDraftMutate={onSaveDraftMutate}
      onCreateQuote={onCreateQuote}
    />
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// "Save Draft" — guard is inline in QuoteActionBar's onClick
// (acquire → onSaveDraftMutate → apiRequest POST /api/orders/draft)
// ---------------------------------------------------------------------------
describe('QuoteActionBar — Save Draft guard (inline onClick, network-level)', () => {
  it('sends exactly one POST /api/orders/draft when Save Draft is clicked 3× rapidly', async () => {
    const { fetchMock, settle } = makeHangingFetch();
    vi.stubGlobal('fetch', fetchMock);

    let releaseGuard: (() => void) | null = null;

    function HarnessWithRelease() {
      const saveAsDraftGuard = useRef(createInFlightGuard());
      const createQuoteGuard = useRef(createInFlightGuard());
      releaseGuard = () => saveAsDraftGuard.current.release();

      const saveDraft = () => {
        apiRequest('POST', '/api/orders/draft', { items: [] }).finally(() => {
          saveAsDraftGuard.current.release();
        });
      };

      return (
        <QuoteActionBar
          {...BASE_PROPS}
          saveAsDraftGuard={saveAsDraftGuard}
          createQuoteGuard={createQuoteGuard}
          onSaveDraftMutate={saveDraft}
          onCreateQuote={vi.fn()}
        />
      );
    }

    render(<HarnessWithRelease />);
    const btn = screen.getByRole('button', { name: /save draft/i });

    // Three rapid clicks — guard should block the 2nd and 3rd
    fireEvent.click(btn);
    fireEvent.click(btn);
    fireEvent.click(btn);

    settle(); // resolve the pending fetch

    await waitFor(() => {
      // Only one request should have gone out to the real draft endpoint
      const draftCalls = fetchMock.mock.calls.filter(([url]) =>
        typeof url === 'string' && url.includes('/api/orders/draft'),
      );
      expect(draftCalls).toHaveLength(1);
    });
  });

  it('allows a second POST /api/orders/draft after the guard is released (onSettled)', async () => {
    const fetchMock = makeImmediateFetch();
    vi.stubGlobal('fetch', fetchMock);

    let externalRelease: (() => void) | null = null;
    const mutateCount = { value: 0 };

    function HarnessWithExternalRelease() {
      const saveAsDraftGuard = useRef(createInFlightGuard());
      const createQuoteGuard = useRef(createInFlightGuard());
      externalRelease = () => saveAsDraftGuard.current.release();

      const saveDraft = () => {
        mutateCount.value++;
        apiRequest('POST', '/api/orders/draft', { items: [] });
      };

      return (
        <QuoteActionBar
          {...BASE_PROPS}
          saveAsDraftGuard={saveAsDraftGuard}
          createQuoteGuard={createQuoteGuard}
          onSaveDraftMutate={saveDraft}
          onCreateQuote={vi.fn()}
        />
      );
    }

    render(<HarnessWithExternalRelease />);
    const btn = screen.getByRole('button', { name: /save draft/i });

    fireEvent.click(btn);
    expect(mutateCount.value).toBe(1);

    // Guard is still locked
    fireEvent.click(btn);
    expect(mutateCount.value).toBe(1);

    // Release (simulates onSettled)
    externalRelease!();

    fireEvent.click(btn);
    expect(mutateCount.value).toBe(2);

    await waitFor(() => {
      const draftCalls = fetchMock.mock.calls.filter(([url]) =>
        typeof url === 'string' && url.includes('/api/orders/draft'),
      );
      expect(draftCalls).toHaveLength(2);
    });
  });
});

// ---------------------------------------------------------------------------
// "Create & Send" — guard isLocked() check is in QuoteActionBar's onClick
// (isLocked check → onCreateQuote → acquire → apiRequest POST /api/quotes)
// ---------------------------------------------------------------------------
describe('QuoteActionBar — Create & Send guard (onClick isLocked check, network-level)', () => {
  it('sends exactly one POST /api/quotes when Create & Send is clicked 3× rapidly', async () => {
    const { fetchMock, settle } = makeHangingFetch();
    vi.stubGlobal('fetch', fetchMock);

    function HarnessWithCreateGuard() {
      const saveAsDraftGuard = useRef(createInFlightGuard());
      const createQuoteGuard = useRef(createInFlightGuard());

      // Mirrors handleCreateQuote: acquire AFTER validation, release in callbacks
      const onCreateQuote = () => {
        createQuoteGuard.current.acquire();  // validation already passed (button already checked isLocked)
        apiRequest('POST', '/api/quotes', { items: [] }).finally(() => {
          createQuoteGuard.current.release();
        });
      };

      return (
        <QuoteActionBar
          {...BASE_PROPS}
          saveAsDraftGuard={saveAsDraftGuard}
          createQuoteGuard={createQuoteGuard}
          onSaveDraftMutate={vi.fn()}
          onCreateQuote={onCreateQuote}
        />
      );
    }

    render(<HarnessWithCreateGuard />);
    const btn = screen.getByRole('button', { name: /create & send/i });

    // Three rapid clicks — the isLocked() check in QuoteActionBar.onClick blocks 2nd and 3rd
    fireEvent.click(btn);
    fireEvent.click(btn);
    fireEvent.click(btn);

    settle();

    await waitFor(() => {
      const quoteCalls = fetchMock.mock.calls.filter(([url]) =>
        typeof url === 'string' && url.includes('/api/quotes'),
      );
      expect(quoteCalls).toHaveLength(1);
    });
  });

  it('allows a second POST /api/quotes after the guard releases', async () => {
    const fetchMock = makeImmediateFetch({ orderId: 1, orderNumber: 'ORD-001', paymentLink: null });
    vi.stubGlobal('fetch', fetchMock);

    function HarnessAutoRelease() {
      const saveAsDraftGuard = useRef(createInFlightGuard());
      const createQuoteGuard = useRef(createInFlightGuard());

      const onCreateQuote = () => {
        createQuoteGuard.current.acquire();
        apiRequest('POST', '/api/quotes', { items: [] }).finally(() => {
          createQuoteGuard.current.release();
        });
      };

      return (
        <QuoteActionBar
          {...BASE_PROPS}
          saveAsDraftGuard={saveAsDraftGuard}
          createQuoteGuard={createQuoteGuard}
          onSaveDraftMutate={vi.fn()}
          onCreateQuote={onCreateQuote}
        />
      );
    }

    render(<HarnessAutoRelease />);
    const btn = screen.getByRole('button', { name: /create & send/i });

    fireEvent.click(btn);

    // Wait for first request to complete and guard to release
    await waitFor(() => {
      const quoteCalls = fetchMock.mock.calls.filter(([url]) =>
        typeof url === 'string' && url.includes('/api/quotes'),
      );
      expect(quoteCalls).toHaveLength(1);
    });

    fireEvent.click(btn);

    await waitFor(() => {
      const quoteCalls = fetchMock.mock.calls.filter(([url]) =>
        typeof url === 'string' && url.includes('/api/quotes'),
      );
      expect(quoteCalls).toHaveLength(2);
    });
  });
});

// ---------------------------------------------------------------------------
// Cross-button independence: Save Draft and Create & Send guards are separate
// ---------------------------------------------------------------------------
describe('QuoteActionBar — guards are independent per button', () => {
  it('locking the Save Draft guard does not block Create & Send', async () => {
    const fetchMock = makeImmediateFetch();
    vi.stubGlobal('fetch', fetchMock);

    function HarnessIndependent() {
      const saveAsDraftGuard = useRef(createInFlightGuard());
      const createQuoteGuard = useRef(createInFlightGuard());

      const saveDraft = () => {
        apiRequest('POST', '/api/orders/draft', {});
      };

      const onCreateQuote = () => {
        createQuoteGuard.current.acquire();
        apiRequest('POST', '/api/quotes', {}).finally(() => {
          createQuoteGuard.current.release();
        });
      };

      // Pre-lock the save draft guard to simulate an in-flight save
      React.useEffect(() => {
        saveAsDraftGuard.current.acquire();
      }, []);

      return (
        <QuoteActionBar
          {...BASE_PROPS}
          saveAsDraftGuard={saveAsDraftGuard}
          createQuoteGuard={createQuoteGuard}
          onSaveDraftMutate={saveDraft}
          onCreateQuote={onCreateQuote}
        />
      );
    }

    render(<HarnessIndependent />);

    const createBtn = screen.getByRole('button', { name: /create & send/i });
    fireEvent.click(createBtn);

    await waitFor(() => {
      const quoteCalls = fetchMock.mock.calls.filter(([url]) =>
        typeof url === 'string' && url.includes('/api/quotes'),
      );
      expect(quoteCalls).toHaveLength(1);
    });

    // Draft guard was locked — draft endpoint should NOT have been called
    const draftCalls = fetchMock.mock.calls.filter(([url]) =>
      typeof url === 'string' && url.includes('/api/orders/draft'),
    );
    expect(draftCalls).toHaveLength(0);
  });
});
