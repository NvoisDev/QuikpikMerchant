import crypto from 'crypto';
import { sendEmail } from './sendgrid-service';
import { wrapCustomerEmail, emailHeading, emailCard, emailButton, emailDivider } from './email-templates';

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
export async function sendPasswordResetEmail(email: string, token: string, firstName?: string, branding?: { businessName?: string; logoUrl?: string | null }): Promise<void> {
  const resetUrl = `${process.env.APP_URL || 'https://quikpik.app'}/reset-password?token=${token}`;
  
  const resetBody = `${emailHeading('Reset Your Password', { size: '22px' })}${firstName ? `<p style="font-size:16px;margin:0 0 8px">Hi ${firstName},</p>` : ''}<p style="margin:0 0 20px">We received a request to reset your password for your Quikpik account. Click the button below to create a new password:</p>${emailButton('Reset Password', resetUrl)}${emailCard(`<p style="margin:0;color:#6b7280;font-size:14px">This link will expire in 1 hour for security purposes. If you didn't request this password reset, you can safely ignore this email.</p>`)}${emailDivider()}<p style="color:#9ca3af;font-size:12px;text-align:center;margin:0">If you're having trouble clicking the button, copy and paste this URL into your browser:<br><span style="word-break:break-all">${resetUrl}</span></p>`;

  await sendEmail({
    to: email,
    from: 'hello@quikpik.co',
    subject: 'Reset Your Quikpik Password',
    html: wrapCustomerEmail(resetBody, { businessName: branding?.businessName || 'Quikpik', logoUrl: branding?.logoUrl }, { preheader: 'Reset your Quikpik password' })
  });
}