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
    
    const subject = `Welcome to ${wholesalerName}! Your Wholesale Portal is Ready`;
    
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
          .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px 20px; text-align: center; }
          .header h1 { margin: 0; font-size: 28px; font-weight: 600; }
          .header p { margin: 10px 0 0 0; font-size: 16px; opacity: 0.9; }
          .content { padding: 40px 30px; }
          .welcome-message { background-color: #f0fdf4; border-left: 4px solid #10b981; padding: 20px; margin: 20px 0; border-radius: 5px; }
          .cta-button { display: inline-block; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: 600; margin: 20px 0; text-align: center; transition: transform 0.2s; }
          .cta-button:hover { transform: translateY(-2px); }
          .contact-info { background-color: #f9fafb; border: 1px solid #e5e7eb; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .footer { background-color: #f9fafb; padding: 20px; text-align: center; font-size: 14px; color: #6b7280; border-top: 1px solid #e5e7eb; }
          .steps { margin: 20px 0; }
          .step { display: flex; align-items: flex-start; margin-bottom: 15px; }
          .step-number { background-color: #10b981; color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: bold; margin-right: 12px; flex-shrink: 0; }
          @media (max-width: 600px) {
            .content { padding: 20px; }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Welcome to the ${wholesalerName} family!</h1>
            <p>Your wholesale account has been successfully set up</p>
          </div>
          
          <div class="content">
            <div class="welcome-message">
              <h2 style="margin-top: 0; color: #059669;">Hi ${customerName}!</h2>
              <p>You now have full access to our catalog, pricing, and seamless ordering system.</p>
            </div>

            <h3 style="color: #374151; margin-bottom: 15px;">Here's how to get started:</h3>
            
            <div class="steps">
              <div class="step">
                <div class="step-number">1</div>
                <div>
                  <strong>Log in to your portal:</strong><br>
                  Access your personalized wholesale portal using the link below.
                </div>
              </div>
              
              <div class="step">
                <div class="step-number">2</div>
                <div>
                  <strong>Explore our products:</strong><br>
                  Browse our wide range of high-quality products with wholesale pricing.
                </div>
              </div>
              
              <div class="step">
                <div class="step-number">3</div>
                <div>
                  <strong>Place your first order:</strong><br>
                  Our simple checkout process makes ordering quick and easy.
                </div>
              </div>
            </div>

            <div style="text-align: center;">
              <a href="${portalUrl}" class="cta-button">Access Your Portal</a>
            </div>

            <div class="contact-info">
              <h3 style="margin-top: 0; color: #374151;">Need assistance?</h3>
              <p>We're excited to partner with you. If you have any questions or need help, simply reply to this email.</p>
              <p><strong>Account:</strong> IBK<br>
              <strong>Email:</strong> ${wholesalerEmail}<br>
              <strong>Phone:</strong> +447507658669<br>
              <strong>Address:</strong> 58 Casa amouret, Barking, IG118FG, United Kingdom</p>
            </div>
          </div>
          
          <div class="footer">
            <p style="margin: 0; color: #10b981; font-weight: 600;">Happy ordering,</p>
            <p style="margin: 5px 0 0 0; font-weight: 600;">The ${wholesalerName} Team</p>
            <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; font-size: 12px; color: #9ca3af;">Powered by Quikpik - B2B Wholesale Platform</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    const textContent = `
Welcome to the ${wholesalerName} family!

Hi ${customerName}!

Your wholesale account has been successfully set up, and you now have full access to our catalog, pricing, and seamless ordering system.

Here's how to get started:

1. Log in to your portal: Access your personalized wholesale portal using the link below
2. Explore our products: Browse our wide range of high-quality products with wholesale pricing  
3. Place your first order: Our simple checkout process makes ordering quick and easy

Access Your Portal: ${portalUrl}

Need assistance?
We're excited to partner with you. If you have any questions or need help, simply reply to this email.

Account: IBK
Email: ${wholesalerEmail}
Phone: +447507658669
Address: 58 Casa amouret, Barking, IG118FG, United Kingdom

Happy ordering,
The ${wholesalerName} Team

Powered by Quikpik - B2B Wholesale Platform
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