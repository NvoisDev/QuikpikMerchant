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
  static async sendVerificationSMS(phoneNumber: string, code: string, businessName: string, wholesalerId?: string): Promise<{
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

    // SMS ENABLED: Send real SMS codes with 5-minute expiration
    try {
      console.log(`📤 Attempting SMS to ${phoneNumber}`);
      
      const storeLink = wholesalerId ? `https://quikpik.app/store/${wholesalerId}` : 'https://quikpik.app';
      
      // Send verification code first
      const codeMessage = await this.twilioClient.messages.create({
        body: `Your ${businessName} verification code: ${code}`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: phoneNumber,
        riskCheck: 'disable'
      });
      
      // Send welcome message separately
      const message = await this.twilioClient.messages.create({
        body: `Welcome to ${businessName}!\n\nYour account is ready. Access our store and start ordering here:\n${storeLink}\n\nPowered by Quikpik`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: phoneNumber,
        riskCheck: 'disable' // Prevent legitimate messages from being blocked by spam filtering
      });

      console.log(`✅ SMS verification code sent: ${codeMessage.sid}`);
      console.log(`✅ SMS welcome message sent: ${message.sid}`);
      
      return {
        success: true,
        messageId: `${codeMessage.sid},${message.sid}`
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
        
        const errorMessage = errorMessages[error.code] || 'Unknown SMS error';
        console.error(`Error details: ${errorMessage}`);
      }
      
      return {
        success: false,
        error: error.message || 'SMS sending failed'
      };
    }
  }

  // Send stock alert SMS
  static async sendStockAlertSMS(phoneNumber: string, businessName: string, alertType: string, productCount: number, wholesalerId: string): Promise<{
    success: boolean;
    messageId?: string;
    error?: string;
  }> {
    this.initialize();
    
    console.log(`📤 Sending stock alert SMS to ${phoneNumber}`);

    if (!this.twilioClient) {
      return {
        success: false,
        error: 'SMS service not configured'
      };
    }

    if (!process.env.TWILIO_PHONE_NUMBER) {
      return {
        success: false,
        error: 'SMS phone number not configured'
      };
    }

    try {
      const storeLink = `https://quikpik.app/store/${wholesalerId}`;
      
      let message: string;
      if (alertType === 'low_stock') {
        message = `${businessName} - Stock Alert\n\n${productCount} product${productCount > 1 ? 's' : ''} running low on stock.\n\nManage inventory here:\n${storeLink}\n\nPowered by Quikpik`;
      } else {
        message = `${businessName} - Stock Alert\n\nStock alert for ${productCount} product${productCount > 1 ? 's' : ''}.\n\nView details here:\n${storeLink}\n\nPowered by Quikpik`;
      }

      const twilioMessage = await this.twilioClient.messages.create({
        body: message,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: phoneNumber,
        riskCheck: 'disable'
      });

      console.log(`✅ Stock alert SMS sent successfully: ${twilioMessage.sid}`);
      
      return {
        success: true,
        messageId: twilioMessage.sid
      };
    } catch (error: any) {
      console.error('❌ Stock alert SMS sending failed:', error.message);
      
      return {
        success: false,
        error: error.message || 'Stock alert SMS sending failed'
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