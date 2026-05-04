import type { Express } from "express";
import {
  createResetExpiration, db, emailBadge, emailCard, emailHeading, eq,
  generateResetToken, getEmailLogoUrl, getPlanLimits,
  hashPassword, isInvitationExpired, requireAuth, requireOwner,
  sendEmail, sendPasswordResetEmail, sendTeamInvitationEmail,
  sgMail, sql, storage, users, verifyPassword,
  wrapCustomerEmail,
} from "./shared";
import { resolveWholesalerId } from "../utils/resolveWholesalerId";

export function registerAuthTeamRoutes(app: Express): void {
  // GET /api/tab-permissions
  app.get('/api/tab-permissions', requireAuth, async (req: any, res) => {
    try {
      const userId = resolveWholesalerId(req);
      const permissions = await storage.getTabPermissions(userId);
      res.json(permissions);
    } catch (error) {
      console.error("Error fetching tab permissions:", error);
      res.status(500).json({ message: "Failed to fetch tab permissions" });
    }
  });

  // GET /api/tab-permissions/check-all
  app.get('/api/tab-permissions/check-all', requireAuth, async (req: any, res) => {
    try {
      const user = req.user;

      if (user.role !== 'team_member' || !user.wholesalerId) {
        return res.json({});
      }

      const tabNames = ['dashboard', 'products', 'promotions', 'orders', 'customers', 'campaigns', 'analytics', 'integrations', 'marketplace', 'team-management', 'subscription', 'settings', 'finance'];
      const userRole: string = user.teamMemberRole || 'member';
      const permissionChecks: Record<string, boolean> = {};

      for (const tabName of tabNames) {
        permissionChecks[tabName] = await storage.checkTabAccess(user.wholesalerId, tabName, userRole);
      }
      res.json(permissionChecks);
    } catch (error) {
      console.error("Error checking all tab access:", error);
      res.status(500).json({ message: "Failed to check tab access" });
    }
  });

  // GET /api/tab-permissions/check/:tabName
  app.get('/api/tab-permissions/check/:tabName', requireAuth, async (req: any, res) => {
    try {
      const { tabName } = req.params;
      const userId = resolveWholesalerId(req);

      let hasAccess = true;
      if (req.user.role === 'team_member') {
        const teamMemberRole = req.user.teamMemberRole || 'member';
        hasAccess = await storage.checkTabAccess(userId, tabName, teamMemberRole);
      }

      res.json({ hasAccess });
    } catch (error) {
      console.error("Error checking tab access:", error);
      res.status(500).json({ hasAccess: true });
    }
  });

  // PUT /api/tab-permissions/:tabName
  app.put('/api/tab-permissions/:tabName', requireAuth, async (req: any, res) => {
    try {
      const { tabName } = req.params;
      const { isRestricted, allowedRoles } = req.body;
      const userId = req.user.id;

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

  // GET /api/team-members
  app.get('/api/team-members', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const members = await storage.getTeamMembers(userId);
      res.json(members);
    } catch (error) {
      console.error("Error fetching team members:", error);
      res.status(500).json({ message: "Failed to fetch team members" });
    }
  });

  // POST /api/team-members
  app.post('/api/team-members', requireAuth, requireOwner, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { email, firstName, lastName, phoneNumber, role, permissions } = req.body;

      const currentCount = await storage.getTeamMembersCount(userId);
      const userSubscription = await storage.getUser(userId);
      const tier = userSubscription?.subscriptionTier || 'free';
      const limit = getPlanLimits(tier).teamMembers;

      if (limit >= 0 && currentCount >= limit) {
        return res.status(403).json({
          message: `Your ${tier} plan allows up to ${limit} team member${limit === 1 ? '' : 's'}. Please upgrade to add more team members.`
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

      try {
        await sendTeamInvitationEmail(teamMember, req.user);
      } catch (emailError) {
        console.error("Error sending invitation email:", emailError);
      }

      res.json(teamMember);
    } catch (error) {
      console.error("Error creating team member:", error);
      res.status(500).json({ message: "Failed to create team member" });
    }
  });

  // PATCH /api/team-members/:id/role
  app.patch('/api/team-members/:id/role', requireAuth, requireOwner, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const { role } = req.body;

      if (!role || !['admin', 'member', 'viewer'].includes(role)) {
        return res.status(400).json({ message: "Invalid role. Must be 'admin', 'member', or 'viewer'" });
      }

      const members = await storage.getTeamMembers(userId);
      const teamMember = members.find((m: any) => m.id === parseInt(id));

      if (!teamMember) {
        return res.status(404).json({ message: "Team member not found" });
      }

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
      const ownerId = resolveWholesalerId(req);
      const { id } = req.params;
      const { phoneNumber } = req.body;

      const allMembers = await storage.getTeamMembers(ownerId);

      if (req.user.role === 'team_member') {
        const requestingMember = allMembers.find((m: any) => m.email === req.user.email);
        if (!requestingMember || requestingMember.role !== 'admin') {
          return res.status(403).json({ message: "Only admins can update team member phone numbers" });
        }
      }

      const target = allMembers.find((m: any) => m.id === parseInt(id));
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
  app.delete('/api/team-members/:id', requireAuth, requireOwner, async (req: any, res) => {
    try {
      const { id } = req.params;
      const requestingUserId = resolveWholesalerId(req);

      const allMembers = await storage.getAllTeamMembers();
      const target = allMembers.find((m: any) => m.id === parseInt(id));
      if (!target || target.wholesalerId !== requestingUserId) {
        return res.status(403).json({ message: "Not authorised to remove this team member" });
      }

      await storage.deleteTeamMember(parseInt(id));

      try {
        await db.execute(
          sql`DELETE FROM sessions WHERE sess->'user'->>'email' = ${target.email}`
        );
      } catch (_) {
        // Non-fatal: session cleanup failure should not prevent the delete response
      }

      res.json({ message: "Team member removed successfully" });
    } catch (error) {
      console.error("Error deleting team member:", error);
      res.status(500).json({ message: "Failed to delete team member" });
    }
  });

  // PATCH /api/team-members/:id/status
  app.patch('/api/team-members/:id/status', requireAuth, requireOwner, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const requestingUserId = resolveWholesalerId(req);

      if (!['active', 'suspended'].includes(status)) {
        return res.status(400).json({ message: "Status must be 'active' or 'suspended'" });
      }

      const allMembers = await storage.getAllTeamMembers();
      const target = allMembers.find((m: any) => m.id === parseInt(id));
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
  app.post('/api/team-members/:id/resend-invite', requireAuth, requireOwner, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;

      const members = await storage.getTeamMembers(userId);
      const teamMember = members.find((m: any) => m.id === parseInt(id));

      if (!teamMember) {
        return res.status(404).json({ message: "Team member not found" });
      }

      if (teamMember.status !== 'pending') {
        return res.status(400).json({ message: "Can only resend invites to pending members" });
      }

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

      if (req.user.role === 'team_member') {
        return res.status(403).json({ message: "Only the account owner can reset team member passwords" });
      }

      const requestingUserId = req.user.id;

      const allMembers = await storage.getAllTeamMembers();
      const target = allMembers.find((m: any) => m.id === parseInt(id));
      if (!target || target.wholesalerId !== requestingUserId) {
        return res.status(403).json({ message: "Not authorised to reset this team member's password" });
      }

      if (target.status === 'pending') {
        return res.status(400).json({ message: "This member hasn't accepted their invite yet. Use 'Resend invite' instead." });
      }

      const userRecord = await storage.getUserByEmail(target.email, 'team_member');
      if (!userRecord) {
        return res.status(400).json({ message: "No active account found for this team member" });
      }

      const { token, hashedToken } = generateResetToken();
      const expiresAt = createResetExpiration();
      await storage.updateUser(userRecord.id, { passwordResetToken: hashedToken, passwordResetExpires: expiresAt });

      const wholesaler = await storage.getUser(requestingUserId);
      const branding = {
        businessName: wholesaler?.businessName || 'Quikpik Merchant',
        logoUrl: getEmailLogoUrl(requestingUserId, wholesaler?.logoType, wholesaler?.logoUrl),
      };

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

      const allMembers = await storage.getAllTeamMembers();
      const teamMember = allMembers.find((m: any) =>
        (m.inviteToken === token || m.id === parseInt(token)) &&
        m.email === email &&
        m.status === 'pending'
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

      const allMembers = await storage.getAllTeamMembers();
      const teamMember = allMembers.find((m: any) =>
        (m.inviteToken === token || m.id === parseInt(token)) &&
        m.email === email &&
        m.status === 'pending'
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
        firstName,
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
      await storage.updateTeamMemberStatus(teamMember.id, 'active');

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
        }
      } catch (notifyErr) {
        console.error('Warning: failed to notify wholesaler of team member join:', notifyErr);
      }

      res.json({ message: "Team member account created successfully", userId: newUser.id });
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

      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      if (user.subscriptionTier !== 'team_member') {
        return res.status(401).json({ message: "Please use the Business Owner tab to sign in" });
      }

      const authenticatedUser = await storage.authenticateUser(email, password);
      if (!authenticatedUser) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      const allMembers = await storage.getAllTeamMembers();
      const teamMember = allMembers.find((tm: any) => tm.email.toLowerCase() === email.toLowerCase());

      if (!teamMember) {
        return res.status(403).json({ message: "Your access has been removed. Please contact your team administrator." });
      }

      if (teamMember.status === 'suspended') {
        return res.status(403).json({ message: "Your account has been suspended. Please contact your team administrator." });
      }

      let wholesalerInfo = null;
      if (teamMember?.wholesalerId) {
        wholesalerInfo = await storage.getUser(teamMember.wholesalerId);
      }

      if (teamMember?.id) {
        await storage.updateTeamMemberLastLogin(teamMember.id);
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
        lastName: user.lastName, role: 'team_member',
        businessName: wholesalerInfo?.businessName || user.businessName,
        isTeamMember: true,
        wholesalerId: teamMember?.wholesalerId || user.id
      };

      res.json({
        success: true, message: "Login successful",
        user: {
          id: user.id, email: user.email, firstName: user.firstName,
          lastName: user.lastName, role: 'team_member',
          businessName: wholesalerInfo?.businessName || user.businessName, isTeamMember: true
        }
      });
    } catch (error) {
      console.error("Team member login error:", error);
      res.status(500).json({ message: "Login failed. Please try again." });
    }
  });
}
