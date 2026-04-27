import { Product as ProductType } from "@shared/schema";

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

  promotionalOffers?: any[];

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
  selectedDeliveryAddress?: any;
  selectedShippingService?: any;
}

export interface StripeCheckoutFormProps {
  cart: CartItem[];
  customerData: CustomerData;
  wholesaler: any;
  totalAmount: number;
  subtotal: number;
  transactionFee: number;
  shippingCost: number;
  clientSecret: string;
  publishableKey?: string;
  onSuccess: (orderData: {
    orderNumber: string;
    cart: CartItem[];
    customerData: any;
    totalAmount: number;
    subtotal: number;
    transactionFee: number;
    shippingCost: number;
  }) => void;
}
