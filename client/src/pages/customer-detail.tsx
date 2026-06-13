import { useState, useMemo, useCallback } from "react";
import { useCurrency } from "@/hooks/useCurrency";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { BusinessSearchInput, AddressSearchInput, type BusinessPlaceResult, type AddressPlaceResult } from "@/components/BusinessSearchInput";
import {
  ArrowLeft,
  MoreHorizontal,
  Phone,
  Mail,
  MapPin,
  ShoppingBag,
  DollarSign,
  Calendar,
  Edit3,
  Plus,
  Trash2,
  Pencil,
  X,
  Check,
  Home,
  Building2,
  Warehouse,
  Copy,
  Package,
  Clock,
  CheckCircle,
  XCircle,
  Truck,
  FileText,
  MessageSquare,
  ExternalLink,
  MessageCircle,
  ShieldX,
  UserPlus,
  Users,
  Share2,
  Bell,
  Tag,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useAuth, type AuthUser } from "@/hooks/useAuth";
import { formatDateShort } from "@shared/utils/date";

interface Customer {
  id: string;
  firstName: string;
  lastName?: string;
  email?: string;
  phoneNumber: string;
  businessName?: string;
  streetAddress?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  groupNames: string[];
  groupIds: number[];
  totalOrders: number;
  totalSpent: number;
  totalUnpaid?: number;
  lastOrderDate?: Date;
  createdAt: Date;
}

interface DeliveryAddress {
  id: number;
  customerId: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state?: string;
  postalCode: string;
  country: string;
  label?: string;
  instructions?: string;
  isDefault: boolean;
}

interface Order {
  id: number;
  orderNumber?: string;
  retailerId?: string;
  customerName?: string;
  total: string;
  status: string;
  createdAt: string;
  fulfillmentType?: string;
  paymentStatus?: string;
  depositPercentage?: number;
  amountPaid?: string;
}

export default function CustomerDetail() {
  const [, navigate] = useLocation();
  const [match, params] = useRoute("/customers/:customerId");
  const customerId = params?.customerId || "";
  const { toast } = useToast();
  const { user } = useAuth();
  const isViewer = (user as AuthUser)?.teamMemberRole === 'viewer';
  const { formatMoney } = useCurrency();
  const { data: alertsData } = useQuery<{ count: number }>({ queryKey: ["/api/stock-alerts/count"] });

  const handleShareStore = async () => {
    const effectiveUserId = user?.role === 'team_member' && user?.wholesalerId ? user.wholesalerId : user?.id;
    const url = `https://quikpik.app/customer/${effectiveUserId}`;
    const name = user?.businessName || "My Store";
    if (navigator.share) {
      try { await navigator.share({ title: name, url }); return; } catch {}
    }
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Store Link Copied!", description: "Paste it anywhere to share!" });
    } catch {
      toast({ title: "Share Store", description: `Copy: ${url}`, duration: 8000 });
    }
  };
  const queryClient = useQueryClient();

  const [isEditContactOpen, setIsEditContactOpen] = useState(false);
  const [isEditAddressesOpen, setIsEditAddressesOpen] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [addressFormData, setAddressFormData] = useState({
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    postalCode: "",
    country: "",
    label: "",
  });

  const [contactFormData, setContactFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phoneNumber: "",
    businessName: "",
    streetAddress: "",
    addressLine2: "",
    city: "",
    postalCode: "",
    country: "",
  });

  const handleBusinessSearchEdit = useCallback((result: BusinessPlaceResult) => {
    setContactFormData((prev) => ({
      ...prev,
      ...(result.businessName && { businessName: result.businessName }),
      ...(result.streetAddress && { streetAddress: result.streetAddress }),
      ...(result.city && { city: result.city }),
      ...(result.postalCode && { postalCode: result.postalCode }),
      ...(result.country && { country: result.country }),
    }));
  }, []);

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const customer = useMemo(() => customers.find((c) => c.id === customerId), [customers, customerId]);

  const { data: addresses = [], isLoading: addressesLoading } = useQuery<DeliveryAddress[]>({
    queryKey: [`/api/wholesaler/customers/${customerId}/addresses`],
    enabled: !!customerId,
  });

  const { data: customerOrders = [] } = useQuery<Order[]>({
    queryKey: [`/api/customers/${customerId}/orders`],
    enabled: !!customerId,
    staleTime: 2 * 60 * 1000,
  });

  const updateCustomerMutation = useMutation({
    mutationFn: async (updates: Partial<Customer>) => {
      const response = await fetch(`/api/customers/${customerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(updates),
      });
      if (!response.ok) throw new Error("Failed to update customer");
      return response.json();
    },
    onSuccess: (data, updates) => {
      queryClient.setQueryData(["/api/customers"], (old: Customer[] | undefined) => {
        if (!old) return old;
        return old.map((c) => c.id === customerId ? { ...c, ...data } : c);
      });
      queryClient.invalidateQueries({ queryKey: ["/api/customers"], refetchType: 'none' });
      const nameChanged =
        (updates.firstName !== undefined && updates.firstName !== (customer?.firstName || '')) ||
        (updates.lastName !== undefined && updates.lastName !== (customer?.lastName || ''));
      if (nameChanged) {
        toast({ title: "Customer name updated", description: "All future invoices will reflect this change." });
      } else {
        toast({ title: "Customer updated" });
      }
      setIsEditContactOpen(false);
    },
    onError: () => {
      toast({ title: "Failed to update", variant: "destructive" });
    },
  });

  const addAddressMutation = useMutation({
    mutationFn: async (data: typeof addressFormData) => {
      const response = await apiRequest("POST", `/api/wholesaler/customers/${customerId}/addresses`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/wholesaler/customers/${customerId}/addresses`] });
      toast({ title: "Address added" });
      resetAddressForm();
    },
    onError: () => {
      toast({ title: "Failed to add address", variant: "destructive" });
    },
  });

  const updateAddressMutation = useMutation({
    mutationFn: async ({ addressId, data }: { addressId: number; data: typeof addressFormData }) => {
      const response = await apiRequest("PUT", `/api/wholesaler/customers/${customerId}/addresses/${addressId}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/wholesaler/customers/${customerId}/addresses`] });
      toast({ title: "Address updated" });
      resetAddressForm();
    },
    onError: () => {
      toast({ title: "Failed to update address", variant: "destructive" });
    },
  });

  const deleteAddressMutation = useMutation({
    mutationFn: async (addressId: number) => {
      await apiRequest("DELETE", `/api/wholesaler/customers/${customerId}/addresses/${addressId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/wholesaler/customers/${customerId}/addresses`] });
      toast({ title: "Address deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete address", variant: "destructive" });
    },
  });

  const resetAddressForm = () => {
    setAddressFormData({ addressLine1: "", addressLine2: "", city: "", state: "", postalCode: "", country: "", label: "" });
    setShowAddForm(false);
    setEditingId(null);
  };

  const startEditAddress = (addr: DeliveryAddress) => {
    setEditingId(addr.id);
    setShowAddForm(true);
    setAddressFormData({
      addressLine1: addr.addressLine1 || "",
      addressLine2: addr.addressLine2 || "",
      city: addr.city || "",
      state: addr.state || "",
      postalCode: addr.postalCode || "",
      country: addr.country || "",
      label: addr.label || "",
    });
  };

  const handleAddressSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      updateAddressMutation.mutate({ addressId: editingId, data: addressFormData });
    } else {
      addAddressMutation.mutate(addressFormData);
    }
  };

  const getLabelIcon = (label?: string) => {
    switch (label?.toLowerCase()) {
      case "home": return <Home className="h-4 w-4" />;
      case "office": return <Building2 className="h-4 w-4" />;
      case "warehouse": return <Warehouse className="h-4 w-4" />;
      default: return <MapPin className="h-4 w-4" />;
    }
  };

  const openEditContact = () => {
    if (!customer) return;
    setContactFormData({
      firstName: customer.firstName || "",
      lastName: customer.lastName || "",
      email: customer.email || "",
      phoneNumber: customer.phoneNumber || "",
      businessName: customer.businessName || "",
      streetAddress: customer.streetAddress || "",
      addressLine2: customer.addressLine2 || "",
      city: customer.city || "",
      postalCode: customer.postalCode || "",
      country: customer.country || "",
    });
    setIsEditContactOpen(true);
  };

  const handleContactSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateCustomerMutation.mutate(contactFormData);
  };

  const sendWelcomeMessageMutation = useMutation({
    mutationFn: (id: string) => apiRequest('POST', `/api/customers/${id}/send-welcome`),
    onSuccess: (data: any) => {
      const { welcomeMessages } = data;
      const parts = [];
      if (welcomeMessages?.emailSent) parts.push("email");
      if (welcomeMessages?.smsSent) parts.push("SMS");
      if (welcomeMessages?.whatsappSent) parts.push("WhatsApp");
      toast({ title: "Welcome Sent", description: parts.length ? `Sent via ${parts.join(", ")}` : "Welcome message sent" });
    },
    onError: () => toast({ title: "Failed to send welcome", variant: "destructive" }),
  });

  const removeCustomerAccessMutation = useMutation({
    mutationFn: (id: string) => apiRequest('DELETE', `/api/wholesaler/customer/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
      toast({ title: "Access removed" });
    },
    onError: () => toast({ title: "Failed to remove access", variant: "destructive" }),
  });

  const allowCustomerAccessMutation = useMutation({
    mutationFn: (data: { email: string; phoneNumber?: string; firstName?: string; lastName?: string }) =>
      apiRequest('POST', '/api/wholesaler/invite', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
      toast({ title: "Access granted" });
    },
    onError: () => toast({ title: "Failed to grant access", variant: "destructive" }),
  });

  const deleteCustomerMutation = useMutation({
    mutationFn: (id: string) => apiRequest('DELETE', `/api/customers/${id}`),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
      toast({ title: data.archived ? "Customer archived" : "Customer deleted" });
      navigate("/customers");
    },
    onError: () => toast({ title: "Failed to delete customer", variant: "destructive" }),
  });

  const addCustomerToGroupMutation = useMutation({
    mutationFn: ({ groupId, customerId: cId }: { groupId: number; customerId: string }) =>
      apiRequest('POST', `/api/customer-groups/${groupId}/members/${cId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/customer-groups'] });
      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
      toast({ title: "Added to group" });
      setIsAddToGroupOpen(false);
    },
    onError: (error: any) => toast({ title: "Error", description: error.message || "Failed to add to group", variant: "destructive" }),
  });

  const [isAddToGroupOpen, setIsAddToGroupOpen] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<number>(0);

  interface CustomerGroup { id: number; name: string; }
  const { data: customerGroups = [] } = useQuery<CustomerGroup[]>({
    queryKey: ['/api/customer-groups'],
  });

  const [isAddToPriceListOpen, setIsAddToPriceListOpen] = useState(false);
  const [selectedPriceListId, setSelectedPriceListId] = useState<number>(0);

  interface PriceListSummary { id: number; name: string; }
  const { data: allPriceLists = [] } = useQuery<PriceListSummary[]>({
    queryKey: ['/api/price-lists'],
  });

  const addToPriceListMutation = useMutation({
    mutationFn: async (priceListId: number) => {
      const res = await fetch(`/api/price-lists/${priceListId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch price list');
      const priceList = await res.json();
      const existing: { customerId?: string | null; customerGroupId?: number | null }[] = priceList.assignments || [];
      const newAssignments = [...existing, { customerId }];
      await apiRequest('PUT', `/api/price-lists/${priceListId}/assignments`, newAssignments);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/price-lists/customer-summary'] });
      toast({ title: 'Added to price list' });
      setIsAddToPriceListOpen(false);
      setSelectedPriceListId(0);
    },
    onError: (error: any) => toast({ title: 'Error', description: error.message || 'Failed to add to price list', variant: 'destructive' }),
  });

  const removeFromPriceListMutation = useMutation({
    mutationFn: async (priceListId: number) => {
      await apiRequest('DELETE', `/api/price-lists/${priceListId}/customers/${customerId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/price-lists/customer-summary'] });
      toast({ title: 'Removed from price list' });
    },
    onError: (error: any) => toast({ title: 'Error', description: error.message || 'Failed to remove from price list', variant: 'destructive' }),
  });

  const { data: priceListCustomerSummary = {} } = useQuery<Record<string, { count: number; names: string[]; ids: number[]; directIds: number[] }>>({
    queryKey: ['/api/price-lists/customer-summary'],
    enabled: !!customerId,
  });

  const customerPriceLists = customerId ? priceListCustomerSummary[customerId] : null;

  interface PriceListDetailItem {
    productId: number;
    customPrice: string | null;
    discountPercentage: string | null;
    product: { id: number; name: string; price: string } | null;
  }
  interface PriceListDetail { id: number; items: PriceListDetailItem[]; }

  const [priceBreakdownExpanded, setPriceBreakdownExpanded] = useState(false);
  const [priceBreakdownCache, setPriceBreakdownCache] = useState<Record<number, PriceListDetail>>({});
  const [priceBreakdownLoading, setPriceBreakdownLoading] = useState(false);

  const togglePriceBreakdown = async () => {
    if (!customerPriceLists || customerPriceLists.count === 0) return;
    if (!priceBreakdownExpanded) {
      const missingIds = customerPriceLists.ids.filter((id) => !priceBreakdownCache[id]);
      if (missingIds.length > 0) {
        setPriceBreakdownLoading(true);
        try {
          const results = await Promise.all(
            missingIds.map(async (id) => {
              const r = await fetch(`/api/price-lists/${id}`, { credentials: 'include' });
              if (!r.ok) throw new Error(`Failed to fetch price list ${id}`);
              return r.json() as Promise<PriceListDetail>;
            })
          );
          setPriceBreakdownCache((prev) => {
            const next = { ...prev };
            results.forEach((detail) => { next[detail.id] = detail; });
            return next;
          });
        } catch {
          toast({ title: 'Could not load pricing', variant: 'destructive' });
        } finally {
          setPriceBreakdownLoading(false);
        }
      }
    }
    setPriceBreakdownExpanded((v) => !v);
  };

  const computeEffectivePrice = (item: PriceListDetailItem): number | null => {
    if (!item.product) return null;
    const base = parseFloat(item.product.price || '0');
    if (item.customPrice) return parseFloat(item.customPrice);
    if (item.discountPercentage) return parseFloat((base * (1 - parseFloat(item.discountPercentage) / 100)).toFixed(2));
    return null;
  };

  const priceBreakdownRows = useMemo(() => {
    if (!customerPriceLists) return [];
    const byProduct: Record<number, { name: string; standardPrice: number; best: number; listCount: number }> = {};
    customerPriceLists.ids.forEach((id) => {
      const detail = priceBreakdownCache[id];
      if (!detail) return;
      detail.items.forEach((item) => {
        if (!item.product) return;
        const effective = computeEffectivePrice(item);
        if (effective === null) return;
        const standard = parseFloat(item.product.price || '0');
        if (byProduct[item.productId]) {
          byProduct[item.productId].listCount += 1;
          if (effective < byProduct[item.productId].best) byProduct[item.productId].best = effective;
        } else {
          byProduct[item.productId] = { name: item.product.name, standardPrice: standard, best: effective, listCount: 1 };
        }
      });
    });
    return Object.values(byProduct).sort((a, b) => a.name.localeCompare(b.name));
  }, [customerPriceLists, priceBreakdownCache]);

  const hasPortalAccess = !!customer?.email;

  const defaultAddress = addresses.find((a) => a.isDefault) || addresses[0];

  const getInitials = () => {
    if (!customer) return "?";
    const nameInitials = `${customer.firstName?.[0] || ""}${customer.lastName?.[0] || ""}`.toUpperCase();
    if (nameInitials) return nameInitials;
    if (customer.businessName) return customer.businessName.slice(0, 2).toUpperCase();
    if (customer.phoneNumber) return customer.phoneNumber.replace(/\D/g, '').slice(-2);
    return "?";
  };

  const fullName = customer ? `${customer.firstName || ""} ${customer.lastName || ""}`.trim() : "Loading...";
  const displayName = customer?.businessName || fullName || customer?.phoneNumber || "Unknown";

  if (!match) return null;

  if (!customer) {
    return (
      <div className="max-w-2xl mx-auto p-4 space-y-4 bg-white min-h-screen">
        <Button variant="ghost" size="sm" onClick={() => navigate("/customers?tab=address-book")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <Card className="animate-pulse">
          <CardContent className="p-6 space-y-4">
            <div className="h-8 bg-gray-200 rounded w-1/3"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-4 bg-white min-h-screen">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate("/customers?tab=address-book")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="relative hover:bg-gray-100" onClick={handleShareStore}>
            <Share2 className="h-5 w-5" />
          </Button>
          <a href="/stock-alerts">
            <Button variant="ghost" size="icon" className="relative hover:bg-gray-100">
              <Bell className="h-5 w-5" />
              {(alertsData?.count ?? 0) > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                  {alertsData!.count}
                </span>
              )}
            </Button>
          </a>
          <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <MoreHorizontal className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => navigate(`/quick-quote?customerId=${customerId}`)}>
              <FileText className="h-4 w-4 mr-2" />
              Create invoice
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate(`/orders?customerId=${customerId}&search=${encodeURIComponent(fullName)}`)}>
              <ShoppingBag className="h-4 w-4 mr-2" />
              View orders
            </DropdownMenuItem>
            {!isViewer && (
              <DropdownMenuItem onClick={() => setTimeout(() => setIsAddToGroupOpen(true), 0)}>
                <Users className="h-4 w-4 mr-2" />
                Add to Group
              </DropdownMenuItem>
            )}
            {!isViewer && (
              <DropdownMenuItem onClick={() => setTimeout(() => setIsAddToPriceListOpen(true), 0)}>
                <Tag className="h-4 w-4 mr-2" />
                Add to Price List
              </DropdownMenuItem>
            )}
            {!isViewer && <DropdownMenuSeparator />}
            {!isViewer && (
              <DropdownMenuItem onClick={() => setTimeout(openEditContact, 0)}>
                <Edit3 className="h-4 w-4 mr-2" />
                Edit contact info
              </DropdownMenuItem>
            )}
            {!isViewer && (
              <DropdownMenuItem onClick={() => setTimeout(() => setIsEditAddressesOpen(true), 0)}>
                <MapPin className="h-4 w-4 mr-2" />
                Edit addresses
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={() => {
                const phone = customer?.phoneNumber?.replace(/[^0-9]/g, '');
                if (phone) window.open(`https://wa.me/${phone}`, '_blank');
              }}
            >
              <MessageCircle className="h-4 w-4 mr-2" />
              Send Message
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {customer?.phoneNumber && (
              <DropdownMenuItem onClick={() => window.open(`https://wa.me/${customer.phoneNumber.replace(/[^0-9]/g, '')}`, '_blank')}>
                <MessageSquare className="h-4 w-4 mr-2" />
                WhatsApp
              </DropdownMenuItem>
            )}
            {customer?.phoneNumber && (
              <DropdownMenuItem onClick={() => window.open(`tel:${customer.phoneNumber}`)}>
                <Phone className="h-4 w-4 mr-2" />
                Call
              </DropdownMenuItem>
            )}
            {customer?.email && (
              <DropdownMenuItem onClick={() => window.open(`mailto:${customer.email}`)}>
                <Mail className="h-4 w-4 mr-2" />
                Email
              </DropdownMenuItem>
            )}
            {!isViewer && <DropdownMenuSeparator />}
            {!isViewer && (hasPortalAccess ? (
              <DropdownMenuItem
                className="text-orange-600"
                onClick={() => {
                  if (confirm(`Remove portal access for ${fullName}? They will no longer be able to access your customer portal, but their order history will be preserved.`)) {
                    removeCustomerAccessMutation.mutate(customerId);
                  }
                }}
                disabled={removeCustomerAccessMutation.isPending}
              >
                <ShieldX className="h-4 w-4 mr-2" />
                Remove Access
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                className="text-green-600"
                onClick={() => {
                  if (customer?.email) {
                    allowCustomerAccessMutation.mutate({
                      email: customer.email,
                      phoneNumber: customer.phoneNumber,
                      firstName: customer.firstName,
                      lastName: customer.lastName,
                    });
                  } else {
                    toast({ title: "Email Required", description: "Customer must have an email address to grant access.", variant: "destructive" });
                  }
                }}
                disabled={allowCustomerAccessMutation.isPending || !customer?.email}
              >
                <UserPlus className="h-4 w-4 mr-2" />
                Allow Access
              </DropdownMenuItem>
            ))}
            {!isViewer && (
              <DropdownMenuItem
                className="text-red-600"
                onClick={() => {
                  if (confirm(`Are you sure you want to delete ${fullName}? This action cannot be undone.`)) {
                    deleteCustomerMutation.mutate(customerId);
                  }
                }}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        </div>
      </div>

      <div className="flex items-start space-x-4">
        <Avatar className="h-14 w-14">
          <AvatarFallback className="bg-blue-100 text-blue-700 text-lg font-semibold">
            {getInitials()}
          </AvatarFallback>
        </Avatar>
        <div>
          <h1 className="text-xl font-bold">{displayName}</h1>
          {customer.businessName && fullName && (
            <p className="text-sm text-gray-600">{fullName}</p>
          )}
          <p className="text-sm text-muted-foreground">
            Since {formatDateShort(customer.createdAt)}
            {customer.city && ` · ${customer.city}${customer.country ? `, ${customer.country}` : ""}`}
          </p>
          <div className="flex flex-wrap gap-1 mt-1">
            {customer.groupNames?.map((g, i) => (
              <Badge key={i} variant="outline" className="text-xs">{g}</Badge>
            ))}
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-muted-foreground mb-3">Quick actions</h2>
        <div className="flex gap-2">
          <Button
            className="flex-1 flex flex-col items-center gap-1 h-auto py-3 rounded-xl bg-green-600 hover:bg-green-700 text-white"
            onClick={() => navigate(`/quick-quote?customerId=${customerId}`)}
          >
            <FileText className="h-4 w-4" />
            <span className="text-xs font-medium">Raise Invoice</span>
          </Button>
          <Button
            variant="outline"
            className="flex-1 flex flex-col items-center gap-1 h-auto py-3 rounded-xl"
            onClick={() => navigate(`/orders?customerId=${customerId}&search=${encodeURIComponent(fullName)}`)}
          >
            <ShoppingBag className="h-4 w-4" />
            <span className="text-xs font-medium">View Orders</span>
          </Button>
          {customer.phoneNumber && (
            <Button
              variant="outline"
              className="flex-1 flex flex-col items-center gap-1 h-auto py-3 rounded-xl"
              onClick={() => window.open(`https://wa.me/${customer.phoneNumber.replace(/[^0-9]/g, '')}`, '_blank')}
            >
              <MessageSquare className="h-4 w-4" />
              <span className="text-xs font-medium">WhatsApp</span>
            </Button>
          )}
        </div>
      </div>

      <Separator />

      <div>
        <h2 className="text-sm font-semibold text-muted-foreground mb-3">Insights</h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm">Total spend</span>
            <span className="text-sm font-semibold">{formatMoney(customer.totalSpent || 0)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Paid</span>
            <span className="text-sm font-semibold text-green-600">{formatMoney(customer.totalSpent || 0)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Unpaid</span>
            <span className="text-sm font-semibold text-red-500">{formatMoney(customer.totalUnpaid || 0)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Last order</span>
            <span className="text-sm font-semibold">
              {customer.lastOrderDate ? formatDateShort(customer.lastOrderDate) : "No orders yet"}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Total orders</span>
            <span className="text-sm font-semibold">{customer.totalOrders || 0}</span>
          </div>
        </div>
      </div>

      <Separator />

      <div>
        <h2 className="text-sm font-semibold text-muted-foreground mb-3">Contact information</h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">{customer.phoneNumber}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => {
                navigator.clipboard.writeText(customer.phoneNumber);
                toast({ title: "Phone copied" });
              }}
            >
              <Copy className="h-3 w-3" />
            </Button>
          </div>
          {customer.email && (
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{customer.email}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => {
                  navigator.clipboard.writeText(customer.email || "");
                  toast({ title: "Email copied" });
                }}
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
      </div>

      <Separator />

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-muted-foreground">Price lists</h2>
          <div className="flex items-center gap-2">
            {customerPriceLists && customerPriceLists.count > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-blue-600 h-auto p-0"
                onClick={() => navigate(`/customers?tab=price-lists&customerId=${customerId}&customerName=${encodeURIComponent(fullName)}`)}
              >
                View all
              </Button>
            )}
            {!isViewer && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-green-600 h-auto p-0"
                onClick={() => setIsAddToPriceListOpen(true)}
              >
                <Plus className="h-3 w-3 mr-1" />
                Add
              </Button>
            )}
          </div>
        </div>
        {customerPriceLists && customerPriceLists.count > 0 ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {customerPriceLists.names.map((name, i) => (
                <Badge
                  key={customerPriceLists.ids[i]}
                  variant="secondary"
                  className="cursor-pointer hover:bg-blue-100 hover:text-blue-700 transition-colors text-xs py-1 px-2 flex items-center gap-1"
                  onClick={() => navigate(`/customers?tab=price-lists&priceListId=${customerPriceLists.ids[i]}&customerId=${customerId}&customerName=${encodeURIComponent(fullName)}`)}
                >
                  <Tag className="h-3 w-3" />
                  {name}
                  {!isViewer && customerPriceLists.directIds.includes(customerPriceLists.ids[i]) && (
                    <button
                      className="ml-1 hover:text-red-500 transition-colors"
                      disabled={removeFromPriceListMutation.isPending}
                      onClick={(e) => { e.stopPropagation(); removeFromPriceListMutation.mutate(customerPriceLists.ids[i]); }}
                      aria-label={`Remove from ${name}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </Badge>
              ))}
            </div>

            <button
              className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
              onClick={togglePriceBreakdown}
            >
              {priceBreakdownExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {priceBreakdownExpanded ? 'Hide their prices' : 'View their prices'}
            </button>

            {priceBreakdownExpanded && (
              <div className="rounded-md border bg-muted/30 overflow-hidden">
                {priceBreakdownLoading ? (
                  <p className="text-xs text-muted-foreground p-3">Loading prices…</p>
                ) : priceBreakdownRows.length === 0 ? (
                  <p className="text-xs text-muted-foreground p-3">No product pricing found in these price lists.</p>
                ) : (
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left font-medium text-muted-foreground px-3 py-2">Product</th>
                        <th className="text-right font-medium text-muted-foreground px-3 py-2">Their price</th>
                        <th className="text-right font-medium text-muted-foreground px-3 py-2 hidden sm:table-cell">Standard</th>
                      </tr>
                    </thead>
                    <tbody>
                      {priceBreakdownRows.map((row, i) => (
                        <tr key={i} className={i % 2 === 0 ? '' : 'bg-muted/20'}>
                          <td className="px-3 py-2 text-left">
                            <span className="font-medium">{row.name}</span>
                            {row.listCount > 1 && (
                              <span className="ml-1 text-muted-foreground">(best of {row.listCount} lists)</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-green-700">
                            {formatMoney(row.best)}
                          </td>
                          <td className="px-3 py-2 text-right hidden sm:table-cell">
                            <span className={row.best < row.standardPrice ? 'line-through text-muted-foreground' : 'text-muted-foreground'}>
                              {formatMoney(row.standardPrice)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No price lists assigned</p>
        )}
      </div>

      <Separator />

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-muted-foreground">Default address</h2>
          {!isViewer && (
            <Button variant="ghost" size="sm" className="text-xs text-blue-600" onClick={() => setIsEditAddressesOpen(true)}>
              Edit addresses
            </Button>
          )}
        </div>
        {defaultAddress ? (
          <div className="bg-white rounded-lg p-3 border text-sm space-y-0.5">
            <p className="font-medium">{fullName}</p>
            <p>{defaultAddress.addressLine1}</p>
            {defaultAddress.addressLine2 && <p>{defaultAddress.addressLine2}</p>}
            <p className="text-muted-foreground">
              {[defaultAddress.city, defaultAddress.state, defaultAddress.postalCode].filter(Boolean).join(', ')}
              {defaultAddress.country && ` · ${defaultAddress.country}`}
            </p>
          </div>
        ) : (
          <div className="text-center py-6 bg-gray-50 rounded-lg border border-dashed">
            <MapPin className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No addresses saved</p>
            {!isViewer && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-1 text-xs text-green-600"
                onClick={() => {
                  setIsEditAddressesOpen(true);
                  setShowAddForm(true);
                }}
              >
                Add first address
              </Button>
            )}
          </div>
        )}
      </div>

      <Separator />

      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-muted-foreground">Recent orders</h2>
          {customerOrders.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-blue-600 h-auto p-0"
              onClick={() => navigate(`/orders?customerId=${customerId}&search=${encodeURIComponent(fullName)}`)}
            >
              View all ({customer?.totalOrders || customerOrders.length})
            </Button>
          )}
        </div>
        {customerOrders.length > 0 ? (
          <div className="space-y-2">
            {customerOrders.slice(0, 5).map((order) => {
              const statusColor =
                order.status === "paid" ? "bg-green-100 text-green-800" :
                order.status === "fulfilled" ? "bg-blue-100 text-blue-800" :
                order.status === "cancelled" ? "bg-red-100 text-red-800" :
                "bg-yellow-100 text-yellow-800";
              const StatusIcon =
                order.status === "paid" ? CheckCircle :
                order.status === "fulfilled" ? Package :
                order.status === "cancelled" ? XCircle : Clock;
              const isCancelled = order.status === "cancelled";
              const paymentColor =
                order.paymentStatus === "paid" ? "bg-green-100 text-green-800" :
                order.paymentStatus === "part_paid" ? "bg-amber-100 text-amber-800" :
                "bg-red-100 text-red-800";
              const paymentLabel =
                order.paymentStatus === "paid" ? "Paid" :
                order.paymentStatus === "part_paid" ? "Part Paid" : "Unpaid";
              return (
                <div key={order.id} className="flex items-center justify-between p-3 bg-white rounded-lg border hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => navigate(`/orders?id=${order.id}`)}>
                  <div className="flex items-center space-x-3">
                    <div className={`p-1.5 rounded-full ${statusColor}`}>
                      <StatusIcon className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{order.orderNumber || `#${order.id}`}</p>
                      <p className="text-xs text-muted-foreground">{formatDateShort(order.createdAt)}</p>
                    </div>
                  </div>
                  <div className="text-right flex flex-col items-end gap-1">
                    <p className={`text-sm font-semibold ${isCancelled ? 'line-through text-gray-400' : ''}`}>{formatMoney(parseFloat(order.total))}</p>
                    {!isCancelled && (
                      <Badge className={`text-[10px] px-1.5 py-0 border-0 ${paymentColor}`}>
                        {paymentLabel}
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-6 bg-gray-50 rounded-lg border border-dashed">
            <ShoppingBag className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No orders yet</p>
          </div>
        )}
      </div>

      <Dialog open={isEditContactOpen} onOpenChange={setIsEditContactOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit contact information</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleContactSubmit} className="space-y-4">
            <div className="pb-1">
              <label className="text-xs font-medium mb-1.5 block">Search on Google</label>
              <BusinessSearchInput
                placeholder="Type a business name to auto-fill..."
                onSelect={handleBusinessSearchEdit}
              />
            </div>
            <div className="border-t border-dashed pt-3">
              <p className="text-xs text-muted-foreground mb-2">Or fill in manually:</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">First name</Label>
                <Input
                  value={contactFormData.firstName}
                  onChange={(e) => setContactFormData({ ...contactFormData, firstName: e.target.value })}
                  className="h-9"
                />
              </div>
              <div>
                <Label className="text-xs">Last name</Label>
                <Input
                  value={contactFormData.lastName}
                  onChange={(e) => setContactFormData({ ...contactFormData, lastName: e.target.value })}
                  className="h-9"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Phone number *</Label>
              <Input
                value={contactFormData.phoneNumber}
                onChange={(e) => setContactFormData({ ...contactFormData, phoneNumber: e.target.value })}
                required
                className="h-9"
              />
            </div>
            <div>
              <Label className="text-xs">Email</Label>
              <Input
                type="email"
                value={contactFormData.email}
                onChange={(e) => setContactFormData({ ...contactFormData, email: e.target.value })}
                className="h-9"
              />
            </div>
            <div>
              <Label className="text-xs">Business name</Label>
              <Input
                value={contactFormData.businessName}
                onChange={(e) => setContactFormData({ ...contactFormData, businessName: e.target.value })}
                className="h-9"
              />
            </div>
            <div className="border-t pt-3">
              <p className="text-xs font-medium text-muted-foreground mb-2">Address <span className="font-normal">(optional — appears on invoices)</span></p>
              <div className="space-y-2">
                <Input
                  placeholder="Address line 1"
                  value={contactFormData.streetAddress}
                  onChange={(e) => setContactFormData({ ...contactFormData, streetAddress: e.target.value })}
                  className="h-9"
                />
                <Input
                  placeholder="Address line 2 (optional)"
                  value={contactFormData.addressLine2}
                  onChange={(e) => setContactFormData({ ...contactFormData, addressLine2: e.target.value })}
                  className="h-9"
                />
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="City"
                    value={contactFormData.city}
                    onChange={(e) => setContactFormData({ ...contactFormData, city: e.target.value })}
                    className="h-9"
                  />
                  <Input
                    placeholder="Postcode"
                    value={contactFormData.postalCode}
                    onChange={(e) => setContactFormData({ ...contactFormData, postalCode: e.target.value })}
                    className="h-9"
                  />
                </div>
                <Input
                  placeholder="Country"
                  value={contactFormData.country}
                  onChange={(e) => setContactFormData({ ...contactFormData, country: e.target.value })}
                  className="h-9"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => setIsEditContactOpen(false)}>Cancel</Button>
              <Button type="submit" className="bg-green-600 hover:bg-green-700" disabled={updateCustomerMutation.isPending}>
                Save
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditAddressesOpen} onOpenChange={(open) => { setIsEditAddressesOpen(open); if (!open) resetAddressForm(); }}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Delivery addresses</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {!showAddForm && (
              <Button variant="outline" size="sm" className="w-full" onClick={() => { resetAddressForm(); setShowAddForm(true); }}>
                <Plus className="h-3 w-3 mr-1" />
                Add Address
              </Button>
            )}

            {addressesLoading && <p className="text-sm text-muted-foreground">Loading...</p>}

            {addresses.length === 0 && !addressesLoading && !showAddForm && (
              <div className="text-center py-6 bg-gray-50 rounded-lg border border-dashed">
                <MapPin className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No delivery addresses saved</p>
              </div>
            )}

            {addresses.map((addr) => (
              <div key={addr.id} className="flex items-start justify-between p-3 bg-gray-50 rounded-lg border">
                <div className="flex items-start gap-2 flex-1">
                  {getLabelIcon(addr.label)}
                  <div className="text-sm">
                    {addr.label && <Badge variant="outline" className="text-xs mb-1">{addr.label}</Badge>}
                    <p>{addr.addressLine1}</p>
                    {addr.addressLine2 && <p className="text-muted-foreground">{addr.addressLine2}</p>}
                    <p className="text-muted-foreground">{addr.city}{addr.state ? `, ${addr.state}` : ""}, {addr.postalCode}</p>
                    <p className="text-muted-foreground text-xs">{addr.country}</p>
                    {addr.isDefault && <Badge className="text-xs mt-1 bg-green-100 text-green-700 border-green-200">Default</Badge>}
                  </div>
                </div>
                <div className="flex items-center gap-1 ml-2">
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => startEditAddress(addr)}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-red-500 hover:text-red-700"
                    onClick={() => deleteAddressMutation.mutate(addr.id)}
                    disabled={deleteAddressMutation.isPending}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}

            {showAddForm && (
              <form onSubmit={handleAddressSubmit} className="space-y-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-blue-900">{editingId ? "Edit Address" : "Add New Address"}</p>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={resetAddressForm}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>

                {/* Google Places address search */}
                <div className="space-y-1.5">
                  <Label className="text-xs">Search address</Label>
                  <AddressSearchInput
                    onSelect={(result: AddressPlaceResult) =>
                      setAddressFormData((prev) => ({
                        ...prev,
                        addressLine1: result.addressLine1,
                        city: result.city,
                        postalCode: result.postalCode,
                        country: result.country,
                      }))
                    }
                    placeholder="Type to find address..."
                  />
                  {customer?.streetAddress && (
                    <button
                      type="button"
                      className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
                      onClick={() =>
                        setAddressFormData((prev) => ({
                          ...prev,
                          addressLine1: customer.streetAddress || '',
                          addressLine2: customer.addressLine2 || '',
                          city: customer.city || '',
                          postalCode: customer.postalCode || '',
                          country: customer.country || '',
                        }))
                      }
                    >
                      <MapPin className="h-3 w-3" />
                      Use contact address
                    </button>
                  )}
                </div>

                <div>
                  <Label className="text-xs">Label (e.g. Home, Office, Warehouse)</Label>
                  <Input
                    value={addressFormData.label}
                    onChange={(e) => setAddressFormData({ ...addressFormData, label: e.target.value })}
                    placeholder="e.g. Home, Office"
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs">Address Line 1 *</Label>
                  <Input
                    value={addressFormData.addressLine1}
                    onChange={(e) => setAddressFormData({ ...addressFormData, addressLine1: e.target.value })}
                    required
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs">Address Line 2</Label>
                  <Input
                    value={addressFormData.addressLine2}
                    onChange={(e) => setAddressFormData({ ...addressFormData, addressLine2: e.target.value })}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">City *</Label>
                    <Input
                      value={addressFormData.city}
                      onChange={(e) => setAddressFormData({ ...addressFormData, city: e.target.value })}
                      required
                      className="h-8 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">County/State</Label>
                    <Input
                      value={addressFormData.state}
                      onChange={(e) => setAddressFormData({ ...addressFormData, state: e.target.value })}
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Postal Code *</Label>
                    <Input
                      value={addressFormData.postalCode}
                      onChange={(e) => setAddressFormData({ ...addressFormData, postalCode: e.target.value })}
                      required
                      className="h-8 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Country</Label>
                    <Input
                      value={addressFormData.country}
                      onChange={(e) => setAddressFormData({ ...addressFormData, country: e.target.value })}
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={resetAddressForm}>Cancel</Button>
                  <Button
                    type="submit"
                    size="sm"
                    className="bg-green-600 hover:bg-green-700"
                    disabled={addAddressMutation.isPending || updateAddressMutation.isPending}
                  >
                    <Check className="h-3 w-3 mr-1" />
                    {editingId ? "Update" : "Save"} Address
                  </Button>
                </div>
              </form>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isAddToGroupOpen} onOpenChange={setIsAddToGroupOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add to Group</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {customer?.groupNames && customer.groupNames.length > 0 && (
              <div>
                <Label className="text-xs text-muted-foreground">Current groups</Label>
                <div className="flex flex-wrap gap-1 mt-1">
                  {customer.groupNames.map((g, i) => (
                    <Badge key={i} variant="outline" className="text-xs">{g}</Badge>
                  ))}
                </div>
              </div>
            )}
            <div>
              <Label className="text-xs">Select group</Label>
              <select
                className="w-full mt-1 px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                value={selectedGroupId}
                onChange={(e) => setSelectedGroupId(Number(e.target.value))}
              >
                <option value={0}>Choose a group...</option>
                {customerGroups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setIsAddToGroupOpen(false)}>Cancel</Button>
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-700"
                disabled={!selectedGroupId || addCustomerToGroupMutation.isPending}
                onClick={() => addCustomerToGroupMutation.mutate({ groupId: selectedGroupId, customerId })}
              >
                {addCustomerToGroupMutation.isPending ? "Adding..." : "Add to Group"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isAddToPriceListOpen} onOpenChange={(open) => { setIsAddToPriceListOpen(open); if (!open) setSelectedPriceListId(0); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add to Price List</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {customerPriceLists && customerPriceLists.count > 0 && (
              <div>
                <Label className="text-xs text-muted-foreground">Already assigned to</Label>
                <div className="flex flex-wrap gap-1 mt-1">
                  {customerPriceLists.names.map((name, i) => (
                    <Badge key={i} variant="outline" className="text-xs flex items-center gap-1">
                      <Tag className="h-3 w-3" />
                      {name}
                      {customerPriceLists.directIds.includes(customerPriceLists.ids[i]) && (
                        <button
                          className="ml-1 hover:text-red-500 transition-colors"
                          disabled={removeFromPriceListMutation.isPending}
                          onClick={() => removeFromPriceListMutation.mutate(customerPriceLists.ids[i])}
                          aria-label={`Remove from ${name}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            <div>
              <Label className="text-xs">Select price list</Label>
              <select
                className="w-full mt-1 px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                value={selectedPriceListId}
                onChange={(e) => setSelectedPriceListId(Number(e.target.value))}
              >
                <option value={0}>Choose a price list...</option>
                {allPriceLists
                  .filter((pl) => !customerPriceLists?.ids.includes(pl.id))
                  .map((pl) => (
                    <option key={pl.id} value={pl.id}>{pl.name}</option>
                  ))}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => { setIsAddToPriceListOpen(false); setSelectedPriceListId(0); }}>Cancel</Button>
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-700"
                disabled={!selectedPriceListId || addToPriceListMutation.isPending}
                onClick={() => addToPriceListMutation.mutate(selectedPriceListId)}
              >
                {addToPriceListMutation.isPending ? "Adding..." : "Add to Price List"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
