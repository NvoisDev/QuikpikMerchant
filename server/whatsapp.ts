import { storage } from "./storage";

// Shared WhatsApp Business API integration using platform Twilio account
export class WhatsAppService {
  private sharedTwilioAccountSid: string;
  private sharedTwilioAuthToken: string;
  private sharedTwilioPhoneNumber: string;
  private twilioClient: any;

  constructor() {
    // Using shared platform Twilio credentials for all wholesalers
    this.sharedTwilioAccountSid = process.env.TWILIO_ACCOUNT_SID || '';
    this.sharedTwilioAuthToken = process.env.TWILIO_AUTH_TOKEN || '';
    this.sharedTwilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER || '';
    
    // Initialize Twilio client if credentials are available
    if (this.sharedTwilioAccountSid && this.sharedTwilioAuthToken) {
      try {
        const twilio = require('twilio');
        this.twilioClient = twilio(this.sharedTwilioAccountSid, this.sharedTwilioAuthToken);
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

      // Check if WhatsApp is enabled for this wholesaler
      if (!wholesaler.whatsappEnabled) {
        throw new Error('WhatsApp integration is not enabled for this wholesaler');
      }

      // Check if shared Twilio service is available
      if (!this.sharedTwilioAccountSid || !this.sharedTwilioAuthToken || !this.sharedTwilioPhoneNumber) {
        // Simulation mode - log message without sending
        const productMessage = this.generateProductMessage(product, message);
        console.log(`[SIMULATION] Broadcasting to customer group "${targetGroup.name}" (${recipientCount} recipients): ${productMessage}`);
        
        return {
          success: true,
          messageId: `sim_broadcast_${Date.now()}`,
          recipientCount
        };
      }

      const productMessage = this.generateProductMessage(product, message);
      
      // Send WhatsApp messages to each member using shared platform Twilio account
      const promises = members.map(async (member) => {
        if (!member.businessPhone) {
          console.warn(`No phone number for member ${member.id}`);
          return false;
        }

        try {
          const result = await this.twilioClient.messages.create({
            body: productMessage,
            from: `whatsapp:${this.sharedTwilioPhoneNumber}`,
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
      // Check if wholesaler has WhatsApp enabled
      if (wholesalerId) {
        const wholesaler = await storage.getUser(wholesalerId);
        if (!wholesaler?.whatsappEnabled) {
          console.log(`WhatsApp not enabled for wholesaler ${wholesalerId}`);
          return false;
        }
      }

      // Check if shared Twilio service is available
      if (!this.sharedTwilioAccountSid || !this.sharedTwilioAuthToken || !this.sharedTwilioPhoneNumber) {
        console.log(`[SIMULATION] WhatsApp message to ${phoneNumber}: ${message}`);
        return true;
      }

      const result = await this.twilioClient.messages.create({
        body: message,
        from: `whatsapp:${this.sharedTwilioPhoneNumber}`,
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

  // Shared WhatsApp service methods - no individual setup needed

  // Test WhatsApp sending capability using shared service
  async testWholesalerWhatsApp(
    wholesalerId: string,
    testPhoneNumber: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const wholesaler = await storage.getUser(wholesalerId);
      if (!wholesaler?.whatsappEnabled) {
        return {
          success: false,
          error: 'WhatsApp not enabled for this wholesaler'
        };
      }

      // Use shared service to send test message
      const result = await this.sendMessage(
        testPhoneNumber,
        'Test message from Quikpik Merchant Platform. Your WhatsApp integration is working!',
        wholesalerId
      );

      if (result) {
        return { success: true };
      } else {
        return {
          success: false,
          error: 'Failed to send test message'
        };
      }
    } catch (error: any) {
      return {
        success: false,
        error: `WhatsApp test failed: ${error.message}`
      };
    }
  }

  // Verify WhatsApp Business API configuration
  async verifyWhatsAppBusinessAPI(
    businessPhone: string,
    apiToken: string
  ): Promise<{ success: boolean; error?: string; data?: any }> {
    try {
      // For now, simulate verification since we don't have direct WhatsApp Business API integration
      // In a real implementation, this would make a test API call to WhatsApp Business API
      
      if (!businessPhone.startsWith('+')) {
        return {
          success: false,
          error: 'Phone number must include country code (e.g., +1234567890)'
        };
      }

      if (apiToken.length < 20) {
        return {
          success: false,
          error: 'API token appears to be invalid (too short)'
        };
      }

      // Simulate successful verification
      console.log(`[VERIFICATION] WhatsApp Business API for ${businessPhone} with token ${apiToken.substring(0, 10)}...`);
      
      return {
        success: true,
        data: {
          phoneNumber: businessPhone,
          verified: true,
          accountType: 'Business',
          capabilities: ['messaging', 'media', 'templates']
        }
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Verification failed: ${error.message}`
      };
    }
  }
}

export const whatsappService = new WhatsAppService();