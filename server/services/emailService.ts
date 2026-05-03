import { MailService } from '@sendgrid/mail';
import { wrapCustomerEmail, emailHeading, emailCard, emailButton, getEmailLogoUrl } from '../email-templates';
import { logServiceError } from '../utils/logServiceError';

if (!process.env.SENDGRID_API_KEY) {
  throw new Error("SENDGRID_API_KEY environment variable must be set");
}

const mailService = new MailService();
mailService.setApiKey(process.env.SENDGRID_API_KEY);

interface WelcomeEmailParams {
  customerEmail: string;
  customerName: string;
  wholesalerName: string;
  wholesalerEmail: string;
  wholesalerAccountName?: string;
  portalUrl: string;
  wholesalerId?: string | null;
  wholesalerLogoType?: string | null;
  wholesalerLogoUrl?: string | null;
}

export async function sendWelcomeEmail(params: WelcomeEmailParams): Promise<boolean> {
  try {
    const { customerEmail, customerName, wholesalerName, wholesalerEmail, wholesalerAccountName, portalUrl } = params;
    console.log('📧 Sending welcome email to:', customerEmail);
    
    const subject = `Welcome to ${wholesalerName}! Your Wholesale Portal is Ready`;
    
    const welcomeBody = `${emailHeading('Welcome!', { size: '22px', color: '#10b981' })}<p style="font-size:16px;margin:0 0 8px">Hi ${customerName},</p><p style="margin:0 0 20px">Your wholesale account has been successfully set up. You now have full access to our catalog, pricing, and seamless ordering system.</p>${emailCard(`${emailHeading("Here's how to get started", { size: '16px' })}<ol style="margin:0;padding-left:20px;font-size:14px"><li style="margin-bottom:8px"><strong>Log in to your portal:</strong> Access your personalised wholesale portal using the button below.</li><li style="margin-bottom:8px"><strong>Explore our products:</strong> Browse our wide range of high-quality products with wholesale pricing.</li><li><strong>Place your first order:</strong> Our simple checkout process makes ordering quick and easy.</li></ol>`, { borderColor: '#a7f3d0', bgColor: '#ecfdf5' })}${emailButton('Access Your Portal', portalUrl)}${emailCard(`${emailHeading('Need assistance?', { size: '16px' })}<p style="margin:0 0 8px">We're excited to partner with you. If you have any questions or need help, simply reply to this email.</p><p style="margin:0 0 4px"><strong>Contact:</strong> ${wholesalerAccountName || wholesalerName}</p><p style="margin:0"><strong>Email:</strong> ${wholesalerEmail}</p>`)}<p style="margin:20px 0 0;text-align:center;color:#10b981;font-weight:600">Happy ordering!</p>`;

    const htmlContent = wrapCustomerEmail(welcomeBody, { businessName: wholesalerName, logoUrl: getEmailLogoUrl(params.wholesalerId, params.wholesalerLogoType, params.wholesalerLogoUrl) }, { preheader: `Welcome to ${wholesalerName} - your wholesale portal is ready` });

    await mailService.send({
      to: customerEmail,
      from: 'hello@quikpik.co',
      replyTo: wholesalerEmail,
      subject: subject,
      html: htmlContent,
    });

    console.log(`Welcome email sent successfully to ${customerEmail}`);
    return true;
  } catch (error: unknown) {
    console.error('SendGrid email error:', error);
    const msg = error instanceof Error ? error.message : String(error);
    const statusCode = (error instanceof Error && (error as Record<string, unknown>)?.response)
      ? ((error as Record<string, unknown>).response as Record<string, unknown>)?.status
      : undefined;
    await logServiceError('sendgrid', 'sendWelcomeEmail', msg, {
      to: params.customerEmail,
      statusCode,
    });
    return false;
  }
}

