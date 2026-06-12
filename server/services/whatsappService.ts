import twilio from 'twilio';
import { formatPhoneToInternational } from '../../shared/phone-utils.js';
import { logServiceError } from '../utils/logServiceError';

interface WhatsAppMessageParams {
  to: string;
  message: string;
  from?: string;
  channel?: 'whatsapp' | 'sms';
}

export async function sendWhatsAppMessage(params: WhatsAppMessageParams): Promise<boolean> {
  try {
    const { to, message } = params;
    const channel = params.channel ?? 'sms';
    
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
    
    if (!accountSid || !authToken || !twilioPhoneNumber) {
      console.log('📱 Twilio credentials not configured, skipping SMS');
      return false;
    }

    const client = twilio(accountSid, authToken);
    
    const formattedPhone = formatPhoneToInternational(to);
    const fromAddress = channel === 'whatsapp' ? `whatsapp:${twilioPhoneNumber}` : twilioPhoneNumber;
    const toAddress   = channel === 'whatsapp' ? `whatsapp:${formattedPhone}`   : formattedPhone;

    console.log(`📱 Sending ${channel === 'whatsapp' ? 'WhatsApp' : 'SMS'} from ${fromAddress} to ${toAddress}`);

    await client.messages.create({
      from: fromAddress,
      to:   toAddress,
      body: message,
    });

    console.log(`✅ ${channel === 'whatsapp' ? 'WhatsApp' : 'SMS'} sent successfully to ${toAddress}`);
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
