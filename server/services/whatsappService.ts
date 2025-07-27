import twilio from 'twilio';

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
    const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
    
    if (!accountSid || !authToken || !twilioPhoneNumber) {
      console.log('Twilio credentials not configured, skipping WhatsApp message');
      return false;
    }

    const client = twilio(accountSid, authToken);
    
    // Format phone number to international format
    const formattedPhone = formatPhoneToWhatsApp(to);
    const fromNumber = `whatsapp:${twilioPhoneNumber}`;
    const toNumber = `whatsapp:${formattedPhone}`;

    await client.messages.create({
      from: fromNumber,
      to: toNumber,
      body: message
    });

    console.log(`WhatsApp message sent successfully to ${formattedPhone}`);
    return true;
  } catch (error) {
    console.error('WhatsApp message error:', error);
    return false;
  }
}

function formatPhoneToWhatsApp(phone: string): string {
  // Remove all non-digit characters
  let cleaned = phone.replace(/\D/g, '');
  
  // Handle UK numbers specifically
  if (cleaned.startsWith('44')) {
    return `+${cleaned}`;
  } else if (cleaned.startsWith('0')) {
    return `+44${cleaned.slice(1)}`;
  } else if (cleaned.length === 10) {
    return `+44${cleaned}`;
  }
  
  // For other formats, add + if not present
  return cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
}