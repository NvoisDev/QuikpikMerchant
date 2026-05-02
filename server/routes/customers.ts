import type { Express } from "express";
import {
  ReliableSMSService, and, customerGroups, customerRegistrationRequests, db, emailCard,
  emailHeading, eq, formatPhoneToInternational, getCustomerGroupLimit, getEmailLogoUrl,
  insertCustomerGroupSchema, multiWholesalerService, or, orders, parseCustomerName, products,
  requireAuth, requireMemberPermission, requireNotViewer, sendEmail, sendWelcomeMessages, storage, twilio,
  users, validatePhoneNumber, whatsAppBusinessService, wholesalerCustomerRelationships,
  wrapCustomerEmail, z
} from "./shared";

export function registerCustomerRoutes(app: Express): void {
  // GET /api/wholesaler/customer-update-notifications
  app.get('/api/wholesaler/customer-update-notifications', requireAuth, async (req: any, res) => {
    try {
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;

      const limit = parseInt(req.query.limit as string) || 50;
      
      const notifications = await storage.getCustomerProfileUpdateNotifications(targetUserId, limit);
      
      // Add customer details to notifications
      const enrichedNotifications = await Promise.all(
        notifications.map(async (notification) => {
          const customer = await storage.getUser(notification.customerId);
          return {
            ...notification,
            customerName: customer ? (`${customer.firstName || ''} ${customer.lastName || ''}`.trim() || customer.businessName || 'Unknown Customer') : 'Unknown Customer',
            customerEmail: customer?.email,
            customerPhone: customer?.phoneNumber
          };
        })
      );
      
      res.json({
        success: true,
        notifications: enrichedNotifications
      });
    } catch (error) {
      console.error("❌ Error fetching customer update notifications:", error);
      res.status(500).json({ error: "Failed to fetch notifications" });
    }
  });

  // PATCH /api/wholesaler/customer-update-notifications/:notificationId/read
  app.patch('/api/wholesaler/customer-update-notifications/:notificationId/read', requireAuth, async (req: any, res) => {
    try {
      const { notificationId } = req.params;
      
      await storage.markNotificationAsRead(parseInt(notificationId));
      
      res.json({
        success: true,
        message: "Notification marked as read"
      });
    } catch (error) {
      console.error("❌ Error marking notification as read:", error);
      res.status(500).json({ error: "Failed to mark notification as read" });
    }
  });

  // GET /api/customer-groups
  app.get('/api/customer-groups', requireAuth, async (req: any, res) => {
    try {
      // Use parent company ID for team members
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
        
      const groups = await storage.getCustomerGroups(targetUserId);
      res.json(groups);
    } catch (error) {
      console.error("Error fetching customer groups:", error);
      res.status(500).json({ message: "Failed to fetch customer groups" });
    }
  });

  // GET /api/customer-groups/all-members
  app.get('/api/customer-groups/all-members', requireAuth, async (req: any, res) => {
    try {
      console.log("Fetching all customer members for user:", req.user?.id);
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      
      console.log("Target user ID:", targetUserId);
      const customerGroups = await storage.getCustomerGroups(targetUserId);
      console.log("Found customer groups:", customerGroups.length);
      
      const allMembers: any[] = [];
      const seenCustomers = new Set<string>();
      
      for (const group of customerGroups) {
        console.log(`Fetching members for group: ${group.name} (ID: ${group.id})`);
        const members = await storage.getGroupMembers(group.id);
        console.log(`Found ${members.length} members in group ${group.name}`);
        console.log("Member data:", members.map(m => ({ firstName: m.firstName, lastName: m.lastName, phoneNumber: m.phoneNumber })));
        
        for (const member of members) {
          // Use phone number as unique identifier instead of userId since customers might share userIds
          const customerKey = `${member.phoneNumber}-${member.firstName}-${member.lastName}`;
          
          if (!seenCustomers.has(customerKey)) {
            seenCustomers.add(customerKey);
            allMembers.push({
              id: `customer-${allMembers.length + 1}`,
              firstName: member.firstName,
              lastName: member.lastName,
              phoneNumber: member.phoneNumber,
              customerGroups: [group.name]
            });
          } else {
            // Add group to existing customer
            const existingCustomer = allMembers.find(c => 
              c.phoneNumber === member.phoneNumber && 
              c.firstName === member.firstName && 
              c.lastName === member.lastName
            );
            if (existingCustomer && !existingCustomer.customerGroups.includes(group.name)) {
              existingCustomer.customerGroups.push(group.name);
            }
          }
        }
      }
      
      console.log("Total unique customers found:", allMembers.length);
      res.json(allMembers);
    } catch (error) {
      console.error("Error fetching all customer group members:", error);
      res.status(500).json({ message: "Failed to fetch customer group members" });
    }
  });

  // POST /api/customer-groups
  app.post('/api/customer-groups', requireAuth, requireNotViewer, requireMemberPermission('customers'), async (req: any, res) => {
    try {
      // Use parent company ID for team members to inherit data access
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      
      const user = await storage.getUser(targetUserId);
      
      // Check customer group limit using parent company data
      const groups = await storage.getCustomerGroupsByUser(targetUserId);
      // Team members inherit parent company subscription tier
      const effectiveSubscriptionTier = req.user.role === 'team_member' && req.user.wholesalerId 
        ? user?.subscriptionTier || 'free'
        : user?.subscriptionTier || 'free';
      const groupLimit = getCustomerGroupLimit(effectiveSubscriptionTier);
      
      if (groupLimit !== -1 && groups.length >= groupLimit) {
        const tierName = effectiveSubscriptionTier === 'free' ? 'Free' : 
                         effectiveSubscriptionTier === 'standard' ? 'Standard' : 'Premium';
        
        return res.status(403).json({ 
          error: "Upgrade Required",
          message: `You've reached your ${tierName} plan limit of ${groupLimit} customer groups. Upgrade to create additional groups and organize more customers.`,
          currentCount: groups.length,
          limit: groupLimit,
          tier: user?.subscriptionTier || 'free',
          userFriendly: true
        });
      }
      
      const groupData = insertCustomerGroupSchema.parse({
        ...req.body,
        wholesalerId: targetUserId
      });
      const group = await storage.createCustomerGroup(groupData);
      res.json(group);
    } catch (error) {
      console.error("Error creating customer group:", error);
      console.error("Request body:", req.body);
      console.error("User ID:", req.user?.id);
      console.error("Target User ID:", req.user.role === 'team_member' ? req.user.wholesalerId : req.user.id);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid group data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create customer group", error: (error as Error).message });
    }
  });

  // PUT /api/customer-groups/:id
  app.put('/api/customer-groups/:id', requireAuth, requireNotViewer, requireMemberPermission('customers'), async (req: any, res) => {
    try {
      // Use parent company ID for team members to inherit data access
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      
      const groupId = parseInt(req.params.id);
      const { name, description } = req.body;

      if (!name || typeof name !== 'string') {
        return res.status(400).json({ message: "Name is required" });
      }

      // Verify the user owns this customer group using parent company data
      const groups = await storage.getCustomerGroups(targetUserId);
      const group = groups.find(g => g.id === groupId);
      
      if (!group) {
        return res.status(404).json({ message: "Customer group not found" });
      }

      const updatedGroup = await storage.updateCustomerGroup(groupId, { 
        name, 
        description: description || undefined 
      });
      res.json(updatedGroup);
    } catch (error) {
      console.error("Error updating customer group:", error);
      res.status(500).json({ message: "Failed to update customer group" });
    }
  });

  // DELETE /api/customer-groups/:id
  app.delete('/api/customer-groups/:id', requireAuth, requireNotViewer, requireMemberPermission('customers'), async (req: any, res) => {
    try {
      // Use parent company ID for team members to inherit data access
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      
      const groupId = parseInt(req.params.id);

      // Verify the user owns this customer group using parent company data
      const groups = await storage.getCustomerGroups(targetUserId);
      const group = groups.find(g => g.id === groupId);
      
      if (!group) {
        return res.status(404).json({ message: "Customer group not found" });
      }

      // Delete the customer group (this should cascade delete members)
      await storage.deleteCustomerGroup(groupId);
      
      res.json({
        success: true,
        message: "Customer group deleted successfully"
      });
    } catch (error) {
      console.error("Error deleting customer group:", error);
      res.status(500).json({ message: "Failed to delete customer group" });
    }
  });

  // POST /api/customer-groups/:groupId/members
  app.post('/api/customer-groups/:groupId/members', requireAuth, requireNotViewer, requireMemberPermission('customers'), async (req: any, res) => {
    try {
      // Use parent company ID for team members to inherit data access
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      
      const groupId = parseInt(req.params.groupId);
      const { phoneNumber, name } = req.body;
      
      if (!phoneNumber || !name) {
        return res.status(400).json({ message: "Phone number and name are required" });
      }

      // Automatically format phone number to international format
      const formattedPhoneNumber = formatPhoneToInternational(phoneNumber);
      
      // Validate the formatted phone number
      if (!validatePhoneNumber(formattedPhoneNumber)) {
        return res.status(400).json({ 
          message: `Invalid phone number format. Please provide a valid phone number (e.g., 07507659550 or +447507659550)` 
        });
      }

      // Get the customer group to verify ownership using parent company data
      const groups = await storage.getCustomerGroups(targetUserId);
      const group = groups.find(g => g.id === groupId);
      
      if (!group) {
        return res.status(404).json({ message: "Customer group not found" });
      }

      // Create or find customer with formatted phone number
      let customer = await storage.getUserByPhone(formattedPhoneNumber);
      let isNewCustomer = false;
      const { firstName: parsedFirst, lastName: parsedLast } = parseCustomerName(name);
      const displayNameValue = name.trim() || null;
      
      if (!customer) {
        // Create a new customer/retailer account
        customer = await storage.createCustomer({
          phoneNumber: formattedPhoneNumber,
          firstName: parsedFirst,
          lastName: parsedLast,
          role: "retailer",
          wholesalerId: targetUserId, // Link customer to their wholesaler
        });
        isNewCustomer = true;
        // Create WCR for this wholesaler with the per-wholesaler name
        await db.insert(wholesalerCustomerRelationships).values({
          customerId: customer.id,
          wholesalerId: targetUserId,
          status: 'active',
          displayName: displayNameValue,
        });
      } else {
        // Existing customer — ensure this wholesaler's WCR row exists with their chosen name
        const existingWcr = await db.select()
          .from(wholesalerCustomerRelationships)
          .where(and(
            eq(wholesalerCustomerRelationships.customerId, customer.id),
            eq(wholesalerCustomerRelationships.wholesalerId, targetUserId)
          ))
          .limit(1);
        if (existingWcr.length === 0) {
          await db.insert(wholesalerCustomerRelationships).values({
            customerId: customer.id,
            wholesalerId: targetUserId,
            status: 'active',
            displayName: displayNameValue,
          });
        } else {
          await db.update(wholesalerCustomerRelationships)
            .set({ displayName: displayNameValue, status: 'active' })
            .where(and(
              eq(wholesalerCustomerRelationships.customerId, customer.id),
              eq(wholesalerCustomerRelationships.wholesalerId, targetUserId)
            ));
        }
      }

      // Add customer to the group
      await storage.addCustomerToGroup(groupId, customer.id);

      // Send multi-channel welcome notifications to new customers
      if (isNewCustomer) {
        try {
          const wholesaler = await storage.getUser(targetUserId);
          const businessName = wholesaler?.businessName || "Your Supplier";
          
          // Get the application domain for customer portal link
          const portalUrl = `https://quikpik.app/customer/${targetUserId}`;
          const lastFourDigits = formattedPhoneNumber.slice(-4);
          
          // Portal access instructions
          const accessInstructions = `To access your customer portal:\n1. Visit: ${portalUrl}\n2. Enter last 4 digits of your phone: ${lastFourDigits}\n3. Enter the SMS code sent to your phone`;
          
          console.log(`📱 Sending welcome notifications to ${formattedPhoneNumber} for ${businessName}`);
          console.log(`Portal URL: ${portalUrl}`);
          console.log(`Last 4 digits for login: ${lastFourDigits}`);
          
          let notificationResults = {
            sms: false,
            email: false,
            whatsapp: false
          };

          // 1. Send SMS notification with portal access instructions
          try {
            const smsMessage = `🎉 Welcome to ${businessName}!\n\nHi ${name}! You've been added to our wholesale customer network.\n\n${accessInstructions}\n\nYou can browse products, place orders, and track deliveries through our customer portal.\n\nQuestions? Contact us anytime!`;
            
            // Use Twilio directly for welcome message since it's not a verification code
            if (ReliableSMSService.isConfigured()) {
              const twilio = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
              
              const message = await twilio.messages.create({
                body: smsMessage,
                from: process.env.TWILIO_PHONE_NUMBER,
                to: formattedPhoneNumber,
                riskCheck: 'disable'
              });
              
              notificationResults.sms = true;
              console.log(`✅ Welcome SMS sent to ${formattedPhoneNumber}: ${message.sid}`);
            } else {
              console.log(`⚠️ SMS service not configured, skipping SMS notification`);
            }
          } catch (smsError) {
            console.error(`SMS notification error for ${formattedPhoneNumber}:`, smsError);
          }

          // 2. Send email notification if customer has email
          if (customer.email) {
            try {
              const emailSubject = `Welcome to ${businessName} - Your Wholesale Portal Access`;
              const welcomeBody = `${emailHeading('Welcome!', { size: '22px', color: '#10b981' })}<p style="font-size:16px;margin:0 0 8px">Dear ${name},</p><p style="margin:0 0 20px">You've been successfully added to our wholesale customer network. We're delighted to have you on board!</p>${emailCard(`${emailHeading('Your Benefits', { size: '16px' })}<ul style="margin:0;padding-left:20px;color:#374151;font-size:14px"><li style="margin-bottom:6px">Browse our complete product catalog</li><li style="margin-bottom:6px">Access special wholesale pricing</li><li style="margin-bottom:6px">Place orders 24/7 through our customer portal</li><li style="margin-bottom:6px">Track your order status and delivery</li><li>Receive instant stock updates and promotions</li></ul>`, { borderColor: '#a7f3d0', bgColor: '#ecfdf5' })}${emailCard(`${emailHeading('Getting Started', { size: '16px' })}<p style="margin:0;font-size:14px;color:#374151;white-space:pre-line">${accessInstructions}</p>`)}${emailCard(`${emailHeading('What You Can Do', { size: '16px' })}<ul style="margin:0;padding-left:20px;color:#374151;font-size:14px"><li style="margin-bottom:6px">View real-time product availability</li><li style="margin-bottom:6px">Compare prices and specifications</li><li style="margin-bottom:6px">Manage your order history</li><li style="margin-bottom:6px">Update your delivery preferences</li><li>Access your account information</li></ul>`)}<p style="margin:20px 0 0">If you have any questions or need assistance, please don't hesitate to contact us. We're here to help you succeed!</p>`;

              const emailSuccess = await sendEmail({
                to: customer.email,
                from: 'hello@quikpik.co',
                subject: emailSubject,
                html: wrapCustomerEmail(welcomeBody, { businessName, logoUrl: getEmailLogoUrl(wholesaler?.id, wholesaler?.logoType, wholesaler?.logoUrl) }, { preheader: `Welcome to ${businessName} - your wholesale portal is ready` })
              });

              notificationResults.email = emailSuccess;
              
              if (emailSuccess) {
                console.log(`✅ Welcome email sent to ${customer.email}`);
              } else {
                console.log(`❌ Failed to send welcome email to ${customer.email}`);
              }
            } catch (emailError) {
              console.error(`Email notification error for ${customer.email}:`, emailError);
            }
          }

          // 3. Send WhatsApp message if enabled (existing functionality)
          try {
            const whatsappMessage = `🎉 Welcome to ${businessName}!\n\nHi ${name}! 👋\n\nYou've been added to our customer network and can now:\n\n🛒 Browse our latest products\n📱 Receive instant stock updates\n💬 Place orders directly via WhatsApp\n🚚 Track your deliveries\n💰 Access special wholesale pricing\n\n🌐 **Shop Online**: ${portalUrl}\nVisit our customer portal to browse products, place orders, and track deliveries!\n\n${accessInstructions}\n\nWe'll keep you updated with:\n• New product arrivals\n• Special promotions\n• Stock availability alerts\n\nQuestions? Just reply to this message!\n\n✨ This message was powered by Quikpik Merchant`;

            const user = await storage.getUserById(targetUserId);
            if ((user as any)?.whatsappEnabled && (wholesaler as any)?.whatsappAccessToken && (wholesaler as any)?.whatsappBusinessPhoneId) {
              await whatsAppBusinessService.sendMessage(formattedPhoneNumber, whatsappMessage, {
                accessToken: (wholesaler as any).whatsappAccessToken,
                phoneNumberId: (wholesaler as any).whatsappBusinessPhoneId
              });
              notificationResults.whatsapp = true;
              console.log(`✅ Welcome WhatsApp message sent to ${formattedPhoneNumber}`);
            }
          } catch (whatsappError) {
            console.error(`WhatsApp notification error for ${formattedPhoneNumber}:`, whatsappError);
          }

          // Log notification summary
          const sentChannels = Object.entries(notificationResults)
            .filter(([_, sent]) => sent)
            .map(([channel, _]) => channel)
            .join(', ');
          
          if (sentChannels) {
            console.log(`📊 Welcome notifications sent via: ${sentChannels}`);
          } else {
            console.log(`⚠️ No welcome notifications were sent successfully`);
          }
          
        } catch (welcomeError) {
          console.error(`Failed to send welcome notifications to ${formattedPhoneNumber}:`, welcomeError);
          // Don't fail the whole operation if welcome notifications fail
        }
      }
      
      res.json({
        success: true,
        message: isNewCustomer ? `${name} added to ${group.name} and welcome message sent!` : `${name} added to ${group.name} successfully`,
        customer: {
          id: customer.id,
          name: customer.firstName,
          phoneNumber: formattedPhoneNumber,
        }
      });
    } catch (error) {
      console.error("Error adding customer to group:", error);
      res.status(500).json({ message: "Failed to add customer to group" });
    }
  });

  // POST /api/customer-groups/:groupId/members/:customerId
  app.post('/api/customer-groups/:groupId/members/:customerId', requireAuth, requireNotViewer, requireMemberPermission('customers'), async (req: any, res) => {
    try {
      // Use parent company ID for team members to inherit data access
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      
      const groupId = parseInt(req.params.groupId);
      const customerId = req.params.customerId;
      
      // Get the customer group to verify ownership using parent company data
      const groups = await storage.getCustomerGroups(targetUserId);
      const group = groups.find(g => g.id === groupId);
      
      if (!group) {
        return res.status(404).json({ message: "Customer group not found" });
      }

      // Get the customer to verify they exist
      const customer = await storage.getUser(customerId);
      if (!customer) {
        return res.status(404).json({ message: "Customer not found" });
      }

      // Check if customer is already in the group
      const existingMember = await storage.isCustomerInGroup(groupId, customerId);
      if (existingMember) {
        return res.status(400).json({ message: "Customer is already in this group" });
      }

      // Add customer to the group
      await storage.addCustomerToGroup(groupId, customerId);
      
      res.json({
        success: true,
        message: `${customer.firstName || ''} ${customer.lastName || ''} added to ${group.name} successfully`,
        customer: {
          id: customer.id,
          name: `${customer.firstName || ''} ${customer.lastName || ''}`.trim(),
          phoneNumber: customer.phoneNumber,
        }
      });
    } catch (error) {
      console.error("Error adding existing customer to group:", error);
      res.status(500).json({ message: "Failed to add customer to group" });
    }
  });

  // GET /api/customer-groups/:groupId/members
  app.get('/api/customer-groups/:groupId/members', requireAuth, async (req: any, res) => {
    try {
      // Use parent company ID for team members to inherit data access
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      
      const groupId = parseInt(req.params.groupId);
      const search = req.query.search as string;

      // Verify group ownership using parent company data
      const groups = await storage.getCustomerGroups(targetUserId);
      const group = groups.find(g => g.id === groupId);
      
      if (!group) {
        return res.status(404).json({ message: "Customer group not found" });
      }

      let members;
      if (search && search.trim()) {
        members = await storage.searchGroupMembers(groupId, search.trim());
      } else {
        members = await storage.getGroupMembers(groupId);
      }
      
      res.json(members);
    } catch (error) {
      console.error("Error fetching group members:", error);
      res.status(500).json({ message: "Failed to fetch group members" });
    }
  });

  // DELETE /api/customer-groups/:groupId/members/:customerId
  app.delete('/api/customer-groups/:groupId/members/:customerId', requireAuth, requireNotViewer, requireMemberPermission('customers'), async (req: any, res) => {
    try {
      // Use parent company ID for team members to inherit data access
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      
      const groupId = parseInt(req.params.groupId);
      const customerId = req.params.customerId;

      // Verify group ownership using parent company data
      const groups = await storage.getCustomerGroups(targetUserId);
      const group = groups.find(g => g.id === groupId);
      
      if (!group) {
        return res.status(404).json({ message: "Customer group not found" });
      }

      // Remove customer from group
      await storage.removeCustomerFromGroup(groupId, customerId);
      
      res.json({
        success: true,
        message: "Customer removed from group successfully"
      });
    } catch (error) {
      console.error("Error removing customer from group:", error);
      res.status(500).json({ message: "Failed to remove customer from group" });
    }
  });

  // PATCH /api/customer-groups/:groupId/members/:customerId
  app.patch('/api/customer-groups/:groupId/members/:customerId', requireAuth, async (req: any, res) => {
    try {
      // Use parent company ID for team members to inherit data access
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      
      const groupId = parseInt(req.params.groupId);
      const customerId = req.params.customerId;
      const { firstName, lastName, phoneNumber, email, businessName } = req.body;

      if (!phoneNumber) {
        return res.status(400).json({ message: "Phone number is required" });
      }

      if (!firstName || !lastName) {
        return res.status(400).json({ message: "First name and last name are required" });
      }

      // Verify group ownership using parent company data
      const groups = await storage.getCustomerGroups(targetUserId);
      const group = groups.find(g => g.id === groupId);
      
      if (!group) {
        return res.status(404).json({ message: "Customer group not found" });
      }

      // Write the name to the per-wholesaler relationship so this wholesaler's view
      // is updated without overwriting another wholesaler's label for the same customer.
      const displayNameValue = `${firstName || ''} ${lastName || ''}`.trim() || null;
      await db.update(wholesalerCustomerRelationships)
        .set({ displayName: displayNameValue })
        .where(and(
          eq(wholesalerCustomerRelationships.customerId, customerId),
          eq(wholesalerCustomerRelationships.wholesalerId, targetUserId)
        ));

      // Update the shared user record — name fields included so orders, invoices,
      // and live joins always reflect the current name regardless of how it was edited.
      const sharedUpdates: Record<string, string | null | undefined> = { phoneNumber };
      if (email !== undefined) sharedUpdates.email = email || null;
      if (businessName !== undefined) sharedUpdates.businessName = businessName || null;
      if (firstName !== undefined) sharedUpdates.firstName = firstName || null;
      if (lastName !== undefined) sharedUpdates.lastName = lastName || null;
      await db.update(users).set(sharedUpdates).where(eq(users.id, customerId));
      
      res.json({
        success: true,
        message: "Customer information updated successfully"
      });
    } catch (error) {
      console.error("Error updating customer information:", error);
      res.status(500).json({ message: "Failed to update customer information" });
    }
  });

  // POST /api/customers/merge
  app.post('/api/customers/merge', requireAuth, requireNotViewer, requireMemberPermission('customers'), async (req: any, res) => {
    try {
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      
      const { primaryCustomerId, duplicateCustomerIds, mergedData } = req.body;

      if (!primaryCustomerId || !duplicateCustomerIds || !Array.isArray(duplicateCustomerIds)) {
        return res.status(400).json({ message: "Primary customer ID and duplicate customer IDs are required" });
      }

      console.log(`🔗 Merging customers: primary=${primaryCustomerId}, duplicates=${duplicateCustomerIds.join(', ')}`);

      // Use the merge functionality from storage
      const result = await storage.mergeCustomers(primaryCustomerId, duplicateCustomerIds, mergedData);
      
      res.json({
        success: true,
        message: `Successfully merged ${duplicateCustomerIds.length} duplicate accounts`,
        primaryCustomerId,
        mergedOrdersCount: 0 // placeholder
      });
    } catch (error) {
      console.error("Error merging customers:", error);
      res.status(500).json({ message: "Failed to merge customers" });
    }
  });

  // GET /api/customers
  app.get('/api/customers', requireAuth, async (req: any, res) => {
    try {
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId ? req.user.wholesalerId : req.user.id;
      
      const customers = await storage.getAllCustomers(targetUserId);
      res.json(customers);
    } catch (error) {
      console.error('Error fetching customers:', error);
      res.status(500).json({ error: 'Failed to fetch customers' });
    }
  });

  // POST /api/customers
  app.post('/api/customers', requireAuth, requireNotViewer, requireMemberPermission('customers'), async (req: any, res) => {
    try {
      console.log('Creating customer - user:', req.user);
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId ? req.user.wholesalerId : req.user.id;
      
      const { firstName, lastName, email, phoneNumber, groupId } = req.body;
      console.log('Customer data:', { firstName, lastName, email, phoneNumber, groupId });
      
      if (!firstName || !phoneNumber) {
        return res.status(400).json({ error: 'First name and phone number are required' });
      }
      
      // Format phone number
      const formattedPhone = formatPhoneToInternational(phoneNumber);
      console.log('Formatted phone:', formattedPhone);
      
      // Check for existing customer by phone number first
      let customer = await storage.getUserByPhone(formattedPhone);
      
      if (customer) {
        // FIXED: Unarchive and update existing customer info if needed
        const updates: any = {};
        if (email && customer.email !== email) {
          updates.email = email;
        }
        // Always unarchive if customer is archived 
        if (customer.archived) {
          updates.archived = false;
          updates.archivedAt = null;
          console.log('🔄 Unarchiving existing customer:', customer.id);
        }
        
        if (Object.keys(updates).length > 0) {
          customer = await storage.updateCustomer(customer.id, updates);
          console.log('✅ Updated and unarchived existing customer:', customer);
        } else {
          console.log('Using existing active customer:', customer);
        }
        
        // Ensure the wholesaler-customer relationship exists
        
        // Check if relationship already exists
        const existingRelationship = await db
          .select()
          .from(wholesalerCustomerRelationships)
          .where(and(
            eq(wholesalerCustomerRelationships.customerId, customer.id),
            eq(wholesalerCustomerRelationships.wholesalerId, targetUserId)
          ))
          .limit(1);
          
        // Per-wholesaler display name so each wholesaler sees the name they entered
        const displayNameValue = `${firstName || ''} ${lastName || ''}`.trim() || null;

        if (existingRelationship.length === 0) {
          // Create new relationship with the name this wholesaler knows the customer by
          await db.insert(wholesalerCustomerRelationships).values({
            customerId: customer.id,
            wholesalerId: targetUserId,
            status: 'active',
            displayName: displayNameValue,
          });
          console.log('✅ Created new wholesaler-customer relationship for existing customer');
        } else {
          // Update displayName in case the wholesaler is re-adding with a different name
          await db.update(wholesalerCustomerRelationships)
            .set({ displayName: displayNameValue, status: 'active' })
            .where(and(
              eq(wholesalerCustomerRelationships.customerId, customer.id),
              eq(wholesalerCustomerRelationships.wholesalerId, targetUserId)
            ));
          console.log('✅ Updated wholesaler-customer relationship displayName');
        }
      } else {
        // Check for existing customer with same email and 'customer' role
        if (email) {
          const existingCustomer = await storage.getUserByEmail(email, 'customer');
          if (existingCustomer) {
            return res.status(400).json({ 
              error: 'A customer with this email already exists. Please use a different email or update the existing customer.' 
            });
          }
        }
        
        // Create new customer user
        customer = await storage.createCustomer({
          firstName,
          lastName: lastName || '',
          email: email || '',
          phoneNumber: formattedPhone,
          role: 'customer',
          wholesalerId: targetUserId
        });
        
        // Create the wholesaler-customer relationship for multi-wholesaler platform
        
        await db.insert(wholesalerCustomerRelationships).values({
          customerId: customer.id,
          wholesalerId: targetUserId,
          status: 'active',
        });
        console.log('✅ Created wholesaler-customer relationship for multi-wholesaler platform');
      }
      
      // Optional: Add customer to specified group if groupId is provided
      if (groupId && groupId > 0) {
        try {
          await storage.addCustomerToGroup(groupId, customer.id);
          console.log(`✅ Customer ${customer.id} added to group ${groupId}`);
        } catch (groupError) {
          console.warn(`⚠️ Failed to add customer to group ${groupId}:`, groupError);
          // Don't fail the entire operation if group assignment fails
        }
      }
      
      console.log('Customer created:', customer);

      // Get wholesaler details for welcome messages
      const wholesaler = await storage.getUser(targetUserId);
      console.log('Wholesaler found for welcome messages:', wholesaler ? `${wholesaler.firstName || ''} ${wholesaler.lastName || ''} (${wholesaler.email})` : 'No wholesaler found');
      
      if (wholesaler) {
        const customerName = `${firstName || ''} ${lastName || ''}`.trim();
        const portalUrl = `https://quikpik.app/customer/${targetUserId}`;
        const wholesalerName = wholesaler.businessName || `${wholesaler.firstName || ''} ${wholesaler.lastName || ''}`.trim() || 'Your Wholesale Partner';
        
        console.log('Sending welcome messages with params:', {
          customerName,
          customerEmail: email,
          customerPhone: formattedPhone,
          wholesalerName,
          wholesalerEmail: wholesaler.email,
          portalUrl
        });
        
        // Send welcome messages (email and WhatsApp)
        try {
          console.log('🚀 STARTING WELCOME MESSAGE PROCESS FOR CUSTOMER:', {
            customerName,
            customerEmail: email,
            customerPhone: formattedPhone,
            wholesalerName,
            wholesalerEmail: wholesaler.email,
            hasWholesalerEmail: !!wholesaler.email,
            portalUrl
          });
          
          const welcomeResult = await sendWelcomeMessages({
            customerName,
            customerEmail: email,
            customerPhone: formattedPhone,
            wholesalerName,
            wholesalerEmail: wholesaler.email || 'hello@quikpik.co',
            wholesalerPhone: wholesaler.phoneNumber,
            wholesalerAccountName: `${wholesaler.firstName || ''} ${wholesaler.lastName || ''}`.trim() || 'IBK',
            portalUrl,
            wholesalerId: wholesaler.id,
            wholesalerLogoType: wholesaler.logoType,
            wholesalerLogoUrl: wholesaler.logoUrl,
          });
          
          console.log('✅ WELCOME MESSAGES COMPLETED. RESULT:', welcomeResult);
          
          // Add welcome message status to response
          res.json({
            ...customer,
            welcomeMessages: {
              emailSent: welcomeResult.emailSent,
              smsSent: welcomeResult.smsSent,
              whatsappSent: welcomeResult.whatsappSent,
              errors: welcomeResult.errors
            }
          });
        } catch (welcomeError) {
          console.error('Error sending welcome messages:', welcomeError);
          // Still return customer even if welcome messages fail
          res.json({
            ...customer,
            welcomeMessages: {
              emailSent: false,
              smsSent: false,
              whatsappSent: false,
              errors: [`Failed to send welcome messages: ${welcomeError.message}`]
            }
          });
        }
      } else {
        console.log('No wholesaler found - skipping welcome messages');
        res.json({
          ...customer,
          welcomeMessages: {
            emailSent: false,
            smsSent: false,
            whatsappSent: false,
            errors: ['No wholesaler account found to send welcome messages from']
          }
        });
      }
    } catch (error) {
      console.error('Error creating customer:', error);
      res.status(500).json({ error: 'Failed to create customer', details: error.message });
    }
  });

  // POST /api/customers/:id/send-welcome
  app.post('/api/customers/:id/send-welcome', requireAuth, requireNotViewer, requireMemberPermission('customers'), async (req: any, res) => {
    try {
      const customerId = req.params.id;
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId ? req.user.wholesalerId : req.user.id;
      
      // Verify the customer belongs to this user
      const customers = await storage.getAllCustomers(targetUserId);
      const customer = customers.find(c => c.id === customerId);
      
      if (!customer) {
        return res.status(404).json({ error: 'Customer not found' });
      }
      
      // Get wholesaler details for welcome messages
      const wholesaler = await storage.getUser(targetUserId);
      
      if (!wholesaler) {
        return res.status(404).json({ error: 'Wholesaler not found' });
      }
      
      const customerName = `${customer.firstName || ''} ${customer.lastName || ''}`.trim();
      const portalUrl = `https://quikpik.app/customer/${targetUserId}`;
      const wholesalerName = wholesaler.businessName || `${wholesaler.firstName || ''} ${wholesaler.lastName || ''}`.trim() || 'Your Wholesale Partner';
      
      console.log('🔄 Manual welcome message request for customer:', customerName);
      
      // Send welcome messages (email and WhatsApp)
      try {
        const welcomeResult = await sendWelcomeMessages({
          customerName,
          customerEmail: customer.email,
          customerPhone: customer.phoneNumber,
          wholesalerName,
          wholesalerEmail: wholesaler.email || 'hello@quikpik.co',
          wholesalerPhone: wholesaler.phoneNumber,
          portalUrl,
          wholesalerId: wholesaler.id,
          wholesalerLogoType: wholesaler.logoType,
          wholesalerLogoUrl: wholesaler.logoUrl,
        });
        
        console.log('✅ Manual welcome messages sent. Result:', welcomeResult);
        
        res.json({
          success: true,
          customerName,
          welcomeMessages: {
            emailSent: welcomeResult.emailSent,
            smsSent: welcomeResult.smsSent,
            whatsappSent: welcomeResult.whatsappSent,
            errors: welcomeResult.errors
          }
        });
      } catch (welcomeError) {
        console.error('❌ Error sending manual welcome messages:', welcomeError);
        res.status(500).json({
          success: false,
          error: 'Failed to send welcome messages',
          details: welcomeError.message
        });
      }
    } catch (error) {
      console.error('❌ Error in manual welcome message endpoint:', error);
      res.status(500).json({ error: 'Failed to send welcome message', details: error.message });
    }
  });

  // GET /api/customers/search
  app.get('/api/customers/search', requireAuth, async (req: any, res) => {
    try {
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId ? req.user.wholesalerId : req.user.id;
      const { q } = req.query;
      
      if (!q || typeof q !== 'string') {
        return res.status(400).json({ error: 'Search query is required' });
      }
      
      const customers = await storage.searchCustomers(targetUserId, q);
      res.json(customers);
    } catch (error) {
      console.error('Error searching customers:', error);
      res.status(500).json({ error: 'Failed to search customers' });
    }
  });

  // GET /api/customers/stats
  app.get('/api/customers/stats', requireAuth, async (req: any, res) => {
    try {
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId ? req.user.wholesalerId : req.user.id;
      
      const stats = await storage.getCustomerStats(targetUserId);
      res.json(stats);
    } catch (error) {
      console.error('Error fetching customer stats:', error);
      res.status(500).json({ error: 'Failed to fetch customer stats' });
    }
  });

  // DELETE /api/customers/:id
  app.delete('/api/customers/:id', requireAuth, requireNotViewer, requireMemberPermission('customers'), async (req: any, res) => {
    try {
      const customerId = req.params.id;
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId ? req.user.wholesalerId : req.user.id;
      
      // Verify the customer belongs to this user
      const customers = await storage.getAllCustomers(targetUserId);
      const customer = customers.find(c => c.id === customerId);
      
      if (!customer) {
        return res.status(404).json({ error: 'Customer not found' });
      }
      
      // Attempt to delete or archive the customer (pass wholesalerId for multi-wholesaler logic)
      const result = await storage.deleteCustomer(customerId, targetUserId);
      
      if (result.success) {
        // Sync: mark any approved registration request for this customer as rejected
        try {
          if (customer.phoneNumber) {
            await db
              .update(customerRegistrationRequests)
              .set({ status: 'rejected', respondedAt: new Date() })
              .where(and(
                eq(customerRegistrationRequests.wholesalerId, targetUserId),
                eq(customerRegistrationRequests.customerPhone, customer.phoneNumber),
                eq(customerRegistrationRequests.status, 'approved')
              ));
          }
        } catch (syncError) {
          console.warn('⚠️ Could not sync registration request status after customer delete:', syncError);
        }

        res.json({ 
          success: true, 
          message: result.message,
          archived: result.archived || false
        });
      } else {
        res.status(500).json({ error: result.message });
      }
    } catch (error) {
      console.error('Error deleting customer:', error);
      res.status(500).json({ error: 'Failed to delete customer' });
    }
  });

  // GET /api/customers/:id
  app.get('/api/customers/:id', requireAuth, async (req: any, res) => {
    try {
      const customerId = req.params.id;
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId
        ? req.user.wholesalerId
        : req.user.id;

      const customer = await storage.getCustomerDetails(customerId, targetUserId);
      if (!customer) {
        return res.status(404).json({ error: 'Customer not found' });
      }
      
      res.json(customer);
    } catch (error) {
      console.error('Error fetching customer details:', error);
      res.status(500).json({ error: 'Failed to fetch customer details' });
    }
  });

  // PATCH /api/customers/:id
  app.patch('/api/customers/:id', requireAuth, requireNotViewer, requireMemberPermission('customers'), async (req: any, res) => {
    try {
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId
        ? req.user.wholesalerId
        : req.user.id;
      const customerId = req.params.id;
      const { firstName, lastName, businessName, ...nonNameUpdates } = req.body;
      
      console.log('Updating customer:', customerId, 'with updates:', req.body);

      // Derive the display name this wholesaler uses for this customer.
      // Priority: firstName+lastName if provided, else businessName, else keep existing.
      const hasNameChange = firstName !== undefined || lastName !== undefined || businessName !== undefined;
      if (hasNameChange) {
        // Build displayName from firstName+lastName when present, otherwise fall back to businessName
        let displayNameValue: string | null = null;
        if (firstName !== undefined || lastName !== undefined) {
          displayNameValue = `${firstName || ''} ${lastName || ''}`.trim() || businessName?.trim() || null;
        } else if (businessName !== undefined) {
          displayNameValue = businessName?.trim() || null;
        }
        await db.update(wholesalerCustomerRelationships)
          .set({ displayName: displayNameValue })
          .where(and(
            eq(wholesalerCustomerRelationships.customerId, customerId),
            eq(wholesalerCustomerRelationships.wholesalerId, targetUserId)
          ));
      }

      // Write name fields directly to the shared user record so live joins reflect current name.
      const nameUpdates: Record<string, string | null> = {};
      if (firstName !== undefined) nameUpdates.firstName = firstName || null;
      if (lastName !== undefined) nameUpdates.lastName = lastName || null;
      if (businessName !== undefined) nameUpdates.businessName = businessName || null;

      // Write all fields (name + any other updates) to the shared user record
      const updatedCustomer = await storage.updateCustomer(customerId, { ...nonNameUpdates, ...nameUpdates });
      console.log('Customer updated successfully:', updatedCustomer);

      // Backfill customerName on existing orders for this wholesaler so the
      // order list immediately reflects the new name rather than the stale snapshot.
      if (hasNameChange) {
        const newCustomerName = businessName?.trim()
          || `${firstName || ''} ${lastName || ''}`.trim()
          || updatedCustomer.businessName
          || `${updatedCustomer.firstName || ''} ${updatedCustomer.lastName || ''}`.trim()
          || null;
        if (newCustomerName) {
          await db.update(orders)
            .set({ customerName: newCustomerName })
            .where(and(
              eq(orders.retailerId, customerId),
              eq(orders.wholesalerId, targetUserId)
            ));
          console.log(`✅ Backfilled customerName="${newCustomerName}" on orders for customer ${customerId}`);
        }
      }

      // Merge the name back into the response so the caller sees the correct values
      res.json({
        ...updatedCustomer,
        ...(firstName !== undefined ? { firstName } : {}),
        ...(lastName !== undefined ? { lastName } : {}),
        ...(businessName !== undefined ? { businessName } : {}),
      });
    } catch (error) {
      console.error('Error updating customer:', error);
      res.status(500).json({ error: 'Failed to update customer' });
    }
  });

  // PATCH /api/customers/bulk
  app.patch('/api/customers/bulk', requireAuth, requireNotViewer, requireMemberPermission('customers'), async (req: any, res) => {
    try {
      const { customerUpdates } = req.body;
      
      if (!Array.isArray(customerUpdates)) {
        return res.status(400).json({ error: 'customerUpdates must be an array' });
      }
      
      await storage.bulkUpdateCustomers(customerUpdates);
      res.json({ success: true });
    } catch (error) {
      console.error('Error bulk updating customers:', error);
      res.status(500).json({ error: 'Failed to bulk update customers' });
    }
  });

  // GET /api/wholesaler/customers
  app.get('/api/wholesaler/customers', requireAuth, async (req: any, res) => {
    try {
      const wholesalerId = req.user.id;
      const relationships = await multiWholesalerService.getWholesalerCustomers(wholesalerId);
      res.json(relationships);
    } catch (error) {
      console.error('Error fetching wholesaler customers:', error);
      res.status(500).json({ message: 'Failed to fetch customer relationships' });
    }
  });

  // POST /api/wholesaler/invite-customer
  app.post('/api/wholesaler/invite-customer', requireAuth, requireNotViewer, requireMemberPermission('customers'), async (req: any, res) => {
    try {
      const wholesalerId = req.user.id;
      const { email, phoneNumber, firstName, lastName, customMessage } = req.body;
      
      if (!email) {
        return res.status(400).json({ message: 'Email is required' });
      }
      
      const result = await multiWholesalerService.inviteCustomer(wholesalerId, {
        email,
        phoneNumber,
        firstName,
        lastName,
        customMessage
      });
      
      res.json(result);
    } catch (error) {
      console.error('Error inviting customer:', error);
      res.status(500).json({ message: 'Failed to send customer invitation' });
    }
  });

  // POST /api/customer/accept-invitation
  app.post('/api/customer/accept-invitation', async (req, res) => {
    try {
      const { token, email, phoneNumber, firstName, lastName } = req.body;
      
      if (!token) {
        return res.status(400).json({ message: 'Invitation token is required' });
      }
      
      const result = await multiWholesalerService.acceptInvitation(token, {
        email,
        phoneNumber,
        firstName,
        lastName
      });
      
      res.json(result);
    } catch (error) {
      console.error('Error accepting invitation:', error);
      res.status(500).json({ message: 'Failed to accept invitation' });
    }
  });

  // GET /api/customer/wholesaler-access/:wholesalerId
  app.get('/api/customer/wholesaler-access/:wholesalerId', requireAuth, async (req: any, res) => {
    try {
      const customerId = req.user.id;
      const { wholesalerId } = req.params;
      
      const hasAccess = await multiWholesalerService.hasWholesalerAccess(customerId, wholesalerId);
      res.json({ hasAccess });
    } catch (error) {
      console.error('Error checking wholesaler access:', error);
      res.status(500).json({ message: 'Failed to check access' });
    }
  });

  // POST /api/customer/update-last-accessed/:wholesalerId
  app.post('/api/customer/update-last-accessed/:wholesalerId', requireAuth, async (req: any, res) => {
    try {
      const customerId = req.user.id;
      const { wholesalerId } = req.params;
      
      await multiWholesalerService.updateLastAccessed(customerId, wholesalerId);
      res.json({ success: true });
    } catch (error) {
      console.error('Error updating last accessed:', error);
      res.status(500).json({ message: 'Failed to update last accessed time' });
    }
  });

  // DELETE /api/wholesaler/customer/:customerId
  app.delete('/api/wholesaler/customer/:customerId', requireAuth, requireNotViewer, requireMemberPermission('customers'), async (req: any, res) => {
    try {
      const wholesalerId = req.user.id;
      const { customerId } = req.params;
      
      const result = await multiWholesalerService.removeCustomerRelationship(customerId, wholesalerId);
      res.json(result);
    } catch (error) {
      console.error('Error removing customer relationship:', error);
      res.status(500).json({ message: 'Failed to remove customer relationship' });
    }
  });

  // GET /api/wholesaler/pending-invitations
  app.get('/api/wholesaler/pending-invitations', requireAuth, async (req: any, res) => {
    try {
      const wholesalerId = req.user.id;
      const invitations = await multiWholesalerService.getPendingInvitations(wholesalerId);
      res.json(invitations);
    } catch (error) {
      console.error('Error fetching pending invitations:', error);
      res.status(500).json({ message: 'Failed to fetch pending invitations' });
    }
  });

}
