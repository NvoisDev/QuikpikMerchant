import { db } from "../db";
import { products, users, teamMembers, orders, orderItems } from "../../shared/schema";
import { eq, and, or, isNull, lte, inArray } from "drizzle-orm";
import { sendEmail } from "../sendgrid-service";
import { sendWhatsAppMessage } from "./whatsappService";
import { wrapCustomerEmail, emailHeading, emailCard, emailButton } from "../email-templates";

export interface StockAlert {
  productId: number;
  productName: string;
  currentStock: number;
  minimumThreshold: number;
  wholesalerId: string;
  wholesalerName: string;
  wholesalerEmail?: string;
  wholesalerPhone?: string;
  wholesalerLogoUrl?: string | null;
  suggestedReorderQuantity: number;
}

type StockAlertFrequency = 'daily' | 'weekly' | 'critical_only';
type StockAlertChannel = 'email' | 'sms' | 'both' | 'off';

interface NotificationPrefs {
  stockAlertFrequency?: StockAlertFrequency;
  stockAlertChannel?: StockAlertChannel;
  stockAlertDay?: number;
  lastWeeklyStockAlertSentAt?: string | null;
  [key: string]: unknown;
}

/** Returns true if the given date falls within the current ISO calendar week (Mon–Sun). */
function isThisCalendarWeek(date: Date): boolean {
  const now = new Date();
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  const dow = now.getDay();
  monday.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));
  return date >= monday;
}

/** Returns true if today is the chosen day AND we haven't already sent this calendar week. */
function shouldSendWeeklyToday(prefs: NotificationPrefs): boolean {
  const targetDay = typeof prefs.stockAlertDay === 'number' ? prefs.stockAlertDay : 1; // default Monday
  const todayDay = new Date().getDay();
  if (todayDay !== targetDay) return false;
  const lastSent = prefs.lastWeeklyStockAlertSentAt ? new Date(prefs.lastWeeklyStockAlertSentAt) : null;
  if (lastSent && isThisCalendarWeek(lastSent)) return false;
  return true;
}

async function hasPendingOrders(productId: number, wholesalerId: string): Promise<boolean> {
  const rows = await db
    .select({ id: orders.id })
    .from(orders)
    .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
    .where(and(
      eq(orderItems.productId, productId),
      eq(orders.wholesalerId, wholesalerId),
      or(
        eq(orders.status, 'pending'),
        eq(orders.status, 'confirmed'),
        eq(orders.status, 'processing')
      )
    ))
    .limit(1);
  return rows.length > 0;
}

export class StockAlertService {
  /**
   * Check all products for low stock and send alerts to wholesalers
   */
  async checkAndSendLowStockAlerts(): Promise<void> {
    try {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const lowStockProducts = await db
        .select({
          id: products.id,
          name: products.name,
          stock: products.stock,
          palletStock: products.palletStock,
          moq: products.moq,
          lowStockThreshold: products.lowStockThreshold,
          wholesalerId: products.wholesalerId,
          price: products.price
        })
        .from(products)
        .where(and(
          eq(products.status, 'active'),
          or(
            lte(products.stock, products.moq),
            lte(products.stock, products.lowStockThreshold)
          ),
          or(
            isNull(products.lastStockAlertSentAt),
            lte(products.lastStockAlertSentAt, twentyFourHoursAgo)
          )
        ));

      if (lowStockProducts.length === 0) {
        return;
      }

      const alertsByWholesaler = new Map<string, StockAlert[]>();
      const wholesalerPrefs = new Map<string, NotificationPrefs>();
      const wholesalerDataMap = new Map<string, any>();

      for (const product of lowStockProducts) {
        const wholesaler = await db
          .select()
          .from(users)
          .where(eq(users.id, product.wholesalerId))
          .limit(1);

        if (wholesaler.length === 0) continue;

        const wData = wholesaler[0];
        wholesalerDataMap.set(product.wholesalerId, wData);

        const prefs: NotificationPrefs = (wData.notificationPreferences as NotificationPrefs) || {};
        wholesalerPrefs.set(product.wholesalerId, prefs);

        const frequency: StockAlertFrequency = prefs.stockAlertFrequency || 'daily';

        // Critical only: stock is completely out, OR stock is below MOQ with no pending replenishment orders
        if (frequency === 'critical_only') {
          const stock = product.stock || 0;
          const moq = product.moq || 1;
          const isOutOfStock = stock <= 0;
          const isBelowMoq = stock < moq;
          if (!isOutOfStock) {
            if (!isBelowMoq) continue;
            const pending = await hasPendingOrders(product.id, product.wholesalerId);
            if (pending) continue;
          }
        }

        const suggestedReorderQuantity = Math.max(
          (product.moq || 10) * 3,
          100
        );

        const threshold = Math.max(product.moq || 1, product.lowStockThreshold || 50);
        const logoUrl = wData.logoType === 'custom' && wData.logoUrl
          ? `https://quikpik.app/api/logo/${product.wholesalerId}`
          : (wData.logoUrl?.startsWith('http') ? wData.logoUrl : undefined);

        const alert: StockAlert = {
          productId: product.id,
          productName: product.name,
          currentStock: product.stock || 0,
          minimumThreshold: threshold,
          wholesalerId: product.wholesalerId,
          wholesalerName: wData.businessName || `${wData.firstName || ''} ${wData.lastName || ''}`.trim(),
          wholesalerEmail: wData.email || undefined,
          wholesalerPhone: wData.phoneNumber || undefined,
          wholesalerLogoUrl: logoUrl,
          suggestedReorderQuantity
        };

        if (!alertsByWholesaler.has(product.wholesalerId)) {
          alertsByWholesaler.set(product.wholesalerId, []);
        }
        alertsByWholesaler.get(product.wholesalerId)!.push(alert);
      }

      const allAlertedProductIds: number[] = [];

      for (const entry of Array.from(alertsByWholesaler.entries())) {
        const [wholesalerId, alerts] = entry;
        const prefs = wholesalerPrefs.get(wholesalerId) || {};
        const frequency: StockAlertFrequency = prefs.stockAlertFrequency || 'daily';
        const channel: StockAlertChannel = prefs.stockAlertChannel || 'email';

        // Owner notification — respects the owner's cadence
        let ownerNotified = false;
        if (channel !== 'off') {
          if (frequency === 'weekly') {
            if (shouldSendWeeklyToday(prefs)) {
              await this.sendOwnerAlerts(alerts, channel);
              ownerNotified = true;
            }
          } else {
            await this.sendOwnerAlerts(alerts, channel);
            ownerNotified = true;
          }
        }

        if (ownerNotified) {
          allAlertedProductIds.push(...alerts.map(a => a.productId));
          if (frequency === 'weekly') {
            const wData = wholesalerDataMap.get(wholesalerId);
            const updatedPrefs = { ...(wData?.notificationPreferences || {}), lastWeeklyStockAlertSentAt: new Date().toISOString() };
            await db.update(users).set({ notificationPreferences: updatedPrefs }).where(eq(users.id, wholesalerId));
          }
        }

        // Team members are notified independently of owner cadence, using their own preferences
        const membersNotified = await this.notifyTeamMembers(alerts, wholesalerId, channel, frequency, prefs);

        // Only mark products as alerted when at least one notification was actually sent
        if (ownerNotified || membersNotified) {
          allAlertedProductIds.push(...alerts.map(a => a.productId));
        }
      }

      if (allAlertedProductIds.length > 0) {
        const uniqueIds = [...new Set(allAlertedProductIds)];
        await db
          .update(products)
          .set({ lastStockAlertSentAt: new Date() })
          .where(inArray(products.id, uniqueIds));
      }

    } catch (error) {
      console.error('❌ Error checking low stock:', error);
    }
  }

  private async sendOwnerAlerts(alerts: StockAlert[], channel: StockAlertChannel): Promise<void> {
    if (alerts.length === 0) return;
    const wholesaler = alerts[0];
    const messages = this.generateAlertMessages(alerts);
    const doEmail = channel === 'email' || channel === 'both';
    const doSms = channel === 'sms' || channel === 'both';
    await Promise.allSettled([
      doEmail ? this.sendEmailAlert(wholesaler, messages.email) : Promise.resolve(),
      doSms ? this.sendWhatsAppAlert(wholesaler, messages.whatsapp) : Promise.resolve(),
    ]);
  }

  private async notifyTeamMembers(
    alerts: StockAlert[],
    wholesalerId: string,
    ownerChannel: StockAlertChannel,
    ownerFrequency: StockAlertFrequency,
    ownerPrefs: NotificationPrefs
  ): Promise<boolean> {
    if (alerts.length === 0) return false;
    let anySent = false;
    try {
      const members = await db
        .select({
          id: teamMembers.id,
          email: teamMembers.email,
          phoneNumber: teamMembers.phoneNumber,
          firstName: teamMembers.firstName,
          notificationPreferences: teamMembers.notificationPreferences,
        })
        .from(teamMembers)
        .where(and(
          eq(teamMembers.wholesalerId, wholesalerId),
          eq(teamMembers.status, 'active')
        ));

      const wholesaler = alerts[0];

      for (const member of members) {
        const memberPrefs = (member.notificationPreferences as NotificationPrefs) || {};

        // Whether the member has an explicit (non-inherit) frequency preference
        const memberHasExplicitFrequency =
          !!memberPrefs.stockAlertFrequency && memberPrefs.stockAlertFrequency !== 'inherit';

        // Resolve effective channel and frequency — fall back to owner's setting when 'inherit' or unset
        const memberChannel: StockAlertChannel =
          (memberPrefs.stockAlertChannel && memberPrefs.stockAlertChannel !== 'inherit')
            ? memberPrefs.stockAlertChannel as StockAlertChannel
            : ownerChannel;

        const memberFrequency: StockAlertFrequency =
          memberHasExplicitFrequency
            ? memberPrefs.stockAlertFrequency as StockAlertFrequency
            : ownerFrequency;

        if (memberChannel === 'off') continue;

        // Per-member weekly cadence check — uses member's own stockAlertDay (falls back to owner's)
        if (memberFrequency === 'weekly') {
          const effectiveMemberPrefs: NotificationPrefs = {
            ...memberPrefs,
            stockAlertDay: typeof memberPrefs.stockAlertDay === 'number'
              ? memberPrefs.stockAlertDay
              : ownerPrefs.stockAlertDay,
          };
          if (!shouldSendWeeklyToday(effectiveMemberPrefs)) continue;
        }

        // Per-member critical_only filter.
        // When the member explicitly sets critical_only but the owner's list includes non-critical items
        // (owner is daily or weekly), filter down to urgently low products.
        // When the frequency is inherited and owner is also critical_only, the product list is already
        // filtered at collection time — no additional filtering needed.
        let memberAlerts = alerts;
        if (memberFrequency === 'critical_only') {
          const ownerAlsoFiltersCritical = ownerFrequency === 'critical_only';
          if (memberHasExplicitFrequency && !ownerAlsoFiltersCritical) {
            // Member explicitly wants critical_only but owner's list includes non-critical items
            memberAlerts = alerts.filter(a => a.currentStock <= 0 || a.currentStock < a.minimumThreshold);
            if (memberAlerts.length === 0) continue;
          }
          // If !memberHasExplicitFrequency (inherited) or ownerAlsoFiltersCritical, alerts are already
          // correctly pre-filtered at collection time — use them as-is
        }

        const messages = this.generateAlertMessages(memberAlerts);
        const doEmail = memberChannel === 'email' || memberChannel === 'both';
        const doSms = memberChannel === 'sms' || memberChannel === 'both';

        let memberNotificationSent = false;
        if (doEmail && member.email) {
          await this.sendEmailAlert({ ...wholesaler, wholesalerEmail: member.email }, messages.email);
          memberNotificationSent = true;
        }
        if (doSms && member.phoneNumber) {
          await this.sendWhatsAppAlert({ ...wholesaler, wholesalerPhone: member.phoneNumber }, messages.whatsapp);
          memberNotificationSent = true;
        }

        if (memberNotificationSent) {
          anySent = true;
          // Update weekly last-sent timestamp for this member — scoped by id to avoid cross-tenant coupling
          if (memberFrequency === 'weekly') {
            const updatedMemberPrefs = { ...memberPrefs, lastWeeklyStockAlertSentAt: new Date().toISOString() };
            await db.update(teamMembers).set({ notificationPreferences: updatedMemberPrefs }).where(eq(teamMembers.id, member.id));
          }
        }
      }
    } catch (error) {
      console.error(`❌ Failed to send stock alerts to team members for wholesaler ${wholesalerId}:`, error);
    }
    return anySent;
  }

  private generateAlertMessages(alerts: StockAlert[]) {
    const wholesaler = alerts[0];
    const productCount = alerts.length;
    const totalSuggestedValue = alerts.reduce((sum, alert) => sum + (alert.suggestedReorderQuantity * 10), 0);
    const urgentProducts = alerts.filter(alert => alert.currentStock <= 5);
    const urgentCount = urgentProducts.length;

    return {
      sms: `🚨 STOCK ALERT: ${productCount} products running low. ${urgentCount} critically low (≤5 units). Check your dashboard to reorder now.`,
      whatsapp: `🚨 *STOCK ALERT*\n\n${productCount} products need restocking:\n\n${urgentCount > 0 ? `⚠️ *URGENT (≤5 units):*\n${urgentProducts.slice(0, 3).map(p => `• ${p.productName}: ${p.currentStock} left`).join('\n')}\n\n` : ''}📦 *Products to reorder:*\n${alerts.slice(0, 5).map(p => `• ${p.productName}: ${p.currentStock}/${p.minimumThreshold} units`).join('\n')}${alerts.length > 5 ? `\n...and ${alerts.length - 5} more` : ''}\n\n💡 *Suggested reorder value: £${totalSuggestedValue.toFixed(0)}*\n\nCheck your dashboard to place reorders quickly.`,
      email: {
        subject: `🚨 Stock Alert: ${productCount} Products Need Restocking`,
        body: this.generateEmailBody(alerts)
      }
    };
  }

  private generateEmailBody(alerts: StockAlert[]): string {
    const wholesaler = alerts[0];
    const urgentProducts = alerts.filter(alert => alert.currentStock <= 5);
    const lowProducts = alerts.filter(alert => alert.currentStock > 5 && alert.currentStock <= alert.minimumThreshold);

    let body = `${emailHeading('Stock Alert', { size: '22px', color: '#dc2626' })}<p style="margin:0 0 20px">We've detected ${alerts.length} products that need restocking to maintain optimal inventory levels.</p>`;

    if (urgentProducts.length > 0) {
      body += emailCard(`${emailHeading('URGENT - Critical Stock Levels', { size: '16px', color: '#dc2626' })}<ul style="margin:0;padding-left:20px">${urgentProducts.map(product => `<li style="margin:8px 0"><strong>${product.productName}</strong> - Only ${product.currentStock} units left<br><small style="color:#6b7280">Suggested reorder: ${product.suggestedReorderQuantity} units</small></li>`).join('')}</ul>`, { borderColor: '#FECACA', bgColor: '#FEF2F2' });
    }

    if (lowProducts.length > 0) {
      body += emailCard(`${emailHeading('Low Stock Products', { size: '16px', color: '#f59e0b' })}<ul style="margin:0;padding-left:20px">${lowProducts.map(product => `<li style="margin:8px 0"><strong>${product.productName}</strong> - ${product.currentStock} units (Min: ${product.minimumThreshold})<br><small style="color:#6b7280">Suggested reorder: ${product.suggestedReorderQuantity} units</small></li>`).join('')}</ul>`, { borderColor: '#FDE68A', bgColor: '#FFFBEB' });
    }

    body += emailCard(`${emailHeading('Quick Actions', { size: '16px' })}<ul style="margin:0;padding-left:20px"><li style="margin-bottom:6px">Log into your dashboard to place reorders immediately</li><li style="margin-bottom:6px">Contact your suppliers to ensure timely delivery</li><li>Consider adjusting minimum stock thresholds for better planning</li></ul>`);
    body += emailButton('View Dashboard', 'https://quikpik.app/login');

    return wrapCustomerEmail(body, { businessName: wholesaler.wholesalerName, logoUrl: wholesaler.wholesalerLogoUrl }, { preheader: `${alerts.length} products need restocking` });
  }

  private async sendEmailAlert(wholesaler: StockAlert, emailContent: { subject: string; body: string }): Promise<void> {
    if (!wholesaler.wholesalerEmail) return;
    try {
      await sendEmail({
        to: wholesaler.wholesalerEmail,
        from: 'hello@quikpik.co',
        subject: emailContent.subject,
        text: emailContent.body.replace(/<[^>]*>/g, ''),
        html: emailContent.body
      });
    } catch (error) {
      console.error(`❌ Failed to send email stock alert to ${wholesaler.wholesalerName}:`, error);
    }
  }

  private async sendWhatsAppAlert(wholesaler: StockAlert, message: string): Promise<void> {
    if (!wholesaler.wholesalerPhone) return;
    try {
      await sendWhatsAppMessage({ to: wholesaler.wholesalerPhone, message });
    } catch (error) {
      console.error(`❌ Failed to send WhatsApp stock alert to ${wholesaler.wholesalerName}:`, error);
    }
  }
}

export const stockAlertService = new StockAlertService();
