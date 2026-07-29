/**
 * Integration tests for PATCH /api/customer-groups/:groupId/members/:customerId
 *
 * Verifies that the "edit member" handler correctly propagates address fields
 * (streetAddress, addressLine2, city, postalCode, country) to the database
 * update call and returns a success response.  Without this fix the fields
 * were silently dropped because the handler only destructured identity fields.
 *
 * All I/O is mocked (storage, db, auth, middleware).
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — use vi.hoisted so variables are available inside vi.mock factories
// which are hoisted to the top of the file by Vitest.
// ---------------------------------------------------------------------------

const { mockDbUpdateWhere, mockDbUpdateSet, mockDbUpdateTable } = vi.hoisted(() => {
  const mockDbUpdateWhere = vi.fn().mockResolvedValue({ rowCount: 1 });
  const mockDbUpdateSet = vi.fn().mockReturnValue({ where: mockDbUpdateWhere });
  const mockDbUpdateTable = vi.fn().mockReturnValue({ set: mockDbUpdateSet });
  return { mockDbUpdateWhere, mockDbUpdateSet, mockDbUpdateTable };
});

vi.mock('../server/storage', () => ({
  storage: {
    getCustomerGroups: vi.fn(),
  },
}));

vi.mock('../server/db', () => ({
  db: {
    update: mockDbUpdateTable,
  },
}));

// Transparent auth/permission middleware
vi.mock('../server/routes/shared', async (importOriginal) => {
  const real = await importOriginal<typeof import('../server/routes/shared')>();
  return {
    ...real,
    requireAuth: (_req: any, _res: any, next: any) => next(),
    requireBooleanFeature: () => (_req: any, _res: any, next: any) => next(),
    requireNotViewer: (_req: any, _res: any, next: any) => next(),
    requireMemberPermission: () => (_req: any, _res: any, next: any) => next(),
  };
});

vi.mock('../server/utils/resolveWholesalerId', () => ({
  resolveWholesalerId: () => 'wholesaler-1',
}));

// ---------------------------------------------------------------------------
// Build the Express app under test
// ---------------------------------------------------------------------------

import request from 'supertest';
import express from 'express';
import { registerCustomerRoutes } from '../server/routes/customers';
import { storage } from '../server/storage';

const app = express();
app.use(express.json());
app.use((req: any, _res, next) => {
  req.user = { id: 'wholesaler-1', role: 'wholesaler' };
  next();
});
registerCustomerRoutes(app);

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const GROUP_ID = 42;
const CUSTOMER_ID = 'cust-uuid-1';

const MOCK_GROUP = {
  id: GROUP_ID,
  name: 'Test Group',
  wholesalerId: 'wholesaler-1',
  description: '',
  createdAt: new Date().toISOString(),
};

function setupMocks() {
  vi.clearAllMocks();
  (storage.getCustomerGroups as ReturnType<typeof vi.fn>).mockResolvedValue([MOCK_GROUP]);
  // Re-wire the db mock chain after clearAllMocks wipes return values
  mockDbUpdateWhere.mockResolvedValue({ rowCount: 1 });
  mockDbUpdateSet.mockReturnValue({ where: mockDbUpdateWhere });
  mockDbUpdateTable.mockReturnValue({ set: mockDbUpdateSet });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PATCH /api/customer-groups/:groupId/members/:customerId — address fields', () => {
  beforeEach(setupMocks);

  const FULL_PATCH_PAYLOAD = {
    firstName: 'Jane',
    lastName: 'Smith',
    phoneNumber: '+447700900001',
    email: 'jane@example.com',
    businessName: "Jane's Cafe",
    streetAddress: '12 High Street',
    addressLine2: 'Flat 2',
    city: 'London',
    postalCode: 'EC1A 1BB',
    country: 'GB',
  };

  it('returns 200 and success flag when all fields are provided', async () => {
    const res = await request(app)
      .patch(`/api/customer-groups/${GROUP_ID}/members/${CUSTOMER_ID}`)
      .send(FULL_PATCH_PAYLOAD);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('includes all address fields in the db.update() call for the user record', async () => {
    await request(app)
      .patch(`/api/customer-groups/${GROUP_ID}/members/${CUSTOMER_ID}`)
      .send(FULL_PATCH_PAYLOAD);

    // db.update is called twice: once for WCR displayName, once for users row.
    expect(mockDbUpdateSet).toHaveBeenCalledTimes(2);

    // The users update is the call whose argument includes address fields.
    const setArgs: Record<string, string | null | undefined>[] =
      mockDbUpdateSet.mock.calls.map((call) => call[0]);

    const usersUpdate = setArgs.find((arg) => 'streetAddress' in arg || 'city' in arg);
    expect(usersUpdate).toBeDefined();
    expect(usersUpdate!.streetAddress).toBe('12 High Street');
    expect(usersUpdate!.addressLine2).toBe('Flat 2');
    expect(usersUpdate!.city).toBe('London');
    expect(usersUpdate!.postalCode).toBe('EC1A 1BB');
    expect(usersUpdate!.country).toBe('GB');
  });

  it('also carries identity fields alongside address fields', async () => {
    await request(app)
      .patch(`/api/customer-groups/${GROUP_ID}/members/${CUSTOMER_ID}`)
      .send(FULL_PATCH_PAYLOAD);

    const setArgs: Record<string, string | null | undefined>[] =
      mockDbUpdateSet.mock.calls.map((call) => call[0]);

    const usersUpdate = setArgs.find((arg) => 'firstName' in arg);
    expect(usersUpdate).toBeDefined();
    expect(usersUpdate!.firstName).toBe('Jane');
    expect(usersUpdate!.lastName).toBe('Smith');
    expect(usersUpdate!.email).toBe('jane@example.com');
    expect(usersUpdate!.businessName).toBe("Jane's Cafe");
    expect(usersUpdate!.phoneNumber).toBe('+447700900001');
  });

  it('omits address keys from the update when they are not sent in the request', async () => {
    await request(app)
      .patch(`/api/customer-groups/${GROUP_ID}/members/${CUSTOMER_ID}`)
      .send({ firstName: 'Bob', lastName: 'Jones', phoneNumber: '+447700900002' });

    const setArgs: Record<string, string | null | undefined>[] =
      mockDbUpdateSet.mock.calls.map((call) => call[0]);

    const usersUpdate = setArgs.find((arg) => 'firstName' in arg);
    expect(usersUpdate).toBeDefined();
    expect('streetAddress' in usersUpdate!).toBe(false);
    expect('city' in usersUpdate!).toBe(false);
    expect('postalCode' in usersUpdate!).toBe(false);
    expect('country' in usersUpdate!).toBe(false);
  });

  it('sets address fields to null when empty strings are sent (clearing a field)', async () => {
    await request(app)
      .patch(`/api/customer-groups/${GROUP_ID}/members/${CUSTOMER_ID}`)
      .send({
        ...FULL_PATCH_PAYLOAD,
        streetAddress: '',
        addressLine2: '',
        city: '',
        postalCode: '',
        country: '',
      });

    const setArgs: Record<string, string | null | undefined>[] =
      mockDbUpdateSet.mock.calls.map((call) => call[0]);

    const usersUpdate = setArgs.find((arg) => 'streetAddress' in arg);
    expect(usersUpdate).toBeDefined();
    expect(usersUpdate!.streetAddress).toBeNull();
    expect(usersUpdate!.addressLine2).toBeNull();
    expect(usersUpdate!.city).toBeNull();
    expect(usersUpdate!.postalCode).toBeNull();
    expect(usersUpdate!.country).toBeNull();
  });

  it('returns 400 when phoneNumber is missing', async () => {
    const { phoneNumber: _omit, ...noPhone } = FULL_PATCH_PAYLOAD;

    const res = await request(app)
      .patch(`/api/customer-groups/${GROUP_ID}/members/${CUSTOMER_ID}`)
      .send(noPhone);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/phone/i);
  });

  it('returns 404 when the group does not belong to this wholesaler', async () => {
    (storage.getCustomerGroups as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const res = await request(app)
      .patch(`/api/customer-groups/${GROUP_ID}/members/${CUSTOMER_ID}`)
      .send(FULL_PATCH_PAYLOAD);

    expect(res.status).toBe(404);
  });
});
