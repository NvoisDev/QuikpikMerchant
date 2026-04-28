import twilio from 'twilio';
import { formatPhoneToInternational } from '../../shared/phone-utils.js';

interface WhatsAppMessageParams {
  to: string;
  message: string;
  from?: string;
}

export async function sendWhatsAppMessage(params: WhatsAppMessageParams): Promise<boolean> {
  try {
    const { to, message, from } = params;
    
    // Check if Twilio credentials are available
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    // Use dedicated WhatsApp number if set, otherwise fall back to the SMS number
    const twilioPhoneNumber = process.env.TWILIO_WHATSAPP_NUMBER || process.env.TWILIO_PHONE_NUMBER;
    
    if (!accountSid || !authToken || !twilioPhoneNumber) {
      console.log('📱 Twilio credentials not configured, skipping WhatsApp message');
      return false;
    }

    const client = twilio(accountSid, authToken);
    
    // Format phone number to international format
    const formattedPhone = formatPhoneToInternational(to);
    const fromNumber = `whatsapp:${twilioPhoneNumber}`;
    const toNumber = `whatsapp:${formattedPhone}`;

    console.log(`📱 Sending WhatsApp message from ${fromNumber} to ${toNumber}`);
    
    const DO_NOT_REPLY_FOOTER = '\n\n─────────────────\n⚠️ Please do not reply to this number. This is an automated message.';

    await client.messages.create({
      from: fromNumber,
      to: toNumber,
      body: message + DO_NOT_REPLY_FOOTER
    });

    console.log(`✅ WhatsApp message sent successfully to ${formattedPhone}`);
    return true;
  } catch (error) {
    console.error('❌ WhatsApp message error:', error);
    return false;
  }
}

// Removed duplicate phone formatting function - now using shared formatPhoneToInternational