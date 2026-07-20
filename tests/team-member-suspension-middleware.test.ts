/**
 * Static tests confirming that requireAuth blocks suspended team members
 * from using an existing authenticated session.
 *
 * The tests mount a minimal Express app with a stubbed requireAuth that
 * replicates the real suspension-check logic, so they verify the code path
 * without needing a live database.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

// ── Mocks (must be hoisted before any imports that load these modules) ────────

const { mockGetTeamMembers } = vi.hoisted(() => ({
  mockGetTeamMembers: vi.fn(),
}));

vi.mock('../server/db', () => ({
  db: { update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn() })) })) },
  pool: {},
}));

vi.mock('../server/storage', () => ({
  storage: {
    getUser: vi.fn(),
    getTeamMembers: mockGetTeamMembers,
    updateUser: vi.fn(),
    getAllTeamMembers: vi.fn(),
    getTeamMembersCount: vi.fn(),
    updateTeamMemberLastLogin: vi.fn(),
    getTabPermissions: vi.fn().mockResolvedValue({}),
    checkTabAccess: vi.fn().mockResolvedValue(true),
    authenticateUser: vi.fn(),
    getUserByEmail: vi.fn(),
  },
}));

vi.mock('../server/replitAuth', () => ({
  setupAuth: vi.fn(),
  isAuthenticated: vi.fn((_req: any, _res: any, next: any) => next()),
}));
vi.mock('../server/ai', () => ({ generateProductDescription: vi.fn(), generateProductImage: vi.fn() }));
vi.mock('../server/ai-taglines', () => ({
  generatePersonalizedTagline: vi.fn(),
  generateCampaignSuggestions: vi.fn(),
  optimizeMessageTiming: vi.fn(),
}));
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
vi.mock('../server/email-verification', () => ({
  createEmailVerification: vi.fn(),
  verifyEmailCode: vi.fn(),
}));
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
vi.mock('../server/middleware/performance', () => ({
  performanceMiddleware: vi.fn((_req: any, _res: any, next: any) => next()),
}));
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
  const inst = {
    single: vi.fn(() => (_req: any, _res: any, next: any) => next()),
    array: vi.fn(() => (_req: any, _res: any, next: any) => next()),
  };
  const fn: any = vi.fn(() => inst);
  fn.memoryStorage = vi.fn(() => ({}));
  fn.diskStorage = vi.fn(() => ({}));
  return { default: fn };
});
vi.mock('sharp', () => ({ default: vi.fn() }));
vi.mock('compression', () => ({ default: vi.fn(() => (_req: any, _res: any, next: any) => next()) }));
vi.mock('cookie-parser', () => ({ default: vi.fn(() => (_req: any, _res: any, next: any) => next()) }));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import request from 'supertest';
import express from 'express';
import { storage } from '../server/storage';
import { requireAuth } from '../server/googleAuth';

// ── Helpers ───────────────────────────────────────────────────────────────────

const ACTIVE_TEAM_MEMBER_USER = {
  id: 'tm-user-1',
  email: 'alice@example.com',
  role: 'team_member',
  wholesalerId: 'ws-1',
  archived: false,
};

const SUSPENDED_TEAM_MEMBER_RECORD = {
  id: 10,
  email: 'alice@example.com',
  wholesalerId: 'ws-1',
  role: 'member',
  status: 'suspended',
};

const ACTIVE_TEAM_MEMBER_RECORD = {
  id: 10,
  email: 'alice@example.com',
  wholesalerId: 'ws-1',
  role: 'member',
  status: 'active',
};

/** Builds a minimal app with a protected sentinel route using the real requireAuth. */
function buildApp(sessionUser: any) {
  const app = express();
  app.use(express.json());

  app.use((req: any, _res: any, next: any) => {
    req.session = {
      user: sessionUser,
      destroy: (cb: () => void) => cb?.(),
    };
    next();
  });

  app.get('/api/test-protected', requireAuth, (_req: any, res: any) => {
    res.json({ ok: true });
  });

  return app;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('requireAuth — suspended team member session enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (storage.getUser as ReturnType<typeof vi.fn>).mockResolvedValue(ACTIVE_TEAM_MEMBER_USER);
  });

  it('returns 403 with error account_suspended when team member status is suspended', async () => {
    mockGetTeamMembers.mockResolvedValue([SUSPENDED_TEAM_MEMBER_RECORD]);

    const app = buildApp(ACTIVE_TEAM_MEMBER_USER);
    const res = await request(app).get('/api/test-protected');

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('account_suspended');
  });

  it('includes a human-readable message when team member is suspended', async () => {
    mockGetTeamMembers.mockResolvedValue([SUSPENDED_TEAM_MEMBER_RECORD]);

    const app = buildApp(ACTIVE_TEAM_MEMBER_USER);
    const res = await request(app).get('/api/test-protected');

    expect(res.body.message).toBeTruthy();
    expect(res.body.message.toLowerCase()).toContain('suspend');
  });

  it('does NOT call next() when team member is suspended', async () => {
    mockGetTeamMembers.mockResolvedValue([SUSPENDED_TEAM_MEMBER_RECORD]);

    const app = buildApp(ACTIVE_TEAM_MEMBER_USER);
    const res = await request(app).get('/api/test-protected');

    expect(res.body.ok).toBeUndefined();
  });

  it('allows an active team member through (returns 200)', async () => {
    mockGetTeamMembers.mockResolvedValue([ACTIVE_TEAM_MEMBER_RECORD]);

    const app = buildApp(ACTIVE_TEAM_MEMBER_USER);
    const res = await request(app).get('/api/test-protected');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('enriches teamMemberRole on the request for active members', async () => {
    mockGetTeamMembers.mockResolvedValue([{ ...ACTIVE_TEAM_MEMBER_RECORD, role: 'admin' }]);

    let capturedRole: string | undefined;
    const app = buildApp(ACTIVE_TEAM_MEMBER_USER);
    app.get('/api/test-role', requireAuth, (req: any, res: any) => {
      capturedRole = req.user.teamMemberRole;
      res.json({ role: capturedRole });
    });

    await request(app).get('/api/test-role');
    expect(capturedRole).toBe('admin');
  });
});
