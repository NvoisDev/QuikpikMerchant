import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency } from "@/lib/currencies";
import { getPackQuantity } from "@shared/utils/product";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
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
  ChevronsUpDown,
  ArrowLeft,
  UserPlus,
  Truck,
  MapPin,
  Search,
  Building2
} from "lucide-react";
import { Link } from "wouter";
import { DialogDescription } from "@/components/ui/dialog";

interface QuoteItem {
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

export default function QuickQuote() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [quoteItems, setQuoteItems] = useState<QuoteItem[]>([]);
  const [productDialogOpen, setProductDialogOpen] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [addCustomerDialogOpen, setAddCustomerDialogOpen] = useState(false);
  const [sendMethod, setSendMethod] = useState<'sms' | 'link'>('sms');
  const [copiedLink, setCopiedLink] = useState(false);
  const [createdQuote, setCreatedQuote] = useState<{
    orderNumber: string;
    paymentLink: string;
  } | null>(null);
  const [newCustomer, setNewCustomer] = useState({
    firstName: '',
    lastName: '',
    phoneNumber: '',
    email: '',
    businessName: '',
  });
  const [depositPercentage, setDepositPercentage] = useState<0 | 25 | 50 | 75 | 100>(100);
  const [balanceDueDays, setBalanceDueDays] = useState<0 | 7 | 14 | 30 | 60>(0);
  const [quotePaymentMethod, setQuotePaymentMethod] = useState<'payment_link' | 'cash' | 'bank_transfer' | 'cheque'>('payment_link');
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

  const { data: collectionAddresses = [] } = useQuery<CollectionAddress[]>({
    queryKey: ['/api/collection-addresses'],
  });
  const activeCollectionAddresses = collectionAddresses.filter((a: CollectionAddress) => a.isActive !== false);

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
      setNewCustomer({ firstName: '', lastName: '', phoneNumber: '', email: '', businessName: '' });
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

  const createQuoteMutation = useMutation({
    mutationFn: async (data: {
      customerId: string;
      items: QuoteItem[];
      sendVia: 'sms' | 'link';
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
      const response = await apiRequest('POST', '/api/quotes', data);
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Failed to create quote' }));
        throw new Error(err.error || 'Failed to create quote');
      }
      return response.json();
    },
    onSuccess: (data) => {
      setCreatedQuote({
        orderNumber: data.orderNumber,
        paymentLink: data.paymentLink
      });
      queryClient.invalidateQueries({ queryKey: ['/api/orders'] });
      toast({
        title: "Quote Created",
        description: sendMethod === 'link' 
          ? "Payment link generated. Copy and share it with your customer."
          : `Quote sent to customer via ${sendMethod.toUpperCase()}.`,
      });
    },
    onError: (error: Error) => {
      const e = error as Error & { errorType?: string; available?: number; requested?: number; productName?: string };
      toast({
        title: e.errorType === "OUT_OF_STOCK" ? "Stock Unavailable" : "Error",
        description: e.errorType === "OUT_OF_STOCK" && e.available != null && e.requested != null
          ? `Only ${e.available} units of "${e.productName || "this product"}" are in stock — you requested ${e.requested}. Please reduce the quantity.`
          : (error.message || "Failed to create quote"),
        variant: "destructive",
      });
    },
  });

  const addProduct = (product: Product, sellingType: 'units' | 'pallets' = 'units') => {
    const availableStock = sellingType === 'pallets' ? (product.palletStock || 0) : ((product.totalBatchStock ?? product.stock) || 0);
    if (availableStock <= 0) {
      toast({
        title: "Out of Stock",
        description: `"${product.name}" is out of stock and cannot be added to this quote.`,
        variant: "destructive",
      });
      setProductDialogOpen(false);
      return;
    }

    const price = sellingType === 'pallets' && product.palletPrice 
      ? parseFloat(product.palletPrice) 
      : parseFloat(product.price);

    const unitCost = product.costPrice ? parseFloat(product.costPrice) : 0;
    // For pallet lines, cost must be per-pallet (unit cost × units-per-pallet) so it matches the per-pallet selling price
    const baseCost = sellingType === 'pallets' && product.unitsPerPallet
      ? unitCost * product.unitsPerPallet
      : unitCost;
    const parsedUnitWeight = parseFloat(product.unitWeight ?? '0') || 0;
    const weightKg = sellingType === 'pallets'
      ? (product.palletWeight ? parseFloat(product.palletWeight) : 0)
      : parsedUnitWeight > 0
        ? parsedUnitWeight * (product.quantityInPack || 1)
        : parseFloat(product.totalPackageWeight ?? '0') || 0;
    
    // Check if already added with same product AND selling type
    const existingIndex = quoteItems.findIndex(
      item => item.productId === product.id && item.sellingType === sellingType
    );
    
    const stableKey = `${product.id}-${sellingType}`;
    if (existingIndex >= 0) {
      const updated = [...quoteItems];
      updated[existingIndex].quantity += 1;
      setQuoteItems(updated);
    } else {
      setQuoteItems(prev => [...prev, {
        productId: product.id,
        productName: product.name + (sellingType === 'pallets' ? ' (Pallet)' : ''),
        originalPrice: price,
        customPrice: price,
        quantity: 1,
        sellingType,
        unitsPerPallet: product.unitsPerPallet,
        promotionalOffers: product.promotionalOffers || [],
        costPrice: baseCost,
        weightKg,
        packQuantity: getPackQuantity(product) > 1 ? getPackQuantity(product) : undefined,
        unitSize: (product.sizePerUnit || product.unitSize) ?? undefined,
        unitOfMeasure: product.unitOfMeasure ?? undefined,
      }]);
      setInputValues(prev => ({
        ...prev,
        [stableKey]: { price: price.toString(), qty: '1' }
      }));
      setCostValues(prev => ({
        ...prev,
        [stableKey]: baseCost.toString()
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
      const flatRate = (user as any)?.deliveryFlatRate;
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

  const handleCreateQuote = () => {
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
        description: "Please add at least one product to the quote",
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
      sendVia: sendMethod,
      depositPercentage,
      balanceDueDays: depositPercentage === 100 || depositPercentage === 0 ? 0 : balanceDueDays,
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

  const resetQuote = () => {
    setSelectedCustomer(null);
    setQuoteItems([]);
    setInputValues({});
    setCostValues({});
    setCreatedQuote(null);
    setSendMethod('sms');
    setDepositPercentage(100);
    setBalanceDueDays(0);
    setQuotePaymentMethod('payment_link');
    setFulfillmentType('pickup');
    setDeliveryAddressId(null);
    setDeliveryAddressText('');
    setUseCustomAddress(false);
    setCustomAddressFields({ addressLine1: '', city: '', postalCode: '', state: '', label: '' });
  };

  const totalWeight = calculateTotalWeight();

  if (createdQuote) {
    return (
      <div className="p-4 md:p-6 max-w-2xl mx-auto">
        <Card>
          <CardHeader className="text-center p-4 md:p-6">
            <div className="mx-auto w-12 h-12 md:w-16 md:h-16 bg-green-100 rounded-full flex items-center justify-center mb-3 md:mb-4">
              <Check className="h-6 w-6 md:h-8 md:w-8 text-green-600" />
            </div>
            <CardTitle className="text-xl md:text-2xl">Quote Created!</CardTitle>
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

            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 pt-2 md:pt-4">
              <Button 
                variant="outline" 
                className="flex-1"
                onClick={resetQuote}
              >
                New Quote
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
    );
  }

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center gap-3 md:gap-4 mb-4 md:mb-6 pl-10 lg:pl-0">
        <Link href="/orders">
          <Button variant="ghost" size="icon" className="shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold">Quick Quote</h1>
          <p className="text-sm md:text-base text-gray-600 truncate">Create quotes with custom prices</p>
        </div>
      </div>

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
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add New Customer</DialogTitle>
                      <DialogDescription>Add a customer to create a quote for them.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 mt-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label htmlFor="firstName">First Name *</Label>
                          <Input
                            id="firstName"
                            value={newCustomer.firstName}
                            onChange={(e) => setNewCustomer({...newCustomer, firstName: e.target.value})}
                            placeholder="John"
                          />
                        </div>
                        <div>
                          <Label htmlFor="lastName">Last Name</Label>
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
                        <Label htmlFor="businessName">Business Name</Label>
                        <Input
                          id="businessName"
                          value={newCustomer.businessName}
                          onChange={(e) => setNewCustomer({...newCustomer, businessName: e.target.value})}
                          placeholder="Acme Ltd"
                        />
                      </div>
                      <Button
                        className="w-full bg-green-600 hover:bg-green-700"
                        disabled={!newCustomer.firstName || !newCustomer.phoneNumber || addCustomerMutation.isPending}
                        onClick={() => addCustomerMutation.mutate(newCustomer)}
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
                  className="w-full justify-between font-normal"
                >
                  {selectedCustomer ? (
                    <span className="flex flex-col items-start text-left">
                      <span>{selectedCustomer.firstName} {selectedCustomer.lastName || ''}</span>
                      <span className="text-xs text-gray-500">{selectedCustomer.phoneNumber}</span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Choose a customer...</span>
                  )}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
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
                        const name = `${c.firstName} ${c.lastName || ''}`.toLowerCase();
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
                            <span className="font-medium truncate">{customer.firstName} {customer.lastName || ''}</span>
                            <span className="text-xs text-gray-500">{customer.phoneNumber}</span>
                          </div>
                        </button>
                      ));
                    })()}
                  </div>
                </SheetContent>
              </Sheet>

              {selectedCustomer && (
                <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                  <div className="font-medium">
                    {selectedCustomer.firstName} {selectedCustomer.lastName || ''}
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
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Quote Items
                </CardTitle>
                <Dialog open={productDialogOpen} onOpenChange={(open) => { setProductDialogOpen(open); if (open) setProductSearch(""); }}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="bg-green-600 hover:bg-green-700">
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
                    {(() => {
                      const filteredProducts = products.filter((p) =>
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
                                <div className={`text-xs font-medium ${unitInStock ? 'text-gray-500' : 'text-gray-400'}`}>Per Unit</div>
                                <div className="mt-1">
                                  <div className={`font-semibold ${unitInStock ? 'text-green-600' : 'text-gray-400'}`}>
                                    {promoUnitPrice !== null ? (
                                      <>
                                        <span className="line-through text-gray-400 font-normal mr-1">{formatCurrency(product.price)}</span>
                                        {formatCurrency(promoUnitPrice)}
                                      </>
                                    ) : (
                                      <>{formatCurrency(product.price)}</>
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
                  <p className="text-sm">Click "Add Product" to start building your quote</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {quoteItems.map((item, index) => (
                    <div key={`${item.productId}-${item.sellingType}`} className="p-3 bg-gray-50 rounded-lg">
                      {/* Product name and original price - full width on mobile */}
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate flex items-center gap-2">
                            {item.productName}
                            {item.sellingType === 'pallets' && (
                              <Badge variant="secondary" className="bg-blue-100 text-blue-700 text-xs">
                                Pallet
                              </Badge>
                            )}
                          </div>
                          <div className="text-sm text-gray-500">
                            Original: {formatCurrency(item.originalPrice)}{item.sellingType === 'pallets' ? '/pallet' : '/unit'}
                            {item.customPrice < item.originalPrice && (
                              <Badge variant="secondary" className="ml-2 text-green-600">
                                <Percent className="h-3 w-3 mr-1" />
                                {((1 - item.customPrice / item.originalPrice) * 100).toFixed(0)}% off
                              </Badge>
                            )}
                          </div>
                          {item.packQuantity && item.unitSize && item.unitOfMeasure && (
                            <span className="text-xs text-gray-400">
                              {item.packQuantity} × {item.unitSize}{item.unitOfMeasure}
                            </span>
                          )}
                          {item.weightKg > 0 && (
                            <span className="text-xs text-gray-400">
                              {item.weightKg.toFixed(2)} kg/{item.sellingType === 'pallets' ? 'pallet' : item.packQuantity && item.packQuantity > 1 ? 'pack' : 'unit'}
                            </span>
                          )}
                          {item.promotionalOffers && item.promotionalOffers.length > 0 && item.sellingType !== 'pallets' && (() => {
                            const now = new Date();
                            const activeOffers = item.promotionalOffers.filter((o: any) => {
                              if (o.isActive === false) return false;
                              if (o.startDate && new Date(o.startDate) > now) return false;
                              if (o.endDate && new Date(o.endDate) < now) return false;
                              return true;
                            });
                            if (activeOffers.length === 0) return null;
                            return (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {activeOffers.map((offer: any, oi: number) => (
                                  <Badge key={oi} variant="secondary" className={
                                    offer.type === 'percentage_discount' ? 'bg-red-100 text-red-700 text-xs' :
                                    offer.type === 'fixed_price' ? 'bg-green-100 text-green-700 text-xs' :
                                    offer.type === 'buy_x_get_y_free' ? 'bg-purple-100 text-purple-700 text-xs' :
                                    offer.type === 'bundle_deal' ? 'bg-blue-100 text-blue-700 text-xs' :
                                    offer.type === 'clearance' ? 'bg-orange-100 text-orange-700 text-xs' :
                                    'bg-purple-100 text-purple-700 text-xs'
                                  }>
                                    {offer.type === 'percentage_discount' ? `${offer.discountPercentage}% Off` :
                                     offer.type === 'fixed_price' ? `${formatCurrency(offer.fixedPrice)} each` :
                                     offer.type === 'buy_x_get_y_free' ? `Buy ${offer.buyQuantity} Get ${offer.getQuantity} Free` :
                                     offer.type === 'bundle_deal' ? `${offer.minQuantity}+ @ ${formatCurrency(offer.fixedPrice)} each` :
                                     offer.type === 'clearance' ? `Clearance ${formatCurrency(offer.fixedPrice)}` :
                                     offer.name || 'Promo Active'}
                                  </Badge>
                                ))}
                              <p className="text-[11px] text-gray-400 mt-0.5 italic">Promo shown for reference — price & qty are entered manually</p>
                              </div>
                            );
                          })()}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-red-500 hover:text-red-700 hover:bg-red-50 shrink-0 -mt-1 -mr-1"
                          onClick={() => removeItem(index)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      {/* Price, Qty, Total row */}
                      <div className="flex items-end gap-3">
                        <div className="flex-1">
                          <Label className="text-xs text-gray-500">Price</Label>
                          <Input
                            type="text"
                            inputMode="decimal"
                            pattern="[0-9]*\.?[0-9]*"
                            value={inputValues[`${item.productId}-${item.sellingType}`]?.price ?? item.customPrice.toString()}
                            onChange={(e) => {
                              const val = e.target.value;
                              const sk = `${item.productId}-${item.sellingType}`;
                              if (val === '' || /^\d*\.?\d*$/.test(val)) {
                                setInputValues(prev => ({
                                  ...prev,
                                  [sk]: { ...prev[sk], price: val }
                                }));
                              }
                            }}
                            onBlur={(e) => {
                              const val = parseFloat(e.target.value);
                              const sk = `${item.productId}-${item.sellingType}`;
                              if (!isNaN(val) && val >= 0) {
                                updateItemPrice(index, val);
                                setInputValues(prev => ({
                                  ...prev,
                                  [sk]: { ...prev[sk], price: val.toString() }
                                }));
                              } else {
                                setInputValues(prev => ({
                                  ...prev,
                                  [sk]: { ...prev[sk], price: item.customPrice.toString() }
                                }));
                              }
                            }}
                            className="h-8"
                          />
                        </div>
                        <div className="w-16">
                          <Label className="text-xs text-gray-500">Qty</Label>
                          <Input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={inputValues[`${item.productId}-${item.sellingType}`]?.qty ?? item.quantity.toString()}
                            onChange={(e) => {
                              const val = e.target.value;
                              const sk = `${item.productId}-${item.sellingType}`;
                              if (val === '' || /^\d*$/.test(val)) {
                                setInputValues(prev => ({
                                  ...prev,
                                  [sk]: { ...prev[sk], qty: val }
                                }));
                              }
                            }}
                            onBlur={(e) => {
                              const val = parseInt(e.target.value);
                              const sk = `${item.productId}-${item.sellingType}`;
                              if (!isNaN(val) && val >= 1) {
                                updateItemQuantity(index, val);
                                setInputValues(prev => ({
                                  ...prev,
                                  [sk]: { ...prev[sk], qty: val.toString() }
                                }));
                              } else {
                                updateItemQuantity(index, 1);
                                setInputValues(prev => ({
                                  ...prev,
                                  [sk]: { ...prev[sk], qty: '1' }
                                }));
                              }
                            }}
                            className="h-8"
                          />
                        </div>
                        <div className="w-20 text-right">
                          <Label className="text-xs text-gray-500">Total</Label>
                          <div className="font-semibold">
                            {formatCurrency(item.customPrice * item.quantity)}
                          </div>
                        </div>
                      </div>

                      {/* Cost + Margin row */}
                      {(() => {
                        const sk = `${item.productId}-${item.sellingType}`;
                        const costVal = costValues[sk] ?? item.costPrice.toString();
                        const costNum = parseFloat(costVal) || 0;
                        const livePrice = parseFloat(inputValues[sk]?.price ?? item.customPrice.toString()) || item.customPrice;
                        const marginAmt = livePrice - costNum;
                        const marginPct = livePrice > 0 ? (marginAmt / livePrice) * 100 : 0;
                        const isNegative = marginAmt < 0;
                        return (
                          <div className="flex items-end gap-3 mt-2 pt-2 border-t border-dashed border-gray-200">
                            <div className="w-24">
                              <Label className="text-xs text-gray-400">Cost (£)</Label>
                              <Input
                                type="text"
                                inputMode="decimal"
                                pattern="[0-9]*\.?[0-9]*"
                                value={costVal}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val === '' || /^\d*\.?\d*$/.test(val)) {
                                    setCostValues(prev => ({ ...prev, [sk]: val }));
                                  }
                                }}
                                onBlur={(e) => {
                                  const val = parseFloat(e.target.value);
                                  const newCost = !isNaN(val) && val >= 0 ? val : 0;
                                  updateItemCost(index, newCost);
                                  setCostValues(prev => ({ ...prev, [sk]: newCost.toString() }));
                                }}
                                className="h-8 text-xs"
                                placeholder="0.00"
                              />
                            </div>
                            <div className="flex-1 text-xs">
                              <Label className="text-xs text-gray-400">Margin / unit</Label>
                              <div className={`font-medium mt-1.5 ${isNegative ? 'text-red-600' : 'text-green-700'}`}>
                                {formatCurrency(marginAmt)} ({marginPct.toFixed(1)}%)
                              </div>
                            </div>
                            {item.weightKg > 0 && (
                              <div className="text-xs text-gray-400 text-right">
                                <Label className="text-xs text-gray-400">Weight</Label>
                                <div className="mt-1.5">{(item.weightKg * item.quantity).toFixed(2)} kg</div>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Quote Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
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
                <span>Items</span>
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
                        <span>{totalWeight.toFixed(2)} kg</span>
                      </div>
                    )}
                  </div>
                </>
              )}

              <Separator />

              <div>
                <Label className="text-sm font-medium mb-2 block">Delivery Method</Label>
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
                    <span className="text-xs text-gray-400">editable per quote</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">
                    {(user as any)?.deliveryFlatRate ? `Default rate: ${formatCurrency((user as any).deliveryFlatRate)}` : 'No default rate set in settings'}
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

              <Separator />

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
                    ] as const).map(({ value, label }) => (
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

              {depositPercentage > 0 && depositPercentage < 100 && (
                <div>
                  <Label className="text-sm font-medium mb-2 block">Balance Due In</Label>
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
                        onClick={() => setBalanceDueDays(option.value as 0 | 7 | 14 | 30 | 60)}
                      >
                        {option.label}
                      </Button>
                    ))}
                  </div>
                  {balanceDueDays > 0 && (
                    <p className="text-xs text-gray-500 mt-2">
                      Customer will be reminded to pay the remaining {formatCurrency(calculateRemainingBalance())} within {balanceDueDays} days
                    </p>
                  )}
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Send Quote</CardTitle>
              <CardDescription>
                {depositPercentage > 0 && quotePaymentMethod !== 'payment_link'
                  ? 'How would you like to notify the customer?'
                  : 'How would you like to share the payment link?'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant={sendMethod === 'sms' ? 'default' : 'outline'}
                  className={sendMethod === 'sms' ? 'bg-green-600' : ''}
                  onClick={() => setSendMethod('sms')}
                >
                  <MessageSquare className="h-4 w-4 mr-1" />
                  SMS
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

              <Button
                className="w-full bg-green-600 hover:bg-green-700"
                size="lg"
                disabled={!selectedCustomer || quoteItems.length === 0 || createQuoteMutation.isPending}
                onClick={handleCreateQuote}
              >
                {createQuoteMutation.isPending ? (
                  "Creating Quote..."
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Create & Send Quote
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
