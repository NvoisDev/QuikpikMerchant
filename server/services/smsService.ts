import twilio from 'twilio';
import { formatPhoneToInternational } from '../../shared/phone-utils.js';

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
      console.log('📱 Twilio credentials not configured, skipping SMS message');
      return false;
    }

    console.log('📱 Twilio SMS Configuration:', {
      hasSID: !!accountSid,
      hasToken: !!authToken,
      hasPhone: !!twilioPhoneNumber,
      phoneNumber: twilioPhoneNumber
    });

    const client = twilio(accountSid, authToken);
    
    // Format phone number to international format
    const formattedPhone = formatPhoneToInternational(to);

    console.log(`📱 Sending SMS from ${twilioPhoneNumber} to ${formattedPhone}`);
    
    await client.messages.create({
      from: twilioPhoneNumber,
      to: formattedPhone,
      body: message
    });

    console.log(`✅ SMS sent successfully to ${formattedPhone}`);
    return true;
  } catch (error) {
    console.error('❌ SMS error:', error);
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

  return `Welcome to ${wholesalerName}: You've been onboarded!

Your account is ready. Access your store and start ordering here:${portalUrl}

Access exclusive wholesale pricing, place orders 24/7, track Orders, and manage your account seamlessly.


Question?
Contact name: ${wholesalerAccountName || 'Ibk Test'}
${wholesalerEmail} | ${wholesalerPhone || '07521469170'}

Start ordering today!



Powered by Quikpik`;
}