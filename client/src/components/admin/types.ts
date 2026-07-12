export type SectionId = "overview" | "wholesalers" | "customers" | "orders" | "products" | "categories" | "financials" | "settings" | "plans" | "map" | "logs" | "prospects" | "templates";

export interface PlatformStats {
  activeWholesalers: number; totalWholesalers: number; suspendedWholesalers: number;
  wholesalersByPlan: { listing?: number; starter?: number; free?: number; standard: number; premium: number };
  totalOrders: number; completedOrders: number; cancelledOrders: number;
  ordersThisMonth: number; completedOrdersThisMonth: number; cancelledOrdersThisMonth: number;
  todayOrders: number; todayRevenue: number;
  totalGMV: number; totalCustomerFees: number; totalPlatformFees: number; totalGrossRevenue: number;
  newWholesalersThisMonth: number; subscriptionRevenueMRR: number;
  subscriptionBreakdown: { listing?: { count: number; mrr: number }; starter?: { count: number; mrr: number }; standard: { count: number; mrr: number }; premium: { count: number; mrr: number } };
  homepageFeaturedWholesalers: number;
}

export interface AlertsData {
  stuckOrders: Array<{ id: number; orderNumber: string; wholesalerName: string | null; createdAt: string }>;
  stuckOrdersCount: number;
  expiringBatches: Array<{ id: number; productId: number; expiryDate: string; batchCode: string | null; quantity: number | null }>;
  expiringBatchesCount: number;
  failedPayments: Array<{ id: number; userId: string; createdAt: string }>;
  failedPaymentsCount: number;
}

export interface WholesalerRow {
  id: string; email: string; firstName: string | null; lastName: string | null;
  businessName: string | null; phoneNumber: string | null;
  subscriptionTier: string | null; subscriptionStatus: string | null;
  currentPlan: string | null; stripeSubscriptionId: string | null;
  archived: boolean; createdAt: string;
  orderCount: number; cancelledCount: number; totalOrderCount: number; cancellationRate: number;
  totalGMV: number; gmvWithFees: number; gmvWithoutFees: number; totalFeesEarned: number; lastOrderAt: string | null;
  customFeePercentage: number | null;
  customerFeePercentage: number | null;
  customerFixedFee: number | null;
  isTestAccount?: boolean;
  isInactive?: boolean;
  lastLoginAt?: string | null;
  lastSeenAt?: string | null;
  lastRealUserActivityAt?: string | null;
  enableMultiProfile?: boolean;
  showOnHomepage?: boolean;
  legalBusinessName?: string | null;
  vatNumber?: string | null;
  companyRegistrationNumber?: string | null;
  isCustomPricing?: boolean;
  internalNote?: string | null;
  customPriceExpiresAt?: string | null;
  logoUrl?: string | null;
  customMonthlyPrice?: number | null;
  customAnnualPrice?: number | null;
  customPricePlanId?: string | null;
  customPricePlanIdAnnual?: string | null;
  customPricePlanIdMonthly?: string | null;
  isVerified?: boolean;
  verifiedAt?: string | null;
  verifiedBy?: string | null;
  verificationNotes?: string | null;
}

export interface RevenueTotals {
  totalCustomerFees: number; totalPlatformFees: number; totalGrossRevenue: number; totalGMV: number;
  totalStripeProcessingFees: number; totalGrossProfit: number; grossMarginPct: number;
  totalSubscriptionRevenue: number; subscriptionPaymentCount: number;
}

export interface RevenueOrder {
  id: number; orderNumber: string; wholesalerId: string; wholesalerName: string | null;
  customerName: string | null; subtotal: string; platformFee: string | null;
  customerTransactionFee: string | null; totalQuikpikIncome: number;
  stripeProcessingFee: number; stripeFeIsEstimated: boolean; grossProfit: number;
  status: string; paymentStatus: string | null; createdAt: string;
  refundedAt?: string | null; refundAmount?: string | null;
}

export interface RevenueData { orders: RevenueOrder[]; totals: RevenueTotals; subRevenueByWholesaler?: Record<string, number>; planMRRByWholesaler?: Record<string, number>; }

export interface PayoutStatusData {
  available: number; pending: number; currency: string;
  lastPayout: { amount: number; status: string; arrivalDate: string } | null;
  hasPeriodFilter: boolean;
  periodPayoutTotal: number;
  periodPayoutCount: number;
  periodPayouts: Array<{ amount: number; status: string; arrivalDate: string }>;
}

export interface StripeModeData { mode: 'live' | 'test'; liveConfigured: boolean; testConfigured: boolean; }

export interface CustomerRow {
  id: string; name: string; businessName: string | null; email: string | null;
  phoneNumber: string | null; postalCode: string | null; wholesalerName: string | null;
  subscriptionTier: string | null; isSuspicious: boolean | null; isTestAccount: boolean | null;
  orderCount: number | null; customerType: string | null; lastLoginAt: string | null;
}

export interface ProductRow {
  id: number; name: string; category: string | null; wholesalerName: string | null;
  wholesalerId: string; costPrice: number | null; sellingPrice: number | null;
  price: number | null; stock: number | null; palletStock: number | null;
  margin: number | null; stockAlert: boolean | null; status: string;
  hasMissingCost: boolean; hasLowMargin: boolean; hasZeroStock: boolean;
  quantityInPack: number | null; unitSize: string | null; unitOfMeasure: string | null;
}

export interface WholesalerRevenueSummary {
  name: string; tier: string; orders: number; gmv: number;
  buyerFees: number; merchantFees: number; total: number;
  stripeFees: number; grossProfit: number; subRevenue: number;
}

export interface WholesalerOrderRow {
  id: number; orderNumber: string; customerName: string | null; wholesalerName: string | null;
  subtotal: string; platformFee: string | null; status: string; createdAt: string;
  refundedAt: string | null; refundAmount: string | null; paymentStatus: string | null;
}

export interface AdminPlanRow {
  id: number; name: string; planId: string; monthlyPrice: string;
  billingInterval: string | null; version: number | null;
  isActive: boolean; sortOrder: number; subscriberCount: number; mrr: number;
  features: string[]; limits: Record<string, number>;
  stripeProductId: string | null; stripePriceId: string | null;
  createdAt: string;
}

export interface MapCustomer {
  id: string; name: string; businessName: string | null; phoneNumber: string | null;
  postalCode: string | null; customerType: string | null; latitude: number | null;
  longitude: number | null; geocodeStatus: string | null; wholesalerName: string; orderCount: number;
}

export interface AdminOrderItem {
  id: number; productName: string | null; quantity: string; unitPrice: string | null;
  total: string | null; sellingType: string | null;
  quantityInPack: string | null; unitSize: string | null; unitOfMeasure: string | null;
  appliedOfferLabel: string | null;
}

export interface ActivityEvent {
  timestamp: string; type: string; description: string; wholesalerName: string; actorName: string;
}

export interface ErrorEntry {
  id: string; errorType: string; message: string; severity: string;
  wholesalerName: string | null; timestamp: string; source: string;
}

export interface RefundResult { success: boolean; totalRefunded?: number; remaining?: number; error?: string; }

export interface SearchResult {
  type: "wholesaler" | "customer" | "order" | "product";
  id: string | number; label: string; sub: string; section: SectionId;
}

export interface RawSearchResponse {
  orders: Array<{ id: number; orderNumber: string | null; customerName: string | null; wholesalerName: string | null; status: string | null }>;
  customers: Array<{ id: string; name: string; phoneNumber: string | null; email: string | null; wholesalerName: string }>;
  products: Array<{ id: number; name: string | null; category: string | null; wholesalerName: string | null; status: string | null; price: number }>;
}

export interface SearchGroup {
  label: string;
  section: SectionId;
  icon: JSX.Element;
  items: SearchResult[];
}
