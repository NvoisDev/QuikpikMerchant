// Simple WhatsApp Integration - Clean Implementation
export class SimpleWhatsAppService {
  
  /**
   * Check if platform has WhatsApp capability
   */
  isCapable(): boolean {
    return !!(
      process.env.TWILIO_ACCOUNT_SID && 
      process.env.TWILIO_AUTH_TOKEN && 
      process.env.TWILIO_PHONE_NUMBER
    );
  }
  
  /**
   * Get platform status and user activation state
   */
  getStatus(user: any) {
    const platformCapable = this.isCapable();
    const userActivated = user.whatsappEnabled === true;
    
    return {
      platformCapable,
      userActivated,
      isConfigured: platformCapable && userActivated,
      serviceProvider: 'Twilio WhatsApp Platform',
      isDemoMode: true // Indicates messages are logged, not sent
    };
  }
  
  /**
   * Send a simple WhatsApp message via Twilio
   */
  async sendMessage(to: string, message: string, from?: string) {
    if (!this.isCapable()) {
      throw new Error('WhatsApp platform not configured');
    }
    
    // For now, just log the message since we don't want to send real messages in demo
    console.log(`📱 WhatsApp Message (Demo Mode):`, {
      to,
      from: from || process.env.TWILIO_PHONE_NUMBER,
      message: message.substring(0, 100) + '...'
    });
    
    // Real Twilio integration would be:
    // const twilio = require('twilio');
    // const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    // return await client.messages.create({
    //   from: `whatsapp:${process.env.TWILIO_PHONE_NUMBER}`,
    //   to: `whatsapp:${to}`,
    //   body: message
    // });
    
    return { success: true, messageId: `demo_${Date.now()}` };
  }
}

export const simpleWhatsAppService = new SimpleWhatsAppService();