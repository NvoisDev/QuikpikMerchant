import twilio from 'twilio';
import { formatPhoneToInternational } from '../../shared/phone-utils.js';
import { logServiceError } from '../utils/logServiceError';

interface SMSParams {
  to: string;
  message: string;
  from?: string;
}

export async function sendSMS(params: SMSParams): Promise<boolean> {
  try {
    const { to, message, from } = params;
    
    // Check if Twilio credentials are available
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
    
    if (!accountSid || !authToken || !twilioPhoneNumber) {
      return false;
    }

    const client = twilio(accountSid, authToken);
    
    // Format phone number to international format
    const formattedPhone = formatPhoneToInternational(to);

    await client.messages.create({
      from: twilioPhoneNumber,
      to: formattedPhone,
      body: message
    });

    return true;
  } catch (error: unknown) {
    console.error('❌ SMS error:', error);
    const msg = error instanceof Error ? error.message : String(error);
    const twilioCode = (error instanceof Error) ? (error as Record<string, unknown>).code : undefined;
    await logServiceError('twilio', 'sendSMS', msg, {
      to: params.to,
      twilioCode,
    });
    return false;
  }
}

export function createWelcomeSMSMessage(params: {
  customerName: string;
  wholesalerName: string;
  wholesalerEmail: string;
  wholesalerPhone?: string;
  wholesalerAccountName?: string;
  portalUrl: string;
}): string {
  const { customerName, wholesalerName, wholesalerEmail, wholesalerPhone, wholesalerAccountName, portalUrl } = params;

  return `Welcome to ${wholesalerName}! You've been onboarded!

Your account is ready. Access your store and start ordering here: ${portalUrl}

Access exclusive wholesale pricing, place orders 24/7, track orders, and manage your account seamlessly.

Questions?
Contact: ${wholesalerAccountName || 'Support'}
${wholesalerEmail} | ${wholesalerPhone || ''}

Start ordering today!

Powered by Quikpik`;
}