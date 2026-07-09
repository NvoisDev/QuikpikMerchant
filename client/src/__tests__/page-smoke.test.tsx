/**
 * Page-level smoke tests — catch undefined-variable crashes before production.
 *
 * Background: A "Can't find variable: fmt" crash shipped because Vite's dev
 * build and TypeScript didn't surface the missing identifier in the large
 * WholesalerDashboard file.  These tests render the real component (not a
 * stub) so any reference to an undefined function/variable at render time
 * throws immediately and fails the test.
 *
 * Each test covers the two render paths that the dashboard can take:
 *   1. Loading / unauthenticated state  — renders skeleton cards
 *   2. Authenticated state              — renders the full dashboard
 *
 * Hooks that touch the network are mocked; fetch is stubbed to return empty
 * data so React Query suspense/error boundaries don't interfere.
 */

import React from 'react';
import { render } from '@testing-library/react';
import { vi, describe, it, expect, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import WholesalerDashboard from '@/pages/wholesaler-dashboard';

// ─── Suppress act(...) / console.error noise from React Query internals ──────
const originalError = console.error;
beforeEach(() => {
  console.error = (...args: unknown[]) => {
    const msg = typeof args[0] === 'string' ? args[0] : '';
    if (
      msg.includes('act(') ||
      msg.includes('not wrapped in act') ||
      msg.includes('ReactDOM.render') ||
      msg.includes('Warning:')
    ) {
      return;
    }
    originalError(...args);
  };
});

afterEach(() => {
  console.error = originalError;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ─── Fake fetch: returns null/empty for every request ────────────────────────
function stubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(null),
      blob: () => Promise.resolve(new Blob()),
      text: () => Promise.resolve(''),
    }),
  );
}

// ─── Minimal QueryClient with retries off ────────────────────────────────────
function makeQC() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(QueryClientProvider, { client: makeQC() }, children);
}

// ─── Mock hooks ──────────────────────────────────────────────────────────────

vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/hooks/useCurrency', () => ({
  useCurrency: vi.fn(),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock('@/hooks/useOnboarding', () => ({
  useOnboarding: () => ({
    isActive: false,
    currentStep: null,
    steps: [],
    startOnboarding: vi.fn(),
    completeStep: vi.fn(),
    skipOnboarding: vi.fn(),
  }),
}));

vi.mock('wouter', () => ({
  useLocation: () => ['/dashboard', vi.fn()],
  useParams: () => ({}),
  useRoute: () => [false, {}],
  Link: ({ children }: { children: React.ReactNode }) => React.createElement('a', null, children),
  Route: ({ children }: { children: React.ReactNode }) => children,
  Switch: ({ children }: { children: React.ReactNode }) => children,
}));

// ─── Helpers to import the mocked modules ────────────────────────────────────
async function importMocks() {
  const { useAuth } = await import('@/hooks/useAuth');
  const { useCurrency } = await import('@/hooks/useCurrency');
  return { useAuth: useAuth as ReturnType<typeof vi.fn>, useCurrency: useCurrency as ReturnType<typeof vi.fn> };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('WholesalerDashboard — page smoke tests', () => {
  it('renders the loading skeleton without throwing (unauthenticated state)', async () => {
    stubFetch();
    const { useAuth, useCurrency } = await importMocks();

    useAuth.mockReturnValue({
      user: undefined,
      isLoading: true,
      loading: true,
      isAuthenticated: false,
      logout: vi.fn(),
      backToHome: vi.fn(),
      isLoggingOut: false,
    });

    useCurrency.mockReturnValue({
      formatMoney: (v: number) => `£${v.toFixed(2)}`,
      symbol: '£',
      code: 'GBP',
    });

    // Should not throw — any undefined identifier used in render will throw here
    expect(() =>
      render(React.createElement(WholesalerDashboard), { wrapper: Wrapper }),
    ).not.toThrow();
  });

  it('renders the authenticated dashboard without throwing (user present)', async () => {
    stubFetch();
    const { useAuth, useCurrency } = await importMocks();

    useAuth.mockReturnValue({
      user: {
        id: 1,
        email: 'test@example.com',
        name: 'Test Wholesaler',
        role: 'wholesaler',
        preferredCurrency: 'GBP',
        subscriptionStatus: 'active',
      },
      isLoading: false,
      loading: false,
      isAuthenticated: true,
      logout: vi.fn(),
      backToHome: vi.fn(),
      isLoggingOut: false,
    });

    useCurrency.mockReturnValue({
      formatMoney: (v: number) => `£${v.toFixed(2)}`,
      symbol: '£',
      code: 'GBP',
    });

    // Should not throw — undefined helpers called on data in JSX will throw here
    expect(() =>
      render(React.createElement(WholesalerDashboard), { wrapper: Wrapper }),
    ).not.toThrow();
  });
});
