// Direct WhatsApp Business API integration
export class DirectWhatsAppService {
  private baseUrl = 'https://graph.facebook.com/v18.0';

  constructor(
    private accessToken: string,
    private businessPhoneId: string,
    private appId: string
  ) {}

  private async makeRequest(endpoint: string, method: 'GET' | 'POST' = 'GET', data?: any) {
    const url = `${this.baseUrl}/${endpoint}`;
    const options: RequestInit = {
      method,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
    };

    if (data && method === 'POST') {
      options.body = JSON.stringify(data);
    }

    try {
      const response = await fetch(url, options);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(`WhatsApp API Error: ${result.error?.message || response.statusText}`);
      }

      return result;
    } catch (error) {
      console.error('WhatsApp API request failed:', error);
      throw error;
    }
  }

  async verifyConnection(): Promise<{ success: boolean; businessName?: string; phoneNumber?: string }> {
    try {
      // Verify the phone number ID
      const phoneInfo = await this.makeRequest(`${this.businessPhoneId}`);
      
      // Verify app access
      const appInfo = await this.makeRequest(`${this.appId}`);

      return {
        success: true,
        businessName: appInfo.name || 'Unknown',
        phoneNumber: phoneInfo.display_phone_number || phoneInfo.phone_number
      };
    } catch (error) {
      return { success: false };
    }
  }

  async sendMessage(to: string, message: string, mediaUrl?: string): Promise<{ messageId: string; success: boolean }> {
    try {
      const messageData: any = {
        messaging_product: 'whatsapp',
        to: to.replace(/[^\d+]/g, ''), // Clean phone number
        type: 'text',
        text: { body: message }
      };

      // Add media if provided and valid
      if (mediaUrl && this.isValidImageUrl(mediaUrl)) {
        messageData.type = 'image';
        messageData.image = {
          link: mediaUrl,
          caption: message
        };
        delete messageData.text;
      }

      const result = await this.makeRequest(`${this.businessPhoneId}/messages`, 'POST', messageData);

      return {
        messageId: result.messages[0].id,
        success: true
      };
    } catch (error) {
      console.error('Failed to send WhatsApp message:', error);
      throw error;
    }
  }

  async sendBroadcast(phoneNumbers: string[], message: string, mediaUrl?: string): Promise<{
    success: boolean;
    messageIds: string[];
    failed: string[];
  }> {
    const messageIds: string[] = [];
    const failed: string[] = [];

    for (const phoneNumber of phoneNumbers) {
      try {
        const result = await this.sendMessage(phoneNumber, message, mediaUrl);
        messageIds.push(result.messageId);
        
        // Add small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`Failed to send to ${phoneNumber}:`, error);
        failed.push(phoneNumber);
      }
    }

    return {
      success: failed.length === 0,
      messageIds,
      failed
    };
  }

  private isValidImageUrl(url: string): boolean {
    try {
      // Skip base64 data URLs
      if (url.startsWith('data:image/')) {
        return false;
      }
      
      // Check if it's a valid HTTP/HTTPS URL
      const parsedUrl = new URL(url);
      return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:';
    } catch {
      return false;
    }
  }

  // Create message templates (for future use)
  async createTemplate(templateName: string, templateData: any): Promise<boolean> {
    try {
      await this.makeRequest(`${this.appId}/message_templates`, 'POST', templateData);
      return true;
    } catch (error) {
      console.error('Failed to create template:', error);
      return false;
    }
  }

  // Get delivery status (webhook-based, this is for reference)
  async getMessageStatus(messageId: string): Promise<string> {
    // This would typically be handled via webhooks
    // For now, return a placeholder status
    return 'sent';
  }
}