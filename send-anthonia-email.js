const { MailService } = require('@sendgrid/mail');

// Check if SendGrid API key is available
if (!process.env.SENDGRID_API_KEY) {
  console.error("❌ SENDGRID_API_KEY environment variable is not set");
  process.exit(1);
}

const mailService = new MailService();
mailService.setApiKey(process.env.SENDGRID_API_KEY);

async function sendOnboardingEmail() {
  const customerName = "Anthonia Bakare";
  const customerEmail = "anthoniabakare@hotmail.com";
  const customerPhone = "+447482343779";
  const wholesalerName = "Surulere Foods Wholesale";
  const wholesalerId = "104871691614680693123";
  const portalUrl = `https://quikpik.app/customer/${wholesalerId}`;
  const lastFourDigits = customerPhone.slice(-4);

  const welcomeEmailHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Welcome to ${wholesalerName}</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #059669 0%, #047857 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 28px;">Welcome to ${wholesalerName}!</h1>
        <p style="color: white; margin: 10px 0 0 0; font-size: 16px;">Your Customer Portal is Ready</p>
      </div>
      
      <div style="background: #fff; padding: 30px; border: 1px solid #e5e7eb; border-top: none;">
        <h2 style="color: #059669; margin-top: 0;">Hello ${customerName}!</h2>
        
        <p>Welcome to your exclusive customer portal with ${wholesalerName}. We're excited to serve you through our modern, convenient ordering platform.</p>
        
        <div style="background: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="color: #059669; margin-top: 0;">🚀 Access Your Customer Portal</h3>
          <p><strong>Portal URL:</strong> <a href="${portalUrl}" style="color: #059669;">${portalUrl}</a></p>
          <p><strong>Login Code:</strong> ${lastFourDigits} (last 4 digits of your phone)</p>
          <p style="margin-bottom: 0;">Simply enter the code above when prompted, and we'll send you an SMS verification code.</p>
        </div>
        
        <h3 style="color: #059669;">What You Can Do:</h3>
        <ul style="padding-left: 20px;">
          <li><strong>Browse Products:</strong> View our complete catalog with real-time pricing and stock levels</li>
          <li><strong>Place Orders:</strong> Easy online ordering with secure payment processing</li>
          <li><strong>Track Orders:</strong> Monitor your order status and delivery updates</li>
          <li><strong>Manage Profile:</strong> Update your contact details and delivery addresses</li>
          <li><strong>View Order History:</strong> Access all your previous orders and receipts</li>
        </ul>
        
        <div style="background: #ecfdf5; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981;">
          <h3 style="color: #059669; margin-top: 0;">💡 Need Help?</h3>
          <p style="margin-bottom: 0;">If you have any questions or need assistance, please don't hesitate to contact ${wholesalerName} directly. We're here to make your ordering experience as smooth as possible.</p>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${portalUrl}" style="background: #059669; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Access Your Portal</a>
        </div>
        
        <p style="color: #6b7280; font-size: 14px; text-align: center; margin-top: 30px;">
          This email was sent to you because you've been added as a customer of ${wholesalerName}.<br>
          If you believe this was sent in error, please contact ${wholesalerName} directly.
        </p>
      </div>
    </body>
    </html>
  `;

  const welcomeEmailText = `
Welcome to ${wholesalerName}!

Hello ${customerName},

Welcome to your exclusive customer portal with ${wholesalerName}. We're excited to serve you through our modern, convenient ordering platform.

ACCESS YOUR CUSTOMER PORTAL:
Portal URL: ${portalUrl}
Login Code: ${lastFourDigits} (last 4 digits of your phone)

Simply enter the code above when prompted, and we'll send you an SMS verification code.

WHAT YOU CAN DO:
• Browse Products: View our complete catalog with real-time pricing and stock levels
• Place Orders: Easy online ordering with secure payment processing  
• Track Orders: Monitor your order status and delivery updates
• Manage Profile: Update your contact details and delivery addresses
• View Order History: Access all your previous orders and receipts

NEED HELP?
If you have any questions or need assistance, please don't hesitate to contact ${wholesalerName} directly. We're here to make your ordering experience as smooth as possible.

Best regards,
${wholesalerName}
  `;

  try {
    console.log(`📧 Sending onboarding email to ${customerEmail}...`);
    
    await mailService.send({
      to: customerEmail,
      from: {
        email: 'hello@quikpik.co',
        name: wholesalerName
      },
      subject: `Welcome to ${wholesalerName} - Your Customer Portal is Ready!`,
      text: welcomeEmailText,
      html: welcomeEmailHtml,
    });
    
    console.log(`✅ Onboarding email sent successfully to ${customerName} (${customerEmail})`);
    console.log(`📱 Portal access: ${portalUrl}`);
    console.log(`🔑 Login code: ${lastFourDigits}`);
    return true;
  } catch (error) {
    console.error('❌ Failed to send onboarding email:', error);
    if (error.response?.body?.errors) {
      console.error('📋 SendGrid error details:', JSON.stringify(error.response.body.errors, null, 2));
    }
    return false;
  }
}

// Run the function
sendOnboardingEmail()
  .then((success) => {
    if (success) {
      console.log('🎉 Email sending completed successfully!');
      process.exit(0);
    } else {
      console.log('❌ Email sending failed');
      process.exit(1);
    }
  })
  .catch((error) => {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  });