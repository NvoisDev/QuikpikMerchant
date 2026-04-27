import { describe, expect, it } from 'vitest';
import { insertCollectionAddressSchema } from '../shared/schema';

// ── Pure address resolution helper (extracted from SMS notification logic) ──

function resolveCollectionAddressText(
  collectionAddress: { name: string; addressLine1: string; addressLine2?: string | null; city: string; postcode: string } | null | undefined,
  wholesaler: { pickupAddress?: string | null; businessAddress?: string | null; streetAddress?: string | null; city?: string | null; postalCode?: string | null }
): string {
  if (collectionAddress) {
    const parts = [collectionAddress.name, collectionAddress.addressLine1, collectionAddress.addressLine2, collectionAddress.city, collectionAddress.postcode].filter(Boolean);
    return parts.join(', ');
  }
  if (wholesaler.pickupAddress) return wholesaler.pickupAddress;
  if (wholesaler.businessAddress) return wholesaler.businessAddress;
  if (wholesaler.streetAddress && wholesaler.city) {
    return `${wholesaler.streetAddress}, ${wholesaler.city}${wholesaler.postalCode ? `, ${wholesaler.postalCode}` : ''}`;
  }
  return '';
}

// ── Schema validation ────────────────────────────────────────────────────────

describe('insertCollectionAddressSchema', () => {
  it('accepts a valid address payload', () => {
    const result = insertCollectionAddressSchema.safeParse({
      wholesalerId: 'wh-123',
      name: 'Main Warehouse',
      addressLine1: 'Unit 4, Trade Estate',
      city: 'London',
      postcode: 'E1 2AB',
      country: 'United Kingdom',
      isDefault: false,
      isActive: true,
    });
    expect(result.success).toBe(true);
  });

  it('rejects when required name is missing', () => {
    const result = insertCollectionAddressSchema.safeParse({
      wholesalerId: 'wh-123',
      addressLine1: 'Unit 4, Trade Estate',
      city: 'London',
      postcode: 'E1 2AB',
    });
    expect(result.success).toBe(false);
  });

  it('rejects when required addressLine1 is missing', () => {
    const result = insertCollectionAddressSchema.safeParse({
      wholesalerId: 'wh-123',
      name: 'Main Warehouse',
      city: 'London',
      postcode: 'E1 2AB',
    });
    expect(result.success).toBe(false);
  });

  it('rejects when required city is missing', () => {
    const result = insertCollectionAddressSchema.safeParse({
      wholesalerId: 'wh-123',
      name: 'Main Warehouse',
      addressLine1: 'Unit 4',
      postcode: 'E1 2AB',
    });
    expect(result.success).toBe(false);
  });

  it('allows optional addressLine2 to be absent', () => {
    const result = insertCollectionAddressSchema.safeParse({
      wholesalerId: 'wh-123',
      name: 'City Centre Store',
      addressLine1: '12 High Street',
      city: 'Manchester',
      postcode: 'M1 1AA',
    });
    expect(result.success).toBe(true);
  });

  it('uses "United Kingdom" as default country', () => {
    const result = insertCollectionAddressSchema.safeParse({
      wholesalerId: 'wh-123',
      name: 'Branch',
      addressLine1: '1 Road',
      city: 'Leeds',
      postcode: 'LS1 1AA',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.country ?? 'United Kingdom').toBe('United Kingdom');
    }
  });
});

// ── Address resolution fallback logic ────────────────────────────────────────

describe('resolveCollectionAddressText — fallback chain', () => {
  const baseWholesaler = {
    pickupAddress: null,
    businessAddress: null,
    streetAddress: null,
    city: null,
    postalCode: null,
  };

  it('returns the linked collection address when provided', () => {
    const ca = { name: 'Warehouse A', addressLine1: 'Unit 1', city: 'Bristol', postcode: 'BS1 1AA' };
    const result = resolveCollectionAddressText(ca, baseWholesaler);
    expect(result).toBe('Warehouse A, Unit 1, Bristol, BS1 1AA');
  });

  it('includes addressLine2 in the collection address string when present', () => {
    const ca = { name: 'North Branch', addressLine1: '12 Park Road', addressLine2: 'Floor 2', city: 'Cardiff', postcode: 'CF1 1AB' };
    const result = resolveCollectionAddressText(ca, baseWholesaler);
    expect(result).toBe('North Branch, 12 Park Road, Floor 2, Cardiff, CF1 1AB');
  });

  it('falls back to pickupAddress when no linked collection address', () => {
    const result = resolveCollectionAddressText(null, { ...baseWholesaler, pickupAddress: '5 Old Street, London, EC1V 9HX' });
    expect(result).toBe('5 Old Street, London, EC1V 9HX');
  });

  it('falls back to businessAddress when no pickupAddress', () => {
    const result = resolveCollectionAddressText(null, { ...baseWholesaler, businessAddress: '10 Commerce Way, Birmingham, B1 1BB' });
    expect(result).toBe('10 Commerce Way, Birmingham, B1 1BB');
  });

  it('falls back to streetAddress + city (+ postalCode) when no other address', () => {
    const result = resolveCollectionAddressText(null, { streetAddress: '3 Trade Park', city: 'Sheffield', postalCode: 'S1 1AA', pickupAddress: null, businessAddress: null });
    expect(result).toBe('3 Trade Park, Sheffield, S1 1AA');
  });

  it('omits postalCode from streetAddress fallback when not set', () => {
    const result = resolveCollectionAddressText(null, { streetAddress: '3 Trade Park', city: 'Sheffield', postalCode: null, pickupAddress: null, businessAddress: null });
    expect(result).toBe('3 Trade Park, Sheffield');
  });

  it('returns empty string when no address info is available', () => {
    const result = resolveCollectionAddressText(null, baseWholesaler);
    expect(result).toBe('');
  });

  it('prefers linked collection address over pickupAddress', () => {
    const ca = { name: 'Special Site', addressLine1: 'Unit 99', city: 'Coventry', postcode: 'CV1 1ZZ' };
    const result = resolveCollectionAddressText(ca, { ...baseWholesaler, pickupAddress: 'Old legacy address' });
    expect(result).toContain('Special Site');
    expect(result).not.toContain('Old legacy address');
  });

  it('prefers pickupAddress over businessAddress', () => {
    const result = resolveCollectionAddressText(null, {
      ...baseWholesaler,
      pickupAddress: 'Pick up here',
      businessAddress: 'Business addr',
    });
    expect(result).toBe('Pick up here');
  });
});
