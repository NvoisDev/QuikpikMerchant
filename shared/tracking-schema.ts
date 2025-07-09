// Additional tracking events and status types for shipping dashboard
export interface TrackingEvent {
  id: string;
  timestamp: string;
  status: string;
  location: string;
  description: string;
  carrier?: string;
}

export interface ShippingStatus {
  orderId: number;
  trackingNumber?: string;
  carrier: string;
  status: 'pending' | 'collected' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'exception' | 'returned';
  estimatedDelivery?: string;
  events: TrackingEvent[];
  lastUpdated: string;
}

export const SHIPPING_STATUS_LABELS = {
  pending: 'Pending Collection',
  collected: 'Collected',
  in_transit: 'In Transit',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
  exception: 'Exception',
  returned: 'Returned'
} as const;

export const SHIPPING_STATUS_COLORS = {
  pending: 'text-yellow-600 bg-yellow-50',
  collected: 'text-blue-600 bg-blue-50',
  in_transit: 'text-purple-600 bg-purple-50',
  out_for_delivery: 'text-orange-600 bg-orange-50',
  delivered: 'text-green-600 bg-green-50',
  exception: 'text-red-600 bg-red-50',
  returned: 'text-gray-600 bg-gray-50'
} as const;