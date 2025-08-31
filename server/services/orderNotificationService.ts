import { storage } from "../storage";
import { whatsAppBusinessService } from "../whatsapp-simple";
import { ReliableSMSService } from "../sms-service";
import { sendEmail } from "../sendgrid-service";
import { formatPhoneToInternational } from "../../shared/phone-utils";

export interface OrderStatusNotification {
  orderId: number;
  orderNumber: string;
  status: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  wholesalerName: string;
  trackingNumber?: string;
  estimatedDelivery?: string;
}

export class OrderNotificationService {
  private smsService: ReliableSMSService;

  constructor() {
    this.smsService = new ReliableSMSService();
  }

  /**
   * Send order status update notification to customer via multiple channels
   */
  async sendOrderStatusUpdate(notification: OrderStatusNotification): Promise<void> {
    const statusMessages = this.getStatusMessages(notification);
    
    // Send notifications via all available channels
    await Promise.allSettled([
      this.sendSMSNotification(notification, statusMessages.sms),
      this.sendWhatsAppNotification(notification, statusMessages.whatsapp),
      this.sendEmailNotification(notification, statusMessages.email)
    ]);
  }

  /**
   * Generate status-specific messages for different channels
   */
  private getStatusMessages(notification: OrderStatusNotification) {
    const { status, orderNumber, wholesalerName, trackingNumber, estimatedDelivery } = notification;

    const messages = {
      sms: '',
      whatsapp: '',
      email: { subject: '', body: '' }
    };

    switch (status) {
      case 'confirmed':
        messages.sms = `Order ${orderNumber} confirmed! ${wholesalerName} is preparing your order. You'll receive updates as it progresses.`;
        messages.whatsapp = `✅ *Order Confirmed*\n\nOrder: ${orderNumber}\nWholesaler: ${wholesalerName}\n\nYour order is being prepared and you'll receive regular updates.`;
        messages.email = {
          subject: `Order ${orderNumber} Confirmed`,
          body: `Your order ${orderNumber} from ${wholesalerName} has been confirmed and is being prepared.`
        };
        break;

      case 'processing':
        messages.sms = `Order ${orderNumber} is now being processed by ${wholesalerName}. Your items are being picked and packed.`;
        messages.whatsapp = `📦 *Order Processing*\n\nOrder: ${orderNumber}\nWholesaler: ${wholesalerName}\n\nYour items are being carefully picked and packed.`;
        messages.email = {
          subject: `Order ${orderNumber} Processing`,
          body: `Your order ${orderNumber} is now being processed. Items are being picked and packed for shipment.`
        };
        break;

      case 'shipped':
        const trackingInfo = trackingNumber ? `\nTracking: ${trackingNumber}` : '';
        const deliveryInfo = estimatedDelivery ? `\nEstimated delivery: ${estimatedDelivery}` : '';
        
        messages.sms = `Order ${orderNumber} has shipped!${trackingInfo}${deliveryInfo}`;
        messages.whatsapp = `🚚 *Order Shipped*\n\nOrder: ${orderNumber}${trackingInfo}${deliveryInfo}\n\nYour order is on its way!`;
        messages.email = {
          subject: `Order ${orderNumber} Shipped`,
          body: `Great news! Your order ${orderNumber} has been shipped.${trackingInfo}${deliveryInfo}`
        };
        break;

      case 'delivered':
        messages.sms = `Order ${orderNumber} delivered! We hope you're happy with your purchase from ${wholesalerName}.`;
        messages.whatsapp = `✅ *Order Delivered*\n\nOrder: ${orderNumber}\nWholesaler: ${wholesalerName}\n\nYour order has been delivered! We hope you're satisfied with your purchase.`;
        messages.email = {
          subject: `Order ${orderNumber} Delivered`,
          body: `Your order ${orderNumber} from ${wholesalerName} has been delivered successfully.`
        };
        break;

      case 'ready_for_pickup':
        messages.sms = `Order ${orderNumber} is ready for pickup at ${wholesalerName}. Please collect at your convenience.`;
        messages.whatsapp = `📍 *Ready for Pickup*\n\nOrder: ${orderNumber}\nWholesaler: ${wholesalerName}\n\nYour order is ready for collection.`;
        messages.email = {
          subject: `Order ${orderNumber} Ready for Pickup`,
          body: `Your order ${orderNumber} is ready for pickup from ${wholesalerName}.`
        };
        break;

      default:
        messages.sms = `Update on order ${orderNumber}: Status changed to ${status}`;
        messages.whatsapp = `📋 *Order Update*\n\nOrder: ${orderNumber}\nStatus: ${status}`;
        messages.email = {
          subject: `Order ${orderNumber} Update`,
          body: `Your order ${orderNumber} status has been updated to: ${status}`
        };
    }

    return messages;
  }

  /**
   * Send SMS notification
   */
  private async sendSMSNotification(notification: OrderStatusNotification, message: string): Promise<void> {
    try {
      const formattedPhone = formatPhoneToInternational(notification.customerPhone);
      await this.smsService.sendSMS(formattedPhone, message);
      console.log(`📱 SMS notification sent for order ${notification.orderNumber}`);
    } catch (error) {
      console.error(`❌ Failed to send SMS for order ${notification.orderNumber}:`, error);
    }
  }

  /**
   * Send WhatsApp notification
   */
  private async sendWhatsAppNotification(notification: OrderStatusNotification, message: string): Promise<void> {
    try {
      const formattedPhone = formatPhoneToInternational(notification.customerPhone);
      await whatsAppBusinessService.sendMessage(formattedPhone, message);
      console.log(`💬 WhatsApp notification sent for order ${notification.orderNumber}`);
    } catch (error) {
      console.error(`❌ Failed to send WhatsApp for order ${notification.orderNumber}:`, error);
    }
  }

  /**
   * Send email notification
   */
  private async sendEmailNotification(notification: OrderStatusNotification, emailContent: { subject: string; body: string }): Promise<void> {
    if (!notification.customerEmail) {
      console.log(`📧 No email address for order ${notification.orderNumber} - skipping email notification`);
      return;
    }

    try {
      await sendEmail({
        to: notification.customerEmail,
        from: 'hello@quikpik.co',
        subject: emailContent.subject,
        text: emailContent.body,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #22c55e;">Order Update</h2>
            <p>${emailContent.body}</p>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">
            <p style="color: #6b7280; font-size: 12px;">
              This is an automated message from Quikpik. Please do not reply to this email.
            </p>
          </div>
        `
      });
      console.log(`📧 Email notification sent for order ${notification.orderNumber}`);
    } catch (error) {
      console.error(`❌ Failed to send email for order ${notification.orderNumber}:`, error);
    }
  }
}

export const orderNotificationService = new OrderNotificationService();