import { MailService } from '@sendgrid/mail';

if (!process.env.SENDGRID_API_KEY) {
  throw new Error("SENDGRID_API_KEY environment variable must be set");
}

const mailService = new MailService();
mailService.setApiKey(process.env.SENDGRID_API_KEY);

interface EmailParams {
  to: string;
  from: string;
  subject: string;
  text?: string;
  html?: string;
}

export async function sendEmail(params: EmailParams): Promise<boolean> {
  try {
    console.log('📧 Sending email via SendGrid:', { to: params.to, subject: params.subject });
    
    await mailService.send({
      to: params.to,
      from: params.from,
      subject: params.subject,
      text: params.text,
      html: params.html,
    });
    
    console.log('✅ Email sent successfully via SendGrid');
    return true;
  } catch (error: any) {
    console.error('❌ SendGrid email error:', error);
    if (error.response?.body?.errors) {
      console.error('📋 SendGrid error details:', JSON.stringify(error.response.body.errors, null, 2));
    }
    if (error.response?.body) {
      console.error('📋 Full SendGrid response body:', JSON.stringify(error.response.body, null, 2));
    }
    return false;
  }
}

export default { sendEmail };