import twilio from 'twilio';

let twilioClient: twilio.Twilio | null = null;

// Initialize Twilio client if credentials are available
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  twilioClient = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  );
}

export class SMSService {
  static generateVerificationCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  static async sendSMSCode(phoneNumber: string, code: string, businessName: string): Promise<boolean> {
    if (!twilioClient) {
      console.error('Twilio client not initialized - missing credentials');
      return false;
    }

    if (!process.env.TWILIO_PHONE_NUMBER) {
      console.error('Twilio phone number not configured');
      return false;
    }

    try {
      const message = await twilioClient.messages.create({
        body: `Your ${businessName} verification code: ${code}. This code expires in 5 minutes.`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: phoneNumber
      });

      console.log('SMS sent successfully:', message.sid);
      return true;
    } catch (error) {
      console.error('Error sending SMS:', error);
      return false;
    }
  }

  static isConfigured(): boolean {
    return twilioClient !== null && !!process.env.TWILIO_PHONE_NUMBER;
  }
}