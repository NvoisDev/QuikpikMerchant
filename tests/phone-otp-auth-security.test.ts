import { readFileSync } from 'node:fs';
import { describe, expect, it, test } from 'vitest';

const customerAuthRouteSource = readFileSync('server/routes/customer-auth.ts', 'utf8');
const customerAuthComponentSource = readFileSync('client/src/components/customer/CustomerAuth.tsx', 'utf8');
const customerLoginSource = readFileSync('client/src/pages/CustomerLogin.tsx', 'utf8');

const sourceBetween = (source: string, start: string, end: string) => {
  const startIndex = source.indexOf(start);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  const endIndex = source.indexOf(end, startIndex + start.length);
  expect(endIndex).toBeGreaterThan(startIndex);
  return source.slice(startIndex, endIndex);
};

describe('phone OTP auth security contract', () => {

  it('complete-phone-login requires code in request body', () => {
    const handler = sourceBetween(
      customerAuthRouteSource,
      "// POST /api/customer-auth/complete-phone-login",
      "// Find the customer record for this phone",
    );
    // Body must destructure code
    expect(handler).toContain('code');
    // Must reject when code is missing
    expect(handler).toContain('Phone number, code, and wholesaler ID are required');
  });

  it('complete-phone-login validates code against session nonce (not DB fallback)', () => {
    const handler = sourceBetween(
      customerAuthRouteSource,
      "// POST /api/customer-auth/complete-phone-login",
      "// Find the customer record for this phone",
    );
    // Session nonce check must include verifiedCode
    expect(handler).toContain('verifiedCode');
    expect(handler).toContain('sessionAny?.verifiedCode === trimmedCode');
    // Must check phone matches nonce
    expect(handler).toContain('sessionAny?.verifiedPhone === normalised');
    // Must check expiry
    expect(handler).toContain('verifiedPhoneExpiry');
    // Must NOT use findRecentlyUsedPhoneVerification as a login bypass
    expect(handler).not.toContain('findRecentlyUsedPhoneVerification');
  });

  it('verify-phone-otp stores code in session nonce alongside phone and expiry', () => {
    const verifyHandler = sourceBetween(
      customerAuthRouteSource,
      "// Store a short-lived session nonce to prove OTP was completed",
      "await new Promise<void>",
    );
    expect(verifyHandler).toContain('sessionAny.verifiedPhone = normalised');
    expect(verifyHandler).toContain('sessionAny.verifiedCode = trimmedCode');
    expect(verifyHandler).toContain('sessionAny.verifiedPhoneExpiry = Date.now()');
  });

  it('verify-phone-otp increments attempts on wrong code', () => {
    const verifyHandler = sourceBetween(
      customerAuthRouteSource,
      "// Compare codes — increment attempts on any mismatch",
      "// Code is correct — mark as used",
    );
    expect(verifyHandler).toContain('incrementPhoneVerificationAttempts(record.id)');
    expect(verifyHandler).toContain('remaining');
  });

  it('CustomerAuth.tsx sends code to complete-phone-login', () => {
    const completeLoginFn = sourceBetween(
      customerAuthComponentSource,
      "const completeLogin = async (selectedWholesalerId: string) => {",
      "toast({ title: 'Welcome!'",
    );
    expect(completeLoginFn).toContain('/api/customer-auth/complete-phone-login');
    expect(completeLoginFn).toContain('code: otpCode');
    expect(completeLoginFn).toContain('wholesalerId: selectedWholesalerId');
  });

  it('CustomerLogin.tsx sends code to complete-phone-login', () => {
    const completeLoginFn = sourceBetween(
      customerLoginSource,
      "const completeLogin = async (opt: WholesalerOption) => {",
      "toast({ title: 'Welcome!'",
    );
    expect(completeLoginFn).toContain('/api/customer-auth/complete-phone-login');
    expect(completeLoginFn).toContain('code: otpCode');
    expect(completeLoginFn).toContain('wholesalerId: opt.wholesalerId');
  });

  it('legacy endpoints have console.warn deprecation notices', () => {
    expect(customerAuthRouteSource).toContain(
      "console.warn('⚠️  DEPRECATED: /api/customer-auth/verify"
    );
    expect(customerAuthRouteSource).toContain(
      "console.warn('⚠️  DEPRECATED: /api/customer-auth/request-sms"
    );
    expect(customerAuthRouteSource).toContain(
      "console.warn('⚠️  DEPRECATED: /api/customer-auth/verify-sms"
    );
  });

});

describe('international phone support', () => {

  it('CustomerAuth.tsx uses editable country code state (not hardcoded +44 static span)', () => {
    // Must have a DEFAULT_COUNTRY_CODE constant (UK default)
    expect(customerAuthComponentSource).toContain("DEFAULT_COUNTRY_CODE = '+44'");
    // Must have editable state — not a static select-none span
    expect(customerAuthComponentSource).toContain('countryCode, setCountryCode');
    // Country code state must be initialised (either from localStorage or the default constant)
    expect(customerAuthComponentSource).toMatch(/useState\((getSavedCountryCode|DEFAULT_COUNTRY_CODE)\)/);
    // UI must use the CountryCodePicker component (searchable flag/name/dial-code dropdown)
    expect(customerAuthComponentSource).toContain('CountryCodePicker');
    // Phone must be composed from state, not COUNTRY_CODE constant
    expect(customerAuthComponentSource).toContain('countryCode.trim()');
    // Static "+44" badge must not be present
    expect(customerAuthComponentSource).not.toContain("🇬🇧 {COUNTRY_CODE}");
  });

  it('CustomerLogin.tsx uses editable country code state (not hardcoded +44 static span)', () => {
    expect(customerLoginSource).toContain("DEFAULT_COUNTRY_CODE = '+44'");
    expect(customerLoginSource).toContain('countryCode, setCountryCode');
    // Country code state must be initialised (either from localStorage or the default constant)
    expect(customerLoginSource).toMatch(/useState\((getSavedCountryCode|DEFAULT_COUNTRY_CODE)\)/);
    // UI must use the CountryCodePicker component (searchable flag/name/dial-code dropdown)
    expect(customerLoginSource).toContain('CountryCodePicker');
    expect(customerLoginSource).toContain('countryCode.trim()');
    expect(customerLoginSource).not.toContain("🇬🇧 {COUNTRY_CODE}");
  });

  it('E.164 composition strips leading 0 from local part for non-UK numbers', () => {
    // Verify the formula used in fullPhone across both files
    [customerAuthComponentSource, customerLoginSource].forEach(source => {
      expect(source).toContain("phoneLocal.replace(/^0/, '')");
    });
  });

  test('international number example: +353 87 123 4567 (Ireland)', () => {
    // Simulate what the components do: countryCode = '+353', phoneLocal = '0871234567'
    const countryCode = '+353';
    const phoneLocal = '0871234567';
    const fullPhone = countryCode.trim() + phoneLocal.replace(/^0/, '');
    expect(fullPhone).toBe('+353871234567');
  });

  test('international number example: +1 555 123 4567 (USA)', () => {
    const countryCode = '+1';
    const phoneLocal = '5551234567';
    const fullPhone = countryCode.trim() + phoneLocal.replace(/^0/, '');
    expect(fullPhone).toBe('+15551234567');
  });

  test('UK default: +44 07700 900000 correctly strips leading 0', () => {
    const countryCode = '+44';
    const phoneLocal = '07700900000';
    const fullPhone = countryCode.trim() + phoneLocal.replace(/^0/, '');
    expect(fullPhone).toBe('+447700900000');
  });

});

describe('logout auto-login regression', () => {

  const logoutRoute = readFileSync('server/routes/customer-auth.ts', 'utf8');
  const loginPage = readFileSync('client/src/pages/CustomerLogin.tsx', 'utf8');
  const portalPage = readFileSync('client/src/pages/customer-portal.tsx', 'utf8');

  it('logout endpoint clears the customer_auth cookie', () => {
    const handler = sourceBetween(
      logoutRoute,
      "// POST /api/customer-auth/logout",
      "res.json({ success: true, message: \"Logged out successfully\" })",
    );
    expect(handler).toContain("clearCookie('customer_auth'");
  });

  it('logout endpoint deletes customerAuth from session before destroy (safety net)', () => {
    const handler = sourceBetween(
      logoutRoute,
      "// POST /api/customer-auth/logout",
      "res.json({ success: true, message: \"Logged out successfully\" })",
    );
    expect(handler).toContain('delete (req.session as any).customerAuth');
    expect(handler).toContain('req.session.destroy');
  });

  it('logout handler in customer-portal redirects to /customer-login?loggedOut=1', () => {
    expect(portalPage).toContain("window.location.href = '/customer-login?loggedOut=1'");
  });

  it('CustomerLogin session-resume skips check-session when ?loggedOut=1 is present', () => {
    expect(loginPage).toContain("params.get('loggedOut') === '1'");
  });

  it('CustomerLogin removes ?loggedOut=1 from URL after guard fires (no stale skip on revisit)', () => {
    expect(loginPage).toContain("params.delete('loggedOut')");
    expect(loginPage).toContain('window.history.replaceState');
  });

});
