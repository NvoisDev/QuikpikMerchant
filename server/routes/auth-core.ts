import type { Express } from "express";
import rateLimit from "express-rate-limit";
import {
  createOrUpdateUser, createResetExpiration, db, emailBadge, emailCard, emailHeading,
  eq, formatPhoneToInternational, generateResetToken, getEmailLogoUrl, getGoogleAuthUrl, getPlanLimits,
  hashPassword, hashResetToken, passwordResetAttempts, recoveryAttempts,
  requireAuth, requireNotViewer, sendEmail, sendPasswordResetEmail,
  sgMail, sql, storage, users, validatePassword, verifyGoogleToken, verifyPassword,
  wrapCustomerEmail, GoogleAuthBlockedError,
} from "./shared";
import { isImpersonating } from "../utils/isImpersonating";
import { resolveWholesalerId } from "../utils/resolveWholesalerId";

const googleOAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many authentication requests from this IP. Please try again later.' },
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts from this IP. Please try again later.' },
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many password reset requests from this IP. Please try again later.' },
});

const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many password reset requests from this IP. Please try again later.' },
});

const signupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many signup attempts from this IP. Please try again later.' },
});

export function registerAuthCoreRoutes(app: Express): void {
  // PUT /api/user/profile
  app.put('/api/user/profile', requireAuth, async (req: any, res) => {
    try {
      const user = req.user;
      const updates = req.body;

      if (updates.orderNumberPrefix !== undefined) {
        if (user.role !== 'wholesaler' && user.role !== 'team_member') {
          return res.status(403).json({ success: false, message: "Only wholesaler accounts can set an order number prefix." });
        }
        const prefix = String(updates.orderNumberPrefix).trim().toUpperCase();
        if (!/^[A-Z]{1,6}$/.test(prefix)) {
          return res.status(400).json({ success: false, message: "Order number prefix must be 1–6 uppercase letters (A–Z) with no spaces or special characters." });
        }
        updates.orderNumberPrefix = prefix;
      }

      if (updates.legalBusinessName !== undefined) {
        if (updates.legalBusinessName === null || updates.legalBusinessName === '') {
          updates.legalBusinessName = null;
        } else {
          const trimmed = String(updates.legalBusinessName).trim();
          if (trimmed.length > 255) {
            return res.status(400).json({ success: false, message: "Legal business name must be 255 characters or fewer." });
          }
          updates.legalBusinessName = trimmed;
        }
      }

      if (updates.vatNumber !== undefined) {
        if (updates.vatNumber === null || updates.vatNumber === '') {
          updates.vatNumber = null;
        } else {
          const trimmed = String(updates.vatNumber).trim();
          if (trimmed.length > 50) {
            return res.status(400).json({ success: false, message: "VAT number must be 50 characters or fewer." });
          }
          updates.vatNumber = trimmed;
        }
      }

      if (updates.companyRegistrationNumber !== undefined) {
        if (updates.companyRegistrationNumber === null || updates.companyRegistrationNumber === '') {
          updates.companyRegistrationNumber = null;
        } else {
          const trimmed = String(updates.companyRegistrationNumber).trim();
          if (trimmed.length > 50) {
            return res.status(400).json({ success: false, message: "Company registration number must be 50 characters or fewer." });
          }
          updates.companyRegistrationNumber = trimmed;
        }
      }

      if (updates.vatEnabled !== undefined) {
        updates.vatEnabled = Boolean(updates.vatEnabled);
      }

      if (updates.vatRate !== undefined) {
        const rate = parseFloat(updates.vatRate);
        if (isNaN(rate) || rate < 0 || rate > 1) {
          return res.status(400).json({ success: false, message: "VAT rate must be a decimal between 0 and 1 (e.g. 0.20 for 20%)." });
        }
        updates.vatRate = rate.toFixed(4);
      }

      if (updates.storeSlug !== undefined) {
        if (updates.storeSlug === null || updates.storeSlug === '') {
          updates.storeSlug = null;
        } else {
          const slug = String(updates.storeSlug).toLowerCase().trim();
          if (!/^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/.test(slug)) {
            return res.status(400).json({ success: false, message: "Store URL must be 3–60 characters using only lowercase letters, numbers and hyphens, and cannot start or end with a hyphen." });
          }
          const reserved = ['admin', 'api', 'customer', 'store', 'welcome', 'super-admin', 'login', 'signup', 'dashboard'];
          if (reserved.includes(slug)) {
            return res.status(400).json({ success: false, message: "That URL is reserved and cannot be used. Please choose a different one." });
          }
          const { db: dbConn } = await import('../db.js');
          const { sql: drizzleSql } = await import('drizzle-orm');
          const existing = await dbConn.execute<{ id: string }>(drizzleSql`SELECT id FROM users WHERE store_slug = ${slug} AND id != ${user.id} LIMIT 1`);
          if (existing.rows.length > 0) {
            return res.status(409).json({ success: false, message: "That store URL is already taken. Please choose a different one." });
          }
          updates.storeSlug = slug;
        }
      }

      if (updates.storeTagline !== undefined) {
        const trimmedTagline = updates.storeTagline == null ? '' : String(updates.storeTagline).trim();
        if (!trimmedTagline) {
          updates.storeTagline = null;
        } else {
          if (trimmedTagline.length > 120) {
            return res.status(400).json({ success: false, message: "Store tagline must be 120 characters or fewer." });
          }
          updates.storeTagline = trimmedTagline;
        }
      }

      await storage.updateUser(user.id, updates);

      res.json({ success: true, message: "Profile updated successfully" });
    } catch (error) {
      console.error('❌ Error updating profile:', error);
      res.status(500).json({ success: false, message: "Failed to update profile" });
    }
  });

  // GET /api/auth/google
  app.get('/api/auth/google', googleOAuthLimiter, (req, res) => {
    try {
      const returnTo = typeof req.query.returnTo === 'string' ? req.query.returnTo : null;
      if (returnTo) {
        req.session!.returnTo = returnTo;
      }
      const authUrl = getGoogleAuthUrl();
      res.json({ authUrl });
    } catch (error) {
      console.error('Error generating Google auth URL:', error);
      res.status(500).json({ error: 'Failed to generate authentication URL' });
    }
  });

  // GET /api/auth/google/callback
  app.get('/api/auth/google/callback', async (req, res) => {
    try {
      const { code, error } = req.query;

      if (error) {
        return res.redirect('/login?error=oauth_denied');
      }

      if (!code || typeof code !== 'string') {
        return res.redirect('/login?error=no_code');
      }

      const googleUser = await verifyGoogleToken(code);

      let user;
      try {
        user = await createOrUpdateUser(googleUser);
      } catch (authErr) {
        if (authErr instanceof GoogleAuthBlockedError) {
          return res.redirect(`/login?error=${authErr.code}`);
        }
        throw authErr;
      }

      if (user.role === 'wholesaler' || user.role === 'admin') {
        const now = new Date();
        await db.update(users).set({ lastLoginAt: now, lastSeenAt: now, lastRealUserActivityAt: now }).where(eq(users.id, user.id));
      }

      const returnTo = req.session?.returnTo;

      req.session.regenerate((regenErr: any) => {
        if (regenErr) {
          console.error('❌ Session regenerate failed after Google auth:', regenErr);
          return res.redirect('/login?error=session_failed');
        }

        req.session!.passport = {
          user: { sub: user.id, email: user.email, claims: user }
        };
        req.session!.userId = user.id;
        req.session!.user = user;

        req.session.save((err: any) => {
          if (err) {
            console.error('❌ Session save failed after Google auth:', err);
            return res.redirect('/login?error=session_failed');
          }

          if (returnTo) {
            return res.redirect(returnTo);
          }

          if (user.isFirstLogin || !user.businessName || user.businessName.includes("'s Business")) {
            res.redirect('/signup-complete');
          } else {
            res.redirect('/dashboard');
          }
        });
      });
    } catch (error: any) {
      console.error('❌ Google auth callback error:', error);
      if (error?.message?.includes('invalid_grant')) {
        res.redirect('/login?error=token_expired');
      } else if (error?.message?.includes('Failed to verify')) {
        res.redirect('/login?error=verification_failed');
      } else {
        res.redirect('/login?error=auth_failed');
      }
    }
  });

  // PUT /api/auth/complete-profile
  app.put('/api/auth/complete-profile', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const {
        businessName, businessDescription, businessPhone, businessType,
        estimatedMonthlyVolume, streetAddress, city, state, postalCode, country,
        preferredCurrency, isFirstLogin, orderNumberPrefix
      } = req.body;

      const updateData: any = {
        isFirstLogin: isFirstLogin || false,
        updatedAt: new Date()
      };

      if (businessName) updateData.businessName = businessName;
      if (businessDescription) updateData.businessDescription = businessDescription;
      if (businessPhone) updateData.businessPhone = businessPhone;
      if (businessType) updateData.businessType = businessType;
      if (estimatedMonthlyVolume) updateData.estimatedMonthlyVolume = estimatedMonthlyVolume;
      if (streetAddress) updateData.streetAddress = streetAddress;
      if (city) updateData.city = city;
      if (state) updateData.state = state;
      if (postalCode) updateData.postalCode = postalCode;
      if (country) updateData.country = country;
      if (preferredCurrency) updateData.defaultCurrency = preferredCurrency;

      if (orderNumberPrefix !== undefined) {
        const prefix = String(orderNumberPrefix).trim().toUpperCase();
        if (!/^[A-Z]{1,6}$/.test(prefix)) {
          return res.status(400).json({ success: false, message: "Order number prefix must be 1–6 uppercase letters (A–Z) with no spaces or special characters." });
        }
        updateData.orderNumberPrefix = prefix;
      }

      const updatedUser = await storage.updateUser(userId, updateData);

      if (!updatedUser) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      req.session!.user = { ...req.user, ...updatedUser, isFirstLogin: false };

      res.json({ success: true, message: 'Profile completed successfully', user: updatedUser });
    } catch (error) {
      console.error('Profile completion error:', error);
      res.status(500).json({ success: false, message: 'Failed to complete profile' });
    }
  });

  // POST /api/auth/recover
  app.post('/api/auth/recover', async (req: any, res) => {
    const clientIP = req.ip || 'unknown';
    const { email } = req.body;
    const timestamp = new Date().toISOString();

    const recoverySecret = process.env.RECOVERY_SECRET;
    const providedSecret = req.headers['x-recovery-secret'];
    if (!recoverySecret || !providedSecret || providedSecret !== recoverySecret) {
      console.warn(`[auth/recover] BLOCKED — missing or invalid secret | ip=${clientIP} email=${email ?? '(none)'} ts=${timestamp}`);
      return res.status(403).json({ error: 'Unauthorized - Contact support for account recovery' });
    }

    const now = Date.now();
    const ipKey = `ip:${clientIP}`;
    const ipEntry = recoveryAttempts.get(ipKey);
    if (ipEntry) {
      if (now - ipEntry.lastAttempt > 3_600_000) {
        ipEntry.count = 0;
      }
      if (ipEntry.count >= 3) {
        console.warn(`[auth/recover] RATE-LIMITED | ip=${clientIP} email=${email ?? '(none)'} ts=${timestamp}`);
        return res.status(429).json({ error: 'Too many recovery attempts. Try again later.' });
      }
    }
    recoveryAttempts.set(ipKey, { count: (ipEntry?.count ?? 0) + 1, lastAttempt: now });

    try {
      if (!email || (email !== 'hello@quikpik.co' && email !== 'mogunjemilua@gmail.com')) {
        console.warn(`[auth/recover] REJECTED — email not on allowlist | ip=${clientIP} email=${email ?? '(none)'} ts=${timestamp}`);
        return res.status(403).json({ error: 'Unauthorized - Contact support for account recovery' });
      }

      const user = await storage.getUserByEmail(email);
      if (!user) {
        console.warn(`[auth/recover] REJECTED — user not found | ip=${clientIP} email=${email} ts=${timestamp}`);
        return res.status(404).json({ error: 'User not found' });
      }

      if (user.role !== 'wholesaler') {
        console.warn(`[auth/recover] REJECTED — non-wholesaler role=${user.role} | ip=${clientIP} email=${email} ts=${timestamp}`);
        return res.status(403).json({ error: 'Access denied - Only wholesaler accounts can be recovered' });
      }

      const sessionUser = {
        id: user.id, email: user.email, firstName: user.firstName,
        lastName: user.lastName, role: user.role, businessName: user.businessName, isTeamMember: false
      };

      req.session!.userId = user.id;
      req.session!.user = sessionUser;

      req.session.save((err: any) => {
        if (err) {
          console.error(`[auth/recover] SESSION SAVE ERROR | ip=${clientIP} email=${email} ts=${timestamp}`, err);
          return res.status(500).json({ error: 'Session save failed' });
        }
        console.info(`[auth/recover] SUCCESS | ip=${clientIP} email=${email} userId=${user.id} ts=${timestamp}`);
        res.json({ success: true, message: 'Authentication recovered', user: { id: user.id, email: user.email } });
      });
    } catch (error) {
      console.error(`[auth/recover] ERROR | ip=${clientIP} email=${email ?? '(none)'} ts=${timestamp}`, error);
      res.status(500).json({ error: 'Recovery failed' });
    }
  });

  // GET /api/auth/user
  app.get('/api/auth/user', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id || req.user.claims?.sub;
      const freshUserData = await storage.getUser(userId);

      let responseUser = freshUserData || req.user;

      if (responseUser.role === 'team_member' && responseUser.wholesalerId) {
        const wholesalerInfo = await storage.getUser(responseUser.wholesalerId);
        const members = await storage.getTeamMembers(responseUser.wholesalerId);
        const member = members.find((m: any) => m.email === responseUser.email);

        if (!member) {
          req.session.destroy(() => {});
          return res.status(401).json({ message: "Your team access has been removed." });
        }

        const teamMemberRole = member?.role ?? 'member';
        if (wholesalerInfo) {
          responseUser = {
            ...responseUser,
            businessName: wholesalerInfo.businessName,
            logoType: wholesalerInfo.logoType,
            logoUrl: wholesalerInfo.logoUrl,
            isTeamMember: true,
            teamMemberRole,
            role: 'team_member'
          };
        }
      }

      res.json(responseUser);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // POST /api/auth/logout
  app.post('/api/auth/logout', (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        console.error('Logout error:', err);
        return res.status(500).json({ error: 'Failed to logout' });
      }
      res.json({ success: true });
    });
  });

  // POST /api/auth/ping
  app.post('/api/auth/ping', requireAuth, async (req: any, res) => {
    try {
      if (isImpersonating(req)) {
        return res.sendStatus(204);
      }

      const userId = req.user.id;
      await storage.updateUserRealActivity(userId);

      if (req.user.role === 'team_member' && req.user.wholesalerId && req.user.email) {
        const member = await storage.getTeamMemberByEmail(req.user.wholesalerId, req.user.email);
        if (member) {
          await storage.updateTeamMemberLastSeen(member.id);
        }
      }

      res.sendStatus(204);
    } catch (error) {
      console.error('Error updating presence ping:', error);
      res.sendStatus(204);
    }
  });

  // PATCH /api/auth/user/onboarding
  app.patch('/api/auth/user/onboarding', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { step, completed, skipped } = req.body;

      const updateData: any = {};
      if (typeof step === 'number') updateData.onboardingStep = step;
      if (typeof completed === 'boolean') updateData.onboardingCompleted = completed;
      if (typeof skipped === 'boolean') updateData.onboardingSkipped = skipped;

      const updatedUser = await storage.updateUserOnboarding(userId, updateData);
      res.json(updatedUser);
    } catch (error) {
      console.error("Error updating onboarding:", error);
      res.status(500).json({ message: "Failed to update onboarding" });
    }
  });

  // PATCH /api/settings
  app.patch('/api/settings', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const updateData = { ...req.body };

      if (updateData.businessPhone) {
        updateData.businessPhone = formatPhoneToInternational(updateData.businessPhone);
      }
      if (updateData.phoneNumber) {
        updateData.phoneNumber = formatPhoneToInternational(updateData.phoneNumber);
      }

      const updatedUser = await storage.updateUserSettings(userId, updateData);

      if (!isImpersonating(req)) {
        storage.updateUserRealActivity(userId).catch(() => {});
      }

      res.json(updatedUser);
    } catch (error: any) {
      console.error("❌ Error updating settings:", error);
      res.status(500).json({ message: "Failed to update settings" });
    }
  });

  // GET /api/user/marketplace-settings
  app.get("/api/user/marketplace-settings", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      res.json({ showPricesToWholesalers: user?.showPricesToWholesalers || false });
    } catch (error) {
      console.error("Error fetching marketplace settings:", error);
      res.status(500).json({ message: "Failed to fetch marketplace settings" });
    }
  });

  // PATCH /api/user/marketplace-settings
  app.patch("/api/user/marketplace-settings", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { showPricesToWholesalers } = req.body;
      await storage.updateUser(userId, { showPricesToWholesalers });
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating marketplace settings:", error);
      res.status(500).json({ message: "Failed to update marketplace settings" });
    }
  });

  // PATCH /api/user/payment-terms
  app.patch('/api/user/payment-terms', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { defaultDepositPercentage, balanceDueDays } = req.body;

      const updateData: { defaultDepositPercentage?: number; balanceDueDays?: number } = {};

      if (defaultDepositPercentage !== undefined) {
        if (![25, 50, 75, 100].includes(defaultDepositPercentage)) {
          return res.status(400).json({ message: "Deposit percentage must be 25, 50, 75, or 100" });
        }
        updateData.defaultDepositPercentage = defaultDepositPercentage;
      }

      if (balanceDueDays !== undefined) {
        if (![0, 7, 14, 30, 60].includes(balanceDueDays)) {
          return res.status(400).json({ message: "Balance due days must be 0, 7, 14, 30, or 60" });
        }
        updateData.balanceDueDays = balanceDueDays;
      }

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ message: "No valid fields to update" });
      }

      const [updatedUser] = await db.update(users)
        .set(updateData)
        .where(eq(users.id, userId))
        .returning();

      res.json({
        success: true,
        user: {
          defaultDepositPercentage: updatedUser.defaultDepositPercentage,
          balanceDueDays: updatedUser.balanceDueDays
        }
      });
    } catch (error) {
      console.error("Error updating payment terms:", error);
      res.status(500).json({ message: "Failed to update payment terms" });
    }
  });

  // PATCH /api/user/onboarding
  app.patch('/api/user/onboarding', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { completed, skipped, step } = req.body;

      const updateData: any = {};

      if (completed !== undefined) {
        updateData.onboardingCompleted = completed;
        updateData.isFirstLogin = false;
      }
      if (skipped !== undefined) {
        updateData.onboardingSkipped = skipped;
        updateData.isFirstLogin = false;
      }
      if (step !== undefined) {
        updateData.onboardingStep = step;
      }

      await storage.updateUserOnboarding(userId, updateData);
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating onboarding:", error);
      res.status(500).json({ message: "Failed to update onboarding status" });
    }
  });

  // POST /api/auth/quick-login
  app.post('/api/auth/quick-login', async (req: any, res) => {
    if (process.env.NODE_ENV !== 'development') {
      return res.status(404).json({ error: "Not found" });
    }
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ error: "Email is required for quick login" });
      }
      const user = await storage.getUserByEmail(email);
      if (user) {
        req.session.userId = user.id;
        req.session.user = user;
        res.json({ success: true, user });
      } else {
        res.status(404).json({ error: 'User not found' });
      }
    } catch (error: any) {
      console.error('❌ Quick login error:', error);
      res.status(500).json({ error: 'Login failed' });
    }
  });

  // GET /api/stock-alerts/count
  app.get('/api/stock-alerts/count', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const count = await storage.getUnresolvedStockAlertsCount(userId);
      res.json({ count });
    } catch (error) {
      console.error("Error fetching stock alerts count:", error);
      res.status(500).json({ message: "Failed to fetch stock alerts count" });
    }
  });

  // GET /api/notifications/count
  app.get('/api/notifications/count', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const [stockAlerts, registrationRequests] = await Promise.all([
        storage.getUnresolvedStockAlertsCount(userId),
        storage.getPendingRegistrationRequests(userId),
      ]);
      const registrationCount = registrationRequests.length;
      res.json({
        total: stockAlerts + registrationCount,
        stockAlerts,
        registrationRequests: registrationCount,
      });
    } catch (error) {
      console.error("Error fetching notifications count:", error);
      res.status(500).json({ message: "Failed to fetch notifications count" });
    }
  });

  // GET /api/settings/order-counter
  app.get('/api/settings/order-counter', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const result = await db.select({
        orderNumberCounter: users.orderNumberCounter,
        orderNumberPrefix: users.orderNumberPrefix,
      }).from(users).where(eq(users.id, userId)).limit(1);
      if (!result[0]) return res.status(404).json({ message: "User not found" });
      res.json({
        counter: result[0].orderNumberCounter ?? 0,
        prefix: result[0].orderNumberPrefix || 'ORD',
      });
    } catch (error) {
      console.error("Error fetching order counter:", error);
      res.status(500).json({ message: "Failed to fetch order counter" });
    }
  });

  // GET /api/settings/notification-preferences
  app.get('/api/settings/notification-preferences', requireAuth, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user) return res.status(404).json({ message: 'User not found' });
      const prefs = (user.notificationPreferences as Record<string, unknown>) || {};
      res.json({
        stockAlertFrequency: prefs.stockAlertFrequency ?? 'daily',
        stockAlertChannel: prefs.stockAlertChannel ?? 'email',
        stockAlertDay: prefs.stockAlertDay ?? 1,
        paymentReminderEnabled: prefs.paymentReminderEnabled !== false,
        paymentReminderChannel: prefs.paymentReminderChannel ?? 'email',
        promotionReminderEnabled: prefs.promotionReminderEnabled !== false,
        promotionReminderChannel: prefs.promotionReminderChannel ?? 'email',
      });
    } catch (error) {
      console.error('Error fetching notification preferences:', error);
      res.status(500).json({ message: 'Failed to fetch notification preferences' });
    }
  });

  // PATCH /api/settings/notification-preferences
  app.patch('/api/settings/notification-preferences', requireAuth, requireNotViewer, async (req: any, res) => {
    try {
      const user = await storage.getUser(req.user.id);
      if (!user) return res.status(404).json({ message: 'User not found' });

      const { stockAlertFrequency, stockAlertChannel, stockAlertDay, paymentReminderEnabled, paymentReminderChannel, promotionReminderEnabled, promotionReminderChannel } = req.body;

      const validFrequencies = ['daily', 'weekly', 'critical_only'];
      const validChannels = ['email', 'sms', 'both', 'off'];

      if (stockAlertFrequency !== undefined && !validFrequencies.includes(stockAlertFrequency)) {
        return res.status(400).json({ message: 'Invalid stockAlertFrequency' });
      }
      if (stockAlertChannel !== undefined && !validChannels.includes(stockAlertChannel)) {
        return res.status(400).json({ message: 'Invalid stockAlertChannel' });
      }
      if (stockAlertDay !== undefined && (typeof stockAlertDay !== 'number' || stockAlertDay < 0 || stockAlertDay > 6)) {
        return res.status(400).json({ message: 'Invalid stockAlertDay (must be 0–6)' });
      }
      if (paymentReminderChannel !== undefined && !validChannels.includes(paymentReminderChannel)) {
        return res.status(400).json({ message: 'Invalid paymentReminderChannel' });
      }
      if (promotionReminderChannel !== undefined && !validChannels.includes(promotionReminderChannel)) {
        return res.status(400).json({ message: 'Invalid promotionReminderChannel' });
      }

      const existing = (user.notificationPreferences as Record<string, unknown>) || {};
      const updated = {
        ...existing,
        ...(stockAlertFrequency !== undefined && { stockAlertFrequency }),
        ...(stockAlertChannel !== undefined && { stockAlertChannel }),
        ...(stockAlertDay !== undefined && { stockAlertDay }),
        ...(paymentReminderEnabled !== undefined && { paymentReminderEnabled: Boolean(paymentReminderEnabled) }),
        ...(paymentReminderChannel !== undefined && { paymentReminderChannel }),
        ...(promotionReminderEnabled !== undefined && { promotionReminderEnabled: Boolean(promotionReminderEnabled) }),
        ...(promotionReminderChannel !== undefined && { promotionReminderChannel }),
      };

      await storage.updateUserSettings(req.user.id, { notificationPreferences: updated });
      res.json({ success: true, preferences: updated });
    } catch (error) {
      console.error('Error saving notification preferences:', error);
      res.status(500).json({ message: 'Failed to save notification preferences' });
    }
  });

  // PATCH /api/settings/default-low-stock-threshold
  app.patch('/api/settings/default-low-stock-threshold', requireAuth, requireNotViewer, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { threshold } = req.body;

      if (!threshold || threshold < 0) {
        return res.status(400).json({ message: "Valid threshold required" });
      }

      await storage.updateDefaultLowStockThreshold(userId, parseInt(threshold));
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating default threshold:", error);
      res.status(500).json({ message: "Failed to update default threshold" });
    }
  });

  // GET /api/owner-profile
  app.get('/api/owner-profile', requireAuth, async (req: any, res) => {
    try {
      const ownerId = resolveWholesalerId(req);
      const owner = await storage.getUser(ownerId);
      if (!owner) return res.status(404).json({ message: 'Owner not found' });
      res.json({
        firstName: owner.firstName,
        lastName: owner.lastName,
        email: owner.email,
        businessName: owner.businessName,
        lastSeenAt: owner.lastSeenAt ?? null,
      });
    } catch (error) {
      console.error('Error fetching owner profile:', error);
      res.status(500).json({ message: 'Failed to fetch owner profile' });
    }
  });

  // POST /api/auth/login
  app.post('/api/auth/login', loginLimiter, async (req: any, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }

      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      const teamMembersList = await storage.getAllTeamMembers();
      const teamMember = teamMembersList.find((tm: any) => tm.email.toLowerCase() === email.toLowerCase());

      if (teamMember) {
        if (teamMember.status === 'suspended') {
          return res.status(403).json({ message: "Your account has been suspended. Please contact your team administrator." });
        }

        const authenticatedUser = await storage.authenticateUser(email, password);
        if (!authenticatedUser) {
          return res.status(401).json({ message: "Invalid email or password" });
        }

        const wholesalerInfo = await storage.getUser(teamMember.wholesalerId);

        if (teamMember.id) {
          await storage.updateTeamMemberLastLogin(teamMember.id);
        }
        {
          const now = new Date();
          await db.update(users).set({ lastLoginAt: now, lastSeenAt: now, lastRealUserActivityAt: now }).where(eq(users.id, user.id));
        }

        await new Promise<void>((resolve, reject) => {
          req.session.regenerate((err: any) => { if (err) reject(err); else resolve(); });
        });

        req.session.user = {
          id: user.id, email: user.email, firstName: user.firstName,
          lastName: user.lastName, role: 'team_member',
          businessName: wholesalerInfo?.businessName || user.businessName,
          isTeamMember: true, wholesalerId: teamMember.wholesalerId
        };

        return res.json({
          success: true, message: "Login successful",
          user: {
            id: user.id, email: user.email, firstName: user.firstName,
            lastName: user.lastName, role: 'team_member',
            businessName: wholesalerInfo?.businessName || user.businessName, isTeamMember: true
          }
        });
      }

      if (user.subscriptionTier === 'team_member') {
        return res.status(401).json({ message: "Please use the Team Member tab to sign in" });
      }

      const authenticatedUser = await storage.authenticateUser(email, password);
      if (!authenticatedUser) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      {
        const now = new Date();
        await db.update(users).set({ lastLoginAt: now, lastSeenAt: now, lastRealUserActivityAt: now }).where(eq(users.id, authenticatedUser.id));
      }

      await new Promise<void>((resolve, reject) => {
        req.session.regenerate((err: any) => { if (err) reject(err); else resolve(); });
      });

      req.session.user = {
        id: user.id, email: user.email, firstName: user.firstName,
        lastName: user.lastName, role: user.role,
        businessName: user.businessName, isTeamMember: false
      };

      res.json({
        success: true, message: "Login successful",
        user: {
          id: user.id, email: user.email, firstName: user.firstName,
          lastName: user.lastName, role: user.role, businessName: user.businessName
        }
      });
    } catch (error) {
      console.error("Business owner login error:", error);
      res.status(500).json({ message: "Login failed. Please try again." });
    }
  });

  // POST /api/auth/signup
  app.post('/api/auth/signup', signupLimiter, async (req, res) => {
    const signupLogId = `signup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      const {
        firstName, lastName, email, password, businessName, businessDescription,
        businessPhone, businessEmail, streetAddress, city, state, postalCode, country,
        defaultCurrency, businessType, estimatedMonthlyVolume
      } = req.body;

      if (!email || !password || !firstName || !lastName) {
        return res.status(400).json({
          message: "Email, password, first name, and last name are required",
          field: "validation"
        });
      }

      const passwordValidation = validatePassword(password);
      if (!passwordValidation.isStrong) {
        return res.status(400).json({
          message: "Password does not meet security requirements",
          field: "password",
          errors: passwordValidation.messages
        });
      }

      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ message: "An account with this email already exists", field: "email" });
      }

      const businessAddress = streetAddress && city ? `${streetAddress}, ${city}, ${state} ${postalCode}, ${country}` : '';
      const userId = `signup_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const userData = {
        id: userId, email, firstName, lastName, role: 'wholesaler',
        businessName, businessDescription, businessPhone, businessEmail,
        businessAddress, preferredCurrency: defaultCurrency, defaultCurrency,
        businessType, estimatedMonthlyVolume,
        onboardingCompleted: false, onboardingStep: 0, onboardingSkipped: false,
        isFirstLogin: true, productLimit: 2
      };

      const newUser = await storage.createUserWithPassword(userData, password);

      req.session!.user = {
        id: newUser.id, email: newUser.email, firstName: newUser.firstName,
        lastName: newUser.lastName, role: newUser.role, businessName: newUser.businessName
      };
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => { if (err) { reject(err); return; } resolve(); });
      });

      res.json({
        success: true, message: "Account created successfully",
        user: {
          id: newUser.id, email: newUser.email, firstName: newUser.firstName,
          lastName: newUser.lastName, role: newUser.role, businessName: newUser.businessName
        }
      });
    } catch (error) {
      console.error(`[${signupLogId}] Signup error:`, { timestamp: new Date().toISOString(), error });
      res.status(500).json({ message: "Failed to create account. Please try again." });
    }
  });

  // POST /api/auth/forgot-password
  app.post('/api/auth/forgot-password', forgotPasswordLimiter, async (req, res) => {
    try {
      const { email } = req.body;
      const clientIP = req.ip || req.connection.remoteAddress || 'unknown';

      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }

      const now = Date.now();
      const emailKey = `email:${email}`;
      const ipKey = `ip:${clientIP}`;

      const emailAttempts = passwordResetAttempts.get(emailKey);
      if (emailAttempts) {
        if (now - emailAttempts.lastAttempt > 3600000) {
          emailAttempts.count = 0;
        }
        if (emailAttempts.count >= 5) {
          return res.status(429).json({ error: "Too many password reset requests for this email. Please try again later." });
        }
      }

      const ipAttempts = passwordResetAttempts.get(ipKey);
      if (ipAttempts) {
        if (now - ipAttempts.lastAttempt > 3600000) {
          ipAttempts.count = 0;
        }
        if (ipAttempts.count >= 10) {
          return res.status(429).json({ error: "Too many password reset requests from this IP. Please try again later." });
        }
      }

      passwordResetAttempts.set(emailKey, { count: (emailAttempts?.count || 0) + 1, lastAttempt: now });
      passwordResetAttempts.set(ipKey, { count: (ipAttempts?.count || 0) + 1, lastAttempt: now });

      const user = await storage.getUserByEmail(email);

      if (!user) {
        return res.json({ success: true, message: "If an account with that email exists, we've sent a password reset link." });
      }

      const { token, hashedToken } = generateResetToken();
      const expiresAt = createResetExpiration();

      await storage.setPasswordResetToken(email, hashedToken, expiresAt);
      await sendPasswordResetEmail(email as string, token as string, (user.firstName as string | null) ?? "", { businessName: user.businessName ?? undefined, logoUrl: getEmailLogoUrl(user.id, user.logoType ?? undefined, user.logoUrl ?? undefined) });

      res.json({ success: true, message: "If an account with that email exists, we've sent a password reset link." });
    } catch (error: any) {
      console.error('Password reset request error:', error);
      res.status(500).json({ error: "Failed to process password reset request" });
    }
  });

  // GET /api/auth/reset-password/:token
  app.get('/api/auth/reset-password/:token', async (req, res) => {
    try {
      const { token } = req.params;

      if (!token) {
        return res.status(400).json({ error: "Reset token is required" });
      }

      const hashedToken = hashResetToken(token);
      const user = await storage.validatePasswordResetToken(hashedToken);

      if (!user) {
        return res.status(400).json({ error: "Invalid or expired reset token" });
      }

      res.json({ success: true, message: "Valid reset token", email: user.email });
    } catch (error) {
      console.error('Password reset token validation error:', error);
      res.status(500).json({ error: "Failed to validate reset token" });
    }
  });

  // POST /api/auth/reset-password
  app.post('/api/auth/reset-password', resetPasswordLimiter, async (req, res) => {
    try {
      const { token, password } = req.body;

      if (!token || !password) {
        return res.status(400).json({ error: "Token and new password are required" });
      }

      const validation = validatePassword(password);
      if (!validation.isStrong) {
        return res.status(400).json({ error: "Password does not meet security requirements", messages: validation.messages });
      }

      const hashedToken = hashResetToken(token);
      const user = await storage.resetPasswordWithToken(hashedToken, password);

      if (!user) {
        return res.status(400).json({ error: "Invalid or expired reset token" });
      }

      res.json({ success: true, message: "Password has been reset successfully. You can now log in with your new password." });
    } catch (error) {
      console.error('Password reset error:', error);
      res.status(500).json({ error: "Failed to reset password" });
    }
  });
}
