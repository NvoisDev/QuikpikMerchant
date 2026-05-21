import { db } from "../db";
import { products, users, teamMembers } from "../../shared/schema";
import { eq, lt, and, or, isNull, lte, inArray } from "drizzle-orm";
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
  lastWeeklyStockAlertAt?: string | null;
  [key: string]: unknown;
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

      // Group products by wholesaler
      const alertsByWholesaler = new Map<string, StockAlert[]>();
      const wholesalerPrefs = new Map<string, NotificationPrefs>();
      const wholesalerData = new Map<string, any>();

      for (const product of lowStockProducts) {
        const wholesaler = await db
          .select()
          .from(users)
          .where(eq(users.id, product.wholesalerId))
          .limit(1);

        if (wholesaler.length === 0) continue;

        const wData = wholesaler[0];
        wholesalerData.set(product.wholesalerId, wData);

        const prefs: NotificationPrefs = (wData.notificationPreferences as NotificationPrefs) || {};
        wholesalerPrefs.set(product.wholesalerId, prefs);

        const channel: StockAlertChannel = prefs.stockAlertChannel || 'email';
        if (channel === 'off') continue;

        const frequency: StockAlertFrequency = prefs.stockAlertFrequency || 'daily';

        // Critical only: skip products that aren't out or critically low (≤5 and ≤ moq)
        if (frequency === 'critical_only') {
          const isCritical = (product.stock || 0) <= 0 || ((product.stock || 0) <= 5 && (product.stock || 0) <= (product.moq || 1));
          if (!isCritical) continue;
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

        // Weekly cadence check: skip if already sent within 7 days
        if (frequency === 'weekly') {
          const lastSent = prefs.lastWeeklyStockAlertAt ? new Date(prefs.lastWeeklyStockAlertAt) : null;
          const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          if (lastSent && lastSent > sevenDaysAgo) {
            continue;
          }
        }

        const channel: StockAlertChannel = prefs.stockAlertChannel || 'email';
        await this.sendStockAlerts(alerts, channel);
        allAlertedProductIds.push(...alerts.map(a => a.productId));

        // Update lastWeeklyStockAlertAt for weekly cadence
        if (frequency === 'weekly') {
          const wData = wholesalerData.get(wholesalerId);
          const updatedPrefs = { ...(wData?.notificationPreferences || {}), lastWeeklyStockAlertAt: new Date().toISOString() };
          await db.update(users).set({ notificationPreferences: updatedPrefs }).where(eq(users.id, wholesalerId));
        }
      }

      if (allAlertedProductIds.length > 0) {
        await db
          .update(products)
          .set({ lastStockAlertSentAt: new Date() })
          .where(inArray(products.id, allAlertedProductIds));
      }

    } catch (error) {
      console.error('❌ Error checking low stock:', error);
    }
  }

  /**
   * Send stock alerts to a wholesaler via selected channel, and to all active team members
   */
  private async sendStockAlerts(alerts: StockAlert[], channel: StockAlertChannel): Promise<void> {
    if (alerts.length === 0) return;

    const wholesaler = alerts[0];

    const messages = this.generateAlertMessages(alerts);

    const sendEmail = channel === 'email' || channel === 'both';
    const sendSms = channel === 'sms' || channel === 'both';

    await Promise.allSettled([
      sendEmail ? this.sendEmailAlert(wholesaler, messages.email) : Promise.resolve(),
      sendSms ? this.sendWhatsAppAlert(wholesaler, messages.whatsapp) : Promise.resolve(),
    ]);

    try {
      const members = await db
        .select({
          email: teamMembers.email,
          phoneNumber: teamMembers.phoneNumber,
          firstName: teamMembers.firstName,
        })
        .from(teamMembers)
        .where(and(
          eq(teamMembers.wholesalerId, wholesaler.wholesalerId),
          eq(teamMembers.status, 'active')
        ));

      for (const member of members) {
        if (sendEmail) {
          const memberAlertOverride = { ...wholesaler, wholesalerEmail: member.email };
          await this.sendEmailAlert(memberAlertOverride, messages.email);
        }
        if (sendSms && member.phoneNumber) {
          await this.sendWhatsAppAlert({ ...wholesaler, wholesalerPhone: member.phoneNumber }, messages.whatsapp);
        }
      }

    } catch (error) {
      console.error(`❌ Failed to send stock alerts to team members for ${wholesaler.wholesalerName}:`, error);
    }
  }

  /**
   * Generate alert messages for different channels
   */
  private generateAlertMessages(alerts: StockAlert[]) {
    const wholesaler = alerts[0];
    const productCount = alerts.length;
    const totalSuggestedValue = alerts.reduce((sum, alert) => {
      return sum + (alert.suggestedReorderQuantity * 10);
    }, 0);

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

  /**
   * Generate detailed email body for stock alerts
   */
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

  /**
   * Send email alert
   */
  private async sendEmailAlert(wholesaler: StockAlert, emailContent: { subject: string; body: string }): Promise<void> {
    if (!wholesaler.wholesalerEmail) {
      return;
    }

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

  /**
   * Send WhatsApp alert
   */
  private async sendWhatsAppAlert(wholesaler: StockAlert, message: string): Promise<void> {
    if (!wholesaler.wholesalerPhone) {
      return;
    }

    try {
      await sendWhatsAppMessage({ to: wholesaler.wholesalerPhone, message });
    } catch (error) {
      console.error(`❌ Failed to send WhatsApp stock alert to ${wholesaler.wholesalerName}:`, error);
    }
  }
}

export const stockAlertService = new StockAlertService();
