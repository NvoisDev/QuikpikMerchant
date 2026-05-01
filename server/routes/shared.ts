// ─── Shared Route Utilities ───────────────────────────────────────────────────
// All shared imports, singletons, and helper functions used across route modules.
// Module files import directly from here — no ctx object required.

import Stripe from "stripe";
import multer from "multer";
import sharp from "sharp";
import compression from "compression";
import cookieParser from "cookie-parser";
import { storage } from "../storage";
import { performanceMiddleware } from "../middleware/performance";
import { queryOptimizer, queryCache } from "../utils/connectionPool";
import { setupAuth, isAuthenticated } from "../replitAuth";
import { getGoogleAuthUrl, verifyGoogleToken, createOrUpdateUser, requireAuth, GoogleAuthBlockedError } from "../googleAuth";
import { validatePassword, hashPassword, verifyPassword } from "../passwordUtils";
import {
  insertProductSchema, insertOrderSchema, insertCustomerGroupSchema, insertBroadcastSchema,
  insertMessageTemplateSchema, insertTemplateProductSchema, insertTemplateCampaignSchema,
  users, orders, orderItems, products, customerGroups, customerGroupMembers,
  smsVerificationCodes, insertSMSVerificationCodeSchema, customerRegistrationRequests,
  insertCustomerRegistrationRequestSchema, campaignOrders, subscriptionPlans,
  userSubscriptions, stockMovements, orderCancellationRequests,
  wholesalerCustomerRelationships, teamMembers,
  priceLists, priceListItems, priceListAssignments,
  cancellationRefundTypeToEmailStatus,
  customerPhoneVerifications,
  productBatches, subscriptionAuditLogs,
  adminAuditLogs, systemErrorLogs,
  customerProfileUpdateNotifications,
  stockUpdateNotifications,
  collectionAddresses, insertCollectionAddressSchema,
  quoteActivityLogs,
} from "@shared/schema";
import type { CancellationRefundType, EmailRefundStatus } from "@shared/schema";
import { InventoryCalculator } from "@shared/inventory-calculator";
import { generateProductDescription, generateProductImage } from "../ai";
import { generatePersonalizedTagline, generateCampaignSuggestions, optimizeMessageTiming } from "../ai-taglines";
import { formatPhoneToInternational, validatePhoneNumber } from "../../shared/phone-utils";
import { getCurrencySymbol } from "../../shared/utils/currency";
import { PLATFORM_FEE_RATE } from "../../shared/utils/fees";
import { whatsAppBusinessService } from "../whatsapp-simple";
import { PreciseShippingCalculator } from "../utils/preciseShippingCalculator";
import { healthCheck } from "../health";
import { z } from "zod";
import OpenAI from "openai";
import twilio from "twilio";
import { SubscriptionService } from "../subscription-service";
import {
  requireFeatureAccess, requireProductLimits, requireBroadcastLimits,
  requireTeamMemberLimits, getUserPlanLimits,
} from "../middleware/feature-gating";
import sgMail from "@sendgrid/mail";
import type { MailDataRequired } from "@sendgrid/mail";
import { ReliableSMSService } from "../sms-service";
import { sendSMS } from "../services/smsService";
import { sendWhatsAppMessage } from "../services/whatsappService";
import { sendEmail, sendStripeVerifiedEmail } from "../sendgrid-service";
import {
  generateResetToken, createResetExpiration, sendPasswordResetEmail, hashResetToken,
} from "../passwordResetService";
import { createEmailVerification, verifyEmailCode } from "../email-verification";
import {
  generateWholesalerOrderNotificationEmail, generateReadyForCollectionEmail,
  wrapCustomerEmail, emailCard, emailButton, emailHeading, emailBadge, emailDivider,
  getEmailLogoUrl, buildItemisedRefundEmail, generateDowngradeScheduledEmail,
  generateDowngradeEffectiveEmail, formatPackDescriptor,
  type OrderEmailData, type ReadyForCollectionEmailData, type RefundLineItem,
} from "../email-templates";
import { sendWelcomeMessages } from "../services/welcomeMessageService.js";
import { orderNotificationService } from "../services/orderNotificationService";
import { quickOrderService } from "../services/quickOrderService";
import { multiWholesalerService } from "../services/multiWholesalerService";
import { db } from "../db";
import {
  eq, and, desc, inArray, or, gt, sql, count, sum, gte, lte, lt, ne, asc, isNull, like,
} from "drizzle-orm";
import { getEmailDeliveryAddress } from "../utils/address-helper";
import { PLAN_LIMITS, getPlanLimits } from "../config/plan-limits";


// ─── Re-exports ───────────────────────────────────────────────────────────────
export {
  storage, db, performanceMiddleware, queryOptimizer, queryCache,
  setupAuth, isAuthenticated, requireAuth,
  getGoogleAuthUrl, verifyGoogleToken, createOrUpdateUser, GoogleAuthBlockedError,
  validatePassword, hashPassword, verifyPassword,
  insertProductSchema, insertOrderSchema, insertCustomerGroupSchema, insertBroadcastSchema,
  insertMessageTemplateSchema, insertTemplateProductSchema, insertTemplateCampaignSchema,
  users, orders, orderItems, products, customerGroups, customerGroupMembers,
  smsVerificationCodes, insertSMSVerificationCodeSchema, customerRegistrationRequests,
  insertCustomerRegistrationRequestSchema, campaignOrders, subscriptionPlans,
  userSubscriptions, stockMovements, orderCancellationRequests,
  wholesalerCustomerRelationships, teamMembers,
  priceLists, priceListItems, priceListAssignments,
  cancellationRefundTypeToEmailStatus,
  customerPhoneVerifications,
  productBatches, subscriptionAuditLogs,
  adminAuditLogs, systemErrorLogs,
  customerProfileUpdateNotifications,
  stockUpdateNotifications,
  collectionAddresses, insertCollectionAddressSchema,
  quoteActivityLogs,
  InventoryCalculator,
  generateProductDescription, generateProductImage,
  generatePersonalizedTagline, generateCampaignSuggestions, optimizeMessageTiming,
  formatPhoneToInternational, validatePhoneNumber,
  getCurrencySymbol,
  whatsAppBusinessService,
  PreciseShippingCalculator,
  healthCheck,
  z,
  twilio,
  SubscriptionService,
  requireFeatureAccess, requireProductLimits, requireBroadcastLimits,
  requireTeamMemberLimits, getUserPlanLimits,
  sgMail,
  ReliableSMSService, sendSMS, sendWhatsAppMessage, sendEmail, sendStripeVerifiedEmail,
  generateResetToken, createResetExpiration, sendPasswordResetEmail, hashResetToken,
  createEmailVerification, verifyEmailCode,
  generateWholesalerOrderNotificationEmail, generateReadyForCollectionEmail,
  wrapCustomerEmail, emailCard, emailButton, emailHeading, emailBadge, emailDivider,
  getEmailLogoUrl, buildItemisedRefundEmail, generateDowngradeScheduledEmail,
  generateDowngradeEffectiveEmail, formatPackDescriptor,
  sendWelcomeMessages,
  orderNotificationService,
  quickOrderService,
  multiWholesalerService,
  getEmailDeliveryAddress,
  multer, sharp, compression, cookieParser,
  eq, and, desc, inArray, or, gt, sql, count, sum, gte, lte, lt, ne, asc, isNull, like,
};
export type { MailDataRequired, OrderEmailData, ReadyForCollectionEmailData, RefundLineItem, CancellationRefundType, EmailRefundStatus };

// ─── Singletons ───────────────────────────────────────────────────────────────
/**
 * @deprecated Use `getStripeClient(Boolean(user.isTestAccount))` from stripeConfig instead.
 * This singleton has no per-request account context and always uses the platform-default
 * Stripe environment, which will be LIVE when STRIPE_ENVIRONMENT=live — causing test-account
 * wholesalers to hit live Stripe. All Stripe call-sites must derive a client with
 * getStripeClient(Boolean(user.isTestAccount)) and never import `stripe` from this file.
 */
export { getStripeClient, stripeTest, stripeLive, isLiveMode, getPublishableKey } from "../stripeConfig";
import { getStripeClient } from "../stripeConfig";
export const DO_NOT_USE_stripe = (() => {
  try { return getStripeClient(); }
  catch { return null; }
})();

export const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

// ─── Address parsing ──────────────────────────────────────────────────────────
export function parseAddressForEmail(address: string | null | undefined): {
  addressLine1: string; addressLine2: string; city: string;
  state: string; postalCode: string; country: string;
} {
  const defaultComponents = { addressLine1: '', addressLine2: '', city: '', state: '', postalCode: '', country: '' };
  if (!address || typeof address !== 'string') return defaultComponents;
  let cleanAddress = address.trim().replace(/^["']+|["']+$/g, '');
  if (!cleanAddress) return defaultComponents;
  try {
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
    const addressParts = cleanAddress.split(',').map(part => part.trim());
    const validParts = addressParts.filter(part =>
      part && part !== 'undefined' && part !== 'null' &&
      part.toLowerCase() !== 'undefined' && part.toLowerCase() !== 'null'
    );
    if (validParts.length >= 2) {
      const result: any = { addressLine1: '', addressLine2: '', city: '', state: '', postalCode: '', country: '' };
      if (validParts.length >= 6) {
        result.addressLine1 = validParts[0]; result.addressLine2 = validParts[1];
        result.city = validParts[2]; result.state = validParts[3];
        result.postalCode = validParts[4]; result.country = validParts[5];
      } else if (validParts.length === 5) {
        result.addressLine1 = validParts[0]; result.city = validParts[1];
        result.state = validParts[2]; result.postalCode = validParts[3]; result.country = validParts[4];
      } else if (validParts.length === 4) {
        result.city = validParts[0]; result.state = validParts[1];
        result.postalCode = validParts[2]; result.country = validParts[3];
      } else if (validParts.length === 3) {
        result.addressLine1 = validParts[0]; result.city = validParts[1]; result.country = validParts[2];
      } else {
        result.city = validParts[0]; result.country = validParts[1];
      }
      console.log(`🏠 ROUTES ADDRESS PARSED: "${cleanAddress}" → components:`, result);
      return result;
    }
  }
  return defaultComponents;
}

export function extractSessionId(cookieString?: string): string | null {
  if (!cookieString) return null;
  let sessionMatch = cookieString.match(/connect\.sid=s%3A([^;]+)/);
  if (sessionMatch?.[1]) return decodeURIComponent(sessionMatch[1]).split('.')[0];
  sessionMatch = cookieString.match(/connect\.sid=([^;]+)/);
  if (sessionMatch?.[1]) return sessionMatch[1].split('.')[0];
  return null;
}

export async function generateOrderNumber(wholesalerId: string, trx?: any): Promise<string> {
  const dbConnection = trx || db;
  try {
    // Atomically increment the wholesaler's counter and read back the new value + current prefix.
    // UPDATE … RETURNING is a single atomic operation — no separate SELECT or LIKE scan needed.
    // The counter never resets: changing orderNumberPrefix only affects the label, not the sequence.
    const result = await dbConnection.execute(sql`
      UPDATE users
      SET order_number_counter = order_number_counter + 1
      WHERE id = ${wholesalerId}
      RETURNING order_number_counter, order_number_prefix, business_name
    `);
    const row = result.rows[0];
    if (!row) {
      throw new Error(`Wholesaler ${wholesalerId} not found when generating order number`);
    }
    const counter = parseInt(row.order_number_counter as string);
    // Always use the stored prefix; fall back to 'ORD' when none is set.
    // Business name is deliberately NOT used — it changes independently of numbering.
    const storedPrefix = (row.order_number_prefix as string) || '';
    const prefix = storedPrefix.trim() ? storedPrefix.trim().toUpperCase() : 'ORD';
    const orderNumber = `${prefix}-${counter.toString().padStart(3, '0')}`;
    console.log(`🏢 Generated order number: ${orderNumber} (counter=${counter})`);
    return orderNumber;
  } catch (error: any) {
    console.error(`❌ CRITICAL: generateOrderNumber error:`, { message: error.message, wholesalerId });
    throw error;
  }
}

export { formatNumber } from '../../shared/utils/currency';

export function parseCustomerName(fullName: string): { firstName: string; lastName: string } {
  if (!fullName || typeof fullName !== 'string') return { firstName: 'Unknown', lastName: 'Customer' };
  const nameParts = fullName.trim().split(' ');
  if (nameParts.length === 1) return { firstName: nameParts[0], lastName: '' };
  if (nameParts.length === 2) return { firstName: nameParts[0], lastName: nameParts[1] };
  return { firstName: nameParts[0], lastName: nameParts.slice(1).join(' ') };
}

export function generateStockUpdateMessage(product: any, notificationType: string, wholesaler: any): string {
  const businessName = wholesaler.businessName || `${wholesaler.firstName || ''} ${wholesaler.lastName || ''}`.trim();
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

export async function sendTeamInvitationEmail(teamMember: any, wholesaler: any) {
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
    const inviteBody = `${emailHeading("You're Invited!", { size: '22px', color: '#10b981' })}<p style="font-size:16px;margin:0 0 8px">Hello ${teamMember.firstName || 'there'},</p><p style="margin:0 0 20px"><strong>${wholesaler.businessName || wholesaler.name}</strong> has invited you to join their team on Quikpik, the wholesale management platform.</p>${emailCard(`<p style="margin:0 0 6px"><strong>Your Role:</strong> ${emailBadge(roleLabel)}</p><p style="margin:0;color:#6b7280;font-size:14px">${accessDescription}</p>`)}<p style="margin:0 0 4px">This invitation expires in <strong>7 days</strong>. Click the button below to create your account and get started.</p><br>${emailButton('Accept Invitation & Join Team', inviteUrl)}<p style="color:#6b7280;font-size:13px;text-align:center;margin:16px 0 0">Or copy and paste this link in your browser:<br><span style="word-break:break-all">${inviteUrl}</span></p>${emailDivider()}<p style="color:#9ca3af;font-size:12px;text-align:center;margin:0">This invitation was sent by <strong>${wholesaler.email}</strong>. If you didn't expect this invitation, you can safely ignore this email.</p>`;

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

export async function refundAcrossPaymentIntents(
  stripeClient: Stripe,
  piIdsStr: string,
  totalAmountPounds: number,
  metadata: Record<string, string>,
  idempotencyKey?: string
): Promise<{ totalRefunded: number; remaining: number; lastError: string | null }> {
  const piIds = piIdsStr.split(',').map((s: string) => s.trim()).filter(Boolean).reverse();
  let remainingPence = Math.round(totalAmountPounds * 100);
  let totalRefundedPence = 0;
  let lastError: string | null = null;
  for (const piId of piIds) {
    if (remainingPence <= 0) break;
    try {
      const pi = await stripeClient.paymentIntents.retrieve(piId);
      const chargeId = (pi as any).latest_charge as string | null;
      let refundablePence = remainingPence;
      if (chargeId) {
        const charge = await stripeClient.charges.retrieve(chargeId);
        refundablePence = charge.amount - charge.amount_refunded;
      }
      if (refundablePence <= 0) { console.log(`💳 PI ${piId} fully refunded already, skipping`); continue; }
      const refundThisPence = Math.min(remainingPence, refundablePence);
      const refundParams: Record<string, unknown> = {
        payment_intent: piId,
        amount: refundThisPence,
        reason: 'requested_by_customer',
        metadata,
      };
      // Idempotency key scoped per PI so a retry of the same request returns the
      // existing Stripe refund object instead of creating a duplicate.
      const requestOptions = idempotencyKey
        ? { idempotencyKey: `${idempotencyKey}-${piId}` }
        : undefined;
      const refund = await stripeClient.refunds.create(refundParams as any, requestOptions);
      totalRefundedPence += refund.amount;
      remainingPence -= refund.amount;
      console.log(`💳 Refunded £${(refund.amount / 100).toFixed(2)} from PI ${piId}, remaining: £${(remainingPence / 100).toFixed(2)}`);
    } catch (e: any) {
      lastError = e?.message || 'Unknown error';
      console.error(`Stripe refund failed for PI ${piId}:`, e);
    }
  }
  return { totalRefunded: totalRefundedPence / 100, remaining: remainingPence / 100, lastError: totalRefundedPence > 0 && remainingPence === 0 ? null : lastError };
}

// ─── Viewer-role guard ────────────────────────────────────────────────────────
export const requireNotViewer = async (req: any, res: any, next: any) => {
  if (req.user?.role === 'team_member' && req.user?.wholesalerId) {
    try {
      const members = await storage.getTeamMembers(req.user.wholesalerId);
      const member = members.find((m: any) => m.email === req.user.email);
      if (!member) return res.status(403).json({ message: 'Team member record not found. Access denied.' });
      if (member.role === 'viewer') return res.status(403).json({ message: 'Viewers can only view data. This action requires a higher permission level.' });
    } catch (err) {
      console.error('requireNotViewer: failed to resolve team member role', err);
      return res.status(403).json({ message: 'Unable to verify permissions. Access denied.' });
    }
  }
  next();
};

export const requireOwner = (req: any, res: any, next: any) => {
  if (req.user?.role === 'team_member') {
    return res.status(403).json({ message: 'This action is restricted to the account owner.' });
  }
  next();
};

export const requireMemberPermission = (area: string) => async (req: any, res: any, next: any) => {
  if (req.user?.role === 'team_member' && req.user?.wholesalerId) {
    try {
      // Role must be explicitly resolved — never default to 'member' for write paths.
      // req.user.teamMemberRole is populated by requireAuth (Task #535). If missing, deny.
      const teamMemberRole: string | undefined = req.user.teamMemberRole;
      if (!teamMemberRole) {
        return res.status(403).json({ message: 'Unable to verify role. Access denied.' });
      }
      // Admins bypass all restrictions
      if (teamMemberRole === 'admin') return next();
      // Viewers can never write
      if (teamMemberRole === 'viewer') return res.status(403).json({ message: 'Viewers can only view data.' });
      // Members: check whether the owner has granted tab access for this area.
      // Tab Permissions is the single source of truth — if you can see the tab, you can use it.
      // failOpen=false: storage errors must deny, not grant, on write paths.
      const hasAccess = await storage.checkTabAccess(req.user.wholesalerId, area, 'member', false);
      if (!hasAccess) {
        return res.status(403).json({ message: `You do not have permission to manage ${area}.` });
      }
    } catch (err) {
      console.error('requireMemberPermission: failed to resolve permissions', err);
      return res.status(403).json({ message: 'Unable to verify permissions. Access denied.' });
    }
  }
  next();
};

// ─── Platform fee configuration ────────────────────────────────────────────────
export const DEFAULT_PLATFORM_FEE_RATE = PLATFORM_FEE_RATE; // 4.6% — internal default, not disclosed publicly

/**
 * Returns the platform fee rate for a specific wholesaler.
 * If the wholesaler has a custom fee set by admin, uses that; otherwise falls back to DEFAULT_PLATFORM_FEE_RATE.
 */
export async function getWholesalerFeeRate(wholesalerId: string): Promise<number> {
  try {
    const [wholesaler] = await db
      .select({ customFeePercentage: users.customFeePercentage })
      .from(users)
      .where(eq(users.id, wholesalerId))
      .limit(1);
    if (wholesaler?.customFeePercentage !== null && wholesaler?.customFeePercentage !== undefined) {
      return parseFloat(wholesaler.customFeePercentage) / 100;
    }
  } catch {
    // Fall through to default
  }
  return DEFAULT_PLATFORM_FEE_RATE;
}

// ─── Plan enforcement ─────────────────────────────────────────────────────────
// PLAN_ENFORCEMENT_LIMITS is an alias for PLAN_LIMITS (single source of truth in server/config/plan-limits.ts).
// `teamMembers` replaces the old `invitedMembersAllowed` field name.
export const PLAN_ENFORCEMENT_LIMITS = PLAN_LIMITS;
export { getPlanLimits };

export async function enforceNewPlanLimits(
  userId: string, targetTier: string
): Promise<{ productsLocked: number; teamMembersSuspended: number; groupsArchived: number; priceListsLocked: number }> {
  const limits = PLAN_ENFORCEMENT_LIMITS[targetTier] ?? PLAN_ENFORCEMENT_LIMITS.free;
  let productsLocked = 0, teamMembersSuspended = 0, groupsArchived = 0, priceListsLocked = 0;
  if (limits.products !== -1) {
    try {
      const nonLockedProducts = await db.select({ id: products.id }).from(products)
        .where(and(eq(products.wholesalerId, userId), inArray(products.status, ['active', 'inactive'])))
        .orderBy(asc(products.createdAt));
      const excess = nonLockedProducts.slice(limits.products);
      if (excess.length > 0) {
        await db.update(products).set({ status: 'locked' }).where(inArray(products.id, excess.map(p => p.id)));
        productsLocked = excess.length;
        console.log(`🔒 Locked ${productsLocked} products for user ${userId} (tier: ${targetTier})`);
      }
    } catch (err) { console.error(`❌ enforceNewPlanLimits [products] failed for user ${userId}:`, err); }
  }
  if (limits.teamMembers !== -1) {
    try {
      const activeMembers = await db.select({ id: teamMembers.id }).from(teamMembers)
        .where(and(eq(teamMembers.wholesalerId, userId), eq(teamMembers.status, 'active')))
        .orderBy(asc(teamMembers.createdAt));
      const membersToSuspend = activeMembers.slice(limits.teamMembers);
      if (membersToSuspend.length > 0) {
        await db.update(teamMembers).set({ status: 'suspended' }).where(inArray(teamMembers.id, membersToSuspend.map(m => m.id)));
        teamMembersSuspended = membersToSuspend.length;
        console.log(`🔒 Suspended ${teamMembersSuspended} team members for user ${userId} (tier: ${targetTier})`);
      }
    } catch (err) { console.error(`❌ enforceNewPlanLimits [team members] failed for user ${userId}:`, err); }
  }
  if (limits.groups !== -1) {
    try {
      const activeGroups = await db.select({ id: customerGroups.id }).from(customerGroups)
        .where(and(eq(customerGroups.wholesalerId, userId), eq(customerGroups.status, 'active')))
        .orderBy(asc(customerGroups.createdAt));
      const groupsToArchive = activeGroups.slice(limits.groups);
      if (groupsToArchive.length > 0) {
        await db.update(customerGroups).set({ status: 'archived' }).where(inArray(customerGroups.id, groupsToArchive.map(g => g.id)));
        groupsArchived = groupsToArchive.length;
        console.log(`🔒 Archived ${groupsArchived} customer groups for user ${userId} (tier: ${targetTier})`);
      }
    } catch (err) { console.error(`❌ enforceNewPlanLimits [customer groups] failed for user ${userId}:`, err); }
  }
  if (limits.priceLists !== -1) {
    try {
      const allPriceLists = await db.select({ id: priceLists.id }).from(priceLists)
        .where(and(eq(priceLists.wholesalerId, userId), eq(priceLists.isLocked, false)))
        .orderBy(asc(priceLists.createdAt));
      const excessPriceLists = allPriceLists.slice(limits.priceLists);
      if (excessPriceLists.length > 0) {
        await db.update(priceLists).set({ isLocked: true }).where(inArray(priceLists.id, excessPriceLists.map(pl => pl.id)));
        priceListsLocked = excessPriceLists.length;
        console.log(`🔒 Locked ${priceListsLocked} price lists for user ${userId} (tier: ${targetTier})`);
      }
    } catch (err) { console.error(`❌ enforceNewPlanLimits [price lists] failed for user ${userId}:`, err); }
  }
  return { productsLocked, teamMembersSuspended, groupsArchived, priceListsLocked };
}

/**
 * Unlock products (locked → inactive) and price lists (isLocked → false) after an upgrade.
 * Safe to call on renewals — it's a no-op when nothing is locked.
 */
export async function unlockForUpgrade(userId: string): Promise<{ productsUnlocked: number; priceListsUnlocked: number }> {
  let productsUnlocked = 0;
  let priceListsUnlocked = 0;
  try {
    const lockedProducts = await db.select({ id: products.id }).from(products)
      .where(and(eq(products.wholesalerId, userId), eq(products.status, 'locked')));
    if (lockedProducts.length > 0) {
      await db.update(products).set({ status: 'inactive' })
        .where(inArray(products.id, lockedProducts.map(p => p.id)));
      productsUnlocked = lockedProducts.length;
      console.log(`🔓 Unlocked ${productsUnlocked} products for user ${userId} after upgrade`);
    }
  } catch (err) { console.error(`❌ unlockForUpgrade [products] failed for user ${userId}:`, err); }
  try {
    const lockedPriceLists = await db.select({ id: priceLists.id }).from(priceLists)
      .where(and(eq(priceLists.wholesalerId, userId), eq(priceLists.isLocked, true)));
    if (lockedPriceLists.length > 0) {
      await db.update(priceLists).set({ isLocked: false })
        .where(inArray(priceLists.id, lockedPriceLists.map(pl => pl.id)));
      priceListsUnlocked = lockedPriceLists.length;
      console.log(`🔓 Unlocked ${priceListsUnlocked} price lists for user ${userId} after upgrade`);
    }
  } catch (err) { console.error(`❌ unlockForUpgrade [price lists] failed for user ${userId}:`, err); }
  return { productsUnlocked, priceListsUnlocked };
}

export async function getProjectedDowngradeImpact(
  userId: string, targetTier: string
): Promise<{ productsToLock: number; totalProducts: number; teamMembersToSuspend: number; groupsToArchive: number; priceListsToLock: number }> {
  const limits = PLAN_ENFORCEMENT_LIMITS[targetTier] ?? PLAN_ENFORCEMENT_LIMITS.free;
  try {
    const [nonLockedProductRows, activeMemberRows, activeGroupRows, unlockedPriceListRows] = await Promise.all([
      db.select({ id: products.id }).from(products).where(and(eq(products.wholesalerId, userId), inArray(products.status, ['active', 'inactive']))),
      db.select({ id: teamMembers.id }).from(teamMembers).where(and(eq(teamMembers.wholesalerId, userId), eq(teamMembers.status, 'active'))),
      db.select({ id: customerGroups.id }).from(customerGroups).where(and(eq(customerGroups.wholesalerId, userId), eq(customerGroups.status, 'active'))),
      db.select({ id: priceLists.id }).from(priceLists).where(and(eq(priceLists.wholesalerId, userId), eq(priceLists.isLocked, false))),
    ]);
    return {
      productsToLock: limits.products === -1 ? 0 : Math.max(0, nonLockedProductRows.length - limits.products),
      totalProducts: nonLockedProductRows.length,
      teamMembersToSuspend: limits.teamMembers === -1 ? 0 : Math.max(0, activeMemberRows.length - limits.teamMembers),
      groupsToArchive: limits.groups === -1 ? 0 : Math.max(0, activeGroupRows.length - limits.groups),
      priceListsToLock: limits.priceLists === -1 ? 0 : Math.max(0, unlockedPriceListRows.length - limits.priceLists),
    };
  } catch {
    return { productsToLock: 0, totalProducts: 0, teamMembersToSuspend: 0, groupsToArchive: 0, priceListsToLock: 0 };
  }
}

// ─── Multer for order photo uploads ──────────────────────────────────────────
export const orderPhotoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Only image files are allowed'));
    cb(null, true);
  },
});

export interface SendGridAttachment {
  content: string;
  filename: string;
  type: string;
  disposition: string;
}

// ─── Invoice PDF builder ──────────────────────────────────────────────────────
export async function buildInvoicePdf(order: any, wholesaler: any, showTransactionFee = false, amountPaid?: number, amountOutstanding?: number): Promise<Buffer> {
  const PDFDocument = (await import('pdfkit')).default;
  const currency = wholesaler.preferredCurrency || 'GBP';
  const currencySymbol = getCurrencySymbol(currency);
  const fmt = (n: number) => `${currencySymbol}${n.toFixed(2)}`;
  const customerName = order.retailer
    ? (`${order.retailer.firstName || ''} ${order.retailer.lastName || ''}`.trim() || order.retailer.name || order.customerName || 'Customer')
    : (order.customerName || 'Customer');
  const businessName = wholesaler.businessName || 'Quikpik Merchant';
  const invoiceRef = order.orderNumber || `#${order.id}`;
  const invoiceDate = new Date(order.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const cleanAddr = (s: string) => s.trim().replace(/^["']+$/, '');
  const isValidAddrLine = (s: string | null | undefined): s is string => !!s && !!cleanAddr(s);
  let addressLines: string[] = [];
  if (order.deliveryAddressId) {
    try {
      const addr = await storage.getDeliveryAddressById(order.deliveryAddressId);
      if (addr) [addr.addressLine1, addr.addressLine2, addr.city, addr.state, addr.postalCode, addr.country].filter(isValidAddrLine).forEach(l => addressLines.push(cleanAddr(l)));
    } catch (_) {}
  }
  if (addressLines.length === 0 && order.deliveryAddress && order.deliveryAddress !== '""' && order.deliveryAddress !== "''") {
    addressLines = order.deliveryAddress.split(',').map(cleanAddr).filter(Boolean);
  }
  if (addressLines.length === 0 && order.retailerId && order.wholesalerId) {
    try {
      const addrs = await storage.getDeliveryAddresses(order.retailerId, order.wholesalerId);
      if (addrs.length > 0) {
        const addr = addrs[0];
        [addr.addressLine1, addr.addressLine2, addr.city, addr.state, addr.postalCode, addr.country].filter(isValidAddrLine).forEach(l => addressLines.push(cleanAddr(l)));
      }
    } catch (_) {}
  }
  const isCancelledOrder = order.status === 'cancelled';
  const ps = order.paymentStatus || 'unpaid';
  const psLabel = isCancelledOrder ? 'VOID' : (ps === 'paid' ? 'Paid' : ps === 'part_paid' ? 'Part Paid' : 'Unpaid');
  const psColor = isCancelledOrder ? '#dc2626' : (ps === 'paid' ? '#16a34a' : ps === 'part_paid' ? '#b45309' : '#dc2626');
  const orderItemsList = (order.items || []).map((item: any) => {
    const promoLabel = item.appliedOfferLabel || '';
    const freeCount = Number(item.freeItems) || 0;
    let promoLine = '';
    if (promoLabel && freeCount > 0) promoLine = `${promoLabel} · +${freeCount} free included`;
    else if (promoLabel) promoLine = promoLabel;
    else if (freeCount > 0) promoLine = `+${freeCount} free included`;
    const packInfo = formatPackDescriptor(item.product?.packQuantity || item.product?.quantityInPack, item.product?.sizePerUnit || item.product?.unitSize, item.product?.unitOfMeasure);
    return {
      name: item.product?.name || item.productName || 'Product',
      qty: Number(item.quantity) || 0,
      unitPrice: parseFloat(item.unitPrice || '0'),
      lineTotal: parseFloat(item.unitPrice || '0') * (Number(item.quantity) || 0),
      promo: promoLine,
      packInfo,
    };
  });
  const subtotal = parseFloat(order.subtotal || '0');
  const deliveryCost = parseFloat(order.deliveryCost || '0');
  const vatAmount = parseFloat(order.vatAmount || '0');
  const txFee = showTransactionFee ? parseFloat(order.customerTransactionFee || '0') : 0;
  const grandTotal = showTransactionFee
    ? parseFloat(order.total || '0') || (subtotal + vatAmount + deliveryCost + txFee)
    : subtotal + vatAmount + deliveryCost;
  const logoUrl = getEmailLogoUrl(wholesaler.id, wholesaler.logoType, wholesaler.logoUrl);
  const initials = businessName.split(' ').map((w: string) => w[0] || '').join('').toUpperCase().slice(0, 2) || '??';
  let logoBuffer: Buffer | null = null;
  if (wholesaler.logoUrl && wholesaler.logoUrl.startsWith('data:')) {
    try {
      const [header, base64Data] = wholesaler.logoUrl.split(',');
      if (base64Data) {
        const mimeType = header.split(';')[0].split(':')[1] || '';
        const rawBuffer = Buffer.from(base64Data, 'base64');
        logoBuffer = (mimeType === 'image/jpeg' || mimeType === 'image/png') ? rawBuffer : await sharp(rawBuffer).png().toBuffer();
      }
    } catch (_) {}
  } else if (logoUrl) {
    try {
      const resp = await fetch(logoUrl);
      if (resp.ok) {
        const raw = Buffer.from(await resp.arrayBuffer());
        const ct = resp.headers.get('content-type') || '';
        logoBuffer = (ct.includes('jpeg') || ct.includes('png')) ? raw : await sharp(raw).png().toBuffer();
      }
    } catch (_) {}
  }
  // Resolve collection address BEFORE entering the sync Promise callback
  let linkedCollAddr: any = null;
  if (order.collectionAddressId) {
    try { linkedCollAddr = await storage.getCollectionAddress(order.collectionAddressId); } catch (_) {}
  }
  const doc = new PDFDocument({ size: 'A4', margin: 0, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  return new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    const PAGE_W = 595.28, MARGIN = 40, CONTENT_W = PAGE_W - MARGIN * 2;
    const GREEN = '#1a7a3d', GRAY = '#6b7280', DARK = '#111827', BORDER = '#e5e7eb', THEAD_BG = '#f3f4f6';
    const LOGO_SIZE = 52, HEADER_H = 100;
    doc.rect(0, 0, PAGE_W, HEADER_H).fill(GREEN);
    let nameY = 18;
    if (logoBuffer) {
      try { doc.image(logoBuffer, (PAGE_W - LOGO_SIZE) / 2, 12, { fit: [LOGO_SIZE, LOGO_SIZE] }); nameY = 12 + LOGO_SIZE + 4; }
      catch (_) { logoBuffer = null; }
    }
    if (!logoBuffer) {
      const cx = PAGE_W / 2, cy = 34;
      doc.circle(cx, cy, 22).fill('#529b6e');
      doc.font('Helvetica-Bold').fontSize(16).fillColor('#ffffff').text(initials, cx - 22, cy - 9, { width: 44, align: 'center' });
      nameY = cy + 24;
    }
    const nameFontSize = businessName.length > 30 ? 11 : 14;
    doc.font('Helvetica-Bold').fontSize(nameFontSize).fillColor('#ffffff').text(businessName, MARGIN, nameY, { width: CONTENT_W, align: 'center', lineBreak: false });
    doc.font('Helvetica').fontSize(9).fillColor('#c7dfd0').text('INVOICE', MARGIN, nameY + nameFontSize + 3, { width: CONTENT_W, align: 'center' });
    const metaY = HEADER_H + 22, COL_W = CONTENT_W / 3;
    const c1 = MARGIN, c2 = MARGIN + COL_W, c3 = MARGIN + COL_W * 2;
    doc.font('Helvetica').fontSize(8).fillColor(GRAY).text('INVOICE', c1, metaY, { width: COL_W - 8 });
    doc.font('Helvetica-Bold').fontSize(11).fillColor(DARK).text(invoiceRef, c1, metaY + 12, { width: COL_W - 8 });
    doc.font('Helvetica').fontSize(9).fillColor(GRAY).text(invoiceDate, c1, metaY + 26, { width: COL_W - 8 });
    const badgeW = Math.min(psLabel.length * 7 + 16, 70), badgeY = metaY + 42;
    doc.roundedRect(c1, badgeY, badgeW, 15, 7).fill(psColor);
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#ffffff').text(psLabel, c1, badgeY + 3, { width: badgeW, align: 'center' });
    doc.font('Helvetica').fontSize(8).fillColor(GRAY).text('BILL TO', c2, metaY, { width: COL_W - 8 });
    const customerBusinessName = order.retailer?.businessName?.trim() || null;
    let btY: number;
    if (customerBusinessName) {
      doc.font('Helvetica-Bold').fontSize(10).fillColor(DARK).text(customerBusinessName, c2, metaY + 12, { width: COL_W - 8 });
      const bizNameH = doc.font('Helvetica-Bold').fontSize(10).heightOfString(customerBusinessName, { width: COL_W - 8 });
      const attnY = metaY + 12 + bizNameH + 2;
      doc.font('Helvetica').fontSize(9).fillColor(GRAY).text(`Attn: ${customerName}`, c2, attnY, { width: COL_W - 8 });
      btY = attnY + doc.font('Helvetica').fontSize(9).heightOfString(`Attn: ${customerName}`, { width: COL_W - 8 }) + 2;
    } else {
      doc.font('Helvetica-Bold').fontSize(10).fillColor(DARK).text(customerName, c2, metaY + 12, { width: COL_W - 8 });
      btY = metaY + 12 + doc.font('Helvetica-Bold').fontSize(10).heightOfString(customerName, { width: COL_W - 8 }) + 2;
    }
    for (const line of addressLines) {
      doc.font('Helvetica').fontSize(9).fillColor(DARK).text(line, c2, btY, { width: COL_W - 8 });
      btY += doc.font('Helvetica').fontSize(9).heightOfString(line, { width: COL_W - 8 }) + 3;
    }
    const cPhone = order.customerPhone || order.retailer?.phoneNumber;
    if (cPhone) {
      doc.font('Helvetica-Bold').fontSize(10).fillColor(DARK).text(String(cPhone), c2, btY, { width: COL_W - 8 });
      btY += doc.font('Helvetica-Bold').fontSize(10).heightOfString(String(cPhone), { width: COL_W - 8 }) + 3;
    }
    const cEmail = order.customerEmail || order.retailer?.email;
    if (cEmail) {
      doc.font('Helvetica').fontSize(9).fillColor(GRAY).text(String(cEmail), c2, btY, { width: COL_W - 8 });
      btY += doc.font('Helvetica').fontSize(9).heightOfString(String(cEmail), { width: COL_W - 8 }) + 3;
    }
    doc.font('Helvetica').fontSize(8).fillColor(GRAY).text('FROM', c3, metaY, { width: COL_W - 8 });
    doc.font('Helvetica-Bold').fontSize(10).fillColor(DARK).text(businessName, c3, metaY + 12, { width: COL_W - 8 });
    let fromY = metaY + 12 + doc.font('Helvetica-Bold').fontSize(10).heightOfString(businessName, { width: COL_W - 8 }) + 4;
    if (wholesaler.businessPhone) {
      doc.font('Helvetica-Bold').fontSize(10).fillColor(DARK).text(wholesaler.businessPhone, c3, fromY, { width: COL_W - 8 });
      fromY += doc.font('Helvetica-Bold').fontSize(10).heightOfString(wholesaler.businessPhone, { width: COL_W - 8 }) + 3;
    }
    const fromLines: string[] = [];
    // Prefer the linked collection address if the order specifies one (resolved before this callback)
    if (linkedCollAddr) {
      if (linkedCollAddr.addressLine1) fromLines.push(linkedCollAddr.addressLine1);
      if (linkedCollAddr.addressLine2) fromLines.push(linkedCollAddr.addressLine2);
      const collCityPostal = [linkedCollAddr.city, linkedCollAddr.postcode].filter(Boolean).join(' ');
      if (collCityPostal) fromLines.push(collCityPostal);
    } else if (wholesaler.pickupAddress) {
      // Fallback 1: wholesaler's legacy pickup address field
      fromLines.push(wholesaler.pickupAddress);
      const puCityPostal = [wholesaler.city, wholesaler.postalCode].filter(Boolean).join(' ');
      if (puCityPostal) fromLines.push(puCityPostal);
      if (wholesaler.country && wholesaler.country !== 'United Kingdom') fromLines.push(wholesaler.country);
    } else {
      // Fallback 2: wholesaler's general business address
      if (wholesaler.businessAddress) fromLines.push(wholesaler.businessAddress);
      const cityPostal = [wholesaler.city, wholesaler.postalCode].filter(Boolean).join(' ');
      if (cityPostal) fromLines.push(cityPostal);
      if (wholesaler.country && wholesaler.country !== 'United Kingdom') fromLines.push(wholesaler.country);
    }
    if (wholesaler.email) fromLines.push(wholesaler.email);
    for (const line of fromLines) {
      doc.font('Helvetica').fontSize(9).fillColor(GRAY).text(line, c3, fromY, { width: COL_W - 8 });
      fromY += doc.font('Helvetica').fontSize(9).heightOfString(line, { width: COL_W - 8 }) + 3;
    }
    if (wholesaler.legalBusinessName) { doc.font('Helvetica').fontSize(8).fillColor(GRAY).text(`Trading as: ${wholesaler.legalBusinessName}`, c3, fromY, { width: COL_W - 8 }); fromY += doc.font('Helvetica').fontSize(8).heightOfString(`Trading as: ${wholesaler.legalBusinessName}`, { width: COL_W - 8 }) + 2; }
    if (wholesaler.vatNumber) { doc.font('Helvetica').fontSize(8).fillColor(GRAY).text(`VAT Number: ${wholesaler.vatNumber}`, c3, fromY, { width: COL_W - 8 }); fromY += doc.font('Helvetica').fontSize(8).heightOfString(`VAT Number: ${wholesaler.vatNumber}`, { width: COL_W - 8 }) + 2; }
    if (wholesaler.companyRegistrationNumber) { doc.font('Helvetica').fontSize(8).fillColor(GRAY).text(`Company Reg No: ${wholesaler.companyRegistrationNumber}`, c3, fromY, { width: COL_W - 8 }); fromY += doc.font('Helvetica').fontSize(8).heightOfString(`Company Reg No: ${wholesaler.companyRegistrationNumber}`, { width: COL_W - 8 }) + 2; }
    const col1Bottom = badgeY + 15;
    const tableY = Math.max(col1Bottom, btY, fromY) + 16;
    const CW_PRODUCT = Math.round(CONTENT_W * 0.50), CW_QTY = Math.round(CONTENT_W * 0.11);
    const CW_PRICE = Math.round(CONTENT_W * 0.20), CW_TOTAL = CONTENT_W - CW_PRODUCT - CW_QTY - CW_PRICE;
    const xProduct = MARGIN, xQty = xProduct + CW_PRODUCT, xPrice = xQty + CW_QTY, xTotal = xPrice + CW_PRICE;
    const TH_H = 24;
    const drawTableHeader = (y: number): number => {
      doc.rect(MARGIN, y, CONTENT_W, TH_H).fill(THEAD_BG);
      doc.font('Helvetica-Bold').fontSize(8).fillColor(GRAY);
      doc.text('PRODUCT', xProduct + 6, y + 8, { width: CW_PRODUCT - 8 });
      doc.text('QTY', xQty, y + 8, { width: CW_QTY, align: 'center' });
      doc.text('UNIT PRICE', xPrice, y + 8, { width: CW_PRICE, align: 'right' });
      doc.text('TOTAL', xTotal, y + 8, { width: CW_TOTAL - 4, align: 'right' });
      doc.moveTo(MARGIN, y + TH_H).lineTo(MARGIN + CONTENT_W, y + TH_H).strokeColor(BORDER).lineWidth(1).stroke();
      return y + TH_H;
    };
    let rowY = drawTableHeader(tableY);
    for (const item of orderItemsList) {
      const hasExtra = !!(item.packInfo || item.promo);
      const hasBoth = !!(item.packInfo && item.promo);
      const rowH = hasBoth ? 50 : hasExtra ? 38 : 26;
      if (rowY + rowH > 810) { doc.addPage({ size: 'A4', margin: 0 }); rowY = drawTableHeader(MARGIN); }
      doc.font('Helvetica').fontSize(10).fillColor(DARK).text(item.name, xProduct + 6, rowY + 7, { width: CW_PRODUCT - 12, ellipsis: true, lineBreak: false });
      if (item.packInfo) {
        doc.font('Helvetica').fontSize(8).fillColor('#6b7280').text(item.packInfo, xProduct + 6, rowY + 20, { width: CW_PRODUCT - 12, lineBreak: false });
      }
      if (item.promo) {
        const promoY = item.packInfo ? rowY + 34 : rowY + 22;
        const promoTextWidth = Math.min(item.promo.length * 5.2 + 12, CW_PRODUCT - 14);
        doc.roundedRect(xProduct + 4, promoY, promoTextWidth, 13, 3).fill('#dcfce7');
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#16a34a').text(item.promo, xProduct + 8, promoY + 2, { width: promoTextWidth - 6, lineBreak: false });
      }
      doc.font('Helvetica').fontSize(10).fillColor(DARK).text(String(item.qty), xQty, rowY + 7, { width: CW_QTY, align: 'center' });
      doc.font('Helvetica').fontSize(10).fillColor(DARK).text(fmt(item.unitPrice), xPrice, rowY + 7, { width: CW_PRICE, align: 'right' });
      doc.font('Helvetica-Bold').fontSize(10).fillColor(DARK).text(fmt(item.lineTotal), xTotal, rowY + 7, { width: CW_TOTAL - 4, align: 'right' });
      rowY += rowH;
      doc.moveTo(MARGIN, rowY).lineTo(MARGIN + CONTENT_W, rowY).strokeColor(BORDER).lineWidth(0.5).stroke();
    }
    const TOTALS_W = 220, tX = MARGIN + CONTENT_W - TOTALS_W;
    let tY = rowY + 18;
    const drawTotRow = (label: string, value: string, bold = false) => {
      const font = bold ? 'Helvetica-Bold' : 'Helvetica', size = bold ? 12 : 10;
      doc.font(font).fontSize(size).fillColor(bold ? GREEN : GRAY).text(label, tX, tY, { width: TOTALS_W / 2 });
      doc.font(font).fontSize(size).fillColor(bold ? GREEN : DARK).text(value, tX + TOTALS_W / 2, tY, { width: TOTALS_W / 2, align: 'right' });
      tY += bold ? 20 : 17;
    };
    drawTotRow('Subtotal', fmt(subtotal));
    if (deliveryCost > 0) drawTotRow('Delivery', fmt(deliveryCost));
    if (vatAmount > 0) {
      const storedRate = parseFloat(order.vatRateApplied || '0');
      const vatRatePct = storedRate > 0 ? Math.round(storedRate * 100) : (subtotal > 0 ? Math.round((vatAmount / subtotal) * 100) : 0);
      drawTotRow(`VAT (${vatRatePct}%)`, fmt(vatAmount));
    }
    if (showTransactionFee && txFee > 0) drawTotRow('Service Fee', fmt(txFee));
    doc.moveTo(tX, tY - 4).lineTo(tX + TOTALS_W, tY - 4).strokeColor(GREEN).lineWidth(1.5).stroke();
    tY += 4;
    drawTotRow('Total', fmt(grandTotal), true);
    const isPartPaid = (order.paymentStatus === 'part_paid') && amountPaid !== undefined && amountOutstanding !== undefined;
    if (isPartPaid) {
      tY += 6;
      doc.moveTo(tX, tY).lineTo(tX + TOTALS_W, tY).strokeColor(BORDER).lineWidth(0.5).stroke();
      tY += 8;
      const AMBER = '#b45309', AMBER_BG = '#fef3c7';
      doc.roundedRect(tX, tY, TOTALS_W, 46, 4).fill(AMBER_BG);
      const depLabelX = tX + 8, depValX = tX + TOTALS_W / 2, depW = TOTALS_W / 2 - 8;
      doc.font('Helvetica').fontSize(9).fillColor(AMBER).text('Deposit Paid:', depLabelX, tY + 7, { width: depW });
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#15803d').text(fmt(amountPaid!), depValX, tY + 7, { width: depW, align: 'right' });
      doc.font('Helvetica-Bold').fontSize(9).fillColor(AMBER).text('Outstanding Balance:', depLabelX, tY + 26, { width: depW });
      doc.font('Helvetica-Bold').fontSize(9).fillColor(AMBER).text(fmt(amountOutstanding!), depValX, tY + 26, { width: depW, align: 'right' });
      tY += 52;
    }
    if (order.totalWeight && parseFloat(order.totalWeight) > 0) {
      tY += 4;
      drawTotRow('Total Weight', `${parseFloat(order.totalWeight).toFixed(2)} kg`);
    }
    const FOOTER_HEIGHT = 60, PAGE_H = 841.89;
    if (tY + 36 + FOOTER_HEIGHT > PAGE_H) { doc.addPage({ size: 'A4', margin: 0 }); tY = MARGIN; }
    const footerY = Math.max(tY + 36, PAGE_H - FOOTER_HEIGHT - 10);
    doc.moveTo(MARGIN, footerY).lineTo(MARGIN + CONTENT_W, footerY).strokeColor(BORDER).lineWidth(0.5).stroke();
    doc.font('Helvetica').fontSize(10).fillColor(GRAY).text('Thank you for your business!', MARGIN, footerY + 12, { width: CONTENT_W, align: 'center' });
    doc.font('Helvetica-Bold').fontSize(9).fillColor(GREEN).text('Powered by Quikpik Merchant', MARGIN, footerY + 26, { width: CONTENT_W, align: 'center' });
    if (isCancelledOrder) {
      const range = doc.bufferedPageRange();
      for (let p = 0; p < range.count; p++) {
        doc.switchToPage(range.start + p);
        doc.save();
        doc.translate(PAGE_W / 2, PAGE_H / 2).rotate(-45);
        doc.font('Helvetica-Bold').fontSize(120).fillOpacity(0.08).fillColor('#dc2626').text('VOID', -180, -60, { width: 360, align: 'center', lineBreak: false });
        doc.restore();
        doc.fillOpacity(1);
      }
    }
    doc.end();
  });
}

// ─── Customer invoice email ───────────────────────────────────────────────────
export async function sendCustomerInvoiceEmail(customer: any, order: any, items: any[], wholesaler: any, isBalancePayment?: boolean): Promise<void> {
  try {
    const currencySymbol = getCurrencySymbol(wholesaler.preferredCurrency || 'GBP');
    const customerName = customer.name ||
      `${customer.firstName || ''} ${customer.lastName || ''}`.trim() ||
      'Valued Customer';
    let addressComponents = { line1: '', line2: '', city: '', state: '', postalCode: '', country: '' };
    if (order.deliveryAddressId) {
      try {
        const fullAddress = await storage.getDeliveryAddressById(order.deliveryAddressId);
        if (fullAddress) {
          addressComponents = { line1: fullAddress.addressLine1 || '', line2: fullAddress.addressLine2 || '', city: fullAddress.city || '', state: fullAddress.state || '', postalCode: fullAddress.postalCode || '', country: fullAddress.country || '' };
        }
      } catch (error) { console.error('❌ EMAIL: Error fetching address components:', error); }
    }
    const itemsHtml = items.map((item) => {
      const productName = item.productName || (item.product?.name) || 'Product';
      const unitPrice = item.unitPrice ? parseFloat(item.unitPrice).toFixed(2) : '0.00';
      let total = '0.00';
      if (item.total) total = typeof item.total === 'string' ? parseFloat(item.total).toFixed(2) : item.total.toFixed(2);
      else if (item.unitPrice && item.quantity) total = (parseFloat(item.unitPrice) * parseInt(item.quantity)).toFixed(2);
      const promoLabel = item.appliedOfferLabel || '';
      const freeItemsCount = item.freeItems || 0;
      const packDescriptor = item.packDescriptor ?? formatPackDescriptor(item.product?.quantityInPack, item.product?.unitSize, item.product?.unitOfMeasure);
      const packBadge = packDescriptor
        ? `<br><span style="color:#6b7280;font-size:11px;">${packDescriptor}</span>` : '';
      const promoBadge = promoLabel ? `<br><span style="display:inline-block;background:#f3e8ff;color:#7c3aed;font-size:11px;font-weight:bold;padding:2px 8px;border-radius:12px;margin-top:4px;">PROMO: ${promoLabel}</span>` : '';
      const freeBadge = freeItemsCount > 0 ? `<span style="display:inline-block;background:#dcfce7;color:#15803d;font-size:11px;font-weight:bold;padding:2px 8px;border-radius:12px;margin-left:4px;">+${freeItemsCount} FREE ITEMS</span>` : '';
      return `<tr><td style="padding:8px;border-bottom:1px solid #ddd;">${productName}${packBadge}${promoBadge}${freeBadge}</td><td style="padding:8px;border-bottom:1px solid #ddd;text-align:center;">${item.quantity}</td><td style="padding:8px;border-bottom:1px solid #ddd;text-align:right;">${currencySymbol}${unitPrice}</td><td style="padding:8px;border-bottom:1px solid #ddd;text-align:right;">${currencySymbol}${total}</td></tr>`;
    }).join('');
    const addrParts = [addressComponents.line1, addressComponents.line2, addressComponents.city, addressComponents.state, addressComponents.postalCode, addressComponents.country].filter(Boolean);
    const deliverySection = addrParts.length > 0 ? `<div style="margin:16px 0"><strong>Delivery Address:</strong><br>${addrParts.join(', ')}</div>` : '';
    const legalDetailsHtml = [
      wholesaler.legalBusinessName ? `<p style="margin:2px 0;color:#6b7280;font-size:13px;">Trading as: ${wholesaler.legalBusinessName}</p>` : '',
      wholesaler.vatNumber ? `<p style="margin:2px 0;color:#6b7280;font-size:13px;">VAT No: ${wholesaler.vatNumber}</p>` : '',
      wholesaler.companyRegistrationNumber ? `<p style="margin:2px 0;color:#6b7280;font-size:13px;">Co. Reg: ${wholesaler.companyRegistrationNumber}</p>` : '',
    ].filter(Boolean).join('');
    const isDeposit = order.paymentStatus === 'part_paid';
    const amountPaid = order.amountPaid ? parseFloat(order.amountPaid) : null;
    const amountOutstanding = order.amountOutstanding ? parseFloat(order.amountOutstanding) : null;
    const orderTotal = order.total ? parseFloat(order.total) : null;
    const paymentSummaryHtml = (isDeposit && amountPaid !== null && amountOutstanding !== null)
      ? `<div style="background:#fefce8;border:1px solid #fde047;padding:15px;border-radius:5px;margin:20px 0"><h4 style="margin:0 0 10px;color:#713f12;">Deposit Payment Summary</h4><table style="width:100%;border-collapse:collapse"><tr><td style="padding:4px 0;color:#6b7280;">Deposit Paid:</td><td style="padding:4px 0;text-align:right;font-weight:bold;color:#15803d;">${currencySymbol}${amountPaid.toFixed(2)}</td></tr>${orderTotal !== null ? `<tr><td style="padding:4px 0;color:#6b7280;">Order Total:</td><td style="padding:4px 0;text-align:right;">${currencySymbol}${orderTotal.toFixed(2)}</td></tr>` : ''}<tr><td style="padding:4px 0;color:#6b7280;font-weight:bold;">Outstanding Balance:</td><td style="padding:4px 0;text-align:right;font-weight:bold;color:#b45309;">${currencySymbol}${amountOutstanding.toFixed(2)}</td></tr></table><p style="margin:10px 0 0;font-size:13px;color:#78350f;">The remaining balance will be collected separately before your order is dispatched.</p></div>`
      : (isBalancePayment && orderTotal !== null)
        ? (() => {
            const balancePaid = order.latestPaymentAmount ? parseFloat(order.latestPaymentAmount) : amountPaid;
            return `<div style="background:#f0fdf4;border:1px solid #bbf7d0;padding:15px;border-radius:5px;margin:20px 0"><h4 style="margin:0 0 10px;color:#14532d;">Payment Summary</h4><table style="width:100%;border-collapse:collapse"><tr><td style="padding:4px 0;color:#6b7280;">Order Total:</td><td style="padding:4px 0;text-align:right;">${currencySymbol}${orderTotal.toFixed(2)}</td></tr><tr><td style="padding:4px 0;color:#6b7280;">Balance Paid:</td><td style="padding:4px 0;text-align:right;font-weight:bold;color:#15803d;">${currencySymbol}${balancePaid !== null ? balancePaid.toFixed(2) : '0.00'}</td></tr><tr><td style="padding:4px 0;color:#6b7280;font-weight:bold;">Outstanding Balance:</td><td style="padding:4px 0;text-align:right;font-weight:bold;color:#15803d;">${currencySymbol}0.00</td></tr></table></div>`;
          })()
        : (amountPaid !== null && amountPaid > 0 && orderTotal !== null
            ? (() => {
                const subtotalVal = order.subtotal ? parseFloat(order.subtotal) : null;
                const deliveryVal = order.shippingCost ? parseFloat(order.shippingCost) : 0;
                const feeVal = order.customerTransactionFee ? parseFloat(order.customerTransactionFee) : 0;
                const subtotalRow = `<tr><td style="padding:4px 0;color:#6b7280;">Product Subtotal:</td><td style="padding:4px 0;text-align:right;">${currencySymbol}${(subtotalVal ?? 0).toFixed(2)}</td></tr>`;
                const deliveryRow = deliveryVal > 0
                  ? `<tr><td style="padding:4px 0;color:#6b7280;">Delivery:</td><td style="padding:4px 0;text-align:right;">${currencySymbol}${deliveryVal.toFixed(2)}</td></tr>`
                  : '';
                const feeRow = feeVal > 0
                  ? `<tr><td style="padding:4px 0;color:#6b7280;">Service Fee:</td><td style="padding:4px 0;text-align:right;">${currencySymbol}${feeVal.toFixed(2)}</td></tr>`
                  : '';
                return `<div style="background:#f0fdf4;border:1px solid #bbf7d0;padding:15px;border-radius:5px;margin:20px 0"><table style="width:100%;border-collapse:collapse">${subtotalRow}${deliveryRow}${feeRow}<tr style="border-top:1px solid #bbf7d0"><td style="padding:8px 0 4px;font-weight:bold;">Amount Paid:</td><td style="padding:8px 0 4px;text-align:right;font-weight:bold;color:#15803d;">${currencySymbol}${amountPaid.toFixed(2)}</td></tr></table></div>`;
              })()
            : '');
    const emailTitle = isDeposit ? 'Deposit Received' : isBalancePayment ? 'Balance Paid \u2014 Order Confirmed' : 'Order Confirmation';
    const emailIntro = isDeposit
      ? `Thank you \u2014 your deposit payment has been received. We'll be in touch once the remaining balance is settled.`
      : isBalancePayment
        ? `Great news \u2014 your balance payment has been received and your order is now fully paid. We'll be in touch shortly with dispatch details.`
        : `Thank you for your order!`;
    const emailHtml = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><h2 style="color:#22c55e;">${emailTitle}</h2><p>Dear ${customerName},</p><p>${emailIntro}</p><div style="background:#f9f9f9;padding:20px;border-radius:5px;margin:20px 0"><h3>Order Details</h3><table style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left;padding:8px;border-bottom:2px solid #ddd;">Product</th><th style="text-align:center;padding:8px;border-bottom:2px solid #ddd;">Qty</th><th style="text-align:right;padding:8px;border-bottom:2px solid #ddd;">Unit Price</th><th style="text-align:right;padding:8px;border-bottom:2px solid #ddd;">Total</th></tr></thead><tbody>${itemsHtml}</tbody></table></div>${paymentSummaryHtml}${deliverySection}<div style="background:#f0f9ff;padding:15px;border-radius:5px;margin:20px 0"><h4>Store Contact</h4><p><strong>${wholesaler.businessName || 'Wholesale Store'}</strong></p>${wholesaler.businessPhone ? `<p>📞 ${wholesaler.businessPhone}</p>` : ''}${wholesaler.email ? `<p>📧 ${wholesaler.email}</p>` : ''}${legalDetailsHtml}</div></div>`;
    if (!process.env.SENDGRID_API_KEY) {
      console.log("SendGrid not configured — email skipped for order #" + order.id);
      return;
    }
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    const orderRef = order.orderNumber || `#${order.id}`;
    const businessName = wholesaler.businessName || 'Wholesale Store';
    let pdfAttachment: SendGridAttachment | null = null;
    try {
      const orderForPdf = { ...order, items: items?.length > 0 ? items : (order.items || []), retailer: order.retailer || customer };
      const pdfAmountPaid = amountPaid !== null ? amountPaid! : undefined;
      const pdfAmountOutstanding = amountOutstanding !== null ? amountOutstanding! : undefined;
      const pdfBuffer = await buildInvoicePdf(orderForPdf, wholesaler, orderForPdf.paymentMethod === 'payment_link' || (!!orderForPdf.stripePaymentIntentId && !orderForPdf.paymentMethod), pdfAmountPaid, pdfAmountOutstanding);
      pdfAttachment = { content: pdfBuffer.toString('base64'), filename: `invoice-${order.orderNumber || order.id}.pdf`, type: 'application/pdf', disposition: 'attachment' };
    } catch (pdfError) { console.error('⚠️ Could not generate PDF for email (email still sends without it):', pdfError); }
    await sgMail.send({ to: customer.email, from: 'hello@quikpik.co', subject: `${emailTitle} ${orderRef} - ${businessName}`, html: emailHtml, ...(pdfAttachment ? { attachments: [pdfAttachment] } : {}) });
    console.log(`✅ Confirmation email sent to ${customer.email} for order #${order.id}`);
    if (wholesaler.email) {
      try {
        const customerDisplayName = customer.name || (customer.firstName ? `${customer.firstName} ${customer.lastName || ''}`.trim() : null) || customer.email || 'a customer';
        const wholesalerSubjectLabel = isDeposit ? 'Deposit Received' : isBalancePayment ? 'Balance Payment Received' : 'New Order Received';
        const wholesalerBodyLabel = isDeposit
          ? `Deposit of ${currencySymbol}${amountPaid !== null ? amountPaid.toFixed(2) : '?'} received from <strong>${customerDisplayName}</strong>. Outstanding balance: ${currencySymbol}${amountOutstanding !== null ? amountOutstanding.toFixed(2) : '?'}. Invoice attached as PDF.`
          : isBalancePayment
            ? (() => { const balanceTxn = order.latestPaymentAmount ? parseFloat(order.latestPaymentAmount) : amountPaid; return `Balance payment of ${currencySymbol}${balanceTxn !== null ? balanceTxn.toFixed(2) : '?'} received from <strong>${customerDisplayName}</strong>. The order is now fully paid. Invoice attached as PDF.`; })()
            : `Placed by <strong>${customerDisplayName}</strong>. Full invoice attached as PDF.`;
        const wholesalerHtml = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto"><h2 style="color:#1a7a3d">${wholesalerSubjectLabel} — ${orderRef}</h2><p>${wholesalerBodyLabel}</p><p style="margin-top:24px;color:#6b7280;font-size:12px">Powered by <strong style="color:#1a7a3d">Quikpik Merchant</strong></p></div>`;
        await sgMail.send({ to: wholesaler.email, from: 'hello@quikpik.co', ...(customer.email ? { replyTo: customer.email } : {}), subject: `${wholesalerSubjectLabel} — ${orderRef} — Invoice Attached`, html: wholesalerHtml, ...(pdfAttachment ? { attachments: [pdfAttachment] } : {}) });
        console.log(`✅ Wholesaler invoice copy sent to ${wholesaler.email}`);
      } catch (err: any) { console.error('⚠️ Failed to send wholesaler invoice copy (non-fatal):', err?.message); }
    }
  } catch (error) { console.error('Failed to send customer confirmation email:', error); }
}

export async function createStripeRefundReceipt(order: any, refund: any, wholesaler: any, customer: any, reason: string): Promise<any> {
  let stripeClient: ReturnType<typeof getStripeClient> | null = null;
  try { stripeClient = getStripeClient(Boolean(wholesaler?.isTestAccount)); } catch { /* key not configured */ }
  if (!stripeClient || !wholesaler.stripeAccountId) { console.log('Stripe not configured or no Connect account, skipping refund receipt'); return; }
  try {
    if (refund?.id) {
      const invoices = await stripeClient.invoices.list({ customer: customer.email, limit: 10 }, { stripeAccount: wholesaler.stripeAccountId });
      const originalInvoice = invoices.data.find(inv => inv.metadata?.order_id === order.id.toString());
      if (originalInvoice) {
        const creditNote = await stripeClient.creditNotes.create({ invoice: originalInvoice.id, amount: refund.amount, reason: 'requested_by_customer', memo: reason || 'Refund processed', metadata: { order_id: order.id.toString(), refund_id: refund.id, refund_reason: reason || 'Customer requested refund' } }, { stripeAccount: wholesaler.stripeAccountId });
        console.log(`✅ Stripe credit note created for refund ${refund.id}`);
        return creditNote;
      }
    }
  } catch (error) { console.error('❌ Failed to create Stripe refund receipt:', error); }
}

export async function sendRefundReceipt(customer: any, order: any, refund: any, wholesaler: any, reason: string): Promise<void> {
  if (!sgMail) { console.log('SendGrid not configured, skipping refund receipt'); return; }
  try {
    const businessName = wholesaler.businessName || 'Quikpik Merchant';
    const currencySymbol = getCurrencySymbol(wholesaler.preferredCurrency || 'GBP');
    const refundAmount = refund ? (refund.amount / 100) : parseFloat(order.total);
    const isFullRefund = refund ? (refund.amount >= parseFloat(order.total) * 100) : true;
    const wholesalerUser = await storage.getUser(order.wholesalerId);
    const refundBody = `${emailHeading('Refund Receipt', { size: '22px', color: '#dc2626' })}${emailCard(`<p style="margin:0;font-size:15px;color:#7f1d1d">${isFullRefund ? 'Full refund' : 'Partial refund'} of <strong>${currencySymbol}${refundAmount.toFixed(2)}</strong> processed for Order #${order.id}</p>`, { borderColor: '#FECACA', bgColor: '#FEF2F2' })}${emailCard(`${emailHeading('Refund Summary', { size: '16px' })}<p style="margin:0 0 6px"><strong>Original Total:</strong> ${currencySymbol}${parseFloat(order.total).toFixed(2)}</p><p style="margin:0 0 6px"><strong>Refund Amount:</strong> <span style="color:#dc2626">${currencySymbol}${refundAmount.toFixed(2)}</span></p><p style="margin:0"><strong>Reference:</strong> ${refund ? refund.id : 'Manual Refund'}</p>${reason ? `<p style="margin:10px 0 0;padding-top:10px;border-top:1px solid #e5e7eb"><strong>Reason:</strong> ${reason}</p>` : ''}`)}<p style="margin:20px 0 0;text-align:center;color:#6b7280">Refund will appear on your payment method within 5-10 business days.</p>`;
    await sgMail.send({ to: customer.email, from: 'hello@quikpik.co', subject: `Refund Receipt for Order #${order.id} - ${businessName}`, html: wrapCustomerEmail(refundBody, { businessName, logoUrl: getEmailLogoUrl(wholesalerUser?.id, wholesalerUser?.logoType, wholesalerUser?.logoUrl) }, { preheader: `Refund of ${currencySymbol}${refundAmount.toFixed(2)} processed` }) });
    console.log(`✅ Refund receipt sent to ${customer.email} for order ${order.id}`);
  } catch (error) { console.error('❌ Failed to send refund receipt:', error); throw error; }
}

export function generateOrderNotificationMessage(order: any, customer: any, items: any[]): string {
  let message = `🛒 New Order Received!\n\nOrder #${order.id}\nCustomer: ${customer.firstName}\nPhone: ${customer.phoneNumber}\nEmail: ${customer.email}\n\nItems Ordered:\n`;
  items.forEach((item: any, index: number) => { message += `${index + 1}. Product ID ${item.productId}\n   Quantity: ${item.quantity} units\n   Unit Price: ${item.unitPrice}\n   Total: ${item.total}\n\n`; });
  message += `Order Total: ${order.total}\n\n`;
  if (order.notes) message += `Customer Notes: ${order.notes}\n\n`;
  message += `Please contact the customer to confirm delivery details.`;
  return message;
}

// ─── Tier limit helpers ───────────────────────────────────────────────────────
// These delegate to the canonical PLAN_LIMITS in server/config/plan-limits.ts.
// getProductLimit and getTeamMemberLimit were dead code and have been removed.
export function getCustomerGroupLimit(tier: string): number {
  return getPlanLimits(tier).groups;
}
export function getBroadcastLimit(tier: string): number {
  return getPlanLimits(tier).broadcasts;
}

export function isInvitationExpired(invitedAt: Date | string | null | undefined): boolean {
  if (!invitedAt) return false;
  return Date.now() > new Date(invitedAt).getTime() + 7 * 24 * 60 * 60 * 1000;
}

export async function sendWelcomeEmail(user: any): Promise<void> {
  if (!process.env.SENDGRID_API_KEY) { console.log("⚠️ SendGrid not configured, skipping welcome email"); return; }
  try {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    const welcomeBody = `${emailHeading('Welcome to Quikpik!', { size: '22px', color: '#10b981' })}<p style="font-size:16px;margin:0 0 8px">Hello ${user.firstName},</p><p style="margin:0 0 20px">Congratulations on joining Quikpik!</p>${emailCard(`${emailHeading('Get Started', { size: '16px', color: '#059669' })}<ul style="margin:0;padding-left:20px;font-size:14px"><li style="margin-bottom:6px">Add products with photos, pricing, and stock levels</li><li style="margin-bottom:6px">Create customer groups for targeted communication</li><li style="margin-bottom:6px">Get ready for WhatsApp broadcasts when they launch</li><li>Accept online payments and manage orders efficiently</li></ul>`)}${emailButton('Access Your Dashboard', 'https://quikpik.app')}`;
    await sgMail.send({ to: user.email, from: { email: 'hello@quikpik.co', name: 'Quikpik Team' }, subject: `Welcome to Quikpik, ${user.firstName}!`, html: wrapCustomerEmail(welcomeBody, { businessName: user.businessName || `${user.firstName}'s Business` || 'Quikpik', logoUrl: getEmailLogoUrl(user.id, user.logoType, user.logoUrl) }, { preheader: 'Welcome to Quikpik - your wholesale platform is ready' }) });
    console.log(`✅ Welcome email sent to ${user.email}`);
  } catch (error) { console.error('Failed to send welcome email:', error); }
}

export const passwordResetAttempts = new Map<string, { count: number; lastAttempt: number }>();

export { ADMIN_EMAILS } from '../config';

export async function geocodePostcode(postcode: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const clean = postcode.trim().replace(/\s+/g, '').toUpperCase();
    const response = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(clean)}`);
    if (!response.ok) return null;
    const data: any = await response.json();
    return data.status === 200 && data.result ? { lat: data.result.latitude, lng: data.result.longitude } : null;
  } catch { return null; }
}
