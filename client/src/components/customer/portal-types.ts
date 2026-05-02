import type { Product as ProductType, PromotionalOffer } from "@shared/schema";

export type ExtendedProduct = ProductType & {
  wholesaler?: {
    id: string;
    businessName?: string | null;
    logoUrl?: string | null;
  };
  palletMoq?: number | null;
  palletStock?: number | null;
  palletPrice?: string | null;
  unitsPerPallet?: number | null;
  palletWeight?: string | null;
  image?: string;
};

export type CartItem = {
  product: ExtendedProduct;
  quantity: number;
  sellingType: "units" | "pallets";
};

export interface Product {
  id: number;
  name: string;
  description?: string;
  price: string;
  moq: number;
  stock: number;
  category?: string;
  imageUrl?: string;
  status: string;
  priceVisible: boolean;
  promoPrice?: string;
  promoActive?: boolean;
  deliveryExcluded?: boolean;

  palletPrice?: string;
  palletMoq?: number;
  palletStock?: number;
  sellingFormat?: "units" | "pallets" | "both";
  lowStockThreshold?: number;

  packQuantity?: number;
  unitOfMeasure?: string;
  unitSize?: string;
  unitWeight?: string;
  totalPackageWeight?: string;
  palletWeight?: string | null;

  unit_weight?: string;
  total_package_weight?: string;

  promotionalOffers?: PromotionalOffer[];

  images?: string[];
  unitsPerPallet?: number | null;
  brand?: string | null;
  size?: string | null;

  customPrice?: string;
  standardPrice?: string;
  hasPriceList?: boolean;
  isExpiringSoon?: boolean;

  wholesaler: {
    id: string;
    businessName: string;
    businessPhone?: string;
    businessAddress?: string;
    profileImageUrl?: string;
    defaultCurrency?: string;
    pickupAddress?: string;
    pickupInstructions?: string;
  };
}

export interface WholesalerPortal {
  id: string;
  businessName: string;
  businessPhone?: string;
  businessAddress?: string;
  profileImageUrl?: string;
  defaultCurrency?: string;
  pickupAddress?: string;
  pickupInstructions?: string;
  deliveryFlatRate?: string;
  deliveryNote?: string;
  logoType?: string;
  logoUrl?: string;
  email?: string;
  phone?: string;
  currency?: string;
  allowPayLater?: boolean;
}

export interface AuthenticatedCustomer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  phoneNumber?: string;
  businessName?: string;
  firstName?: string;
  lastName?: string;
}

export interface CustomerOrderStats {
  totalOrders: number;
  totalSpent: number;
  lastOrderDate?: string;
}

export interface PromotionalPricing {
  originalPrice: number;
  effectivePrice: number;
  totalCost: number;
  totalDiscount: number;
  discountPercentage: number;
  appliedOffers: string[];
  freeItems: number;
  totalQuantity: number;
  promoType: string;
  promoLabel: string;
}

export interface QuantitySuggestion {
  quantity: number;
  label: string;
  savings?: string;
  discount?: string;
}

export interface CollectionAddress {
  id: number;
  name?: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  postalCode: string;
  postcode?: string;
  country?: string;
  label?: string;
  isDefault?: boolean;
}

export interface DeliveryAddressData {
  id?: number;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state?: string;
  postalCode: string;
  country?: string;
  label?: string;
  isDefault?: boolean;
}

export interface ShippingService {
  serviceName: string;
  price: number;
}

export interface CompletedOrder {
  orderNumber: string;
  cart: CartItem[];
  customerData: CustomerData;
  totalAmount: number;
  subtotal: number;
  customerTransactionFee: number;
  shippingCost: number;
  payLater?: boolean;
}

export interface CustomerData {
  name: string;
  email: string;
  phone: string;
  businessName?: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  notes: string;
  shippingOption: "pickup" | "delivery" | undefined;
  selectedDeliveryAddress?: DeliveryAddressData;
  selectedShippingService?: ShippingService;
  addressExplicitlyCleared?: boolean;
}

export interface StripeCheckoutFormProps {
  cart: CartItem[];
  customerData: CustomerData;
  wholesaler: WholesalerPortal;
  totalAmount: number;
  subtotal: number;
  customerTransactionFee: number;
  shippingCost: number;
  clientSecret: string;
  publishableKey?: string;
  onSuccess: (orderData: {
    orderNumber: string;
    cart: CartItem[];
    customerData: CustomerData;
    totalAmount: number;
    subtotal: number;
    customerTransactionFee: number;
    shippingCost: number;
  }) => void;
}
