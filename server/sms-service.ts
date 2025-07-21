import twilio from 'twilio';

// SMS Service with comprehensive debugging and fallback support
export class ReliableSMSService {
  private static twilioClient: twilio.Twilio | null = null;
  private static isInitialized = false;

  // Initialize Twilio client
  private static initialize() {
    if (this.isInitialized) return;
    
    console.log('🔧 SMS Service Initialization');
    console.log('Twilio credentials check:', {
      hasSID: !!process.env.TWILIO_ACCOUNT_SID,
      hasToken: !!process.env.TWILIO_AUTH_TOKEN,
      hasPhone: !!process.env.TWILIO_PHONE_NUMBER,
      environment: process.env.NODE_ENV
    });

    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      try {
        this.twilioClient = twilio(
          process.env.TWILIO_ACCOUNT_SID,
          process.env.TWILIO_AUTH_TOKEN
        );
        console.log('✅ Twilio client initialized successfully');
      } catch (error) {
        console.error('❌ Twilio client initialization failed:', error);
        this.twilioClient = null;
      }
    } else {
      console.log('⚠️ Twilio credentials missing, using development mode');
    }
    
    this.isInitialized = true;
  }

  // Generate 6-digit verification code
  static generateVerificationCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  // Send SMS with comprehensive error handling and debugging
  static async sendVerificationSMS(phoneNumber: string, code: string, businessName: string): Promise<{
    success: boolean;
    messageId?: string;
    error?: string;
  }> {
    this.initialize();
    
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    // Always show debug info in development
    if (isDevelopment) {
      console.log('\n🚀 DEVELOPMENT MODE - SMS VERIFICATION CODE');
      console.log('=' .repeat(50));
      console.log(`📱 Phone: ${phoneNumber}`);
      console.log(`🔐 Code: ${code}`);
      console.log(`🏢 Business: ${businessName}`);
      console.log(`⏰ Expires: ${new Date(Date.now() + 5 * 60 * 1000).toLocaleTimeString()}`);
      console.log('=' .repeat(50));
    }

    // If no Twilio client, return success in development mode
    if (!this.twilioClient) {
      if (isDevelopment) {
        console.log('✅ SMS simulated (no Twilio client)');
        return {
          success: true,
          messageId: `dev_${Date.now()}`
        };
      }
      return {
        success: false,
        error: 'SMS service not configured'
      };
    }

    // If no phone number configured, return success in development mode
    if (!process.env.TWILIO_PHONE_NUMBER) {
      if (isDevelopment) {
        console.log('✅ SMS simulated (no phone number configured)');
        return {
          success: true,
          messageId: `dev_${Date.now()}`
        };
      }
      return {
        success: false,
        error: 'SMS phone number not configured'
      };
    }

    // Attempt to send real SMS
    try {
      console.log(`📤 Attempting SMS to ${phoneNumber}`);
      
      const message = await this.twilioClient.messages.create({
        body: `Your ${businessName} verification code: ${code}. This code expires in 5 minutes.`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: phoneNumber
      });

      console.log(`✅ SMS sent successfully: ${message.sid}`);
      
      return {
        success: true,
        messageId: message.sid
      };
    } catch (error: any) {
      console.error('❌ SMS sending failed:', error.message);
      
      // Log specific Twilio error codes
      if (error.code) {
        console.error(`Twilio Error Code: ${error.code}`);
        
        const errorMessages: Record<string, string> = {
          '21659': 'Phone number not verified in Twilio Console',
          '21211': 'Invalid phone number format',
          '21408': 'Permission denied - check account status',
          '21610': 'Message blocked by carrier',
          '30007': 'Message delivery failed'
        };
        
        if (errorMessages[error.code]) {
          console.error(`Error Details: ${errorMessages[error.code]}`);
        }
      }

      // In development mode, simulate success even on error
      if (isDevelopment) {
        console.log('✅ SMS simulated (Twilio error occurred)');
        return {
          success: true,
          messageId: `dev_error_${Date.now()}`
        };
      }

      return {
        success: false,
        error: error.message
      };
    }
  }

  // Check if SMS service is properly configured
  static isConfigured(): boolean {
    this.initialize();
    return this.twilioClient !== null && !!process.env.TWILIO_PHONE_NUMBER;
  }
}

// Main export function for SMS verification
export async function sendSMSVerificationCode(phoneNumber: string, businessName: string): Promise<{
  success: boolean;
  code?: string;
  messageId?: string;
  error?: string;
}> {
  const code = ReliableSMSService.generateVerificationCode();
  const result = await ReliableSMSService.sendVerificationSMS(phoneNumber, code, businessName);
  
  return {
    success: result.success,
    code: result.success ? code : undefined,
    messageId: result.messageId,
    error: result.error
  };
}