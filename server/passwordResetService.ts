import crypto from 'crypto';
import sgMail from '@sendgrid/mail';
import { wrapCustomerEmail, emailHeading, emailCard, emailButton, emailDivider } from './email-templates';

export function generateResetToken(): { token: string; hashedToken: string } {
  const token = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
  return { token, hashedToken };
}

export function hashResetToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function createResetExpiration(): Date {
  const expiration = new Date();
  expiration.setHours(expiration.getHours() + 1);
  return expiration;
}

export async function sendPasswordResetEmail(email: string, token: string, firstName?: string, branding?: { businessName?: string; logoUrl?: string | null }): Promise<void> {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    throw new Error('SENDGRID_API_KEY is not set — cannot send password reset email');
  }
  sgMail.setApiKey(apiKey);

  const resetUrl = `${process.env.APP_URL || 'https://quikpik.app'}/reset-password?token=${token}`;

  const resetBody = `${emailHeading('Reset Your Password', { size: '22px' })}${firstName ? `<p style="font-size:16px;margin:0 0 8px">Hi ${firstName},</p>` : ''}<p style="margin:0 0 20px">We received a request to reset your password for your Quikpik account. Click the button below to create a new password:</p>${emailButton('Reset Password', resetUrl)}${emailCard(`<p style="margin:0;color:#6b7280;font-size:14px">This link will expire in 1 hour for security purposes. If you didn't request this password reset, you can safely ignore this email.</p>`)}${emailDivider()}<p style="color:#9ca3af;font-size:12px;text-align:center;margin:0">If you're having trouble clicking the button, copy and paste this URL into your browser:<br><span style="word-break:break-all">${resetUrl}</span></p>`;

  const html = wrapCustomerEmail(resetBody, { businessName: branding?.businessName || 'Quikpik', logoUrl: branding?.logoUrl }, { preheader: 'Reset your Quikpik password' });

  console.log('📧 Sending password reset email to:', email);
  try {
    await sgMail.send({
      to: email,
      from: 'hello@quikpik.co',
      subject: 'Reset Your Quikpik Password',
      html,
    });
    console.log('✅ Password reset email sent successfully to:', email);
  } catch (error: any) {
    console.error('❌ Password reset email failed for', email, ':', error?.response?.body || error?.message || error);
    throw new Error('Failed to send password reset email');
  }
}
