/**
 * Behavioral integration tests for GET /api/auth/user (session/me endpoint).
 *
 * Uses supertest + a minimal Express app with storage and db mocked so no
 * real database connection is required.
 *
 * Security scenarios covered:
 *  1. Valid team-member session → isTeamMember: true, role: 'team_member'
 *  2. Session cookie whose role is forged to 'wholesaler' for a team_member
 *     DB record → correct role 'team_member' is returned (DB wins, not session)
 *  3. Static analysis: handler does not read role from req.body or req.query
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// ── Mocks must be declared before any module that transitively loads them ────

const { mockWhere, mockSet, mockUpdate } = vi.hoisted(() => {
  const mockWhere = vi.fn().mockResolvedValue(undefined);
  const mockSet = vi.fn(() => ({ where: mockWhere }));
  const mockUpdate = vi.fn(() => ({ set: mockSet }));
  return { mockWhere, mockSet, mockUpdate };
});

vi.mock('../server/db', () => ({
  db: { update: mockUpdate, execute: vi.fn().mockResolvedValue({ rows: [] }) },
  pool: {},
}));

vi.mock('../server/storage', () => ({
  storage: {
    getUser: vi.fn(),
    getTeamMembers: vi.fn(),
    updateUser: vi.fn().mockResolvedValue(undefined),
    updateUserRealActivity: vi.fn().mockResolvedValue(undefined),
    getUnresolvedStockAlertsCount: vi.fn().mockResolvedValue(0),
    getPendingRegistrationRequests: vi.fn().mockResolvedValue([]),
    updateUserOnboarding: vi.fn().mockResolvedValue(undefined),
    updateUserSettings: vi.fn().mockResolvedValue(undefined),
    getUserByEmail: vi.fn(),
  },
}));

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
import { registerAuthCoreRoutes } from '../server/routes/auth-core';
import { storage } from '../server/storage';

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Injects req.user from the test scenario and provides a minimal session with
 * a destroy() callback so the route doesn't crash when it calls session.destroy().
 */
function makeUserMiddleware(sessionUser: Record<string, any>) {
  return (req: any, _res: any, next: any) => {
    req.user = sessionUser;
    req.session = {
      destroy: (cb?: (err: null) => void) => { cb && cb(null); },
    };
    next();
  };
}

function buildApp(sessionUser: Record<string, any>) {
  const app = express();
  app.use(express.json());
  app.use(makeUserMiddleware(sessionUser));
  registerAuthCoreRoutes(app);
  return app;
}

// ── Mock data ─────────────────────────────────────────────────────────────────

const TEAM_MEMBER_DB_USER = {
  id: 'user-tm-1',
  email: 'alice@example.com',
  firstName: 'Alice',
  lastName: 'Smith',
  role: 'team_member',
  wholesalerId: 'user-ws-1',
  businessName: null,
};

const WHOLESALER_DB_USER = {
  id: 'user-ws-1',
  email: 'owner@example.com',
  firstName: 'Bob',
  lastName: 'Jones',
  role: 'wholesaler',
  businessName: 'Bob Wholesale Ltd',
  logoType: null,
  logoUrl: null,
};

const TEAM_MEMBER_RECORD = {
  id: 42,
  email: 'alice@example.com',
  wholesalerId: 'user-ws-1',
  role: 'member',
  status: 'active',
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('GET /api/auth/user — session role validation', () => {

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Scenario 1: Valid team-member session ─────────────────────────────────

  it('returns isTeamMember: true and role: team_member for a valid team-member session', async () => {
    (storage.getUser as ReturnType<typeof vi.fn>)
      .mockImplementation((id: string) => {
        if (id === 'user-tm-1') return Promise.resolve(TEAM_MEMBER_DB_USER);
        if (id === 'user-ws-1') return Promise.resolve(WHOLESALER_DB_USER);
        return Promise.resolve(null);
      });
    (storage.getTeamMembers as ReturnType<typeof vi.fn>).mockResolvedValue([TEAM_MEMBER_RECORD]);

    const app = buildApp({ id: 'user-tm-1', email: 'alice@example.com', role: 'team_member', wholesalerId: 'user-ws-1' });

    const res = await request(app).get('/api/auth/user');

    expect(res.status).toBe(200);
    expect(res.body.isTeamMember).toBe(true);
    expect(res.body.role).toBe('team_member');
  });

  it('includes the correct wholesaler business name in the team-member response', async () => {
    (storage.getUser as ReturnType<typeof vi.fn>)
      .mockImplementation((id: string) => {
        if (id === 'user-tm-1') return Promise.resolve(TEAM_MEMBER_DB_USER);
        if (id === 'user-ws-1') return Promise.resolve(WHOLESALER_DB_USER);
        return Promise.resolve(null);
      });
    (storage.getTeamMembers as ReturnType<typeof vi.fn>).mockResolvedValue([TEAM_MEMBER_RECORD]);

    const app = buildApp({ id: 'user-tm-1', email: 'alice@example.com', role: 'team_member', wholesalerId: 'user-ws-1' });

    const res = await request(app).get('/api/auth/user');

    expect(res.status).toBe(200);
    expect(res.body.businessName).toBe('Bob Wholesale Ltd');
    expect(res.body.teamMemberRole).toBe('member');
  });

  it('returns 401 and destroys the session if the team member record has been removed', async () => {
    (storage.getUser as ReturnType<typeof vi.fn>)
      .mockImplementation((id: string) => {
        if (id === 'user-tm-1') return Promise.resolve(TEAM_MEMBER_DB_USER);
        if (id === 'user-ws-1') return Promise.resolve(WHOLESALER_DB_USER);
        return Promise.resolve(null);
      });
    // No matching team member record — simulates removed access
    (storage.getTeamMembers as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const app = buildApp({ id: 'user-tm-1', email: 'alice@example.com', role: 'team_member', wholesalerId: 'user-ws-1' });

    const res = await request(app).get('/api/auth/user');

    expect(res.status).toBe(401);
    expect(res.body.message).toContain('team access has been removed');
  });

  // ── Scenario 2: Tampered session role ─────────────────────────────────────
  //
  // Attack model: an attacker or stale session has req.user.role = 'wholesaler'
  // for a user whose DB record says role = 'team_member'.  The endpoint must
  // re-read the role from the database rather than trusting the session value.

  it('returns team_member role even when the session claims wholesaler role (DB wins)', async () => {
    (storage.getUser as ReturnType<typeof vi.fn>)
      .mockImplementation((id: string) => {
        if (id === 'user-tm-1') return Promise.resolve(TEAM_MEMBER_DB_USER);
        if (id === 'user-ws-1') return Promise.resolve(WHOLESALER_DB_USER);
        return Promise.resolve(null);
      });
    (storage.getTeamMembers as ReturnType<typeof vi.fn>).mockResolvedValue([TEAM_MEMBER_RECORD]);

    // Session has a forged/stale role of 'wholesaler'
    const app = buildApp({
      id: 'user-tm-1',
      email: 'alice@example.com',
      role: 'wholesaler',          // ← forged / stale
      wholesalerId: 'user-ws-1',
    });

    const res = await request(app).get('/api/auth/user');

    expect(res.status).toBe(200);
    expect(res.body.role).toBe('team_member');
    expect(res.body.isTeamMember).toBe(true);
  });

  it('does not grant wholesaler-level identity when session role is forged', async () => {
    (storage.getUser as ReturnType<typeof vi.fn>)
      .mockImplementation((id: string) => {
        if (id === 'user-tm-1') return Promise.resolve(TEAM_MEMBER_DB_USER);
        if (id === 'user-ws-1') return Promise.resolve(WHOLESALER_DB_USER);
        return Promise.resolve(null);
      });
    (storage.getTeamMembers as ReturnType<typeof vi.fn>).mockResolvedValue([TEAM_MEMBER_RECORD]);

    const app = buildApp({
      id: 'user-tm-1',
      email: 'alice@example.com',
      role: 'wholesaler',
      wholesalerId: 'user-ws-1',
    });

    const res = await request(app).get('/api/auth/user');

    // Must NOT be treated as a full wholesaler
    expect(res.body.role).not.toBe('wholesaler');
    // Must carry the team-member flag
    expect(res.body.isTeamMember).toBe(true);
  });

  // ── Scenario 3: Static analysis — role not sourced from req.body/req.query ─

  it('static: the /api/auth/user handler does not read role from req.body', () => {
    const handlerSource = fs.readFileSync(
      path.resolve(__dirname, '../server/routes/auth-core.ts'),
      'utf8',
    );

    // Isolate just the /api/auth/user handler block.
    // The handler starts just after the route registration line and ends
    // before the next app.* registration.
    const routeStart = handlerSource.indexOf("app.get('/api/auth/user'");
    expect(routeStart).toBeGreaterThan(-1);

    // Find the next route/middleware registration after this handler
    const nextRoute = handlerSource.indexOf('\n  app.', routeStart + 1);
    const handlerBlock = nextRoute === -1
      ? handlerSource.slice(routeStart)
      : handlerSource.slice(routeStart, nextRoute);

    // The handler must not access req.body.role or req.query.role
    expect(handlerBlock).not.toMatch(/req\.body\.role/);
    expect(handlerBlock).not.toMatch(/req\.query\.role/);
  });

  it('static: the /api/auth/user handler does not read role from req.query', () => {
    const handlerSource = fs.readFileSync(
      path.resolve(__dirname, '../server/routes/auth-core.ts'),
      'utf8',
    );

    const routeStart = handlerSource.indexOf("app.get('/api/auth/user'");
    const nextRoute = handlerSource.indexOf('\n  app.', routeStart + 1);
    const handlerBlock = nextRoute === -1
      ? handlerSource.slice(routeStart)
      : handlerSource.slice(routeStart, nextRoute);

    expect(handlerBlock).not.toMatch(/req\.query\.role/);
    // Also confirm it doesn't destructure role from body
    expect(handlerBlock).not.toMatch(/\{\s*[^}]*role[^}]*\}\s*=\s*req\.body/);
    expect(handlerBlock).not.toMatch(/\{\s*[^}]*role[^}]*\}\s*=\s*req\.query/);
  });
});
