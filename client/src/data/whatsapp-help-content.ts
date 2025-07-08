// WhatsApp Integration Help Content
export const whatsappHelpContent = {
  providerSelection: {
    title: "Choosing Your WhatsApp Provider",
    steps: [
      {
        title: "Understanding the Options",
        content: "You have two main options for WhatsApp integration. Twilio WhatsApp is perfect for getting started quickly with minimal setup, while Direct WhatsApp Business API offers lower costs for high-volume messaging.",
        tip: "Start with Twilio if you're new to WhatsApp messaging - you can always switch later as your business grows."
      },
      {
        title: "Cost Comparison",
        content: "Twilio costs around $0.005-0.01 per message but offers the easiest setup. Direct WhatsApp API costs $0.0025-0.005 per message (50% savings) but requires more configuration time.",
        tip: "If you send more than 1,000 messages per month, Direct API will save you money in the long run."
      },
      {
        title: "Making Your Choice",
        content: "Consider your messaging volume, technical comfort level, and budget. Small businesses typically start with Twilio, while larger operations benefit from Direct API's cost savings.",
        tip: "You can switch providers anytime - your customer data and campaigns remain the same."
      }
    ]
  },

  twilioSetup: {
    title: "Setting Up Twilio WhatsApp",
    steps: [
      {
        title: "Create Your Twilio Account",
        content: "Visit twilio.com and sign up for a free account. You'll get $15 in free credits to test WhatsApp messaging. No credit card required for sandbox testing.",
        tip: "Keep your browser tab open during signup - you'll need to verify your phone number."
      },
      {
        title: "Find Your Credentials",
        content: "In your Twilio Console Dashboard, locate your Account SID and Auth Token. These are unique identifiers that allow Quikpik to send messages on your behalf.",
        tip: "Your Auth Token is sensitive - treat it like a password and never share it publicly."
      },
      {
        title: "Set Up WhatsApp Sandbox",
        content: "Navigate to Messaging → WhatsApp → Sandbox in your Twilio Console. Here you'll find your sandbox phone number (+14155238886) and unique sandbox code.",
        tip: "Each customer must text 'join [your-code]' to +1 (415) 523-8886 before receiving messages in sandbox mode."
      },
      {
        title: "Test Your Integration",
        content: "Enter your credentials in Quikpik and use the verify button. Send yourself a test message to confirm everything works before adding customers.",
        tip: "Remember to join your own sandbox first by texting your sandbox code to the Twilio number."
      }
    ]
  },

  directWhatsAppSetup: {
    title: "Setting Up Direct WhatsApp Business API",
    steps: [
      {
        title: "WhatsApp Business Account",
        content: "You need a verified WhatsApp Business account and Meta Business Manager access. This typically requires business verification and can take 1-3 business days.",
        tip: "Make sure you have all business documents ready - business license, tax ID, and proof of address."
      },
      {
        title: "Get Your App ID",
        content: "In Meta Business Manager, create a new app for WhatsApp Business API. This generates your App ID which identifies your business to WhatsApp's servers.",
        tip: "Choose 'Business' as your app type and enable WhatsApp Business API in the app dashboard."
      },
      {
        title: "Phone Number Configuration",
        content: "Add and verify your business phone number in the WhatsApp Business API settings. This becomes your Business Phone Number ID for sending messages.",
        tip: "Use a dedicated business line - personal numbers cannot be used for WhatsApp Business API."
      },
      {
        title: "Access Token Generation",
        content: "Generate a permanent access token in your app settings. This token allows Quikpik to send messages through WhatsApp's direct API on behalf of your business.",
        tip: "Store this token securely - it provides full access to your WhatsApp Business messaging capabilities."
      }
    ]
  },

  troubleshooting: {
    title: "Common WhatsApp Issues",
    steps: [
      {
        title: "Messages Not Delivered",
        content: "If using Twilio sandbox, ensure customers have joined by texting your sandbox code. For production, check that phone numbers are formatted correctly (+country code).",
        tip: "Test with your own number first to verify the integration is working correctly."
      },
      {
        title: "Verification Failed",
        content: "Double-check your credentials for typos. For Twilio, ensure your Auth Token hasn't expired. For Direct API, verify your access token has messaging permissions.",
        tip: "Copy-paste credentials instead of typing to avoid invisible character errors."
      },
      {
        title: "Rate Limit Errors",
        content: "WhatsApp has messaging limits to prevent spam. Start slowly with a few messages and gradually increase volume as your account gains trust.",
        tip: "Focus on sending relevant, valuable content to customers to maintain good delivery rates."
      },
      {
        title: "Template Rejection",
        content: "WhatsApp requires pre-approved templates for marketing messages. Ensure your message content follows WhatsApp's policies and includes opt-out instructions.",
        tip: "Personal messages (like order updates) don't need templates, only promotional campaigns do."
      }
    ]
  },

  bestPractices: {
    title: "WhatsApp Messaging Best Practices",
    steps: [
      {
        title: "Message Timing",
        content: "Send messages during business hours in your customers' time zones. Avoid early morning, late evening, or weekend promotional messages unless urgent.",
        tip: "Schedule campaigns for 10 AM - 6 PM local time for best engagement rates."
      },
      {
        title: "Content Guidelines",
        content: "Keep messages concise, valuable, and relevant. Include clear product information, pricing, and easy ways for customers to respond or opt out.",
        tip: "Use emojis sparingly and always include your business name for brand recognition."
      },
      {
        title: "Compliance & Consent",
        content: "Only message customers who have opted in to receive communications. Always provide clear opt-out instructions and honor unsubscribe requests immediately.",
        tip: "Keep records of customer consent - this protects your business and maintains WhatsApp compliance."
      },
      {
        title: "Engagement Optimization",
        content: "Monitor message delivery and response rates. Engaged customers are more likely to receive future messages, so focus on quality over quantity.",
        tip: "Customers who respond positively are prioritized by WhatsApp's algorithm for future deliveries."
      }
    ]
  }
};