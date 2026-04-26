import { describe, expect, it } from 'vitest';
import { formatPhoneToInternational, isValidMobile, isValidUKMobile } from '@shared/phone-utils';

describe('formatPhoneToInternational', () => {

  describe('UK (+44) — existing behaviour preserved', () => {
    it('converts national 07700 900000 to E.164', () => {
      expect(formatPhoneToInternational('07700900000')).toBe('+447700900000');
    });

    it('converts 07700 900000 with spaces to E.164', () => {
      expect(formatPhoneToInternational('07700 900000')).toBe('+447700900000');
    });

    it('passes through already-international +447700900000 unchanged', () => {
      expect(formatPhoneToInternational('+447700900000')).toBe('+447700900000');
    });

    it('converts 447700900000 (missing +) to E.164', () => {
      expect(formatPhoneToInternational('447700900000')).toBe('+447700900000');
    });
  });

  describe('Ireland (+353) — trunk 0 removal', () => {
    it('converts national 087 123 4567 to E.164 when country code is +353', () => {
      expect(formatPhoneToInternational('0871234567', '+353')).toBe('+353871234567');
    });

    it('passes through already-international +353871234567 unchanged', () => {
      expect(formatPhoneToInternational('+353871234567', '+353')).toBe('+353871234567');
    });

    it('prepends +353 when no leading 0 (subscriber digits only)', () => {
      expect(formatPhoneToInternational('871234567', '+353')).toBe('+353871234567');
    });
  });

  describe('US (+1) — no trunk prefix', () => {
    it('prepends +1 to a 10-digit US number', () => {
      expect(formatPhoneToInternational('2025551234', '+1')).toBe('+12025551234');
    });

    it('passes through already-international +12025551234 unchanged', () => {
      expect(formatPhoneToInternational('+12025551234', '+1')).toBe('+12025551234');
    });
  });

});

describe('isValidMobile — structural E.164 validation', () => {

  it('accepts a valid UK mobile in E.164', () => {
    expect(isValidMobile('+447700900000')).toBe(true);
  });

  it('accepts a valid Irish mobile in E.164', () => {
    expect(isValidMobile('+353871234567')).toBe(true);
  });

  it('accepts a valid US number in E.164', () => {
    expect(isValidMobile('+12025551234')).toBe(true);
  });

  it('accepts Irish number entered in national format with +353 country code', () => {
    const normalised = formatPhoneToInternational('0871234567', '+353');
    expect(isValidMobile(normalised)).toBe(true);
  });

  it('accepts a UK national format (normalised internally to E.164)', () => {
    // formatPhoneToInternational converts 07700900000 → +447700900000 first
    expect(isValidMobile('07700900000')).toBe(true);
  });

  it('rejects empty string', () => {
    expect(isValidMobile('')).toBe(false);
  });

  it('rejects a number that is too short', () => {
    expect(isValidMobile('+123456')).toBe(false);
  });

  it('rejects a number that is too long (>15 digits)', () => {
    expect(isValidMobile('+1234567890123456')).toBe(false);
  });

});

describe('isValidUKMobile — preserved UK-specific rule', () => {

  it('accepts a valid UK mobile', () => {
    expect(isValidUKMobile('+447700900000')).toBe(true);
  });

  it('rejects an Irish mobile', () => {
    expect(isValidUKMobile('+353871234567')).toBe(false);
  });

  it('rejects a US mobile', () => {
    expect(isValidUKMobile('+12025551234')).toBe(false);
  });

});
