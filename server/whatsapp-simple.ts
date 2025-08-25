// WhatsApp Business API Integration
export class WhatsAppBusinessService {
  
  /**
   * Get WhatsApp Business API status for a user
   */
  getStatus(user: any) {
    const hasCredentials = !!(
      user.whatsappAccessToken && 
      user.whatsappBusinessPhoneId
    );
    
    return {
      isConfigured: hasCredentials,
      userActivated: hasCredentials,
      accessToken: user.whatsappAccessToken ? '***' : null,
      phoneNumberId: user.whatsappBusinessPhoneId || null,
      businessName: user.whatsappBusinessName || null
    };
  }
  
  /**
   * Send WhatsApp message using user's WhatsApp Business API credentials
   */
  async sendMessage(to: string, message: string, userCredentials: {
    accessToken: string;
    phoneNumberId: string;
  }, options?: {
    imageUrl?: string;
    caption?: string;
  }) {
    if (!userCredentials.accessToken || !userCredentials.phoneNumberId) {
      throw new Error('WhatsApp Business API credentials not configured');
    }
    
    try {
      const url = `https://graph.facebook.com/v17.0/${userCredentials.phoneNumberId}/messages`;
      
      // Prepare message payload
      let messagePayload: any = {
        messaging_product: 'whatsapp',
        to: to.replace('+', ''),
      };

      // Send image if provided, otherwise send text
      if (options?.imageUrl) {
        messagePayload.type = 'image';
        messagePayload.image = {
          link: options.imageUrl,
          caption: options.caption || message
        };
      } else {
        messagePayload.type = 'text';
        messagePayload.text = {
          body: message
        };
      }
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${userCredentials.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messagePayload)
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(`WhatsApp API Error: ${error.error?.message || response.statusText}`);
      }
      
      const result = await response.json();
      console.log(`✅ WhatsApp message sent successfully:`, {
        to,
        type: messagePayload.type,
        messageId: result.messages[0].id
      });
      
      return { success: true, messageId: result.messages[0].id };
    } catch (error) {
      console.error(`❌ Failed to send WhatsApp message:`, error);
      throw error;
    }
  }
}

export const whatsAppBusinessService = new WhatsAppBusinessService();