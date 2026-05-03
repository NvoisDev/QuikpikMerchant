import twilio from 'twilio';
import { formatPhoneToInternational } from '../../shared/phone-utils.js';
import { logServiceError } from '../utils/logServiceError';

interface WhatsAppMessageParams {
  to: string;
  message: string;
  from?: string;
}

export async function sendWhatsAppMessage(params: WhatsAppMessageParams): Promise<boolean> {
  try {
    const { to, message } = params;
    
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
    
    if (!accountSid || !authToken || !twilioPhoneNumber) {
      console.log('📱 Twilio credentials not configured, skipping SMS');
      return false;
    }

    const client = twilio(accountSid, authToken);
    
    const formattedPhone = formatPhoneToInternational(to);

    console.log(`📱 Sending SMS from ${twilioPhoneNumber} to ${formattedPhone}`);

    await client.messages.create({
      from: twilioPhoneNumber,
      to: formattedPhone,
      body: message
    });

    console.log(`✅ SMS sent successfully to ${formattedPhone}`);
    return true;
  } catch (error: unknown) {
    console.error('❌ SMS error:', error);
    const msg = error instanceof Error ? error.message : String(error);
    const twilioCode = (error instanceof Error) ? (error as Record<string, unknown>).code : undefined;
    await logServiceError('twilio', 'sendWhatsAppMessage', msg, {
      to: params.to,
      twilioCode,
    });
    return false;
  }
}

// Removed duplicate phone formatting function - now using shared formatPhoneToInternational
