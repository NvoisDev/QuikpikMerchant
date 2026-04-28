import { storage } from "../storage";
import { whatsAppBusinessService } from "../whatsapp-simple";
import { sendEmail } from "../sendgrid-service";
import { formatPhoneToInternational } from "../../shared/phone-utils";
import { wrapCustomerEmail, emailHeading, emailCard, emailBadge, emailTable, getEmailLogoUrl, formatPackDescriptor } from "../email-templates";

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
  constructor() {
    // Service instances initialized as needed
  }

  /**
   * Send order status update notification to customer via multiple channels
   */
  async sendOrderStatusUpdate(notification: OrderStatusNotification): Promise<void> {
    const statusMessages = this.getStatusMessages(notification);
    
    // Send notifications via all available channels
    await Promise.allSettled([
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

      case 'items_prepared':
        messages.sms = `Order ${orderNumber} items prepared! ${wholesalerName} has finished picking your items and they're ready for the next step.`;
        messages.whatsapp = `✅ *Items Prepared*\n\nOrder: ${orderNumber}\nWholesaler: ${wholesalerName}\n\nYour items have been carefully prepared and are ready for dispatch or collection.`;
        messages.email = {
          subject: `Order ${orderNumber} Items Prepared`,
          body: `Great news! Your order ${orderNumber} items have been prepared by ${wholesalerName}. Your items are now ready for the next step in the fulfillment process.`
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
   * Send WhatsApp notification
   */
  private async sendWhatsAppNotification(notification: OrderStatusNotification, message: string): Promise<void> {
    try {
      // Get the order to find the wholesaler ID
      const order = await storage.getOrder(notification.orderId);
      if (!order) {
        console.log(`📱 Order ${notification.orderId} not found - skipping WhatsApp notification`);
        return;
      }

      // Get wholesaler WhatsApp credentials
      const wholesaler = await storage.getUser(order.wholesalerId);
      if (!wholesaler || !(wholesaler as any).whatsappEnabled || !(wholesaler as any).whatsappAccessToken) {
        console.log(`📱 WhatsApp not configured for wholesaler - skipping WhatsApp notification`);
        return;
      }

      const formattedPhone = formatPhoneToInternational(notification.customerPhone);
      await whatsAppBusinessService.sendMessage(formattedPhone, message, {
        accessToken: (wholesaler as any).whatsappAccessToken,
        phoneNumberId: (wholesaler as any).whatsappBusinessPhoneId
      });
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
      const statusColor = this.getStatusColor(notification.status);
      const statusLabel = notification.status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

      const order = await storage.getOrder(notification.orderId);
      const wholesaler = order ? await storage.getUser(order.wholesalerId) : null;
      const businessName = wholesaler?.businessName || notification.wholesalerName;

      let itemsSection = '';
      if (order) {
        try {
          const orderItems = await storage.getOrderItems(order.id);
          if (orderItems.length > 0) {
            const itemRows = await Promise.all(orderItems.map(async (oi) => {
              const product = await storage.getProduct(oi.productId);
              const descriptor = formatPackDescriptor(product?.quantityInPack, product?.unitSize, product?.unitOfMeasure);
              const name = (product?.name || `Product #${oi.productId}`) + (descriptor ? ` (${descriptor})` : '');
              return [name, String(oi.quantity)];
            }));
            itemsSection = emailTable(['Item', 'Qty'], itemRows);
          }
        } catch (itemErr) {
          console.error(`⚠️ Could not fetch order items for status email (order ${notification.orderId}):`, itemErr);
        }
      }

      const emailBody = `${emailHeading('Order Update', { size: '22px', color: '#10b981' })}<p style="margin:0 0 20px">Hi ${notification.customerName},</p>${emailCard(`<p style="margin:0 0 8px"><strong>Order:</strong> ${notification.orderNumber}</p><p style="margin:0 0 8px"><strong>Status:</strong> ${emailBadge(statusLabel, statusColor)}</p><p style="margin:0">${emailContent.body}</p>${notification.trackingNumber ? `<p style="margin:8px 0 0"><strong>Tracking:</strong> ${notification.trackingNumber}</p>` : ''}${notification.estimatedDelivery ? `<p style="margin:8px 0 0"><strong>Estimated Delivery:</strong> ${notification.estimatedDelivery}</p>` : ''}`)}${itemsSection}`;

      await sendEmail({
        to: notification.customerEmail,
        from: 'hello@quikpik.co',
        subject: emailContent.subject,
        html: wrapCustomerEmail(emailBody, { businessName, logoUrl: getEmailLogoUrl(wholesaler?.id, wholesaler?.logoType, wholesaler?.logoUrl) }, { preheader: emailContent.body })
      });
      console.log(`📧 Email notification sent for order ${notification.orderNumber}`);
    } catch (error) {
      console.error(`❌ Failed to send email for order ${notification.orderNumber}:`, error);
    }
  }

  private getStatusColor(status: string): string {
    const colors: Record<string, string> = {
      confirmed: '#10b981',
      processing: '#3b82f6',
      shipped: '#8b5cf6',
      delivered: '#22c55e',
      items_prepared: '#f59e0b',
      ready_for_pickup: '#06b6d4',
    };
    return colors[status] || '#6b7280';
  }
}

export const orderNotificationService = new OrderNotificationService();