/**
 * Page-level smoke tests — catch undefined-variable crashes before production.
 *
 * Background: A "Can't find variable: fmt" crash shipped because Vite's dev
 * build and TypeScript didn't surface the missing identifier in the large
 * WholesalerDashboard file.  These tests render the real component (not a
 * stub) so any reference to an undefined function/variable at render time
 * throws immediately and fails the test.
 *
 * Each test covers the two render paths that the page can take:
 *   1. Loading / unauthenticated state  — renders skeleton / loading UI
 *   2. Authenticated state              — renders the full page
 *
 * Hooks that touch the network are mocked; fetch is stubbed to return empty
 * data so React Query suspense/error boundaries don't interfere.
 *
 * Pages covered:
 *   - WholesalerDashboard
 *   - ProductManagement
 *   - OrdersFresh
 *   - QuickQuote
 *   - CustomerPortal
 *   - Analytics
 *   - Campaigns
 *   - Financials
 *   - Settings
 *   - TeamManagement
 *   - StockAlerts
 */

import React from 'react';
import { render } from '@testing-library/react';
import { vi, describe, it, expect, afterEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import WholesalerDashboard from '@/pages/wholesaler-dashboard';
import ProductManagement from '@/pages/product-management';
import OrdersFresh from '@/pages/orders-fresh';
import QuickQuote from '@/pages/quick-quote';
import CustomerPortal from '@/pages/customer-portal';
import Analytics from '@/pages/analytics';
import Campaigns from '@/pages/campaigns';
import Financials from '@/pages/financials';
import Settings from '@/pages/settings';
import TeamManagement from '@/pages/team-management';
import StockAlerts from '@/pages/stock-alerts';

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

vi.mock('@/contexts/sidebar-context', () => ({
  useSidebarContext: () => ({
    isDesktopCollapsed: false,
    toggleDesktopCollapsed: vi.fn(),
    isMobileOpen: false,
    openMobileSidebar: vi.fn(),
    closeMobileSidebar: vi.fn(),
    mobileTopBarActions: null,
    setMobileTopBarActions: vi.fn(),
  }),
  SidebarProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@/lib/near-depletion', () => ({
  useNearDepletionThreshold: () => ({ threshold: 10, setThreshold: vi.fn() }),
  getNearDepletionThreshold: () => 10,
}));

vi.mock('@/hooks/useSidebarPermissions', () => ({
  useSidebarPermissions: () => ({
    checkTabAccess: () => true,
    permissionsLoading: false,
    filteredNavItems: [],
    isTabHidden: () => false,
  }),
}));

vi.mock('@/components/ui/theme-switcher', () => ({
  useCustomerTheme: () => ({ theme: 'emerald', changeTheme: vi.fn() }),
  ThemeSwitcher: () => null,
}));

vi.mock('@/components/FeatureLock', () => ({
  FeatureLock: ({ children }: { children: React.ReactNode }) => children,
  isListingTier: () => false,
}));

// ─── Helpers to import the mocked modules ────────────────────────────────────
async function importMocks() {
  const { useAuth } = await import('@/hooks/useAuth');
  const { useCurrency } = await import('@/hooks/useCurrency');
  return { useAuth: useAuth as ReturnType<typeof vi.fn>, useCurrency: useCurrency as ReturnType<typeof vi.fn> };
}

function makeAuthUser(overrides = {}) {
  return {
    id: 1,
    email: 'test@example.com',
    name: 'Test Wholesaler',
    role: 'wholesaler',
    preferredCurrency: 'GBP',
    subscriptionStatus: 'active',
    ...overrides,
  };
}

function makeUnauthState() {
  return {
    user: undefined,
    isLoading: true,
    loading: true,
    isAuthenticated: false,
    logout: vi.fn(),
    backToHome: vi.fn(),
    isLoggingOut: false,
  };
}

function makeAuthState(user = makeAuthUser()) {
  return {
    user,
    isLoading: false,
    loading: false,
    isAuthenticated: true,
    logout: vi.fn(),
    backToHome: vi.fn(),
    isLoggingOut: false,
  };
}

function makeCurrency() {
  return {
    formatMoney: (v: number) => `£${v.toFixed(2)}`,
    symbol: '£',
    code: 'GBP',
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('WholesalerDashboard — page smoke tests', () => {
  it('renders the loading skeleton without throwing (unauthenticated state)', async () => {
    stubFetch();
    const { useAuth, useCurrency } = await importMocks();
    useAuth.mockReturnValue(makeUnauthState());
    useCurrency.mockReturnValue(makeCurrency());

    expect(() =>
      render(React.createElement(WholesalerDashboard), { wrapper: Wrapper }),
    ).not.toThrow();
  });

  it('renders the authenticated dashboard without throwing (user present)', async () => {
    stubFetch();
    const { useAuth, useCurrency } = await importMocks();
    useAuth.mockReturnValue(makeAuthState());
    useCurrency.mockReturnValue(makeCurrency());

    expect(() =>
      render(React.createElement(WholesalerDashboard), { wrapper: Wrapper }),
    ).not.toThrow();
  });
});

describe('ProductManagement — page smoke tests', () => {
  it('renders without throwing (unauthenticated / loading state)', async () => {
    stubFetch();
    const { useAuth, useCurrency } = await importMocks();
    useAuth.mockReturnValue(makeUnauthState());
    useCurrency.mockReturnValue(makeCurrency());

    expect(() =>
      render(React.createElement(ProductManagement), { wrapper: Wrapper }),
    ).not.toThrow();
  });

  it('renders without throwing (authenticated state)', async () => {
    stubFetch();
    const { useAuth, useCurrency } = await importMocks();
    useAuth.mockReturnValue(makeAuthState());
    useCurrency.mockReturnValue(makeCurrency());

    expect(() =>
      render(React.createElement(ProductManagement), { wrapper: Wrapper }),
    ).not.toThrow();
  });
});

describe('OrdersFresh — page smoke tests', () => {
  it('renders without throwing (unauthenticated / loading state)', async () => {
    stubFetch();
    const { useAuth, useCurrency } = await importMocks();
    useAuth.mockReturnValue(makeUnauthState());
    useCurrency.mockReturnValue(makeCurrency());

    expect(() =>
      render(React.createElement(OrdersFresh), { wrapper: Wrapper }),
    ).not.toThrow();
  });

  it('renders without throwing (authenticated state)', async () => {
    stubFetch();
    const { useAuth, useCurrency } = await importMocks();
    useAuth.mockReturnValue(makeAuthState());
    useCurrency.mockReturnValue(makeCurrency());

    expect(() =>
      render(React.createElement(OrdersFresh), { wrapper: Wrapper }),
    ).not.toThrow();
  });
});

describe('QuickQuote — page smoke tests', () => {
  it('renders without throwing (unauthenticated / loading state)', async () => {
    stubFetch();
    const { useAuth, useCurrency } = await importMocks();
    useAuth.mockReturnValue(makeUnauthState());
    useCurrency.mockReturnValue(makeCurrency());

    expect(() =>
      render(React.createElement(QuickQuote), { wrapper: Wrapper }),
    ).not.toThrow();
  });

  it('renders without throwing (authenticated state)', async () => {
    stubFetch();
    const { useAuth, useCurrency } = await importMocks();
    useAuth.mockReturnValue(makeAuthState());
    useCurrency.mockReturnValue(makeCurrency());

    expect(() =>
      render(React.createElement(QuickQuote), { wrapper: Wrapper }),
    ).not.toThrow();
  });
});

describe('CustomerPortal — page smoke tests', () => {
  it('renders without throwing (no store slug / anonymous visitor)', async () => {
    stubFetch();

    expect(() =>
      render(React.createElement(CustomerPortal), { wrapper: Wrapper }),
    ).not.toThrow();
  });
});

describe('Analytics — page smoke tests', () => {
  it('renders without throwing (unauthenticated / loading state)', async () => {
    stubFetch();
    const { useAuth, useCurrency } = await importMocks();
    useAuth.mockReturnValue(makeUnauthState());
    useCurrency.mockReturnValue(makeCurrency());

    expect(() =>
      render(React.createElement(Analytics), { wrapper: Wrapper }),
    ).not.toThrow();
  });

  it('renders without throwing (authenticated state)', async () => {
    stubFetch();
    const { useAuth, useCurrency } = await importMocks();
    useAuth.mockReturnValue(makeAuthState());
    useCurrency.mockReturnValue(makeCurrency());

    expect(() =>
      render(React.createElement(Analytics), { wrapper: Wrapper }),
    ).not.toThrow();
  });
});

describe('Campaigns — page smoke tests', () => {
  it('renders without throwing (unauthenticated / loading state)', async () => {
    stubFetch();
    const { useAuth, useCurrency } = await importMocks();
    useAuth.mockReturnValue(makeUnauthState());
    useCurrency.mockReturnValue(makeCurrency());

    expect(() =>
      render(React.createElement(Campaigns), { wrapper: Wrapper }),
    ).not.toThrow();
  });

  it('renders without throwing (authenticated state)', async () => {
    stubFetch();
    const { useAuth, useCurrency } = await importMocks();
    useAuth.mockReturnValue(makeAuthState());
    useCurrency.mockReturnValue(makeCurrency());

    expect(() =>
      render(React.createElement(Campaigns), { wrapper: Wrapper }),
    ).not.toThrow();
  });
});

describe('Financials — page smoke tests', () => {
  it('renders without throwing (unauthenticated / loading state)', async () => {
    stubFetch();
    const { useAuth, useCurrency } = await importMocks();
    useAuth.mockReturnValue(makeUnauthState());
    useCurrency.mockReturnValue(makeCurrency());

    expect(() =>
      render(React.createElement(Financials), { wrapper: Wrapper }),
    ).not.toThrow();
  });

  it('renders without throwing (authenticated state)', async () => {
    stubFetch();
    const { useAuth, useCurrency } = await importMocks();
    useAuth.mockReturnValue(makeAuthState());
    useCurrency.mockReturnValue(makeCurrency());

    expect(() =>
      render(React.createElement(Financials), { wrapper: Wrapper }),
    ).not.toThrow();
  });
});

describe('Settings — page smoke tests', () => {
  it('renders without throwing (unauthenticated / loading state)', async () => {
    stubFetch();
    const { useAuth, useCurrency } = await importMocks();
    useAuth.mockReturnValue(makeUnauthState());
    useCurrency.mockReturnValue(makeCurrency());

    expect(() =>
      render(React.createElement(Settings), { wrapper: Wrapper }),
    ).not.toThrow();
  });

  it('renders without throwing (authenticated state)', async () => {
    stubFetch();
    const { useAuth, useCurrency } = await importMocks();
    useAuth.mockReturnValue(makeAuthState());
    useCurrency.mockReturnValue(makeCurrency());

    expect(() =>
      render(React.createElement(Settings), { wrapper: Wrapper }),
    ).not.toThrow();
  });
});

describe('TeamManagement — page smoke tests', () => {
  it('renders without throwing (unauthenticated / loading state)', async () => {
    stubFetch();
    const { useAuth, useCurrency } = await importMocks();
    useAuth.mockReturnValue(makeUnauthState());
    useCurrency.mockReturnValue(makeCurrency());

    expect(() =>
      render(React.createElement(TeamManagement), { wrapper: Wrapper }),
    ).not.toThrow();
  });

  it('renders without throwing (authenticated state)', async () => {
    stubFetch();
    const { useAuth, useCurrency } = await importMocks();
    useAuth.mockReturnValue(makeAuthState());
    useCurrency.mockReturnValue(makeCurrency());

    expect(() =>
      render(React.createElement(TeamManagement), { wrapper: Wrapper }),
    ).not.toThrow();
  });
});

describe('StockAlerts — page smoke tests', () => {
  it('renders without throwing (unauthenticated / loading state)', async () => {
    stubFetch();
    const { useAuth, useCurrency } = await importMocks();
    useAuth.mockReturnValue(makeUnauthState());
    useCurrency.mockReturnValue(makeCurrency());

    expect(() =>
      render(React.createElement(StockAlerts), { wrapper: Wrapper }),
    ).not.toThrow();
  });

  it('renders without throwing (authenticated state)', async () => {
    stubFetch();
    const { useAuth, useCurrency } = await importMocks();
    useAuth.mockReturnValue(makeAuthState());
    useCurrency.mockReturnValue(makeCurrency());

    expect(() =>
      render(React.createElement(StockAlerts), { wrapper: Wrapper }),
    ).not.toThrow();
  });
});
