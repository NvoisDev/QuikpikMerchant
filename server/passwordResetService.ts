import crypto from 'crypto';
import { sendEmail } from './sendgrid-service';

/**
 * Service for handling password reset functionality
 */

/**
 * Generate a secure random token for password reset
 * @returns object - { token: string, hashedToken: string }
 */
export function generateResetToken(): { token: string; hashedToken: string } {
  const token = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
  return { token, hashedToken };
}

/**
 * Hash a reset token for storage comparison
 * @param token - Plain text token
 * @returns string - Hashed token
 */
export function hashResetToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Create password reset expiration date (1 hour from now)
 * @returns Date - Expiration date
 */
export function createResetExpiration(): Date {
  const expiration = new Date();
  expiration.setHours(expiration.getHours() + 1); // 1 hour expiration
  return expiration;
}

/**
 * Send password reset email to user
 * @param email - User's email address
 * @param token - Reset token
 * @param firstName - User's first name for personalization
 */
export async function sendPasswordResetEmail(email: string, token: string, firstName?: string): Promise<void> {
  const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5000'}/reset-password?token=${token}`;
  
  const emailContent = `
    <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <div style="display: inline-block; width: 60px; height: 60px; background: #3b82f6; border-radius: 50%; line-height: 60px; color: white; font-size: 28px; font-weight: bold;">
          Q
        </div>
        <h1 style="color: #1f2937; margin: 20px 0 0 0;">Quikpik</h1>
      </div>
      
      <div style="background: #f8fafc; border-radius: 12px; padding: 30px; margin: 20px 0;">
        <h2 style="color: #1f2937; margin: 0 0 20px 0; font-size: 24px;">Reset Your Password</h2>
        
        ${firstName ? `<p style="color: #4b5563; font-size: 16px; line-height: 1.6;">Hi ${firstName},</p>` : ''}
        
        <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
          We received a request to reset your password for your Quikpik account. Click the button below to create a new password:
        </p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" style="background: #3b82f6; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; display: inline-block;">
            Reset Password
          </a>
        </div>
        
        <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 20px 0 0 0;">
          This link will expire in 1 hour for security purposes. If you didn't request this password reset, you can safely ignore this email.
        </p>
      </div>
      
      <div style="border-top: 1px solid #e5e7eb; padding-top: 20px; margin-top: 30px;">
        <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 0;">
          If you're having trouble clicking the button, copy and paste this URL into your browser:<br>
          <span style="word-break: break-all;">${resetUrl}</span>
        </p>
        
        <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 20px 0 0 0;">
          This email was sent from Quikpik. Please do not reply to this email.
        </p>
      </div>
    </div>
  `;

  await sendEmail({
    to: email,
    from: process.env.SENDGRID_FROM_EMAIL || 'noreply@quikpik.co',
    subject: 'Reset Your Quikpik Password',
    html: emailContent
  });
}