import { MailService } from '@sendgrid/mail';

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
  portalUrl: string;
}

interface EmailParams {
  to: string;
  from: string;
  subject: string;
  text?: string;
  html?: string;
}

export async function sendWelcomeEmail(params: WelcomeEmailParams): Promise<boolean> {
  try {
    const { customerEmail, customerName, wholesalerName, wholesalerEmail, portalUrl } = params;
    console.log('📧 Sending welcome email to:', customerEmail);
    
    const subject = `Welcome to ${wholesalerName} - Your Wholesale Portal Access`;
    
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to ${wholesalerName}</title>
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f7f9fc; }
          .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 10px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px 20px; text-align: center; }
          .header h1 { margin: 0; font-size: 28px; font-weight: 600; }
          .header p { margin: 10px 0 0 0; font-size: 16px; opacity: 0.9; }
          .content { padding: 40px 30px; }
          .welcome-message { background-color: #f8f9fa; border-left: 4px solid #667eea; padding: 20px; margin: 20px 0; border-radius: 5px; }
          .features { display: grid; grid-template-columns: 1fr; gap: 15px; margin: 30px 0; }
          .feature { display: flex; align-items: flex-start; padding: 15px; border: 1px solid #e9ecef; border-radius: 8px; background-color: #f8f9fa; }
          .feature-icon { width: 40px; height: 40px; background-color: #667eea; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 15px; flex-shrink: 0; }
          .feature-content h3 { margin: 0 0 5px 0; font-size: 16px; color: #333; }
          .feature-content p { margin: 0; font-size: 14px; color: #666; }
          .cta-button { display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 25px; font-weight: 600; margin: 30px 0; text-align: center; transition: transform 0.2s; }
          .cta-button:hover { transform: translateY(-2px); }
          .contact-info { background-color: #e9ecef; padding: 20px; border-radius: 8px; margin: 30px 0; }
          .footer { background-color: #f8f9fa; padding: 20px; text-align: center; font-size: 14px; color: #666; border-top: 1px solid #e9ecef; }
          @media (max-width: 600px) {
            .content { padding: 20px; }
            .features { grid-template-columns: 1fr; }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Welcome to ${wholesalerName}!</h1>
            <p>Your wholesale portal is ready</p>
          </div>
          
          <div class="content">
            <div class="welcome-message">
              <h2 style="margin-top: 0; color: #667eea;">Hello ${customerName}!</h2>
              <p>Your account with <strong>${wholesalerName}</strong> is now ready. Access our store to browse products, place orders, and manage your account.</p>
              <p><strong>To get started:</strong> Visit the portal below and add your phone number to enable SMS notifications and streamlined ordering.</p>
            </div>

            <div style="text-align: center;">
              <a href="${portalUrl}" class="cta-button">Access Your Portal Now</a>
            </div>

            <div class="contact-info">
              <h3 style="margin-top: 0; color: #333;">Need Help?</h3>
              <p>Contact us directly:</p>
              <p><strong>Email:</strong> ${wholesalerEmail}</p>
              <p><strong>Business:</strong> ${wholesalerName}</p>
            </div>
          </div>
          
          <div class="footer">
            <p>Welcome to the future of B2B commerce! You've been added to ${wholesalerName}'s intelligent wholesale platform.</p>
            <div style="margin-top: 20px; padding-top: 15px; border-top: 1px solid #e9ecef;">
              <div style="display: flex; align-items: center; justify-content: center; gap: 10px;">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="12" cy="12" r="10" fill="#10b981" stroke="#065f46" stroke-width="1"/>
                  <path d="M8 12 L11 15 L16 10" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                <span style="color: #666; font-size: 14px;">Powered by <strong style="color: #10b981;">Quikpik</strong></span>
              </div>
              <p style="margin: 5px 0 0 0; font-size: 12px; color: #999;">Transforming B2B Commerce with Intelligence & Value</p>
              <p style="margin: 5px 0 0 0; font-size: 11px; color: #aaa;">Your portal continuously evolves to maximize your business potential</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    const textContent = `
Welcome to ${wholesalerName}!

Hello ${customerName},

Your account with ${wholesalerName} is now ready. Access our store to browse products, place orders, and manage your account.

To get started: Visit the portal below and add your phone number to enable SMS notifications and streamlined ordering.

Access Your Portal: ${portalUrl}

Need Help?
Contact us directly:
Email: ${wholesalerEmail}
Business: ${wholesalerName}

Powered by Quikpik
    `;

    await mailService.send({
      to: customerEmail,
      from: 'hello@quikpik.co', // Use verified SendGrid sender
      replyTo: wholesalerEmail, // Replies go to wholesaler
      subject: subject,
      text: textContent,
      html: htmlContent,
    });

    console.log(`Welcome email sent successfully to ${customerEmail}`);
    return true;
  } catch (error) {
    console.error('SendGrid email error:', error);
    return false;
  }
}

export async function sendEmail(params: EmailParams): Promise<boolean> {
  try {
    await mailService.send({
      to: params.to,
      from: params.from,
      subject: params.subject,
      text: params.text || '',
      html: params.html || '',
    });
    return true;
  } catch (error) {
    console.error('SendGrid email error:', error);
    return false;
  }
}