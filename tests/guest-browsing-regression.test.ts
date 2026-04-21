import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getGuestBackTarget, getGuestStockRows, getSellingFormatLabel } from '../client/src/lib/guest-catalogue';
import { stripGuestPricingData } from '../server/utils/guest-products';

const customerAuthSource = readFileSync('client/src/components/customer/CustomerAuth.tsx', 'utf8');
const customerPortalSource = readFileSync('client/src/pages/customer-portal.tsx', 'utf8');
const customerHelpSource = readFileSync('client/src/components/customer/CustomerHelp.tsx', 'utf8');
const landingPageSource = readFileSync('client/src/pages/LandingPage.tsx', 'utf8');
const helpPageSource = readFileSync('client/src/pages/help.tsx', 'utf8');
const marketplaceRoutesSource = readFileSync('server/routes/marketplace.ts', 'utf8');

const sourceBetween = (source: string, start: string, end: string) => {
  const startIndex = source.indexOf(start);
  expect(startIndex).toBeGreaterThanOrEqual(0);

  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(endIndex).toBeGreaterThan(startIndex);

  return source.slice(startIndex, endIndex);
};

describe('guest browsing regression coverage', () => {
  it('keeps Browse products as guest available on the initial phone step screen', () => {
    // New flow: step === 'phone'
    const phoneStep = sourceBetween(customerAuthSource, "{step === 'phone' && (", "{step === 'otp' && (");

    // Guest button: only shown on phone step
    expect(phoneStep).toContain('Browse products as guest');
    expect(phoneStep).toContain('onClick={onSkipAuth}');
    // Should not be disabled (no conditionally disabled attribute)
    expect(phoneStep).not.toContain("disabled={isLoading || otpCode");

    // Guest button is absent from the no-account step
    const noAccountStep = sourceBetween(customerAuthSource, "{step === 'no-account' && (", "{/* Registration request dialog */}");
    expect(noAccountStep).not.toContain('Browse products as guest');
  });

  it('keeps the not-registered phone state focused on access request actions', () => {
    // New flow: step === 'no-account'
    const noAccountStep = sourceBetween(customerAuthSource, "{step === 'no-account' && (", "{/* Registration request dialog */}");

    expect(noAccountStep).toContain('Not registered yet?');
    expect(noAccountStep).toContain('Request Access');
    // "Browse products as guest" must not appear here
    expect(noAccountStep).not.toContain('Browse products as guest');
    // Back button to try different number
    expect(noAccountStep).toContain('Try a different number');
    // Request Access comes before Try a different number
    expect(noAccountStep.indexOf('Request Access')).toBeLessThan(noAccountStep.indexOf('Try a different number'));
  });

  it('keeps guest catalogue pricing hidden while showing format and safe stock labels', () => {
    const guestPriceBranch = sourceBetween(customerPortalSource, 'if (isGuestMode) {', '\n  return (\n    <div className="flex items-center gap-2 flex-wrap">');
    const guestCatalogue = sourceBetween(
      customerPortalSource,
      '{isTrueGuestMode && (',
      '{/* Modern Tab Navigation - Only for authenticated users */}',
    );
    const guestStripBlock = sourceBetween(
      marketplaceRoutesSource,
      "if (req.query.guest === 'true') {",
      'res.json(formattedProducts);',
    );

    expect(guestPriceBranch).toContain('Login to view price');
    expect(guestPriceBranch).not.toContain('formatCurrency');
    expect(guestCatalogue).toContain('const guestStockRows = getGuestStockRows(product);');
    expect(guestCatalogue).toContain('{getSellingFormatLabel(product.sellingFormat)}');
    expect(guestCatalogue).toContain('<span>{row.text}</span>');
    expect(guestCatalogue).toContain('PriceDisplay price={null}');
    expect(guestCatalogue).toContain('isGuestMode={true}');
    expect(guestStripBlock).toContain('stripGuestPricingDataFromProducts(formattedProducts as any[])');
  });

  it('keeps public help copy aligned with guest browsing, OTP, and fee rules', () => {
    expect(landingPageSource).toContain('prices and ordering stay locked until the seller approves them');
    expect(landingPageSource).toContain('4.6% on online card orders');
    expect(landingPageSource).toContain('Support Available');
    expect(landingPageSource).not.toContain("products and prices without registration");
    expect(landingPageSource).not.toContain('Premium Support Included');
    expect(customerHelpSource).toContain('Enter your full registered phone number');
    expect(customerHelpSource).not.toContain('Enter the last 4 digits');
    expect(helpPageSource).toContain('prices and ordering require approved customer access');
    expect(helpPageSource).toContain('Quikpik now supports seller discovery for customers');
    expect(helpPageSource).toMatch(/Customer Transaction Fee\*\*: 5\.5% \+ £0\.50/);
    expect(helpPageSource).toMatch(/customer transaction fee is not (your|wholesaler) revenue/);
    expect(helpPageSource).toMatch(/No platform fee or customer transaction fee is collected unless an online payment is made later/);
    expect(helpPageSource).not.toContain('The Quikpik B2B wholesale marketplace is **coming soon**');
    expect(helpPageSource).not.toContain('Marketplace product discovery is coming soon');
    expect(helpPageSource).not.toContain('Last 4 digits of their registered phone number');
  });

  it('allows confirmed customer sessions to add products without guest prompt state', () => {
    const addToCartBlock = sourceBetween(
      customerPortalSource,
      'const addToCart = useCallback((product: ExtendedProduct, quantity: number, sellingType: "units" | "pallets" = "units") => {',
      '// Simple payment intent creation',
    );
    const authSuccessBlock = sourceBetween(
      customerPortalSource,
      'const handleAuthSuccess = (customer: any) => {',
      '// Handle guest browse - skip authentication',
    );
    const sessionSuccessBlock = sourceBetween(
      customerPortalSource,
      'if (sessionData?.authenticated && sessionData?.customer) {',
      'if (forceGuestParam) {',
    );

    expect(customerPortalSource).toContain('const hasCustomerSession = isAuthenticated && !!authenticatedCustomer;');
    expect(customerPortalSource).toContain('const isTrueGuestMode = isGuestMode && !hasCustomerSession && !isEnhancedPreviewMode;');
    expect(customerPortalSource).toContain('const shouldFetchGuestSafeProducts = !hasCustomerSession && !isEnhancedPreviewMode;');
    expect(addToCartBlock).toContain('if (!hasCustomerSession) {');
    expect(addToCartBlock).toContain('openCustomerSignIn();');
    expect(addToCartBlock).toContain('}, [toast, isEnhancedPreviewMode, hasCustomerSession]);');
    expect(addToCartBlock).not.toContain('if (isGuestMode) {');
    expect(addToCartBlock).not.toContain('setShowGuestSignInModal');
    expect(customerPortalSource).not.toContain('showGuestSignInModal');
    expect(customerPortalSource).toContain("const guestParam = shouldFetchGuestSafeProducts ? '?guest=true' : '';");
  });

  it('returns seller-selection guest browsing back to seller selection instead of homepage', () => {
    const guestBackButton = sourceBetween(
      customerPortalSource,
      '{isTrueGuestMode && (',
      '{/* Explore pill */}',
    );
    const sellerGuestButton = sourceBetween(
      customerPortalSource,
      '{wholesalerItem.canRequestAccess ? (',
      ') : wholesalerItem.isAccessible ?',
    );

    expect(sellerGuestButton).toContain('guest=true&guestFrom=selection');
    expect(getGuestBackTarget('?guest=true&guestFrom=selection')).toBe('seller-selection');
    expect(getGuestBackTarget('?guest=true')).toBe('landing');
    expect(getGuestBackTarget('')).toBe('landing');
    expect(guestBackButton).toContain('getGuestBackTarget(window.location.search) === "seller-selection"');
    expect(guestBackButton).toContain('clearGuestParam()');
    expect(guestBackButton).toContain('setIsGuestMode(false)');
    expect(guestBackButton).toContain('setAuthenticatedCustomer(null)');
    expect(guestBackButton).toContain('setCart([])');
    expect(guestBackButton).toContain('setShowWholesalerSearch(true)');
    expect(guestBackButton).toContain('setWholesalerSearchQuery("")');
    expect(guestBackButton.indexOf('getGuestBackTarget(window.location.search) === "seller-selection"')).toBeLessThan(guestBackButton.indexOf("window.location.href = '/landing'"));
  });

  it('formats guest catalogue selling format and safe stock rows', () => {
    expect(getSellingFormatLabel('both')).toBe('Units & Pallets');
    expect(getSellingFormatLabel('pallets')).toBe('Full Pallets');
    expect(getSellingFormatLabel(undefined)).toBe('Individual Units');
    expect(getGuestStockRows({ sellingFormat: 'both', stock: '1200', palletStock: 0 })).toEqual([
      { type: 'units', text: '1,200 units available', available: true },
      { type: 'pallets', text: 'Pallets unavailable or limited', available: false },
    ]);
  });

  it('strips all guest-sensitive price fields from product payloads', () => {
    const productWithPrices = stripGuestPricingData({
      price: '12.50',
      promoPrice: '10.00',
      palletPrice: '90.00',
      minimumBidPrice: '9.00',
      customPrice: '8.00',
      standardPrice: '12.50',
      hasPriceList: true,
      promotionalOffers: [{ type: 'fixed_price' }],
      promoActive: true,
      stock: 24,
      sellingFormat: 'both',
    });

    expect(productWithPrices).toMatchObject({
      price: null,
      promoPrice: null,
      palletPrice: null,
      minimumBidPrice: null,
      customPrice: undefined,
      standardPrice: undefined,
      hasPriceList: undefined,
      promotionalOffers: [],
      promoActive: false,
      stock: 24,
      sellingFormat: 'both',
    });
  });
});
