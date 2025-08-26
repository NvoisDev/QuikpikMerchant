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
              <p>We're excited to welcome you to our wholesale platform. You now have access to our complete product catalog, competitive wholesale pricing, and streamlined ordering system.</p>
            </div>

            <h3 style="color: #333; margin-bottom: 20px;">What you can do with your portal:</h3>
            
            <div class="features">
              <div class="feature">
                <div class="feature-icon">🛒</div>
                <div class="feature-content">
                  <h3>Browse & Order Products</h3>
                  <p>View our complete product catalog with real-time stock levels and wholesale pricing</p>
                </div>
              </div>
              
              <div class="feature">
                <div class="feature-icon">💬</div>
                <div class="feature-content">
                  <h3>Negotiate Prices</h3>
                  <p>Submit price negotiation requests directly through the platform for better deals</p>
                </div>
              </div>
              
              <div class="feature">
                <div class="feature-icon">🚚</div>
                <div class="feature-content">
                  <h3>Flexible Delivery Options</h3>
                  <p>Choose between collection, local delivery, or nationwide shipping with live quotes</p>
                </div>
              </div>
              
              <div class="feature">
                <div class="feature-icon">📊</div>
                <div class="feature-content">
                  <h3>Order Tracking</h3>
                  <p>Track your order history, view invoices, and monitor delivery status in real-time</p>
                </div>
              </div>
            </div>

            <div style="text-align: center;">
              <a href="${portalUrl}" class="cta-button">Access Your Portal Now</a>
            </div>

            <div class="contact-info">
              <h3 style="margin-top: 0; color: #333;">Need Help?</h3>
              <p>Our team is here to assist you. Contact us directly:</p>
              <p><strong>Email:</strong> ${wholesalerEmail}</p>
              <p><strong>Business:</strong> ${wholesalerName}</p>
              <p style="margin-bottom: 0;"><em>We typically respond within 2-4 hours during business days.</em></p>
            </div>

            <p style="color: #666; font-size: 14px; margin-top: 30px;">
              <strong>Getting Started Tips:</strong><br>
              • Browse products by category to find what you need<br>
              • Check minimum order quantities (MOQ) before ordering<br>
              • Use the search function to quickly find specific products<br>
              • Contact us for bulk pricing on large orders
            </p>
          </div>
          
          <div class="footer">
            <p>This email was sent because you were added as a customer to ${wholesalerName}'s wholesale platform.</p>
            <div style="margin-top: 20px; padding-top: 15px; border-top: 1px solid #e9ecef;">
              <div style="display: flex; align-items: center; justify-content: center; gap: 10px;">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="12" cy="12" r="10" fill="#10b981" stroke="#065f46" stroke-width="1"/>
                  <path d="M8 12 L11 15 L16 10" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                <span style="color: #666; font-size: 14px;">Powered by <strong style="color: #10b981;">Quikpik</strong></span>
              </div>
              <p style="margin: 5px 0 0 0; font-size: 12px; color: #999;">Modern B2B Commerce Platform</p>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;

    const textContent = `
Welcome to ${wholesalerName}!

Hello ${customerName},

We're excited to welcome you to our wholesale platform. You now have access to our complete product catalog, competitive wholesale pricing, and streamlined ordering system.

What you can do with your portal:

🛒 Browse & Order Products
View our complete product catalog with real-time stock levels and wholesale pricing

💬 Negotiate Prices  
Submit price negotiation requests directly through the platform for better deals

🚚 Flexible Delivery Options
Choose between collection, local delivery, or nationwide shipping with live quotes

📊 Order Tracking
Track your order history, view invoices, and monitor delivery status in real-time

Access Your Portal: ${portalUrl}

Need Help?
Our team is here to assist you:
Email: ${wholesalerEmail}
Business: ${wholesalerName}
We typically respond within 2-4 hours during business days.

Getting Started Tips:
• Browse products by category to find what you need
• Check minimum order quantities (MOQ) before ordering  
• Use the search function to quickly find specific products
• Contact us for bulk pricing on large orders

This email was sent because you were added as a customer to ${wholesalerName}'s wholesale platform.
Powered by Quikpik - Modern B2B Commerce Platform
    `;

    await mailService.send({
      to: customerEmail,
      from: wholesalerEmail,
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
      text: params.text,
      html: params.html,
    });
    return true;
  } catch (error) {
    console.error('SendGrid email error:', error);
    return false;
  }
}