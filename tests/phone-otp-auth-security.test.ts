import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

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
