import { db } from "../db";
import { products, users } from "../../shared/schema";
import { eq, lt, and } from "drizzle-orm";
import { sendEmail } from "../sendgrid-service";
import { ReliableSMSService } from "../sms-service";
import { whatsAppBusinessService } from "../whatsapp-simple";
import { wrapPlatformEmail, emailHeading, emailCard, emailButton } from "../email-templates";

export interface StockAlert {
  productId: number;
  productName: string;
  currentStock: number;
  minimumThreshold: number;
  wholesalerId: string;
  wholesalerName: string;
  wholesalerEmail?: string;
  wholesalerPhone?: string;
  suggestedReorderQuantity: number;
}

export class StockAlertService {
  private smsService: ReliableSMSService;

  constructor() {
    this.smsService = new ReliableSMSService();
  }

  /**
   * Check all products for low stock and send alerts to wholesalers
   */
  async checkAndSendLowStockAlerts(): Promise<void> {
    try {
      console.log('🔍 Checking for low stock products...');

      // Get all active products with stock below their minimum threshold (MOQ)
      const lowStockProducts = await db
        .select({
          id: products.id,
          name: products.name,
          stock: products.stock,
          palletStock: products.palletStock,
          moq: products.moq,
          wholesalerId: products.wholesalerId,
          price: products.price
        })
        .from(products)
        .where(and(
          eq(products.status, 'active'),
          // Consider both unit stock and MOQ for alerts
          lt(products.stock, products.moq)
        ));

      if (lowStockProducts.length === 0) {
        console.log('✅ No low stock products found');
        return;
      }

      console.log(`⚠️ Found ${lowStockProducts.length} low stock products`);

      // Group products by wholesaler
      const alertsByWholesaler = new Map<string, StockAlert[]>();

      for (const product of lowStockProducts) {
        const wholesaler = await db
          .select()
          .from(users)
          .where(eq(users.id, product.wholesalerId))
          .limit(1);

        if (wholesaler.length === 0) continue;

        const wholesalerData = wholesaler[0];
        const suggestedReorderQuantity = Math.max(
          (product.moq || 10) * 3, // 3x MOQ as suggested reorder
          100 // Minimum suggestion of 100 units
        );

        const alert: StockAlert = {
          productId: product.id,
          productName: product.name,
          currentStock: product.stock || 0,
          minimumThreshold: product.moq || 10,
          wholesalerId: product.wholesalerId,
          wholesalerName: wholesalerData.businessName || `${wholesalerData.firstName} ${wholesalerData.lastName}`.trim(),
          wholesalerEmail: wholesalerData.email || undefined,
          wholesalerPhone: wholesalerData.phoneNumber || undefined,
          suggestedReorderQuantity
        };

        if (!alertsByWholesaler.has(product.wholesalerId)) {
          alertsByWholesaler.set(product.wholesalerId, []);
        }
        alertsByWholesaler.get(product.wholesalerId)!.push(alert);
      }

      // Send alerts to each wholesaler
      for (const entry of Array.from(alertsByWholesaler.entries())) {
        const [wholesalerId, alerts] = entry;
        await this.sendStockAlerts(alerts);
      }

      console.log(`📧 Stock alerts sent to ${alertsByWholesaler.size} wholesalers`);

    } catch (error) {
      console.error('❌ Error checking low stock:', error);
    }
  }

  /**
   * Send stock alerts to a wholesaler via multiple channels
   */
  private async sendStockAlerts(alerts: StockAlert[]): Promise<void> {
    if (alerts.length === 0) return;

    const wholesaler = alerts[0]; // All alerts are for the same wholesaler
    const productCount = alerts.length;

    // Generate alert messages
    const messages = this.generateAlertMessages(alerts);

    // Send via all available channels
    await Promise.allSettled([
      this.sendEmailAlert(wholesaler, messages.email),
      this.sendSMSAlert(wholesaler, alerts),
      this.sendWhatsAppAlert(wholesaler, messages.whatsapp)
    ]);

    console.log(`📢 Stock alerts sent to ${wholesaler.wholesalerName} for ${productCount} products`);
  }

  /**
   * Generate alert messages for different channels
   */
  private generateAlertMessages(alerts: StockAlert[]) {
    const wholesaler = alerts[0];
    const productCount = alerts.length;
    const totalSuggestedValue = alerts.reduce((sum, alert) => {
      // Estimate value by getting price from products (this is simplified)
      return sum + (alert.suggestedReorderQuantity * 10); // Rough estimate
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

    let body = `
      ${emailHeading('Stock Alert', { size: '22px', color: '#dc2626' })}
      <p style="margin: 0 0 20px 0;">We've detected ${alerts.length} products that need restocking to maintain optimal inventory levels.</p>
    `;

    if (urgentProducts.length > 0) {
      body += emailCard(`
        ${emailHeading('URGENT - Critical Stock Levels', { size: '16px', color: '#dc2626' })}
        <ul style="margin: 0; padding-left: 20px;">
          ${urgentProducts.map(product => `
            <li style="margin: 8px 0;">
              <strong>${product.productName}</strong> - Only ${product.currentStock} units left
              <br><small style="color: #6b7280;">Suggested reorder: ${product.suggestedReorderQuantity} units</small>
            </li>
          `).join('')}
        </ul>
      `, { borderColor: '#FECACA', bgColor: '#FEF2F2' });
    }

    if (lowProducts.length > 0) {
      body += emailCard(`
        ${emailHeading('Low Stock Products', { size: '16px', color: '#f59e0b' })}
        <ul style="margin: 0; padding-left: 20px;">
          ${lowProducts.map(product => `
            <li style="margin: 8px 0;">
              <strong>${product.productName}</strong> - ${product.currentStock} units (Min: ${product.minimumThreshold})
              <br><small style="color: #6b7280;">Suggested reorder: ${product.suggestedReorderQuantity} units</small>
            </li>
          `).join('')}
        </ul>
      `, { borderColor: '#FDE68A', bgColor: '#FFFBEB' });
    }

    body += emailCard(`
      ${emailHeading('Quick Actions', { size: '16px' })}
      <ul style="margin: 0; padding-left: 20px;">
        <li style="margin-bottom: 6px;">Log into your dashboard to place reorders immediately</li>
        <li style="margin-bottom: 6px;">Contact your suppliers to ensure timely delivery</li>
        <li>Consider adjusting minimum stock thresholds for better planning</li>
      </ul>
    `);

    body += emailButton('View Dashboard', 'https://quikpik.co/products');

    return wrapPlatformEmail(body, { preheader: `${alerts.length} products need restocking` });
  }

  /**
   * Send email alert
   */
  private async sendEmailAlert(wholesaler: StockAlert, emailContent: { subject: string; body: string }): Promise<void> {
    if (!wholesaler.wholesalerEmail) {
      console.log(`📧 No email address for ${wholesaler.wholesalerName} - skipping email alert`);
      return;
    }

    try {
      await sendEmail({
        to: wholesaler.wholesalerEmail,
        from: 'hello@quikpik.co',
        subject: emailContent.subject,
        text: emailContent.body.replace(/<[^>]*>/g, ''), // Strip HTML for text version
        html: emailContent.body
      });
      console.log(`📧 Email stock alert sent to ${wholesaler.wholesalerName}`);
    } catch (error) {
      console.error(`❌ Failed to send email stock alert to ${wholesaler.wholesalerName}:`, error);
    }
  }

  /**
   * Send SMS alert
   */
  private async sendSMSAlert(wholesaler: StockAlert, alerts: StockAlert[]): Promise<void> {
    if (!wholesaler.wholesalerPhone) {
      console.log(`📱 No phone number for ${wholesaler.wholesalerName} - skipping SMS alert`);
      return;
    }

    try {
      const result = await ReliableSMSService.sendStockAlertSMS(
        wholesaler.wholesalerPhone, 
        wholesaler.wholesalerName, 
        'low_stock', 
        alerts.length,
        wholesaler.wholesalerId
      );
      if (result.success) {
        console.log(`📱 SMS stock alert sent to ${wholesaler.wholesalerName}`);
      } else {
        console.error(`❌ Failed to send SMS stock alert to ${wholesaler.wholesalerName}: ${result.error}`);
      }
    } catch (error) {
      console.error(`❌ Failed to send SMS stock alert to ${wholesaler.wholesalerName}:`, error);
    }
  }

  /**
   * Send WhatsApp alert
   */
  private async sendWhatsAppAlert(wholesaler: StockAlert, message: string): Promise<void> {
    if (!wholesaler.wholesalerPhone) {
      console.log(`💬 No phone number for ${wholesaler.wholesalerName} - skipping WhatsApp alert`);
      return;
    }

    try {
      // Get wholesaler's WhatsApp credentials from the database
      const wholesalerUser = await db
        .select({
          whatsappAccessToken: users.whatsappAccessToken,
          whatsappBusinessPhoneId: users.whatsappBusinessPhoneId
        })
        .from(users)
        .where(eq(users.id, wholesaler.wholesalerId))
        .limit(1);

      if (wholesalerUser.length === 0 || !wholesalerUser[0].whatsappAccessToken || !wholesalerUser[0].whatsappBusinessPhoneId) {
        throw new Error('WhatsApp Business API credentials not configured');
      }

      await whatsAppBusinessService.sendMessage(wholesaler.wholesalerPhone, message, {
        accessToken: wholesalerUser[0].whatsappAccessToken,
        phoneNumberId: wholesalerUser[0].whatsappBusinessPhoneId
      });
      console.log(`💬 WhatsApp stock alert sent to ${wholesaler.wholesalerName}`);
    } catch (error) {
      console.error(`❌ Failed to send WhatsApp stock alert to ${wholesaler.wholesalerName}:`, error);
    }
  }
}

export const stockAlertService = new StockAlertService();