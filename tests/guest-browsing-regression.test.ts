import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getGuestStockRows, getSellingFormatLabel } from '../client/src/lib/guest-catalogue';
import { stripGuestPricingData } from '../server/utils/guest-products';

const customerAuthSource = readFileSync('client/src/components/customer/CustomerAuth.tsx', 'utf8');
const customerPortalSource = readFileSync('client/src/pages/customer-portal.tsx', 'utf8');
const marketplaceRoutesSource = readFileSync('server/routes/marketplace.ts', 'utf8');

const sourceBetween = (source: string, start: string, end: string) => {
  const startIndex = source.indexOf(start);
  expect(startIndex).toBeGreaterThanOrEqual(0);

  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(endIndex).toBeGreaterThan(startIndex);

  return source.slice(startIndex, endIndex);
};

describe('guest browsing regression coverage', () => {
  it('keeps Browse products as guest available on the initial phone verification screen', () => {
    const phoneStep = sourceBetween(customerAuthSource, "{authStep === 'step2' && (", "{authStep === 'step3'");
    const guestButton = sourceBetween(phoneStep, '{onSkipAuth && error !== "CUSTOMER_NOT_FOUND" && (', '</button>');

    expect(phoneStep).toContain('Phone Verification');
    expect(phoneStep).toContain('Enter the last 4 digits of your phone number');
    expect(guestButton).toContain('onClick={onSkipAuth}');
    expect(guestButton).toContain('Browse products as guest');
    expect(guestButton).not.toContain('lastFourDigits.length');
    expect(guestButton).not.toContain('disabled=');
  });

  it('keeps the not-registered phone state focused on access request actions', () => {
    const customerNotFoundAlert = sourceBetween(
      customerAuthSource,
      'error === "CUSTOMER_NOT_FOUND" ? (',
      ') : error.includes("SMS failed")',
    );

    expect(customerNotFoundAlert).toContain('Not registered yet?');
    expect(customerNotFoundAlert.indexOf('Request Access')).toBeLessThan(customerNotFoundAlert.indexOf('Try Different Number'));
    expect(customerNotFoundAlert).not.toContain('Browse products as guest');
    expect(customerAuthSource).toContain('{onSkipAuth && error !== "CUSTOMER_NOT_FOUND" && (');
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