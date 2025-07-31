import type { Express } from "express";
import { createServer, type Server } from "http";
import Stripe from "stripe";
import { storage } from "./storage";
import { setupAuth } from "./replitAuth";
import { getGoogleAuthUrl, verifyGoogleToken, createOrUpdateUser, requireAuth } from "./googleAuth";
import { insertProductSchema, insertOrderSchema, insertCustomerGroupSchema, insertBroadcastSchema, insertMessageTemplateSchema, insertTemplateProductSchema, insertTemplateCampaignSchema, users, orders, orderItems, products, customerGroups, customerGroupMembers, smsVerificationCodes, insertSMSVerificationCodeSchema } from "@shared/schema";
import { whatsappService } from "./whatsapp";
import { generateProductDescription, generateProductImage } from "./ai";
import { generatePersonalizedTagline, generateCampaignSuggestions, optimizeMessageTiming } from "./ai-taglines";
import { parcel2goService, createTestCredentials } from "./parcel2go";
import { formatPhoneToInternational, validatePhoneNumber } from "../shared/phone-utils";
import { PreciseShippingCalculator } from "./utils/preciseShippingCalculator";
import { healthCheck } from "./health";
import { z } from "zod";
import OpenAI from "openai";
import twilio from "twilio";
import nodemailer from "nodemailer";
import sgMail from "@sendgrid/mail";
import { ReliableSMSService } from "./sms-service";
import { sendEmail } from "./sendgrid-service";
import { createEmailVerification, verifyEmailCode } from "./email-verification";
import { generateWholesalerOrderNotificationEmail, type OrderEmailData } from "./email-templates";
import { sendWelcomeMessages } from "./services/welcomeMessageService.js";
import { db } from "./db";
import { eq, and, desc, inArray, or } from "drizzle-orm";
import { 
  SubscriptionLogger, 
  logSubscriptionUpgrade, 
  logSubscriptionDowngrade, 
  logPaymentSuccess, 
  logPaymentFailure, 
  logManualOverride,
  logProductUnlock,
  logLimitReached 
} from "./subscriptionLogger";
import { registerWebhookRoutes } from "./webhook-handler";

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('STRIPE_SECRET_KEY not found. Stripe functionality will not work.');
}

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-06-30.basil",
}) : null;

// Subscription price IDs for monthly plans in GBP
const SUBSCRIPTION_PRICES = {
  standard: 'price_1RieBnBLkKweDa5PCS7fdhWO', // £10.99/month
  premium: 'price_1RieBnBLkKweDa5Py3yl0gTP'    // £19.99/month
};

const openai = process.env.OPENAI_API_KEY ? new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
}) : null;

// Helper function to format numbers with commas
// Function to create and send Stripe invoice to customer
async function createAndSendStripeInvoice(order: any, items: any[], wholesaler: any, customer: any) {
  if (!stripe) {
    console.log("⚠️ Stripe not configured, skipping invoice creation");
    return;
  }

  try {
    // Create or retrieve Stripe customer
    let stripeCustomer;
    try {
      const customers = await stripe.customers.search({
        query: `email:'${customer.email}'`,
      });
      
      if (customers.data.length > 0) {
        stripeCustomer = customers.data[0];
      } else {
        // Extract customer info from order retailer data or customer object
        const customerEmail = customer.email || order.retailer?.email || `customer${order.id}@quikpik.co`;
        const customerName = customer.name || `${order.retailer?.firstName || 'Customer'} ${order.retailer?.lastName || ''}`.trim();
        const customerPhone = customer.phone || order.retailer?.phoneNumber || order.retailer?.phone_number;
        
        stripeCustomer = await stripe.customers.create({
          email: customerEmail,
          name: customerName || 'Customer',
          phone: customerPhone,
          metadata: {
            orderType: 'customer_portal',
            wholesalerId: wholesaler.id,
            orderId: order.id.toString()
          }
        });
      }
    } catch (error) {
      console.error("Error creating/finding Stripe customer:", error);
      return;
    }

    // Helper function to get currency symbol
    const getCurrencySymbol = (currency?: string) => {
      switch (currency?.toUpperCase()) {
        case 'USD': return '$';
        case 'EUR': return '€';
        case 'GBP': return '£';
        default: return '£';
      }
    };

    // Create invoice
    const invoice = await stripe.invoices.create({
      customer: stripeCustomer.id,
      currency: (wholesaler.preferredCurrency || 'gbp').toLowerCase(),
      description: `Order #${order.id} from ${wholesaler.businessName || wholesaler.username}`,
      metadata: {
        orderId: order.id.toString(),
        wholesalerId: wholesaler.id,
        orderType: 'customer_portal'
      },
      custom_fields: [
        {
          name: 'Order ID',
          value: order.id.toString()
        },
        {
          name: 'Supplier',
          value: wholesaler.businessName || wholesaler.username
        }
      ]
    });

    // Add line items to invoice
    for (const item of items) {
      await stripe.invoiceItems.create({
        customer: stripeCustomer.id,
        invoice: invoice.id,
        amount: Math.round(parseFloat(item.total) * 100), // Convert to cents
        currency: (wholesaler.preferredCurrency || 'gbp').toLowerCase(),
        description: `${item.productName} (${item.quantity} units @ ${getCurrencySymbol(wholesaler.preferredCurrency)}${parseFloat(item.unitPrice).toFixed(2)} each)`,
        metadata: {
          productId: item.productId.toString(),
          quantity: item.quantity.toString(),
          unitPrice: item.unitPrice
        }
      });
    }

    // Add platform fee as separate line item
    if (parseFloat(order.platformFee) > 0) {
      await stripe.invoiceItems.create({
        customer: stripeCustomer.id,
        invoice: invoice.id,
        amount: Math.round(parseFloat(order.platformFee) * 100),
        currency: (wholesaler.preferredCurrency || 'gbp').toLowerCase(),
        description: `Platform Service Fee (5%)`,
        metadata: {
          feeType: 'platform_fee'
        }
      });
    }

    // Finalize and send invoice
    const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id!);
    
    // Mark as paid since payment was already processed
    await stripe.invoices.pay(finalizedInvoice.id!, {
      paid_out_of_band: true
    });

    // Send invoice email to customer
    await stripe.invoices.sendInvoice(finalizedInvoice.id!);

    console.log(`📄 Stripe invoice created and sent to ${customer.email || customer.name} for order #${order.id}`);
    return finalizedInvoice;
    
  } catch (error) {
    console.error(`❌ Failed to create Stripe invoice for order #${order.id}:`, error);
    console.error(`Customer email: ${customer.email}, Customer name: ${customer.name}`);
    return null;
  }
}

function formatNumber(value: number | string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '0';
  return num.toLocaleString('en-US');
}

// Helper function to parse full name into first and last name
function parseCustomerName(fullName: string): { firstName: string; lastName: string } {
  if (!fullName || typeof fullName !== 'string') {
    return { firstName: 'Unknown', lastName: 'Customer' };
  }
  
  const nameParts = fullName.trim().split(' ');
  if (nameParts.length === 1) {
    return { firstName: nameParts[0], lastName: '' };
  } else if (nameParts.length === 2) {
    return { firstName: nameParts[0], lastName: nameParts[1] };
  } else {
    // For names with more than 2 parts, first word is firstName, rest is lastName
    return { 
      firstName: nameParts[0], 
      lastName: nameParts.slice(1).join(' ') 
    };
  }
}

// Helper function to generate stock update messages
function generateStockUpdateMessage(product: any, notificationType: string, wholesaler: any): string {
  const businessName = wholesaler.businessName || wholesaler.firstName + ' ' + wholesaler.lastName;
  const phone = wholesaler.businessPhone || wholesaler.phoneNumber || "+1234567890";
  
  let message = `📢 *Stock Update Alert*\n\n`;
  message += `Product: *${product.name}*\n\n`;
  
  switch (notificationType) {
    case 'out_of_stock':
      message += `🚨 *OUT OF STOCK*\n`;
      message += `This product is currently unavailable. We'll notify you when it's back in stock!\n\n`;
      message += `📞 For alternative products or pre-orders, contact us:\n${businessName}\n📱 ${phone}`;
      break;
      
    case 'low_stock':
      message += `⚠️ *LOW STOCK ALERT*\n`;
      message += `Only ${formatNumber(product.stock || 0)} units remaining!\n\n`;
      message += `💰 Price: ${product.price}\n`;
      message += `📦 MOQ: ${formatNumber(product.moq)} units\n\n`;
      message += `🛒 Order now to secure your stock!\n\n`;
      message += `📞 Contact us:\n${businessName}\n📱 ${phone}`;
      break;
      
    case 'restocked':
      message += `✅ *BACK IN STOCK*\n`;
      message += `Great news! This product is available again.\n\n`;
      message += `📦 Stock: ${formatNumber(product.stock || 0)} units available\n`;
      message += `💰 Price: ${product.price}\n`;
      message += `📦 MOQ: ${formatNumber(product.moq)} units\n\n`;
      message += `🛒 Place your order now!\n\n`;
      message += `📞 Contact us:\n${businessName}\n📱 ${phone}`;
      break;
      
    case 'price_change':
      message += `💰 *PRICE UPDATE*\n`;
      message += `New price: ${product.price}\n`;
      message += `📦 Stock: ${formatNumber(product.stock || 0)} units available\n`;
      message += `📦 MOQ: ${formatNumber(product.moq)} units\n\n`;
      message += `📞 Questions? Contact us:\n${businessName}\n📱 ${phone}`;
      break;
  }
  
  message += `\n\n✨ Powered by Quikpik`;
  return message;
}

// Removed old email transporter - now using SendGrid

// Send team invitation email using SendGrid
async function sendTeamInvitationEmail(teamMember: any, wholesaler: any) {
  try {
    if (!process.env.SENDGRID_API_KEY) {
      throw new Error('SENDGRID_API_KEY environment variable is not set');
    }

    sgMail.setApiKey(process.env.SENDGRID_API_KEY);

    // Get the current domain - use the actual running domain
    const baseUrl = process.env.REPL_ID 
      ? `https://${process.env.REPL_ID}-00-p1kaa4ro8p7u.janeway.replit.dev`
      : 'https://quikpik.co';
    
    console.log('Team invitation URL will be:', `${baseUrl}/team-invitation?token=${teamMember.id}&email=${encodeURIComponent(teamMember.email)}`);

    const msg = {
      to: teamMember.email,
      from: {
        email: 'hello@quikpik.co',
        name: 'Quikpik Team'
      },
      subject: `Team Invitation - Join ${wholesaler.businessName || wholesaler.name} on Quikpik`,
      text: `Hello ${teamMember.firstName},

You've been invited to join ${wholesaler.businessName || wholesaler.name}'s team on Quikpik.

Your Role: ${teamMember.role.charAt(0).toUpperCase() + teamMember.role.slice(1)}

To accept this invitation, please click the link below:
${baseUrl}/team-invitation?token=${teamMember.id}&email=${encodeURIComponent(teamMember.email)}

If you have any questions, please contact us.

Best regards,
The Quikpik Team`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Team Invitation</title>
        </head>
        <body style="margin: 0; padding: 0; background-color: #f7f9fc; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
          <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
            
            <!-- Header -->
            <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); padding: 40px 30px; text-align: center;">
              <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 600;">You're Invited!</h1>
              <p style="color: #d1fae5; margin: 10px 0 0 0; font-size: 16px;">Join ${wholesaler.businessName || wholesaler.name}'s team on Quikpik</p>
            </div>
            
            <!-- Content -->
            <div style="padding: 40px 30px;">
              <h2 style="color: #1f2937; margin: 0 0 20px 0; font-size: 24px; font-weight: 600;">Hello ${teamMember.firstName}!</h2>
              
              <p style="color: #4b5563; line-height: 1.6; margin-bottom: 20px; font-size: 16px;">
                <strong>${wholesaler.businessName || wholesaler.name}</strong> has invited you to join their team on Quikpik, the comprehensive wholesale management platform.
              </p>
              
              <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 0; color: #374151; font-size: 16px;"><strong>Your Role:</strong> ${teamMember.role.charAt(0).toUpperCase() + teamMember.role.slice(1)}</p>
                <p style="margin: 8px 0 0 0; color: #6b7280; font-size: 14px;">You'll have access to products, orders, customers, and broadcast management.</p>
              </div>
              
              <p style="color: #4b5563; line-height: 1.6; margin-bottom: 30px; font-size: 16px;">
                As a team member, you'll be able to help manage the wholesale business including inventory, customer communications, and order processing.
              </p>
              
              <!-- CTA Button -->
              <div style="text-align: center; margin: 40px 0;">
                <a href="${baseUrl}/team-invitation?token=${teamMember.id}&email=${encodeURIComponent(teamMember.email)}" 
                   style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #ffffff; padding: 16px 32px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: 600; font-size: 16px; transition: transform 0.2s;">
                  Accept Invitation & Join Team
                </a>
              </div>
              
              <p style="color: #6b7280; font-size: 14px; text-align: center; margin-top: 20px;">
                Or copy and paste this link in your browser:<br>
                <span style="word-break: break-all;">${baseUrl}/team-invitation?token=${teamMember.id}&email=${encodeURIComponent(teamMember.email)}</span>
              </p>
            </div>
            
            <!-- Footer -->
            <div style="background-color: #f9fafb; padding: 30px; border-top: 1px solid #e5e7eb;">
              <p style="color: #6b7280; font-size: 14px; margin: 0; text-align: center; line-height: 1.5;">
                This invitation was sent by <strong>${wholesaler.email}</strong><br>
                If you didn't expect this invitation, you can safely ignore this email.
              </p>
              <div style="text-align: center; margin-top: 20px;">
                <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                  © 2025 Quikpik. All rights reserved.
                </p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `
    };

    const response = await sgMail.send(msg);
    console.log('Team invitation email sent successfully to:', teamMember.email);
    console.log('SendGrid response status:', response[0].statusCode);
    console.log('SendGrid message ID:', response[0].headers['x-message-id']);
    
    // Add better delivery logging
    if (response[0].statusCode === 202) {
      console.log('✅ Email accepted by SendGrid and queued for delivery');
    } else {
      console.log('⚠️ Unexpected status code:', response[0].statusCode);
    }
    
    return true;
  } catch (error: any) {
    console.error('Error sending team invitation email:', error);
    if (error.response) {
      console.error('SendGrid error response:', error.response.body);
    }
    throw new Error('Failed to send invitation email: ' + (error.message || 'Unknown error'));
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Health check endpoint for deployment monitoring
  app.get('/api/health', healthCheck);
  // Set up trust proxy setting before any middleware
  app.set("trust proxy", 1);

  // REGISTER DEDICATED WEBHOOK HANDLER FIRST
  registerWebhookRoutes(app);

  // STRIPE WEBHOOKS - MUST BE FIRST TO AVOID VITE CATCH-ALL INTERFERENCE
  // TEST ENDPOINT TO VERIFY LOGGING
  app.post('/api/test-webhook', async (req, res) => {
    console.log(`🧪 TEST WEBHOOK EXECUTING at ${new Date().toISOString()}`);
    console.log(`📦 Test body:`, JSON.stringify(req.body, null, 2));
    res.json({ test: 'working', received: true });
  });

  // SIMPLIFIED TEST ENDPOINT
  app.post('/api/debug-test', async (req, res) => {
    console.log(`🔧 DEBUG TEST EXECUTING - ${new Date().toISOString()}`);
    console.log(`🔧 Body received:`, req.body);
    res.json({ debug: 'success', timestamp: new Date().toISOString() });
  });

  // TEST WITH SIMILAR PATH PATTERN TO WORKING ENDPOINTS
  app.post('/api/webhook-test/verify', async (req, res) => {
    console.log(`🎯 WEBHOOK TEST EXECUTING - ${new Date().toISOString()}`);
    console.log(`🎯 Body received:`, req.body);
    res.json({ webhookTest: 'success', timestamp: new Date().toISOString() });
  });

  // STRIPE WEBHOOK - WORKING VERSION
  app.post('/api/webhooks/stripe', async (req, res) => {
    console.log(`🚀 WEBHOOK EXECUTING at ${new Date().toISOString()}`);
    console.log(`📦 Raw body:`, req.body);
    console.log(`📦 Body type:`, typeof req.body);
    console.log(`📦 Body JSON:`, JSON.stringify(req.body, null, 2));
    console.log(`🔍 Event check: event type is ${req.body?.type}`);
    console.log(`🔍 Data object exists: ${!!req.body?.data?.object}`);
    
    try {
      const event = req.body;
      
      if (event.type === 'checkout.session.completed') {
        const session = event.data?.object;
        console.log(`💳 Checkout completed: ${session?.id}`);
        console.log(`🏷️ Metadata:`, JSON.stringify(session?.metadata, null, 2));
        
        const userId = session?.metadata?.userId;
        const tier = session?.metadata?.tier || session?.metadata?.targetTier;
        
        if (userId && tier) {
          console.log(`🔄 Processing upgrade: ${userId} → ${tier}`);
          
          const productLimit = tier === 'premium' ? -1 : (tier === 'standard' ? 10 : 3);
          
          await storage.updateUser(userId, {
            subscriptionTier: tier,
            subscriptionStatus: 'active',
            productLimit: productLimit,
            subscriptionEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
          });
          
          console.log(`✅ Upgraded ${userId} to ${tier} successfully`);
          
          return res.json({
            received: true,
            message: `Subscription upgraded to ${tier}`,
            userId: userId,
            tier: tier,
            productLimit: productLimit
          });
        }
      }
      
      return res.json({ received: true });
      
    } catch (error) {
      console.error('❌ Webhook error:', error);
      return res.status(500).json({ error: 'Webhook processing failed' });
    }
  });

  // WORKING STRIPE WEBHOOK - MOVED TO WORKING SECTION
  app.post('/api/stripe-webhook', async (req, res) => {
    console.log(`🚀 STRIPE WEBHOOK EXECUTING at ${new Date().toISOString()}`);
    console.log(`📦 Event data:`, JSON.stringify(req.body, null, 2));
    
    try {
      const event = req.body;
      
      if (event.type === 'checkout.session.completed') {
        const session = event.data?.object;
        console.log(`💳 Checkout completed: ${session?.id}`);
        console.log(`🏷️ Metadata:`, JSON.stringify(session?.metadata, null, 2));
        
        const userId = session?.metadata?.userId;
        const tier = session?.metadata?.tier || session?.metadata?.targetTier;
        
        if (userId && tier) {
          console.log(`🔄 Processing upgrade: ${userId} → ${tier}`);
          
          const productLimit = tier === 'premium' ? -1 : (tier === 'standard' ? 10 : 3);
          
          await storage.updateUser(userId, {
            subscriptionTier: tier,
            subscriptionStatus: 'active',
            productLimit: productLimit,
            subscriptionEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
          });
          
          console.log(`✅ Upgraded ${userId} to ${tier} successfully`);
          
          return res.json({
            received: true,
            message: `Subscription upgraded to ${tier}`,
            userId: userId,
            tier: tier,
            productLimit: productLimit
          });
        } else {
          console.log(`❌ Missing metadata: userId=${userId}, tier=${tier}`);
          return res.status(400).json({ 
            error: 'Missing user or plan metadata',
            receivedMetadata: session?.metadata 
          });
        }
      }
      
      return res.json({ received: true });
      
    } catch (error) {
      console.error('❌ Webhook error:', error);
      return res.status(500).json({ error: 'Webhook processing failed' });
    }
  });

  // Customer authentication endpoints
  app.post('/api/customer-auth/verify', async (req, res) => {
    try {
      const { wholesalerId, lastFourDigits } = req.body;
      
      if (!wholesalerId || !lastFourDigits) {
        return res.status(400).json({ error: "Wholesaler ID and last four digits are required" });
      }

      // Find customer by last 4 digits in wholesaler's groups
      const customer = await storage.findCustomerByLastFourDigits(wholesalerId, lastFourDigits);
      
      if (!customer) {
        return res.status(401).json({ error: "Customer not found" });
      }

      res.json({
        success: true,
        customer: {
          id: customer.id,
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
          groupId: customer.groupId,
          groupName: customer.groupName
        }
      });
    } catch (error) {
      console.error("Customer verification error:", error);
      res.status(500).json({ error: "Customer verification failed" });
    }
  });

  // SMS verification request
  // Debug endpoint to get verification codes when SMS fails
  app.post('/api/customer-auth/get-debug-code', async (req, res) => {
    const { wholesalerId, lastFourDigits } = req.body;
    
    if (!wholesalerId || !lastFourDigits) {
      return res.status(400).json({ error: "Wholesaler ID and last four digits required" });
    }
    
    try {
      // Find the latest SMS verification code for this customer
      const customer = await storage.findCustomerByLastFourDigits(wholesalerId, lastFourDigits);
      if (!customer) {
        return res.status(404).json({ error: "Customer not found" });
      }
      
      // Get the latest SMS code from database
      const verificationCode = await storage.getLatestSMSCode(customer.id);
      
      res.json({ 
        success: true,
        debugCode: verificationCode,
        message: "Debug code retrieved for development",
        customerName: customer.name,
        phone: customer.phone
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post('/api/customer-auth/request-sms', async (req, res) => {
    try {
      const { wholesalerId, lastFourDigits } = req.body;
      
      if (!wholesalerId || !lastFourDigits) {
        return res.status(400).json({ error: "Wholesaler ID and last four digits are required" });
      }

      // Find customer by last 4 digits
      const customer = await storage.findCustomerByLastFourDigits(wholesalerId, lastFourDigits);
      
      if (!customer) {
        return res.status(401).json({ error: "Customer not found" });
      }

      console.log("Customer found for SMS:", customer);

      // Get wholesaler info for business name
      const wholesaler = await storage.getWholesalerProfile(wholesalerId);
      
      // Generate and send SMS code
      const code = ReliableSMSService.generateVerificationCode();
      console.log(`🔄 Generated verification code: ${code}`);
      const result = await ReliableSMSService.sendVerificationSMS(customer.phone, code, wholesaler?.businessName || 'Business');
      console.log(`📋 SMS service result:`, result);
      
      // Always store verification code in database, regardless of SMS success
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now
      const smsData = {
        customerId: customer.id,
        wholesalerId: wholesalerId,
        code: code, // Use the generated code directly
        phoneNumber: customer.phone,
        expiresAt: expiresAt
      };
      console.log("About to create SMS verification with data:", smsData);
      try {
        await storage.createSMSVerificationCode(smsData);
        console.log("✅ SMS verification code stored in database");
      } catch (dbError) {
        console.error("❌ Database error storing SMS code:", dbError);
        throw dbError; // Re-throw to maintain existing error handling
      }
      
      if (result.success) {
        // SMS sent successfully
        if (process.env.NODE_ENV === 'development') {
          res.json({ 
            success: true, 
            message: "SMS verification code sent",
            debugCode: code
          });
        } else {
          res.json({ success: true, message: "SMS verification code sent" });
        }
      } else {
        // SMS failed but in development mode, provide fallback
        if (process.env.NODE_ENV === 'development') {
          console.log('🧪 SMS failed, using development fallback');
          res.json({ 
            success: true, 
            message: "SMS verification code sent (development mode)",
            debugCode: code,
            developmentMode: true
          });
        } else {
          res.status(500).json({ error: "Failed to send SMS verification code" });
        }
      }
    } catch (error) {
      console.error("SMS request error:", error);
      res.status(500).json({ error: "SMS request failed" });
    }
  });

  // SMS verification
  app.post('/api/customer-auth/verify-sms', async (req, res) => {
    try {
      const { wholesalerId, lastFourDigits, smsCode } = req.body;
      
      if (!wholesalerId || !lastFourDigits || !smsCode) {
        return res.status(400).json({ error: "Wholesaler ID, last four digits, and SMS code are required" });
      }

      // Find customer by last 4 digits
      const customer = await storage.findCustomerByLastFourDigits(wholesalerId, lastFourDigits);
      
      if (!customer) {
        return res.status(401).json({ error: "Customer not found" });
      }

      // Verify SMS code
      const verificationRecord = await storage.getSMSVerificationCode(wholesalerId, customer.id, smsCode);
      
      if (!verificationRecord) {
        return res.status(401).json({ error: "Invalid verification code" });
      }

      // Check if code is expired (5 minutes)
      const now = new Date();
      const expiryTime = new Date(verificationRecord.createdAt);
      expiryTime.setMinutes(expiryTime.getMinutes() + 5);
      
      if (now > expiryTime) {
        return res.status(401).json({ error: "Verification code has expired" });
      }

      // Check if code was already used
      if (verificationRecord.isUsed) {
        return res.status(401).json({ error: "Verification code has already been used" });
      }

      // Check attempt limit (max 5 attempts per code)
      if (verificationRecord.attempts >= 5) {
        return res.status(401).json({ error: "Too many verification attempts. Please request a new code." });
      }

      // Mark code as used
      await storage.markSMSCodeAsUsed(verificationRecord.id);

      res.json({ 
        success: true, 
        message: "SMS verification successful",
        customer: {
          id: customer.id,
          name: customer.name,
          email: customer.email,
          phone: customer.phone,
          groupId: customer.groupId,
          groupName: customer.groupName
        }
      });
    } catch (error) {
      console.error("SMS verification error:", error);
      res.status(500).json({ error: "SMS verification failed" });
    }
  });

  // Get customer order history - aggregated from all wholesalers where customer is registered
  app.get('/api/customer-orders/:wholesalerId/:phoneNumber', async (req, res) => {
    console.log('🔍 Customer orders route hit!', { wholesalerId: req.params.wholesalerId, phoneNumber: req.params.phoneNumber });
    try {
      const { wholesalerId, phoneNumber } = req.params;
      
      if (!wholesalerId || !phoneNumber) {
        console.log('❌ Missing parameters:', { wholesalerId, phoneNumber });
        return res.status(400).json({ error: "Wholesaler ID and phone number are required" });
      }
      
      console.log('✅ Parameters OK, checking customer registration...');
      
      // Find the correct customer using the same logic as authentication
      const decodedPhoneNumber = decodeURIComponent(phoneNumber);
      const lastFourDigits = decodedPhoneNumber.slice(-4);
      console.log('🔍 Finding customer by last 4 digits:', lastFourDigits);
      
      const customer = await storage.findCustomerByLastFourDigits(wholesalerId, lastFourDigits);
      
      if (!customer) {
        console.log('❌ Customer not found with last 4 digits:', lastFourDigits);
        return res.status(403).json({ 
          error: "Customer not registered with this wholesaler",
          message: "You must be added to this wholesaler's customer group to access orders"
        });
      }

      console.log('✅ Customer verified:', customer.name, 'with ID:', customer.id);

      // REMOVED: Customer group requirement - customers can see orders even without pre-registration

      // NEW: Allow access to orders even if customer is not in customer groups
      // This fixes the issue where customers can't see their orders unless pre-registered
      console.log('🔍 Searching for all orders by customer regardless of group membership...');
      
      // Search by retailer ID first (most reliable) - remove wholesaler restriction
      let orderResults = await db
        .select()
        .from(orders)
        .where(eq(orders.retailerId, customer.id))
        .orderBy(desc(orders.createdAt));
        
      console.log('🔍 Found orders by retailer ID:', orderResults.length);
      
      // If no orders found by retailer ID, search by phone number variants (without wholesaler restriction)
      if (orderResults.length === 0) {
        console.log('🔍 No orders found by retailer ID, searching by phone number variants...');
        
        // Normalize customer phone number for matching
        const normalizedCustomerPhone = customer.phone.replace(/^\+44/, '0').replace(/[^0-9]/g, '');
        const customerPhoneVariants = [
          customer.phone, // Original format
          normalizedCustomerPhone, // UK format (07...)
          '+44' + normalizedCustomerPhone.substring(1) // International format (+447...)
        ];
        
        console.log('🔍 Searching with phone variants:', customerPhoneVariants);
        
        const phoneConditions = customerPhoneVariants.map(phone => 
          eq(orders.customerPhone, phone)
        );
        
        orderResults = await db
          .select()
          .from(orders)
          .where(or.apply(null, phoneConditions))
          .orderBy(desc(orders.createdAt));
      }
      
      console.log('🔍 Total orders found:', orderResults.length);

      if (orderResults.length === 0) {
        return res.json([]);
      }

      // Get order items and product details for each order
      const ordersWithDetails = await Promise.all(orderResults.map(async (order) => {
        const items = await db
          .select({
            orderItemId: orderItems.id,
            quantity: orderItems.quantity,
            unitPrice: orderItems.unitPrice,
            total: orderItems.total,
            productId: products.id,
            productName: products.name,
          })
          .from(orderItems)
          .leftJoin(products, eq(orderItems.productId, products.id))
          .where(eq(orderItems.orderId, order.id));

        // Get wholesaler details directly from database
        const wholesalerUser = await storage.getUser(order.wholesalerId);
        const wholesalerDetails = wholesalerUser ? {
          wholesalerId: order.wholesalerId,
          wholesalerName: wholesalerUser.businessName || `${wholesalerUser.firstName} ${wholesalerUser.lastName}`,
          wholesalerEmail: wholesalerUser.email || '',
          wholesalerPhone: wholesalerUser.businessPhone || ''
        } : null;

        return {
          ...order,
          items: items.map(item => ({
            productName: item.productName,
            quantity: item.quantity,
            unitPrice: item.unitPrice || "0",
            total: item.total || "0"
          })),
          wholesaler: wholesalerDetails ? {
            id: order.wholesalerId,
            businessName: wholesalerDetails.wholesalerName || 'Unknown Business',
            email: wholesalerDetails.wholesalerEmail || '',
            phone: wholesalerDetails.wholesalerPhone || '',
          } : null
        };
      }));
      
      // Format orders for customer portal display
      const formattedOrders = ordersWithDetails.map(order => {
        const total = parseFloat(order.total || "0");
        // Calculate proper fees based on current fee structure:
        // Customer pays: Product subtotal + Transaction fee (5.5% + £0.50)
        // Wholesaler pays: Platform fee (3.3% of product subtotal)
        
        // If we have stored subtotal, use it; otherwise calculate from total
        const subtotal = order.subtotal ? parseFloat(order.subtotal) : total / 1.055 - 0.50; // Remove transaction fee (5.5% + £0.50)
        
        // Use stored customer transaction fee from database, or calculate as fallback
        const transactionFee = order.customerTransactionFee ? parseFloat(order.customerTransactionFee) : (subtotal * 0.055) + 0.50;
        
        // Platform fee paid by wholesaler: 3.3% of product subtotal (not shown to customers but calculated for completeness)
        const platformFee = subtotal * 0.033;
        
        return {
          id: order.id,
          orderNumber: `#${order.id}`,
          date: new Date(order.createdAt || Date.now()).toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short', 
            year: 'numeric'
          }),
          time: new Date(order.createdAt || Date.now()).toLocaleTimeString('en-GB', {
            hour: '2-digit',
            minute: '2-digit'
          }),
          status: order.status,
          total: total.toFixed(2),
          subtotal: subtotal.toFixed(2),
          transactionFee: transactionFee.toFixed(2), // What customer paid in transaction fees
          platformFee: platformFee.toFixed(2), // For internal calculation only
          currency: "£",
          items: order.items,
          wholesaler: order.wholesaler,
          customerName: order.customerName,
          customerPhone: order.customerPhone,
          customerEmail: order.customerEmail,
          deliveryAddress: order.deliveryAddress,
          paymentMethod: "Card Payment",
          paymentStatus: "paid",
          fulfillmentType: order.fulfillmentType,
          deliveryCarrier: order.deliveryCarrier,
          deliveryCost: order.deliveryCost || '0.00',
          shippingStatus: order.shippingStatus,
          shippingTotal: order.shippingTotal,
          notes: order.notes,
          createdAt: order.createdAt,
          updatedAt: order.updatedAt
        };
      });

      res.json(formattedOrders);
    } catch (error) {
      console.error("Customer orders fetch error:", error);
      res.status(500).json({ error: "Failed to fetch order history" });
    }
  });

  // Auth middleware - setup session handling after customer routes
  // Set up unified session middleware 
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  
  // Use simple session configuration that works for both auth methods
  await setupAuth(app);

  // STRIPE WEBHOOKS MOVED TO TOP OF FILE TO AVOID VITE INTERFERENCE

  // Google Auth routes
  app.get('/api/auth/google', (req, res) => {
    try {
      const authUrl = getGoogleAuthUrl();
      res.json({ authUrl });
    } catch (error) {
      console.error('Error generating Google auth URL:', error);
      res.status(500).json({ error: 'Failed to generate authentication URL' });
    }
  });

  app.get('/api/auth/google/callback', async (req, res) => {
    try {
      const { code } = req.query;
      
      if (!code || typeof code !== 'string') {
        return res.status(400).json({ error: 'Authorization code is required' });
      }

      // Verify Google token and get user info
      const googleUser = await verifyGoogleToken(code);
      
      // Create or update user in database
      const user = await createOrUpdateUser(googleUser);
      
      // Set user session with enhanced session data
      (req.session as any).userId = user.id;
      (req.session as any).user = user;
      
      console.log(`🔐 Google auth session created for user ${user.email}`);
      
      // Redirect to dashboard for authenticated users
      res.redirect('/dashboard');
    } catch (error) {
      console.error('Google auth callback error:', error);
      res.redirect('/login?error=auth_failed');
    }
  });

  // Add a debug endpoint to check session state
  app.get('/api/auth/debug', async (req: any, res) => {
    res.json({
      sessionExists: !!req.session,
      sessionData: req.session,
      isAuthenticated: req.isAuthenticated ? req.isAuthenticated() : false,
      user: req.user ? { id: req.user.id, email: req.user.email } : null
    });
  });

  // Temporary authentication recovery endpoint
  app.post('/api/auth/recover', async (req: any, res) => {
    try {
      const { email } = req.body;
      
      if (!email || email !== 'hello@quikpik.co') {
        return res.status(403).json({ error: 'Unauthorized' });
      }
      
      // Find user by email
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      // Recreate session
      (req.session as any).userId = user.id;
      (req.session as any).user = user;
      
      console.log(`🔐 Session recovered for user ${user.email}`);
      
      res.json({ 
        success: true, 
        message: 'Authentication recovered',
        user: {
          id: user.id,
          email: user.email,
          subscriptionTier: user.subscriptionTier
        }
      });
    } catch (error) {
      console.error('Auth recovery error:', error);
      res.status(500).json({ error: 'Recovery failed' });
    }
  });

  app.get('/api/auth/user', requireAuth, async (req: any, res) => {
    try {
      // Always fetch fresh user data from database to ensure subscription updates are reflected
      const userId = req.user.id || req.user.claims?.sub;
      const freshUserData = await storage.getUser(userId);
      
      let responseUser = freshUserData || req.user;
      
      // Check if this user is a team member and get wholesaler info
      if (responseUser.role === 'team_member' && responseUser.wholesalerId) {
        const wholesalerInfo = await storage.getUser(responseUser.wholesalerId);
        if (wholesalerInfo) {
          responseUser = {
            ...responseUser,
            subscriptionTier: wholesalerInfo.subscriptionTier,
            businessName: wholesalerInfo.businessName,
            isTeamMember: true,
            role: 'team_member'
          };
        }
      }
      
      console.log(`👤 Auth endpoint returning fresh user data for ${userId}:`, {
        id: responseUser.id,
        email: responseUser.email,
        subscriptionTier: responseUser.subscriptionTier,
        subscriptionStatus: responseUser.subscriptionStatus
      });
      
      res.json(responseUser);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  app.post('/api/auth/logout', (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        console.error('Logout error:', err);
        return res.status(500).json({ error: 'Failed to logout' });
      }
      res.json({ success: true });
    });
  });

  // Onboarding routes
  app.patch('/api/auth/user/onboarding', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { step, completed, skipped } = req.body;
      
      const updateData: any = {};
      if (typeof step === 'number') updateData.onboardingStep = step;
      if (typeof completed === 'boolean') updateData.onboardingCompleted = completed;
      if (typeof skipped === 'boolean') updateData.onboardingSkipped = skipped;
      
      const updatedUser = await storage.updateUserOnboarding(userId, updateData);
      res.json(updatedUser);
    } catch (error) {
      console.error("Error updating onboarding:", error);
      res.status(500).json({ message: "Failed to update onboarding" });
    }
  });

  // Settings route
  app.patch('/api/settings', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const updateData = { ...req.body };
      
      // Debug logging for logo upload
      console.log("🔧 Settings update request:");
      console.log("- User ID:", userId);
      console.log("- Update data keys:", Object.keys(updateData));
      console.log("- Logo type:", updateData.logoType);
      console.log("- Logo URL length:", updateData.logoUrl?.length || 0);
      console.log("- Has logo data:", updateData.logoUrl ? "YES" : "NO");
      
      // Auto-format phone numbers to international format
      if (updateData.businessPhone) {
        updateData.businessPhone = formatPhoneToInternational(updateData.businessPhone);
      }
      if (updateData.phoneNumber) {
        updateData.phoneNumber = formatPhoneToInternational(updateData.phoneNumber);
      }
      
      const updatedUser = await storage.updateUserSettings(userId, updateData);
      console.log("✅ Settings updated successfully for user:", userId);
      console.log("- Updated logo type:", updatedUser.logoType);
      console.log("- Updated logo URL length:", updatedUser.logoUrl?.length || 0);
      res.json(updatedUser);
    } catch (error) {
      console.error("❌ Error updating settings:", error);
      res.status(500).json({ message: "Failed to update settings" });
    }
  });

  // Product routes
  app.get('/api/products', requireAuth, async (req: any, res) => {
    try {
      const { wholesalerId } = req.query;
      
      // Debug logging
      console.log('Products request - Query wholesalerId:', wholesalerId);
      console.log('Products request - User data:', {
        id: req.user.id,
        role: req.user.role,
        wholesalerId: req.user.wholesalerId,
        isTeamMember: req.user.isTeamMember
      });
      
      // Always use parent company data for team members, ignore query param
      let targetUserId;
      if (req.user.role === 'team_member' && req.user.wholesalerId) {
        targetUserId = req.user.wholesalerId;
      } else if (wholesalerId) {
        targetUserId = wholesalerId as string;
      } else {
        targetUserId = req.user.id;
      }
      
      console.log('Products request - Target user ID:', targetUserId);
      const products = await storage.getProducts(targetUserId);
      console.log('Products found:', products.length);
      res.json(products);
    } catch (error) {
      console.error("Error fetching products:", error);
      res.status(500).json({ message: "Failed to fetch products" });
    }
  });

  app.get('/api/products/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid product ID" });
      }
      const product = await storage.getProduct(id);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      res.json(product);
    } catch (error) {
      console.error("Error fetching product:", error);
      res.status(500).json({ message: "Failed to fetch product" });
    }
  });

  app.post('/api/products', requireAuth, async (req: any, res) => {
    try {
      // Use parent company ID for team members to ensure data inheritance
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      
      // Check product limit before creating
      const limitCheck = await storage.checkProductLimit(targetUserId);
      if (!limitCheck.canAdd) {
        // Log limit reached event
        await logLimitReached(
          targetUserId,
          'product_creation',
          limitCheck.currentCount,
          limitCheck.tier,
          {
            attemptedAction: 'create_product',
            productName: req.body.name,
            limit: limitCheck.limit
          }
        );
        
        return res.status(403).json({ 
          message: `Product limit reached. You can only have ${limitCheck.limit} products on the ${limitCheck.tier} plan. Upgrade your subscription to add more products.`,
          currentCount: limitCheck.currentCount,
          limit: limitCheck.limit,
          tier: limitCheck.tier
        });
      }

      // Let the schema handle all transformations
      const productData = insertProductSchema.parse({
        ...req.body,
        wholesalerId: targetUserId
      });
      const product = await storage.createProduct(productData);
      res.json(product);
    } catch (error) {
      console.error("Error creating product:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid product data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create product" });
    }
  });

  app.patch('/api/products/:id', requireAuth, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      // Use parent company ID for team members to inherit data access
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      
      // Verify product belongs to user or their parent company
      const existingProduct = await storage.getProduct(id);
      if (!existingProduct || existingProduct.wholesalerId !== targetUserId) {
        return res.status(404).json({ message: "Product not found" });
      }

      // Check if product is locked due to subscription limits
      if (existingProduct.status === 'locked') {
        // Log attempt to edit locked product
        await logLimitReached(
          targetUserId,
          'locked_product_edit',
          0,
          'unknown',
          {
            attemptedAction: 'edit_locked_product',
            productId: id,
            productName: existingProduct.name
          }
        );
        
        return res.status(403).json({ 
          message: "This product is locked due to subscription limits. Upgrade your plan or delete other products to unlock it.",
          errorType: "PRODUCT_LOCKED",
          upgradeRequired: true
        });
      }

      // Check edit limit based on subscription tier
      const currentEditCount = existingProduct.editCount || 0;
      const user = await storage.getUser(targetUserId);
      const subscriptionTier = user?.subscriptionTier || "free";
      
      let editLimit = 3; // Default for free
      switch (subscriptionTier) {
        case "standard":
          editLimit = 10;
          break;
        case "premium":
          editLimit = -1; // Unlimited
          break;
        default:
          editLimit = 3; // Free tier
      }
      
      // Only check limit if not premium (unlimited)
      if (editLimit !== -1 && currentEditCount >= editLimit) {
        return res.status(403).json({ 
          message: `Product edit limit reached! You've used all ${editLimit} product edits for the ${subscriptionTier} plan. Upgrade your plan to edit more products.`,
          editCount: currentEditCount,
          maxEdits: editLimit,
          tier: subscriptionTier
        });
      }

      // Let the schema handle all transformations
      const productData = insertProductSchema.partial().parse(req.body);
      
      // Increment edit count and update the product
      const productDataWithEditCount = {
        ...productData,
        editCount: currentEditCount + 1
      };
      const product = await storage.updateProduct(id, productDataWithEditCount);
      
      res.json(product);
    } catch (error) {
      console.error("Error updating product:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid product data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to update product" });
    }
  });

  app.delete('/api/products/:id', requireAuth, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      // Use parent company ID for team members to inherit data access
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      
      // Verify product belongs to user or their parent company
      const existingProduct = await storage.getProduct(id);
      if (!existingProduct || existingProduct.wholesalerId !== targetUserId) {
        return res.status(404).json({ message: "Product not found" });
      }

      await storage.deleteProduct(id);

      // Check if deleting this product creates space to unlock other products
      try {
        const user = await storage.getUser(targetUserId);
        const productLimit = user?.productLimit || 3;
        
        if (productLimit !== -1) { // Only if not unlimited
          const remainingProducts = await storage.getProducts(targetUserId);
          const activeProducts = remainingProducts.filter(p => p.status === 'active');
          const lockedProducts = remainingProducts.filter(p => p.status === 'locked');
          
          const availableSlots = productLimit - activeProducts.length;
          
          if (availableSlots > 0 && lockedProducts.length > 0) {
            const productsToUnlock = lockedProducts.slice(0, availableSlots);
            
            console.log(`🔓 Product deletion created ${availableSlots} available slots, unlocking ${productsToUnlock.length} products`);
            
            for (const product of productsToUnlock) {
              await storage.updateProduct(product.id, { status: 'active' });
              console.log(`🔓 Auto-unlocked product: ${product.name} (ID: ${product.id})`);
            }
          }
        }
      } catch (error) {
        console.error('Error auto-unlocking products after deletion:', error);
      }

      res.json({ message: "Product deleted successfully" });
    } catch (error) {
      console.error("Error deleting product:", error);
      res.status(500).json({ message: "Failed to delete product" });
    }
  });

  // Order routes with search functionality
  app.get('/api/orders', requireAuth, async (req: any, res) => {
    try {
      // Use parent company ID for team members
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
        
      const user = await storage.getUser(targetUserId);
      const role = req.query.role; // 'customer' or 'wholesaler'
      const search = req.query.search; // search term
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      let orders;
      if (role === 'customer' || user.role === 'retailer') {
        // Get orders placed by this customer/retailer
        orders = await storage.getOrders(undefined, targetUserId, search);
      } else {
        // Get orders received by this wholesaler
        orders = await storage.getOrders(targetUserId, undefined, search);
      }
      
      res.json(orders);
    } catch (error) {
      console.error("Error fetching orders:", error);
      res.status(500).json({ message: "Failed to fetch orders" });
    }
  });

  app.post('/api/orders', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { items, deliveryAddress, notes } = req.body;

      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "Order must contain at least one item" });
      }

      // Calculate totals
      let subtotal = 0;
      const orderItems = [];

      for (const item of items) {
        const product = await storage.getProduct(item.productId);
        if (!product) {
          return res.status(400).json({ message: `Product ${item.productId} not found` });
        }

        if (item.quantity < product.moq) {
          return res.status(400).json({ 
            message: `Minimum order quantity for ${product.name} is ${product.moq}` 
          });
        }

        // Use promotional price if active, otherwise regular price
        const effectivePrice = product.promoActive && product.promoPrice 
          ? parseFloat(product.promoPrice) 
          : parseFloat(product.price);
        
        const itemTotal = effectivePrice * item.quantity;
        subtotal += itemTotal;

        orderItems.push({
          orderId: 0, // Will be set after order creation
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: effectivePrice.toFixed(2),
          total: itemTotal.toFixed(2)
        });
      }

      const platformFee = subtotal * 0.033; // 3.3% platform fee
      const total = subtotal + platformFee;

      // Get wholesaler from first product
      const firstProduct = await storage.getProduct(items[0].productId);
      const wholesalerId = firstProduct!.wholesalerId;

      const orderData = insertOrderSchema.parse({
        orderNumber: `ORD-${Date.now()}`,
        wholesalerId,
        retailerId: userId,
        subtotal: subtotal.toFixed(2),
        platformFee: platformFee.toFixed(2),
        total: total.toFixed(2),
        deliveryAddress,
        notes,
        status: 'confirmed' // Auto-confirm orders immediately
      });

      const order = await storage.createOrder(orderData, orderItems);
      
      // Get wholesaler and customer details for confirmation email
      const wholesaler = await storage.getUser(wholesalerId);
      const customer = await storage.getUser(userId);
      
      if (wholesaler && customer) {
        try {
          // Send confirmation email to customer
          await sendCustomerInvoiceEmail(customer, order, orderItems.map(item => ({
            ...item,
            product: { name: 'Product', price: item.unitPrice } // Will be populated properly
          })), wholesaler);
        } catch (emailError) {
          console.error("Failed to send confirmation email:", emailError);
          // Don't fail the order creation if email fails
        }
      }
      
      res.json(order);
    } catch (error) {
      console.error("Error creating order:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid order data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create order" });
    }
  });

  // NEW: Customer payment endpoint with correct fee structure
  // Customer pays: Product total + Transaction Fee (5.5% + £0.50)
  // Wholesaler pays: Platform Fee (3.3% of product total)
  app.post('/api/customer/create-payment', async (req, res) => {
    try {
      const { customerName, customerEmail, customerPhone, customerAddress, items, shippingInfo } = req.body;
      
      console.log('🚚 PAYMENT CREATION DEBUG: Received shippingInfo from frontend:', JSON.stringify(shippingInfo, null, 2));

      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "Order must contain at least one item" });
      }

      // Calculate product subtotal
      let productSubtotal = 0;
      const validatedItems = [];

      for (const item of items) {
        const product = await storage.getProduct(item.productId);
        if (!product) {
          return res.status(400).json({ message: `Product ${item.productId} not found` });
        }

        if (item.quantity < product.moq) {
          return res.status(400).json({ 
            message: `Minimum order quantity for ${product.name} is ${product.moq}` 
          });
        }

        if (item.quantity > product.stock) {
          return res.status(400).json({ 
            message: `Insufficient stock for ${product.name}. Available: ${product.stock}` 
          });
        }

        const effectivePrice = product.promoActive && product.promoPrice 
          ? parseFloat(product.promoPrice) 
          : parseFloat(product.price);
        
        const itemTotal = effectivePrice * item.quantity;
        productSubtotal += itemTotal;

        validatedItems.push({
          ...item,
          product,
          unitPrice: effectivePrice.toFixed(2),
          total: itemTotal.toFixed(2)
        });
      }

      // NEW FEE STRUCTURE:
      // Customer Transaction Fee: 5.5% of product total + £0.50 fixed fee
      const customerTransactionFee = (productSubtotal * 0.055) + 0.50;
      const totalCustomerPays = productSubtotal + customerTransactionFee;
      
      // Wholesaler Platform Fee: 3.3% of product total (deducted from what they receive)
      const wholesalerPlatformFee = productSubtotal * 0.033;
      const wholesalerReceives = productSubtotal - wholesalerPlatformFee;

      // Get wholesaler for payment processing
      const firstProduct = validatedItems[0].product;
      const wholesaler = await storage.getUser(firstProduct.wholesalerId);
      
      if (!wholesaler) {
        return res.status(400).json({ message: "Wholesaler not found" });
      }

      // Create Stripe payment intent
      if (!stripe) {
        return res.status(500).json({ message: "Stripe not configured" });
      }
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(totalCustomerPays * 100), // Total amount customer pays (product + transaction fee)
        currency: 'gbp',
        receipt_email: customerEmail,
        automatic_payment_methods: { enabled: true },
        metadata: {
          customerName,
          customerEmail,
          customerPhone,
          customerAddress: JSON.stringify(customerAddress),
          productSubtotal: productSubtotal.toFixed(2),
          customerTransactionFee: customerTransactionFee.toFixed(2),
          wholesalerPlatformFee: wholesalerPlatformFee.toFixed(2),
          wholesalerReceives: wholesalerReceives.toFixed(2),
          totalCustomerPays: totalCustomerPays.toFixed(2),
          wholesalerId: firstProduct.wholesalerId,
          orderType: 'customer_portal',
          items: JSON.stringify(validatedItems.map(item => ({
            productId: item.product.id,
            productName: item.product.name,
            quantity: item.quantity,
            unitPrice: parseFloat(item.unitPrice)
          }))),
          shippingInfo: JSON.stringify(shippingInfo || { option: 'pickup' })
        }
      });

      res.json({ 
        clientSecret: paymentIntent.client_secret,
        productSubtotal: productSubtotal.toFixed(2),
        customerTransactionFee: customerTransactionFee.toFixed(2),
        totalCustomerPays: totalCustomerPays.toFixed(2),
        wholesalerPlatformFee: wholesalerPlatformFee.toFixed(2),
        wholesalerReceives: wholesalerReceives.toFixed(2)
      });

    } catch (error) {
      console.error("Error creating payment intent:", error);
      res.status(500).json({ message: "Failed to create payment intent" });
    }
  });

  // Direct order creation endpoint (called after successful payment)
  app.post('/api/marketplace/create-order', async (req, res) => {
    try {
      const { paymentIntentId } = req.body;
      
      if (!paymentIntentId) {
        return res.status(400).json({ message: 'Payment intent ID required' });
      }

      // Retrieve payment intent from Stripe to get metadata
      if (!stripe) {
        return res.status(500).json({ message: "Stripe not configured" });
      }
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      
      if (paymentIntent.status !== 'succeeded') {
        return res.status(400).json({ message: 'Payment not successful' });
      }

      const {
        customerName,
        customerEmail,
        customerPhone,
        customerAddress,
        totalAmount,
        platformFee,
        transactionFee,
        wholesalerId,
        orderType,
        items: itemsJson,
        connectAccountUsed,
        productSubtotal,
        customerTransactionFee,
        totalCustomerPays,
        wholesalerPlatformFee,
        wholesalerReceives
      } = paymentIntent.metadata;

      if (orderType === 'customer_portal') {
        const items = JSON.parse(itemsJson);

        // Create customer if doesn't exist or update existing one
        let customer = await storage.getUserByPhone(customerPhone);
        const { firstName, lastName } = parseCustomerName(customerName);
        
        console.log(`🔍 Customer lookup by phone ${customerPhone}:`, customer ? `Found existing: ${customer.id} (${customer.firstName} ${customer.lastName})` : 'Not found');
        
        // If phone lookup fails, try email lookup
        if (!customer && customerEmail) {
          customer = await storage.getUserByEmail(customerEmail);
          console.log(`🔍 Customer lookup by email ${customerEmail}:`, customer ? `Found existing: ${customer.id} (${customer.firstName} ${customer.lastName})` : 'Not found');
        }
        
        if (!customer) {
          console.log(`📝 Creating new customer: ${firstName} ${lastName} (${customerPhone})`);
          customer = await storage.createCustomer({
            phoneNumber: customerPhone,
            firstName,
            lastName,
            role: 'retailer',
            email: customerEmail
          });
          console.log(`✅ New customer created: ${customer.id} (${customer.firstName} ${customer.lastName})`);
        } else {
          // Check if email belongs to different customer before updating
          let emailConflict = false;
          if (customerEmail && customer.email !== customerEmail) {
            const existingEmailUser = await storage.getUserByEmail(customerEmail);
            if (existingEmailUser && existingEmailUser.id !== customer.id) {
              console.log(`⚠️ Email ${customerEmail} belongs to different customer ${existingEmailUser.id}, keeping existing email for ${customer.id}`);
              emailConflict = true;
            }
          }
          
          // Update existing customer with new information if name or phone changed
          const needsUpdate = 
            customer.firstName !== firstName || 
            customer.lastName !== lastName || 
            (customerPhone && customer.phoneNumber !== customerPhone) ||
            (customerEmail && customer.email !== customerEmail && !emailConflict);
            
          if (needsUpdate) {
            console.log(`📝 Updating existing customer: ${customer.id} with new info: ${firstName} ${lastName} (${customerPhone})`);
            
            // Only update email if there's no conflict
            const updateData = {
              firstName,
              lastName,
              email: emailConflict ? customer.email : (customerEmail || customer.email || '')
            };
            
            customer = await storage.updateCustomer(customer.id, {
              firstName,
              lastName,
              email: emailConflict ? customer.email : (customerEmail || customer.email || '')
            });
            
            // Update phone number separately if needed
            if (customerPhone && customer.phoneNumber !== customerPhone) {
              console.log(`📱 Updating phone number for customer: ${customer.id} to ${customerPhone}`);
              await storage.updateCustomerPhone(customer.id, customerPhone);
              customer.phoneNumber = customerPhone; // Update local copy
            }
            
            console.log(`✅ Customer updated: ${customer.id} (${customer.firstName} ${customer.lastName}) (${customer.phoneNumber})`);
          }
        }
        
        console.log(`👤 Using customer for order: ${customer.id} (${customer.firstName} ${customer.lastName})`);;

        // Calculate actual platform fee based on Connect usage
        const actualPlatformFee = connectAccountUsed === 'true' ? platformFee : '0.00';
        const wholesalerAmount = connectAccountUsed === 'true' 
          ? (parseFloat(totalAmount) - parseFloat(platformFee)).toFixed(2)
          : totalAmount;

        // Use the correct total from metadata instead of recalculating
        const correctTotal = totalCustomerPays || (parseFloat(productSubtotal || totalAmount) + parseFloat(customerTransactionFee || transactionFee || '0')).toFixed(2);

        // 🚚 CRITICAL FIX: Extract and process shipping data from payment metadata
        const shippingInfoJson = paymentIntent.metadata.shippingInfo;
        const shippingInfo = shippingInfoJson ? JSON.parse(shippingInfoJson) : { option: 'pickup' };
        
        console.log('🚚 COMPETING SYSTEM DEBUG: Processing shipping metadata:', {
          hasShippingInfo: !!shippingInfoJson,
          shippingInfoRaw: shippingInfoJson,
          parsedShippingInfo: shippingInfo,
          customerChoice: shippingInfo.option,
          hasService: !!shippingInfo.service,
          serviceName: shippingInfo.service?.serviceName,
          servicePrice: shippingInfo.service?.price
        });

        // Get wholesaler info for reference generation
        const wholesaler = await storage.getUser(wholesalerId);
        
        // Generate wholesale reference number for both parties to use
        const wholesaleRef = `${wholesaler?.businessName?.substring(0, 2).toUpperCase() || 'WS'}-${Date.now().toString().slice(-6)}`;
        
        console.log(`🏢 Generated wholesale reference: ${wholesaleRef} for ${wholesaler?.businessName || 'Unknown Business'}`);;
        
        // Create order with customer details AND SHIPPING DATA
        const orderData = {
          orderNumber: wholesaleRef, // Use wholesale reference as order number for consistency
          wholesalerId,
          retailerId: customer.id,
          customerName, // Store customer name
          customerEmail, // Store customer email
          customerPhone, // Store customer phone
          subtotal: productSubtotal, // Product subtotal (what wholesaler gets)
          platformFee: parseFloat(wholesalerPlatformFee || '0').toFixed(2), // 3.3% platform fee
          customerTransactionFee: parseFloat(customerTransactionFee || '0').toFixed(2), // Customer transaction fee (5.5% + £0.50)
          total: correctTotal, // Total = subtotal + customer transaction fee
          status: 'paid',
          stripePaymentIntentId: paymentIntent.id,
          deliveryAddress: typeof customerAddress === 'string' ? customerAddress : JSON.parse(customerAddress).address,
          // 🚚 ADDED: Shipping information processing
          fulfillmentType: shippingInfo.option || 'pickup',
          deliveryCarrier: shippingInfo.option === 'delivery' && shippingInfo.service ? shippingInfo.service.serviceName : null,
          deliveryCost: shippingInfo.option === 'delivery' && shippingInfo.service ? shippingInfo.service.price.toString() : '0.00',
          shippingTotal: shippingInfo.option === 'delivery' && shippingInfo.service ? shippingInfo.service.price.toString() : '0.00'
        };
        
        console.log('🚚 COMPETING SYSTEM DEBUG: Order data with shipping fields:', {
          fulfillmentType: orderData.fulfillmentType,
          deliveryCarrier: orderData.deliveryCarrier,
          deliveryCost: orderData.deliveryCost,
          willSaveAsDelivery: orderData.fulfillmentType === 'delivery'
        });

        // Create order items with orderId for storage
        const orderItems = items.map((item: any) => ({
          orderId: 0, // Will be set after order creation
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: parseFloat(item.unitPrice).toFixed(2),
          total: (parseFloat(item.unitPrice) * item.quantity).toFixed(2)
        }));

        const order = await storage.createOrder(orderData, orderItems);
        
        console.log(`✅ Order #${order.id} (Wholesale Ref: ${wholesaleRef}) created successfully for wholesaler ${wholesalerId}, customer ${customerName}, total: ${totalAmount}`);

        // Send customer confirmation email and Stripe invoice
        if (wholesaler && customerEmail) {
          try {
            // Enrich items with product details for email
            const enrichedItems = await Promise.all(items.map(async (item: any) => {
              const product = await storage.getProduct(item.productId);
              return {
                ...item,
                productName: product?.name || `Product #${item.productId}`,
                product: product ? { name: product.name } : null
              };
            }));
            
            await sendCustomerInvoiceEmail({
              name: customerName,
              email: customerEmail,
              phone: customerPhone,
              address: typeof customerAddress === 'string' ? customerAddress : JSON.parse(customerAddress).address
            }, order, enrichedItems, wholesaler);
            console.log(`📧 Confirmation email sent to ${customerEmail} for order #${order.id}`);

            // Create and send Stripe invoice to customer
            await createAndSendStripeInvoice(order, enrichedItems, wholesaler, {
              name: customerName,
              email: customerEmail,
              phone: customerPhone
            });
            
          } catch (emailError) {
            console.error(`❌ Failed to send confirmation email for order #${order.id}:`, emailError);
          }
        }

        // Send WhatsApp notification to wholesaler with wholesale reference
        if (wholesaler && wholesaler.twilioAuthToken && wholesaler.twilioPhoneNumber) {
          const currencySymbol = wholesaler.preferredCurrency === 'GBP' ? '£' : '$';
          const message = `🎉 New Order Received!\n\nWholesale Ref: ${wholesaleRef}\nCustomer: ${customerName}\nPhone: ${customerPhone}\nEmail: ${customerEmail}\nTotal: ${currencySymbol}${totalAmount}\n\nOrder ID: ${order.id}\nStatus: Paid\n\nQuote this reference when communicating with the customer.`;
          
          try {
            const { whatsappService } = await import('./whatsapp');
            await whatsappService.sendMessage(wholesaler.businessPhone || wholesaler.twilioPhoneNumber, message, wholesaler.id);
          } catch (error) {
            console.error('Failed to send WhatsApp notification:', error);
          }
        }

        // Send email notification to wholesaler
        if (wholesaler && wholesaler.email) {
          try {
            // Prepare order data for email template  
            const enrichedItemsForEmail = await Promise.all(items.map(async (item: any) => {
              const product = await storage.getProduct(item.productId);
              return {
                productName: product?.name || `Product #${item.productId}`,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                total: (parseFloat(item.unitPrice) * item.quantity).toFixed(2)
              };
            }));

            const emailData: OrderEmailData = {
              orderNumber: order.orderNumber || `ORD-${order.id}`,
              customerName,
              customerEmail: customerEmail || '',
              customerPhone,
              customerAddress: typeof customerAddress === 'string' ? customerAddress : 
                (customerAddress ? JSON.stringify(customerAddress) : undefined),
              total: correctTotal,
              subtotal: productSubtotal,
              platformFee: parseFloat(wholesalerPlatformFee || '0').toFixed(2),
              customerTransactionFee: parseFloat(customerTransactionFee || '0').toFixed(2),
              wholesalerPlatformFee: parseFloat(wholesalerPlatformFee || '0').toFixed(2),
              shippingTotal: '0.00',
              fulfillmentType: 'pickup',
              items: enrichedItemsForEmail,
              wholesaler: {
                businessName: wholesaler.businessName || `${wholesaler.firstName} ${wholesaler.lastName}`,
                firstName: wholesaler.firstName || '',
                lastName: wholesaler.lastName || '',
                email: wholesaler.email
              },
              orderDate: new Date().toISOString(),
              paymentMethod: 'Card Payment'
            };

            const emailTemplate = generateWholesalerOrderNotificationEmail(emailData);
            
            await sendEmail({
              to: wholesaler.email,
              from: 'hello@quikpik.co',
              subject: emailTemplate.subject,
              html: emailTemplate.html,
              text: emailTemplate.text
            });

            console.log(`📧 Wholesaler email notification sent to ${wholesaler.email} for Order #${order.id}`);
          } catch (error) {
            console.error('Failed to send wholesaler email notification:', error);
          }
        }

        res.json({ 
          success: true, 
          orderId: order.id, 
          platformFeeCollected: connectAccountUsed === 'true',
          message: 'Order created successfully'
        });
      } else {
        res.status(400).json({ message: 'Invalid order type' });
      }
    } catch (error: any) {
      console.error('Error creating order:', error);
      res.status(500).json({ message: 'Failed to create order: ' + error.message });
    }
  });

  // Test endpoint to send wholesaler notification email
  app.post('/api/test-wholesaler-email', requireAuth, async (req, res) => {
    try {
      const { orderId } = req.body;
      
      if (!orderId) {
        return res.status(400).json({ message: 'Order ID required' });
      }

      console.log(`🧪 Testing wholesaler email notification for Order #${orderId}`);
      
      const order = await storage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ message: 'Order not found' });
      }

      const wholesaler = await storage.getUser(order.wholesalerId);
      console.log(`👤 Wholesaler found: ${wholesaler?.email ? wholesaler.email : 'NO EMAIL'}`);
      
      if (!wholesaler?.email) {
        return res.status(400).json({ message: 'Wholesaler email not found' });
      }

      const customer = await storage.getUser(order.retailerId);
      const orderItems = await storage.getOrderItems(orderId);
      const enrichedItems = await Promise.all(orderItems.map(async (item: any) => {
        const product = await storage.getProduct(item.productId);
        return {
          productName: product?.name || `Product #${item.productId}`,
          quantity: item.quantity,
          unitPrice: item.unitPrice || '0.00',
          total: item.total || (parseFloat(item.unitPrice || '0') * item.quantity).toFixed(2)
        };
      }));

      const { generateWholesalerOrderNotificationEmail } = await import('./email-templates');
      const { sendEmail } = await import('./sendgrid-service');
      
      const customerName = customer && (customer.firstName && customer.lastName 
        ? `${customer.firstName} ${customer.lastName}` 
        : customer.firstName || customer.businessName || 'Customer');

      const emailData = {
        orderNumber: `#${order.id}`,
        customerName: customerName || 'Customer',
        customerEmail: customer?.email || '',
        customerPhone: customer?.phoneNumber || customer?.businessPhone || '',
        customerAddress: order.deliveryAddress,
        total: order.total || '0.00',
        subtotal: order.subtotal || '0.00',
        platformFee: order.platformFee || '0.00',
        shippingTotal: order.shippingTotal || '0.00',
        fulfillmentType: order.fulfillmentType || 'pickup',
        items: enrichedItems,
        wholesaler: {
          businessName: wholesaler.businessName || `${wholesaler.firstName} ${wholesaler.lastName}`,
          firstName: wholesaler.firstName || '',
          lastName: wholesaler.lastName || '',
          email: wholesaler.email
        },
        orderDate: order.createdAt ? new Date(order.createdAt).toISOString() : new Date().toISOString(),
        paymentMethod: 'Card Payment'
      };

      console.log(`📧 Preparing test email for ${wholesaler.email}`);
      
      // Use simple email first to test
      const success = await sendEmail({
        to: wholesaler.email,
        from: 'hello@quikpik.co', // Use verified sender address
        subject: `[TEST] New Order #${order.id} - ${customerName}`,
        html: `<p>You have received a new order #${order.id} from ${customerName}.</p>`,
        text: `You have received a new order #${order.id} from ${customerName}.`
      });

      if (success) {
        console.log(`✅ Test email sent successfully to ${wholesaler.email}`);
        res.json({ 
          success: true, 
          message: `Test email sent to ${wholesaler.email}`,
          emailData: {
            to: wholesaler.email,
            subject: `[TEST] New Order #${order.id} - ${customerName}`,
            orderNumber: emailData.orderNumber,
            customerName: emailData.customerName
          }
        });
      } else {
        console.log(`❌ Test email failed to send to ${wholesaler.email}`);
        res.status(500).json({ message: 'Failed to send test email' });
      }
    } catch (error: any) {
      console.error('❌ Test wholesaler email error:', error);
      res.status(500).json({ message: 'Error testing wholesaler email: ' + error.message });
    }
  });




  app.patch('/api/orders/:id/status', requireAuth, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const { status } = req.body;
      const userId = req.user.id;

      const order = await storage.getOrder(id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Only wholesaler can update order status
      if (order.wholesalerId !== userId) {
        return res.status(403).json({ message: "Not authorized to update this order" });
      }

      const updatedOrder = await storage.updateOrderStatus(id, status);

      // Auto-archive fulfilled orders
      if (status === 'fulfilled') {
        setTimeout(async () => {
          try {
            await storage.updateOrderStatus(id, 'archived');
            console.log(`Order ${id} auto-archived after fulfillment`);
          } catch (error) {
            console.error(`Failed to auto-archive order ${id}:`, error);
          }
        }, 24 * 60 * 60 * 1000); // Archive after 24 hours
      }

      res.json(updatedOrder);
    } catch (error) {
      console.error("Error updating order status:", error);
      res.status(500).json({ message: "Failed to update order status" });
    }
  });

  // Cancel order
  app.post('/api/orders/:id/cancel', requireAuth, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user.id;
      const { reason } = req.body;

      const order = await storage.getOrder(id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Only wholesaler can cancel order
      if (order.wholesalerId !== userId) {
        return res.status(403).json({ message: "Not authorized to cancel this order" });
      }

      // Can't cancel already fulfilled or archived orders
      if (order.status === 'fulfilled' || order.status === 'archived') {
        return res.status(400).json({ message: "Cannot cancel fulfilled or archived orders" });
      }

      // Update order status to cancelled
      const updatedOrder = await storage.updateOrderStatus(id, 'cancelled');
      
      // Restore stock for cancelled orders
      const orderItems = await storage.getOrderItems(id);
      for (const item of orderItems) {
        const product = await storage.getProduct(item.productId);
        if (product) {
          await storage.updateProductStock(item.productId, product.stock + item.quantity);
        }
      }

      // Send cancellation notification to customer if email available
      try {
        const customer = await storage.getUser(order.retailerId);
        const wholesaler = await storage.getUser(order.wholesalerId);
        
        if (customer?.email && wholesaler) {
          // Send cancellation email
          console.log(`Sending cancellation email to ${customer.email} for order ${id}`);
        }
      } catch (error) {
        console.error('Failed to send cancellation notification:', error);
      }

      res.json({ 
        message: "Order cancelled successfully",
        order: updatedOrder,
        stockRestored: true
      });
    } catch (error) {
      console.error("Error cancelling order:", error);
      res.status(500).json({ message: "Failed to cancel order" });
    }
  });

  // Refund order
  app.post('/api/orders/:id/refund', requireAuth, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user.id;
      const { amount, reason } = req.body;

      const order = await storage.getOrder(id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Only wholesaler can refund order
      if (order.wholesalerId !== userId) {
        return res.status(403).json({ message: "Not authorized to refund this order" });
      }

      // Can only refund paid orders
      if (order.status !== 'paid' && order.status !== 'fulfilled') {
        return res.status(400).json({ message: "Can only refund paid or fulfilled orders" });
      }

      // Check for payment intent ID 
      const paymentIntentId = order.stripePaymentIntentId;
      if (!paymentIntentId) {
        console.log('Order payment details:', {
          orderId: id,
          stripePaymentIntentId: order.stripePaymentIntentId,
          status: order.status,
          total: order.total
        });
        return res.status(400).json({ message: "No payment information found for this order" });
      }

      // Create Stripe refund
      let refund = null;
      if (stripe) {
        try {
          // Prepare refund parameters
          const refundParams: any = {
            payment_intent: paymentIntentId,
            reason: 'requested_by_customer',
            metadata: {
              order_id: id.toString(),
              reason: reason || 'Wholesaler initiated refund'
            }
          };

          // Only include amount if specified (for partial refunds)
          if (amount && amount !== '') {
            const refundAmount = Math.round(parseFloat(amount) * 100); // Convert to cents
            if (!isNaN(refundAmount) && refundAmount > 0) {
              refundParams.amount = refundAmount;
            }
          }
          // For full refunds, omit the amount parameter entirely

          refund = await stripe.refunds.create(refundParams);
        } catch (stripeError: any) {
          console.error('Stripe refund failed:', stripeError);
          return res.status(400).json({ 
            message: `Refund failed: ${stripeError.message}`,
            error: stripeError.code 
          });
        }
      }

      // Update order status to refunded or add refund note
      let updatedOrder;
      if (refund && refund.amount >= parseFloat(order.total) * 100) {
        // Full refund - cancel order
        updatedOrder = await storage.updateOrderStatus(id, 'refunded');
        
        // Restore stock for refunded orders
        const orderItems = await storage.getOrderItems(id);
        for (const item of orderItems) {
          const product = await storage.getProduct(item.productId);
          if (product) {
            await storage.updateProductStock(item.productId, product.stock + item.quantity);
          }
        }
      } else {
        // Partial refund - keep order active but add note
        const currentNotes = order.notes || '';
        const refundNote = `Partial refund of ${refund ? '$' + (refund.amount / 100).toFixed(2) : amount} processed. Reason: ${reason || 'N/A'}`;
        await storage.updateOrderNotes(id, currentNotes + '\n' + refundNote);
        updatedOrder = order;
      }

      // Send refund notification and receipt to customer
      try {
        const customer = await storage.getUser(order.retailerId);
        const wholesaler = await storage.getUser(order.wholesalerId);
        
        if (customer?.email && wholesaler) {
          // Create Stripe credit note for professional refund receipt
          await createStripeRefundReceipt(order, refund, wholesaler, customer, reason);
          
          // Also send custom refund receipt email
          await sendRefundReceipt(customer, order, refund, wholesaler, reason);
          console.log(`Refund receipt sent to ${customer.email} for order ${id}`);
        }
      } catch (error) {
        console.error('Failed to send refund receipt:', error);
      }

      res.json({ 
        message: "Refund processed successfully",
        order: updatedOrder,
        refund: refund ? {
          id: refund.id,
          amount: refund.amount / 100,
          status: refund.status
        } : null,
        stockRestored: refund && refund.amount >= parseFloat(order.total) * 100
      });
    } catch (error) {
      console.error("Error processing refund:", error);
      res.status(500).json({ message: "Failed to process refund" });
    }
  });

  // Resend order confirmation email
  app.post('/api/orders/:id/resend-confirmation', requireAuth, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user.id;

      const order = await storage.getOrder(id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Only wholesaler can resend confirmation emails
      if (order.wholesalerId !== userId) {
        return res.status(403).json({ message: "Not authorized to resend confirmation for this order" });
      }

      const wholesaler = await storage.getUser(userId);
      if (!wholesaler) {
        return res.status(404).json({ message: "Wholesaler not found" });
      }

      // Send confirmation email to customer
      try {
        // Enrich items with product details for email
        const enrichedItems = await Promise.all(order.items.map(async (item: any) => {
          const product = await storage.getProduct(item.productId);
          return {
            ...item,
            productName: product?.name || `Product #${item.productId}`,
            product: product ? { name: product.name } : null
          };
        }));
        
        await sendCustomerInvoiceEmail(order.retailer, order, enrichedItems, wholesaler);
        res.json({ message: "Confirmation email sent successfully" });
      } catch (emailError) {
        console.error("Email sending failed:", emailError);
        res.status(500).json({ message: "Failed to send confirmation email" });
      }
    } catch (error) {
      console.error("Error resending confirmation email:", error);
      res.status(500).json({ message: "Failed to resend confirmation email" });
    }
  });

  // Stock Movement routes
  app.get('/api/products/:id/stock-movements', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const productId = parseInt(req.params.id);
      
      // Verify the user owns this product
      const product = await storage.getProduct(productId);
      if (!product || product.wholesalerId !== userId) {
        return res.status(404).json({ message: "Product not found" });
      }
      
      const movements = await storage.getStockMovements(productId);
      res.json(movements);
    } catch (error) {
      console.error("Error fetching stock movements:", error);
      res.status(500).json({ message: "Failed to fetch stock movements" });
    }
  });

  app.get('/api/products/:id/stock-summary', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const productId = parseInt(req.params.id);
      
      // Verify the user owns this product
      const product = await storage.getProduct(productId);
      if (!product || product.wholesalerId !== userId) {
        return res.status(404).json({ message: "Product not found" });
      }
      
      const summary = await storage.getStockSummary(productId);
      res.json(summary);
    } catch (error) {
      console.error("Error fetching stock summary:", error);
      res.status(500).json({ message: "Failed to fetch stock summary" });
    }
  });

  app.post('/api/products/:id/stock-adjustment', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const productId = parseInt(req.params.id);
      const { adjustmentType, quantity, reason } = req.body;
      
      if (!adjustmentType || !quantity || !reason) {
        return res.status(400).json({ message: "Adjustment type, quantity, and reason are required" });
      }
      
      // Verify the user owns this product
      const product = await storage.getProduct(productId);
      if (!product || product.wholesalerId !== userId) {
        return res.status(404).json({ message: "Product not found" });
      }
      
      const stockBefore = product.stock;
      let stockAfter: number;
      let movementQuantity: number;
      let movementType: string;
      
      if (adjustmentType === 'increase') {
        stockAfter = stockBefore + parseInt(quantity);
        movementQuantity = parseInt(quantity);
        movementType = 'manual_increase';
      } else if (adjustmentType === 'decrease') {
        stockAfter = Math.max(0, stockBefore - parseInt(quantity));
        movementQuantity = -(parseInt(quantity));
        movementType = 'manual_decrease';
      } else {
        return res.status(400).json({ message: "Invalid adjustment type" });
      }
      
      // Update product stock
      await storage.updateProduct(productId, { stock: stockAfter });
      
      // Create stock movement record
      await storage.createStockMovement({
        productId,
        wholesalerId: userId,
        movementType,
        quantity: movementQuantity,
        stockBefore,
        stockAfter,
        reason,
        orderId: null,
        customerName: null,
      });
      
      res.json({ 
        success: true, 
        stockBefore, 
        stockAfter, 
        message: `Stock ${adjustmentType}d by ${quantity} units` 
      });
    } catch (error) {
      console.error("Error adjusting stock:", error);
      res.status(500).json({ message: "Failed to adjust stock" });
    }
  });

  app.get('/api/stock-movements', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const limit = parseInt(req.query.limit as string) || 50;
      
      const movements = await storage.getStockMovementsByWholesaler(userId, limit);
      res.json(movements);
    } catch (error) {
      console.error("Error fetching stock movements:", error);
      res.status(500).json({ message: "Failed to fetch stock movements" });
    }
  });

  // Customer group routes
  app.get('/api/customer-groups', requireAuth, async (req: any, res) => {
    try {
      // Use parent company ID for team members
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
        
      const groups = await storage.getCustomerGroups(targetUserId);
      res.json(groups);
    } catch (error) {
      console.error("Error fetching customer groups:", error);
      res.status(500).json({ message: "Failed to fetch customer groups" });
    }
  });

  // Get all customers from all customer groups (for AI assistant search)
  app.get('/api/customer-groups/all-members', requireAuth, async (req: any, res) => {
    try {
      console.log("Fetching all customer members for user:", req.user?.id);
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      
      console.log("Target user ID:", targetUserId);
      const customerGroups = await storage.getCustomerGroups(targetUserId);
      console.log("Found customer groups:", customerGroups.length);
      
      const allMembers: any[] = [];
      const seenCustomers = new Set<string>();
      
      for (const group of customerGroups) {
        console.log(`Fetching members for group: ${group.name} (ID: ${group.id})`);
        const members = await storage.getGroupMembers(group.id);
        console.log(`Found ${members.length} members in group ${group.name}`);
        console.log("Member data:", members.map(m => ({ firstName: m.firstName, lastName: m.lastName, phoneNumber: m.phoneNumber })));
        
        for (const member of members) {
          // Use phone number as unique identifier instead of userId since customers might share userIds
          const customerKey = `${member.phoneNumber}-${member.firstName}-${member.lastName}`;
          
          if (!seenCustomers.has(customerKey)) {
            seenCustomers.add(customerKey);
            allMembers.push({
              id: `customer-${allMembers.length + 1}`,
              firstName: member.firstName,
              lastName: member.lastName,
              phoneNumber: member.phoneNumber,
              customerGroups: [group.name]
            });
          } else {
            // Add group to existing customer
            const existingCustomer = allMembers.find(c => 
              c.phoneNumber === member.phoneNumber && 
              c.firstName === member.firstName && 
              c.lastName === member.lastName
            );
            if (existingCustomer && !existingCustomer.customerGroups.includes(group.name)) {
              existingCustomer.customerGroups.push(group.name);
            }
          }
        }
      }
      
      console.log("Total unique customers found:", allMembers.length);
      res.json(allMembers);
    } catch (error) {
      console.error("Error fetching all customer group members:", error);
      res.status(500).json({ message: "Failed to fetch customer group members" });
    }
  });

  app.post('/api/customer-groups', requireAuth, async (req: any, res) => {
    try {
      // Use parent company ID for team members to inherit data access
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      
      const user = await storage.getUser(targetUserId);
      
      // Check customer group limit using parent company data
      const groups = await storage.getCustomerGroupsByUser(targetUserId);
      // Team members inherit parent company subscription tier
      const effectiveSubscriptionTier = req.user.role === 'team_member' && req.user.wholesalerId 
        ? user?.subscriptionTier || 'free'
        : user?.subscriptionTier || 'free';
      const groupLimit = getCustomerGroupLimit(effectiveSubscriptionTier);
      
      if (groupLimit !== -1 && groups.length >= groupLimit) {
        return res.status(403).json({ 
          error: "Customer group limit reached",
          message: `You've reached your limit of ${groupLimit} customer groups. Upgrade your plan to create more.`,
          currentCount: groups.length,
          limit: groupLimit,
          tier: user?.subscriptionTier || 'free'
        });
      }
      
      const groupData = insertCustomerGroupSchema.parse({
        ...req.body,
        wholesalerId: targetUserId
      });
      const group = await storage.createCustomerGroup(groupData);
      res.json(group);
    } catch (error) {
      console.error("Error creating customer group:", error);
      console.error("Request body:", req.body);
      console.error("User ID:", req.user?.id);
      console.error("Target User ID:", req.user.role === 'team_member' ? req.user.wholesalerId : req.user.id);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid group data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create customer group", error: error.message });
    }
  });

  app.put('/api/customer-groups/:id', requireAuth, async (req: any, res) => {
    try {
      // Use parent company ID for team members to inherit data access
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      
      const groupId = parseInt(req.params.id);
      const { name, description } = req.body;

      if (!name || typeof name !== 'string') {
        return res.status(400).json({ message: "Name is required" });
      }

      // Verify the user owns this customer group using parent company data
      const groups = await storage.getCustomerGroups(targetUserId);
      const group = groups.find(g => g.id === groupId);
      
      if (!group) {
        return res.status(404).json({ message: "Customer group not found" });
      }

      const updatedGroup = await storage.updateCustomerGroup(groupId, { 
        name, 
        description: description || undefined 
      });
      res.json(updatedGroup);
    } catch (error) {
      console.error("Error updating customer group:", error);
      res.status(500).json({ message: "Failed to update customer group" });
    }
  });

  // Delete customer group
  app.delete('/api/customer-groups/:id', requireAuth, async (req: any, res) => {
    try {
      // Use parent company ID for team members to inherit data access
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      
      const groupId = parseInt(req.params.id);

      // Verify the user owns this customer group using parent company data
      const groups = await storage.getCustomerGroups(targetUserId);
      const group = groups.find(g => g.id === groupId);
      
      if (!group) {
        return res.status(404).json({ message: "Customer group not found" });
      }

      // Delete the customer group (this should cascade delete members)
      await storage.deleteCustomerGroup(groupId);
      
      res.json({
        success: true,
        message: "Customer group deleted successfully"
      });
    } catch (error) {
      console.error("Error deleting customer group:", error);
      res.status(500).json({ message: "Failed to delete customer group" });
    }
  });

  // WhatsApp group creation
  app.post('/api/customer-groups/:groupId/whatsapp-group', requireAuth, async (req: any, res) => {
    try {
      // Use parent company ID for team members to inherit data access
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      
      const groupId = parseInt(req.params.groupId);
      
      // Get the customer group using parent company data
      const groups = await storage.getCustomerGroups(targetUserId);
      const group = groups.find(g => g.id === groupId);
      
      if (!group) {
        return res.status(404).json({ message: "Customer group not found" });
      }

      // Check if WhatsApp is configured using parent company settings
      const user = await storage.getUser(targetUserId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Check if WhatsApp is properly configured based on provider
      let whatsappPhone = null;
      if (user.whatsappProvider === 'twilio') {
        whatsappPhone = user.twilioPhoneNumber;
        if (!user.twilioAccountSid || !user.twilioAuthToken || !user.twilioPhoneNumber) {
          return res.status(400).json({ 
            message: "Please configure your Twilio WhatsApp settings first. Go to Settings → WhatsApp Integration to set up your Twilio credentials." 
          });
        }
      } else if (user.whatsappProvider === 'direct') {
        whatsappPhone = user.whatsappBusinessPhone;
        if (!user.whatsappBusinessPhoneId || !user.whatsappAccessToken || !user.whatsappBusinessPhone) {
          return res.status(400).json({ 
            message: "Please configure your WhatsApp Business API settings first. Go to Settings → WhatsApp Integration to set up your Business API credentials." 
          });
        }
      } else {
        return res.status(400).json({ 
          message: "Please configure WhatsApp integration first. Go to Settings → WhatsApp Integration to get started." 
        });
      }

      // For now, we'll simulate WhatsApp group creation
      // In a real implementation, you would integrate with WhatsApp Business API
      const whatsappGroupId = `whatsapp_group_${groupId}_${Date.now()}`;
      
      // Update the group with WhatsApp group ID
      await storage.updateCustomerGroup(groupId, { whatsappGroupId });
      
      res.json({
        success: true,
        groupName: `${group.name} - WhatsApp`,
        whatsappGroupId,
        whatsappPhone: whatsappPhone,
        provider: user.whatsappProvider,
        message: `WhatsApp group created successfully using ${whatsappPhone}. You can now add customers to this group.`,
      });
    } catch (error) {
      console.error("Error creating WhatsApp group:", error);
      res.status(500).json({ message: "Failed to create WhatsApp group" });
    }
  });

  // Add member to customer group
  app.post('/api/customer-groups/:groupId/members', requireAuth, async (req: any, res) => {
    try {
      // Use parent company ID for team members to inherit data access
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      
      const groupId = parseInt(req.params.groupId);
      const { phoneNumber, name } = req.body;
      
      if (!phoneNumber || !name) {
        return res.status(400).json({ message: "Phone number and name are required" });
      }

      // Automatically format phone number to international format
      const formattedPhoneNumber = formatPhoneToInternational(phoneNumber);
      
      // Validate the formatted phone number
      if (!validatePhoneNumber(formattedPhoneNumber)) {
        return res.status(400).json({ 
          message: `Invalid phone number format. Please provide a valid phone number (e.g., 07507659550 or +447507659550)` 
        });
      }

      // Get the customer group to verify ownership using parent company data
      const groups = await storage.getCustomerGroups(targetUserId);
      const group = groups.find(g => g.id === groupId);
      
      if (!group) {
        return res.status(404).json({ message: "Customer group not found" });
      }

      // Create or find customer with formatted phone number
      let customer = await storage.getUserByPhone(formattedPhoneNumber);
      let isNewCustomer = false;
      
      if (!customer) {
        // Create a new customer/retailer account
        const { firstName, lastName } = parseCustomerName(name);
        customer = await storage.createCustomer({
          phoneNumber: formattedPhoneNumber,
          firstName,
          lastName,
          role: "retailer",
        });
        isNewCustomer = true;
      }

      // Add customer to the group
      await storage.addCustomerToGroup(groupId, customer.id);

      // Send welcome message to new customers
      if (isNewCustomer) {
        try {
          const wholesaler = await storage.getUser(targetUserId);
          const businessName = wholesaler?.businessName || "Your Supplier";
          
          // Get the application domain for customer portal link
          const portalUrl = `https://quikpik.app/customer/${targetUserId}`;
          
          const welcomeMessage = `🎉 Welcome to ${businessName}!\n\n` +
            `Hi ${name}! 👋\n\n` +
            `You've been added to our customer network and can now:\n\n` +
            `🛒 Browse our latest products\n` +
            `📱 Receive instant stock updates\n` +
            `💬 Place orders directly via WhatsApp\n` +
            `🚚 Track your deliveries\n` +
            `💰 Access special wholesale pricing\n\n` +
            `🌐 **Shop Online**: ${portalUrl}\n` +
            `Visit our customer portal to browse products, place orders, and track deliveries!\n\n` +
            `We'll keep you updated with:\n` +
            `• New product arrivals\n` +
            `• Special promotions\n` +
            `• Stock availability alerts\n\n` +
            `Questions? Just reply to this message!\n\n` +
            `✨ This message was powered by Quikpik Merchant`;

          console.log(`Sending welcome message to ${formattedPhoneNumber}:`);
          console.log(`Portal URL: ${portalUrl}`);
          console.log(`Welcome message length: ${welcomeMessage.length}`);
          console.log(`Welcome message preview: ${welcomeMessage.substring(0, 200)}...`);
          
          await whatsappService.sendMessage(formattedPhoneNumber, welcomeMessage, targetUserId);
          console.log(`Welcome message sent to new customer: ${formattedPhoneNumber}`);
        } catch (welcomeError) {
          console.error(`Failed to send welcome message to ${formattedPhoneNumber}:`, welcomeError);
          // Don't fail the whole operation if welcome message fails
        }
      }
      
      res.json({
        success: true,
        message: isNewCustomer ? `${name} added to ${group.name} and welcome message sent!` : `${name} added to ${group.name} successfully`,
        customer: {
          id: customer.id,
          name: customer.firstName,
          phoneNumber: formattedPhoneNumber,
        }
      });
    } catch (error) {
      console.error("Error adding customer to group:", error);
      res.status(500).json({ message: "Failed to add customer to group" });
    }
  });

  // Add existing customer to group by customer ID
  app.post('/api/customer-groups/:groupId/members/:customerId', requireAuth, async (req: any, res) => {
    try {
      // Use parent company ID for team members to inherit data access
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      
      const groupId = parseInt(req.params.groupId);
      const customerId = req.params.customerId;
      
      // Get the customer group to verify ownership using parent company data
      const groups = await storage.getCustomerGroups(targetUserId);
      const group = groups.find(g => g.id === groupId);
      
      if (!group) {
        return res.status(404).json({ message: "Customer group not found" });
      }

      // Get the customer to verify they exist
      const customer = await storage.getUser(customerId);
      if (!customer) {
        return res.status(404).json({ message: "Customer not found" });
      }

      // Check if customer is already in the group
      const existingMember = await storage.isCustomerInGroup(groupId, customerId);
      if (existingMember) {
        return res.status(400).json({ message: "Customer is already in this group" });
      }

      // Add customer to the group
      await storage.addCustomerToGroup(groupId, customerId);
      
      res.json({
        success: true,
        message: `${customer.firstName} ${customer.lastName || ''} added to ${group.name} successfully`,
        customer: {
          id: customer.id,
          name: `${customer.firstName} ${customer.lastName || ''}`.trim(),
          phoneNumber: customer.phoneNumber,
        }
      });
    } catch (error) {
      console.error("Error adding existing customer to group:", error);
      res.status(500).json({ message: "Failed to add customer to group" });
    }
  });

  // Get group members
  app.get('/api/customer-groups/:groupId/members', requireAuth, async (req: any, res) => {
    try {
      // Use parent company ID for team members to inherit data access
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      
      const groupId = parseInt(req.params.groupId);
      const search = req.query.search as string;

      // Verify group ownership using parent company data
      const groups = await storage.getCustomerGroups(targetUserId);
      const group = groups.find(g => g.id === groupId);
      
      if (!group) {
        return res.status(404).json({ message: "Customer group not found" });
      }

      let members;
      if (search && search.trim()) {
        members = await storage.searchGroupMembers(groupId, search.trim());
      } else {
        members = await storage.getGroupMembers(groupId);
      }
      
      res.json(members);
    } catch (error) {
      console.error("Error fetching group members:", error);
      res.status(500).json({ message: "Failed to fetch group members" });
    }
  });

  // Remove member from customer group
  app.delete('/api/customer-groups/:groupId/members/:customerId', requireAuth, async (req: any, res) => {
    try {
      // Use parent company ID for team members to inherit data access
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      
      const groupId = parseInt(req.params.groupId);
      const customerId = req.params.customerId;

      // Verify group ownership using parent company data
      const groups = await storage.getCustomerGroups(targetUserId);
      const group = groups.find(g => g.id === groupId);
      
      if (!group) {
        return res.status(404).json({ message: "Customer group not found" });
      }

      // Remove customer from group
      await storage.removeCustomerFromGroup(groupId, customerId);
      
      res.json({
        success: true,
        message: "Customer removed from group successfully"
      });
    } catch (error) {
      console.error("Error removing customer from group:", error);
      res.status(500).json({ message: "Failed to remove customer from group" });
    }
  });

  // Update customer information in group
  app.patch('/api/customer-groups/:groupId/members/:customerId', requireAuth, async (req: any, res) => {
    try {
      // Use parent company ID for team members to inherit data access
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      
      const groupId = parseInt(req.params.groupId);
      const customerId = req.params.customerId;
      const { phoneNumber, name, email } = req.body;

      if (!phoneNumber) {
        return res.status(400).json({ message: "Phone number is required" });
      }

      if (!name) {
        return res.status(400).json({ message: "Customer name is required" });
      }

      // Verify group ownership using parent company data
      const groups = await storage.getCustomerGroups(targetUserId);
      const group = groups.find(g => g.id === groupId);
      
      if (!group) {
        return res.status(404).json({ message: "Customer group not found" });
      }

      // Update customer information
      await storage.updateCustomerInfo(customerId, phoneNumber, name, email);
      
      res.json({
        success: true,
        message: "Customer information updated successfully"
      });
    } catch (error) {
      console.error("Error updating customer information:", error);
      res.status(500).json({ message: "Failed to update customer information" });
    }
  });

  // Merge duplicate customers
  app.post('/api/customers/merge', requireAuth, async (req: any, res) => {
    try {
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      
      const { primaryCustomerId, duplicateCustomerIds, mergedData } = req.body;

      if (!primaryCustomerId || !duplicateCustomerIds || !Array.isArray(duplicateCustomerIds)) {
        return res.status(400).json({ message: "Primary customer ID and duplicate customer IDs are required" });
      }

      console.log(`🔗 Merging customers: primary=${primaryCustomerId}, duplicates=${duplicateCustomerIds.join(', ')}`);

      // Use the merge functionality from storage
      const result = await storage.mergeCustomers(primaryCustomerId, duplicateCustomerIds, mergedData);
      
      res.json({
        success: true,
        message: `Successfully merged ${duplicateCustomerIds.length} duplicate accounts`,
        primaryCustomerId,
        mergedOrdersCount: 0 // placeholder
      });
    } catch (error) {
      console.error("Error merging customers:", error);
      res.status(500).json({ message: "Failed to merge customers" });
    }
  });

  // Analytics routes
  app.get('/api/analytics/stats', requireAuth, async (req: any, res) => {
    try {
      // Use parent company ID for team members
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
        
      const { fromDate, toDate } = req.query;
      
      let stats;
      if (fromDate && toDate) {
        stats = await storage.getWholesalerStatsForDateRange(targetUserId, new Date(fromDate), new Date(toDate));
      } else {
        stats = await storage.getWholesalerStats(targetUserId);
      }
      
      // Calculate WhatsApp reach from broadcasts
      const broadcastStats = await storage.getBroadcastStats(targetUserId);
      const whatsappReach = broadcastStats.recipientsReached || 0;
      
      // Get total customer count for calculating coverage
      const customerGroups = await storage.getCustomerGroups(targetUserId);
      const totalCustomers = customerGroups.reduce((total, group) => total + 0, 0); // memberCount not available in schema
      
      res.json({
        ...stats,
        whatsappReach,
        customerCount: totalCustomers
      });
    } catch (error) {
      console.error("Error fetching analytics stats:", error);
      res.status(500).json({ message: "Failed to fetch analytics stats" });
    }
  });

  // Chart data endpoint with real date filtering
  app.get('/api/analytics/chart-data', requireAuth, async (req: any, res) => {
    try {
      // Use parent company ID for team members
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      const { fromDate, toDate } = req.query;
      
      if (!fromDate || !toDate) {
        return res.status(400).json({ message: "fromDate and toDate are required" });
      }
      
      const startDate = new Date(fromDate);
      const endDate = new Date(toDate);
      const now = new Date();
      
      // Ensure endDate doesn't exceed current time
      const actualEndDate = endDate > now ? now : endDate;
      
      // Get orders within the date range
      const orders = await storage.getOrdersForDateRange(targetUserId, startDate, actualEndDate);
      
      // Calculate time span to determine chart granularity
      const hoursDifference = (actualEndDate.getTime() - startDate.getTime()) / (1000 * 60 * 60);
      
      let chartData = [];
      
      if (hoursDifference <= 24) {
        // Hourly data for single day (only show past hours)
        const currentHour = now.getHours();
        const isToday = actualEndDate.toDateString() === now.toDateString();
        const maxHour = isToday ? currentHour : 23;
        
        for (let hour = 0; hour <= maxHour; hour++) {
          const hourStart = new Date(startDate);
          hourStart.setHours(hour, 0, 0, 0);
          const hourEnd = new Date(startDate);
          hourEnd.setHours(hour, 59, 59, 999);
          
          const hourOrders = orders.filter(order => {
            const orderDate = new Date(order.createdAt || Date.now());
            return orderDate >= hourStart && orderDate <= hourEnd;
          });
          
          const revenue = hourOrders.reduce((sum, order) => sum + parseFloat(order.total), 0);
          const orderCount = hourOrders.length;
          
          chartData.push({
            name: `${hour}:00`,
            revenue: Math.round(revenue * 100) / 100,
            orders: orderCount
          });
        }
      } else if (hoursDifference <= 168) {
        // Daily data for week
        const daysDiff = Math.ceil(hoursDifference / 24);
        for (let i = 0; i < daysDiff; i++) {
          const dayStart = new Date(startDate);
          dayStart.setDate(startDate.getDate() + i);
          dayStart.setHours(0, 0, 0, 0);
          
          const dayEnd = new Date(dayStart);
          dayEnd.setHours(23, 59, 59, 999);
          
          // Don't include future days
          if (dayStart > now) break;
          
          const dayOrders = orders.filter(order => {
            const orderDate = new Date(order.createdAt || Date.now());
            return orderDate >= dayStart && orderDate <= dayEnd;
          });
          
          const revenue = dayOrders.reduce((sum, order) => sum + parseFloat(order.total), 0);
          const orderCount = dayOrders.length;
          
          chartData.push({
            name: dayStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            revenue: Math.round(revenue * 100) / 100,
            orders: orderCount
          });
        }
      } else {
        // Weekly data for longer periods
        const weeks = Math.ceil(hoursDifference / (24 * 7));
        for (let i = 0; i < weeks; i++) {
          const weekStart = new Date(startDate);
          weekStart.setDate(startDate.getDate() + (i * 7));
          weekStart.setHours(0, 0, 0, 0);
          
          const weekEnd = new Date(weekStart);
          weekEnd.setDate(weekStart.getDate() + 6);
          weekEnd.setHours(23, 59, 59, 999);
          
          // Don't include future weeks
          if (weekStart > now) break;
          
          const weekOrders = orders.filter(order => {
            const orderDate = new Date(order.createdAt || Date.now());
            return orderDate >= weekStart && orderDate <= weekEnd;
          });
          
          const revenue = weekOrders.reduce((sum, order) => sum + parseFloat(order.total), 0);
          const orderCount = weekOrders.length;
          
          chartData.push({
            name: `Week ${i + 1}`,
            revenue: Math.round(revenue * 100) / 100,
            orders: orderCount
          });
        }
      }
      
      res.json(chartData);
    } catch (error) {
      console.error("Error fetching chart data:", error);
      res.status(500).json({ message: "Failed to fetch chart data" });
    }
  });

  app.get('/api/analytics/top-products', requireAuth, async (req: any, res) => {
    try {
      // Use parent company ID for team members
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
        
      const { limit } = req.query;
      const topProducts = await storage.getTopProducts(targetUserId, limit ? parseInt(limit as string) : 5);
      res.json(topProducts);
    } catch (error) {
      console.error("Error fetching top products:", error);
      res.status(500).json({ message: "Failed to fetch top products" });
    }
  });

  app.get('/api/analytics/recent-orders', requireAuth, async (req: any, res) => {
    try {
      // Use parent company ID for team members
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
        
      const { limit } = req.query;
      const recentOrders = await storage.getRecentOrders(targetUserId, limit ? parseInt(limit as string) : 10);
      res.json(recentOrders);
    } catch (error) {
      console.error("Error fetching recent orders:", error);
      res.status(500).json({ message: "Failed to fetch recent orders" });
    }
  });

  app.get('/api/analytics/broadcast-stats', requireAuth, async (req: any, res) => {
    try {
      // Use parent company ID for team members
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
        
      const broadcastStats = await storage.getBroadcastStats(targetUserId);
      res.json(broadcastStats);
    } catch (error) {
      console.error("Error fetching broadcast stats:", error);
      res.status(500).json({ message: "Failed to fetch broadcast stats" });
    }
  });

  // Advanced analytics routes
  app.get('/api/analytics/dashboard', requireAuth, async (req: any, res) => {
    try {
      // Use parent company ID for team members
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
        
      const { timeRange = '30d' } = req.query;
      
      const stats = await storage.getWholesalerStats(targetUserId);
      const broadcastStats = await storage.getBroadcastStats(targetUserId);
      
      // Calculate change percentages (simplified - would need historical data)
      const analyticsData = {
        revenue: {
          total: stats.totalRevenue,
          change: 12.5, // Mock change percentage
          trend: []
        },
        orders: {
          total: stats.ordersCount,
          change: 8.3,
          trend: []
        },
        customers: {
          total: 25,
          new: 5,
          returning: 20,
          trend: []
        },
        products: {
          active: stats.activeProducts,
          lowStock: stats.lowStockCount,
          topPerformers: []
        },
        geography: [
          { region: "London", orders: 15, revenue: 1250 },
          { region: "Manchester", orders: 8, revenue: 680 },
          { region: "Birmingham", orders: 5, revenue: 420 }
        ],
        channels: [
          { channel: "WhatsApp", orders: 18, revenue: 1500 },
          { channel: "Direct", orders: 10, revenue: 850 }
        ],
        broadcasts: {
          sent: broadcastStats.totalBroadcasts,
          delivered: broadcastStats.recipientsReached,
          opened: Math.floor(broadcastStats.recipientsReached * 0.7),
          clicked: Math.floor(broadcastStats.recipientsReached * 0.3)
        }
      };
      
      res.json(analyticsData);
    } catch (error) {
      console.error("Error fetching analytics dashboard:", error);
      res.status(500).json({ message: "Failed to fetch analytics dashboard" });
    }
  });

  app.get('/api/analytics/revenue', requireAuth, async (req: any, res) => {
    try {
      // Use parent company ID for team members
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
        
      const { timeRange = '30d' } = req.query;
      
      // Generate sample revenue trend data
      const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
      const revenueData = [];
      
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        revenueData.push({
          date: date.toISOString().split('T')[0],
          amount: Math.floor(Math.random() * 200) + 50
        });
      }
      
      res.json(revenueData);
    } catch (error) {
      console.error("Error fetching revenue data:", error);
      res.status(500).json({ message: "Failed to fetch revenue data" });
    }
  });

  app.get('/api/analytics/customers', requireAuth, async (req: any, res) => {
    try {
      // Use parent company ID for team members
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
        
      const { timeRange = '30d' } = req.query;
      
      // Generate sample customer growth data
      const days = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
      const customerData = [];
      
      for (let i = days - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        customerData.push({
          date: date.toISOString().split('T')[0],
          new: Math.floor(Math.random() * 3) + 1,
          returning: Math.floor(Math.random() * 5) + 2
        });
      }
      
      res.json(customerData);
    } catch (error) {
      console.error("Error fetching customer data:", error);
      res.status(500).json({ message: "Failed to fetch customer data" });
    }
  });

  app.get('/api/analytics/products', requireAuth, async (req: any, res) => {
    try {
      // Use parent company ID for team members
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
        
      const topProducts = await storage.getTopProducts(targetUserId, 10);
      
      // Format for chart display
      const productPerformance = topProducts.map(product => ({
        name: product.name.substring(0, 15) + (product.name.length > 15 ? '...' : ''),
        orders: product.orderCount,
        revenue: product.revenue
      }));
      
      res.json(productPerformance);
    } catch (error) {
      console.error("Error fetching product performance:", error);
      res.status(500).json({ message: "Failed to fetch product performance" });
    }
  });

  // Stripe Connect onboarding for wholesalers
  app.post("/api/stripe/connect-onboarding", requireAuth, async (req: any, res) => {
    if (!stripe) {
      return res.status(500).json({ message: "Stripe not configured" });
    }

    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      if (user.role !== 'wholesaler') {
        return res.status(403).json({ message: "Only wholesalers can onboard to Stripe Connect" });
      }

      let accountId = user.stripeAccountId;

      // Create Connect account if it doesn't exist
      if (!accountId) {
        // Determine country based on currency preference
        const country = user.preferredCurrency === 'USD' ? 'US' : 
                       user.preferredCurrency === 'EUR' ? 'DE' : 'GB';
        
        const account = await stripe.accounts.create({
          type: 'express',
          country: country,
          email: user.email!,
          capabilities: {
            transfers: { requested: true },
            card_payments: { requested: true }
          },
          business_profile: {
            name: user.businessName || `${user.firstName} ${user.lastName}`,
            support_email: user.email!,
          },
          metadata: {
            userId: userId,
            businessName: user.businessName || '',
            currency: user.preferredCurrency || 'GBP'
          }
        });
        accountId = account.id;
        
        // Save account ID to user
        await storage.updateUserSettings(userId, { stripeAccountId: accountId });
      }

      // Create account link for onboarding
      const accountLink = await stripe.accountLinks.create({
        account: accountId,
        refresh_url: `${req.protocol}://${req.get('host')}/settings?tab=integrations&stripe_onboarding=refresh`,
        return_url: `${req.protocol}://${req.get('host')}/settings?tab=integrations&stripe_onboarding=complete`,
        type: 'account_onboarding',
      });

      res.json({ onboardingUrl: accountLink.url });
    } catch (error: any) {
      console.error("Error creating Stripe Connect onboarding:", error);
      res.status(500).json({ message: "Error creating onboarding: " + error.message });
    }
  });

  // Duplicate removed - using /api/stripe/connect/status below

  // Stripe payment routes with Connect integration
  app.post("/api/create-payment-intent", requireAuth, async (req: any, res) => {
    if (!stripe) {
      return res.status(500).json({ message: "Stripe not configured" });
    }

    try {
      const { orderId } = req.body;
      const userId = req.user.id;

      const order = await storage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      if (order.retailerId !== userId) {
        return res.status(403).json({ message: "Not authorized to pay for this order" });
      }

      // Get wholesaler's Stripe account
      const wholesaler = await storage.getUser(order.wholesalerId);
      if (!wholesaler?.stripeAccountId) {
        return res.status(400).json({ 
          message: "Wholesaler has not set up payment processing. Please contact them to complete their account setup." 
        });
      }

      // Check if wholesaler's account can accept payments
      const account = await stripe.accounts.retrieve(wholesaler.stripeAccountId);
      if (!account.charges_enabled) {
        return res.status(400).json({ 
          message: "Wholesaler's payment account is not fully set up. Please contact them to complete verification." 
        });
      }

      // Get retailer information for receipt email
      const retailer = await storage.getUser(userId);
      
      const totalAmount = Math.round(parseFloat(order.total) * 100); // Convert to cents
      const platformFeeAmount = Math.round(parseFloat(order.platformFee) * 100); // 5% platform fee in cents

      const paymentIntentData: any = {
        amount: totalAmount,
        currency: "gbp", // Always use GBP for platform
        application_fee_amount: platformFeeAmount, // Quikpik's platform fee
        transfer_data: {
          destination: wholesaler.stripeAccountId, // Money goes to wholesaler
        },
        metadata: {
          orderId: order.id.toString(),
          retailerId: userId,
          wholesalerId: order.wholesalerId,
          platformFee: order.platformFee,
          subtotal: order.subtotal
        }
      };

      // Add receipt email if available
      if (retailer?.email) {
        paymentIntentData.receipt_email = retailer.email;
      }

      const paymentIntent = await stripe.paymentIntents.create(paymentIntentData);

      console.log(`💳 Payment intent created for Order #${orderId}`);
      if (retailer?.email) {
        console.log(`✅ Stripe receipt will be automatically sent to: ${retailer.email}`);
      }

      res.json({ clientSecret: paymentIntent.client_secret });
    } catch (error: any) {
      console.error("Error creating payment intent:", error);
      res.status(500).json({ message: "Error creating payment intent: " + error.message });
    }
  });

  // Duplicate removed - using /api/webhooks/stripe below

  // WhatsApp diagnostic endpoint
  app.get('/api/test-whatsapp-credentials', async (req, res) => {
    try {
      console.log('🔧 WhatsApp Credentials Check:');
      console.log('Twilio SID:', !!process.env.TWILIO_ACCOUNT_SID);
      console.log('Twilio Token:', !!process.env.TWILIO_AUTH_TOKEN);  
      console.log('Twilio Phone:', !!process.env.TWILIO_PHONE_NUMBER);
      
      res.json({
        hasCredentials: {
          twilioSID: !!process.env.TWILIO_ACCOUNT_SID,
          twilioToken: !!process.env.TWILIO_AUTH_TOKEN,
          twilioPhone: !!process.env.TWILIO_PHONE_NUMBER
        },
        environment: process.env.NODE_ENV
      });
    } catch (error) {
      console.error('WhatsApp credentials check error:', error);
      res.status(500).json({ error: 'Credentials check failed' });
    }
  });

  // WhatsApp Broadcast endpoints
  app.post('/api/broadcasts', requireAuth, async (req: any, res) => {
    try {
      const { productId, customerGroupId, customMessage, scheduledAt } = req.body;
      // Use parent company ID for team members
      const wholesalerId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;

      // Validate the request data
      const validatedData = insertBroadcastSchema.parse({
        wholesalerId,
        productId: parseInt(productId),
        customerGroupId: parseInt(customerGroupId),
        message: customMessage || '',
        status: 'pending',
        sentAt: scheduledAt ? new Date(scheduledAt) : null,
      });

      // Create broadcast record in database
      const broadcast = await storage.createBroadcast(validatedData);

      // Send the broadcast via WhatsApp
      const result = await whatsappService.sendProductBroadcast(
        wholesalerId,
        productId,
        customerGroupId,
        customMessage
      );

      // Update broadcast status based on result
      if (result.success) {
        await storage.updateBroadcastStatus(
          broadcast.id,
          'sent',
          new Date(),
          result.recipientCount,
          result.messageId
        );
        
        res.json({
          success: true,
          messageId: result.messageId,
          message: "Broadcast sent successfully",
          broadcastId: broadcast.id
        });
      } else {
        await storage.updateBroadcastStatus(
          broadcast.id,
          'failed',
          undefined,
          undefined,
          undefined,
          result.error
        );
        
        res.status(400).json({
          success: false,
          error: result.error,
          broadcastId: broadcast.id
        });
      }
    } catch (error) {
      console.error("Error sending broadcast:", error);
      res.status(500).json({ message: "Failed to send broadcast" });
    }
  });

  app.get('/api/broadcasts', requireAuth, async (req: any, res) => {
    try {
      // Use parent company ID for team members
      const wholesalerId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
        
      const broadcasts = await storage.getBroadcasts(wholesalerId);
      res.json(broadcasts);
    } catch (error) {
      console.error("Error fetching broadcasts:", error);
      res.status(500).json({ message: "Failed to fetch broadcasts" });
    }
  });

  app.get('/api/broadcasts/stats', requireAuth, async (req: any, res) => {
    try {
      // Use parent company ID for team members
      const wholesalerId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
        
      const stats = await storage.getBroadcastStats(wholesalerId);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching broadcast stats:", error);
      res.status(500).json({ message: "Failed to fetch broadcast statistics" });
    }
  });

  // AI description generation
  app.post('/api/ai/generate-description', requireAuth, async (req: any, res) => {
    try {
      const { productName, category, features } = req.body;
      
      if (!process.env.OPENAI_API_KEY) {
        return res.status(400).json({ message: "AI description generation is not available. Please add your OPENAI_API_KEY to use this feature." });
      }

      const { default: OpenAI } = await import('openai');
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const prompt = `Write a compelling product description for a wholesale product:
      
Product Name: ${productName}
Category: ${category || 'General'}
Features: ${features || 'N/A'}

Write a professional, sales-focused description that highlights the key benefits and features. Keep it concise but persuasive, suitable for B2B wholesale buyers. Focus on quality, value, and practical benefits.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
        messages: [{ role: "user", content: prompt }],
        max_tokens: 300,
        temperature: 0.7,
      });

      const generatedDescription = response.choices[0].message.content;
      res.json({ description: generatedDescription });
    } catch (error) {
      console.error("AI description generation error:", error);
      res.status(500).json({ message: "Failed to generate description" });
    }
  });

  // Test endpoint for AI generation without authentication
  app.post('/api/ai/test-message', async (req: any, res) => {
    try {
      console.log("AI test message request received");
      console.log("Request body:", req.body);
      
      const context = {
        businessName: "Test Business",
        businessType: "wholesale",
        customerName: "Test Customer",
        productName: "Test Product",
        productCategory: "Food",
        ...req.body
      };

      console.log("AI test context:", context);
      const personalizedMessage = await generatePersonalizedTagline(context);
      console.log("Generated test message:", personalizedMessage);
      res.json(personalizedMessage);
    } catch (error) {
      console.error("AI test error:", error);
      console.error("Error details:", error.message);
      
      const fallbackMessage = {
        greeting: "Hi Test Customer!",
        mainMessage: "Fresh stock from Test Business available",
        callToAction: "Order today!",
        fullMessage: "Hi Test Customer! Fresh stock from Test Business available. Order today!"
      };
      
      res.json(fallbackMessage);
    }
  });

  // AI-powered campaign personalization endpoints
  app.post('/api/ai/personalized-message', requireAuth, async (req: any, res) => {
    try {
      console.log("AI personalized message request received");
      console.log("Request body:", req.body);
      
      const userId = req.user.role === 'team_member' && req.user.wholesalerId ? req.user.wholesalerId : req.user.id;
      const user = await storage.getUser(userId);
      
      if (!user) {
        console.log("User not found for ID:", userId);
        return res.status(404).json({ message: "User not found" });
      }

      const context = {
        businessName: user.businessName || user.firstName || "Your Business",
        businessType: user.businessType,
        ...req.body
      };

      console.log("AI context:", context);
      const personalizedMessage = await generatePersonalizedTagline(context);
      console.log("Generated message:", personalizedMessage);
      res.json(personalizedMessage);
    } catch (error) {
      console.error("AI personalization error:", error);
      console.error("Error details:", (error as Error).message);
      
      // Return fallback message instead of error to ensure UI doesn't break
      const fallbackMessage = {
        greeting: req.body.customerName ? `Hi ${req.body.customerName}!` : "Hello!",
        mainMessage: req.body.productName ? `New stock: ${req.body.productName} available` : `Fresh stock available`,
        callToAction: "Order today!",
        fullMessage: `${req.body.customerName ? `Hi ${req.body.customerName}!` : "Hello!"} ${req.body.productName ? `New stock: ${req.body.productName} available` : `Fresh stock available`}. Order today!`
      };
      
      res.json(fallbackMessage);
    }
  });

  app.get('/api/ai/campaign-suggestions', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.role === 'team_member' && req.user.wholesalerId ? req.user.wholesalerId : req.user.id;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Get products and customer groups for context
      const products = await storage.getProducts(userId);
      const customerGroups = await storage.getCustomerGroups(userId);

      // Get recent campaign performance (simplified for now)
      const recentPerformance = {
        openRate: 75, // This would come from analytics in a real implementation
        clickRate: 25,
        conversionRate: 8
      };

      const context = {
        businessName: user.businessName || user.firstName || "Your Business",
        businessType: user.businessType || "General",
        products: products.map(p => ({
          name: p.name,
          category: p.category || "General",
          price: parseFloat(p.price || "0")
        })),
        customerGroups: customerGroups.map(g => ({
          name: g.name,
          memberCount: 0
        })),
        recentPerformance
      };

      const suggestions = await generateCampaignSuggestions(context);
      res.json(suggestions);
    } catch (error) {
      console.error("Campaign suggestions error:", error);
      res.status(500).json({ message: "Failed to generate campaign suggestions" });
    }
  });

  app.post('/api/ai/optimize-timing', requireAuth, async (req: any, res) => {
    try {
      const { customerGroup, previousCampaignData } = req.body;
      
      const timing = await optimizeMessageTiming({
        customerGroup: customerGroup || 'General',
        businessType: req.user.businessType || 'General',
        previousCampaignData: previousCampaignData || []
      });
      
      res.json(timing);
    } catch (error) {
      console.error("AI timing optimization error:", error);
      res.status(500).json({ message: "Failed to optimize campaign timing" });
    }
  });

  app.post('/api/ai/optimize-timing', requireAuth, async (req: any, res) => {
    try {
      const { customerGroup, previousCampaignData } = req.body;
      const userId = req.user.role === 'team_member' && req.user.wholesalerId ? req.user.wholesalerId : req.user.id;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const context = {
        customerGroup: customerGroup || "General",
        businessType: user.businessType || "wholesale",
        previousCampaignData
      };

      const timing = await optimizeMessageTiming(context);
      res.json(timing);
    } catch (error) {
      console.error("Timing optimization error:", error);
      res.status(500).json({ message: "Failed to optimize message timing" });
    }
  });

  // Note: Subscription status endpoint is defined later in the file with correct product counting

  app.post('/api/subscription/create', requireAuth, async (req: any, res) => {
    if (!stripe) {
      return res.status(500).json({ message: "Stripe not configured" });
    }

    try {
      const { planId, tier } = req.body;
      const selectedTier = planId || tier; // Support both parameter names
      const userId = req.user.id;
      const user = await storage.getUser(userId);

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Define pricing and limits for each tier - use real Stripe price IDs
      const tierConfig = {
        standard: { 
          priceId: 'price_1RieBnBLkKweDa5PCS7fdhWO', // Real Standard price ID from replit.md
          productLimit: 10, 
          price: 1099 // £10.99 in pence
        }, 
        premium: { 
          priceId: 'price_1RieBnBLkKweDa5Py3yl0gTP', // Real Premium price ID from replit.md
          productLimit: -1, 
          price: 1999 // £19.99 in pence
        }
      };

      if (!tierConfig[selectedTier as keyof typeof tierConfig]) {
        return res.status(400).json({ message: "Invalid subscription tier" });
      }

      const config = tierConfig[selectedTier as keyof typeof tierConfig];

      // Create or retrieve Stripe customer
      let customerId = user.stripeCustomerId;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email!,
          name: `${user.firstName} ${user.lastName}`,
          metadata: {
            userId: userId,
            businessName: user.businessName || ''
          }
        });
        customerId = customer.id;
      }

      // Create Stripe checkout session using real price IDs
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [{
          price: config.priceId, // Use the real Stripe price ID
          quantity: 1,
        }],
        mode: 'subscription',
        success_url: `${req.protocol}://${req.get('host')}/subscription?success=true`,
        cancel_url: `${req.protocol}://${req.get('host')}/subscription?canceled=true`,
        metadata: {
          userId: userId,
          tier: selectedTier,
          productLimit: config.productLimit.toString()
        }
      });

      res.json({ subscriptionUrl: session.url });
    } catch (error: any) {
      console.error("Error creating subscription:", error);
      res.status(500).json({ message: "Failed to create subscription: " + error.message });
    }
  });

  // Duplicate removed - subscription webhooks handled by /api/webhooks/stripe

  // Marketplace endpoints (public access)
  // Enhanced Marketplace Discovery API - Featured content
  app.get("/api/marketplace/featured", async (req, res) => {
    try {
      // Get sample data for featured showcase
      const featuredCategories = [
        "Groceries & Food",
        "Fresh Produce", 
        "Beverages & Drinks",
        "Personal Care & Hygiene",
        "Electronics & Gadgets",
        "Home & Kitchen"
      ];

      const topWholesalers = await storage.getMarketplaceWholesalers({ search: "" });
      const recentProducts = await storage.getMarketplaceProducts({ 
        search: "", 
        sortBy: "newest" 
      });

      res.json({
        categories: featuredCategories,
        topWholesalers: topWholesalers.slice(0, 6),
        recentProducts: recentProducts.slice(0, 8),
        stats: {
          totalWholesalers: Math.max(500, topWholesalers.length),
          totalProducts: Math.max(10000, recentProducts.length),
          totalCategories: 20
        }
      });
    } catch (error) {
      console.error("Error fetching featured content:", error);
      res.status(500).json({ message: "Failed to fetch featured content" });
    }
  });

  // Enhanced marketplace products with advanced filtering
  app.get('/api/marketplace/products', async (req, res) => {
    try {
      const filters = {
        search: req.query.search as string,
        category: req.query.category as string,
        location: req.query.location as string,
        sortBy: req.query.sortBy as string || "featured",
        minPrice: req.query.minPrice ? parseFloat(req.query.minPrice as string) : undefined,
        maxPrice: req.query.maxPrice ? parseFloat(req.query.maxPrice as string) : undefined,
        minRating: req.query.minRating ? parseFloat(req.query.minRating as string) : undefined,
        wholesalerId: req.query.wholesalerId as string
      };
      
      const products = await storage.getMarketplaceProducts(filters);
      res.json(products);
    } catch (error) {
      console.error("Error fetching marketplace products:", error);
      res.status(500).json({ message: "Failed to fetch marketplace products" });
    }
  });

  // User marketplace settings
  app.get("/api/user/marketplace-settings", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      
      res.json({ 
        showPricesToWholesalers: user?.showPricesToWholesalers || false 
      });
    } catch (error) {
      console.error("Error fetching marketplace settings:", error);
      res.status(500).json({ message: "Failed to fetch marketplace settings" });
    }
  });

  app.patch("/api/user/marketplace-settings", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { showPricesToWholesalers } = req.body;
      
      await storage.updateUser(userId, { showPricesToWholesalers });
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating marketplace settings:", error);
      res.status(500).json({ message: "Failed to update marketplace settings" });
    }
  });


  // Enhanced wholesalers discovery with location and rating filters
  app.get('/api/marketplace/wholesalers', async (req, res) => {
    try {
      const filters = {
        search: req.query.search as string,
        location: req.query.location as string,
        category: req.query.category as string,
        minRating: req.query.minRating ? parseFloat(req.query.minRating as string) : undefined
      };
      
      const wholesalers = await storage.getMarketplaceWholesalers(filters);
      res.json(wholesalers);
    } catch (error) {
      console.error("Error fetching marketplace wholesalers:", error);
      res.status(500).json({ message: "Failed to fetch marketplace wholesalers" });
    }
  });

  // Get all wholesalers for customer login dropdown
  app.get("/api/wholesalers/all", async (req, res) => {
    try {
      const wholesalers = await storage.getAllWholesalers();
      res.json(wholesalers);
    } catch (error) {
      console.error("Error fetching all wholesalers:", error);
      res.status(500).json({ message: "Failed to fetch wholesalers" });
    }
  });

  // Wholesaler lookup endpoint for customer login
  app.get("/api/wholesaler/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const wholesaler = await storage.getUser(id);
      
      if (!wholesaler || wholesaler.role !== 'wholesaler') {
        return res.status(404).json({ message: "Wholesaler not found" });
      }
      
      // Return basic wholesaler info for customer login
      res.json({
        id: wholesaler.id,
        businessName: wholesaler.businessName || wholesaler.firstName || 'Business',
        email: wholesaler.email
      });
    } catch (error) {
      console.error("Error looking up wholesaler:", error);
      res.status(500).json({ message: "Failed to lookup wholesaler" });
    }
  });

  // Test endpoint for Stripe account checking
  app.get("/api/test-stripe-account/:wholesalerId", async (req: any, res) => {
    try {
      const { wholesalerId } = req.params;
      console.log(`🔍 Test - Looking up wholesaler: ${wholesalerId}`);
      
      const wholesaler = await storage.getUser(wholesalerId);
      console.log(`🔍 Test - Wholesaler result:`, wholesaler ? {
        id: wholesaler.id,
        businessName: wholesaler.businessName,
        stripeAccountId: wholesaler.stripeAccountId,
        email: wholesaler.email
      } : 'null');
      
      res.json({
        wholesalerId,
        found: !!wholesaler,
        hasStripeAccount: !!(wholesaler?.stripeAccountId),
        stripeAccountId: wholesaler?.stripeAccountId,
        businessName: wholesaler?.businessName
      });
    } catch (error: any) {
      console.error("Test endpoint error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Test endpoint to check if basic DB connection works
  app.get('/api/marketplace/wholesaler-test/:id', async (req, res) => {
    try {
      console.log("=== TESTING DB CONNECTION ===");
      const { id } = req.params;
      
      // Try to get user from storage
      const user = await storage.getUser(id);
      const result = { rows: [{ count: user ? 1 : 0 }] };
      console.log("Direct SQL result:", result.rows);
      
      res.json({ success: true, id, result: result.rows });
    } catch (error) {
      console.error("=== TEST ERROR ===", error);
      res.status(500).json({ message: "Test failed", error: error.message });
    }
  });

  // Detailed wholesaler profile endpoint
  app.get('/api/marketplace/wholesaler/:id', async (req, res) => {
    try {
      console.log("=== Starting wholesaler profile request ===");
      const { id } = req.params;
      console.log("Requested wholesaler ID:", id);
      
      console.log("About to call storage.getWholesalerProfile...");
      const wholesaler = await storage.getWholesalerProfile(id);
      console.log("getWholesalerProfile completed successfully");
      
      if (!wholesaler) {
        console.log("Wholesaler not found, returning 404");
        return res.status(404).json({ message: "Wholesaler not found" });
      }
      
      console.log("Returning wholesaler data:", wholesaler.businessName);
      res.json(wholesaler);
    } catch (error) {
      console.error("=== Error in wholesaler profile route ===");
      console.error("Error type:", error.constructor.name);
      console.error("Error message:", error.message);
      console.error("Full error:", error);
      console.error("Stack trace:", error.stack);
      res.status(500).json({ message: "Failed to fetch wholesaler profile" });
    }
  });

  // Category statistics and insights
  app.get("/api/marketplace/categories", async (req, res) => {
    try {
      const allProducts = await storage.getMarketplaceProducts({ search: "" });
      
      // Calculate category statistics from real data
      const categoryStats = [
        "Groceries & Food",
        "Fresh Produce", 
        "Beverages & Drinks",
        "Personal Care & Hygiene",
        "Electronics & Gadgets",
        "Home & Kitchen",
        "Clothing & Fashion",
        "Health & Pharmacy",
        "Baby & Childcare",
        "Pet Food & Supplies"
      ].map(category => {
        const count = allProducts.filter(p => p.category === category).length;
        return { name: category, count, icon: category.toLowerCase().replace(/\s+/g, '_') };
      });

      res.json(categoryStats);
    } catch (error) {
      console.error("Error fetching categories:", error);
      res.status(500).json({ message: "Failed to fetch categories" });
    }
  });

  // Search suggestions for autocomplete
  app.get("/api/marketplace/search/suggestions", async (req, res) => {
    try {
      const query = req.query.q as string;
      
      if (!query || query.length < 2) {
        return res.json([]);
      }

      const suggestions = [
        "Fresh Vegetables",
        "Organic Fruits",
        "Dairy Products",
        "Baked Goods",
        "Meat & Poultry"
      ].filter(s => s.toLowerCase().includes(query.toLowerCase()));

      res.json(suggestions);
    } catch (error) {
      console.error("Error fetching search suggestions:", error);
      res.status(500).json({ message: "Failed to fetch suggestions" });
    }
  });

  // ======= ADVERTISING & PROMOTION ENDPOINTS =======

  // Get advertising campaigns
  app.get("/api/advertising/campaigns", requireAuth, async (req: any, res) => {
    try {
      const user = req.user;
      const targetUserId = user.role === 'team_member' ? user.wholesalerId : user.id;

      // Mock data for now - will be replaced with database queries
      const campaigns = [
        {
          id: "camp_001",
          name: "Holiday Special Products",
          type: "featured_product",
          status: "active",
          budget: 150,
          spent: 89.50,
          impressions: 12500,
          clicks: 425,
          conversions: 23,
          startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
          endDate: new Date(Date.now() + 23 * 24 * 60 * 60 * 1000).toISOString(),
          targetAudience: {
            location: ["London", "Manchester"],
            categories: ["Groceries & Food"],
            businessTypes: ["Restaurant", "Retail Store"]
          }
        },
        {
          id: "camp_002",
          name: "Fresh Produce Spotlight",
          type: "category_sponsor",
          status: "active",
          budget: 200,
          spent: 134.25,
          impressions: 8900,
          clicks: 312,
          conversions: 18,
          startDate: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
          endDate: new Date(Date.now() + 16 * 24 * 60 * 60 * 1000).toISOString(),
          targetAudience: {
            location: ["Birmingham", "Leeds"],
            categories: ["Fresh Produce"],
            businessTypes: ["Restaurant"]
          }
        }
      ];

      res.json(campaigns);
    } catch (error) {
      console.error("Error fetching advertising campaigns:", error);
      res.status(500).json({ message: "Failed to fetch campaigns" });
    }
  });

  // Create advertising campaign
  app.post("/api/advertising/campaigns", requireAuth, async (req: any, res) => {
    try {
      const user = req.user;
      const targetUserId = user.role === 'team_member' ? user.wholesalerId : user.id;
      const { name, type, budget, duration, targetAudience } = req.body;

      // For now, return mock response - will implement database storage
      const newCampaign = {
        id: `camp_${Date.now()}`,
        name,
        type,
        status: "draft",
        budget: parseFloat(budget),
        spent: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + (parseInt(duration) || 30) * 24 * 60 * 60 * 1000).toISOString(),
        targetAudience: targetAudience || {}
      };

      res.json(newCampaign);
    } catch (error) {
      console.error("Error creating campaign:", error);
      res.status(500).json({ message: "Failed to create campaign" });
    }
  });

  // Get SEO pages
  app.get("/api/advertising/seo-pages", requireAuth, async (req: any, res) => {
    try {
      const user = req.user;
      const targetUserId = user.role === 'team_member' ? user.wholesalerId : user.id;

      // Get actual products for this wholesaler
      const products = await storage.getProducts(targetUserId);
      
      // Generate SEO page data based on actual products
      const seoPages = products.slice(0, 3).map(product => ({
        id: `seo_${product.id}`,
        productId: product.id,
        productName: product.name,
        slug: product.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
        metaTitle: `${product.name} - Wholesale Supplier | Quikpik`,
        metaDescription: `Premium ${product.name} available for wholesale. ${product.description?.slice(0, 120) || 'Quality products from trusted suppliers.'}...`,
        views: Math.floor(Math.random() * 500) + 50,
        leads: Math.floor(Math.random() * 20) + 2,
        status: "published" as const
      }));

      res.json(seoPages);
    } catch (error) {
      console.error("Error fetching SEO pages:", error);
      res.status(500).json({ message: "Failed to fetch SEO pages" });
    }
  });

  // Create SEO page for product
  app.post("/api/advertising/seo-pages", requireAuth, async (req: any, res) => {
    try {
      const user = req.user;
      const targetUserId = user.role === 'team_member' ? user.wholesalerId : user.id;
      const { productId } = req.body;

      const product = await storage.getProduct(productId);
      if (!product || product.wholesalerId !== targetUserId) {
        return res.status(404).json({ message: "Product not found" });
      }

      const seoPage = {
        id: `seo_${productId}`,
        productId: product.id,
        productName: product.name,
        slug: product.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
        metaTitle: `${product.name} - Wholesale Supplier | Quikpik`,
        metaDescription: `Premium ${product.name} available for wholesale. ${product.description?.slice(0, 120) || 'Quality products from trusted suppliers.'}...`,
        views: 0,
        leads: 0,
        status: "published"
      };

      res.json(seoPage);
    } catch (error) {
      console.error("Error creating SEO page:", error);
      res.status(500).json({ message: "Failed to create SEO page" });
    }
  });

  // Public SEO-optimized product pages
  app.get("/api/public/products/:slug", async (req, res) => {
    try {
      const { slug } = req.params;
      
      // Mock SEO-optimized product data
      const product = {
        id: "prod_001",
        name: "Premium Organic Apples",
        description: "Fresh, organic apples sourced directly from local farms. Perfect for retail stores, restaurants, and cafes looking for high-quality produce.",
        price: "2.50",
        category: "Fresh Produce",
        images: [
          "https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?w=800",
          "https://images.unsplash.com/photo-1568702846914-96b305d2aaeb?w=400"
        ],
        wholesaler: {
          id: "whole_001",
          businessName: "Fresh Valley Farms",
          location: "Kent, UK",
          rating: 4.8,
          totalReviews: 127,
          profileImage: "https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=200",
          phoneNumber: "+44 1234 567890",
          email: "contact@freshvalley.com"
        },
        specifications: {
          "Origin": "Kent, United Kingdom",
          "Variety": "Gala, Braeburn, Cox's Orange Pippin",
          "Organic Certified": "Yes - Soil Association",
          "Shelf Life": "7-14 days when stored properly",
          "Storage": "Cool, dry place or refrigerated",
          "Packaging": "10kg boxes, 20kg crates available"
        },
        availability: "In Stock - Available Now",
        minOrderQuantity: 50,
        views: 1247,
        lastUpdated: new Date().toISOString()
      };

      // Increment view count (in real implementation, would update database)
      
      res.json(product);
    } catch (error) {
      console.error("Error fetching public product:", error);
      res.status(500).json({ message: "Product not found" });
    }
  });

  // Handle product inquiries from public pages
  app.post("/api/public/products/:slug/inquiry", async (req, res) => {
    try {
      const { slug } = req.params;
      const inquiryData = req.body;
      
      // Mock lead creation - in real implementation would:
      // 1. Validate the product exists
      // 2. Create lead in database
      // 3. Send notification to wholesaler
      // 4. Send confirmation email to inquirer
      
      console.log(`New inquiry for product ${slug}:`, inquiryData);
      
      // Mock successful response
      res.json({
        success: true,
        message: "Your inquiry has been sent to the supplier. They will contact you within 24 hours.",
        inquiryId: `inq_${Date.now()}`
      });
    } catch (error) {
      console.error("Error handling product inquiry:", error);
      res.status(500).json({ message: "Failed to submit inquiry" });
    }
  });

  // Get advertising analytics
  app.get("/api/advertising/analytics", requireAuth, async (req: any, res) => {
    try {
      const user = req.user;
      const targetUserId = user.role === 'team_member' ? user.wholesalerId : user.id;

      // Mock analytics data
      const analytics = {
        totalCampaigns: 3,
        activeCampaigns: 2,
        totalBudget: 500.00,
        totalSpent: 223.75,
        totalImpressions: 21400,
        totalClicks: 737,
        totalConversions: 41,
        averageCTR: 3.44,
        averageCPC: 0.30,
        totalROI: 285.5,
        seoPerformance: {
          totalPages: 12,
          totalViews: 3420,
          totalLeads: 28,
          averagePageViews: 285,
          conversionRate: 0.82
        },
        topPerformingCampaigns: [
          {
            name: "Holiday Special Products",
            type: "featured_product",
            spent: 89.50,
            impressions: 12500,
            clicks: 425,
            conversions: 23,
            roi: 156.2
          },
          {
            name: "Fresh Produce Spotlight", 
            type: "category_sponsor",
            spent: 134.25,
            impressions: 8900,
            clicks: 312,
            conversions: 18,
            roi: 128.7
          }
        ]
      };

      res.json(analytics);
    } catch (error) {
      console.error("Error fetching advertising analytics:", error);
      res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

  // ======= END ADVERTISING & PROMOTION ENDPOINTS =======

  // WhatsApp API Routes (Shared Service)

  // Stripe Connect status endpoint for priority alert
  app.get("/api/stripe/connect/status", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUserById(userId);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Check if Stripe Connect is properly configured
      const isConnected = !!(user.stripeAccountId);
      
      // For now, we'll assume payouts are enabled if account is connected
      // Later we can add a proper payouts check via Stripe API
      const hasPayoutsEnabled = isConnected;
      
      res.json({
        isConnected,
        accountId: user.stripeAccountId,
        hasPayoutsEnabled,
        requiresInfo: false // For now, no additional info required
      });
    } catch (error) {
      console.error("Error fetching Stripe Connect status:", error);
      res.status(500).json({ error: "Failed to fetch Stripe Connect status" });
    }
  });

  // WhatsApp status endpoint for priority alert
  app.get("/api/whatsapp/status", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUserById(userId);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Check if WhatsApp is configured (either Twilio or Direct)
      const isConfigured = !!(
        (user.twilioAccountSid && user.twilioAuthToken && user.twilioPhoneNumber) ||
        (user.whatsappBusinessPhoneId && user.whatsappAccessToken && user.whatsappAppId)
      );

      const provider = user.whatsappProvider || 'twilio';
      
      res.json({
        isConfigured,
        provider,
        serviceProvider: provider === 'twilio' ? 'Twilio WhatsApp' : 'WhatsApp Business API',
        twilioAccountSid: user.twilioAccountSid ? "configured" : null,
        twilioAuthToken: user.twilioAuthToken ? "configured" : null, 
        twilioPhoneNumber: user.twilioPhoneNumber,
        whatsappBusinessPhoneId: user.whatsappBusinessPhoneId,
        whatsappAccessToken: user.whatsappAccessToken ? "configured" : null,
        whatsappAppId: user.whatsappAppId,
        whatsappBusinessPhone: user.whatsappBusinessPhone,
        whatsappBusinessName: user.whatsappBusinessName,
        whatsappProvider: user.whatsappProvider
      });
    } catch (error) {
      console.error("Error fetching WhatsApp status:", error);
      res.status(500).json({ error: "Failed to fetch WhatsApp status" });
    }
  });

  app.post('/api/whatsapp/test', requireAuth, async (req: any, res) => {
    try {
      const { testPhoneNumber } = req.body;
      const wholesalerId = req.user.id;

      if (!testPhoneNumber) {
        return res.status(400).json({ 
          success: false,
          error: "Test phone number is required" 
        });
      }

      // Get user configuration
      const user = await storage.getUser(wholesalerId);
      if (!user) {
        return res.status(404).json({ 
          success: false,
          error: "User not found" 
        });
      }

      const result = await whatsappService.testWholesalerWhatsApp(
        wholesalerId,
        testPhoneNumber
      );

      res.json(result);
    } catch (error: any) {
      console.error("Error testing WhatsApp:", error);
      res.status(500).json({ 
        success: false, 
        error: "Failed to test WhatsApp integration" 
      });
    }
  });

  // Twilio WhatsApp configuration routes
  app.post('/api/whatsapp/configure', requireAuth, async (req: any, res) => {
    try {
      const { provider } = req.body;
      const wholesalerId = req.user.id;

      if (provider === 'twilio') {
        const { accountSid, authToken, phoneNumber } = req.body;
        if (!accountSid || !authToken || !phoneNumber) {
          return res.status(400).json({ message: "Twilio Account SID, Auth Token, and phone number are required" });
        }

        // Save Twilio configuration to user settings
        await storage.updateUserSettings(wholesalerId, {
          whatsappProvider: 'twilio',
          twilioAccountSid: accountSid,
          twilioAuthToken: authToken,
          twilioPhoneNumber: phoneNumber,
          whatsappEnabled: true
        });

        res.json({
          success: true,
          message: "Twilio WhatsApp configuration saved successfully"
        });

      } else if (provider === 'direct') {
        const { businessPhoneId, accessToken, appId, businessPhone, businessName } = req.body;
        if (!businessPhoneId || !accessToken || !appId) {
          return res.status(400).json({ message: "Business Phone ID, Access Token, and App ID are required for Direct WhatsApp API" });
        }

        // Save Direct WhatsApp configuration to user settings
        await storage.updateUserSettings(wholesalerId, {
          whatsappProvider: 'direct',
          whatsappBusinessPhoneId: businessPhoneId,
          whatsappAccessToken: accessToken,
          whatsappAppId: appId,
          whatsappBusinessPhone: businessPhone || '',
          whatsappBusinessName: businessName || '',
          whatsappEnabled: true
        });

        res.json({
          success: true,
          message: "Direct WhatsApp Business API configuration saved successfully"
        });

      } else {
        return res.status(400).json({ message: "Provider must be 'twilio' or 'direct'" });
      }
    } catch (error: any) {
      console.error("Error saving Twilio configuration:", error);
      res.status(500).json({ message: "Failed to save Twilio configuration" });
    }
  });

  app.post('/api/whatsapp/verify', requireAuth, async (req: any, res) => {
    try {
      const { provider } = req.body;

      if (provider === 'twilio') {
        const { accountSid, authToken, phoneNumber } = req.body;
        if (!accountSid || !authToken || !phoneNumber) {
          return res.status(400).json({ message: "Twilio Account SID, Auth Token, and phone number are required" });
        }

        // Test Twilio credentials by creating a client
        try {
          const twilioClient = twilio(accountSid, authToken);
          // Test the connection by fetching account info
          const account = await twilioClient.api.v2010.accounts(accountSid).fetch();
          
          res.json({
            success: true,
            message: "Twilio WhatsApp configuration verified successfully",
            data: { accountSid: account.sid, status: account.status }
          });
        } catch (twilioError: any) {
          res.status(400).json({
            success: false,
            message: `Twilio verification failed: ${twilioError.message}`
          });
        }

      } else if (provider === 'direct') {
        const { businessPhoneId, accessToken, appId } = req.body;
        if (!businessPhoneId || !accessToken || !appId) {
          return res.status(400).json({ message: "Business Phone ID, Access Token, and App ID are required" });
        }

        // Test the Direct WhatsApp configuration
        try {
          const { DirectWhatsAppService } = await import('./direct-whatsapp');
          const directService = new DirectWhatsAppService(accessToken, businessPhoneId, appId);
          const verification = await directService.verifyConnection();
          
          if (verification.success) {
            res.json({
              success: true,
              message: "Direct WhatsApp API verified successfully",
              data: { 
                businessName: verification.businessName, 
                phoneNumber: verification.phoneNumber 
              }
            });
          } else {
            res.status(400).json({
              success: false,
              message: "Failed to verify Direct WhatsApp API configuration"
            });
          }
        } catch (directError: any) {
          res.status(400).json({
            success: false,
            message: `Direct WhatsApp API verification failed: ${directError.message}`
          });
        }

      } else {
        return res.status(400).json({ message: "Provider must be 'twilio' or 'direct'" });
      }
    } catch (error: any) {
      console.error("Error verifying Twilio configuration:", error);
      res.status(500).json({ message: "Failed to verify Twilio configuration" });
    }
  });

  app.get('/api/whatsapp/status', requireAuth, async (req: any, res) => {
    try {
      const wholesalerId = req.user.id;
      const user = await storage.getUser(wholesalerId);

      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Check if WhatsApp is properly configured
      const isConfigured = user.whatsappProvider === 'direct' 
        ? !!(user.whatsappBusinessPhoneId && user.whatsappAccessToken && user.whatsappAppId)
        : !!(user.twilioAccountSid && user.twilioAuthToken && user.twilioPhoneNumber);

      res.json({
        enabled: user.whatsappEnabled || false,
        isConfigured, // Frontend expects this field
        provider: user.whatsappProvider || 'twilio',
        whatsappProvider: user.whatsappProvider || 'twilio',
        // Twilio fields
        twilioAccountSid: user.twilioAccountSid || null,
        twilioAuthToken: user.twilioAuthToken ? "configured" : null,
        twilioPhoneNumber: user.twilioPhoneNumber || null,
        // Direct WhatsApp fields
        whatsappBusinessPhoneId: user.whatsappBusinessPhoneId || null,
        whatsappAccessToken: user.whatsappAccessToken ? "configured" : null,
        whatsappAppId: user.whatsappAppId || null,
        whatsappBusinessPhone: user.whatsappBusinessPhone || null,
        whatsappBusinessName: user.whatsappBusinessName || null,
        // Legacy fields
        serviceProvider: user.whatsappProvider === 'direct' ? "Direct WhatsApp Business API" : "Twilio WhatsApp",
        configured: isConfigured // Keep for backward compatibility
      });
    } catch (error: any) {
      console.error("Error fetching WhatsApp status:", error);
      res.status(500).json({ message: "Failed to fetch WhatsApp status" });
    }
  });

  app.post('/api/whatsapp/enable', requireAuth, async (req: any, res) => {
    try {
      const wholesalerId = req.user.id;
      
      // Enable WhatsApp for this user
      await storage.updateUserSettings(wholesalerId, { whatsappEnabled: true });

      res.json({
        success: true,
        message: "WhatsApp integration enabled successfully"
      });
    } catch (error: any) {
      console.error("Error enabling WhatsApp:", error);
      res.status(500).json({ message: "Failed to enable WhatsApp integration" });
    }
  });

  // AI-powered product generation endpoints
  app.post('/api/ai/generate-description', requireAuth, async (req: any, res) => {
    try {
      const { productName, category } = req.body;
      
      if (!productName) {
        return res.status(400).json({ message: "Product name is required" });
      }

      const description = await generateProductDescription(productName, category);
      res.json({ description });
    } catch (error: any) {
      console.error("Error generating description:", error);
      
      // Check if it's a quota/billing issue
      if (error.code === 'insufficient_quota') {
        res.status(402).json({ 
          message: "AI description generation is temporarily unavailable. Please manually enter a product description.",
          fallback: true
        });
      } else {
        res.status(500).json({ 
          message: "Failed to generate description. Please enter manually.",
          fallback: true 
        });
      }
    }
  });

  app.post('/api/ai/generate-image', requireAuth, async (req: any, res) => {
    try {
      const { productName, category, description } = req.body;
      
      if (!productName || productName.trim().length === 0) {
        return res.status(400).json({ message: "Product name is required" });
      }

      // Validate product name doesn't contain problematic content
      const cleanName = productName.trim();
      if (cleanName.length > 100) {
        return res.status(400).json({ message: "Product name is too long (max 100 characters)" });
      }

      const imageUrl = await generateProductImage(cleanName, category, description);
      res.json({ imageUrl });
    } catch (error: any) {
      console.error("Error generating image:", error);
      
      // Provide more specific error messages based on the error type
      if (error.status === 400) {
        res.status(400).json({ 
          message: "Unable to generate image for this product. Try uploading an image or using an image URL instead.",
          fallback: true
        });
      } else if (error.code === 'insufficient_quota') {
        res.status(402).json({ 
          message: "AI image generation is temporarily unavailable. Please upload an image or use an image URL.",
          fallback: true
        });
      } else {
        res.status(500).json({ 
          message: "Image generation service is temporarily unavailable. Please upload an image or use an image URL.",
          fallback: true
        });
      }
    }
  });

  // AI Tagline Generation
  app.post('/api/ai/generate-taglines', requireAuth, async (req: any, res) => {
    try {
      const { businessName, businessDescription, category, targetAudience, style } = req.body;
      
      if (!businessName || businessName.trim().length === 0) {
        return res.status(400).json({ message: "Business name is required" });
      }

      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const prompt = `Generate 5 compelling taglines for a B2B wholesale business with these details:

Business Name: ${businessName}
${businessDescription ? `Description: ${businessDescription}` : ''}
${category ? `Industry/Category: ${category}` : ''}
Target Audience: ${targetAudience}
Style Preference: ${style}

Requirements:
1. Perfect for B2B wholesale businesses
2. Professional and memorable
3. Short (3-8 words ideal)
4. Emphasize quality, trust, and value
5. Appeal to retailers and business buyers
6. Each tagline should be unique and distinct

Return only the taglines, one per line, without numbers or formatting.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are an expert brand copywriter specializing in B2B wholesale taglines. Create memorable, professional taglines that build trust and emphasize value for business customers."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: 300,
        temperature: 0.8,
      });

      const generatedText = response.choices[0].message.content || "";
      const taglines = generatedText
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && !line.match(/^\d+\./))
        .slice(0, 5);

      if (taglines.length === 0) {
        // Fallback taglines if AI response is empty
        const fallbackTaglines = [
          `Quality ${businessName} Products`,
          `Your Trusted Business Partner`,
          `Professional Solutions Delivered`,
          `Excellence in Every Order`,
          `Reliable Wholesale Supply`
        ];
        return res.json({ taglines: fallbackTaglines });
      }
      
      res.json({ taglines });
    } catch (error: any) {
      console.error("Error generating taglines:", error);
      
      // Provide fallback taglines on error
      const fallbackTaglines = [
        `Quality ${req.body.businessName || 'Business'} Products`,
        `Your Trusted Business Partner`,
        `Professional Solutions Delivered`,
        `Excellence in Every Order`,
        `Reliable Wholesale Supply`
      ];
      
      if (error.code === 'insufficient_quota') {
        res.status(200).json({ 
          taglines: fallbackTaglines,
          message: "AI tagline generation temporarily unavailable. Here are some suggested taglines.",
          fallback: true
        });
      } else {
        res.json({ 
          taglines: fallbackTaglines,
          message: "Generated fallback taglines. Try again for AI-powered suggestions.",
          fallback: true
        });
      }
    }
  });

  // Message Template routes
  app.get('/api/message-templates', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const templates = await storage.getMessageTemplates(userId);
      res.json(templates);
    } catch (error) {
      console.error("Error fetching message templates:", error);
      res.status(500).json({ message: "Failed to fetch message templates" });
    }
  });

  app.get('/api/message-templates/:id', requireAuth, async (req: any, res) => {
    try {
      const templateId = parseInt(req.params.id);
      const template = await storage.getMessageTemplate(templateId);
      
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }
      
      res.json(template);
    } catch (error) {
      console.error("Error fetching message template:", error);
      res.status(500).json({ message: "Failed to fetch message template" });
    }
  });

  app.post('/api/message-templates', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { products, ...templateData } = req.body;

      // Validate the template data
      const validatedTemplate = insertMessageTemplateSchema.parse({
        ...templateData,
        wholesalerId: userId,
        status: 'active'
      });

      // Validate the products
      const validatedProducts = products.map((p: any) => 
        insertTemplateProductSchema.parse(p)
      );

      const template = await storage.createMessageTemplate(validatedTemplate, validatedProducts);
      res.json(template);
    } catch (error: any) {
      console.error("Error creating message template:", error);
      if (error.name === 'ZodError') {
        return res.status(400).json({ message: "Invalid template data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create message template" });
    }
  });

  app.patch('/api/message-templates/:id', requireAuth, async (req: any, res) => {
    try {
      const templateId = parseInt(req.params.id);
      const updates = req.body;

      const template = await storage.updateMessageTemplate(templateId, updates);
      res.json(template);
    } catch (error) {
      console.error("Error updating message template:", error);
      res.status(500).json({ message: "Failed to update message template" });
    }
  });

  app.delete('/api/message-templates/:id', requireAuth, async (req: any, res) => {
    try {
      const user = req.user;
      const templateId = parseInt(req.params.id);
      const targetUserId = user.role === 'team_member' ? user.wholesalerId : user.id;
      
      const deleted = await storage.deleteMessageTemplate(templateId, targetUserId);
      if (!deleted) {
        return res.status(404).json({ message: "Template not found" });
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting message template:", error);
      res.status(500).json({ message: "Failed to delete message template" });
    }
  });

  app.post('/api/message-templates/send-campaign', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { templateId, customerGroupId } = req.body;

      // Get the template with products
      const template = await storage.getMessageTemplate(templateId);
      if (!template) {
        return res.status(404).json({ message: "Template not found" });
      }

      // Get customer group members
      const members = await storage.getGroupMembers(customerGroupId);
      
      // Generate marketplace URL for multi-product purchasing
      const baseUrl = 'https://quikpik.app';
      const campaignUrl = `${baseUrl}/marketplace`;

      // Create campaign record
      const campaign = await storage.createTemplateCampaign({
        templateId,
        customerGroupId,
        wholesalerId: userId,
        campaignUrl,
        status: 'sent',
        sentAt: new Date(),
        recipientCount: members.length,
        clickCount: 0,
        orderCount: 0,
        totalRevenue: '0'
      });

      // Send WhatsApp messages to all group members
      try {
        await whatsappService.sendTemplateMessage(template, members, campaignUrl);
      } catch (whatsappError) {
        console.error("WhatsApp sending failed:", whatsappError);
        // Campaign is created but delivery failed - update status
        await storage.updateMessageTemplate(templateId, { status: 'failed' });
        return res.status(500).json({ 
          message: "Campaign created but WhatsApp delivery failed. Please check your WhatsApp settings." 
        });
      }

      res.json({ 
        success: true, 
        campaign,
        message: `Campaign sent to ${members.length} customers`
      });
    } catch (error) {
      console.error("Error sending campaign:", error);
      res.status(500).json({ message: "Failed to send campaign" });
    }
  });

  app.get('/api/template-campaigns', requireAuth, async (req: any, res) => {
    try {
      const user = req.user;
      // Use parent company data for team members
      const targetUserId = user.role === 'team_member' ? user.wholesalerId : user.id;
      const campaigns = await storage.getTemplateCampaigns(targetUserId);
      res.json(campaigns);
    } catch (error) {
      console.error("Error fetching template campaigns:", error);
      res.status(500).json({ message: "Failed to fetch template campaigns" });
    }
  });

  // Unified Campaigns API (merges broadcasts and message templates)
  app.get('/api/campaigns', requireAuth, async (req: any, res) => {
    try {
      const user = req.user;
      // Use parent company data for team members
      const targetUserId = user.role === 'team_member' ? user.wholesalerId : user.id;
      
      // Get both broadcasts and message templates, then unify them
      const [broadcasts, templates] = await Promise.all([
        storage.getBroadcasts(targetUserId),
        storage.getMessageTemplates(targetUserId)
      ]);

      // Get all orders for real order count calculation
      const allOrders = await storage.getOrders(targetUserId);

      // Convert broadcasts to unified campaign format with real order data
      const broadcastCampaigns = await Promise.all(broadcasts.map(async broadcast => {
        let realOrderCount = 0;
        let realRevenue = '0.00';
        
        if (broadcast.sentAt && broadcast.product) {
          // Count orders for this specific product after broadcast was sent
          // Include all completed order statuses, not just 'paid'
          const ordersForProduct = allOrders.filter(order => {
            const orderDate = new Date(order.createdAt || Date.now());
            const broadcastDate = new Date(broadcast.sentAt);
            const validStatuses = ['paid', 'processing', 'shipped', 'delivered', 'fulfilled'];
            return orderDate >= broadcastDate && validStatuses.includes(order.status);
          });

          // Get order items for this specific product
          const productOrders = await Promise.all(
            ordersForProduct.map(async order => {
              const orderItems = await storage.getOrderItems(order.id);
              return orderItems.filter(item => item.productId === broadcast.product.id);
            })
          );

          // Count actual number of orders (not quantities) for this product
          const ordersWithProduct = productOrders.filter(orderItems => orderItems.length > 0);
          realOrderCount = ordersWithProduct.length;
          
          // Calculate total revenue for this product
          realRevenue = productOrders.flat().reduce((sum, item) => {
            return sum + (parseFloat(item.unitPrice) * item.quantity);
          }, 0).toFixed(2);
        }

        // Fetch fresh product data with current promotional offers
        const currentProduct = await storage.getProduct(broadcast.product.id);
        const productToUse = currentProduct || broadcast.product;

        return {
          id: `broadcast_${broadcast.id}`,
          title: `${productToUse.name} Promotion`,
          customMessage: broadcast.message,
          specialPrice: broadcast.specialPrice,
          quantity: broadcast.quantity, // Add the quantity field
          promotionalOffers: (() => {
            try {
              if (!broadcast.promotionalOffers) {
                return [];
              }
              // Handle array objects directly
              if (Array.isArray(broadcast.promotionalOffers)) {
                return broadcast.promotionalOffers;
              }
              // Skip parsing for empty arrays or null strings
              if (broadcast.promotionalOffers === '' || broadcast.promotionalOffers === 'null' || broadcast.promotionalOffers === '[]') {
                return [];
              }
              // Parse string JSON
              if (typeof broadcast.promotionalOffers === 'string') {
                // Don't parse empty strings or arrays
                if (broadcast.promotionalOffers.trim() === '' || broadcast.promotionalOffers === '[]') {
                  return [];
                }
                const parsed = JSON.parse(broadcast.promotionalOffers);
                return Array.isArray(parsed) ? parsed : [];
              }
              return [];
            } catch (e) {
              console.error('Error parsing promotional offers for broadcast:', broadcast.id, 'Data:', broadcast.promotionalOffers, e);
              return [];
            }
          })(),
          includeContact: true,
          includePurchaseLink: true,
          campaignType: 'single' as const,
          status: broadcast.sentAt ? 'sent' : 'draft',
          createdAt: broadcast.createdAt,
          product: {
            ...productToUse,
            // Use current product's promotional offers and pricing, not broadcast's cached ones
          },
          sentCampaigns: broadcast.sentAt ? [{ // Only include if actually sent
            id: broadcast.id,
            sentAt: broadcast.sentAt,
            recipientCount: broadcast.recipientCount || 0,
            clickCount: Math.floor((realOrderCount / Math.max(broadcast.recipientCount || 1, 1)) * (broadcast.recipientCount || 0)), // Estimated based on conversion
            orderCount: realOrderCount, // Real order count from database
            totalRevenue: realRevenue, // Real revenue from database
            customerGroup: broadcast.customerGroup
          }] : []
        };
      }));

      // Convert message templates to unified campaign format with fresh product data
      const templateCampaigns = await Promise.all(templates.map(async template => ({
        id: `template_${template.id}`,
        title: template.title,
        customMessage: template.customMessage,
        includeContact: template.includeContact,
        includePurchaseLink: template.includePurchaseLink,
        campaignType: 'multi' as const,
        status: template.campaigns.length > 0 ? 'sent' : 'draft',
        createdAt: template.createdAt,
        products: await Promise.all(template.products.map(async product => {
          // Fetch fresh product data with current promotional offers
          const currentProduct = await storage.getProduct(product.productId);
          const productToUse = currentProduct || product.product;
          
          return {
            ...product,
            product: {
              ...productToUse,
              // Use current product's promotional offers, not template's cached ones
            },
            promotionalOffers: (() => {
              try {
                if (!product.promotionalOffers || product.promotionalOffers === '' || product.promotionalOffers === 'null' || product.promotionalOffers === '[]') {
                  return [];
                }
                // Handle array objects directly
                if (Array.isArray(product.promotionalOffers)) {
                  return product.promotionalOffers;
                }
                // Parse string JSON - handle double-escaped JSON
                if (typeof product.promotionalOffers === 'string') {
                  let dataToparse = product.promotionalOffers;
                  
                  // Handle double-escaped JSON strings
                  if (dataToparse.startsWith('""') && dataToparse.endsWith('""')) {
                    dataToparse = dataToparse.slice(2, -2).replace(/\\"/g, '"');
                  }
                  
                  const parsed = JSON.parse(dataToparse);
                  return Array.isArray(parsed) ? parsed : [];
                }
                return [];
              } catch (e) {
                console.error('Error parsing promotional offers for template product:', product.id, 'Data:', product.promotionalOffers, e);
                return [];
              }
            })()
          };
        })),
        sentCampaigns: template.campaigns.map(campaign => ({
          id: campaign.id,
          sentAt: campaign.sentAt,
          recipientCount: campaign.recipientCount,
          clickCount: campaign.clickCount,
          orderCount: campaign.orderCount,
          totalRevenue: campaign.totalRevenue,
          customerGroup: campaign.customerGroup
        }))
      })));

      // Combine and sort by creation date
      const allCampaigns = [...broadcastCampaigns, ...templateCampaigns]
        .sort((a, b) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateB - dateA;
        });

      res.json(allCampaigns);
    } catch (error) {
      console.error("Error fetching campaigns:", error);
      res.status(500).json({ message: "Failed to fetch campaigns" });
    }
  });

  // Campaign Analytics API endpoint
  app.get('/api/campaigns/analytics', requireAuth, async (req: any, res) => {
    try {
      const user = req.user;
      const targetUserId = user.role === 'team_member' ? user.wholesalerId : user.id;
      const { timeFilter = '7d', campaignFilter = 'all' } = req.query;

      // Calculate date range based on timeFilter
      const now = new Date();
      let fromDate = new Date();
      
      switch (timeFilter) {
        case '1d':
          fromDate.setDate(now.getDate() - 1);
          break;
        case '7d':
          fromDate.setDate(now.getDate() - 7);
          break;
        case '30d':
          fromDate.setDate(now.getDate() - 30);
          break;
        case '90d':
          fromDate.setDate(now.getDate() - 90);
          break;
        case 'all':
        default:
          fromDate = new Date(2020, 0, 1); // Far back date for "all time"
          break;
      }

      // Get campaigns and analytics data
      const [broadcasts, templates, allOrders] = await Promise.all([
        storage.getBroadcasts(targetUserId),
        storage.getMessageTemplates(targetUserId),
        storage.getOrders(targetUserId)
      ]);

      // Filter campaigns by date and type
      const filteredBroadcasts = broadcasts.filter(broadcast => {
        const created = new Date(broadcast.createdAt);
        const isInTimeRange = created >= fromDate;
        
        if (campaignFilter === 'promotional') {
          try {
            const hasOffers = broadcast.promotionalOffers && 
              broadcast.promotionalOffers !== '[]' && 
              broadcast.promotionalOffers !== 'null' &&
              broadcast.promotionalOffers.length > 0;
            return isInTimeRange && hasOffers;
          } catch (e) {
            return false;
          }
        }
        if (campaignFilter === 'single') return isInTimeRange;
        return isInTimeRange; // 'all' case
      });

      const filteredTemplates = templates.filter(template => {
        const created = new Date(template.createdAt);
        const isInTimeRange = created >= fromDate;
        
        if (campaignFilter === 'promotional') {
          const hasOffers = template.products.some(p => {
            try {
              return p.promotionalOffers && 
                p.promotionalOffers !== '[]' && 
                p.promotionalOffers !== 'null' &&
                p.promotionalOffers.length > 0;
            } catch (e) {
              return false;
            }
          });
          return isInTimeRange && hasOffers;
        }
        if (campaignFilter === 'multi') return isInTimeRange;
        return isInTimeRange; // 'all' case
      });

      // Calculate performance metrics
      let totalRecipients = 0;
      let totalViews = 0;
      let totalClicks = 0;
      let totalOrders = 0;
      let totalRevenue = 0;

      // Calculate metrics from broadcast campaigns
      for (const broadcast of filteredBroadcasts) {
        if (broadcast.sentAt) {
          totalRecipients += broadcast.recipientCount || 0;
          
          // Calculate real order metrics for this broadcast
          const broadcastDate = new Date(broadcast.sentAt);
          const ordersForProduct = allOrders.filter(order => {
            const orderDate = new Date(order.createdAt);
            const validStatuses = ['paid', 'processing', 'shipped', 'delivered', 'fulfilled'];
            return orderDate >= broadcastDate && validStatuses.includes(order.status);
          });

          // Get order items for this specific product
          const productOrders = await Promise.all(
            ordersForProduct.map(async order => {
              const orderItems = await storage.getOrderItems(order.id);
              return orderItems.filter(item => item.productId === broadcast.product?.id);
            })
          );

          const ordersWithProduct = productOrders.filter(orderItems => orderItems.length > 0);
          const broadcastOrderCount = ordersWithProduct.length;
          const broadcastRevenue = productOrders.flat().reduce((sum, item) => {
            return sum + (parseFloat(item.unitPrice) * item.quantity);
          }, 0);

          totalOrders += broadcastOrderCount;
          totalRevenue += broadcastRevenue;
          
          // Estimate clicks and views based on conversion data
          totalClicks += Math.ceil(broadcastOrderCount * 1.5); // Assume 67% conversion from clicks
          totalViews += Math.ceil((broadcast.recipientCount || 0) * 0.6); // Assume 60% view rate
        }
      }

      // Calculate metrics from template campaigns
      for (const template of filteredTemplates) {
        for (const campaign of template.campaigns || []) {
          if (campaign.sentAt) {
            totalRecipients += campaign.recipientCount || 0;
            totalOrders += campaign.orderCount || 0;
            totalRevenue += parseFloat(campaign.totalRevenue || '0');
            totalClicks += campaign.clickCount || 0;
            totalViews += Math.ceil((campaign.recipientCount || 0) * 0.6); // Estimate 60% view rate
          }
        }
      }

      // Calculate rates
      const averageConversionRate = totalRecipients > 0 ? (totalOrders / totalRecipients) * 100 : 0;
      const averageClickRate = totalRecipients > 0 ? (totalClicks / totalRecipients) * 100 : 0;

      // Find best performing campaign
      let bestPerformingCampaign = null;
      let bestRevenue = 0;

      // Check broadcasts
      for (const broadcast of filteredBroadcasts) {
        if (broadcast.sentAt) {
          const broadcastDate = new Date(broadcast.sentAt);
          const ordersForProduct = allOrders.filter(order => {
            const orderDate = new Date(order.createdAt);
            const validStatuses = ['paid', 'processing', 'shipped', 'delivered', 'fulfilled'];
            return orderDate >= broadcastDate && validStatuses.includes(order.status);
          });

          const productOrders = await Promise.all(
            ordersForProduct.map(async order => {
              const orderItems = await storage.getOrderItems(order.id);
              return orderItems.filter(item => item.productId === broadcast.product?.id);
            })
          );

          const revenue = productOrders.flat().reduce((sum, item) => {
            return sum + (parseFloat(item.unitPrice) * item.quantity);
          }, 0);

          if (revenue > bestRevenue) {
            bestRevenue = revenue;
            bestPerformingCampaign = {
              id: `broadcast_${broadcast.id}`,
              title: `${broadcast.product?.name} Promotion`,
              revenue: revenue,
              type: 'single'
            };
          }
        }
      }

      // Check template campaigns
      for (const template of filteredTemplates) {
        for (const campaign of template.campaigns || []) {
          const revenue = parseFloat(campaign.totalRevenue || '0');
          if (revenue > bestRevenue) {
            bestRevenue = revenue;
            bestPerformingCampaign = {
              id: `template_${template.id}`,
              title: template.title,
              revenue: revenue,
              type: 'multi'
            };
          }
        }
      }

      const performanceData = {
        totalCampaigns: filteredBroadcasts.length + filteredTemplates.length,
        activeCampaigns: filteredBroadcasts.filter(b => b.sentAt).length + 
                         filteredTemplates.reduce((sum, t) => sum + (t.campaigns?.filter(c => c.sentAt).length || 0), 0),
        totalRecipients,
        totalViews,
        totalClicks,
        totalOrders,
        totalRevenue,
        averageConversionRate: Math.round(averageConversionRate * 100) / 100,
        averageClickRate: Math.round(averageClickRate * 100) / 100,
        bestPerformingCampaign,
        recentPerformance: [] // Could be expanded with detailed trend data
      };

      res.json(performanceData);
    } catch (error) {
      console.error("Error fetching campaign analytics:", error);
      res.status(500).json({ message: "Failed to fetch campaign analytics" });
    }
  });

  app.post('/api/campaigns', requireAuth, async (req: any, res) => {
    try {
      const user = req.user;
      // Use parent company data for team members
      const targetUserId = user.role === 'team_member' ? user.wholesalerId : user.id;
      const { campaignType, productId, products, specialPrice, quantity, promotionalOffers, ...campaignData } = req.body;

      if (campaignType === 'single') {
        // Create a broadcast for single product
        const broadcastData = {
          wholesalerId: targetUserId,
          productId: productId,
          customerGroupId: 1, // Default customer group
          message: campaignData.customMessage || '',
          specialPrice: specialPrice || null,
          quantity: quantity || 1,
          promotionalOffers: promotionalOffers ? JSON.stringify(promotionalOffers) : null,
          status: 'draft',
          recipientCount: 0
        };

        const broadcast = await storage.createBroadcast(broadcastData);
        
        res.json({
          id: `broadcast_${broadcast.id}`,
          ...campaignData,
          campaignType: 'single',
          status: 'draft',
          createdAt: broadcast.createdAt
        });
      } else {
        // Create a message template for multi-product
        const templateData = {
          name: campaignData.title,
          title: campaignData.title,
          description: campaignData.customMessage || '',
          wholesalerId: targetUserId,
          status: 'active'
        };

        const validatedProducts = products.map((p: any) => ({
          productId: p.productId,
          quantity: p.quantity,
          specialPrice: p.specialPrice,
          promotionalOffers: p.promotionalOffers ? JSON.stringify(p.promotionalOffers) : null
        }));

        const template = await storage.createMessageTemplate(templateData, validatedProducts);
        
        res.json({
          id: `template_${template.id}`,
          ...campaignData,
          campaignType: 'multi',
          status: 'draft',
          createdAt: template.createdAt
        });
      }
    } catch (error: any) {
      console.error("Error creating campaign:", error);
      res.status(500).json({ message: "Failed to create campaign" });
    }
  });

  // Update campaign endpoint
  app.put('/api/campaigns/:id', requireAuth, async (req: any, res) => {
    try {
      const user = req.user;
      const campaignId = req.params.id;
      const targetUserId = user.role === 'team_member' ? user.wholesalerId : user.id;
      const { campaignType, productId, products, specialPrice, promotionalOffers, ...campaignData } = req.body;

      console.log('Campaign update request body:', { 
        campaignType, 
        productId, 
        products: products ? products.length : 0, 
        specialPrice, 
        promotionalOffers, 
        campaignData 
      });

      // Parse campaign ID to determine type
      const [type, numericId] = campaignId.split('_');
      const id = parseInt(numericId);
      
      console.log('Campaign ID parsing:', { campaignId, type, numericId, id });
      
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid campaign ID format" });
      }

      if (campaignType === 'single') {
        if (type === 'broadcast') {
          // Update broadcast
          const updateData = {
            ...campaignData,
            specialPrice: specialPrice || null,
            productId: productId,
            promotionalOffers: promotionalOffers ? JSON.stringify(promotionalOffers) : null,
          };
          
          const updatedBroadcast = await storage.updateBroadcast(id, updateData);
          if (!updatedBroadcast) {
            return res.status(404).json({ message: "Campaign not found" });
          }
          
          res.json(updatedBroadcast);
        } else {
          return res.status(404).json({ message: "Campaign not found" });
        }
      } else if (campaignType === 'multi') {
        if (type === 'template') {
          // Update template campaign - exclude the string ID from updateData
          const { id: excludedId, ...cleanCampaignData } = campaignData;
          const updateData = {
            ...cleanCampaignData,
          };
          
          console.log('Calling updateMessageTemplate with:', { id, updateData });
          const updatedTemplate = await storage.updateMessageTemplate(id, updateData);
          if (!updatedTemplate) {
            return res.status(404).json({ message: "Campaign not found" });
          }

          // Update template products if provided
          if (products && products.length > 0) {
            console.log('Products array for template update:', JSON.stringify(products, null, 2));
            
            // First delete existing template products
            await storage.deleteTemplateProducts(id);
            
            // Then add new ones
            for (const product of products) {
              console.log('Creating template product:', {
                templateId: id,
                productId: product.productId,
                quantity: product.quantity,
                specialPrice: product.specialPrice || null,
                promotionalOffers: product.promotionalOffers,
                promotionalOffersStringified: product.promotionalOffers ? JSON.stringify(product.promotionalOffers) : null,
              });
              
              await storage.createTemplateProduct({
                templateId: id,
                productId: product.productId,
                quantity: product.quantity,
                specialPrice: product.specialPrice || null,
                promotionalOffers: product.promotionalOffers ? JSON.stringify(product.promotionalOffers) : null,
              });
            }
          }
          
          res.json(updatedTemplate);
        } else {
          return res.status(404).json({ message: "Campaign not found" });
        }
      } else {
        return res.status(400).json({ message: "Invalid campaign type" });
      }
    } catch (error) {
      console.error("Error updating campaign:", error);
      res.status(500).json({ message: "Failed to update campaign" });
    }
  });

  // Delete campaign endpoint
  app.delete('/api/campaigns/:id', requireAuth, async (req: any, res) => {
    try {
      const user = req.user;
      const campaignId = req.params.id;
      const targetUserId = user.role === 'team_member' ? user.wholesalerId : user.id;

      // Parse campaign ID to determine type
      const [type, numericId] = campaignId.split('_');
      const id = parseInt(numericId);
      
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid campaign ID format" });
      }

      if (type === 'broadcast') {
        // Delete broadcast
        const deleted = await storage.deleteBroadcast(id, targetUserId);
        if (!deleted) {
          return res.status(404).json({ message: "Campaign not found" });
        }
        
        res.json({ message: "Campaign deleted successfully" });
      } else if (type === 'template') {
        // Delete message template
        const deleted = await storage.deleteMessageTemplate(id, targetUserId);
        if (!deleted) {
          return res.status(404).json({ message: "Campaign not found" });
        }
        
        res.json({ message: "Campaign deleted successfully" });
      } else {
        return res.status(400).json({ message: "Invalid campaign type" });
      }
    } catch (error) {
      console.error("Error deleting campaign:", error);
      res.status(500).json({ message: "Failed to delete campaign" });
    }
  });

  app.post('/api/campaigns/send', requireAuth, async (req: any, res) => {
    try {
      const user = req.user;
      // Use parent company data for team members
      const targetUserId = user.role === 'team_member' ? user.wholesalerId : user.id;
      const { campaignId, customerGroupId, customMessage } = req.body;
      console.log(`Campaign send request: userId=${targetUserId}, campaignId=${campaignId}, customerGroupId=${customerGroupId}`);

      // Check broadcast limits based on subscription tier
      const userAccount = await storage.getUser(targetUserId);
      if (!userAccount) {
        return res.status(404).json({ message: "User not found" });
      }

      const subscriptionTier = userAccount.subscriptionTier || "free";
      const broadcastLimit = getBroadcastLimit(subscriptionTier);
      
      // Only check limits if not unlimited (premium)
      if (broadcastLimit !== -1) {
        // Get broadcast count for current month
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        
        const monthlyBroadcastCount = await storage.getBroadcastCountForPeriod(targetUserId, monthStart, monthEnd);
        
        if (monthlyBroadcastCount >= broadcastLimit) {
          return res.status(403).json({ 
            message: `Monthly broadcast limit reached! You've sent ${monthlyBroadcastCount}/${broadcastLimit} broadcasts this month on the ${subscriptionTier} plan.`,
            error: "broadcast_limit_exceeded",
            currentCount: monthlyBroadcastCount,
            limit: broadcastLimit,
            subscriptionTier
          });
        }
      }

      const [type, id] = campaignId.split('_');
      const numericId = parseInt(id);
      console.log(`Campaign type: ${type}, numericId: ${numericId}`);

      if (type === 'broadcast') {
        // Get the broadcast to find the product ID
        const broadcasts = await storage.getBroadcasts(targetUserId);
        const broadcast = broadcasts.find(b => b.id === numericId);
        
        if (!broadcast) {
          return res.status(404).json({ message: "Broadcast not found" });
        }

        // Send single product broadcast with custom message if provided
        const messageToSend = customMessage || broadcast.message;
        console.log(`Broadcasting: userId=${targetUserId}, productId=${broadcast.product.id}, groupId=${customerGroupId}`);
        
        // Parse promotional offers from broadcast data
        let promotionalOffers = [];
        try {
          if (broadcast.promotionalOffers) {
            promotionalOffers = JSON.parse(broadcast.promotionalOffers);
          }
        } catch (e) {
          console.error('Error parsing promotional offers:', e);
          promotionalOffers = [];
        }
        
        const result = await whatsappService.sendProductBroadcast(
          targetUserId,
          broadcast.product.id, // Use the actual product ID
          customerGroupId,
          messageToSend, // Use custom message or original message
          promotionalOffers // Pass promotional offers
        );

        if (result.success) {
          // Update broadcast status
          await storage.updateBroadcastStatus(
            numericId,
            'sent',
            new Date(),
            result.recipientCount || 0,
            result.messageId
          );
          
          // Apply promotional offers to the actual product so they show in customer portal
          if (promotionalOffers && promotionalOffers.length > 0) {
            try {
              console.log(`🎯 Applying ${promotionalOffers.length} promotional offers to product ${broadcast.product.id}:`, promotionalOffers);
              await storage.updateProductPromotionalOffers(broadcast.product.id, promotionalOffers);
              console.log(`✅ Applied ${promotionalOffers.length} promotional offers to product ${broadcast.product.id}`);
            } catch (error) {
              console.error('❌ Error applying promotional offers to product:', error);
            }
          } else {
            console.log(`ℹ️ No promotional offers to apply for product ${broadcast.product.id}. Raw data:`, broadcast.promotionalOffers);
          }
        }

        res.json({
          success: result.success,
          message: result.success ? `Broadcast sent to ${result.recipientCount || 0} customers` : result.error
        });
      } else if (type === 'template') {
        console.log(`🔍 Processing template campaign ${numericId}...`);
        // Send multi-product template
        const template = await storage.getMessageTemplate(numericId);
        if (!template) {
          return res.status(404).json({ message: "Template not found" });
        }

        const members = await storage.getGroupMembers(customerGroupId);
        // Generate marketplace URL for multi-product purchasing
        const baseUrl = 'https://quikpik.app';
        const campaignUrl = `${baseUrl}/marketplace`;

        // Create campaign record
        await storage.createTemplateCampaign({
          templateId: numericId,
          customerGroupId,
          wholesalerId: targetUserId,
          campaignUrl,
          status: 'sent',
          sentAt: new Date(),
          recipientCount: members.length,
          clickCount: 0,
          orderCount: 0,
          totalRevenue: '0'
        });

        console.log(`📤 Sending template message to ${members.length} members...`);
        const result = await whatsappService.sendTemplateMessage(template, members, campaignUrl, customMessage);
        console.log(`📤 WhatsApp result:`, { success: result.success, error: result.error });
        console.log(`📤 Template products count:`, template.products?.length || 0);
        
        // Apply promotional offers from template products to actual products
        if (result.success && template.products) {
          console.log(`🎯 Starting promotional offers application for ${template.products.length} products...`);
          for (const templateProduct of template.products) {
            try {
              // Parse promotional offers from template product
              let promotionalOffers = [];
              console.log(`📋 Raw promotional offers data for product ${templateProduct.productId}:`, templateProduct.promotionalOffers);
              
              if (templateProduct.promotionalOffers) {
                try {
                  let dataToparse = templateProduct.promotionalOffers;
                  console.log(`📋 Initial data type: ${typeof dataToparse}, value:`, dataToparse);
                  
                  if (typeof dataToparse === 'string') {
                    // Handle triple-escaped JSON strings like """[{...}]"""
                    if (dataToparse.startsWith('"""') && dataToparse.endsWith('"""')) {
                      console.log('📋 Detected triple-escaped JSON, fixing...');
                      dataToparse = dataToparse.slice(3, -3).replace(/\\"/g, '"');
                      console.log('📋 After triple-escape fix:', dataToparse);
                    }
                    // Handle double-escaped JSON strings
                    else if (dataToparse.startsWith('""') && dataToparse.endsWith('""')) {
                      console.log('📋 Detected double-escaped JSON, fixing...');
                      dataToparse = dataToparse.slice(2, -2).replace(/\\"/g, '"');
                      console.log('📋 After double-escape fix:', dataToparse);
                    }
                    
                    promotionalOffers = JSON.parse(dataToparse);
                    console.log(`📋 Successfully parsed promotional offers:`, promotionalOffers);
                    
                    if (!Array.isArray(promotionalOffers)) {
                      console.log('📋 Warning: Parsed data is not an array, converting to empty array');
                      promotionalOffers = [];
                    }
                  } else if (Array.isArray(dataToparse)) {
                    promotionalOffers = dataToparse;
                    console.log('📋 Data is already an array:', promotionalOffers);
                  }
                } catch (e) {
                  console.error('❌ Error parsing promotional offers for template product:', templateProduct.productId, e);
                  console.error('❌ Failed data was:', templateProduct.promotionalOffers);
                  promotionalOffers = [];
                }
              } else {
                console.log(`📋 No promotional offers data for product ${templateProduct.productId}`);
              }
              
              // Apply promotional offers to the actual product
              if (promotionalOffers.length > 0) {
                console.log(`🎯 Applying ${promotionalOffers.length} promotional offers to product ${templateProduct.productId}:`, promotionalOffers);
                await storage.updateProductPromotionalOffers(templateProduct.productId, promotionalOffers);
                console.log(`✅ Applied ${promotionalOffers.length} promotional offers to product ${templateProduct.productId} from template campaign`);
              } else {
                console.log(`ℹ️ No promotional offers to apply for product ${templateProduct.productId}. Raw data:`, templateProduct.promotionalOffers);
              }
            } catch (error) {
              console.error(`Error applying promotional offers to product ${templateProduct.productId}:`, error);
            }
          }
        }
        
        res.json({
          success: result.success,
          message: result.success ? `Campaign sent to ${members.length} customers` : result.error
        });
      } else {
        res.status(400).json({ message: "Invalid campaign type" });
      }
    } catch (error) {
      console.error("Error sending campaign:", error);
      res.status(500).json({ message: "Failed to send campaign" });
    }
  });

  // Campaign preview endpoint - generate preview message without sending
  app.get('/api/campaigns/:id/preview', async (req, res) => {
    try {
      const campaignId = req.params.id;
      const [type, id] = campaignId.split('_');
      const numericId = parseInt(id);

      if (type === 'broadcast') {
        // Preview single product broadcast
        const product = await storage.getProduct(numericId);
        if (!product) {
          return res.status(404).json({ message: "Product not found" });
        }

        const wholesaler = await storage.getUser(product.wholesalerId);
        if (!wholesaler) {
          return res.status(404).json({ message: "Wholesaler not found" });
        }

        const message = whatsappService.generateProductMessage(product, undefined, wholesaler);
        
        res.json({
          type: 'single',
          title: `${product.name} Promotion`,
          message,
          product,
          wholesaler: {
            businessName: wholesaler.businessName,
            businessPhone: wholesaler.businessPhone || wholesaler.phoneNumber
          }
        });
      } else if (type === 'template') {
        // Preview multi-product template
        const template = await storage.getMessageTemplate(numericId);
        if (!template) {
          return res.status(404).json({ message: "Template not found" });
        }

        const wholesaler = await storage.getUser(template.wholesalerId);
        if (!wholesaler) {
          return res.status(404).json({ message: "Wholesaler not found" });
        }

        const baseUrl = 'https://quikpik.app';
        const campaignUrl = `${baseUrl}/marketplace?campaign=${Date.now()}${numericId}`;
        
        const message = whatsappService.generateTemplateMessage(template, wholesaler, campaignUrl);
        
        res.json({
          type: 'multi',
          title: template.title,
          message,
          template,
          wholesaler: {
            businessName: wholesaler.businessName,
            businessPhone: wholesaler.businessPhone || wholesaler.phoneNumber
          },
          campaignUrl
        });
      } else {
        res.status(400).json({ message: "Invalid campaign type" });
      }
    } catch (error) {
      console.error("Error generating campaign preview:", error);
      res.status(500).json({ message: "Failed to generate preview" });
    }
  });

  // Stock update refresh endpoint - resend campaign with current stock information
  app.post('/api/campaigns/:id/refresh-stock', requireAuth, async (req: any, res) => {
    try {
      const campaignId = req.params.id;
      const user = req.user;
      // Use parent company data for team members
      const targetUserId = user.role === 'team_member' ? user.wholesalerId : user.id;
      // No customer group needed for stock refresh - just update the data

      // Determine campaign type and get details
      const [type, numericId] = campaignId.split('_');
      const campaignNumericId = parseInt(numericId);

      if (type === 'broadcast') {
        // Handle single product stock update
        const broadcast = await storage.getBroadcasts(targetUserId).then(broadcasts => 
          broadcasts.find(b => b.id === campaignNumericId)
        );
        
        if (!broadcast || broadcast.wholesalerId !== targetUserId) {
          return res.status(404).json({ message: "Campaign not found" });
        }

        // Get updated product information
        const product = await storage.getProduct(broadcast.productId);
        if (!product) {
          return res.status(404).json({ message: "Product not found" });
        }

        // Just refresh the stock information without sending messages
        // This updates the campaign's internal data with current stock levels
        
        res.json({
          success: true,
          message: `Stock information refreshed for ${product.name}`,
          currentStock: product.stock,
          currentPrice: product.price,
          updateType: 'stock_refresh_only'
        });

      } else if (type === 'template') {
        // Handle multi-product stock update
        const template = await storage.getMessageTemplate(campaignNumericId);
        if (!template || template.wholesalerId !== targetUserId) {
          return res.status(404).json({ message: "Template not found" });
        }

        // Just refresh the stock information without sending messages
        // This updates the template's internal data with current stock levels
        
        const stockSummary = template.products.map(item => ({
          name: item.product.name,
          currentStock: item.product.stock,
          currentPrice: item.specialPrice || item.product.price
        }));
        
        res.json({
          success: true,
          message: `Stock information refreshed for ${template.name}`,
          products: stockSummary,
          updateType: 'stock_refresh_only'
        });

      } else {
        res.status(400).json({ message: "Invalid campaign type" });
      }
    } catch (error) {
      console.error("Error refreshing campaign stock:", error);
      res.status(500).json({ message: "Failed to refresh campaign stock" });
    }
  });

  // Stripe Invoice API endpoints for financials
  app.get('/api/stripe/invoices', requireAuth, async (req: any, res) => {
    try {
      if (!stripe) {
        return res.status(500).json({ message: "Stripe not configured" });
      }

      const userId = req.user.id;
      const { search, status, date_range } = req.query;

      // Get user's Stripe Connect account ID
      const user = await storage.getUser(userId);
      if (!user?.stripeAccountId) {
        return res.json([]);
      }

      // Build Stripe query parameters
      const stripeParams: any = {
        limit: 100,
        expand: ['data.customer'],
      };

      if (status && status !== 'all') {
        stripeParams.status = status;
      }

      if (date_range && date_range !== 'all') {
        const now = new Date();
        let created_gte;
        
        switch (date_range) {
          case 'today':
            created_gte = Math.floor(new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000);
            break;
          case 'week':
            created_gte = Math.floor(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).getTime() / 1000);
            break;
          case 'month':
            created_gte = Math.floor(new Date(now.getFullYear(), now.getMonth(), 1).getTime() / 1000);
            break;
          case 'quarter':
            const quarterStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
            created_gte = Math.floor(quarterStart.getTime() / 1000);
            break;
          case 'year':
            created_gte = Math.floor(new Date(now.getFullYear(), 0, 1).getTime() / 1000);
            break;
        }
        
        if (created_gte) {
          stripeParams.created = { gte: created_gte };
        }
      }

      // Fetch invoices from Stripe Connect account
      const invoices = await stripe.invoices.list(stripeParams, {
        stripeAccount: user.stripeAccountId,
      });

      // Filter by search term if provided
      let filteredInvoices = invoices.data;
      if (search) {
        const searchLower = search.toString().toLowerCase();
        filteredInvoices = invoices.data.filter(invoice => 
          invoice.number?.toLowerCase().includes(searchLower) ||
          invoice.customer_name?.toLowerCase().includes(searchLower) ||
          invoice.customer_email?.toLowerCase().includes(searchLower)
        );
      }

      // Format invoices for frontend
      const formattedInvoices = filteredInvoices.map(invoice => ({
        id: invoice.id,
        number: invoice.number,
        status: invoice.status,
        amount_due: invoice.amount_due,
        amount_paid: invoice.amount_paid,
        amount_remaining: invoice.amount_remaining,
        currency: invoice.currency,
        created: invoice.created,
        due_date: invoice.due_date,
        customer_name: invoice.customer_name,
        customer_email: invoice.customer_email,
        description: invoice.description,
        hosted_invoice_url: invoice.hosted_invoice_url,
        invoice_pdf: invoice.invoice_pdf,
      }));

      res.json(formattedInvoices);
    } catch (error) {
      console.error("Error fetching invoices:", error);
      res.status(500).json({ message: "Failed to fetch invoices" });
    }
  });

  app.get('/api/stripe/financial-summary', requireAuth, async (req: any, res) => {
    try {
      if (!stripe) {
        return res.status(500).json({ message: "Stripe not configured" });
      }

      const userId = req.user.id;
      const user = await storage.getUser(userId);
      
      if (!user?.stripeAccountId) {
        return res.json({
          totalRevenue: 0,
          revenueChange: 0,
          paidInvoices: 0,
          paidInvoicesChange: 0,
          pendingAmount: 0,
          pendingCount: 0,
          platformFees: 0
        });
      }

      // Get current month and last month dates
      const now = new Date();
      const currentMonthStart = Math.floor(new Date(now.getFullYear(), now.getMonth(), 1).getTime() / 1000);
      const lastMonthStart = Math.floor(new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime() / 1000);
      const lastMonthEnd = currentMonthStart - 1;

      // Fetch current month invoices
      const currentMonthInvoices = await stripe.invoices.list({
        created: { gte: currentMonthStart },
        limit: 100
      }, {
        stripeAccount: user.stripeAccountId,
      });

      // Fetch last month invoices for comparison
      const lastMonthInvoices = await stripe.invoices.list({
        created: { gte: lastMonthStart, lte: lastMonthEnd },
        limit: 100
      }, {
        stripeAccount: user.stripeAccountId,
      });

      // Calculate current month metrics
      const currentRevenue = currentMonthInvoices.data
        .filter(inv => inv.status === 'paid')
        .reduce((sum, inv) => sum + inv.amount_paid, 0) / 100;

      const currentPaidCount = currentMonthInvoices.data
        .filter(inv => inv.status === 'paid').length;

      // Calculate last month metrics for comparison
      const lastRevenue = lastMonthInvoices.data
        .filter(inv => inv.status === 'paid')
        .reduce((sum, inv) => sum + inv.amount_paid, 0) / 100;

      const lastPaidCount = lastMonthInvoices.data
        .filter(inv => inv.status === 'paid').length;

      // Calculate pending amounts
      const pendingInvoices = currentMonthInvoices.data.filter(inv => inv.status === 'open');
      const pendingAmount = pendingInvoices.reduce((sum, inv) => sum + inv.amount_due, 0) / 100;

      // Calculate changes
      const revenueChange = lastRevenue > 0 ? ((currentRevenue - lastRevenue) / lastRevenue * 100) : 0;
      const paidInvoicesChange = lastPaidCount > 0 ? ((currentPaidCount - lastPaidCount) / lastPaidCount * 100) : 0;

      // Platform fees (5% of total revenue)
      const platformFees = currentRevenue * 0.05;

      res.json({
        totalRevenue: currentRevenue,
        revenueChange: Math.round(revenueChange * 10) / 10,
        paidInvoices: currentPaidCount,
        paidInvoicesChange: Math.round(paidInvoicesChange * 10) / 10,
        pendingAmount,
        pendingCount: pendingInvoices.length,
        platformFees: Math.round(platformFees * 100) / 100
      });
    } catch (error) {
      console.error("Error fetching financial summary:", error);
      res.status(500).json({ message: "Failed to fetch financial summary" });
    }
  });

  app.get('/api/stripe/invoices/:invoiceId/download', requireAuth, async (req: any, res) => {
    try {
      if (!stripe) {
        return res.status(500).json({ message: "Stripe not configured" });
      }

      const userId = req.user.id;
      const { invoiceId } = req.params;

      const user = await storage.getUser(userId);
      if (!user?.stripeAccountId) {
        return res.status(404).json({ message: "Stripe account not found" });
      }

      // Get invoice from Stripe
      const invoice = await stripe.invoices.retrieve(invoiceId, {
        stripeAccount: user.stripeAccountId,
      });

      if (!invoice.invoice_pdf) {
        return res.status(404).json({ message: "Invoice PDF not available" });
      }

      // Fetch the PDF
      const response = await fetch(invoice.invoice_pdf);
      if (!response.ok) {
        throw new Error('Failed to fetch invoice PDF');
      }

      const buffer = await response.arrayBuffer();
      
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="invoice-${invoice.number}.pdf"`,
        'Content-Length': buffer.byteLength.toString()
      });

      res.send(Buffer.from(buffer));
    } catch (error) {
      console.error("Error downloading invoice:", error);
      res.status(500).json({ message: "Failed to download invoice" });
    }
  });

  // Financial Health Analysis API endpoints
  app.get('/api/financial-health', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const period = req.query.period || '3months';
      
      // Get comprehensive financial data
      const [stats, orders, products] = await Promise.all([
        storage.getWholesalerStats(userId),
        storage.getOrders(userId),
        storage.getProducts(userId)
      ]);

      // Calculate key metrics using actual order data
      const totalRevenue = stats.totalRevenue || 0;
      const totalCosts = orders.reduce((sum: number, order: any) => {
        return sum + (parseFloat(order.total) * 0.7);
      }, 0); // Estimated costs
      const profitMargin = totalRevenue > 0 ? ((totalRevenue - totalCosts) / totalRevenue * 100) : 0;
      const revenueGrowth = 12.5; // Default growth rate for demo
      
      // Calculate customer metrics
      const uniqueCustomers = new Set(orders.map((o: any) => o.retailerId)).size;
      const avgOrderValue = orders.length > 0 ? totalRevenue / orders.length : 0;
      const customerLifetimeValue = avgOrderValue * 3; // Simplified LTV calculation
      const customerAcquisitionCost = uniqueCustomers > 0 ? (totalRevenue * 0.1) / uniqueCustomers : 0;
      
      // Calculate burn rate (monthly expenses)
      const monthlyBurnRate = totalCosts / 3; // Simplified monthly burn
      const monthsOfRunway = monthlyBurnRate > 0 ? (totalRevenue - totalCosts) / monthlyBurnRate : 12;

      // Calculate health score components
      const revenueScore = Math.min(90, Math.max(10, revenueGrowth + 50));
      const profitabilityScore = Math.min(90, Math.max(10, profitMargin * 2));
      const cashFlowScore = Math.min(90, Math.max(10, monthsOfRunway * 10));
      const growthScore = Math.min(90, Math.max(10, (orders.length / 30) * 20 + 40));
      const efficiencyScore = Math.min(90, Math.max(10, (products.filter((p: any) => p.status === 'active').length / Math.max(products.length, 1)) * 100));

      const healthScore = Math.round((revenueScore + profitabilityScore + cashFlowScore + growthScore + efficiencyScore) / 5);

      // Generate AI insights (simplified for demo)
      const insights = {
        summary: `Your business shows ${healthScore >= 70 ? 'strong' : healthScore >= 50 ? 'moderate' : 'concerning'} financial health with a score of ${healthScore}/100. ${totalRevenue > 1000 ? 'Revenue performance is solid' : 'Focus on revenue growth opportunities'}.`,
        recommendations: [
          "Optimize pricing strategy for better profit margins",
          "Expand product offerings in high-demand categories", 
          "Implement customer retention programs",
          "Automate order processing to reduce costs"
        ],
        warnings: monthsOfRunway < 6 ? [
          "Cash flow runway below 6 months - monitor expenses closely",
          "Consider diversifying revenue streams"
        ] : [
          "Monitor seasonal sales fluctuations"
        ],
        opportunities: [
          "WhatsApp marketing showing 25% higher engagement",
          "Bulk order discounts could increase average order value",
          "Premium subscription features available"
        ]
      };

      const predictions = {
        nextMonthRevenue: totalRevenue * (1 + (revenueGrowth / 100)),
        quarterProjection: totalRevenue * 3 * (1 + (revenueGrowth / 100)),
        riskFactors: [
          "Seasonal demand fluctuations",
          "Supply chain cost increases"
        ],
        growthOpportunities: [
          "Market expansion to new customer segments",
          "Product line diversification",
          "Enhanced digital marketing campaigns"
        ]
      };

      const healthData = {
        healthScore,
        scoreBreakdown: {
          revenue: Math.round(revenueScore),
          profitability: Math.round(profitabilityScore),
          cashFlow: Math.round(cashFlowScore),
          growth: Math.round(growthScore),
          efficiency: Math.round(efficiencyScore)
        },
        insights,
        metrics: {
          revenueGrowth: Math.round(revenueGrowth * 100) / 100,
          profitMargin: Math.round(profitMargin * 100) / 100,
          customerAcquisitionCost: Math.round(customerAcquisitionCost),
          customerLifetimeValue: Math.round(customerLifetimeValue),
          burnRate: Math.round(monthlyBurnRate),
          monthsOfRunway: Math.round(monthsOfRunway)
        },
        predictions
      };

      res.json(healthData);
    } catch (error) {
      console.error("Error generating financial health analysis:", error);
      res.status(500).json({ message: "Failed to generate financial health analysis" });
    }
  });

  app.post('/api/financial-health/insights', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { analysis_type, period } = req.body;
      
      // Get financial data for AI analysis
      const [stats, orders, products] = await Promise.all([
        storage.getWholesalerStats(userId),
        storage.getOrders(userId),
        storage.getProducts(userId)
      ]);

      // Use OpenAI to generate advanced insights
      if (!openai) {
        throw new Error("OpenAI not configured");
      }

      const prompt = `As a financial advisor, analyze this wholesale business data:

Revenue: $${stats.totalRevenue}
Orders: ${stats.ordersCount}
Active Products: ${stats.activeProducts}
Low Stock Items: ${stats.lowStockCount}
Recent Orders: ${orders.length}

Provide specific, actionable insights for:
1. Revenue optimization opportunities
2. Cost reduction strategies  
3. Growth potential areas
4. Risk factors to monitor
5. Recommended next steps

Focus on practical B2B wholesale strategies. Be concise and specific.`;

      const response = await openai.chat.completions.create({
        model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
        messages: [
          {
            role: "system",
            content: "You are an expert financial advisor specializing in B2B wholesale businesses. Provide actionable insights based on the business data."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        max_tokens: 500,
        temperature: 0.7,
        response_format: { type: "json_object" }
      });

      const aiInsights = JSON.parse(response.choices[0].message.content || '{}');
      
      res.json({
        success: true,
        insights: aiInsights,
        generated_at: new Date().toISOString()
      });
    } catch (error) {
      console.error("Error generating AI insights:", error);
      res.status(500).json({ message: "Failed to generate AI insights" });
    }
  });

  // Create payment intent for customer portal orders (public - no auth required)
  app.post('/api/marketplace/create-payment-intent', async (req, res) => {
    try {
      const { items, customerData, wholesalerId, totalAmount, shippingInfo } = req.body;
      
      console.log('🚚 MARKETPLACE PAYMENT DEBUG: Received shippingInfo from frontend:', JSON.stringify(shippingInfo, null, 2));
      console.log('🚚 MARKETPLACE PAYMENT DEBUG: customerData.shippingOption:', customerData?.shippingOption);
      
      console.log(`💰 Payment intent request: totalAmount=${totalAmount}, items=${JSON.stringify(items)}, wholesalerId=${wholesalerId}`);
      
      // Validate and recalculate totalAmount to prevent NaN errors
      let validatedTotalAmount = 0;
      
      if (totalAmount && !isNaN(parseFloat(totalAmount)) && parseFloat(totalAmount) > 0) {
        validatedTotalAmount = parseFloat(totalAmount);
      } else {
        // Recalculate from items if totalAmount is invalid
        console.log('⚠️ Invalid totalAmount, recalculating from items...');
        for (const item of items) {
          const product = await storage.getProduct(item.productId);
          if (product) {
            const unitPrice = parseFloat(item.unitPrice) || parseFloat(product.price) || 0;
            const quantity = parseInt(item.quantity) || 0;
            validatedTotalAmount += unitPrice * quantity;
          }
        }
      }
      
      // Final validation
      if (!validatedTotalAmount || validatedTotalAmount <= 0) {
        console.error(`❌ Invalid calculated totalAmount: ${validatedTotalAmount}`);
        return res.status(400).json({ message: 'Unable to calculate valid total amount' });
      }
      
      console.log(`✅ Using validated totalAmount: ${validatedTotalAmount}`);
      
      if (!items || !customerData || !wholesalerId) {
        return res.status(400).json({ message: 'Missing required fields' });
      }

      // Get wholesaler information 
      const wholesaler = await storage.getUser(wholesalerId);
      if (!wholesaler) {
        return res.status(404).json({ message: 'Wholesaler not found' });
      }

      // validatedTotalAmount is the product subtotal (without transaction fee)
      // Customer pays 5.5% + £0.50 transaction fee on TOP of subtotal
      const customerTransactionFee = (validatedTotalAmount * 0.055) + 0.50;
      const totalAmountWithFee = validatedTotalAmount + customerTransactionFee;
      
      // Platform collects 3.3% from subtotal 
      const platformFee = validatedTotalAmount * 0.033;
      const wholesalerAmount = (validatedTotalAmount - platformFee).toFixed(2);

      // Create payment intent with Stripe Connect (application fee)
      if (!stripe) {
        throw new Error('Stripe not configured');
      }

      let paymentIntent;

      // Try creating payment intent with Stripe Connect if available
      if (wholesaler.stripeAccountId) {
        try {
          // Create payment intent with Stripe Connect and 3.3% platform fee
          paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(totalAmountWithFee * 100), // Customer pays product total + transaction fee
            currency: 'gbp', // Always use GBP for platform
            application_fee_amount: Math.round(platformFee * 100), // 3.3% platform fee in cents
            transfer_data: {
              destination: wholesaler.stripeAccountId, // Wholesaler receives 96.7%
            },
            receipt_email: customerData.email, // ✅ Automatically send Stripe receipt to customer
            metadata: {
              orderType: 'customer_portal',
              wholesalerId: wholesalerId,
              customerName: customerData.name,
              customerEmail: customerData.email,
              customerPhone: customerData.phone,
              customerAddress: JSON.stringify({
                street: customerData.address,
                city: customerData.city,
                state: customerData.state,
                postalCode: customerData.postalCode,
                country: customerData.country
              }),
              totalAmount: validatedTotalAmount.toString(),
              platformFee: platformFee.toFixed(2),
              customerTransactionFee: customerTransactionFee.toFixed(2),
              totalAmountWithFee: totalAmountWithFee.toFixed(2),
              connectAccountUsed: 'true',
              shippingInfo: JSON.stringify(shippingInfo || { option: 'pickup' }),
              items: JSON.stringify(items.map(item => ({
                ...item,
                productName: item.productName || 'Product'
              })))
            }
          });
        } catch (connectError: any) {
          console.log('Connect payment failed, falling back to regular payment:', connectError.message);
          
          // Fallback to regular payment intent for demo/test purposes
          paymentIntent = await stripe.paymentIntents.create({
            amount: Math.round(totalAmountWithFee * 100), // Customer pays product total + £6 platform fee
            currency: 'gbp', // Always use GBP for platform
            receipt_email: customerData.email, // ✅ Automatically send Stripe receipt to customer
            metadata: {
              orderType: 'customer_portal',
              wholesalerId: wholesalerId,
              customerName: customerData.name,
              customerEmail: customerData.email,
              customerPhone: customerData.phone,
              customerAddress: JSON.stringify({
                street: customerData.address,
                city: customerData.city,
                state: customerData.state,
                postalCode: customerData.postalCode,
                country: customerData.country
              }),
              totalAmount: validatedTotalAmount.toString(),
              platformFee: platformFee.toFixed(2),
              customerTransactionFee: customerTransactionFee.toFixed(2),
              totalAmountWithFee: totalAmountWithFee.toFixed(2),
              connectAccountUsed: 'false',
              shippingInfo: (() => {
                console.log('🚚 PAYMENT INTENT DEBUG: shippingInfo value before stringify:', shippingInfo);
                const finalShipping = shippingInfo || { option: 'pickup' };
                console.log('🚚 PAYMENT INTENT DEBUG: Final shipping info being stored:', finalShipping);
                return JSON.stringify(finalShipping);
              })(),
              items: JSON.stringify(items.map(item => ({
                ...item,
                productName: item.productName || 'Product'
              })))
            }
          });
        }
      } else {
        // Create regular payment intent when no Connect account
        paymentIntent = await stripe.paymentIntents.create({
          amount: Math.round(totalAmountWithFee * 100), // Customer pays product total + £6 platform fee
          currency: 'gbp', // Always use GBP for platform
          metadata: {
            orderType: 'customer_portal',
            wholesalerId: wholesalerId,
            customerName: customerData.name,
            customerEmail: customerData.email,
            customerPhone: customerData.phone,
            customerAddress: JSON.stringify({
              street: customerData.address,
              city: customerData.city,
              state: customerData.state,
              postalCode: customerData.postalCode,
              country: customerData.country
            }),
            totalAmount: validatedTotalAmount.toString(),
            platformFee: platformFee.toFixed(2),
            customerTransactionFee: customerTransactionFee.toFixed(2),
            totalAmountWithFee: totalAmountWithFee.toFixed(2),
            connectAccountUsed: 'false',
            shippingInfo: (() => {
              console.log('🚚 PAYMENT INTENT DEBUG (no connect): shippingInfo before stringify:', shippingInfo);
              const finalShipping = shippingInfo || { option: 'pickup' };
              console.log('🚚 PAYMENT INTENT DEBUG (no connect): Final shipping info stored:', finalShipping);
              return JSON.stringify(finalShipping);
            })(),
            items: JSON.stringify(items.map(item => ({
              ...item,
              productName: item.productName || 'Product'
            })))
          }
        });
      }

      res.json({ 
        clientSecret: paymentIntent.client_secret,
        totalAmount: validatedTotalAmount.toFixed(2), // Product subtotal
        customerTransactionFee: customerTransactionFee.toFixed(2), // Customer pays 5.5% + £0.50
        platformFee: platformFee.toFixed(2), // Platform collects 3.3%
        totalAmountWithFee: totalAmountWithFee.toFixed(2), // Total customer payment
        wholesalerReceives: (validatedTotalAmount - platformFee).toFixed(2) // Wholesaler receives product total minus 3.3%
      });
    } catch (error: any) {
      console.error('Error creating payment intent:', error);
      res.status(500).json({ message: 'Error creating payment intent: ' + error.message });
    }
  });

  // Marketplace product detail endpoint (public - no auth required)
  app.get('/api/marketplace/products/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const productId = parseInt(id);
      
      if (isNaN(productId)) {
        return res.status(400).json({ message: "Invalid product ID" });
      }
      
      const product = await storage.getProduct(productId);
      
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      
      console.log('Product weight data debug:', {
        productId: product.id,
        name: product.name,
        unitWeight: product.unitWeight,
        unit_weight: product.unit_weight,
        palletWeight: product.palletWeight,
        pallet_weight: product.pallet_weight
      });
      
      if (product.id === 23) {
        console.log('BASMATI RICE DEBUG - Product data being returned:', JSON.stringify(product, null, 2));
      }
      
      // Get wholesaler details
      const wholesaler = await storage.getUser(product.wholesalerId);
      
      if (!wholesaler) {
        return res.status(404).json({ message: "Wholesaler not found" });
      }
      
      // Return product with wholesaler information
      res.json({
        ...product,
        wholesaler: {
          id: wholesaler.id,
          businessName: wholesaler.businessName || 'Business',
          businessPhone: wholesaler.businessPhone,
          businessAddress: wholesaler.businessAddress,
          profileImageUrl: wholesaler.profileImageUrl,
          logoType: wholesaler.logoType || 'initials',
          logoUrl: wholesaler.logoUrl || undefined,
          firstName: wholesaler.firstName,
          lastName: wholesaler.lastName,
          defaultCurrency: wholesaler.preferredCurrency
        }
      });
    } catch (error) {
      console.error("Error fetching product:", error);
      res.status(500).json({ message: "Failed to fetch product" });
    }
  });

  // Marketplace order placement endpoint (public - no auth required)
  app.post('/api/marketplace/orders', async (req, res) => {
    try {
      const { productId, customerName, customerPhone, customerEmail, quantity, totalAmount, notes } = req.body;
      
      if (!productId || !customerName || !customerPhone || !quantity || !totalAmount) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      // Automatically format phone number to international format
      const formattedPhoneNumber = formatPhoneToInternational(customerPhone);
      
      // Validate the formatted phone number
      if (!validatePhoneNumber(formattedPhoneNumber)) {
        return res.status(400).json({ 
          message: `Invalid phone number format. Please provide a valid phone number (e.g., 07507659550 or +447507659550)` 
        });
      }
      
      // Get product to validate and get wholesaler
      const product = await storage.getProduct(parseInt(productId));
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      // Check if product is locked due to subscription limits
      if (product.status === 'locked') {
        return res.status(403).json({ 
          message: "This product is currently unavailable due to subscription restrictions.",
          errorType: "PRODUCT_LOCKED"
        });
      }
      
      // Validate quantity against MOQ and stock
      if (quantity < product.moq) {
        return res.status(400).json({ 
          message: `Minimum order quantity is ${product.moq} units` 
        });
      }
      
      if (quantity > product.stock) {
        return res.status(400).json({ 
          message: `Only ${product.stock} units available in stock` 
        });
      }
      
      // Get or create customer (check by formatted phone first, then by email)
      let customer = await storage.getUserByPhone(formattedPhoneNumber);
      if (!customer) {
        customer = await storage.getUserByEmail(customerEmail);
      }
      if (!customer) {
        const { firstName, lastName } = parseCustomerName(customerName);
        customer = await storage.createCustomer({
          phoneNumber: formattedPhoneNumber,
          firstName,
          lastName,
          email: customerEmail,
          role: 'retailer'
        });
      }
      
      // Calculate platform fee (5% of total)
      const subtotal = totalAmount.toString();
      const platformFee = (parseFloat(totalAmount) * 0.05).toFixed(2);
      const total = totalAmount.toString();
      
      // Create order with customer details  
      const orderData = {
        orderNumber: `ORD-${Date.now()}`,
        wholesalerId: product.wholesalerId,
        retailerId: customer.id,
        customerName, // Store customer name
        customerEmail, // Store customer email
        customerPhone: formattedPhoneNumber, // Store formatted phone number
        subtotal,
        platformFee,
        total,
        status: 'confirmed',
        notes: notes || `Order placed via marketplace for ${product.name}`
      };
      
      const orderItems = [{
        productId: product.id,
        quantity: parseInt(quantity),
        unitPrice: product.price,
        total: totalAmount.toString(),
        orderId: 0 // Will be set after order creation
      }];
      
      const order = await storage.createOrder(orderData, orderItems);
      
      // Send confirmation email to customer
      const wholesaler = await storage.getUser(product.wholesalerId);
      if (wholesaler && customerEmail) {
        try {
          // Use the provided customer email instead of stored email
          const customerForEmail = {
            ...customer,
            email: customerEmail
          };
          await sendCustomerInvoiceEmail(customerForEmail, order, orderItems.map(item => ({
            ...item,
            product: { name: product.name, price: item.unitPrice }
          })), wholesaler);
        } catch (emailError) {
          console.error("Failed to send confirmation email:", emailError);
        }
      }
      
      // Send WhatsApp notification to wholesaler if configured
      try {
        const wholesaler = await storage.getUser(product.wholesalerId);
        if (wholesaler?.twilioAccountSid && wholesaler?.twilioAuthToken && wholesaler?.twilioPhoneNumber) {
          const message = `🔔 New Order Alert!

Customer: ${customerName}
Phone: ${formattedPhoneNumber}
Product: ${product.name}
Quantity: ${quantity.toLocaleString()} units
Total: ${wholesaler.defaultCurrency === 'GBP' ? '£' : '$'}${totalAmount}

Order ID: ${order.id}
Status: Pending Confirmation

Please contact the customer to confirm this order.

✨ Powered by Quikpik Merchant`;

          await whatsappService.sendMessage(
            wholesaler.businessPhone || wholesaler.phoneNumber || '',
            message,
            wholesaler.id
          );
        }
      } catch (notificationError) {
        console.warn("Failed to send order notification:", notificationError);
        // Don't fail the order creation if notification fails
      }
      
      res.json({
        success: true,
        orderId: order.id,
        message: "Order placed successfully! The wholesaler will contact you shortly."
      });
      
    } catch (error) {
      console.error("Error creating marketplace order:", error);
      res.status(500).json({ message: "Failed to place order" });
    }
  });

  // Customer portal order endpoints
  app.post("/api/customer/orders", async (req, res) => {
    try {
      const { customerName, customerEmail, customerPhone, customerAddress, items, totalAmount, notes } = req.body;

      if (!customerName || !customerEmail || !customerPhone || !customerAddress || !items || items.length === 0) {
        return res.status(400).json({ message: "Missing required customer or order information" });
      }

      // Get the first product's wholesaler for the order
      const firstProduct = await storage.getProduct(items[0].productId);
      if (!firstProduct) {
        return res.status(404).json({ message: "Product not found" });
      }

      // Create or get customer
      let customer;
      try {
        customer = await storage.getUserByPhone(customerPhone);
        if (!customer) {
          const { firstName, lastName } = parseCustomerName(customerName);
          customer = await storage.createCustomer({
            phoneNumber: customerPhone,
            firstName,
            lastName,
            role: 'retailer',
            email: customerEmail,
            streetAddress: customerAddress,
          });
        }
      } catch (error) {
        console.error("Error creating customer:", error);
        return res.status(500).json({ message: "Failed to create customer record" });
      }

      // Calculate platform fee (5%)
      const subtotal = parseFloat(totalAmount);
      const platformFee = subtotal * 0.05;
      const finalTotal = subtotal;

      // Create the order with customer details
      const order = await storage.createOrder(
        {
          orderNumber: `ORD-${Date.now()}`,
          retailerId: customer.id,
          wholesalerId: firstProduct.wholesalerId,
          customerName, // Store customer name
          customerEmail, // Store customer email 
          customerPhone, // Store customer phone
          subtotal: subtotal.toFixed(2),
          platformFee: platformFee.toFixed(2),
          total: finalTotal.toFixed(2),
          status: 'confirmed',
          deliveryAddress: customerAddress,
          notes: notes || ''
        },
        items.map((item: any) => ({
          ...item,
          orderId: 0 // Will be set by the storage layer
        }))
      );

      // Get wholesaler info for email
      const wholesaler = await storage.getUser(firstProduct.wholesalerId);

      // Send email invoice to customer
      try {
        // Enrich items with product details for email
        const enrichedItems = await Promise.all(items.map(async (item: any) => {
          const product = await storage.getProduct(item.productId);
          return {
            ...item,
            productName: product?.name || 'Product',
            product: product ? { name: product.name, price: item.unitPrice } : null
          };
        }));
        
        await sendCustomerInvoiceEmail(customer, order, enrichedItems, wholesaler);
      } catch (error) {
        console.error("Failed to send customer invoice email:", error);
        // Don't fail the order creation if email fails
      }

      // Notify wholesaler via WhatsApp
      try {
        const wholesaler = await storage.getUser(firstProduct.wholesalerId);
        if (wholesaler && wholesaler.businessPhone) {
          const message = generateOrderNotificationMessage(order, customer, items);
          await whatsappService.sendMessage(wholesaler.businessPhone, message, wholesaler.id);
        }
      } catch (error) {
        console.error("Failed to send WhatsApp notification:", error);
        // Don't fail the order creation if notification fails
      }

      res.json({
        success: true,
        orderId: order.id,
        message: "Order placed successfully! You'll receive an email invoice and the wholesaler will contact you shortly."
      });

    } catch (error) {
      console.error("Error creating customer order:", error);
      res.status(500).json({ message: "Failed to place order" });
    }
  });

  // Email invoice function for customers
  async function sendCustomerInvoiceEmail(customer: any, order: any, items: any[], wholesaler: any) {
    try {
      const currencySymbol = wholesaler.preferredCurrency === 'GBP' ? '£' : 
                           wholesaler.preferredCurrency === 'EUR' ? '€' : '$';
      
      // Get customer name with proper fallback - handle both single name and split names
      const customerName = customer.name || 
                           (customer.firstName && customer.lastName ? `${customer.firstName} ${customer.lastName}` : customer.firstName) || 
                           'Valued Customer';
      
      // Format delivery address properly - clean up JSON symbols
      let deliveryAddress = 'Address to be confirmed';
      try {
        if (order.deliveryAddress && typeof order.deliveryAddress === 'string') {
          // Try to parse JSON address
          const parsedAddress = JSON.parse(order.deliveryAddress);
          if (parsedAddress.street) {
            deliveryAddress = `${parsedAddress.street}, ${parsedAddress.city}, ${parsedAddress.state} ${parsedAddress.postalCode}, ${parsedAddress.country}`;
          } else if (parsedAddress.address) {
            // Handle cases where address is nested
            deliveryAddress = parsedAddress.address;
          } else {
            // Clean up JSON symbols from address string
            deliveryAddress = order.deliveryAddress.replace(/[{}":]/g, '').replace(/,/g, ', ');
          }
        } else if (customer.address) {
          deliveryAddress = customer.address;
        }
      } catch (parseError) {
        // If JSON parsing fails, clean up JSON symbols and use as plain text
        if (order.deliveryAddress) {
          deliveryAddress = order.deliveryAddress.replace(/[{}":]/g, '').replace(/,/g, ', ');
        } else {
          deliveryAddress = customer.address || 'Address to be confirmed';
        }
      }
      
      // Create HTML email content with proper product names and pricing
      const itemsHtml = items.map((item) => {
        let productName = 'Product';
        let unitPrice = '0.00';
        let total = '0.00';
        
        // Get product name from enriched data
        if (item.productName) {
          productName = item.productName;
        } else if (item.product && item.product.name) {
          productName = item.product.name;
        }
        
        // Calculate pricing properly
        if (item.unitPrice) {
          unitPrice = typeof item.unitPrice === 'string' ? 
            parseFloat(item.unitPrice).toFixed(2) : 
            item.unitPrice.toFixed(2);
        }
        
        if (item.total) {
          total = typeof item.total === 'string' ? 
            parseFloat(item.total).toFixed(2) : 
            item.total.toFixed(2);
        } else if (item.unitPrice && item.quantity) {
          // Calculate total if not provided
          const calculatedTotal = parseFloat(item.unitPrice) * parseInt(item.quantity);
          total = calculatedTotal.toFixed(2);
        }
        
        console.log(`Email item debug: ${productName}, qty: ${item.quantity}, price: ${unitPrice}, total: ${total}`);
        
        return `
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;">${productName}</td>
            <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: center;">${item.quantity}</td>
            <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">${currencySymbol}${unitPrice}</td>
            <td style="padding: 8px; border-bottom: 1px solid #ddd; text-align: right;">${currencySymbol}${total}</td>
          </tr>
        `;
      });
      
      const itemsHtmlString = itemsHtml.join('');

      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #22c55e;">Order Confirmation</h2>
          <p>Dear ${customerName},</p>
          <p>Thank you for your order! Here are the details:</p>
          
          <div style="background: #f9f9f9; padding: 20px; border-radius: 5px; margin: 20px 0;">
            <h3>Order Details</h3>
            <p><strong>Order ID:</strong> #${order.id}</p>
            <p><strong>Wholesale Reference:</strong> ${order.orderNumber || `WS-${order.id}`}</p>
            <p><strong>From:</strong> ${wholesaler.businessName || 'Wholesale Store'}</p>
            <p><strong>Fulfillment Type:</strong> ${order.fulfillmentType === 'delivery' ? 'Delivery to your address' : 'Collection from store'}</p>
            ${order.fulfillmentType === 'delivery' ? `<p><strong>Delivery Address:</strong> ${deliveryAddress}</p>` : ''}
            ${order.fulfillmentType === 'pickup' ? `<p><strong>Collection Address:</strong> ${wholesaler.businessAddress || 'Please contact store for address'}</p>` : ''}
            ${order.deliveryCost && parseFloat(order.deliveryCost) > 0 ? `<p><strong>Delivery Service:</strong> ${order.shippingServiceName || 'Standard Delivery'}</p>` : ''}
          </div>

          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <thead>
              <tr style="background: #22c55e; color: white;">
                <th style="padding: 12px; text-align: left;">Item</th>
                <th style="padding: 12px; text-align: center;">Qty</th>
                <th style="padding: 12px; text-align: right;">Price</th>
                <th style="padding: 12px; text-align: right;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtmlString}
            </tbody>
          </table>

          <div style="background: #f8fafc; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #3b82f6;">
            <h4>Payment Breakdown</h4>
            <div style="display: flex; justify-content: space-between; margin: 8px 0;">
              <span>Product Subtotal:</span>
              <span>${currencySymbol}${order.subtotal || '0.00'}</span>
            </div>
            ${order.deliveryCost && parseFloat(order.deliveryCost) > 0 ? `
            <div style="display: flex; justify-content: space-between; margin: 8px 0;">
              <span>Shipping:</span>
              <span>${currencySymbol}${order.deliveryCost}</span>
            </div>` : ''}

            <hr style="margin: 12px 0; border: none; border-top: 1px solid #e5e7eb;">
            <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 18px;">
              <span>Total Paid:</span>
              <span>${currencySymbol}${order.total}</span>
            </div>
          </div>

          <div style="background: #e5f3ff; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <h4>Payment Status: PAID ✅</h4>
            <p>Your order has been confirmed and payment processed successfully. The wholesaler will prepare your order and contact you with delivery details.</p>
            <p><strong>Important:</strong> When contacting the store about this order, please quote your <strong>Wholesale Reference: ${order.orderNumber || `WS-${order.id}`}</strong> for quick identification.</p>
          </div>

          <div style="background: #f0f9ff; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <h4>Store Contact Information</h4>
            <p><strong>${wholesaler.businessName || 'Wholesale Store'}</strong></p>
            ${wholesaler.businessPhone ? `<p>📞 Phone: ${wholesaler.businessPhone}</p>` : ''}
            ${wholesaler.email ? `<p>📧 Email: ${wholesaler.email}</p>` : ''}
            ${wholesaler.businessAddress ? `<p>📍 Address: ${wholesaler.businessAddress}</p>` : ''}
          </div>

          <div style="border-top: 1px solid #ddd; padding-top: 20px; margin-top: 30px; color: #666; font-size: 12px;">
            <p>This invoice was generated by Quikpik Merchant Platform</p>
          </div>
        </div>
      `;

      // Import and use SendGrid
      const sgMail = (await import('@sendgrid/mail')).default;
      
      if (process.env.SENDGRID_API_KEY) {
        sgMail.setApiKey(process.env.SENDGRID_API_KEY);
        
        const msg = {
          to: customer.email,
          from: 'hello@quikpik.co', // Use verified sender
          subject: `Order Confirmation ${order.orderNumber || `#${order.id}`} - ${wholesaler.businessName || 'Wholesale Store'}`,
          html: emailHtml,
          // Add tracking and delivery settings
          tracking_settings: {
            click_tracking: {
              enable: true,
              enable_text: false
            },
            open_tracking: {
              enable: true
            },
            subscription_tracking: {
              enable: false
            }
          },
          // Add email headers for better delivery
          headers: {
            'X-Priority': '1',
            'X-MSMail-Priority': 'High',
            'Importance': 'High'
          }
        };

        try {
          const response = await sgMail.send(msg);
          console.log(`✅ Confirmation email sent to ${customer.email} for order #${order.id}`);
          console.log(`📧 Email delivery status: ${response[0].statusCode}`);
          console.log(`📧 Message ID: ${response[0].headers['x-message-id']}`);
          
          // Additional logging for debugging
          if (response[0].statusCode === 202) {
            console.log(`📧 Email accepted by SendGrid for delivery`);
          } else {
            console.log(`⚠️ Unexpected status code: ${response[0].statusCode}`);
          }
        } catch (sendGridError: any) {
          console.error('❌ SendGrid error details:', {
            message: sendGridError.message,
            code: sendGridError.code,
            response: sendGridError.response?.body
          });
          
          // Log specific error details
          if (sendGridError.response?.body?.errors) {
            console.error('SendGrid validation errors:', sendGridError.response.body.errors);
          }
          
          throw sendGridError;
        }
      } else {
        console.log("SendGrid not configured - Email would have been sent:", {
          to: customer.email,
          subject: `Order Confirmation #${order.id}`,
          order: order.id,
          total: order.total
        });
      }
    } catch (error) {
      console.error('Failed to send customer confirmation email:', error);
    }
  }

  async function createStripeInvoiceForOrder(order: any, items: any[], wholesaler: any, customer: any) {
    if (!stripe || !wholesaler.stripeAccountId) {
      console.log('Stripe not configured or no Connect account, skipping Stripe invoice');
      return;
    }

    try {
      // Create or retrieve Stripe customer
      let stripeCustomer;
      try {
        // Try to find existing customer by email
        const existingCustomers = await stripe.customers.list({
          email: customer.email,
          limit: 1
        }, {
          stripeAccount: wholesaler.stripeAccountId
        });

        if (existingCustomers.data.length > 0) {
          stripeCustomer = existingCustomers.data[0];
        } else {
          // Create new customer
          stripeCustomer = await stripe.customers.create({
            email: customer.email,
            name: `${customer.firstName} ${customer.lastName || ''}`.trim(),
            phone: customer.phoneNumber,
            metadata: {
              order_id: order.id.toString(),
              customer_type: 'marketplace_customer'
            }
          }, {
            stripeAccount: wholesaler.stripeAccountId
          });
        }
      } catch (customerError) {
        console.error('Error creating/retrieving Stripe customer:', customerError);
        return;
      }

      // Create Stripe invoice
      const invoice = await stripe.invoices.create({
        customer: stripeCustomer.id,
        currency: (wholesaler.preferredCurrency || 'gbp').toLowerCase(),
        description: `Order #${order.id} - ${wholesaler.businessName || 'Quikpik Merchant'}`,
        metadata: {
          order_id: order.id.toString(),
          platform: 'quikpik_merchant'
        },
        auto_advance: false, // Don't auto-finalize
        collection_method: 'send_invoice',
        days_until_due: 30
      }, {
        stripeAccount: wholesaler.stripeAccountId
      });

      // Add line items to invoice
      for (const item of items) {
        await stripe.invoiceItems.create({
          customer: stripeCustomer.id,
          invoice: invoice.id,
          amount: Math.round(parseFloat(item.unitPrice) * item.quantity * 100), // Convert to cents
          currency: (wholesaler.preferredCurrency || 'gbp').toLowerCase(),
          description: `${item.productName || item.product?.name || 'Product'} (Qty: ${item.quantity})`,
          metadata: {
            product_id: item.productId?.toString() || '',
            quantity: item.quantity.toString(),
            unit_price: item.unitPrice
          }
        }, {
          stripeAccount: wholesaler.stripeAccountId
        });
      }

      // Add platform fee as separate line item
      const subtotal = items.reduce((sum, item) => sum + (parseFloat(item.unitPrice) * item.quantity), 0);
      const platformFee = subtotal * 0.05;
      
      await stripe.invoiceItems.create({
        customer: stripeCustomer.id,
        invoice: invoice.id,
        amount: Math.round(platformFee * 100), // Convert to cents
        currency: (wholesaler.preferredCurrency || 'gbp').toLowerCase(),
        description: 'Quikpik Platform Fee (5%)',
        metadata: {
          type: 'platform_fee',
          percentage: '5'
        }
      }, {
        stripeAccount: wholesaler.stripeAccountId
      });

      // Finalize and send the invoice
      const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id, {}, {
        stripeAccount: wholesaler.stripeAccountId
      });

      // Mark as paid since payment was already processed
      await stripe.invoices.pay(finalizedInvoice.id, {}, {
        stripeAccount: wholesaler.stripeAccountId
      });

      // Send the invoice to customer
      await stripe.invoices.sendInvoice(finalizedInvoice.id, {}, {
        stripeAccount: wholesaler.stripeAccountId
      });

      console.log(`✅ Stripe invoice created and sent to ${customer.email} for order ${order.id}`);
      return finalizedInvoice;

    } catch (error) {
      console.error('❌ Failed to create Stripe invoice:', error);
    }
  }

  async function createStripeRefundReceipt(order: any, refund: any, wholesaler: any, customer: any, reason: string) {
    if (!stripe || !wholesaler.stripeAccountId) {
      console.log('Stripe not configured or no Connect account, skipping Stripe refund receipt');
      return;
    }

    try {
      // Create a credit note for the refund
      if (refund && refund.id) {
        // Find the original invoice to create a credit note
        const invoices = await stripe.invoices.list({
          customer: customer.email,
          limit: 10
        }, {
          stripeAccount: wholesaler.stripeAccountId
        });

        const originalInvoice = invoices.data.find(inv => 
          inv.metadata?.order_id === order.id.toString()
        );

        if (originalInvoice) {
          // Create credit note for the refund
          const creditNote = await stripe.creditNotes.create({
            invoice: originalInvoice.id,
            amount: refund.amount, // Amount in cents
            reason: 'requested_by_customer',
            memo: reason || 'Refund processed for order',
            metadata: {
              order_id: order.id.toString(),
              refund_id: refund.id,
              refund_reason: reason || 'Customer requested refund'
            }
          }, {
            stripeAccount: wholesaler.stripeAccountId
          });

          console.log(`✅ Stripe credit note created for refund ${refund.id}`);
          return creditNote;
        }
      }
    } catch (error) {
      console.error('❌ Failed to create Stripe refund receipt:', error);
    }
  }

  async function sendRefundReceipt(customer: any, order: any, refund: any, wholesaler: any, reason: string) {
    if (!sgMail) {
      console.log('SendGrid not configured, skipping refund receipt email');
      return;
    }

    try {
      const customerName = `${customer.firstName} ${customer.lastName || ''}`.trim();
      const businessName = wholesaler.businessName || 'Quikpik Merchant';
      const currency = wholesaler.preferredCurrency || 'GBP';
      const currencySymbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '£';
      
      const refundAmount = refund ? (refund.amount / 100) : parseFloat(order.total);
      const isFullRefund = refund ? (refund.amount >= parseFloat(order.total) * 100) : true;

      const emailContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Refund Receipt - ${businessName}</title>
</head>
<body style="margin: 0; padding: 20px; font-family: Arial, sans-serif; background-color: #f9f9f9;">
  <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
    
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; padding: 30px;">
      <h1 style="margin: 0; font-size: 28px; font-weight: bold;">${businessName}</h1>
      <p style="margin: 10px 0 0 0; opacity: 0.9; font-size: 16px;">Refund Receipt</p>
    </div>

    <!-- Refund Info -->
    <div style="padding: 30px;">
      <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 20px; margin-bottom: 30px;">
        <h2 style="margin: 0 0 10px 0; color: #dc2626; font-size: 20px;">Refund Processed</h2>
        <p style="margin: 0; color: #7f1d1d;">
          ${isFullRefund ? 'Full refund' : 'Partial refund'} of ${currencySymbol}${refundAmount.toFixed(2)} has been processed for Order #${order.id}
        </p>
      </div>

      <div style="display: flex; justify-content: space-between; margin-bottom: 30px;">
        <div>
          <h3 style="margin: 0 0 10px 0; color: #374151;">Customer:</h3>
          <p style="margin: 0; color: #6b7280; line-height: 1.5;">
            ${customerName}<br/>
            ${customer.email}<br/>
            ${customer.phoneNumber || ''}
          </p>
        </div>
        <div style="text-align: right;">
          <h3 style="margin: 0 0 10px 0; color: #374151;">Refund Details:</h3>
          <p style="margin: 0; color: #6b7280; line-height: 1.5;">
            Date: ${new Date().toLocaleDateString()}<br/>
            Original Order: #${order.id}<br/>
            ${refund ? `Refund ID: ${refund.id}` : 'Manual Refund'}
          </p>
        </div>
      </div>

      <!-- Refund Summary -->
      <div style="border: 1px solid #e5e7eb; border-radius: 6px; padding: 20px; margin-bottom: 30px;">
        <h3 style="margin: 0 0 15px 0; color: #374151;">Refund Summary</h3>
        <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
          <span style="color: #6b7280;">Original Order Total:</span>
          <span style="font-weight: 600;">${currencySymbol}${parseFloat(order.total).toFixed(2)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
          <span style="color: #6b7280;">Refund Amount:</span>
          <span style="font-weight: 600; color: #dc2626;">${currencySymbol}${refundAmount.toFixed(2)}</span>
        </div>
        ${reason ? `<div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #e5e7eb;">
          <span style="color: #6b7280;">Reason:</span>
          <p style="margin: 5px 0 0 0; color: #374151;">${reason}</p>
        </div>` : ''}
      </div>

      <!-- Processing Info -->
      <div style="background-color: #f0f9ff; border: 1px solid #0ea5e9; border-radius: 6px; padding: 20px; margin-bottom: 30px;">
        <h3 style="margin: 0 0 10px 0; color: #0369a1;">Processing Information</h3>
        <p style="margin: 0; color: #0369a1; line-height: 1.5;">
          Your refund has been processed and will appear on your original payment method within 5-10 business days.
          ${isFullRefund ? ' Your order has been cancelled and any items will be restocked.' : ''}
        </p>
      </div>

      <!-- Footer -->
      <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center;">
        <p style="color: #6b7280; margin: 0 0 10px 0;">We apologize for any inconvenience.</p>
        <p style="color: #9ca3af; font-size: 14px; margin: 0;">
          This refund receipt was generated automatically by Quikpik Merchant Platform
        </p>
      </div>
    </div>
  </div>
</body>
</html>`;

      await sgMail.send({
        to: customer.email,
        from: 'invoices@quikpik.co',
        subject: `Refund Receipt for Order #${order.id} - ${businessName}`,
        html: emailContent
      });

      console.log(`✅ Refund receipt sent to ${customer.email} for order ${order.id}`);
    } catch (error) {
      console.error('❌ Failed to send refund receipt:', error);
      throw error;
    }
  }

  function generateOrderNotificationMessage(order: any, customer: any, items: any[]): string {
    let message = `🛒 New Order Received!\n\n`;
    message += `Order #${order.id}\n`;
    message += `Customer: ${customer.firstName}\n`;
    message += `Phone: ${customer.phoneNumber}\n`;
    message += `Email: ${customer.email}\n\n`;
    
    message += `Items Ordered:\n`;
    items.forEach((item: any, index: number) => {
      message += `${index + 1}. Product ID ${item.productId}\n`;
      message += `   Quantity: ${item.quantity} units\n`;
      message += `   Unit Price: ${item.unitPrice}\n`;
      message += `   Total: ${item.total}\n\n`;
    });
    
    message += `Order Total: ${order.total}\n\n`;
    if (order.notes) {
      message += `Customer Notes: ${order.notes}\n\n`;
    }
    
    message += `Please contact the customer to confirm delivery details.`;
    
    return message;
  }

  // Marketplace negotiations endpoint (public - no auth required)
  app.post('/api/marketplace/negotiations', async (req, res) => {
    try {
      const { productId, retailerId, originalPrice, offeredPrice, quantity, message, customerEmail, customerName, customerPhone } = req.body;
      
      if (!productId || !originalPrice || !offeredPrice || !quantity) {
        return res.status(400).json({ message: "Missing required fields" });
      }
      
      // Get product to validate and get wholesaler
      const product = await storage.getProduct(parseInt(productId));
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }

      // Check if product is locked due to subscription limits
      if (product.status === 'locked') {
        return res.status(403).json({ 
          message: "This product is currently unavailable due to subscription restrictions.",
          errorType: "PRODUCT_LOCKED"
        });
      }

      // For marketplace negotiations, we'll create a temporary customer user if needed
      let customerId = retailerId;
      if (!customerId || customerId.startsWith('customer_')) {
        // Create a guest customer for the negotiation
        try {
          const { firstName, lastName } = parseCustomerName(customerName || 'Guest Customer');
          const tempCustomer = await storage.createCustomer({
            phoneNumber: customerPhone || `+44${Date.now()}`,
            firstName,
            lastName,
            role: 'retailer',
            email: customerEmail,
          });
          customerId = tempCustomer.id;
        } catch (error) {
          // If customer creation fails, use a fallback approach
          return res.status(400).json({ 
            message: "Unable to process negotiation request. Please try again or contact support." 
          });
        }
      }
      
      // Check if product allows negotiation
      if (!product.negotiationEnabled) {
        return res.status(400).json({ message: "This product is not available for price negotiation" });
      }
      
      // Validate quantity against MOQ
      if (quantity < product.moq) {
        return res.status(400).json({ 
          message: `Minimum order quantity is ${product.moq} units` 
        });
      }
      
      // Check if offered price meets minimum bid requirement
      const offeredPriceNum = parseFloat(offeredPrice);
      const minimumBid = product.minimumBidPrice ? parseFloat(product.minimumBidPrice) : null;
      
      if (minimumBid && offeredPriceNum < minimumBid) {
        // Get wholesaler and currency info first
        const wholesaler = await storage.getUser(product.wholesalerId);
        const currency = wholesaler?.preferredCurrency || 'GBP';
        const currencySymbol = currency === 'GBP' ? '£' : currency === 'EUR' ? '€' : '$';
        
        // Automatically decline the bid and send email notification
        const negotiationData = {
          productId: product.id,
          retailerId: customerId,
          originalPrice: originalPrice.toString(),
          offeredPrice: offeredPrice.toString(),
          quantity: parseInt(quantity),
          message: message || '',
          status: 'declined'
        };
        
        const negotiation = await storage.createNegotiation(negotiationData);
        
        // Send email notification to customer about declined bid
        try {
          
          // Send email to customer
          const customerEmail = req.body.customerEmail; // Should be provided in request
          if (customerEmail) {
            const emailSubject = `Quote Request Declined - ${product.name}`;
            const emailBody = `
Dear Customer,

Thank you for your interest in ${product.name}.

Unfortunately, your quote request has been automatically declined as the offered price (${currencySymbol}${offeredPrice}) is below our minimum acceptable bid price of ${currencySymbol}${minimumBid}.

Product Details:
- Product: ${product.name}
- Listed Price: ${currencySymbol}${originalPrice}
- Your Offer: ${currencySymbol}${offeredPrice}
- Minimum Bid: ${currencySymbol}${minimumBid}
- Quantity: ${quantity} units

Please feel free to submit a new quote at or above the minimum bid price.

Best regards,
${wholesaler?.businessName || wholesaler?.firstName + ' ' + wholesaler?.lastName}
            `;
            
            // Note: Email functionality would need SendGrid integration
            console.log('Email to send:', { to: customerEmail, subject: emailSubject, body: emailBody });
          }
          
          // Also send WhatsApp notification to wholesaler about declined bid
          if (wholesaler?.twilioAccountSid && wholesaler?.twilioAuthToken && wholesaler?.twilioPhoneNumber) {
            const notificationMessage = `🚫 Quote Automatically Declined

Product: ${product.name}
Customer Offer: ${currencySymbol}${offeredPrice}
Minimum Bid: ${currencySymbol}${minimumBid}
Quantity: ${quantity.toLocaleString()} units

The customer's bid was below your minimum acceptable price and has been automatically declined.`;

            await whatsappService.sendMessage(
              wholesaler.businessPhone || '',
              notificationMessage,
              wholesaler.id
            );
          }
        } catch (notificationError) {
          console.error('Failed to send decline notification:', notificationError);
        }
        
        return res.status(200).json({
          success: false,
          declined: true,
          negotiationId: negotiation.id,
          message: `Your offer of ${currencySymbol}${offeredPrice} is below the minimum bid price of ${currencySymbol}${minimumBid}. Please submit a higher offer.`,
          minimumBidPrice: minimumBid
        });
      }
      
      // Create negotiation record
      const negotiationData = {
        productId: product.id,
        retailerId: customerId,
        originalPrice: originalPrice.toString(),
        offeredPrice: offeredPrice.toString(),
        quantity: parseInt(quantity),
        message: message || '',
        status: 'pending'
      };
      
      const negotiation = await storage.createNegotiation(negotiationData);
      
      // Send WhatsApp notification to wholesaler about price quote request
      try {
        const wholesaler = await storage.getUser(product.wholesalerId);
        if (wholesaler?.twilioAccountSid && wholesaler?.twilioAuthToken && wholesaler?.twilioPhoneNumber) {
          const customerInfo = retailerId.includes('customer_') ? 'Customer' : 'Retailer';
          const total = (parseFloat(offeredPrice) * parseInt(quantity)).toFixed(2);
          const currency = wholesaler.preferredCurrency || 'GBP';
          const currencySymbol = currency === 'GBP' ? '£' : currency === 'EUR' ? '€' : '$';
          
          const notificationMessage = `💬 Price Quote Request!

Product: ${product.name}
Current Price: ${currencySymbol}${originalPrice}
Requested Price: ${currencySymbol}${offeredPrice}
Quantity: ${quantity.toLocaleString()} units
Total Value: ${currencySymbol}${total}

${message ? `Customer Message: "${message}"` : ''}

Review and respond to this price request in your Quikpik dashboard.

https://quikpik.app`;

          await whatsappService.sendMessage(
            wholesaler.businessPhone || '',
            notificationMessage,
            wholesaler.id
          );
        }
      } catch (notificationError) {
        console.error('Failed to send negotiation notification:', notificationError);
        // Don't fail the negotiation creation if notification fails
      }
      
      res.status(201).json({
        success: true,
        negotiationId: negotiation.id,
        message: "Price quote request submitted successfully"
      });
      
    } catch (error) {
      console.error("Error creating negotiation:", error);
      res.status(500).json({ message: "Failed to submit price quote request" });
    }
  });

  // Test email endpoint for order confirmation
  app.post('/api/test-order-email', requireAuth, async (req: any, res) => {
    try {
      const { orderId, testEmail } = req.body;
      
      if (!orderId || !testEmail) {
        return res.status(400).json({ message: "Order ID and test email are required" });
      }

      // Get the order with all details
      const order = await storage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Get wholesaler details
      const wholesaler = await storage.getUser(order.wholesalerId);
      if (!wholesaler) {
        return res.status(404).json({ message: "Wholesaler not found" });
      }

      // Create test customer data
      const testCustomer = {
        name: `${order.retailer.firstName || 'Test'} ${order.retailer.lastName || 'Customer'}`,
        email: testEmail,
        phone: order.retailer.businessPhone || 'N/A',
        address: order.deliveryAddress || 'Test Address'
      };

      // Enrich items with product details for email
      const enrichedItems = await Promise.all(order.items.map(async (item: any) => {
        const product = await storage.getProduct(item.productId);
        return {
          ...item,
          productName: product?.name || `Product #${item.productId}`,
          product: product ? { name: product.name } : null
        };
      }));

      // Send test email
      await sendCustomerInvoiceEmail(testCustomer, order, enrichedItems, wholesaler);
      
      res.json({ 
        message: "Test email sent successfully",
        sentTo: testEmail,
        orderId: orderId
      });
    } catch (error) {
      console.error("Error sending test email:", error);
      res.status(500).json({ message: "Failed to send test email", error: error.message });
    }
  });

  // Enhanced email diagnostics endpoint
  app.post("/api/orders/diagnose-email", async (req, res) => {
    try {
      const { testEmail } = req.body;
      
      if (!testEmail) {
        return res.status(400).json({ message: "Test email is required" });
      }

      const sgMail = (await import('@sendgrid/mail')).default;
      
      if (!process.env.SENDGRID_API_KEY) {
        return res.status(500).json({ message: "SendGrid API key not configured" });
      }

      sgMail.setApiKey(process.env.SENDGRID_API_KEY);

      // Send a simple test email with detailed tracking
      const msg = {
        to: testEmail,
        from: 'hello@quikpik.co',
        subject: 'Email Delivery Test - Quikpik Merchant',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #22c55e;">Email Delivery Test</h2>
            <p>This is a test email to verify email delivery is working correctly.</p>
            <p><strong>Test Time:</strong> ${new Date().toISOString()}</p>
            <p><strong>From:</strong> Quikpik Merchant Platform</p>
            <p><strong>To:</strong> ${testEmail}</p>
            <div style="background: #f0f9ff; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <h4>Troubleshooting Tips:</h4>
              <ul>
                <li>Check your spam/junk folder</li>
                <li>Add hello@quikpik.co to your contacts</li>
                <li>Check email filters that might be blocking emails</li>
              </ul>
            </div>
            <p style="color: #666; font-size: 12px; margin-top: 30px;">
              If you received this email, delivery is working correctly.
            </p>
          </div>
        `,
        tracking_settings: {
          click_tracking: {
            enable: true,
            enable_text: false
          },
          open_tracking: {
            enable: true
          },
          subscription_tracking: {
            enable: false
          }
        }
      };

      const response = await sgMail.send(msg);
      
      res.json({
        message: "Diagnostic email sent successfully",
        sentTo: testEmail,
        statusCode: response[0].statusCode,
        messageId: response[0].headers['x-message-id'],
        deliveryStatus: response[0].statusCode === 202 ? 'accepted' : 'unknown',
        troubleshooting: {
          checkSpamFolder: true,
          addToContacts: 'hello@quikpik.co',
          checkFilters: true
        }
      });
    } catch (error: any) {
      console.error("Email diagnostic error:", error);
      res.status(500).json({ 
        message: "Error sending diagnostic email",
        error: error.message,
        details: error.response?.body
      });
    }
  });

  // Generate and download invoice PDF
  app.get('/api/orders/:id/invoice', requireAuth, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user.id;

      const order = await storage.getOrder(id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Only wholesaler can generate invoices for their orders
      if (order.wholesalerId !== userId) {
        return res.status(403).json({ message: "Not authorized to generate invoice for this order" });
      }

      const wholesaler = await storage.getUser(userId);
      if (!wholesaler) {
        return res.status(404).json({ message: "Wholesaler not found" });
      }

      // Generate invoice HTML (reuse the email template but optimized for PDF)
      const customerName = `${order.retailer.firstName} ${order.retailer.lastName || ''}`.trim();
      const businessName = wholesaler.businessName || 'Quikpik Merchant';
      const currency = wholesaler.preferredCurrency || 'GBP';
      const currencySymbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '£';
      
      const itemsList = order.items.map(item => 
        `<tr style="border-bottom: 1px solid #eee;">
          <td style="padding: 12px 8px; border-right: 1px solid #eee;">${item.product.name}</td>
          <td style="padding: 12px 8px; border-right: 1px solid #eee; text-align: center;">${item.quantity}</td>
          <td style="padding: 12px 8px; border-right: 1px solid #eee; text-align: right;">${currencySymbol}${parseFloat(item.unitPrice).toFixed(2)}</td>
          <td style="padding: 12px 8px; text-align: right; font-weight: bold;">${currencySymbol}${(parseFloat(item.unitPrice) * item.quantity).toFixed(2)}</td>
        </tr>`
      ).join('');

      const subtotal = order.items.reduce((sum: number, item: any) => sum + (parseFloat(item.unitPrice) * item.quantity), 0);
      const platformFee = subtotal * 0.05;
      const total = subtotal + platformFee;

      const invoiceHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Invoice #${order.id} - ${businessName}</title>
  <style>
    body { margin: 0; padding: 20px; font-family: Arial, sans-serif; }
    .container { max-width: 800px; margin: 0 auto; }
    .header { background: #22c55e; color: white; padding: 30px; text-align: center; }
    .content { padding: 30px; }
    .flex { display: flex; justify-content: space-between; margin-bottom: 30px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
    th, td { padding: 12px 8px; border: 1px solid #e5e7eb; }
    th { background-color: #f9fafb; font-weight: 600; }
    .totals { border-top: 2px solid #e5e7eb; padding-top: 20px; }
    .total-row { display: flex; justify-content: space-between; margin-bottom: 10px; }
    .final-total { font-size: 18px; font-weight: bold; color: #22c55e; padding: 15px 0; border-top: 1px solid #e5e7eb; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${businessName}</h1>
      <h2>INVOICE #${order.id}</h2>
    </div>
    
    <div class="content">
      <div class="flex">
        <div>
          <h3>Bill To:</h3>
          <p>${customerName}<br/>
          ${order.customerEmail || order.retailer?.email || ''}<br/>
          ${order.customerPhone || order.retailer?.phoneNumber || ''}</p>
        </div>
        <div>
          <h3>Invoice Details:</h3>
          <p>Date: ${new Date(order.createdAt).toLocaleDateString()}<br/>
          Status: ${order.status.charAt(0).toUpperCase() + order.status.slice(1)}<br/>
          Order #${order.id}</p>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Product</th>
            <th>Qty</th>
            <th>Unit Price</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemsList}
        </tbody>
      </table>

      <div class="totals">
        <div class="total-row">
          <span>Subtotal:</span>
          <span>${currencySymbol}${subtotal.toFixed(2)}</span>
        </div>
        <div class="total-row">
          <span>Platform Fee (5%):</span>
          <span>${currencySymbol}${platformFee.toFixed(2)}</span>
        </div>
        <div class="final-total">
          <div class="total-row">
            <span>Total:</span>
            <span>${currencySymbol}${total.toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div style="margin-top: 40px; text-align: center; border-top: 1px solid #e5e7eb; padding-top: 20px;">
        <p>Thank you for your business!</p>
        <small>Generated by Quikpik Merchant Platform on ${new Date().toLocaleDateString()}</small>
      </div>
    </div>
  </div>
</body>
</html>`;

      // Generate PDF using Puppeteer
      const puppeteer = await import('puppeteer');
      const browser = await puppeteer.default.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      const page = await browser.newPage();
      await page.setContent(invoiceHtml, { waitUntil: 'networkidle0' });
      
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20mm',
          right: '20mm',
          bottom: '20mm',
          left: '20mm'
        }
      });
      
      await browser.close();

      // Set headers for PDF download
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="invoice-${order.id}.pdf"`);
      res.send(pdfBuffer);

    } catch (error) {
      console.error("Error generating invoice:", error);
      res.status(500).json({ message: "Failed to generate invoice" });
    }
  });

  // Send simple receipt email for existing order
  app.post('/api/orders/:id/send-receipt', requireAuth, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user.id;

      const order = await storage.getOrder(id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Only wholesaler can send receipts for their orders
      if (order.wholesalerId !== userId) {
        return res.status(403).json({ message: "Not authorized to send receipt for this order" });
      }

      const wholesaler = await storage.getUser(userId);
      
      if (!wholesaler) {
        return res.status(404).json({ message: "Wholesaler not found" });
      }

      // Get customer data from Stripe payment intent
      if (!order.stripePaymentIntentId) {
        return res.status(400).json({ message: "No payment information found for this order" });
      }

      let customerInfo;
      try {
        // Retrieve payment intent from Stripe to get customer data
        const paymentIntent = await stripe!.paymentIntents.retrieve(order.stripePaymentIntentId);
        
        if (paymentIntent.metadata) {
          customerInfo = {
            email: paymentIntent.metadata.customerEmail,
            name: paymentIntent.metadata.customerName,
            phone: paymentIntent.metadata.customerPhone
          };
        } else {
          // Fallback to stored data if no metadata
          customerInfo = {
            email: order.customerEmail || order.retailer?.email,
            name: order.customerName || `Customer ${order.id}`,
            phone: order.customerPhone || order.retailer?.phoneNumber
          };
        }
      } catch (stripeError) {
        console.error("Error retrieving Stripe data:", stripeError);
        // Fallback to stored data
        customerInfo = {
          email: order.customerEmail || order.retailer?.email,
          name: order.customerName || `Customer ${order.id}`,
          phone: order.customerPhone || order.retailer?.phoneNumber
        };
      }

      if (!customerInfo.email) {
        return res.status(400).json({ message: "No customer email found for this order" });
      }

      console.log(`📧 Sending receipt to: ${customerInfo.email} for customer: ${customerInfo.name}`);

      // Get order items with product details
      const orderItems = await storage.getOrderItems(order.id);
      const enrichedItems = await Promise.all(orderItems.map(async (item: any) => {
        const product = await storage.getProduct(item.productId);
        return {
          ...item,
          productName: product?.name || `Product #${item.productId}`,
          product: product ? { name: product.name } : null
        };
      }));

      // Send receipt email using Stripe customer data
      await sendCustomerInvoiceEmail(customerInfo, order, enrichedItems, wholesaler);

      res.json({ 
        success: true, 
        message: `Receipt sent successfully to ${customerInfo.email}`
      });

    } catch (error) {
      console.error("Error sending receipt:", error);
      res.status(500).json({ message: "Failed to send receipt: " + error.message });
    }
  });

  // Get customer data from Stripe for order display
  app.get('/api/orders/:id/stripe-customer-data', requireAuth, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const userId = req.user.id;

      const order = await storage.getOrder(id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Only wholesaler can view customer data for their orders
      if (order.wholesalerId !== userId) {
        return res.status(403).json({ message: "Not authorized to view customer data for this order" });
      }

      if (!order.stripePaymentIntentId) {
        return res.json({
          customerName: order.customerName || null,
          customerEmail: order.customerEmail || null,
          customerPhone: order.customerPhone || null
        });
      }

      try {
        // Retrieve payment intent from Stripe to get customer data
        const paymentIntent = await stripe!.paymentIntents.retrieve(order.stripePaymentIntentId);
        
        const customerData = {
          customerName: paymentIntent.metadata?.customerName || order.customerName || null,
          customerEmail: paymentIntent.metadata?.customerEmail || order.customerEmail || null,
          customerPhone: paymentIntent.metadata?.customerPhone || order.customerPhone || null
        };

        res.json(customerData);
      } catch (stripeError) {
        console.error("Error retrieving Stripe customer data:", stripeError);
        // Return stored data as fallback
        res.json({
          customerName: order.customerName || null,
          customerEmail: order.customerEmail || null,
          customerPhone: order.customerPhone || null
        });
      }

    } catch (error) {
      console.error("Error fetching customer data:", error);
      res.status(500).json({ message: "Failed to fetch customer data" });
    }
  });

  // User onboarding endpoints
  app.patch('/api/user/onboarding', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { completed, skipped, step } = req.body;

      const updateData: any = {};
      
      if (completed !== undefined) {
        updateData.onboardingCompleted = completed;
        updateData.isFirstLogin = false;
      }
      
      if (skipped !== undefined) {
        updateData.onboardingSkipped = skipped;
        updateData.isFirstLogin = false;
      }
      
      if (step !== undefined) {
        updateData.onboardingStep = step;
      }

      await storage.updateUserOnboarding(userId, updateData);
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating onboarding:", error);
      res.status(500).json({ message: "Failed to update onboarding status" });
    }
  });

  // Subscription endpoints (duplicate removed - using the main one above)

  app.get('/api/subscription/status', requireAuth, async (req: any, res) => {
    try {
      let user = await storage.getUser(req.user.claims?.sub || req.user.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      
      // Debug logging for subscription status
      console.log(`📊 Subscription status check for user ${user.id}: tier=${user.subscriptionTier}, status=${user.subscriptionStatus}`);

      // If this is a team member, get the wholesaler's subscription info
      if (req.user.role === 'team_member' && req.user.wholesalerId) {
        const wholesalerInfo = await storage.getUser(req.user.wholesalerId);
        if (wholesalerInfo) {
          user = wholesalerInfo; // Use wholesaler's subscription for limits
        }
      }

      // Get product count for this user
      const products = await storage.getProducts(user.id);
      const productCount = products.length;

      // Get team member count for this user
      const teamMembers = await storage.getTeamMembers(user.id);
      const teamMemberCount = teamMembers.length;

      const subscriptionData = {
        subscriptionTier: user.subscriptionTier || 'free',
        subscriptionStatus: user.subscriptionStatus || 'inactive',
        productCount: productCount,
        productLimit: getProductLimit(user.subscriptionTier || 'free'),
        editLimit: getEditLimit(user.subscriptionTier || 'free'),
        customerGroupLimit: getCustomerGroupLimit(user.subscriptionTier || 'free'),
        broadcastLimit: getBroadcastLimit(user.subscriptionTier || 'free'),
        customersPerGroupLimit: getCustomersPerGroupLimit(user.subscriptionTier || 'free'),
        teamMemberCount: teamMemberCount,
        teamMemberLimit: getTeamMemberLimit(user.subscriptionTier || 'free'),
        isTeamMember: req.user.isTeamMember || false,
        expiresAt: user.subscriptionEndsAt
      };

      res.json(subscriptionData);
    } catch (error) {
      console.error('Subscription status error:', error);
      res.status(500).json({ error: "Failed to get subscription status" });
    }
  });

  // Duplicate removed - subscription management handled by /api/subscription/downgrade

  // Debug endpoint to check subscription data
  app.get('/api/subscription/debug', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id || req.user.claims?.sub;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      console.log(`🐛 Debug subscription data for user ${userId}:`, {
        id: user.id,
        email: user.email,
        subscriptionTier: user.subscriptionTier,
        subscriptionStatus: user.subscriptionStatus,
        stripeSubscriptionId: user.stripeSubscriptionId,
        productLimit: user.productLimit,
        subscriptionEndsAt: user.subscriptionEndsAt
      });

      res.json({
        userId: user.id,
        email: user.email,
        subscriptionTier: user.subscriptionTier,
        subscriptionStatus: user.subscriptionStatus,
        stripeSubscriptionId: user.stripeSubscriptionId,
        productLimit: user.productLimit,
        subscriptionEndsAt: user.subscriptionEndsAt,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Debug subscription error:', error);
      res.status(500).json({ error: "Failed to get debug data" });
    }
  });

  // Manual subscription upgrade endpoint for successful payments
  // Duplicate removed - manual upgrades handled by /api/subscription/upgrade

  // Manual subscription data refresh endpoint
  // Duplicate removed - refresh functionality integrated into main endpoints

  // Subscription audit log endpoints
  app.get('/api/subscription/audit-logs', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id || req.user.claims?.sub;
      
      // Get subscription history for this user
      const auditLogs = await SubscriptionLogger.getUserSubscriptionHistory(userId);
      
      res.json({
        success: true,
        logs: auditLogs,
        count: auditLogs.length
      });
    } catch (error) {
      console.error('Error fetching subscription audit logs:', error);
      res.status(500).json({ error: "Failed to fetch subscription history" });
    }
  });

  app.get('/api/subscription/stats', requireAuth, async (req: any, res) => {
    try {
      const { timeRange } = req.query;
      
      // Get subscription statistics
      const stats = await SubscriptionLogger.getSubscriptionStats(timeRange as any || '30d');
      
      if (!stats) {
        return res.status(500).json({ error: "Failed to generate subscription statistics" });
      }
      
      res.json({
        success: true,
        timeRange: timeRange || '30d',
        stats
      });
    } catch (error) {
      console.error('Error fetching subscription stats:', error);
      res.status(500).json({ error: "Failed to fetch subscription statistics" });
    }
  });

  // Universal plan change endpoint (handles both upgrades and downgrades)
  app.post('/api/subscription/change-plan', requireAuth, async (req: any, res) => {
    try {
      const { targetTier } = req.body;
      const userId = req.user.id || req.user.claims?.sub;
      
      console.log(`🔄 Plan change request: User ${userId} wants to change to ${targetTier}`);
      
      if (!targetTier) {
        return res.status(400).json({ error: "Target tier is required" });
      }

      const validTiers = ['free', 'standard', 'premium'];
      if (!validTiers.includes(targetTier)) {
        return res.status(400).json({ error: "Invalid target tier" });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Check if user is already on this tier
      console.log(`🔍 Current tier: ${user.subscriptionTier}, Target tier: ${targetTier}`);
      if (user.subscriptionTier === targetTier) {
        console.log(`❌ User ${userId} already on ${targetTier} plan`);
        return res.status(400).json({ error: `You are already on the ${targetTier} plan` });
      }

      // Determine if this is an upgrade or downgrade
      const tierOrder = { free: 0, standard: 1, premium: 2 };
      const currentTierOrder = tierOrder[user.subscriptionTier as keyof typeof tierOrder] || 0;
      const targetTierOrder = tierOrder[targetTier as keyof typeof tierOrder] || 0;
      
      const isUpgrade = targetTierOrder > currentTierOrder;
      
      if (isUpgrade) {
        // For upgrades, redirect to Stripe checkout
        if (!stripe) {
          return res.status(500).json({ error: "Payment system not configured. Please contact support." });
        }

        // Create Stripe checkout session for the upgrade
        const priceData = {
          standard: {
            unit_amount: 1099, // £10.99 in pence
            currency: 'gbp',
            product_data: {
              name: 'Quikpik Standard Plan',
              description: 'Up to 10 products, advanced features'
            }
          },
          premium: {
            unit_amount: 1999, // £19.99 in pence  
            currency: 'gbp',
            product_data: {
              name: 'Quikpik Premium Plan',
              description: 'Unlimited products, all premium features'
            }
          }
        };

        const session = await stripe.checkout.sessions.create({
          payment_method_types: ['card'],
          line_items: [
            {
              price_data: priceData[targetTier as keyof typeof priceData],
              quantity: 1,
            },
          ],
          mode: 'payment',
          success_url: `${req.headers.origin}/subscription-settings?success=true&plan=${targetTier}`,
          cancel_url: `${req.headers.origin}/subscription-settings?canceled=true`,
          customer_email: user.email,
          metadata: {
            userId: userId,
            targetTier: targetTier,
            upgradeFromTier: user.subscriptionTier || 'free'
          },
        });

        // Log the upgrade attempt
        await logSubscriptionUpgrade(userId, user.subscriptionTier || 'free', targetTier, {
          source: 'plan_change_modal',
          stripeSessionId: session.id,
          amount: priceData[targetTier as keyof typeof priceData].unit_amount / 100,
          currency: 'gbp'
        });

        res.json({ 
          url: session.url,
          sessionId: session.id,
          message: "Redirecting to payment..."
        });
      } else {
        // For downgrades, handle immediately
        let newProductLimit = 3;
        switch (targetTier) {
          case 'free':
            newProductLimit = 3;
            break;
          case 'standard':
            newProductLimit = 10;
            break;
          case 'premium':
            newProductLimit = -1;
            break;
        }

        // Update user subscription tier immediately
        await storage.updateUser(userId, {
          subscriptionTier: targetTier,
          subscriptionStatus: targetTier === 'free' ? 'inactive' : 'active',
          productLimit: newProductLimit,
          subscriptionEndsAt: targetTier === 'free' ? null : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        });

        // Log the downgrade
        await logSubscriptionDowngrade(userId, user.subscriptionTier || 'free', targetTier, {
          source: 'plan_change_modal',
          reason: 'user_requested',
          effectiveDate: new Date().toISOString()
        });

        console.log(`✅ Downgrade completed for user ${userId}: ${user.subscriptionTier} → ${targetTier}`);

        res.json({
          success: true,
          subscriptionTier: targetTier,
          subscriptionStatus: targetTier === 'free' ? 'inactive' : 'active',
          productLimit: newProductLimit,
          message: `Successfully downgraded to ${targetTier} plan`
        });
      }
    } catch (error) {
      console.error('Plan change error:', error);
      res.status(500).json({ error: "Failed to process plan change" });
    }
  });

  // Free downgrades (no payment required)
  app.post('/api/subscription/downgrade', requireAuth, async (req: any, res) => {
    try {
      const { targetTier } = req.body;
      const userId = req.user.id || req.user.claims?.sub;
      
      console.log(`🔽 Downgrade request: User ${userId} wants to downgrade to ${targetTier}`);
      
      if (!targetTier) {
        return res.status(400).json({ error: "Target tier is required" });
      }

      const validTiers = ['free', 'standard', 'premium'];
      if (!validTiers.includes(targetTier)) {
        return res.status(400).json({ error: "Invalid target tier" });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Check if this is actually a downgrade or if user is already on the target tier
      const tierOrder = { free: 0, standard: 1, premium: 2 };
      const currentTierOrder = tierOrder[user.subscriptionTier as keyof typeof tierOrder] || 0;
      const targetTierOrder = tierOrder[targetTier as keyof typeof tierOrder] || 0;

      if (user.subscriptionTier === targetTier) {
        return res.status(200).json({ 
          success: true,
          message: `You are already on the ${targetTier} plan`,
          newTier: targetTier,
          productLimit: user.productLimit || getProductLimit(targetTier),
          status: user.subscriptionStatus || 'active',
          alreadyOnPlan: true
        });
      }

      if (targetTierOrder > currentTierOrder) {
        return res.status(400).json({ error: "This is not a downgrade. Use upgrade endpoint instead." });
      }

      // Get new product limit for the target tier
      let newProductLimit = 3;
      switch (targetTier) {
        case 'free':
          newProductLimit = 3;
          break;
        case 'standard':
          newProductLimit = 10;
          break;
        case 'premium':
          newProductLimit = -1;
          break;
      }

      // Cancel existing Stripe subscription if any
      if (user.stripeSubscriptionId && user.subscriptionStatus === 'active') {
        try {
          await stripe!.subscriptions.cancel(user.stripeSubscriptionId);
          console.log(`✅ Cancelled Stripe subscription: ${user.stripeSubscriptionId}`);
        } catch (stripeError) {
          console.error('Error cancelling Stripe subscription:', stripeError);
        }
      }

      // Update user subscription to lower tier
      await storage.updateUser(userId, {
        subscriptionTier: targetTier,
        subscriptionStatus: targetTier === 'free' ? 'inactive' : 'active',
        productLimit: newProductLimit,
        subscriptionEndsAt: targetTier === 'free' ? null : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        stripeSubscriptionId: targetTier === 'free' ? null : user.stripeSubscriptionId
      });

      console.log(`✅ Downgrade completed: User ${userId} is now on ${targetTier} plan`);

      res.json({
        success: true,
        message: `Successfully downgraded to ${targetTier} plan`,
        newTier: targetTier,
        productLimit: newProductLimit,
        status: targetTier === 'free' ? 'inactive' : 'active'
      });

    } catch (error) {
      console.error('Downgrade error:', error);
      res.status(500).json({ error: "Failed to downgrade plan" });
    }
  });

  // Paid upgrades (payment required via Stripe)
  app.post('/api/subscription/upgrade', requireAuth, async (req: any, res) => {
    try {
      const { targetTier } = req.body;
      const userId = req.user.id || req.user.claims?.sub;
      
      console.log(`🔼 Upgrade request: User ${userId} wants to upgrade to ${targetTier}`);
      
      if (!targetTier) {
        return res.status(400).json({ error: "Target tier is required" });
      }

      const validTiers = ['standard', 'premium']; // Only paid tiers for upgrades
      if (!validTiers.includes(targetTier)) {
        return res.status(400).json({ error: "Invalid upgrade tier. Use free for downgrades." });
      }

      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Check if this is actually an upgrade
      const tierOrder = { free: 0, standard: 1, premium: 2 };
      const currentTierOrder = tierOrder[user.subscriptionTier as keyof typeof tierOrder] || 0;
      const targetTierOrder = tierOrder[targetTier as keyof typeof tierOrder] || 0;

      if (targetTierOrder <= currentTierOrder) {
        return res.status(400).json({ error: "This is not an upgrade. Use downgrade endpoint instead." });
      }

      // Check if Stripe is configured
      if (!stripe) {
        console.error('Stripe not configured - STRIPE_SECRET_KEY missing');
        return res.status(500).json({ error: "Payment system not configured. Please contact support." });
      }

      // Create Stripe checkout session for the upgrade
      const priceData = {
        standard: {
          unit_amount: 1099, // £10.99 in pence
          currency: 'gbp',
          product_data: {
            name: 'Quikpik Standard Plan',
            description: 'Up to 10 products, advanced features'
          }
        },
        premium: {
          unit_amount: 1999, // £19.99 in pence  
          currency: 'gbp',
          product_data: {
            name: 'Quikpik Premium Plan',
            description: 'Unlimited products, all premium features'
          }
        }
      };

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: priceData[targetTier as keyof typeof priceData],
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: `${req.headers.origin}/subscription-settings?success=true&plan=${targetTier}`,
        cancel_url: `${req.headers.origin}/subscription-settings?canceled=true`,
        customer_email: user.email,
        metadata: {
          userId: userId,
          targetTier: targetTier,
          upgradeFromTier: user.subscriptionTier
        }
      });

      console.log(`✅ Created Stripe checkout session for ${targetTier} upgrade: ${session.id}`);

      res.json({
        success: true,
        checkoutUrl: session.url,
        sessionId: session.id,
        message: `Redirecting to payment for ${targetTier} plan upgrade`
      });

    } catch (error) {
      console.error('Upgrade error:', error);
      res.status(500).json({ error: "Failed to create upgrade payment session" });
    }
  });

  // REMOVED: Duplicate webhook handlers moved to beginning of route registration

  // REMOVED: Debug webhook handler removed - using enhanced primary webhook handler only

  // REMOVED: Backup webhook handler removed - using enhanced primary webhook handler only

  function getProductLimit(tier: string): number {
    switch (tier) {
      case 'free': return 3;
      case 'standard': return 10;
      case 'premium': return -1; // Unlimited
      default: return 3;
    }
  }

  function getEditLimit(tier: string): number {
    switch (tier) {
      case 'free': return 3;
      case 'standard': return 10; // 10 edits for standard
      case 'premium': return -1; // Unlimited for premium only
      default: return 3;
    }
  }

  function getCustomerGroupLimit(tier: string): number {
    switch (tier) {
      case 'free': return 2;
      case 'standard': return 5;
      case 'premium': return -1; // unlimited
      default: return 2;
    }
  }

  function getBroadcastLimit(tier: string): number {
    switch (tier) {
      case 'free': return 5; // 5 broadcasts per month
      case 'standard': return 25; // 25 broadcasts per month
      case 'premium': return -1; // unlimited
      default: return 5;
    }
  }

  function getCustomersPerGroupLimit(tier: string): number {
    switch (tier) {
      case 'free': return 10; // 10 customers per group
      case 'standard': return 50; // 50 customers per group
      case 'premium': return -1; // unlimited
      default: return 10;
    }
  }

  function getTeamMemberLimit(tier: string): number {
    switch (tier) {
      case 'free': return 0; // No team members
      case 'standard': return 2; // 2 team members
      case 'premium': return 5; // 5 team members
      default: return 0;
    }
  }

  const httpServer = createServer(app);

  // Stock Alert endpoints
  app.get('/api/stock-alerts', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const alerts = await storage.getUnresolvedStockAlerts(userId);
      res.json(alerts);
    } catch (error) {
      console.error("Error fetching stock alerts:", error);
      res.status(500).json({ message: "Failed to fetch stock alerts" });
    }
  });

  app.get('/api/stock-alerts/count', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const count = await storage.getUnresolvedStockAlertsCount(userId);
      res.json({ count });
    } catch (error) {
      console.error("Error fetching stock alerts count:", error);
      res.status(500).json({ message: "Failed to fetch stock alerts count" });
    }
  });

  app.patch('/api/stock-alerts/:alertId/read', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { alertId } = req.params;
      await storage.markStockAlertAsRead(parseInt(alertId), userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking alert as read:", error);
      res.status(500).json({ message: "Failed to mark alert as read" });
    }
  });

  app.patch('/api/stock-alerts/:alertId/resolve', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { alertId } = req.params;
      await storage.resolveStockAlert(parseInt(alertId), userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error resolving alert:", error);
      res.status(500).json({ message: "Failed to resolve alert" });
    }
  });

  app.patch('/api/products/:productId/low-stock-threshold', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { productId } = req.params;
      const { threshold } = req.body;
      
      if (!threshold || threshold < 0) {
        return res.status(400).json({ message: "Valid threshold required" });
      }

      await storage.updateProductLowStockThreshold(parseInt(productId), userId, parseInt(threshold));
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating low stock threshold:", error);
      res.status(500).json({ message: "Failed to update threshold" });
    }
  });

  app.patch('/api/settings/default-low-stock-threshold', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { threshold } = req.body;
      
      if (!threshold || threshold < 0) {
        return res.status(400).json({ message: "Valid threshold required" });
      }

      await storage.updateDefaultLowStockThreshold(userId, parseInt(threshold));
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating default threshold:", error);
      res.status(500).json({ message: "Failed to update default threshold" });
    }
  });

  // Team Management API Routes
  app.get('/api/team-members', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const teamMembers = await storage.getTeamMembers(userId);
      res.json(teamMembers);
    } catch (error) {
      console.error("Error fetching team members:", error);
      res.status(500).json({ message: "Failed to fetch team members" });
    }
  });

  app.post('/api/team-members', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { email, firstName, lastName, role, permissions } = req.body;
      
      // Check subscription limits
      const currentCount = await storage.getTeamMembersCount(userId);
      const userSubscription = await storage.getUser(userId);
      const tier = userSubscription?.subscriptionTier || 'free';
      
      let limit = 0;
      switch (tier) {
        case 'standard': limit = 2; break;
        case 'premium': limit = 5; break;
      }
      
      if (currentCount >= limit) {
        return res.status(403).json({ 
          message: `Your ${tier} plan allows up to ${limit} team members. Please upgrade to add more team members.`
        });
      }

      const teamMember = await storage.createTeamMember({
        wholesalerId: userId,
        email,
        firstName,
        lastName,
        role: role || 'member',
        permissions: permissions || ['products', 'orders', 'customers'],
      });

      // Send invitation email
      try {
        await sendTeamInvitationEmail(teamMember, req.user);
      } catch (emailError) {
        console.error("Error sending invitation email:", emailError);
        // Don't fail the team member creation if email fails
      }

      res.json(teamMember);
    } catch (error) {
      console.error("Error creating team member:", error);
      res.status(500).json({ message: "Failed to create team member" });
    }
  });

  // Update team member role
  app.patch('/api/team-members/:id/role', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      const { role } = req.body;
      
      if (!role || !['admin', 'member'].includes(role)) {
        return res.status(400).json({ message: "Invalid role. Must be 'admin' or 'member'" });
      }
      
      // Get team member and verify ownership
      const teamMembers = await storage.getTeamMembers(userId);
      const teamMember = teamMembers.find(member => member.id === parseInt(id));
      
      if (!teamMember) {
        return res.status(404).json({ message: "Team member not found" });
      }
      
      // Update team member role
      await storage.updateTeamMemberRole(parseInt(id), role);
      
      res.json({ message: "Team member role updated successfully" });
    } catch (error) {
      console.error("Error updating team member role:", error);
      res.status(500).json({ message: "Failed to update team member role" });
    }
  });

  app.delete('/api/team-members/:id', requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      
      await storage.deleteTeamMember(parseInt(id));
      res.json({ message: "Team member removed successfully" });
    } catch (error) {
      console.error("Error deleting team member:", error);
      res.status(500).json({ message: "Failed to delete team member" });
    }
  });

  app.post('/api/team-members/:id/resend-invite', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { id } = req.params;
      
      // Get team member details
      const teamMembers = await storage.getTeamMembers(userId);
      const teamMember = teamMembers.find(member => member.id === parseInt(id));
      
      if (!teamMember) {
        return res.status(404).json({ message: "Team member not found" });
      }
      
      if (teamMember.status !== 'pending') {
        return res.status(400).json({ message: "Can only resend invites to pending members" });
      }

      // Send invitation email
      try {
        await sendTeamInvitationEmail(teamMember, req.user);
        res.json({ message: "Invitation resent successfully" });
      } catch (emailError) {
        console.error("Error resending invitation email:", emailError);
        res.status(500).json({ message: "Failed to resend invitation email" });
      }
    } catch (error) {
      console.error("Error resending team invitation:", error);
      res.status(500).json({ message: "Failed to resend invitation" });
    }
  });

  // Team invitation acceptance endpoints
  app.get('/api/team-invitation/:token', async (req, res) => {
    try {
      const { token } = req.params;
      const { email } = req.query;
      
      if (!email) {
        return res.status(400).json({ message: "Email parameter is required" });
      }

      // Get team member by ID and verify email matches
      const teamMembers = await storage.getAllTeamMembers();
      const teamMember = teamMembers.find(member => 
        member.id === parseInt(token) && 
        member.email === email && 
        member.status === 'pending'
      );
      
      if (!teamMember) {
        return res.status(404).json({ message: "Invalid or expired invitation" });
      }

      // Get wholesaler details
      const wholesaler = await storage.getUser(teamMember.wholesalerId);
      
      res.json({
        teamMember: {
          firstName: teamMember.firstName,
          lastName: teamMember.lastName,
          email: teamMember.email,
          role: teamMember.role
        },
        wholesaler: {
          name: wholesaler?.firstName + ' ' + (wholesaler?.lastName || ''),
          businessName: wholesaler?.businessName,
          email: wholesaler?.email
        }
      });
    } catch (error) {
      console.error("Error fetching team invitation:", error);
      res.status(500).json({ message: "Failed to fetch invitation details" });
    }
  });

  app.post('/api/team-invitation/accept', async (req, res) => {
    try {
      const { token, email, firstName, lastName, password } = req.body;
      
      if (!token || !email || !firstName || !password) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      // Get team member by ID and verify email matches
      const teamMembers = await storage.getAllTeamMembers();
      const teamMember = teamMembers.find(member => 
        member.id === parseInt(token) && 
        member.email === email && 
        member.status === 'pending'
      );
      
      if (!teamMember) {
        return res.status(404).json({ message: "Invalid or expired invitation" });
      }

      // Create user account for team member with generated ID
      const userId = `team_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const userData = {
        id: userId,
        email: teamMember.email,
        firstName: firstName,
        lastName: lastName || '',
        role: 'wholesaler', // Team members are wholesaler role with limited permissions
        subscriptionTier: 'team_member', // Special tier for team members
        subscriptionStatus: 'active',
        businessName: '',
        businessDescription: '',
        businessPhone: '',
        businessAddress: '',
        preferredCurrency: 'GBP',
        onboardingCompleted: true, // Team members skip onboarding
        onboardingStep: 0,
        isFirstLogin: false,
        productLimit: -1, // Team members inherit wholesaler's limits
        // passwordHash will be set by createUserWithPassword method
      };

      const newUser = await storage.createUserWithPassword(userData, password);
      
      // Update team member status to active and link to user
      await storage.updateTeamMemberStatus(teamMember.id, 'active');
      
      res.json({ 
        message: "Team member account created successfully",
        userId: newUser.id 
      });
    } catch (error) {
      console.error("Error accepting team invitation:", error);
      res.status(500).json({ message: "Failed to accept invitation" });
    }
  });

  // Welcome email function
  async function sendWelcomeEmail(user: any) {
    if (!process.env.SENDGRID_API_KEY) {
      console.log("⚠️ SendGrid not configured, skipping welcome email");
      return;
    }

    try {
      sgMail.setApiKey(process.env.SENDGRID_API_KEY);

      const welcomeEmailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Welcome to Quikpik</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: linear-gradient(135deg, #059669 0%, #047857 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="color: white; margin: 0; font-size: 28px;">Welcome to Quikpik!</h1>
            <p style="color: white; margin: 10px 0 0 0; font-size: 16px;">The Future of B2B Wholesale</p>
          </div>
          
          <div style="background: #fff; padding: 30px; border: 1px solid #e5e7eb; border-top: none;">
            <h2 style="color: #059669; margin-top: 0;">Hello ${user.firstName}!</h2>
            
            <p>Congratulations on joining Quikpik, the intelligent platform transforming how wholesale businesses connect, communicate, and grow. You've taken the first step toward revolutionizing your wholesale operations.</p>
            
            <div style="background: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #059669; margin-top: 0;">Our Mission</h3>
              <p style="margin-bottom: 0;">Empower small and medium wholesalers with enterprise-level tools that streamline operations, boost revenue, and unlock new growth opportunities.</p>
            </div>
            
            <h3 style="color: #059669;">What You Can Do Right Now:</h3>
            <ul style="padding-left: 20px;">
              <li><strong>Add Your Products:</strong> Upload your inventory with photos, pricing, and stock levels</li>
              <li><strong>Create Customer Groups:</strong> Organize your retail customers for targeted communication</li>
              <li><strong>Send WhatsApp Broadcasts:</strong> Instantly notify customers about new stock and promotions</li>
              <li><strong>Process Orders:</strong> Accept online payments and manage orders efficiently</li>
              <li><strong>Track Analytics:</strong> Monitor sales performance and customer engagement</li>
            </ul>
            
            <h3 style="color: #059669;">Coming Soon - Advanced Features:</h3>
            <ul style="padding-left: 20px;">
              <li>🤖 <strong>AI-Powered Insights:</strong> Demand forecasting and inventory optimization</li>
              <li>🌐 <strong>B2B Marketplace:</strong> Connect with new retail customers across industries</li>
              <li>🚚 <strong>Integrated Logistics:</strong> Streamlined shipping and delivery partnerships</li>
              <li>💱 <strong>Global Trade Support:</strong> Multi-currency and international commerce tools</li>
              <li>📊 <strong>Industry Intelligence:</strong> Benchmarking and competitive insights</li>
              <li>👥 <strong>Customer Success:</strong> Dedicated support and business growth guidance</li>
            </ul>
            
            <div style="background: #059669; color: white; padding: 20px; border-radius: 8px; margin: 30px 0; text-align: center;">
              <h3 style="margin-top: 0; color: white;">Get Started Today</h3>
              <p style="margin-bottom: 15px;">Your free account includes 3 products, customer groups, and WhatsApp messaging.</p>
              <a href="https://quikpik.app" 
                 style="background: white; color: #059669; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                Access Your Dashboard
              </a>
            </div>
            
            <div style="border-top: 1px solid #e5e7eb; padding-top: 20px; margin-top: 30px;">
              <p><strong>Need Help Getting Started?</strong></p>
              <p>Our support team is here to help you succeed:</p>
              <ul style="padding-left: 20px;">
                <li>📧 Email: <a href="mailto:support@quikpik.co" style="color: #059669;">support@quikpik.co</a></li>
                <li>⚡ Quick Setup Session: <a href="https://calendly.com/quikpik-support/setup" style="color: #059669;">Book a free 15-minute call</a></li>
                <li>💬 Response Time: Within 2 hours during business hours</li>
              </ul>
            </div>
            
            <div style="text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #6b7280; font-size: 14px;">
              <p>Thank you for choosing Quikpik to power your wholesale business!</p>
              <p style="margin: 0;">The Quikpik Team</p>
            </div>
          </div>
        </body>
        </html>
      `;

      const welcomeEmailText = `
Welcome to Quikpik, ${user.firstName}!

You've joined the intelligent platform transforming how wholesale businesses connect, communicate, and grow.

Our Mission: Empower small and medium wholesalers with enterprise-level tools that streamline operations and boost revenue.

What You Can Do Right Now:
• Add Your Products: Upload inventory with photos, pricing, and stock levels
• Create Customer Groups: Organize retail customers for targeted communication  
• Send WhatsApp Broadcasts: Instantly notify customers about new stock
• Process Orders: Accept online payments and manage orders efficiently
• Track Analytics: Monitor sales performance and customer engagement

Coming Soon - Advanced Features:
• AI-Powered Insights: Demand forecasting and inventory optimization
• B2B Marketplace: Connect with new retail customers across industries
• Integrated Logistics: Streamlined shipping and delivery partnerships
• Global Trade Support: Multi-currency and international commerce tools
• Industry Intelligence: Benchmarking and competitive insights
• Customer Success: Dedicated support and business growth guidance

Get Started: Visit your dashboard at https://quikpik.app

Need Help?
• Email: support@quikpik.co
• Quick Setup: Book a free call at https://calendly.com/quikpik-support/setup
• Response Time: Within 2 hours during business hours

Thank you for choosing Quikpik to power your wholesale business!
The Quikpik Team
      `;

      await sgMail.send({
        to: user.email,
        from: {
          email: 'hello@quikpik.co',
          name: 'Quikpik Team'
        },
        subject: `Welcome to Quikpik, ${user.firstName}! 🚀`,
        text: welcomeEmailText,
        html: welcomeEmailHtml
      });

      console.log(`✅ Welcome email sent to ${user.email}`);
    } catch (error) {
      console.error('Failed to send welcome email:', error);
    }
  }

  // Email/Password Signup Endpoint
  app.post('/api/auth/signup', async (req: any, res) => {
    try {
      const {
        firstName,
        lastName,
        email,
        password,
        businessName,
        businessDescription,
        businessPhone,
        businessType,
        estimatedMonthlyVolume,
        streetAddress,
        city,
        state,
        postalCode,
        country,
        preferredCurrency
      } = req.body;

      // Validate required fields
      if (!firstName || !lastName || !email || !password) {
        return res.status(400).json({ 
          success: false, 
          message: "First name, last name, email, and password are required" 
        });
      }

      // Check if user already exists
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ 
          success: false, 
          message: "An account with this email already exists" 
        });
      }

      // Generate unique user ID
      const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Create user account
      const userData = {
        id: userId,
        email: email,
        firstName: firstName,
        lastName: lastName,
        role: 'wholesaler',
        subscriptionTier: 'free',
        subscriptionStatus: 'active',
        businessName: businessName || '',
        businessDescription: businessDescription || '',
        businessPhone: businessPhone || '',
        businessAddress: streetAddress || '',
        businessEmail: email, // Use the same email for business and personal
        businessType: businessType || '',
        estimatedMonthlyVolume: estimatedMonthlyVolume || '',
        streetAddress: streetAddress || '',
        city: city || '',
        state: state || '',
        postalCode: postalCode || '',
        country: country || 'United Kingdom',
        preferredCurrency: preferredCurrency || 'GBP',
        defaultCurrency: preferredCurrency || 'GBP',
        onboardingCompleted: true, // Skip onboarding since we collected info upfront
        onboardingStep: 0,
        isFirstLogin: false,
        productLimit: 3, // Free tier limit
        // passwordHash will be set by createUserWithPassword method
        phoneNumber: businessPhone || '',
        logoType: 'initials'
      };

      const newUser = await storage.createUserWithPassword(userData, password);

      // Send welcome email
      await sendWelcomeEmail(newUser);

      // Create session for new user
      req.session.user = {
        id: newUser.id,
        email: newUser.email,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        role: newUser.role,
        subscriptionTier: newUser.subscriptionTier,
        businessName: newUser.businessName,
        isTeamMember: false
      };

      res.json({
        success: true,
        message: "Welcome to Quikpik! Your account has been created successfully.",
        welcomeMessage: {
          title: "Welcome to the Future of B2B Wholesale",
          content: "You've joined Quikpik, the intelligent platform transforming how wholesale businesses connect, communicate, and grow. Our mission is to empower small and medium wholesalers with enterprise-level tools that streamline operations and boost revenue.",
          platformGoals: [
            "Simplify product management and inventory tracking",
            "Enable instant customer communication via WhatsApp",
            "Streamline order processing and payment collection",
            "Provide actionable business insights and analytics",
            "Connect wholesalers with new retail customers"
          ],
          futureSupport: [
            "AI-powered demand forecasting and inventory optimization",
            "Advanced marketplace for discovering new business opportunities",
            "Integrated logistics and shipping partnerships",
            "Multi-currency and international trade support",
            "Dedicated customer success management",
            "Industry-specific business intelligence and benchmarking"
          ]
        },
        user: {
          id: newUser.id,
          email: newUser.email,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
          role: newUser.role,
          subscriptionTier: newUser.subscriptionTier,
          businessName: newUser.businessName
        }
      });

    } catch (error) {
      console.error("Signup error:", error);
      res.status(500).json({ 
        success: false, 
        message: "Failed to create account. Please try again." 
      });
    }
  });

  // Team Member Login Endpoint
  app.post('/api/auth/team-login', async (req: any, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }

      // Find user by email
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      // Check if this is a team member account
      if (user.subscriptionTier !== 'team_member') {
        return res.status(401).json({ message: "Please use the Business Owner tab to sign in" });
      }

      // Authenticate user with encrypted password
      const authenticatedUser = await storage.authenticateUser(email, password);
      if (!authenticatedUser) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      // Find the team member record to get wholesaler info
      const teamMembers = await storage.getAllTeamMembers();
      const teamMember = teamMembers.find((tm: any) => tm.email.toLowerCase() === email.toLowerCase());
      
      // Get wholesaler information if team member is linked
      let wholesalerInfo = null;
      if (teamMember?.wholesalerId) {
        wholesalerInfo = await storage.getUser(teamMember.wholesalerId);
      }

      // Create session for team member with wholesaler context
      req.session.user = {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: 'team_member',
        subscriptionTier: wholesalerInfo?.subscriptionTier || user.subscriptionTier,
        businessName: wholesalerInfo?.businessName || user.businessName,
        isTeamMember: true,
        wholesalerId: teamMember?.wholesalerId || user.id
      };

      res.json({
        success: true,
        message: "Login successful",
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: 'team_member',
          subscriptionTier: wholesalerInfo?.subscriptionTier || user.subscriptionTier,
          businessName: wholesalerInfo?.businessName || user.businessName,
          isTeamMember: true
        }
      });

    } catch (error) {
      console.error("Team member login error:", error);
      res.status(500).json({ message: "Login failed. Please try again." });
    }
  });

  // Business Owner Login Endpoint
  app.post('/api/auth/login', async (req: any, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }

      // Find user by email
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      // Check if this user is actually a team member of another business
      const teamMembers = await storage.getAllTeamMembers();
      const teamMember = teamMembers.find((tm: any) => tm.email.toLowerCase() === email.toLowerCase());
      
      // If user is a team member, get wholesaler info and treat as team member login
      if (teamMember) {
        const wholesalerInfo = await storage.getUser(teamMember.wholesalerId);
        
        // Create session for team member with wholesaler context
        req.session.user = {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: 'team_member',
          subscriptionTier: wholesalerInfo?.subscriptionTier || user.subscriptionTier,
          businessName: wholesalerInfo?.businessName || user.businessName,
          isTeamMember: true,
          wholesalerId: teamMember.wholesalerId
        };

        return res.json({
          success: true,
          message: "Login successful",
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: 'team_member',
            subscriptionTier: wholesalerInfo?.subscriptionTier || user.subscriptionTier,
            businessName: wholesalerInfo?.businessName || user.businessName,
            isTeamMember: true
          }
        });
      }

      // Check if this is a team member account tier
      if (user.subscriptionTier === 'team_member') {
        return res.status(401).json({ message: "Please use the Team Member tab to sign in" });
      }

      // Authenticate user with encrypted password
      const authenticatedUser = await storage.authenticateUser(email, password);
      if (!authenticatedUser) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      // Create session for business owner
      req.session.user = {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        subscriptionTier: user.subscriptionTier,
        businessName: user.businessName,
        isTeamMember: false
      };

      res.json({
        success: true,
        message: "Login successful",
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          subscriptionTier: user.subscriptionTier,
          businessName: user.businessName
        }
      });

    } catch (error) {
      console.error("Business owner login error:", error);
      res.status(500).json({ message: "Login failed. Please try again." });
    }
  });

  // Signup endpoint
  app.post('/api/auth/signup', async (req, res) => {
    try {
      const {
        firstName,
        lastName,
        email,
        password,
        businessName,
        businessDescription,
        businessPhone,
        businessEmail,
        streetAddress,
        city,
        state,
        postalCode,
        country,
        defaultCurrency,
        businessType,
        estimatedMonthlyVolume
      } = req.body;

      // Check if user already exists
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ message: "An account with this email already exists" });
      }

      // Create the business address string
      const businessAddress = `${streetAddress}, ${city}, ${state} ${postalCode}, ${country}`;

      // Create user account with generated ID
      const userId = `signup_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const userData = {
        id: userId,
        email: email,
        firstName: firstName,
        lastName: lastName,
        role: 'wholesaler',
        subscriptionTier: 'free',
        subscriptionStatus: 'inactive',
        businessName: businessName,
        businessDescription: businessDescription,
        businessPhone: businessPhone,
        businessEmail: businessEmail,
        businessAddress: businessAddress,
        preferredCurrency: defaultCurrency,
        defaultCurrency: defaultCurrency,
        businessType: businessType,
        estimatedMonthlyVolume: estimatedMonthlyVolume,
        onboardingCompleted: false,
        onboardingStep: 0,
        onboardingSkipped: false,
        isFirstLogin: true,
        productLimit: 3
      };

      // Create user account
      const newUser = await storage.createUser({
        id: userId,
        email: email,
        firstName: firstName,
        lastName: lastName,
        role: 'wholesaler',
        subscriptionTier: 'free',
        subscriptionStatus: 'inactive',
        businessName: businessName,
        businessDescription: businessDescription,
        businessPhone: businessPhone,
        businessEmail: businessEmail,
        businessAddress: businessAddress,
        preferredCurrency: defaultCurrency,
        defaultCurrency: defaultCurrency,
        businessType: businessType,
        estimatedMonthlyVolume: estimatedMonthlyVolume,
        onboardingCompleted: false,
        onboardingStep: 0,
        onboardingSkipped: false,
        isFirstLogin: true,
        productLimit: 3
      } as any);

      // Create session for the new user
      (req.session as any).user = {
        id: newUser.id,
        email: newUser.email,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        role: newUser.role,
        subscriptionTier: newUser.subscriptionTier,
        businessName: newUser.businessName
      };

      res.json({
        success: true,
        message: "Account created successfully",
        user: {
          id: newUser.id,
          email: newUser.email,
          firstName: newUser.firstName,
          lastName: newUser.lastName,
          role: newUser.role,
          businessName: newUser.businessName
        }
      });

    } catch (error) {
      console.error("Signup error:", error);
      res.status(500).json({ message: "Failed to create account. Please try again." });
    }
  });

  // Initialize Parcel2Go service with credentials from environment
  if (process.env.PARCEL2GO_CLIENT_ID && process.env.PARCEL2GO_CLIENT_SECRET) {
    parcel2goService.setCredentials(createTestCredentials());
  }

  // Parcel2Go Shipping API Routes
  app.get('/api/shipping/quotes', requireAuth, async (req: any, res) => {
    try {
      const { 
        collectionPostcode, 
        deliveryPostcode, 
        weight, 
        length, 
        width, 
        height, 
        value,
        collectionCountry = 'GBR',
        deliveryCountry = 'GBR'
      } = req.query;

      if (!collectionPostcode || !deliveryPostcode || !weight || !length || !width || !height || !value) {
        return res.status(400).json({ 
          message: "Missing required parameters: collectionPostcode, deliveryPostcode, weight, length, width, height, value" 
        });
      }

      const user = await storage.getUser(req.user.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Build collection address from user's business information
      const collectionAddress = {
        contactName: user.businessName || `${user.firstName} ${user.lastName}`,
        organisation: user.businessName || '',
        email: user.email,
        phone: user.businessPhone || user.phoneNumber || '',
        property: '1', // Default - could be enhanced with full address
        street: user.businessAddress || 'Business Address',
        town: 'City',
        postcode: collectionPostcode as string,
        countryIsoCode: collectionCountry as string
      };

      // Build delivery address (basic - for quotes we only need postcode)
      const deliveryAddress = {
        contactName: 'Customer',
        property: '1',
        street: 'Customer Address',
        town: 'City',
        postcode: deliveryPostcode as string,
        countryIsoCode: deliveryCountry as string
      };

      const quoteRequest = {
        collectionAddress,
        deliveryAddress,
        parcels: [{
          weight: parseFloat(weight as string),
          length: parseFloat(length as string),
          width: parseFloat(width as string),
          height: parseFloat(height as string),
          value: parseFloat(value as string)
        }]
      };

      const quotes = await parcel2goService.getQuotes(quoteRequest);
      res.json({ quotes });
    } catch (error: any) {
      console.error("Error getting shipping quotes:", error);
      
      // Return demo quotes when Parcel2Go API is unavailable
      const demoQuotes = [
        {
          serviceId: 'demo-royal-mail-48',
          serviceName: 'Royal Mail 48',
          carrierName: 'Royal Mail',
          price: 5.95,
          priceExVat: 4.96,
          vat: 0.99,
          transitTime: '2-3 business days',
          collectionType: 'pickup',
          deliveryType: 'standard',
          trackingAvailable: true,
          insuranceIncluded: false,
          description: 'Standard delivery service with tracking'
        },
        {
          serviceId: 'demo-dpd-next-day',
          serviceName: 'DPD Next Day',
          carrierName: 'DPD',
          price: 8.50,
          priceExVat: 7.08,
          vat: 1.42,
          transitTime: '1 business day',
          collectionType: 'pickup',
          deliveryType: 'express',
          trackingAvailable: true,
          insuranceIncluded: true,
          description: 'Next day delivery with SMS notifications'
        },
        {
          serviceId: 'demo-evri-standard',
          serviceName: 'Evri Standard',
          carrierName: 'Evri',
          price: 4.25,
          priceExVat: 3.54,
          vat: 0.71,
          transitTime: '3-5 business days',
          collectionType: 'pickup',
          deliveryType: 'standard',
          trackingAvailable: true,
          insuranceIncluded: false,
          description: 'Cost-effective delivery option'
        }
      ];
      
      console.log("📦 Parcel2Go API unavailable, returning demo quotes");
      res.json({ quotes: demoQuotes, demoMode: true });
    }
  });

  // POST endpoint for shipping quotes (used by order shipping modal)
  app.post('/api/shipping/quotes', requireAuth, async (req: any, res) => {
    const { collectionAddress, deliveryAddress, parcels } = req.body;
    
    try {
      console.log("📦 POST: Getting shipping quotes:", { collectionAddress, deliveryAddress, parcels });
      
      // Check if we have valid addresses
      if (!collectionAddress || !deliveryAddress || !parcels) {
        return res.status(400).json({ 
          error: "Missing required data", 
          required: ["collectionAddress", "deliveryAddress", "parcels"] 
        });
      }

      // Configure Parcel2Go service with credentials - try live API first
      if (process.env.PARCEL2GO_CLIENT_ID && process.env.PARCEL2GO_CLIENT_SECRET) {
        parcel2goService.setCredentials({
          clientId: process.env.PARCEL2GO_CLIENT_ID,
          clientSecret: process.env.PARCEL2GO_CLIENT_SECRET,
          environment: 'live' // Use live API as sandbox seems inaccessible
        });
      }
      
      // Try to get real quotes first
      try {
        const quotes = await parcel2goService.getQuotes({
          collectionAddress,
          deliveryAddress,
          parcels
        });
        
        console.log("📦 Got real quotes:", quotes.length, "services");
        res.json({ quotes, demoMode: false });
      } catch (apiError) {
        console.log("📦 Parcel2Go API unavailable, falling back to demo quotes");
        throw apiError; // Fall through to demo quotes
      }
    } catch (error: any) {
      console.error("Error getting shipping quotes:", error.message);
      
      // Calculate weight-based pricing for more realistic demo quotes
      const totalWeight = parcels.reduce((sum, parcel) => sum + parcel.weight, 0);
      const basePrice = Math.max(3.95, totalWeight * 0.85); // Minimum £3.95, then £0.85 per kg
      
      const demoQuotes = [
        {
          serviceId: 'demo-royal-mail-48',
          serviceName: 'Royal Mail 48',
          carrierName: 'Royal Mail',
          price: parseFloat((basePrice * 1.2).toFixed(2)),
          priceExVat: parseFloat((basePrice).toFixed(2)),
          vat: parseFloat((basePrice * 0.2).toFixed(2)),
          transitTime: '2-3 business days',
          collectionType: 'pickup',
          deliveryType: 'standard',
          trackingAvailable: true,
          insuranceIncluded: false,
          description: `Standard delivery for ${totalWeight}kg package with tracking`
        },
        {
          serviceId: 'demo-dpd-next-day',
          serviceName: 'DPD Next Day',
          carrierName: 'DPD',
          price: parseFloat((basePrice * 1.8).toFixed(2)),
          priceExVat: parseFloat((basePrice * 1.5).toFixed(2)),
          vat: parseFloat((basePrice * 0.3).toFixed(2)),
          transitTime: '1 business day',
          collectionType: 'pickup',
          deliveryType: 'express',
          trackingAvailable: true,
          insuranceIncluded: true,
          description: `Next day delivery for ${totalWeight}kg package with SMS notifications`
        },
        {
          serviceId: 'demo-evri-standard',
          serviceName: 'Evri Standard',
          carrierName: 'Evri',
          price: parseFloat((basePrice * 0.9).toFixed(2)),
          priceExVat: parseFloat((basePrice * 0.75).toFixed(2)),
          vat: parseFloat((basePrice * 0.15).toFixed(2)),
          transitTime: '3-5 business days',
          collectionType: 'pickup',
          deliveryType: 'standard',
          trackingAvailable: true,
          insuranceIncluded: false,
          description: `Cost-effective delivery for ${totalWeight}kg package`
        }
      ];
      
      // Add service recommendations and precise calculation info
      const recommendations = PreciseShippingCalculator.getServiceRecommendations(totalWeight);
      
      const preciseCalculation = cartItems && cartItems.length > 0;
      console.log(`📦 Returning enhanced demo quotes for ${totalWeight}kg package (${preciseCalculation ? 'precise' : 'estimated'} calculation)`);
      res.json({ 
        quotes: demoQuotes, 
        demoMode: true, 
        preciseCalculation,
        totalWeight,
        recommendations
      });
    }
  });

  // Enhanced marketplace shipping quotes endpoint with precise unit configuration
  app.post('/api/marketplace/shipping/quotes', async (req: any, res) => {
    try {
      const { collectionAddress, deliveryAddress, parcels, cartItems } = req.body;
      
      console.log("📦 MARKETPLACE: Getting enhanced shipping quotes with precise calculation");
      console.log("Request data:", { collectionAddress, deliveryAddress, parcels: parcels?.length, cartItems: cartItems?.length });
      
      // Check if we have valid addresses
      if (!collectionAddress || !deliveryAddress) {
        return res.status(400).json({ 
          error: "Missing required data", 
          required: ["collectionAddress", "deliveryAddress"] 
        });
      }

      let preciseParcels = parcels;

      // If cart items are provided, use precise shipping calculator
      if (cartItems && cartItems.length > 0) {
        console.log("📦 Using precise unit configuration for shipping calculation");
        preciseParcels = PreciseShippingCalculator.createPreciseParcel(cartItems);
        console.log("📦 Precise parcels calculated:", preciseParcels);
        
        const totalWeight = preciseParcels.reduce((sum, p) => sum + p.weight, 0);
        const recommendations = PreciseShippingCalculator.getServiceRecommendations(totalWeight);
        console.log("📦 Service recommendations:", recommendations);
      } else if (!parcels || parcels.length === 0) {
        return res.status(400).json({ 
          error: "Missing required data", 
          required: ["parcels or cartItems"] 
        });
      }

      // Configure Parcel2Go service with credentials - try live API first
      if (process.env.PARCEL2GO_CLIENT_ID && process.env.PARCEL2GO_CLIENT_SECRET) {
        parcel2goService.setCredentials({
          clientId: process.env.PARCEL2GO_CLIENT_ID,
          clientSecret: process.env.PARCEL2GO_CLIENT_SECRET,
          environment: 'live' // Use live API as sandbox seems inaccessible
        });
      }
      
      // Try to get real quotes first
      try {
        const quotes = await parcel2goService.getQuotes({
          collectionAddress,
          deliveryAddress,
          parcels: preciseParcels
        });
        
        console.log("📦 Got real marketplace quotes:", quotes.length, "services");
        
        // Add precise weight information to response
        const totalWeight = preciseParcels.reduce((sum, p) => sum + p.weight, 0);
        const recommendations = PreciseShippingCalculator.getServiceRecommendations(totalWeight);
        
        res.json({ 
          quotes, 
          demoMode: false, 
          preciseCalculation: !!cartItems,
          totalWeight,
          recommendations 
        });
      } catch (apiError) {
        console.log("📦 Parcel2Go API unavailable, falling back to enhanced demo quotes");
        throw apiError; // Fall through to demo quotes
      }
    } catch (error: any) {
      console.error("Error getting marketplace shipping quotes:", error.message);
      
      // Get parcels and cart items from request body for enhanced demo quotes
      const { parcels, cartItems } = req.body;
      
      // Use precise calculation if cart items are available
      let finalParcels = parcels;
      if (cartItems && cartItems.length > 0) {
        console.log("📦 DEMO: Using precise unit configuration for fallback quotes");
        finalParcels = PreciseShippingCalculator.createPreciseParcel(cartItems);
        console.log("📦 DEMO: Precise parcels calculated:", finalParcels);
      }
      
      // Calculate weight-based pricing aligned with Parcel2Go limits
      const totalWeight = finalParcels ? finalParcels.reduce((sum, parcel) => sum + parcel.weight, 0) : 1;
      const maxParcelWeight = finalParcels ? Math.max(...finalParcels.map(p => p.weight)) : 1;
      const preciseCalculation = !!(cartItems && cartItems.length > 0);
      
      console.log(`📦 DEMO: Total weight: ${totalWeight}kg, Max parcel: ${maxParcelWeight}kg, Precise: ${preciseCalculation}`);
      
      let demoQuotes = [];
      
      // Standard parcel services (up to 70kg total weight)
      if (totalWeight <= 70 && maxParcelWeight <= 30) {
        const basePrice = Math.max(3.95, totalWeight * 0.85); // Minimum £3.95, then £0.85 per kg
        
        // Royal Mail (up to 20kg)
        if (maxParcelWeight <= 20) {
          demoQuotes.push({
            serviceId: 'demo-royal-mail-48',
            serviceName: 'Royal Mail 48',
            carrierName: 'Royal Mail',
            price: parseFloat((basePrice * 1.2).toFixed(2)),
            priceExVat: parseFloat((basePrice).toFixed(2)),
            vat: parseFloat((basePrice * 0.2).toFixed(2)),
            transitTime: '2-3 business days',
            collectionType: 'pickup',
            deliveryType: 'standard',
            trackingAvailable: true,
            insuranceIncluded: false,
            description: `Standard delivery for ${totalWeight}kg package (max 20kg per parcel)`,
            maxWeight: 20
          });
        }
        
        // DPD and Parcelforce (up to 30kg)
        if (maxParcelWeight <= 30) {
          demoQuotes.push({
            serviceId: 'demo-dpd-next-day',
            serviceName: 'DPD Next Day',
            carrierName: 'DPD',
            price: parseFloat((basePrice * 1.8).toFixed(2)),
            priceExVat: parseFloat((basePrice * 1.5).toFixed(2)),
            vat: parseFloat((basePrice * 0.3).toFixed(2)),
            transitTime: '1 business day',
            collectionType: 'pickup',
            deliveryType: 'express',
            trackingAvailable: true,
            insuranceIncluded: true,
            description: `Next day delivery for ${totalWeight}kg package (max 30kg per parcel)`,
            maxWeight: 30
          });
          
          demoQuotes.push({
            serviceId: 'demo-parcelforce-express',
            serviceName: 'Parcelforce Express 24',
            carrierName: 'Parcelforce',
            price: parseFloat((basePrice * 1.6).toFixed(2)),
            priceExVat: parseFloat((basePrice * 1.33).toFixed(2)),
            vat: parseFloat((basePrice * 0.27).toFixed(2)),
            transitTime: '1 business day',
            collectionType: 'pickup',
            deliveryType: 'express',
            trackingAvailable: true,
            insuranceIncluded: true,
            description: `Express delivery for ${totalWeight}kg heavy package`,
            maxWeight: 30
          });
        }
      }
      
      // Heavy parcel services (70kg - 1000kg)
      if (totalWeight > 70 && totalWeight <= 1000) {
        const heavyPrice = Math.max(25.00, totalWeight * 1.2); // Higher base price for heavy parcels
        
        demoQuotes.push({
          serviceId: 'demo-heavy-parcel-service',
          serviceName: 'Heavy Parcel Service',
          carrierName: 'Specialist Courier',
          price: parseFloat(heavyPrice.toFixed(2)),
          priceExVat: parseFloat((heavyPrice * 0.83).toFixed(2)),
          vat: parseFloat((heavyPrice * 0.17).toFixed(2)),
          transitTime: '2-3 business days',
          collectionType: 'pickup',
          deliveryType: 'heavy-parcel',
          trackingAvailable: true,
          insuranceIncluded: true,
          description: `Specialized heavy parcel delivery for ${totalWeight}kg package`,
          maxWeight: 1000,
          restrictions: ['Requires specialized handling', 'Heavy lifting equipment needed']
        });
      }
      
      // Pallet services (over 1000kg)
      if (totalWeight > 1000) {
        const palletPrice = Math.max(85.00, totalWeight * 0.08); // Bulk pricing for pallet services
        
        demoQuotes.push({
          serviceId: 'demo-pallet-freight',
          serviceName: 'Pallet Freight Service',
          carrierName: 'Freight Logistics',
          price: parseFloat(palletPrice.toFixed(2)),
          priceExVat: parseFloat((palletPrice * 0.83).toFixed(2)),
          vat: parseFloat((palletPrice * 0.17).toFixed(2)),
          transitTime: '3-5 business days',
          collectionType: 'pickup',
          deliveryType: 'pallet-freight',
          trackingAvailable: true,
          insuranceIncluded: true,
          description: `Pallet freight delivery for ${(totalWeight/1000).toFixed(1)} tonne consignment`,
          maxWeight: 10000,
          restrictions: ['Requires forklift access', 'Minimum 1 tonne', 'Pallet dimensions required']
        });
        
        demoQuotes.push({
          serviceId: 'demo-express-pallet',
          serviceName: 'Express Pallet Service',
          carrierName: 'Express Freight',
          price: parseFloat((palletPrice * 1.4).toFixed(2)),
          priceExVat: parseFloat((palletPrice * 1.17).toFixed(2)),
          vat: parseFloat((palletPrice * 0.23).toFixed(2)),
          transitTime: '1-2 business days',
          collectionType: 'pickup',
          deliveryType: 'express-pallet',
          trackingAvailable: true,
          insuranceIncluded: true,
          description: `Express pallet delivery for ${(totalWeight/1000).toFixed(1)} tonne consignment`,
          maxWeight: 10000,
          restrictions: ['Requires forklift access', 'Priority scheduling', 'Pallet dimensions required']
        });
      }
      
      // If no services available due to weight restrictions
      if (demoQuotes.length === 0) {
        demoQuotes.push({
          serviceId: 'demo-quote-required',
          serviceName: 'Custom Quote Required',
          carrierName: 'Freight Specialist',
          price: 0,
          priceExVat: 0,
          vat: 0,
          transitTime: 'Contact for quote',
          collectionType: 'pickup',
          deliveryType: 'custom',
          trackingAvailable: true,
          insuranceIncluded: true,
          description: `Order exceeds standard limits (${totalWeight}kg) - custom freight quote required`,
          maxWeight: 999999,
          restrictions: ['Requires custom freight arrangement', 'Contact customer service']
        });
      }
      
      console.log(`📦 Returning weight-based marketplace demo quotes for ${totalWeight}kg package`);
      res.json({ quotes: demoQuotes, demoMode: true });
    }
  });

  app.get('/api/shipping/drop-shops', requireAuth, async (req: any, res) => {
    try {
      const { postcode, country = 'GBR' } = req.query;

      if (!postcode) {
        return res.status(400).json({ message: "Postcode is required" });
      }

      const dropShops = await parcel2goService.getDropShops(postcode as string, country as string);
      res.json({ dropShops });
    } catch (error: any) {
      console.error("Error getting drop shops:", error);
      res.status(500).json({ message: "Failed to get drop shops", error: error.message });
    }
  });

  app.get('/api/shipping/countries', requireAuth, async (req: any, res) => {
    try {
      const countries = await parcel2goService.getCountries();
      res.json({ countries });
    } catch (error: any) {
      console.error("Error getting countries:", error);
      res.status(500).json({ message: "Failed to get countries", error: error.message });
    }
  });

  app.get('/api/shipping/services', requireAuth, async (req: any, res) => {
    try {
      const services = await parcel2goService.getServices();
      res.json({ services });
    } catch (error: any) {
      console.error("Error getting services:", error);
      res.status(500).json({ message: "Failed to get services", error: error.message });
    }
  });

  // Get Google Places API key for frontend
  app.get('/api/config/google-places-key', (req, res) => {
    const apiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (apiKey) {
      res.json({ apiKey });
    } else {
      res.status(404).json({ error: 'Google Places API key not configured' });
    }
  });

  app.post('/api/shipping/create-order', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      const { 
        orderId, 
        service, 
        customerDetails, 
        deliveryAddress,
        parcels,
        collectionDate
      } = req.body;

      // Build collection address from user's business information
      const collectionAddress = {
        contactName: user.businessName || `${user.firstName} ${user.lastName}`,
        organisation: user.businessName || '',
        email: user.email,
        phone: user.businessPhone || user.phoneNumber || '',
        property: user.businessAddress?.split(',')[0] || '1',
        street: user.businessAddress?.split(',')[1] || 'Business Street',
        town: user.businessAddress?.split(',')[2] || 'City',
        postcode: user.businessPostcode || 'SW1A 1AA',
        countryIsoCode: 'GBR'
      };

      const orderRequest = {
        Items: [{
          Id: `quikpik-order-${orderId}`,
          CollectionDate: collectionDate || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          Service: service,
          Parcels: parcels.map((parcel: any, index: number) => ({
            Id: `parcel-${index}`,
            Height: parcel.height,
            Length: parcel.length,
            Width: parcel.width,
            Weight: parcel.weight,
            EstimatedValue: parcel.value,
            DeliveryAddress: {
              contactName: customerDetails.name,
              email: customerDetails.email,
              phone: customerDetails.phone,
              property: deliveryAddress.property,
              street: deliveryAddress.street,
              town: deliveryAddress.town,
              county: deliveryAddress.county || '',
              postcode: deliveryAddress.postcode,
              countryIsoCode: deliveryAddress.countryIsoCode || 'GBR'
            },
            ContentsSummary: parcel.contents || 'Wholesale products'
          })),
          CollectionAddress: collectionAddress
        }],
        CustomerDetails: {
          Email: customerDetails.email,
          Forename: customerDetails.firstName || customerDetails.name.split(' ')[0],
          Surname: customerDetails.lastName || customerDetails.name.split(' ').slice(1).join(' ')
        }
      };

      const shippingOrder = await parcel2goService.createOrder(orderRequest);
      
      // Update the order in our database with shipping information
      await storage.updateOrder(orderId, {
        shippingOrderId: shippingOrder.OrderId,
        shippingHash: shippingOrder.Hash,
        shippingTotal: shippingOrder.TotalPrice.toString(),
        shippingStatus: 'created'
      });

      res.json({ 
        success: true, 
        shippingOrder,
        paymentLinks: shippingOrder.Links
      });
    } catch (error: any) {
      console.error("Error creating shipping order:", error);
      res.status(500).json({ message: "Failed to create shipping order", error: error.message });
    }
  });

  app.post('/api/shipping/verify-order', requireAuth, async (req: any, res) => {
    try {
      const orderRequest = req.body;
      const verification = await parcel2goService.verifyOrder(orderRequest);
      res.json({ verification });
    } catch (error: any) {
      console.error("Error verifying shipping order:", error);
      res.status(500).json({ message: "Failed to verify shipping order", error: error.message });
    }
  });

  app.get('/api/shipping/track/:orderLineId', requireAuth, async (req: any, res) => {
    try {
      const { orderLineId } = req.params;
      const tracking = await parcel2goService.trackOrder(orderLineId);
      res.json({ tracking });
    } catch (error: any) {
      console.error("Error tracking order:", error);
      res.status(500).json({ message: "Failed to track order", error: error.message });
    }
  });

  app.get('/api/shipping/labels/:orderId', requireAuth, async (req: any, res) => {
    try {
      const { orderId } = req.params;
      const { format = 'pdf' } = req.query;
      
      // Get order from database to get shipping hash
      const order = await storage.getOrder(parseInt(orderId));
      if (!order || !order.shippingOrderId || !order.shippingHash) {
        return res.status(404).json({ message: "Shipping order not found" });
      }

      const labels = await parcel2goService.getLabels(order.shippingOrderId, order.shippingHash, format as 'pdf' | 'png');
      res.json({ labels });
    } catch (error: any) {
      console.error("Error getting shipping labels:", error);
      res.status(500).json({ message: "Failed to get shipping labels", error: error.message });
    }
  });

  app.get('/api/shipping/status', requireAuth, async (req: any, res) => {
    try {
      const configured = !!(process.env.PARCEL2GO_CLIENT_ID && process.env.PARCEL2GO_CLIENT_SECRET);
      const environment = process.env.PARCEL2GO_ENVIRONMENT || 'sandbox';
      
      res.json({ 
        configured,
        environment,
        ready: configured
      });
    } catch (error: any) {
      console.error("Error checking shipping status:", error);
      res.status(500).json({ message: "Failed to check shipping status" });
    }
  });

  // Shipping Automation Settings
  app.post('/api/shipping/automation-settings', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { sendOrderDispatchedEmails, autoMarkFulfilled, enableTrackingNotifications, sendDeliveryConfirmations } = req.body;

      // Update user settings with automation preferences
      await storage.updateUserSettings(userId, {
        sendOrderDispatchedEmails: sendOrderDispatchedEmails ?? true,
        autoMarkFulfilled: autoMarkFulfilled ?? false,
        enableTrackingNotifications: enableTrackingNotifications ?? true,
        sendDeliveryConfirmations: sendDeliveryConfirmations ?? true
      });

      res.json({
        success: true,
        message: "Shipping automation settings updated successfully",
        settings: {
          sendOrderDispatchedEmails,
          autoMarkFulfilled,
          enableTrackingNotifications,
          sendDeliveryConfirmations
        }
      });
    } catch (error) {
      console.error("Error saving automation settings:", error);
      res.status(500).json({ 
        success: false, 
        message: "Failed to save automation settings" 
      });
    }
  });

  app.get('/api/shipping/automation-settings', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      res.json({
        sendOrderDispatchedEmails: user.sendOrderDispatchedEmails ?? true,
        autoMarkFulfilled: user.autoMarkFulfilled ?? false,
        enableTrackingNotifications: user.enableTrackingNotifications ?? true,
        sendDeliveryConfirmations: user.sendDeliveryConfirmations ?? true
      });
    } catch (error) {
      console.error("Error fetching automation settings:", error);
      res.status(500).json({ 
        message: "Failed to fetch automation settings" 
      });
    }
  });

  // Create shipping for a specific order
  app.post('/api/orders/:orderId/shipping', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { orderId } = req.params;
      const { serviceId, deliveryAddress, shippingCost } = req.body;

      // Get the order to verify ownership and status
      const order = await storage.getOrder(parseInt(orderId));
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Verify this order belongs to the current user (wholesaler)
      if (order.wholesalerId !== userId) {
        return res.status(403).json({ message: "Not authorized to manage this order" });
      }

      // Verify order is confirmed or paid
      if (!order.status || (order.status !== 'paid' && order.status !== 'confirmed')) {
        return res.status(400).json({ message: "Order must be confirmed or paid before creating shipping" });
      }

      // Get user's business address for collection
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Parse delivery address
      let parsedDeliveryAddress;
      try {
        parsedDeliveryAddress = typeof deliveryAddress === 'string' ? JSON.parse(deliveryAddress) : deliveryAddress;
      } catch (error) {
        // If not JSON, treat as a simple string address
        parsedDeliveryAddress = {
          street: deliveryAddress,
          town: "Unknown City",
          postcode: "UNKNOWN",
          country: "GBR"
        };
      }

      // Build collection address from user's business information
      const collectionAddress = {
        contactName: user.businessName || `${user.firstName} ${user.lastName}`,
        organisation: user.businessName || '',
        property: user.streetAddress || '1',
        street: user.streetAddress || 'Business Street',
        town: user.city || 'City',
        postcode: user.postalCode || 'SW1A 1AA',
        countryIsoCode: 'GBR'
      };

      // Default parcel dimensions based on order total
      const parcels = [{
        weight: Math.max(2, Math.floor(parseFloat(order.total) / 50)), // Estimate weight based on order value
        length: 30,
        width: 20,
        height: 15,
        value: parseFloat(order.total)
      }];

      const orderRequest = {
        Items: [{
          Id: `quikpik-order-${orderId}`,
          CollectionDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Tomorrow
          Service: { Id: serviceId },
          Parcels: parcels.map((parcel, index) => ({
            Id: `parcel-${index}`,
            Height: parcel.height,
            Length: parcel.length,
            Width: parcel.width,
            Weight: parcel.weight,
            EstimatedValue: parcel.value,
            DeliveryAddress: {
              contactName: order.retailer?.firstName && order.retailer?.lastName 
                ? `${order.retailer.firstName} ${order.retailer.lastName}`
                : 'Customer',
              email: order.retailer?.email || '',
              phone: order.retailer?.phoneNumber || '',
              property: parsedDeliveryAddress.street || deliveryAddress,
              street: parsedDeliveryAddress.street || deliveryAddress,
              town: parsedDeliveryAddress.town || 'Unknown City',
              county: parsedDeliveryAddress.county || '',
              postcode: parsedDeliveryAddress.postcode || 'UNKNOWN',
              countryIsoCode: parsedDeliveryAddress.country || 'GBR'
            },
            ContentsSummary: `Order #${orderId} - Wholesale products`
          })),
          CollectionAddress: collectionAddress
        }]
      };

      // Handle demo mode for testing when Parcel2Go API is unavailable
      if (serviceId.startsWith('demo-') || serviceId.startsWith('test-')) {
        const demoShippingOrder = {
          OrderId: `DEMO-${Date.now()}`,
          Hash: `demo-hash-${orderId}`,
          TotalPrice: shippingCost,
          Status: 'created',
          TrackingNumber: `DEMO${Math.random().toString().substr(2, 8)}`
        };

        // Update the order with demo shipping information
        await storage.updateOrder(parseInt(orderId), {
          shippingOrderId: demoShippingOrder.OrderId,
          shippingHash: demoShippingOrder.Hash,
          shippingTotal: shippingCost.toString(),
          shippingStatus: 'created',
          deliveryCarrier: serviceId,
          deliveryServiceId: serviceId
        });

        res.json({ 
          success: true, 
          shippingOrder: demoShippingOrder,
          message: "Demo shipping order created successfully",
          demoMode: true
        });
      } else {
        const shippingOrder = await parcel2goService.createOrder(orderRequest);
        
        // Update the order with shipping information
        await storage.updateOrder(parseInt(orderId), {
          shippingOrderId: shippingOrder.OrderId,
          shippingHash: shippingOrder.Hash,
          shippingTotal: shippingCost.toString(),
          shippingStatus: 'created',
          deliveryCarrier: serviceId,
          deliveryServiceId: serviceId
        });

        res.json({ 
          success: true, 
          shippingOrder,
          message: "Shipping order created successfully"
        });
      }
    } catch (error: any) {
      console.error("Error creating order shipping:", error);
      res.status(500).json({ message: "Failed to create shipping order", error: error.message });
    }
  });

  // Shipping Tracking API Routes
  app.get('/api/shipping/tracked-orders', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      
      // Get all orders with shipping information
      const orders = await storage.getOrders(userId);
      
      // Filter orders that have shipping tracking (or demo mode: show all paid orders)
      const trackedOrders = orders
        .filter(order => order.shippingOrderId || order.deliveryTrackingNumber || order.status === 'processing' || order.status === 'shipped' || order.status === 'completed')
        .map(order => ({
          id: order.id,
          customerName: order.retailer ? `${order.retailer.firstName} ${order.retailer.lastName}` : order.customerName || 'Unknown Customer',
          customerEmail: order.retailer?.email || order.customerEmail || '',
          trackingNumber: order.deliveryTrackingNumber || `TRK${order.id}${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
          carrier: order.deliveryCarrier || (['Royal Mail', 'DPD', 'Evri', 'UPS', 'FedEx'][Math.floor(Math.random() * 5)]),
          shippingStatus: order.shippingStatus || (['pending', 'collected', 'in_transit', 'out_for_delivery', 'delivered'][Math.floor(Math.random() * 5)]),
          estimatedDelivery: order.estimatedDeliveryDate,
          total: order.total,
          deliveryAddress: order.deliveryAddress || '',
          createdAt: order.createdAt,
          lastUpdated: order.updatedAt,
          events: [] // Will be populated by tracking API
        }));

      res.json(trackedOrders);
    } catch (error: any) {
      console.error("Error getting tracked orders:", error);
      res.status(500).json({ message: "Failed to get tracked orders", error: error.message });
    }
  });

  app.get('/api/shipping/tracking/:orderId', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { orderId } = req.params;
      
      // Get the specific order
      const order = await storage.getOrder(parseInt(orderId));
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Verify ownership
      if (order.wholesalerId !== userId) {
        return res.status(403).json({ message: "Not authorized to view this order" });
      }

      // For demo purposes, generate realistic tracking events
      const generateTrackingEvents = (order: any) => {
        const events = [];
        const now = new Date();
        const orderDate = new Date(order.createdAt);
        
        // Always have order created event
        events.push({
          id: `event-1-${order.id}`,
          timestamp: orderDate.toISOString(),
          status: 'created',
          location: 'Order Processing Center',
          description: 'Order created and payment confirmed',
          carrier: order.deliveryCarrier || 'System'
        });

        if (order.shippingStatus && order.shippingStatus !== 'pending') {
          // Shipping label created
          const labelDate = new Date(orderDate.getTime() + 24 * 60 * 60 * 1000); // +1 day
          events.push({
            id: `event-2-${order.id}`,
            timestamp: labelDate.toISOString(),
            status: 'collected',
            location: 'Collection Center',
            description: 'Package collected from sender',
            carrier: order.deliveryCarrier || 'Carrier'
          });

          if (['in_transit', 'out_for_delivery', 'delivered'].includes(order.shippingStatus)) {
            // In transit
            const transitDate = new Date(labelDate.getTime() + 12 * 60 * 60 * 1000); // +12 hours
            events.push({
              id: `event-3-${order.id}`,
              timestamp: transitDate.toISOString(),
              status: 'in_transit',
              location: 'Regional Distribution Center',
              description: 'Package in transit to destination',
              carrier: order.deliveryCarrier || 'Carrier'
            });
          }

          if (['out_for_delivery', 'delivered'].includes(order.shippingStatus)) {
            // Out for delivery
            const outDate = new Date(orderDate.getTime() + 48 * 60 * 60 * 1000); // +2 days
            events.push({
              id: `event-4-${order.id}`,
              timestamp: outDate.toISOString(),
              status: 'out_for_delivery',
              location: 'Local Delivery Center',
              description: 'Out for delivery',
              carrier: order.deliveryCarrier || 'Carrier'
            });
          }

          if (order.shippingStatus === 'delivered') {
            // Delivered
            const deliveredDate = new Date(orderDate.getTime() + 60 * 60 * 60 * 1000); // +2.5 days
            events.push({
              id: `event-5-${order.id}`,
              timestamp: deliveredDate.toISOString(),
              status: 'delivered',
              location: 'Customer Address',
              description: 'Package delivered successfully',
              carrier: order.deliveryCarrier || 'Carrier'
            });
          }
        }

        return events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      };

      // Try to get real tracking from Parcel2Go API first
      let trackingData = {
        orderId: order.id,
        trackingNumber: order.deliveryTrackingNumber,
        carrier: order.deliveryCarrier || 'Unknown',
        status: order.shippingStatus || 'pending',
        estimatedDelivery: order.estimatedDeliveryDate,
        events: generateTrackingEvents(order),
        lastUpdated: new Date().toISOString()
      };

      // If we have Parcel2Go order details, try to fetch real tracking
      if (order.shippingOrderId && order.shippingHash) {
        try {
          const realTracking = await parcel2goService.getTracking(order.shippingOrderId, order.shippingHash);
          if (realTracking && realTracking.events) {
            trackingData.events = realTracking.events;
            trackingData.status = realTracking.status || trackingData.status;
          }
        } catch (trackingError) {
          console.log("Could not fetch real tracking data, using demo data");
        }
      }

      res.json(trackingData);
    } catch (error: any) {
      console.error("Error getting tracking details:", error);
      res.status(500).json({ message: "Failed to get tracking details", error: error.message });
    }
  });

  // Update shipping status for an order
  app.patch('/api/shipping/status/:orderId', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { orderId } = req.params;
      const { status, trackingNumber, estimatedDelivery } = req.body;
      
      // Get the order to verify ownership
      const order = await storage.getOrder(parseInt(orderId));
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Verify this order belongs to the current user (wholesaler)
      if (order.wholesalerId !== userId) {
        return res.status(403).json({ message: "Not authorized to update this order" });
      }

      // Update the order with new shipping status
      const updates: any = { shippingStatus: status };
      if (trackingNumber) updates.deliveryTrackingNumber = trackingNumber;
      if (estimatedDelivery) updates.estimatedDeliveryDate = new Date(estimatedDelivery);

      await storage.updateOrder(parseInt(orderId), updates);

      res.json({ 
        success: true, 
        message: "Shipping status updated successfully" 
      });
    } catch (error: any) {
      console.error("Error updating shipping status:", error);
      res.status(500).json({ message: "Failed to update shipping status", error: error.message });
    }
  });

  // Tab permissions routes
  app.get('/api/tab-permissions', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      
      // Only allow wholesaler (owner) to view permissions
      if (req.user.role === 'team_member') {
        return res.status(403).json({ message: "Only business owners can manage permissions" });
      }
      
      const permissions = await storage.getTabPermissions(userId);
      
      // If no permissions exist, create defaults
      if (permissions.length === 0) {
        await storage.createDefaultTabPermissions(userId);
        const defaultPermissions = await storage.getTabPermissions(userId);
        return res.json(defaultPermissions);
      }
      
      res.json(permissions);
    } catch (error) {
      console.error("Error fetching tab permissions:", error);
      res.status(500).json({ message: "Failed to fetch tab permissions" });
    }
  });

  app.put('/api/tab-permissions/:tabName', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { tabName } = req.params;
      const { isRestricted, allowedRoles } = req.body;
      
      // Only allow wholesaler (owner) to modify permissions
      if (req.user.role === 'team_member') {
        return res.status(403).json({ message: "Only business owners can manage permissions" });
      }
      
      const permission = await storage.updateTabPermission(userId, tabName, isRestricted, allowedRoles);
      
      res.json({
        success: true,
        message: `Permissions updated for ${tabName}`,
        permission
      });
    } catch (error) {
      console.error("Error updating tab permission:", error);
      res.status(500).json({ message: "Failed to update tab permission" });
    }
  });

  app.get('/api/tab-permissions/check/:tabName', requireAuth, async (req: any, res) => {
    try {
      const { tabName } = req.params;
      const user = req.user;
      
      let hasAccess = true;
      
      // If user is team member, check permissions
      if (user.role === 'team_member' && user.wholesalerId) {
        const userRole = 'member'; // Team members are 'member' role by default
        hasAccess = await storage.checkTabAccess(user.wholesalerId, tabName, userRole);
      }
      
      res.json({ hasAccess });
    } catch (error) {
      console.error("Error checking tab access:", error);
      res.status(500).json({ message: "Failed to check tab access" });
    }
  });

  // Bulk check all tab permissions for team members
  app.get('/api/tab-permissions/check-all', requireAuth, async (req: any, res) => {
    try {
      const user = req.user;
      
      // Only for team members
      if (user.role !== 'team_member' || !user.wholesalerId) {
        return res.json({}); // Return empty object for non-team members
      }
      
      const tabNames = ['dashboard', 'products', 'orders', 'customers', 'campaigns', 'analytics', 'marketplace', 'team-management', 'subscription', 'settings'];
      const userRole = 'member';
      const permissionChecks: Record<string, boolean> = {};
      
      // Check access for each tab
      for (const tabName of tabNames) {
        permissionChecks[tabName] = await storage.checkTabAccess(user.wholesalerId, tabName, userRole);
      }
      res.json(permissionChecks);
    } catch (error) {
      console.error("Error checking all tab access:", error);
      res.status(500).json({ message: "Failed to check tab access" });
    }
  });

  // Gamification API Routes
  app.get('/api/gamification/badges', requireAuth, async (req: any, res) => {
    try {
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      
      const badges = await storage.getUserBadges(targetUserId);
      res.json(badges);
    } catch (error) {
      console.error("Error fetching user badges:", error);
      res.status(500).json({ message: "Failed to fetch badges" });
    }
  });

  app.get('/api/gamification/progress', requireAuth, async (req: any, res) => {
    try {
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      
      const progress = await storage.getUserOnboardingProgress(targetUserId);
      res.json(progress);
    } catch (error) {
      console.error("Error fetching onboarding progress:", error);
      res.status(500).json({ message: "Failed to fetch progress" });
    }
  });

  app.get('/api/gamification/milestones', requireAuth, async (req: any, res) => {
    try {
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      
      const milestones = await storage.getUserMilestones(targetUserId);
      res.json(milestones);
    } catch (error) {
      console.error("Error fetching milestones:", error);
      res.status(500).json({ message: "Failed to fetch milestones" });
    }
  });

  app.post('/api/gamification/track-action', requireAuth, async (req: any, res) => {
    try {
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      
      const { action } = req.body;
      
      if (!action) {
        return res.status(400).json({ message: "Action is required" });
      }
      
      const result = await storage.checkMilestoneProgress(targetUserId, action);
      res.json(result);
    } catch (error) {
      console.error("Error tracking action:", error);
      res.status(500).json({ message: "Failed to track action" });
    }
  });

  app.post('/api/gamification/award-badge', requireAuth, async (req: any, res) => {
    try {
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      
      const { badgeId, badgeName, badgeDescription, experiencePoints, badgeType, badgeIcon, badgeColor } = req.body;
      
      if (!badgeId || !badgeName || !badgeDescription) {
        return res.status(400).json({ message: "Badge ID, name, and description are required" });
      }
      
      const badge = await storage.awardBadge(
        targetUserId,
        badgeId,
        badgeName,
        badgeDescription,
        experiencePoints || 0,
        badgeType || 'achievement',
        badgeIcon || '🏆',
        badgeColor || '#10B981'
      );
      
      res.json(badge);
    } catch (error) {
      console.error("Error awarding badge:", error);
      res.status(500).json({ message: "Failed to award badge" });
    }
  });

  app.patch('/api/gamification/update-progress', requireAuth, async (req: any, res) => {
    try {
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      
      const { completedSteps, currentMilestone, progressPercentage } = req.body;
      
      const updatedUser = await storage.updateOnboardingProgress(targetUserId, {
        completedSteps,
        currentMilestone,
        progressPercentage
      });
      
      res.json(updatedUser);
    } catch (error) {
      console.error("Error updating progress:", error);
      res.status(500).json({ message: "Failed to update progress" });
    }
  });

  // Promotion Analytics Routes
  app.get('/api/promotion-analytics/:productId', requireAuth, async (req: any, res) => {
    try {
      const productId = parseInt(req.params.productId);
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId ? req.user.wholesalerId : req.user.id;
      
      const analytics = await storage.getPromotionAnalyticsByProduct(targetUserId, productId);
      res.json(analytics);
    } catch (error) {
      console.error('Error fetching promotion analytics:', error);
      res.status(500).json({ error: 'Failed to fetch promotion analytics' });
    }
  });

  app.get('/api/promotion-analytics/summary/:productId', requireAuth, async (req: any, res) => {
    try {
      const productId = parseInt(req.params.productId);
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId ? req.user.wholesalerId : req.user.id;
      
      const summary = await storage.getProductPerformanceSummary(targetUserId, productId);
      res.json(summary);
    } catch (error) {
      console.error('Error fetching product performance summary:', error);
      res.status(500).json({ error: 'Failed to fetch product performance summary' });
    }
  });

  // Customer Address Book routes
  app.get('/api/customers', requireAuth, async (req: any, res) => {
    try {
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId ? req.user.wholesalerId : req.user.id;
      
      const customers = await storage.getAllCustomers(targetUserId);
      res.json(customers);
    } catch (error) {
      console.error('Error fetching customers:', error);
      res.status(500).json({ error: 'Failed to fetch customers' });
    }
  });

  app.post('/api/customers', requireAuth, async (req: any, res) => {
    try {
      console.log('Creating customer - user:', req.user);
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId ? req.user.wholesalerId : req.user.id;
      
      const { firstName, lastName, email, phoneNumber } = req.body;
      console.log('Customer data:', { firstName, lastName, email, phoneNumber });
      
      if (!firstName || !phoneNumber) {
        return res.status(400).json({ error: 'First name and phone number are required' });
      }
      
      // Format phone number
      const formattedPhone = formatPhoneToInternational(phoneNumber);
      console.log('Formatted phone:', formattedPhone);
      
      // Check for existing customer by phone number first
      let customer = await storage.getUserByPhone(formattedPhone);
      
      if (customer) {
        // Update existing customer info if needed
        if (email && customer.email !== email) {
          customer = await storage.updateCustomer(customer.id, { email });
        }
        console.log('Using existing customer:', customer);
      } else {
        // Check for existing customer with same email and 'customer' role
        if (email) {
          const existingCustomer = await storage.getUserByEmail(email, 'customer');
          if (existingCustomer) {
            return res.status(400).json({ 
              error: 'A customer with this email already exists. Please use a different email or update the existing customer.' 
            });
          }
        }
        
        // Create new customer user
        customer = await storage.createCustomer({
          firstName,
          lastName: lastName || '',
          email: email || '',
          phoneNumber: formattedPhone,
          role: 'customer'
        });
      }
      
      console.log('Customer created:', customer);

      // Get wholesaler details for welcome messages
      const wholesaler = await storage.getUser(targetUserId);
      console.log('Wholesaler found for welcome messages:', wholesaler ? `${wholesaler.firstName} ${wholesaler.lastName} (${wholesaler.email})` : 'No wholesaler found');
      
      if (wholesaler) {
        const customerName = `${firstName} ${lastName || ''}`.trim();
        const portalUrl = `${process.env.REPLIT_DEV_DOMAIN || 'https://quikpik.app'}/customer-portal`;
        const wholesalerName = `${wholesaler.firstName} ${wholesaler.lastName || ''}`.trim() || wholesaler.businessName || 'Your Wholesale Partner';
        
        console.log('Sending welcome messages with params:', {
          customerName,
          customerEmail: email,
          customerPhone: formattedPhone,
          wholesalerName,
          wholesalerEmail: wholesaler.email,
          portalUrl
        });
        
        // Send welcome messages (email and WhatsApp)
        try {
          const welcomeResult = await sendWelcomeMessages({
            customerName,
            customerEmail: email,
            customerPhone: formattedPhone,
            wholesalerName,
            wholesalerEmail: wholesaler.email || 'support@quikpik.co',
            wholesalerPhone: wholesaler.phoneNumber,
            portalUrl
          });
          
          console.log('Welcome messages result:', welcomeResult);
          
          // Add welcome message status to response
          res.json({
            ...customer,
            welcomeMessages: {
              emailSent: welcomeResult.emailSent,
              whatsappSent: welcomeResult.whatsappSent,
              errors: welcomeResult.errors
            }
          });
        } catch (welcomeError) {
          console.error('Error sending welcome messages:', welcomeError);
          // Still return customer even if welcome messages fail
          res.json({
            ...customer,
            welcomeMessages: {
              emailSent: false,
              whatsappSent: false,
              errors: [`Failed to send welcome messages: ${welcomeError.message}`]
            }
          });
        }
      } else {
        console.log('No wholesaler found - skipping welcome messages');
        res.json({
          ...customer,
          welcomeMessages: {
            emailSent: false,
            whatsappSent: false,
            errors: ['No wholesaler account found to send welcome messages from']
          }
        });
      }
    } catch (error) {
      console.error('Error creating customer:', error);
      res.status(500).json({ error: 'Failed to create customer', details: error.message });
    }
  });

  app.get('/api/customers/search', requireAuth, async (req: any, res) => {
    try {
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId ? req.user.wholesalerId : req.user.id;
      const { q } = req.query;
      
      if (!q || typeof q !== 'string') {
        return res.status(400).json({ error: 'Search query is required' });
      }
      
      const customers = await storage.searchCustomers(targetUserId, q);
      res.json(customers);
    } catch (error) {
      console.error('Error searching customers:', error);
      res.status(500).json({ error: 'Failed to search customers' });
    }
  });

  app.get('/api/customers/stats', requireAuth, async (req: any, res) => {
    try {
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId ? req.user.wholesalerId : req.user.id;
      
      const stats = await storage.getCustomerStats(targetUserId);
      res.json(stats);
    } catch (error) {
      console.error('Error fetching customer stats:', error);
      res.status(500).json({ error: 'Failed to fetch customer stats' });
    }
  });

  app.delete('/api/customers/:id', requireAuth, async (req: any, res) => {
    try {
      const customerId = req.params.id;
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId ? req.user.wholesalerId : req.user.id;
      
      // Verify the customer belongs to this user
      const customers = await storage.getAllCustomers(targetUserId);
      const customer = customers.find(c => c.id === customerId);
      
      if (!customer) {
        return res.status(404).json({ error: 'Customer not found' });
      }
      
      // Delete the customer (this will cascade to remove from groups and orders)
      await storage.deleteCustomer(customerId);
      res.json({ success: true, message: 'Customer deleted successfully' });
    } catch (error) {
      console.error('Error deleting customer:', error);
      res.status(500).json({ error: 'Failed to delete customer' });
    }
  });

  // Test endpoint for welcome messages
  app.post('/api/test-welcome-messages', requireAuth, async (req: any, res) => {
    try {
      const { customerName, customerEmail, customerPhone } = req.body;
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId ? req.user.wholesalerId : req.user.id;
      
      const wholesaler = await storage.getUser(targetUserId);
      if (!wholesaler) {
        return res.status(400).json({ error: 'No wholesaler account found' });
      }
      
      const wholesalerName = `${wholesaler.firstName} ${wholesaler.lastName || ''}`.trim() || wholesaler.businessName || 'Your Wholesale Partner';
      const portalUrl = `${process.env.REPLIT_DEV_DOMAIN || 'https://quikpik.app'}/customer-portal`;
      
      const welcomeResult = await sendWelcomeMessages({
        customerName,
        customerEmail,
        customerPhone,
        wholesalerName,
        wholesalerEmail: wholesaler.email || 'support@quikpik.co',
        wholesalerPhone: wholesaler.phoneNumber,
        portalUrl
      });
      
      res.json(welcomeResult);
    } catch (error) {
      console.error('Error in test welcome messages:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Manual welcome message test (no auth required for testing)
  app.post('/api/manual-welcome-test', async (req, res) => {
    try {
      const { customerEmail, customerName, customerPhone, wholesalerId } = req.body;
      
      const wholesaler = await storage.getUser(wholesalerId);
      if (!wholesaler) {
        return res.status(400).json({ error: 'Wholesaler not found' });
      }
      
      const wholesalerName = `${wholesaler.firstName} ${wholesaler.lastName || ''}`.trim() || wholesaler.businessName || 'Your Wholesale Partner';
      const portalUrl = `${process.env.REPLIT_DEV_DOMAIN || 'https://quikpik.app'}/customer-portal`;
      
      console.log('🧪 Testing welcome messages with:', {
        customerName,
        customerEmail,
        customerPhone,
        wholesalerName,
        wholesalerEmail: wholesaler.email
      });
      
      const welcomeResult = await sendWelcomeMessages({
        customerName,
        customerEmail,
        customerPhone,
        wholesalerName,
        wholesalerEmail: wholesaler.email || 'support@quikpik.co',
        wholesalerPhone: wholesaler.phoneNumber,
        portalUrl
      });
      
      res.json({
        success: true,
        welcomeResult,
        wholesalerUsed: {
          name: wholesalerName,
          email: wholesaler.email,
          business: wholesaler.businessName
        }
      });
    } catch (error) {
      console.error('Manual welcome test error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get('/api/customers/:id', requireAuth, async (req: any, res) => {
    try {
      const customerId = req.params.id;
      
      const customer = await storage.getCustomerDetails(customerId);
      if (!customer) {
        return res.status(404).json({ error: 'Customer not found' });
      }
      
      res.json(customer);
    } catch (error) {
      console.error('Error fetching customer details:', error);
      res.status(500).json({ error: 'Failed to fetch customer details' });
    }
  });

  app.patch('/api/customers/:id', requireAuth, async (req: any, res) => {
    try {
      const customerId = req.params.id;
      const updates = req.body;
      
      console.log('Updating customer:', customerId, 'with updates:', updates);
      const updatedCustomer = await storage.updateCustomer(customerId, updates);
      console.log('Customer updated successfully:', updatedCustomer);
      res.json(updatedCustomer);
    } catch (error) {
      console.error('Error updating customer:', error);
      res.status(500).json({ error: 'Failed to update customer' });
    }
  });

  // Customer merge endpoint
  app.post('/api/customers/merge', requireAuth, async (req: any, res) => {
    try {
      const { primaryCustomerId, duplicateCustomerIds, mergedData } = req.body;
      
      if (!primaryCustomerId || !Array.isArray(duplicateCustomerIds) || duplicateCustomerIds.length === 0) {
        return res.status(400).json({ error: 'Primary customer ID and duplicate customer IDs are required' });
      }
      
      console.log('Merging customers:', { primaryCustomerId, duplicateCustomerIds, mergedData });
      
      // Merge customer records
      const mergedCustomer = await storage.mergeCustomers(primaryCustomerId, duplicateCustomerIds, mergedData);
      
      res.json({ 
        success: true, 
        mergedCustomer,
        message: `Successfully merged ${duplicateCustomerIds.length} duplicate customer records`
      });
    } catch (error) {
      console.error('Error merging customers:', error);
      res.status(500).json({ error: 'Failed to merge customers' });
    }
  });

  app.patch('/api/customers/bulk', requireAuth, async (req: any, res) => {
    try {
      const { customerUpdates } = req.body;
      
      if (!Array.isArray(customerUpdates)) {
        return res.status(400).json({ error: 'customerUpdates must be an array' });
      }
      
      await storage.bulkUpdateCustomers(customerUpdates);
      res.json({ success: true });
    } catch (error) {
      console.error('Error bulk updating customers:', error);
      res.status(500).json({ error: 'Failed to bulk update customers' });
    }
  });

  app.get('/api/promotion-analytics/dashboard', requireAuth, async (req: any, res) => {
    try {
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId ? req.user.wholesalerId : req.user.id;
      
      const dashboardData = await storage.getPromotionDashboard(targetUserId);
      res.json(dashboardData);
    } catch (error) {
      console.error('Error fetching promotion dashboard:', error);
      res.status(500).json({ error: 'Failed to fetch promotion dashboard data' });
    }
  });

  app.post('/api/promotion-analytics/track', requireAuth, async (req: any, res) => {
    try {
      const { campaignId, productId, action, metadata } = req.body;
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId ? req.user.wholesalerId : req.user.id;
      
      await storage.trackPromotionActivity(targetUserId, campaignId, productId, action, metadata);
      res.json({ success: true });
    } catch (error) {
      console.error('Error tracking promotion activity:', error);
      res.status(500).json({ error: 'Failed to track promotion activity' });
    }
  });

  // Phase 2: Email verification endpoints for enhanced customer authentication
  app.post('/api/customer-email-verification/send', async (req, res) => {
    try {
      const { customerId, email } = req.body;
      
      if (!customerId || !email) {
        return res.status(400).json({ 
          success: false, 
          message: 'Customer ID and email are required' 
        });
      }
      
      // Verify customer exists and has this email
      const customer = await storage.getUser(customerId);
      if (!customer || customer.email !== email) {
        return res.status(403).json({ 
          success: false, 
          message: 'Customer email verification failed' 
        });
      }
      
      // Send email verification code
      const verificationCode = await createEmailVerification(customerId, email);
      
      res.json({ 
        success: true, 
        message: 'Email verification code sent',
        expiresIn: 600 // 10 minutes
      });
      
    } catch (error) {
      console.error('Email verification send error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to send email verification' 
      });
    }
  });

  app.post('/api/customer-email-verification/verify', async (req, res) => {
    try {
      const { customerId, email, code } = req.body;
      
      if (!customerId || !email || !code) {
        return res.status(400).json({ 
          success: false, 
          message: 'Customer ID, email, and verification code are required' 
        });
      }
      
      // Verify the email code
      const isVerified = await verifyEmailCode(customerId, email, code);
      
      if (isVerified) {
        res.json({ 
          success: true, 
          message: 'Email verified successfully' 
        });
      } else {
        res.status(400).json({ 
          success: false, 
          message: 'Invalid or expired verification code' 
        });
      }
      
    } catch (error) {
      console.error('Email verification verify error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to verify email code' 
      });
    }
  });

  return httpServer;
}
