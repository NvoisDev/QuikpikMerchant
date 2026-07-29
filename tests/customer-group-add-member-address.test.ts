/**
 * Integration tests for POST /api/customer-groups/:groupId/members
 * and GET /api/customer-groups/:groupId/members — verifying that the
 * 'Add Customer' form in CustomerGroupsTab correctly sends and persists
 * all address + identity fields (businessName, firstName, lastName,
 * streetAddress, addressLine2, city, postalCode, country).
 *
 * All I/O is mocked (storage, db, auth, SMS, email, WhatsApp).
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — declared before any module import that transitively loads them
// ---------------------------------------------------------------------------

vi.mock('../server/storage', () => ({
  storage: {
    getCustomerGroups: vi.fn(),
    getUserByPhone: vi.fn(),
    createCustomer: vi.fn(),
    addCustomerToGroup: vi.fn(),
    getUser: vi.fn(),
    getUserById: vi.fn(),
    getGroupMembers: vi.fn(),
  },
}));

// Mock the database client used directly in the route (WCR insert/select/update)
const mockDbInsert = vi.fn().mockReturnThis();
const mockDbValues = vi.fn().mockResolvedValue(undefined);
const mockDbSelect = vi.fn().mockReturnThis();
const mockDbFrom = vi.fn().mockReturnThis();
const mockDbWhere = vi.fn().mockResolvedValue([]);  // no existing WCR → triggers insert
const mockDbLimit = vi.fn().mockResolvedValue([]);
const mockDbUpdate = vi.fn().mockReturnThis();
const mockDbSet = vi.fn().mockReturnThis();

vi.mock('../server/db', () => ({
  db: {
    insert: () => ({ values: mockDbValues }),
    select: () => ({ from: () => ({ where: () => ({ limit: mockDbLimit }) }) }),
    update: () => ({ set: () => ({ where: mockDbWhere }) }),
  },
}));

// Make every auth/permission middleware a transparent pass-through
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

// Disable external notification channels
vi.mock('../server/sms-service', () => ({
  ReliableSMSService: { isConfigured: () => false },
}));

vi.mock('../server/whatsapp-simple', () => ({
  whatsAppBusinessService: { sendMessage: vi.fn() },
}));

vi.mock('../server/sendgrid-service', () => ({
  sendEmail: vi.fn().mockResolvedValue(false),
  sendStripeVerifiedEmail: vi.fn(),
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
// Inject a fake authenticated user so resolveWholesalerId and req.user checks pass
app.use((req: any, _res, next) => {
  req.user = { id: 'wholesaler-1', role: 'wholesaler' };
  next();
});
registerCustomerRoutes(app);

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const GROUP_ID = 42;

const MOCK_GROUP = {
  id: GROUP_ID,
  name: 'Test Group',
  wholesalerId: 'wholesaler-1',
  description: '',
  createdAt: new Date().toISOString(),
};

const MOCK_WHOLESALER = {
  id: 'wholesaler-1',
  businessName: 'Test Wholesaler',
  email: 'ws@test.com',
  whatsappEnabled: false,
  whatsappAccessToken: null,
  whatsappBusinessPhoneId: null,
  logoType: null,
  logoUrl: null,
};

const CREATED_CUSTOMER = {
  id: 'cust-uuid-1',
  phoneNumber: '+447700900001',
  firstName: 'Jane',
  lastName: 'Smith',
  businessName: 'Janes Cafe',
  email: 'jane@example.com',
  streetAddress: '12 High Street',
  addressLine2: 'Flat 2',
  city: 'London',
  postalCode: 'EC1A 1BB',
  country: 'GB',
  role: 'retailer',
};

function setupMocks() {
  vi.clearAllMocks();
  (storage.getCustomerGroups as ReturnType<typeof vi.fn>).mockResolvedValue([MOCK_GROUP]);
  (storage.getUserByPhone as ReturnType<typeof vi.fn>).mockResolvedValue(undefined); // new customer
  (storage.createCustomer as ReturnType<typeof vi.fn>).mockResolvedValue(CREATED_CUSTOMER);
  (storage.addCustomerToGroup as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  (storage.getUser as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_WHOLESALER);
  (storage.getUserById as ReturnType<typeof vi.fn>).mockResolvedValue(MOCK_WHOLESALER);
  (storage.getGroupMembers as ReturnType<typeof vi.fn>).mockResolvedValue([CREATED_CUSTOMER]);
  mockDbLimit.mockResolvedValue([]); // no existing WCR row
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/customer-groups/:groupId/members — full address + business name', () => {
  beforeEach(setupMocks);

  const FULL_PAYLOAD = {
    firstName: 'Jane',
    lastName: 'Smith',
    businessName: "Janes Cafe",
    email: 'jane@example.com',
    phoneNumber: '07700900001',
    streetAddress: '12 High Street',
    addressLine2: 'Flat 2',
    city: 'London',
    postalCode: 'EC1A 1BB',
    country: 'GB',
  };

  it('returns 200 and success flag', async () => {
    const res = await request(app)
      .post(`/api/customer-groups/${GROUP_ID}/members`)
      .send(FULL_PAYLOAD);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('includes the new customer id and formatted phone in the response', async () => {
    const res = await request(app)
      .post(`/api/customer-groups/${GROUP_ID}/members`)
      .send(FULL_PAYLOAD);

    expect(res.body.customer.id).toBe('cust-uuid-1');
    expect(res.body.customer.phoneNumber).toMatch(/^\+44/);
  });

  it('calls createCustomer with all address fields', async () => {
    await request(app)
      .post(`/api/customer-groups/${GROUP_ID}/members`)
      .send(FULL_PAYLOAD);

    expect(storage.createCustomer).toHaveBeenCalledOnce();
    const arg = (storage.createCustomer as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg.firstName).toBe('Jane');
    expect(arg.lastName).toBe('Smith');
    expect(arg.businessName).toBe("Janes Cafe");
    expect(arg.streetAddress).toBe('12 High Street');
    expect(arg.addressLine2).toBe('Flat 2');
    expect(arg.city).toBe('London');
    expect(arg.postalCode).toBe('EC1A 1BB');
    expect(arg.country).toBe('GB');
    expect(arg.email).toBe('jane@example.com');
    expect(arg.role).toBe('retailer');
  });

  it('links the new customer to the group', async () => {
    await request(app)
      .post(`/api/customer-groups/${GROUP_ID}/members`)
      .send(FULL_PAYLOAD);

    expect(storage.addCustomerToGroup).toHaveBeenCalledWith(GROUP_ID, 'cust-uuid-1');
  });

  it('returns 400 when phone number is missing', async () => {
    const { phoneNumber: _omitted, ...noPhone } = FULL_PAYLOAD;
    const res = await request(app)
      .post(`/api/customer-groups/${GROUP_ID}/members`)
      .send(noPhone);

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/phone/i);
  });

  it('omits address fields from createCustomer when they are not provided', async () => {
    // Minimal payload — only required phone, optional name
    await request(app)
      .post(`/api/customer-groups/${GROUP_ID}/members`)
      .send({ firstName: 'Bob', phoneNumber: '07700900002' });

    const arg = (storage.createCustomer as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(arg.streetAddress).toBeUndefined();
    expect(arg.city).toBeUndefined();
    expect(arg.postalCode).toBeUndefined();
    expect(arg.country).toBeUndefined();
  });
});

describe('POST /api/customer-groups/:groupId/members — existing customer', () => {
  beforeEach(() => {
    setupMocks();
    // Simulate an existing customer found by phone
    (storage.getUserByPhone as ReturnType<typeof vi.fn>).mockResolvedValue(CREATED_CUSTOMER);
  });

  it('does not call createCustomer for an existing customer', async () => {
    await request(app)
      .post(`/api/customer-groups/${GROUP_ID}/members`)
      .send({ firstName: 'Jane', phoneNumber: '07700900001' });

    expect(storage.createCustomer).not.toHaveBeenCalled();
  });

  it('still adds the existing customer to the group', async () => {
    await request(app)
      .post(`/api/customer-groups/${GROUP_ID}/members`)
      .send({ firstName: 'Jane', phoneNumber: '07700900001' });

    expect(storage.addCustomerToGroup).toHaveBeenCalledWith(GROUP_ID, CREATED_CUSTOMER.id);
  });
});

describe('GET /api/customer-groups/:groupId/members — member list reflects stored data', () => {
  beforeEach(setupMocks);

  it('returns 200 and the member list', async () => {
    const res = await request(app)
      .get(`/api/customer-groups/${GROUP_ID}/members`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);
  });

  it('member record exposes all address and identity fields', async () => {
    const res = await request(app)
      .get(`/api/customer-groups/${GROUP_ID}/members`);

    const member = res.body[0];
    expect(member.businessName).toBe('Janes Cafe');
    expect(member.firstName).toBe('Jane');
    expect(member.lastName).toBe('Smith');
    expect(member.email).toBe('jane@example.com');
    expect(member.streetAddress).toBe('12 High Street');
    expect(member.addressLine2).toBe('Flat 2');
    expect(member.city).toBe('London');
    expect(member.postalCode).toBe('EC1A 1BB');
    expect(member.country).toBe('GB');
  });

  it('returns 404 when the group does not belong to this wholesaler', async () => {
    (storage.getCustomerGroups as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const res = await request(app)
      .get(`/api/customer-groups/${GROUP_ID}/members`);

    expect(res.status).toBe(404);
  });
});
