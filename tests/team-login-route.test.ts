/**
 * Behavioral integration tests for POST /api/auth/team-login.
 *
 * Uses supertest + a minimal Express app with storage and db mocked so no
 * real database connection is required.  A lightweight session middleware
 * stub captures whatever the route writes to req.session so tests can
 * assert on the session payload.
 *
 * Required scenarios (from task spec):
 *  - Valid team member email + correct password  → 200 + session user
 *  - Wholesaler email on team-login endpoint     → 401 "Business Owner tab"
 *  - Wrong password                              → 401 "Invalid email or password"
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

// ── Mocks must be declared before any module that transitively loads them ────

// vi.hoisted ensures these are initialized before any vi.mock factory runs.
const { mockWhere, mockSet, mockUpdate } = vi.hoisted(() => {
  const mockWhere = vi.fn().mockResolvedValue(undefined);
  const mockSet = vi.fn(() => ({ where: mockWhere }));
  const mockUpdate = vi.fn(() => ({ set: mockSet }));
  return { mockWhere, mockSet, mockUpdate };
});

// Prevent db.ts from throwing on missing DATABASE_URL and stub the
// db.update chain used inside the team-login handler.
vi.mock('../server/db', () => ({
  db: { update: mockUpdate },
  pool: {},
}));

vi.mock('../server/storage', () => ({
  storage: {
    getUserByEmail: vi.fn(),
    authenticateUser: vi.fn(),
    getAllTeamMembers: vi.fn(),
    getUser: vi.fn(),
    updateTeamMemberLastLogin: vi.fn().mockResolvedValue(undefined),
    getTabPermissions: vi.fn().mockResolvedValue({}),
    checkTabAccess: vi.fn().mockResolvedValue(true),
  },
}));

// Stub every heavy dependency pulled in transitively through ./shared so that
// vi.mock hoisting doesn't fail when those modules try to connect to services.
vi.mock('../server/replitAuth', () => ({
  setupAuth: vi.fn(),
  isAuthenticated: vi.fn((_req: any, _res: any, next: any) => next()),
}));
vi.mock('../server/googleAuth', () => ({
  getGoogleAuthUrl: vi.fn(),
  verifyGoogleToken: vi.fn(),
  createOrUpdateUser: vi.fn(),
  requireAuth: vi.fn((_req: any, _res: any, next: any) => next()),
  GoogleAuthBlockedError: class extends Error {},
}));
vi.mock('../server/ai', () => ({ generateProductDescription: vi.fn(), generateProductImage: vi.fn() }));
vi.mock('../server/ai-taglines', () => ({ generatePersonalizedTagline: vi.fn(), generateCampaignSuggestions: vi.fn(), optimizeMessageTiming: vi.fn() }));
vi.mock('../server/whatsapp-simple', () => ({ whatsAppBusinessService: {} }));
vi.mock('../server/sms-service', () => ({ ReliableSMSService: class {} }));
vi.mock('../server/services/smsService', () => ({ sendSMS: vi.fn() }));
vi.mock('../server/services/whatsappService', () => ({ sendWhatsAppMessage: vi.fn() }));
vi.mock('../server/sendgrid-service', () => ({ sendEmail: vi.fn(), sendStripeVerifiedEmail: vi.fn() }));
vi.mock('../server/passwordResetService', () => ({
  generateResetToken: vi.fn(),
  createResetExpiration: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  hashResetToken: vi.fn(),
}));
vi.mock('../server/email-verification', () => ({ createEmailVerification: vi.fn(), verifyEmailCode: vi.fn() }));
vi.mock('../server/email-templates', () => ({
  generateWholesalerOrderNotificationEmail: vi.fn(),
  generateReadyForCollectionEmail: vi.fn(),
  wrapCustomerEmail: vi.fn(() => ''),
  emailCard: vi.fn(() => ''),
  emailButton: vi.fn(() => ''),
  emailHeading: vi.fn(() => ''),
  emailBadge: vi.fn(() => ''),
  emailDivider: vi.fn(() => ''),
  escapeHtml: (s: string) => s,
  getEmailLogoUrl: vi.fn(() => ''),
  buildItemisedRefundEmail: vi.fn(),
  generateDowngradeScheduledEmail: vi.fn(),
  generateDowngradeEffectiveEmail: vi.fn(),
  generateListingLapseReEngagementEmail: vi.fn(),
  formatPackDescriptor: vi.fn(),
  cancellationRefundTypeToEmailStatus: {},
}));
vi.mock('../server/services/welcomeMessageService.js', () => ({ sendWelcomeMessages: vi.fn() }));
vi.mock('../server/services/orderNotificationService', () => ({
  orderNotificationService: {},
  sendOrderStatusNotification: vi.fn(),
}));
vi.mock('../server/services/quickOrderService', () => ({ quickOrderService: {} }));
vi.mock('../server/services/multiWholesalerService', () => ({ multiWholesalerService: {} }));
vi.mock('../server/health', () => ({ healthCheck: vi.fn() }));
vi.mock('../server/middleware/performance', () => ({ performanceMiddleware: vi.fn((_req: any, _res: any, next: any) => next()) }));
vi.mock('../server/utils/connectionPool', () => ({ queryOptimizer: {}, queryCache: {} }));
vi.mock('../server/middleware/feature-gating', () => ({
  requireFeatureAccess: vi.fn(() => (_req: any, _res: any, next: any) => next()),
  requireProductLimits: vi.fn(() => (_req: any, _res: any, next: any) => next()),
  requireBroadcastLimits: vi.fn(() => (_req: any, _res: any, next: any) => next()),
  requireTeamMemberLimits: vi.fn(() => (_req: any, _res: any, next: any) => next()),
  getUserPlanLimits: vi.fn(),
  requireBooleanFeature: vi.fn(() => (_req: any, _res: any, next: any) => next()),
}));
vi.mock('../server/stripeConfig', () => ({
  getStripeClient: vi.fn(),
  getPublishableKey: vi.fn(),
  isLiveMode: vi.fn().mockReturnValue(false),
  getWebhookSecrets: vi.fn().mockReturnValue([]),
  stripeLive: null,
  stripeTest: null,
  STRIPE_ENVIRONMENT: 'test',
}));
vi.mock('../server/subscription-service', () => ({ SubscriptionService: class {} }));
vi.mock('../server/utils/preciseShippingCalculator', () => ({ PreciseShippingCalculator: class {} }));
vi.mock('../server/utils/resolveWholesalerId', () => ({ resolveWholesalerId: vi.fn() }));
vi.mock('../server/passwordUtils', () => ({
  validatePassword: vi.fn(),
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
}));
vi.mock('@sendgrid/mail', () => ({ default: { setApiKey: vi.fn(), send: vi.fn() } }));
vi.mock('twilio', () => ({ default: vi.fn(() => ({})) }));
vi.mock('openai', () => ({ default: class {} }));
vi.mock('multer', () => {
  const multerInstance = { single: vi.fn(() => (_req: any, _res: any, next: any) => next()), array: vi.fn(() => (_req: any, _res: any, next: any) => next()) };
  const multerFn: any = vi.fn(() => multerInstance);
  multerFn.memoryStorage = vi.fn(() => ({}));
  multerFn.diskStorage = vi.fn(() => ({}));
  return { default: multerFn };
});
vi.mock('sharp', () => ({ default: vi.fn() }));
vi.mock('compression', () => ({ default: vi.fn(() => (_req: any, _res: any, next: any) => next()) }));
vi.mock('cookie-parser', () => ({ default: vi.fn(() => (_req: any, _res: any, next: any) => next()) }));

// ── Imports (after mocks) ────────────────────────────────────────────────────

import request from 'supertest';
import express from 'express';
import { registerAuthTeamRoutes } from '../server/routes/auth-team';
import { storage } from '../server/storage';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Captured session written by the route handler */
let capturedSession: Record<string, any> = {};

/**
 * Lightweight session middleware: provides the req.session object with a
 * real `regenerate` callback (as express-session does) so the route can call
 * it without crashing.
 */
function sessionMiddleware(req: any, _res: any, next: any) {
  capturedSession = {};
  req.session = {
    user: undefined,
    regenerate(cb: (err: null) => void) {
      capturedSession = {};
      req.session.user = undefined;
      cb(null);
    },
    get user() { return capturedSession.user; },
    set user(v: any) { capturedSession.user = v; },
  };
  next();
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(sessionMiddleware);
  registerAuthTeamRoutes(app);
  return app;
}

// ── Mock data ─────────────────────────────────────────────────────────────────

const TEAM_MEMBER_USER = {
  id: 'user-tm-1',
  email: 'alice@example.com',
  firstName: 'Alice',
  lastName: 'Smith',
  role: 'team_member',
  businessName: null,
};

const WHOLESALER_USER = {
  id: 'user-ws-1',
  email: 'owner@example.com',
  firstName: 'Bob',
  lastName: 'Jones',
  role: 'wholesaler',
  businessName: 'Bob Wholesale Ltd',
};

const TEAM_MEMBER_RECORD = {
  id: 42,
  email: 'alice@example.com',
  wholesalerId: 'user-ws-1',
  status: 'active',
};

const WHOLESALER_INFO = {
  id: 'user-ws-1',
  businessName: 'Bob Wholesale Ltd',
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/auth/team-login', () => {
  let app: ReturnType<typeof buildApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedSession = {};
    app = buildApp();

    // Default happy-path mocks — individual tests override as needed.
    (storage.getUserByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(TEAM_MEMBER_USER);
    (storage.authenticateUser as ReturnType<typeof vi.fn>).mockResolvedValue(TEAM_MEMBER_USER);
    (storage.getAllTeamMembers as ReturnType<typeof vi.fn>).mockResolvedValue([TEAM_MEMBER_RECORD]);
    (storage.getUser as ReturnType<typeof vi.fn>).mockResolvedValue(WHOLESALER_INFO);
  });

  // ── Scenario 1: valid team member ─────────────────────────────────────────

  it('returns 200 and sets a team_member session for valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/team-login')
      .send({ email: 'alice@example.com', password: 'correct-password' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('writes a session user with role team_member and isTeamMember true', async () => {
    await request(app)
      .post('/api/auth/team-login')
      .send({ email: 'alice@example.com', password: 'correct-password' });

    expect(capturedSession.user).toBeDefined();
    expect(capturedSession.user.role).toBe('team_member');
    expect(capturedSession.user.isTeamMember).toBe(true);
    expect(capturedSession.user.id).toBe(TEAM_MEMBER_USER.id);
    expect(capturedSession.user.wholesalerId).toBe(TEAM_MEMBER_RECORD.wholesalerId);
  });

  it('JSON response includes role team_member and isTeamMember true', async () => {
    const res = await request(app)
      .post('/api/auth/team-login')
      .send({ email: 'alice@example.com', password: 'correct-password' });

    expect(res.body.user.role).toBe('team_member');
    expect(res.body.user.isTeamMember).toBe(true);
  });

  // ── Scenario 2: wholesaler using team-login endpoint ─────────────────────

  it('returns 401 with Business Owner tab message when a wholesaler tries to log in here', async () => {
    (storage.getUserByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(WHOLESALER_USER);

    const res = await request(app)
      .post('/api/auth/team-login')
      .send({ email: 'owner@example.com', password: 'any-password' });

    expect(res.status).toBe(401);
    expect(res.body.message).toContain('Business Owner tab');
  });

  it('does not create a session when a wholesaler uses the team-login endpoint', async () => {
    (storage.getUserByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(WHOLESALER_USER);

    await request(app)
      .post('/api/auth/team-login')
      .send({ email: 'owner@example.com', password: 'any-password' });

    expect(capturedSession.user).toBeUndefined();
  });

  // ── Scenario 3: wrong password ────────────────────────────────────────────

  it('returns 401 with "Invalid email or password" when the password is wrong', async () => {
    (storage.authenticateUser as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await request(app)
      .post('/api/auth/team-login')
      .send({ email: 'alice@example.com', password: 'wrong-password' });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid email or password');
  });

  it('does not create a session when the password is wrong', async () => {
    (storage.authenticateUser as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await request(app)
      .post('/api/auth/team-login')
      .send({ email: 'alice@example.com', password: 'wrong-password' });

    expect(capturedSession.user).toBeUndefined();
  });

  // ── Additional edge cases ─────────────────────────────────────────────────

  it('returns 400 when email or password is missing', async () => {
    const res = await request(app)
      .post('/api/auth/team-login')
      .send({ email: 'alice@example.com' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Email and password are required');
  });

  it('returns 401 with "Invalid email or password" when no user is found', async () => {
    (storage.getUserByEmail as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await request(app)
      .post('/api/auth/team-login')
      .send({ email: 'ghost@example.com', password: 'anything' });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid email or password');
  });

  it('returns 403 when team member account is suspended', async () => {
    (storage.getAllTeamMembers as ReturnType<typeof vi.fn>).mockResolvedValue([
      { ...TEAM_MEMBER_RECORD, status: 'suspended' },
    ]);

    const res = await request(app)
      .post('/api/auth/team-login')
      .send({ email: 'alice@example.com', password: 'correct-password' });

    expect(res.status).toBe(403);
    expect(res.body.message).toContain('suspended');
  });
});
