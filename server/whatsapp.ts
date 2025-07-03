import { storage } from "./storage";

// WhatsApp Business API integration
// This can use either Meta's WhatsApp Business API or Twilio's WhatsApp API
export class WhatsAppService {
  private apiUrl: string;
  private accessToken: string;
  private phoneNumberId: string;

  constructor() {
    // Using Meta's WhatsApp Business API by default
    this.apiUrl = process.env.WHATSAPP_API_URL || 'https://graph.facebook.com/v17.0';
    this.accessToken = process.env.WHATSAPP_ACCESS_TOKEN || '';
    this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
  }

  async sendProductBroadcast(
    wholesalerId: string,
    productId: number,
    customerGroupId: number,
    message?: string
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      // Get product details
      const product = await storage.getProduct(productId);
      if (!product) {
        throw new Error('Product not found');
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

      // For now, we'll simulate the WhatsApp message sending
      // In production, this would integrate with actual WhatsApp Business API
      const productMessage = this.generateProductMessage(product, message);
      
      // Simulate sending to customers
      console.log(`Broadcasting to customer group "${targetGroup.name}" (${recipientCount} recipients):`, productMessage);
      
      // In real implementation, loop through customer phone numbers and send
      // const results = await Promise.all(members.map(member => 
      //   this.sendMessage(member.phoneNumber, productMessage)
      // ));

      return {
        success: true,
        messageId: `broadcast_${Date.now()}`,
        recipientCount,
      };
    } catch (error: any) {
      console.error('WhatsApp broadcast error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async sendMessage(phoneNumber: string, message: string): Promise<boolean> {
    try {
      if (!this.accessToken || !this.phoneNumberId) {
        console.log(`Simulated WhatsApp message to ${phoneNumber}: ${message}`);
        return true;
      }

      const response = await fetch(`${this.apiUrl}/${this.phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: phoneNumber,
          type: 'text',
          text: {
            body: message
          }
        })
      });

      if (!response.ok) {
        throw new Error(`WhatsApp API error: ${response.statusText}`);
      }

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
}

export const whatsappService = new WhatsAppService();