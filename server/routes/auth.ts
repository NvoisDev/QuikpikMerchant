import type { Express } from "express";
import {
  and, count, createOrUpdateUser, createResetExpiration, db, emailBadge, emailCard, emailHeading,
  eq, formatPhoneToInternational, generateResetToken, getEmailLogoUrl, getGoogleAuthUrl,
  hashPassword, hashResetToken, isInvitationExpired, or, orders, passwordResetAttempts, products,
  requireAuth, requireNotViewer, sendEmail, sendPasswordResetEmail, sendTeamInvitationEmail,
  sgMail, storage, teamMembers, users, validatePassword, verifyGoogleToken, verifyPassword,
  wrapCustomerEmail
} from "./shared";

export function registerAuthRoutes(app: Express): void {
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
      
      console.log('👤 Updating profile for user:', user.id, updates);

      // Update user profile
      await storage.updateUser(user.id, updates);

      console.log('✅ Profile updated successfully for user:', user.id);
      
      res.json({ 
        success: true, 
        message: "Profile updated successfully" 
      });
    } catch (error) {
      console.error('❌ Error updating profile:', error);
      res.status(500).json({ 
        success: false, 
        message: "Failed to update profile" 
      });
    }
  });

  // GET /api/auth/google
  app.get('/api/auth/google', (req, res) => {
    try {
      const returnTo = typeof req.query.returnTo === 'string' ? req.query.returnTo : null;
      if (returnTo) {
        (req.session as any).returnTo = returnTo;
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
      const { code, error, state } = req.query;
      
      console.log('🔄 OAuth callback received:', { 
        hasCode: !!code, 
        codeLength: code?.length, 
        error: error || 'none',
        state: state || 'none'
      });
      
      if (error) {
        console.log('❌ OAuth error from Google:', error);
        return res.redirect('/login?error=oauth_denied');
      }
      
      if (!code || typeof code !== 'string') {
        console.log('❌ No authorization code provided');
        return res.redirect('/login?error=no_code');
      }

      console.log('🔄 Attempting to verify Google token...');
      // Verify Google token and get user info
      const googleUser = await verifyGoogleToken(code);
      
      // Create or update user in database
      const user = await createOrUpdateUser(googleUser);
      
      // Set user session in passport format for compatibility
      (req.session as any).passport = {
        user: {
          sub: user.id,
          email: user.email,
          claims: user
        }
      };
      (req.session as any).userId = user.id;
      (req.session as any).user = user;
      
      console.log(`🔐 Google auth session created for user ${user.email}`, {
        isFirstLogin: user.isFirstLogin,
        hasBusinessName: !!user.businessName,
        hasAddress: !!(user.streetAddress || user.city)
      });
      
      // CRITICAL: Save session before redirect to ensure persistence
      req.session.save((err: any) => {
        if (err) {
          console.error('❌ Session save failed after Google auth:', err);
          return res.redirect('/login?error=session_failed');
        }
        
        console.log(`✅ Session saved successfully for ${user.email}`);
        
        // Use returnTo if set (e.g. from /admin login)
        const returnTo = (req.session as any).returnTo;
        if (returnTo) {
          delete (req.session as any).returnTo;
          console.log(`↩️ Redirecting to returnTo: ${returnTo}`);
          return res.redirect(returnTo);
        }

        // Check if this is a new user who needs to complete signup
        if (user.isFirstLogin || !user.businessName || user.businessName.includes("'s Business")) {
          console.log(`👋 New user detected, redirecting to complete signup profile`);
          res.redirect('/signup-complete');
        } else {
          console.log(`✅ Returning user with complete profile, redirecting to dashboard`);
          res.redirect('/dashboard');
        }
      });
    } catch (error) {
      console.error('❌ Google auth callback error:', error);
      
      // More specific error handling
      if (error?.message?.includes('invalid_grant')) {
        console.log('❌ Google token expired or invalid - user needs to try again');
        res.redirect('/login?error=token_expired');
      } else if (error?.message?.includes('Failed to verify')) {
        console.log('❌ Google token verification failed');
        res.redirect('/login?error=verification_failed');
      } else {
        console.log('❌ Generic auth error');
        res.redirect('/login?error=auth_failed');
      }
    }
  });

  // PUT /api/auth/complete-profile
  app.put('/api/auth/complete-profile', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const {
        businessName,
        businessDescription,
        businessPhone,
        businessType,
        estimatedMonthlyVolume,
        streetAddress,
        city,
        state,
        postalCode,
        country,
        preferredCurrency,
        isFirstLogin,
        orderNumberPrefix
      } = req.body;

      console.log(`🔄 Completing profile for user ${userId}:`, {
        businessName,
        hasAddress: !!(streetAddress || city),
        currency: preferredCurrency
      });

      // Update user profile
      const updateData: any = {
        isFirstLogin: isFirstLogin || false, // Mark profile as completed
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

      console.log(`✅ Profile completed successfully for ${updatedUser.email}`);

      // Update session with new user data
      (req.session as any).user = {
        ...req.user,
        ...updatedUser,
        isFirstLogin: false
      };

      res.json({
        success: true,
        message: 'Profile completed successfully',
        user: updatedUser
      });
    } catch (error) {
      console.error('Profile completion error:', error);
      res.status(500).json({ success: false, message: 'Failed to complete profile' });
    }
  });

  // POST /api/auth/recover
  app.post('/api/auth/recover', async (req: any, res) => {
    try {
      const { email } = req.body;
      
      // Allow recovery for the consolidated wholesaler account
      if (!email || (email !== 'hello@quikpik.co' && email !== 'mogunjemilua@gmail.com')) {
        return res.status(403).json({ error: 'Unauthorized - Contact support for account recovery' });
      }
      
      // Find the wholesaler user by email only - no hardcoded IDs
      const user = await storage.getUserByEmail(email);
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      // Ensure this is a wholesaler account
      if (user.role !== 'wholesaler') {
        return res.status(403).json({ error: 'Access denied - Only wholesaler accounts can be recovered' });
      }
      
      // Create comprehensive session data
      const sessionUser = {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        businessName: user.businessName,
        isTeamMember: false
      };
      
      // Recreate session with both formats for compatibility
      (req.session as any).userId = user.id;
      (req.session as any).user = sessionUser;
      
      // Save session explicitly
      req.session.save((err: any) => {
        if (err) {
          console.error('Session save error:', err);
          return res.status(500).json({ error: 'Session save failed' });
        }
        
        console.log(`🔐 Session recovered and saved for wholesaler ${user.email} (${user.businessName})`);
        
        res.json({ 
          success: true, 
          message: 'Authentication recovered',
          user: {
            id: user.id,
            email: user.email,
          }
        });
      });
    } catch (error) {
      console.error('Auth recovery error:', error);
      res.status(500).json({ error: 'Recovery failed' });
    }
  });

  // GET /api/auth/user
  app.get('/api/auth/user', requireAuth, async (req: any, res) => {
    try {
      // Always fetch fresh user data from database to ensure subscription updates are reflected
      const userId = req.user.id || req.user.claims?.sub;
      const freshUserData = await storage.getUser(userId);
      
      let responseUser = freshUserData || req.user;
      
      // Check if this user is a team member and get wholesaler info + sub-role
      if (responseUser.role === 'team_member' && responseUser.wholesalerId) {
        const wholesalerInfo = await storage.getUser(responseUser.wholesalerId);
        const members = await storage.getTeamMembers(responseUser.wholesalerId);
        const member = members.find((m: any) => m.email === responseUser.email);
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
      
      console.log(`👤 Auth endpoint returning fresh user data for ${userId}:`, {
        id: responseUser.id,
        email: responseUser.email,
      });
      
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
      
      // Debug logging for logo upload
      console.log("🔧 Settings update request:");
      console.log("- User ID:", userId);
      console.log("- Update data keys:", Object.keys(updateData));
      console.log("- Logo type:", updateData.logoType);
      console.log("- Logo URL length:", updateData.logoUrl?.length || 0);
      console.log("- Has logo data:", updateData.logoUrl ? "YES" : "NO");
      
      // Auto-format phone numbers to international format
      if (updateData.businessPhone) {
        updateData.businessPhone = formatPhoneToInternational(updateData.businessPhone);
      }
      if (updateData.phoneNumber) {
        updateData.phoneNumber = formatPhoneToInternational(updateData.phoneNumber);
      }
      
      const updatedUser = await storage.updateUserSettings(userId, updateData);
      console.log("✅ Settings updated successfully for user:", userId);
      console.log("- Updated logo type:", updatedUser.logoType);
      console.log("- Updated logo URL length:", updatedUser.logoUrl?.length || 0);
      res.json(updatedUser);
    } catch (error: any) {
      console.error("❌ Error updating settings:", error);
      res.status(500).json({ message: "Failed to update settings" });
    }
  });

  // GET /api/tab-permissions
  app.get('/api/tab-permissions', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      
      const permissions = await storage.getTabPermissions(userId);
      res.json(permissions);
    } catch (error) {
      console.error("Error fetching tab permissions:", error);
      res.status(500).json({ message: "Failed to fetch tab permissions" });
    }
  });

  // GET /api/tab-permissions/check/:tabName
  app.get('/api/tab-permissions/check/:tabName', requireAuth, async (req: any, res) => {
    try {
      const { tabName } = req.params;
      const userId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      
      // For team members, check their role access; for owners, always allow
      let hasAccess = true;
      if (req.user.role === 'team_member') {
        const teamMemberRole = req.user.teamMemberRole || 'member';
        hasAccess = await storage.checkTabAccess(userId, tabName, teamMemberRole);
      }
      
      res.json({ hasAccess });
    } catch (error) {
      console.error("Error checking tab access:", error);
      res.status(500).json({ hasAccess: true }); // Default to allow for backwards compatibility
    }
  });

  // PUT /api/tab-permissions/:tabName
  app.put('/api/tab-permissions/:tabName', requireAuth, async (req: any, res) => {
    try {
      const { tabName } = req.params;
      const { isRestricted, allowedRoles } = req.body;
      const userId = req.user.id;
      
      // Only allow wholesaler owners to update permissions
      if (req.user.role !== 'wholesaler') {
        return res.status(403).json({ message: "Only account owners can update permissions" });
      }
      
      const permission = await storage.updateTabPermission(userId, tabName, isRestricted, allowedRoles);
      res.json(permission);
    } catch (error) {
      console.error("Error updating tab permission:", error);
      res.status(500).json({ message: "Failed to update tab permission" });
    }
  });

  // GET /api/user/marketplace-settings
  app.get("/api/user/marketplace-settings", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      
      res.json({ 
        showPricesToWholesalers: user?.showPricesToWholesalers || false 
      });
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

      // Build update object only with defined values
      const updateData: { defaultDepositPercentage?: number; balanceDueDays?: number } = {};

      // Validate and add deposit percentage if provided
      if (defaultDepositPercentage !== undefined) {
        if (![25, 50, 75, 100].includes(defaultDepositPercentage)) {
          return res.status(400).json({ message: "Deposit percentage must be 25, 50, 75, or 100" });
        }
        updateData.defaultDepositPercentage = defaultDepositPercentage;
      }

      // Validate and add balance due days if provided
      if (balanceDueDays !== undefined) {
        if (![0, 7, 14, 30, 60].includes(balanceDueDays)) {
          return res.status(400).json({ message: "Balance due days must be 0, 7, 14, 30, or 60" });
        }
        updateData.balanceDueDays = balanceDueDays;
      }

      // Only update if there's something to update
      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ message: "No valid fields to update" });
      }

      const [updatedUser] = await db.update(users)
        .set(updateData)
        .where(eq(users.id, userId))
        .returning();
      
      console.log(`✅ Updated payment terms for user ${userId}: ${updateData.defaultDepositPercentage ?? 'unchanged'}% deposit, ${updateData.balanceDueDays ?? 'unchanged'} days`);
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
    // Only allow in development environment
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
        console.log(`✅ Quick login successful for ${user.email}`);
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

  // GET /api/team-members
  app.get('/api/team-members', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const teamMembers = await storage.getTeamMembers(userId);
      res.json(teamMembers);
    } catch (error) {
      console.error("Error fetching team members:", error);
      res.status(500).json({ message: "Failed to fetch team members" });
    }
  });

  // POST /api/team-members
  app.post('/api/team-members', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { email, firstName, lastName, phoneNumber, role, permissions } = req.body;
      
      // Check subscription limits
      const currentCount = await storage.getTeamMembersCount(userId);
      const userSubscription = await storage.getUser(userId);
      const tier = userSubscription?.subscriptionTier || 'free';
      
      let limit = 0;
      switch (tier) {
        case 'standard': limit = 2; break;
        case 'premium': limit = 5; break;
      }
      
      if (currentCount >= limit) {
        return res.status(403).json({ 
          message: `Your ${tier} plan allows up to ${limit} team members. Please upgrade to add more team members.`
        });
      }

      const teamMember = await storage.createTeamMember({
        wholesalerId: userId,
        email,
        firstName,
        lastName,
        phoneNumber: phoneNumber?.trim() || null,
        role: role || 'member',
        permissions: permissions || ['products', 'orders', 'customers'],
      });

      // Send invitation email
      try {
        await sendTeamInvitationEmail(teamMember, req.user);
      } catch (emailError) {
        console.error("Error sending invitation email:", emailError);
        // Don't fail the team member creation if email fails
      }

      res.json(teamMember);
    } catch (error) {
      console.error("Error creating team member:", error);
      res.status(500).json({ message: "Failed to create team member" });
    }
  });

  // PATCH /api/team-members/:id/role
  app.patch('/api/team-members/:id/role', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const { role } = req.body;
      
      if (!role || !['admin', 'member', 'viewer'].includes(role)) {
        return res.status(400).json({ message: "Invalid role. Must be 'admin', 'member', or 'viewer'" });
      }
      
      // Get team member and verify ownership
      const teamMembers = await storage.getTeamMembers(userId);
      const teamMember = teamMembers.find(member => member.id === parseInt(id));
      
      if (!teamMember) {
        return res.status(404).json({ message: "Team member not found" });
      }
      
      // Update team member role
      await storage.updateTeamMemberRole(parseInt(id), role);
      
      res.json({ message: "Team member role updated successfully" });
    } catch (error) {
      console.error("Error updating team member role:", error);
      res.status(500).json({ message: "Failed to update team member role" });
    }
  });

  // PATCH /api/team-members/:id/phone
  app.patch('/api/team-members/:id/phone', requireAuth, async (req: any, res) => {
    try {
      const ownerId = req.user.role === 'team_member' && req.user.wholesalerId
        ? req.user.wholesalerId : req.user.id;
      const { id } = req.params;
      const { phoneNumber } = req.body;

      const allMembers = await storage.getTeamMembers(ownerId);

      // Only the account owner or admin team members may update phone numbers.
      if (req.user.role === 'team_member') {
        const requestingMember = allMembers.find(m => m.email === req.user.email);
        if (!requestingMember || requestingMember.role !== 'admin') {
          return res.status(403).json({ message: "Only admins can update team member phone numbers" });
        }
      }

      const target = allMembers.find(m => m.id === parseInt(id));
      if (!target) {
        return res.status(404).json({ message: "Team member not found" });
      }

      await storage.updateTeamMember(parseInt(id), { phoneNumber: phoneNumber?.trim() || null });
      res.json({ message: "Phone number updated successfully" });
    } catch (error) {
      console.error("Error updating team member phone:", error);
      res.status(500).json({ message: "Failed to update phone number" });
    }
  });

  // DELETE /api/team-members/:id
  app.delete('/api/team-members/:id', requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      const requestingUserId = req.user.role === 'team_member' && req.user.wholesalerId
        ? req.user.wholesalerId : req.user.id;

      // Ownership check — only the wholesaler who created the member can delete them
      const allMembers = await storage.getAllTeamMembers();
      const target = allMembers.find(m => m.id === parseInt(id));
      if (!target || target.wholesalerId !== requestingUserId) {
        return res.status(403).json({ message: "Not authorised to remove this team member" });
      }
      
      await storage.deleteTeamMember(parseInt(id));
      res.json({ message: "Team member removed successfully" });
    } catch (error) {
      console.error("Error deleting team member:", error);
      res.status(500).json({ message: "Failed to delete team member" });
    }
  });

  // PATCH /api/team-members/:id/status
  app.patch('/api/team-members/:id/status', requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const requestingUserId = req.user.role === 'team_member' && req.user.wholesalerId
        ? req.user.wholesalerId : req.user.id;

      if (!['active', 'suspended'].includes(status)) {
        return res.status(400).json({ message: "Status must be 'active' or 'suspended'" });
      }

      const allMembers = await storage.getAllTeamMembers();
      const target = allMembers.find(m => m.id === parseInt(id));
      if (!target || target.wholesalerId !== requestingUserId) {
        return res.status(403).json({ message: "Not authorised to update this team member" });
      }

      await storage.updateTeamMemberStatus(parseInt(id), status);
      res.json({ message: status === 'suspended' ? "Team member suspended" : "Team member reactivated" });
    } catch (error) {
      console.error("Error updating team member status:", error);
      res.status(500).json({ message: "Failed to update team member status" });
    }
  });

  // POST /api/team-members/:id/resend-invite
  app.post('/api/team-members/:id/resend-invite', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      
      // Get team member details
      const teamMembers = await storage.getTeamMembers(userId);
      const teamMember = teamMembers.find(member => member.id === parseInt(id));
      
      if (!teamMember) {
        return res.status(404).json({ message: "Team member not found" });
      }
      
      if (teamMember.status !== 'pending') {
        return res.status(400).json({ message: "Can only resend invites to pending members" });
      }

      // Send invitation email
      try {
        await sendTeamInvitationEmail(teamMember, req.user);
        res.json({ message: "Invitation resent successfully" });
      } catch (emailError) {
        console.error("Error resending invitation email:", emailError);
        res.status(500).json({ message: "Failed to resend invitation email" });
      }
    } catch (error) {
      console.error("Error resending team invitation:", error);
      res.status(500).json({ message: "Failed to resend invitation" });
    }
  });

  // POST /api/team-members/change-password
  app.post('/api/team-members/change-password', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);

      if (!user || user.role !== 'team_member') {
        return res.status(403).json({ message: "Only team members can change their password here" });
      }

      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "Current password and new password are required" });
      }

      if (newPassword.length < 8) {
        return res.status(400).json({ message: "New password must be at least 8 characters" });
      }

      if (!user.passwordHash) {
        return res.status(400).json({ message: "No password set on this account" });
      }

      const isValid = await verifyPassword(currentPassword, user.passwordHash);
      if (!isValid) {
        return res.status(400).json({ message: "Current password is incorrect" });
      }

      const newHash = await hashPassword(newPassword);
      await storage.updateUser(userId, { passwordHash: newHash });

      // Send security notification email — fire-and-forget, don't fail the request if it errors
      try {
        const wholesaler = user.wholesalerId ? await storage.getUser(user.wholesalerId) : null;
        const businessName = wholesaler?.businessName || 'Quikpik Merchant';
        const logoUrl = getEmailLogoUrl(user.wholesalerId ?? undefined, wholesaler?.logoType, wholesaler?.logoUrl);
        const branding = { businessName, logoUrl };

        const changedAt = new Date().toLocaleString('en-GB', {
          day: 'numeric', month: 'long', year: 'numeric',
          hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London'
        });

        const body =
          emailHeading('Password Changed', { color: '#10b981' }) +
          emailBadge('Success', '#10b981') +
          '<p style="font-size:15px;margin:16px 0 8px">Hi ' + (user.firstName || 'there') + ',</p>' +
          '<p style="font-size:15px;margin:0 0 20px">Your <strong>' + businessName + '</strong> account password was successfully changed on <strong>' + changedAt + '</strong>.</p>' +
          emailCard(
            '<p style="margin:0;font-size:14px;color:#92400e"><strong>⚠ Didn\'t make this change?</strong><br>If you did not update your password, contact <strong>' + businessName + '</strong> or your account administrator immediately.</p>',
            { borderColor: '#fbbf24', bgColor: '#fffbeb' }
          );

        const html = wrapCustomerEmail(body, branding, { preheader: 'Your account password was changed.' });

        await sendEmail({
          to: user.email!,
          from: process.env.SENDGRID_FROM_EMAIL || 'noreply@quikpik.app',
          subject: 'Your password has been changed',
          html,
        });
      } catch (emailError) {
        console.error('Failed to send password-changed notification email:', emailError);
      }

      res.json({ message: "Password updated successfully" });
    } catch (error) {
      console.error("Error changing team member password:", error);
      res.status(500).json({ message: "Failed to change password" });
    }
  });

  // POST /api/team-members/:id/reset-password
  app.post('/api/team-members/:id/reset-password', requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;

      // Only the wholesaler owner can trigger this — not a team_member themselves
      if (req.user.role === 'team_member') {
        return res.status(403).json({ message: "Only the account owner can reset team member passwords" });
      }

      const requestingUserId = req.user.id;

      // Ownership check — same pattern as delete/suspend
      const allMembers = await storage.getAllTeamMembers();
      const target = allMembers.find(m => m.id === parseInt(id));
      if (!target || target.wholesalerId !== requestingUserId) {
        return res.status(403).json({ message: "Not authorised to reset this team member's password" });
      }

      // Pending members haven't accepted the invite / set a password yet
      if (target.status === 'pending') {
        return res.status(400).json({ message: "This member hasn't accepted their invite yet. Use 'Resend invite' instead." });
      }

      // Find their user account by email
      const userRecord = await storage.getUserByEmail(target.email, 'team_member');
      if (!userRecord) {
        return res.status(400).json({ message: "No active account found for this team member" });
      }

      // Generate reset token and store it
      const { token, hashedToken } = generateResetToken();
      const expiresAt = createResetExpiration();
      await storage.updateUser(userRecord.id, { passwordResetToken: hashedToken, passwordResetExpires: expiresAt });

      // Get wholesaler branding for the email
      const wholesaler = await storage.getUser(requestingUserId);
      const branding = {
        businessName: wholesaler?.businessName || 'Quikpik Merchant',
        logoUrl: getEmailLogoUrl(requestingUserId, wholesaler?.logoType, wholesaler?.logoUrl),
      };

      // Send the reset email to the team member
      await sendPasswordResetEmail(target.email, token, target.firstName || undefined, branding);

      res.json({ message: `Password reset email sent to ${target.firstName || target.email}` });
    } catch (error) {
      console.error("Error sending team member password reset:", error);
      res.status(500).json({ message: "Failed to send password reset email" });
    }
  });

  // GET /api/team-invitation/:token
  app.get('/api/team-invitation/:token', async (req, res) => {
    try {
      const { token } = req.params;
      const { email } = req.query;
      
      if (!email) {
        return res.status(400).json({ message: "Email parameter is required" });
      }

      // Look up by inviteToken (secure UUID) or fall back to id for legacy links
      const allMembers = await storage.getAllTeamMembers();
      const teamMember = allMembers.find(member => 
        (member.inviteToken === token || member.id === parseInt(token)) &&
        member.email === email && 
        member.status === 'pending'
      );
      
      if (!teamMember) {
        return res.status(404).json({ message: "Invalid or expired invitation" });
      }

      if (isInvitationExpired(teamMember.invitedAt)) {
        return res.status(410).json({ message: "This invitation has expired. Please ask your team owner to send a new one." });
      }

      const wholesaler = await storage.getUser(teamMember.wholesalerId);
      
      res.json({
        teamMember: {
          firstName: teamMember.firstName,
          lastName: teamMember.lastName,
          email: teamMember.email,
          role: teamMember.role
        },
        wholesaler: {
          name: wholesaler?.firstName + ' ' + (wholesaler?.lastName || ''),
          businessName: wholesaler?.businessName,
          email: wholesaler?.email
        }
      });
    } catch (error) {
      console.error("Error fetching team invitation:", error);
      res.status(500).json({ message: "Failed to fetch invitation details" });
    }
  });

  // POST /api/team-invitation/accept
  app.post('/api/team-invitation/accept', async (req, res) => {
    try {
      const { token, email, firstName, lastName, password } = req.body;
      
      if (!token || !email || !firstName || !password) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      // Look up by inviteToken (secure UUID) or fall back to id for legacy links
      const allMembers = await storage.getAllTeamMembers();
      const teamMember = allMembers.find(member => 
        (member.inviteToken === token || member.id === parseInt(token)) &&
        member.email === email && 
        member.status === 'pending'
      );
      
      if (!teamMember) {
        return res.status(404).json({ message: "Invalid or expired invitation" });
      }

      if (isInvitationExpired(teamMember.invitedAt)) {
        return res.status(410).json({ message: "This invitation has expired. Please ask your team owner to send a new one." });
      }

      const userId = `team_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const userData = {
        id: userId,
        email: teamMember.email,
        firstName: firstName,
        lastName: lastName || '',
        role: 'team_member',
        wholesalerId: teamMember.wholesalerId,
        subscriptionTier: 'team_member',
        businessName: '',
        businessDescription: '',
        businessPhone: '',
        businessAddress: '',
        preferredCurrency: 'GBP',
        onboardingCompleted: true,
        onboardingStep: 0,
        isFirstLogin: false,
        productLimit: -1,
      };

      const newUser = await storage.createUserWithPassword(userData, password);
      
      // Mark invitation as accepted (sets joinedAt)
      await storage.updateTeamMemberStatus(teamMember.id, 'active');

      // Notify the wholesaler that their team member has joined
      try {
        const wholesaler = await storage.getUser(teamMember.wholesalerId);
        if (wholesaler?.email && process.env.SENDGRID_API_KEY) {
          sgMail.setApiKey(process.env.SENDGRID_API_KEY);
          const fullName = `${firstName}${lastName ? ' ' + lastName : ''}`;
          const notifyBody = `${emailHeading('Team Member Joined!', { size: '22px', color: '#10b981' })}<p style="margin:0 0 16px"><strong>${fullName}</strong> has accepted your invitation and joined <strong>${wholesaler.businessName || wholesaler.firstName}</strong> on Quikpik. They can now sign in using the Team Member tab and start working.</p>${emailCard(`<p style="margin:0 0 4px"><strong>Name:</strong> ${fullName}</p><p style="margin:0 0 4px"><strong>Email:</strong> ${teamMember.email}</p><p style="margin:0"><strong>Role:</strong> ${teamMember.role.charAt(0).toUpperCase() + teamMember.role.slice(1)}</p>`)}<p style="margin:16px 0 0;color:#6b7280;font-size:13px">You can manage your team members from the Team Management page in your dashboard.</p>`;
          await sgMail.send({
            to: wholesaler.email,
            from: { email: 'hello@quikpik.co', name: 'Quikpik Team' },
            subject: `${fullName} has joined your team`,
            html: wrapCustomerEmail(notifyBody, { businessName: wholesaler.businessName || wholesaler.firstName || 'Quikpik', logoUrl: getEmailLogoUrl(wholesaler.id, wholesaler.logoType, wholesaler.logoUrl) }, { preheader: `${fullName} accepted your invitation and is ready to work` })
          });
          console.log('✅ Wholesaler notified of new team member:', wholesaler.email);
        }
      } catch (notifyErr) {
        console.error('Warning: failed to notify wholesaler of team member join:', notifyErr);
      }
      
      res.json({ 
        message: "Team member account created successfully",
        userId: newUser.id 
      });
    } catch (error) {
      console.error("Error accepting team invitation:", error);
      res.status(500).json({ message: "Failed to accept invitation" });
    }
  });

  // POST /api/auth/team-login
  app.post('/api/auth/team-login', async (req: any, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }

      // Find user by email
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      // Check if this is a team member account
      if (user.subscriptionTier !== 'team_member') {
        return res.status(401).json({ message: "Please use the Business Owner tab to sign in" });
      }

      // Authenticate user with encrypted password
      const authenticatedUser = await storage.authenticateUser(email, password);
      if (!authenticatedUser) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      // Find the team member record to get wholesaler info and check status
      const allMembers = await storage.getAllTeamMembers();
      const teamMember = allMembers.find((tm: any) => tm.email.toLowerCase() === email.toLowerCase());

      // Block suspended team members
      if (teamMember?.status === 'suspended') {
        return res.status(403).json({ message: "Your account has been suspended. Please contact your team administrator." });
      }
      
      // Get wholesaler information if team member is linked
      let wholesalerInfo = null;
      if (teamMember?.wholesalerId) {
        wholesalerInfo = await storage.getUser(teamMember.wholesalerId);
      }

      // Record last login time
      if (teamMember?.id) {
        await storage.updateTeamMemberLastLogin(teamMember.id);
      }

      // Create session for team member with wholesaler context
      req.session.user = {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: 'team_member',
        businessName: wholesalerInfo?.businessName || user.businessName,
        isTeamMember: true,
        wholesalerId: teamMember?.wholesalerId || user.id
      };

      res.json({
        success: true,
        message: "Login successful",
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: 'team_member',
          businessName: wholesalerInfo?.businessName || user.businessName,
          isTeamMember: true
        }
      });

    } catch (error) {
      console.error("Team member login error:", error);
      res.status(500).json({ message: "Login failed. Please try again." });
    }
  });

  // POST /api/auth/login
  app.post('/api/auth/login', async (req: any, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }

      // Find user by email
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      // Check if this user is actually a team member of another business
      const teamMembers = await storage.getAllTeamMembers();
      const teamMember = teamMembers.find((tm: any) => tm.email.toLowerCase() === email.toLowerCase());
      
      // If user is a team member, get wholesaler info and treat as team member login
      if (teamMember) {
        const wholesalerInfo = await storage.getUser(teamMember.wholesalerId);
        
        // Create session for team member with wholesaler context
        req.session.user = {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: 'team_member',
          businessName: wholesalerInfo?.businessName || user.businessName,
          isTeamMember: true,
          wholesalerId: teamMember.wholesalerId
        };

        return res.json({
          success: true,
          message: "Login successful",
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: 'team_member',
            businessName: wholesalerInfo?.businessName || user.businessName,
            isTeamMember: true
          }
        });
      }

      // Check if this is a team member account tier
      if (user.subscriptionTier === 'team_member') {
        return res.status(401).json({ message: "Please use the Team Member tab to sign in" });
      }

      // Authenticate user with encrypted password
      const authenticatedUser = await storage.authenticateUser(email, password);
      if (!authenticatedUser) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      // Create session for business owner
      req.session.user = {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        businessName: user.businessName,
        isTeamMember: false
      };

      res.json({
        success: true,
        message: "Login successful",
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          businessName: user.businessName
        }
      });

    } catch (error) {
      console.error("Business owner login error:", error);
      res.status(500).json({ message: "Login failed. Please try again." });
    }
  });

  // POST /api/auth/signup
  app.post('/api/auth/signup', async (req, res) => {
    const signupLogId = `signup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const logSignup = (step: string, details?: Record<string, unknown>) => {
      console.log(`[${signupLogId}] ${step}`, {
        timestamp: new Date().toISOString(),
        ...(details || {})
      });
    };
    try {
      const {
        firstName,
        lastName,
        email,
        password,
        businessName,
        businessDescription,
        businessPhone,
        businessEmail,
        streetAddress,
        city,
        state,
        postalCode,
        country,
        defaultCurrency,
        businessType,
        estimatedMonthlyVolume
      } = req.body;
      const emailDomain = typeof email === 'string' && email.includes('@') ? email.split('@').pop() : 'missing';
      logSignup('Signup started', { emailDomain, hasBusinessName: !!businessName });

      // CRITICAL FIX: Validate required fields including password
      if (!email || !password || !firstName || !lastName) {
        logSignup('Signup validation failed: missing required fields');
        return res.status(400).json({ 
          message: "Email, password, first name, and last name are required",
          field: "validation"
        });
      }

      // CRITICAL FIX: Validate password strength
      const passwordValidation = validatePassword(password);
      if (!passwordValidation.isStrong) {
        logSignup('Signup validation failed: weak password');
        return res.status(400).json({ 
          message: "Password does not meet security requirements",
          field: "password",
          errors: passwordValidation.messages
        });
      }

      // Check if user already exists
      logSignup('Checking existing user');
      const existingUser = await storage.getUserByEmail(email);
      logSignup('Existing user check complete');
      if (existingUser) {
        logSignup('Signup blocked: email already exists');
        return res.status(400).json({ 
          message: "An account with this email already exists",
          field: "email"
        });
      }

      // Create the business address string
      const businessAddress = streetAddress && city ? `${streetAddress}, ${city}, ${state} ${postalCode}, ${country}` : '';

      // Create user account with generated ID
      const userId = `signup_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const userData = {
        id: userId,
        email: email,
        firstName: firstName,
        lastName: lastName,
        role: 'wholesaler',
        businessName: businessName,
        businessDescription: businessDescription,
        businessPhone: businessPhone,
        businessEmail: businessEmail,
        businessAddress: businessAddress,
        preferredCurrency: defaultCurrency,
        defaultCurrency: defaultCurrency,
        businessType: businessType,
        estimatedMonthlyVolume: estimatedMonthlyVolume,
        onboardingCompleted: false,
        onboardingStep: 0,
        onboardingSkipped: false,
        isFirstLogin: true,
        productLimit: 2
      };

      // CRITICAL FIX: Use createUserWithPassword to hash and store password
      logSignup('Creating user with password');
      const newUser = await storage.createUserWithPassword(userData, password, (step) => {
        logSignup(step);
      });
      
      logSignup('User created successfully', { userId: newUser.id });

      // Create session for the new user
      (req.session as any).user = {
        id: newUser.id,
        email: newUser.email,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        role: newUser.role,
        businessName: newUser.businessName
      };
      logSignup('Session user set');

      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        });
      });
      logSignup('Session saved');

      res.json({
        success: true,
        message: "Account created successfully",
        user: {
          id: newUser.id,
          email: newUser.email,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
          role: newUser.role,
          businessName: newUser.businessName
        }
      });
      logSignup('Signup response sent');

    } catch (error) {
      console.error(`[${signupLogId}] Signup error:`, {
        timestamp: new Date().toISOString(),
        error
      });
      res.status(500).json({ message: "Failed to create account. Please try again." });
    }
  });

  // POST /api/auth/forgot-password
  app.post('/api/auth/forgot-password', async (req, res) => {
    try {
      const { email } = req.body;
      const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
      
      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }
      
      // Rate limiting: 5 attempts per email per hour, 10 attempts per IP per hour
      const now = Date.now();
      const emailKey = `email:${email}`;
      const ipKey = `ip:${clientIP}`;
      
      // Check email rate limit
      const emailAttempts = passwordResetAttempts.get(emailKey);
      if (emailAttempts) {
        // Reset counter if last attempt was more than 1 hour ago
        if (now - emailAttempts.lastAttempt > 3600000) {
          emailAttempts.count = 0;
        }
        if (emailAttempts.count >= 5) {
          return res.status(429).json({ 
            error: "Too many password reset requests for this email. Please try again later." 
          });
        }
      }
      
      // Check IP rate limit
      const ipAttempts = passwordResetAttempts.get(ipKey);
      if (ipAttempts) {
        if (now - ipAttempts.lastAttempt > 3600000) {
          ipAttempts.count = 0;
        }
        if (ipAttempts.count >= 10) {
          return res.status(429).json({ 
            error: "Too many password reset requests from this IP. Please try again later." 
          });
        }
      }
      
      // Update rate limiting counters
      passwordResetAttempts.set(emailKey, {
        count: (emailAttempts?.count || 0) + 1,
        lastAttempt: now
      });
      passwordResetAttempts.set(ipKey, {
        count: (ipAttempts?.count || 0) + 1,
        lastAttempt: now
      });
      
      // Check if user exists
      const user = await storage.getUserByEmail(email);
      
      if (!user) {
        // Don't reveal if email exists - always return success for security
        return res.json({ 
          success: true, 
          message: "If an account with that email exists, we've sent a password reset link." 
        });
      }
      
      // Generate reset token and expiration
      const { token, hashedToken } = generateResetToken();
      const expiresAt = createResetExpiration();
      
      // Store HASHED token in database for security
      await storage.setPasswordResetToken(email, hashedToken, expiresAt);
      
      // Send password reset email with PLAIN token
      await sendPasswordResetEmail(email, token, user.firstName, { businessName: user.businessName, logoUrl: getEmailLogoUrl(user.id, user.logoType, user.logoUrl) });
      
      console.log(`🔐 Password reset email sent to ${email}`);
      
      res.json({ 
        success: true, 
        message: "If an account with that email exists, we've sent a password reset link." 
      });
      
    } catch (error) {
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
      
      // Hash the token for database comparison
      const hashedToken = hashResetToken(token);
      
      // Validate hashed token
      const user = await storage.validatePasswordResetToken(hashedToken);
      
      if (!user) {
        return res.status(400).json({ error: "Invalid or expired reset token" });
      }
      
      res.json({ 
        success: true, 
        message: "Valid reset token",
        email: user.email // Safe to return email for form pre-filling
      });
      
    } catch (error) {
      console.error('Password reset token validation error:', error);
      res.status(500).json({ error: "Failed to validate reset token" });
    }
  });

  // POST /api/auth/reset-password
  app.post('/api/auth/reset-password', async (req, res) => {
    try {
      const { token, password } = req.body;
      
      if (!token || !password) {
        return res.status(400).json({ error: "Token and new password are required" });
      }
      
      // Validate password strength
      const validation = validatePassword(password);
      if (!validation.isStrong) {
        return res.status(400).json({ 
          error: "Password does not meet security requirements",
          messages: validation.messages 
        });
      }
      
      // Hash the token for database comparison
      const hashedToken = hashResetToken(token);
      
      // Reset password with hashed token
      const user = await storage.resetPasswordWithToken(hashedToken, password);
      
      if (!user) {
        return res.status(400).json({ error: "Invalid or expired reset token" });
      }
      
      console.log(`🔐 Password successfully reset for ${user.email}`);
      
      res.json({ 
        success: true, 
        message: "Password has been reset successfully. You can now log in with your new password." 
      });
      
    } catch (error) {
      console.error('Password reset error:', error);
      res.status(500).json({ error: "Failed to reset password" });
    }
  });

  // GET /api/tab-permissions/check-all
  app.get('/api/tab-permissions/check-all', requireAuth, async (req: any, res) => {
    try {
      const user = req.user;
      
      // Only for team members
      if (user.role !== 'team_member' || !user.wholesalerId) {
        return res.json({}); // Return empty object for non-team members
      }
      
      const tabNames = ['dashboard', 'products', 'orders', 'customers', 'campaigns', 'analytics', 'integrations', 'marketplace', 'team-management', 'subscription', 'settings'];
      const userRole = 'member';
      const permissionChecks: Record<string, boolean> = {};
      
      // Check access for each tab
      for (const tabName of tabNames) {
        permissionChecks[tabName] = await storage.checkTabAccess(user.wholesalerId, tabName, userRole);
      }
      res.json(permissionChecks);
    } catch (error) {
      console.error("Error checking all tab access:", error);
      res.status(500).json({ message: "Failed to check tab access" });
    }
  });

}
