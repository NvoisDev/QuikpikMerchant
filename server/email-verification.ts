// Phase 2: Email verification integration with SMS authentication
import { db } from "./db.js";
import { sql } from "drizzle-orm";
import { sendEmail } from "./sendgrid-service.js";

export interface EmailVerificationData {
  customerId: string;
  email: string;
  code: string;
  expiresAt: Date;
}

export async function createEmailVerification(
  customerId: string, 
  email: string
): Promise<string> {
  try {
    // Generate 6-digit verification code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Store verification code in database
    await db.execute(sql`
      INSERT INTO customer_email_verifications 
      (customer_id, email, verification_code, expires_at, created_at)
      VALUES (${customerId}, ${email}, ${verificationCode}, ${expiresAt}, NOW())
      ON CONFLICT (customer_id, email) 
      DO UPDATE SET 
        verification_code = ${verificationCode},
        expires_at = ${expiresAt},
        created_at = NOW(),
        verified = FALSE
    `);

    // Send verification email
    await sendVerificationEmail(email, verificationCode);
    
    console.log(`📧 Email verification code sent to ${email} for customer ${customerId}`);
    return verificationCode;
  } catch (error) {
    console.error("Error creating email verification:", error);
    throw new Error("Failed to create email verification");
  }
}

export async function verifyEmailCode(
  customerId: string,
  email: string,
  code: string
): Promise<boolean> {
  try {
    const result = await db.execute(sql`
      UPDATE customer_email_verifications 
      SET verified = TRUE, verified_at = NOW()
      WHERE customer_id = ${customerId} 
        AND email = ${email}
        AND verification_code = ${code}
        AND expires_at > NOW()
        AND verified = FALSE
      RETURNING id
    `);

    const isVerified = result.rows.length > 0;
    console.log(`📧 Email verification ${isVerified ? 'successful' : 'failed'} for ${email}`);
    return isVerified;
  } catch (error) {
    console.error("Error verifying email code:", error);
    return false;
  }
}

async function sendVerificationEmail(email: string, code: string): Promise<void> {
  const subject = "Verify your email - Quikpik Customer Portal";
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 28px;">Quikpik</h1>
        <p style="color: white; margin: 10px 0 0 0; opacity: 0.9;">Customer Portal Access</p>
      </div>
      
      <div style="background: white; padding: 40px; border-radius: 0 0 10px 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
        <h2 style="color: #333; margin: 0 0 20px 0;">Email Verification Required</h2>
        
        <p style="color: #666; font-size: 16px; line-height: 1.5; margin-bottom: 30px;">
          To complete your authentication and access your order history, please verify your email address using the code below:
        </p>
        
        <div style="background: #f8fafc; border: 2px dashed #667eea; border-radius: 8px; padding: 30px; text-align: center; margin: 30px 0;">
          <p style="color: #333; font-size: 14px; margin: 0 0 10px 0;">Your verification code:</p>
          <h1 style="color: #667eea; font-size: 36px; font-weight: bold; margin: 0; letter-spacing: 4px;">${code}</h1>
        </div>
        
        <p style="color: #888; font-size: 14px; margin: 20px 0 0 0;">
          ⏰ This code will expire in 10 minutes<br>
          🔒 For security, never share this code with anyone
        </p>
        
        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
        
        <p style="color: #999; font-size: 12px; text-align: center; margin: 0;">
          This email was sent from Quikpik Customer Portal. If you didn't request this verification, you can safely ignore this email.
        </p>
      </div>
    </div>
  `;

  const textContent = `
    Quikpik - Email Verification Required
    
    To complete your authentication and access your order history, please verify your email address.
    
    Your verification code: ${code}
    
    This code will expire in 10 minutes.
    For security, never share this code with anyone.
    
    If you didn't request this verification, you can safely ignore this email.
  `;

  await sendEmail({
    to: email,
    from: "noreply@quikpik.app",
    subject: subject,
    html: htmlContent,
    text: textContent
  });
}

export async function cleanupExpiredVerifications(): Promise<void> {
  try {
    await db.execute(sql`
      DELETE FROM customer_email_verifications 
      WHERE expires_at < NOW()
    `);
    console.log("🧹 Cleaned up expired email verifications");
  } catch (error) {
    console.error("Error cleaning up expired verifications:", error);
  }
}

// Clean up expired verifications every 30 minutes
setInterval(cleanupExpiredVerifications, 30 * 60 * 1000);