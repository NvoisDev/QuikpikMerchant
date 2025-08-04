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
    debugCode?: string;
  }> {
    this.initialize();
    
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    // Clean SMS logging for production
    console.log(`📤 Sending SMS verification to ${phoneNumber}`);

    // If no Twilio client configured, return error
    if (!this.twilioClient) {
      return {
        success: false,
        error: 'SMS service not configured'
      };
    }

    // If no phone number configured, return error
    if (!process.env.TWILIO_PHONE_NUMBER) {
      return {
        success: false,
        error: 'SMS phone number not configured'
      };
    }

    // SMS DISABLED: Skip sending real SMS for platform simplicity
    console.log(`🚫 SMS sending disabled for platform simplicity - code would be: ${code}`);
    
    // Return success without actually sending SMS
    return {
      success: true,
      messageId: 'sms_disabled_for_simplicity',
      debugCode: code // Provide code for development purposes
    };

    // OLD CODE: Attempt to send real SMS (disabled for simplicity)
    /*
    try {
      console.log(`📤 Attempting SMS to ${phoneNumber}`);
      
      const message = await this.twilioClient.messages.create({
        body: `Your ${businessName} verification code: ${code}. This code expires in 5 minutes.`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: phoneNumber,
        riskCheck: 'disable' // Prevent legitimate messages from being blocked by spam filtering
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

      // In development mode, provide fallback functionality
      if (isDevelopment) {
        console.log('🧪 Development Mode: Providing SMS fallback');
        console.log(`📋 VERIFICATION CODE FOR ${phoneNumber}: ${code}`);
        
        // Display verification code prominently in console
        console.log('┌─────────────────────────────────────────┐');
        console.log('│           SMS VERIFICATION CODE         │');
        console.log('├─────────────────────────────────────────┤');
        console.log(`│  Phone: ${phoneNumber.padEnd(20)}      │`);
        console.log(`│  Code:  ${code.padEnd(20)}              │`);
        console.log(`│  Business: ${businessName.padEnd(15)}   │`);
        console.log('│  Valid for: 5 minutes                  │');
        console.log('└─────────────────────────────────────────┘');
        
        return {
          success: true,
          messageId: `dev_${Date.now()}`,
          debugCode: code
        };
      }

      return {
        success: false,
        error: error.message
      };
    }
    */
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