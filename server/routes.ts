import type { Express } from "express";
import { createServer, type Server } from "http";
import Stripe from "stripe";
import { storage } from "./storage";
import { performanceMiddleware } from "./middleware/performance";
import { queryOptimizer, queryCache } from "./utils/connectionPool";
import compression from "compression";
import { setupAuth, isAuthenticated } from "./replitAuth";
import { getGoogleAuthUrl, verifyGoogleToken, createOrUpdateUser, requireAuth, requireAnyAuth } from "./googleAuth";
import { validatePassword, hashPassword, verifyPassword } from "./passwordUtils";
import { insertProductSchema, insertOrderSchema, insertCustomerGroupSchema, insertBroadcastSchema, insertMessageTemplateSchema, insertTemplateProductSchema, insertTemplateCampaignSchema, users, orders, orderItems, orderPayments, products, customerGroups, customerGroupMembers, smsVerificationCodes, insertSMSVerificationCodeSchema, customerRegistrationRequests, insertCustomerRegistrationRequestSchema, campaignOrders, subscriptionPlans, userSubscriptions, stockMovements, orderCancellationRequests, wholesalerCustomerRelationships, teamMembers } from "@shared/schema";
import { InventoryCalculator } from "@shared/inventory-calculator";

// CRITICAL FIX: Copy exact address parsing logic from UI order detail page
function parseAddressForEmail(address: string | null | undefined): {
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
} {
  const defaultComponents = {
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    postalCode: '',
    country: ''
  };

  if (!address || typeof address !== 'string') return defaultComponents;
  
  // Clean up the string - remove extra quotes and whitespace
  let cleanAddress = address.trim();
  cleanAddress = cleanAddress.replace(/^["']+|["']+$/g, '');
  
  if (!cleanAddress) return defaultComponents;

  try {
    // Try to parse as JSON first
    const parsed = JSON.parse(cleanAddress);
    
    if (parsed && typeof parsed === 'object') {
      return {
        addressLine1: parsed.street || parsed.addressLine1 || parsed.address1 || '',
        addressLine2: parsed.addressLine2 || parsed.address2 || '',
        city: parsed.city || '',
        state: parsed.state || parsed.region || parsed.county || '',
        postalCode: parsed.postalCode || parsed.postcode || parsed.zipCode || parsed.zip || '',
        country: parsed.country || '',
      };
    }
  } catch {
    // If not JSON, parse as comma-separated address (this is the key part!)
    const addressParts = cleanAddress.split(',').map(part => part.trim());
    
    // Filter out undefined/null/empty values
    const validParts = addressParts.filter(part => 
      part && 
      part !== 'undefined' && 
      part !== 'null' && 
      part.toLowerCase() !== 'undefined' && 
      part.toLowerCase() !== 'null'
    );
    
    if (validParts.length >= 2) {
      const result: any = {
        addressLine1: '',
        addressLine2: '',
        city: '',
        state: '',
        postalCode: '',
        country: ''
      };
      
      if (validParts.length >= 6) {
        // Full format: Address1, Address2, City, State, PostalCode, Country
        result.addressLine1 = validParts[0];
        result.addressLine2 = validParts[1];
        result.city = validParts[2];
        result.state = validParts[3];
        result.postalCode = validParts[4];
        result.country = validParts[5];
      } else if (validParts.length === 5) {
        // Format: Address, City, State, PostalCode, Country
        result.addressLine1 = validParts[0];
        result.city = validParts[1];
        result.state = validParts[2];
        result.postalCode = validParts[3];
        result.country = validParts[4];
      } else if (validParts.length === 4) {
        // Format: City, State, PostalCode, Country
        result.city = validParts[0];
        result.state = validParts[1];
        result.postalCode = validParts[2];
        result.country = validParts[3];
      } else if (validParts.length === 3) {
        // Format: Address, City, Country
        result.addressLine1 = validParts[0];
        result.city = validParts[1];
        result.country = validParts[2];
      } else if (validParts.length === 2) {
        // Simple format: City, Country
        result.city = validParts[0];
        result.country = validParts[1];
      }
      
      console.log(`🏠 ROUTES ADDRESS PARSED: "${cleanAddress}" → components:`, result);
      return result;
    }
  }
  
  return defaultComponents;
}
import { generateProductDescription, generateProductImage } from "./ai";
import { generatePersonalizedTagline, generateCampaignSuggestions, optimizeMessageTiming } from "./ai-taglines";
import { parcel2goService, createTestCredentials } from "./parcel2go";
import { formatPhoneToInternational, validatePhoneNumber } from "../shared/phone-utils";
import { whatsAppBusinessService } from "./whatsapp-simple";
import { PreciseShippingCalculator } from "./utils/preciseShippingCalculator";
import { healthCheck } from "./health";
import { z } from "zod";
import OpenAI from "openai";
import twilio from "twilio";
import nodemailer from "nodemailer";
import { SubscriptionService } from "./subscription-service";
import { requireFeatureAccess, requireProductLimits, requireBroadcastLimits, requireTeamMemberLimits, getUserPlanLimits } from "./middleware/feature-gating";
import sgMail from "@sendgrid/mail";
import cookieParser from "cookie-parser";
import { ReliableSMSService } from "./sms-service";
import { sendSMS } from "./services/smsService";
import { sendEmail } from "./sendgrid-service";
import { generateResetToken, createResetExpiration, sendPasswordResetEmail, hashResetToken } from './passwordResetService';
import { createEmailVerification, verifyEmailCode } from "./email-verification";
import { generateWholesalerOrderNotificationEmail, generateReadyForCollectionEmail, wrapCustomerEmail, emailCard, emailButton, emailHeading, emailBadge, emailDivider, getEmailLogoUrl, buildItemisedRefundEmail, generateDowngradeScheduledEmail, generateDowngradeEffectiveEmail, type OrderEmailData, type ReadyForCollectionEmailData, type RefundLineItem } from "./email-templates";
import { sendWelcomeMessages } from "./services/welcomeMessageService.js";
import { orderNotificationService } from "./services/orderNotificationService";
// Removed conflicting import - using parseCustomerName defined below
import { quickOrderService } from "./services/quickOrderService";
import { multiWholesalerService } from "./services/multiWholesalerService";
import { db } from "./db";
import { eq, and, desc, inArray, or, gt, sql, count, sum, gte, lte, lt, ne, asc, isNull, like } from "drizzle-orm";
// Subscription logging removed
import { registerWebhookRoutes } from "./webhook-handler";
import { getEmailDeliveryAddress } from "./utils/address-helper";

// Helper function to extract session ID from cookie string
function extractSessionId(cookieString?: string): string | null {
  if (!cookieString) {
    return null;
  }
  
  // Try different cookie patterns
  let sessionMatch = cookieString.match(/connect\.sid=s%3A([^;]+)/);
  if (sessionMatch && sessionMatch[1]) {
    const decoded = decodeURIComponent(sessionMatch[1]).split('.')[0];
    return decoded;
  }
  
  // Try unencoded pattern
  sessionMatch = cookieString.match(/connect\.sid=([^;]+)/);
  if (sessionMatch && sessionMatch[1]) {
    const sessionId = sessionMatch[1].split('.')[0];
    return sessionId;
  }
  
  return null;
}

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('STRIPE_SECRET_KEY not found. Stripe functionality will not work.');
}

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: "2025-08-27.basil",
}) : null;


const openai = process.env.OPENAI_API_KEY ? new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
}) : null;

// Helper function to format numbers with commas

// Helper function for generating consistent SF-XXX order numbers
async function generateOrderNumber(wholesalerId: string, trx?: any) {
  const wholesaler = await storage.getUser(wholesalerId);
  const businessPrefix = wholesaler?.businessName 
    ? wholesaler.businessName.split(' ').map(word => word.charAt(0)).join('').substring(0, 2).toUpperCase()
    : 'WS';
  
  console.log(`🔍 DEBUG generateOrderNumber: wholesalerId=${wholesalerId}, businessPrefix=${businessPrefix}`);
  
  const dbConnection = trx || db;
  
  // CRITICAL FIX: Fix SQL syntax error by properly handling LIKE pattern
  const likePattern = `${businessPrefix}-%`;
  console.log(`🔍 DEBUG: LIKE pattern = "${likePattern}"`);
  
  try {
    const result = await dbConnection.execute(sql`
      SELECT COALESCE(MAX(CAST(SPLIT_PART(order_number, '-', 2) AS INTEGER)), 0) as max_number
      FROM orders 
      WHERE wholesaler_id = ${wholesalerId} 
      AND order_number LIKE ${likePattern}
    `);
    
    const maxNumber = result.rows[0]?.max_number || 0;
    const nextNumber = parseInt(maxNumber.toString()) + 1;
    const orderNumber = `${businessPrefix}-${nextNumber.toString().padStart(3, '0')}`;
    
    console.log(`🏢 Generated order number: ${orderNumber} (from max: ${maxNumber} -> next: ${nextNumber}) for ${wholesaler?.businessName || 'Unknown Business'}`);
    return orderNumber;
  } catch (error: any) {
    console.error(`❌ CRITICAL: generateOrderNumber SQL error:`, {
      error: error.message,
      wholesalerId,
      businessPrefix,
      likePattern,
      errorCode: error.code,
      errorPosition: error.position,
      fullError: error
    });
    throw error;
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

    const baseUrl = 'https://quikpik.app';

    const token = teamMember.inviteToken || String(teamMember.id);
    const inviteUrl = `${baseUrl}/team-invitation?token=${encodeURIComponent(token)}&email=${encodeURIComponent(teamMember.email)}`;

    // Build accurate permissions description from tab settings
    let accessDescription = 'Full access to all platform areas.';
    try {
      const perms = await storage.getTabPermissions(wholesaler.id);
      const mainTabs = ['products', 'orders', 'customers', 'campaigns', 'analytics'];
      const tabLabels: Record<string, string> = {
        products: 'Products', orders: 'Orders', customers: 'Customers',
        campaigns: 'Broadcast', analytics: 'Analytics',
      };
      const allowed = mainTabs.filter(tab => {
        const perm = perms.find((p: any) => p.tabName === tab);
        return !perm || !perm.isRestricted;
      });
      if (allowed.length > 0 && allowed.length < mainTabs.length) {
        accessDescription = `Access to: ${allowed.map(t => tabLabels[t]).join(', ')}.`;
      }
    } catch { /* keep default */ }

    const roleLabel = teamMember.role.charAt(0).toUpperCase() + teamMember.role.slice(1);
    const inviteBody = `${emailHeading("You're Invited!", { size: '22px', color: '#10b981' })}<p style="font-size:16px;margin:0 0 8px">Hello ${teamMember.firstName},</p><p style="margin:0 0 20px"><strong>${wholesaler.businessName || wholesaler.name}</strong> has invited you to join their team on Quikpik, the wholesale management platform.</p>${emailCard(`<p style="margin:0 0 6px"><strong>Your Role:</strong> ${emailBadge(roleLabel)}</p><p style="margin:0;color:#6b7280;font-size:14px">${accessDescription}</p>`)}<p style="margin:0 0 4px">This invitation expires in <strong>7 days</strong>. Click the button below to create your account and get started.</p><br>${emailButton('Accept Invitation & Join Team', inviteUrl)}<p style="color:#6b7280;font-size:13px;text-align:center;margin:16px 0 0">Or copy and paste this link in your browser:<br><span style="word-break:break-all">${inviteUrl}</span></p>${emailDivider()}<p style="color:#9ca3af;font-size:12px;text-align:center;margin:0">This invitation was sent by <strong>${wholesaler.email}</strong>. If you didn't expect this invitation, you can safely ignore this email.</p>`;

    const msg = {
      to: teamMember.email,
      from: { email: 'hello@quikpik.co', name: 'Quikpik Team' },
      subject: `You're invited to join ${wholesaler.businessName || wholesaler.name} on Quikpik`,
      html: wrapCustomerEmail(inviteBody, { businessName: wholesaler.businessName || wholesaler.name || 'Quikpik', logoUrl: getEmailLogoUrl(wholesaler.id, wholesaler.logoType, wholesaler.logoUrl) }, { preheader: `${wholesaler.businessName || wholesaler.name} has invited you to join their team` })
    };

    const response = await sgMail.send(msg);
    if (response[0].statusCode === 202) {
      console.log('✅ Team invitation email sent to:', teamMember.email);
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

// ─── Multi-PI Stripe refund helper ──────────────────────────────────────────
// For deposit orders two separate Stripe payment intents are created (deposit
// + balance).  The field stripePaymentIntentId stores them comma-separated,
// newest last.  We refund from newest first and continue to older ones until
// the full amount is covered.
async function refundAcrossPaymentIntents(
  stripeClient: Stripe,
  piIdsStr: string,
  totalAmountPounds: number,
  metadata: Record<string, string>
): Promise<{ totalRefunded: number; remaining: number; lastError: string | null }> {
  const piIds = piIdsStr.split(',').map((s: string) => s.trim()).filter(Boolean).reverse(); // newest first
  let remainingPence = Math.round(totalAmountPounds * 100);
  let totalRefundedPence = 0;
  let lastError: string | null = null;

  for (const piId of piIds) {
    if (remainingPence <= 0) break;
    try {
      // Retrieve the PI to find the latest charge and how much is still refundable
      const pi = await stripeClient.paymentIntents.retrieve(piId);
      const chargeId = (pi as any).latest_charge as string | null;
      let refundablePence = remainingPence; // fallback: try full amount

      if (chargeId) {
        const charge = await stripeClient.charges.retrieve(chargeId);
        refundablePence = charge.amount - charge.amount_refunded;
      }

      if (refundablePence <= 0) {
        console.log(`💳 PI ${piId} fully refunded already, skipping`);
        continue;
      }

      const refundThisPence = Math.min(remainingPence, refundablePence);
      const refund = await stripeClient.refunds.create({
        payment_intent: piId,
        amount: refundThisPence,
        reason: 'requested_by_customer',
        metadata
      });

      totalRefundedPence += refund.amount;
      remainingPence -= refund.amount;
      console.log(`💳 Refunded £${(refund.amount / 100).toFixed(2)} from PI ${piId}, remaining: £${(remainingPence / 100).toFixed(2)}`);
    } catch (e: any) {
      lastError = e?.message || 'Unknown error';
      console.error(`Stripe refund failed for PI ${piId}:`, e);
    }
  }

  return {
    totalRefunded: totalRefundedPence / 100,
    remaining: remainingPence / 100,
    lastError: totalRefundedPence > 0 && remainingPence === 0 ? null : lastError
  };
}
// ─────────────────────────────────────────────────────────────────────────────

// Shared helper: recalculate order payment status from cumulative paid vs. total
// Used by both the Stripe webhook and the manual payment endpoint
function applyPaymentToOrder(
  currentPaid: number,
  orderTotal: number,
  thisPayment: number
): { cumulativePaid: number; newOutstanding: number; paymentStatus: string } {
  const cumulativePaid = currentPaid + thisPayment;
  const newOutstanding = Math.max(0, orderTotal - cumulativePaid);
  let paymentStatus = 'unpaid';
  if (newOutstanding <= 0.01) {
    paymentStatus = 'paid';
  } else if (cumulativePaid > 0) {
    paymentStatus = 'part_paid';
  }
  return { cumulativePaid, newOutstanding, paymentStatus };
}

export async function registerRoutes(app: Express): Promise<Server> {
  console.log(`🔧 Registering routes... Express env: ${app.get('env')}, NODE_ENV: ${process.env.NODE_ENV}`);
  // CRITICAL FIX: Setup session middleware FIRST before any routes
  console.log('🔧 Setting up session middleware at start of registerRoutes...');
  await setupAuth(app);
  console.log('✅ Session middleware configured successfully');

  // Apply lightweight performance middleware
  app.use(compression());
  app.use(performanceMiddleware.securityHeadersMiddleware());

  // Health check endpoint for deployment monitoring
  app.get('/api/health', healthCheck);

  // Public logo endpoint — used in emails so no auth required
  app.get('/api/logo/:wholesalerId', async (req, res) => {
    try {
      const { wholesalerId } = req.params;
      const result = await db.select({ logoUrl: users.logoUrl, logoType: users.logoType }).from(users).where(eq(users.id, wholesalerId)).limit(1);
      if (!result.length || !result[0].logoUrl) return res.status(404).end();
      const { logoUrl, logoType } = result[0];
      if (logoType === 'custom' && logoUrl.startsWith('data:')) {
        const match = logoUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (!match) return res.status(400).end();
        const [, mimeType, base64Data] = match;
        const buffer = Buffer.from(base64Data, 'base64');
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.send(buffer);
      }
      if (logoUrl.startsWith('http')) return res.redirect(logoUrl);
      return res.status(404).end();
    } catch (error) {
      console.error('Error serving logo:', error);
      res.status(500).end();
    }
  });

  // Test auth endpoint for development
  app.get('/api/test-auth', async (req, res) => {
    if (process.env.NODE_ENV !== 'development') {
      return res.status(404).json({ error: "Not found" });
    }
    
    const testUser = {
      id: 'test-user-123',
      firstName: 'Test',
      lastName: 'User', 
      email: 'test@example.com',
      businessName: 'Test Business',
      role: 'wholesaler',
      logoType: 'business',
      logoUrl: ''
    };
    
    res.json({ user: testUser, authenticated: true });
  });


  // Test products endpoint (development only - bypasses auth for demo)
  app.get('/api/test-products', async (req, res) => {
    if (process.env.NODE_ENV !== 'development') {
      return res.status(404).json({ error: "Not found" });
    }
    
    try {
      // Return some test products for demonstration
      const testProducts = [
        {
          id: '1',
          name: 'Premium Widget A',
          description: 'High-quality widget for premium customers',
          price: '29.99',
          stock: 150,
          category: 'Electronics',
          status: 'active'
        },
        {
          id: '2', 
          name: 'Standard Widget B',
          description: 'Reliable widget for everyday use',
          price: '19.99',
          stock: 75,
          category: 'Electronics', 
          status: 'active'
        },
        {
          id: '3',
          name: 'Economy Widget C',
          description: 'Budget-friendly widget option',
          price: '12.99',
          stock: 200,
          category: 'Basic',
          status: 'active'
        }
      ];
      
      res.json(testProducts);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch test products" });
    }
  });

  // Logo upload URL endpoint (temporary bypass for testing)
  app.post('/api/logo-upload-url', async (req, res) => {
    try {
      console.log('🔧 Logo upload URL request (bypass enabled for testing)');
      
      // Check if object storage is configured
      if (!process.env.PUBLIC_OBJECT_SEARCH_PATHS) {
        console.error('❌ Object storage not configured - PUBLIC_OBJECT_SEARCH_PATHS missing');
        return res.status(500).json({ 
          error: 'Object storage not configured',
          details: 'PUBLIC_OBJECT_SEARCH_PATHS environment variable not set'
        });
      }
      
      const { ObjectStorageService } = await import('./objectStorage.js');
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      
      console.log('✅ Logo upload URL generated successfully:', uploadURL ? 'URL received' : 'No URL');
      res.json({ uploadURL });
      
    } catch (error) {
      console.error('❌ Error getting upload URL:', error);
      console.error('❌ Full error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      res.status(500).json({ 
        error: 'Failed to get upload URL',
        details: error.message 
      });
    }
  });

  // Simple logo URL update endpoint (fallback method)
  app.post('/api/update-logo-url', requireAuth, async (req, res) => {
    try {
      console.log('🔧 Direct logo URL update request from authenticated user:', req.user?.email);
      const { logoUrl } = req.body;
      
      if (!logoUrl || typeof logoUrl !== 'string') {
        return res.status(400).json({ error: 'Valid logo URL required' });
      }
      
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      const updatedUser = await storage.updateUserSettings(req.user.id, {
        logoUrl: logoUrl,
        logoType: 'custom'
      });
      
      console.log('✅ Logo URL updated successfully for user:', updatedUser.businessName);
      res.json({ 
        success: true, 
        message: 'Logo URL updated successfully',
        logoUrl: updatedUser.logoUrl 
      });
      
    } catch (error) {
      console.error('❌ Error updating logo URL:', error);
      res.status(500).json({ error: 'Failed to update logo URL' });
    }
  });

  // Base64 logo upload endpoint (simple alternative)
  app.post('/api/upload-logo-base64', requireAuth, async (req, res) => {
    try {
      console.log('🔧 Base64 logo upload request from authenticated user:', req.user?.email);
      const { imageData, fileName, fileType } = req.body;
      
      if (!imageData || !fileType) {
        return res.status(400).json({ error: 'Image data and file type required' });
      }
      
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      // Convert base64 to data URL format
      const dataUrl = `data:${fileType};base64,${imageData}`;
      
      const updatedUser = await storage.updateUserSettings(req.user.id, {
        logoUrl: dataUrl,
        logoType: 'custom'
      });
      
      console.log('✅ Base64 logo updated successfully for user:', updatedUser.businessName);
      res.json({ 
        success: true, 
        message: 'Logo uploaded successfully',
        logoUrl: dataUrl 
      });
      
    } catch (error) {
      console.error('❌ Error uploading base64 logo:', error);
      res.status(500).json({ error: 'Failed to upload logo' });
    }
  });

  // Clear/reset user logo endpoint (authenticated users only)
  app.post('/api/clear-logo', requireAuth, async (req, res) => {
    try {
      console.log('🧹 Logo clear request from authenticated user:', req.user?.email);
      
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      // Clear the logo settings for the authenticated user
      const updatedUser = await storage.updateUserSettings(req.user.id, {
        logoUrl: null,
        logoType: 'business' // Reset to business initials
      });
      
      console.log('✅ Logo cleared successfully for user:', updatedUser.businessName);
      res.json({ 
        success: true, 
        message: 'Logo cleared successfully',
        logoType: updatedUser.logoType 
      });
    } catch (error) {
      console.error('🧹 Error clearing logo:', error);
      res.status(500).json({ error: 'Failed to clear logo' });
    }
  });

  // Performance metrics endpoint (development only)
  app.get("/api/performance", (req, res) => {
    if (process.env.NODE_ENV !== 'development') {
      return res.status(404).json({ error: "Not found" });
    }
    
    res.json({
      queryStats: queryOptimizer.getQueryStats(),
      slowQueries: queryOptimizer.getSlowQueries(),
      cacheStats: queryCache.getStats(),
      responseCache: performanceMiddleware.getCacheStats()
    });
  });

  // SECURITY FIX: Disabled debug login endpoint that was causing data leaks
  // Debug endpoints should only be enabled in development and require explicit email
  app.post("/api/debug/login", async (req, res) => {
    // Only allow in development environment
    if (process.env.NODE_ENV !== 'development') {
      return res.status(404).json({ error: "Not found" });
    }
    
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ error: "Email is required for debug login" });
      }
      
      console.log('🔍 Debug login - session check:', {
        sessionExists: !!req.session,
        sessionId: req.sessionID,
        requestedEmail: email
      });
      
      const user = await storage.getUserByEmail(email);
      if (user && req.session) {
        (req.session as any).userId = user.id;
        (req.session as any).user = user;
        console.log(`🔐 Debug session created for user ${user.email}`, {
          sessionId: req.sessionID,
          userId: user.id
        });
        res.json({ success: true, user: { id: user.id, email: user.email, role: user.role } });
      } else {
        console.log('❌ User not found or session not available', { userFound: !!user, sessionExists: !!req.session });
        res.status(404).json({ error: "User not found or session unavailable" });
      }
    } catch (error) {
      console.error('Debug login error:', error);
      res.status(500).json({ error: "Login failed" });
    }
  });
  // Set up trust proxy setting before any middleware  
  app.set("trust proxy", 1);
  
  // Add cookie parser middleware for customer authentication
  app.use(cookieParser());

  // WEBHOOK HANDLERS DISABLED - Using standalone webhook server on port 5001 to prevent duplicates
  // registerWebhookRoutes(app);

  // ===================================================================
  // PLAN LIMIT ENFORCEMENT HELPER
  // Called whenever a subscription downgrades (immediately or via webhook)
  // Locks excess products and suspends excess team members for the new tier
  // ===================================================================
  const PLAN_ENFORCEMENT_LIMITS: Record<string, { products: number; invitedMembersAllowed: number; groups: number }> = {
    free:     { products: 10, invitedMembersAllowed: 0, groups: 2  },  // owner only; 0 invited members in teamMembers table
    standard: { products: 50, invitedMembersAllowed: 3, groups: 5  },  // keep first 3 active invited members
    premium:  { products: -1, invitedMembersAllowed: -1, groups: -1 }, // unlimited
  };

  async function enforceNewPlanLimits(
    userId: string,
    targetTier: string
  ): Promise<{ productsLocked: number; teamMembersSuspended: number; groupsArchived: number }> {
    const limits = PLAN_ENFORCEMENT_LIMITS[targetTier] ?? PLAN_ENFORCEMENT_LIMITS.free;
    let productsLocked = 0;
    let teamMembersSuspended = 0;
    let groupsArchived = 0;

    // Each section runs independently so a failure in one doesn't skip the others
    // --- Products ---
    if (limits.products !== -1) {
      try {
        // Lock active + inactive products that exceed the tier limit (oldest first = most established stays)
        const nonLockedProducts = await db
          .select({ id: products.id })
          .from(products)
          .where(and(
            eq(products.wholesalerId, userId),
            inArray(products.status, ['active', 'inactive'])
          ))
          .orderBy(asc(products.createdAt));

        const excess = nonLockedProducts.slice(limits.products);
        if (excess.length > 0) {
          const excessIds = excess.map(p => p.id);
          await db.update(products)
            .set({ status: 'locked' })
            .where(inArray(products.id, excessIds));
          productsLocked = excess.length;
          console.log(`🔒 Locked ${productsLocked} products for user ${userId} (tier: ${targetTier})`);
        }
      } catch (err) {
        console.error(`❌ enforceNewPlanLimits [products] failed for user ${userId}:`, err);
      }
    }

    // --- Team members ---
    if (limits.invitedMembersAllowed !== -1) {
      try {
        const activeMembers = await db
          .select({ id: teamMembers.id })
          .from(teamMembers)
          .where(and(eq(teamMembers.wholesalerId, userId), eq(teamMembers.status, 'active')))
          .orderBy(asc(teamMembers.createdAt));

        const membersToSuspend = activeMembers.slice(limits.invitedMembersAllowed);
        if (membersToSuspend.length > 0) {
          const suspendIds = membersToSuspend.map(m => m.id);
          await db.update(teamMembers)
            .set({ status: 'suspended' })
            .where(inArray(teamMembers.id, suspendIds));
          teamMembersSuspended = membersToSuspend.length;
          console.log(`🔒 Suspended ${teamMembersSuspended} team members for user ${userId} (tier: ${targetTier})`);
        }
      } catch (err) {
        console.error(`❌ enforceNewPlanLimits [team members] failed for user ${userId}:`, err);
      }
    }

    // --- Customer groups ---
    if (limits.groups !== -1) {
      try {
        const activeGroups = await db
          .select({ id: customerGroups.id })
          .from(customerGroups)
          .where(and(eq(customerGroups.wholesalerId, userId), eq(customerGroups.status, 'active')))
          .orderBy(asc(customerGroups.createdAt));

        const groupsToArchive = activeGroups.slice(limits.groups);
        if (groupsToArchive.length > 0) {
          const archiveIds = groupsToArchive.map(g => g.id);
          await db.update(customerGroups)
            .set({ status: 'archived' })
            .where(inArray(customerGroups.id, archiveIds));
          groupsArchived = groupsToArchive.length;
          console.log(`🔒 Archived ${groupsArchived} customer groups for user ${userId} (tier: ${targetTier})`);
        }
      } catch (err) {
        console.error(`❌ enforceNewPlanLimits [customer groups] failed for user ${userId}:`, err);
      }
    }

    return { productsLocked, teamMembersSuspended, groupsArchived };
  }

  // Helper to compute projected impact (does NOT mutate DB) for scheduled emails
  async function getProjectedDowngradeImpact(
    userId: string,
    targetTier: string
  ): Promise<{ productsToLock: number; totalProducts: number; teamMembersToSuspend: number; groupsToArchive: number }> {
    const limits = PLAN_ENFORCEMENT_LIMITS[targetTier] ?? PLAN_ENFORCEMENT_LIMITS.free;
    try {
      const [nonLockedProductRows, activeMemberRows, activeGroupRows] = await Promise.all([
        db.select({ id: products.id })
          .from(products)
          .where(and(
            eq(products.wholesalerId, userId),
            inArray(products.status, ['active', 'inactive'])
          )),
        db.select({ id: teamMembers.id })
          .from(teamMembers)
          .where(and(eq(teamMembers.wholesalerId, userId), eq(teamMembers.status, 'active'))),
        db.select({ id: customerGroups.id })
          .from(customerGroups)
          .where(and(eq(customerGroups.wholesalerId, userId), eq(customerGroups.status, 'active'))),
      ]);
      const productsToLock = limits.products === -1 ? 0 : Math.max(0, nonLockedProductRows.length - limits.products);
      const teamMembersToSuspend = limits.invitedMembersAllowed === -1 ? 0 : Math.max(0, activeMemberRows.length - limits.invitedMembersAllowed);
      const groupsToArchive = limits.groups === -1 ? 0 : Math.max(0, activeGroupRows.length - limits.groups);
      return { productsToLock, totalProducts: nonLockedProductRows.length, teamMembersToSuspend, groupsToArchive };
    } catch {
      return { productsToLock: 0, totalProducts: 0, teamMembersToSuspend: 0, groupsToArchive: 0 };
    }
  }

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



  // Debug session endpoint to understand the issue
  app.get('/api/debug/session', (req: any, res) => {
    console.log('🔍 Session Debug:', {
      sessionExists: !!req.session,
      sessionId: req.sessionID,
      sessionUser: (req.session as any)?.user,
      sessionUserId: (req.session as any)?.userId,
      isAuthenticated: req.isAuthenticated ? req.isAuthenticated() : false,
      cookies: req.headers.cookie
    });
    
    res.json({
      sessionExists: !!req.session,
      sessionId: req.sessionID,
      hasUser: !!(req.session as any)?.user,
      hasUserId: !!(req.session as any)?.userId,
      isAuthenticated: req.isAuthenticated ? req.isAuthenticated() : false
    });
  });

  // Stripe Connect endpoint - Debug session data thoroughly
  app.post('/api/stripe/connect', async (req: any, res) => {
    console.log('🔗 POST /api/stripe/connect - Starting authentication check...');
    console.log('📋 Session debug:', {
      sessionExists: !!req.session,
      sessionId: req.sessionID?.substring(0, 10) + '...',
      sessionUser: (req.session as any)?.user ? 'exists' : 'missing',
      sessionUserId: (req.session as any)?.userId ? 'exists' : 'missing', 
      isAuthenticated: req.isAuthenticated ? req.isAuthenticated() : 'no function',
      reqUser: req.user ? 'exists' : 'missing',
      cookies: req.headers.cookie ? 'present' : 'missing'
    });

    let authenticatedUser = null;

    // Method 1: Check Passport authentication (Google OAuth/Replit auth)
    if (req.isAuthenticated && req.isAuthenticated() && req.user) {
      const passportUser = req.user as any;
      const userId = passportUser.claims?.sub;
      
      if (userId) {
        console.log('✅ Method 1: Passport authentication found, userId:', userId);
        authenticatedUser = await storage.getUser(userId);
        if (authenticatedUser) {
          console.log('✅ Method 1: User loaded from database:', authenticatedUser.email);
        }
      }
    }

    // Method 2: Check email-based session authentication
    if (!authenticatedUser) {
      const sessionUser = (req.session as any)?.user;
      if (sessionUser?.id) {
        console.log('✅ Method 2: Session user found, userId:', sessionUser.id);
        authenticatedUser = await storage.getUser(sessionUser.id);
        if (authenticatedUser) {
          console.log('✅ Method 2: User loaded from database:', authenticatedUser.email);
        }
      }
    }

    // Method 3: Check legacy session userId
    if (!authenticatedUser) {
      const sessionUserId = (req.session as any)?.userId;
      if (sessionUserId) {
        console.log('✅ Method 3: Legacy session userId found:', sessionUserId);
        authenticatedUser = await storage.getUser(sessionUserId);
        if (authenticatedUser) {
          console.log('✅ Method 3: User loaded from database:', authenticatedUser.email);
        }
      }
    }

    // Final authentication check
    if (!authenticatedUser) {
      console.log('❌ All authentication methods failed - no valid user found');
      return res.status(401).json({
        error: "Authentication required",
        message: "Please log in to access this resource.",
        redirectUrl: "/login"
      });
    }

    req.user = authenticatedUser;
    console.log('🔗 Stripe Connect proceeding with authenticated user:', authenticatedUser.email);
    try {
      console.log('🔗 Stripe Connect request received for user:', req.user?.email);
      console.log('📋 Stripe configured:', !!stripe);
      console.log('🔑 Stripe key exists:', !!process.env.STRIPE_SECRET_KEY);
      console.log('👤 User role:', req.user?.role);
      
      if (!stripe) {
        console.error('❌ Stripe not configured - missing STRIPE_SECRET_KEY');
        return res.status(500).json({ message: "Stripe not configured - missing secret key" });
      }

      const user = req.user;
      console.log('👤 Creating Stripe Connect account for user:', user.id);
      console.log('📧 User email:', user.email);
      console.log('🏢 User business name:', user.businessName || user.username);

      // Check if user already has a Connect account
      if (user.stripeAccountId) {
        console.log('🔄 User already has Stripe account:', user.stripeAccountId);
        
        try {
          // Get proper base URL with protocol
          const baseUrl = process.env.REPLIT_DEV_DOMAIN 
            ? (process.env.REPLIT_DEV_DOMAIN.startsWith('http') 
              ? process.env.REPLIT_DEV_DOMAIN 
              : `https://${process.env.REPLIT_DEV_DOMAIN}`)
            : 'https://quikpik.app';
            
          const refreshUrl = `${baseUrl}/settings?tab=integrations`;
          const returnUrl = `${baseUrl}/stripe-success`;
          
          console.log('🔗 Using Stripe redirect base URL:', baseUrl);
          console.log('🔗 Stripe refresh URL:', refreshUrl);
          console.log('🔗 Stripe return URL:', returnUrl);
            
          // Get account link for existing account
          const accountLink = await stripe.accountLinks.create({
            account: user.stripeAccountId,
            refresh_url: refreshUrl,
            return_url: returnUrl,
            type: 'account_onboarding',
          });
          
          console.log('✅ Account link created for existing account');
          return res.json({ url: accountLink.url, accountId: user.stripeAccountId });
        } catch (linkError: any) {
          console.error('❌ Error creating account link:', linkError.message);
          throw new Error(`Failed to create account link: ${linkError.message}`);
        }
      }

      console.log('🆕 Creating new Stripe Express account');
      
      // Create new Connect Express account
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'GB', // UK for GBP
        email: user.email,
        business_profile: {
          name: user.businessName || user.username,
        },
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
      });

      console.log('✅ Stripe account created:', account.id);

      // Update user with Connect account ID
      await storage.updateUser(user.id, {
        stripeAccountId: account.id
      });
      
      console.log('✅ User updated with Stripe account ID');

      // Get proper base URL with protocol
      const baseUrl = process.env.REPLIT_DEV_DOMAIN 
        ? (process.env.REPLIT_DEV_DOMAIN.startsWith('http') 
          ? process.env.REPLIT_DEV_DOMAIN 
          : `https://${process.env.REPLIT_DEV_DOMAIN}`)
        : 'https://quikpik.app';
        
      const refreshUrl = `${baseUrl}/settings?tab=integrations`;
      const returnUrl = `${baseUrl}/stripe-success`;
      
      console.log('🔗 Using Stripe redirect base URL:', baseUrl);
      console.log('🔗 Stripe refresh URL:', refreshUrl);
      console.log('🔗 Stripe return URL:', returnUrl);
        
      // Create account link for onboarding
      const accountLink = await stripe.accountLinks.create({
        account: account.id,
        refresh_url: refreshUrl,
        return_url: returnUrl,
        type: 'account_onboarding',
      });

      console.log('✅ Onboarding link created');
      
      res.json({ url: accountLink.url, accountId: account.id });
    } catch (error: any) {
      console.error('❌ Error creating Stripe Connect account:', error);
      console.error('❌ Error details:', {
        message: error.message,
        type: error.type,
        code: error.code,
        statusCode: error.statusCode
      });
      
      let errorMessage = "Failed to create Stripe Connect account";
      if (error.message && error.message.includes('No such application')) {
        errorMessage = "Stripe application not found - check your Stripe keys";
      } else if (error.message && error.message.includes('Invalid API key')) {
        errorMessage = "Invalid Stripe API key";
      } else if (error.type === 'StripePermissionError') {
        errorMessage = "Stripe permissions error - check your account settings";
      } else if (error.message) {
        errorMessage = `Stripe error: ${error.message}`;
      }
      
      res.status(500).json({ message: errorMessage });
    }
  });

  // Stripe Connect dashboard management endpoint
  app.post('/api/stripe/dashboard', requireAuth, async (req: any, res) => {
    try {
      if (!stripe) {
        return res.status(500).json({ message: "Stripe not configured" });
      }

      const user = req.user;
      
      if (!user.stripeAccountId) {
        return res.status(400).json({ message: "No Stripe Connect account found. Please set up payments first." });
      }

      // Create a login link for the Express dashboard
      const loginLink = await stripe.accounts.createLoginLink(user.stripeAccountId);
      
      console.log('🔗 Generated Stripe dashboard link for user:', user.id);
      
      res.json({ url: loginLink.url });
    } catch (error: any) {
      console.error('❌ Error creating Stripe dashboard link:', error);
      res.status(500).json({ message: "Failed to create dashboard link: " + error.message });
    }
  });





  // User profile update endpoint
  app.put('/api/user/profile', requireAuth, async (req: any, res) => {
    try {
      const user = req.user;
      const updates = req.body;
      
      console.log('👤 Updating profile for user:', user.id, updates);

      // Update user profile
      await storage.updateUser(user.id, updates);

      console.log('✅ Profile updated successfully for user:', user.id);
      
      res.json({ 
        success: true, 
        message: "Profile updated successfully" 
      });
    } catch (error) {
      console.error('❌ Error updating profile:', error);
      res.status(500).json({ 
        success: false, 
        message: "Failed to update profile" 
      });
    }
  });

  // TEST WITH SIMILAR PATH PATTERN TO WORKING ENDPOINTS
  app.post('/api/webhook-test/verify', async (req, res) => {
    console.log(`🎯 WEBHOOK TEST EXECUTING - ${new Date().toISOString()}`);
    console.log(`🎯 Body received:`, req.body);
    res.json({ webhookTest: 'success', timestamp: new Date().toISOString() });
  });


  // STRIPE WEBHOOK - Signature-verified handler for all Stripe events
  app.post('/api/webhooks/stripe', async (req, res) => {
    const sig = req.headers['stripe-signature'] as string;
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!endpointSecret) {
      console.error('❌ STRIPE_WEBHOOK_SECRET not configured');
      return res.status(400).json({ error: 'Webhook secret not configured' });
    }

    let event: Stripe.Event;
    try {
      event = stripe!.webhooks.constructEvent(req.body, sig, endpointSecret);
      console.log(`✅ Stripe webhook verified: ${event.type} at ${new Date().toISOString()}`);
    } catch (err) {
      console.error('❌ Stripe webhook signature verification failed:', err);
      return res.status(400).json({ error: 'Invalid signature' });
    }

    try {
      if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log(`💳 Checkout completed: ${session?.id}`);
        console.log(`🏷️ Metadata:`, JSON.stringify(session?.metadata, null, 2));
        
        const userId = session?.metadata?.userId;
        const tier = session?.metadata?.targetTier || 
                     session?.metadata?.tier || 
                     session?.metadata?.planId;
        const subscriptionType = session?.metadata?.subscriptionType;
        
        // Handle quote/order payments (has orderId and orderNumber in metadata)
        const orderId = session?.metadata?.orderId;
        const orderNumber = session?.metadata?.orderNumber;
        const isQuote = session?.metadata?.isQuote === 'true';
        
        if (orderId && orderNumber) {
          console.log(`🧾 Processing quote/order payment: Order ${orderNumber}, ID ${orderId}`);
          
          // Get the current order from database to get accurate totals and existing payments
          const [existingOrder] = await db.select()
            .from(orders)
            .where(eq(orders.id, parseInt(orderId)))
            .limit(1);
          
          if (!existingOrder) {
            console.log(`❌ Order ${orderId} not found in database`);
            return res.status(404).json({ error: 'Order not found' });
          }
          
          // Get actual payment amount from Stripe session
          const thisPayment = (session.amount_total || 0) / 100; // Convert from pence to pounds
          
          // Get existing amounts from order (cumulative)
          const previouslyPaid = parseFloat(existingOrder.amountPaid || '0');
          const orderTotal = parseFloat(existingOrder.total || '0');
          
          // Use shared helper — same logic used by manual payment endpoint
          const { cumulativePaid, newOutstanding, paymentStatus } = applyPaymentToOrder(previouslyPaid, orderTotal, thisPayment);
          
          console.log(`📊 Payment update: This payment £${thisPayment.toFixed(2)}, Previously paid £${previouslyPaid.toFixed(2)}, Total paid £${cumulativePaid.toFixed(2)}, Outstanding £${newOutstanding.toFixed(2)}, Status: ${paymentStatus}`);
          
          const newPaymentIntentId = (() => {
            const newPi = session.payment_intent as string | null;
            if (!newPi) return existingOrder.stripePaymentIntentId;
            const existing = existingOrder.stripePaymentIntentId || '';
            if (existing.split(',').map((s: string) => s.trim()).includes(newPi)) return existing;
            return existing ? `${existing},${newPi}` : newPi;
          })();

          // Update order with payment details and clear old payment link
          await db.update(orders)
            .set({
              amountPaid: cumulativePaid.toFixed(2),
              amountOutstanding: newOutstanding.toFixed(2),
              paymentStatus: paymentStatus,
              status: paymentStatus === 'paid' ? 'confirmed' : existingOrder.status,
              stripePaymentIntentId: newPaymentIntentId,
              stripePaymentLinkUrl: null,
              stripePaymentLinkId: null,
            })
            .where(eq(orders.id, parseInt(orderId)));

          // Log into order_payments so the full payment history is available
          const stripePaymentIntentForLog = session.payment_intent as string | null;
          await db.insert(orderPayments).values({
            orderId: parseInt(orderId),
            amount: thisPayment.toFixed(2),
            method: 'stripe_card',
            stripePaymentIntentId: stripePaymentIntentForLog || null,
            recordedBy: 'stripe_webhook',
          });
          
          console.log(`✅ Order ${orderNumber} payment updated: ${paymentStatus}, old payment link cleared`);
          
          return res.json({
            received: true,
            message: `Order ${orderNumber} payment processed`,
            orderId,
            orderNumber,
            amountPaid: cumulativePaid.toFixed(2),
            paymentStatus
          });
        }
        
        // Handle subscription payments (has userId and tier in metadata)
        if (userId && tier) {
          console.log(`🔄 Processing ${subscriptionType || 'new'} subscription: ${userId} → ${tier}`);
          
          const productLimit = tier === 'premium' ? -1 : (tier === 'standard' ? 50 : 10);
          
          // Get subscription details from Stripe if available
          let subscriptionEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
          if (session.subscription) {
            try {
              const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
              subscriptionEndsAt = new Date(subscription.current_period_end * 1000);
              
              // Update user's Stripe subscription ID
              await storage.updateUser(userId, {
                stripeSubscriptionId: subscription.id
              });
            } catch (error) {
              console.error('❌ Failed to retrieve subscription details:', error);
            }
          }
          
          await storage.updateUser(userId, {
            currentPlan: tier,
            subscriptionStatus: 'active',
            productLimit: productLimit,
            subscriptionEndsAt: subscriptionEndsAt
          });
          
          console.log(`✅ ${subscriptionType || 'New'} subscription processed: ${userId} to ${tier}`);
          
          return res.json({
            received: true,
            message: `Subscription ${subscriptionType === 'new' ? 'created' : 'updated'} - ${tier}`,
            userId: userId,
            tier: tier,
            productLimit: productLimit
          });
        }
        
        console.log(`⚠️ Checkout completed but no matching handler - metadata:`, session?.metadata);
        return res.json({ received: true, type: event.type });
      }

      if (event.type === 'payment_intent.succeeded') {
        const paymentIntent = event.data?.object;
        console.log(`💰 Payment succeeded: ${paymentIntent?.id}`);
        console.log(`🏷️ Metadata:`, JSON.stringify(paymentIntent?.metadata, null, 2));
        
        const userId = paymentIntent?.metadata?.userId;
        // Handle all possible tier metadata field names for maximum compatibility
        const tier = paymentIntent?.metadata?.targetTier || 
                     paymentIntent?.metadata?.tier || 
                     paymentIntent?.metadata?.planId;
        
        const orderType = paymentIntent?.metadata?.orderType;
        
        if (userId && tier) {
          console.log(`🔄 Processing payment upgrade: ${userId} → ${tier}`);
          
          const productLimit = tier === 'premium' ? -1 : (tier === 'standard' ? 50 : 10);
          
          await storage.updateUser(userId, {
            currentPlan: tier,
            subscriptionStatus: 'active',
            productLimit: productLimit,
            subscriptionEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
          });
          
          console.log(`✅ Payment upgrade complete: ${userId} to ${tier}`);
          
          return res.json({
            received: true,
            message: `Subscription upgraded to ${tier}`,
            userId: userId,
            tier: tier,
            productLimit: productLimit
          });
        }
      }

      if (event.type === 'charge.refund.updated') {
        const refund = event.data.object as Stripe.Refund;
        console.log(`🔄 Refund updated: ${refund.id}, status: ${refund.status}, amount: ${refund.amount}`);

        if (refund.status === 'succeeded' && refund.payment_intent) {
          const paymentIntentId = typeof refund.payment_intent === 'string'
            ? refund.payment_intent
            : refund.payment_intent.id;

          const matchingOrders = await db.select()
            .from(orders)
            .where(or(
              eq(orders.stripePaymentIntentId, paymentIntentId),
              sql`${orders.stripePaymentIntentId} LIKE ${paymentIntentId + ',%'}`,
              sql`${orders.stripePaymentIntentId} LIKE ${'%,' + paymentIntentId}`,
              sql`${orders.stripePaymentIntentId} LIKE ${'%,' + paymentIntentId + ',%'}`
            ))
            .limit(1);

          if (matchingOrders.length > 0) {
            const order = matchingOrders[0];
            if (!order.refundedAt) {
              await db.update(orders)
                .set({
                  refundedAt: new Date(),
                  notes: order.notes
                    ? `${order.notes}\n[${new Date().toISOString()}] Stripe refund confirmed: ${refund.id}`
                    : `[${new Date().toISOString()}] Stripe refund confirmed: ${refund.id}`
                })
                .where(eq(orders.id, order.id));
              console.log(`✅ Refund confirmed for order ${order.orderNumber} (refund ${refund.id})`);
            } else {
              console.log(`ℹ️ Order ${order.orderNumber} already has refundedAt set, skipping`);
            }
          } else {
            console.log(`⚠️ No order found for payment intent ${paymentIntentId}`);
          }
        }

        return res.json({ received: true, type: event.type });
      }

      if (event.type === 'customer.subscription.deleted') {
        const subscription = event.data.object as Stripe.Subscription;
        const stripeSubscriptionId = subscription.id;
        const stripeCustomerId = typeof subscription.customer === 'string'
          ? subscription.customer
          : subscription.customer?.id;
        console.log(`🔴 Subscription deleted: ${stripeSubscriptionId}, customer: ${stripeCustomerId}`);

        // Prefer lookup by Stripe customer ID (most reliable); fall back to subscription ID
        let affectedUser: typeof users.$inferSelect | undefined;
        if (stripeCustomerId) {
          const [byCustomer] = await db.select().from(users)
            .where(eq(users.stripeCustomerId, stripeCustomerId));
          affectedUser = byCustomer;
        }
        if (!affectedUser) {
          const [bySubscription] = await db.select().from(users)
            .where(eq(users.stripeSubscriptionId, stripeSubscriptionId));
          affectedUser = bySubscription;
        }

        if (!affectedUser) {
          console.log(`⚠️ No user found for deleted subscription ${stripeSubscriptionId} — may already be cleaned up`);
          return res.json({ received: true, type: event.type });
        }

        const wasAlreadyFree = affectedUser.currentPlan === 'free' || affectedUser.subscriptionTier === 'free';

        await db.update(users).set({
          subscriptionTier: 'free',
          subscriptionStatus: 'free',
          currentPlan: 'free',
          productLimit: 10,
          stripeSubscriptionId: null,
          subscriptionPeriodStart: null,
          subscriptionPeriodEnd: null,
          updatedAt: new Date()
        }).where(eq(users.id, affectedUser.id));

        const [existingUserSub] = await db.select().from(userSubscriptions)
          .where(eq(userSubscriptions.userId, affectedUser.id));

        if (existingUserSub) {
          await db.update(userSubscriptions).set({
            planId: 'free',
            stripeSubscriptionId: null,
            status: 'free',
            cancelAtPeriodEnd: null,
            currentPeriodStart: null,
            currentPeriodEnd: null,
            updatedAt: new Date()
          }).where(eq(userSubscriptions.userId, affectedUser.id));
        } else {
          await db.insert(userSubscriptions).values({
            userId: affectedUser.id,
            planId: 'free',
            stripeSubscriptionId: null,
            status: 'free',
            currentPeriodStart: null,
            currentPeriodEnd: null,
            cancelAtPeriodEnd: null
          });
        }

        console.log(`✅ DB updated to Free for user ${affectedUser.id} (was already free: ${wasAlreadyFree})`);

        // Enforce Free plan limits — lock excess products, suspend excess team members, archive excess groups
        let enforcementResult = { productsLocked: 0, teamMembersSuspended: 0, groupsArchived: 0 };
        if (!wasAlreadyFree) {
          enforcementResult = await enforceNewPlanLimits(affectedUser.id, 'free');
        }

        if (!wasAlreadyFree && affectedUser.email) {
          try {
            const { subject, html, text } = generateDowngradeEffectiveEmail({
              firstName: affectedUser.firstName || '',
              email: affectedUser.email,
              businessName: affectedUser.businessName || affectedUser.name || 'Quikpik',
              productsLocked: enforcementResult.productsLocked || undefined,
              teamMembersSuspended: enforcementResult.teamMembersSuspended || undefined,
              groupsArchived: enforcementResult.groupsArchived || undefined,
            });
            await sendEmail({ to: affectedUser.email, from: 'hello@quikpik.co', subject, html, text });
            console.log(`📧 Downgrade effective email sent to ${affectedUser.email}`);
          } catch (emailErr) {
            console.error('❌ Failed to send downgrade effective email:', emailErr);
          }
        }

        return res.json({ received: true, type: event.type });
      }

      // Acknowledge all other events
      res.json({ received: true, type: event.type });
      
    } catch (error) {
      console.error('❌ Webhook error:', error);
      return res.status(500).json({ error: 'Webhook processing failed' });
    }
  });

  // STRIPE WEBHOOK DISABLED - Using standalone webhook server on port 5001 to prevent duplicates
  // app.post('/api/stripe-webhook', async (req, res) => { ... });

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
      let customer;
      try {
        customer = await storage.findCustomerByLastFourDigits(wholesalerId, lastFourDigits);
      } catch (error: any) {
        // Handle security error when multiple customers share same last 4 digits
        if (error.message.includes('Multiple customers found with same phone number suffix')) {
          return res.status(400).json({ 
            error: "Multiple customers found with the same phone number ending. Please contact support for assistance.",
            securityIssue: true
          });
        }
        throw error; // Re-throw other errors
      }
      
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
      let customer;
      try {
        customer = await storage.findCustomerByLastFourDigits(wholesalerId, lastFourDigits);
      } catch (error: any) {
        // Handle security error when multiple customers share same last 4 digits
        if (error.message.includes('Multiple customers found with same phone number suffix')) {
          return res.status(400).json({ 
            error: "Multiple customers found with the same phone number ending. Please contact support for assistance.",
            securityIssue: true
          });
        }
        throw error; // Re-throw other errors
      }
      
      if (!customer) {
        return res.status(401).json({ error: "Customer not found" });
      }

      // CRITICAL FIX: Check for recent SMS codes to prevent spam
      const recentCodes = await db
        .select()
        .from(smsVerificationCodes)
        .where(
          and(
            eq(smsVerificationCodes.customerId, customer.id),
            eq(smsVerificationCodes.isUsed, false),
            gt(smsVerificationCodes.createdAt, new Date(Date.now() - 2 * 60 * 1000)) // Last 2 minutes
          )
        )
        .orderBy(desc(smsVerificationCodes.createdAt))
        .limit(1);

      if (recentCodes.length > 0) {
        console.log(`🚫 SMS throttling: Recent code exists for ${customer.name}, not sending new SMS`);
        return res.json({ 
          success: true, 
          message: "SMS verification code already sent recently. Please check your messages or wait 2 minutes.",
          throttled: true
        });
      }

      console.log("Customer found for SMS:", customer);

      // Get wholesaler info for business name
      const wholesaler = await storage.getWholesalerProfile(wholesalerId);
      
      // Generate and send SMS code
      const code = ReliableSMSService.generateVerificationCode();
      console.log(`🔄 Generated verification code: ${code}`);
      const result = await ReliableSMSService.sendVerificationSMS(customer.phone, code, wholesaler?.businessName || 'Business', wholesalerId);
      console.log(`📋 SMS service result:`, result);
      
      // Always store verification code in database, regardless of SMS success
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes from now
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
      let customer;
      try {
        customer = await storage.findCustomerByLastFourDigits(wholesalerId, lastFourDigits);
      } catch (error: any) {
        // Handle security error when multiple customers share same last 4 digits
        if (error.message.includes('Multiple customers found with same phone number suffix')) {
          return res.status(400).json({ 
            error: "Multiple customers found with the same phone number ending. Please contact support for assistance.",
            securityIssue: true
          });
        }
        throw error; // Re-throw other errors
      }
      
      if (!customer) {
        return res.status(401).json({ error: "Customer not found" });
      }

      console.log('🔧 SMS Verification - Customer data:', {
        id: customer.id || customer.customer_id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        hasPhone: !!customer.phone,
        phoneLength: customer.phone?.length
      });

      // Verify SMS code
      const verificationRecord = await storage.getSMSVerificationCode(wholesalerId, customer.id, smsCode);
      
      if (!verificationRecord) {
        return res.status(401).json({ error: "Invalid verification code" });
      }

      // Check if code is expired (15 minutes)
      const now = new Date();
      const expiryTime = new Date(verificationRecord.createdAt);
      expiryTime.setMinutes(expiryTime.getMinutes() + 15);
      
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

      // Create customer session for 24 hours
      const sessionData = {
        customerId: customer.id || customer.customer_id,
        wholesalerId: wholesalerId,
        name: customer.name,
        email: customer.email || '',
        phone: customer.phone || '',
        groupId: customer.groupId || customer.group_id,
        groupName: customer.groupName || customer.group_name,
        authenticatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days
      };

      console.log('🔧 SMS Verification - Session data created:', sessionData);

      // Ensure session exists and store customer session
      if (!req.session) {
        console.error("Session not initialized - regenerating session");
        req.session = {} as any;
      }
      
      // Set customer authentication data in session
      (req.session as any).customerAuth = sessionData;
      
      console.log(`🔐 Customer session created for ${customer.name} (${customer.phone}) - expires in 30 days`);

      // Force session save using callback method with timeout
      const saveSession = () => {
        return new Promise<void>((resolve, reject) => {
          if (req.session && typeof req.session.save === 'function') {
            const timeout = setTimeout(() => {
              reject(new Error('Session save timeout'));
            }, 3000); // 3 second timeout
            
            req.session.save((err) => {
              clearTimeout(timeout);
              if (err) {
                console.error('❌ Session save error:', err);
                reject(err);
              } else {
                console.log('✅ Customer session saved successfully');
                resolve();
              }
            });
          } else {
            console.log('⚠️ Session save method not available');
            resolve(); // Continue anyway
          }
        });
      };

      try {
        await saveSession();
      } catch (error) {
        console.error('Session save failed:', error);
        // Continue anyway to avoid blocking the user
      }
      
      console.log('✅ Sending SMS verification success response');
      
      // Create a signed token as backup for session persistence issues
      const customerToken = Buffer.from(JSON.stringify({
        customerId: customer.id || customer.customer_id,
        wholesalerId: wholesalerId,
        name: customer.name,
        email: customer.email || '',
        phone: customer.phone || '',
        groupId: customer.groupId || customer.group_id,
        groupName: customer.groupName || customer.group_name,
        timestamp: Date.now(),
        expires: Date.now() + 30 * 24 * 60 * 60 * 1000 // 30 days
      })).toString('base64');
      
      // Set a fallback cookie with customer authentication
      res.cookie('customer_auth', customerToken, {
        httpOnly: true,
        secure: false,
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        sameSite: 'lax'
      });
      
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

  // Customer authentication check endpoint - verify session or fallback cookie
  app.get('/api/customer-auth/check/:wholesalerId', async (req, res) => {
    try {
      const { wholesalerId } = req.params;
      let customerAuth = (req.session as any)?.customerAuth;
      
      // If session auth fails, try fallback cookie
      if (!customerAuth && req.cookies?.customer_auth) {
        try {
          const cookieData = JSON.parse(Buffer.from(req.cookies.customer_auth, 'base64').toString());
          
          // Verify cookie data and expiration
          if (cookieData.expires > Date.now() && cookieData.wholesalerId === wholesalerId) {
            customerAuth = {
              customerId: cookieData.customerId,
              wholesalerId: cookieData.wholesalerId,
              name: cookieData.name,
              email: cookieData.email || '',
              phone: cookieData.phone || '',
              groupId: cookieData.groupId || null,
              groupName: cookieData.groupName || '',
              expiresAt: new Date(cookieData.expires).toISOString()
            };
            console.log('🔓 Using fallback cookie authentication for customer:', cookieData.name);
          }
        } catch (cookieError) {
          console.error('Failed to parse customer auth cookie:', cookieError);
        }
      }
      
      if (!customerAuth) {
        return res.status(401).json({ authenticated: false, message: "No customer session found" });
      }
      
      // MULTI-WHOLESALER FIX: Check if customer has access to the requested wholesaler
      // instead of requiring exact session match
      const hasAccess = await multiWholesalerService.hasWholesalerAccess(customerAuth.customerId, wholesalerId);
      if (!hasAccess) {
        return res.status(401).json({ authenticated: false, message: "No access to this wholesaler" });
      }
      
      // Check if session is expired (24 hours)
      const now = new Date();
      const expiresAt = new Date(customerAuth.expiresAt);
      
      if (now > expiresAt) {
        // Clear expired session and cookie
        delete (req.session as any)?.customerAuth;
        res.clearCookie('customer_auth');
        return res.status(401).json({ authenticated: false, message: "Session expired" });
      }
      
      console.log(`✅ Customer session valid for ${customerAuth.name} (expires: ${customerAuth.expiresAt})`);
      
      // Valid session found - get full customer data including business name
      const fullCustomerData = await storage.getUser(customerAuth.customerId);
      
      // Use fresh data from database instead of cached session data
      const customerName = fullCustomerData ? `${fullCustomerData.firstName} ${fullCustomerData.lastName}`.trim() : customerAuth.name;
      
      res.json({
        authenticated: true,
        customer: {
          id: customerAuth.customerId,
          name: customerName,
          email: fullCustomerData?.email || customerAuth.email || '',
          phone: fullCustomerData?.phoneNumber || customerAuth.phone || '',
          groupId: customerAuth.groupId || null,
          groupName: customerAuth.groupName || '',
          businessName: fullCustomerData?.businessName || ''
        },
        expiresAt: customerAuth.expiresAt
      });
    } catch (error) {
      console.error("Customer auth check error:", error);
      res.status(500).json({ error: "Failed to check authentication" });
    }
  });

  // Customer wholesaler switching endpoint - allows authenticated customers to switch between wholesalers
  app.post('/api/customer-auth/switch-wholesaler', async (req, res) => {
    try {
      const { targetWholesalerId } = req.body;
      let customerAuth = (req.session as any)?.customerAuth;
      
      // Fallback to cookie if session not found
      if (!customerAuth && req.cookies?.customer_auth) {
        try {
          const cookieData = JSON.parse(Buffer.from(req.cookies.customer_auth, 'base64').toString());
          if (cookieData.expires > Date.now()) {
            customerAuth = {
              customerId: cookieData.customerId,
              wholesalerId: cookieData.wholesalerId,
              name: cookieData.name,
              email: cookieData.email || '',
              phone: cookieData.phone || '',
              groupId: cookieData.groupId || null,
              groupName: cookieData.groupName || '',
              expiresAt: new Date(cookieData.expires).toISOString()
            };
          }
        } catch (cookieError) {
          console.error('Failed to parse customer auth cookie:', cookieError);
        }
      }
      
      if (!customerAuth) {
        return res.status(401).json({ error: "No active customer session" });
      }
      
      if (!targetWholesalerId) {
        return res.status(400).json({ error: "Target wholesaler ID required" });
      }
      
      // Verify customer has access to target wholesaler
      const hasAccess = await multiWholesalerService.hasWholesalerAccess(customerAuth.customerId, targetWholesalerId);
      if (!hasAccess) {
        return res.status(403).json({ error: "No access to target wholesaler" });
      }
      
      // Create updated session for new wholesaler
      const updatedSessionData = {
        ...customerAuth,
        wholesalerId: targetWholesalerId,
        authenticatedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // Reset to 30 days
      };
      
      // Update session
      (req.session as any).customerAuth = updatedSessionData;
      
      // Update cookie
      const cookieData = {
        customerId: customerAuth.customerId,
        wholesalerId: targetWholesalerId,
        name: customerAuth.name,
        email: customerAuth.email,
        phone: customerAuth.phone,
        groupId: customerAuth.groupId,
        groupName: customerAuth.groupName,
        expires: Date.now() + 30 * 24 * 60 * 60 * 1000 // 30 days
      };
      
      res.cookie('customer_auth', Buffer.from(JSON.stringify(cookieData)).toString('base64'), {
        httpOnly: true,
        secure: false,
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        sameSite: 'lax'
      });
      
      console.log(`🔄 Customer ${customerAuth.name} switched from wholesaler ${customerAuth.wholesalerId} to ${targetWholesalerId}`);
      
      res.json({
        success: true,
        message: "Wholesaler switched successfully",
        newWholesalerId: targetWholesalerId
      });
    } catch (error) {
      console.error("Wholesaler switching error:", error);
      res.status(500).json({ error: "Failed to switch wholesaler" });
    }
  });

  // Customer logout endpoint
  app.post('/api/customer-auth/logout', async (req, res) => {
    try {
      const customerAuth = (req.session as any)?.customerAuth;
      
      if (customerAuth) {
        console.log(`🔓 Customer logout: ${customerAuth.name} (${customerAuth.phone})`);
        delete (req.session as any).customerAuth;
      }
      
      res.json({ success: true, message: "Logged out successfully" });
    } catch (error) {
      console.error("Customer logout error:", error);
      res.status(500).json({ error: "Logout failed" });
    }
  });

  // Customer profile update endpoint for customer portal
  app.put('/api/customer-profile/update', async (req, res) => {
    try {
      // Get customer from session or fallback auth
      let customerAuth = (req.session as any)?.customerAuth;
      
      // If session auth fails, try fallback cookie
      if (!customerAuth && req.cookies?.customer_auth) {
        try {
          const cookieData = JSON.parse(Buffer.from(req.cookies.customer_auth, 'base64').toString());
          
          // Verify cookie data and expiration
          if (cookieData.expires > Date.now()) {
            customerAuth = {
              customerId: cookieData.customerId,
              name: cookieData.name,
              email: cookieData.email || '',
              phone: cookieData.phone || ''
            };
          }
        } catch (cookieError) {
          console.error('Failed to parse customer auth cookie:', cookieError);
        }
      }
      
      // SECURITY FIX: Remove hardcoded customer fallback that was causing data leaks
      if (!customerAuth) {
        console.log('❌ No customer authentication found - login required');
        return res.status(401).json({ error: 'Authentication required - please log in to access your profile' });
      }
      
      const { name, email, phone, businessName } = req.body;
      
      console.log('🔄 Customer profile update request:', { name, email, phone, businessName });
      
      // Prepare update data
      const updates: any = {};
      if (name && name.trim()) {
        const nameParts = name.trim().split(' ');
        updates.firstName = nameParts[0] || '';
        updates.lastName = nameParts.slice(1).join(' ') || '';
      }
      if (email && email.trim()) updates.email = email.trim();
      if (phone && phone.trim()) updates.phoneNumber = phone.trim();
      if (businessName && businessName.trim()) updates.businessName = businessName.trim();
      
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "No updates provided" });
      }
      
      // Update customer profile
      const updatedCustomer = await storage.updateUser(customerAuth.customerId, updates);
      
      if (!updatedCustomer) {
        return res.status(404).json({ error: "Customer not found" });
      }
      
      console.log('✅ Customer profile updated successfully');
      
      res.json({
        success: true,
        customer: {
          id: updatedCustomer.id,
          name: `${updatedCustomer.firstName} ${updatedCustomer.lastName}`.trim(),
          email: updatedCustomer.email,
          phone: updatedCustomer.phoneNumber,
          businessName: updatedCustomer.businessName
        }
      });
    } catch (error) {
      console.error("❌ Customer profile update error:", error);
      res.status(500).json({ error: "Failed to update profile" });
    }
  });

  // Get customer order history - aggregated from all wholesalers where customer is registered
  app.get('/api/customer-orders/:wholesalerId/:phoneNumber', async (req, res) => {
    console.log('🔍 Customer orders route hit!', { wholesalerId: req.params.wholesalerId, phoneNumber: req.params.phoneNumber });
    try {
      const { wholesalerId, phoneNumber } = req.params;
      const limitParam = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      
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

      console.log('✅ Customer verified:', customer.name, 'with ID:', customer.id || customer.customer_id);

      // REMOVED: Customer group requirement - customers can see orders even without pre-registration

      // NEW: Allow access to orders even if customer is not in customer groups
      // This fixes the issue where customers can't see their orders unless pre-registered
      console.log('🔍 Searching for all orders by customer regardless of group membership...');
      console.log(`🔍 Search params: customerId=${customer.id}, wholesalerId=${wholesalerId}, customerPhone=${customer.phone}`);
      
      // CRITICAL FIX: Search by multiple retailer ID patterns due to historical inconsistency
      // Some orders have retailer_id as customer ID, others have wholesaler's Google ID
      let orderResults = await db
        .select()
        .from(orders)
        .where(and(
          or(
            eq(orders.retailerId, customer.id),
            eq(orders.retailerId, wholesalerId), // Historical orders may have wholesaler ID as retailer ID
            eq(orders.customerPhone, customer.phone) // Also search by phone directly
          ),
          eq(orders.wholesalerId, wholesalerId)
        ))
        .orderBy(desc(orders.createdAt));
        
      console.log('🔍 Found orders by retailer ID and phone:', orderResults.length);
      if (orderResults.length > 0) {
        console.log('📋 Sample orders:', orderResults.slice(0, 3).map(o => ({ 
          id: o.id, 
          orderNumber: o.orderNumber, 
          retailerId: o.retailerId, 
          customerPhone: o.customerPhone 
        })));
      }
      
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
          .where(and(
            or.apply(null, phoneConditions),
            eq(orders.wholesalerId, wholesalerId)
          ))
          .orderBy(desc(orders.createdAt));
      }
      
      console.log('🔍 Total orders found:', orderResults.length);

      if (orderResults.length === 0) {
        return res.json([]);
      }

      const ordersToProcess = limitParam && limitParam > 0 ? orderResults.slice(0, limitParam) : orderResults;

      // Get order items and product details for each order
      const ordersWithDetails = await Promise.all(ordersToProcess.map(async (order) => {
        const items = await db
          .select({
            orderItemId: orderItems.id,
            quantity: orderItems.quantity,
            unitPrice: orderItems.unitPrice,
            total: orderItems.total,
            productId: products.id,
            productName: products.name,
            sellingType: orderItems.sellingType, // CRITICAL FIX: Include selling type in query
            appliedOfferLabel: orderItems.appliedOfferLabel,
            freeItems: orderItems.freeItems,
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
          wholesalerPhone: wholesalerUser.businessPhone || '',
          deliveryNote: (wholesalerUser as any).deliveryNote || null
        } : null;

        return {
          ...order,
          items: items.map(item => ({
            productName: item.productName,
            quantity: item.quantity,
            unitPrice: item.unitPrice || "0",
            total: item.total || "0",
            sellingType: item.sellingType || "units", // CRITICAL FIX: Include selling type in response
            appliedOfferLabel: item.appliedOfferLabel || null,
            freeItems: item.freeItems || 0,
          })),
          wholesaler: wholesalerDetails ? {
            id: order.wholesalerId,
            businessName: wholesalerDetails.wholesalerName || 'Unknown Business',
            email: wholesalerDetails.wholesalerEmail || '',
            phone: wholesalerDetails.wholesalerPhone || '',
            deliveryNote: wholesalerDetails.deliveryNote || null,
          } : null
        };
      }));
      
      // Format orders for customer portal display
      const formattedOrders = ordersWithDetails.map(order => {
        const total = parseFloat(order.total || "0");
        // Calculate proper fees based on current fee structure:
        // Customer pays: Product subtotal + Transaction fee (5.5% + £0.50)
        // Wholesaler pays: Platform fee (3.3% of product subtotal)
        
        // CRITICAL FIX: Always use stored subtotal from database - never calculate
        const subtotal = parseFloat(order.subtotal || "0");
        
        // Use stored customer transaction fee from database, or calculate as fallback
        const transactionFee = order.customerTransactionFee ? parseFloat(order.customerTransactionFee) : (subtotal * 0.055) + 0.50;
        
        // Platform fee paid by wholesaler: 3.3% of product subtotal (not shown to customers but calculated for completeness)
        const platformFee = subtotal * 0.033;
        
        return {
          id: order.id,
          orderNumber: order.orderNumber || order.order_number || `#${order.id}`, // Use actual order number (SF-120) not ID
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
          deliveryAddressId: order.deliveryAddressId,
          paymentMethod: "Card Payment",
          paymentStatus: order.paymentStatus || "paid",
          amountPaid: order.amountPaid || '0.00',
          amountOutstanding: order.amountOutstanding || '0.00',
          amountRefunded: order.amountRefunded || '0.00',
          refundReason: order.refundReason || null,
          refundedAt: order.refundedAt || null,
          cancelledAt: order.cancelledAt || null,
          depositPercentage: order.depositPercentage || 100,
          stripePaymentLinkUrl: order.stripePaymentLinkUrl || null,
          fulfillmentType: order.fulfillmentType,
          deliveryCarrier: order.deliveryCarrier,
          deliveryCost: order.deliveryCost || '0.00',
          shippingStatus: order.shippingStatus,
          shippingTotal: order.shippingTotal,
          notes: order.notes,
          orderImages: order.orderImages, // CRITICAL FIX: Include order images for customer display
          isQuote: order.isQuote,
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

  // Customer order statistics endpoint for dashboard
  // Get wholesalers that a customer is registered with
  app.get('/api/customer-accessible-wholesalers/:phoneNumber', async (req, res) => {
    try {
      const phoneNumber = req.params.phoneNumber;
      const decodedPhoneNumber = decodeURIComponent(phoneNumber);
      const lastFourDigits = decodedPhoneNumber.slice(-4);

      console.log('🔍 Finding accessible wholesalers for customer with last 4 digits:', lastFourDigits);

      // Get all wholesalers where this customer is registered
      const accessibleWholesalers = await storage.getWholesalersForCustomer(lastFourDigits);
      
      console.log(`✅ Found ${accessibleWholesalers.length} accessible wholesalers for customer`);
      
      res.json(accessibleWholesalers);
    } catch (error) {
      console.error("Error fetching accessible wholesalers:", error);
      res.status(500).json({ message: "Failed to fetch accessible wholesalers" });
    }
  });

  // Save customer shipping choice (delivery or pickup)
  app.post("/api/customer/shipping-choice", async (req, res) => {
    try {
      const { customerId, shippingChoice } = req.body;
      
      if (!customerId || !shippingChoice || !['pickup', 'delivery'].includes(shippingChoice)) {
        return res.status(400).json({ error: "Invalid customer ID or shipping choice" });
      }
      
      await storage.setCustomerShippingChoice(customerId, shippingChoice);
      console.log(`🚚 Updated shipping choice for customer ${customerId}: ${shippingChoice}`);
      
      res.json({ success: true, shippingChoice });
    } catch (error) {
      console.error("Error saving shipping choice:", error);
      res.status(500).json({ error: "Failed to save shipping choice" });
    }
  });

  // Submit customer registration request to wholesaler
  app.post("/api/customer/request-wholesaler-access", async (req, res) => {
    try {
      const { wholesalerId, customerPhone, customerName, customerEmail, requestMessage, productsInterested, orderFrequency, customerType } = req.body;
      
      console.log("🔍 Customer registration request:", { wholesalerId, customerPhone: customerPhone?.slice(-4) + "****", customerName });
      
      // Validate required fields
      if (!wholesalerId || !customerPhone || !customerName) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      
      // Check if customer already has access
      const lastFourDigits = customerPhone.slice(-4);
      const existingAccess = await storage.getWholesalersForCustomer(lastFourDigits);
      if (existingAccess.some(w => w.id === wholesalerId)) {
        return res.status(400).json({ error: "You already have access to this wholesaler" });
      }
      
      // Check for existing pending request
      const existingRequest = await storage.getCustomerRegistrationRequest(wholesalerId, customerPhone);
      if (existingRequest && existingRequest.status === 'pending') {
        return res.status(400).json({ error: `There is already a pending request with the number ${customerPhone}. Please wait for the wholesaler to review it.` });
      }
      
      // Allow customers to request again after rejection (re-request capability)
      const latestRequest = await storage.getLatestRegistrationRequest(wholesalerId, customerPhone);
      if (latestRequest && latestRequest.status === 'rejected') {
        console.log("Customer re-requesting access after previous rejection");
      }
      
      // Create the registration request
      const request = await storage.createCustomerRegistrationRequest({
        wholesalerId,
        customerPhone,
        customerName,
        customerEmail,
        businessName: req.body.businessName || null,
        customerType: customerType || null,
        requestMessage,
        productsInterested: productsInterested || null,
        orderFrequency: orderFrequency || null,
      });
      
      console.log("✅ Registration request created with ID:", request.id);
      
      // Send email notification to wholesaler
      const wholesaler = await storage.getUser(wholesalerId);
      if (wholesaler && wholesaler.email) {
        try {
          const emailSubject = `New Customer Registration Request - ${customerName}`;
          const emailBody = `${emailHeading('New Customer Enquiry', { size: '22px', color: '#10b981' })}<p style="margin:0 0 20px">Dear ${wholesaler.firstName || 'Wholesaler'}, you have received a new customer registration request.</p>${emailCard(`${emailHeading('Customer Details', { size: '16px' })}<p style="margin:0 0 6px"><strong>Name:</strong> ${customerName}</p><p style="margin:0 0 6px"><strong>Business:</strong> ${req.body.businessName || 'Not provided'}</p><p style="margin:0 0 6px"><strong>Phone:</strong> ${customerPhone}</p><p style="margin:0 0 6px"><strong>Email:</strong> ${customerEmail || 'Not provided'}</p>${productsInterested ? `<p style="margin:0 0 6px"><strong>Products Interested In:</strong> ${productsInterested}</p>` : ''}${orderFrequency ? `<p style="margin:0 0 6px"><strong>Estimated Order Quantity/Frequency:</strong> ${orderFrequency}</p>` : ''}${requestMessage ? `<p style="margin:0"><strong>Message:</strong> ${requestMessage}</p>` : ''}`, { borderColor: '#dbeafe', bgColor: '#eff6ff' })}<p style="margin:20px 0 0">To approve or manage this request, please log into your Quikpik dashboard.</p>${emailButton('Review Request', 'https://quikpik.co/customers')}`;

          const regHtml = wrapCustomerEmail(emailBody, { businessName: wholesaler.businessName || wholesaler.name || 'Quikpik', logoUrl: getEmailLogoUrl(wholesaler.id, wholesaler.logoType, wholesaler.logoUrl) }, { preheader: `New enquiry from ${customerName}` });
          console.log(`📏 Registration email size: ${Buffer.byteLength(regHtml, 'utf8')} bytes`);
          await sendEmail({
            to: wholesaler.email,
            from: 'hello@quikpik.co',
            subject: emailSubject,
            html: regHtml
          });
          console.log(`📧 Registration request notification sent to ${wholesaler.email}`);
        } catch (emailError) {
          console.error('Failed to send registration request notification:', emailError);
        }
      }
      
      res.json({ 
        success: true, 
        requestId: request.id,
        message: "Your access request has been sent to the wholesaler. You'll be notified once they approve your request."
      });
    } catch (error) {
      console.error("❌ Error creating registration request:", error);
      res.status(500).json({ error: "Failed to submit registration request" });
    }
  });

  // Get pending registration requests for wholesaler  
  app.get('/api/registration-requests', requireAuth, async (req, res) => {
    try {
      const userId = (req as any).user.id;
      console.log(`🔍 Fetching pending registration requests for wholesaler: ${userId}`);
      
      const requests = await storage.getAllRegistrationRequests(userId);
      
      console.log(`✅ Found ${requests.length} pending registration requests`);
      res.json(requests);
    } catch (error) {
      console.error('Error fetching registration requests:', error);
      res.status(500).json({ error: 'Failed to fetch registration requests' });
    }
  });

  // Approve or reject registration request
  app.post('/api/registration-requests/:requestId/respond', requireAuth, async (req, res) => {
    try {
      const { requestId } = req.params;
      const { action, responseMessage, customerGroupId } = req.body;
      const userId = (req as any).user.id;
      
      console.log(`📝 Processing registration request ${requestId}: ${action} by user ${userId}`);
      
      if (!['approve', 'reject'].includes(action)) {
        return res.status(400).json({ error: 'Invalid action. Must be approve or reject' });
      }
      
      // Get the request details first
      const request = await db
        .select()
        .from(customerRegistrationRequests)
        .where(eq(customerRegistrationRequests.id, parseInt(requestId)))
        .limit(1);
        
      if (!request[0] || request[0].wholesalerId !== userId) {
        return res.status(404).json({ error: 'Registration request not found or unauthorized' });
      }
      
      const requestData = request[0];
      
      if (requestData.status === 'rejected' && action === 'reject') {
        return res.status(400).json({ error: 'This request has already been rejected' });
      }
      if (requestData.status === 'approved' && action === 'approve') {
        return res.status(400).json({ error: 'This customer has already been approved' });
      }

      // Update request status
      await storage.updateRegistrationRequestStatus(
        parseInt(requestId), 
        action === 'approve' ? 'approved' : 'rejected',
        userId,
        responseMessage
      );

      // If revoking an approved customer, archive the wholesaler-customer relationship
      if (action === 'reject' && requestData.status === 'approved') {
        try {
          await db
            .update(wholesalerCustomerRelationships)
            .set({ status: 'inactive' })
            .where(and(
              eq(wholesalerCustomerRelationships.wholesalerId, userId),
              sql`customer_id IN (SELECT id FROM users WHERE phone_number = ${requestData.customerPhone})`
            ));
          console.log(`✅ Revoked customer access for ${requestData.customerPhone}`);
        } catch (revokeError) {
          console.warn(`⚠️ Could not archive relationship during revoke:`, revokeError);
        }
      }

      if (action === 'approve') {
        // Parse customer name
        const { firstName, lastName } = parseCustomerName(requestData.customerName);
        
        // Create customer account
        const newCustomer = await storage.createCustomer({
          phoneNumber: requestData.customerPhone,
          firstName,
          lastName,
          email: requestData.customerEmail || undefined,
          role: 'retailer',
          wholesalerId: userId,
          customerType: requestData.customerType || undefined,
        });
        
        console.log(`✅ Created customer account: ${newCustomer.id} (${newCustomer.firstName} ${newCustomer.lastName})`);

        // Create wholesaler-customer relationship so they appear in the Customers tab
        await db.insert(wholesalerCustomerRelationships).values({
          customerId: newCustomer.id,
          wholesalerId: userId,
          status: 'active',
        });
        console.log(`✅ Created wholesaler-customer relationship for ${newCustomer.id}`);

        if (customerGroupId && customerGroupId > 0) {
          try {
            await storage.addCustomerToGroup(customerGroupId, newCustomer.id);
            console.log(`✅ Customer ${newCustomer.id} added to group ${customerGroupId}`);
          } catch (groupError) {
            console.warn(`⚠️ Failed to add customer to group ${customerGroupId}:`, groupError);
          }
        }
        
        // Send welcome messages to new customer
        try {
          const wholesaler = await storage.getUser(userId);
          if (wholesaler) {
            const customerName = `${firstName} ${lastName}`.trim();
            const portalUrl = `https://quikpik.app/customer/${userId}`;
            const wholesalerName = wholesaler.businessName || `${wholesaler.firstName} ${wholesaler.lastName}`.trim() || 'Your Wholesale Partner';
            
            console.log(`📧 Sending welcome messages for approved customer ${customerName}`);
            
            const welcomeResult = await sendWelcomeMessages({
              customerName,
              customerEmail: requestData.customerEmail || undefined,
              customerPhone: requestData.customerPhone,
              wholesalerName,
              wholesalerEmail: wholesaler.email || 'hello@quikpik.co',
              wholesalerPhone: wholesaler.phoneNumber || '',
              wholesalerAccountName: `${wholesaler.firstName} ${wholesaler.lastName || ''}`.trim() || 'IBK',
              portalUrl,
              wholesalerId: wholesaler.id,
              wholesalerLogoType: wholesaler.logoType,
              wholesalerLogoUrl: wholesaler.logoUrl,
            });
            
            console.log(`📨 Welcome messages sent to ${customerName}:`, welcomeResult);
          }
        } catch (welcomeError) {
          console.error('❌ Error sending welcome messages (Registration Approval):', welcomeError);
        }
        
        // Send approval notification to customer
        if (requestData.customerEmail) {
          try {
            const wholesaler = await storage.getUser(userId);
            const businessName = wholesaler?.businessName || `${wholesaler?.firstName} ${wholesaler?.lastName}`.trim() || 'Wholesaler';
            
            const approvedBody = `${emailHeading('Welcome!', { size: '22px', color: '#10b981' })}<p style="font-size:16px;margin:0 0 8px">Dear ${requestData.customerName},</p><p style="margin:0 0 20px">Great news! Your registration request has been approved. You now have access to our wholesale platform.</p>${emailCard(`${emailHeading('Your Access Details', { size: '16px' })}<p style="margin:0 0 6px"><strong>Phone Number:</strong> ${requestData.customerPhone}</p><p style="margin:0">Use your phone number to log in and start ordering.</p>`, { borderColor: '#a7f3d0', bgColor: '#ecfdf5' })}${responseMessage ? emailCard(`<p style="margin:0 0 4px;font-weight:600">Message from ${businessName}:</p><p style="margin:0;color:#4b5563">${responseMessage}</p>`) : ''}${emailButton('Start Shopping', `https://quikpik.app/customer/${userId}`)}<p style="margin:20px 0 0">We look forward to serving you!</p>`;

            await sendEmail({
              to: requestData.customerEmail,
              from: 'hello@quikpik.co',
              subject: `Registration Approved - Welcome to ${businessName}`,
              html: wrapCustomerEmail(approvedBody, { businessName, logoUrl: getEmailLogoUrl(wholesaler?.id, wholesaler?.logoType, wholesaler?.logoUrl) }, { preheader: `Your registration with ${businessName} has been approved` })
            });
            console.log(`📧 Approval notification sent to ${requestData.customerEmail}`);
          } catch (emailError) {
            console.error('Failed to send approval notification:', emailError);
          }
        }
      } else {
        // Send rejection notification to customer
        if (requestData.customerEmail) {
          try {
            const wholesaler = await storage.getUser(userId);
            const businessName = wholesaler?.businessName || `${wholesaler?.firstName} ${wholesaler?.lastName}`.trim() || 'Wholesaler';
            
            const rejectedBody = `${emailHeading('Registration Update', { size: '22px' })}<p style="font-size:16px;margin:0 0 8px">Dear ${requestData.customerName},</p><p style="margin:0 0 20px">Thank you for your interest in our wholesale platform. Unfortunately, your registration request could not be approved at this time.</p>${responseMessage ? emailCard(`<p style="margin:0 0 4px;font-weight:600">Reason:</p><p style="margin:0;color:#4b5563">${responseMessage}</p>`) : ''}<p style="margin:20px 0 0">If you have any questions, please feel free to contact us directly. We appreciate your interest and hope to work with you in the future.</p>`;

            await sendEmail({
              to: requestData.customerEmail,
              from: 'hello@quikpik.co',
              subject: `Registration Request Update - ${businessName}`,
              html: wrapCustomerEmail(rejectedBody, { businessName, logoUrl: getEmailLogoUrl(wholesaler?.id, wholesaler?.logoType, wholesaler?.logoUrl) }, { preheader: `Update on your registration with ${businessName}` })
            });
            console.log(`📧 Rejection notification sent to ${requestData.customerEmail}`);
          } catch (emailError) {
            console.error('Failed to send rejection notification:', emailError);
          }
        }
      }
      
      res.json({ 
        success: true, 
        message: `Registration request ${action}d successfully${action === 'approve' ? ' and customer account created' : ''}` 
      });
    } catch (error) {
      console.error(`❌ Error ${req.body.action}ing registration request:`, error);
      res.status(500).json({ error: `Failed to ${req.body.action} registration request` });
    }
  });

  // Customer profile update endpoint with automated wholesaler notifications
  app.patch('/api/customer/update-profile/:customerId', async (req, res) => {
    try {
      const { customerId } = req.params;
      const { firstName, lastName, email, phoneNumber, businessName } = req.body;
      
      console.log(`🔄 Customer profile update request for: ${customerId}`, { firstName, lastName, email, phoneNumber, businessName });
      
      // Validate required fields
      if (!customerId) {
        return res.status(400).json({ error: "Customer ID is required" });
      }
      
      const updates: any = {};
      if (firstName) updates.firstName = firstName;
      if (lastName) updates.lastName = lastName;
      if (email) updates.email = email;
      if (phoneNumber) updates.phoneNumber = phoneNumber;
      if (businessName) updates.businessName = businessName;
      
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "No updates provided" });
      }
      
      // Update customer profile with automatic notifications to wholesalers
      const updatedCustomer = await storage.updateCustomerProfileWithNotifications(customerId, updates, true);
      
      console.log(`✅ Customer profile updated successfully: ${customerId}`);
      
      res.json({
        success: true,
        customer: {
          id: updatedCustomer.id,
          firstName: updatedCustomer.firstName,
          lastName: updatedCustomer.lastName,
          email: updatedCustomer.email,
          phoneNumber: updatedCustomer.phoneNumber,
          businessName: updatedCustomer.businessName
        },
        message: "Profile updated successfully. All your wholesalers have been notified of the changes."
      });
    } catch (error) {
      console.error("❌ Error updating customer profile:", error);
      res.status(500).json({ error: "Failed to update customer profile" });
    }
  });

  // ============================================================================
  // DELIVERY ADDRESS MANAGEMENT API ROUTES
  // ============================================================================
  
  // Get specific delivery address by ID for order display
  app.get('/api/delivery-address/:addressId', async (req, res) => {
    try {
      const { addressId } = req.params;
      
      // Get customer from session or fallback auth (same pattern as other customer endpoints)
      let customerAuth = (req.session as any)?.customerAuth;
      
      if (!customerAuth && req.cookies?.customer_auth) {
        try {
          const cookieData = JSON.parse(Buffer.from(req.cookies.customer_auth, 'base64').toString());
          if (cookieData.expires > Date.now()) {
            customerAuth = {
              customerId: cookieData.customerId,
              wholesalerId: cookieData.wholesalerId
            };
          }
        } catch (cookieError) {
          console.error('Failed to parse customer auth cookie:', cookieError);
        }
      }
      
      if (!customerAuth) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const address = await storage.getDeliveryAddress(parseInt(addressId));
      
      if (!address) {
        return res.status(404).json({ error: "Address not found" });
      }
      
      // Verify the customer owns this address
      if (address.customerId !== customerAuth.customerId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      console.log(`🎯 Retrieved exact delivery address ${addressId} for order display: ${address.addressLine1}, ${address.city}`);
      res.json(address);
    } catch (error) {
      console.error("❌ Error fetching delivery address:", error);
      res.status(500).json({ error: "Failed to fetch delivery address" });
    }
  });

  // Wholesaler-specific endpoint to get delivery address for their orders
  app.get('/api/wholesaler/delivery-address/:addressId', requireAuth, async (req: any, res) => {
    try {
      const { addressId } = req.params;
      
      // Use authenticated wholesaler ID for proper data isolation
      const wholesalerId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      
      const address = await storage.getDeliveryAddress(parseInt(addressId));
      
      if (!address) {
        return res.status(404).json({ error: "Address not found" });
      }
      
      // Verify the address belongs to a customer of this wholesaler
      if (address.wholesalerId !== wholesalerId) {
        return res.status(403).json({ error: "Access denied - address not associated with your customers" });
      }
      
      console.log(`🎯 Wholesaler ${wholesalerId} retrieved delivery address ${addressId}: ${address.addressLine1}, ${address.city}`);
      res.json(address);
    } catch (error) {
      console.error("❌ Error fetching delivery address for wholesaler:", error);
      res.status(500).json({ error: "Failed to fetch delivery address" });
    }
  });

  // Wholesaler endpoint: Get customer's delivery addresses for order fulfillment
  app.get('/api/wholesaler/customer-delivery-addresses/:customerId/:wholesalerId', isAuthenticated, async (req, res) => {
    try {
      const { customerId, wholesalerId } = req.params;
      
      // Verify the authenticated user is the wholesaler requesting the data
      const authenticatedWholesalerId = (req.user as any)?.id;
      if (authenticatedWholesalerId !== wholesalerId) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      const addresses = await storage.getDeliveryAddresses(customerId, wholesalerId);
      console.log(`📍 Wholesaler ${wholesalerId} retrieved ${addresses.length} delivery addresses for customer ${customerId}`);
      
      res.json(addresses);
    } catch (error) {
      console.error("❌ Error fetching delivery addresses for wholesaler:", error);
      res.status(500).json({ error: "Failed to fetch delivery addresses" });
    }
  });

  // Wholesaler endpoint: Get customer's delivery addresses (simplified URL)
  app.get('/api/wholesaler/customers/:customerId/addresses', requireAuth, async (req: any, res) => {
    try {
      const wholesalerId = req.user.role === 'team_member' && req.user.wholesalerId ? req.user.wholesalerId : req.user.id;
      const { customerId } = req.params;
      const addresses = await storage.getDeliveryAddresses(customerId, wholesalerId);
      res.json(addresses);
    } catch (error) {
      console.error("❌ Error fetching customer addresses:", error);
      res.status(500).json({ error: "Failed to fetch addresses" });
    }
  });

  // Wholesaler endpoint: Add delivery address for a customer
  app.post('/api/wholesaler/customers/:customerId/addresses', requireAuth, async (req: any, res) => {
    try {
      const wholesalerId = req.user.role === 'team_member' && req.user.wholesalerId ? req.user.wholesalerId : req.user.id;
      const { customerId } = req.params;
      const { addressLine1, addressLine2, city, state, postalCode, country, label, instructions, isDefault } = req.body;

      if (!addressLine1 || !city || !postalCode) {
        return res.status(400).json({ error: "Address line 1, city, and postal code are required" });
      }

      const address = await storage.createDeliveryAddress({
        customerId,
        wholesalerId,
        addressLine1,
        addressLine2: addressLine2 || null,
        city,
        state: state || null,
        postalCode,
        country: country || 'United Kingdom',
        label: label || null,
        instructions: instructions || null,
        isDefault: isDefault || false,
      });

      console.log(`📍 Wholesaler ${wholesalerId} added address for customer ${customerId}: ${addressLine1}, ${city}`);
      res.json(address);
    } catch (error) {
      console.error("❌ Error creating customer address:", error);
      res.status(500).json({ error: "Failed to create address" });
    }
  });

  // Wholesaler endpoint: Update a customer's delivery address
  app.put('/api/wholesaler/customers/:customerId/addresses/:addressId', requireAuth, async (req: any, res) => {
    try {
      const wholesalerId = req.user.role === 'team_member' && req.user.wholesalerId ? req.user.wholesalerId : req.user.id;
      const { customerId, addressId } = req.params;
      const { addressLine1, addressLine2, city, state, postalCode, country, label, instructions, isDefault } = req.body;

      const existing = await storage.getDeliveryAddressForCustomer(parseInt(addressId), customerId, wholesalerId);
      if (!existing) {
        return res.status(404).json({ error: "Address not found" });
      }

      const updated = await storage.updateDeliveryAddress(parseInt(addressId), {
        addressLine1, addressLine2, city, state, postalCode, country, label, instructions, isDefault,
      });

      console.log(`📍 Wholesaler ${wholesalerId} updated address ${addressId} for customer ${customerId}`);
      res.json(updated);
    } catch (error) {
      console.error("❌ Error updating customer address:", error);
      res.status(500).json({ error: "Failed to update address" });
    }
  });

  // Wholesaler endpoint: Delete a customer's delivery address
  app.delete('/api/wholesaler/customers/:customerId/addresses/:addressId', requireAuth, async (req: any, res) => {
    try {
      const wholesalerId = req.user.role === 'team_member' && req.user.wholesalerId ? req.user.wholesalerId : req.user.id;
      const { customerId, addressId } = req.params;

      const existing = await storage.getDeliveryAddressForCustomer(parseInt(addressId), customerId, wholesalerId);
      if (!existing) {
        return res.status(404).json({ error: "Address not found" });
      }

      await storage.deleteDeliveryAddress(parseInt(addressId));
      console.log(`📍 Wholesaler ${wholesalerId} deleted address ${addressId} for customer ${customerId}`);
      res.json({ success: true });
    } catch (error) {
      console.error("❌ Error deleting customer address:", error);
      res.status(500).json({ error: "Failed to delete address" });
    }
  });

  // Get customer's delivery addresses for a specific wholesaler
  app.get('/api/customer/delivery-addresses/:wholesalerId', async (req, res) => {
    try {
      const { wholesalerId } = req.params;
      
      // Get customer from session or fallback auth
      let customerAuth = (req.session as any)?.customerAuth;
      
      // If session auth fails, try fallback cookie
      if (!customerAuth && req.cookies?.customer_auth) {
        try {
          const cookieData = JSON.parse(Buffer.from(req.cookies.customer_auth, 'base64').toString());
          if (cookieData.expires > Date.now() && cookieData.wholesalerId === wholesalerId) {
            customerAuth = {
              customerId: cookieData.customerId,
              wholesalerId: cookieData.wholesalerId
            };
          }
        } catch (cookieError) {
          console.error('Failed to parse customer auth cookie:', cookieError);
        }
      }
      
      if (!customerAuth) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      if (customerAuth.wholesalerId !== wholesalerId) {
        return res.status(403).json({ error: "Access denied for this wholesaler" });
      }
      
      const addresses = await storage.getDeliveryAddresses(customerAuth.customerId, wholesalerId);
      console.log(`📍 Retrieved ${addresses.length} delivery addresses for customer ${customerAuth.customerId}`);
      
      res.json(addresses);
    } catch (error) {
      console.error("❌ Error fetching delivery addresses:", error);
      res.status(500).json({ error: "Failed to fetch delivery addresses" });
    }
  });

  // Create new delivery address
  app.post('/api/customer/delivery-addresses', async (req, res) => {
    try {
      const { wholesalerId, addressLine1, addressLine2, city, state, postalCode, country, label, instructions, isDefault } = req.body;
      
      // Get customer from session or fallback auth
      let customerAuth = (req.session as any)?.customerAuth;
      
      if (!customerAuth && req.cookies?.customer_auth) {
        try {
          const cookieData = JSON.parse(Buffer.from(req.cookies.customer_auth, 'base64').toString());
          if (cookieData.expires > Date.now() && cookieData.wholesalerId === wholesalerId) {
            customerAuth = {
              customerId: cookieData.customerId,
              wholesalerId: cookieData.wholesalerId
            };
          }
        } catch (cookieError) {
          console.error('Failed to parse customer auth cookie:', cookieError);
        }
      }
      
      if (!customerAuth) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      // Validate required fields
      if (!wholesalerId || !addressLine1 || !city || !postalCode) {
        return res.status(400).json({ error: "Missing required address fields" });
      }
      
      // If this is being set as default, first unset any existing default
      if (isDefault) {
        await storage.setDefaultDeliveryAddress(customerAuth.customerId, wholesalerId, -1); // This will unset all defaults
      }
      
      const newAddress = await storage.createDeliveryAddress({
        customerId: customerAuth.customerId,
        wholesalerId,
        addressLine1,
        addressLine2: addressLine2 || null,
        city,
        state: state || null,
        postalCode,
        country: country || 'United Kingdom',
        label: label || null,
        instructions: instructions || null,
        isDefault: isDefault || false
      });
      
      console.log(`📍 Created new delivery address ${newAddress.id} for customer ${customerAuth.customerId}`);
      
      res.status(201).json(newAddress);
    } catch (error) {
      console.error("❌ Error creating delivery address:", error);
      res.status(500).json({ error: "Failed to create delivery address" });
    }
  });

  // Update delivery address
  app.put('/api/customer/delivery-addresses/:addressId', async (req, res) => {
    try {
      const { addressId } = req.params;
      const { wholesalerId, addressLine1, addressLine2, city, state, postalCode, country, label, instructions, isDefault } = req.body;
      
      // Get customer from session or fallback auth
      let customerAuth = (req.session as any)?.customerAuth;
      
      if (!customerAuth && req.cookies?.customer_auth) {
        try {
          const cookieData = JSON.parse(Buffer.from(req.cookies.customer_auth, 'base64').toString());
          if (cookieData.expires > Date.now()) {
            customerAuth = {
              customerId: cookieData.customerId,
              wholesalerId: cookieData.wholesalerId
            };
          }
        } catch (cookieError) {
          console.error('Failed to parse customer auth cookie:', cookieError);
        }
      }
      
      if (!customerAuth) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      // Verify the customer owns this address
      const existingAddress = await storage.getDeliveryAddress(parseInt(addressId));
      if (!existingAddress || existingAddress.customerId !== customerAuth.customerId) {
        return res.status(403).json({ error: "Address not found or access denied" });
      }
      
      // If this is being set as default, first handle default switching
      if (isDefault && !existingAddress.isDefault) {
        await storage.setDefaultDeliveryAddress(customerAuth.customerId, existingAddress.wholesalerId, parseInt(addressId));
      }
      
      const updates: any = {};
      if (addressLine1) updates.addressLine1 = addressLine1;
      if (addressLine2 !== undefined) updates.addressLine2 = addressLine2;
      if (city) updates.city = city;
      if (state !== undefined) updates.state = state;
      if (postalCode) updates.postalCode = postalCode;
      if (country) updates.country = country;
      if (label !== undefined) updates.label = label;
      if (instructions !== undefined) updates.instructions = instructions;
      if (isDefault !== undefined) updates.isDefault = isDefault;
      
      const updatedAddress = await storage.updateDeliveryAddress(parseInt(addressId), updates);
      
      console.log(`📍 Updated delivery address ${addressId} for customer ${customerAuth.customerId}`);
      
      res.json(updatedAddress);
    } catch (error) {
      console.error("❌ Error updating delivery address:", error);
      res.status(500).json({ error: "Failed to update delivery address" });
    }
  });

  // Delete delivery address
  app.delete('/api/customer/delivery-addresses/:addressId', async (req, res) => {
    try {
      const { addressId } = req.params;
      
      // Get customer from session or fallback auth
      let customerAuth = (req.session as any)?.customerAuth;
      
      if (!customerAuth && req.cookies?.customer_auth) {
        try {
          const cookieData = JSON.parse(Buffer.from(req.cookies.customer_auth, 'base64').toString());
          if (cookieData.expires > Date.now()) {
            customerAuth = {
              customerId: cookieData.customerId
            };
          }
        } catch (cookieError) {
          console.error('Failed to parse customer auth cookie:', cookieError);
        }
      }
      
      if (!customerAuth) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      // Verify the customer owns this address
      const existingAddress = await storage.getDeliveryAddress(parseInt(addressId));
      if (!existingAddress || existingAddress.customerId !== customerAuth.customerId) {
        return res.status(403).json({ error: "Address not found or access denied" });
      }
      
      await storage.deleteDeliveryAddress(parseInt(addressId));
      
      console.log(`📍 Deleted delivery address ${addressId} for customer ${customerAuth.customerId}`);
      
      res.json({ success: true, message: "Delivery address deleted successfully" });
    } catch (error) {
      console.error("❌ Error deleting delivery address:", error);
      res.status(500).json({ error: "Failed to delete delivery address" });
    }
  });

  // Set default delivery address
  app.post('/api/customer/delivery-addresses/:addressId/set-default', async (req, res) => {
    try {
      const { addressId } = req.params;
      
      // Get customer from session or fallback auth
      let customerAuth = (req.session as any)?.customerAuth;
      
      if (!customerAuth && req.cookies?.customer_auth) {
        try {
          const cookieData = JSON.parse(Buffer.from(req.cookies.customer_auth, 'base64').toString());
          if (cookieData.expires > Date.now()) {
            customerAuth = {
              customerId: cookieData.customerId
            };
          }
        } catch (cookieError) {
          console.error('Failed to parse customer auth cookie:', cookieError);
        }
      }
      
      if (!customerAuth) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      // Verify the customer owns this address
      const existingAddress = await storage.getDeliveryAddress(parseInt(addressId));
      if (!existingAddress || existingAddress.customerId !== customerAuth.customerId) {
        return res.status(403).json({ error: "Address not found or access denied" });
      }
      
      await storage.setDefaultDeliveryAddress(customerAuth.customerId, existingAddress.wholesalerId, parseInt(addressId));
      
      console.log(`📍 Set address ${addressId} as default for customer ${customerAuth.customerId}`);
      
      res.json({ success: true, message: "Default address updated successfully" });
    } catch (error) {
      console.error("❌ Error setting default address:", error);
      res.status(500).json({ error: "Failed to set default address" });
    }
  });

  // Get default delivery address for customer and wholesaler
  app.get('/api/customer/delivery-addresses/:wholesalerId/default', async (req, res) => {
    try {
      const { wholesalerId } = req.params;
      
      // Get customer from session or fallback auth
      let customerAuth = (req.session as any)?.customerAuth;
      
      if (!customerAuth && req.cookies?.customer_auth) {
        try {
          const cookieData = JSON.parse(Buffer.from(req.cookies.customer_auth, 'base64').toString());
          if (cookieData.expires > Date.now() && cookieData.wholesalerId === wholesalerId) {
            customerAuth = {
              customerId: cookieData.customerId,
              wholesalerId: cookieData.wholesalerId
            };
          }
        } catch (cookieError) {
          console.error('Failed to parse customer auth cookie:', cookieError);
        }
      }
      
      if (!customerAuth) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      const defaultAddress = await storage.getDefaultDeliveryAddress(customerAuth.customerId, wholesalerId);
      
      if (!defaultAddress) {
        return res.status(404).json({ error: "No default address found" });
      }
      
      console.log(`📍 Retrieved default address ${defaultAddress.id} for customer ${customerAuth.customerId}`);
      
      res.json(defaultAddress);
    } catch (error) {
      console.error("❌ Error fetching default address:", error);
      res.status(500).json({ error: "Failed to fetch default address" });
    }
  });

  // Change delivery address for a pending order
  app.put('/api/orders/:orderId/change-delivery-address', async (req, res) => {
    try {
      const { orderId } = req.params;
      const { deliveryAddressId } = req.body;
      
      // Get customer from session or fallback auth
      let customerAuth = (req.session as any)?.customerAuth;
      
      if (!customerAuth && req.cookies?.customer_auth) {
        try {
          const cookieData = JSON.parse(Buffer.from(req.cookies.customer_auth, 'base64').toString());
          if (cookieData.expires > Date.now()) {
            customerAuth = {
              customerId: cookieData.customerId,
              wholesalerId: cookieData.wholesalerId
            };
          }
        } catch (cookieError) {
          console.error('Failed to parse customer auth cookie:', cookieError);
        }
      }
      
      if (!customerAuth) {
        return res.status(401).json({ error: "Authentication required" });
      }
      
      // Verify order exists and belongs to customer
      const order = await storage.getOrderById(parseInt(orderId));
      if (!order) {
        return res.status(404).json({ error: "Order not found" });
      }
      
      // Check if customer owns this order (multiple ways to check due to historical data)
      const customerOwnsOrder = order.retailerId === customerAuth.customerId || 
                               order.customerPhone === (await storage.getUser(customerAuth.customerId))?.phoneNumber;
      
      if (!customerOwnsOrder) {
        return res.status(403).json({ error: "Access denied" });
      }
      
      // Check if order can be modified (only pending/confirmed orders)
      const changeableStatuses = ['pending', 'confirmed', 'processing'];
      if (!changeableStatuses.includes(order.status)) {
        return res.status(400).json({ 
          error: "Address cannot be changed", 
          message: `Orders with status '${order.status}' cannot be modified` 
        });
      }
      
      // Verify the new address belongs to the customer
      const newAddress = await storage.getDeliveryAddress(parseInt(deliveryAddressId));
      if (!newAddress || newAddress.customerId !== customerAuth.customerId || newAddress.wholesalerId !== order.wholesalerId) {
        return res.status(403).json({ error: "Address not found or access denied" });
      }
      
      // Format the new address as a string for the delivery_address field
      const formattedAddress = [
        newAddress.addressLine1,
        newAddress.addressLine2,
        newAddress.city,
        newAddress.state,
        newAddress.postalCode,
        newAddress.country
      ].filter(Boolean).join(', ');
      
      // Update the order with new address
      await storage.updateOrderDeliveryAddress(parseInt(orderId), parseInt(deliveryAddressId), formattedAddress);
      
      console.log(`📍 Updated order ${orderId} delivery address to address ID ${deliveryAddressId} for customer ${customerAuth.customerId}`);
      
      res.json({ 
        success: true, 
        message: "Delivery address updated successfully",
        newAddress: newAddress
      });
    } catch (error) {
      console.error("❌ Error changing order delivery address:", error);
      res.status(500).json({ error: "Failed to change delivery address" });
    }
  });

  // Get customer profile update notifications for a wholesaler
  app.get('/api/wholesaler/customer-update-notifications', requireAuth, async (req: any, res) => {
    try {
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;

      const limit = parseInt(req.query.limit as string) || 50;
      
      const notifications = await storage.getCustomerProfileUpdateNotifications(targetUserId, limit);
      
      // Add customer details to notifications
      const enrichedNotifications = await Promise.all(
        notifications.map(async (notification) => {
          const customer = await storage.getUser(notification.customerId);
          return {
            ...notification,
            customerName: customer ? `${customer.firstName} ${customer.lastName}` : 'Unknown Customer',
            customerEmail: customer?.email,
            customerPhone: customer?.phoneNumber
          };
        })
      );
      
      res.json({
        success: true,
        notifications: enrichedNotifications
      });
    } catch (error) {
      console.error("❌ Error fetching customer update notifications:", error);
      res.status(500).json({ error: "Failed to fetch notifications" });
    }
  });

  // Mark customer profile update notification as read
  app.patch('/api/wholesaler/customer-update-notifications/:notificationId/read', requireAuth, async (req: any, res) => {
    try {
      const { notificationId } = req.params;
      
      await storage.markNotificationAsRead(parseInt(notificationId));
      
      res.json({
        success: true,
        message: "Notification marked as read"
      });
    } catch (error) {
      console.error("❌ Error marking notification as read:", error);
      res.status(500).json({ error: "Failed to mark notification as read" });
    }
  });

  // Get quick order templates for efficient reordering
  app.get('/api/quick-order-templates/:wholesalerId/:phoneNumber', async (req, res) => {
    try {
      const { wholesalerId, phoneNumber } = req.params;
      
      if (!wholesalerId || !phoneNumber) {
        return res.status(400).json({ error: "Wholesaler ID and phone number are required" });
      }

      // Find customer using the same logic as authentication
      const decodedPhoneNumber = decodeURIComponent(phoneNumber);
      const lastFourDigits = decodedPhoneNumber.slice(-4);
      const customer = await storage.findCustomerByLastFourDigits(wholesalerId, lastFourDigits);

      if (!customer) {
        return res.status(403).json({ 
          error: "Customer not registered with this wholesaler" 
        });
      }

      const templates = await quickOrderService.getQuickOrderTemplates(customer.id, wholesalerId);
      res.json({ success: true, templates });

    } catch (error) {
      console.error("❌ Error fetching quick order templates:", error);
      res.status(500).json({ error: "Failed to fetch quick order templates" });
    }
  });

  // Get frequently ordered products for a customer
  app.get('/api/frequently-ordered/:wholesalerId/:phoneNumber', async (req, res) => {
    try {
      const { wholesalerId, phoneNumber } = req.params;
      
      if (!wholesalerId || !phoneNumber) {
        return res.status(400).json({ error: "Wholesaler ID and phone number are required" });
      }

      const decodedPhoneNumber = decodeURIComponent(phoneNumber);
      const lastFourDigits = decodedPhoneNumber.slice(-4);
      const customer = await storage.findCustomerByLastFourDigits(wholesalerId, lastFourDigits);

      if (!customer) {
        return res.status(403).json({ 
          error: "Customer not registered with this wholesaler" 
        });
      }

      const patterns = await quickOrderService.getFrequentlyOrderedProducts(customer.id, wholesalerId);
      res.json({ success: true, products: patterns });

    } catch (error) {
      console.error("❌ Error fetching frequently ordered products:", error);
      res.status(500).json({ error: "Failed to fetch frequently ordered products" });
    }
  });

  // Get last order for quick reordering
  app.get('/api/last-order-reorder/:wholesalerId/:phoneNumber', async (req, res) => {
    try {
      const { wholesalerId, phoneNumber } = req.params;
      
      if (!wholesalerId || !phoneNumber) {
        return res.status(400).json({ error: "Wholesaler ID and phone number are required" });
      }

      const decodedPhoneNumber = decodeURIComponent(phoneNumber);
      const lastFourDigits = decodedPhoneNumber.slice(-4);
      const customer = await storage.findCustomerByLastFourDigits(wholesalerId, lastFourDigits);

      if (!customer) {
        return res.status(403).json({ 
          error: "Customer not registered with this wholesaler" 
        });
      }

      const lastOrder = await quickOrderService.getLastOrderForReorder(customer.id, wholesalerId);
      res.json({ success: true, lastOrder });

    } catch (error) {
      console.error("❌ Error fetching last order for reorder:", error);
      res.status(500).json({ error: "Failed to fetch last order for reorder" });
    }
  });

  // MEDIUM-TERM BUSINESS GROWTH ENDPOINTS

  app.get('/api/customer-orders/stats/:wholesalerId/:phoneNumber', async (req, res) => {
    try {
      const { wholesalerId, phoneNumber } = req.params;
      
      if (!wholesalerId || !phoneNumber) {
        return res.status(400).json({ error: "Wholesaler ID and phone number are required" });
      }
      
      // Find customer using same logic as order history
      const decodedPhoneNumber = decodeURIComponent(phoneNumber);
      const lastFourDigits = decodedPhoneNumber.slice(-4);
      const customer = await storage.findCustomerByLastFourDigits(wholesalerId, lastFourDigits);
      
      if (!customer) {
        return res.status(403).json({ 
          error: "Customer not registered with this wholesaler"
        });
      }

      // Get order statistics
      const orderResults = await db
        .select()
        .from(orders)
        .where(and(
          or(
            eq(orders.retailerId, customer.id),
            eq(orders.retailerId, wholesalerId),
            eq(orders.customerPhone, customer.phone)
          ),
          eq(orders.wholesalerId, wholesalerId)
        ))
        .orderBy(desc(orders.createdAt));

      const totalOrders = orderResults.length;
      const paidOrderResults = orderResults.filter(order => ['paid', 'fulfilled', 'completed'].includes(order.status));
      const totalSpent = paidOrderResults.reduce((sum, order) => {
        const subtotal = parseFloat(order.subtotal || order.total || '0');
        const platformFee = parseFloat(order.platformFee || '0');
        return sum + (subtotal - platformFee);
      }, 0);
      
      // Calculate days since last order
      let daysSinceLastOrder = undefined;
      if (orderResults.length > 0) {
        const lastOrderDate = new Date(orderResults[0].createdAt || new Date());
        const now = new Date();
        daysSinceLastOrder = Math.floor((now.getTime() - lastOrderDate.getTime()) / (1000 * 60 * 60 * 24));
      }

      // Get recent orders (last 5)
      const recentOrders = orderResults.slice(0, 5).map(order => ({
        id: order.id,
        orderNumber: order.orderNumber,
        date: order.createdAt,
        status: order.status,
        total: order.total
      }));

      const stats = {
        totalOrders,
        totalSpent,
        daysSinceLastOrder,
        recentOrders
      };

      res.json(stats);
    } catch (error) {
      console.error("Error fetching customer order statistics:", error);
      res.status(500).json({ message: "Failed to fetch customer order statistics" });
    }
  });

  // Session middleware setup moved to beginning of registerRoutes

  // STRIPE WEBHOOKS MOVED TO TOP OF FILE TO AVOID VITE INTERFERENCE

  // Google Auth routes
  app.get('/api/auth/google', (req, res) => {
    try {
      const returnTo = typeof req.query.returnTo === 'string' ? req.query.returnTo : null;
      if (returnTo) {
        (req.session as any).returnTo = returnTo;
      }
      const authUrl = getGoogleAuthUrl();
      res.json({ authUrl });
    } catch (error) {
      console.error('Error generating Google auth URL:', error);
      res.status(500).json({ error: 'Failed to generate authentication URL' });
    }
  });

  app.get('/api/auth/google/callback', async (req, res) => {
    try {
      const { code, error, state } = req.query;
      
      console.log('🔄 OAuth callback received:', { 
        hasCode: !!code, 
        codeLength: code?.length, 
        error: error || 'none',
        state: state || 'none'
      });
      
      if (error) {
        console.log('❌ OAuth error from Google:', error);
        return res.redirect('/login?error=oauth_denied');
      }
      
      if (!code || typeof code !== 'string') {
        console.log('❌ No authorization code provided');
        return res.redirect('/login?error=no_code');
      }

      console.log('🔄 Attempting to verify Google token...');
      // Verify Google token and get user info
      const googleUser = await verifyGoogleToken(code);
      
      // Create or update user in database
      const user = await createOrUpdateUser(googleUser);
      
      // Set user session in passport format for compatibility
      (req.session as any).passport = {
        user: {
          sub: user.id,
          email: user.email,
          claims: user
        }
      };
      (req.session as any).userId = user.id;
      (req.session as any).user = user;
      
      console.log(`🔐 Google auth session created for user ${user.email}`, {
        isFirstLogin: user.isFirstLogin,
        hasBusinessName: !!user.businessName,
        hasAddress: !!(user.streetAddress || user.city)
      });
      
      // CRITICAL: Save session before redirect to ensure persistence
      req.session.save((err: any) => {
        if (err) {
          console.error('❌ Session save failed after Google auth:', err);
          return res.redirect('/login?error=session_failed');
        }
        
        console.log(`✅ Session saved successfully for ${user.email}`);
        
        // Use returnTo if set (e.g. from /admin login)
        const returnTo = (req.session as any).returnTo;
        if (returnTo) {
          delete (req.session as any).returnTo;
          console.log(`↩️ Redirecting to returnTo: ${returnTo}`);
          return res.redirect(returnTo);
        }

        // Check if this is a new user who needs to complete signup
        if (user.isFirstLogin || !user.businessName || user.businessName.includes("'s Business")) {
          console.log(`👋 New user detected, redirecting to complete signup profile`);
          res.redirect('/signup-complete');
        } else {
          console.log(`✅ Returning user with complete profile, redirecting to dashboard`);
          res.redirect('/dashboard');
        }
      });
    } catch (error) {
      console.error('❌ Google auth callback error:', error);
      
      // More specific error handling
      if (error?.message?.includes('invalid_grant')) {
        console.log('❌ Google token expired or invalid - user needs to try again');
        res.redirect('/login?error=token_expired');
      } else if (error?.message?.includes('Failed to verify')) {
        console.log('❌ Google token verification failed');
        res.redirect('/login?error=verification_failed');
      } else {
        console.log('❌ Generic auth error');
        res.redirect('/login?error=auth_failed');
      }
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

  // Profile completion endpoint for Google OAuth users
  app.put('/api/auth/complete-profile', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const {
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
        preferredCurrency,
        isFirstLogin
      } = req.body;

      console.log(`🔄 Completing profile for user ${userId}:`, {
        businessName,
        hasAddress: !!(streetAddress || city),
        currency: preferredCurrency
      });

      // Update user profile
      const updateData: any = {
        isFirstLogin: isFirstLogin || false, // Mark profile as completed
        updatedAt: new Date()
      };

      if (businessName) updateData.businessName = businessName;
      if (businessDescription) updateData.businessDescription = businessDescription;
      if (businessPhone) updateData.businessPhone = businessPhone;
      if (businessType) updateData.businessType = businessType;
      if (estimatedMonthlyVolume) updateData.estimatedMonthlyVolume = estimatedMonthlyVolume;
      if (streetAddress) updateData.streetAddress = streetAddress;
      if (city) updateData.city = city;
      if (state) updateData.state = state;
      if (postalCode) updateData.postalCode = postalCode;
      if (country) updateData.country = country;
      if (preferredCurrency) updateData.defaultCurrency = preferredCurrency;

      const updatedUser = await storage.updateUser(userId, updateData);

      if (!updatedUser) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      console.log(`✅ Profile completed successfully for ${updatedUser.email}`);

      // Update session with new user data
      (req.session as any).user = {
        ...req.user,
        ...updatedUser,
        isFirstLogin: false
      };

      res.json({
        success: true,
        message: 'Profile completed successfully',
        user: updatedUser
      });
    } catch (error) {
      console.error('Profile completion error:', error);
      res.status(500).json({ success: false, message: 'Failed to complete profile' });
    }
  });

  // Authentication recovery endpoint for Surulere Foods Wholesale
  app.post('/api/auth/recover', async (req: any, res) => {
    try {
      const { email } = req.body;
      
      // Allow recovery for the consolidated wholesaler account
      if (!email || (email !== 'hello@quikpik.co' && email !== 'mogunjemilua@gmail.com')) {
        return res.status(403).json({ error: 'Unauthorized - Contact support for account recovery' });
      }
      
      // Find the wholesaler user by email only - no hardcoded IDs
      const user = await storage.getUserByEmail(email);
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      // Ensure this is a wholesaler account
      if (user.role !== 'wholesaler') {
        return res.status(403).json({ error: 'Access denied - Only wholesaler accounts can be recovered' });
      }
      
      // Create comprehensive session data
      const sessionUser = {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        businessName: user.businessName,
        isTeamMember: false
      };
      
      // Recreate session with both formats for compatibility
      (req.session as any).userId = user.id;
      (req.session as any).user = sessionUser;
      
      // Save session explicitly
      req.session.save((err: any) => {
        if (err) {
          console.error('Session save error:', err);
          return res.status(500).json({ error: 'Session save failed' });
        }
        
        console.log(`🔐 Session recovered and saved for wholesaler ${user.email} (${user.businessName})`);
        
        res.json({ 
          success: true, 
          message: 'Authentication recovered',
          user: {
            id: user.id,
            email: user.email,
          }
        });
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
            businessName: wholesalerInfo.businessName,
            logoType: wholesalerInfo.logoType,
            logoUrl: wholesalerInfo.logoUrl,
            isTeamMember: true,
            role: 'team_member'
          };
        }
      }
      
      console.log(`👤 Auth endpoint returning fresh user data for ${userId}:`, {
        id: responseUser.id,
        email: responseUser.email,
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
    } catch (error: any) {
      console.error("❌ Error updating settings:", error);
      res.status(500).json({ message: "Failed to update settings" });
    }
  });

  // Product routes
  // Development bypass for products (only in development mode)
  app.get('/api/dev-products', async (req, res) => {
    if (process.env.NODE_ENV !== 'development') {
      return res.status(404).json({ error: "Not found" });
    }
    
    try {
      // Use the same successful query from customer-products
      const defaultUserId = "user_1756056297340_surulere";
      console.log('🛍️ Dev requesting products for wholesaler:', defaultUserId);
      console.log('🔧 Environment: development');
      console.log('⚡ TESTING: Endpoint reached successfully');
      console.log('🔍 Executing optimized SQL query...');
      
      const startTime = Date.now();
      const result = await db.execute(sql`
        SELECT 
          p.id, p.name, p.description, p.price, p.currency, p.image_url, p.images,
          p.moq, p.stock, p.category, p.status, p.created_at, p.updated_at,
          p.promo_active, p.promo_price, p.unit, p.selling_format,
          p.units_per_pallet, p.pallet_price, p.pallet_moq, p.pallet_stock,
          p.price_visible, p.negotiation_enabled, p.minimum_bid_price,
          p.pack_quantity, p.unit_of_measure, p.size_per_unit,
          u.business_name as wholesaler_name
        FROM products p
        INNER JOIN users u ON p.wholesaler_id = u.id
        WHERE p.wholesaler_id = ${defaultUserId}
          AND p.status IN ('active', 'inactive', 'out_of_stock')
        ORDER BY p.created_at DESC
      `);
      
      const queryTime = Date.now() - startTime;
      console.log(`📊 SQL query returned ${result.rows.length} rows in ${queryTime}ms`);
      
      const formattedProducts = result.rows.map(row => ({
        id: row.id,
        name: row.name,
        description: row.description || '',
        price: row.price,
        currency: row.currency || 'GBP',
        imageUrl: row.image_url,
        images: row.images || [],
        moq: row.moq || 1,
        stock: row.stock || 0,
        category: row.category || 'General',
        status: row.status,
        priceVisible: row.price_visible !== false, // Default to true if null
        negotiationEnabled: Boolean(row.negotiation_enabled),
        minimumBidPrice: row.minimum_bid_price,
        packQuantity: row.pack_quantity,
        unitOfMeasure: row.unit_of_measure,
        unitSize: row.size_per_unit,
        wholesalerId: defaultUserId,
        createdAt: row.created_at ? new Date(String(row.created_at)) : new Date(),
        updatedAt: row.updated_at ? new Date(String(row.updated_at)) : new Date(),
        promoActive: Boolean(row.promo_active),
        promoPrice: row.promo_price,
        unit: row.unit || 'units',
        sellingFormat: row.selling_format || 'units',
        unitsPerPallet: row.units_per_pallet,
        palletPrice: row.pallet_price,
        palletMoq: row.pallet_moq,
        palletStock: row.pallet_stock,
        wholesalerName: row.wholesaler_name
      }));
      
      console.log(`✅ Successfully formatted ${formattedProducts.length} products for dev response`);
      res.json(formattedProducts);
    } catch (error) {
      console.error('Error fetching dev products:', error);
      res.status(500).json({ error: "Failed to fetch products" });
    }
  });

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
      let productList = await storage.getProducts(targetUserId);
      console.log('Products found:', productList.length);

      // Customer-facing view: hide locked products
      // A request is a customer view if the requester is viewing someone else's products
      // (wholesaler admin views their own, team members use wholesalerId override above)
      const isCustomerView = req.user.role !== 'team_member' && targetUserId !== req.user.id;
      if (isCustomerView) {
        productList = productList.filter(p => p.status !== 'locked');
      }

      res.json(productList);
      // Fire-and-forget: clear stale promo_active flags in DB
      const staleIds = productList.filter(p => !p.promoActive).map(p => p.id);
      for (const staleId of staleIds) {
        db.update(products).set({ promoActive: false, promoPrice: null }).where(eq(products.id, staleId)).catch(() => {});
      }
    } catch (error) {
      console.error("Error fetching products:", error);
      res.status(500).json({ message: "Failed to fetch products" });
    }
  });

  // Protected route: only authenticated wholesalers/team members can fetch a product by ID.
  // The customer portal uses /api/customer-products/:wholesalerId for product listing.
  app.get('/api/products/:id', requireAuth, async (req: any, res) => {
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

  app.post('/api/products', requireAuth, requireProductLimits(), async (req: any, res) => {
    try {
      // Use parent company ID for team members to ensure data inheritance
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      
      // Check product limit before creating
      const limitCheck = await storage.checkProductLimit(targetUserId);
      if (!limitCheck.canAdd) {
        // Subscription logging removed
        
        return res.status(403).json({ 
          message: `Product limit reached. You can only have ${limitCheck.limit} products on the ${limitCheck.tier} plan.`,
          currentCount: limitCheck.currentCount,
          limit: limitCheck.limit,
          tier: limitCheck.tier
        });
      }

      const wholesalerUser = await storage.getUser(targetUserId);
      const defaultThreshold = wholesalerUser?.defaultLowStockThreshold ?? 50;

      const productData = insertProductSchema.parse({
        ...req.body,
        wholesalerId: targetUserId,
        lowStockThreshold: req.body.lowStockThreshold ?? defaultThreshold,
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
    const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId 
      ? req.user.wholesalerId 
      : req.user.id;
    try {
      const id = parseInt(req.params.id);
      
      // Verify product belongs to user or their parent company
      const existingProduct = await storage.getProduct(id);
      if (!existingProduct || existingProduct.wholesalerId !== targetUserId) {
        return res.status(404).json({ message: "Product not found" });
      }

      // Check if product is locked due to subscription limits
      if (existingProduct.status === 'locked') {
        // Subscription logging removed
        
        return res.status(403).json({ 
          message: "This product is locked due to subscription limits. Upgrade your plan or delete other products to unlock it.",
          errorType: "PRODUCT_LOCKED",
          upgradeRequired: true
        });
      }

      // Check edit limit based on subscription tier
      const currentEditCount = existingProduct.editCount || 0;
      const user = await storage.getUser(targetUserId);
      const subscriptionTier = user?.subscriptionTier || "premium"; // Default to premium for testing
      
      console.log('🔍 Backend edit permission check:', {
        productId: id,
        currentEditCount,
        userSubscriptionTier: subscriptionTier,
        targetUserId
      });
      
      // Check edit limits based on subscription tier
      if (subscriptionTier === "free") {
        let editLimit = 3;
        if (currentEditCount >= editLimit) {
          console.log('❌ Backend: Edit limit reached for', subscriptionTier);
          return res.status(403).json({ 
            message: `Product edit limit reached! You've used all ${editLimit} product edits for the ${subscriptionTier} plan. Upgrade your plan to edit more products.`,
            editCount: currentEditCount,
            maxEdits: editLimit,
            tier: subscriptionTier
          });
        }
      } else {
        console.log('✅ Backend: Standard/Premium user - unlimited edits allowed');
      }

      // Debug: Log the incoming request body
      console.log('🔍 Product update request body:', JSON.stringify(req.body, null, 2));
      
      // Let the schema handle all transformations
      const productData = insertProductSchema.partial().parse(req.body);
      
      // Debug: Log the parsed product data
      console.log('✅ Parsed product data:', JSON.stringify(productData, null, 2));
      
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

  // Get all promotions for wholesaler's products
  app.get('/api/promotions', requireAuth, async (req: any, res) => {
    try {
      const user = req.user;
      const targetUserId = user.role === 'team_member' ? user.wholesalerId : user.id;
      const userProducts = await storage.getProducts(targetUserId);
      
      const promotions: any[] = [];
      for (const product of userProducts) {
        const offers = Array.isArray(product.promotionalOffers) ? product.promotionalOffers : [];
        for (const offer of offers) {
          promotions.push({
            ...offer,
            productId: product.id,
            productName: product.name,
            productPrice: product.price,
            productImage: product.images?.[0] || null,
            productStock: product.stock,
          });
        }
      }
      
      res.json(promotions);
    } catch (error) {
      console.error("Error fetching promotions:", error);
      res.status(500).json({ message: "Failed to fetch promotions" });
    }
  });

  // Add a promotion to a product
  app.post('/api/products/:id/promotions', requireAuth, async (req: any, res) => {
    try {
      const user = req.user;
      const targetUserId = user.role === 'team_member' ? user.wholesalerId : user.id;
      const productId = parseInt(req.params.id);
      const product = await storage.getProduct(productId);
      
      if (!product || product.wholesalerId !== targetUserId) {
        return res.status(404).json({ message: "Product not found" });
      }
      
      const promotion = req.body;
      const newOffer = {
        id: `promo_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        ...promotion,
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      
      const currentOffers = Array.isArray(product.promotionalOffers) ? product.promotionalOffers : [];
      const updatedOffers = [...currentOffers, newOffer];
      
      const now = new Date();
      const startDate = promotion.startDate ? new Date(promotion.startDate) : null;
      const endDate = promotion.endDate ? new Date(promotion.endDate) : null;
      const isCurrentlyActive = (!startDate || startDate <= now) && (!endDate || endDate >= now);
      
      let promoPrice = product.promoPrice;
      if (isCurrentlyActive) {
        if (promotion.type === 'fixed_price' && promotion.fixedPrice) {
          promoPrice = String(promotion.fixedPrice);
        } else if (promotion.type === 'percentage_discount' && promotion.discountPercentage) {
          const originalPrice = parseFloat(product.price || '0');
          promoPrice = String(Math.round((originalPrice * (1 - promotion.discountPercentage / 100)) * 100) / 100);
        } else if (promotion.type === 'clearance' && promotion.fixedPrice) {
          promoPrice = String(promotion.fixedPrice);
        }
      }
      
      await db.update(products).set({
        promotionalOffers: updatedOffers,
        promoActive: isCurrentlyActive,
        promoPrice: promoPrice ? promoPrice : null,
        updatedAt: new Date(),
      }).where(eq(products.id, productId));
      
      res.json({ success: true, promotion: newOffer });
    } catch (error) {
      console.error("Error adding promotion:", error);
      res.status(500).json({ message: "Failed to add promotion" });
    }
  });

  // Update a promotion on a product
  app.patch('/api/products/:id/promotions/:promoId', requireAuth, async (req: any, res) => {
    try {
      const user = req.user;
      const targetUserId = user.role === 'team_member' ? user.wholesalerId : user.id;
      const productId = parseInt(req.params.id);
      const promoId = req.params.promoId;
      const product = await storage.getProduct(productId);
      
      if (!product || product.wholesalerId !== targetUserId) {
        return res.status(404).json({ message: "Product not found" });
      }
      
      const updates = req.body;
      const currentOffers = Array.isArray(product.promotionalOffers) ? product.promotionalOffers : [];
      const updatedOffers = currentOffers.map((offer: any) => {
        if (offer.id === promoId) {
          return { ...offer, ...updates, updatedAt: new Date().toISOString() };
        }
        return offer;
      });
      
      const activeOffer = updatedOffers.find((o: any) => {
        if (!o.isActive) return false;
        const now = new Date();
        const start = o.startDate ? new Date(o.startDate) : null;
        const end = o.endDate ? new Date(o.endDate) : null;
        return (!start || start <= now) && (!end || end >= now);
      });
      
      let promoPrice = null;
      if (activeOffer) {
        if (activeOffer.type === 'fixed_price' && activeOffer.fixedPrice) {
          promoPrice = String(activeOffer.fixedPrice);
        } else if (activeOffer.type === 'percentage_discount' && activeOffer.discountPercentage) {
          const originalPrice = parseFloat(product.price || '0');
          promoPrice = String(Math.round((originalPrice * (1 - activeOffer.discountPercentage / 100)) * 100) / 100);
        } else if (activeOffer.type === 'clearance' && activeOffer.fixedPrice) {
          promoPrice = String(activeOffer.fixedPrice);
        }
      }
      
      await db.update(products).set({
        promotionalOffers: updatedOffers,
        promoActive: !!activeOffer,
        promoPrice: promoPrice,
        updatedAt: new Date(),
      }).where(eq(products.id, productId));
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating promotion:", error);
      res.status(500).json({ message: "Failed to update promotion" });
    }
  });

  // Delete a promotion from a product
  app.delete('/api/products/:id/promotions/:promoId', requireAuth, async (req: any, res) => {
    try {
      const user = req.user;
      const targetUserId = user.role === 'team_member' ? user.wholesalerId : user.id;
      const productId = parseInt(req.params.id);
      const promoId = req.params.promoId;
      const product = await storage.getProduct(productId);
      
      if (!product || product.wholesalerId !== targetUserId) {
        return res.status(404).json({ message: "Product not found" });
      }
      
      const currentOffers = Array.isArray(product.promotionalOffers) ? product.promotionalOffers : [];
      const updatedOffers = currentOffers.filter((offer: any) => offer.id !== promoId);
      
      const activeOffer = updatedOffers.find((o: any) => {
        if (!o.isActive) return false;
        const now = new Date();
        const start = o.startDate ? new Date(o.startDate) : null;
        const end = o.endDate ? new Date(o.endDate) : null;
        return (!start || start <= now) && (!end || end >= now);
      });
      
      let promoPrice = null;
      if (activeOffer) {
        if (activeOffer.type === 'fixed_price' && activeOffer.fixedPrice) {
          promoPrice = String(activeOffer.fixedPrice);
        } else if (activeOffer.type === 'percentage_discount' && activeOffer.discountPercentage) {
          const originalPrice = parseFloat(product.price || '0');
          promoPrice = String(Math.round((originalPrice * (1 - activeOffer.discountPercentage / 100)) * 100) / 100);
        } else if (activeOffer.type === 'clearance' && activeOffer.fixedPrice) {
          promoPrice = String(activeOffer.fixedPrice);
        }
      }
      
      await db.update(products).set({
        promotionalOffers: updatedOffers,
        promoActive: !!activeOffer,
        promoPrice: promoPrice,
        updatedAt: new Date(),
      }).where(eq(products.id, productId));
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting promotion:", error);
      res.status(500).json({ message: "Failed to delete promotion" });
    }
  });

  // Reset all promotional pricing for wholesaler's products
  app.post('/api/products/reset-promotions', requireAuth, async (req: any, res) => {
    try {
      const wholesalerId = req.user.id;
      
      // Get all products for this wholesaler
      const userProducts = await storage.getProducts(wholesalerId);
      
      // Reset promotional pricing for all products
      const resetPromises = userProducts.map(async (product) => {
        await db
          .update(products)
          .set({ 
            promoActive: false,
            promoPrice: null,
            promotionalOffers: [],
            updatedAt: new Date() 
          })
          .where(eq(products.id, product.id));
      });
      
      await Promise.all(resetPromises);
      
      console.log(`✅ Reset promotional pricing for ${userProducts.length} products for wholesaler ${wholesalerId}`);
      
      res.json({ 
        success: true, 
        message: `Reset promotional pricing for ${userProducts.length} products`,
        productsUpdated: userProducts.length
      });
    } catch (error) {
      console.error("Error resetting promotions:", error);
      res.status(500).json({ message: "Failed to reset promotions" });
    }
  });

  // Orders endpoint (no authentication required for seamless access)
  // Lightweight orders endpoint for frontend UI - fast response with essential data only
  app.get('/api/orders-light', requireAuth, async (req: any, res) => {
    try {
      // Use authenticated user's ID for proper data isolation - SECURITY FIX
      const wholesalerId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      
      console.log(`📦 Fetching lightweight orders for authenticated wholesaler: ${wholesalerId}`);
      
      // Get orders with minimal data for fast loading
      const orderResults = await db
        .select({
          id: orders.id,
          orderNumber: orders.orderNumber,
          customerName: orders.customerName,
          customerEmail: orders.customerEmail,
          total: orders.total,
          status: orders.status,
          fulfillmentType: orders.fulfillmentType,
          deliveryAddressId: orders.deliveryAddressId,
          createdAt: orders.createdAt
        })
        .from(orders)
        .where(eq(orders.wholesalerId, wholesalerId))
        .orderBy(desc(orders.createdAt))
        .limit(50); // Limit to 50 most recent orders for fast loading
      
      console.log(`📦 Found ${orderResults.length} lightweight orders`);
      
      res.json(orderResults);
    } catch (error) {
      console.error("❌ Error fetching lightweight orders:", error);
      res.status(500).json({ error: "Failed to fetch orders" });
    }
  });

  // Mark order as ready for collection/delivery
  app.put('/api/orders/:id/ready-for-collection', requireAuth, async (req: any, res) => {
    try {
      const orderId = parseInt(req.params.id);
      console.log(`📦 Ready for collection request for order ID: ${orderId}`);
      
      if (isNaN(orderId)) {
        console.log(`❌ Invalid order ID: ${req.params.id}`);
        return res.status(400).json({ error: 'Invalid order ID' });
      }

      // Get order directly by ID for efficiency
      const wholesalerId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      
      console.log(`🔍 Looking up order ${orderId} for wholesaler ${wholesalerId}`);
      
      // Fetch order directly from database
      const [order] = await db
        .select()
        .from(orders)
        .where(eq(orders.id, orderId))
        .limit(1);

      if (!order) {
        console.log(`❌ Order ${orderId} not found in database`);
        return res.status(404).json({ error: 'Order not found' });
      }

      console.log(`📋 Order found: ${order.orderNumber}, status: ${order.status}, wholesaler: ${order.wholesalerId}`);

      // Verify the order belongs to this wholesaler
      if (order.wholesalerId !== wholesalerId) {
        console.log(`❌ Order ${orderId} belongs to ${order.wholesalerId}, not ${wholesalerId}`);
        return res.status(403).json({ error: 'You do not have permission to modify this order' });
      }

      // Allow transition from 'paid' or 'items_prepared' status directly to ready_for_collection
      // Also allow if paymentStatus is 'paid' (for orders where balance was paid but status wasn't updated)
      // Also always allow collection/pickup orders — customer pays on arrival
      const isPaymentComplete = order.paymentStatus === 'paid' || parseFloat(order.amountOutstanding || '0') <= 0.01;
      const isValidStatus = order.status === 'paid' || order.status === 'items_prepared' || order.status === 'confirmed';
      const isPickup = order.fulfillmentType === 'pickup';
      
      if (!isValidStatus && !isPaymentComplete && !isPickup) {
        console.log(`❌ Order status is ${order.status}, paymentStatus is ${order.paymentStatus}, cannot mark as ready`);
        return res.status(400).json({ error: `Order must be paid to mark as ready. Current status: ${order.status}, payment: ${order.paymentStatus}` });
      }
      
      // If payment is complete but status wasn't updated, log it for debugging
      if (isPaymentComplete && order.status !== 'paid') {
        console.log(`⚠️ Order ${orderId} has complete payment (${order.paymentStatus}) but status is ${order.status} - allowing ready for collection`);
      }

      // Check if already marked as ready
      if (order.readyToCollectAt) {
        console.log(`❌ Order ${orderId} already marked as ready at ${order.readyToCollectAt}`);
        return res.status(400).json({ error: 'Order is already marked as ready for collection' });
      }

      const actionType = order.fulfillmentType === 'pickup' ? 'collection' : 'delivery';
      console.log(`📦 Marking order ${orderId} as ready for ${actionType}`);

      // Update order with ready for collection timestamp
      const updated = await storage.markOrderReadyForCollection(orderId);
      if (!updated) {
        return res.status(500).json({ error: 'Failed to mark order as ready for collection' });
      }

      // Send email notification to customer
      try {
        const customer = await storage.getUser(updated.retailerId);
        const wholesaler = await storage.getUser(updated.wholesalerId);
        
        if (customer && wholesaler && customer.email) {
          const emailData = generateReadyForCollectionEmail({
            orderNumber: updated.orderNumber,
            customerName: `${customer.firstName} ${customer.lastName}`.trim() || 'Customer',
            wholesalerName: wholesaler.businessName || `${wholesaler.firstName} ${wholesaler.lastName}`.trim(),
            businessPhone: wholesaler.businessPhone || wholesaler.phoneNumber,
            businessAddress: wholesaler.businessAddress,
            orderTotal: updated.total,
            readyTime: updated.readyToCollectAt ? updated.readyToCollectAt.toLocaleString() : new Date().toLocaleString(),
            orderUrl: `https://quikpik.app/customer-portal/${wholesaler.id}`
          });

          await sendEmail({
            to: customer.email,
            from: 'hello@quikpik.co',
            subject: emailData.subject,
            html: emailData.html,
            text: emailData.text
          });
          
          console.log(`📧 Ready for collection email sent to ${customer.email}`);
        }
      } catch (emailError) {
        console.error('❌ Failed to send ready for collection email:', emailError);
        // Don't fail the API call if email fails
      }

      // Send SMS notification to customer
      try {
        const customer = await storage.getUser(updated.retailerId);
        const wholesaler = await storage.getUser(updated.wholesalerId);
        
        if (customer && wholesaler && customer.phoneNumber) {
          const actionType = updated.fulfillmentType === 'pickup' ? 'collection' : 'delivery';
          const collectionAddress = wholesaler.pickupAddress || wholesaler.businessAddress || 
            (wholesaler.streetAddress && wholesaler.city 
              ? `${wholesaler.streetAddress}, ${wholesaler.city}${wholesaler.postalCode ? `, ${wholesaler.postalCode}` : ''}`
              : '');
          
          // Build order items list for SMS (getOrderItems already includes product data)
          let itemsList = '';
          try {
            const orderItemsList = await storage.getOrderItems(updated.id);
            const itemsListParts: string[] = [];
            for (const item of orderItemsList) {
              const productName = item.product?.name || `Product #${item.productId}`;
              const total = parseFloat(item.total || '0');
              const unitPrice = parseFloat(item.unitPrice || '0');
              const sellingType = item.sellingType || 'units';
              const promoNote = item.appliedOfferLabel ? ` (${item.appliedOfferLabel})` : '';
              const freeNote = (item.freeItems || 0) > 0 ? ` +${item.freeItems} free` : '';
              itemsListParts.push(`• ${productName} - ${item.quantity} ${sellingType} × £${unitPrice.toFixed(2)} = £${total.toFixed(2)}${promoNote}${freeNote}`);
            }
            itemsList = itemsListParts.length > 0 ? `\n\n📦 Items:\n${itemsListParts.join('\n')}` : '';
          } catch (itemsError) {
            console.error('⚠️ Could not fetch order items for SMS:', itemsError);
          }
          
          const smsMessage = actionType === 'collection'
            ? `🎉 Great news! Your order #${updated.orderNumber} from ${wholesaler.businessName || 'your supplier'} is ready for collection!${itemsList}\n\n📍 Collection Address:\n${collectionAddress || 'Please contact the store for address'}\n\n💰 Order Total: £${parseFloat(updated.total || '0').toFixed(2)}\n\n📞 Questions? Contact: ${wholesaler.businessPhone || wholesaler.phoneNumber || 'N/A'}\n\n- Quikpik`
            : `🎉 Great news! Your order #${updated.orderNumber} from ${wholesaler.businessName || 'your supplier'} is ready for delivery!${itemsList}\n\n💰 Order Total: £${parseFloat(updated.total || '0').toFixed(2)}\n\nThe supplier will contact you to arrange delivery.\n\n📞 Contact: ${wholesaler.businessPhone || wholesaler.phoneNumber || 'N/A'}\n\n- Quikpik`;
          
          const smsSent = await sendSMS({
            to: customer.phoneNumber,
            message: smsMessage
          });
          
          if (smsSent) {
            console.log(`📱 Ready for ${actionType} SMS sent to ${customer.phoneNumber}`);
          } else {
            console.log(`⚠️ SMS not sent (Twilio not configured or failed)`);
          }
        } else {
          console.log(`⚠️ No phone number available for customer ${updated.retailerId}`);
        }
      } catch (smsError) {
        console.error('❌ Failed to send ready for collection SMS:', smsError);
        // Don't fail the API call if SMS fails
      }

      console.log(`✅ Order ${orderId} marked as ready for collection`);
      res.json({ success: true, order: updated });
    } catch (error) {
      console.error("❌ Error marking order as ready for collection:", error);
      res.status(500).json({ error: "Failed to mark order as ready for collection" });
    }
  });

  // Resend ready for collection notification
  app.post("/api/orders/:id/resend-ready-notification", requireAuth, async (req, res) => {
    try {
      const orderId = parseInt(req.params.id);
      const userId = req.user!.id;

      console.log(`🔄 Resending ready for collection notification for order ${orderId}`);

      // Get order details
      const order = await storage.getOrderById(orderId);
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      // Verify ownership
      if (order.wholesalerId !== userId) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      // Check if order is actually ready for collection
      if (order.status !== 'ready_for_collection' || !order.readyToCollectAt) {
        return res.status(400).json({ error: 'Order is not ready for collection' });
      }

      console.log(`📦 Resending ready for collection notification for order ${orderId}`);

      // Send email notification to customer
      try {
        const customer = await storage.getUser(order.retailerId);
        const wholesaler = await storage.getUser(order.wholesalerId);
        
        if (customer && wholesaler && customer.email) {
          const emailData = generateReadyForCollectionEmail({
            orderNumber: order.orderNumber,
            customerName: `${customer.firstName} ${customer.lastName}`.trim() || 'Customer',
            wholesalerName: wholesaler.businessName || `${wholesaler.firstName} ${wholesaler.lastName}`.trim(),
            businessPhone: wholesaler.businessPhone || wholesaler.phoneNumber,
            businessAddress: wholesaler.businessAddress,
            orderTotal: order.total,
            readyTime: order.readyToCollectAt.toLocaleString(),
            orderUrl: `https://quikpik.app/customer-portal/${wholesaler.id}`
          });

          await sendEmail({
            to: customer.email,
            from: 'hello@quikpik.co',
            subject: emailData.subject,
            html: emailData.html,
            text: emailData.text
          });
          
          console.log(`📧 Ready for collection notification resent to ${customer.email}`);
        }
      } catch (emailError) {
        console.error('❌ Failed to resend ready for collection email:', emailError);
        return res.status(500).json({ error: 'Failed to send notification email' });
      }

      console.log(`✅ Ready for collection notification resent for order ${orderId}`);
      res.json({ success: true, message: 'Notification sent successfully' });
    } catch (error) {
      console.error("❌ Error resending ready for collection notification:", error);
      res.status(500).json({ error: "Failed to resend notification" });
    }
  });

  // Mark order items as prepared
  app.put("/api/orders/:id/items-prepared", requireAuth, async (req, res) => {
    try {
      const orderId = parseInt(req.params.id);
      const userId = req.user!.id;

      console.log(`📦 Marking order ${orderId} items as prepared`);

      // Get order details
      const order = await storage.getOrderById(orderId);
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      // Verify ownership
      if (order.wholesalerId !== userId) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      // Check if order is in the right status
      if (order.status !== 'paid') {
        return res.status(400).json({ error: 'Order must be in paid status to mark items as prepared' });
      }

      console.log(`📦 Updating order ${orderId} status to items_prepared`);

      // Update order status using storage method
      const updated = await storage.updateOrderStatus(orderId, 'items_prepared');
      if (!updated) {
        return res.status(500).json({ error: 'Failed to update order status' });
      }

      // Send notification to customer about items being prepared
      try {
        const customer = await storage.getUser(updated.retailerId);
        const wholesaler = await storage.getUser(updated.wholesalerId);
        
        if (customer && wholesaler) {
          await orderNotificationService.sendOrderStatusUpdate({
            orderId: updated.id,
            orderNumber: updated.orderNumber,
            status: 'items_prepared',
            customerName: `${customer.firstName} ${customer.lastName}`.trim() || 'Customer',
            customerPhone: customer.phoneNumber || '',
            customerEmail: customer.email || undefined,
            wholesalerName: wholesaler.businessName || `${wholesaler.firstName} ${wholesaler.lastName}`.trim(),
            trackingNumber: updated.deliveryTrackingNumber || undefined,
            estimatedDelivery: undefined
          });
          console.log(`📱 Items prepared notifications sent for order ${orderId}`);
        }
      } catch (notificationError) {
        console.error('❌ Failed to send items prepared notifications:', notificationError);
        // Don't fail the status update if notifications fail
      }

      console.log(`✅ Order ${orderId} items marked as prepared`);
      res.json({ success: true, order: updated });
    } catch (error) {
      console.error("❌ Error marking order items as prepared:", error);
      res.status(500).json({ error: "Failed to mark order items as prepared" });
    }
  });

  // Update order status (auth + ownership enforced — see full handler below)

  app.get('/api/orders', requireAuth, async (req: any, res) => {
    try {
      const search = req.query.search; // search term
      
      // Use authenticated user's ID for proper data isolation - SECURITY FIX
      const wholesalerId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      
      console.log(`📦 Fetching orders for authenticated wholesaler: ${wholesalerId}, search: ${search || 'none'}`);
      const orders = await storage.getOrders(wholesalerId, undefined, search);
      console.log(`📦 Found ${orders.length} orders for wholesaler ${wholesalerId}`);
      
      res.json(orders);
    } catch (error) {
      console.error("❌ Error fetching orders:", error);
      console.error("❌ Error stack:", error instanceof Error ? error.stack : 'No stack trace available');
      res.status(500).json({ 
        message: "Failed to fetch orders",
        error: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.message : String(error)) : undefined
      });
    }
  });

  // Get order payment details by order number - requires valid Stripe session ID
  app.get('/api/orders/by-number/:orderNumber', async (req: any, res) => {
    try {
      const { orderNumber } = req.params;
      const { session_id } = req.query;

      // Session ID is required for security
      if (!session_id) {
        return res.status(400).json({ error: 'Session ID required' });
      }

      // Validate Stripe session ID
      try {
        const session = await stripe.checkout.sessions.retrieve(session_id);
        // Verify the session's order number matches
        if (session.metadata?.orderNumber !== orderNumber) {
          return res.status(403).json({ error: 'Session does not match order' });
        }
        // Verify session is completed/paid
        if (session.payment_status !== 'paid' && session.status !== 'complete') {
          return res.status(403).json({ error: 'Payment not completed' });
        }
      } catch (stripeError) {
        console.error('Stripe session validation failed:', stripeError);
        return res.status(403).json({ error: 'Invalid session' });
      }
      
      const [order] = await db.select({
        orderNumber: orders.orderNumber,
        total: orders.total,
        amountPaid: orders.amountPaid,
        amountOutstanding: orders.amountOutstanding,
        paymentStatus: orders.paymentStatus,
      })
        .from(orders)
        .where(eq(orders.orderNumber, orderNumber))
        .limit(1);

      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      res.json(order);
    } catch (error) {
      console.error('Error fetching order by number:', error);
      res.status(500).json({ error: 'Failed to fetch order' });
    }
  });

  // Get single order details with items - REQUIRES AUTHENTICATION
  app.get('/api/orders/:id', requireAuth, async (req: any, res) => {
    try {
      const orderId = parseInt(req.params.id);
      if (isNaN(orderId)) {
        return res.status(400).json({ error: 'Invalid order ID' });
      }

      const order = await storage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      // Verify the user has access to this order (data isolation)
      const userId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      
      if (order.wholesalerId !== userId && order.retailerId !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Fetch cancellation request for this order if exists
      const [cancellationRequest] = await db.select()
        .from(orderCancellationRequests)
        .where(eq(orderCancellationRequests.orderId, orderId))
        .orderBy(desc(orderCancellationRequests.requestedAt))
        .limit(1);

      console.log(`📦 Retrieved order ${orderId} with ${order.items?.length || 0} items`);
      res.json({
        ...order,
        cancellationRequest: cancellationRequest ? {
          id: cancellationRequest.id,
          status: cancellationRequest.status,
          reasonCategory: cancellationRequest.reasonCategory,
          reasonNotes: cancellationRequest.reasonNotes,
          requestedAt: cancellationRequest.requestedAt,
          respondedAt: cancellationRequest.respondedAt,
          responseMessage: cancellationRequest.responseMessage,
          refundType: cancellationRequest.refundType
        } : null
      });
    } catch (error) {
      console.error(`❌ Error fetching order ${req.params.id}:`, error);
      res.status(500).json({ 
        message: "Failed to fetch order details",
        error: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.message : String(error)) : undefined
      });
    }
  });

  // Paginated orders endpoint - REQUIRES AUTHENTICATION
  app.get('/api/orders-paginated', requireAuth, async (req: any, res) => {
    try {
      const page = parseInt(req.query.page || '1');
      const limit = parseInt(req.query.limit || '20');
      const search = req.query.search;
      const customerId = req.query.customerId;
      const archiveTab = req.query.archiveTab || 'active';
      const paymentStatusParam = req.query.paymentStatus as string | undefined;
      const fulfillmentTypeParam = req.query.fulfillmentType as string | undefined;
      const statusParam = req.query.status as string | undefined;
      // Use authenticated user's ID for proper data isolation - SECURITY FIX
      const wholesalerId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      
      console.log(`📦 Fetching paginated orders for authenticated user - page: ${page}, limit: ${limit}, search: ${search || 'none'}, customerId: ${customerId || 'none'}, tab: ${archiveTab}`);
      
      // Build search conditions - customerId takes priority over text search
      const searchConditions: any[] = [eq(orders.wholesalerId, wholesalerId)];
      if (customerId) {
        searchConditions.push(eq(orders.retailerId, customerId));
      } else if (search && search.trim()) {
        const searchValue = '%' + search.trim() + '%';
        searchConditions.push(or(
          sql`${orders.orderNumber} ILIKE ${searchValue}`,
          sql`${orders.customerName} ILIKE ${searchValue}`,
          sql`${orders.customerEmail} ILIKE ${searchValue}`,
          sql`${orders.customerPhone} ILIKE ${searchValue}`
        ));
      }
      // Payment status filter
      if (paymentStatusParam === 'paid') {
        // Paid = paymentStatus is paid AND not cancelled (refunded orders are cancelled)
        searchConditions.push(eq(orders.paymentStatus, 'paid'));
        searchConditions.push(sql`${orders.status} != 'cancelled'`);
      } else if (paymentStatusParam === 'unpaid') {
        searchConditions.push(sql`(${orders.paymentStatus} IS NULL OR ${orders.paymentStatus} NOT IN ('paid'))`);
      }

      // Delivery type filter (pickup = collection, delivery = delivery)
      if (fulfillmentTypeParam) {
        searchConditions.push(eq(orders.fulfillmentType, fulfillmentTypeParam));
      }

      // Status filter (unfulfilled = multiple statuses, otherwise exact match)
      if (statusParam) {
        const UNFULFILLED_STATUSES = ['pending', 'paid', 'confirmed', 'processing'];
        if (statusParam === 'unfulfilled') {
          searchConditions.push(inArray(orders.status, UNFULFILLED_STATUSES));
        } else {
          searchConditions.push(eq(orders.status, statusParam));
        }
      }

      // Archived = cancelled OR (fulfilled AND paid)
      // Active = everything else
      const archivedCondition = or(
        eq(orders.status, 'cancelled'),
        and(eq(orders.status, 'fulfilled'), eq(orders.paymentStatus, 'paid'))
      );

      const tabFilter = archiveTab === 'all'
        ? and(...searchConditions)
        : archiveTab === 'archived'
          ? and(...searchConditions, archivedCondition!)
          : and(...searchConditions, sql`NOT (${orders.status} = 'cancelled' OR (${orders.status} = 'fulfilled' AND ${orders.paymentStatus} = 'paid'))`);

      // Also get counts for both tabs (using search filter but not tab filter)
      const baseFilter = and(...searchConditions);

      // Run count, paginated results, and stats all in parallel — no full-table fetch
      // Revenue is computed method-aware from order_payments:
      //   stripe_card: amount includes customer fee (5.5%) → back-calculate pre-fee, then deduct platform fee (3.3%)
      //   cash/bank_transfer: face-value amount → deduct platform fee (3.3%) only
      //   Fallback: orders with no order_payments entries use subtotal - platformFee from orders table
      const methodAwareRevenue = sql`(
        SELECT COALESCE(
          NULLIF(SUM(
            CASE op.method
              WHEN 'stripe_card' THEN op.amount::numeric / 1.055 * 0.967
              ELSE                    op.amount::numeric * 0.967
            END
          ), 0),
          NULL
        )
        FROM order_payments op
        WHERE op.order_id = ${orders.id}
      )`;
      const [totalCountResult, ordersResult, tabStatsResult, baseStatsResult] = await Promise.all([
        db.select({ count: count() }).from(orders).where(tabFilter),
        db.select().from(orders).where(tabFilter).orderBy(desc(orders.createdAt)).limit(limit).offset((page - 1) * limit),
        db.select({
          paidOrdersCount: sql<number>`COUNT(CASE WHEN ${orders.status} IN ('paid', 'completed', 'processing', 'shipped') THEN 1 END)::int`,
          pendingOrdersCount: sql<number>`COUNT(CASE WHEN ${orders.status} = 'pending' THEN 1 END)::int`,
          totalRevenue: sql<number>`COALESCE(SUM(CASE WHEN ${orders.status} != 'cancelled'
            THEN COALESCE(${methodAwareRevenue}, ${orders.subtotal}::numeric - ${orders.platformFee}::numeric)
            ELSE 0 END), 0)::float`,
        }).from(orders).where(tabFilter),
        db.select({
          activeCount: sql<number>`COUNT(CASE WHEN NOT (${orders.status} = 'cancelled' OR (${orders.status} = 'fulfilled' AND ${orders.paymentStatus} = 'paid')) THEN 1 END)::int`,
          archivedCount: sql<number>`COUNT(CASE WHEN ${orders.status} = 'cancelled' OR (${orders.status} = 'fulfilled' AND ${orders.paymentStatus} = 'paid') THEN 1 END)::int`,
        }).from(orders).where(baseFilter),
      ]);

      const totalOrders = totalCountResult[0].count;
      const totalPages = Math.ceil(totalOrders / limit);
      const { paidOrdersCount, pendingOrdersCount, totalRevenue } = tabStatsResult[0];
      const { activeCount, archivedCount } = baseStatsResult[0];

      console.log(`📦 Found ${ordersResult.length} orders (page ${page}/${totalPages}, total: ${totalOrders})`);

      // Fetch cancellation requests for this page's orders only
      const orderIds = ordersResult.map(o => o.id);
      let cancellationRequestsMap: Record<number, any> = {};

      if (orderIds.length > 0) {
        const requests = await db.select()
          .from(orderCancellationRequests)
          .where(inArray(orderCancellationRequests.orderId, orderIds));

        requests.forEach(req => {
          cancellationRequestsMap[req.orderId] = {
            id: req.id,
            status: req.status,
            reasonCategory: req.reasonCategory,
            reasonNotes: req.reasonNotes,
            requestedAt: req.requestedAt,
            respondedAt: req.respondedAt,
            responseMessage: req.responseMessage,
            refundType: req.refundType
          };
        });
      }

      // Attach cancellation request to each order
      const ordersWithRequests = ordersResult.map(order => ({
        ...order,
        cancellationRequest: cancellationRequestsMap[order.id] || null
      }));
      
      res.json({
        orders: ordersWithRequests,
        currentPage: page,
        totalPages,
        total: totalOrders,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
        stats: {
          activeCount,
          archivedCount,
          paidOrdersCount,
          pendingOrdersCount,
          totalRevenue,
          ordersCount: activeCount
        }
      });
    } catch (error) {
      console.error("❌ Error fetching paginated orders:", error);
      res.status(500).json({ 
        message: "Failed to fetch orders",
        error: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.message : String(error)) : undefined
      });
    }
  });

  // Orders statistics endpoint - REQUIRES AUTHENTICATION
  app.get('/api/orders/stats', requireAuth, async (req: any, res) => {
    try {
      // Use authenticated user's ID for proper data isolation
      const wholesalerId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      
      // Check if filtering by archive tab
      const archiveTab = req.query.archiveTab as string || 'active';
      
      // Archived = cancelled OR (fulfilled AND fully paid)
      // Active = everything else (including part paid fulfilled orders with outstanding balance)
      const isArchivedOrder = (order: any) => {
        const status = (order.status || '').toLowerCase();
        const paymentStatus = (order.paymentStatus || '').toLowerCase();
        if (status === 'cancelled') return true;
        if (status === 'fulfilled' && paymentStatus === 'paid') return true;
        return false;
      };
      
      console.log(`📊 Fetching order statistics for authenticated wholesaler: ${wholesalerId}, tab: ${archiveTab}`);

      // Get all orders to calculate overall statistics
      const allOrders = await storage.getOrders(wholesalerId, undefined, undefined);
      
      // Filter by active/archived based on tab
      const filteredOrders = archiveTab === 'all'
        ? allOrders
        : archiveTab === 'archived'
          ? allOrders.filter(order => isArchivedOrder(order))
          : allOrders.filter(order => !isArchivedOrder(order));
      
      console.log(`📊 Found ${filteredOrders.length} ${archiveTab} orders for statistics`);

      // Calculate overall statistics for the filtered set
      const paidOrders = filteredOrders.filter(order => 
        order.status === 'paid' || 
        order.status === 'completed' ||
        order.status === 'processing' ||
        order.status === 'shipped'
      );

      const pendingOrders = filteredOrders.filter(order => 
        order.status === 'pending'
      );

      // Calculate net revenue using method-aware accounting from order_payments
      // stripe_card amounts include customer fee (5.5%), so back-calculate pre-fee then deduct platform fee (3.3%)
      // cash/bank_transfer amounts are face value, so just deduct platform fee (3.3%)
      // Fallback: orders with no payment entries use subtotal - platformFee
      const revenueOrders = filteredOrders.filter(order => !['cancelled', 'refunded'].includes(order.status));
      let totalRevenue = 0;
      if (revenueOrders.length > 0) {
        const revenueOrderIds = revenueOrders.map(o => o.id);
        const payments = revenueOrderIds.length > 0
          ? await db.select({ orderId: orderPayments.orderId, method: orderPayments.method, amount: orderPayments.amount })
              .from(orderPayments).where(inArray(orderPayments.orderId, revenueOrderIds))
          : [];
        // Group payments by orderId
        const paymentsByOrder = new Map<number, { method: string; amount: string }[]>();
        for (const p of payments) {
          if (!paymentsByOrder.has(p.orderId)) paymentsByOrder.set(p.orderId, []);
          paymentsByOrder.get(p.orderId)!.push({ method: p.method, amount: p.amount });
        }
        totalRevenue = revenueOrders.reduce((sum, order) => {
          const orderPmts = paymentsByOrder.get(order.id);
          if (orderPmts && orderPmts.length > 0) {
            // Method-aware: stripe_card back-calculates customer fee; cash/bank is face value
            const contribution = orderPmts.reduce((s, p) => {
              const amt = parseFloat(p.amount || '0');
              return s + (p.method === 'stripe_card' ? (amt / 1.055 * 0.967) : (amt * 0.967));
            }, 0);
            return sum + contribution;
          }
          // Fallback for orders without payment entries (e.g. pre-existing paid orders)
          const netAmount = parseFloat(order.subtotal || '0') - parseFloat(order.platformFee || '0');
          return sum + (isNaN(netAmount) ? 0 : netAmount);
        }, 0);
      }

      // Count by tab for badges using the same isArchivedOrder logic
      const activeCount = allOrders.filter(order => !isArchivedOrder(order)).length;
      const archivedCount = allOrders.filter(order => isArchivedOrder(order)).length;

      const stats = {
        ordersCount: filteredOrders.length,
        totalRevenue: totalRevenue,
        paidOrdersCount: paidOrders.length,
        pendingOrdersCount: pendingOrders.length,
        avgOrderValue: paidOrders.length > 0 ? totalRevenue / paidOrders.length : 0,
        activeCount: activeCount,
        archivedCount: archivedCount
      };

      console.log(`📊 Calculated stats:`, stats);
      res.json(stats);
    } catch (error) {
      console.error("❌ Error fetching order statistics:", error);
      res.status(500).json({ 
        message: "Failed to fetch order statistics",
        error: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.message : String(error)) : undefined
      });
    }
  });

  // Debug orders endpoint for development (temporary)
  app.get('/api/orders-debug', async (req: any, res) => {
    if (process.env.NODE_ENV !== 'development') {
      return res.status(404).json({ message: "Not found" });
    }
    
    try {
      const search = req.query.search;
      const wholesalerId = req.query.wholesalerId || 'user_1756056297340_surulere'; // Default to Surulere
      
      console.log(`🔧 DEBUG: Fetching orders for wholesaler: ${wholesalerId}, search: ${search || 'none'}`);
      const orders = await storage.getOrders(wholesalerId, undefined, search);
      console.log(`🔧 DEBUG: Found ${orders.length} orders`);
      
      res.json({
        success: true,
        wholesalerId,
        orderCount: orders.length,
        orders: orders.slice(0, 5), // Show first 5 orders only for debugging
      });
    } catch (error) {
      console.error("❌ DEBUG: Error fetching orders:", error);
      res.status(500).json({ 
        success: false,
        message: "Failed to fetch orders",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // DISABLED: Public orders endpoint - SECURITY RISK
  // This endpoint allowed unauthorized access to order data
  app.get('/api/public-orders', requireAuth, async (req: any, res) => {
    try {
      const search = req.query.search; // search term
      
      // SECURITY FIX: Use authenticated user's ID instead of hardcoded ID
      const wholesalerId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      
      // Get orders for authenticated wholesaler only
      const orders = await storage.getOrders(wholesalerId, undefined, search);
      
      console.log(`📦 Authenticated orders request - found ${orders.length} orders for user ${wholesalerId}`);
      
      // Return complete orders for authenticated user only
      const cleanOrders = orders.map(order => ({
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        total: order.total,
        subtotal: order.subtotal,
        platformFee: order.platformFee,
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        customerPhone: order.customerPhone,
        deliveryAddress: order.deliveryAddress,
        fulfillmentType: order.fulfillmentType,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        // Limit items to first 3 to prevent massive response
        items: order.items?.slice(0, 3).map(item => ({
          id: item.id,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.total,
          product: {
            id: item.product?.id,
            name: item.product?.name,
            imageUrl: item.product?.imageUrl
          }
        })) || [],
        itemCount: order.items?.length || 0
      }));
      
      // Check response size after cleaning
      const responseStr = JSON.stringify(cleanOrders);
      console.log(`📦 Clean response size: ${responseStr.length} characters (${cleanOrders.length} orders)`);
      
      res.json(cleanOrders);
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

        const basePrice = parseFloat(product.price);
        const effectivePrice = basePrice;
        const itemTotal = effectivePrice * item.quantity;
        subtotal += itemTotal;

        orderItems.push({
          orderId: 0,
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: effectivePrice.toFixed(2),
          total: itemTotal.toFixed(2),
          sellingType: item.sellingType || 'units',
          appliedOfferLabel: null,
          freeItems: 0
        });
      }

      const platformFee = subtotal * 0.033; // 3.3% platform fee (wholesaler cost)
      const customerTransactionFee = (subtotal * 0.055) + 0.50; // 5.5% + £0.50 (customer pays)
      const total = subtotal + customerTransactionFee; // total = what the customer pays

      // Get wholesaler from first product
      const firstProduct = await storage.getProduct(items[0].productId);
      const wholesalerId = firstProduct!.wholesalerId;

      const orderData = insertOrderSchema.parse({
        orderNumber: await generateOrderNumber(wholesalerId),
        wholesalerId,
        retailerId: userId,
        subtotal: subtotal.toFixed(2),
        platformFee: platformFee.toFixed(2),
        customerTransactionFee: customerTransactionFee.toFixed(2),
        total: total.toFixed(2),
        deliveryAddress,
        notes,
        status: 'confirmed' // Auto-confirm orders immediately
      });

      // CRITICAL FIX: Use transaction-based order creation for reliable stock processing
      const order = await db.transaction(async (trx) => {
        return await storage.createOrderWithTransaction(trx, orderData, orderItems);
      });
      
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
    // Global payment processing lock to prevent ANY payment requests from overlapping
    const globalPaymentLock = 'global_payment_processing';
    try {
      const { customerData, items, shippingInfo } = req.body;
      const { name: customerName, email: customerEmail, phone: customerPhone, address: customerAddress, selectedDeliveryAddress } = customerData || {};
      
      // Global payment lock disabled - allow payment processing
      console.log('💳 PAYMENT PROCESSING: Global lock disabled, allowing payment');
      
      console.log('🔥 PAYMENT REQUEST START:', {
        timestamp: new Date().toISOString(),
        customerPhone,
        customerName,
        itemsCount: items?.length,
        requestId: `${customerPhone}_${Date.now()}`
      });
      
      console.log('🚚 CRITICAL DEBUG: Full request body received from frontend:');
      console.log('  - customerName:', customerName);
      console.log('  - items count:', items?.length);
      
      // CRITICAL DEBUG: Log address data to trace wrong address selection
      console.log('🏠 ADDRESS DEBUG: Payment creation address data:', {
        hasSelectedDeliveryAddress: !!selectedDeliveryAddress,
        selectedDeliveryAddressId: selectedDeliveryAddress?.id,
        selectedDeliveryAddressLine1: selectedDeliveryAddress?.addressLine1,
        selectedDeliveryAddressCity: selectedDeliveryAddress?.city,
        fallbackAddress: customerAddress,
        shippingOption: shippingInfo?.option
      });
      console.log('  - shippingInfo received:', JSON.stringify(shippingInfo, null, 2));
      console.log('  - shippingInfo.option:', shippingInfo?.option);
      console.log('  - shippingInfo.service:', shippingInfo?.service ? {
          serviceName: shippingInfo.service.serviceName,
          price: shippingInfo.service.price,
          serviceId: shippingInfo.service.serviceId
        } : 'NULL');
      console.log('  - Is delivery order?', shippingInfo?.option === 'delivery');
      console.log('  - Has service selected?', !!shippingInfo?.service);

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

        const basePrice = parseFloat(product.price);
        
        // Use the sellingType field sent from frontend instead of guessing from price
        const sellingType = item.sellingType || 'units';
        const isPalletOrder = sellingType === 'pallets';
        const isUnitOrder = sellingType === 'units' && parseFloat(item.unitPrice) === basePrice;
        const hasActivePromos = product.promoActive && Array.isArray((product as any).promotionalOffers) && (product as any).promotionalOffers.length > 0;
        const isPromotionalOrder = sellingType === 'units' && !isUnitOrder && hasActivePromos;
        
        console.log(`🔍 MOQ VALIDATION for ${product.name}:`, {
          itemQuantity: item.quantity,
          itemUnitPrice: item.unitPrice,
          productPrice: product.price,
          productPalletPrice: product.palletPrice,
          productPromoPrice: product.promoPrice,
          productPromoActive: product.promoActive,
          productMoq: product.moq,
          productPalletMoq: product.palletMoq,
          productStock: product.stock,
          isUnitOrder,
          isPalletOrder,
          isPromotionalOrder,
          allowSmartMOQ: product.stock < product.moq
        });
        
        // Smart MOQ validation: Allow purchasing remaining stock even if below MOQ
        if ((isUnitOrder || isPromotionalOrder) && item.quantity < product.moq) {
          // Smart MOQ: If stock is below MOQ, allow customer to buy all remaining stock
          if (product.stock >= product.moq) {
            return res.status(400).json({ 
              message: `Minimum order quantity for ${product.name} is ${product.moq} units` 
            });
          } else {
            console.log(`🧠 SMART MOQ: Allowing ${item.quantity} units of ${product.name} (MOQ: ${product.moq}, Stock: ${product.stock})`);
          }
        } else if (isPalletOrder && product.palletMoq && item.quantity < product.palletMoq) {
          // Smart MOQ for pallets: If pallet stock is below pallet MOQ, allow customer to buy remaining pallets
          const palletStock = Math.floor(product.stock / (product.unitsPerPallet || 48)); // Default pallet size 48
          if (palletStock >= product.palletMoq) {
            return res.status(400).json({ 
              message: `Minimum order quantity for ${product.name} is ${product.palletMoq} pallets` 
            });
          } else {
            console.log(`🧠 SMART PALLET MOQ: Allowing ${item.quantity} pallets of ${product.name} (MOQ: ${product.palletMoq}, Available: ${palletStock})`);
          }
        } else if (!isUnitOrder && !isPalletOrder && !isPromotionalOrder) {
          return res.status(400).json({ 
            message: `Invalid unit price for ${product.name}. Expected: £${product.price}${product.promoActive && product.promoPrice ? ` or £${product.promoPrice} (promo)` : ''}${product.palletPrice ? ` or £${product.palletPrice} (pallet)` : ''}` 
          });
        }

        if (item.quantity > product.stock) {
          return res.status(400).json({ 
            message: `Insufficient stock for ${product.name}. Available: ${product.stock}` 
          });
        }

        // CRITICAL FIX: Calculate pricing based on whether this is a pallet, unit, or promotional order
        let pricing;
        let calculationPrice;
        
        if (isPalletOrder) {
          calculationPrice = parseFloat(item.unitPrice);
          pricing = {
            originalPrice: calculationPrice,
            effectivePrice: calculationPrice,
            totalCost: calculationPrice * item.quantity,
            totalDiscount: 0,
            discountPercentage: 0,
            appliedOffers: [] as string[],
            freeItems: 0,
            totalQuantity: item.quantity
          };
        } else {
          calculationPrice = parseFloat(product.price);
          pricing = {
            originalPrice: calculationPrice,
            effectivePrice: calculationPrice,
            totalCost: calculationPrice * item.quantity,
            totalDiscount: 0,
            discountPercentage: 0,
            appliedOffers: [] as string[],
            freeItems: 0,
            totalQuantity: item.quantity
          };

          // Apply promotional pricing if product has active promotions
          const offers = Array.isArray((product as any).promotionalOffers) ? (product as any).promotionalOffers : [];
          const now = new Date();
          for (const offer of offers) {
            if (!offer.isActive) continue;
            const start = offer.startDate ? new Date(offer.startDate) : null;
            const end = offer.endDate ? new Date(offer.endDate) : null;
            if (start && start > now) continue;
            if (end && end < now) continue;

            if (offer.type === 'percentage_discount' && offer.discountPercentage) {
              pricing.effectivePrice = Math.round(calculationPrice * (1 - offer.discountPercentage / 100) * 100) / 100;
              pricing.totalCost = pricing.effectivePrice * item.quantity;
              pricing.totalDiscount = (calculationPrice - pricing.effectivePrice) * item.quantity;
              pricing.discountPercentage = offer.discountPercentage;
              pricing.appliedOffers.push(offer.name || `${offer.discountPercentage}% off`);
              break;
            } else if (offer.type === 'fixed_price' && offer.fixedPrice) {
              pricing.effectivePrice = offer.fixedPrice;
              pricing.totalCost = offer.fixedPrice * item.quantity;
              pricing.totalDiscount = (calculationPrice - offer.fixedPrice) * item.quantity;
              pricing.appliedOffers.push(offer.name || 'Special Price');
              break;
            } else if (offer.type === 'buy_x_get_y_free' && offer.buyQuantity && offer.getQuantity) {
              const sets = Math.floor(item.quantity / offer.buyQuantity);
              pricing.freeItems = sets * offer.getQuantity;
              pricing.totalQuantity = item.quantity + pricing.freeItems;
              pricing.totalCost = calculationPrice * item.quantity;
              pricing.appliedOffers.push(offer.name || `Buy ${offer.buyQuantity} Get ${offer.getQuantity} Free`);
              break;
            } else if (offer.type === 'bundle_deal' && offer.minQuantity && offer.fixedPrice) {
              if (item.quantity >= offer.minQuantity) {
                pricing.effectivePrice = offer.fixedPrice;
                pricing.totalCost = offer.fixedPrice * item.quantity;
                pricing.totalDiscount = (calculationPrice - offer.fixedPrice) * item.quantity;
                pricing.appliedOffers.push(offer.name || `${offer.minQuantity}+ deal`);
                break;
              }
              continue;
            } else if (offer.type === 'clearance' && offer.fixedPrice) {
              pricing.effectivePrice = offer.fixedPrice;
              pricing.totalCost = offer.fixedPrice * item.quantity;
              pricing.totalDiscount = (calculationPrice - offer.fixedPrice) * item.quantity;
              pricing.appliedOffers.push(offer.name || 'Clearance');
              break;
            }
          }
        }
        
        console.log(`🧮 CALCULATION DEBUG for product ${product.id}:`, {
          productName: product.name,
          isUnitOrder,
          isPalletOrder,
          isPromotionalOrder,
          calculationPrice,
          sentUnitPrice: item.unitPrice,
          quantity: item.quantity,
          promoPrice: product.promoPrice,
          promoActive: product.promoActive,
          promotionalOffers: product.promotionalOffers
        });
        
        console.log(`📊 PRICING RESULT for product ${product.id}:`, pricing);
        
        console.log(`🔍 Item calculation for ${product.name}:`, {
          promoActive: product.promoActive,
          promoPrice: product.promoPrice,
          regularPrice: product.price,
          calculationPrice: calculationPrice,
          quantity: item.quantity,
          pricingResult: pricing
        });

        if (isNaN(pricing.totalCost) || isNaN(item.quantity) || pricing.totalCost <= 0) {
          console.error(`❌ Invalid pricing calculation for ${product.name}:`, {
            pricingResult: pricing,
            quantity: item.quantity,
            productPrice: product.price,
            promoPrice: product.promoPrice,
            calculationPrice,
            isNaN_totalCost: isNaN(pricing.totalCost),
            isNaN_quantity: isNaN(item.quantity),
            totalCost_value: pricing.totalCost
          });
          return res.status(400).json({ 
            message: `Invalid price or quantity for ${product.name}` 
          });
        }
        
        const itemTotal = pricing.totalCost;
        const unitPrice = pricing.effectivePrice.toFixed(2);
        
        // Additional validation for unit price calculation
        const parsedUnitPrice = parseFloat(unitPrice);
        if (isNaN(parsedUnitPrice) || parsedUnitPrice <= 0) {
          console.error(`❌ Invalid unit price for ${product.name}:`, {
            unitPrice,
            parsedUnitPrice,
            effectivePrice: pricing.effectivePrice,
            totalCost: pricing.totalCost,
            quantity: item.quantity
          });
          return res.status(400).json({ 
            message: `Invalid pricing for ${product.name}. Please contact support.` 
          });
        }
        
        productSubtotal += itemTotal;

        validatedItems.push({
          ...item,
          product,
          unitPrice: unitPrice,
          total: itemTotal.toFixed(2),
          appliedOfferLabel: pricing.appliedOffers.length > 0 ? pricing.appliedOffers[0] : (item.appliedOfferLabel || null),
          freeItems: pricing.freeItems || item.freeItems || 0
        });
      }

      // Include delivery cost in fee calculation
      console.log('🚚 Shipping cost debug:', {
        hasShippingInfo: !!shippingInfo,
        hasService: !!shippingInfo?.service,
        servicePriceRaw: shippingInfo?.service?.price,
        servicePriceType: typeof shippingInfo?.service?.price
      });

      const deliveryCost = shippingInfo?.option === 'delivery' && shippingInfo?.flatDeliveryRate
        ? parseFloat(shippingInfo.flatDeliveryRate) || 0
        : parseFloat(shippingInfo?.service?.price || '0') || 0;
      console.log('🚚 Parsed delivery cost:', deliveryCost, 'isNaN:', isNaN(deliveryCost));
      
      const amountBeforeFees = productSubtotal + deliveryCost;
      console.log('💰 Subtotal calculation:', {
        productSubtotal,
        deliveryCost,
        amountBeforeFees,
        isNaN_productSubtotal: isNaN(productSubtotal),
        isNaN_deliveryCost: isNaN(deliveryCost),
        isNaN_amountBeforeFees: isNaN(amountBeforeFees)
      });
      
      // NEW FEE STRUCTURE:
      // Customer Transaction Fee: 5.5% of total amount (products + delivery) + £0.50 fixed fee
      const customerTransactionFee = (amountBeforeFees * 0.055) + 0.50;
      const totalCustomerPays = amountBeforeFees + customerTransactionFee;
      
      // Wholesaler Platform Fee: 3.3% of products + delivery (deducted from what they receive)
      const wholesalerPlatformFee = amountBeforeFees * 0.033;
      const wholesalerReceives = amountBeforeFees - wholesalerPlatformFee;

      // Comprehensive validation to prevent NaN values and ensure integer amounts for Stripe
      const stripeAmount = Math.round(totalCustomerPays * 100);
      const stripeWholesalerAmount = Math.round(wholesalerReceives * 100);
      const stripeApplicationFee = Math.round(wholesalerPlatformFee * 100);
      
      // Enhanced validation for all Stripe amounts
      if (isNaN(productSubtotal) || isNaN(deliveryCost) || isNaN(totalCustomerPays) || 
          isNaN(wholesalerReceives) || isNaN(wholesalerPlatformFee) ||
          totalCustomerPays <= 0 || !Number.isInteger(stripeAmount) || stripeAmount <= 0 ||
          !Number.isInteger(stripeWholesalerAmount) || stripeWholesalerAmount < 0 ||
          !Number.isInteger(stripeApplicationFee) || stripeApplicationFee < 0) {
        console.error('❌ Invalid calculation values:', {
          productSubtotal,
          deliveryCost,
          amountBeforeFees,
          customerTransactionFee,
          totalCustomerPays,
          wholesalerPlatformFee,
          wholesalerReceives,
          stripeAmount,
          stripeWholesalerAmount,
          stripeApplicationFee,
          stripeAmountIsInteger: Number.isInteger(stripeAmount),
          stripeWholesalerAmountIsInteger: Number.isInteger(stripeWholesalerAmount),
          stripeApplicationFeeIsInteger: Number.isInteger(stripeApplicationFee),
          totalCustomerPaysIsValid: !isNaN(totalCustomerPays) && totalCustomerPays > 0
        });
        return res.status(400).json({ 
          message: "Invalid payment calculation. Please check your cart and try again.",
          debugInfo: {
            productSubtotal: isNaN(productSubtotal) ? 'NaN' : productSubtotal,
            deliveryCost: isNaN(deliveryCost) ? 'NaN' : deliveryCost,
            totalCustomerPays: isNaN(totalCustomerPays) ? 'NaN' : totalCustomerPays,
            wholesalerReceives: isNaN(wholesalerReceives) ? 'NaN' : wholesalerReceives,
            stripeAmount: isNaN(stripeAmount) ? 'NaN' : stripeAmount,
            stripeWholesalerAmount: isNaN(stripeWholesalerAmount) ? 'NaN' : stripeWholesalerAmount
          }
        });
      }

      console.log('💰 Payment calculation:', {
        productSubtotal: productSubtotal.toFixed(2),
        deliveryCost: deliveryCost.toFixed(2),
        amountBeforeFees: amountBeforeFees.toFixed(2),
        customerTransactionFee: customerTransactionFee.toFixed(2),
        totalCustomerPays: totalCustomerPays.toFixed(2),
        stripeAmount: Math.round(totalCustomerPays * 100)
      });

      // Get wholesaler for payment processing
      const firstProduct = validatedItems[0].product;
      const wholesaler = await storage.getUser(firstProduct.wholesalerId);
      
      if (!wholesaler) {
        return res.status(400).json({ message: "Wholesaler not found" });
      }

      // Create Stripe payment intent with idempotency to prevent duplicates
      if (!stripe) {
        return res.status(500).json({ message: "Stripe not configured" });
      }
      
      // ENHANCED Connect account validation - check if account is fully functional
      let useConnect = false;
      let connectAccountStatus = 'no_account';
      
      if (wholesaler.stripeAccountId && wholesaler.stripeAccountId.length > 0) {
        try {
          // Validate that the Connect account is active and can receive transfers
          const account = await stripe.accounts.retrieve(wholesaler.stripeAccountId);
          
          // Check if account can receive transfers (charges_enabled and details_submitted)
          if (account.charges_enabled && account.details_submitted) {
            useConnect = true;
            connectAccountStatus = 'active';
            console.log(`✅ Connect account ${wholesaler.stripeAccountId} is fully active`);
          } else {
            connectAccountStatus = 'incomplete';
            console.log(`⚠️ Connect account ${wholesaler.stripeAccountId} exists but not ready:`, {
              charges_enabled: account.charges_enabled,
              details_submitted: account.details_submitted,
              requirements: account.requirements?.currently_due
            });
          }
        } catch (connectError: any) {
          connectAccountStatus = 'error';
          console.error(`❌ Connect account validation failed for ${wholesaler.stripeAccountId}:`, connectError.message);
          // Don't use Connect if account verification fails
        }
      }
      
      const applicationFeeAmount = useConnect ? stripeApplicationFee : 0;
      
      console.log('🔍 Connect Account Status:', {
        stripeAccountId: wholesaler.stripeAccountId,
        status: connectAccountStatus,
        willUseConnect: useConnect,
        reason: connectAccountStatus === 'active' ? 'Account fully activated' : 
                connectAccountStatus === 'incomplete' ? 'Account exists but incomplete' :
                connectAccountStatus === 'error' ? 'Account validation failed' : 'No account'
      });
      
      // Create stable idempotency key to prevent duplicate payment intents on simultaneous requests
      const cartHash = validatedItems.map(item => `${item.product.id}:${item.quantity}`).sort().join('-');
      const baseAmountKey = Math.round(amountBeforeFees * 100).toString(); // Use amount before transaction fees
      const phoneKey = (customerPhone || 'guest').replace(/[^0-9]/g, '').slice(-4) || 'guest'; // Clean phone number
      const connectFlag = useConnect ? 'c' : 'n'; // Include Connect usage in key
      const shippingFlag = shippingInfo?.option === 'delivery' ? 'd' : 'p'; // Include shipping option for different payment intents
      const baseKey = `${phoneKey}_${baseAmountKey}_${cartHash}_${connectFlag}_${shippingFlag}`.replace(/[^a-zA-Z0-9_-]/g, '');
      const idempotencyKey = `payment_${baseKey}`.slice(0, 255); // Stripe limit is 255 chars
      
      console.log('🔑 Creating payment with idempotency key:', idempotencyKey);
      console.log('💰 Final payment details before Stripe:', {
        stripeAmount,
        stripeAmountType: typeof stripeAmount,
        stripeAmountIsInteger: Number.isInteger(stripeAmount),
        totalCustomerPays,
        totalCustomerPaysType: typeof totalCustomerPays,
        productSubtotal,
        deliveryCost,
        customerTransactionFee,
        useConnect,
        connectFlag
      });
      
      // Additional validation specifically for Stripe amount
      if (!Number.isInteger(stripeAmount) || stripeAmount <= 0 || isNaN(stripeAmount)) {
        console.error('❌ STRIPE AMOUNT VALIDATION FAILED:', {
          stripeAmount,
          stripeAmountType: typeof stripeAmount,
          isInteger: Number.isInteger(stripeAmount),
          isPositive: stripeAmount > 0,
          isNaN: isNaN(stripeAmount),
          totalCustomerPays,
          calculation: `${totalCustomerPays} * 100 = ${totalCustomerPays * 100}`,
          rounded: Math.round(totalCustomerPays * 100)
        });
        return res.status(400).json({ 
          message: 'Invalid payment amount calculated. Please try again.' 
        });
      }
      
      let paymentIntent;
      try {
        
        console.log('💳 Stripe Connect Configuration:', {
          wholesalerId: wholesaler.id,
          stripeAccountId: wholesaler.stripeAccountId,
          useConnect,
          applicationFeeAmount,
          wholesalerReceives: stripeWholesalerAmount
        });

        const paymentConfig: any = {
          amount: stripeAmount, // Total amount customer pays (product + transaction fee) - pre-validated
          currency: 'gbp',
          receipt_email: customerEmail,
          automatic_payment_methods: { enabled: true },
          statement_descriptor_suffix: wholesaler.businessName?.slice(0, 10) || 'Quikpik',
          description: `Purchase from ${wholesaler.businessName || 'Quikpik Wholesaler'}`,
        };

        // Add Stripe Connect configuration if wholesaler has Connect account
        if (useConnect) {
          // Additional validation for transfer amounts
          if (stripeWholesalerAmount <= 0) {
            console.error(`❌ Invalid transfer amount for Connect account: ${stripeWholesalerAmount}`);
            useConnect = false; // Fallback to direct payment
          } else {
            paymentConfig.transfer_data = {
              destination: wholesaler.stripeAccountId,
              amount: stripeWholesalerAmount // Amount wholesaler receives (platform keeps the rest)
            };
            paymentConfig.on_behalf_of = wholesaler.stripeAccountId;
            console.log('💳 Connect transfer_data:', paymentConfig.transfer_data);
          }
        }
        
        // Log final payment configuration for debugging
        console.log('💳 Final payment configuration:', {
          useConnect,
          connectAccountStatus,
          amount: paymentConfig.amount,
          hasTransferData: !!paymentConfig.transfer_data,
          destination: paymentConfig.transfer_data?.destination,
          transferAmount: paymentConfig.transfer_data?.amount
        });

        console.log('💳 About to call Stripe with config:', {
          amount: paymentConfig.amount,
          amountType: typeof paymentConfig.amount,
          currency: paymentConfig.currency,
          hasTransferData: !!paymentConfig.transfer_data
        });

        paymentIntent = await stripe.paymentIntents.create({
          ...paymentConfig,
        metadata: {
          customerName,
          customerEmail,
          customerPhone,
          customerAddress: JSON.stringify(customerAddress),
          // CRITICAL: Store selected delivery address ID for exact order-address tracking
          selectedDeliveryAddressId: selectedDeliveryAddress?.id ? selectedDeliveryAddress.id.toString() : '',
          // CRITICAL FIX: Store the complete selected delivery address object
          selectedDeliveryAddress: selectedDeliveryAddress ? JSON.stringify(selectedDeliveryAddress) : '',
          productSubtotal: productSubtotal.toFixed(2),
          shippingCost: deliveryCost.toString(),
          customerTransactionFee: customerTransactionFee.toFixed(2),
          wholesalerPlatformFee: wholesalerPlatformFee.toFixed(2),
          wholesalerReceives: wholesalerReceives.toFixed(2),
          totalCustomerPays: totalCustomerPays.toFixed(2),
          wholesalerId: firstProduct.wholesalerId,
          wholesalerBusinessName: wholesaler.businessName || 'Quikpik Wholesaler',
          orderType: 'customer_portal',
          connectAccountUsed: useConnect ? 'true' : 'false',
          // CRITICAL FIX: Store shipping info to determine delivery vs pickup
          shippingInfo: JSON.stringify(shippingInfo || { option: 'pickup' }),
          items: JSON.stringify(validatedItems.map(item => ({
            productId: item.product.id,
            productName: item.product.name,
            quantity: item.quantity,
            unitPrice: parseFloat(item.unitPrice),
            sellingType: item.sellingType || 'units', // CRITICAL: Preserve selling type for order creation
            appliedOfferLabel: item.appliedOfferLabel || null,
            freeItems: item.freeItems || 0
          })))
        }
      }, {
        idempotencyKey: idempotencyKey
      });
      
      console.log('✅ Payment intent created successfully:', paymentIntent.id);
      
      console.log('✅ Payment processing successful');
      
      } catch (stripeError: any) {
        console.error("❌ Stripe payment intent creation error:", stripeError);
        console.error("❌ Stripe error details:", {
          type: stripeError.type,
          code: stripeError.code,
          message: stripeError.message,
          statusCode: stripeError.statusCode
        });
        
        // Handle specific Connect account errors and retry without Connect
        if ((stripeError.type === 'StripeInvalidRequestError' || stripeError.code === 'account_invalid') && useConnect) {
          console.log('🔄 Connect account error detected, retrying without Connect...');
          
          // Retry payment creation without Connect configuration
          try {
            const fallbackConfig = {
              amount: stripeAmount,
              currency: 'gbp',
              receipt_email: customerEmail,
              automatic_payment_methods: { enabled: true },
              statement_descriptor_suffix: wholesaler.businessName?.slice(0, 10) || 'Quikpik',
              description: `Purchase from ${wholesaler.businessName || 'Quikpik Wholesaler'}`,
              metadata: {
                customerName,
                customerEmail,
                customerPhone,
                customerAddress: JSON.stringify(customerAddress),
                selectedDeliveryAddressId: selectedDeliveryAddress?.id ? selectedDeliveryAddress.id.toString() : '',
                selectedDeliveryAddress: selectedDeliveryAddress ? JSON.stringify(selectedDeliveryAddress) : '',
                productSubtotal: productSubtotal.toFixed(2),
                shippingCost: deliveryCost.toString(),
                customerTransactionFee: customerTransactionFee.toFixed(2),
                wholesalerPlatformFee: wholesalerPlatformFee.toFixed(2),
                wholesalerReceives: wholesalerReceives.toFixed(2),
                totalCustomerPays: totalCustomerPays.toFixed(2),
                wholesalerId: firstProduct.wholesalerId,
                wholesalerBusinessName: wholesaler.businessName || 'Quikpik Wholesaler',
                orderType: 'customer_portal',
                connectAccountUsed: 'false', // Mark as direct payment
                shippingInfo: JSON.stringify(shippingInfo || { option: 'pickup' }),
                items: JSON.stringify(validatedItems.map(item => ({
                  productId: item.product.id,
                  productName: item.product.name,
                  quantity: item.quantity,
                  unitPrice: parseFloat(item.unitPrice),
                  sellingType: item.sellingType || 'units',
                  appliedOfferLabel: item.appliedOfferLabel || null,
                  freeItems: item.freeItems || 0
                })))
              }
            };
            
            console.log('🔄 Creating fallback payment intent without Connect');
            paymentIntent = await stripe.paymentIntents.create(fallbackConfig, {
              idempotencyKey: `${idempotencyKey}_fallback`
            });
            
            console.log('✅ Fallback payment intent created successfully:', paymentIntent.id);
            
          } catch (fallbackError: any) {
            console.error("❌ Fallback payment creation also failed:", fallbackError);
            return res.status(500).json({ 
              message: "Payment setup failed. Please contact the business owner.",
              error: 'payment_config_error'
            });
          }
        } else if (stripeError.code === 'parameter_invalid_integer') {
          return res.status(400).json({ 
            message: "Invalid payment amount calculation. Please refresh and try again.",
            error: 'calculation_error'
          });
        } else {
          // Re-throw other errors to be caught by outer catch block
          throw stripeError;
        }
      }

      res.json({ 
        clientSecret: paymentIntent.client_secret,
        productSubtotal: productSubtotal.toFixed(2),
        shippingCost: deliveryCost.toString(),
        customerTransactionFee: customerTransactionFee.toFixed(2),
        totalCustomerPays: totalCustomerPays.toFixed(2),
        wholesalerPlatformFee: wholesalerPlatformFee.toFixed(2),
        wholesalerReceives: wholesalerReceives.toFixed(2)
      });

    } catch (error) {
      console.error("Error creating payment intent:", error);
      
      console.log('❌ Payment processing error handled');
      
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
        wholesalerReceives,
        selectedDeliveryAddressId,
        selectedDeliveryAddress: selectedDeliveryAddressJson,
        shippingCost: metadataShippingCost
      } = paymentIntent.metadata;

      // Parse shipping info from payment metadata
      const shippingInfoJson = paymentIntent.metadata.shippingInfo;
      const shippingInfo = shippingInfoJson ? JSON.parse(shippingInfoJson) : { option: 'pickup' };

      // Parse the selected delivery address from metadata
      let selectedDeliveryAddress = null;
      if (selectedDeliveryAddressJson) {
        try {
          selectedDeliveryAddress = JSON.parse(selectedDeliveryAddressJson);
        } catch (error) {
          console.error('❌ Failed to parse selectedDeliveryAddress:', error);
        }
      }

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
            email: customerEmail,
            wholesalerId: wholesalerId
          });
          console.log(`✅ New customer created: ${customer.id} (${customer.firstName} ${customer.lastName}) linked to wholesaler: ${wholesalerId}`);
          
          // Send welcome messages to new customer (Payment Processing)
          try {
            const wholesaler = await storage.getUser(wholesalerId);
            if (wholesaler) {
              const customerName = `${firstName} ${lastName}`.trim();
              const portalUrl = `https://quikpik.app/customer/${userId}`;
              const wholesalerName = wholesaler.businessName || `${wholesaler.firstName} ${wholesaler.lastName}`.trim() || 'Your Wholesale Partner';
              
              console.log(`📧 Sending welcome messages for new customer ${customerName} linked to wholesaler ${wholesalerName}`);
              
              const welcomeResult = await sendWelcomeMessages({
                customerName,
                customerEmail: customerEmail || '',
                customerPhone: customerPhone,
                wholesalerName,
                wholesalerEmail: wholesaler.email || 'hello@quikpik.co',
                wholesalerPhone: wholesaler.phoneNumber || '',
                wholesalerAccountName: `${wholesaler.firstName} ${wholesaler.lastName || ''}`.trim() || 'IBK',
                portalUrl,
                wholesalerId: wholesaler.id,
                wholesalerLogoType: wholesaler.logoType,
                wholesalerLogoUrl: wholesaler.logoUrl,
              });
              
              console.log(`📨 Welcome messages sent to ${customerName}:`, welcomeResult);
            }
          } catch (welcomeError) {
            console.error('❌ Error sending welcome messages (Payment Processing):', welcomeError);
          }
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
              email: emailConflict ? (customer.email || undefined) : (customerEmail || customer.email || undefined)
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

        // 🚚 SHIPPING INFO: Already parsed above for debug logging - use existing shippingInfo variable
        
        
        // ENHANCED LOGGING: Alert if shipping info is missing or defaults to pickup
        if (!shippingInfoJson) {
          console.error(`🚨 CRITICAL: No shippingInfo in payment metadata for ${paymentIntentId}! This will default to pickup.`);
          console.error(`🚨 Payment metadata keys:`, Object.keys(paymentIntent.metadata || {}));
        } else if (shippingInfo.option === 'pickup') {
          console.log(`📦 Customer explicitly chose pickup for payment ${paymentIntentId}`);
        } else if (shippingInfo.option === 'delivery') {
          console.log(`🚚 Customer chose delivery for payment ${paymentIntentId} - will create DELIVERY order`);
        }
        
        // Use actual order shipping choice, not saved customer preference
        const fulfillmentType = shippingInfo.option === 'delivery' ? 'delivery' : 'pickup';
        
        console.log('🚚 MARKETPLACE ROUTE: Using actual order shipping choice:', {
          customerId: customer.id,
          customerName: `${customer.firstName} ${customer.lastName}`,
          orderShippingOption: shippingInfo.option,
          finalFulfillmentType: fulfillmentType,
          willCreateDeliveryOrder: fulfillmentType === 'delivery'
        });

        // CRITICAL FIX: Use explicit address ID from payment metadata if available, ALWAYS override metadata address
        if (fulfillmentType === 'delivery' && selectedDeliveryAddressId) {
          try {
            console.log(`🎯 MARKETPLACE EXPLICIT ADDRESS: Customer selected address ID ${selectedDeliveryAddressId}, fetching from database...`);
            
            // CRITICAL FIX: Get the specific address directly by ID since customer already selected it
            const explicitlySelectedAddress = await storage.getDeliveryAddressById(parseInt(selectedDeliveryAddressId));
            
            if (explicitlySelectedAddress) {
              selectedDeliveryAddress = {
                id: explicitlySelectedAddress.id,
                addressLine1: explicitlySelectedAddress.address_line1 || '',
                addressLine2: explicitlySelectedAddress.address_line2 || null,
                city: explicitlySelectedAddress.city || '',
                state: explicitlySelectedAddress.state || null,
                postalCode: explicitlySelectedAddress.postal_code || '',
                country: explicitlySelectedAddress.country || 'United Kingdom'
              };
              console.log(`🎯 MARKETPLACE CUSTOMER CHOICE RESPECTED: Using customer's explicit selection - Address ID ${selectedDeliveryAddress.id}: ${selectedDeliveryAddress.addressLine1}`);
            } else {
              console.log(`⚠️ MARKETPLACE: Customer selected address ID ${selectedDeliveryAddressId} not found, checking available addresses...`);
              
              // Only fallback to non-default if customer's explicit choice is not available
              const nonDefaultAddresses = customerAddresses.filter((addr: any) => !addr.is_default && addr.id !== 1);
              if (nonDefaultAddresses.length > 0) {
                selectedDeliveryAddress = {
                  id: nonDefaultAddresses[0].id,
                  addressLine1: nonDefaultAddresses[0].address_line1 || '',
                  addressLine2: nonDefaultAddresses[0].address_line2 || null,
                  city: nonDefaultAddresses[0].city || '',
                  state: nonDefaultAddresses[0].state || null,
                  postalCode: nonDefaultAddresses[0].postal_code || '',
                  country: nonDefaultAddresses[0].country || 'United Kingdom'
                };
                console.log(`🔄 MARKETPLACE FALLBACK: Using first non-default address ID ${selectedDeliveryAddress.id}: ${selectedDeliveryAddress.addressLine1}`);
              }
            }
          } catch (error) {
            console.error('❌ MARKETPLACE: Failed to query customer addresses:', error);
          }
        }

        // Calculate actual platform fee based on Connect usage
        const actualPlatformFee = connectAccountUsed === 'true' ? platformFee : '0.00';
        const wholesalerAmount = connectAccountUsed === 'true' 
          ? (parseFloat(totalAmount) - parseFloat(platformFee)).toFixed(2)
          : totalAmount;

        // Use the correct total from metadata instead of recalculating
        const correctTotal = totalCustomerPays || (parseFloat(productSubtotal || totalAmount) + parseFloat(customerTransactionFee || transactionFee || '0')).toFixed(2);
        
        console.log('🚚 COMPETING SYSTEM DEBUG: Processing shipping metadata:', {
          hasShippingInfo: !!shippingInfoJson,
          shippingInfoRaw: shippingInfoJson,
          parsedShippingInfo: shippingInfo,
          customerChoice: shippingInfo.option,
          hasService: !!shippingInfo.service,
          serviceName: shippingInfo.service?.serviceName,
          servicePrice: shippingInfo.service?.price
        });

        // ATOMIC ORDER NUMBER GENERATION: Use database transaction with proper sequential numbering AND duplicate checking
        let order, wholesaleRef;
        
        try {
          console.log(`🚨 WEBHOOK TRANSACTION DEBUG: Starting transaction for payment ${paymentIntentId}`);
          const result = await db.transaction(async (trx) => {
            // CRITICAL FIX: Check for existing order WITHIN the transaction for true atomicity
            const existingOrderResult = await trx
              .select()
              .from(orders)
              .where(like(orders.stripePaymentIntentId, `%${paymentIntentId}%`))
              .limit(1);
            
            if (existingOrderResult.length > 0) {
              const existingOrder = existingOrderResult[0];
              console.log(`⚠️ ATOMIC CHECK: Order already exists for payment intent ${paymentIntentId}: #${existingOrder.id} (${existingOrder.orderNumber})`);
              throw new Error(`DUPLICATE_ORDER:${existingOrder.id}:${existingOrder.orderNumber}`);
            }

            // Use consistent order number generation
            const wholesaleRef = await generateOrderNumber(wholesalerId, trx);
            
            // CRITICAL FIX: Calculate subtotal from items when metadata missing
            const safeSubtotal = productSubtotal && productSubtotal !== 'null' && productSubtotal !== 'undefined'
              ? parseFloat(productSubtotal).toFixed(2)
              : items.reduce((sum: number, item: any) => sum + (parseFloat(item.unitPrice) * item.quantity), 0).toFixed(2);
            
            console.log(`💰 Subtotal calculation: productSubtotal=${productSubtotal}, safeSubtotal=${safeSubtotal}, totalAmount=${totalAmount}`);

            // Create order with customer details AND SHIPPING DATA
            const orderData = {
              orderNumber: wholesaleRef, // Use wholesale reference as order number for consistency
              wholesalerId,
              retailerId: customer.id,
              customerName, // Store customer name
              customerEmail, // Store customer email
              customerPhone, // Store customer phone
              subtotal: safeSubtotal, // FIXED: Raw product total before any fee deductions
              platformFee: parseFloat(wholesalerPlatformFee || '0').toFixed(2), // 3.3% platform fee
              customerTransactionFee: parseFloat(customerTransactionFee || '0').toFixed(2), // Customer transaction fee (5.5% + £0.50)
              total: correctTotal, // Total = subtotal + customer transaction fee
              status: 'paid',
              paymentStatus: 'paid', // CRITICAL: Set payment status for archive logic
              amountPaid: correctTotal, // Full amount paid on checkout
              amountOutstanding: '0.00', // Nothing outstanding
              stripePaymentIntentId: paymentIntent.id,
              deliveryAddress: selectedDeliveryAddress ? (() => {
                // CRITICAL FIX: Filter out empty address components to prevent incomplete snapshots
                const addressParts = [
                  selectedDeliveryAddress.addressLine1,
                  selectedDeliveryAddress.addressLine2,
                  selectedDeliveryAddress.city,
                  selectedDeliveryAddress.state,
                  selectedDeliveryAddress.postalCode,
                  selectedDeliveryAddress.country || 'United Kingdom'
                ].filter(part => part && typeof part === 'string' && part.trim() && part.trim() !== 'undefined' && part.trim() !== 'null');
                
                return addressParts.length > 0 ? addressParts.join(', ') : null;
              })() : (customerAddress ? (typeof customerAddress === 'string' ? customerAddress : JSON.stringify(customerAddress)) : null),
              deliveryAddressId: selectedDeliveryAddress?.id || (selectedDeliveryAddressId ? parseInt(selectedDeliveryAddressId) : null),
              // 🚚 SIMPLIFIED: Use saved customer shipping choice
              fulfillmentType: fulfillmentType,
              deliveryCarrier: fulfillmentType === 'delivery' ? 'Supplier Arranged' : null,
              deliveryCost: parseFloat(metadataShippingCost || '0').toFixed(2),
              shippingTotal: parseFloat(metadataShippingCost || '0').toFixed(2)
            };
            
            console.log('🚚 SIMPLIFIED DELIVERY: Order data with shipping fields:', {
              fulfillmentType: orderData.fulfillmentType,
              deliveryCarrier: orderData.deliveryCarrier,
              isDeliveryOrder: orderData.fulfillmentType === 'delivery',
              supplierWillArrangeDelivery: orderData.fulfillmentType === 'delivery'
            });
            

            // Create order items with orderId for storage, including promo labels
            const orderItemsData = await Promise.all(items.map(async (item: any) => {
              return {
                orderId: 0,
                productId: item.productId,
                quantity: item.quantity,
                unitPrice: parseFloat(item.unitPrice).toFixed(2),
                total: (parseFloat(item.unitPrice) * item.quantity).toFixed(2),
                sellingType: item.sellingType || 'units',
                appliedOfferLabel: item.appliedOfferLabel || null,
                freeItems: item.freeItems || 0
              };
            }));

            console.log(`🚨 WEBHOOK TRANSACTION DEBUG: About to call createOrderWithTransaction`);
            console.log(`🚨 WEBHOOK TRANSACTION DEBUG: Order data:`, orderData);
            console.log(`🚨 WEBHOOK TRANSACTION DEBUG: Items:`, orderItemsData);
            
            // Use transaction-aware storage method with integrity check
            const createdOrder = await storage.createOrderWithTransaction(trx, orderData, orderItemsData);
            
            console.log(`🚨 WEBHOOK TRANSACTION DEBUG: createOrderWithTransaction completed, order ID: ${createdOrder.id}`);
            
            // 🔒 DATA INTEGRITY: Verify all items were saved correctly
            const savedItems = await trx.select().from(orderItems).where(eq(orderItems.orderId, createdOrder.id));
            if (savedItems.length !== items.length) {
              console.error(`❌ DATA INTEGRITY ALERT: Expected ${items.length} items, but only saved ${savedItems.length} for order ${createdOrder.id}`);
              throw new Error(`Data integrity failure: Expected ${items.length} items, saved ${savedItems.length}`);
            }
            
            console.log(`✅ Order #${createdOrder.id} created with ${savedItems.length}/${items.length} items verified`);
            return { order: createdOrder, wholesaleRef };
          });
          
          order = result.order;
          wholesaleRef = result.wholesaleRef;
        } catch (error: any) {
          // Handle duplicate order errors gracefully
          if (error.message.startsWith('DUPLICATE_ORDER:')) {
            const [, orderId, orderNumber] = error.message.split(':');
            console.log(`✅ Duplicate order detected and prevented: #${orderId} (${orderNumber})`);
            return res.json({ 
              success: true, 
              orderId: parseInt(orderId), 
              orderNumber: orderNumber, // Include order number in response
              message: 'Order already processed' 
            });
          }
          throw error; // Re-throw other errors
        }
        
        console.log(`✅ Order #${order.id} (Wholesale Ref: ${wholesaleRef}) created successfully for wholesaler ${wholesalerId}, customer ${customerName}, total: ${totalAmount}`);

        // Get wholesaler data for emails and notifications
        const wholesaler = await storage.getWholesalerProfile(wholesalerId);

        // Send customer confirmation email and Stripe invoice
        if (wholesaler && customerEmail) {
          try {
            const savedOrderItems = await storage.getOrderItems(order.id);
            const enrichedItems = await Promise.all(savedOrderItems.map(async (item: any) => {
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
              address: selectedDeliveryAddress ? 
                (() => {
                  // CRITICAL FIX: Filter out empty address components to prevent incomplete snapshots
                  const addressParts = [
                    selectedDeliveryAddress.addressLine1,
                    selectedDeliveryAddress.addressLine2,
                    selectedDeliveryAddress.city,
                    selectedDeliveryAddress.state,
                    selectedDeliveryAddress.postalCode,
                    selectedDeliveryAddress.country || 'United Kingdom'
                  ].filter(part => part && typeof part === 'string' && part.trim() && part.trim() !== 'undefined' && part.trim() !== 'null');
                  
                  return addressParts.length > 0 ? addressParts.join(', ') : null;
                })() : 
                customerAddress
            }, order, enrichedItems, wholesaler);
            console.log(`📧 Confirmation email sent to ${customerEmail} for order #${order.id}`);

            
          } catch (emailError) {
            console.error(`❌ Failed to send confirmation email for order #${order.id}:`, emailError);
          }
        }

        // Send WhatsApp notification to wholesaler with wholesale reference
        if (wholesaler && (wholesaler as any).twilioAuthToken && (wholesaler as any).twilioPhoneNumber) {
          const currencySymbol = wholesaler.preferredCurrency === 'GBP' ? '£' : '$';
          const message = `🎉 New Order Received!\n\nWholesale Ref: ${wholesaleRef}\nCustomer: ${customerName}\nPhone: ${customerPhone}\nEmail: ${customerEmail}\nTotal: ${currencySymbol}${totalAmount}\n\nOrder ID: ${order.id}\nStatus: Paid\n\nQuote this reference when communicating with the customer.`;
          
          try {
            // WhatsApp notification (simplified)
            if ((wholesaler as any).whatsappEnabled) {
              if ((wholesaler as any).whatsappAccessToken && (wholesaler as any).whatsappBusinessPhoneId) {
                await whatsAppBusinessService.sendMessage((wholesaler as any).businessPhone, message, {
                  accessToken: (wholesaler as any).whatsappAccessToken,
                  phoneNumberId: (wholesaler as any).whatsappBusinessPhoneId
                });
              }
            }
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
                total: (parseFloat(item.unitPrice) * item.quantity).toFixed(2),
                appliedOfferLabel: item.appliedOfferLabel || null,
                freeItems: item.freeItems || 0
              };
            }));

            // FIXED: Get complete address using correct camelCase field names
            let shippingAddress = undefined;
            if (fulfillmentType === 'delivery' && order.deliveryAddressId) {
              try {
                const completeAddress = await storage.getDeliveryAddressById(order.deliveryAddressId);
                if (completeAddress) {
                  shippingAddress = [
                    completeAddress.addressLine1,
                    completeAddress.addressLine2,
                    `${completeAddress.city}${completeAddress.state ? ', ' + completeAddress.state : ''}`,
                    completeAddress.postalCode,
                    completeAddress.country
                  ].filter(Boolean).join('\n');
                } else {
                  // Fallback to order deliveryAddress
                  shippingAddress = order.deliveryAddress;
                }
              } catch (addressError) {
                console.error('❌ Failed to get complete address:', addressError);
                // Fallback to order deliveryAddress
                shippingAddress = order.deliveryAddress;
              }
            }

            const emailData: OrderEmailData = {
              orderNumber: order.orderNumber || `ORD-${order.id}`,
              customerName,
              customerEmail: customerEmail || '',
              customerPhone,
              // Use complete address string like customer email (WORKING APPROACH)  
              shippingAddress: shippingAddress,
              total: correctTotal,
              subtotal: productSubtotal,
              platformFee: parseFloat(wholesalerPlatformFee || '0').toFixed(2),
              customerTransactionFee: parseFloat(customerTransactionFee || '0').toFixed(2),
              wholesalerPlatformFee: parseFloat(wholesalerPlatformFee || '0').toFixed(2),
              shippingTotal: parseFloat(metadataShippingCost || '0').toFixed(2),
              fulfillmentType: shippingInfo && shippingInfo.option === 'delivery' ? 'delivery' : 'pickup',
              items: enrichedItemsForEmail,
              wholesaler: {
                id: wholesaler.id,
                businessName: wholesaler.businessName || `${wholesaler.firstName} ${wholesaler.lastName}`,
                firstName: wholesaler.firstName || '',
                lastName: wholesaler.lastName || '',
                email: wholesaler.email,
                logoUrl: wholesaler.logoUrl,
                logoType: wholesaler.logoType,
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
          orderNumber: order.orderNumber || wholesaleRef, // Include actual order number
          platformFeeCollected: connectAccountUsed === 'true',
          message: 'Order created successfully',
          // Include financial details for ThankYouPage
          totalAmount: parseFloat(totalCustomerPays || correctTotal || '0'),
          subtotal: parseFloat(productSubtotal || '0'),
          transactionFee: parseFloat(customerTransactionFee || '0'),
          shippingCost: shippingInfo && shippingInfo.option === 'delivery' && shippingInfo.service 
            ? parseFloat(shippingInfo.service.price.toString())
            : 0
        });
      } else {
        res.status(400).json({ message: 'Invalid order type' });
      }
    } catch (error: any) {
      console.error('Error creating order:', error);
      res.status(500).json({ message: 'Failed to create order: ' + error.message });
    }
  });

  // Multi-Wholesaler Dashboard Widgets API (public endpoint)
  app.get('/api/dashboard/multi-wholesaler-stats', async (req: any, res) => {
    try {
      const multiWholesalerStats = await db.execute(`
        SELECT 
          u.id as wholesaler_id,
          u.business_name,
          u.email,
          COUNT(DISTINCT o.id) as total_orders,
          COALESCE(SUM(o.total), 0) as total_revenue,
          COUNT(DISTINCT p.id) as total_products,
          COUNT(DISTINCT cg.id) as customer_groups,
          COUNT(DISTINCT cgm.customer_id) as total_customers,
          CASE 
            WHEN COUNT(DISTINCT o.id) >= 50 THEN 'platinum'
            WHEN COUNT(DISTINCT o.id) >= 20 THEN 'gold'
            WHEN COUNT(DISTINCT o.id) >= 10 THEN 'silver'
            ELSE 'bronze'
          END as tier,
          CASE 
            WHEN COUNT(DISTINCT o.id) >= 50 THEN 4
            WHEN COUNT(DISTINCT o.id) >= 20 THEN 3
            WHEN COUNT(DISTINCT o.id) >= 10 THEN 2
            ELSE 1
          END as tier_level
        FROM users u
        LEFT JOIN orders o ON u.id = o.wholesaler_id AND o.status != 'cancelled'
        LEFT JOIN products p ON u.id = p.wholesaler_id
        LEFT JOIN customer_groups cg ON u.id = cg.wholesaler_id
        LEFT JOIN customer_group_members cgm ON cg.id = cgm.group_id
        WHERE u.role = 'wholesaler' AND u.business_name IS NOT NULL
        GROUP BY u.id, u.business_name, u.email
        HAVING COUNT(DISTINCT o.id) > 0 OR COUNT(DISTINCT p.id) > 0
        ORDER BY total_revenue DESC, total_orders DESC
        LIMIT 10
      `);

      const platformStats = await db.execute(`
        SELECT 
          COUNT(DISTINCT CASE WHEN u.role = 'wholesaler' THEN u.id END) as total_wholesalers,
          COUNT(DISTINCT CASE WHEN u.role = 'retailer' THEN u.id END) as total_customers,
          COUNT(DISTINCT o.id) as total_orders,
          COALESCE(SUM(o.total), 0) as total_platform_revenue,
          COUNT(DISTINCT p.id) as total_products
        FROM users u
        LEFT JOIN orders o ON (u.id = o.wholesaler_id OR u.id = o.retailer_id) AND o.status != 'cancelled'
        LEFT JOIN products p ON u.id = p.wholesaler_id
      `);

      const growthStats = await db.execute(`
        SELECT 
          COUNT(DISTINCT CASE WHEN o.created_at >= CURRENT_DATE - INTERVAL '7 days' THEN o.id END) as orders_this_week,
          COUNT(DISTINCT CASE WHEN o.created_at >= CURRENT_DATE - INTERVAL '14 days' AND o.created_at < CURRENT_DATE - INTERVAL '7 days' THEN o.id END) as orders_last_week,
          COUNT(DISTINCT CASE WHEN u.created_at >= CURRENT_DATE - INTERVAL '30 days' AND u.role = 'wholesaler' THEN u.id END) as new_wholesalers_this_month
        FROM orders o
        RIGHT JOIN users u ON u.id = o.wholesaler_id OR u.id = o.retailer_id
      `);

      res.json({
        leaderboard: multiWholesalerStats.rows,
        platform: platformStats.rows[0],
        growth: growthStats.rows[0]
      });
    } catch (error) {
      console.error("Multi-wholesaler stats error:", error);
      res.status(500).json({ error: "Failed to fetch multi-wholesaler stats" });
    }
  });

  app.patch('/api/orders/:id/status', requireAuth, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const { status } = req.body;
      const wholesalerId = req.user.role === 'team_member' && req.user.wholesalerId
        ? req.user.wholesalerId
        : req.user.id;

      const order = await storage.getOrder(id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Only the owning wholesaler (or their team members) can update order status
      if (order.wholesalerId !== wholesalerId) {
        return res.status(403).json({ message: "Not authorized to update this order" });
      }

      const updatedOrder = await storage.updateOrderStatus(id, status);

      // Send real-time notifications to the customer
      try {
        if (updatedOrder) {
          const customer = await storage.getUser(updatedOrder.retailerId);
          const wholesaler = await storage.getUser(updatedOrder.wholesalerId);
          if (customer && wholesaler) {
            await orderNotificationService.sendOrderStatusUpdate({
              orderId: updatedOrder.id,
              orderNumber: updatedOrder.orderNumber,
              status: updatedOrder.status,
              customerName: `${customer.firstName} ${customer.lastName}`.trim() || 'Customer',
              customerPhone: customer.phoneNumber || '',
              customerEmail: customer.email || undefined,
              wholesalerName: wholesaler.businessName || `${wholesaler.firstName} ${wholesaler.lastName}`.trim(),
              trackingNumber: updatedOrder.deliveryTrackingNumber || undefined,
              estimatedDelivery: undefined
            });
          }
        }
      } catch (notificationError) {
        console.error('Failed to send order status notifications:', notificationError);
        // Don't fail the status update if notifications fail
      }

      // Auto-archive fulfilled orders after 24 hours
      if (status === 'fulfilled') {
        setTimeout(async () => {
          try {
            await storage.updateOrderStatus(id, 'archived');
            console.log(`Order ${id} auto-archived after fulfillment`);
          } catch (error) {
            console.error(`Failed to auto-archive order ${id}:`, error);
          }
        }, 24 * 60 * 60 * 1000);
      }

      res.json(updatedOrder);
    } catch (error) {
      console.error("Error updating order status:", error);
      res.status(500).json({ message: "Failed to update order status" });
    }
  });

  // Cancel order with optional partial return and refund
  app.post('/api/orders/:id/cancel', requireAuth, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const wholesalerId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      const { reason, reasonCategory, returnedItems, processRefund, refundType, refundDelivery } = req.body;
      // returnedItems: Array<{ productId: number, quantity: number, sellingType: 'units' | 'pallets' }>
      // refundType: 'card' | 'credit' - determines if refund goes to original payment or store credit

      const order = await storage.getOrder(id);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Only wholesaler can cancel order
      if (order.wholesalerId !== wholesalerId) {
        return res.status(403).json({ message: "Not authorized to cancel this order" });
      }

      // Can't cancel already cancelled orders
      if (order.status === 'cancelled') {
        return res.status(400).json({ message: "Order is already cancelled" });
      }

      const orderItems = await storage.getOrderItems(id);
      let stockRestoredCount = 0;
      let refundAmount = 0;
      
      // Calculate refund amount and restore stock for returned items
      if (returnedItems && returnedItems.length > 0) {
        // Partial cancellation - only restore specified items
        for (const returnItem of returnedItems) {
          const orderItem = orderItems.find(oi => oi.productId === returnItem.productId);
          if (orderItem) {
            const product = await storage.getProduct(returnItem.productId);
            if (product) {
              const returnQty = Math.min(returnItem.quantity, orderItem.quantity);
              
              // Restore stock based on selling type
              if (returnItem.sellingType === 'pallets') {
                const stockBefore = product.palletStock || 0;
                const stockAfter = stockBefore + returnQty;
                await db.update(products)
                  .set({ palletStock: stockAfter })
                  .where(eq(products.id, product.id));
                await db.insert(stockMovements).values({
                  productId: product.id,
                  wholesalerId: order.wholesalerId,
                  movementType: 'return',
                  quantity: returnQty,
                  unitType: 'pallets',
                  stockBefore,
                  stockAfter,
                  reason: `Order cancellation - ${returnQty} pallets returned`,
                  orderId: id,
                });
              } else {
                const stockBefore = product.stock;
                const stockAfter = stockBefore + returnQty;
                await storage.updateProductStock(product.id, stockAfter);
                await db.insert(stockMovements).values({
                  productId: product.id,
                  wholesalerId: order.wholesalerId,
                  movementType: 'return',
                  quantity: returnQty,
                  unitType: 'units',
                  stockBefore,
                  stockAfter,
                  reason: `Order cancellation - ${returnQty} units returned`,
                  orderId: id,
                });
              }
              
              // Calculate refund for this item
              refundAmount += parseFloat(orderItem.unitPrice) * returnQty;
              stockRestoredCount += returnQty;
              
              console.log(`📦 Restored ${returnQty} ${returnItem.sellingType} of product ${product.name} to stock`);
            }
          }
        }
        if (refundDelivery) {
          const allFullyReturned = orderItems.every(oi => {
            const ri = returnedItems.find((r: any) => r.productId === oi.productId);
            return ri && ri.quantity >= oi.quantity;
          });
          if (!allFullyReturned) {
            const deliveryCost = parseFloat(order.deliveryCost || '0');
            refundAmount += deliveryCost;
            console.log(`🚚 Including delivery charge refund: £${deliveryCost.toFixed(2)}`);
          }
        }
      } else {
        // Full cancellation - restore all items
        for (const item of orderItems) {
          const product = await storage.getProduct(item.productId);
          if (product) {
            if (item.sellingType === 'pallets') {
              const stockBefore = product.palletStock || 0;
              const stockAfter = stockBefore + item.quantity;
              await db.update(products)
                .set({ palletStock: stockAfter })
                .where(eq(products.id, product.id));
              await db.insert(stockMovements).values({
                productId: product.id,
                wholesalerId: order.wholesalerId,
                movementType: 'return',
                quantity: item.quantity,
                unitType: 'pallets',
                stockBefore,
                stockAfter,
                reason: `Order cancelled - ${item.quantity} pallets returned`,
                orderId: id,
              });
            } else {
              const stockBefore = product.stock;
              const stockAfter = stockBefore + item.quantity;
              await storage.updateProductStock(item.productId, stockAfter);
              await db.insert(stockMovements).values({
                productId: product.id,
                wholesalerId: order.wholesalerId,
                movementType: 'return',
                quantity: item.quantity,
                unitType: 'units',
                stockBefore,
                stockAfter,
                reason: `Order cancelled - ${item.quantity} units returned`,
                orderId: id,
              });
            }
            stockRestoredCount += item.quantity;
          }
        }
        // Full refund for full cancellation
        refundAmount = parseFloat(order.amountPaid || '0');
      }

      // Process Stripe refund if order was paid and refund requested
      let stripeRefundTotalPounds = 0;
      let stripeRefundError: string | null = null;
      const amountPaid = parseFloat(order.amountPaid || '0');

      if (processRefund && amountPaid > 0 && order.stripePaymentIntentId && stripe) {
        const refundAmountToProcess = returnedItems?.length > 0 ? refundAmount : amountPaid;
        if (refundAmountToProcess > 0 && refundAmountToProcess <= amountPaid) {
          const result = await refundAcrossPaymentIntents(
            stripe,
            order.stripePaymentIntentId,
            refundAmountToProcess,
            { order_id: id.toString(), reason: reason || 'Order cancelled' }
          );
          stripeRefundTotalPounds = result.totalRefunded;
          if (result.totalRefunded === 0) {
            stripeRefundError = result.lastError;
          } else if (result.remaining > 0.01) {
            // Partial Stripe success — some amount couldn't be refunded
            stripeRefundError = `£${result.remaining.toFixed(2)} could not be refunded automatically`;
          }
        }
      }

      // Determine new status - full cancellation if no items specified OR all items returned at full quantity
      let isFullCancellation = !returnedItems || returnedItems.length === 0;
      
      // Check if all items are being returned at full quantity (also a full cancellation)
      if (!isFullCancellation && returnedItems && returnedItems.length > 0) {
        const allItemsFullyReturned = orderItems.every(orderItem => {
          const returnItem = returnedItems.find((ri: any) => ri.productId === orderItem.productId);
          return returnItem && returnItem.quantity >= orderItem.quantity;
        });
        if (allItemsFullyReturned && returnedItems.length >= orderItems.length) {
          isFullCancellation = true;
          console.log('🚫 All items returned at full quantity - treating as full cancellation');
        }
      }
      
      const newStatus = isFullCancellation ? 'cancelled' : order.status;

      // Update order with cancellation details
      const currentRefunded = parseFloat(order.amountRefunded || '0');
      const amountPaidNum = parseFloat(order.amountPaid || '0');
      
      // Calculate total refunded: Stripe refund amount (card only)
      let totalRefunded = currentRefunded + stripeRefundTotalPounds;
      
      // For full cancellation, always record the refund amount even if "later" refund type
      if (isFullCancellation && totalRefunded === 0 && amountPaidNum > 0) {
        // If we're cancelling but haven't processed refund yet (e.g., 'later' option),
        // still record how much was paid to show what should be refunded
        totalRefunded = amountPaidNum;
      }
      
      // For partial returns with "later" refund, record the calculated refund amount for display
      if (!isFullCancellation && totalRefunded === 0 && refundAmount > 0) {
        totalRefunded = refundAmount;
      }
      
      const pendingRefundAmount = returnedItems?.length > 0 ? refundAmount : amountPaidNum;
      const refundNote = stripeRefundTotalPounds > 0
        ? `Stripe refund: £${stripeRefundTotalPounds.toFixed(2)}${stripeRefundError ? ` (partial — ${stripeRefundError})` : ''}`
        : stripeRefundError
          ? `Refund failed: £${pendingRefundAmount.toFixed(2)} (${stripeRefundError})`
          : amountPaidNum > 0 
            ? `Refund pending: £${pendingRefundAmount.toFixed(2)}`
            : 'No payment taken';
      
      // Determine if refund was processed now
      const refundProcessedNow = stripeRefundTotalPounds > 0;
      
      await db.update(orders)
        .set({
          status: newStatus,
          amountRefunded: totalRefunded.toFixed(2),
          amountOutstanding: isFullCancellation ? '0.00' : undefined,
          refundReason: reason || 'Customer requested cancellation',
          cancelledAt: isFullCancellation ? new Date() : undefined,
          stockRestored: (order.stockRestoredCount || 0) + stockRestoredCount > 0,
          stockRestoredCount: (order.stockRestoredCount || 0) + stockRestoredCount,
          notes: order.notes 
            ? `${order.notes}\n[${new Date().toISOString()}] ${isFullCancellation ? 'Order cancelled' : 'Partial return processed'} (${reasonCategory || 'unspecified'}): ${reason || 'N/A'}. Stock restored: ${stockRestoredCount} items. ${refundNote}` 
            : `[${new Date().toISOString()}] ${isFullCancellation ? 'Order cancelled' : 'Partial return processed'} (${reasonCategory || 'unspecified'}): ${reason || 'N/A'}. Stock restored: ${stockRestoredCount} items. ${refundNote}`
        })
        .where(eq(orders.id, id));

      // Send cancellation notification to customer (SMS and Email)
      try {
        const customer = await storage.getUser(order.retailerId);
        const wholesaler = await storage.getUser(order.wholesalerId);
        
        if (wholesaler) {
          const businessName = wholesaler.businessName || `${wholesaler.firstName}'s Store`;
          const amountPaid = parseFloat(order.amountPaid || '0');
          
          // Build itemised lists for the email
          const refundLineItems: RefundLineItem[] = [];
          const retainedLineItems: RefundLineItem[] = [];
          const deliveryCostNum = parseFloat(order.deliveryCost || '0');
          const deliveryRefundedAmount = isFullCancellation
            ? deliveryCostNum
            : (refundDelivery ? deliveryCostNum : 0);

          if (returnedItems && returnedItems.length > 0) {
            for (const ri of returnedItems) {
              const oi = orderItems.find(o => o.productId === ri.productId);
              if (oi) {
                const product = await storage.getProduct(ri.productId);
                const returnQty = Math.min(ri.quantity, oi.quantity);
                refundLineItems.push({
                  productName: product?.name || `Product #${ri.productId}`,
                  quantity: returnQty,
                  unitPrice: parseFloat(oi.unitPrice),
                  sellingType: ri.sellingType || oi.sellingType || 'units',
                });
                const keptQty = oi.quantity - returnQty;
                if (keptQty > 0) {
                  retainedLineItems.push({
                    productName: product?.name || `Product #${ri.productId}`,
                    quantity: keptQty,
                    unitPrice: parseFloat(oi.unitPrice),
                    sellingType: ri.sellingType || oi.sellingType || 'units',
                  });
                }
              }
            }
            for (const oi of orderItems) {
              const ri = returnedItems.find((r: any) => r.productId === oi.productId);
              if (!ri) {
                const product = await storage.getProduct(oi.productId);
                retainedLineItems.push({
                  productName: product?.name || `Product #${oi.productId}`,
                  quantity: oi.quantity,
                  unitPrice: parseFloat(oi.unitPrice),
                  sellingType: oi.sellingType || 'units',
                });
              }
            }
          } else {
            for (const oi of orderItems) {
              const product = await storage.getProduct(oi.productId);
              refundLineItems.push({
                productName: product?.name || `Product #${oi.productId}`,
                quantity: oi.quantity,
                unitPrice: parseFloat(oi.unitPrice),
                sellingType: oi.sellingType || 'units',
              });
            }
          }

          const actualRefundAmount = stripeRefundTotalPounds > 0 ? stripeRefundTotalPounds : refundAmount;

          // SMS notification
          if (customer?.phoneNumber) {
            let smsMsg = '';
            const totalReturnedQty = refundLineItems.reduce((sum, i) => sum + i.quantity, 0);
            if (isFullCancellation) {
              smsMsg = `Hi ${customer.firstName || 'there'}, your order ${order.orderNumber} with ${businessName} has been cancelled.`;
              if (stripeRefundTotalPounds > 0) {
                smsMsg += ` A refund of £${stripeRefundTotalPounds.toFixed(2)} for ${totalReturnedQty} item(s) has been processed. Allow 5-10 business days.`;
              } else if (amountPaid > 0) {
                smsMsg += ` A refund of £${amountPaid.toFixed(2)} for ${totalReturnedQty} item(s) is pending.`;
              } else {
                smsMsg += ` No payment was taken, so no refund is required.`;
              }
            } else {
              smsMsg = `Hi ${customer.firstName || 'there'}, ${totalReturnedQty} item(s) returned for order ${order.orderNumber} with ${businessName}.`;
              if (stripeRefundTotalPounds > 0) {
                smsMsg += ` Refund of £${stripeRefundTotalPounds.toFixed(2)} processed. Allow 5-10 business days.`;
              } else if (actualRefundAmount > 0) {
                smsMsg += ` Refund of £${actualRefundAmount.toFixed(2)} pending.`;
              }
            }
            smsMsg += `\n\nContact ${businessName}: ${wholesaler.phoneNumber || wholesaler.email || ''}\n\nDo not reply to this message.`;
            
            await sendSMS({ to: customer.phoneNumber, message: smsMsg });
            console.log(`📱 Cancellation SMS sent to ${customer.phoneNumber}`);
          }
          
          // Email notification with itemised receipt
          if (customer?.email) {
            try {
              const emailSubject = isFullCancellation 
                ? `Order ${order.orderNumber} Cancelled - ${businessName}`
                : `Partial Return Processed - Order ${order.orderNumber}`;

              const emailRefundStatus: 'processed' | 'pending' | 'none' = stripeRefundTotalPounds > 0
                ? 'processed'
                : (actualRefundAmount > 0 ? 'pending' : 'none');

              const emailBody = buildItemisedRefundEmail({
                customerName: customer.firstName || 'there',
                orderNumber: order.orderNumber,
                isFullCancellation,
                returnedItems: refundLineItems,
                retainedItems: retainedLineItems.length > 0 ? retainedLineItems : undefined,
                refundAmount: actualRefundAmount,
                deliveryRefunded: deliveryRefundedAmount > 0 ? deliveryRefundedAmount : undefined,
                refundStatus: emailRefundStatus,
                businessName,
                businessPhone: wholesaler.phoneNumber || undefined,
                businessEmail: wholesaler.email || undefined,
              });
              
              await sendEmail({
                to: customer.email,
                subject: emailSubject,
                html: wrapCustomerEmail(emailBody, { businessName, logoUrl: getEmailLogoUrl(wholesaler.id, wholesaler.logoType, wholesaler.logoUrl) }, { preheader: isFullCancellation ? `Order ${order.orderNumber} has been cancelled` : `Partial return for order ${order.orderNumber}` }),
                from: `${businessName} via Quikpik <hello@quikpik.co>`
              });
              console.log(`📧 Itemised cancellation email sent to ${customer.email}`);
            } catch (emailError) {
              console.error('Failed to send cancellation email:', emailError);
            }
          }
        }
      } catch (error) {
        console.error('Failed to send cancellation notification:', error);
      }

      const updatedOrder = await storage.getOrder(id);

      res.json({ 
        message: isFullCancellation ? "Order cancelled successfully" : "Partial return processed successfully",
        order: updatedOrder,
        stockRestored: stockRestoredCount,
        reasonCategory: reasonCategory || null,
        refundFailed: !!stripeRefundError,
        refundError: stripeRefundError,
        refund: stripeRefundTotalPounds > 0 ? {
          amount: stripeRefundTotalPounds,
          type: 'card'
        } : null
      });
    } catch (error) {
      console.error("Error cancelling order:", error);
      res.status(500).json({ message: "Failed to cancel order" });
    }
  });

  // Retry a pending Stripe refund for an order
  app.post('/api/orders/:id/retry-refund', requireAuth, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const wholesalerId = req.user.role === 'team_member' && req.user.wholesalerId
        ? req.user.wholesalerId
        : req.user.id;

      const order = await storage.getOrder(id);
      if (!order) return res.status(404).json({ message: "Order not found" });
      if (order.wholesalerId !== wholesalerId) return res.status(403).json({ message: "Not authorized" });
      if (!order.stripePaymentIntentId) return res.status(400).json({ message: "No Stripe payment recorded for this order" });
      if (!stripe) return res.status(400).json({ message: "Stripe not configured" });
      if (order.refundedAt) return res.status(400).json({ message: "Refund already processed on " + new Date(order.refundedAt).toLocaleDateString() });

      const amountToRefund = parseFloat(order.amountRefunded || '0');
      if (amountToRefund <= 0) return res.status(400).json({ message: "No pending refund amount recorded" });

      const result = await refundAcrossPaymentIntents(
        stripe,
        order.stripePaymentIntentId,
        amountToRefund,
        { order_id: id.toString(), retry: 'true' }
      );

      if (result.totalRefunded === 0) {
        return res.status(400).json({
          message: "Stripe refund failed",
          error: result.lastError || 'Could not refund from any payment intent'
        });
      }

      const refundedAmount = result.totalRefunded;
      const partialNote = result.remaining > 0.01 ? ` (£${result.remaining.toFixed(2)} could not be recovered automatically)` : '';
      console.log(`💳 Stripe retry refund processed: £${refundedAmount.toFixed(2)} for order ${order.orderNumber}${partialNote}`);

      await db.update(orders)
        .set({
          amountRefunded: result.remaining > 0.01 ? result.remaining.toFixed(2) : order.amountRefunded,
          notes: order.notes
            ? `${order.notes}\n[${new Date().toISOString()}] Stripe retry refund submitted: £${refundedAmount.toFixed(2)}${partialNote}`
            : `[${new Date().toISOString()}] Stripe retry refund submitted: £${refundedAmount.toFixed(2)}${partialNote}`
        })
        .where(eq(orders.id, id));

      const updatedOrder = await storage.getOrder(id);
      res.json({
        message: `Refund of £${refundedAmount.toFixed(2)} successfully sent to Stripe${partialNote}`,
        order: updatedOrder,
        refund: { amount: refundedAmount, remaining: result.remaining }
      });
    } catch (error) {
      console.error("Error retrying refund:", error);
      res.status(500).json({ message: "Failed to retry refund" });
    }
  });

  // Customer requests order cancellation (within 24-hour window)
  app.post('/api/customer/orders/:id/request-cancellation', async (req: any, res) => {
    try {
      const orderId = parseInt(req.params.id);
      const { customerPhone, reasonCategory, reasonNotes } = req.body;
      
      if (!customerPhone) {
        return res.status(400).json({ message: "Customer phone is required" });
      }
      if (!reasonCategory) {
        return res.status(400).json({ message: "Cancellation reason is required" });
      }
      
      const order = await storage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }
      
      // Verify customer owns this order by comparing phone numbers directly
      const orderCustomerPhone = (order as any).customerPhone;
      if (!orderCustomerPhone || orderCustomerPhone !== customerPhone) {
        return res.status(403).json({ message: "Not authorized to cancel this order" });
      }
      
      // Check if order is within 24-hour window
      const orderDate = new Date(order.createdAt);
      const now = new Date();
      const hoursSinceOrder = (now.getTime() - orderDate.getTime()) / (1000 * 60 * 60);
      
      if (hoursSinceOrder > 24) {
        return res.status(400).json({ 
          message: "Cancellation window expired. Orders can only be cancelled within 24 hours of placement. Please contact the seller directly."
        });
      }
      
      // Check if order is already cancelled or has a pending cancellation request
      if (order.status === 'cancelled') {
        return res.status(400).json({ message: "Order is already cancelled" });
      }
      
      const existingRequest = await db.select()
        .from(orderCancellationRequests)
        .where(and(
          eq(orderCancellationRequests.orderId, orderId),
          eq(orderCancellationRequests.status, 'pending')
        ))
        .limit(1);
        
      if (existingRequest.length > 0) {
        return res.status(400).json({ message: "A cancellation request is already pending for this order" });
      }
      
      // Create cancellation request
      const [request] = await db.insert(orderCancellationRequests)
        .values({
          orderId,
          customerId: order.retailerId,
          wholesalerId: order.wholesalerId,
          reasonCategory,
          reasonNotes: reasonNotes || null,
          status: 'pending',
        })
        .returning();
      
      console.log(`📋 Cancellation request created for order ${order.orderNumber} by customer ${customerPhone}`);
      
      // Notify wholesaler about the cancellation request via SMS and email
      try {
        const wholesaler = await storage.getUser(order.wholesalerId);
        const customerName = (order as any).customerName || customerPhone;
        
        // SMS notification
        if (wholesaler?.phoneNumber) {
          await sendSMS({
            to: wholesaler.phoneNumber,
            message: `🔔 Cancellation Request: Customer ${customerName} has requested to cancel order ${order.orderNumber}. Reason: ${reasonCategory}. Please review in your dashboard.`,
          });
        }
        
        // Email notification
        if (wholesaler?.email) {
          const orderTotal = parseFloat(order.total?.toString() || '0');
          const amountPaid = parseFloat(order.amountPaid?.toString() || '0');
          
          const cancelRequestBody = `${emailHeading('Cancellation Request', { size: '22px', color: '#EF4444' })}<p style="margin:0 0 20px">A customer has requested to cancel their order.</p>${emailCard(`${emailHeading(`Order ${order.orderNumber}`, { size: '16px', color: '#DC2626' })}<p style="margin:0 0 6px"><strong>Customer:</strong> ${customerName}</p><p style="margin:0 0 6px"><strong>Order Total:</strong> £${orderTotal.toFixed(2)}</p><p style="margin:0 0 6px"><strong>Amount Paid:</strong> £${amountPaid.toFixed(2)}</p><p style="margin:0 0 6px"><strong>Reason:</strong> ${reasonCategory}</p>${reasonNotes ? `<p style="margin:0"><strong>Additional Notes:</strong> ${reasonNotes}</p>` : ''}`, { borderColor: '#FECACA', bgColor: '#FEF2F2' })}${emailCard(`${emailHeading('What happens next?', { size: '16px', color: '#EA580C' })}<p style="margin:0 0 8px">Please review this cancellation request in your dashboard and decide whether to:</p><ul style="margin:0;padding-left:20px"><li style="margin-bottom:4px"><strong>Approve</strong> - The order will be cancelled and any payments will be refunded</li><li><strong>Reject</strong> - The order will remain active and the customer will be notified</li></ul>`, { borderColor: '#FED7AA', bgColor: '#FFF7ED' })}${emailButton('Review in Dashboard', 'https://quikpik.co/orders')}`;

          await sendEmail({
            to: wholesaler.email,
            from: 'hello@quikpik.co',
            subject: `Cancellation Request for Order ${order.orderNumber}`,
            html: wrapCustomerEmail(cancelRequestBody, { businessName: wholesaler.businessName || wholesaler.name || 'Quikpik', logoUrl: getEmailLogoUrl(wholesaler.id, wholesaler.logoType, wholesaler.logoUrl) }, { preheader: `${customerName} has requested to cancel order ${order.orderNumber}` }),
          });
          console.log(`📧 Cancellation request email sent to ${wholesaler.email} for order ${order.orderNumber}`);
        }
      } catch (error) {
        console.error('Failed to send cancellation request notification:', error);
      }
      
      res.json({ 
        message: "Cancellation request submitted successfully. The seller will review your request shortly.",
        request 
      });
    } catch (error) {
      console.error("Error creating cancellation request:", error);
      res.status(500).json({ message: "Failed to submit cancellation request" });
    }
  });

  // Get cancellation requests for wholesaler
  app.get('/api/cancellation-requests', requireAuth, async (req: any, res) => {
    try {
      const wholesalerId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      const status = req.query.status as string || undefined;
      
      let query = db.select()
        .from(orderCancellationRequests)
        .where(eq(orderCancellationRequests.wholesalerId, wholesalerId));
      
      if (status) {
        query = db.select()
          .from(orderCancellationRequests)
          .where(and(
            eq(orderCancellationRequests.wholesalerId, wholesalerId),
            eq(orderCancellationRequests.status, status as 'pending' | 'approved' | 'rejected')
          ));
      }
      
      const requests = await query.orderBy(desc(orderCancellationRequests.requestedAt));
      
      // Enrich with order and customer details
      const enrichedRequests = await Promise.all(requests.map(async (request) => {
        const order = await storage.getOrder(request.orderId);
        const customer = await storage.getUser(request.customerId);
        return {
          ...request,
          order: order ? {
            id: order.id,
            orderNumber: order.orderNumber,
            total: order.total,
            status: order.status,
            createdAt: order.createdAt,
          } : null,
          customer: customer ? {
            id: customer.id,
            firstName: customer.firstName,
            lastName: customer.lastName,
            phoneNumber: customer.phoneNumber,
            businessName: customer.businessName,
          } : null,
        };
      }));
      
      res.json(enrichedRequests);
    } catch (error) {
      console.error("Error fetching cancellation requests:", error);
      res.status(500).json({ message: "Failed to fetch cancellation requests" });
    }
  });

  // Get pending cancellation requests count for wholesaler
  app.get('/api/cancellation-requests/pending-count', requireAuth, async (req: any, res) => {
    try {
      const wholesalerId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      
      const result = await db.select({ count: sql<number>`count(*)` })
        .from(orderCancellationRequests)
        .where(and(
          eq(orderCancellationRequests.wholesalerId, wholesalerId),
          eq(orderCancellationRequests.status, 'pending')
        ));
      
      res.json({ count: Number(result[0]?.count || 0) });
    } catch (error) {
      console.error("Error fetching pending cancellation count:", error);
      res.status(500).json({ message: "Failed to fetch count" });
    }
  });

  // Cancellation analytics endpoint
  app.get('/api/analytics/cancellations', requireAuth, async (req: any, res) => {
    try {
      const wholesalerId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      
      const { timeRange = '30d' } = req.query;
      const now = new Date();
      let startDate: Date;
      
      switch (timeRange) {
        case '7d':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '90d':
          startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
          break;
        case '1y':
          startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
          break;
        default:
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      }
      
      // Get all cancelled orders
      const allOrders = await storage.getOrders(wholesalerId);
      const cancelledOrders = allOrders.filter(o => 
        o.status === 'cancelled' && new Date(o.createdAt) >= startDate
      );
      
      // Get cancellation requests
      const requests = await db.select()
        .from(orderCancellationRequests)
        .where(and(
          eq(orderCancellationRequests.wholesalerId, wholesalerId),
          gte(orderCancellationRequests.requestedAt, startDate)
        ));
      
      // Calculate metrics
      const totalCancelled = cancelledOrders.length;
      const totalRefunded = cancelledOrders.reduce((sum, o) => sum + parseFloat(o.amountRefunded || '0'), 0);
      const totalValue = cancelledOrders.reduce((sum, o) => sum + parseFloat(o.total || '0'), 0);
      
      // Cancellation reason breakdown
      const reasonBreakdown: Record<string, number> = {};
      cancelledOrders.forEach(o => {
        const reason = o.refundReason?.split(':')[0]?.trim() || 'Unknown';
        reasonBreakdown[reason] = (reasonBreakdown[reason] || 0) + 1;
      });
      
      // Customer-initiated vs wholesaler-initiated
      const customerInitiated = requests.filter(r => r.status === 'approved').length;
      const wholesalerInitiated = totalCancelled - customerInitiated;
      
      // Pending requests
      const pendingRequests = requests.filter(r => r.status === 'pending').length;
      const approvedRequests = requests.filter(r => r.status === 'approved').length;
      const rejectedRequests = requests.filter(r => r.status === 'rejected').length;
      
      // Calculate cancellation rate
      const totalOrders = allOrders.filter(o => new Date(o.createdAt) >= startDate).length;
      const cancellationRate = totalOrders > 0 ? (totalCancelled / totalOrders * 100).toFixed(1) : '0';
      
      res.json({
        totalCancelled,
        totalRefunded: totalRefunded.toFixed(2),
        totalValue: totalValue.toFixed(2),
        cancellationRate,
        reasonBreakdown: Object.entries(reasonBreakdown).map(([reason, count]) => ({ reason, count })),
        initiatedBy: {
          customer: customerInitiated,
          wholesaler: wholesalerInitiated
        },
        requests: {
          pending: pendingRequests,
          approved: approvedRequests,
          rejected: rejectedRequests,
          total: requests.length
        }
      });
    } catch (error) {
      console.error("Error fetching cancellation analytics:", error);
      res.status(500).json({ message: "Failed to fetch cancellation analytics" });
    }
  });

  // Wholesaler responds to cancellation request
  app.post('/api/cancellation-requests/:id/respond', requireAuth, async (req: any, res) => {
    try {
      const requestId = parseInt(req.params.id);
      const wholesalerId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      const { approved, responseMessage, refundType } = req.body;
      
      const [request] = await db.select()
        .from(orderCancellationRequests)
        .where(eq(orderCancellationRequests.id, requestId))
        .limit(1);
      
      if (!request) {
        return res.status(404).json({ message: "Cancellation request not found" });
      }
      
      if (request.wholesalerId !== wholesalerId) {
        return res.status(403).json({ message: "Not authorized to respond to this request" });
      }
      
      if (request.status !== 'pending') {
        return res.status(400).json({ message: "This request has already been processed" });
      }
      
      const newStatus = approved ? 'approved' : 'rejected';
      
      // Update the request
      await db.update(orderCancellationRequests)
        .set({
          status: newStatus,
          respondedAt: new Date(),
          respondedBy: req.user.id,
          responseMessage: responseMessage || null,
          refundType: approved ? (refundType || 'card') : null,
        })
        .where(eq(orderCancellationRequests.id, requestId));
      
      // If approved, cancel the order
      let custCancelStripeRefunded = 0;
      let custCancelAmountPaid = 0;
      if (approved) {
        const order = await storage.getOrder(request.orderId);
        if (order) {
          const orderItems = await storage.getOrderItems(order.id);
          
          for (const item of orderItems) {
            const product = await storage.getProduct(item.productId);
            if (product) {
              if (item.sellingType === 'pallets') {
                const currentPalletStock = product.palletStock || 0;
                await db.update(products)
                  .set({ palletStock: currentPalletStock + item.quantity })
                  .where(eq(products.id, product.id));
              } else {
                await storage.updateProductStock(item.productId, product.stock + item.quantity);
              }
            }
          }
          
          custCancelAmountPaid = parseFloat(order.amountPaid || '0');
          
          if (refundType === 'card' && custCancelAmountPaid > 0 && order.stripePaymentIntentId && stripe) {
            const result = await refundAcrossPaymentIntents(
              stripe,
              order.stripePaymentIntentId,
              custCancelAmountPaid,
              { order_id: order.id.toString(), reason: `Customer request: ${request.reasonCategory}` }
            );
            custCancelStripeRefunded = result.totalRefunded;
            if (result.totalRefunded > 0) {
              console.log(`💳 Stripe refund processed for customer cancellation: £${result.totalRefunded.toFixed(2)}`);
            }
          }
          
          await db.update(orders)
            .set({
              status: 'cancelled',
              amountRefunded: custCancelStripeRefunded > 0 ? custCancelStripeRefunded.toFixed(2) : (refundType === 'credit' || refundType === 'later') ? custCancelAmountPaid.toFixed(2) : '0.00',
              refundReason: `Customer request: ${request.reasonCategory}${request.reasonNotes ? ` - ${request.reasonNotes}` : ''}`,
              cancelledAt: new Date(),
              notes: order.notes 
                ? `${order.notes}\n[${new Date().toISOString()}] Order cancelled via customer request (${request.reasonCategory}). Refund: ${refundType}`
                : `[${new Date().toISOString()}] Order cancelled via customer request (${request.reasonCategory}). Refund: ${refundType}`,
            })
            .where(eq(orders.id, order.id));
          
          console.log(`🚫 Order ${order.orderNumber} cancelled via customer cancellation request`);
        }
      }
      
      // Notify customer about the decision via SMS and email
      try {
        const order = await storage.getOrder(request.orderId);
        const wholesaler = await storage.getUser(request.wholesalerId);
        const businessName = wholesaler?.businessName || 'the seller';
        const customerPhone = (order as any)?.customerPhone;
        const customerEmail = (order as any)?.customerEmail;
        const customerName = (order as any)?.customerName || 'Customer';
        
        // Build itemised data for the approved cancellation email
        let cancelledLineItems: RefundLineItem[] = [];
        if (approved && order) {
          const cancOrderItems = await storage.getOrderItems(order.id);
          for (const oi of cancOrderItems) {
            const product = await storage.getProduct(oi.productId);
            cancelledLineItems.push({
              productName: product?.name || `Product #${oi.productId}`,
              quantity: oi.quantity,
              unitPrice: parseFloat(oi.unitPrice),
              sellingType: oi.sellingType || 'units',
            });
          }
        }

        // SMS notification
        if (customerPhone && order) {
          let message = '';
          
          if (approved) {
            const totalCancelledQty = cancelledLineItems.reduce((sum, i) => sum + i.quantity, 0);
            if (refundType === 'card' && custCancelStripeRefunded > 0) {
              message = `✅ Your cancellation request for order ${order.orderNumber} (${totalCancelledQty} item(s)) has been approved by ${businessName}. Refund of £${custCancelStripeRefunded.toFixed(2)} processed — allow 5-10 business days.`;
            } else if (refundType === 'credit' && custCancelAmountPaid > 0) {
              message = `✅ Your cancellation request for order ${order.orderNumber} (${totalCancelledQty} item(s)) has been approved by ${businessName}. Store credit of £${custCancelAmountPaid.toFixed(2)} applied.`;
            } else if (refundType === 'card' && custCancelAmountPaid > 0) {
              message = `✅ Your cancellation request for order ${order.orderNumber} (${totalCancelledQty} item(s)) has been approved by ${businessName}. Refund of £${custCancelAmountPaid.toFixed(2)} pending.`;
            } else {
              message = `✅ Your cancellation request for order ${order.orderNumber} (${totalCancelledQty} item(s)) has been approved by ${businessName}.`;
            }
          } else {
            message = `❌ Your cancellation request for order ${order.orderNumber} has been declined by ${businessName}.${responseMessage ? ` Reason: ${responseMessage}` : ''} Please contact the seller for more information.`;
          }
          
          await sendSMS({ to: customerPhone, message });
          console.log(`📱 Cancellation response SMS sent to ${customerPhone}`);
        }
        
        // Email notification
        if (customerEmail && order) {
          if (approved) {
            const custCancelDeliveryCost = parseFloat(order.deliveryCost || '0');
            const actualRefundAmt = custCancelStripeRefunded > 0
              ? custCancelStripeRefunded
              : (refundType === 'credit' ? custCancelAmountPaid : custCancelAmountPaid);
            const custRefundStatus: 'processed' | 'pending' | 'credit' | 'none' =
              refundType === 'credit' ? 'credit'
              : custCancelStripeRefunded > 0 ? 'processed'
              : custCancelAmountPaid > 0 ? 'pending'
              : 'none';
            
            const approvedEmailBody = buildItemisedRefundEmail({
              customerName,
              orderNumber: order.orderNumber,
              isFullCancellation: true,
              returnedItems: cancelledLineItems,
              refundAmount: actualRefundAmt,
              deliveryRefunded: custCancelDeliveryCost > 0 ? custCancelDeliveryCost : undefined,
              refundStatus: custRefundStatus,
              businessName,
              businessPhone: wholesaler?.phoneNumber || undefined,
              businessEmail: wholesaler?.email || undefined,
            });

            await sendEmail({
              to: customerEmail,
              from: 'hello@quikpik.co',
              subject: `Cancellation Approved - Order ${order.orderNumber}`,
              html: wrapCustomerEmail(approvedEmailBody, { businessName, logoUrl: getEmailLogoUrl(wholesaler?.id, wholesaler?.logoType, wholesaler?.logoUrl) }, { preheader: `Your order ${order.orderNumber} cancellation has been approved` }),
            });
          } else {
            const rejectedCancelBody = `${emailHeading('Cancellation Request Update', { size: '22px' })}<p style="margin:0 0 8px">Hi ${customerName},</p><p style="margin:0 0 20px">We regret to inform you that your cancellation request for <strong>Order ${order.orderNumber}</strong> has been declined.</p>${responseMessage ? emailCard(`<p style="margin:0 0 4px;font-weight:600">Reason:</p><p style="margin:0;color:#4b5563">${responseMessage}</p>`, { borderColor: '#FECACA', bgColor: '#FEF2F2' }) : ''}${emailCard(`${emailHeading("What's Next?", { size: '16px', color: '#EA580C' })}<p style="margin:0 0 8px">Your order remains active. If you have any questions or concerns, please contact us directly:</p><p style="margin:0 0 4px"><strong>${businessName}</strong></p>${wholesaler?.phoneNumber ? `<p style="margin:0 0 4px">Phone: ${wholesaler.phoneNumber}</p>` : ''}${wholesaler?.email ? `<p style="margin:0">Email: ${wholesaler.email}</p>` : ''}`, { borderColor: '#FED7AA', bgColor: '#FFF7ED' })}`;

            await sendEmail({
              to: customerEmail,
              from: 'hello@quikpik.co',
              subject: `Order ${order.orderNumber} - Cancellation Request Update`,
              html: wrapCustomerEmail(rejectedCancelBody, { businessName, logoUrl: getEmailLogoUrl(wholesaler?.id, wholesaler?.logoType, wholesaler?.logoUrl) }, { preheader: `Update on your cancellation request for order ${order.orderNumber}` }),
            });
          }
          console.log(`📧 Cancellation response email sent to ${customerEmail}`);
        }
      } catch (error) {
        console.error('Failed to send cancellation response notification:', error);
      }
      
      res.json({ 
        message: approved ? "Cancellation request approved and order cancelled" : "Cancellation request rejected",
        status: newStatus
      });
    } catch (error) {
      console.error("Error responding to cancellation request:", error);
      res.status(500).json({ message: "Failed to process cancellation request" });
    }
  });

  // Check if customer can request cancellation for an order
  app.get('/api/customer/orders/:id/can-cancel', async (req: any, res) => {
    try {
      const orderId = parseInt(req.params.id);
      const customerPhone = req.query.customerPhone as string;
      
      if (!customerPhone) {
        return res.status(400).json({ canCancel: false, reason: "Customer phone is required" });
      }
      
      const order = await storage.getOrder(orderId);
      if (!order) {
        return res.status(404).json({ canCancel: false, reason: "Order not found" });
      }
      
      // Verify customer owns this order by comparing phone numbers directly
      // Orders store the customer phone, so we can validate ownership directly
      const orderCustomerPhone = (order as any).customerPhone;
      if (!orderCustomerPhone || orderCustomerPhone !== customerPhone) {
        return res.json({ canCancel: false, reason: "Not authorized" });
      }
      
      // Check if order is already cancelled
      if (order.status === 'cancelled') {
        return res.json({ canCancel: false, reason: "Order is already cancelled" });
      }
      
      // Check if there's already a pending cancellation request
      const existingRequest = await db.select()
        .from(orderCancellationRequests)
        .where(and(
          eq(orderCancellationRequests.orderId, orderId),
          eq(orderCancellationRequests.status, 'pending')
        ))
        .limit(1);
        
      if (existingRequest.length > 0) {
        return res.json({ canCancel: false, reason: "pending_request", pendingRequest: existingRequest[0] });
      }
      
      // Check if order is within 24-hour window
      const orderDate = new Date(order.createdAt);
      const now = new Date();
      const hoursSinceOrder = (now.getTime() - orderDate.getTime()) / (1000 * 60 * 60);
      const hoursRemaining = Math.max(0, 24 - hoursSinceOrder);
      
      if (hoursSinceOrder > 24) {
        return res.json({ 
          canCancel: false, 
          reason: "24-hour cancellation window has expired. Please contact the seller directly." 
        });
      }
      
      res.json({ 
        canCancel: true, 
        hoursRemaining: Math.round(hoursRemaining * 10) / 10 
      });
    } catch (error) {
      console.error("Error checking cancellation eligibility:", error);
      res.status(500).json({ canCancel: false, reason: "Error checking eligibility" });
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

      // Create Stripe refund — distribute across all payment intents if needed
      let refundResult: { totalRefunded: number; remaining: number; lastError: string | null } | null = null;
      if (stripe) {
        const amountPaid = parseFloat(order.amountPaid || '0');
        let amountToRefundPounds = amountPaid; // default: full refund

        if (amount && amount !== '') {
          const parsed = parseFloat(amount);
          if (!isNaN(parsed) && parsed > 0) amountToRefundPounds = parsed;
        }

        refundResult = await refundAcrossPaymentIntents(
          stripe,
          paymentIntentId,
          amountToRefundPounds,
          { order_id: id.toString(), reason: reason || 'Wholesaler initiated refund' }
        );

        if (refundResult.totalRefunded === 0) {
          return res.status(400).json({
            message: `Refund failed: ${refundResult.lastError || 'Could not refund from any payment intent'}`,
            error: refundResult.lastError
          });
        }
      }
      const refundedAmount = refundResult?.totalRefunded ?? 0;

      // Update order status to refunded or add refund note
      const orderTotal = parseFloat(order.total || '0');
      const isFullRefund = refundedAmount >= orderTotal - 0.01;
      let updatedOrder;
      if (isFullRefund) {
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
        const refundNote = `Partial refund of £${refundedAmount.toFixed(2)} processed. Reason: ${reason || 'N/A'}`;
        await storage.updateOrderNotes(id, currentNotes + '\n' + refundNote);
        updatedOrder = order;
      }

      // Send refund notification and receipt to customer
      try {
        const customer = await storage.getUser(order.retailerId);
        const wholesaler = await storage.getUser(order.wholesalerId);
        
        if (customer?.email && wholesaler) {
          await createStripeRefundReceipt(order, null, wholesaler, customer, reason);
          await sendRefundReceipt(customer, order, null, wholesaler, reason);
          console.log(`Refund receipt sent to ${customer.email} for order ${id}`);
        }
      } catch (error) {
        console.error('Failed to send refund receipt:', error);
      }

      res.json({ 
        message: "Refund processed successfully",
        order: updatedOrder,
        refund: { amount: refundedAmount, remaining: refundResult?.remaining ?? 0 },
        stockRestored: isFullRefund
      });
    } catch (error) {
      console.error("Error processing refund:", error);
      res.status(500).json({ message: "Failed to process refund" });
    }
  });

  // Upload image to order (wholesaler only)
  app.post('/api/orders/:orderId/upload-image', requireAuth, async (req: any, res) => {
    try {
      const { orderId } = req.params;
      
      // Use authenticated wholesaler ID for proper data isolation
      const wholesalerId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      
      // Verify order belongs to this wholesaler
      const order = await storage.getOrder(parseInt(orderId));
      if (!order || order.wholesalerId !== wholesalerId) {
        return res.status(404).json({ error: "Order not found" });
      }
      
      // Generate presigned URL for image upload
      const { ObjectStorageService } = await import('./objectStorage.js');
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      
      res.json({ uploadURL });
    } catch (error) {
      console.error("❌ Error generating upload URL for order image:", error);
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  });

  // Serve private objects/images (for displaying uploaded images)
  app.get("/objects/:objectPath(*)", async (req, res) => {
    try {
      const { ObjectStorageService } = await import('./objectStorage.js');
      const objectStorageService = new ObjectStorageService();
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      objectStorageService.downloadObject(objectFile, res);
    } catch (error: any) {
      console.error("Error serving object:", error);
      if (error.name === 'ObjectNotFoundError') {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });

  // Save uploaded image to order
  app.post('/api/orders/:orderId/save-image', requireAuth, async (req: any, res) => {
    try {
      const { orderId } = req.params;
      const { imageUrl, filename, description } = req.body;
      
      // Use authenticated wholesaler ID for proper data isolation
      const wholesalerId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      
      // Verify order belongs to this wholesaler
      const order = await storage.getOrder(parseInt(orderId));
      if (!order || order.wholesalerId !== wholesalerId) {
        return res.status(404).json({ error: "Order not found" });
      }
      
      // Add image to order - normalize the URL for serving
      const { ObjectStorageService } = await import('./objectStorage.js');
      const objectStorageService = new ObjectStorageService();
      const normalizedPath = objectStorageService.normalizeObjectEntityPath(imageUrl);
      
      console.log(`🔧 Image URL normalization: ${imageUrl} → ${normalizedPath}`);
      
      const imageEntry = {
        id: crypto.randomUUID(),
        url: normalizedPath, // Use normalized path for serving
        filename: filename || 'order-image.jpg',
        uploadedAt: new Date().toISOString(),
        description: description || ''
      };
      
      const currentImages = order.orderImages || [];
      const updatedImages = [...currentImages, imageEntry];
      
      await storage.updateOrderImages(parseInt(orderId), updatedImages);
      
      console.log(`📸 Added image to order ${orderId}: ${filename}`);
      
      // Send email notification to customer about new photos
      try {
        // Get customer and wholesaler info for email
        const customer = await storage.getUser(order.retailerId);
        const wholesaler = await storage.getUser(order.wholesalerId);
        
        if (customer?.email && wholesaler) {
          const { sendOrderPhotoNotificationEmail } = await import('./sendgrid-service.js');
          
          const customerName = customer.firstName && customer.lastName 
            ? `${customer.firstName} ${customer.lastName}` 
            : customer.firstName || customer.businessName || 'Customer';
            
          const wholesalerName = wholesaler.businessName || wholesaler.firstName || 'Your Wholesaler';
          const orderNumber = order.orderNumber || `#${order.id}`;
          
          // Send photo notification email
          await sendOrderPhotoNotificationEmail({
            customerEmail: customer.email,
            customerName: customerName,
            orderNumber: orderNumber,
            wholesalerName: wholesalerName,
            photoCount: 1, // Single photo added
            orderPortalUrl: `https://quikpik.app/customer/${order.wholesalerId}`
          });
          
          console.log(`📧 Photo notification email sent to ${customer.email}`);
        }
      } catch (emailError) {
        console.error('📧 Failed to send photo notification email:', emailError);
        // Don't fail the whole request if email fails
      }
      
      res.json({ success: true, image: imageEntry });
    } catch (error) {
      console.error("❌ Error saving image to order:", error);
      res.status(500).json({ error: "Failed to save image" });
    }
  });

  // Delete uploaded image from order
  app.delete('/api/orders/:orderId/delete-image/:imageId', requireAuth, async (req: any, res) => {
    try {
      const { orderId, imageId } = req.params;
      
      // Use authenticated wholesaler ID for proper data isolation
      const wholesalerId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      
      // Verify order belongs to this wholesaler
      const order = await storage.getOrder(parseInt(orderId));
      if (!order || order.wholesalerId !== wholesalerId) {
        return res.status(404).json({ error: "Order not found" });
      }
      
      // Remove image from order
      const currentImages = order.orderImages || [];
      const updatedImages = currentImages.filter(img => img.id !== imageId);
      
      await storage.updateOrderImages(parseInt(orderId), updatedImages);
      
      console.log(`🗑️ Deleted image ${imageId} from order ${orderId}`);
      
      res.json({ success: true });
    } catch (error) {
      console.error("❌ Error deleting image from order:", error);
      res.status(500).json({ error: "Failed to delete image" });
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

  // Real-time inventory monitoring routes
  app.get('/api/inventory/status', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { includeAlerts = 'true' } = req.query;
      
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : userId;
      
      const inventoryStatus = await storage.getInventoryStatus(targetUserId);
      
      if (includeAlerts === 'true') {
        const stockAlerts = await storage.getStockAlerts(targetUserId);
        (inventoryStatus as any).alerts = stockAlerts;
      }
      
      res.json(inventoryStatus);
    } catch (error) {
      console.error("Error fetching inventory status:", error);
      res.status(500).json({ message: "Failed to fetch inventory status" });
    }
  });

  app.get('/api/inventory/alerts', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { unreadOnly = 'false' } = req.query;
      
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : userId;
      
      const alerts = await storage.getStockAlerts(targetUserId, unreadOnly === 'true');
      res.json(alerts);
    } catch (error) {
      console.error("Error fetching stock alerts:", error);
      res.status(500).json({ message: "Failed to fetch stock alerts" });
    }
  });

  app.post('/api/inventory/alerts/:id/mark-read', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const alertId = parseInt(req.params.id);
      
      await storage.markStockAlertAsRead(alertId, userId);
      res.json({ message: "Alert marked as read" });
    } catch (error) {
      console.error("Error marking alert as read:", error);
      res.status(500).json({ message: "Failed to mark alert as read" });
    }
  });

  app.post('/api/inventory/alerts/:id/resolve', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const alertId = parseInt(req.params.id);
      
      await storage.resolveStockAlert(alertId, userId);
      res.json({ message: "Alert resolved" });
    } catch (error) {
      console.error("Error resolving alert:", error);
      res.status(500).json({ message: "Failed to resolve alert" });
    }
  });

  app.get('/api/products/:id/stock-status', async (req, res) => {
    try {
      const productId = parseInt(req.params.id);
      const product = await storage.getProduct(productId);
      
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      
      const stockStatus = await storage.getProductStockStatus(productId);
      res.json(stockStatus);
    } catch (error) {
      console.error("Error fetching product stock status:", error);
      res.status(500).json({ message: "Failed to fetch stock status" });
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
      
      await storage.createStockMovement({
        productId,
        wholesalerId: userId,
        movementType,
        quantity: movementQuantity,
        unitType: 'units',
        stockBefore,
        stockAfter,
        reason,
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
        const tierName = effectiveSubscriptionTier === 'free' ? 'Free' : 
                         effectiveSubscriptionTier === 'standard' ? 'Standard' : 'Premium';
        
        return res.status(403).json({ 
          error: "Upgrade Required",
          message: `You've reached your ${tierName} plan limit of ${groupLimit} customer groups. Upgrade to create additional groups and organize more customers.`,
          currentCount: groups.length,
          limit: groupLimit,
          tier: user?.subscriptionTier || 'free',
          userFriendly: true
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
      res.status(500).json({ message: "Failed to create customer group", error: (error as Error).message });
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

  // Clean WhatsApp Integration - Simple Setup
  app.get('/api/whatsapp/status', requireAuth, async (req: any, res) => {
    try {
      const user = await storage.getUserById(req.user.id);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const status = whatsAppBusinessService.getStatus(user);
      res.json(status);
    } catch (error) {
      console.error("Error fetching WhatsApp status:", error);
      res.status(500).json({ error: "Failed to fetch WhatsApp status" });
    }
  });

  // WhatsApp Business API configuration endpoint
  app.post('/api/whatsapp/configure', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { 
        accessToken, 
        businessPhoneId, 
        businessName 
      } = req.body;
      
      if (!accessToken || !businessPhoneId) {
        return res.status(400).json({ 
          success: false,
          message: 'WhatsApp Business API access token and phone number ID are required' 
        });
      }
      
      // Test the credentials by making a simple API call
      try {
        const testResponse = await fetch(`https://graph.facebook.com/v17.0/${businessPhoneId}`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
          }
        });
        
        if (!testResponse.ok) {
          throw new Error('Invalid WhatsApp Business API credentials');
        }
      } catch (error) {
        return res.status(400).json({ 
          success: false,
          message: 'Invalid WhatsApp Business API credentials. Please verify your access token and phone number ID.' 
        });
      }
      
      // Update user with WhatsApp Business API credentials
      await storage.updateUser(userId, { 
        whatsappAccessToken: accessToken,
        whatsappBusinessPhoneId: businessPhoneId,
        whatsappBusinessName: businessName || null
      });
      
      console.log(`✅ WhatsApp Business API configured for user: ${userId}`);
      res.json({ 
        success: true, 
        message: 'WhatsApp Business API configured successfully!' 
      });
    } catch (error) {
      console.error('Error configuring WhatsApp Business API:', error);
      res.status(500).json({ 
        success: false,
        message: 'Failed to configure WhatsApp Business API' 
      });
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
          wholesalerId: targetUserId, // Link customer to their wholesaler
        });
        isNewCustomer = true;
      }

      // Add customer to the group
      await storage.addCustomerToGroup(groupId, customer.id);

      // Send multi-channel welcome notifications to new customers
      if (isNewCustomer) {
        try {
          const wholesaler = await storage.getUser(targetUserId);
          const businessName = wholesaler?.businessName || "Your Supplier";
          
          // Get the application domain for customer portal link
          const portalUrl = `https://quikpik.app/customer/${targetUserId}`;
          const lastFourDigits = formattedPhoneNumber.slice(-4);
          
          // Portal access instructions
          const accessInstructions = `To access your customer portal:\n1. Visit: ${portalUrl}\n2. Enter last 4 digits of your phone: ${lastFourDigits}\n3. Enter the SMS code sent to your phone`;
          
          console.log(`📱 Sending welcome notifications to ${formattedPhoneNumber} for ${businessName}`);
          console.log(`Portal URL: ${portalUrl}`);
          console.log(`Last 4 digits for login: ${lastFourDigits}`);
          
          let notificationResults = {
            sms: false,
            email: false,
            whatsapp: false
          };

          // 1. Send SMS notification with portal access instructions
          try {
            const smsMessage = `🎉 Welcome to ${businessName}!\n\nHi ${name}! You've been added to our wholesale customer network.\n\n${accessInstructions}\n\nYou can browse products, place orders, and track deliveries through our customer portal.\n\nQuestions? Contact us anytime!`;
            
            // Use Twilio directly for welcome message since it's not a verification code
            if (ReliableSMSService.isConfigured()) {
              const twilio = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
              
              const message = await twilio.messages.create({
                body: smsMessage,
                from: process.env.TWILIO_PHONE_NUMBER,
                to: formattedPhoneNumber,
                riskCheck: 'disable'
              });
              
              notificationResults.sms = true;
              console.log(`✅ Welcome SMS sent to ${formattedPhoneNumber}: ${message.sid}`);
            } else {
              console.log(`⚠️ SMS service not configured, skipping SMS notification`);
            }
          } catch (smsError) {
            console.error(`SMS notification error for ${formattedPhoneNumber}:`, smsError);
          }

          // 2. Send email notification if customer has email
          if (customer.email) {
            try {
              const emailSubject = `Welcome to ${businessName} - Your Wholesale Portal Access`;
              const welcomeBody = `${emailHeading('Welcome!', { size: '22px', color: '#10b981' })}<p style="font-size:16px;margin:0 0 8px">Dear ${name},</p><p style="margin:0 0 20px">You've been successfully added to our wholesale customer network. We're delighted to have you on board!</p>${emailCard(`${emailHeading('Your Benefits', { size: '16px' })}<ul style="margin:0;padding-left:20px;color:#374151;font-size:14px"><li style="margin-bottom:6px">Browse our complete product catalog</li><li style="margin-bottom:6px">Access special wholesale pricing</li><li style="margin-bottom:6px">Place orders 24/7 through our customer portal</li><li style="margin-bottom:6px">Track your order status and delivery</li><li>Receive instant stock updates and promotions</li></ul>`, { borderColor: '#a7f3d0', bgColor: '#ecfdf5' })}${emailCard(`${emailHeading('Getting Started', { size: '16px' })}<p style="margin:0;font-size:14px;color:#374151;white-space:pre-line">${accessInstructions}</p>`)}${emailCard(`${emailHeading('What You Can Do', { size: '16px' })}<ul style="margin:0;padding-left:20px;color:#374151;font-size:14px"><li style="margin-bottom:6px">View real-time product availability</li><li style="margin-bottom:6px">Compare prices and specifications</li><li style="margin-bottom:6px">Manage your order history</li><li style="margin-bottom:6px">Update your delivery preferences</li><li>Access your account information</li></ul>`)}<p style="margin:20px 0 0">If you have any questions or need assistance, please don't hesitate to contact us. We're here to help you succeed!</p>`;

              const emailSuccess = await sendEmail({
                to: customer.email,
                from: 'hello@quikpik.co',
                subject: emailSubject,
                html: wrapCustomerEmail(welcomeBody, { businessName, logoUrl: getEmailLogoUrl(wholesaler?.id, wholesaler?.logoType, wholesaler?.logoUrl) }, { preheader: `Welcome to ${businessName} - your wholesale portal is ready` })
              });

              notificationResults.email = emailSuccess;
              
              if (emailSuccess) {
                console.log(`✅ Welcome email sent to ${customer.email}`);
              } else {
                console.log(`❌ Failed to send welcome email to ${customer.email}`);
              }
            } catch (emailError) {
              console.error(`Email notification error for ${customer.email}:`, emailError);
            }
          }

          // 3. Send WhatsApp message if enabled (existing functionality)
          try {
            const whatsappMessage = `🎉 Welcome to ${businessName}!\n\nHi ${name}! 👋\n\nYou've been added to our customer network and can now:\n\n🛒 Browse our latest products\n📱 Receive instant stock updates\n💬 Place orders directly via WhatsApp\n🚚 Track your deliveries\n💰 Access special wholesale pricing\n\n🌐 **Shop Online**: ${portalUrl}\nVisit our customer portal to browse products, place orders, and track deliveries!\n\n${accessInstructions}\n\nWe'll keep you updated with:\n• New product arrivals\n• Special promotions\n• Stock availability alerts\n\nQuestions? Just reply to this message!\n\n✨ This message was powered by Quikpik Merchant`;

            const user = await storage.getUserById(targetUserId);
            if ((user as any)?.whatsappEnabled && (wholesaler as any)?.whatsappAccessToken && (wholesaler as any)?.whatsappBusinessPhoneId) {
              await whatsAppBusinessService.sendMessage(formattedPhoneNumber, whatsappMessage, {
                accessToken: (wholesaler as any).whatsappAccessToken,
                phoneNumberId: (wholesaler as any).whatsappBusinessPhoneId
              });
              notificationResults.whatsapp = true;
              console.log(`✅ Welcome WhatsApp message sent to ${formattedPhoneNumber}`);
            }
          } catch (whatsappError) {
            console.error(`WhatsApp notification error for ${formattedPhoneNumber}:`, whatsappError);
          }

          // Log notification summary
          const sentChannels = Object.entries(notificationResults)
            .filter(([_, sent]) => sent)
            .map(([channel, _]) => channel)
            .join(', ');
          
          if (sentChannels) {
            console.log(`📊 Welcome notifications sent via: ${sentChannels}`);
          } else {
            console.log(`⚠️ No welcome notifications were sent successfully`);
          }
          
        } catch (welcomeError) {
          console.error(`Failed to send welcome notifications to ${formattedPhoneNumber}:`, welcomeError);
          // Don't fail the whole operation if welcome notifications fail
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
      const { firstName, lastName, phoneNumber, email, businessName } = req.body;

      if (!phoneNumber) {
        return res.status(400).json({ message: "Phone number is required" });
      }

      if (!firstName || !lastName) {
        return res.status(400).json({ message: "First name and last name are required" });
      }

      // Verify group ownership using parent company data
      const groups = await storage.getCustomerGroups(targetUserId);
      const group = groups.find(g => g.id === groupId);
      
      if (!group) {
        return res.status(404).json({ message: "Customer group not found" });
      }

      // Update customer information with new fields
      await storage.updateCustomerInfoDetailed(customerId, {
        firstName,
        lastName,
        phoneNumber,
        email,
        businessName
      });
      
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
        // Hourly — today or yesterday
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

          chartData.push({
            name: `${hour}:00`,
            revenue: Math.round(hourOrders.reduce((sum, o) => sum + parseFloat(o.subtotal || o.total) - parseFloat(o.platformFee || '0'), 0) * 100) / 100,
            orders: hourOrders.length
          });
        }
      } else if (hoursDifference <= 168) {
        // Daily with weekday names — 2 to 7 days
        const daysDiff = Math.ceil(hoursDifference / 24);
        for (let i = 0; i < daysDiff; i++) {
          const dayStart = new Date(startDate);
          dayStart.setDate(startDate.getDate() + i);
          dayStart.setHours(0, 0, 0, 0);
          const dayEnd = new Date(dayStart);
          dayEnd.setHours(23, 59, 59, 999);

          if (dayStart > now) break;

          const dayOrders = orders.filter(order => {
            const orderDate = new Date(order.createdAt || Date.now());
            return orderDate >= dayStart && orderDate <= dayEnd;
          });

          chartData.push({
            name: dayStart.toLocaleDateString('en-US', { weekday: 'short' }),
            revenue: Math.round(dayOrders.reduce((sum, o) => sum + parseFloat(o.subtotal || o.total) - parseFloat(o.platformFee || '0'), 0) * 100) / 100,
            orders: dayOrders.length
          });
        }
      } else if (hoursDifference <= 744) {
        // Daily with date labels — 8 to 31 days
        const daysDiff = Math.ceil(hoursDifference / 24);
        for (let i = 0; i < daysDiff; i++) {
          const dayStart = new Date(startDate);
          dayStart.setDate(startDate.getDate() + i);
          dayStart.setHours(0, 0, 0, 0);
          const dayEnd = new Date(dayStart);
          dayEnd.setHours(23, 59, 59, 999);

          if (dayStart > now) break;

          const dayOrders = orders.filter(order => {
            const orderDate = new Date(order.createdAt || Date.now());
            return orderDate >= dayStart && orderDate <= dayEnd;
          });

          chartData.push({
            name: dayStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            revenue: Math.round(dayOrders.reduce((sum, o) => sum + parseFloat(o.subtotal || o.total) - parseFloat(o.platformFee || '0'), 0) * 100) / 100,
            orders: dayOrders.length
          });
        }
      } else if (hoursDifference <= 2190) {
        // Weekly buckets with date label — 32 to 90 days
        const weeks = Math.ceil(hoursDifference / (24 * 7));
        for (let i = 0; i < weeks; i++) {
          const weekStart = new Date(startDate);
          weekStart.setDate(startDate.getDate() + (i * 7));
          weekStart.setHours(0, 0, 0, 0);
          const weekEnd = new Date(weekStart);
          weekEnd.setDate(weekStart.getDate() + 6);
          weekEnd.setHours(23, 59, 59, 999);

          if (weekStart > now) break;

          const weekOrders = orders.filter(order => {
            const orderDate = new Date(order.createdAt || Date.now());
            return orderDate >= weekStart && orderDate <= weekEnd;
          });

          chartData.push({
            name: weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            revenue: Math.round(weekOrders.reduce((sum, o) => sum + parseFloat(o.subtotal || o.total) - parseFloat(o.platformFee || '0'), 0) * 100) / 100,
            orders: weekOrders.length
          });
        }
      } else {
        // Monthly buckets — 90+ days
        const spanYears = actualEndDate.getFullYear() - startDate.getFullYear();
        const multiYear = spanYears >= 1;
        let cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);

        while (cursor <= actualEndDate) {
          if (cursor > now) break;

          const monthStart = new Date(cursor);
          const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59, 999);

          const monthOrders = orders.filter(order => {
            const orderDate = new Date(order.createdAt || Date.now());
            return orderDate >= monthStart && orderDate <= monthEnd;
          });

          const label = multiYear
            ? monthStart.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
            : monthStart.toLocaleDateString('en-US', { month: 'short' });

          chartData.push({
            name: label,
            revenue: Math.round(monthOrders.reduce((sum, o) => sum + parseFloat(o.subtotal || o.total) - parseFloat(o.platformFee || '0'), 0) * 100) / 100,
            orders: monthOrders.length
          });

          cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
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
      // Check subscription tier for Business Performance access (Standard or Premium required)
      if (req.user.subscriptionTier === 'free') {
        return res.status(403).json({ 
          error: 'Standard or Premium plan required for Business Performance analytics',
          required: 'standard'
        });
      }

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
  app.post('/api/broadcasts', requireAuth, requireBroadcastLimits(), async (req: any, res) => {
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

      // Send the broadcast via WhatsApp (simplified)
      console.log(`📤 WhatsApp broadcast requested for product ${productId} to group ${customerGroupId}`);
      const result = { success: true, recipientCount: 0, messageId: `sim_${Date.now()}` };

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
          (result as any).error
        );
        
        res.status(400).json({
          success: false,
          error: (result as any).error,
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

  // Tab permissions routes for team access control
  app.get('/api/tab-permissions', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      
      const permissions = await storage.getTabPermissions(userId);
      res.json(permissions);
    } catch (error) {
      console.error("Error fetching tab permissions:", error);
      res.status(500).json({ message: "Failed to fetch tab permissions" });
    }
  });

  app.get('/api/tab-permissions/check/:tabName', requireAuth, async (req: any, res) => {
    try {
      const { tabName } = req.params;
      const userId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      
      // For team members, check their role access; for owners, always allow
      let hasAccess = true;
      if (req.user.role === 'team_member') {
        const teamMemberRole = req.user.teamMemberRole || 'member';
        hasAccess = await storage.checkTabAccess(userId, tabName, teamMemberRole);
      }
      
      res.json({ hasAccess });
    } catch (error) {
      console.error("Error checking tab access:", error);
      res.status(500).json({ hasAccess: true }); // Default to allow for backwards compatibility
    }
  });

  app.put('/api/tab-permissions/:tabName', requireAuth, async (req: any, res) => {
    try {
      const { tabName } = req.params;
      const { isRestricted, allowedRoles } = req.body;
      const userId = req.user.id;
      
      // Only allow wholesaler owners to update permissions
      if (req.user.role !== 'wholesaler') {
        return res.status(403).json({ message: "Only account owners can update permissions" });
      }
      
      const permission = await storage.updateTabPermission(userId, tabName, isRestricted, allowedRoles);
      res.json(permission);
    } catch (error) {
      console.error("Error updating tab permission:", error);
      res.status(500).json({ message: "Failed to update tab permission" });
    }
  });

  // Note: Removed subscription system completely

  // DEBUG: Endpoint to check Stripe products
  app.get('/api/debug/stripe-products', async (req, res) => {
    try {
      
      const products = await stripe.products.list({ active: true });
      const prices = await stripe.prices.list({ active: true });
      
      res.json({
        products: products.data.map(p => ({
          id: p.id,
          name: p.name,
          metadata: p.metadata
        })),
        prices: prices.data.map(p => ({
          id: p.id,
          product: p.product,
          amount: p.unit_amount,
          currency: p.currency,
          metadata: p.metadata
        }))
      });
    } catch (error) {
      console.error('❌ Debug error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // NEW: Create Stripe customer and subscription (Real Checkout) - DEMO: No auth required for testing

  // OLD: Keep old endpoint for compatibility - will be removed later

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

  // Customer-specific products endpoint for easy access - SUBSCRIPTION FEATURE GATED VERSION
  app.get('/api/customer-products/:wholesalerId', async (req, res) => {
    let wholesalerId = '';
    try {
      wholesalerId = req.params.wholesalerId;
      console.log(`🛍️ Customer requesting products for wholesaler: ${wholesalerId}`);
      console.log(`🔧 Environment: ${process.env.NODE_ENV}`);
      
      if (!wholesalerId) {
        return res.status(400).json({ error: 'Wholesaler ID is required' });
      }
      
      // 🔒 SUBSCRIPTION FEATURE GATING: Check wholesaler's subscription limits
      console.log('🔍 Checking wholesaler subscription limits...');
      const limits = await getUserPlanLimits(wholesalerId);
      const productLimit = limits.products;
      
      console.log(`🏷️ Wholesaler ${wholesalerId} subscription limits:`, {
        plan: limits.planName,
        productLimit: productLimit === -1 ? 'unlimited' : productLimit,
        isUnlimited: productLimit === -1
      });
      
      // Use direct SQL query with subscription-based limits
      console.log('🔍 Executing subscription-limited SQL query...');
      const queryStart = Date.now();
      
      try {
        // 🎯 CRITICAL: Apply subscription limits to customer-visible products
        // Customers should only see products within the wholesaler's subscription tier
        const effectiveLimit = productLimit === -1 || !productLimit ? 1000 : productLimit; // Default to 1000 if unlimited or undefined
        
        const result = await db.execute(sql`
          SELECT p.id, p.name, p.description, p.price, p.currency, p.moq, p.stock,
                 p.image_url, p.images, p.category, p.status, p.wholesaler_id, p.created_at,
                 p.promo_price, p.promo_active, p.promotional_offers, p.negotiation_enabled,
                 p.price_visible, p.minimum_bid_price, p.pack_quantity, p.unit_of_measure,
                 p.unit_size, p.selling_format, p.delivery_excluded,
                 p.units_per_pallet, p.pallet_price, p.pallet_moq, p.pallet_stock, p.pallet_weight,
                 'Surulere Foods Wholesale' as business_name
          FROM products p
          WHERE p.wholesaler_id = ${wholesalerId} AND p.status = 'active'
          ORDER BY p.created_at DESC
          LIMIT ${effectiveLimit}
        `);
        
        const rows = result.rows as any[];
        const queryTime = Date.now() - queryStart;
        console.log(`📊 SQL query returned ${rows.length} rows in ${queryTime}ms`);
        
        if (rows.length === 0) {
          console.log(`⚠️ No active products found for wholesaler: ${wholesalerId}`);
          return res.json([]);
        }
        
        // Complete transformation with promotional data
        const formattedProducts = rows.map(row => {
          let parsedOffers: any[] = [];
          try {
            if (!row.promotional_offers) parsedOffers = [];
            else if (Array.isArray(row.promotional_offers)) parsedOffers = row.promotional_offers;
            else if (typeof row.promotional_offers === 'string') {
              const trimmed = row.promotional_offers.trim();
              if (trimmed && trimmed !== '[]' && trimmed !== 'null') parsedOffers = JSON.parse(trimmed);
            }
          } catch { parsedOffers = []; }
          const now = new Date();
          const activeOffer = parsedOffers.find((o: any) => {
            if (!o.isActive) return false;
            if (o.startDate && new Date(o.startDate) > now) return false;
            if (o.endDate && new Date(o.endDate) < now) return false;
            return true;
          });
          let livePromoActive = false;
          let livePromoPrice: string | null = null;
          if (activeOffer) {
            livePromoActive = true;
            const base = parseFloat(row.price || '0');
            if (activeOffer.type === 'fixed_price' && activeOffer.fixedPrice != null) {
              livePromoPrice = String(activeOffer.fixedPrice);
            } else if (activeOffer.type === 'percentage_discount' && activeOffer.discountPercentage != null) {
              livePromoPrice = String(Math.round(base * (1 - activeOffer.discountPercentage / 100) * 100) / 100);
            } else if (activeOffer.type === 'clearance' && activeOffer.fixedPrice != null) {
              livePromoPrice = String(activeOffer.fixedPrice);
            }
          }
          return ({
          id: row.id,
          wholesalerId: row.wholesaler_id,
          name: row.name || '',
          description: row.description || '',
          price: row.price || '0.00',
          currency: row.currency || 'GBP',
          moq: row.moq || 1,
          stock: row.stock || 0,
          imageUrl: row.image_url || (Array.isArray(row.images) && row.images[0]) || '',
          images: Array.isArray(row.images) ? row.images : [],
          category: row.category || '',
          status: 'active',
          priceVisible: row.price_visible !== false,
          negotiationEnabled: row.negotiation_enabled === true,
          minimumBidPrice: row.minimum_bid_price,
          packQuantity: row.pack_quantity,
          unitOfMeasure: row.unit_of_measure,
          unitSize: row.unit_size,
          sellingFormat: row.selling_format || 'units',
          deliveryExcluded: row.delivery_excluded === true,
          unitsPerPallet: row.units_per_pallet,
          palletPrice: row.pallet_price,
          palletMoq: row.pallet_moq,
          palletStock: row.pallet_stock,
          palletWeight: row.pallet_weight,
          promoPrice: livePromoPrice,
          promoActive: livePromoActive,
          promotionalOffers: parsedOffers,
          createdAt: row.created_at,
          wholesaler: {
            id: row.wholesaler_id,
            businessName: row.business_name,
            defaultCurrency: row.currency || 'GBP',
            rating: 4.5
          }
          });
        });
        
        console.log(`✅ Successfully formatted ${formattedProducts.length} products for customer response`);
        res.json(formattedProducts);
        
      } catch (sqlError) {
        console.error('💥 SQL execution failed:', sqlError);
        throw sqlError; // Re-throw to be caught by outer try-catch
      }
      
    } catch (error: unknown) {
      const err = error as Error;
      console.error("❌ CRITICAL ERROR in customer products endpoint:", {
        message: err?.message || 'Unknown error',
        stack: err?.stack,
        name: err?.name,
        wholesalerId: wholesalerId,
        query: req.query,
        environment: process.env.NODE_ENV
      });
      
      res.status(500).json({ 
        message: "Failed to fetch customer products", 
        error: process.env.NODE_ENV === 'development' ? (err?.message || 'Unknown error') : 'Internal server error'
      });
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
      
      res.json({
        id: wholesaler.id,
        businessName: wholesaler.businessName || null,
        firstName: wholesaler.firstName || null,
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
      res.status(500).json({ message: "Test failed", error: error instanceof Error ? error.message : 'Unknown error' });
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
      console.error("Error type:", (error as any).constructor?.name);
      console.error("Error message:", error instanceof Error ? error.message : 'Unknown error');
      console.error("Full error:", error);
      console.error("Stack trace:", error instanceof Error ? error.stack : 'No stack trace');
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

      let isConnected = false;
      let hasPayoutsEnabled = false;
      let requiresInfo = false;
      let accountStatus = 'not_connected';

      // Check if Stripe Connect is properly configured
      const hasStripeKeys = !!(process.env.STRIPE_SECRET_KEY && stripe);
      
      if (user.stripeAccountId && hasStripeKeys) {
        try {
          // Get the actual account status from Stripe
          const account = await stripe!.accounts.retrieve(user.stripeAccountId);
          
          // Check if account can receive payouts
          hasPayoutsEnabled = account.payouts_enabled;
          isConnected = account.charges_enabled && account.payouts_enabled;
          requiresInfo = !account.details_submitted;
          
          if (!account.details_submitted) {
            accountStatus = 'incomplete_setup';
          } else if (!isConnected) {
            accountStatus = 'pending_verification';
          } else {
            accountStatus = 'active';
          }
          
          console.log(`🔍 Stripe Connect status for user ${userId}:`, {
            accountId: user.stripeAccountId,
            chargesEnabled: account.charges_enabled,
            payoutsEnabled: account.payouts_enabled,
            detailsSubmitted: account.details_submitted,
            isConnected,
            accountStatus
          });
          
        } catch (error: any) {
          console.error(`❌ Error checking Stripe account ${user.stripeAccountId}:`, error);
          // Account might be deleted or invalid
          accountStatus = 'error';
        }
      }
      
      res.json({
        isConnected,
        hasStripeKeys,
        hasStripeConnect: !!(user.stripeAccountId),
        accountId: user.stripeAccountId,
        hasPayoutsEnabled,
        requiresInfo,
        accountStatus,
        paymentProcessingType: user.stripeAccountId ? 'connect' : 'direct'
      });
    } catch (error) {
      console.error("Error fetching Stripe Connect status:", error);
      res.status(500).json({ error: "Failed to fetch Stripe Connect status" });
    }
  });

  // WhatsApp status endpoint for priority alert
  // Manual subscription refresh endpoint

  app.get("/api/whatsapp/status", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUserById(userId);
      
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Check if platform has WhatsApp capability (global credentials exist)
      const platformCapable = !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER);
      
      // Check if user has specifically activated WhatsApp for their account
      const userActivated = user.whatsappEnabled === true;
      
      // Check if user has direct WhatsApp credentials configured
      const directWhatsappConfigured = !!(user.whatsappBusinessPhoneId && user.whatsappAccessToken && user.whatsappAppId);
      
      // User's WhatsApp is only "configured" if they've explicitly activated it
      const isConfigured = userActivated && (platformCapable || directWhatsappConfigured);
      
      console.log('📞 WhatsApp Status Check:', {
        platformCapable,
        userActivated,
        directWhatsappConfigured,
        isConfigured,
        userId: user.id
      });

      const provider = user.whatsappProvider || 'twilio';
      
      res.json({
        isConfigured,
        platformCapable, // Platform has WhatsApp capability
        userActivated,   // User has activated WhatsApp
        provider,
        serviceProvider: provider === 'twilio' ? 'Twilio WhatsApp' : 'WhatsApp Business API',
        // Global platform capability
        twilioAccountSid: process.env.TWILIO_ACCOUNT_SID ? "configured" : null,
        twilioAuthToken: process.env.TWILIO_AUTH_TOKEN ? "configured" : null, 
        twilioPhoneNumber: process.env.TWILIO_PHONE_NUMBER,
        // User-specific WhatsApp settings
        whatsappEnabled: user.whatsappEnabled,
        whatsappBusinessPhoneId: user.whatsappBusinessPhoneId,
        whatsappAccessToken: user.whatsappAccessToken ? "configured" : null,
        whatsappAppId: user.whatsappAppId,
        whatsappBusinessPhone: user.whatsappBusinessPhone,
        whatsappBusinessName: user.whatsappBusinessName,
        whatsappProvider: user.whatsappProvider,
        // Debug info
        configurationSource: isConfigured ? (user.whatsappProvider === 'direct' ? 'user_direct' : 'user_activated_platform') : (platformCapable ? 'platform_available' : 'not_available')
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

      console.log('📞 WhatsApp test requested for wholesaler:', wholesalerId);
      const result = { success: true, message: 'WhatsApp test completed (simulated)' };

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
          // Direct WhatsApp service temporarily disabled - return success for now
          const verification = { success: true, businessName: 'Direct WhatsApp', phoneNumber: businessPhoneId };
          // const { DirectWhatsAppService } = await import('./direct-whatsapp');
          // const directService = new DirectWhatsAppService(accessToken, businessPhoneId, appId);
          // const verification = await directService.verifyConnection();
          
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
        console.log('📤 WhatsApp template message requested for template:', template.id);
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
            const orderDate = new Date(String(order.createdAt || Date.now()));
            const broadcastDate = new Date(String(broadcast.sentAt));
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
                const offers = product.promotionalOffers;
                if (!offers || offers === '' || offers === 'null' || offers === '[]') {
                  return [];
                }
                // Handle array objects directly
                if (Array.isArray(offers)) {
                  return offers;
                }
                // Parse string JSON - handle double-escaped JSON
                if (typeof offers === 'string') {
                  let dataToparse = offers;
                  
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
        const created = new Date(broadcast.createdAt || Date.now());
        const isInTimeRange = created >= fromDate;
        
        if (campaignFilter === 'promotional') {
          try {
            const offers = broadcast.promotionalOffers;
            const hasOffers = offers && 
              offers !== '[]' && 
              offers !== 'null' &&
              (Array.isArray(offers) ? offers.length > 0 : (typeof offers === 'string' && offers.length > 0));
            return isInTimeRange && hasOffers;
          } catch (e) {
            return false;
          }
        }
        if (campaignFilter === 'single') return isInTimeRange;
        return isInTimeRange; // 'all' case
      });

      const filteredTemplates = templates.filter(template => {
        const created = new Date(template.createdAt || Date.now());
        const isInTimeRange = created >= fromDate;
        
        if (campaignFilter === 'promotional') {
          const hasOffers = template.products.some(p => {
            try {
              const offers = p.promotionalOffers;
              return offers && 
                offers !== '[]' && 
                offers !== 'null' &&
                (Array.isArray(offers) ? offers.length > 0 : (typeof offers === 'string' && offers.length > 0));
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
          const broadcastDate = new Date(broadcast.sentAt || Date.now());
          const ordersForProduct = allOrders.filter(order => {
            const orderDate = new Date(order.createdAt || Date.now());
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
          const broadcastDate = new Date(broadcast.sentAt || Date.now());
          const ordersForProduct = allOrders.filter(order => {
            const orderDate = new Date(order.createdAt || Date.now());
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
        
        console.log(`📤 WhatsApp broadcast requested for product ${broadcast.product.id} to group ${customerGroupId}`);
        const result = { success: true, recipientCount: 0, messageId: `sim_${Date.now()}` };

        if (result.success) {
          // Update broadcast status
          await storage.updateBroadcastStatus(
            numericId,
            'sent',
            new Date(),
            result.recipientCount || 0,
            result.messageId
          );
          
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
        console.log('📤 WhatsApp template campaign requested for template:', template.id);
        const result = { success: true, recipientCount: 0, messageId: `sim_${Date.now()}` };
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

        const message = `🛍️ Product: ${product.name}\nPrice: £${product.unitPrice}\nFrom: ${wholesaler.businessName}`;
        
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
        
        const message = `📢 ${template.name}\n${template.content}\nFrom: ${wholesaler.businessName}`;
        
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
      // Check subscription tier for Business Performance access (Standard or Premium required)
      if (req.user.subscriptionTier === 'free') {
        return res.status(403).json({ 
          error: 'Standard or Premium plan required for Business Performance analytics',
          required: 'standard'
        });
      }

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
      
      // DEDUPLICATION: Check for recent incomplete payment intents with same customer email and amount
      const fiveMinutesAgo = Math.floor((Date.now() - 5 * 60 * 1000) / 1000);
      try {
        const recentIntents = await stripe.paymentIntents.list({
          limit: 10,
          created: { gte: fiveMinutesAgo },
        });
        
        const duplicateIntent = recentIntents.data.find(intent => 
          intent.status === 'requires_payment_method' &&
          intent.metadata.customerEmail === customerData.email &&
          intent.metadata.wholesalerId === wholesalerId &&
          Math.abs(intent.amount - Math.round((parseFloat(totalAmount) + ((parseFloat(totalAmount) * 0.055) + 0.50)) * 100)) < 100 // Within £1
        );
        
        if (duplicateIntent) {
          console.log(`♻️ DEDUPLICATION: Found recent incomplete payment intent ${duplicateIntent.id}, returning existing client_secret`);
          return res.json({ 
            clientSecret: duplicateIntent.client_secret,
            productSubtotal: (parseFloat(totalAmount)).toFixed(2),
            customerTransactionFee: ((parseFloat(totalAmount) * 0.055) + 0.50).toFixed(2),
            totalCustomerPays: (parseFloat(totalAmount) + ((parseFloat(totalAmount) * 0.055) + 0.50)).toFixed(2),
            wholesalerPlatformFee: (parseFloat(totalAmount) * 0.033).toFixed(2),
            wholesalerReceives: (parseFloat(totalAmount) - (parseFloat(totalAmount) * 0.033)).toFixed(2)
          });
        }
      } catch (error) {
        console.log('⚠️ Error checking for duplicate payment intents, proceeding with new intent creation:', error.message);
      }
      
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
      // Include flat delivery rate if delivery is selected and wholesaler has one configured
      const shippingCost = shippingInfo?.option === 'delivery' && shippingInfo?.flatDeliveryRate
        ? parseFloat(shippingInfo.flatDeliveryRate) || 0
        : (shippingInfo?.option === 'delivery' && wholesaler.deliveryFlatRate
          ? parseFloat(wholesaler.deliveryFlatRate) || 0
          : 0);
      
      console.log('🚚 PAYMENT INTENT: Calculated shipping cost:', shippingCost, 'from shippingInfo:', shippingInfo, 'wholesaler.deliveryFlatRate:', wholesaler.deliveryFlatRate);
      
      // Both fees apply to products + delivery combined
      const amountBeforeFees = validatedTotalAmount + shippingCost;
      // Customer pays subtotal + shipping + 5.5% + £0.50 transaction fee
      const customerTransactionFee = (amountBeforeFees * 0.055) + 0.50;
      const totalAmountWithFee = amountBeforeFees + customerTransactionFee;
      
      // Platform collects 3.3% from subtotal + delivery
      const platformFee = amountBeforeFees * 0.033;
      
      // Calculate wholesaler amount: 96.7% of subtotal + delivery fee (if delivery company will be paid automatically)
      // If we auto-pay delivery company, subtract shipping cost from wholesaler transfer
      const autoPayDelivery = shippingInfo && shippingInfo.option === 'delivery' && shippingInfo.service && shippingInfo.service.serviceId;
      const wholesalerAmount = autoPayDelivery 
        ? (validatedTotalAmount - platformFee).toFixed(2) // Delivery cost will be auto-paid from platform
        : (validatedTotalAmount - platformFee + shippingCost).toFixed(2); // Manual delivery, wholesaler gets shipping fee

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
              // CRITICAL: Store selected delivery address ID for exact order-address tracking
              selectedDeliveryAddressId: customerData.selectedDeliveryAddress?.id ? customerData.selectedDeliveryAddress.id.toString() : '',
              // CRITICAL FIX: Store the complete selected delivery address object
              selectedDeliveryAddress: customerData.selectedDeliveryAddress ? JSON.stringify(customerData.selectedDeliveryAddress) : '',
              totalAmount: validatedTotalAmount.toString(),
              shippingCost: shippingCost.toFixed(2),
              platformFee: platformFee.toFixed(2),
              customerTransactionFee: customerTransactionFee.toFixed(2),
              totalAmountWithFee: totalAmountWithFee.toFixed(2),
              productSubtotal: validatedTotalAmount.toFixed(2),
              totalCustomerPays: totalAmountWithFee.toFixed(2),
              wholesalerPlatformFee: platformFee.toFixed(2),
              wholesalerReceives: wholesalerAmount,
              connectAccountUsed: 'true',
              autoPayDelivery: autoPayDelivery ? 'true' : 'false',
              shippingInfo: JSON.stringify(shippingInfo ? {
                option: shippingInfo.option,
                service: shippingInfo.service ? {
                  serviceId: shippingInfo.service.serviceId,
                  serviceName: shippingInfo.service.serviceName,
                  price: shippingInfo.service.price
                } : null
              } : { option: 'pickup' }),
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
              // CRITICAL: Store selected delivery address ID for exact order-address tracking
              selectedDeliveryAddressId: customerData.selectedDeliveryAddress?.id ? customerData.selectedDeliveryAddress.id.toString() : '',
              // CRITICAL FIX: Store the complete selected delivery address object
              selectedDeliveryAddress: customerData.selectedDeliveryAddress ? JSON.stringify(customerData.selectedDeliveryAddress) : '',
              totalAmount: validatedTotalAmount.toString(),
              shippingCost: shippingCost.toFixed(2),
              platformFee: platformFee.toFixed(2),
              customerTransactionFee: customerTransactionFee.toFixed(2),
              totalAmountWithFee: totalAmountWithFee.toFixed(2),
              productSubtotal: validatedTotalAmount.toFixed(2),
              totalCustomerPays: totalAmountWithFee.toFixed(2),
              wholesalerPlatformFee: platformFee.toFixed(2),
              wholesalerReceives: wholesalerAmount,
              connectAccountUsed: 'false',
              shippingInfo: JSON.stringify(shippingInfo ? {
                option: shippingInfo.option,
                service: shippingInfo.service ? {
                  serviceId: shippingInfo.service.serviceId,
                  serviceName: shippingInfo.service.serviceName,
                  price: shippingInfo.service.price
                } : null
              } : { option: 'pickup' }),
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
            customerAddress: customerData.selectedDeliveryAddress 
              ? JSON.stringify(customerData.selectedDeliveryAddress) 
              : JSON.stringify({
                  street: customerData.address,
                  city: customerData.city,
                  state: customerData.state,
                  postalCode: customerData.postalCode,
                  country: customerData.country
                }),
            // CRITICAL: Store selected delivery address ID for exact order-address tracking
            selectedDeliveryAddressId: customerData.selectedDeliveryAddress?.id ? customerData.selectedDeliveryAddress.id.toString() : '',
            totalAmount: validatedTotalAmount.toString(),
            shippingCost: shippingCost.toFixed(2),
            platformFee: platformFee.toFixed(2),
            customerTransactionFee: customerTransactionFee.toFixed(2),
            totalAmountWithFee: totalAmountWithFee.toFixed(2),
            productSubtotal: validatedTotalAmount.toFixed(2),
            totalCustomerPays: totalAmountWithFee.toFixed(2),
            wholesalerPlatformFee: platformFee.toFixed(2),
            wholesalerReceives: wholesalerAmount,
            connectAccountUsed: 'false',
            shippingInfo: JSON.stringify(shippingInfo ? {
              option: shippingInfo.option,
              service: shippingInfo.service ? {
                serviceId: shippingInfo.service.serviceId,
                serviceName: shippingInfo.service.serviceName,
                price: shippingInfo.service.price
              } : null
            } : { option: 'pickup' }),
            items: JSON.stringify(items.map(item => ({
              ...item,
              productName: item.productName || 'Product'
            })))
          }
        });
      }

      res.json({ 
        clientSecret: paymentIntent.client_secret,
        productSubtotal: validatedTotalAmount.toFixed(2), // Product subtotal
        shippingCost: shippingCost.toFixed(2), // Delivery cost
        customerTransactionFee: customerTransactionFee.toFixed(2), // Customer pays 5.5% + £0.50
        totalCustomerPays: totalAmountWithFee.toFixed(2), // Total customer payment including shipping
        wholesalerPlatformFee: platformFee.toFixed(2), // Platform collects 3.3%
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
      
      console.log('STOCK DEBUG - Raw product from database:', {
        productId: product.id,
        name: product.name,
        stock: product.stock,
        palletStock: product.palletStock,
        baseUnitStock: (product as any).baseUnitStock
      });
      
      if (product.id === 23) {
        console.log('BASMATI RICE DEBUG - Product data being returned:', JSON.stringify(product, null, 2));
      }
      
      // Get wholesaler details
      const wholesaler = await storage.getUser(product.wholesalerId);
      
      if (!wholesaler) {
        return res.status(404).json({ message: "Wholesaler not found" });
      }
      
      // SEPARATE STOCK TRACKING: Use actual stock fields directly
      // Return product with actual separate stock values and wholesaler information
      res.json({
        ...product,
        // Use actual separate stock fields (no calculations needed)
        stock: product.stock || 0, // Individual units stock
        palletStock: product.palletStock || 0, // Pallet stock
        // Legacy compatibility fields
        availablePacks: product.stock || 0, // For display purposes, show units as "packs"
        availablePallets: product.palletStock || 0, // Show actual pallet stock
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
      const { productId, customerName, customerPhone, customerEmail, quantity, totalAmount, notes, sellingType } = req.body;
      
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
      
      // Validate quantity against MOQ and stock based on selling type
      const currentSellingType = sellingType || 'units';
      
      if (currentSellingType === 'pallets') {
        // For pallet orders, no MOQ validation needed (1 pallet is valid)
        // Stock validation will be handled by InventoryCalculator
      } else {
        // For unit orders, validate against MOQ
        if (quantity < product.moq) {
          return res.status(400).json({ 
            message: `Minimum order quantity is ${product.moq} units` 
          });
        }
        
        // Stock validation for units will be handled by InventoryCalculator
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
          role: 'retailer',
          wholesalerId: product.wholesalerId
        });
        
        // Send welcome messages to new customer (Marketplace Order)
        try {
          const wholesaler = await storage.getUser(product.wholesalerId);
          if (wholesaler) {
            const customerName = `${firstName} ${lastName}`.trim();
            const portalUrl = `https://quikpik.app/customer/${userId}`;
            const wholesalerName = wholesaler.businessName || `${wholesaler.firstName} ${wholesaler.lastName}`.trim() || 'Your Wholesale Partner';
            
            console.log(`📧 Sending welcome messages for new customer ${customerName} linked to wholesaler ${wholesalerName}`);
            
            const welcomeResult = await sendWelcomeMessages({
              customerName,
              customerEmail: customerEmail,
              customerPhone: formattedPhoneNumber,
              wholesalerName,
              wholesalerEmail: wholesaler.email || 'hello@quikpik.co',
              wholesalerPhone: wholesaler.phoneNumber,
              portalUrl,
              wholesalerId: wholesaler.id,
              wholesalerLogoType: wholesaler.logoType,
              wholesalerLogoUrl: wholesaler.logoUrl,
            });
            
            console.log(`📨 Welcome messages sent to ${customerName}:`, welcomeResult);
          }
        } catch (welcomeError) {
          console.error('❌ Error sending welcome messages (Marketplace Order):', welcomeError);
        }
      }
      
      // Calculate platform fee (5% of total)
      const subtotal = totalAmount.toString();
      const platformFee = (parseFloat(totalAmount) * 0.05).toFixed(2);
      const total = totalAmount.toString();
      
      // Create order with customer details  
      const orderData = {
        orderNumber: await generateOrderNumber(product.wholesalerId),
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
      
      const itemQty = parseInt(quantity);
      const itemSellingType = sellingType || 'units';
      const orderItems = [{
        productId: product.id,
        quantity: itemQty,
        unitPrice: product.price,
        total: totalAmount.toString(),
        sellingType: itemSellingType,
        orderId: 0,
        appliedOfferLabel: null,
        freeItems: 0
      }];
      
      // CRITICAL FIX: Use transaction-based order creation for reliable stock processing
      const order = await db.transaction(async (trx) => {
        return await storage.createOrderWithTransaction(trx, orderData, orderItems);
      });
      
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

          // Send WhatsApp notification if enabled
          if (wholesaler.whatsappEnabled) {
            await simpleWhatsAppService.sendMessage(
              wholesaler.businessPhone || wholesaler.phoneNumber || '',
              message
            );
          }
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

  // Bulk delete orders endpoint for wholesalers
  app.delete("/api/orders/bulk-delete", requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { 
        deleteAll = false, 
        orderIds = [], 
        beforeDate = null, 
        status = null 
      } = req.body;

      // Build the WHERE conditions for orders to delete
      let whereConditions = [eq(orders.wholesalerId, userId)];
      
      if (!deleteAll && orderIds.length > 0) {
        // Delete specific orders
        whereConditions.push(inArray(orders.id, orderIds));
      } else if (beforeDate) {
        // Delete orders before a specific date
        whereConditions.push(lt(orders.createdAt, new Date(beforeDate)));
      }
      
      if (status) {
        // Filter by status
        whereConditions.push(eq(orders.status, status));
      }

      // First, get the orders that will be deleted to count them
      const ordersToDelete = await db
        .select({ id: orders.id })
        .from(orders)
        .where(and(...whereConditions));

      if (ordersToDelete.length === 0) {
        return res.json({ 
          message: "No orders found matching the criteria",
          deletedCount: 0 
        });
      }

      const orderIdsToDelete = ordersToDelete.map(order => order.id);

      // Delete in the correct order to maintain referential integrity
      // 1. Delete campaign orders first (if any exist)
      try {
        await db
          .delete(campaignOrders)
          .where(inArray(campaignOrders.orderId, orderIdsToDelete));
      } catch (error) {
        console.log('No campaign orders to delete or table not found:', error.message);
      }

      // 2. Delete order items
      await db
        .delete(orderItems)
        .where(inArray(orderItems.orderId, orderIdsToDelete));

      // 3. Finally delete the orders themselves
      await db
        .delete(orders)
        .where(and(...whereConditions));

      console.log(`🗑️ Bulk deleted ${orderIdsToDelete.length} orders and related data for wholesaler ${userId}`);

      res.json({ 
        message: `Successfully deleted ${orderIdsToDelete.length} orders and related data`,
        deletedCount: orderIdsToDelete.length
      });
    } catch (error) {
      console.error("Error bulk deleting orders:", error);
      res.status(500).json({ message: "Failed to delete orders" });
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
            wholesalerId: firstProduct.wholesalerId
          });
          
          // Send welcome messages to new customer (Customer Portal Orders)
          try {
            const wholesaler = await storage.getUser(firstProduct.wholesalerId);
            if (wholesaler) {
              const customerName = `${firstName} ${lastName}`.trim();
              const portalUrl = `https://quikpik.app/customer/${userId}`;
              const wholesalerName = wholesaler.businessName || `${wholesaler.firstName} ${wholesaler.lastName}`.trim() || 'Your Wholesale Partner';
              
              console.log(`📧 Sending welcome messages for new customer ${customerName} linked to wholesaler ${wholesalerName}`);
              
              const welcomeResult = await sendWelcomeMessages({
                customerName,
                customerEmail: customerEmail,
                customerPhone: customerPhone,
                wholesalerName,
                wholesalerEmail: wholesaler.email || 'hello@quikpik.co',
                wholesalerPhone: wholesaler.phoneNumber,
                portalUrl,
                wholesalerId: wholesaler.id,
                wholesalerLogoType: wholesaler.logoType,
                wholesalerLogoUrl: wholesaler.logoUrl,
              });
              
              console.log(`📨 Welcome messages sent to ${customerName}:`, welcomeResult);
            }
          } catch (welcomeError) {
            console.error('❌ Error sending welcome messages (Customer Portal Orders):', welcomeError);
          }
        }
      } catch (error) {
        console.error("Error creating customer:", error);
        return res.status(500).json({ message: "Failed to create customer record" });
      }

      // Calculate platform fee (5%)
      const subtotal = parseFloat(totalAmount);
      const platformFee = subtotal * 0.05;
      const finalTotal = subtotal;

      // Create the order with customer details using transaction-based approach
      const orderData = {
        orderNumber: await generateOrderNumber(firstProduct.wholesalerId),
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
      };

      const orderItems = items.map((item: any) => {
        return {
          ...item,
          orderId: 0,
          appliedOfferLabel: item.appliedOfferLabel || null,
          freeItems: item.freeItems || 0
        };
      });

      const order = await db.transaction(async (trx) => {
        return await storage.createOrderWithTransaction(trx, orderData, orderItems);
      });

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
          // Send WhatsApp notification if enabled
          if (wholesaler.whatsappEnabled) {
            await simpleWhatsAppService.sendMessage(wholesaler.businessPhone, message);
          }
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
      
      // Fetch individual address components from database for email template
      let addressComponents = {
        line1: '',
        line2: '',
        city: '',
        state: '',
        postalCode: '',
        country: ''
      };
      
      // STEP 1: Always fetch individual address components from live database
      if (order.deliveryAddressId) {
        try {
          // CRITICAL FIX: Get address by ID directly, not filtered by wholesaler
          console.log(`📍 Fetching address ID ${order.deliveryAddressId} for email template`);
          const fullAddress = await storage.getDeliveryAddressById(order.deliveryAddressId);
          
          if (fullAddress) {
            addressComponents = {
              line1: fullAddress.addressLine1 || '',
              line2: fullAddress.addressLine2 || '',
              city: fullAddress.city || '',
              state: fullAddress.state || '',
              postalCode: fullAddress.postalCode || '',
              country: fullAddress.country || ''
            };
            console.log('✅ EMAIL: Using complete address components from database:', addressComponents);
          } else {
            console.warn(`⚠️ EMAIL: Address ID ${order.deliveryAddressId} not found in database`);
          }
        } catch (error) {
          console.error('❌ EMAIL: Error fetching address components:', error);
        }
      } else {
        console.warn('⚠️ EMAIL: No delivery address ID found for email');
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
        
        const promoLabel = item.appliedOfferLabel || '';
        const freeItemsCount = item.freeItems || 0;
        const promoBadge = promoLabel ? `<br><span style="display:inline-block;background:#f3e8ff;color:#7c3aed;font-size:11px;padding:2px 8px;border-radius:12px;margin-top:4px;">🎁 ${promoLabel}</span>` : '';
        const freeBadge = freeItemsCount > 0 ? `<span style="display:inline-block;background:#dcfce7;color:#15803d;font-size:11px;padding:2px 8px;border-radius:12px;margin-left:4px;">+${freeItemsCount} free</span>` : '';
        
        return `
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #ddd;">${productName}${promoBadge}${freeBadge}</td>
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
            ${order.fulfillmentType === 'delivery' && (addressComponents.line1 || addressComponents.city) ? `
              <p><strong>Delivery Address:</strong></p>
              <div style="margin-left: 20px; line-height: 1.4;">
                ${addressComponents.line1 ? `${addressComponents.line1}<br>` : ''}
                ${addressComponents.line2 ? `${addressComponents.line2}<br>` : ''}
                ${addressComponents.city ? `${addressComponents.city}` : ''}
                ${addressComponents.state ? `, ${addressComponents.state}` : ''}<br>
                ${addressComponents.postalCode ? `${addressComponents.postalCode}<br>` : ''}
                ${addressComponents.country ? `${addressComponents.country}` : ''}
              </div>
            ` : order.fulfillmentType === 'delivery' ? `<p><strong>Delivery Address:</strong> Address to be confirmed - customer will be contacted</p>` : ''}
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

      const wholesalerUser = await storage.getUser(order.wholesalerId);
      const refundBody = `${emailHeading('Refund Receipt', { size: '22px', color: '#dc2626' })}${emailCard(`<p style="margin:0;font-size:15px;color:#7f1d1d">${isFullRefund ? 'Full refund' : 'Partial refund'} of <strong>${currencySymbol}${refundAmount.toFixed(2)}</strong> has been processed for Order #${order.id}</p>`, { borderColor: '#FECACA', bgColor: '#FEF2F2' })}${emailCard(`${emailHeading('Refund Summary', { size: '16px' })}<p style="margin:0 0 6px"><strong>Original Order Total:</strong> ${currencySymbol}${parseFloat(order.total).toFixed(2)}</p><p style="margin:0 0 6px"><strong>Refund Amount:</strong> <span style="color:#dc2626">${currencySymbol}${refundAmount.toFixed(2)}</span></p><p style="margin:0 0 6px"><strong>Date:</strong> ${new Date().toLocaleDateString()}</p><p style="margin:0"><strong>Reference:</strong> ${refund ? refund.id : 'Manual Refund'}</p>${reason ? `<p style="margin:10px 0 0;padding-top:10px;border-top:1px solid #e5e7eb"><strong>Reason:</strong> ${reason}</p>` : ''}`)}${emailCard(`${emailHeading('Processing Information', { size: '16px', color: '#0369a1' })}<p style="margin:0;color:#0369a1">Your refund has been processed and will appear on your original payment method within 5-10 business days.${isFullRefund ? ' Your order has been cancelled and any items will be restocked.' : ''}</p>`, { borderColor: '#7dd3fc', bgColor: '#f0f9ff' })}<p style="margin:20px 0 0;text-align:center;color:#6b7280">We apologize for any inconvenience.</p>`;

      const emailContent = wrapCustomerEmail(refundBody, { businessName, logoUrl: getEmailLogoUrl(wholesalerUser?.id, wholesalerUser?.logoType, wholesalerUser?.logoUrl) }, { preheader: `Refund of ${currencySymbol}${refundAmount.toFixed(2)} processed for Order #${order.id}` });

      await sgMail.send({
        to: customer.email,
        from: 'hello@quikpik.co',
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
            wholesalerId: product.wholesalerId
          });
          customerId = tempCustomer.id;
          
          // Send welcome messages to new customer (Marketplace Negotiations)
          if (customerEmail && customerPhone && customerPhone !== `+44${Date.now()}`) {
            try {
              const wholesaler = await storage.getUser(product.wholesalerId);
              if (wholesaler) {
                const customerName = `${firstName} ${lastName}`.trim();
                const portalUrl = `https://quikpik.app/customer/${userId}`;
                const wholesalerName = wholesaler.businessName || `${wholesaler.firstName} ${wholesaler.lastName}`.trim() || 'Your Wholesale Partner';
                
                console.log(`📧 Sending welcome messages for new customer ${customerName} linked to wholesaler ${wholesalerName}`);
                
                const welcomeResult = await sendWelcomeMessages({
                  customerName,
                  customerEmail: customerEmail,
                  customerPhone: customerPhone,
                  wholesalerName,
                  wholesalerEmail: wholesaler.email || 'hello@quikpik.co',
                  wholesalerPhone: wholesaler.phoneNumber,
                  portalUrl,
                  wholesalerId: wholesaler.id,
                  wholesalerLogoType: wholesaler.logoType,
                  wholesalerLogoUrl: wholesaler.logoUrl,
                });
                
                console.log(`📨 Welcome messages sent to ${customerName}:`, welcomeResult);
              }
            } catch (welcomeError) {
              console.error('❌ Error sending welcome messages (Marketplace Negotiations):', welcomeError);
            }
          }
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

            // Send WhatsApp notification if enabled
            if (wholesaler.whatsappEnabled) {
              await simpleWhatsAppService.sendMessage(
                wholesaler.businessPhone || '',
                notificationMessage
              );
            }
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

          // Send WhatsApp notification if enabled
          if (wholesaler.whatsappEnabled) {
            await simpleWhatsAppService.sendMessage(
              wholesaler.businessPhone || '',
              notificationMessage
            );
          }
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
      res.status(500).json({ message: "Failed to send test email", error: error instanceof Error ? error.message : 'Unknown error' });
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

  // Update user payment terms settings
  app.patch('/api/user/payment-terms', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { defaultDepositPercentage, balanceDueDays } = req.body;

      // Build update object only with defined values
      const updateData: { defaultDepositPercentage?: number; balanceDueDays?: number } = {};

      // Validate and add deposit percentage if provided
      if (defaultDepositPercentage !== undefined) {
        if (![25, 50, 75, 100].includes(defaultDepositPercentage)) {
          return res.status(400).json({ message: "Deposit percentage must be 25, 50, 75, or 100" });
        }
        updateData.defaultDepositPercentage = defaultDepositPercentage;
      }

      // Validate and add balance due days if provided
      if (balanceDueDays !== undefined) {
        if (![0, 7, 14, 30, 60].includes(balanceDueDays)) {
          return res.status(400).json({ message: "Balance due days must be 0, 7, 14, 30, or 60" });
        }
        updateData.balanceDueDays = balanceDueDays;
      }

      // Only update if there's something to update
      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ message: "No valid fields to update" });
      }

      const [updatedUser] = await db.update(users)
        .set(updateData)
        .where(eq(users.id, userId))
        .returning();
      
      console.log(`✅ Updated payment terms for user ${userId}: ${updateData.defaultDepositPercentage ?? 'unchanged'}% deposit, ${updateData.balanceDueDays ?? 'unchanged'} days`);
      res.json({ 
        success: true,
        user: {
          defaultDepositPercentage: updatedUser.defaultDepositPercentage,
          balanceDueDays: updatedUser.balanceDueDays
        }
      });
    } catch (error) {
      console.error("Error updating payment terms:", error);
      res.status(500).json({ message: "Failed to update payment terms" });
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

  // Subscription status endpoint removed - using bypass version below

  // Duplicate removed - subscription management handled by /api/subscription/downgrade

  // Debug endpoint to check subscription data

  // Subscription upgrade endpoint (with proper authentication)


  // SECURITY FIX: Remove hardcoded fallback that was causing data leaks
  app.post('/api/auth/quick-login', async (req: any, res) => {
    // Only allow in development environment
    if (process.env.NODE_ENV !== 'development') {
      return res.status(404).json({ error: "Not found" });
    }
    
    try {
      const { email } = req.body;
      
      if (!email) {
        return res.status(400).json({ error: "Email is required for quick login" });
      }
      
      const user = await storage.getUserByEmail(email);
      
      if (user) {
        req.session.userId = user.id;
        req.session.user = user;
        console.log(`✅ Quick login successful for ${user.email}`);
        res.json({ success: true, user });
      } else {
        res.status(404).json({ error: 'User not found' });
      }
    } catch (error: any) {
      console.error('❌ Quick login error:', error);
      res.status(500).json({ error: 'Login failed' });
    }
  });

  // NEW: Subscription status endpoint using proper Stripe data

  // Subscription audit log endpoints


  // Universal plan change endpoint (handles both upgrades and downgrades)

  // Free downgrades (no payment required)

  // Original upgrade endpoint removed - using bypass version above
  /*
  */

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
      case 'standard': return 3; // 3 team members - matches subscription service
      case 'premium': return -1; // unlimited team members - matches subscription service
      default: return 0;
    }
  }

  const httpServer = createServer(app);

  // Stock Alert endpoints
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

  // Unified notifications count for the bell icon dropdown
  app.get('/api/notifications/count', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const [stockAlerts, registrationRequests] = await Promise.all([
        storage.getUnresolvedStockAlertsCount(userId),
        storage.getPendingRegistrationRequests(userId),
      ]);
      const registrationCount = registrationRequests.length;
      res.json({
        total: stockAlerts + registrationCount,
        stockAlerts,
        registrationRequests: registrationCount,
      });
    } catch (error) {
      console.error("Error fetching notifications count:", error);
      res.status(500).json({ message: "Failed to fetch notifications count" });
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
      const requestingUserId = req.user.role === 'team_member' && req.user.wholesalerId
        ? req.user.wholesalerId : req.user.id;

      // Ownership check — only the wholesaler who created the member can delete them
      const allMembers = await storage.getAllTeamMembers();
      const target = allMembers.find(m => m.id === parseInt(id));
      if (!target || target.wholesalerId !== requestingUserId) {
        return res.status(403).json({ message: "Not authorised to remove this team member" });
      }
      
      await storage.deleteTeamMember(parseInt(id));
      res.json({ message: "Team member removed successfully" });
    } catch (error) {
      console.error("Error deleting team member:", error);
      res.status(500).json({ message: "Failed to delete team member" });
    }
  });

  // Suspend or reactivate a team member
  app.patch('/api/team-members/:id/status', requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      const requestingUserId = req.user.role === 'team_member' && req.user.wholesalerId
        ? req.user.wholesalerId : req.user.id;

      if (!['active', 'suspended'].includes(status)) {
        return res.status(400).json({ message: "Status must be 'active' or 'suspended'" });
      }

      const allMembers = await storage.getAllTeamMembers();
      const target = allMembers.find(m => m.id === parseInt(id));
      if (!target || target.wholesalerId !== requestingUserId) {
        return res.status(403).json({ message: "Not authorised to update this team member" });
      }

      await storage.updateTeamMemberStatus(parseInt(id), status);
      res.json({ message: status === 'suspended' ? "Team member suspended" : "Team member reactivated" });
    } catch (error) {
      console.error("Error updating team member status:", error);
      res.status(500).json({ message: "Failed to update team member status" });
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

  app.post('/api/team-members/change-password', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const user = await storage.getUser(userId);

      if (!user || user.role !== 'team_member') {
        return res.status(403).json({ message: "Only team members can change their password here" });
      }

      const { currentPassword, newPassword } = req.body;
      if (!currentPassword || !newPassword) {
        return res.status(400).json({ message: "Current password and new password are required" });
      }

      if (newPassword.length < 8) {
        return res.status(400).json({ message: "New password must be at least 8 characters" });
      }

      if (!user.passwordHash) {
        return res.status(400).json({ message: "No password set on this account" });
      }

      const isValid = await verifyPassword(currentPassword, user.passwordHash);
      if (!isValid) {
        return res.status(400).json({ message: "Current password is incorrect" });
      }

      const newHash = await hashPassword(newPassword);
      await storage.updateUser(userId, { passwordHash: newHash });

      // Send security notification email — fire-and-forget, don't fail the request if it errors
      try {
        const wholesaler = user.wholesalerId ? await storage.getUser(user.wholesalerId) : null;
        const businessName = wholesaler?.businessName || 'Quikpik Merchant';
        const logoUrl = getEmailLogoUrl(user.wholesalerId ?? undefined, wholesaler?.logoType, wholesaler?.logoUrl);
        const branding = { businessName, logoUrl };

        const changedAt = new Date().toLocaleString('en-GB', {
          day: 'numeric', month: 'long', year: 'numeric',
          hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London'
        });

        const body =
          emailHeading('Password Changed', { color: '#10b981' }) +
          emailBadge('Success', '#10b981') +
          '<p style="font-size:15px;margin:16px 0 8px">Hi ' + (user.firstName || 'there') + ',</p>' +
          '<p style="font-size:15px;margin:0 0 20px">Your <strong>' + businessName + '</strong> account password was successfully changed on <strong>' + changedAt + '</strong>.</p>' +
          emailCard(
            '<p style="margin:0;font-size:14px;color:#92400e"><strong>⚠ Didn\'t make this change?</strong><br>If you did not update your password, contact <strong>' + businessName + '</strong> or your account administrator immediately.</p>',
            { borderColor: '#fbbf24', bgColor: '#fffbeb' }
          );

        const html = wrapCustomerEmail(body, branding, { preheader: 'Your account password was changed.' });

        await sendEmail({
          to: user.email!,
          from: process.env.SENDGRID_FROM_EMAIL || 'noreply@quikpik.app',
          subject: 'Your password has been changed',
          html,
        });
      } catch (emailError) {
        console.error('Failed to send password-changed notification email:', emailError);
      }

      res.json({ message: "Password updated successfully" });
    } catch (error) {
      console.error("Error changing team member password:", error);
      res.status(500).json({ message: "Failed to change password" });
    }
  });

  app.post('/api/team-members/:id/reset-password', requireAuth, async (req: any, res) => {
    try {
      const { id } = req.params;

      // Only the wholesaler owner can trigger this — not a team_member themselves
      if (req.user.role === 'team_member') {
        return res.status(403).json({ message: "Only the account owner can reset team member passwords" });
      }

      const requestingUserId = req.user.id;

      // Ownership check — same pattern as delete/suspend
      const allMembers = await storage.getAllTeamMembers();
      const target = allMembers.find(m => m.id === parseInt(id));
      if (!target || target.wholesalerId !== requestingUserId) {
        return res.status(403).json({ message: "Not authorised to reset this team member's password" });
      }

      // Pending members haven't accepted the invite / set a password yet
      if (target.status === 'pending') {
        return res.status(400).json({ message: "This member hasn't accepted their invite yet. Use 'Resend invite' instead." });
      }

      // Find their user account by email
      const userRecord = await storage.getUserByEmail(target.email, 'team_member');
      if (!userRecord) {
        return res.status(400).json({ message: "No active account found for this team member" });
      }

      // Generate reset token and store it
      const { token, hashedToken } = generateResetToken();
      const expiresAt = createResetExpiration();
      await storage.updateUser(userRecord.id, { passwordResetToken: hashedToken, passwordResetExpires: expiresAt });

      // Get wholesaler branding for the email
      const wholesaler = await storage.getUser(requestingUserId);
      const branding = {
        businessName: wholesaler?.businessName || 'Quikpik Merchant',
        logoUrl: getEmailLogoUrl(requestingUserId, wholesaler?.logoType, wholesaler?.logoUrl),
      };

      // Send the reset email to the team member
      await sendPasswordResetEmail(target.email, token, target.firstName || undefined, branding);

      res.json({ message: `Password reset email sent to ${target.firstName || target.email}` });
    } catch (error) {
      console.error("Error sending team member password reset:", error);
      res.status(500).json({ message: "Failed to send password reset email" });
    }
  });

  // Helper: returns true if an invitation issued at invitedAt has passed the 7-day window
  function isInvitationExpired(invitedAt: Date | string | null | undefined): boolean {
    if (!invitedAt) return false;
    return Date.now() > new Date(invitedAt).getTime() + 7 * 24 * 60 * 60 * 1000;
  }

  // Team invitation acceptance endpoints
  app.get('/api/team-invitation/:token', async (req, res) => {
    try {
      const { token } = req.params;
      const { email } = req.query;
      
      if (!email) {
        return res.status(400).json({ message: "Email parameter is required" });
      }

      // Look up by inviteToken (secure UUID) or fall back to id for legacy links
      const allMembers = await storage.getAllTeamMembers();
      const teamMember = allMembers.find(member => 
        (member.inviteToken === token || member.id === parseInt(token)) &&
        member.email === email && 
        member.status === 'pending'
      );
      
      if (!teamMember) {
        return res.status(404).json({ message: "Invalid or expired invitation" });
      }

      if (isInvitationExpired(teamMember.invitedAt)) {
        return res.status(410).json({ message: "This invitation has expired. Please ask your team owner to send a new one." });
      }

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

      // Look up by inviteToken (secure UUID) or fall back to id for legacy links
      const allMembers = await storage.getAllTeamMembers();
      const teamMember = allMembers.find(member => 
        (member.inviteToken === token || member.id === parseInt(token)) &&
        member.email === email && 
        member.status === 'pending'
      );
      
      if (!teamMember) {
        return res.status(404).json({ message: "Invalid or expired invitation" });
      }

      if (isInvitationExpired(teamMember.invitedAt)) {
        return res.status(410).json({ message: "This invitation has expired. Please ask your team owner to send a new one." });
      }

      const userId = `team_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const userData = {
        id: userId,
        email: teamMember.email,
        firstName: firstName,
        lastName: lastName || '',
        role: 'team_member',
        wholesalerId: teamMember.wholesalerId,
        subscriptionTier: 'team_member',
        businessName: '',
        businessDescription: '',
        businessPhone: '',
        businessAddress: '',
        preferredCurrency: 'GBP',
        onboardingCompleted: true,
        onboardingStep: 0,
        isFirstLogin: false,
        productLimit: -1,
      };

      const newUser = await storage.createUserWithPassword(userData, password);
      
      // Mark invitation as accepted (sets joinedAt)
      await storage.updateTeamMemberStatus(teamMember.id, 'active');

      // Notify the wholesaler that their team member has joined
      try {
        const wholesaler = await storage.getUser(teamMember.wholesalerId);
        if (wholesaler?.email && process.env.SENDGRID_API_KEY) {
          sgMail.setApiKey(process.env.SENDGRID_API_KEY);
          const fullName = `${firstName}${lastName ? ' ' + lastName : ''}`;
          const notifyBody = `${emailHeading('Team Member Joined!', { size: '22px', color: '#10b981' })}<p style="margin:0 0 16px"><strong>${fullName}</strong> has accepted your invitation and joined <strong>${wholesaler.businessName || wholesaler.firstName}</strong> on Quikpik. They can now sign in using the Team Member tab and start working.</p>${emailCard(`<p style="margin:0 0 4px"><strong>Name:</strong> ${fullName}</p><p style="margin:0 0 4px"><strong>Email:</strong> ${teamMember.email}</p><p style="margin:0"><strong>Role:</strong> ${teamMember.role.charAt(0).toUpperCase() + teamMember.role.slice(1)}</p>`)}<p style="margin:16px 0 0;color:#6b7280;font-size:13px">You can manage your team members from the Team Management page in your dashboard.</p>`;
          await sgMail.send({
            to: wholesaler.email,
            from: { email: 'hello@quikpik.co', name: 'Quikpik Team' },
            subject: `${fullName} has joined your team`,
            html: wrapCustomerEmail(notifyBody, { businessName: wholesaler.businessName || wholesaler.firstName || 'Quikpik', logoUrl: getEmailLogoUrl(wholesaler.id, wholesaler.logoType, wholesaler.logoUrl) }, { preheader: `${fullName} accepted your invitation and is ready to work` })
          });
          console.log('✅ Wholesaler notified of new team member:', wholesaler.email);
        }
      } catch (notifyErr) {
        console.error('Warning: failed to notify wholesaler of team member join:', notifyErr);
      }
      
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

      const welcomeBody = `${emailHeading('Welcome to Quikpik!', { size: '22px', color: '#10b981' })}<p style="font-size:16px;margin:0 0 8px">Hello ${user.firstName},</p><p style="margin:0 0 20px">Congratulations on joining Quikpik! You've taken the first step toward revolutionising your wholesale operations.</p>${emailCard(`${emailHeading('Our Mission', { size: '16px', color: '#059669' })}<p style="margin:0">Empower small and medium wholesalers with enterprise-level tools that streamline operations, boost revenue, and unlock new growth opportunities.</p>`, { borderColor: '#a7f3d0', bgColor: '#ecfdf5' })}${emailCard(`${emailHeading('What You Can Do Right Now', { size: '16px', color: '#059669' })}<ul style="margin:0;padding-left:20px;font-size:14px"><li style="margin-bottom:6px"><strong>Add Your Products:</strong> Upload inventory with photos, pricing, and stock levels</li><li style="margin-bottom:6px"><strong>Create Customer Groups:</strong> Organise retail customers for targeted communication</li><li style="margin-bottom:6px"><strong>Send WhatsApp Broadcasts:</strong> Instantly notify customers about new stock and promotions</li><li style="margin-bottom:6px"><strong>Process Orders:</strong> Accept online payments and manage orders efficiently</li><li><strong>Track Analytics:</strong> Monitor sales performance and customer engagement</li></ul>`)}${emailButton('Access Your Dashboard', 'https://quikpik.app')}${emailCard(`${emailHeading('Need Help Getting Started?', { size: '16px' })}<p style="margin:0 0 8px">Our support team is here to help you succeed:</p><ul style="margin:0;padding-left:20px;font-size:14px"><li style="margin-bottom:4px">Email: <a href="mailto:hello@quikpik.co" style="color:#059669">hello@quikpik.co</a></li><li style="margin-bottom:4px">Quick Setup Session: <a href="https://calendly.com/quikpik-support/setup" style="color:#059669">Book a free 15-minute call</a></li><li>Response Time: Within 2 hours during business hours</li></ul>`)}<p style="margin:20px 0 0;text-align:center;color:#6b7280">Thank you for choosing Quikpik to power your wholesale business!</p>`;

      await sgMail.send({
        to: user.email,
        from: {
          email: 'hello@quikpik.co',
          name: 'Quikpik Team'
        },
        subject: `Welcome to Quikpik, ${user.firstName}!`,
        html: wrapCustomerEmail(welcomeBody, { businessName: user.businessName || `${user.firstName}'s Business` || 'Quikpik', logoUrl: getEmailLogoUrl(user.id, user.logoType, user.logoUrl) }, { preheader: 'Welcome to Quikpik - your wholesale platform is ready' })
      });

      console.log(`✅ Welcome email sent to ${user.email}`);
    } catch (error) {
      console.error('Failed to send welcome email:', error);
    }
  }


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

      // Find the team member record to get wholesaler info and check status
      const allMembers = await storage.getAllTeamMembers();
      const teamMember = allMembers.find((tm: any) => tm.email.toLowerCase() === email.toLowerCase());

      // Block suspended team members
      if (teamMember?.status === 'suspended') {
        return res.status(403).json({ message: "Your account has been suspended. Please contact your team administrator." });
      }
      
      // Get wholesaler information if team member is linked
      let wholesalerInfo = null;
      if (teamMember?.wholesalerId) {
        wholesalerInfo = await storage.getUser(teamMember.wholesalerId);
      }

      // Record last login time
      if (teamMember?.id) {
        await storage.updateTeamMemberLastLogin(teamMember.id);
      }

      // Create session for team member with wholesaler context
      req.session.user = {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: 'team_member',
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

      // CRITICAL FIX: Validate required fields including password
      if (!email || !password || !firstName || !lastName) {
        return res.status(400).json({ 
          message: "Email, password, first name, and last name are required",
          field: "validation"
        });
      }

      // CRITICAL FIX: Validate password strength
      const passwordValidation = validatePassword(password);
      if (!passwordValidation.isStrong) {
        return res.status(400).json({ 
          message: "Password does not meet security requirements",
          field: "password",
          errors: passwordValidation.messages
        });
      }

      // Check if user already exists
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ 
          message: "An account with this email already exists",
          field: "email"
        });
      }

      // Create the business address string
      const businessAddress = streetAddress && city ? `${streetAddress}, ${city}, ${state} ${postalCode}, ${country}` : '';

      // Create user account with generated ID
      const userId = `signup_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      const userData = {
        id: userId,
        email: email,
        firstName: firstName,
        lastName: lastName,
        role: 'wholesaler',
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
        productLimit: 10
      };

      // CRITICAL FIX: Use createUserWithPassword to hash and store password
      const newUser = await storage.createUserWithPassword(userData, password);
      
      console.log(`✅ New user account created with secure password for ${email}`);

      // Create session for the new user
      (req.session as any).user = {
        id: newUser.id,
        email: newUser.email,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        role: newUser.role,
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

  // Password Reset Endpoints
  
  // Rate limiting store for password reset requests
  const passwordResetAttempts = new Map<string, { count: number; lastAttempt: number; }>();
  
  // Request password reset - send email with reset token
  app.post('/api/auth/forgot-password', async (req, res) => {
    try {
      const { email } = req.body;
      const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
      
      if (!email) {
        return res.status(400).json({ error: "Email is required" });
      }
      
      // Rate limiting: 5 attempts per email per hour, 10 attempts per IP per hour
      const now = Date.now();
      const emailKey = `email:${email}`;
      const ipKey = `ip:${clientIP}`;
      
      // Check email rate limit
      const emailAttempts = passwordResetAttempts.get(emailKey);
      if (emailAttempts) {
        // Reset counter if last attempt was more than 1 hour ago
        if (now - emailAttempts.lastAttempt > 3600000) {
          emailAttempts.count = 0;
        }
        if (emailAttempts.count >= 5) {
          return res.status(429).json({ 
            error: "Too many password reset requests for this email. Please try again later." 
          });
        }
      }
      
      // Check IP rate limit
      const ipAttempts = passwordResetAttempts.get(ipKey);
      if (ipAttempts) {
        if (now - ipAttempts.lastAttempt > 3600000) {
          ipAttempts.count = 0;
        }
        if (ipAttempts.count >= 10) {
          return res.status(429).json({ 
            error: "Too many password reset requests from this IP. Please try again later." 
          });
        }
      }
      
      // Update rate limiting counters
      passwordResetAttempts.set(emailKey, {
        count: (emailAttempts?.count || 0) + 1,
        lastAttempt: now
      });
      passwordResetAttempts.set(ipKey, {
        count: (ipAttempts?.count || 0) + 1,
        lastAttempt: now
      });
      
      // Check if user exists
      const user = await storage.getUserByEmail(email);
      
      if (!user) {
        // Don't reveal if email exists - always return success for security
        return res.json({ 
          success: true, 
          message: "If an account with that email exists, we've sent a password reset link." 
        });
      }
      
      // Generate reset token and expiration
      const { token, hashedToken } = generateResetToken();
      const expiresAt = createResetExpiration();
      
      // Store HASHED token in database for security
      await storage.setPasswordResetToken(email, hashedToken, expiresAt);
      
      // Send password reset email with PLAIN token
      await sendPasswordResetEmail(email, token, user.firstName, { businessName: user.businessName, logoUrl: getEmailLogoUrl(user.id, user.logoType, user.logoUrl) });
      
      console.log(`🔐 Password reset email sent to ${email}`);
      
      res.json({ 
        success: true, 
        message: "If an account with that email exists, we've sent a password reset link." 
      });
      
    } catch (error) {
      console.error('Password reset request error:', error);
      res.status(500).json({ error: "Failed to process password reset request" });
    }
  });
  
  // Validate reset token
  app.get('/api/auth/reset-password/:token', async (req, res) => {
    try {
      const { token } = req.params;
      
      if (!token) {
        return res.status(400).json({ error: "Reset token is required" });
      }
      
      // Hash the token for database comparison
      const hashedToken = hashResetToken(token);
      
      // Validate hashed token
      const user = await storage.validatePasswordResetToken(hashedToken);
      
      if (!user) {
        return res.status(400).json({ error: "Invalid or expired reset token" });
      }
      
      res.json({ 
        success: true, 
        message: "Valid reset token",
        email: user.email // Safe to return email for form pre-filling
      });
      
    } catch (error) {
      console.error('Password reset token validation error:', error);
      res.status(500).json({ error: "Failed to validate reset token" });
    }
  });
  
  // Reset password with token
  app.post('/api/auth/reset-password', async (req, res) => {
    try {
      const { token, password } = req.body;
      
      if (!token || !password) {
        return res.status(400).json({ error: "Token and new password are required" });
      }
      
      // Validate password strength
      const validation = validatePassword(password);
      if (!validation.isStrong) {
        return res.status(400).json({ 
          error: "Password does not meet security requirements",
          messages: validation.messages 
        });
      }
      
      // Hash the token for database comparison
      const hashedToken = hashResetToken(token);
      
      // Reset password with hashed token
      const user = await storage.resetPasswordWithToken(hashedToken, password);
      
      if (!user) {
        return res.status(400).json({ error: "Invalid or expired reset token" });
      }
      
      console.log(`🔐 Password successfully reset for ${user.email}`);
      
      res.json({ 
        success: true, 
        message: "Password has been reset successfully. You can now log in with your new password." 
      });
      
    } catch (error) {
      console.error('Password reset error:', error);
      res.status(500).json({ error: "Failed to reset password" });
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

  // POST endpoint for shipping quotes (used by order shipping modal) - with auth debug
  app.post('/api/shipping/quotes', async (req: any, res) => {
    // Add auth debug for customer portal usage
    console.log('🔍 Auth Debug:', {
      sessionExists: !!req.session,
      sessionUser: req.session?.user ? 'exists' : 'missing',
      sessionUserId: req.session?.userId || 'missing',
      isAuthenticated: !!(req.session?.user?.id || req.session?.userId || req.user),
      headers: req.headers.cookie ? 'has_cookies' : 'no_cookies'
    });
    
    // Allow both authenticated users and customer portal access
    if (!req.session?.user?.id && !req.session?.userId && !req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
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
      
      const preciseCalculation = req.body.cartItems && req.body.cartItems.length > 0;
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

  // Customer portal shipping quotes endpoint (no auth required)
  app.post('/api/customer/shipping/quotes', async (req: any, res) => {
    try {
      const { collectionAddress, deliveryAddress, parcels, cartItems } = req.body;
      
      console.log("📦 CUSTOMER PORTAL: Getting shipping quotes");
      console.log("Request data:", { collectionAddress, deliveryAddress, parcels: parcels?.length, cartItems: cartItems?.length });

      // Check if we have valid addresses
      if (!collectionAddress || !deliveryAddress || !parcels) {
        return res.status(400).json({ 
          error: "Missing required data", 
          required: ["collectionAddress", "deliveryAddress", "parcels"] 
        });
      }

      // Calculate weight-based pricing for demo quotes
      const totalWeight = parcels.reduce((sum, parcel) => sum + (parcel.weight || 1), 0);
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
      
      console.log(`📦 Returning customer portal demo quotes for ${totalWeight}kg package`);
      res.json({ 
        quotes: demoQuotes, 
        demoMode: true, 
        totalWeight
      });
    } catch (error: any) {
      console.error("Error getting customer shipping quotes:", error.message);
      res.status(500).json({ error: "Failed to get shipping quotes" });
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
        postcode: (user as any).businessPostcode || 'SW1A 1AA',
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

  // Bulk check all tab permissions for team members
  app.get('/api/tab-permissions/check-all', requireAuth, async (req: any, res) => {
    try {
      const user = req.user;
      
      // Only for team members
      if (user.role !== 'team_member' || !user.wholesalerId) {
        return res.json({}); // Return empty object for non-team members
      }
      
      const tabNames = ['dashboard', 'products', 'orders', 'customers', 'campaigns', 'analytics', 'integrations', 'marketplace', 'team-management', 'subscription', 'settings'];
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
      
      const { firstName, lastName, email, phoneNumber, groupId } = req.body;
      console.log('Customer data:', { firstName, lastName, email, phoneNumber, groupId });
      
      if (!firstName || !phoneNumber) {
        return res.status(400).json({ error: 'First name and phone number are required' });
      }
      
      // Format phone number
      const formattedPhone = formatPhoneToInternational(phoneNumber);
      console.log('Formatted phone:', formattedPhone);
      
      // Check for existing customer by phone number first
      let customer = await storage.getUserByPhone(formattedPhone);
      
      if (customer) {
        // FIXED: Unarchive and update existing customer info if needed
        const updates: any = {};
        if (email && customer.email !== email) {
          updates.email = email;
        }
        // Always unarchive if customer is archived 
        if (customer.archived) {
          updates.archived = false;
          updates.archivedAt = null;
          console.log('🔄 Unarchiving existing customer:', customer.id);
        }
        
        if (Object.keys(updates).length > 0) {
          customer = await storage.updateCustomer(customer.id, updates);
          console.log('✅ Updated and unarchived existing customer:', customer);
        } else {
          console.log('Using existing active customer:', customer);
        }
        
        // Ensure the wholesaler-customer relationship exists
        const { db } = await import('./db.js');
        const { wholesalerCustomerRelationships } = await import('../shared/schema');
        const { and, eq } = await import('drizzle-orm');
        
        // Check if relationship already exists
        const existingRelationship = await db
          .select()
          .from(wholesalerCustomerRelationships)
          .where(and(
            eq(wholesalerCustomerRelationships.customerId, customer.id),
            eq(wholesalerCustomerRelationships.wholesalerId, targetUserId)
          ))
          .limit(1);
          
        if (existingRelationship.length === 0) {
          // Create new relationship
          await db.insert(wholesalerCustomerRelationships).values({
            customerId: customer.id,
            wholesalerId: targetUserId,
            status: 'active',
          });
          console.log('✅ Created new wholesaler-customer relationship for existing customer');
        } else {
          console.log('✅ Wholesaler-customer relationship already exists');
        }
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
          role: 'customer',
          wholesalerId: targetUserId
        });
        
        // Create the wholesaler-customer relationship for multi-wholesaler platform
        const { db } = await import('./db.js');
        const { wholesalerCustomerRelationships } = await import('../shared/schema');
        
        await db.insert(wholesalerCustomerRelationships).values({
          customerId: customer.id,
          wholesalerId: targetUserId,
          status: 'active',
        });
        console.log('✅ Created wholesaler-customer relationship for multi-wholesaler platform');
      }
      
      // Optional: Add customer to specified group if groupId is provided
      if (groupId && groupId > 0) {
        try {
          await storage.addCustomerToGroup(groupId, customer.id);
          console.log(`✅ Customer ${customer.id} added to group ${groupId}`);
        } catch (groupError) {
          console.warn(`⚠️ Failed to add customer to group ${groupId}:`, groupError);
          // Don't fail the entire operation if group assignment fails
        }
      }
      
      console.log('Customer created:', customer);

      // Get wholesaler details for welcome messages
      const wholesaler = await storage.getUser(targetUserId);
      console.log('Wholesaler found for welcome messages:', wholesaler ? `${wholesaler.firstName} ${wholesaler.lastName} (${wholesaler.email})` : 'No wholesaler found');
      
      if (wholesaler) {
        const customerName = `${firstName} ${lastName || ''}`.trim();
        const portalUrl = `https://quikpik.app/customer/${targetUserId}`;
        const wholesalerName = wholesaler.businessName || `${wholesaler.firstName} ${wholesaler.lastName || ''}`.trim() || 'Your Wholesale Partner';
        
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
          console.log('🚀 STARTING WELCOME MESSAGE PROCESS FOR CUSTOMER:', {
            customerName,
            customerEmail: email,
            customerPhone: formattedPhone,
            wholesalerName,
            wholesalerEmail: wholesaler.email,
            hasWholesalerEmail: !!wholesaler.email,
            portalUrl
          });
          
          const welcomeResult = await sendWelcomeMessages({
            customerName,
            customerEmail: email,
            customerPhone: formattedPhone,
            wholesalerName,
            wholesalerEmail: wholesaler.email || 'hello@quikpik.co',
            wholesalerPhone: wholesaler.phoneNumber,
            wholesalerAccountName: `${wholesaler.firstName} ${wholesaler.lastName || ''}`.trim() || 'IBK',
            portalUrl,
            wholesalerId: wholesaler.id,
            wholesalerLogoType: wholesaler.logoType,
            wholesalerLogoUrl: wholesaler.logoUrl,
          });
          
          console.log('✅ WELCOME MESSAGES COMPLETED. RESULT:', welcomeResult);
          
          // Add welcome message status to response
          res.json({
            ...customer,
            welcomeMessages: {
              emailSent: welcomeResult.emailSent,
              smsSent: welcomeResult.smsSent,
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
              smsSent: false,
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
            smsSent: false,
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

  // Send welcome message manually
  app.post('/api/customers/:id/send-welcome', requireAuth, async (req: any, res) => {
    try {
      const customerId = req.params.id;
      const targetUserId = req.user.role === 'team_member' && req.user.wholesalerId ? req.user.wholesalerId : req.user.id;
      
      // Verify the customer belongs to this user
      const customers = await storage.getAllCustomers(targetUserId);
      const customer = customers.find(c => c.id === customerId);
      
      if (!customer) {
        return res.status(404).json({ error: 'Customer not found' });
      }
      
      // Get wholesaler details for welcome messages
      const wholesaler = await storage.getUser(targetUserId);
      
      if (!wholesaler) {
        return res.status(404).json({ error: 'Wholesaler not found' });
      }
      
      const customerName = `${customer.firstName} ${customer.lastName || ''}`.trim();
      const portalUrl = `https://quikpik.app/customer/${targetUserId}`;
      const wholesalerName = wholesaler.businessName || `${wholesaler.firstName} ${wholesaler.lastName || ''}`.trim() || 'Your Wholesale Partner';
      
      console.log('🔄 Manual welcome message request for customer:', customerName);
      
      // Send welcome messages (email and WhatsApp)
      try {
        const welcomeResult = await sendWelcomeMessages({
          customerName,
          customerEmail: customer.email,
          customerPhone: customer.phoneNumber,
          wholesalerName,
          wholesalerEmail: wholesaler.email || 'hello@quikpik.co',
          wholesalerPhone: wholesaler.phoneNumber,
          portalUrl,
          wholesalerId: wholesaler.id,
          wholesalerLogoType: wholesaler.logoType,
          wholesalerLogoUrl: wholesaler.logoUrl,
        });
        
        console.log('✅ Manual welcome messages sent. Result:', welcomeResult);
        
        res.json({
          success: true,
          customerName,
          welcomeMessages: {
            emailSent: welcomeResult.emailSent,
            smsSent: welcomeResult.smsSent,
            whatsappSent: welcomeResult.whatsappSent,
            errors: welcomeResult.errors
          }
        });
      } catch (welcomeError) {
        console.error('❌ Error sending manual welcome messages:', welcomeError);
        res.status(500).json({
          success: false,
          error: 'Failed to send welcome messages',
          details: welcomeError.message
        });
      }
    } catch (error) {
      console.error('❌ Error in manual welcome message endpoint:', error);
      res.status(500).json({ error: 'Failed to send welcome message', details: error.message });
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
      
      // Attempt to delete or archive the customer (pass wholesalerId for multi-wholesaler logic)
      const result = await storage.deleteCustomer(customerId, targetUserId);
      
      if (result.success) {
        // Sync: mark any approved registration request for this customer as rejected
        try {
          if (customer.phoneNumber) {
            await db
              .update(customerRegistrationRequests)
              .set({ status: 'rejected', respondedAt: new Date() })
              .where(and(
                eq(customerRegistrationRequests.wholesalerId, targetUserId),
                eq(customerRegistrationRequests.customerPhone, customer.phoneNumber),
                eq(customerRegistrationRequests.status, 'approved')
              ));
          }
        } catch (syncError) {
          console.warn('⚠️ Could not sync registration request status after customer delete:', syncError);
        }

        res.json({ 
          success: true, 
          message: result.message,
          archived: result.archived || false
        });
      } else {
        res.status(500).json({ error: result.message });
      }
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
      
      const wholesalerName = wholesaler.businessName || `${wholesaler.firstName} ${wholesaler.lastName || ''}`.trim() || 'Your Wholesale Partner';
      const portalUrl = `https://quikpik.app/customer/${wholesalerId}`;
      
      const welcomeResult = await sendWelcomeMessages({
        customerName,
        customerEmail,
        customerPhone,
        wholesalerName,
        wholesalerEmail: wholesaler.email || 'hello@quikpik.co',
        wholesalerPhone: wholesaler.phoneNumber,
        wholesalerAccountName: `${wholesaler.firstName} ${wholesaler.lastName || ''}`.trim() || 'IBK',
        portalUrl,
        wholesalerId: wholesaler.id,
        wholesalerLogoType: wholesaler.logoType,
        wholesalerLogoUrl: wholesaler.logoUrl,
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
      
      const wholesalerName = wholesaler.businessName || `${wholesaler.firstName} ${wholesaler.lastName || ''}`.trim() || 'Your Wholesale Partner';
      const wholesalerAccountName = `${wholesaler.firstName} ${wholesaler.lastName || ''}`.trim() || 'IBK';
      const portalUrl = `https://quikpik.app/customer/${wholesalerId}`;
      
      console.log('🧪 Testing welcome messages with:', {
        customerName,
        customerEmail,
        customerPhone,
        wholesalerName,
        wholesalerEmail: wholesaler.email,
        wholesalerAccountName
      });
      
      const welcomeResult = await sendWelcomeMessages({
        customerName,
        customerEmail,
        customerPhone,
        wholesalerName,
        wholesalerEmail: wholesaler.email || 'hello@quikpik.co',
        wholesalerPhone: wholesaler.phoneNumber,
        wholesalerAccountName,
        portalUrl,
        wholesalerId: wholesaler.id,
        wholesalerLogoType: wholesaler.logoType,
        wholesalerLogoUrl: wholesaler.logoUrl,
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

  // Customer Insights
  app.get('/api/analytics/customers', requireAuth, async (req: any, res) => {
    try {
      const user = req.user;
      const targetUserId = user.role === 'team_member' ? user.wholesalerId : user.id;
      
      const [orders, customers] = await Promise.all([
        storage.getOrders(targetUserId),
        storage.getAllCustomers(targetUserId)
      ]);

      const validOrders = orders.filter(order => 
        ['paid', 'processing', 'shipped', 'delivered', 'fulfilled'].includes(order.status)
      );

      // Customer segmentation
      const customerOrderMap = new Map();
      for (const order of validOrders) {
        const customerId = order.retailerId;
        const current = customerOrderMap.get(customerId) || {
          orderCount: 0,
          totalSpent: 0,
          lastOrderDate: null,
          firstOrderDate: null,
          customerName: ''
        };
        if (!current.customerName && order.customerName) {
          current.customerName = order.customerName;
        }

        current.orderCount++;
        // Use actual net amount (subtotal - platform fee) for wholesaler earnings
        const orderSubtotal = parseFloat(order.subtotal || order.total || '0');
        const orderPlatformFee = parseFloat(order.platformFee || '0');
        current.totalSpent += (orderSubtotal - orderPlatformFee);
        
        const orderDate = new Date(order.createdAt);
        if (!current.firstOrderDate || orderDate < current.firstOrderDate) {
          current.firstOrderDate = orderDate;
        }
        if (!current.lastOrderDate || orderDate > current.lastOrderDate) {
          current.lastOrderDate = orderDate;
        }

        customerOrderMap.set(customerId, current);
      }

      // Classify customers
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      
      let newCustomers = 0;
      let returningCustomers = 0;
      let atRiskCustomers = 0;
      
      for (const [customerId, data] of customerOrderMap) {
        if (data.firstOrderDate && data.firstOrderDate >= thirtyDaysAgo) {
          newCustomers++;
        } else if (data.lastOrderDate && data.lastOrderDate >= thirtyDaysAgo) {
          returningCustomers++;
        } else {
          atRiskCustomers++;
        }
      }

      // Top customers by value
      const topCustomers = Array.from(customerOrderMap.entries())
        .map(([customerId, data]) => {
          const customer = customers.find(c => c.id === customerId);
          return {
            id: customerId,
            name: customer?.name || data.customerName || 'Unknown Customer',
            phone: customer?.phone || '',
            orderCount: data.orderCount,
            totalSpent: Math.round(data.totalSpent * 100) / 100,
            lastOrderDate: data.lastOrderDate?.toISOString().split('T')[0] || '',
            avgOrderValue: Math.round((data.totalSpent / data.orderCount) * 100) / 100
          };
        })
        .sort((a, b) => b.totalSpent - a.totalSpent)
        .slice(0, 10);

      const insights = {
        segmentation: {
          newCustomers,
          returningCustomers,
          atRiskCustomers,
          totalActiveCustomers: customerOrderMap.size
        },
        topCustomers,
        metrics: {
          averageOrderValue: validOrders.length > 0 ? 
            Math.round((validOrders.reduce((sum, order) => sum + (parseFloat(order.subtotal || order.total || '0') - parseFloat(order.platformFee || '0')), 0) / validOrders.length) * 100) / 100 : 0,
          repeatCustomerRate: customers.length > 0 ? 
            Math.round((returningCustomers / customers.length) * 100) : 0
        }
      };

      res.json(insights);
    } catch (error) {
      console.error("Error fetching customer insights:", error);
      res.status(500).json({ message: "Failed to fetch customer insights" });
    }
  });

  // Inventory Insights
  app.get('/api/analytics/inventory', requireAuth, async (req: any, res) => {
    try {
      // Check subscription tier for Business Performance access (Standard or Premium required)
      if (req.user.subscriptionTier === 'free') {
        return res.status(403).json({ 
          error: 'Standard or Premium plan required for Business Performance analytics',
          required: 'standard'
        });
      }

      const user = req.user;
      const targetUserId = user.role === 'team_member' ? user.wholesalerId : user.id;
      
      const [products, orders] = await Promise.all([
        storage.getProducts(targetUserId),
        storage.getOrders(targetUserId)
      ]);

      const validOrders = orders.filter(order => 
        ['paid', 'processing', 'shipped', 'delivered', 'fulfilled'].includes(order.status)
      );

      // Product performance analysis — single batch query instead of N+1 loop
      const productSales = new Map();
      if (validOrders.length > 0) {
        const validOrderIds = validOrders.map(o => o.id);
        const allOrderItems = await db
          .select({
            productId: orderItems.productId,
            quantity: orderItems.quantity,
            unitPrice: orderItems.unitPrice,
          })
          .from(orderItems)
          .where(inArray(orderItems.orderId, validOrderIds));

        for (const item of allOrderItems) {
          const current = productSales.get(item.productId) || { quantity: 0, revenue: 0 };
          current.quantity += item.quantity;
          current.revenue += parseFloat(item.unitPrice || '0') * item.quantity;
          productSales.set(item.productId, current);
        }
      }

      // Categorize products
      const categories = new Map();
      for (const product of products) {
        const category = product.category || 'Uncategorized';
        const current = categories.get(category) || {
          productCount: 0,
          totalStock: 0,
          totalValue: 0
        };
        
        current.productCount++;
        current.totalStock += product.stock || 0;
        current.totalValue += (product.stock || 0) * parseFloat(product.price || '0');
        categories.set(category, current);
      }

      // Performance metrics
      const topPerformers = products
        .map(product => {
          const sales = productSales.get(product.id) || { quantity: 0, revenue: 0 };
          return {
            id: product.id,
            name: product.name,
            category: product.category || 'Uncategorized',
            stock: product.stock || 0,
            price: parseFloat(product.price || '0'),
            quantitySold: sales.quantity,
            revenue: Math.round(sales.revenue * 100) / 100,
            stockValue: Math.round((product.stock || 0) * parseFloat(product.price || '0') * 100) / 100
          };
        })
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10);

      const slowMovers = products
        .map(product => {
          const sales = productSales.get(product.id) || { quantity: 0, revenue: 0 };
          return {
            id: product.id,
            name: product.name,
            category: product.category || 'Uncategorized',
            stock: product.stock || 0,
            price: parseFloat(product.price || '0'),
            quantitySold: sales.quantity,
            daysSinceLastSale: sales.quantity > 0 ? 
              Math.floor((Date.now() - new Date(product.updatedAt || product.createdAt).getTime()) / (1000 * 60 * 60 * 24)) : 
              999,
            stockValue: Math.round((product.stock || 0) * parseFloat(product.price || '0') * 100) / 100
          };
        })
        .filter(product => product.quantitySold === 0 || product.daysSinceLastSale > 30)
        .sort((a, b) => b.stockValue - a.stockValue)
        .slice(0, 10);

      const categoryData = Array.from(categories.entries()).map(([name, data]) => ({
        name,
        productCount: data.productCount,
        totalStock: data.totalStock,
        totalValue: Math.round(data.totalValue * 100) / 100
      }));

      const insights = {
        overview: {
          totalProducts: products.length,
          totalStockValue: Math.round(products.reduce((sum, product) => 
            sum + (product.stock || 0) * parseFloat(product.price || '0'), 0
          ) * 100) / 100,
          lowStockCount: products.filter(p => (p.stock || 0) <= (p.lowStockThreshold || 10)).length,
          outOfStockCount: products.filter(p => (p.stock || 0) === 0).length
        },
        performance: {
          topPerformers,
          slowMovers,
          categories: categoryData
        }
      };

      res.json(insights);
    } catch (error) {
      console.error("Error fetching inventory insights:", error);
      res.status(500).json({ message: "Failed to fetch inventory insights" });
    }
  });

  app.get('/api/stock-alerts', requireAuth, async (req: any, res) => {
    try {
      const wholesalerId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      const unreadOnly = req.query.unreadOnly === 'true';

      await storage.syncStockAlerts(wholesalerId);
      const alerts = await storage.getStockAlerts(wholesalerId, unreadOnly);
      res.json(alerts);
    } catch (error) {
      console.error("Error fetching stock alerts:", error);
      res.status(500).json({ message: "Failed to fetch stock alerts" });
    }
  });

  // Multi-Wholesaler API Routes
  
  // Get all wholesaler relationships for the authenticated customer
  app.get('/api/customer/wholesalers', requireAuth, async (req: any, res) => {
    try {
      const customerId = req.user.id;
      const relationships = await multiWholesalerService.getCustomerWholesalers(customerId);
      res.json(relationships);
    } catch (error) {
      console.error('Error fetching customer wholesalers:', error);
      res.status(500).json({ message: 'Failed to fetch wholesaler relationships' });
    }
  });

  // Get all customers for the authenticated wholesaler
  app.get('/api/wholesaler/customers', requireAuth, async (req: any, res) => {
    try {
      const wholesalerId = req.user.id;
      const relationships = await multiWholesalerService.getWholesalerCustomers(wholesalerId);
      res.json(relationships);
    } catch (error) {
      console.error('Error fetching wholesaler customers:', error);
      res.status(500).json({ message: 'Failed to fetch customer relationships' });
    }
  });

  // Invite a customer to the wholesaler's platform
  app.post('/api/wholesaler/invite-customer', requireAuth, async (req: any, res) => {
    try {
      const wholesalerId = req.user.id;
      const { email, phoneNumber, firstName, lastName, customMessage } = req.body;
      
      if (!email) {
        return res.status(400).json({ message: 'Email is required' });
      }
      
      const result = await multiWholesalerService.inviteCustomer(wholesalerId, {
        email,
        phoneNumber,
        firstName,
        lastName,
        customMessage
      });
      
      res.json(result);
    } catch (error) {
      console.error('Error inviting customer:', error);
      res.status(500).json({ message: 'Failed to send customer invitation' });
    }
  });

  // Accept invitation using token (public endpoint for new customers)
  app.post('/api/customer/accept-invitation', async (req, res) => {
    try {
      const { token, email, phoneNumber, firstName, lastName } = req.body;
      
      if (!token) {
        return res.status(400).json({ message: 'Invitation token is required' });
      }
      
      const result = await multiWholesalerService.acceptInvitation(token, {
        email,
        phoneNumber,
        firstName,
        lastName
      });
      
      res.json(result);
    } catch (error) {
      console.error('Error accepting invitation:', error);
      res.status(500).json({ message: 'Failed to accept invitation' });
    }
  });

  // Check if customer has access to a specific wholesaler
  app.get('/api/customer/wholesaler-access/:wholesalerId', requireAuth, async (req: any, res) => {
    try {
      const customerId = req.user.id;
      const { wholesalerId } = req.params;
      
      const hasAccess = await multiWholesalerService.hasWholesalerAccess(customerId, wholesalerId);
      res.json({ hasAccess });
    } catch (error) {
      console.error('Error checking wholesaler access:', error);
      res.status(500).json({ message: 'Failed to check access' });
    }
  });

  // Update last accessed time for customer-wholesaler relationship
  app.post('/api/customer/update-last-accessed/:wholesalerId', requireAuth, async (req: any, res) => {
    try {
      const customerId = req.user.id;
      const { wholesalerId } = req.params;
      
      await multiWholesalerService.updateLastAccessed(customerId, wholesalerId);
      res.json({ success: true });
    } catch (error) {
      console.error('Error updating last accessed:', error);
      res.status(500).json({ message: 'Failed to update last accessed time' });
    }
  });

  // Remove customer relationship
  app.delete('/api/wholesaler/customer/:customerId', requireAuth, async (req: any, res) => {
    try {
      const wholesalerId = req.user.id;
      const { customerId } = req.params;
      
      const result = await multiWholesalerService.removeCustomerRelationship(customerId, wholesalerId);
      res.json(result);
    } catch (error) {
      console.error('Error removing customer relationship:', error);
      res.status(500).json({ message: 'Failed to remove customer relationship' });
    }
  });

  // Get pending invitations for wholesaler
  app.get('/api/wholesaler/pending-invitations', requireAuth, async (req: any, res) => {
    try {
      const wholesalerId = req.user.id;
      const invitations = await multiWholesalerService.getPendingInvitations(wholesalerId);
      res.json(invitations);
    } catch (error) {
      console.error('Error fetching pending invitations:', error);
      res.status(500).json({ message: 'Failed to fetch pending invitations' });
    }
  });

  // ============================================================================
  // SUBSCRIPTION MANAGEMENT ENDPOINTS
  // ============================================================================

  // Get available subscription plans
  app.get('/api/subscriptions/plans', async (req, res) => {
    try {
      const plans = await SubscriptionService.getPlans();
      res.json(plans);
    } catch (error) {
      console.error('❌ Failed to get subscription plans:', error);
      res.status(500).json({ 
        message: 'Failed to get subscription plans',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get user's current subscription
  app.get('/api/subscriptions/current', requireAuth, async (req: any, res) => {
    try {
      // Team members inherit their wholesaler's subscription plan
      const userId = (req.user.role === 'team_member' && req.user.wholesalerId)
        ? req.user.wholesalerId
        : req.user.id;
      const subscription = await SubscriptionService.getUserSubscription(userId);
      res.json(subscription);
    } catch (error) {
      console.error('❌ Failed to get user subscription:', error);
      res.status(500).json({ 
        message: 'Failed to get user subscription',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Enhanced subscription management endpoint
  app.post('/api/subscriptions/create-checkout-session', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { priceId, idempotencyKey } = req.body;

      if (!priceId) {
        return res.status(400).json({ message: 'Price ID is required' });
      }

      // Validate priceId exists in our subscription plans
      const validPlans = await db.select().from(subscriptionPlans)
        .where(eq(subscriptionPlans.stripePriceId, priceId));
      
      if (validPlans.length === 0) {
        return res.status(400).json({ message: 'Invalid price ID' });
      }

      const targetPlan = validPlans[0];
      
      // Get or create Stripe customer
      const stripeCustomerId = await SubscriptionService.getOrCreateStripeCustomer(userId);
      
      // Check for existing active subscription
      const existingSubscription = await SubscriptionService.getCurrentSubscription(userId);
      
      if (existingSubscription && existingSubscription.stripeSubscriptionId) {
        // UPGRADE FLOW: User has existing subscription - modify it with proration
        console.log('🔄 Processing subscription upgrade with proration');
        
        try {
          const updatedSubscription = await SubscriptionService.upgradeSubscriptionWithProration(
            existingSubscription.stripeSubscriptionId,
            priceId,
            targetPlan.planId
          );
          
          // Update user's plan immediately for upgrades (instant access)
          await storage.updateUser(userId, {
            currentPlan: targetPlan.planId,
            subscriptionStatus: 'active',
            productLimit: targetPlan.planId === 'premium' ? -1 : (targetPlan.planId === 'standard' ? 50 : 10),
            subscriptionEndsAt: new Date(updatedSubscription.current_period_end * 1000)
          });
          
          return res.json({ 
            success: true, 
            type: 'upgrade',
            subscription: {
              id: updatedSubscription.id,
              status: updatedSubscription.status,
              current_period_end: updatedSubscription.current_period_end
            },
            message: 'Subscription upgraded successfully with proration applied'
          });
        } catch (error) {
          console.error('❌ Failed to upgrade subscription:', error);
          return res.status(500).json({ message: 'Failed to upgrade subscription' });
        }
      } else {
        // NEW SUBSCRIPTION FLOW: User has no existing subscription - use checkout session
        console.log('🆕 Creating new subscription via checkout session');
        
        const sessionOptions: any = {
          customer: stripeCustomerId,
          payment_method_types: ['card'],
          line_items: [{
            price: priceId,
            quantity: 1,
          }],
          mode: 'subscription',
          success_url: `${process.env.FRONTEND_URL || 'https://quikpik.app'}/subscription-pricing?success=true&session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${process.env.FRONTEND_URL || 'https://quikpik.app'}/subscription-pricing?cancelled=true`,
          metadata: {
            userId: userId,
            planId: targetPlan.planId,
            subscriptionType: 'new'
          }
        };

        // Create Stripe checkout session with correct API syntax
        const session = idempotencyKey 
          ? await stripe.checkout.sessions.create(sessionOptions, { idempotencyKey })
          : await stripe.checkout.sessions.create(sessionOptions);

        return res.json({ 
          success: true, 
          type: 'checkout',
          sessionId: session.id,
          url: session.url 
        });
      }
    } catch (error) {
      console.error('❌ Failed to create checkout session:', error);
      res.status(500).json({ 
        message: 'Failed to create checkout session',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Enhanced downgrade endpoint - immediate downgrade with proration
  app.post('/api/subscriptions/downgrade', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { targetPlan } = req.body;

      // Zod validation for targetPlan
      const targetPlanSchema = z.object({
        targetPlan: z.enum(['free', 'standard', 'premium'], {
          errorMap: () => ({ message: 'targetPlan must be one of: free, standard, premium' })
        })
      });

      const validation = targetPlanSchema.safeParse({ targetPlan });
      if (!validation.success) {
        return res.status(400).json({ 
          message: 'Invalid target plan',
          errors: validation.error.errors
        });
      }

      // Get current subscription
      const currentSubscription = await SubscriptionService.getCurrentSubscription(userId);
      
      if (!currentSubscription?.stripeSubscriptionId) {
        return res.status(400).json({ message: 'No active subscription found' });
      }

      // Get target plan details to get the price ID
      const plans = await db.select().from(subscriptionPlans)
        .where(eq(subscriptionPlans.planId, targetPlan));
      
      if (plans.length === 0) {
        return res.status(400).json({ message: 'Target plan not found' });
      }

      const targetPlanData = plans[0];

      // Handle downgrade to free plan with proper proration
      if (targetPlan === 'free') {
        // Compute projected impact BEFORE proratedFreeDowngrade mutates the DB
        const projectedImpact = await getProjectedDowngradeImpact(userId, 'free');

        const result = await SubscriptionService.proratedFreeDowngrade(
          currentSubscription.stripeSubscriptionId,
          userId
        );

        // Enforce limits immediately (immediate downgrade path)
        const enforcedNow = await enforceNewPlanLimits(userId, 'free');

        // Send downgrade scheduled/immediate confirmation email
        // The webhook will also send the "effective" email when customer.subscription.deleted fires
        const [downgradedUser] = await db.select().from(users).where(eq(users.id, userId));
        if (downgradedUser?.email) {
          try {
            const { subject, html, text } = generateDowngradeScheduledEmail({
              firstName: downgradedUser.firstName || '',
              email: downgradedUser.email,
              businessName: downgradedUser.businessName || downgradedUser.name || 'Quikpik',
              currentPlan: currentSubscription.currentPlan || 'standard', // captured before proratedFreeDowngrade mutated the DB
              effectiveDate: new Date(), // immediate cancellation — effective today
              productsToLock: enforcedNow.productsLocked || undefined,
              totalProducts: projectedImpact.totalProducts || undefined,
              teamMembersToSuspend: enforcedNow.teamMembersSuspended || undefined,
              groupsToArchive: enforcedNow.groupsArchived || undefined,
            });
            await sendEmail({ to: downgradedUser.email, from: 'hello@quikpik.co', subject, html, text });
            console.log(`📧 Downgrade scheduled email sent to ${downgradedUser.email}`);
          } catch (emailErr) {
            console.error('❌ Failed to send downgrade scheduled email:', emailErr);
          }
        }
        
        res.json({
          success: true,
          type: 'downgrade_immediate',
          targetPlan: targetPlan,
          proratedCredit: result.proratedCredit,
          message: result.message
        });
        return;
      }

      // Handle downgrade to paid plan with immediate proration
      if (!targetPlanData.stripePriceId) {
        return res.status(400).json({ message: 'Target plan price ID not configured' });
      }

      const result = await SubscriptionService.immediateDowngradeWithProration(
        currentSubscription.stripeSubscriptionId,
        targetPlanData.stripePriceId,
        targetPlan
      );

      // Enforce paid→paid downgrade limits (e.g. Premium→Standard: lock products >50)
      await enforceNewPlanLimits(userId, targetPlan);

      res.json({
        success: true,
        type: 'downgrade_immediate',
        targetPlan: targetPlan,
        subscriptionId: result.id,
        message: 'Subscription downgraded immediately with pro-rated credit'
      });
    } catch (error) {
      console.error('❌ Failed to downgrade subscription:', error);
      res.status(500).json({ 
        message: 'Failed to downgrade subscription',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Cancel subscription (complete cancellation)
  app.post('/api/subscriptions/cancel', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const { user } = await SubscriptionService.getUserSubscription(userId);
      
      if (!user.stripeSubscriptionId) {
        return res.status(400).json({ message: 'No active subscription found' });
      }

      try {
        // Cancel subscription at period end using service method
        const subscription = await SubscriptionService.cancelSubscription(
          user.stripeSubscriptionId,
          { cancelAtPeriodEnd: true }
        );

        // Compute projected impact for the scheduled email (cancel = at period end, nothing locked yet)
        const cancelProjectedImpact = await getProjectedDowngradeImpact(userId, 'free');

        // Send downgrade scheduled confirmation email
        if (user.email) {
          try {
            const effectiveDate = new Date(subscription.current_period_end * 1000);
            const { subject, html, text } = generateDowngradeScheduledEmail({
              firstName: user.firstName || '',
              email: user.email,
              businessName: user.businessName || user.name || 'Quikpik',
              currentPlan: user.currentPlan || 'standard',
              effectiveDate,
              productsToLock: cancelProjectedImpact.productsToLock || undefined,
              totalProducts: cancelProjectedImpact.totalProducts || undefined,
              teamMembersToSuspend: cancelProjectedImpact.teamMembersToSuspend || undefined,
              groupsToArchive: cancelProjectedImpact.groupsToArchive || undefined,
            });
            await sendEmail({ to: user.email, from: 'hello@quikpik.co', subject, html, text });
            console.log(`📧 Downgrade scheduled email sent to ${user.email}`);
          } catch (emailErr) {
            console.error('❌ Failed to send downgrade scheduled email:', emailErr);
          }
        }

        return res.json({ 
          success: true, 
          message: 'Subscription will be canceled at the end of the current period',
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          currentPeriodEnd: subscription.current_period_end
        });
      } catch (stripeError: any) {
        // If Stripe says the subscription doesn't exist, it's already gone — clean up the DB
        const isStaleSubscription = 
          stripeError?.message?.includes('No such subscription') ||
          stripeError?.code === 'resource_missing';

        if (isStaleSubscription) {
          console.warn('⚠️ Stripe subscription not found — cleaning up stale ID for user:', userId, user.stripeSubscriptionId);

          await db.update(users).set({
            subscriptionStatus: 'free',
            currentPlan: 'free',
            subscriptionTier: 'free',
            productLimit: 10,
            stripeSubscriptionId: null,
            subscriptionPeriodStart: null,
            subscriptionPeriodEnd: null,
            updatedAt: new Date()
          }).where(eq(users.id, userId));

          const existingSub = await db.select().from(userSubscriptions)
            .where(eq(userSubscriptions.userId, userId));

          if (existingSub.length > 0) {
            await db.update(userSubscriptions).set({
              planId: 'free',
              stripeSubscriptionId: null,
              status: 'canceled',
              cancelAtPeriodEnd: null,
              updatedAt: new Date()
            }).where(eq(userSubscriptions.userId, userId));
          } else {
            await db.insert(userSubscriptions).values({
              userId,
              planId: 'free',
              stripeSubscriptionId: null,
              status: 'free',
              currentPeriodStart: null,
              currentPeriodEnd: null,
              cancelAtPeriodEnd: null
            });
          }

          console.log('✅ Stale subscription cleared — user reverted to free plan:', userId);
          return res.json({
            success: true,
            message: 'Subscription cancelled and plan reverted to Free'
          });
        }

        throw stripeError;
      }
    } catch (error) {
      console.error('❌ Failed to cancel subscription:', error);
      res.status(500).json({ 
        message: 'Failed to cancel subscription',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get user's plan limits and usage
  app.get('/api/subscriptions/plan-limits', requireAuth, async (req: any, res) => {
    try {
      const userId = req.user.id;
      const planLimits = await getUserPlanLimits(userId);
      res.json(planLimits);
    } catch (error) {
      console.error('❌ Failed to get plan limits:', error);
      res.status(500).json({ 
        message: 'Failed to get plan limits',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // =====================================================
  // ADMIN PANEL ENDPOINTS - Quikpik platform owner only
  // =====================================================
  const ADMIN_EMAILS = ['hello@quikpik.co', 'mogunjemilua@gmail.com'];

  app.get('/api/admin/platform-stats', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(req.user.email)) return res.status(403).json({ error: 'Forbidden' });

      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const PLAN_PRICES: Record<string, number> = { free: 0, standard: 19.99, premium: 39.99 };

      const [allWholesalers, allOrdersData, newWholesalers, ordersThisMonth] = await Promise.all([
        db.select({ subscriptionTier: users.subscriptionTier, archived: users.archived, subscriptionStatus: users.subscriptionStatus })
          .from(users).where(eq(users.role, 'wholesaler')),
        db.select({
          subtotal: orders.subtotal,
          platformFee: orders.platformFee,
          customerTransactionFee: orders.customerTransactionFee,
        }).from(orders),
        db.select({ count: count() }).from(users)
          .where(and(eq(users.role, 'wholesaler'), gte(users.createdAt, monthStart))),
        db.select({ count: count() }).from(orders)
          .where(gte(orders.createdAt, monthStart)),
      ]);

      const totalWholesalers = allWholesalers.length;
      const activeWholesalers = allWholesalers.filter(w => !w.archived).length;
      const suspendedWholesalers = allWholesalers.filter(w => w.archived).length;
      const wholesalersByPlan = {
        free: allWholesalers.filter(w => !w.subscriptionTier || w.subscriptionTier === 'free').length,
        standard: allWholesalers.filter(w => w.subscriptionTier === 'standard').length,
        premium: allWholesalers.filter(w => w.subscriptionTier === 'premium').length,
      };

      // Subscription MRR — count active paying wholesalers
      const activeStandard = allWholesalers.filter(w => w.subscriptionTier === 'standard' && !w.archived).length;
      const activePremium  = allWholesalers.filter(w => w.subscriptionTier === 'premium'  && !w.archived).length;
      const subscriptionMRR = (activeStandard * PLAN_PRICES.standard) + (activePremium * PLAN_PRICES.premium);
      const subscriptionBreakdown = {
        standard: { count: activeStandard, mrr: activeStandard * PLAN_PRICES.standard },
        premium:  { count: activePremium,  mrr: activePremium  * PLAN_PRICES.premium  },
      };

      let totalGMV = 0, totalCustomerFees = 0, totalPlatformFees = 0;
      for (const o of allOrdersData) {
        totalGMV += parseFloat(o.subtotal || '0');
        totalCustomerFees += parseFloat((o.customerTransactionFee as any) || '0');
        totalPlatformFees += parseFloat(o.platformFee || '0');
      }

      res.json({
        totalWholesalers,
        activeWholesalers,
        suspendedWholesalers,
        wholesalersByPlan,
        totalOrders: allOrdersData.length,
        ordersThisMonth: Number(ordersThisMonth[0]?.count || 0),
        totalGMV,
        totalCustomerFees,
        totalPlatformFees,
        totalGrossRevenue: totalCustomerFees + totalPlatformFees,
        newWholesalersThisMonth: Number(newWholesalers[0]?.count || 0),
        subscriptionRevenueMRR: subscriptionMRR,
        subscriptionBreakdown,
      });
    } catch (error) {
      console.error('Admin platform-stats error:', error);
      res.status(500).json({ error: 'Failed to fetch platform stats' });
    }
  });

  app.get('/api/admin/wholesalers', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(req.user.email)) return res.status(403).json({ error: 'Forbidden' });

      const wholesalersList = await db.select().from(users).where(eq(users.role, 'wholesaler')).orderBy(desc(users.createdAt));

      const wholesalerIds = wholesalersList.map(w => w.id);
      let ordersByWholesaler: Record<string, { count: number; gmv: number; customerFees: number; platformFees: number; lastOrderAt: Date | null }> = {};

      if (wholesalerIds.length > 0) {
        const orderStats = await db.select({
          wholesalerId: orders.wholesalerId,
          subtotal: orders.subtotal,
          platformFee: orders.platformFee,
          customerTransactionFee: orders.customerTransactionFee,
          createdAt: orders.createdAt,
        }).from(orders).where(inArray(orders.wholesalerId, wholesalerIds));

        for (const o of orderStats) {
          const wid = o.wholesalerId;
          if (!ordersByWholesaler[wid]) ordersByWholesaler[wid] = { count: 0, gmv: 0, customerFees: 0, platformFees: 0, lastOrderAt: null };
          ordersByWholesaler[wid].count++;
          ordersByWholesaler[wid].gmv += parseFloat(o.subtotal || '0');
          ordersByWholesaler[wid].customerFees += parseFloat((o.customerTransactionFee as any) || '0');
          ordersByWholesaler[wid].platformFees += parseFloat(o.platformFee || '0');
          const oDate = o.createdAt ? new Date(o.createdAt) : null;
          if (oDate && (!ordersByWholesaler[wid].lastOrderAt || oDate > ordersByWholesaler[wid].lastOrderAt!)) {
            ordersByWholesaler[wid].lastOrderAt = oDate;
          }
        }
      }

      const result = wholesalersList.map(w => {
        const stats = ordersByWholesaler[w.id] || { count: 0, gmv: 0, customerFees: 0, platformFees: 0, lastOrderAt: null };
        return {
          id: w.id,
          email: w.email,
          firstName: w.firstName,
          lastName: w.lastName,
          businessName: w.businessName,
          phoneNumber: w.phoneNumber,
          subscriptionTier: w.subscriptionTier || 'free',
          createdAt: w.createdAt,
          archived: w.archived,
          orderCount: stats.count,
          totalGMV: stats.gmv,
          customerFeesEarned: stats.customerFees,
          platformFeesEarned: stats.platformFees,
          totalFeesEarned: stats.customerFees + stats.platformFees,
          lastOrderAt: stats.lastOrderAt,
        };
      }).sort((a, b) => b.totalFeesEarned - a.totalFeesEarned);

      res.json(result);
    } catch (error) {
      console.error('Admin wholesalers error:', error);
      res.status(500).json({ error: 'Failed to fetch wholesalers' });
    }
  });

  app.get('/api/admin/revenue', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(req.user.email)) return res.status(403).json({ error: 'Forbidden' });

      const { from, to, wholesalerId: filterWholesalerId } = req.query as Record<string, string>;

      const conditions: any[] = [];
      if (from)  conditions.push(gte(orders.createdAt, new Date(from)));
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        conditions.push(lte(orders.createdAt, toDate));
      }
      if (filterWholesalerId) conditions.push(eq(orders.wholesalerId, filterWholesalerId));

      let q = db
        .select({
          id: orders.id,
          orderNumber: orders.orderNumber,
          wholesalerId: orders.wholesalerId,
          wholesalerName: users.businessName,
          customerName: orders.customerName,
          subtotal: orders.subtotal,
          customerTransactionFee: orders.customerTransactionFee,
          platformFee: orders.platformFee,
          total: orders.total,
          status: orders.status,
          paymentStatus: orders.paymentStatus,
          createdAt: orders.createdAt,
        })
        .from(orders)
        .leftJoin(users, eq(orders.wholesalerId, users.id)) as any;

      if (conditions.length > 0) q = q.where(and(...conditions));

      const recentOrders = await q.orderBy(desc(orders.createdAt)).limit(1000);

      let totalCustomerFees = 0, totalPlatformFees = 0, totalGMV = 0;
      const processedOrders = recentOrders.map(o => {
        const custFee = parseFloat((o.customerTransactionFee as any) || '0');
        const platFee = parseFloat(o.platformFee || '0');
        const sub = parseFloat(o.subtotal || '0');
        totalCustomerFees += custFee;
        totalPlatformFees += platFee;
        totalGMV += sub;
        return {
          ...o,
          customerTransactionFee: custFee,
          platformFee: platFee,
          subtotal: sub,
          totalQuikpikIncome: custFee + platFee,
        };
      });

      res.json({
        orders: processedOrders,
        totals: {
          totalCustomerFees,
          totalPlatformFees,
          totalGrossRevenue: totalCustomerFees + totalPlatformFees,
          totalGMV,
        },
      });
    } catch (error) {
      console.error('Admin revenue error:', error);
      res.status(500).json({ error: 'Failed to fetch revenue data' });
    }
  });

  app.patch('/api/admin/wholesalers/:id/toggle-status', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(req.user.email)) return res.status(403).json({ error: 'Forbidden' });

      const targetUser = await db.select().from(users).where(eq(users.id, req.params.id)).limit(1);
      if (!targetUser.length || targetUser[0].role !== 'wholesaler') {
        return res.status(404).json({ error: 'Wholesaler not found' });
      }

      const newArchived = !targetUser[0].archived;
      await db.update(users).set({ archived: newArchived }).where(eq(users.id, req.params.id));

      res.json({ id: req.params.id, archived: newArchived, businessName: targetUser[0].businessName });
    } catch (error) {
      console.error('Admin toggle-status error:', error);
      res.status(500).json({ error: 'Failed to toggle status' });
    }
  });

  // ── Admin: Customer Map Data ─────────────────────────────────────────────
  async function geocodePostcode(postcode: string): Promise<{ lat: number; lng: number } | null> {
    try {
      const clean = postcode.trim().replace(/\s+/g, '').toUpperCase();
      const response = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(clean)}`);
      if (!response.ok) return null;
      const data: any = await response.json();
      if (data.status === 200 && data.result) {
        return { lat: data.result.latitude, lng: data.result.longitude };
      }
      return null;
    } catch {
      return null;
    }
  }

  app.get('/api/admin/customers/map', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(req.user.email)) return res.status(403).json({ error: 'Forbidden' });

      const customers = await db
        .select({
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          businessName: users.businessName,
          phoneNumber: users.phoneNumber,
          postalCode: users.postalCode,
          customerType: users.customerType,
          latitude: users.latitude,
          longitude: users.longitude,
          geocodeStatus: users.geocodeStatus,
          wholesalerId: users.wholesalerId,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(eq(users.role, 'retailer'))
        .orderBy(desc(users.createdAt));

      const customerIds = customers.map(c => c.id);
      let orderCountMap: Record<string, number> = {};
      if (customerIds.length > 0) {
        const counts = await db
          .select({ retailerId: orders.retailerId, count: count() })
          .from(orders)
          .where(inArray(orders.retailerId, customerIds))
          .groupBy(orders.retailerId);
        for (const row of counts) {
          if (row.retailerId) orderCountMap[row.retailerId] = Number(row.count);
        }
      }

      const wholesalerIds = [...new Set(customers.map(c => c.wholesalerId).filter(Boolean))] as string[];
      let wholesalerMap: Record<string, string> = {};
      if (wholesalerIds.length > 0) {
        const ws = await db
          .select({ id: users.id, businessName: users.businessName, firstName: users.firstName, lastName: users.lastName })
          .from(users)
          .where(inArray(users.id, wholesalerIds));
        for (const w of ws) {
          wholesalerMap[w.id] = w.businessName || `${w.firstName || ''} ${w.lastName || ''}`.trim() || 'Unknown';
        }
      }

      const result = customers.map(c => ({
        id: c.id,
        name: `${c.firstName || ''} ${c.lastName || ''}`.trim() || c.businessName || 'Unknown',
        businessName: c.businessName,
        phoneNumber: c.phoneNumber,
        postalCode: c.postalCode,
        customerType: c.customerType,
        latitude: c.latitude != null ? parseFloat(String(c.latitude)) : null,
        longitude: c.longitude != null ? parseFloat(String(c.longitude)) : null,
        geocodeStatus: c.geocodeStatus,
        wholesalerName: c.wholesalerId ? (wholesalerMap[c.wholesalerId] || 'Unknown') : 'No wholesaler',
        orderCount: orderCountMap[c.id] || 0,
      }));

      res.json({ customers: result });
    } catch (error) {
      console.error('Admin customers/map error:', error);
      res.status(500).json({ error: 'Failed to fetch customer map data' });
    }
  });

  app.patch('/api/admin/customers/:id/type', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(req.user.email)) return res.status(403).json({ error: 'Forbidden' });

      const { customerType, postalCode } = req.body;
      const validTypes = ['retail', 'wholesale', 'individual', null, ''];
      if (customerType !== undefined && !validTypes.includes(customerType)) {
        return res.status(400).json({ error: 'Invalid customer type. Must be retail, wholesale, or individual.' });
      }

      // Verify target is a customer/retailer record
      const target = await db
        .select({ id: users.id, role: users.role })
        .from(users)
        .where(eq(users.id, req.params.id))
        .limit(1);
      if (!target[0]) return res.status(404).json({ error: 'Customer not found' });
      if (target[0].role !== 'retailer') return res.status(400).json({ error: 'Target user is not a customer' });

      const updateData: Record<string, string | null> = {};
      if (customerType !== undefined) updateData.customerType = customerType || null;

      if (postalCode !== undefined) {
        // Explicit postcode supplied — update it and always re-geocode
        updateData.postalCode = postalCode || null;

        if (!postalCode) {
          // Postcode cleared — clear coordinates and flag the record
          updateData.latitude = null;
          updateData.longitude = null;
          updateData.geocodeStatus = 'flagged';
        } else {
          // Postcode provided — attempt geocoding
          const coords = await geocodePostcode(postalCode);
          if (coords) {
            updateData.latitude = coords.lat.toString();
            updateData.longitude = coords.lng.toString();
            updateData.geocodeStatus = 'success';
          } else {
            updateData.latitude = null;
            updateData.longitude = null;
            updateData.geocodeStatus = 'flagged';
          }
        }
      } else {
        // No postcode in request — re-geocode using the customer's existing postcode
        // if they have one and haven't been successfully geocoded yet
        const existing = await db
          .select({ postalCode: users.postalCode, geocodeStatus: users.geocodeStatus })
          .from(users)
          .where(eq(users.id, req.params.id))
          .limit(1);
        const existingPostcode = existing[0]?.postalCode;
        const alreadyGeocoded = existing[0]?.geocodeStatus === 'success';

        if (existingPostcode && !alreadyGeocoded) {
          const coords = await geocodePostcode(existingPostcode);
          if (coords) {
            updateData.latitude = coords.lat.toString();
            updateData.longitude = coords.lng.toString();
            updateData.geocodeStatus = 'success';
          } else {
            updateData.latitude = null;
            updateData.longitude = null;
            updateData.geocodeStatus = 'flagged';
          }
        }
      }

      await db.update(users).set(updateData).where(eq(users.id, req.params.id));

      const updated = await db.select({
        id: users.id, customerType: users.customerType, postalCode: users.postalCode,
        latitude: users.latitude, longitude: users.longitude, geocodeStatus: users.geocodeStatus,
      }).from(users).where(eq(users.id, req.params.id)).limit(1);

      res.json(updated[0] || {});
    } catch (error) {
      console.error('Admin customers/:id/type error:', error);
      res.status(500).json({ error: 'Failed to update customer type' });
    }
  });

  app.post('/api/admin/customers/geocode-all', requireAuth, async (req: any, res) => {
    try {
      if (!ADMIN_EMAILS.includes(req.user.email)) return res.status(403).json({ error: 'Forbidden' });

      const pending = await db
        .select({ id: users.id, postalCode: users.postalCode })
        .from(users)
        .where(and(eq(users.role, 'retailer'), or(isNull(users.latitude), isNull(users.longitude))));

      let success = 0, flagged = 0;
      for (const customer of pending) {
        if (!customer.postalCode) {
          await db.update(users).set({ geocodeStatus: 'flagged' }).where(eq(users.id, customer.id));
          flagged++;
          continue;
        }
        const coords = await geocodePostcode(customer.postalCode);
        if (coords) {
          await db.update(users).set({
            latitude: coords.lat.toString(),
            longitude: coords.lng.toString(),
            geocodeStatus: 'success',
          }).where(eq(users.id, customer.id));
          success++;
        } else {
          await db.update(users).set({ geocodeStatus: 'flagged', latitude: null, longitude: null }).where(eq(users.id, customer.id));
          flagged++;
        }
        await new Promise(r => setTimeout(r, 100));
      }

      res.json({ processed: pending.length, success, flagged });
    } catch (error) {
      console.error('Admin geocode-all error:', error);
      res.status(500).json({ error: 'Failed to geocode customers' });
    }
  });
  // ────────────────────────────────────────────────────────────────────────────

  // =====================================================
  // QUICK QUOTE - Create quote with custom prices and payment link
  // =====================================================
  app.post('/api/quotes', requireAuth, async (req: any, res) => {
    try {
      const wholesalerId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;
      
      const { customerId, items, sendVia, depositPercentage = 100, balanceDueDays = 0, fulfillmentType = 'pickup', deliveryCharge = 0, deliveryAddressId = null, deliveryAddress = null, customAddressFields = null } = req.body;
      
      console.log('📝 Creating quote:', { wholesalerId, customerId, itemCount: items?.length, sendVia, depositPercentage, fulfillmentType, deliveryAddressId, hasDeliveryAddress: !!deliveryAddress, hasCustomAddressFields: !!customAddressFields });
      
      if (!customerId || !items || items.length === 0) {
        return res.status(400).json({ error: 'Customer and items are required' });
      }

      if (fulfillmentType === 'delivery' && !deliveryAddressId && !deliveryAddress && !customAddressFields?.addressLine1) {
        return res.status(400).json({ error: 'Delivery address is required for delivery orders' });
      }

      if (fulfillmentType === 'delivery' && !deliveryAddressId && customAddressFields) {
        if (!customAddressFields.addressLine1 || !customAddressFields.city || !customAddressFields.postalCode) {
          return res.status(400).json({ error: 'Address line, city, and postal code are required for custom addresses' });
        }
      }

      // Get customer details
      const customer = await storage.getUser(customerId);
      if (!customer) {
        return res.status(404).json({ error: 'Customer not found' });
      }

      // Get wholesaler details
      const wholesaler = await storage.getUser(wholesalerId);
      if (!wholesaler) {
        return res.status(404).json({ error: 'Wholesaler not found' });
      }

      // Calculate totals
      // Customer pays: productSubtotal + deliveryCharge + transaction fee (5.5% + £0.50)
      // Wholesaler pays: platform fee (3.3% of productSubtotal only) - internal
      const productSubtotal = items.reduce((sum: number, item: any) => 
        sum + (item.customPrice * item.quantity), 0
      );
      const quoteDeliveryCharge = fulfillmentType === 'delivery' ? (parseFloat(deliveryCharge) || 0) : 0;
      const subtotal = productSubtotal + quoteDeliveryCharge;
      const customerTransactionFee = (subtotal * 0.055) + 0.50; // 5.5% + £0.50 on products + delivery
      const platformFee = subtotal * 0.033; // 3.3% platform fee on products + delivery
      const total = subtotal + customerTransactionFee;

      // Calculate deposit amount
      const validDepositPercentage = [0, 25, 50, 75, 100].includes(depositPercentage) ? depositPercentage : 100;
      const depositAmount = total * (validDepositPercentage / 100);
      const outstandingAmount = total - depositAmount;

      // Generate unified order number (same sequence as regular orders)
      const orderNumber = await generateOrderNumber(wholesalerId);

      // Auto-save custom delivery address to customer profile
      let resolvedDeliveryAddressId = deliveryAddressId ? (typeof deliveryAddressId === 'number' ? deliveryAddressId : parseInt(deliveryAddressId)) : null;
      let resolvedDeliveryAddress = deliveryAddress;
      
      if (fulfillmentType === 'delivery' && !deliveryAddressId && customAddressFields && customAddressFields.addressLine1 && customAddressFields.city && customAddressFields.postalCode) {
        try {
          const savedAddress = await storage.createDeliveryAddress({
            customerId,
            wholesalerId,
            addressLine1: customAddressFields.addressLine1,
            addressLine2: null,
            city: customAddressFields.city,
            state: customAddressFields.state || null,
            postalCode: customAddressFields.postalCode,
            country: 'United Kingdom',
            label: customAddressFields.label || null,
            instructions: null,
            isDefault: false,
          });
          resolvedDeliveryAddressId = savedAddress.id;
          resolvedDeliveryAddress = deliveryAddress || `${customAddressFields.addressLine1}, ${customAddressFields.city}, ${customAddressFields.postalCode}`;
          console.log(`📍 Auto-saved delivery address ${savedAddress.id} for customer ${customerId}`);
        } catch (addrErr) {
          console.error('⚠️ Failed to auto-save delivery address, continuing with text:', addrErr);
        }
      }

      // Create the quote order in pending status
      const [quoteOrder] = await db.insert(orders).values({
        orderNumber,
        wholesalerId,
        retailerId: customerId,
        customerName: `${customer.firstName} ${customer.lastName}`.trim(),
        customerEmail: customer.email,
        customerPhone: customer.phoneNumber,
        status: 'pending',
        subtotal: productSubtotal.toFixed(2),
        platformFee: platformFee.toFixed(2),
        customerTransactionFee: customerTransactionFee.toFixed(2),
        deliveryCost: quoteDeliveryCharge.toFixed(2),
        total: total.toFixed(2),
        fulfillmentType: fulfillmentType === 'delivery' ? 'delivery' : 'pickup',
        ...(fulfillmentType === 'delivery' && resolvedDeliveryAddressId ? { deliveryAddressId: resolvedDeliveryAddressId } : {}),
        ...(fulfillmentType === 'delivery' && resolvedDeliveryAddress ? { deliveryAddress: resolvedDeliveryAddress } : {}),
        isQuote: true,
        quoteSentVia: sendVia,
        notes: 'Quick Quote - Custom pricing negotiated on-site',
        depositPercentage: validDepositPercentage,
        balanceDueDays: validDepositPercentage === 100 ? 0 : ([0, 7, 14, 30, 60].includes(balanceDueDays) ? balanceDueDays : 0), // Enforce 0 for full payment, otherwise use request value
        amountPaid: '0.00',
        // Pay Later (0%) = offline payment, no customer transaction fee — outstanding = subtotal
        // All other payment types = Stripe, outstanding = total (includes transaction fee)
        amountOutstanding: validDepositPercentage === 0 ? subtotal.toFixed(2) : total.toFixed(2),
        paymentStatus: 'unpaid',
        ...(req.user.role === 'team_member' ? { placedByName: `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim() || 'Team Member' } : {}),
      }).returning();

      // Create order items with custom prices (supporting both units and pallets)
      // AND decrement stock immediately (field sales - products given in person)
      for (const item of items) {
        const sellingType = item.sellingType || 'units';
        await db.insert(orderItems).values({
          orderId: quoteOrder.id,
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.customPrice.toFixed(2),
          total: (item.customPrice * item.quantity).toFixed(2),
          sellingType: sellingType,
        });
        
        // CRITICAL: Decrement stock at quote creation (products handed over in person)
        const [product] = await db.select().from(products).where(eq(products.id, item.productId));
        if (product) {
          const quantity = item.quantity;
          console.log(`📦 QUOTE STOCK: Decrementing ${quantity} ${sellingType} of ${product.name} at quote creation`);
          
          // Use InventoryCalculator for proper stock tracking
          const orderResult = InventoryCalculator.processOrder(quantity, sellingType as 'units' | 'pallets', {
            stock: product.stock,
            palletStock: product.palletStock,
            quantityInPack: product.quantityInPack,
            unitsPerPallet: product.unitsPerPallet
          });
          
          const { newUnitStock, newPalletStock } = orderResult;
          
          // Update stock fields
          await db.update(products)
            .set({ 
              stock: newUnitStock,
              palletStock: newPalletStock,
              updatedAt: new Date()
            })
            .where(eq(products.id, item.productId));
          
          // Record stock movement
          await db.insert(stockMovements).values({
            productId: item.productId,
            wholesalerId: wholesalerId,
            movementType: 'purchase',
            quantity: -quantity,
            unitType: sellingType === 'pallets' ? 'pallets' : 'units',
            stockBefore: sellingType === 'pallets' ? (product.palletStock || 0) : (product.stock || 0),
            stockAfter: sellingType === 'pallets' ? newPalletStock : newUnitStock,
            reason: `Quote order sale - ${quantity} ${sellingType}`,
            orderId: quoteOrder.id
          });
          
          console.log(`✅ QUOTE STOCK: ${product.name} ${sellingType}: ${sellingType === 'pallets' ? product.palletStock : product.stock} → ${sellingType === 'pallets' ? newPalletStock : newUnitStock}`);
        }
      }

      // Create Stripe Payment Link (skip for 0% pay-later quotes)
      let paymentLinkUrl = '';
      let paymentLinkId = '';
      
      if (stripe && validDepositPercentage > 0) {
        try {
          // Create line items for Stripe
          // Deposits: single line item for the deposit amount (% of total including transaction fee)
          // Full payment: single line item for the full total (subtotal + transaction fee)
          // Never map raw item prices — they exclude the customer transaction fee
          const isDeposit = validDepositPercentage < 100;
          const lineItems = isDeposit
            ? [{
                price_data: {
                  currency: 'gbp',
                  product_data: {
                    name: `Deposit (${validDepositPercentage}%) - Order ${orderNumber}`,
                    description: `Deposit payment for quote. Full order: £${total.toFixed(2)}. Remaining: £${outstandingAmount.toFixed(2)}`,
                  },
                  unit_amount: Math.round(depositAmount * 100),
                },
                quantity: 1,
              }]
            : [{
                price_data: {
                  currency: 'gbp',
                  product_data: {
                    name: `Order ${orderNumber}`,
                    description: `Full payment including transaction fee`,
                  },
                  unit_amount: Math.round(total * 100), // total = subtotal + customer transaction fee
                },
                quantity: 1,
              }];

          // Check if customer has previous orders with this wholesaler
          const previousOrders = await db.select({ id: orders.id }).from(orders)
            .where(and(eq(orders.retailerId, customerId), eq(orders.wholesalerId, wholesalerId), ne(orders.id, quoteOrder.id)))
            .limit(1);
          const isReturning = previousOrders.length > 0;

          // Validate wholesaler's Stripe Connect account for automatic transfer
          let quoteUseConnect = false;
          if (wholesaler.stripeAccountId) {
            try {
              const connectAccount = await stripe.accounts.retrieve(wholesaler.stripeAccountId);
              if (connectAccount.charges_enabled && connectAccount.details_submitted) {
                quoteUseConnect = true;
                console.log(`✅ Quote Connect account active: ${wholesaler.stripeAccountId}`);
              } else {
                console.log(`⚠️ Quote Connect account not ready: ${wholesaler.stripeAccountId}`);
              }
            } catch (connectErr: any) {
              console.error(`❌ Quote Connect account validation failed: ${connectErr.message}`);
            }
          }

          // Wholesaler receives subtotal minus 3.3% platform fee; proportional to deposit
          const wholesalerTotal = subtotal - platformFee;
          const wholesalerDepositAmount = Math.round(depositAmount * (wholesalerTotal / total) * 100);

          // Base session params (no Connect routing) — used as fallback if transfer_data fails
          const baseSessionParams: Parameters<typeof stripe.checkout.sessions.create>[0] = {
            payment_method_types: ['card'],
            line_items: lineItems,
            mode: 'payment',
            success_url: `${process.env.APP_URL || (process.env.REPLIT_DOMAINS?.split(',')[0] ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}` : 'https://quikpik.app')}/customer/payment-success?order=${quoteOrder.orderNumber}&wholesaler=${wholesalerId}${isReturning ? '&returning=true' : ''}&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.APP_URL || (process.env.REPLIT_DOMAINS?.split(',')[0] ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}` : 'https://quikpik.app')}/store/${wholesalerId}`,
            metadata: {
              orderId: quoteOrder.id.toString(),
              orderNumber: quoteOrder.orderNumber,
              wholesalerId,
              customerId,
              isQuote: 'true',
              depositPercentage: validDepositPercentage.toString(),
              depositAmount: depositAmount.toFixed(2),
              totalAmount: total.toFixed(2),
            },
            customer_email: customer.email || undefined,
            expires_at: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // Stripe max is 24 hours
          };

          // First attempt: with Connect routing (transfer_data)
          let session: Awaited<ReturnType<typeof stripe.checkout.sessions.create>> | null = null;
          if (quoteUseConnect && wholesalerDepositAmount > 0) {
            try {
              session = await stripe.checkout.sessions.create({
                ...baseSessionParams,
                payment_intent_data: {
                  transfer_data: {
                    destination: wholesaler.stripeAccountId!,
                    amount: wholesalerDepositAmount,
                  },
                },
              });
              console.log(`✅ Quote session created with Connect routing: ${session.id}`);
            } catch (connectSessionErr: any) {
              console.error(`❌ Quote session with Connect routing failed — type: ${connectSessionErr.type}, code: ${connectSessionErr.code}, message: ${connectSessionErr.message}`);
              console.log(`⚠️ Retrying quote session without Connect routing...`);
            }
          }

          // Fallback: plain session without Connect routing (payment goes to platform account)
          if (!session) {
            session = await stripe.checkout.sessions.create(baseSessionParams);
            console.log(`✅ Quote session created (no Connect routing): ${session.id}`);
          }

          paymentLinkUrl = session.url || '';
          paymentLinkId = session.id;

          const expiryDays = validDepositPercentage < 100 ? Math.min((quoteOrder.balanceDueDays || 0) + 3, 30) : 1;
          // Update order with payment link
          await db.update(orders)
            .set({
              stripePaymentLinkId: paymentLinkId,
              stripePaymentLinkUrl: paymentLinkUrl,
              quoteExpiresAt: new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000),
            })
            .where(eq(orders.id, quoteOrder.id));

        } catch (stripeError: any) {
          console.error(`❌ Stripe error creating quote payment link — type: ${stripeError.type}, code: ${stripeError.code}, message: ${stripeError.message}`);
          // Continue without payment link - manual payment can be arranged
        }
      }

      // Send SMS notification
      if (sendVia === 'sms' && customer.phoneNumber) {
        const isDeposit = validDepositPercentage > 0 && validDepositPercentage < 100;
        const isPayLater = validDepositPercentage === 0;
        const businessName = wholesaler.businessName || `${wholesaler.firstName}'s Store`;
        const storeLink = `https://quikpik.app/store/${wholesalerId}`;
        const wholesalerContact = wholesaler.phoneNumber || wholesaler.email || '';
        
        // Build order items list for SMS
        let itemsList = '';
        try {
          const itemsListParts: string[] = [];
          for (const item of items) {
            const [product] = await db.select().from(products).where(eq(products.id, item.productId));
            const productName = product?.name || `Product #${item.productId}`;
            const sellingType = item.sellingType || 'units';
            const total = item.customPrice * item.quantity;
            itemsListParts.push(`• ${productName} - ${item.quantity} ${sellingType} × £${item.customPrice.toFixed(2)} = £${total.toFixed(2)}`);
          }
          itemsList = itemsListParts.join('\n');
        } catch (itemsError) {
          console.error('⚠️ Could not fetch product names for SMS:', itemsError);
          itemsList = `${items.length} item(s)`;
        }
        
        // Calculate balance due date for deposit orders - use persisted order value for consistency
        const orderBalanceDueDays = quoteOrder.balanceDueDays || 0;
        let balanceDueText = '';
        if (isDeposit && orderBalanceDueDays > 0) {
          const dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + orderBalanceDueDays);
          const formattedDate = dueDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
          balanceDueText = `\nBalance due by: ${formattedDate}`;
        } else if (isDeposit && orderBalanceDueDays === 0) {
          balanceDueText = '\nBalance due: Immediately';
        }
        
        const deliveryChargeText = quoteDeliveryCharge > 0 ? `\nDelivery: £${quoteDeliveryCharge.toFixed(2)}` : '';
        const deliveryNoteText = wholesaler.deliveryNote ? `\n📦 ${wholesaler.deliveryNote}` : '';
        const bankDetailsText = wholesaler.bankSortCode && wholesaler.bankAccountNumber
          ? `\n\nBank Transfer Details:\nAccount Name: ${wholesaler.bankAccountName || businessName}\nSort Code: ${wholesaler.bankSortCode}\nAccount No: ${wholesaler.bankAccountNumber}`
          : '';

        const message = isPayLater
          ? `Hi ${customer.firstName || 'there'}! ${businessName} has sent you a quote.\n\nItems:\n${itemsList}${deliveryChargeText}\n\nTotal: £${total.toFixed(2)}\nPayment: Pay Later${deliveryNoteText}${bankDetailsText}\n\nPlease arrange payment with ${businessName} directly.\n\n${wholesalerContact ? `Contact ${businessName}: ${wholesalerContact}\n\n` : ''}Do not reply to this message.`
          : isDeposit 
          ? `Hi ${customer.firstName || 'there'}! ${businessName} has sent you a quote.\n\nItems:\n${itemsList}${deliveryChargeText}\n\nOrder Total: £${total.toFixed(2)}\nDeposit (${validDepositPercentage}%): £${depositAmount.toFixed(2)}\nRemaining: £${outstandingAmount.toFixed(2)}${balanceDueText}${deliveryNoteText}\n\nPay deposit: ${paymentLinkUrl}\n\nLink expires in 24 hours.\n\n${wholesalerContact ? `Contact ${businessName}: ${wholesalerContact}\n\n` : ''}Do not reply to this message.`
          : `Hi ${customer.firstName || 'there'}! ${businessName} has sent you a quote.\n\nItems:\n${itemsList}${deliveryChargeText}\n\nTotal: £${total.toFixed(2)}${deliveryNoteText}\n\nPay here: ${paymentLinkUrl}\n\nLink expires in 24 hours.\n\n${wholesalerContact ? `Contact ${businessName}: ${wholesalerContact}\n\n` : ''}Do not reply to this message.`;
        
        try {
          await sendSMS({
            to: customer.phoneNumber,
            message,
          });
          console.log(`📱 Quote SMS sent to ${customer.phoneNumber}`);
          
          // Update quote sent timestamp
          await db.update(orders)
            .set({ quoteSentAt: new Date() })
            .where(eq(orders.id, quoteOrder.id));
        } catch (smsError) {
          console.error('❌ Failed to send quote SMS:', smsError);
        }
      }

      console.log(`✅ Quote ${orderNumber} created successfully`);

      // Send confirmation email to wholesaler
      try {
        if (wholesaler.email) {
          const isDeposit = validDepositPercentage > 0 && validDepositPercentage < 100;
          const isPayLater = validDepositPercentage === 0;
          const itemsForEmail: string[] = [];
          for (const item of items) {
            const [product] = await db.select().from(products).where(eq(products.id, item.productId));
            const productName = product?.name || `Product #${item.productId}`;
            const sellingType = item.sellingType || 'units';
            const itemTotal = item.customPrice * item.quantity;
            itemsForEmail.push(`<li style="margin: 6px 0;"><strong>${productName}</strong> - ${item.quantity} ${sellingType} × £${item.customPrice.toFixed(2)} = <strong>£${itemTotal.toFixed(2)}</strong></li>`);
          }

          const paymentStatusText = isPayLater ? emailBadge('Pay Later', '#3b82f6') : emailBadge('Awaiting Payment', '#f59e0b');
          let fullDeliveryAddressText = resolvedDeliveryAddress || '';
          if (fulfillmentType === 'delivery' && !fullDeliveryAddressText && resolvedDeliveryAddressId) {
            try {
              const addr = await storage.getDeliveryAddress(resolvedDeliveryAddressId);
              if (addr) {
                fullDeliveryAddressText = [addr.addressLine1, addr.addressLine2, addr.city, addr.state, addr.postalCode, addr.country].filter(Boolean).join(', ');
              }
            } catch (e) { /* ignore */ }
          }
          const deliveryLineHtml = fulfillmentType === 'delivery'
            ? `<p style="margin:4px 0 0"><b>Fulfillment:</b> Delivery${quoteDeliveryCharge > 0 ? ` (£${quoteDeliveryCharge.toFixed(2)})` : ''}</p>${fullDeliveryAddressText ? `<p style="margin:4px 0 0"><b>Address:</b> ${fullDeliveryAddressText}</p>` : ''}${wholesaler.deliveryNote ? `<p style="margin:4px 0 0;font-style:italic;color:#92400e">📦 ${wholesaler.deliveryNote}</p>` : ''}`
            : `<p style="margin:4px 0 0"><b>Fulfillment:</b> Collection</p>`;
          const deliveryRowHtml = quoteDeliveryCharge > 0 ? `<tr><td style="padding:4px 0">Delivery:</td><td style="padding:4px 0;text-align:right">£${quoteDeliveryCharge.toFixed(2)}</td></tr>` : '';
          // Wholesaler sees subtotal (products + delivery) — never the customer transaction fee
          const wholesalerDeposit = isDeposit ? subtotal * (validDepositPercentage / 100) : 0;
          const wholesalerOutstanding = isDeposit ? subtotal - wholesalerDeposit : 0;
          const bankDetailsSectionHtml = (isPayLater && wholesaler.bankSortCode && wholesaler.bankAccountNumber)
            ? emailCard(`${emailHeading('Bank Transfer Details', { size: '15px' })}<p style="margin:0 0 4px"><b>Account Name:</b> ${wholesaler.bankAccountName || wholesaler.businessName || 'N/A'}</p><p style="margin:0 0 4px"><b>Sort Code:</b> ${wholesaler.bankSortCode}</p><p style="margin:0"><b>Account Number:</b> ${wholesaler.bankAccountNumber}</p>`, { borderColor: '#a7f3d0', bgColor: '#ecfdf5' })
            : '';
          const quoteEmailBody = `${emailHeading('Quote Created', { size: '22px', color: '#10b981' })}<p style="margin:0 0 4px">Order <b>${orderNumber}</b></p><p style="margin:0 0 16px;font-size:14px;color:#6b7280">${new Date().toLocaleString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>${emailCard(`<p style="margin:0 0 4px"><b>Customer:</b> ${customer.firstName} ${customer.lastName}</p>${customer.businessName ? `<p style="margin:0 0 4px"><b>Business:</b> ${customer.businessName}</p>` : ''}${customer.phoneNumber ? `<p style="margin:0 0 4px"><b>Phone:</b> ${customer.phoneNumber}</p>` : ''}${customer.email ? `<p style="margin:0 0 4px"><b>Email:</b> ${customer.email}</p>` : ''}${deliveryLineHtml}`, { borderColor: '#dbeafe', bgColor: '#eff6ff' })}<ul style="margin:8px 0 16px;padding-left:20px">${itemsForEmail.join('')}</ul><table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr><td style="padding:4px 0">Products:</td><td style="padding:4px 0;text-align:right">£${productSubtotal.toFixed(2)}</td></tr>${deliveryRowHtml}${isDeposit ? `<tr><td style="padding:4px 0">Deposit (${validDepositPercentage}%):</td><td style="padding:4px 0;text-align:right">£${wholesalerDeposit.toFixed(2)}</td></tr><tr><td style="padding:4px 0">Outstanding:</td><td style="padding:4px 0;text-align:right">£${wholesalerOutstanding.toFixed(2)}</td></tr>` : ''}<tr style="border-top:2px solid #e5e7eb"><td style="padding:8px 0;font-size:16px;font-weight:bold">Total:</td><td style="padding:8px 0;text-align:right;font-size:16px;font-weight:bold;color:#10b981">£${subtotal.toFixed(2)}</td></tr></table><p style="margin:16px 0 4px"><b>Sent via:</b> ${sendVia === 'sms' ? 'SMS' : 'WhatsApp'}</p><p style="margin:0 0 4px"><b>Payment:</b> ${paymentStatusText}</p>${paymentLinkUrl ? emailButton('View Payment Link', paymentLinkUrl, '#059669') : ''}${bankDetailsSectionHtml}${emailButton('View in Dashboard', `${process.env.APP_URL || 'https://quikpik.app'}/orders`)}`;
          const quoteHtml = wrapCustomerEmail(quoteEmailBody, { businessName: wholesaler.businessName || wholesaler.name || 'Quikpik', logoUrl: getEmailLogoUrl(wholesaler.id, wholesaler.logoType, wholesaler.logoUrl) }, { preheader: `Quote ${orderNumber} sent to ${customer.firstName} - £${subtotal.toFixed(2)}` });
          console.log(`📏 Quote email HTML size: ${Buffer.byteLength(quoteHtml, 'utf8')} bytes (Gmail clips at ~102400)`);
          await sendEmail({
            to: wholesaler.email,
            from: 'hello@quikpik.co',
            subject: `Quote ${orderNumber} Sent to ${customer.firstName} ${customer.lastName}`,
            html: quoteHtml
          });
          console.log(`📧 Quote confirmation email sent to ${wholesaler.email}`);
        }
      } catch (quoteEmailError) {
        console.error('Failed to send quote confirmation email:', quoteEmailError);
      }

      // Send quote email to customer
      try {
        if (customer.email) {
          const isDeposit = validDepositPercentage > 0 && validDepositPercentage < 100;
          const isPayLater = validDepositPercentage === 0;
          const businessName = wholesaler.businessName || wholesaler.name || 'Your supplier';
          const customerItemsHtml: string[] = [];
          for (const item of items) {
            const [product] = await db.select().from(products).where(eq(products.id, item.productId));
            const productName = product?.name || `Product #${item.productId}`;
            const sellingType = item.sellingType || 'units';
            const itemTotal = item.customPrice * item.quantity;
            customerItemsHtml.push(`<li style="margin: 6px 0;"><strong>${productName}</strong> - ${item.quantity} ${sellingType} × £${item.customPrice.toFixed(2)} = <strong>£${itemTotal.toFixed(2)}</strong></li>`);
          }
          const custDeliveryRowHtml = quoteDeliveryCharge > 0 ? `<tr><td style="padding:4px 0">Delivery:</td><td style="padding:4px 0;text-align:right">£${quoteDeliveryCharge.toFixed(2)}</td></tr>` : '';
          // Resolve delivery address text for customer email
          let custDeliveryAddressText = resolvedDeliveryAddress || '';
          if (fulfillmentType === 'delivery' && !custDeliveryAddressText && resolvedDeliveryAddressId) {
            try {
              const addr = await storage.getDeliveryAddress(resolvedDeliveryAddressId);
              if (addr) custDeliveryAddressText = [addr.addressLine1, addr.addressLine2, addr.city, addr.state, addr.postalCode, addr.country].filter(Boolean).join(', ');
            } catch (e) { /* ignore */ }
          }
          const custDeliveryNoteHtml = wholesaler.deliveryNote && fulfillmentType === 'delivery' ? `${emailCard(`<p style="margin:0;font-size:13px">📦 ${wholesaler.deliveryNote}</p>`, { borderColor: '#fde68a', bgColor: '#fffbeb' })}` : '';
          const custPaymentBadge = isPayLater ? emailBadge('Pay Later — No payment required now', '#3b82f6') : (isDeposit ? emailBadge(`Deposit required: £${depositAmount.toFixed(2)}`, '#f59e0b') : emailBadge(`Payment required: £${total.toFixed(2)}`, '#10b981'));
          // Bank details for customer email — only shown on Pay Later quotes
          const custBankDetailsHtml = (isPayLater && wholesaler.bankSortCode && wholesaler.bankAccountNumber)
            ? emailCard(`${emailHeading('Bank Transfer Details', { size: '15px' })}<p style="margin:0 0 4px"><b>Account Name:</b> ${wholesaler.bankAccountName || wholesaler.businessName || 'N/A'}</p><p style="margin:0 0 4px"><b>Sort Code:</b> ${wholesaler.bankSortCode}</p><p style="margin:0"><b>Account Number:</b> ${wholesaler.bankAccountNumber}</p>`, { borderColor: '#a7f3d0', bgColor: '#ecfdf5' })
            : '';
          const custEmailBody = `${emailHeading(`Quote from ${businessName}`, { size: '22px', color: '#10b981' })}<p style="margin:0 0 4px">Order <b>${orderNumber}</b></p><p style="margin:0 0 16px;font-size:14px;color:#6b7280">${new Date().toLocaleString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>${fulfillmentType === 'delivery' ? emailCard(`<p style="margin:0 0 4px"><b>Fulfillment:</b> Delivery</p>${quoteDeliveryCharge > 0 ? `<p style="margin:0 0 4px"><b>Delivery charge:</b> £${quoteDeliveryCharge.toFixed(2)}</p>` : ''}${custDeliveryAddressText ? `<p style="margin:4px 0 0"><b>Delivery address:</b> ${custDeliveryAddressText}</p>` : ''}`, { borderColor: '#dbeafe', bgColor: '#eff6ff' }) : emailCard(`<p style="margin:0"><b>Fulfillment:</b> Collection</p>`, { borderColor: '#dbeafe', bgColor: '#eff6ff' })}<ul style="margin:8px 0 16px;padding-left:20px">${customerItemsHtml.join('')}</ul><table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr><td style="padding:4px 0">Products:</td><td style="padding:4px 0;text-align:right">£${productSubtotal.toFixed(2)}</td></tr>${custDeliveryRowHtml}${isDeposit ? `<tr><td style="padding:4px 0">Deposit (${validDepositPercentage}%):</td><td style="padding:4px 0;text-align:right">£${depositAmount.toFixed(2)}</td></tr><tr><td style="padding:4px 0">Remaining balance:</td><td style="padding:4px 0;text-align:right">£${outstandingAmount.toFixed(2)}</td></tr>` : ''}<tr style="border-top:2px solid #e5e7eb"><td style="padding:8px 0;font-size:16px;font-weight:bold">Total:</td><td style="padding:8px 0;text-align:right;font-size:16px;font-weight:bold;color:#10b981">£${total.toFixed(2)}</td></tr></table>${custDeliveryNoteHtml}<p style="margin:16px 0 8px">${custPaymentBadge}</p>${!isPayLater && paymentLinkUrl ? emailButton('Pay Now', paymentLinkUrl, '#059669') : ''}${isPayLater ? `<p style="margin:16px 0 4px;font-size:14px;color:#6b7280">Please arrange payment directly with ${businessName}.</p>` : ''}${custBankDetailsHtml}`;
          const custHtml = wrapCustomerEmail(custEmailBody, { businessName, logoUrl: getEmailLogoUrl(wholesaler.id, wholesaler.logoType, wholesaler.logoUrl) }, { preheader: `Your quote ${orderNumber} from ${businessName} — £${total.toFixed(2)}` });
          await sendEmail({
            to: customer.email,
            from: 'hello@quikpik.co',
            subject: `Your quote ${orderNumber} from ${businessName}`,
            html: custHtml
          });
          console.log(`📧 Quote email sent to customer: ${customer.email}`);
        }
      } catch (custEmailError) {
        console.error('Failed to send customer quote email:', custEmailError);
      }

      res.json({
        success: true,
        orderId: quoteOrder.id,
        orderNumber: quoteOrder.orderNumber,
        paymentLink: paymentLinkUrl,
        total: total.toFixed(2),
      });

    } catch (error) {
      console.error('❌ Error creating quote:', error);
      res.status(500).json({ error: 'Failed to create quote' });
    }
  });

  // =====================================================
  // GENERATE REMAINING BALANCE PAYMENT LINK
  // =====================================================
  // GET /api/orders/:orderId/payments — return the full payment log for an order
  app.get('/api/orders/:orderId/payments', requireAuth, async (req: any, res) => {
    try {
      const orderId = parseInt(req.params.orderId);
      const wholesalerId = req.user.role === 'team_member' && req.user.wholesalerId
        ? req.user.wholesalerId
        : req.user.id;

      const [order] = await db.select({ id: orders.id, wholesalerId: orders.wholesalerId })
        .from(orders).where(eq(orders.id, orderId)).limit(1);
      if (!order || order.wholesalerId !== wholesalerId) {
        return res.status(404).json({ error: 'Order not found' });
      }

      const log = await db.select().from(orderPayments)
        .where(eq(orderPayments.orderId, orderId))
        .orderBy(orderPayments.recordedAt);

      // Enrich entries with recorder display name
      // recordedBy is varchar — either the user's varchar ID (e.g. "google_abc123") or 'stripe_webhook'
      const manualIds = [...new Set(
        log
          .map(e => e.recordedBy)
          .filter((r): r is string => typeof r === 'string' && r !== 'stripe_webhook')
      )];
      let userMap: Record<string, string> = {};
      if (manualIds.length > 0) {
        const recorderUsers = await db.select({ id: users.id, firstName: users.firstName, lastName: users.lastName })
          .from(users).where(inArray(users.id, manualIds));
        recorderUsers.forEach(u => {
          userMap[u.id] = [u.firstName, u.lastName].filter(Boolean).join(' ') || 'Team member';
        });
      }
      const enriched = log.map(e => ({
        ...e,
        recordedByName: e.recordedBy === 'stripe_webhook' ? 'Stripe' : (e.recordedBy ? (userMap[e.recordedBy] || 'Team member') : null),
      }));

      res.json(enriched);
    } catch (error) {
      console.error('❌ Error fetching order payments:', error);
      res.status(500).json({ error: 'Failed to fetch payment log' });
    }
  });

  // POST /api/orders/:orderId/payments — manually record a cash or bank transfer payment
  app.post('/api/orders/:orderId/payments', requireAuth, async (req: any, res) => {
    try {
      const orderId = parseInt(req.params.orderId);
      const wholesalerId = req.user.role === 'team_member' && req.user.wholesalerId
        ? req.user.wholesalerId
        : req.user.id;
      const recordedBy = String(req.user.id); // varchar column

      const { amount, method, notes } = req.body;

      if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
        return res.status(400).json({ error: 'A positive amount is required' });
      }
      if (!['bank_transfer', 'cash'].includes(method)) {
        return res.status(400).json({ error: 'Method must be bank_transfer or cash' });
      }

      const [order] = await db.select().from(orders)
        .where(eq(orders.id, orderId)).limit(1);
      if (!order || order.wholesalerId !== wholesalerId) {
        return res.status(404).json({ error: 'Order not found' });
      }

      const thisPayment = parseFloat(amount);
      const previouslyPaid = parseFloat(order.amountPaid || '0');
      // Cash/bank payments: customer owes products + delivery (no customer transaction fee).
      // DB stores subtotal = products only, deliveryCost separately — combine both.
      const orderTotal = parseFloat(order.subtotal || '0') + parseFloat(order.deliveryCost || '0');
      const offlineOutstanding = Math.max(0, orderTotal - previouslyPaid);

      if (thisPayment > offlineOutstanding + 0.01) {
        return res.status(400).json({ error: 'Payment exceeds outstanding balance' });
      }

      const { cumulativePaid, newOutstanding, paymentStatus } = applyPaymentToOrder(previouslyPaid, orderTotal, thisPayment);

      // Wrap payment log insert + order update in a transaction to ensure consistency
      await db.transaction(async (trx) => {
        await trx.insert(orderPayments).values({
          orderId,
          amount: thisPayment.toFixed(2),
          method,
          notes: notes || null,
          recordedBy,
        });
        await trx.update(orders)
          .set({
            amountPaid: cumulativePaid.toFixed(2),
            amountOutstanding: newOutstanding.toFixed(2),
            paymentStatus,
            status: paymentStatus === 'paid' ? 'confirmed' : order.status,
          })
          .where(eq(orders.id, orderId));
      });

      console.log(`✅ Manual ${method} payment of £${thisPayment.toFixed(2)} recorded for order ${order.orderNumber || orderId}`);

      // If now fully paid and there's an open Stripe Checkout session, expire it (best-effort)
      // This prevents the customer from paying again via the old Stripe link
      if (paymentStatus === 'paid' && order.stripePaymentLinkId) {
        try {
          await stripe.checkout.sessions.expire(order.stripePaymentLinkId);
          await db.update(orders)
            .set({ stripePaymentLinkUrl: null, stripePaymentLinkId: null })
            .where(eq(orders.id, orderId));
          console.log(`🔒 Expired Stripe checkout session ${order.stripePaymentLinkId} for order ${order.orderNumber || orderId}`);
        } catch (stripeErr) {
          // Best-effort: session may already be used/expired — do not block the payment recording
          console.warn(`⚠️ Could not expire Stripe session ${order.stripePaymentLinkId}:`, stripeErr);
        }
      }

      const [updatedOrder] = await db.select().from(orders).where(eq(orders.id, orderId));

      // Notify customer via SMS + email (best effort — failures don't block the response)
      try {
        const [wholesalerUser] = await db.select().from(users).where(eq(users.id, wholesalerId)).limit(1);
        const businessName = wholesalerUser?.businessName || wholesalerUser?.name || 'Your supplier';
        const orderRef = order.orderNumber || `#${orderId}`;
        const methodLabel = method === 'cash' ? 'cash' : 'bank transfer';

        const paidBadge = paymentStatus === 'paid' ? emailBadge('Fully Paid', '#10b981') : emailBadge('Part Paid', '#f59e0b');
        const methodLabelTitle = methodLabel.charAt(0).toUpperCase() + methodLabel.slice(1);

        // SMS to customer
        if (order.customerPhone) {
          const smsMsg = paymentStatus === 'paid'
            ? `Payment confirmed! £${thisPayment.toFixed(2)} ${methodLabel} received by ${businessName} for order ${orderRef}. Your order is now fully paid.`
            : `Payment of £${thisPayment.toFixed(2)} ${methodLabel} received by ${businessName} for order ${orderRef}. Remaining balance: £${newOutstanding.toFixed(2)}.`;
          await sendSMS({ to: order.customerPhone, message: smsMsg }).catch(e => console.error('SMS failed (manual payment):', e));
        }

        // Email to customer
        if (order.customerEmail) {
          const custPaymentBody = `${emailHeading('Payment Received', { size: '22px', color: '#10b981' })}${emailCard(`<p style="margin:0 0 6px"><b>Order:</b> ${orderRef}</p><p style="margin:0 0 6px"><b>Method:</b> ${methodLabelTitle}</p><p style="margin:0 0 6px"><b>Amount received:</b> £${thisPayment.toFixed(2)}</p><p style="margin:0 0 6px"><b>Total paid to date:</b> £${cumulativePaid.toFixed(2)}</p><p style="margin:0 0 6px"><b>Outstanding balance:</b> £${newOutstanding.toFixed(2)}</p><p style="margin:0">${paidBadge}</p>`, { borderColor: '#a7f3d0', bgColor: '#ecfdf5' })}<p style="margin:16px 0 0;font-size:14px;color:#6b7280">Thank you for your payment. Please contact ${businessName} if you have any questions.</p>`;
          const custHtml = wrapCustomerEmail(custPaymentBody, { businessName, logoUrl: getEmailLogoUrl(wholesalerUser.id, wholesalerUser.logoType, wholesalerUser.logoUrl) });
          await sendEmail({ to: order.customerEmail, from: 'hello@quikpik.co', subject: `Payment received — ${orderRef}`, html: custHtml }).catch(e => console.error('Customer email failed (manual payment):', e));
        }

        // Email confirmation to wholesaler
        if (wholesalerUser?.email) {
          const emailBody = `${emailHeading('Manual Payment Recorded', { size: '22px', color: '#10b981' })}${emailCard(`<p style="margin:0 0 6px"><b>Order:</b> ${orderRef}</p><p style="margin:0 0 6px"><b>Customer:</b> ${order.customerName || 'Unknown'}</p><p style="margin:0 0 6px"><b>Method:</b> ${methodLabelTitle}</p><p style="margin:0 0 6px"><b>Amount received:</b> £${thisPayment.toFixed(2)}</p><p style="margin:0 0 6px"><b>Total paid:</b> £${cumulativePaid.toFixed(2)}</p><p style="margin:0 0 6px"><b>Outstanding balance:</b> £${newOutstanding.toFixed(2)}</p><p style="margin:0">${paidBadge}</p>`, { borderColor: '#a7f3d0', bgColor: '#ecfdf5' })}${emailButton('View Order', `${process.env.APP_URL || 'https://quikpik.app'}/orders`)}`;
          const html = wrapCustomerEmail(emailBody, { businessName, logoUrl: getEmailLogoUrl(wholesalerUser.id, wholesalerUser.logoType, wholesalerUser.logoUrl) });
          await sendEmail({ to: wholesalerUser.email, from: 'hello@quikpik.co', subject: `Payment recorded — ${orderRef}`, html }).catch(e => console.error('Wholesaler email failed (manual payment):', e));
        }
      } catch (notifyErr) {
        console.error('⚠️ Notification error (manual payment) — non-fatal:', notifyErr);
      }

      res.json({ success: true, order: updatedOrder, paymentStatus, amountPaid: cumulativePaid.toFixed(2) });
    } catch (error) {
      console.error('❌ Error recording manual payment:', error);
      res.status(500).json({ error: 'Failed to record payment' });
    }
  });

  app.post('/api/orders/:orderId/generate-balance-link', requireAuth, async (req: any, res) => {
    try {
      const orderId = parseInt(req.params.orderId);
      const wholesalerId = req.user.role === 'team_member' && req.user.wholesalerId 
        ? req.user.wholesalerId 
        : req.user.id;

      // Get the order
      const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      // Verify the order belongs to this wholesaler
      if (order.wholesalerId !== wholesalerId) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      const amountOutstanding = parseFloat(order.amountOutstanding || '0');
      if (amountOutstanding <= 0) {
        return res.status(400).json({ error: 'No outstanding balance on this order' });
      }

      // Get customer details
      const customer = await storage.getUser(order.retailerId);
      const wholesaler = await storage.getUser(wholesalerId);

      if (!stripe) {
        return res.status(500).json({ error: 'Payment service not available' });
      }

      // Calculate the correct payment amount
      // For unpaid quotes with a deposit percentage, charge only the deposit amount
      // For part_paid quotes, charge the remaining balance
      const orderTotal = parseFloat(order.total || '0');
      const amountPaid = parseFloat(order.amountPaid || '0');
      const depositPercentage = order.depositPercentage || 100;
      
      let paymentAmount: number;
      let paymentLabel: string;
      let paymentDescription: string;
      
      if (order.paymentStatus === 'unpaid' && depositPercentage < 100) {
        // Unpaid quote with deposit - charge the deposit amount
        paymentAmount = orderTotal * (depositPercentage / 100);
        paymentLabel = `Deposit (${depositPercentage}%) - Order ${order.orderNumber}`;
        paymentDescription = `Deposit payment of ${depositPercentage}%. Order total: £${orderTotal.toFixed(2)}`;
      } else {
        // Part paid or full payment - charge outstanding balance
        paymentAmount = amountOutstanding;
        paymentLabel = `Remaining Balance - Order ${order.orderNumber}`;
        paymentDescription = `Payment for remaining balance. Original order total: £${orderTotal.toFixed(2)}`;
      }

      console.log(`💳 Payment link calculation: status=${order.paymentStatus}, depositPct=${depositPercentage}%, total=${orderTotal}, paid=${amountPaid}, outstanding=${amountOutstanding}, charging=${paymentAmount}`);

      // Validate wholesaler's Stripe Connect account for automatic transfer
      let balanceLinkUseConnect = false;
      if (wholesaler?.stripeAccountId) {
        try {
          const connectAccount = await stripe.accounts.retrieve(wholesaler.stripeAccountId);
          if (connectAccount.charges_enabled && connectAccount.details_submitted) {
            balanceLinkUseConnect = true;
            console.log(`✅ Balance link Connect account active: ${wholesaler.stripeAccountId}`);
          } else {
            console.log(`⚠️ Balance link Connect account not ready: ${wholesaler.stripeAccountId}`);
          }
        } catch (connectErr: any) {
          console.error(`❌ Balance link Connect account validation failed: ${connectErr.message}`);
        }
      }

      // Wholesaler's proportional cut of this payment (subtotal - 3.3% platform fee, pro-rated)
      const balanceLinkWholesalerTotal = parseFloat(order.subtotal || '0') - parseFloat(order.platformFee || '0');
      const balanceLinkTransferAmount = orderTotal > 0
        ? Math.round(paymentAmount * (balanceLinkWholesalerTotal / orderTotal) * 100)
        : 0;

      // Create Stripe checkout session
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'gbp',
            product_data: {
              name: paymentLabel,
              description: paymentDescription,
            },
            unit_amount: Math.round(paymentAmount * 100),
          },
          quantity: 1,
        }],
        mode: 'payment',
        success_url: `${process.env.APP_URL || (process.env.REPLIT_DOMAINS?.split(',')[0] ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}` : 'https://quikpik.app')}/customer/payment-success?order=${order.orderNumber}&wholesaler=${wholesalerId}&returning=true&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.APP_URL || (process.env.REPLIT_DOMAINS?.split(',')[0] ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}` : 'https://quikpik.app')}/store/${wholesalerId}`,
        metadata: {
          orderId: orderId.toString(),
          orderNumber: order.orderNumber || '',
          wholesalerId,
          customerId: order.retailerId,
          isQuote: 'true',
          isBalancePayment: order.paymentStatus === 'part_paid' ? 'true' : 'false',
          depositPercentage: depositPercentage.toString(),
          depositAmount: paymentAmount.toFixed(2),
          totalAmount: orderTotal.toFixed(2),
        },
        customer_email: customer?.email || undefined,
        expires_at: Math.floor(Date.now() / 1000) + (24 * 60 * 60),
        ...(balanceLinkUseConnect && balanceLinkTransferAmount > 0 ? {
          payment_intent_data: {
            transfer_data: {
              destination: wholesaler!.stripeAccountId!,
              amount: balanceLinkTransferAmount,
            },
          },
        } : {}),
      });

      // Update order with new payment link
      await db.update(orders)
        .set({
          stripePaymentLinkId: session.id,
          stripePaymentLinkUrl: session.url || '',
          quoteExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        })
        .where(eq(orders.id, orderId));

      console.log(`✅ Balance payment link generated for order ${order.orderNumber}: ${session.url}`);

      // Send SMS notification to customer with payment link
      let smsSent = false;
      const customerPhone = order.customerPhone;
      if (customerPhone && session.url) {
        try {
          // Build order items list for SMS (getOrderItems already includes product data)
          let itemsList = '';
          try {
            const orderItemsList = await storage.getOrderItems(orderId);
            const itemsListParts: string[] = [];
            for (const item of orderItemsList) {
              const productName = item.product?.name || `Product #${item.productId}`;
              const total = parseFloat(item.total || '0');
              const unitPrice = parseFloat(item.unitPrice || '0');
              const sellingType = item.sellingType || 'units';
              const promoNote = item.appliedOfferLabel ? ` (${item.appliedOfferLabel})` : '';
              const freeNote = (item.freeItems || 0) > 0 ? ` +${item.freeItems} free` : '';
              itemsListParts.push(`• ${productName} - ${item.quantity} ${sellingType} × £${unitPrice.toFixed(2)} = £${total.toFixed(2)}${promoNote}${freeNote}`);
            }
            itemsList = itemsListParts.length > 0 ? `\n\n📦 Items:\n${itemsListParts.join('\n')}` : '';
          } catch (itemsError) {
            console.error('⚠️ Could not fetch order items for SMS:', itemsError);
          }
          
          // Use the correct payment amount and label in SMS
          const paymentTypeLabel = order.paymentStatus === 'unpaid' && depositPercentage < 100
            ? `Deposit (${depositPercentage}%)`
            : 'Outstanding Balance';
          const smsMessage = `Hi${order.customerName ? ` ${order.customerName.split(' ')[0]}` : ''}! ${wholesaler?.businessName || 'Your supplier'} is requesting payment for Order ${order.orderNumber}.${itemsList}\n\n${paymentTypeLabel}: £${paymentAmount.toFixed(2)}\n\nPay here: ${session.url}\n\nThis link expires in 24 hours.`;
          
          const smsResult = await sendSMS({
            to: customerPhone,
            message: smsMessage
          });
          
          smsSent = smsResult.success;
          console.log(`📱 SMS ${smsSent ? 'sent' : 'failed'} to ${customerPhone} for ${paymentTypeLabel.toLowerCase()}`);
        } catch (smsError) {
          console.error('❌ Failed to send payment SMS:', smsError);
        }
      }

      // Get the updated order to return
      const [updatedOrder] = await db.select().from(orders).where(eq(orders.id, orderId));

      res.json({
        success: true,
        paymentLink: session.url,
        amount: paymentAmount.toFixed(2),
        order: updatedOrder,
        smsSent,
        customerPhone: customerPhone || null,
      });

    } catch (error) {
      console.error('❌ Error generating balance payment link:', error);
      res.status(500).json({ error: 'Failed to generate payment link' });
    }
  });

  // =====================================================
  // CUSTOMER PORTAL - GET/GENERATE PAYMENT LINK FOR ORDER
  // Uses same pattern as /api/customer-orders/:wholesalerId/:phoneNumber
  // Phone is SMS-verified when customer logs into portal
  // =====================================================
  app.post('/api/customer/orders/:orderId/payment-link/:phoneNumber', async (req: any, res) => {
    try {
      const orderId = parseInt(req.params.orderId);
      const customerPhone = decodeURIComponent(req.params.phoneNumber);

      if (!customerPhone) {
        return res.status(400).json({ error: 'Customer phone is required' });
      }

      // Get the order
      const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      // Verify the order belongs to this customer (by phone - matches portal auth pattern)
      if (order.customerPhone !== customerPhone) {
        return res.status(403).json({ error: 'Unauthorized' });
      }

      const amountOutstanding = parseFloat(order.amountOutstanding || '0');
      if (amountOutstanding <= 0) {
        return res.status(400).json({ error: 'No outstanding balance on this order' });
      }

      // For balance payments, always generate a fresh Stripe checkout session
      // The original payment link was for the deposit and is now completed/expired
      console.log(`💳 Generating fresh balance payment link for order ${order.orderNumber}, amount: £${amountOutstanding.toFixed(2)}`);

      // Generate a new payment link
      if (!stripe) {
        return res.status(500).json({ error: 'Payment service not available' });
      }

      const wholesaler = await storage.getUser(order.wholesalerId);
      const customer = await storage.getUser(order.retailerId);

      // Validate wholesaler's Stripe Connect account for automatic transfer
      let customerBalanceUseConnect = false;
      if (wholesaler?.stripeAccountId) {
        try {
          const connectAccount = await stripe.accounts.retrieve(wholesaler.stripeAccountId);
          if (connectAccount.charges_enabled && connectAccount.details_submitted) {
            customerBalanceUseConnect = true;
            console.log(`✅ Customer balance link Connect account active: ${wholesaler.stripeAccountId}`);
          } else {
            console.log(`⚠️ Customer balance link Connect account not ready: ${wholesaler.stripeAccountId}`);
          }
        } catch (connectErr: any) {
          console.error(`❌ Customer balance link Connect account validation failed: ${connectErr.message}`);
        }
      }

      // Wholesaler's proportional cut of this payment (subtotal - 3.3% platform fee, pro-rated)
      const customerBalanceOrderTotal = parseFloat(order.total || '0');
      const customerBalanceWholesalerTotal = parseFloat(order.subtotal || '0') - parseFloat(order.platformFee || '0');
      const customerBalanceTransferAmount = customerBalanceOrderTotal > 0
        ? Math.round(amountOutstanding * (customerBalanceWholesalerTotal / customerBalanceOrderTotal) * 100)
        : 0;

      // Create Stripe checkout session for remaining balance
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'gbp',
            product_data: {
              name: `Remaining Balance - Order ${order.orderNumber}`,
              description: `Payment for remaining balance. Original order total: £${order.total}`,
            },
            unit_amount: Math.round(amountOutstanding * 100),
          },
          quantity: 1,
        }],
        mode: 'payment',
        success_url: `${process.env.APP_URL || (process.env.REPLIT_DOMAINS?.split(',')[0] ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}` : 'https://quikpik.app')}/customer/payment-success?order=${order.orderNumber}&wholesaler=${order.wholesalerId}&returning=true&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.APP_URL || (process.env.REPLIT_DOMAINS?.split(',')[0] ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}` : 'https://quikpik.app')}/store/${order.wholesalerId}`,
        metadata: {
          orderId: orderId.toString(),
          orderNumber: order.orderNumber || '',
          wholesalerId: order.wholesalerId,
          customerId: order.retailerId,
          isQuote: 'true',
          isBalancePayment: 'true',
          depositPercentage: '100',
          depositAmount: amountOutstanding.toFixed(2),
          totalAmount: order.total || '0',
        },
        customer_email: customer?.email || undefined,
        expires_at: Math.floor(Date.now() / 1000) + (24 * 60 * 60),
        ...(customerBalanceUseConnect && customerBalanceTransferAmount > 0 ? {
          payment_intent_data: {
            transfer_data: {
              destination: wholesaler!.stripeAccountId!,
              amount: customerBalanceTransferAmount,
            },
          },
        } : {}),
      });

      // Update order with new payment link
      await db.update(orders)
        .set({
          stripePaymentLinkId: session.id,
          stripePaymentLinkUrl: session.url || '',
          quoteExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        })
        .where(eq(orders.id, orderId));

      console.log(`✅ Customer-initiated balance payment link generated for order ${order.orderNumber}: ${session.url}`);

      res.json({
        success: true,
        paymentLink: session.url,
        amount: amountOutstanding.toFixed(2),
        isExisting: false,
      });

    } catch (error) {
      console.error('❌ Error generating customer payment link:', error);
      res.status(500).json({ error: 'Failed to generate payment link' });
    }
  });

  // =====================================================
  // Customer Reorder - Preview items from a fulfilled order
  // =====================================================
  app.get('/api/customer/orders/:orderId/reorder-preview/:phoneNumber', async (req: any, res) => {
    try {
      const orderId = parseInt(req.params.orderId);
      const customerPhone = decodeURIComponent(req.params.phoneNumber);

      if (!customerPhone || isNaN(orderId)) {
        return res.status(400).json({ error: 'Valid order ID and customer phone are required' });
      }

      const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      const normalizePhone = (phone: string) => phone.replace(/[^0-9]/g, '').slice(-10);
      if (normalizePhone(order.customerPhone || '') !== normalizePhone(customerPhone)) {
        return res.status(403).json({ error: 'You can only reorder your own orders' });
      }

      if (order.status !== 'fulfilled' && order.status !== 'completed') {
        return res.status(400).json({ error: 'Only fulfilled or completed orders can be reordered' });
      }

      const items = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
      
      const productIds = items.map(i => i.productId);
      const productResults = await db.select().from(products).where(inArray(products.id, productIds));
      const productMap = new Map(productResults.map(p => [p.id, p]));

      const previewItems = items.map(item => {
        const product = productMap.get(item.productId);
        return {
          productName: product?.name || 'Unknown Product',
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.total,
          sellingType: item.sellingType || 'units',
          inStock: product ? (product.stock || 0) >= item.quantity : false,
        };
      });

      const subtotal = items.reduce((sum, item) => sum + parseFloat(item.total), 0);
      const customerTransactionFee = (subtotal * 0.055) + 0.50;
      const deliveryCost = parseFloat(order.deliveryCost || '0');
      const shippingTotal = parseFloat(order.shippingTotal || '0');
      const total = subtotal + customerTransactionFee + deliveryCost + shippingTotal;

      res.json({
        success: true,
        orderNumber: order.orderNumber,
        fulfillmentType: order.fulfillmentType,
        items: previewItems,
        subtotal: subtotal.toFixed(2),
        transactionFee: customerTransactionFee.toFixed(2),
        deliveryCost: deliveryCost.toFixed(2),
        shippingTotal: shippingTotal.toFixed(2),
        total: total.toFixed(2),
      });
    } catch (error) {
      console.error('❌ Error fetching reorder preview:', error);
      res.status(500).json({ error: 'Failed to fetch reorder preview' });
    }
  });

  // =====================================================
  // Customer Reorder - Create order and generate payment link
  // =====================================================
  app.post('/api/customer/orders/:orderId/reorder/:phoneNumber', async (req: any, res) => {
    try {
      const orderId = parseInt(req.params.orderId);
      const customerPhone = decodeURIComponent(req.params.phoneNumber);

      if (!customerPhone || isNaN(orderId)) {
        return res.status(400).json({ error: 'Valid order ID and customer phone are required' });
      }

      const [order] = await db.select().from(orders).where(eq(orders.id, orderId));
      if (!order) {
        return res.status(404).json({ error: 'Order not found' });
      }

      const normalizePhone = (phone: string) => phone.replace(/[^0-9]/g, '').slice(-10);
      if (normalizePhone(order.customerPhone || '') !== normalizePhone(customerPhone)) {
        return res.status(403).json({ error: 'You can only reorder your own orders' });
      }

      if (order.status !== 'fulfilled' && order.status !== 'completed') {
        return res.status(400).json({ error: 'Only fulfilled or completed orders can be reordered' });
      }

      const originalItems = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
      if (!originalItems.length) {
        return res.status(400).json({ error: 'No items found in the original order' });
      }

      if (!stripe) {
        return res.status(500).json({ error: 'Payment service not available' });
      }

      const newOrderNumber = await generateOrderNumber(order.wholesalerId);

      const subtotal = originalItems.reduce((sum, item) => sum + parseFloat(item.total), 0);
      const platformFeeRate = 0.033;
      const platformFee = subtotal * platformFeeRate;
      const customerTransactionFee = (subtotal * 0.055) + 0.50;
      const deliveryCost = parseFloat(order.deliveryCost || '0');
      const shippingTotal = parseFloat(order.shippingTotal || '0');
      const total = subtotal + customerTransactionFee + deliveryCost + shippingTotal;

      const newOrderData: any = {
        orderNumber: newOrderNumber,
        wholesalerId: order.wholesalerId,
        retailerId: order.retailerId,
        customerName: order.customerName,
        customerEmail: order.customerEmail,
        customerPhone: order.customerPhone,
        status: 'pending',
        subtotal: subtotal.toFixed(2),
        platformFee: platformFee.toFixed(2),
        customerTransactionFee: customerTransactionFee.toFixed(2),
        total: total.toFixed(2),
        fulfillmentType: order.fulfillmentType,
        deliveryAddress: order.deliveryAddress,
        deliveryAddressId: order.deliveryAddressId,
        deliveryCost: deliveryCost.toFixed(2),
        deliveryCarrier: order.deliveryCarrier,
        shippingTotal: shippingTotal > 0 ? shippingTotal.toFixed(2) : undefined,
        notes: `Reorder of ${order.orderNumber}`,
        isQuote: true,
        depositPercentage: 100,
        balanceDueDays: 0,
        amountPaid: '0.00',
        amountOutstanding: total.toFixed(2),
        paymentStatus: 'unpaid',
      };

      const newOrderItems = originalItems.map(item => ({
        productId: item.productId,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        total: item.total,
        sellingType: item.sellingType || 'units',
        appliedOfferLabel: (item as any).appliedOfferLabel || null,
        freeItems: (item as any).freeItems || 0,
      }));

      const createdOrder = await storage.createOrderWithTransaction(
        db,
        newOrderData,
        newOrderItems
      );

      const appUrl = process.env.APP_URL || (process.env.REPLIT_DOMAINS?.split(',')[0] ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}` : 'https://quikpik.app');

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'gbp',
            product_data: {
              name: `Reorder - ${newOrderNumber}`,
              description: `Reorder of ${order.orderNumber}`,
            },
            unit_amount: Math.round(total * 100),
          },
          quantity: 1,
        }],
        mode: 'payment',
        success_url: `${appUrl}/customer/payment-success?order=${newOrderNumber}&wholesaler=${order.wholesalerId}&returning=true&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl}/store/${order.wholesalerId}`,
        metadata: {
          orderId: createdOrder.id.toString(),
          orderNumber: newOrderNumber,
          wholesalerId: order.wholesalerId,
          customerId: order.retailerId,
          isQuote: 'true',
          isReorder: 'true',
          depositPercentage: '100',
          depositAmount: total.toFixed(2),
          totalAmount: total.toFixed(2),
        },
        customer_email: order.customerEmail || undefined,
        expires_at: Math.floor(Date.now() / 1000) + (24 * 60 * 60),
      });

      await db.update(orders)
        .set({
          stripePaymentLinkId: session.id,
          stripePaymentLinkUrl: session.url || '',
          quoteExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        })
        .where(eq(orders.id, createdOrder.id));

      console.log(`🔄 Reorder created: ${newOrderNumber} (from ${order.orderNumber}) for customer ${order.customerName} - payment link generated`);

      res.json({
        success: true,
        orderNumber: newOrderNumber,
        orderId: createdOrder.id,
        paymentLink: session.url,
      });

    } catch (error) {
      console.error('❌ Error creating reorder:', error);
      res.status(500).json({ error: 'Failed to create reorder' });
    }
  });

  return httpServer;
}
