import type { Express } from "express";
import {
  ReliableSMSService, and, createEmailVerification, customerRegistrationRequests, db, desc,
  emailButton, emailCard, emailHeading, eq, getEmailLogoUrl, gt, multiWholesalerService, or,
  parseCustomerName, requireAuth, requireNotViewer, sendEmail, sendWelcomeMessages,
  smsVerificationCodes, sql, storage, users, verifyEmailCode, wholesalerCustomerRelationships,
  wrapCustomerEmail
} from "./shared";
import { formatPhoneToInternational, isValidMobile } from "../../shared/phone-utils";
import { signCustomerCookie, parseCustomerCookie, COOKIE_OPTIONS, renewCustomerCookieIfNeeded } from "../utils/customer-auth-cookie";

// ─── Shared session helper ───────────────────────────────────────────────────
async function buildAndSaveCustomerSession(req: any, res: any, customer: any, wholesalerId: string) {
  const sessionData = {
    customerId: customer.id,
    wholesalerId,
    name: customer.name,
    email: customer.email || '',
    phone: customer.phone || '',
    groupId: customer.groupId || null,
    groupName: customer.groupName || '',
    authenticatedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  };

  if (!req.session) req.session = {} as any;
  (req.session as any).customerAuth = sessionData;

  await new Promise<void>((resolve) => {
    if (req.session && typeof req.session.save === 'function') {
      req.session.save((err: any) => {
        if (err) console.error('❌ Session save error:', err);
        resolve();
      });
    } else resolve();
  });

  res.cookie('customer_auth', signCustomerCookie({
    customerId: customer.id,
    wholesalerId,
    name: customer.name,
    email: customer.email || '',
    phone: customer.phone || '',
    groupId: customer.groupId || null,
    groupName: customer.groupName || '',
    timestamp: Date.now(),
    expires: Date.now() + 30 * 24 * 60 * 60 * 1000,
  }), COOKIE_OPTIONS);
}

export function registerCustomerAuthRoutes(app: Express): void {

  // ─── Rolling-session renewal middleware ──────────────────────────────────
  // Runs on every request handled by routes registered after this point.
  // registerCustomerAuthRoutes() is called early in routes.ts (before orders,
  // marketplace, addresses, etc.), so this covers all customer-facing routes.
  // If new routes are ever registered before registerCustomerAuthRoutes(), they
  // will not benefit from auto-renewal — keep registration order in mind.
  //
  // If the customer_auth cookie is valid and has less than 15 days of TTL
  // remaining (>50% elapsed), a fresh 30-day cookie is issued transparently so
  // active customers are never abruptly logged out.
  app.use((req: any, res: any, next: any) => {
    const parsed = parseCustomerCookie(req.cookies?.customer_auth);
    if (parsed) {
      renewCustomerCookieIfNeeded(parsed, res);
    }
    next();
  });

  // ─── NEW FLOW: Phone OTP (wholesaler-agnostic) ───────────────────────────

  // POST /api/customer-auth/request-phone-otp
  app.post('/api/customer-auth/request-phone-otp', async (req, res) => {
    try {
      const { phoneNumber } = req.body;
      if (!phoneNumber || typeof phoneNumber !== 'string' || phoneNumber.trim().length < 7) {
        return res.status(400).json({ error: 'A valid phone number is required' });
      }

      const normalised = formatPhoneToInternational(phoneNumber.trim());
      if (!isValidMobile(normalised)) {
        return res.status(400).json({ error: 'Please enter a valid mobile number including the country code (e.g. +44 7700 900000 or +353 87 123 4567)' });
      }

      // Rate limit: 1 OTP per 2 minutes per number
      const recent = await storage.getRecentPhoneVerification(normalised, 2);
      if (recent) {
        return res.json({ success: true, throttled: true, message: 'An OTP was sent recently. Please check your messages or wait 2 minutes.' });
      }

      const code = ReliableSMSService.generateVerificationCode();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
      const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || '';

      await storage.createPhoneVerification(normalised, code, expiresAt, ipAddress);

      const smsResult = await ReliableSMSService.sendVerificationSMS(normalised, code, 'Quikpik', '');
      console.log(`📱 Phone OTP send result for ${normalised}:`, smsResult);

      if (smsResult.success || process.env.NODE_ENV === 'development') {
        return res.json({
          success: true,
          message: 'Verification code sent',
          ...(process.env.NODE_ENV === 'development' ? { debugCode: code } : {})
        });
      }
      return res.status(500).json({ error: 'Failed to send SMS. Please try again.' });
    } catch (error) {
      console.error('request-phone-otp error:', error);
      return res.status(500).json({ error: 'Failed to send verification code' });
    }
  });

  // POST /api/customer-auth/verify-phone-otp
  app.post('/api/customer-auth/verify-phone-otp', async (req, res) => {
    try {
      const { phoneNumber, code } = req.body;
      if (!phoneNumber || !code) {
        return res.status(400).json({ error: 'Phone number and code are required' });
      }

      const normalised = formatPhoneToInternational(phoneNumber.trim());
      if (!isValidMobile(normalised)) {
        return res.status(400).json({ error: 'Please enter a valid mobile number including the country code (e.g. +44 7700 900000 or +353 87 123 4567)' });
      }
      const trimmedCode = code.trim();

      // Fetch the most recent verification record for this phone (regardless of code)
      const record = await storage.getLatestPendingPhoneVerification(normalised);

      if (!record) {
        return res.status(401).json({ error: 'No pending verification found. Please request a new code.' });
      }

      // Check attempt limit first (before incrementing for this failure)
      if (record.attempts >= 5) {
        return res.status(401).json({ error: 'Too many failed attempts. Please request a new code.' });
      }

      // Check if already used
      if (record.isUsed) {
        return res.status(401).json({ error: 'This code has already been used. Please request a new one.' });
      }

      // Check expiry
      if (new Date() > record.expiresAt) {
        return res.status(401).json({ error: 'Verification code has expired. Please request a new one.' });
      }

      // Compare codes — increment attempts on any mismatch
      if (record.code !== trimmedCode) {
        await storage.incrementPhoneVerificationAttempts(record.id);
        const remaining = 5 - (record.attempts + 1);
        return res.status(401).json({
          error: remaining > 0
            ? `Invalid code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
            : 'Invalid code. No more attempts — please request a new code.',
        });
      }

      // Code is correct — mark as used
      await storage.markPhoneVerificationUsed(record.id);

      // Store a short-lived session nonce to prove OTP was completed.
      // The nonce includes the code itself so complete-phone-login can bind to
      // this specific session — preventing cross-session auth bypass.
      const sessionAny = req.session as any;
      sessionAny.verifiedPhone = normalised;
      sessionAny.verifiedCode = trimmedCode; // bound to this session
      sessionAny.verifiedPhoneExpiry = Date.now() + 10 * 60 * 1000; // 10-minute window
      await new Promise<void>((resolve) => {
        if (req.session && typeof req.session.save === 'function') {
          req.session.save((err: any) => {
            if (err) console.error('❌ Session save error (nonce):', err);
            resolve();
          });
        } else resolve();
      });

      // Find all wholesalers linked to this phone
      const wholesalers = await storage.findCustomersByPhone(normalised);
      console.log(`✅ Phone OTP verified for ${normalised} — ${wholesalers.length} wholesaler(s) found`);

      if (wholesalers.length === 0) {
        return res.json({ success: true, noWholesalers: true, wholesalers: [] });
      }

      return res.json({ success: true, wholesalers });
    } catch (error) {
      console.error('verify-phone-otp error:', error);
      return res.status(500).json({ error: 'Verification failed' });
    }
  });

  // POST /api/customer-auth/complete-phone-login
  // Called after OTP is verified and a wholesaler is selected.
  // Requires { phoneNumber, code, wholesalerId }. The code is matched against
  // the session nonce stored by verify-phone-otp, binding the request to
  // the same session that completed OTP and preventing cross-session auth bypass.
  app.post('/api/customer-auth/complete-phone-login', async (req, res) => {
    try {
      const { phoneNumber, code, wholesalerId } = req.body;
      if (!phoneNumber || !code || !wholesalerId) {
        return res.status(400).json({ error: 'Phone number, code, and wholesaler ID are required' });
      }

      const normalised = formatPhoneToInternational(phoneNumber.trim());
      if (!isValidMobile(normalised)) {
        return res.status(400).json({ error: 'Please enter a valid mobile number including the country code (e.g. +44 7700 900000 or +353 87 123 4567)' });
      }
      const trimmedCode = String(code).trim();

      // Validate OTP proof via session nonce — session-bound, prevents cross-session bypass.
      // The nonce stores verifiedPhone + verifiedCode + expiry set by verify-phone-otp.
      const sessionAny = req.session as any;
      const sessionNonceValid =
        sessionAny?.verifiedPhone === normalised &&
        sessionAny?.verifiedCode === trimmedCode &&
        sessionAny?.verifiedPhoneExpiry &&
        Date.now() < sessionAny.verifiedPhoneExpiry;

      if (!sessionNonceValid) {
        return res.status(403).json({ error: 'Phone verification required or expired. Please verify your code first.' });
      }

      // Find the customer record for this phone + wholesaler combination
      const matches = await storage.findCustomersByPhone(normalised);
      const match = matches.find(m => m.wholesalerId === wholesalerId);

      if (!match) {
        return res.status(403).json({ error: 'No access to the selected wholesaler' });
      }

      if (match.status === 'pending') {
        return res.status(403).json({ error: 'Your access request is still pending approval from this wholesaler.' });
      }

      // Fetch full customer record
      const customerRecord = await storage.getUser(match.customerId!);
      if (!customerRecord) {
        return res.status(404).json({ error: 'Customer record not found' });
      }

      const customerName = `${customerRecord.firstName || ''} ${customerRecord.lastName || ''}`.trim() || customerRecord.businessName || 'Customer';

      // Look up group membership
      let groupId: string | null = null;
      let groupName = '';
      try {
        const groupRows = await db.execute(sql`
          SELECT cgm.group_id as group_id, cg.name as group_name
          FROM customer_group_members cgm
          INNER JOIN customer_groups cg ON cgm.group_id = cg.id AND cg.wholesaler_id = ${wholesalerId}
          WHERE cgm.customer_id = ${match.customerId}
          LIMIT 1
        `);
        if (groupRows.rows.length > 0) {
          const row = groupRows.rows[0] as any;
          groupId = row.group_id ? String(row.group_id) : null;
          groupName = row.group_name || '';
        }
      } catch (groupErr) {
        console.warn('⚠️ Could not fetch group info:', groupErr);
      }

      const customer = {
        id: match.customerId,
        name: customerName,
        email: customerRecord.email || '',
        phone: customerRecord.phoneNumber || normalised,
        groupId,
        groupName,
      };

      // Clear the full OTP nonce before creating the full session
      sessionAny.verifiedPhone = undefined;
      sessionAny.verifiedCode = undefined;
      sessionAny.verifiedPhoneExpiry = undefined;

      // Stamp login time on the customer record — real login, always update all three fields
      if (match.customerId) {
        const now = new Date();
        await db.update(users)
          .set({ lastLoginAt: now, lastSeenAt: now, lastRealUserActivityAt: now })
          .where(eq(users.id, match.customerId));
      }

      await buildAndSaveCustomerSession(req, res, customer, wholesalerId);
      console.log(`🔐 Phone-OTP session created for ${customerName} → wholesaler ${wholesalerId}`);

      return res.json({
        success: true,
        customer: {
          id: customer.id,
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
          groupId: customer.groupId,
          groupName: customer.groupName,
        }
      });
    } catch (error) {
      console.error('complete-phone-login error:', error);
      return res.status(500).json({ error: 'Login failed' });
    }
  });

  // POST /api/customer-auth/general-enquiry
  // Accepts a general "I want wholesale access" enquiry when no specific wholesaler is known.
  // Sends notification to platform admins without requiring a wholesalerId in the DB.
  app.post('/api/customer-auth/general-enquiry', async (req, res) => {
    try {
      const { phoneNumber, name, email, businessName, message } = req.body;
      if (!phoneNumber || !name) {
        return res.status(400).json({ error: 'Name and phone number are required' });
      }

      console.log('📋 General wholesale enquiry received:', { name, phoneNumber: phoneNumber.slice(-4) + '****' });

      // Send email notification to platform admin
      try {
        const adminEmail = process.env.ADMIN_EMAIL || 'hello@quikpik.co';
        const body = `${emailHeading('New Wholesale Enquiry', { size: '22px', color: '#10b981' })}
          <p style="margin:0 0 20px">A new customer has requested wholesale access via the login page.</p>
          ${emailCard(
            `${emailHeading('Enquiry Details', { size: '16px' })}
             <p style="margin:0 0 6px"><strong>Name:</strong> ${name}</p>
             <p style="margin:0 0 6px"><strong>Phone:</strong> ${phoneNumber}</p>
             <p style="margin:0 0 6px"><strong>Email:</strong> ${email || 'Not provided'}</p>
             <p style="margin:0 0 6px"><strong>Business:</strong> ${businessName || 'Not provided'}</p>
             ${message ? `<p style="margin:0 0 6px"><strong>Message:</strong> ${message}</p>` : ''}`,
            { borderColor: '#dbeafe', bgColor: '#eff6ff' }
          )}`;

        await sendEmail({
          to: adminEmail,
          from: 'hello@quikpik.co',
          subject: `New Wholesale Enquiry — ${name}`,
          html: wrapCustomerEmail(body, { businessName: 'Quikpik', logoUrl: null }, { preheader: `Wholesale enquiry from ${name}` }),
        });
      } catch (emailErr) {
        console.warn('⚠️ Could not send enquiry notification email:', emailErr);
      }

      return res.json({ success: true, message: "Your enquiry has been received. We'll be in touch soon." });
    } catch (error) {
      console.error('general-enquiry error:', error);
      return res.status(500).json({ error: 'Failed to submit enquiry' });
    }
  });

  // GET /api/customer-auth/check-session
  // Wholesaler-agnostic session check. Returns {authenticated, wholesalerId} from current cookie.
  app.get('/api/customer-auth/check-session', async (req, res) => {
    try {
      // Try session-based auth
      const sessionAny = req.session as any;
      if (sessionAny?.customerAuth?.wholesalerId && sessionAny?.customerAuth?.customerId) {
        const expiry = sessionAny.customerAuth.expiresAt ? new Date(sessionAny.customerAuth.expiresAt) : null;
        if (!expiry || expiry > new Date()) {
          return res.json({ authenticated: true, wholesalerId: sessionAny.customerAuth.wholesalerId });
        }
      }
      // Try cookie-based auth
      const parsed = parseCustomerCookie(req.cookies?.customer_auth);
      if (parsed?.wholesalerId) {
        return res.json({ authenticated: true, wholesalerId: parsed.wholesalerId });
      }
      return res.json({ authenticated: false });
    } catch (err) {
      console.error('check-session error:', err);
      return res.json({ authenticated: false });
    }
  });

  // ─── LEGACY ENDPOINTS (deprecated — kept for backward compat) ────────────

  // POST /api/customer-auth/verify
  // @deprecated — replaced by /request-phone-otp + /verify-phone-otp + /complete-phone-login
  app.post('/api/customer-auth/verify', async (req, res) => {
    console.warn('⚠️  DEPRECATED: /api/customer-auth/verify — use phone-OTP endpoints instead');
    try {
      const { wholesalerId, lastFourDigits } = req.body;
      
      if (!wholesalerId || !lastFourDigits) {
        return res.status(400).json({ error: "Wholesaler ID and last four digits are required" });
      }

      // Find customer by last 4 digits in wholesaler's groups
      const customer = await storage.findCustomerByLastFourDigits(wholesalerId, lastFourDigits);
      
      if (!customer) {
        return res.status(401).json({ error: "Customer not found" });
      }

      res.json({
        success: true,
        customer: {
          id: customer.id,
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
          groupId: customer.groupId,
          groupName: customer.groupName
        }
      });
    } catch (error) {
      console.error("Customer verification error:", error);
      res.status(500).json({ error: "Customer verification failed" });
    }
  });

  // POST /api/customer-auth/request-sms
  // @deprecated — replaced by /request-phone-otp
  app.post('/api/customer-auth/request-sms', async (req, res) => {
    console.warn('⚠️  DEPRECATED: /api/customer-auth/request-sms — use /request-phone-otp instead');
    try {
      const { wholesalerId, lastFourDigits } = req.body;
      
      if (!wholesalerId || !lastFourDigits) {
        return res.status(400).json({ error: "Wholesaler ID and last four digits are required" });
      }

      // Find customer by last 4 digits
      let customer;
      try {
        customer = await storage.findCustomerByLastFourDigits(wholesalerId, lastFourDigits);
      } catch (error: any) {
        // Handle security error when multiple customers share same last 4 digits
        if (error.message.includes('Multiple customers found with same phone number suffix')) {
          return res.status(400).json({ 
            error: "Multiple customers found with the same phone number ending. Please contact support for assistance.",
            securityIssue: true
          });
        }
        throw error; // Re-throw other errors
      }
      
      if (!customer) {
        return res.status(401).json({ error: "Customer not found" });
      }

      // CRITICAL FIX: Check for recent SMS codes to prevent spam
      const recentCodes = await db
        .select()
        .from(smsVerificationCodes)
        .where(
          and(
            eq(smsVerificationCodes.customerId, customer.id),
            eq(smsVerificationCodes.isUsed, false),
            gt(smsVerificationCodes.createdAt, new Date(Date.now() - 2 * 60 * 1000)) // Last 2 minutes
          )
        )
        .orderBy(desc(smsVerificationCodes.createdAt))
        .limit(1);

      if (recentCodes.length > 0) {
        console.log(`🚫 SMS throttling: Recent code exists for ${customer.name}, not sending new SMS`);
        return res.json({ 
          success: true, 
          message: "SMS verification code already sent recently. Please check your messages or wait 2 minutes.",
          throttled: true
        });
      }

      console.log("Customer found for SMS:", customer);

      // Get wholesaler info for business name
      const wholesaler = await storage.getWholesalerProfile(wholesalerId);
      
      // Generate and send SMS code
      const code = ReliableSMSService.generateVerificationCode();
      console.log(`🔄 Generated verification code: ${code}`);
      const result = await ReliableSMSService.sendVerificationSMS(customer.phone, code, wholesaler?.businessName || 'Business', wholesalerId);
      console.log(`📋 SMS service result:`, result);
      
      // Always store verification code in database, regardless of SMS success
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes from now
      const smsData = {
        customerId: customer.id,
        wholesalerId: wholesalerId,
        code: code, // Use the generated code directly
        phoneNumber: customer.phone,
        expiresAt: expiresAt
      };
      console.log("About to create SMS verification with data:", smsData);
      try {
        await storage.createSMSVerificationCode(smsData);
        console.log("✅ SMS verification code stored in database");
      } catch (dbError) {
        console.error("❌ Database error storing SMS code:", dbError);
        throw dbError; // Re-throw to maintain existing error handling
      }
      
      if (result.success) {
        // SMS sent successfully
        if (process.env.NODE_ENV === 'development') {
          res.json({ 
            success: true, 
            message: "SMS verification code sent",
            debugCode: code
          });
        } else {
          res.json({ success: true, message: "SMS verification code sent" });
        }
      } else {
        // SMS failed but in development mode, provide fallback
        if (process.env.NODE_ENV === 'development') {
          console.log('🧪 SMS failed, using development fallback');
          res.json({ 
            success: true, 
            message: "SMS verification code sent (development mode)",
            debugCode: code,
            developmentMode: true
          });
        } else {
          res.status(500).json({ error: "Failed to send SMS verification code" });
        }
      }
    } catch (error) {
      console.error("SMS request error:", error);
      res.status(500).json({ error: "SMS request failed" });
    }
  });

  // POST /api/customer-auth/verify-sms
  // @deprecated — replaced by /verify-phone-otp + /complete-phone-login
  app.post('/api/customer-auth/verify-sms', async (req, res) => {
    console.warn('⚠️  DEPRECATED: /api/customer-auth/verify-sms — use /verify-phone-otp + /complete-phone-login instead');
    try {
      const { wholesalerId, lastFourDigits, smsCode } = req.body;
      
      if (!wholesalerId || !lastFourDigits || !smsCode) {
        return res.status(400).json({ error: "Wholesaler ID, last four digits, and SMS code are required" });
      }

      // Find customer by last 4 digits
      let customer;
      try {
        customer = await storage.findCustomerByLastFourDigits(wholesalerId, lastFourDigits);
      } catch (error: any) {
        // Handle security error when multiple customers share same last 4 digits
        if (error.message.includes('Multiple customers found with same phone number suffix')) {
          return res.status(400).json({ 
            error: "Multiple customers found with the same phone number ending. Please contact support for assistance.",
            securityIssue: true
          });
        }
        throw error; // Re-throw other errors
      }
      
      if (!customer) {
        return res.status(401).json({ error: "Customer not found" });
      }

      console.log('🔧 SMS Verification - Customer data:', {
        id: customer.id || customer.customer_id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        hasPhone: !!customer.phone,
        phoneLength: customer.phone?.length
      });

      // Verify SMS code
      const verificationRecord = await storage.getSMSVerificationCode(wholesalerId, customer.id, smsCode);
      
      if (!verificationRecord) {
        return res.status(401).json({ error: "Invalid verification code" });
      }

      // Check if code is expired (15 minutes)
      const now = new Date();
      const expiryTime = new Date(verificationRecord.createdAt);
      expiryTime.setMinutes(expiryTime.getMinutes() + 15);
      
      if (now > expiryTime) {
        return res.status(401).json({ error: "Verification code has expired" });
      }

      // Check if code was already used
      if (verificationRecord.isUsed) {
        return res.status(401).json({ error: "Verification code has already been used" });
      }

      // Check attempt limit (max 5 attempts per code)
      if (verificationRecord.attempts >= 5) {
        return res.status(401).json({ error: "Too many verification attempts. Please request a new code." });
      }

      // Mark code as used
      await storage.markSMSCodeAsUsed(verificationRecord.id);

      // Create customer session for 24 hours
      const sessionData = {
        customerId: customer.id || customer.customer_id,
        wholesalerId: wholesalerId,
        name: customer.name,
        email: customer.email || '',
        phone: customer.phone || '',
        groupId: customer.groupId || customer.group_id,
        groupName: customer.groupName || customer.group_name,
        authenticatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days
      };

      console.log('🔧 SMS Verification - Session data created:', sessionData);

      // Ensure session exists and store customer session
      if (!req.session) {
        console.error("Session not initialized - regenerating session");
        req.session = {} as any;
      }
      
      // Set customer authentication data in session
      (req.session as any).customerAuth = sessionData;
      
      console.log(`🔐 Customer session created for ${customer.name} (${customer.phone}) - expires in 30 days`);

      // Force session save using callback method with timeout
      const saveSession = () => {
        return new Promise<void>((resolve, reject) => {
          if (req.session && typeof req.session.save === 'function') {
            const timeout = setTimeout(() => {
              reject(new Error('Session save timeout'));
            }, 3000); // 3 second timeout
            
            req.session.save((err) => {
              clearTimeout(timeout);
              if (err) {
                console.error('❌ Session save error:', err);
                reject(err);
              } else {
                console.log('✅ Customer session saved successfully');
                resolve();
              }
            });
          } else {
            console.log('⚠️ Session save method not available');
            resolve(); // Continue anyway
          }
        });
      };

      try {
        await saveSession();
      } catch (error) {
        console.error('Session save failed:', error);
        // Continue anyway to avoid blocking the user
      }
      
      console.log('✅ Sending SMS verification success response');
      
      // Create a signed token as backup for session persistence issues
      // Set a fallback cookie with customer authentication
      res.cookie('customer_auth', signCustomerCookie({
        customerId: customer.id || customer.customer_id,
        wholesalerId: wholesalerId,
        name: customer.name,
        email: customer.email || '',
        phone: customer.phone || '',
        groupId: customer.groupId || customer.group_id,
        groupName: customer.groupName || customer.group_name,
        timestamp: Date.now(),
        expires: Date.now() + 30 * 24 * 60 * 60 * 1000,
      }), COOKIE_OPTIONS);
      
      res.json({ 
        success: true, 
        message: "SMS verification successful",
        customer: {
          id: customer.id,
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
          groupId: customer.groupId,
          groupName: customer.groupName
        }
      });
    } catch (error) {
      console.error("SMS verification error:", error);
      res.status(500).json({ error: "SMS verification failed" });
    }
  });

  // GET /api/customer-auth/check/:wholesalerId
  app.get('/api/customer-auth/check/:wholesalerId', async (req, res) => {
    try {
      const { wholesalerId } = req.params;
      let customerAuth = (req.session as any)?.customerAuth;
      
      // If session auth fails, try fallback cookie
      if (!customerAuth) {
        const cookieData = parseCustomerCookie(req.cookies?.customer_auth);
        if (cookieData && cookieData.wholesalerId === wholesalerId) {
          customerAuth = {
            customerId: cookieData.customerId,
            wholesalerId: cookieData.wholesalerId,
            name: cookieData.name,
            email: cookieData.email || '',
            phone: cookieData.phone || '',
            groupId: cookieData.groupId || null,
            groupName: cookieData.groupName || '',
            expiresAt: new Date(cookieData.expires).toISOString(),
          };
          console.log('🔓 Using fallback cookie authentication for customer:', cookieData.name);
        }
      }
      
      if (!customerAuth) {
        return res.status(401).json({ authenticated: false, message: "No customer session found" });
      }
      
      // MULTI-WHOLESALER FIX: Check if customer has access to the requested wholesaler
      // instead of requiring exact session match
      const hasAccess = await multiWholesalerService.hasWholesalerAccess(customerAuth.customerId, wholesalerId);
      if (!hasAccess) {
        return res.status(401).json({ authenticated: false, message: "No access to this wholesaler" });
      }
      
      // Check if session is expired (24 hours)
      const now = new Date();
      const expiresAt = new Date(customerAuth.expiresAt);
      
      if (now > expiresAt) {
        // Clear expired session and cookie
        delete (req.session as any)?.customerAuth;
        res.clearCookie('customer_auth');
        return res.status(401).json({ authenticated: false, message: "Session expired" });
      }
      
      console.log(`✅ Customer session valid for ${customerAuth.name} (expires: ${customerAuth.expiresAt})`);
      
      // Valid session found - get full customer data including business name
      const fullCustomerData = await storage.getUser(customerAuth.customerId);
      
      // Use fresh data from database instead of cached session data
      const customerName = fullCustomerData ? `${fullCustomerData.firstName || ''} ${fullCustomerData.lastName || ''}`.trim() || fullCustomerData.businessName || customerAuth.name : customerAuth.name;
      
      res.json({
        authenticated: true,
        customer: {
          id: customerAuth.customerId,
          name: customerName,
          email: fullCustomerData?.email || customerAuth.email || '',
          phone: fullCustomerData?.phoneNumber || customerAuth.phone || '',
          groupId: customerAuth.groupId || null,
          groupName: customerAuth.groupName || '',
          businessName: fullCustomerData?.businessName || ''
        },
        expiresAt: customerAuth.expiresAt
      });
    } catch (error) {
      console.error("Customer auth check error:", error);
      res.status(500).json({ error: "Failed to check authentication" });
    }
  });

  // POST /api/customer-auth/switch-wholesaler
  app.post('/api/customer-auth/switch-wholesaler', async (req, res) => {
    try {
      const { targetWholesalerId } = req.body;
      let customerAuth = (req.session as any)?.customerAuth;
      
      // Fallback to cookie if session not found
      if (!customerAuth) {
        const cookieData = parseCustomerCookie(req.cookies?.customer_auth);
        if (cookieData) {
          customerAuth = {
            customerId: cookieData.customerId,
            wholesalerId: cookieData.wholesalerId,
            name: cookieData.name,
            email: cookieData.email || '',
            phone: cookieData.phone || '',
            groupId: cookieData.groupId || null,
            groupName: cookieData.groupName || '',
            expiresAt: new Date(cookieData.expires).toISOString(),
          };
        }
      }
      
      if (!customerAuth) {
        return res.status(401).json({ error: "No active customer session" });
      }
      
      if (!targetWholesalerId) {
        return res.status(400).json({ error: "Target wholesaler ID required" });
      }
      
      // Verify customer has access to target wholesaler
      const hasAccess = await multiWholesalerService.hasWholesalerAccess(customerAuth.customerId, targetWholesalerId);
      if (!hasAccess) {
        return res.status(403).json({ error: "No access to target wholesaler" });
      }
      
      // Create updated session for new wholesaler
      const updatedSessionData = {
        ...customerAuth,
        wholesalerId: targetWholesalerId,
        authenticatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // Reset to 30 days
      };
      
      // Update session
      (req.session as any).customerAuth = updatedSessionData;
      
      // Update cookie
      const cookieData = {
        customerId: customerAuth.customerId,
        wholesalerId: targetWholesalerId,
        name: customerAuth.name,
        email: customerAuth.email,
        phone: customerAuth.phone,
        groupId: customerAuth.groupId,
        groupName: customerAuth.groupName,
        expires: Date.now() + 30 * 24 * 60 * 60 * 1000 // 30 days
      };
      
      res.cookie('customer_auth', signCustomerCookie(cookieData), COOKIE_OPTIONS);
      
      console.log(`🔄 Customer ${customerAuth.name} switched from wholesaler ${customerAuth.wholesalerId} to ${targetWholesalerId}`);
      
      res.json({
        success: true,
        message: "Wholesaler switched successfully",
        newWholesalerId: targetWholesalerId
      });
    } catch (error) {
      console.error("Wholesaler switching error:", error);
      res.status(500).json({ error: "Failed to switch wholesaler" });
    }
  });

  // POST /api/customer-auth/logout
  app.post('/api/customer-auth/logout', async (req, res) => {
    try {
      const customerAuth = (req.session as any)?.customerAuth;
      if (customerAuth) {
        console.log(`🔓 Customer logout: ${customerAuth.name} (${customerAuth.phone})`);
      }

      // Clear the customer_auth cookie so check-session cannot auto-resume.
      res.clearCookie('customer_auth', { path: '/' });

      // Delete customerAuth from session first as a safety net: if session.destroy
      // fails below, the auth data is already gone and the next request won't be
      // authenticated via the stale session entry.
      delete (req.session as any).customerAuth;

      // Destroy the full session (covers both cookie and session-based auth).
      const destroyErr = await new Promise<any>((resolve) => {
        req.session.destroy((err: any) => resolve(err));
      });
      if (destroyErr) {
        console.error('❌ Session destroy error on logout:', destroyErr);
        // Cookie is already cleared and customerAuth deleted — safe to continue.
      }

      res.json({ success: true, message: "Logged out successfully" });
    } catch (error) {
      console.error("Customer logout error:", error);
      res.status(500).json({ error: "Logout failed" });
    }
  });

  // PUT /api/customer-profile/update
  app.put('/api/customer-profile/update', async (req, res) => {
    try {
      // Get customer from session or fallback auth
      let customerAuth = (req.session as any)?.customerAuth;
      
      // If session auth fails, try fallback cookie
      if (!customerAuth) {
        const cookieData = parseCustomerCookie(req.cookies?.customer_auth);
        if (cookieData) {
          customerAuth = {
            customerId: cookieData.customerId,
            name: cookieData.name,
            email: cookieData.email || '',
            phone: cookieData.phone || '',
          };
        }
      }
      
      // SECURITY FIX: Remove hardcoded customer fallback that was causing data leaks
      if (!customerAuth) {
        console.log('❌ No customer authentication found - login required');
        return res.status(401).json({ error: 'Authentication required - please log in to access your profile' });
      }
      
      const { name, email, phone, businessName } = req.body;
      
      console.log('🔄 Customer profile update request:', { name, email, phone, businessName });
      
      // Prepare update data
      const updates: any = {};
      if (name && name.trim()) {
        const nameParts = name.trim().split(' ');
        updates.firstName = nameParts[0] || '';
        updates.lastName = nameParts.slice(1).join(' ') || '';
      }
      if (email && email.trim()) updates.email = email.trim();
      if (phone && phone.trim()) updates.phoneNumber = phone.trim();
      if (businessName && businessName.trim()) updates.businessName = businessName.trim();
      
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "No updates provided" });
      }
      
      // Update customer profile
      const updatedCustomer = await storage.updateUser(customerAuth.customerId, updates);
      
      if (!updatedCustomer) {
        return res.status(404).json({ error: "Customer not found" });
      }
      
      console.log('✅ Customer profile updated successfully');
      
      res.json({
        success: true,
        customer: {
          id: updatedCustomer.id,
          name: `${updatedCustomer.firstName || ''} ${updatedCustomer.lastName || ''}`.trim() || updatedCustomer.businessName || '',
          email: updatedCustomer.email,
          phone: updatedCustomer.phoneNumber,
          businessName: updatedCustomer.businessName
        }
      });
    } catch (error) {
      console.error("❌ Customer profile update error:", error);
      res.status(500).json({ error: "Failed to update profile" });
    }
  });

  // GET /api/registration-requests
  app.get('/api/registration-requests', requireAuth, async (req, res) => {
    try {
      const userId = (req as any).user.id;
      console.log(`🔍 Fetching pending registration requests for wholesaler: ${userId}`);
      
      const requests = await storage.getAllRegistrationRequests(userId);
      
      console.log(`✅ Found ${requests.length} pending registration requests`);
      res.json(requests);
    } catch (error) {
      console.error('Error fetching registration requests:', error);
      res.status(500).json({ error: 'Failed to fetch registration requests' });
    }
  });

  function getBusinessTypeLabel(businessType: string | null | undefined): string | null {
    if (!businessType) return null;
    const map: Record<string, string> = {
      retailer: 'Retailer (Shop / Store)',
      wholesaler: 'Wholesaler / Distributor',
      business: 'Business (Restaurant, Salon, etc.)',
      individual: 'Individual / Sole Trader',
    };
    return map[businessType] ?? businessType;
  }

  function buildSubmissionSummaryCard(requestData: {
    businessName?: string | null;
    businessType?: string | null;
    customerPhone: string;
    customerEmail?: string | null;
    productsInterested?: string | null;
    orderFrequency?: string | null;
    requestMessage?: string | null;
  }): string {
    const businessTypeLabel = getBusinessTypeLabel(requestData.businessType);
    return `${emailHeading('Your Submitted Details', { size: '16px' })}${requestData.businessName ? `<p style="margin:0 0 6px"><strong>Business Name:</strong> ${requestData.businessName}</p>` : ''}${businessTypeLabel ? `<p style="margin:0 0 6px"><strong>Business Type:</strong> ${businessTypeLabel}</p>` : ''}<p style="margin:0 0 6px"><strong>Phone:</strong> ${requestData.customerPhone}</p>${requestData.customerEmail ? `<p style="margin:0 0 6px"><strong>Email:</strong> ${requestData.customerEmail}</p>` : ''}${requestData.productsInterested ? `<p style="margin:0 0 6px"><strong>Products Interested In:</strong> ${requestData.productsInterested}</p>` : ''}${requestData.orderFrequency ? `<p style="margin:0 0 6px"><strong>Estimated Order Quantity/Frequency:</strong> ${requestData.orderFrequency}</p>` : ''}${requestData.requestMessage ? `<p style="margin:0"><strong>Message:</strong> ${requestData.requestMessage}</p>` : ''}`;
  }

  // POST /api/registration-requests/:requestId/respond
  app.post('/api/registration-requests/:requestId/respond', requireAuth, requireNotViewer, async (req, res) => {
    try {
      const { requestId } = req.params;
      const { action, responseMessage, customerGroupId } = req.body;
      const userId = (req as any).user.id;
      
      console.log(`📝 Processing registration request ${requestId}: ${action} by user ${userId}`);
      
      if (!['approve', 'reject'].includes(action)) {
        return res.status(400).json({ error: 'Invalid action. Must be approve or reject' });
      }
      
      // Get the request details first
      const request = await db
        .select()
        .from(customerRegistrationRequests)
        .where(eq(customerRegistrationRequests.id, parseInt(requestId)))
        .limit(1);
        
      if (!request[0] || request[0].wholesalerId !== userId) {
        return res.status(404).json({ error: 'Registration request not found or unauthorized' });
      }
      
      const requestData = request[0];
      
      if (requestData.status === 'rejected' && action === 'reject') {
        return res.status(400).json({ error: 'This request has already been rejected' });
      }
      if (requestData.status === 'approved' && action === 'approve') {
        return res.status(400).json({ error: 'This customer has already been approved' });
      }

      // Update request status
      await storage.updateRegistrationRequestStatus(
        parseInt(requestId), 
        action === 'approve' ? 'approved' : 'rejected',
        userId,
        responseMessage
      );

      // If revoking an approved customer, archive the wholesaler-customer relationship
      if (action === 'reject' && requestData.status === 'approved') {
        try {
          await db
            .update(wholesalerCustomerRelationships)
            .set({ status: 'inactive' })
            .where(and(
              eq(wholesalerCustomerRelationships.wholesalerId, userId),
              sql`customer_id IN (SELECT id FROM users WHERE phone_number = ${requestData.customerPhone})`
            ));
          console.log(`✅ Revoked customer access for ${requestData.customerPhone}`);
        } catch (revokeError) {
          console.warn(`⚠️ Could not archive relationship during revoke:`, revokeError);
        }
      }

      if (action === 'approve') {
        // Parse customer name
        const { firstName, lastName } = parseCustomerName(requestData.customerName);

        // Check for an existing user with this phone number before creating a new one
        const existingUsers = await db
          .select()
          .from(users)
          .where(eq(users.phoneNumber, requestData.customerPhone))
          .limit(1);

        let newCustomer: any;
        if (existingUsers.length > 0) {
          newCustomer = existingUsers[0];
          console.log(`♻️ Reusing existing user ${newCustomer.id} (${newCustomer.firstName} ${newCustomer.lastName}) for phone ${requestData.customerPhone}`);
        } else {
          newCustomer = await storage.createCustomer({
            phoneNumber: requestData.customerPhone,
            firstName,
            lastName,
            email: requestData.customerEmail || undefined,
            role: 'retailer',
            wholesalerId: userId,
            customerType: requestData.customerType || undefined,
          });
          console.log(`✅ Created new customer account: ${newCustomer.id} (${newCustomer.firstName} ${newCustomer.lastName})`);
        }

        // Create wholesaler-customer relationship (guard against duplicates)
        const existingRelationship = await db
          .select()
          .from(wholesalerCustomerRelationships)
          .where(and(
            eq(wholesalerCustomerRelationships.customerId, newCustomer.id),
            eq(wholesalerCustomerRelationships.wholesalerId, userId)
          ))
          .limit(1);

        if (existingRelationship.length > 0) {
          // Ensure it is active (may have been deactivated previously)
          if (existingRelationship[0].status !== 'active') {
            await db
              .update(wholesalerCustomerRelationships)
              .set({ status: 'active' })
              .where(and(
                eq(wholesalerCustomerRelationships.customerId, newCustomer.id),
                eq(wholesalerCustomerRelationships.wholesalerId, userId)
              ));
            console.log(`♻️ Reactivated existing relationship for customer ${newCustomer.id}`);
          } else {
            console.log(`♻️ Relationship already exists and is active for customer ${newCustomer.id}`);
          }
        } else {
          await db.insert(wholesalerCustomerRelationships).values({
            customerId: newCustomer.id,
            wholesalerId: userId,
            status: 'active',
          });
          console.log(`✅ Created wholesaler-customer relationship for ${newCustomer.id}`);
        }

        if (customerGroupId && customerGroupId > 0) {
          try {
            await storage.addCustomerToGroup(customerGroupId, newCustomer.id);
            console.log(`✅ Customer ${newCustomer.id} added to group ${customerGroupId}`);
          } catch (groupError) {
            console.warn(`⚠️ Failed to add customer to group ${customerGroupId}:`, groupError);
          }
        }
        
        // Send welcome messages to new customer
        try {
          const wholesaler = await storage.getUser(userId);
          if (wholesaler) {
            const customerName = `${firstName} ${lastName}`.trim();
            const portalUrl = `https://quikpik.app/customer/${userId}`;
            const wholesalerName = wholesaler.businessName || `${wholesaler.firstName || ''} ${wholesaler.lastName || ''}`.trim() || 'Your Wholesale Partner';
            
            console.log(`📧 Sending welcome messages for approved customer ${customerName}`);
            
            const welcomeResult = await sendWelcomeMessages({
              customerName,
              customerEmail: requestData.customerEmail || undefined,
              customerPhone: requestData.customerPhone,
              wholesalerName,
              wholesalerEmail: wholesaler.email || 'hello@quikpik.co',
              wholesalerPhone: wholesaler.phoneNumber || '',
              wholesalerAccountName: `${wholesaler.firstName || ''} ${wholesaler.lastName || ''}`.trim() || 'IBK',
              portalUrl,
              wholesalerId: wholesaler.id,
              wholesalerLogoType: wholesaler.logoType,
              wholesalerLogoUrl: wholesaler.logoUrl,
            });
            
            console.log(`📨 Welcome messages sent to ${customerName}:`, welcomeResult);
          }
        } catch (welcomeError) {
          console.error('❌ Error sending welcome messages (Registration Approval):', welcomeError);
        }
        
        // Send approval notification to customer
        if (requestData.customerEmail) {
          try {
            const wholesaler = await storage.getUser(userId);
            const businessName = wholesaler?.businessName || `${wholesaler?.firstName || ''} ${wholesaler?.lastName || ''}`.trim() || 'Wholesaler';
            
            const approvedBody = `${emailHeading('Welcome!', { size: '22px', color: '#10b981' })}<p style="font-size:16px;margin:0 0 8px">Dear ${requestData.customerName},</p><p style="margin:0 0 20px">Great news! Your registration request has been approved. You now have access to our wholesale platform.</p>${emailCard(`${emailHeading('Your Access Details', { size: '16px' })}<p style="margin:0 0 6px"><strong>Phone Number:</strong> ${requestData.customerPhone}</p><p style="margin:0">Use your phone number to log in and start ordering.</p>`, { borderColor: '#a7f3d0', bgColor: '#ecfdf5' })}${emailCard(buildSubmissionSummaryCard(requestData), { borderColor: '#dbeafe', bgColor: '#eff6ff' })}${responseMessage ? emailCard(`<p style="margin:0 0 4px;font-weight:600">Message from ${businessName}:</p><p style="margin:0;color:#4b5563">${responseMessage}</p>`) : ''}${emailButton('Start Shopping', `https://quikpik.app/customer/${userId}`)}<p style="margin:20px 0 0">We look forward to serving you!</p>`;

            await sendEmail({
              to: requestData.customerEmail,
              from: 'hello@quikpik.co',
              subject: `Registration Approved - Welcome to ${businessName}`,
              html: wrapCustomerEmail(approvedBody, { businessName, logoUrl: getEmailLogoUrl(wholesaler?.id, wholesaler?.logoType, wholesaler?.logoUrl) }, { preheader: `Your registration with ${businessName} has been approved` })
            });
            console.log(`📧 Approval notification sent to ${requestData.customerEmail}`);
          } catch (emailError) {
            console.error('Failed to send approval notification:', emailError);
          }
        }
      } else {
        // Send rejection notification to customer
        if (requestData.customerEmail) {
          try {
            const wholesaler = await storage.getUser(userId);
            const businessName = wholesaler?.businessName || `${wholesaler?.firstName || ''} ${wholesaler?.lastName || ''}`.trim() || 'Wholesaler';
            
            const rejectedBody = `${emailHeading('Registration Update', { size: '22px' })}<p style="font-size:16px;margin:0 0 8px">Dear ${requestData.customerName},</p><p style="margin:0 0 20px">Thank you for your interest in our wholesale platform. Unfortunately, your registration request could not be approved at this time.</p>${emailCard(buildSubmissionSummaryCard(requestData), { borderColor: '#dbeafe', bgColor: '#eff6ff' })}${responseMessage ? emailCard(`<p style="margin:0 0 4px;font-weight:600">Reason:</p><p style="margin:0;color:#4b5563">${responseMessage}</p>`) : ''}<p style="margin:20px 0 0">If you have any questions, please feel free to contact us directly. We appreciate your interest and hope to work with you in the future.</p>`;

            await sendEmail({
              to: requestData.customerEmail,
              from: 'hello@quikpik.co',
              subject: `Registration Request Update - ${businessName}`,
              html: wrapCustomerEmail(rejectedBody, { businessName, logoUrl: getEmailLogoUrl(wholesaler?.id, wholesaler?.logoType, wholesaler?.logoUrl) }, { preheader: `Update on your registration with ${businessName}` })
            });
            console.log(`📧 Rejection notification sent to ${requestData.customerEmail}`);
          } catch (emailError) {
            console.error('Failed to send rejection notification:', emailError);
          }
        }
      }
      
      res.json({ 
        success: true, 
        message: `Registration request ${action}d successfully${action === 'approve' ? ' and customer account created' : ''}` 
      });
    } catch (error) {
      console.error(`❌ Error ${req.body.action}ing registration request:`, error);
      res.status(500).json({ error: `Failed to ${req.body.action} registration request` });
    }
  });

  // PATCH /api/customer/update-profile/:customerId
  app.patch('/api/customer/update-profile/:customerId', async (req, res) => {
    try {
      const { customerId } = req.params;
      const { firstName, lastName, email, phoneNumber, businessName } = req.body;
      
      console.log(`🔄 Customer profile update request for: ${customerId}`, { firstName, lastName, email, phoneNumber, businessName });
      
      // Validate required fields
      if (!customerId) {
        return res.status(400).json({ error: "Customer ID is required" });
      }
      
      const updates: any = {};
      if (firstName) updates.firstName = firstName;
      if (lastName) updates.lastName = lastName;
      if (email) updates.email = email;
      if (phoneNumber) updates.phoneNumber = phoneNumber;
      if (businessName) updates.businessName = businessName;
      
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "No updates provided" });
      }
      
      // Update customer profile with automatic notifications to wholesalers
      const updatedCustomer = await storage.updateCustomerProfileWithNotifications(customerId, updates, true);
      
      console.log(`✅ Customer profile updated successfully: ${customerId}`);
      
      res.json({
        success: true,
        customer: {
          id: updatedCustomer.id,
          firstName: updatedCustomer.firstName,
          lastName: updatedCustomer.lastName,
          email: updatedCustomer.email,
          phoneNumber: updatedCustomer.phoneNumber,
          businessName: updatedCustomer.businessName
        },
        message: "Profile updated successfully. All your wholesalers have been notified of the changes."
      });
    } catch (error) {
      console.error("❌ Error updating customer profile:", error);
      res.status(500).json({ error: "Failed to update customer profile" });
    }
  });

  // POST /api/customer-email-verification/send
  app.post('/api/customer-email-verification/send', async (req, res) => {
    try {
      const { customerId, email } = req.body;
      
      if (!customerId || !email) {
        return res.status(400).json({ 
          success: false, 
          message: 'Customer ID and email are required' 
        });
      }
      
      // Verify customer exists and has this email
      const customer = await storage.getUser(customerId);
      if (!customer || customer.email !== email) {
        return res.status(403).json({ 
          success: false, 
          message: 'Customer email verification failed' 
        });
      }
      
      // Send email verification code
      const verificationCode = await createEmailVerification(customerId, email);
      
      res.json({ 
        success: true, 
        message: 'Email verification code sent',
        expiresIn: 600 // 10 minutes
      });
      
    } catch (error) {
      console.error('Email verification send error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to send email verification' 
      });
    }
  });

  // POST /api/customer-email-verification/verify
  app.post('/api/customer-email-verification/verify', async (req, res) => {
    try {
      const { customerId, email, code, wholesalerId } = req.body;
      
      if (!customerId || !email || !code || !wholesalerId) {
        return res.status(400).json({ 
          success: false, 
          message: 'Customer ID, email, verification code, and wholesaler ID are required' 
        });
      }
      
      // Verify the email code
      const isVerified = await verifyEmailCode(customerId, email, code);
      
      if (!isVerified) {
        return res.status(400).json({ 
          success: false, 
          message: 'Invalid or expired verification code' 
        });
      }

      // Look up full customer record to build session
      const customerRecord = await storage.getUser(customerId);
      if (!customerRecord) {
        return res.status(404).json({ success: false, message: 'Customer not found' });
      }

      const customerName = `${customerRecord.firstName || ''} ${customerRecord.lastName || ''}`.trim() || customerRecord.businessName || 'Customer';

      // Look up group membership for this wholesaler (same join as findCustomerByLastFourDigits)
      let groupId: string | null = null;
      let groupName = '';
      try {
        const groupRows = await db.execute(sql`
          SELECT cgm.group_id as group_id, cg.name as group_name
          FROM customer_group_members cgm
          INNER JOIN customer_groups cg ON cgm.group_id = cg.id AND cg.wholesaler_id = ${wholesalerId}
          WHERE cgm.customer_id = ${customerId}
          LIMIT 1
        `);
        if (groupRows.rows.length > 0) {
          const row = groupRows.rows[0] as any;
          groupId = row.group_id ? String(row.group_id) : null;
          groupName = row.group_name || '';
        }
      } catch (groupErr) {
        console.warn('⚠️ Could not fetch group info for email-verified customer:', groupErr);
      }

      // Build session identical to SMS verification route
      const sessionData = {
        customerId: customerRecord.id,
        wholesalerId,
        name: customerName,
        email: customerRecord.email || email,
        phone: customerRecord.phoneNumber || '',
        groupId,
        groupName,
        authenticatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      };

      console.log('🔧 Email Verification - Session data created:', sessionData);

      // Ensure session exists and store customer session
      if (!req.session) {
        req.session = {} as any;
      }
      (req.session as any).customerAuth = sessionData;

      console.log(`🔐 Customer session created for ${customerName} (email) - expires in 30 days`);

      // Force session save
      const saveSession = () => new Promise<void>((resolve, reject) => {
        if (req.session && typeof req.session.save === 'function') {
          const timeout = setTimeout(() => reject(new Error('Session save timeout')), 3000);
          req.session.save((err) => {
            clearTimeout(timeout);
            if (err) { console.error('❌ Session save error:', err); reject(err); }
            else { console.log('✅ Customer session saved successfully'); resolve(); }
          });
        } else {
          console.log('⚠️ Session save method not available');
          resolve();
        }
      });

      try {
        await saveSession();
      } catch (err) {
        console.error('Session save failed:', err);
      }

      // Set fallback cookie identical to SMS route
      res.cookie('customer_auth', signCustomerCookie({
        customerId: customerRecord.id,
        wholesalerId,
        name: customerName,
        email: customerRecord.email || email,
        phone: customerRecord.phoneNumber || '',
        groupId,
        groupName,
        timestamp: Date.now(),
        expires: Date.now() + 30 * 24 * 60 * 60 * 1000,
      }), COOKIE_OPTIONS);

      console.log('✅ Sending email verification success response');

      res.json({ 
        success: true, 
        message: 'Email verified successfully',
        customer: {
          id: customerRecord.id,
          name: customerName,
          email: customerRecord.email || email,
          phone: customerRecord.phoneNumber || '',
          groupId,
          groupName
        }
      });
      
    } catch (error) {
      console.error('Email verification verify error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to verify email code' 
      });
    }
  });

}
