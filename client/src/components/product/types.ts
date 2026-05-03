export interface ProductBatch {
  id: number;
  status: string;
  quantity: number;
  expiryDate?: string | null;
  batchNumber?: string | null;
  costPrice?: number | string | null;
}

export interface StockMovement {
  id: number;
  quantity: number;
  movementType: string;
  reason?: string | null;
  createdAt: string;
  customerName?: string | null;
  businessProfileName?: string | null;
  orderNumber?: string | null;
  orderId?: number | null;
  stockBefore: number;
  stockAfter: number;
}

export interface BulkUploadRow {
  name: string;
  description: string;
  price: string;
  promoPrice: string;
  promoActive: boolean;
  currency: string;
  moq: string;
  stock: string;
  category: string;
  imageUrl: string;
  priceVisible: boolean;
  status: string;
  unit: string;
  unitFormat: string;
  sellingFormat: string;
  unitsPerPallet: string;
  palletPrice: string;
  palletMoq: string;
  palletStock: string;
  palletWeight: string;
  temperatureRequirement: string;
  contentCategory: string;
  specialHandling: { fragile: boolean; perishable: boolean; hazardous: boolean };
  deliveryOptions: { pickup: boolean; delivery: boolean };
}
