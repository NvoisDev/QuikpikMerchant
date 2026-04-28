import { sendWelcomeEmail } from './emailService.js';
import { sendWhatsAppMessage } from './whatsappService.js';

interface WelcomeMessageParams {
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  wholesalerName: string;
  wholesalerEmail: string;
  wholesalerPhone?: string;
  wholesalerAccountName?: string;
  portalUrl: string;
  wholesalerId?: string | null;
  wholesalerLogoType?: string | null;
  wholesalerLogoUrl?: string | null;
}

interface WelcomeResult {
  emailSent: boolean;
  smsSent: boolean;
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
    wholesalerAccountName,
    portalUrl 
  } = params;

  const result: WelcomeResult = {
    emailSent: false,
    smsSent: false,
    whatsappSent: false,
    errors: [],
  };

  // Send welcome email if customer has email
  if (customerEmail) {
    try {
      const emailSuccess = await sendWelcomeEmail({
        customerEmail,
        customerName,
        wholesalerName,
        wholesalerEmail,
        wholesalerAccountName,
        portalUrl,
        wholesalerId: params.wholesalerId,
        wholesalerLogoType: params.wholesalerLogoType,
        wholesalerLogoUrl: params.wholesalerLogoUrl,
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

  return `Welcome to ${wholesalerName}!

Your account is ready. Access our store and start ordering here: ${portalUrl}

Powered by Quikpik`;
}

export { createWelcomeWhatsAppMessage };