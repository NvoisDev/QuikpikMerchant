# WhatsApp Business API Setup Guide

## Overview

WhatsApp Business API enables automated messaging, customer notifications, and business communications at scale. This guide helps you choose between Twilio WhatsApp integration (quick setup) and direct WhatsApp Business API (advanced features).

## Comparison: Twilio WhatsApp vs WhatsApp Business API

| Feature | Twilio WhatsApp | WhatsApp Business API |
|---------|----------------|----------------------|
| **Cost per message** | $0.005 - $0.01 | $0.0025 - $0.005 (50% savings) |
| **Setup time** | 5 minutes | 15-30 minutes |
| **Best for volume** | Up to 1,000 messages/month | 1,000+ messages/month |
| **Template messaging** | Basic templates | Advanced templates |
| **Business verification** | Not required | Business verification required |
| **Phone number** | Sandbox number | Your business phone number |
| **Production ready** | Limited sandbox | Full production capabilities |

## Option 1: Twilio WhatsApp (Recommended for Testing)

### Quick Setup Steps

**Step 1: Create Twilio Account**
- Visit [twilio.com](https://twilio.com)
- Sign up for a free account
- Verify your email and phone number

**Step 2: Access WhatsApp Sandbox**
- Go to Console → Messaging → WhatsApp → Sandbox
- Find your sandbox code (e.g., "join happy-cat")

**Step 3: Test Your Setup**
- Send "join [your-code]" to +14155238886
- You'll receive a confirmation message

**Step 4: Get Your Credentials**
- Account SID: Found in Console Dashboard
- Auth Token: Found in Console Dashboard  
- Sandbox Phone Number: +14155238886

**Step 5: Add to Quikpik**
- Go to Settings → Integrations → WhatsApp
- Enter your Twilio credentials
- Test with a sample message

### Limitations of Sandbox Mode
- Only numbers that join your sandbox can receive messages
- Messages must be sent within 24 hours of customer contact
- Template messages are limited

## Option 2: WhatsApp Business API (Recommended for Production)

### Requirements
- Business verification through Facebook Business Manager
- Approved business phone number
- Valid business website and documentation
- Compliance with WhatsApp Business Policy

### Setup Process

**Step 1: Business Verification**
- Create Facebook Business Manager account
- Submit business verification documents
- Wait for approval (typically 3-5 business days)

**Step 2: WhatsApp Business Account**
- Apply for WhatsApp Business API access
- Submit business use case and messaging templates
- Provide phone number for verification

**Step 3: Get Business Phone Number Approved**
- Use your existing business phone number
- Or purchase a new dedicated number
- Complete phone number verification process

**Step 4: Template Approval**
- Submit message templates for approval
- Include templates for:
  - Order confirmations
  - Delivery notifications
  - Promotional messages
  - Customer support

**Step 5: Integration Setup**
- Obtain your WhatsApp Business API credentials
- Configure webhook endpoints
- Set up message routing and handling

### Production Benefits
- Use your actual business phone number
- Send messages to any WhatsApp number
- Advanced template messaging capabilities
- Better deliverability and branding
- Lower per-message costs at scale

## Setting Up Message Templates

### Required Templates for Quikpik

**1. Order Confirmation Template**
```
Hello {{customer_name}}, your order #{{order_number}} has been confirmed! 
Total: £{{total_amount}}
Collection: {{collection_type}}
Thank you for choosing {{business_name}}!
```

**2. Delivery Notification Template**
```
Great news {{customer_name}}! Your order #{{order_number}} is out for delivery. 
Expected delivery: {{delivery_time}}
Track your order: {{tracking_link}}
```

**3. Pickup Ready Template**
```
{{customer_name}}, your order #{{order_number}} is ready for collection at {{business_name}}.
Collection hours: {{business_hours}}
Address: {{business_address}}
```

**4. Payment Confirmation Template**
```
Payment received! £{{amount}} paid for order #{{order_number}}.
Receipt: {{receipt_link}}
Questions? Reply to this message.
```

## Integration with Quikpik Platform

### Environment Variables Needed

For Twilio WhatsApp:
```
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+14155238886
```

For WhatsApp Business API:
```
WHATSAPP_BUSINESS_PHONE_NUMBER=your_business_number
WHATSAPP_ACCESS_TOKEN=your_access_token
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
WHATSAPP_BUSINESS_ACCOUNT_ID=your_business_account_id
```

### Testing Your Setup

**Test Message Flow:**
1. Create a test order in your dashboard
2. Process a payment
3. Verify customer receives WhatsApp notification
4. Check message delivery status
5. Test customer reply handling

## Cost Optimization Tips

### For High Volume (1000+ messages/month)
- Use WhatsApp Business API for 50% cost savings
- Set up message batching for bulk notifications
- Use template messages for better delivery rates
- Monitor message delivery and optimize send times

### For Lower Volume (Under 1000 messages/month)
- Twilio WhatsApp provides sufficient functionality
- Easier setup and maintenance
- Good for testing and validation
- Can upgrade to direct API later

## Compliance and Best Practices

### Message Policy Compliance
- Only send messages to customers who opted in
- Respect 24-hour messaging window
- Provide clear opt-out instructions
- Include business identification in messages

### Template Guidelines
- Keep messages concise and clear
- Include relevant order information
- Provide customer service contact
- Use personalization tokens appropriately

### Rate Limiting
- Start with low message volumes
- Monitor delivery rates and customer feedback
- Gradually increase volume based on engagement
- Respect WhatsApp's rate limits

## Troubleshooting Common Issues

### Messages Not Delivering
- Check phone number format (+44 for UK numbers)
- Verify customer has WhatsApp installed
- Ensure message is within 24-hour window
- Check template approval status

### Template Rejection
- Avoid promotional language in transactional templates
- Include clear business purpose
- Remove unnecessary formatting
- Provide specific use case documentation

### Business Verification Delays
- Ensure all business documents are current
- Use consistent business name across platforms
- Provide clear business website
- Submit complete application with all required fields

## Migration Path

### From Twilio to WhatsApp Business API
1. Set up WhatsApp Business API account
2. Get templates approved
3. Configure new integration in parallel
4. Test thoroughly with small group
5. Switch production traffic
6. Monitor delivery rates and customer feedback

## Support and Resources

### Official Documentation
- [WhatsApp Business API Documentation](https://developers.facebook.com/docs/whatsapp)
- [Twilio WhatsApp API Documentation](https://www.twilio.com/docs/whatsapp)

### Business Verification Help
- [Facebook Business Help Center](https://www.facebook.com/business/help)
- [WhatsApp Business Policy](https://www.whatsapp.com/legal/business-policy)

### Template Examples
- [WhatsApp Template Guidelines](https://developers.facebook.com/docs/whatsapp/message-templates/guidelines)
- [Message Template Best Practices](https://developers.facebook.com/docs/whatsapp/message-templates)

---

## Quick Start Recommendation

**For immediate testing:** Start with Twilio WhatsApp (5-minute setup)
**For production use:** Plan for WhatsApp Business API migration within 30 days
**For high volume:** Go directly to WhatsApp Business API for cost savings

This approach gives you immediate messaging capabilities while preparing for scalable, cost-effective production messaging.