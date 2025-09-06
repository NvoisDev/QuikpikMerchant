import { db } from "../db";
import { 
  users, 
  wholesalerCustomerRelationships,
  customerInvitationTokens,
  type WholesalerCustomerRelationship,
  type CustomerInvitationToken 
} from "../../shared/schema";
import { eq, and, or } from "drizzle-orm";
import crypto from 'crypto';
import { sendWelcomeMessages } from './welcomeMessageService.js';

export class MultiWholesalerService {

  /**
   * Get all wholesaler relationships for a customer
   */
  async getCustomerWholesalers(customerId: string): Promise<Array<{
    wholesaler: any;
    relationship: WholesalerCustomerRelationship;
  }>> {
    try {
      const relationships = await db
        .select({
          relationship: wholesalerCustomerRelationships,
          wholesaler: users
        })
        .from(wholesalerCustomerRelationships)
        .leftJoin(users, eq(wholesalerCustomerRelationships.wholesalerId, users.id))
        .where(and(
          eq(wholesalerCustomerRelationships.customerId, customerId),
          eq(wholesalerCustomerRelationships.status, 'active')
        ));

      const result = relationships.map(item => ({
        wholesaler: item.wholesaler,
        relationship: item.relationship
      }));

      // Debug logging for logo data
      console.log('🔧 MultiWholesalerService - Customer wholesalers for', customerId, ':');
      result.forEach(item => {
        console.log(`  - ${item.wholesaler?.businessName}: logoType=${item.wholesaler?.logoType}, hasLogoUrl=${!!item.wholesaler?.logoUrl}`);
      });

      return result;
    } catch (error) {
      console.error('Error fetching customer wholesalers:', error);
      return [];
    }
  }

  /**
   * Get all customers for a wholesaler
   */
  async getWholesalerCustomers(wholesalerId: string): Promise<Array<{
    customer: any;
    relationship: WholesalerCustomerRelationship;
  }>> {
    try {
      const relationships = await db
        .select({
          relationship: wholesalerCustomerRelationships,
          customer: users
        })
        .from(wholesalerCustomerRelationships)
        .leftJoin(users, eq(wholesalerCustomerRelationships.customerId, users.id))
        .where(and(
          eq(wholesalerCustomerRelationships.wholesalerId, wholesalerId),
          eq(wholesalerCustomerRelationships.status, 'active')
        ));

      return relationships.map(item => ({
        customer: item.customer,
        relationship: item.relationship
      }));
    } catch (error) {
      console.error('Error fetching wholesaler customers:', error);
      return [];
    }
  }

  /**
   * Check if a customer has access to a wholesaler
   */
  async hasWholesalerAccess(customerId: string, wholesalerId: string): Promise<boolean> {
    try {
      const relationship = await db
        .select()
        .from(wholesalerCustomerRelationships)
        .where(and(
          eq(wholesalerCustomerRelationships.customerId, customerId),
          eq(wholesalerCustomerRelationships.wholesalerId, wholesalerId),
          eq(wholesalerCustomerRelationships.status, 'active')
        ))
        .limit(1);

      return relationship.length > 0;
    } catch (error) {
      console.error('Error checking wholesaler access:', error);
      return false;
    }
  }

  /**
   * Create or invite a customer to a wholesaler
   */
  async inviteCustomer(wholesalerId: string, invitation: {
    email: string;
    phoneNumber?: string;
    firstName?: string;
    lastName?: string;
    customMessage?: string;
  }): Promise<{ success: boolean; message: string; token?: string }> {
    try {
      // Check if user already exists
      const whereConditions = [eq(users.email, invitation.email)];
      if (invitation.phoneNumber) {
        whereConditions.push(eq(users.phoneNumber, invitation.phoneNumber));
      }
      
      const existingUser = await db
        .select()
        .from(users)
        .where(or(...whereConditions))
        .limit(1);

      const customer = existingUser[0];

      if (customer) {
        // Check if relationship already exists
        const existingRelationship = await db
          .select()
          .from(wholesalerCustomerRelationships)
          .where(and(
            eq(wholesalerCustomerRelationships.customerId, customer.id),
            eq(wholesalerCustomerRelationships.wholesalerId, wholesalerId)
          ))
          .limit(1);

        if (existingRelationship[0]) {
          if (existingRelationship[0].status === 'active') {
            return { success: false, message: 'Customer is already connected to this wholesaler' };
          } else if (existingRelationship[0].status === 'pending') {
            return { success: false, message: 'Invitation already sent to this customer' };
          }
        }

        // Create relationship
        await db.insert(wholesalerCustomerRelationships).values({
          customerId: customer.id,
          wholesalerId: wholesalerId,
          status: 'active', // Auto-approve for existing users
          acceptedAt: new Date(),
        });

        // Get wholesaler details for welcome notification
        const wholesaler = await db
          .select()
          .from(users)
          .where(eq(users.id, wholesalerId))
          .limit(1);

        if (wholesaler[0]) {
          // Send welcome notification to existing customer
          const portalUrl = `${process.env.CLIENT_URL || 'http://localhost:5000'}/customer-portal`;
          
          const welcomeResult = await sendWelcomeMessages({
            customerName: `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || customer.email || 'Customer',
            customerEmail: customer.email || undefined,
            customerPhone: customer.phoneNumber || undefined,
            wholesalerName: wholesaler[0].businessName || `${wholesaler[0].firstName || ''} ${wholesaler[0].lastName || ''}`.trim() || 'Wholesaler',
            wholesalerEmail: wholesaler[0].email || '',
            wholesalerPhone: wholesaler[0].phoneNumber || undefined,
            portalUrl
          });

          console.log(`📧 Welcome notifications sent to existing customer ${customer.email}:`, welcomeResult);
        }

        return { 
          success: true, 
          message: 'Customer successfully connected to your wholesale account' 
        };
      } else {
        // Create invitation token for new user
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7); // Expires in 7 days

        await db.insert(customerInvitationTokens).values({
          token,
          wholesalerId,
          email: invitation.email,
          phoneNumber: invitation.phoneNumber,
          firstName: invitation.firstName,
          lastName: invitation.lastName,
          customMessage: invitation.customMessage,
          expiresAt,
        });

        return { 
          success: true, 
          message: 'Invitation sent successfully',
          token 
        };
      }
    } catch (error) {
      console.error('Error inviting customer:', error);
      return { success: false, message: 'Failed to send invitation' };
    }
  }

  /**
   * Accept invitation using token (for new customers)
   */
  async acceptInvitation(token: string, customerData: {
    email?: string;
    phoneNumber?: string;
    firstName?: string;
    lastName?: string;
  }): Promise<{ success: boolean; message: string; customerId?: string }> {
    try {
      // Find and validate token
      const invitation = await db
        .select()
        .from(customerInvitationTokens)
        .where(and(
          eq(customerInvitationTokens.token, token),
          eq(customerInvitationTokens.status, 'pending')
        ))
        .limit(1);

      if (!invitation[0]) {
        return { success: false, message: 'Invalid or expired invitation token' };
      }

      if (new Date() > invitation[0].expiresAt) {
        return { success: false, message: 'Invitation has expired' };
      }

      // Create new customer user
      const customerId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      await db.insert(users).values({
        id: customerId,
        email: customerData.email || invitation[0].email,
        phoneNumber: customerData.phoneNumber || invitation[0].phoneNumber,
        firstName: customerData.firstName || invitation[0].firstName,
        lastName: customerData.lastName || invitation[0].lastName,
        role: 'retailer',
        // Note: don't set wholesalerId here as customer can work with multiple wholesalers
      });

      // Create relationship
      await db.insert(wholesalerCustomerRelationships).values({
        customerId,
        wholesalerId: invitation[0].wholesalerId,
        status: 'active',
        acceptedAt: new Date(),
      });

      // Mark invitation as used
      await db
        .update(customerInvitationTokens)
        .set({
          status: 'used',
          usedAt: new Date(),
        })
        .where(eq(customerInvitationTokens.token, token));

      // Get wholesaler details for welcome notification
      const wholesaler = await db
        .select()
        .from(users)
        .where(eq(users.id, invitation[0].wholesalerId))
        .limit(1);

      if (wholesaler[0]) {
        // Send welcome notification to new customer
        const portalUrl = `${process.env.CLIENT_URL || 'http://localhost:5000'}/customer-portal`;
        const customerName = `${customerData.firstName || invitation[0].firstName || ''} ${customerData.lastName || invitation[0].lastName || ''}`.trim() || customerData.email || invitation[0].email || 'Customer';
        
        const welcomeResult = await sendWelcomeMessages({
          customerName,
          customerEmail: customerData.email || invitation[0].email || undefined,
          customerPhone: customerData.phoneNumber || invitation[0].phoneNumber || undefined,
          wholesalerName: wholesaler[0].businessName || `${wholesaler[0].firstName || ''} ${wholesaler[0].lastName || ''}`.trim() || 'Wholesaler',
          wholesalerEmail: wholesaler[0].email || '',
          wholesalerPhone: wholesaler[0].phoneNumber || undefined,
          portalUrl
        });

        console.log(`📧 Welcome notifications sent to new customer ${customerData.email || invitation[0].email}:`, welcomeResult);
      }

      return { 
        success: true, 
        message: 'Account created and connected successfully',
        customerId 
      };
    } catch (error) {
      console.error('Error accepting invitation:', error);
      return { success: false, message: 'Failed to accept invitation' };
    }
  }

  /**
   * Update last accessed time for a customer-wholesaler relationship
   */
  async updateLastAccessed(customerId: string, wholesalerId: string): Promise<void> {
    try {
      await db
        .update(wholesalerCustomerRelationships)
        .set({ lastAccessedAt: new Date() })
        .where(and(
          eq(wholesalerCustomerRelationships.customerId, customerId),
          eq(wholesalerCustomerRelationships.wholesalerId, wholesalerId)
        ));
    } catch (error) {
      console.error('Error updating last accessed:', error);
    }
  }

  /**
   * Remove customer relationship
   */
  async removeCustomerRelationship(customerId: string, wholesalerId: string): Promise<{ success: boolean; message: string }> {
    try {
      await db
        .delete(wholesalerCustomerRelationships)
        .where(and(
          eq(wholesalerCustomerRelationships.customerId, customerId),
          eq(wholesalerCustomerRelationships.wholesalerId, wholesalerId)
        ));

      return { success: true, message: 'Customer relationship removed successfully' };
    } catch (error) {
      console.error('Error removing customer relationship:', error);
      return { success: false, message: 'Failed to remove customer relationship' };
    }
  }

  /**
   * Get pending invitations for a wholesaler
   */
  async getPendingInvitations(wholesalerId: string): Promise<CustomerInvitationToken[]> {
    try {
      const invitations = await db
        .select()
        .from(customerInvitationTokens)
        .where(and(
          eq(customerInvitationTokens.wholesalerId, wholesalerId),
          eq(customerInvitationTokens.status, 'pending')
        ));

      return invitations;
    } catch (error) {
      console.error('Error fetching pending invitations:', error);
      return [];
    }
  }
}

export const multiWholesalerService = new MultiWholesalerService();