import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { signCustomerCookie, parseCustomerCookie, COOKIE_OPTIONS } from '../server/utils/customer-auth-cookie';

const TEST_SECRET = 'test-secret-for-cookie-signing';
const FUTURE_EXPIRES = Date.now() + 24 * 60 * 60 * 1000;
const PAST_EXPIRES = Date.now() - 1000;

beforeAll(() => {
  process.env.SESSION_SECRET = TEST_SECRET;
});

afterAll(() => {
  delete process.env.SESSION_SECRET;
});

describe('signCustomerCookie / parseCustomerCookie', () => {
  it('accepts a valid signed cookie', () => {
    const payload = { customerId: 42, wholesalerId: 7, expires: FUTURE_EXPIRES };
    const cookie = signCustomerCookie(payload);
    const result = parseCustomerCookie(cookie);
    expect(result).not.toBeNull();
    expect(result!.customerId).toBe(42);
    expect(result!.wholesalerId).toBe(7);
  });

  it('rejects a cookie with a tampered base64 payload', () => {
    const payload = { customerId: 1, expires: FUTURE_EXPIRES };
    const cookie = signCustomerCookie(payload);

    const lastDot = cookie.lastIndexOf('.');
    const sig = cookie.substring(lastDot + 1);

    const tamperedBase64 = Buffer.from(
      JSON.stringify({ customerId: 999, expires: FUTURE_EXPIRES })
    ).toString('base64');
    const tamperedCookie = `${tamperedBase64}.${sig}`;

    expect(parseCustomerCookie(tamperedCookie)).toBeNull();
  });

  it('rejects a cookie with an invalid (wrong) signature', () => {
    const payload = { customerId: 1, expires: FUTURE_EXPIRES };
    const cookie = signCustomerCookie(payload);
    const lastDot = cookie.lastIndexOf('.');
    const base64 = cookie.substring(0, lastDot);
    const badSig = 'a'.repeat(64);
    expect(parseCustomerCookie(`${base64}.${badSig}`)).toBeNull();
  });

  it('rejects a cookie with a missing signature (no dot separator)', () => {
    const base64Only = Buffer.from(JSON.stringify({ customerId: 1, expires: FUTURE_EXPIRES })).toString('base64');
    expect(parseCustomerCookie(base64Only)).toBeNull();
  });

  it('rejects an expired cookie', () => {
    const payload = { customerId: 1, expires: PAST_EXPIRES };
    const cookie = signCustomerCookie(payload);
    expect(parseCustomerCookie(cookie)).toBeNull();
  });

  it('rejects an unsigned legacy base64 cookie (no dot)', () => {
    const legacyPayload = Buffer.from(JSON.stringify({ customerId: 5, wholesalerId: 3 })).toString('base64');
    expect(parseCustomerCookie(legacyPayload)).toBeNull();
  });

  it('returns null for an undefined cookie value', () => {
    expect(parseCustomerCookie(undefined)).toBeNull();
  });
});

describe('COOKIE_OPTIONS', () => {
  it('httpOnly is always true', () => {
    expect(COOKIE_OPTIONS.httpOnly).toBe(true);
  });

  it('sameSite is "lax"', () => {
    expect(COOKIE_OPTIONS.sameSite).toBe('lax');
  });

  it('secure is false when NODE_ENV is "development"', async () => {
    const original = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'development';
      vi.resetModules();
      const { COOKIE_OPTIONS: opts } = await import('../server/utils/customer-auth-cookie');
      expect(opts.secure).toBe(false);
    } finally {
      process.env.NODE_ENV = original;
      vi.resetModules();
    }
  });

  it('secure is true when NODE_ENV is "production"', async () => {
    const original = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      vi.resetModules();
      const { COOKIE_OPTIONS: opts } = await import('../server/utils/customer-auth-cookie');
      expect(opts.secure).toBe(true);
    } finally {
      process.env.NODE_ENV = original;
      vi.resetModules();
    }
  });

  it('secure is true when NODE_ENV is "test" (any non-development env)', async () => {
    const original = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'test';
      vi.resetModules();
      const { COOKIE_OPTIONS: opts } = await import('../server/utils/customer-auth-cookie');
      expect(opts.secure).toBe(true);
    } finally {
      process.env.NODE_ENV = original;
      vi.resetModules();
    }
  });
});
