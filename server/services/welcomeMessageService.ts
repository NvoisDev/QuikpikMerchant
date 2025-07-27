import { sendWelcomeEmail } from './emailService.js';
import { sendWhatsAppMessage } from './whatsappService.js';

interface WelcomeMessageParams {
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  wholesalerName: string;
  wholesalerEmail: string;
  wholesalerPhone?: string;
  portalUrl: string;
}

interface WelcomeResult {
  emailSent: boolean;
  whatsappSent: boolean;
  errors: string[];
}

export async function sendWelcomeMessages(params: WelcomeMessageParams): Promise<WelcomeResult> {
  const { 
    customerName, 
    customerEmail, 
    customerPhone, 
    wholesalerName, 
    wholesalerEmail,
    wholesalerPhone,
    portalUrl 
  } = params;

  const result: WelcomeResult = {
    emailSent: false,
    whatsappSent: false,
    errors: []
  };

  // Send welcome email if customer has email
  if (customerEmail) {
    try {
      const emailSuccess = await sendWelcomeEmail({
        customerEmail,
        customerName,
        wholesalerName,
        wholesalerEmail,
        portalUrl
      });
      result.emailSent = emailSuccess;
      if (!emailSuccess) {
        result.errors.push('Failed to send welcome email');
      }
    } catch (error) {
      result.errors.push(`Email error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // Send welcome WhatsApp message if customer has phone
  if (customerPhone) {
    try {
      const whatsappMessage = createWelcomeWhatsAppMessage({
        customerName,
        wholesalerName,
        wholesalerEmail,
        wholesalerPhone,
        portalUrl
      });

      const whatsappSuccess = await sendWhatsAppMessage({
        to: customerPhone,
        message: whatsappMessage,
        from: wholesalerPhone || undefined
      });
      
      result.whatsappSent = whatsappSuccess;
      if (!whatsappSuccess) {
        result.errors.push('Failed to send welcome WhatsApp message');
      }
    } catch (error) {
      result.errors.push(`WhatsApp error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  return result;
}

function createWelcomeWhatsAppMessage(params: {
  customerName: string;
  wholesalerName: string;
  wholesalerEmail: string;
  wholesalerPhone?: string;
  portalUrl: string;
}): string {
  const { customerName, wholesalerName, wholesalerEmail, wholesalerPhone, portalUrl } = params;

  return `🎉 *Welcome to ${wholesalerName}!*

Hello ${customerName}! 👋

We're excited to welcome you to our wholesale platform. You now have access to our complete product catalog and can place orders directly online.

*What you can do:*
🛒 Browse our full product range
💰 View wholesale pricing  
📱 Place orders anytime
🚚 Choose delivery options
💬 Negotiate prices directly

*Access your portal:*
${portalUrl}

*Need help?*
📧 ${wholesalerEmail}${wholesalerPhone ? `\n📞 ${wholesalerPhone}` : ''}

We're here to support your business success! 🚀

_Powered by Quikpik - Modern B2B Commerce_`;
}

export { createWelcomeWhatsAppMessage };