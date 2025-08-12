import { storage } from './storage';
import { parcel2goService, type OrderRequest, type OrderItem } from './parcel2go';

export interface ShippingAutomationConfig {
  enableAutoPayment: boolean;
  enableLabelGeneration: boolean;
  enableTrackingNotifications: boolean;
  enableCustomerNotifications: boolean;
}

export interface AutoPaymentResult {
  success: boolean;
  orderId?: string;
  hash?: string;
  trackingNumber?: string;
  error?: string;
  cost?: number;
}

export class ShippingAutomationService {
  private config: ShippingAutomationConfig;

  constructor(config: ShippingAutomationConfig = {
    enableAutoPayment: true,
    enableLabelGeneration: true,
    enableTrackingNotifications: true,
    enableCustomerNotifications: true
  }) {
    this.config = config;
  }

  /**
   * Automatically create and pay for shipping order using Parcel2Go prepay
   */
  async processShippingOrder(orderData: {
    orderId: number;
    orderNumber: string;
    wholesalerId: string;
    customerData: {
      name: string;
      email: string;
      phone: string;
      address: string;
      city: string;
      state: string;
      postalCode: string;
      country: string;
    };
    shippingInfo: {
      serviceId: string;
      serviceName: string;
      price: string;
    };
    items: Array<{
      productName: string;
      quantity: number;
      unitPrice: string;
      weight?: number;
      value?: number;
    }>;
    collectionAddress?: {
      address: string;
      city: string;
      postcode: string;
      country: string;
    };
  }): Promise<AutoPaymentResult> {
    
    if (!this.config.enableAutoPayment) {
      return { success: false, error: 'Automatic payment is disabled' };
    }

    try {
      console.log(`🚚 Starting automatic shipping order for ${orderData.orderNumber}`);

      // Get wholesaler's Parcel2Go credentials
      const wholesaler = await storage.getUser(orderData.wholesalerId);
      if (!wholesaler || !wholesaler.parcel2GoCredentials) {
        return { 
          success: false, 
          error: 'Wholesaler does not have Parcel2Go credentials configured' 
        };
      }

      // Set credentials for this request
      parcel2goService.setCredentials(wholesaler.parcel2GoCredentials);

      // Calculate total order value for insurance
      const totalValue = orderData.items.reduce((sum, item) => 
        sum + (parseFloat(item.unitPrice) * item.quantity), 0
      );

      // Use wholesaler's pickup address or default
      const collectionAddress = orderData.collectionAddress || {
        address: wholesaler.businessAddress || '123 Business St',
        city: 'London',
        postcode: 'SW1A 1AA',
        country: 'GBR'
      };

      // Create Parcel2Go order request
      const orderRequest: OrderRequest = {
        Items: orderData.items.map((item, index): OrderItem => ({
          Id: `item-${index}`,
          CollectionDate: new Date().toISOString(),
          Service: orderData.shippingInfo.serviceId,
          Parcels: [{
            EstimatedValue: parseFloat(item.unitPrice) * item.quantity,
            Weight: item.weight || 1.0, // Default 1kg per item
            Length: 30, // Default dimensions in cm
            Width: 20,
            Height: 10,
            ContentsSummary: item.productName,
            DeliveryAddress: {
              contactName: orderData.customerData.name,
              property: '',
              street: orderData.customerData.address,
              town: orderData.customerData.city,
              postcode: orderData.customerData.postalCode,
              countryIsoCode: 'GBR' // Default to UK
            }
          }],
          CollectionAddress: {
            contactName: `${wholesaler.firstName} ${wholesaler.lastName}`,
            property: '',
            street: collectionAddress.address,
            town: collectionAddress.city,
            postcode: collectionAddress.postcode,
            countryIsoCode: collectionAddress.country
          }
        })),
        CustomerDetails: {
          Email: wholesaler.email || 'noreply@example.com',
          Forename: wholesaler.firstName || 'Business',
          Surname: wholesaler.lastName || 'Owner'
        }
      };

      console.log(`📦 Creating Parcel2Go order for service ${orderData.shippingInfo.serviceId}`);

      // Create the shipping order
      const orderResponse = await parcel2goService.createOrder(orderRequest);
      
      if (!orderResponse.OrderId || !orderResponse.Hash) {
        return {
          success: false,
          error: `Failed to create shipping order: Unknown error`
        };
      }

      console.log(`✅ Parcel2Go order created: ${orderResponse.OrderId}`);

      // Automatically pay using prepay method
      try {
        const paymentResponse = await parcel2goService.payWithPrePay(
          orderResponse.OrderId, 
          orderResponse.Hash
        );

        console.log(`💳 Payment processed for shipping order ${orderResponse.OrderId}`);

        // Update order in database with shipping details
        await storage.updateOrderShippingInfo(orderData.orderId, {
          shippingOrderId: orderResponse.OrderId,
          shippingHash: orderResponse.Hash,
          shippingStatus: 'paid',
          deliveryCarrier: orderData.shippingInfo.serviceName,
          deliveryServiceId: orderData.shippingInfo.serviceId,
          shippingTotal: parseFloat(orderData.shippingInfo.price)
        });

        return {
          success: true,
          orderId: orderResponse.OrderId,
          hash: orderResponse.Hash,
          cost: parseFloat(orderData.shippingInfo.price)
        };

      } catch (paymentError: any) {
        console.error(`❌ Payment failed for shipping order ${orderResponse.OrderId}:`, paymentError);
        
        // Update order status to show payment failed
        await storage.updateOrderShippingInfo(orderData.orderId, {
          shippingOrderId: orderResponse.OrderId,
          shippingHash: orderResponse.Hash,
          shippingStatus: 'payment_failed',
          deliveryCarrier: orderData.shippingInfo.serviceName,
          deliveryServiceId: orderData.shippingInfo.serviceId,
          shippingTotal: parseFloat(orderData.shippingInfo.price)
        });

        return {
          success: false,
          error: `Payment failed: ${paymentError.message}`,
          orderId: orderResponse.OrderId,
          hash: orderResponse.Hash
        };
      }

    } catch (error: any) {
      console.error(`❌ Shipping automation failed for order ${orderData.orderNumber}:`, error);
      return {
        success: false,
        error: error.message || 'Unknown shipping automation error'
      };
    }
  }

  /**
   * Generate shipping labels for an order
   */
  async generateLabels(orderId: string, hash: string, format: 'pdf' | 'png' = 'pdf') {
    if (!this.config.enableLabelGeneration) {
      return { success: false, error: 'Label generation is disabled' };
    }

    try {
      const labels = await parcel2goService.getLabels(orderId, hash, format);
      return { success: true, labels };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Track a shipping order
   */
  async trackShippingOrder(orderLineId: string) {
    try {
      const tracking = await parcel2goService.trackOrder(orderLineId);
      return { success: true, tracking };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get detailed shipping order information
   */
  async getShippingOrderDetails(orderId: string, hash: string) {
    try {
      const details = await parcel2goService.getOrderDetails(orderId, hash);
      return { success: true, details };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }
}