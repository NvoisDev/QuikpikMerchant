// Platform Help Content
export const helpContent = {
  // Product Management Help
  productManagement: {
    title: "Managing Your Products",
    steps: [
      {
        title: "Product Information",
        content: "Add clear product names, descriptions, and categories. Good product information helps customers find and understand what you're selling.",
        tip: "Use specific, searchable product names like 'Premium Basmati Rice 5kg' instead of just 'Rice'."
      },
      {
        title: "Pricing Strategy",
        content: "Set competitive prices and minimum order quantities (MOQ). MOQ helps ensure profitable sales while giving customers bulk pricing benefits.",
        tip: "Research competitor prices and set your MOQ based on your wholesale margins and shipping costs."
      },
      {
        title: "Stock Management",
        content: "Keep stock levels accurate to avoid overselling. The system will prevent orders when stock is insufficient.",
        tip: "Update stock regularly and set up low-stock alerts to maintain customer satisfaction."
      },
      {
        title: "Product Images",
        content: "High-quality images increase sales significantly. Upload clear, well-lit photos that show product details and packaging.",
        tip: "Images are automatically optimized for fast loading and WhatsApp sharing."
      }
    ]
  },

  customerGroups: {
    title: "Managing Customer Groups",
    steps: [
      {
        title: "Creating Groups",
        content: "Organize customers into groups based on location, business type, or purchasing patterns. This enables targeted marketing campaigns.",
        tip: "Start with simple groups like 'Local Retailers' and 'Online Customers' then refine as you grow."
      },
      {
        title: "Adding Customers",
        content: "Add customer details including name, phone number, email, and address. Complete information enables better service and communication.",
        tip: "Always get permission before adding customers to marketing groups to comply with messaging regulations."
      },
      {
        title: "Group Broadcasting",
        content: "Send targeted product updates and promotions to specific customer groups. This increases relevance and response rates.",
        tip: "Personalize messages for each group - restaurant owners have different needs than retail shops."
      }
    ]
  },

  customerDirectory: {
    title: "Customer Directory & Groups",
    steps: [
      {
        title: "Creating Customer Groups",
        content: "Start by creating organized groups to categorize your customers. Groups help you send targeted messages and track different customer segments. Click 'Create Group' to get started.",
        tip: "Use specific names like 'Local Restaurants', 'Bulk Buyers', or 'Premium Customers' instead of generic names."
      },
      {
        title: "Adding Members to Groups",
        content: "Use the 'Add Member' dropdown to add customers to your groups. You have three options: Manual Entry (new customers), Search Existing (from your directory), or Import Contacts (from your phone).",
        tip: "Import Contacts is the fastest method - just copy/paste contact lists from WhatsApp or your phone's contact list."
      },
      {
        title: "Managing Your Customer Directory",
        content: "The Customer Directory tab shows all your customers with their contact details, order history, and total spending. Use the search bar to quickly find specific customers.",
        tip: "Review customer order history regularly to identify your best customers for VIP treatment and special offers."
      },
      {
        title: "Broadcasting to Groups",
        content: "Once you have groups set up, you can send targeted WhatsApp campaigns to specific customer segments. This increases engagement and response rates compared to mass messaging.",
        tip: "Send different messages to different groups - restaurant owners need different information than retail customers."
      }
    ]
  },

  campaigns: {
    title: "Creating Effective Campaigns",
    steps: [
      {
        title: "Campaign Types",
        content: "Single product broadcasts highlight specific items, while multi-product campaigns showcase your range. Choose based on your marketing goal.",
        tip: "Use single product campaigns for new arrivals or special offers, multi-product for general inventory updates."
      },
      {
        title: "Message Content",
        content: "Include product names, prices, stock levels, and clear calls-to-action. Professional messages increase customer trust and response rates.",
        tip: "Always include your business contact information and easy ordering instructions."
      },
      {
        title: "Timing and Frequency",
        content: "Send campaigns during business hours when customers are most likely to read and respond. Avoid overwhelming customers with too many messages.",
        tip: "1-2 campaigns per week is usually optimal - focus on quality over quantity."
      }
    ]
  },

  orders: {
    title: "Managing Customer Orders",
    steps: [
      {
        title: "Order Processing",
        content: "Review new orders for accuracy, confirm stock availability, and update order status as you process them.",
        tip: "Respond to orders quickly - customers expect acknowledgment within a few hours."
      },
      {
        title: "Status Updates",
        content: "Keep customers informed by updating order status from pending → confirmed → processing → shipped → delivered.",
        tip: "Customers receive automatic notifications when you update order status - this reduces support calls."
      },
      {
        title: "Payment Tracking",
        content: "Monitor payment status and follow up on pending payments. The system handles payment processing through Stripe.",
        tip: "Most payments are automatic, but you can manually mark orders as paid for cash/bank transfer payments."
      }
    ]
  },

  businessSettings: {
    title: "Business Profile Setup",
    steps: [
      {
        title: "Company Information",
        content: "Complete your business name, description, and contact details. This information appears on invoices and customer communications.",
        tip: "Use your official business name as it appears on your registration documents."
      },
      {
        title: "Currency and Location",
        content: "Set your default currency and business address. This ensures accurate pricing display and proper tax calculations.",
        tip: "Choose the currency you primarily operate in - you can always adjust prices for specific markets."
      },
      {
        title: "Logo and Branding",
        content: "Upload your business logo or choose text-based branding options. Consistent branding builds customer recognition and trust.",
        tip: "A simple, clear logo works best - it will be resized for different contexts automatically."
      }
    ]
  }
};

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