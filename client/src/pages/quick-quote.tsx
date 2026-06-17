import { useState, useEffect, useRef, useMemo } from "react";
import { PickingMode } from "@/components/orders/PickingMode";
import { useSidebarContext } from "@/contexts/sidebar-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency, formatWeight } from "@/lib/currencies";
import { getPackQuantity } from "@shared/utils/product";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  Plus, 
  Trash2, 
  Send, 
  ShoppingCart, 
  User, 
  Package, 
  Percent,
  MessageSquare,
  Mail,
  Phone,
  Link as LinkIcon,
  Copy,
  Check,
  ArrowLeft,
  UserPlus,
  Truck,
  MapPin,
  Search,
  Building2,
  Share2,
  Loader2,
  Pencil,
  Clock,
  X,
  ChevronDown,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { DialogDescription } from "@/components/ui/dialog";
import { QuoteItemCard } from "@/components/orders/QuoteItemCard";

interface QuoteItem {
  stableId: string;
  productId: number;
  productName: string;
  originalPrice: number;
  customPrice: number;
  quantity: number;
  sellingType: 'units' | 'pallets';
  unitsPerPallet?: number;
  promotionalOffers?: any[];
  costPrice: number;
  weightKg: number;
  packQuantity?: number;
  unitSize?: string;
  unitOfMeasure?: string;
  stockCount?: number;
  quantityInPack?: number;
  displayUnit?: 'units' | 'packs';
  sellingFormat?: string;
  palletPrice?: number;
  unitPrice?: number;
  palletMoq?: number;
  unitStockCount?: number;
  palletStockCount?: number;
}

interface Customer {
  id: string;
  firstName: string;
  lastName: string;
  businessName?: string;
  email?: string;
  phoneNumber?: string;
}

interface DeliveryAddress {
  id: number;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  postalCode: string;
  country?: string;
  label?: string;
}

interface Product {
  id: number;
  name: string;
  price: string;
  stock: number;
  imageUrl?: string;
  palletPrice?: string;
  palletStock?: number;
  unitsPerPallet?: number;
  costPrice?: string | null;
  unitWeight?: string | null;
  palletWeight?: string | null;
  totalPackageWeight?: string | null;
  packQuantity?: number | null;
  quantityInPack?: number;
  sizePerUnit?: string | null;
  unitSize?: string | null;
  unitOfMeasure?: string | null;
  promotionalOffers?: any[];
  totalBatchStock?: number | null;
  nearestExpiry?: string | null;
  batchCount?: number;
  sellingFormat?: string;
  palletMoq?: number;
}

interface CollectionAddress {
  id: number;
  wholesalerId: string;
  name: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  postcode: string;
  country: string;
  isDefault: boolean;
  isActive: boolean;
}

function buildInvoiceMessage({
  customerName,
  businessName,
  orderRef,
  total,
  itemLines,
  fulfillmentLine,
  paymentLink,
  signOff,
  paymentMethod,
  balanceDueDays,
  depositPercentage,
  bankDetails,
}: {
  customerName: string;
  businessName: string;
  orderRef: string;
  total: string;
  itemLines: string;
  fulfillmentLine: string;
  paymentLink: string;
  signOff?: string | null;
  paymentMethod?: string | null;
  balanceDueDays?: number | null;
  depositPercentage?: number | null;
  bankDetails?: {
    bankName?: string | null;
    accountName?: string | null;
    accountNumber?: string | null;
    sortCode?: string | null;
    iban?: string | null;
    swift?: string | null;
  } | null;
}): string {
  const closingLine = signOff && signOff.trim()
    ? signOff.trim()
    : `Thank you for your order! 🙏\n${businessName}`;

  let paymentSection: string;

  if (depositPercentage === 0) {
    paymentSection = `📝 Your order has been noted. We'll be in touch about payment.`;
  } else if (paymentMethod === 'bank_transfer') {
    const dueText = !balanceDueDays || balanceDueDays === 0 ? 'now' : `within ${balanceDueDays} days`;
    const bankLines: string[] = [];
    if (bankDetails?.bankName) bankLines.push(`Bank: ${bankDetails.bankName}`);
    if (bankDetails?.accountName) bankLines.push(`Account Name: ${bankDetails.accountName}`);
    if (bankDetails?.accountNumber) bankLines.push(`Account No: ${bankDetails.accountNumber}`);
    if (bankDetails?.sortCode) bankLines.push(`Sort Code: ${bankDetails.sortCode}`);
    if (bankDetails?.iban) bankLines.push(`IBAN: ${bankDetails.iban}`);
    if (bankDetails?.swift) bankLines.push(`SWIFT/BIC: ${bankDetails.swift}`);
    paymentSection = `💳 Balance due: ${total}\n🏦 Please pay by bank transfer ${dueText}.` +
      (bankLines.length > 0 ? `\n\n🏦 Bank Details:\n${bankLines.join('\n')}` : '');
  } else if (paymentMethod === 'cash' || paymentMethod === 'cheque') {
    const dueText = !balanceDueDays || balanceDueDays === 0 ? 'now' : `within ${balanceDueDays} days`;
    paymentSection = `💳 Balance due: ${total}\nPlease pay by ${paymentMethod} ${dueText}.`;
  } else {
    const dueText = balanceDueDays && balanceDueDays > 0
      ? `\n⏰ Payment due within ${balanceDueDays} days.`
      : `\n⏰ Payment due now.`;
    paymentSection = `💳 Balance due: ${total}${dueText}\nPay here → ${paymentLink}`;
  }

  return (
    `Hi ${customerName} 👋\n\n` +
    `Here's your invoice from ${businessName}.\n\n` +
    `📋 Invoice: ${orderRef}\n` +
    `${itemLines}\n` +
    `💰 Total: ${total}\n` +
    `📦 ${fulfillmentLine}\n\n` +
    `${paymentSection}\n\n` +
    closingLine
  );
}

export default function QuickQuote() {
  const { user } = useAuth();
  const { isDesktopCollapsed } = useSidebarContext();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [quoteItems, setQuoteItems] = useState<QuoteItem[]>([]);
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [pickerPriceListId, setPickerPriceListId] = useState<number | null>(null);
  const [addCustomerDialogOpen, setAddCustomerDialogOpen] = useState(false);
  const [sendMethod, setSendMethod] = useState<'share' | 'link'>('share');
  const [sendSmsNotification, setSendSmsNotification] = useState(true);
  const [copiedLink, setCopiedLink] = useState(false);
  const [savedDraft, setSavedDraft] = useState<any>(null);
  const [createdQuote, setCreatedQuote] = useState<{
    id: number;
    orderNumber: string;
    paymentLink: string;
  } | null>(null);
  const [savedDraftResult, setSavedDraftResult] = useState<{
    id: number;
    customerName: string;
    isUpdate: boolean;
  } | null>(null);
  const [showPickingMode, setShowPickingMode] = useState(false);
  const [isSharingInvoice, setIsSharingInvoice] = useState(false);
  const [sharePreviewMessage, setSharePreviewMessage] = useState('');
  const [defaultShareMessage, setDefaultShareMessage] = useState('');
  const [showMessagePreview, setShowMessagePreview] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    firstName: '',
    lastName: '',
    phoneNumber: '',
    email: '',
    businessName: '',
    streetAddress: '',
    addressLine2: '',
    city: '',
    postalCode: '',
    country: '',
  });
  const [depositPercentage, setDepositPercentage] = useState<0 | 25 | 50 | 75 | 100>(100);
  const [balanceDueDays, setBalanceDueDays] = useState<0 | 7 | 14 | 30 | 60>(0);
  const [quotePaymentMethod, setQuotePaymentMethod] = useState<'payment_link' | 'cash' | 'bank_transfer' | 'cheque'>('bank_transfer');
  const [fulfillmentType, setFulfillmentType] = useState<'delivery' | 'pickup'>('pickup');
  const [collectionAddressId, setCollectionAddressId] = useState<number | null>(null);
  const [deliveryCharge, setDeliveryCharge] = useState<string>('');
  const [deliveryAddressId, setDeliveryAddressId] = useState<number | null>(null);
  const [deliveryAddressText, setDeliveryAddressText] = useState('');
  const [useCustomAddress, setUseCustomAddress] = useState(false);
  const [customAddressFields, setCustomAddressFields] = useState({
    addressLine1: '',
    city: '',
    postalCode: '',
    state: '',
    label: '',
  });
  const [inputValues, setInputValues] = useState<Record<string, { price: string; qty: string }>>({});
  const [costValues, setCostValues] = useState<Record<string, string>>({});
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null);
  const [editNameOpen, setEditNameOpen] = useState(false);
  const [summaryExpanded, setSummaryExpanded] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1024);
  const [deliveryExpanded, setDeliveryExpanded] = useState(false);
  const [paymentSetupExpanded, setPaymentSetupExpanded] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1024);
  const [balanceDueExpanded, setBalanceDueExpanded] = useState(false);
  const [editNameForm, setEditNameForm] = useState({ firstName: '', lastName: '', businessName: '' });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ['/api/customers'],
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['/api/products'],
  });

  const { data: customerAddresses = [] } = useQuery<DeliveryAddress[]>({
    queryKey: [`/api/wholesaler/customers/${selectedCustomer?.id}/addresses`],
    enabled: !!selectedCustomer && fulfillmentType === 'delivery',
  });

  const { data: businessProfiles = [] } = useQuery<{ id: number; name: string; logoUrl: string | null; address: string | null; isDefault: boolean }[]>({
    queryKey: ['/api/business-profiles'],
    enabled: !!user?.enableMultiProfile,
  });

  const { data: invoiceSignOffData } = useQuery<{ invoiceSignOff: string | null }>({
    queryKey: ['/api/business-profile/invoice-sign-off'],
  });

  const { data: bankDetailsData } = useQuery<{
    bankName: string | null;
    accountName: string | null;
    accountNumber: string | null;
    sortCode: string | null;
    iban: string | null;
    swift: string | null;
  }>({
    queryKey: ['/api/business-profile/bank-details'],
  });

  const { data: collectionAddresses = [] } = useQuery<CollectionAddress[]>({
    queryKey: ['/api/collection-addresses'],
  });
  const activeCollectionAddresses = collectionAddresses.filter((a: CollectionAddress) => a.isActive !== false);

  const { data: stripeConnectStatus } = useQuery<{ isConnected: boolean }>({
    queryKey: ['/api/stripe/connect/status'],
  });
  const stripeReady = stripeConnectStatus?.isConnected === true;

  // Draft editing support — reads ?draftId= from URL
  const editingDraftId = useMemo(() => {
    if (typeof window === 'undefined') return null;
    const id = new URLSearchParams(window.location.search).get('draftId');
    return id ? parseInt(id) : null;
  }, []);

  const { data: allDrafts = [] } = useQuery<any[]>({
    queryKey: ['/api/orders/drafts'],
    enabled: !!editingDraftId,
  });

  const { data: priceLists = [] } = useQuery<{ id: number; name: string; isActive: boolean; startDate: string | null; endDate: string | null }[]>({
    queryKey: ['/api/price-lists'],
    staleTime: 5 * 60 * 1000,
  });

  const { data: selectedPriceListData } = useQuery<{ id: number; items: { productId: number; customPrice: string | null; discountPercentage: string | null; customPalletPrice: string | null }[] }>({
    queryKey: [`/api/price-lists/${pickerPriceListId}`],
    enabled: !!pickerPriceListId,
    staleTime: 5 * 60 * 1000,
  });
  const draftForEdit = useMemo(
    () => (editingDraftId ? allDrafts.find((d: any) => d.id === editingDraftId) ?? null : null),
    [editingDraftId, allDrafts]
  );

  // Pre-fill form from draft when data is available
  useEffect(() => {
    if (!draftForEdit || !customers.length || !products.length) return;
    const customer = customers.find((c: any) => c.id === draftForEdit.retailerId);
    if (customer) setSelectedCustomer(customer as any);
    if (draftForEdit.fulfillmentType) setFulfillmentType(draftForEdit.fulfillmentType as any);
    if (draftForEdit.depositPercentage != null) setDepositPercentage(draftForEdit.depositPercentage as any);
    if (draftForEdit.balanceDueDays != null) setBalanceDueDays(draftForEdit.balanceDueDays as any);
    if (draftForEdit.paymentMethod) setQuotePaymentMethod(draftForEdit.paymentMethod as any);
    if (draftForEdit.collectionAddressId) setCollectionAddressId(draftForEdit.collectionAddressId);
    if (draftForEdit.deliveryCost && parseFloat(draftForEdit.deliveryCost) > 0) {
      setDeliveryCharge(String(parseFloat(draftForEdit.deliveryCost)));
    }
    if (draftForEdit.items && draftForEdit.items.length > 0) {
      const prefilled: QuoteItem[] = draftForEdit.items.map((item: any) => {
        const product = products.find((p: any) => p.id === item.productId);
        if (!product) return null;
        const price = parseFloat(item.unitPrice);
        const palletPriceNum = product.palletPrice ? parseFloat(product.palletPrice) : undefined;
        const sid = `${item.productId}-${item.sellingType || 'units'}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        return {
          stableId: sid,
          productId: item.productId,
          productName: product.name,
          originalPrice: price,
          customPrice: price,
          quantity: item.quantity,
          sellingType: (item.sellingType || 'units') as 'units' | 'pallets',
          unitsPerPallet: product.unitsPerPallet,
          promotionalOffers: product.promotionalOffers,
          costPrice: product.costPrice ? parseFloat(product.costPrice) : 0,
          weightKg: 0,
          packQuantity: product.packQuantity ?? undefined,
          unitSize: product.sizePerUnit ?? undefined,
          unitOfMeasure: product.unitOfMeasure ?? undefined,
          stockCount: product.stock ?? 0,
          quantityInPack: (product.quantityInPack ?? 1) > 1 ? product.quantityInPack : undefined,
          displayUnit: 'units',
          sellingFormat: product.sellingFormat,
          palletPrice: palletPriceNum,
          unitPrice: parseFloat(product.price),
          palletMoq: product.palletMoq,
          unitStockCount: product.stock ?? 0,
          palletStockCount: product.palletStock ?? 0,
        } as QuoteItem;
      }).filter(Boolean) as QuoteItem[];
      if (prefilled.length > 0) {
        setQuoteItems(prefilled);
        const restored: Record<string, { price: string; qty: string }> = {};
        prefilled.forEach(item => {
          restored[item.stableId] = { price: String(item.customPrice), qty: String(item.quantity) };
        });
        setInputValues(restored);
      }
    }
  }, [draftForEdit?.id, customers.length, products.length]);

  const paymentMethodInitialized = useRef(false);
  useEffect(() => {
    if (stripeConnectStatus === undefined) return;
    if (!paymentMethodInitialized.current) {
      // Set the correct default once, on first status load.
      // useRef prevents query refetches (window focus etc.) from
      // overriding the user's subsequent manual selection.
      paymentMethodInitialized.current = true;
      setQuotePaymentMethod(stripeReady ? 'payment_link' : 'bank_transfer');
    } else if (!stripeReady) {
      // Safety: clear payment_link selection if Stripe becomes inactive.
      setQuotePaymentMethod(prev => prev === 'payment_link' ? 'bank_transfer' : prev);
    }
  }, [stripeConnectStatus, stripeReady]);

  useEffect(() => {
    if (businessProfiles.length > 0 && selectedProfileId === null) {
      const def = businessProfiles.find(p => p.isDefault) || businessProfiles[0];
      setSelectedProfileId(def.id);
    }
  }, [businessProfiles]);

  useEffect(() => {
    if (customerAddresses.length > 0 && !useCustomAddress && !deliveryAddressId) {
      setDeliveryAddressId(customerAddresses[0].id);
    }
    if (customerAddresses.length === 0) {
      setUseCustomAddress(true);
      setDeliveryAddressId(null);
    }
  }, [customerAddresses]);

  useEffect(() => {
    setEditNameOpen(false);
  }, [selectedCustomer?.id]);

  // ── Draft auto-save ──────────────────────────────────────────────────────
  const draftKey = user?.id ? `quikpik_qq_draft_${user.id}` : null;

  useEffect(() => {
    if (!draftKey) return;
    if (!selectedCustomer && quoteItems.length === 0) return;
    const draft = {
      selectedCustomer, quoteItems, depositPercentage, balanceDueDays,
      quotePaymentMethod, fulfillmentType, collectionAddressId,
      deliveryCharge, deliveryAddressId, deliveryAddressText,
      useCustomAddress, customAddressFields, sendMethod,
      sendSmsNotification, selectedProfileId, savedAt: Date.now(),
    };
    localStorage.setItem(draftKey, JSON.stringify(draft));
  }, [selectedCustomer, quoteItems, depositPercentage, balanceDueDays,
    quotePaymentMethod, fulfillmentType, collectionAddressId,
    deliveryCharge, deliveryAddressId, deliveryAddressText,
    useCustomAddress, customAddressFields, sendMethod,
    sendSmsNotification, selectedProfileId, draftKey]);

  useEffect(() => {
    if (!draftKey) return;
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (draft.selectedCustomer || draft.quoteItems?.length > 0) {
        setSavedDraft(draft);
      }
    } catch {
      // ignore malformed data
    }
  }, [draftKey]);

  const resumeDraft = () => {
    if (!savedDraft) return;
    if (savedDraft.selectedCustomer) setSelectedCustomer(savedDraft.selectedCustomer);
    if (savedDraft.quoteItems?.length > 0) {
      const itemsWithIds = savedDraft.quoteItems.map((item: QuoteItem) => ({
        ...item,
        stableId: item.stableId || `${item.productId}-${item.sellingType}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      }));
      setQuoteItems(itemsWithIds);
      const restored: Record<string, { price: string; qty: string }> = {};
      itemsWithIds.forEach((item: QuoteItem) => {
        restored[item.stableId] = { price: String(item.customPrice), qty: String(item.quantity) };
      });
      setInputValues(restored);
    }
    if (savedDraft.depositPercentage !== undefined) setDepositPercentage(savedDraft.depositPercentage);
    if (savedDraft.balanceDueDays !== undefined) setBalanceDueDays(savedDraft.balanceDueDays);
    if (savedDraft.quotePaymentMethod) setQuotePaymentMethod(savedDraft.quotePaymentMethod);
    if (savedDraft.fulfillmentType) setFulfillmentType(savedDraft.fulfillmentType);
    if (savedDraft.collectionAddressId !== undefined) setCollectionAddressId(savedDraft.collectionAddressId);
    if (savedDraft.deliveryCharge !== undefined) setDeliveryCharge(savedDraft.deliveryCharge);
    if (savedDraft.deliveryAddressId !== undefined) setDeliveryAddressId(savedDraft.deliveryAddressId);
    if (savedDraft.deliveryAddressText) setDeliveryAddressText(savedDraft.deliveryAddressText);
    if (savedDraft.useCustomAddress !== undefined) setUseCustomAddress(savedDraft.useCustomAddress);
    if (savedDraft.customAddressFields) setCustomAddressFields(savedDraft.customAddressFields);
    if (savedDraft.sendMethod) setSendMethod(savedDraft.sendMethod);
    if (savedDraft.sendSmsNotification !== undefined) setSendSmsNotification(savedDraft.sendSmsNotification);
    if (savedDraft.selectedProfileId !== undefined) setSelectedProfileId(savedDraft.selectedProfileId);
    setSavedDraft(null);
    toast({ title: "Draft resumed", description: "Your saved invoice has been restored." });
  };

  useEffect(() => {
    if (savedDraft && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('resume') === '1') {
      resumeDraft();
    }
  }, [savedDraft]);

  const clearDraft = () => {
    if (draftKey) localStorage.removeItem(draftKey);
    setSavedDraft(null);
  };
  // ────────────────────────────────────────────────────────────────────────

  const addCustomerMutation = useMutation({
    mutationFn: async (data: typeof newCustomer) => {
      const response = await apiRequest('POST', '/api/customers', data);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
      setSelectedCustomer({
        id: data.id,
        firstName: data.firstName,
        lastName: data.lastName,
        businessName: data.businessName,
        email: data.email,
        phoneNumber: data.phoneNumber,
      });
      setAddCustomerDialogOpen(false);
      setNewCustomer({ firstName: '', lastName: '', phoneNumber: '', email: '', businessName: '', streetAddress: '', addressLine2: '', city: '', postalCode: '', country: '' });
      toast({
        title: "Customer Added",
        description: "New customer has been added and selected.",
      });
    },
    onError: (error: Error) => {
      const e = error as Error & { errorType?: string; available?: number; requested?: number; productName?: string };
      toast({
        title: e.errorType === "OUT_OF_STOCK" ? "Stock Unavailable" : "Error",
        description: e.errorType === "OUT_OF_STOCK" && e.available != null && e.requested != null
          ? `Only ${e.available} units of "${e.productName || "this product"}" are in stock — you requested ${e.requested}. Please reduce the quantity.`
          : (error.message || "Failed to add customer"),
        variant: "destructive",
      });
    },
  });

  const updateCustomerNameMutation = useMutation({
    mutationFn: async (data: { firstName: string; lastName: string; businessName: string }) => {
      if (!selectedCustomer) throw new Error('No customer selected');
      const response = await apiRequest('PATCH', `/api/customers/${selectedCustomer.id}`, data);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
      setSelectedCustomer(prev => prev ? {
        ...prev,
        firstName: data.firstName ?? prev.firstName,
        lastName: data.lastName ?? prev.lastName,
        businessName: data.businessName ?? prev.businessName,
      } : prev);
      setEditNameOpen(false);
      toast({
        title: "Customer Updated",
        description: "Customer name has been saved.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update customer name",
        variant: "destructive",
      });
    },
  });

  const saveAsDraftMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCustomer || quoteItems.length === 0) {
        throw new Error('Select a customer and add at least one item first');
      }
      const body = {
        customerId: selectedCustomer.id,
        items: quoteItems.map(item => ({
          productId: item.productId,
          quantity: item.quantity,
          customPrice: item.customPrice,
          sellingType: item.sellingType,
        })),
        fulfillmentType,
        deliveryCharge: parseFloat(deliveryCharge) || 0,
        ...(fulfillmentType === 'delivery' && deliveryAddressText ? { deliveryAddress: deliveryAddressText } : {}),
        paymentMethod: quotePaymentMethod,
        depositPercentage,
        balanceDueDays,
        ...(collectionAddressId ? { collectionAddressId } : {}),
        ...(selectedProfileId ? { businessProfileId: selectedProfileId } : {}),
      };
      if (editingDraftId) {
        const resp = await apiRequest('PATCH', `/api/orders/${editingDraftId}/draft`, body);
        return resp.json();
      } else {
        const resp = await apiRequest('POST', '/api/orders/draft', body);
        return resp.json();
      }
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/orders/drafts'] });
      const customerName = selectedCustomer?.businessName
        || [selectedCustomer?.firstName, selectedCustomer?.lastName].filter(Boolean).join(' ')
        || 'your customer';
      setSavedDraftResult({
        id: data.id ?? editingDraftId ?? 0,
        customerName,
        isUpdate: !!editingDraftId,
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Error saving draft', description: error.message, variant: 'destructive' });
    },
  });

  const createQuoteMutation = useMutation({
    mutationFn: async (data: {
      customerId: string;
      items: QuoteItem[];
      sendVia: 'link';
      sendSmsNotification: boolean;
      depositPercentage: 0 | 25 | 50 | 75 | 100;
      balanceDueDays: 0 | 7 | 14 | 30 | 60;
      fulfillmentType: 'delivery' | 'pickup';
      deliveryCharge?: number;
      deliveryAddressId?: number | null;
      deliveryAddress?: string;
      customAddressFields?: { addressLine1: string; city: string; postalCode: string; state: string; label: string };
      paymentMethod?: string;
      businessProfileId?: number | null;
    }) => {
      // When editing a draft, sync current state to the draft then approve it in-place.
      // This avoids the duplicate-order risk of creating a new order and then deleting the draft.
      if (editingDraftId) {
        const draftBody = {
          customerId: data.customerId,
          items: data.items.map(item => ({
            productId: item.productId,
            quantity: item.quantity,
            customPrice: item.customPrice,
            sellingType: item.sellingType,
          })),
          fulfillmentType: data.fulfillmentType,
          deliveryCharge: data.deliveryCharge ?? 0,
          ...(data.deliveryAddress ? { deliveryAddress: data.deliveryAddress } : {}),
          paymentMethod: data.paymentMethod,
          depositPercentage: data.depositPercentage,
          balanceDueDays: data.balanceDueDays,
          ...(data.businessProfileId ? { businessProfileId: data.businessProfileId } : {}),
        };
        const patchResp = await apiRequest('PATCH', `/api/orders/${editingDraftId}/draft`, draftBody);
        if (!patchResp.ok) {
          const err = await patchResp.json().catch(() => ({ error: 'Failed to update draft' }));
          throw new Error(err.error || 'Failed to update draft before approval');
        }
        const approveResp = await apiRequest('POST', `/api/orders/${editingDraftId}/approve`, {});
        if (!approveResp.ok) {
          const err = await approveResp.json().catch(() => ({ error: 'Failed to approve draft' }));
          type StockError = Error & { errorType?: string; productName?: string; available?: number; requested?: number };
          const thrownError = new Error(err.error || 'Failed to approve draft') as StockError;
          if (err.errorType) {
            thrownError.errorType = err.errorType;
            thrownError.productName = err.productName;
            thrownError.available = err.available;
            thrownError.requested = err.requested;
          }
          throw thrownError;
        }
        return approveResp.json();
      }

      const response = await apiRequest('POST', '/api/quotes', data);
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Failed to create invoice' }));
        type StockError = Error & { errorType?: string; productName?: string; available?: number; requested?: number };
        const thrownError = new Error(err.error || 'Failed to create invoice') as StockError;
        if (err.errorType) {
          thrownError.errorType = err.errorType;
          thrownError.productName = err.productName;
          thrownError.available = err.available;
          thrownError.requested = err.requested;
        }
        throw thrownError;
      }
      return response.json();
    },
    onSuccess: async (data) => {
      setCreatedQuote({
        id: data.orderId,
        orderNumber: data.orderNumber,
        paymentLink: data.paymentLink
      });
      if (draftKey) localStorage.removeItem(draftKey);
      queryClient.invalidateQueries({ queryKey: ['/api/orders/drafts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
      queryClient.invalidateQueries({ queryKey: ['/api/products'] });

      if (sendMethod === 'share' && data.paymentLink) {
        let shortPayLink = data.paymentLink;
        try {
          const shortenRes = await fetch('/api/shorten', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ url: data.paymentLink }),
          });
          if (shortenRes.ok) {
            const { shortUrl } = await shortenRes.json();
            if (shortUrl) shortPayLink = shortUrl;
          }
        } catch {}
        const builtMessage = buildInvoiceMessage({
          customerName: selectedCustomer?.firstName || selectedCustomer?.businessName || 'there',
          businessName: user?.businessName || 'Your Supplier',
          orderRef: data.orderNumber || `#${data.orderId}`,
          total: formatCurrency(calculateTotal()),
          itemLines: quoteItems.map(item => `🛍️ ${item.quantity}× ${item.productName}`).join('\n'),
          fulfillmentLine: fulfillmentType === 'delivery' ? 'Delivery' : 'Collection from your store',
          paymentLink: shortPayLink,
          signOff: invoiceSignOffData?.invoiceSignOff ?? null,
          paymentMethod: quotePaymentMethod,
          balanceDueDays,
          depositPercentage,
          bankDetails: bankDetailsData ?? null,
        });
        setDefaultShareMessage(builtMessage);
        const savedSuffix = user?.id ? localStorage.getItem(`quikpik_invoice_suffix_${user.id}`) : null;
        setSharePreviewMessage(savedSuffix ? builtMessage + savedSuffix : builtMessage);
        // message rendered inline on success screen — no Portal sheet needed
      } else {
        toast({
          title: "Invoice Created",
          description: "Payment link generated. Copy and share it with your customer.",
        });
      }
    },
    onError: (error: Error) => {
      const e = error as Error & { errorType?: string; available?: number; requested?: number; productName?: string };
      toast({
        title: e.errorType === "OUT_OF_STOCK" ? "Stock Unavailable" : "Error",
        description: e.errorType === "OUT_OF_STOCK" && e.available != null && e.requested != null
          ? `Only ${e.available} units of "${e.productName || "this product"}" are in stock — you requested ${e.requested}. Please reduce the quantity.`
          : (error.message || "Something went wrong, please try again"),
        variant: "destructive",
      });
    },
  });

  // Resolve price for a product from the selected price list, or fall back to standard price.
  const resolvePickerPrice = (product: Product, sellingType: 'units' | 'pallets'): { price: number; fromList: boolean } => {
    if (selectedPriceListData) {
      const item = selectedPriceListData.items?.find((i) => i.productId === product.id);
      if (item) {
        const base = parseFloat(product.price || '0');
        let unitPrice = base;
        if (item.customPrice) unitPrice = parseFloat(item.customPrice);
        else if (item.discountPercentage) unitPrice = Math.round(base * (1 - parseFloat(item.discountPercentage) / 100) * 100) / 100;

        if (sellingType === 'pallets') {
          const palletBase = product.palletPrice ? parseFloat(product.palletPrice) : 0;
          const palletPrice = item.customPalletPrice ? parseFloat(item.customPalletPrice) : palletBase;
          return { price: palletPrice, fromList: true };
        }
        return { price: unitPrice, fromList: true };
      }
    }
    const standard = sellingType === 'pallets'
      ? (product.palletPrice ? parseFloat(product.palletPrice) : 0)
      : parseFloat(product.price || '0');
    return { price: standard, fromList: false };
  };

  const addProduct = (product: Product, sellingType: 'units' | 'pallets' = 'units') => {
    const availableStock = sellingType === 'pallets' ? (product.palletStock || 0) : ((product.totalBatchStock ?? product.stock) || 0);
    if (availableStock <= 0) {
      toast({
        title: "Out of Stock",
        description: `"${product.name}" is out of stock and cannot be added to this invoice.`,
        variant: "destructive",
      });
      setProductDialogOpen(false);
      return;
    }

    const unitPriceNum = parseFloat(product.price);
    const palletPriceNum = product.palletPrice ? parseFloat(product.palletPrice) : undefined;
    const { price } = resolvePickerPrice(product, sellingType);

    const unitCost = product.costPrice ? parseFloat(product.costPrice) : 0;
    // For pallet lines, cost must be per-pallet (unit cost × units-per-pallet) so it matches the per-pallet selling price
    const baseCost = sellingType === 'pallets' && product.unitsPerPallet
      ? unitCost * product.unitsPerPallet
      : unitCost;
    const weightKg = sellingType === 'pallets'
      ? (product.palletWeight ? parseFloat(product.palletWeight) : 0)
      : (() => {
          // Prefer the stored total package weight — it's the pre-calculated weight for a whole pack.
          // Fall back to unitWeight × pack quantity for older products that don't have it set.
          const totalPkgWeight = parseFloat(product.totalPackageWeight ?? '0') || 0;
          if (totalPkgWeight > 0) return totalPkgWeight;
          const uw = parseFloat(product.unitWeight ?? '0') || 0;
          const pq = product.packQuantity || product.quantityInPack || 1;
          return uw * pq;
        })();

    // Check if already added with same product AND selling type — just increment qty
    const existingIndex = quoteItems.findIndex(
      item => item.productId === product.id && item.sellingType === sellingType
    );

    if (existingIndex >= 0) {
      const updated = [...quoteItems];
      const existing = updated[existingIndex];
      // In packs display mode each "add" should add a full pack worth of base units
      const increment = existing.displayUnit === 'packs'
        ? (existing.quantityInPack ?? 1)
        : 1;
      updated[existingIndex] = { ...existing, quantity: existing.quantity + increment };
      setQuoteItems(updated);
    } else {
      const newStableId = `${product.id}-${sellingType}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const initQty = sellingType === 'pallets' ? Math.max(1, product.palletMoq ?? 1) : 1;
      setQuoteItems(prev => [...prev, {
        stableId: newStableId,
        productId: product.id,
        productName: product.name + (sellingType === 'pallets' ? ' (Pallet)' : ''),
        originalPrice: price,
        customPrice: price,
        quantity: initQty,
        sellingType,
        unitsPerPallet: product.unitsPerPallet ?? undefined,
        promotionalOffers: product.promotionalOffers || [],
        costPrice: baseCost,
        weightKg,
        packQuantity: (getPackQuantity(product) ?? 0) > 1 ? (getPackQuantity(product) ?? undefined) : undefined,
        unitSize: (product.sizePerUnit || product.unitSize) ?? undefined,
        unitOfMeasure: product.unitOfMeasure ?? undefined,
        stockCount: availableStock,
        quantityInPack: (product.quantityInPack ?? 1) > 1 ? product.quantityInPack : undefined,
        displayUnit: 'units',
        sellingFormat: product.sellingFormat,
        palletPrice: palletPriceNum,
        unitPrice: unitPriceNum,
        palletMoq: product.palletMoq,
        unitStockCount: sellingType === 'units' ? availableStock : (product.stock ?? 0),
        palletStockCount: sellingType === 'pallets' ? availableStock : (product.palletStock ?? 0),
      } as QuoteItem]);
      setInputValues(prev => ({
        ...prev,
        [newStableId]: { price: price.toString(), qty: initQty.toString() }
      }));
      setCostValues(prev => ({
        ...prev,
        [newStableId]: baseCost.toString()
      }));
    }
    setProductDialogOpen(false);
  };

  const updateItemCost = (index: number, newCost: number) => {
    const updated = [...quoteItems];
    updated[index].costPrice = newCost;
    setQuoteItems(updated);
  };

  const updateItemPrice = (index: number, newPrice: number) => {
    const updated = [...quoteItems];
    updated[index].customPrice = newPrice;
    setQuoteItems(updated);
  };

  const updateItemQuantity = (index: number, quantity: number) => {
    if (quantity < 1) return;
    const updated = [...quoteItems];
    updated[index].quantity = quantity;
    setQuoteItems(updated);
  };

  const removeItem = (index: number) => {
    setQuoteItems(quoteItems.filter((_, i) => i !== index));
  };

  const switchItemMode = (index: number, mode: 'units' | 'packs' | 'pallets') => {
    const item = quoteItems[index];
    const qip = item.quantityInPack ?? 1;
    const sk = item.stableId;
    const updated = [...quoteItems];

    if (mode === 'pallets') {
      if (!item.palletPrice || item.sellingType === 'pallets') return;
      const palletQty = Math.max(1, item.palletMoq ?? 1);
      updated[index] = {
        ...updated[index],
        sellingType: 'pallets',
        customPrice: item.palletPrice,
        originalPrice: item.palletPrice,
        quantity: palletQty,
        stockCount: item.palletStockCount ?? 0,
        displayUnit: 'units',
      };
      setInputValues(prev => ({ ...prev, [sk]: { price: item.palletPrice!.toString(), qty: palletQty.toString() } }));
      setQuoteItems(updated);
    } else if (mode === 'units') {
      if (item.sellingType === 'units' && (item.displayUnit ?? 'units') === 'units') return;
      if (!item.unitPrice) return;
      // Packs → Units: item.quantity is already in base units, preserve it.
      // Pallets → Units: different price context, reset to 1.
      const preservedQty = item.sellingType === 'pallets' ? 1 : item.quantity;
      updated[index] = {
        ...updated[index],
        sellingType: 'units',
        customPrice: item.unitPrice,
        originalPrice: item.unitPrice,
        quantity: preservedQty,
        stockCount: item.unitStockCount ?? 0,
        displayUnit: 'units',
      };
      setInputValues(prev => ({ ...prev, [sk]: { price: item.unitPrice!.toString(), qty: preservedQty.toString() } }));
      setQuoteItems(updated);
    } else if (mode === 'packs') {
      if (item.sellingType === 'pallets' || qip <= 1 || (item.displayUnit ?? 'units') === 'packs') return;
      // Immediately commit pack-aligned base units so saves are always correct
      const packCount = Math.max(1, Math.round(item.quantity / qip));
      const alignedBaseUnits = packCount * qip;
      setInputValues(prev => ({ ...prev, [sk]: { ...prev[sk], qty: packCount.toString() } }));
      updated[index] = { ...updated[index], displayUnit: 'packs', quantity: alignedBaseUnits };
      setQuoteItems(updated);
    }
  };

  const calculateProductSubtotal = () => {
    return quoteItems.reduce((sum, item) => sum + (item.customPrice * item.quantity), 0);
  };

  const calculateTotal = () => {
    const productSubtotal = calculateProductSubtotal();
    const delivery = fulfillmentType === 'delivery' ? (parseFloat(deliveryCharge) || 0) : 0;
    return productSubtotal + delivery;
  };

  const calculateTotalCost = () =>
    quoteItems.reduce((sum, item) => sum + (item.costPrice * item.quantity), 0);

  const calculateTotalRevenue = () => calculateProductSubtotal();

  const calculateTotalMarginAmount = () => calculateTotalRevenue() - calculateTotalCost();

  const calculateTotalMarginPct = () => {
    const revenue = calculateTotalRevenue();
    if (revenue === 0) return 0;
    return (calculateTotalMarginAmount() / revenue) * 100;
  };

  const calculateTotalWeight = () =>
    quoteItems.reduce((sum, item) => sum + (item.weightKg * item.quantity), 0);

  const calculateSavings = () => {
    const originalTotal = quoteItems.reduce((sum, item) => sum + (item.originalPrice * item.quantity), 0);
    return originalTotal - calculateProductSubtotal();
  };

  // Pre-fill delivery charge from wholesaler flat rate when switching to delivery
  useEffect(() => {
    if (fulfillmentType === 'delivery' && deliveryCharge === '') {
      const flatRate = user?.deliveryFlatRate;
      if (flatRate) setDeliveryCharge(flatRate.toString());
    }
    if (fulfillmentType === 'pickup') {
      setDeliveryCharge('');
    }
  }, [fulfillmentType]);

  useEffect(() => {
    if (activeCollectionAddresses.length > 0 && collectionAddressId === null) {
      const def = activeCollectionAddresses.find((a: CollectionAddress) => a.isDefault) || activeCollectionAddresses[0];
      if (def) setCollectionAddressId(def.id);
    }
  }, [activeCollectionAddresses]);

  const calculateDepositAmount = () => {
    return calculateTotal() * (depositPercentage / 100);
  };

  const calculateRemainingBalance = () => {
    return calculateTotal() - calculateDepositAmount();
  };

  const doShare = async (message: string) => {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ text: message });
      } catch (err) {
        if (err instanceof DOMException && (err.name === 'AbortError' || err.name === 'NotAllowedError')) {
          // user dismissed — no toast needed
        } else {
          navigator.clipboard?.writeText(message).catch(() => {});
          toast({ title: "Copied to clipboard", description: "Paste the message to send it to your customer." });
        }
      }
    } else {
      navigator.clipboard?.writeText(message).catch(() => {});
      toast({ title: "Copied to clipboard", description: "Paste the message to send it to your customer." });
    }
  };

  const handleCreateQuote = () => {
    try {
    if (!selectedCustomer) {
      toast({
        title: "Select Customer",
        description: "Please select a customer first",
        variant: "destructive",
      });
      return;
    }

    if (quoteItems.length === 0) {
      toast({
        title: "Add Products",
        description: "Please add at least one product to the invoice",
        variant: "destructive",
      });
      return;
    }

    const invalidItem = quoteItems.find(item => item.customPrice <= 0 || item.quantity < 1);
    if (invalidItem) {
      toast({
        title: "Invalid Line Item",
        description: "All items must have a price greater than £0 and a quantity of at least 1",
        variant: "destructive",
      });
      return;
    }

    const moqViolation = quoteItems.find(item =>
      item.sellingType === 'pallets' && item.palletMoq && item.palletMoq > 1 && item.quantity < item.palletMoq
    );
    if (moqViolation) {
      toast({
        title: "Minimum Pallet Order",
        description: `"${moqViolation.productName}" requires a minimum of ${moqViolation.palletMoq} pallets`,
        variant: "destructive",
      });
      return;
    }

    const isUsingCustomAddress = useCustomAddress || customerAddresses.length === 0;

    if (fulfillmentType === 'delivery' && !deliveryAddressId && !isUsingCustomAddress) {
      toast({
        title: "Delivery Address Required",
        description: "Please select or enter a delivery address",
        variant: "destructive",
      });
      return;
    }

    if (fulfillmentType === 'delivery' && isUsingCustomAddress && !customAddressFields.addressLine1.trim()) {
      toast({
        title: "Delivery Address Required",
        description: "Please enter the address line",
        variant: "destructive",
      });
      return;
    }

    if (fulfillmentType === 'delivery' && isUsingCustomAddress && (!customAddressFields.city.trim() || !customAddressFields.postalCode.trim())) {
      toast({
        title: "Address Incomplete",
        description: "Please enter the city and postal code",
        variant: "destructive",
      });
      return;
    }

    // Determine effective payment method: pay_later overrides everything, otherwise use selection
    const effectivePaymentMethod = depositPercentage === 0 ? 'pay_later' : quotePaymentMethod;

    createQuoteMutation.mutate({
      customerId: selectedCustomer.id,
      items: quoteItems,
      sendVia: 'link',
      sendSmsNotification: sendMethod === 'link' ? sendSmsNotification : false,
      depositPercentage,
      balanceDueDays: depositPercentage === 0 ? 0 : balanceDueDays,
      fulfillmentType,
      paymentMethod: effectivePaymentMethod,
      ...(fulfillmentType === 'delivery' && {
        deliveryCharge: parseFloat(deliveryCharge) || 0,
        deliveryAddressId: isUsingCustomAddress ? null : deliveryAddressId,
        deliveryAddress: isUsingCustomAddress ? `${customAddressFields.addressLine1}, ${customAddressFields.city}, ${customAddressFields.postalCode}` : undefined,
        ...(isUsingCustomAddress ? { customAddressFields } : {}),
      }),
      ...(fulfillmentType === 'pickup' && collectionAddressId ? { collectionAddressId } : {}),
      ...(user?.enableMultiProfile && businessProfiles.length > 1 && selectedProfileId ? { businessProfileId: selectedProfileId } : {}),
    });
    } catch (err: unknown) {
      console.error('[handleCreateQuote] unexpected error', err);
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Something went wrong, please try again",
        variant: "destructive",
      });
    }
  };

  const copyPaymentLink = () => {
    if (createdQuote?.paymentLink) {
      navigator.clipboard.writeText(createdQuote.paymentLink);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
      toast({
        title: "Link Copied",
        description: "Payment link copied to clipboard",
      });
    }
  };

  const shareInvoice = async () => {
    if (!createdQuote) return;
    setIsSharingInvoice(true);
    try {
      const filename = `invoice-${createdQuote.orderNumber || createdQuote.id}.pdf`;
      const orderRef = createdQuote.orderNumber || `#${createdQuote.id}`;

      let nativeShareSucceeded = false;
      if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare) {
        try {
          const response = await fetch(`/api/orders/${createdQuote.id}/invoice/customer`, { credentials: 'include' });
          if (response.ok) {
            const blob = await response.blob();
            const file = new File([blob], filename, { type: 'application/pdf' });
            if (navigator.canShare({ files: [file] })) {
              await navigator.share({ title: `Invoice ${orderRef}`, text: sharePreviewMessage || `Here's your invoice ${orderRef}`, files: [file] });
              nativeShareSucceeded = true;
              toast({ title: 'Invoice shared', description: 'The invoice PDF has been shared.' });
              return;
            }
          }
        } catch (shareErr: unknown) {
          if (shareErr instanceof DOMException && (shareErr.name === 'AbortError' || shareErr.name === 'NotAllowedError')) return;
        }
      }

      if (!nativeShareSucceeded) {
        await apiRequest('POST', `/api/orders/${createdQuote.id}/share-invoice`);
        toast({ title: 'Invoice sent', description: 'The invoice has been emailed to the customer.' });
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && (err.name === 'AbortError' || err.name === 'NotAllowedError')) return;
      const message = err instanceof Error ? err.message : '';
      if (message.includes('400')) {
        toast({ title: 'No email on file', description: 'This customer has no email address on record.', variant: 'destructive' });
      } else {
        toast({ title: 'Error', description: 'Could not share the invoice. Please try again.', variant: 'destructive' });
      }
    } finally {
      setIsSharingInvoice(false);
    }
  };

  const resetQuote = () => {
    setSelectedCustomer(null);
    setQuoteItems([]);
    setInputValues({});
    setCostValues({});
    setCreatedQuote(null);
    setSavedDraftResult(null);
    setSendMethod('share');
    setSharePreviewMessage('');
    setDefaultShareMessage('');
    setShowMessagePreview(false);
    setDepositPercentage(100);
    setBalanceDueDays(0);
    setQuotePaymentMethod(stripeReady ? 'payment_link' : 'bank_transfer');
    setFulfillmentType('pickup');
    setDeliveryAddressId(null);
    setDeliveryAddressText('');
    setUseCustomAddress(false);
    setCustomAddressFields({ addressLine1: '', city: '', postalCode: '', state: '', label: '' });
  };

  const totalWeight = calculateTotalWeight();

  useEffect(() => {
    if (fulfillmentType === 'delivery' && !deliveryAddressId && !customAddressFields.addressLine1) {
      setDeliveryExpanded(true);
    }
  }, [fulfillmentType]);

  if (createdQuote) {
    return (
      <>
      <div className="p-4 md:p-6 max-w-2xl mx-auto">
        <Card>
          <CardHeader className="text-center p-4 md:p-6">
            <div className="mx-auto w-12 h-12 md:w-16 md:h-16 bg-green-100 rounded-full flex items-center justify-center mb-3 md:mb-4">
              <Check className="h-6 w-6 md:h-8 md:w-8 text-green-600" />
            </div>
            <CardTitle className="text-xl md:text-2xl">Invoice Created!</CardTitle>
            <CardDescription className="text-sm">
              {createdQuote.paymentLink 
                ? `Order #${createdQuote.orderNumber} is awaiting payment.`
                : `Order #${createdQuote.orderNumber} has been created (Pay Later).`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 p-4 md:p-6 pt-0">
            {createdQuote.paymentLink ? (
              <div className="bg-gray-50 p-3 md:p-4 rounded-lg">
                <Label className="text-xs md:text-sm text-gray-600">Payment Link</Label>
                <div className="flex items-center gap-2 mt-1">
                  <Input 
                    value={createdQuote.paymentLink} 
                    readOnly 
                    className="flex-1 bg-white text-xs md:text-sm"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={copyPaymentLink}
                    className="shrink-0"
                  >
                    {copiedLink ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="bg-blue-50 border border-blue-200 p-3 md:p-4 rounded-lg text-center">
                <p className="text-sm text-blue-800 font-medium">Pay Later - No payment link generated</p>
                <p className="text-xs text-blue-600 mt-1">Customer will arrange payment with you directly.</p>
              </div>
            )}

            {sendMethod === 'link' && (
              <p className="text-xs md:text-sm text-gray-600 text-center">
                Share this link with your customer to collect payment.
              </p>
            )}

            {sharePreviewMessage && (
              <div className="space-y-2">
                <Button
                  variant="outline"
                  className="w-full border-green-300 text-green-700 hover:bg-green-50"
                  size="lg"
                  onClick={() => setShowMessagePreview(v => !v)}
                >
                  <Share2 className="h-4 w-4 mr-2" />
                  {showMessagePreview ? 'Hide Message' : 'Preview Message'}
                </Button>

                {showMessagePreview && (
                  <div className="space-y-2 border border-gray-200 rounded-xl p-4 bg-gray-50">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-gray-600">Edit before sharing</p>
                      {sharePreviewMessage !== defaultShareMessage && (
                        <button
                          type="button"
                          className="text-xs text-green-600 hover:text-green-700 underline underline-offset-2"
                          onClick={() => setSharePreviewMessage(defaultShareMessage)}
                        >
                          Reset
                        </button>
                      )}
                    </div>
                    <textarea
                      className="w-full border border-gray-200 rounded-lg p-3 text-sm font-mono leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
                      rows={12}
                      value={sharePreviewMessage}
                      onChange={(e) => setSharePreviewMessage(e.target.value)}
                    />
                    <Button
                      className="w-full bg-green-600 hover:bg-green-700 text-white"
                      size="lg"
                      onClick={() => {
                        if (user?.id) {
                          if (sharePreviewMessage.startsWith(defaultShareMessage)) {
                            const suffix = sharePreviewMessage.slice(defaultShareMessage.length);
                            if (suffix) {
                              localStorage.setItem(`quikpik_invoice_suffix_${user.id}`, suffix);
                            } else {
                              localStorage.removeItem(`quikpik_invoice_suffix_${user.id}`);
                            }
                          }
                        }
                        doShare(sharePreviewMessage);
                      }}
                    >
                      <Share2 className="h-4 w-4 mr-2" />
                      Share Message
                    </Button>
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 pt-2 md:pt-4">
              <Button 
                variant="outline" 
                className="flex-1"
                onClick={resetQuote}
              >
                New Invoice
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={shareInvoice}
                disabled={isSharingInvoice}
              >
                {isSharingInvoice ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Share2 className="h-4 w-4 mr-2" />
                )}
                Share Invoice
              </Button>
              <Button
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                onClick={() => setShowPickingMode(true)}
              >
                Start Picking
              </Button>
              <Link href="/orders" className="flex-1">
                <Button className="w-full bg-green-600 hover:bg-green-700">
                  View Orders
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {showPickingMode && createdQuote && (
        <PickingMode
          orderId={createdQuote.id}
          orderNumber={createdQuote.orderNumber}
          onClose={() => setShowPickingMode(false)}
        />
      )}
      </>
    );
  }

  if (savedDraftResult) {
    return (
      <div className="p-4 md:p-6 max-w-2xl mx-auto">
        <Card>
          <CardHeader className="text-center p-4 md:p-6">
            <div className="mx-auto w-12 h-12 md:w-16 md:h-16 bg-green-100 rounded-full flex items-center justify-center mb-3 md:mb-4">
              <Check className="h-6 w-6 md:h-8 md:w-8 text-green-600" />
            </div>
            <CardTitle className="text-xl md:text-2xl">
              {savedDraftResult.isUpdate ? 'Draft Updated!' : 'Draft Saved!'}
            </CardTitle>
            <CardDescription className="text-sm">
              {savedDraftResult.isUpdate
                ? `Your draft for ${savedDraftResult.customerName} has been updated.`
                : `Your draft for ${savedDraftResult.customerName} has been saved. You can find it in the Drafts tab.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 md:p-6 pt-0">
            <div className="bg-amber-50 border border-amber-200 p-3 md:p-4 rounded-lg text-center mb-4">
              <p className="text-sm text-amber-800 font-medium">Draft — not yet sent</p>
              <p className="text-xs text-amber-600 mt-1">
                Approve and send this draft when you're ready to notify the customer.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 pt-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={resetQuote}
              >
                New Invoice
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setSavedDraftResult(null)}
              >
                Continue Editing
              </Button>
              <Button
                className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                onClick={() => setLocation('/orders?tab=drafts')}
              >
                View Drafts
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 pb-28">
      <div className="flex items-center gap-3 md:gap-4 mb-4 md:mb-6 pl-10 lg:pl-0">
        <Link href="/orders">
          <Button variant="ghost" size="icon" className="shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold">Raise Invoice</h1>
          <p className="text-sm md:text-base text-gray-600 truncate">Create invoices with custom prices</p>
        </div>
      </div>

      {savedDraft && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <Clock className="h-4 w-4 text-amber-600 shrink-0" />
          <p className="text-sm text-amber-800 flex-1">
            You have an unsent invoice{savedDraft.selectedCustomer?.businessName || savedDraft.selectedCustomer?.firstName
              ? ` for ${savedDraft.selectedCustomer.businessName || savedDraft.selectedCustomer.firstName}`
              : ''} saved {savedDraft.savedAt ? `on ${new Date(savedDraft.savedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : 'earlier'}.
          </p>
          <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white shrink-0" onClick={resumeDraft}>
            Resume
          </Button>
          <Button size="sm" variant="ghost" className="text-amber-600 hover:bg-amber-100 shrink-0 p-1" onClick={clearDraft}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Select Customer
                </CardTitle>
                <Dialog open={addCustomerDialogOpen} onOpenChange={setAddCustomerDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline" className="text-green-600 border-green-600 hover:bg-green-50">
                      <UserPlus className="h-4 w-4 mr-1" />
                      <span className="hidden sm:inline">Add New</span>
                      <span className="sm:hidden">Add</span>
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Add New Customer</DialogTitle>
                      <DialogDescription>Add a customer to create an invoice for them.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 mt-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label htmlFor="firstName">First Name <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
                          <Input
                            id="firstName"
                            value={newCustomer.firstName}
                            onChange={(e) => setNewCustomer({...newCustomer, firstName: e.target.value})}
                            placeholder="John"
                          />
                        </div>
                        <div>
                          <Label htmlFor="lastName">Last Name <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
                          <Input
                            id="lastName"
                            value={newCustomer.lastName}
                            onChange={(e) => setNewCustomer({...newCustomer, lastName: e.target.value})}
                            placeholder="Doe"
                          />
                        </div>
                      </div>
                      <div>
                        <Label htmlFor="phoneNumber">Phone Number *</Label>
                        <Input
                          id="phoneNumber"
                          value={newCustomer.phoneNumber}
                          onChange={(e) => setNewCustomer({...newCustomer, phoneNumber: e.target.value})}
                          placeholder="+44 7700 900000"
                        />
                      </div>
                      <div>
                        <Label htmlFor="email">Email</Label>
                        <Input
                          id="email"
                          type="email"
                          value={newCustomer.email}
                          onChange={(e) => setNewCustomer({...newCustomer, email: e.target.value})}
                          placeholder="john@example.com"
                        />
                      </div>
                      <div>
                        <Label htmlFor="businessName">Business Name <span className="text-muted-foreground font-normal text-xs">(optional)</span></Label>
                        <Input
                          id="businessName"
                          value={newCustomer.businessName}
                          onChange={(e) => setNewCustomer({...newCustomer, businessName: e.target.value})}
                          placeholder="Acme Ltd"
                        />
                      </div>
                      <div className="border-t pt-3">
                        <p className="text-xs font-medium text-muted-foreground mb-2">Address <span className="font-normal">(optional — appears on invoices)</span></p>
                        <div className="space-y-2">
                          <Input
                            placeholder="Address line 1"
                            value={newCustomer.streetAddress}
                            onChange={(e) => setNewCustomer({...newCustomer, streetAddress: e.target.value})}
                          />
                          <Input
                            placeholder="Address line 2 (optional)"
                            value={newCustomer.addressLine2}
                            onChange={(e) => setNewCustomer({...newCustomer, addressLine2: e.target.value})}
                          />
                          <div className="grid grid-cols-2 gap-2">
                            <Input
                              placeholder="City"
                              value={newCustomer.city}
                              onChange={(e) => setNewCustomer({...newCustomer, city: e.target.value})}
                            />
                            <Input
                              placeholder="Postcode"
                              value={newCustomer.postalCode}
                              onChange={(e) => setNewCustomer({...newCustomer, postalCode: e.target.value})}
                            />
                          </div>
                          <Input
                            placeholder="Country"
                            value={newCustomer.country}
                            onChange={(e) => setNewCustomer({...newCustomer, country: e.target.value})}
                          />
                        </div>
                      </div>
                      <Button
                        className="w-full bg-green-600 hover:bg-green-700"
                        disabled={!newCustomer.phoneNumber || addCustomerMutation.isPending}
                        onClick={() => {
                          addCustomerMutation.mutate(newCustomer);
                        }}
                      >
                        {addCustomerMutation.isPending ? "Adding..." : "Add Customer"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <Sheet
                open={customerDropdownOpen}
                onOpenChange={(open) => {
                  setCustomerDropdownOpen(open);
                  if (!open) setCustomerSearch('');
                }}
              >
                <SheetTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={customerDropdownOpen}
                  className="w-full justify-start font-normal gap-2 text-left"
                >
                  <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                  {selectedCustomer ? (
                    <span className="flex flex-col items-start min-w-0">
                      <span className="truncate">{selectedCustomer.businessName || `${selectedCustomer.firstName || ''} ${selectedCustomer.lastName || ''}`.trim() || selectedCustomer.phoneNumber || 'Unknown'}</span>
                      <span className="text-xs text-gray-500">{selectedCustomer.phoneNumber}</span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Search customers...</span>
                  )}
                </Button>
                </SheetTrigger>
                <SheetContent side="bottom" className="h-[70vh] flex flex-col p-0">
                  <SheetHeader className="px-4 pt-4 pb-2 border-b border-slate-200">
                    <SheetTitle className="text-base">Select Customer</SheetTitle>
                    <Input
                      autoFocus
                      placeholder="Search by name or number..."
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      className="mt-2"
                    />
                  </SheetHeader>
                  <div className="flex-1 overflow-y-auto">
                    {(() => {
                      const filtered = customers.filter((c) => {
                        if (!customerSearch) return true;
                        const q = customerSearch.toLowerCase();
                        const name = (c.businessName || `${c.firstName || ''} ${c.lastName || ''}`.trim()).toLowerCase();
                        const phone = (c.phoneNumber || '').toLowerCase();
                        return name.includes(q) || phone.includes(q);
                      });
                      if (filtered.length === 0) {
                        return (
                          <p className="text-sm text-slate-500 text-center py-8">No customers found.</p>
                        );
                      }
                      return filtered.map((customer) => (
                        <button
                          key={customer.id}
                          className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b border-slate-100 hover:bg-slate-50 transition-colors ${selectedCustomer?.id === customer.id ? 'bg-green-50' : ''}`}
                          onClick={() => {
                            setSelectedCustomer(customer);
                            setDeliveryAddressId(null);
                            setDeliveryAddressText('');
                            setUseCustomAddress(false);
                            setCustomerSearch('');
                            setCustomerDropdownOpen(false);
                          }}
                        >
                          <Check
                            className={`h-4 w-4 flex-shrink-0 text-green-600 ${selectedCustomer?.id === customer.id ? 'opacity-100' : 'opacity-0'}`}
                          />
                          <div className="flex flex-col min-w-0">
                            <span className="font-medium truncate">{customer.businessName || `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || customer.phoneNumber || 'Unknown'}</span>
                            <span className="text-xs text-gray-500">{customer.phoneNumber}</span>
                          </div>
                        </button>
                      ));
                    })()}
                  </div>
                </SheetContent>
              </Sheet>

              {selectedCustomer && (() => {
                const hasName = !!(selectedCustomer.businessName?.trim() || selectedCustomer.firstName?.trim() || selectedCustomer.lastName?.trim());
                const displayName = selectedCustomer.businessName || `${selectedCustomer.firstName || ''} ${selectedCustomer.lastName || ''}`.trim() || selectedCustomer.phoneNumber || '';
                const editNamePopover = (
                  <Popover open={editNameOpen} onOpenChange={(open) => {
                    setEditNameOpen(open);
                    if (open) {
                      setEditNameForm({
                        firstName: selectedCustomer.firstName || '',
                        lastName: selectedCustomer.lastName || '',
                        businessName: selectedCustomer.businessName || '',
                      });
                    }
                  }}>
                    <PopoverTrigger asChild>
                      {hasName ? (
                        <button className="ml-1 text-gray-400 hover:text-gray-600 transition-colors" aria-label="Edit customer name">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      ) : (
                        <button className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 border border-amber-200 hover:bg-amber-200 transition-colors cursor-pointer">
                          <Pencil className="h-3 w-3" />
                          Add customer name or business name
                        </button>
                      )}
                    </PopoverTrigger>
                    <PopoverContent className="w-72 p-4" align="start">
                      <div className="space-y-3">
                        <p className="text-sm font-medium">{hasName ? 'Edit customer name' : 'Add customer name'}</p>
                        <div className="space-y-2">
                          <Label className="text-xs">Business name</Label>
                          <Input
                            className="h-8 text-sm"
                            placeholder="e.g. Acme Ltd"
                            value={editNameForm.businessName}
                            onChange={(e) => setEditNameForm(f => ({ ...f, businessName: e.target.value }))}
                          />
                        </div>
                        <div className="flex gap-2">
                          <div className="flex-1 space-y-2">
                            <Label className="text-xs">First name</Label>
                            <Input
                              className="h-8 text-sm"
                              placeholder="First"
                              value={editNameForm.firstName}
                              onChange={(e) => setEditNameForm(f => ({ ...f, firstName: e.target.value }))}
                            />
                          </div>
                          <div className="flex-1 space-y-2">
                            <Label className="text-xs">Last name</Label>
                            <Input
                              className="h-8 text-sm"
                              placeholder="Last"
                              value={editNameForm.lastName}
                              onChange={(e) => setEditNameForm(f => ({ ...f, lastName: e.target.value }))}
                            />
                          </div>
                        </div>
                        <div className="flex justify-end gap-2 pt-1">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => setEditNameOpen(false)}
                          >
                            Cancel
                          </Button>
                          <Button
                            size="sm"
                            className="h-7 text-xs"
                            disabled={updateCustomerNameMutation.isPending || (!editNameForm.firstName.trim() && !editNameForm.lastName.trim() && !editNameForm.businessName.trim())}
                            onClick={() => updateCustomerNameMutation.mutate(editNameForm)}
                          >
                            {updateCustomerNameMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save'}
                          </Button>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                );
                return (
                  <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                    <div className="font-medium flex items-center gap-1">
                      {displayName || 'Unknown'}
                      {hasName && editNamePopover}
                    </div>
                    {selectedCustomer.email && (
                      <div className="text-sm text-gray-600 flex items-center gap-1">
                        <Mail className="h-3 w-3" /> {selectedCustomer.email}
                      </div>
                    )}
                    {selectedCustomer.phoneNumber && (
                      <div className="text-sm text-gray-600 flex items-center gap-1">
                        <Phone className="h-3 w-3" /> {selectedCustomer.phoneNumber}
                      </div>
                    )}
                    {!hasName && (
                      <div className="mt-2">
                        {editNamePopover}
                      </div>
                    )}
                  </div>
                );
              })()}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="flex items-center gap-2 text-base sm:text-xl whitespace-nowrap">
                  <Package className="h-5 w-5 shrink-0" />
                  Invoice Items{quoteItems.length > 0 && <span className="text-gray-500 font-normal"> ({quoteItems.length})</span>}
                </CardTitle>
                <Dialog open={productDialogOpen} onOpenChange={(open) => { setProductDialogOpen(open); if (open) { setProductSearch(""); setPickerPriceListId(null); } }}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="bg-green-600 hover:bg-green-700 shrink-0">
                      <Plus className="h-4 w-4 mr-1" /> Add Product
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Select Product</DialogTitle>
                    </DialogHeader>
                    <div className="relative mt-2">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                      <Input
                        placeholder="Search products..."
                        value={productSearch}
                        onChange={(e) => setProductSearch(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                    {priceLists.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => setPickerPriceListId(null)}
                          className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${pickerPriceListId === null ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-300 hover:border-green-400'}`}
                        >
                          Standard
                        </button>
                        {priceLists.map((pl) => (
                          <button
                            key={pl.id}
                            type="button"
                            onClick={() => setPickerPriceListId(pl.id)}
                            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${pickerPriceListId === pl.id ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-600 border-gray-300 hover:border-green-400'}`}
                          >
                            {pl.name}
                          </button>
                        ))}
                      </div>
                    )}
                    {(() => {
                      const addedProductIds = new Set(quoteItems.map(qi => qi.productId));
                      const filteredProducts = products.filter((p) =>
                        !addedProductIds.has(p.id) &&
                        p.name.toLowerCase().includes(productSearch.toLowerCase())
                      );
                      return (
                    <div className="grid grid-cols-1 gap-3 mt-4">
                      {filteredProducts.length === 0 ? (
                        <p className="text-sm text-gray-500 text-center py-6">No products found</p>
                      ) : null}
                      {filteredProducts.map((product) => {
                        const now = new Date();
                        const activePromos = (product.promotionalOffers || []).filter((o: any) => {
                          if (o.isActive === false) return false;
                          if (o.startDate && new Date(o.startDate) > now) return false;
                          if (o.endDate && new Date(o.endDate) < now) return false;
                          return true;
                        });
                        const bestPromo = activePromos.find((o: any) => 
                          o.type === 'percentage_discount' || o.type === 'fixed_price' || o.type === 'clearance'
                        );
                        let promoUnitPrice: number | null = null;
                        if (bestPromo) {
                          if (bestPromo.type === 'percentage_discount' && bestPromo.discountPercentage) {
                            promoUnitPrice = parseFloat(product.price) * (1 - bestPromo.discountPercentage / 100);
                          } else if ((bestPromo.type === 'fixed_price' || bestPromo.type === 'clearance') && bestPromo.fixedPrice) {
                            promoUnitPrice = bestPromo.fixedPrice;
                          }
                        }
                        return (
                        <div key={product.id} className="p-3 border rounded-lg">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="font-medium">{product.name}</span>
                            {activePromos.map((offer: any, oi: number) => (
                              <Badge key={oi} variant="secondary" className={
                                offer.type === 'percentage_discount' ? 'bg-red-100 text-red-700 text-xs' :
                                offer.type === 'fixed_price' ? 'bg-green-100 text-green-700 text-xs' :
                                offer.type === 'buy_x_get_y_free' ? 'bg-purple-100 text-purple-700 text-xs' :
                                offer.type === 'bundle_deal' ? 'bg-blue-100 text-blue-700 text-xs' :
                                offer.type === 'clearance' ? 'bg-orange-100 text-orange-700 text-xs' :
                                'bg-gray-100 text-gray-700 text-xs'
                              }>
                                {offer.type === 'percentage_discount' ? `${offer.discountPercentage}% Off` :
                                 offer.type === 'fixed_price' ? `${formatCurrency(offer.fixedPrice)} each` :
                                 offer.type === 'buy_x_get_y_free' ? `Buy ${offer.buyQuantity} Get ${offer.getQuantity} Free` :
                                 offer.type === 'bundle_deal' ? `${offer.minQuantity}+ @ ${formatCurrency(offer.fixedPrice)}` :
                                 offer.type === 'clearance' ? `Clearance ${formatCurrency(offer.fixedPrice)}` :
                                 offer.name || 'Promo'}
                              </Badge>
                            ))}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {(() => {
                              const availableUnits = product.totalBatchStock ?? product.stock;
                              const unitInStock = availableUnits > 0;
                              return (
                              <div
                                className={`flex-1 min-w-[140px] p-2 border rounded-lg transition-colors ${unitInStock ? 'cursor-pointer hover:border-green-500 hover:bg-green-50' : 'border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed'}`}
                                onClick={() => addProduct(product, 'units')}
                              >
                                {(() => {
                                        const { price: resolvedUnit, fromList: unitFromList } = resolvePickerPrice(product, 'units');
                                        const standardUnit = parseFloat(product.price || '0');
                                        const unitPriceChanged = unitFromList && Math.abs(resolvedUnit - standardUnit) > 0.001;
                                        return (<>
                                <div className={`text-xs font-medium flex items-center gap-1 ${unitInStock ? 'text-gray-500' : 'text-gray-400'}`}>
                                  Per Unit
                                  {unitPriceChanged && <span className="text-[10px] bg-green-100 text-green-700 px-1 rounded">List</span>}
                                </div>
                                <div className="mt-1">
                                  <div className={`font-semibold ${unitInStock ? 'text-green-600' : 'text-gray-400'}`}>
                                    {promoUnitPrice !== null ? (
                                      <>
                                        <span className="line-through text-gray-400 font-normal mr-1">{formatCurrency(product.price)}</span>
                                        {formatCurrency(promoUnitPrice)}
                                      </>
                                    ) : unitPriceChanged ? (
                                      <>
                                        <span className="line-through text-gray-400 font-normal mr-1 text-xs">{formatCurrency(standardUnit)}</span>
                                        {formatCurrency(resolvedUnit)}
                                      </>
                                    ) : (
                                      <>{formatCurrency(resolvedUnit)}</>
                                    )}
                                  </div>
                                  <div className={`text-xs mt-0.5 ${unitInStock ? 'text-gray-500' : 'text-red-500 font-medium'}`}>
                                    {unitInStock ? `${availableUnits} units` : 'Out of stock'}
                                  </div>
                                  {unitInStock && product.batchCount && product.batchCount > 0 && (
                                    <div className="text-xs mt-0.5 text-gray-400">
                                      {product.batchCount} batch{product.batchCount !== 1 ? 'es' : ''}
                                      {product.nearestExpiry && (() => {
                                        const exp = new Date(product.nearestExpiry);
                                        const now = new Date(); now.setHours(0, 0, 0, 0);
                                        const diff = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                                        const fmt = exp.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                                        if (diff < 0) return <span className="text-red-600"> · Exp {fmt}</span>;
                                        if (diff <= 30) return <span className="text-amber-600"> · Exp {fmt}</span>;
                                        return <span> · Exp {fmt}</span>;
                                      })()}
                                    </div>
                                  )}
                                  {product.costPrice && (
                                    <div className="text-xs mt-1 text-gray-400">
                                      {(() => {
                                        const cost = parseFloat(product.costPrice);
                                        const sell = parseFloat(product.price);
                                        const mAmt = sell - cost;
                                        const mPct = sell > 0 ? ((mAmt / sell) * 100).toFixed(0) : '0';
                                        return (
                                          <>
                                            Cost {formatCurrency(cost)} | Margin{' '}
                                            <span className={mAmt < 0 ? 'text-red-500' : 'text-green-600'}>
                                              {formatCurrency(mAmt)} ({mPct}%)
                                            </span>
                                          </>
                                        );
                                      })()}
                                    </div>
                                  )}
                                </div>
                              </>);
                              })()}
                              </div>
                              );
                            })()}
                            {product.palletPrice && parseFloat(product.palletPrice) > 0 && (() => {
                              const palletInStock = (product.palletStock || 0) > 0;
                              let promoPalletPrice: number | null = null;
                              if (bestPromo && product.unitsPerPallet) {
                                if (bestPromo.type === 'percentage_discount' && bestPromo.discountPercentage) {
                                  promoPalletPrice = parseFloat(product.palletPrice) * (1 - bestPromo.discountPercentage / 100);
                                } else if ((bestPromo.type === 'fixed_price' || bestPromo.type === 'clearance') && bestPromo.fixedPrice) {
                                  promoPalletPrice = bestPromo.fixedPrice * product.unitsPerPallet;
                                }
                              }
                              return (
                              <div
                                className={`flex-1 min-w-[140px] p-2 border rounded-lg transition-colors ${palletInStock ? 'cursor-pointer hover:border-blue-500 hover:bg-blue-50 border-blue-200 bg-blue-50/30' : 'border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed'}`}
                                onClick={() => palletInStock && addProduct(product, 'pallets')}
                              >
                                <div className={`text-xs font-medium ${palletInStock ? 'text-blue-600' : 'text-gray-400'}`}>Per Pallet</div>
                                <div className="mt-1">
                                  <div className={`font-semibold ${palletInStock ? 'text-blue-600' : 'text-gray-400'}`}>
                                    {promoPalletPrice !== null ? (
                                      <>
                                        <span className="line-through text-gray-400 font-normal mr-1">{formatCurrency(product.palletPrice)}</span>
                                        {formatCurrency(promoPalletPrice)}
                                      </>
                                    ) : (
                                      <>{formatCurrency(product.palletPrice)}</>
                                    )}
                                  </div>
                                  <div className={`text-xs mt-0.5 ${palletInStock ? 'text-gray-500' : 'text-red-500 font-medium'}`}>
                                    {palletInStock ? `${product.palletStock} pallets` : 'Out of stock'}
                                  </div>
                                  {product.costPrice && product.unitsPerPallet && (
                                    <div className="text-xs mt-1 text-gray-400">
                                      {(() => {
                                        const palletCost = parseFloat(product.costPrice) * product.unitsPerPallet;
                                        const palletSell = parseFloat(product.palletPrice!);
                                        const mAmt = palletSell - palletCost;
                                        const mPct = palletSell > 0 ? ((mAmt / palletSell) * 100).toFixed(0) : '0';
                                        return (
                                          <>
                                            Cost {formatCurrency(palletCost)} | Margin{' '}
                                            <span className={mAmt < 0 ? 'text-red-500' : 'text-green-600'}>
                                              {formatCurrency(mAmt)} ({mPct}%)
                                            </span>
                                          </>
                                        );
                                      })()}
                                    </div>
                                  )}
                                </div>
                                {product.unitsPerPallet && (
                                  <div className="text-xs text-gray-400 mt-1">
                                    ({product.unitsPerPallet} units/pallet)
                                  </div>
                                )}
                              </div>
                              );
                            })()}
                          </div>
                        </div>
                        );
                      })}
                    </div>
                      );
                    })()}
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {quoteItems.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <ShoppingCart className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No products added yet</p>
                  <p className="text-sm">Click "Add Product" to start building your invoice</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {quoteItems.map((item, index) => (
                    <QuoteItemCard
                      key={item.stableId}
                      item={item}
                      index={index}
                      inputValues={inputValues}
                      costValues={costValues}
                      setInputValues={setInputValues}
                      setCostValues={setCostValues}
                      updateItemPrice={updateItemPrice}
                      updateItemQuantity={updateItemQuantity}
                      updateItemCost={updateItemCost}
                      removeItem={removeItem}
                      formatCurrency={formatCurrency}
                      formatWeight={formatWeight}
                      onSwitchMode={(mode) => switchItemMode(index, mode)}
                    />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader
              className="cursor-pointer select-none"
              onClick={() => setSummaryExpanded(v => !v)}
            >
              <div className="flex items-center justify-between">
                <CardTitle>Invoice Summary</CardTitle>
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <span className="font-semibold text-gray-800">{formatCurrency(calculateTotal())}</span>
                  <ChevronDown
                    className={`h-4 w-4 transition-transform ${summaryExpanded ? 'rotate-180' : ''}`}
                  />
                </div>
              </div>
              {!summaryExpanded && (
                <p className="text-xs text-gray-500 mt-1">
                  {quoteItems.length} {quoteItems.length === 1 ? 'item' : 'items'} · {fulfillmentType === 'pickup' ? 'Collection' : 'Delivery'}
                </p>
              )}
            </CardHeader>
            {summaryExpanded && <CardContent className="space-y-4">
              {user?.enableMultiProfile && businessProfiles.length > 1 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
                    <Building2 className="h-4 w-4 text-gray-500" />
                    Trading As
                  </label>
                  <select
                    value={selectedProfileId ?? ''}
                    onChange={e => setSelectedProfileId(e.target.value ? Number(e.target.value) : null)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  >
                    {businessProfiles.map(p => (
                      <option key={p.id} value={p.id}>{p.name}{p.isDefault ? ' (default)' : ''}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span>Quantity</span>
                <span>{quoteItems.reduce((sum, item) => sum + item.quantity, 0)}</span>
              </div>
              {calculateSavings() > 0 && (
                <div className="flex justify-between text-sm text-green-600">
                  <span>Customer Savings</span>
                  <span>-{formatCurrency(calculateSavings())}</span>
                </div>
              )}
              <Separator />
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Products</span>
                  <span>{formatCurrency(calculateProductSubtotal())}</span>
                </div>
                {fulfillmentType === 'delivery' && (parseFloat(deliveryCharge) || 0) > 0 && (
                  <div className="flex justify-between text-blue-700">
                    <span>Delivery</span>
                    <span>{formatCurrency(parseFloat(deliveryCharge) || 0)}</span>
                  </div>
                )}
              </div>
              <div className="flex justify-between font-bold text-lg">
                <span>Total</span>
                <span>{formatCurrency(calculateTotal())}</span>
              </div>

              {quoteItems.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-1 text-sm">
                    <div className="font-medium text-gray-700 mb-1.5">Margin Overview</div>
                    <div className="flex justify-between text-gray-600">
                      <span>Revenue</span>
                      <span>{formatCurrency(calculateTotalRevenue())}</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>Total Cost</span>
                      <span>{formatCurrency(calculateTotalCost())}</span>
                    </div>
                    <div className={`flex justify-between font-semibold ${calculateTotalMarginAmount() < 0 ? 'text-red-600' : 'text-green-700'}`}>
                      <span>Margin</span>
                      <span>{formatCurrency(calculateTotalMarginAmount())} ({calculateTotalMarginPct().toFixed(1)}%)</span>
                    </div>
                    {totalWeight > 0 && (
                      <div className="flex justify-between text-gray-600">
                        <span>Total Weight</span>
                        <span>{formatWeight(totalWeight)} kg</span>
                      </div>
                    )}
                  </div>
                </>
              )}

              <Separator />

              <div>
                <button
                  type="button"
                  className="w-full flex items-center justify-between py-1"
                  onClick={() => setDeliveryExpanded(v => !v)}
                >
                  <span className="text-sm font-medium text-gray-700">Delivery Method</span>
                  <span className="flex items-center gap-1.5 text-xs text-gray-500">
                    {fulfillmentType === 'pickup' ? (
                      <><MapPin className="h-3.5 w-3.5" />{activeCollectionAddresses.find(a => a.id === collectionAddressId)?.name || (activeCollectionAddresses.length > 0 ? 'Select location' : 'Collection')}</>
                    ) : (
                      <><Truck className="h-3.5 w-3.5" />{deliveryAddressId ? (customerAddresses.find((a: DeliveryAddress) => a.id === deliveryAddressId)?.addressLine1 || 'Delivery') : customAddressFields.addressLine1 ? customAddressFields.addressLine1 : 'No address set'}</>
                    )}
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${deliveryExpanded ? 'rotate-180' : ''}`} />
                  </span>
                </button>
                {deliveryExpanded && (
                  <div className="mt-3 space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant={fulfillmentType === 'pickup' ? 'default' : 'outline'}
                        className={fulfillmentType === 'pickup' ? 'bg-green-600 hover:bg-green-700' : ''}
                        size="sm"
                        onClick={() => setFulfillmentType('pickup')}
                      >
                        <MapPin className="w-3 h-3 mr-1" />
                        Collection
                      </Button>
                      <Button
                        variant={fulfillmentType === 'delivery' ? 'default' : 'outline'}
                        className={fulfillmentType === 'delivery' ? 'bg-green-600 hover:bg-green-700' : ''}
                        size="sm"
                        onClick={() => setFulfillmentType('delivery')}
                      >
                        <Truck className="w-3 h-3 mr-1" />
                        Delivery
                      </Button>
                    </div>

                    {fulfillmentType === 'pickup' && activeCollectionAddresses.length > 0 && (
                      <div>
                        <Label className="text-sm font-medium mb-1 block">Pickup Location</Label>
                        <select
                          className="w-full text-sm border border-gray-300 rounded-md px-2 py-1.5 focus:outline-none focus:border-green-500"
                          value={collectionAddressId ?? ''}
                          onChange={(e) => setCollectionAddressId(e.target.value ? parseInt(e.target.value, 10) : null)}
                        >
                          <option value="">-- Select pickup location --</option>
                          {activeCollectionAddresses.map((a: CollectionAddress) => (
                            <option key={a.id} value={a.id}>
                              {a.name} — {[a.addressLine1, a.city, a.postcode].filter(Boolean).join(', ')}
                              {a.isDefault ? ' (Default)' : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {fulfillmentType === 'delivery' && (
                      <div>
                        <Label className="text-sm font-medium mb-1 block">Delivery Charge</Label>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-500">£</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="0.00"
                            value={deliveryCharge}
                            onChange={(e) => setDeliveryCharge(e.target.value)}
                            className="w-28 text-sm border border-gray-300 rounded-md px-2 py-1.5 focus:outline-none focus:border-green-500"
                          />
                          <span className="text-xs text-gray-400">editable per invoice</span>
                        </div>
                        <p className="text-xs text-gray-400 mt-1">
                          {user?.deliveryFlatRate ? `Default rate: ${formatCurrency(user.deliveryFlatRate)}` : 'No default rate set in settings'}
                        </p>
                      </div>
                    )}

                    {fulfillmentType === 'delivery' && selectedCustomer && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
                        <Label className="text-sm font-medium block text-blue-900">Delivery Address</Label>
                        {customerAddresses.length > 0 && !useCustomAddress ? (
                          <div className="space-y-2">
                            {customerAddresses.map((addr) => (
                              <div
                                key={addr.id}
                                onClick={() => setDeliveryAddressId(addr.id)}
                                className={`p-2 rounded border cursor-pointer text-xs ${
                                  deliveryAddressId === addr.id
                                    ? 'border-green-500 bg-green-50'
                                    : 'border-gray-200 bg-white hover:border-gray-300'
                                }`}
                              >
                                {addr.label && <span className="font-medium">{addr.label}: </span>}
                                {addr.addressLine1}, {addr.city}, {addr.postalCode}
                              </div>
                            ))}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-xs text-blue-600"
                              onClick={() => { setUseCustomAddress(true); setDeliveryAddressId(null); }}
                            >
                              + Enter a different address
                            </Button>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <Input
                              placeholder="Label (e.g. Home, Office)"
                              value={customAddressFields.label}
                              onChange={(e) => setCustomAddressFields({ ...customAddressFields, label: e.target.value })}
                              className="text-xs h-8"
                            />
                            <Input
                              placeholder="Address line *"
                              value={customAddressFields.addressLine1}
                              onChange={(e) => setCustomAddressFields({ ...customAddressFields, addressLine1: e.target.value })}
                              className="text-xs h-8"
                              required
                            />
                            <div className="grid grid-cols-3 gap-1">
                              <Input
                                placeholder="City *"
                                value={customAddressFields.city}
                                onChange={(e) => setCustomAddressFields({ ...customAddressFields, city: e.target.value })}
                                className="text-xs h-8"
                                required
                              />
                              <Input
                                placeholder="County"
                                value={customAddressFields.state}
                                onChange={(e) => setCustomAddressFields({ ...customAddressFields, state: e.target.value })}
                                className="text-xs h-8"
                              />
                              <Input
                                placeholder="Postcode *"
                                value={customAddressFields.postalCode}
                                onChange={(e) => setCustomAddressFields({ ...customAddressFields, postalCode: e.target.value })}
                                className="text-xs h-8"
                                required
                              />
                            </div>
                            {customerAddresses.length > 0 && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-xs text-blue-600"
                                onClick={() => { setUseCustomAddress(false); setDeliveryAddressText(''); setCustomAddressFields({ addressLine1: '', city: '', postalCode: '', state: '', label: '' }); setDeliveryAddressId(customerAddresses[0]?.id || null); }}
                              >
                                Use saved address instead
                              </Button>
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {fulfillmentType === 'delivery' && !selectedCustomer && (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                        <p className="text-xs text-amber-700">Select a customer first to set the delivery address</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

            </CardContent>}
          </Card>

          <Card>
            <CardHeader
              className="cursor-pointer select-none"
              onClick={() => setPaymentSetupExpanded(v => !v)}
            >
              <div className="flex items-center justify-between">
                <CardTitle>Payment Setup</CardTitle>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">
                    {depositPercentage === 0 ? 'Pay Later' : depositPercentage === 100 ? 'Full' : `${depositPercentage}% deposit`}
                    {depositPercentage > 0 && ` · ${({ payment_link: 'Payment Link', cash: 'Cash', bank_transfer: 'Bank Transfer', cheque: 'Cheque' } as Record<string, string>)[quotePaymentMethod]}`}
                    {depositPercentage > 0 && ` · Due: ${({ 0: 'Now', 7: '7 days', 14: '14 days', 30: '30 days', 60: '60 days' } as Record<number, string>)[balanceDueDays]}`}
                  </span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${paymentSetupExpanded ? 'rotate-180' : ''}`} />
                </div>
              </div>
            </CardHeader>
            {paymentSetupExpanded && <CardContent className="space-y-4">
              <div>
                <Label className="text-sm font-medium mb-2 block">Payment Type</Label>
                <div className="grid grid-cols-5 gap-1.5">
                  {[0, 25, 50, 75, 100].map((percent) => (
                    <Button
                      key={percent}
                      variant={depositPercentage === percent ? 'default' : 'outline'}
                      className={`${depositPercentage === percent ? 'bg-green-600 hover:bg-green-700' : ''} text-xs px-1 whitespace-nowrap`}
                      size="sm"
                      onClick={() => setDepositPercentage(percent as 0 | 25 | 50 | 75 | 100)}
                    >
                      {percent === 100 ? 'Full' : percent === 0 ? 'Later' : `${percent}%`}
                    </Button>
                  ))}
                </div>
              </div>

              {depositPercentage === 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-blue-800 font-medium">Pay Later - No payment required now</span>
                    <span className="font-semibold text-blue-800">{formatCurrency(calculateTotal())}</span>
                  </div>
                  <p className="text-xs text-blue-600 mt-1">Customer will pay the full amount later. No payment link will be sent.</p>
                </div>
              )}

              {depositPercentage > 0 && (
                <div>
                  <Label className="text-sm font-medium mb-2 block">Payment Method</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { value: 'payment_link', label: '💳 Payment Link' },
                      { value: 'cash', label: '💵 Cash' },
                      { value: 'bank_transfer', label: '🏦 Bank Transfer' },
                      { value: 'cheque', label: '📄 Cheque' },
                    ] as const).filter(o => o.value !== 'payment_link' || stripeReady).map(({ value, label }) => (
                      <Button
                        key={value}
                        type="button"
                        variant={quotePaymentMethod === value ? 'default' : 'outline'}
                        className={`text-xs ${quotePaymentMethod === value ? 'bg-green-600 hover:bg-green-700' : ''}`}
                        size="sm"
                        onClick={() => setQuotePaymentMethod(value)}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                  {quotePaymentMethod !== 'payment_link' && (
                    <p className="text-xs text-amber-700 mt-2 bg-amber-50 border border-amber-200 rounded p-2">
                      No payment link will be generated. The customer will pay by {quotePaymentMethod === 'bank_transfer' ? 'bank transfer' : quotePaymentMethod}. No service fees apply.
                    </p>
                  )}
                </div>
              )}

              {depositPercentage > 0 && depositPercentage < 100 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-amber-800">Deposit ({depositPercentage}%)</span>
                    <span className="font-semibold text-amber-800">{formatCurrency(calculateDepositAmount())}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-amber-700">Remaining Balance</span>
                    <span className="text-amber-700">{formatCurrency(calculateRemainingBalance())}</span>
                  </div>
                </div>
              )}

              {depositPercentage === 100 && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-green-700">Full Payment</span>
                    <span className="font-semibold text-green-700">{formatCurrency(calculateTotal())}</span>
                  </div>
                </div>
              )}

              {depositPercentage > 0 && (
                <div>
                  <button
                    type="button"
                    className="w-full flex items-center justify-between py-1"
                    onClick={() => setBalanceDueExpanded(v => !v)}
                  >
                    <span className="text-sm font-medium text-gray-700">Balance Due In</span>
                    <span className="flex items-center gap-1.5 text-xs text-gray-500">
                      <span className="px-2 py-0.5 rounded-full bg-gray-100 font-medium">
                        {({ 0: 'Now', 7: '7 days', 14: '14 days', 30: '30 days', 60: '60 days' } as Record<number, string>)[balanceDueDays]}
                      </span>
                      <ChevronDown className={`h-3.5 w-3.5 transition-transform ${balanceDueExpanded ? 'rotate-180' : ''}`} />
                    </span>
                  </button>
                  {balanceDueExpanded && (
                    <div className="mt-3 space-y-2">
                      <div className="grid grid-cols-5 gap-1">
                        {[
                          { value: 0, label: 'Now' },
                          { value: 7, label: '7 days' },
                          { value: 14, label: '14 days' },
                          { value: 30, label: '30 days' },
                          { value: 60, label: '60 days' },
                        ].map((option) => (
                          <Button
                            key={option.value}
                            variant={balanceDueDays === option.value ? 'default' : 'outline'}
                            className={balanceDueDays === option.value ? 'bg-green-600 hover:bg-green-700' : ''}
                            size="sm"
                            onClick={() => { setBalanceDueDays(option.value as 0 | 7 | 14 | 30 | 60); setBalanceDueExpanded(false); }}
                          >
                            {option.label}
                          </Button>
                        ))}
                      </div>
                      {balanceDueDays > 0 && (
                        <p className="text-xs text-gray-500">
                          {depositPercentage === 100
                            ? `Customer will be reminded to pay ${formatCurrency(calculateTotal())} within ${balanceDueDays} days`
                            : `Customer will be reminded to pay the remaining ${formatCurrency(calculateRemainingBalance())} within ${balanceDueDays} days`}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </CardContent>}
          </Card>

          {depositPercentage > 0 && quotePaymentMethod === 'payment_link' && (
          <Card>
            <CardHeader>
              <CardTitle>Send Invoice</CardTitle>
              <CardDescription>How would you like to share the payment link?</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant={sendMethod === 'share' ? 'default' : 'outline'}
                  className={sendMethod === 'share' ? 'bg-green-600' : ''}
                  onClick={() => setSendMethod('share')}
                >
                  <Share2 className="h-4 w-4 mr-1" />
                  Share
                </Button>
                <Button
                  variant={sendMethod === 'link' ? 'default' : 'outline'}
                  className={sendMethod === 'link' ? 'bg-green-600' : ''}
                  onClick={() => setSendMethod('link')}
                >
                  <LinkIcon className="h-4 w-4 mr-1" />
                  Link Only
                </Button>
              </div>

              {sendMethod === 'link' && (
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <Checkbox
                    checked={sendSmsNotification}
                    onCheckedChange={(v) => setSendSmsNotification(Boolean(v))}
                  />
                  <span className="text-sm text-gray-600">Also send SMS notification to customer</span>
                </label>
              )}

            </CardContent>
          </Card>
          )}
        </div>
      </div>

      <div className={`fixed bottom-0 right-0 z-50 bg-white border-t border-gray-200 px-4 py-3 flex items-center justify-between gap-3 shadow-lg left-0 ${isDesktopCollapsed ? "lg:left-14" : "lg:left-64"}`}>
        <div className="hidden sm:block min-w-0">
          {editingDraftId && (
            <span className="sm:hidden inline-block text-xs text-amber-600 font-medium bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5 mb-1">
              Editing draft
            </span>
          )}
          <p className="text-xs text-gray-500 leading-tight">
            {quoteItems.length} {quoteItems.length === 1 ? 'item' : 'items'} · {fulfillmentType === 'pickup' ? 'Collection' : 'Delivery'}
            {editingDraftId && <span className="hidden sm:inline ml-1 text-amber-600 font-medium"> · Editing draft</span>}
          </p>
          <p className="text-lg font-bold leading-tight">{formatCurrency(calculateTotal())}</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            variant="outline"
            size="lg"
            disabled={!selectedCustomer || quoteItems.length === 0 || saveAsDraftMutation.isPending}
            onClick={() => saveAsDraftMutation.mutate()}
            className="border-amber-300 text-amber-700 hover:bg-amber-50"
          >
            {saveAsDraftMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Clock className="h-4 w-4 mr-1.5" />
                {editingDraftId ? 'Save' : 'Save Draft'}
              </>
            )}
          </Button>
        <Button
          className="bg-green-600 hover:bg-green-700"
          size="lg"
          disabled={!selectedCustomer || quoteItems.length === 0 || quoteItems.some(item => item.customPrice <= 0 || item.quantity < 1 || (item.sellingType === 'pallets' && !!item.palletMoq && item.palletMoq > 1 && item.quantity < item.palletMoq)) || createQuoteMutation.isPending}
          onClick={handleCreateQuote}
        >
          {createQuoteMutation.isPending ? (
            "Creating..."
          ) : (
            <>
              <Send className="h-4 w-4 mr-2" />
              {'Create & Send'}
            </>
          )}
        </Button>
        </div>
      </div>
    </div>
  );
}
