import { storage } from "./storage";

// Twilio WhatsApp Business API integration for multi-tenant platform
export class WhatsAppService {
  private twilioAccountSid: string;
  private twilioAuthToken: string;
  private twilioClient: any;

  constructor() {
    // Using Twilio's WhatsApp Business API for multi-tenant support
    this.twilioAccountSid = process.env.TWILIO_ACCOUNT_SID || '';
    this.twilioAuthToken = process.env.TWILIO_AUTH_TOKEN || '';
    
    // Initialize Twilio client if credentials are available
    if (this.twilioAccountSid && this.twilioAuthToken) {
      try {
        const twilio = require('twilio');
        this.twilioClient = twilio(this.twilioAccountSid, this.twilioAuthToken);
      } catch (error) {
        console.warn('Twilio not installed, using simulation mode');
        this.twilioClient = null;
      }
    }
  }

  async sendProductBroadcast(
    wholesalerId: string,
    productId: number,
    customerGroupId: number,
    message?: string
  ): Promise<{ success: boolean; messageId?: string; error?: string; recipientCount?: number }> {
    try {
      // Get product details
      const product = await storage.getProduct(productId);
      if (!product) {
        throw new Error('Product not found');
      }

      // Get wholesaler details for Twilio credentials
      const wholesaler = await storage.getUser(wholesalerId);
      if (!wholesaler) {
        throw new Error('Wholesaler not found');
      }

      // Get customer group members
      const customerGroup = await storage.getCustomerGroups(wholesalerId);
      const targetGroup = customerGroup.find(g => g.id === customerGroupId);
      if (!targetGroup) {
        throw new Error('Customer group not found');
      }

      // Get actual members of the group
      const members = await storage.getGroupMembers(customerGroupId);
      const recipientCount = members.length;

      // Check if wholesaler has Twilio credentials configured
      if (!wholesaler.twilioAccountSid || !wholesaler.twilioAuthToken || !wholesaler.twilioPhoneNumber) {
        // Simulation mode - log message without sending
        const productMessage = this.generateProductMessage(product, message);
        console.log(`Broadcasting to customer group "${targetGroup.name}" (${recipientCount} recipients): ${productMessage}`);
        
        return {
          success: true,
          messageId: `broadcast_${Date.now()}`,
          recipientCount
        };
      }

      // Create Twilio client for this wholesaler
      const twilio = require('twilio');
      const wholesalerTwilioClient = twilio(wholesaler.twilioAccountSid, wholesaler.twilioAuthToken);
      
      const productMessage = this.generateProductMessage(product, message);
      
      // Send WhatsApp messages to each member using wholesaler's Twilio account
      const promises = members.map(async (member) => {
        if (!member.businessPhone) {
          console.warn(`No phone number for member ${member.id}`);
          return false;
        }

        try {
          const result = await wholesalerTwilioClient.messages.create({
            body: productMessage,
            from: `whatsapp:${wholesaler.twilioPhoneNumber}`,
            to: `whatsapp:${member.businessPhone}`
          });
          console.log(`WhatsApp message sent to ${member.businessPhone}: ${result.sid}`);
          return true;
        } catch (error: any) {
          console.error(`Failed to send WhatsApp to ${member.businessPhone}:`, error.message);
          return false;
        }
      });

      const results = await Promise.allSettled(promises);
      const successCount = results.filter(r => 
        r.status === 'fulfilled' && r.value === true
      ).length;

      if (successCount === 0) {
        throw new Error('Failed to send any WhatsApp messages');
      }

      return {
        success: true,
        messageId: `broadcast_${Date.now()}`,
        recipientCount
      };

    } catch (error: any) {
      console.error('WhatsApp broadcast error:', error);
      return {
        success: false,
        error: error.message,
        recipientCount: 0
      };
    }
  }

  async sendMessage(phoneNumber: string, message: string, wholesalerId?: string): Promise<boolean> {
    try {
      // For backward compatibility - if no wholesaler ID provided, use simulation
      if (!wholesalerId) {
        console.log(`Simulated WhatsApp message to ${phoneNumber}: ${message}`);
        return true;
      }

      const wholesaler = await storage.getUser(wholesalerId);
      if (!wholesaler?.twilioAccountSid || !wholesaler?.twilioAuthToken || !wholesaler?.twilioPhoneNumber) {
        console.log(`Simulated WhatsApp message to ${phoneNumber}: ${message}`);
        return true;
      }

      const twilio = require('twilio');
      const client = twilio(wholesaler.twilioAccountSid, wholesaler.twilioAuthToken);

      const result = await client.messages.create({
        body: message,
        from: `whatsapp:${wholesaler.twilioPhoneNumber}`,
        to: `whatsapp:${phoneNumber}`
      });

      console.log(`WhatsApp message sent to ${phoneNumber}: ${result.sid}`);
      return true;
    } catch (error) {
      console.error('Failed to send WhatsApp message:', error);
      return false;
    }
  }

  private generateProductMessage(product: any, customMessage?: string): string {
    const productUrl = `${process.env.APP_URL || 'http://localhost:5000'}/product/${product.id}`;
    const price = product.priceVisible ? `$${product.price}` : 'Request Quote';
    
    if (customMessage) {
      return `${customMessage}\n\n🛒 Order now: ${productUrl}`;
    }

    return `🛍️ *${product.name}* is now available!

📦 Stock: ${product.stock} units
💰 Price: ${price}
📋 Min Order: ${product.moq} units

${product.description || ''}

🛒 Order now: ${productUrl}

Reply STOP to unsubscribe`;
  }

  async sendOrderNotification(
    phoneNumber: string, 
    orderDetails: any
  ): Promise<boolean> {
    const message = `✅ Order Confirmed!

Order #${orderDetails.id}
Total: $${orderDetails.total}
Status: ${orderDetails.status}

We'll notify you when your order ships. Thank you for your business!`;

    return this.sendMessage(phoneNumber, message);
  }

  async sendStockAlert(
    wholesalerPhone: string,
    product: any
  ): Promise<boolean> {
    const message = `🚨 Low Stock Alert!

Product: ${product.name}
Current Stock: ${product.stock} units
Status: ${product.stock === 0 ? 'OUT OF STOCK' : 'LOW STOCK'}

Update your inventory or restock soon.`;

    return this.sendMessage(wholesalerPhone, message);
  }

  // Twilio multi-tenant setup methods
  async setupWholesalerWhatsApp(
    wholesalerId: string,
    twilioAccountSid: string,
    twilioAuthToken: string,
    twilioPhoneNumber: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Validate Twilio credentials by testing the connection
      const twilio = require('twilio');
      const client = twilio(twilioAccountSid, twilioAuthToken);

      // Test the credentials and phone number
      await client.incomingPhoneNumbers.list({ phoneNumber: twilioPhoneNumber });

      // Update wholesaler's Twilio credentials in database
      await storage.updateUserSettings(wholesalerId, {
        twilioAccountSid,
        twilioAuthToken,
        twilioPhoneNumber,
        whatsappEnabled: true
      });

      return { success: true };
    } catch (error: any) {
      console.error('Failed to setup Twilio WhatsApp:', error);
      return { 
        success: false, 
        error: `Twilio setup failed: ${error.message}` 
      };
    }
  }

  async validateTwilioCredentials(
    twilioAccountSid: string,
    twilioAuthToken: string,
    twilioPhoneNumber: string
  ): Promise<{ valid: boolean; error?: string }> {
    try {
      const twilio = require('twilio');
      const client = twilio(twilioAccountSid, twilioAuthToken);

      // Test connection and verify phone number
      const phoneNumbers = await client.incomingPhoneNumbers.list({ 
        phoneNumber: twilioPhoneNumber 
      });

      if (phoneNumbers.length === 0) {
        return {
          valid: false,
          error: 'Phone number not found in Twilio account'
        };
      }

      // Check if WhatsApp is enabled on this number
      const phoneNumber = phoneNumbers[0];
      if (!phoneNumber.capabilities.sms) {
        return {
          valid: false,
          error: 'SMS/WhatsApp not enabled on this phone number'
        };
      }

      return { valid: true };
    } catch (error: any) {
      return {
        valid: false,
        error: `Invalid Twilio credentials: ${error.message}`
      };
    }
  }

  // Test WhatsApp sending capability for a wholesaler
  async testWholesalerWhatsApp(
    wholesalerId: string,
    testPhoneNumber: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const wholesaler = await storage.getUser(wholesalerId);
      if (!wholesaler?.twilioAccountSid || !wholesaler?.twilioAuthToken || !wholesaler?.twilioPhoneNumber) {
        return {
          success: false,
          error: 'WhatsApp not configured for this wholesaler'
        };
      }

      const twilio = require('twilio');
      const client = twilio(wholesaler.twilioAccountSid, wholesaler.twilioAuthToken);

      await client.messages.create({
        body: 'Test message from Quikpik Merchant Platform. Your WhatsApp integration is working!',
        from: `whatsapp:${wholesaler.twilioPhoneNumber}`,
        to: `whatsapp:${testPhoneNumber}`
      });

      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        error: `WhatsApp test failed: ${error.message}`
      };
    }
  }
}

export const whatsappService = new WhatsAppService();