import { useState } from "react";
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
} from "lucide-react";

interface Customer {
  id: string;
  firstName: string;
  lastName?: string;
  email?: string;
  phoneNumber: string;
  businessName?: string;
  streetAddress?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
  groupNames: string[];
  groupIds: number[];
  totalOrders: number;
  totalSpent: number;
  lastOrderDate?: Date;
  createdAt: Date;
}

interface DeliveryAddress {
  id: number;
  customerId: string;
  wholesalerId: string;
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

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(amount);

const formatDate = (date: Date | string) =>
  new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default function CustomerDetail() {
  const [, navigate] = useLocation();
  const [match, params] = useRoute("/customers/:customerId");
  const customerId = params?.customerId || "";
  const { toast } = useToast();
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
    country: "United Kingdom",
    label: "",
  });

  const [contactFormData, setContactFormData] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phoneNumber: "",
    businessName: "",
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const customer = customers.find((c) => c.id === customerId);

  const { data: addresses = [], isLoading: addressesLoading } = useQuery<DeliveryAddress[]>({
    queryKey: [`/api/wholesaler/customers/${customerId}/addresses`],
    enabled: !!customerId,
  });

  const { data: allOrders = [] } = useQuery<Order[]>({
    queryKey: ["/api/orders"],
    staleTime: 5 * 60 * 1000,
  });

  const customerOrders = allOrders
    .filter((o) => o.retailerId === customerId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      toast({ title: "Customer updated" });
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
    setAddressFormData({ addressLine1: "", addressLine2: "", city: "", state: "", postalCode: "", country: "United Kingdom", label: "" });
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
      country: addr.country || "United Kingdom",
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
    });
    setIsEditContactOpen(true);
  };

  const handleContactSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateCustomerMutation.mutate(contactFormData);
  };

  const defaultAddress = addresses.find((a) => a.isDefault) || addresses[0];

  const getInitials = () => {
    if (!customer) return "?";
    return `${customer.firstName?.[0] || ""}${customer.lastName?.[0] || ""}`.toUpperCase() || "C";
  };

  const fullName = customer ? `${customer.firstName || ""} ${customer.lastName || ""}`.trim() : "Loading...";

  if (!match) return null;

  if (!customer) {
    return (
      <div className="max-w-2xl mx-auto p-4 space-y-4">
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
    <div className="max-w-2xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate("/customers?tab=address-book")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <MoreHorizontal className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => navigate(`/quick-quote?customerId=${customerId}`)}>
              <FileText className="h-4 w-4 mr-2" />
              Create quote
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate(`/orders?customer=${encodeURIComponent(fullName)}`)}>
              <ShoppingBag className="h-4 w-4 mr-2" />
              View orders
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={openEditContact}>
              <Edit3 className="h-4 w-4 mr-2" />
              Edit contact info
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setIsEditAddressesOpen(true)}>
              <MapPin className="h-4 w-4 mr-2" />
              Edit addresses
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
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex items-start space-x-4">
        <Avatar className="h-14 w-14">
          <AvatarFallback className="bg-blue-100 text-blue-700 text-lg font-semibold">
            {getInitials()}
          </AvatarFallback>
        </Avatar>
        <div>
          <h1 className="text-xl font-bold">{fullName}</h1>
          <p className="text-sm text-muted-foreground">
            Since {formatDate(customer.createdAt)}
            {customer.city && ` · ${customer.city}${customer.country ? `, ${customer.country}` : ""}`}
          </p>
          <div className="flex flex-wrap gap-1 mt-1">
            {customer.groupNames?.map((g, i) => (
              <Badge key={i} variant="outline" className="text-xs">{g}</Badge>
            ))}
            {customer.businessName && (
              <Badge variant="secondary" className="text-xs">{customer.businessName}</Badge>
            )}
          </div>
        </div>
      </div>

      <Separator />

      <div>
        <h2 className="text-sm font-semibold text-muted-foreground mb-3">Insights</h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm">Total spend</span>
            <span className="text-sm font-semibold">{formatCurrency(customer.totalSpent || 0)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Last order</span>
            <span className="text-sm font-semibold">
              {customer.lastOrderDate ? formatDate(customer.lastOrderDate) : "No orders yet"}
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
          <h2 className="text-sm font-semibold text-muted-foreground">Default address</h2>
          <Button variant="ghost" size="sm" className="text-xs text-blue-600" onClick={() => setIsEditAddressesOpen(true)}>
            Edit addresses
          </Button>
        </div>
        {defaultAddress ? (
          <div className="bg-gray-50 rounded-lg p-3 border text-sm space-y-0.5">
            <p className="font-medium">{fullName}</p>
            <p>{defaultAddress.addressLine1}</p>
            {defaultAddress.addressLine2 && <p>{defaultAddress.addressLine2}</p>}
            <p>{defaultAddress.city}</p>
            {defaultAddress.state && <p>{defaultAddress.state}</p>}
            <p>{defaultAddress.postalCode}</p>
            <p>{defaultAddress.country}</p>
          </div>
        ) : (
          <div className="text-center py-6 bg-gray-50 rounded-lg border border-dashed">
            <MapPin className="h-6 w-6 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No addresses saved</p>
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
              onClick={() => navigate(`/orders?customer=${encodeURIComponent(fullName)}`)}
            >
              View all ({customerOrders.length})
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
              const paymentColor =
                order.paymentStatus === "paid" ? "bg-green-100 text-green-800" :
                order.paymentStatus === "part_paid" ? "bg-amber-100 text-amber-800" :
                "bg-red-100 text-red-800";
              const paymentLabel =
                order.paymentStatus === "paid" ? "Paid" :
                order.paymentStatus === "part_paid" ? "Part Paid" : "Unpaid";
              return (
                <div key={order.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border hover:bg-gray-100 transition-colors">
                  <div className="flex items-center space-x-3">
                    <div className={`p-1.5 rounded-full ${statusColor}`}>
                      <StatusIcon className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{order.orderNumber || `#${order.id}`}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(order.createdAt)}</p>
                    </div>
                  </div>
                  <div className="text-right flex flex-col items-end gap-1">
                    <p className="text-sm font-semibold">{formatCurrency(parseFloat(order.total))}</p>
                    <Badge className={`text-[10px] px-1.5 py-0 border-0 ${paymentColor}`}>
                      {paymentLabel}
                    </Badge>
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit contact information</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleContactSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">First name *</Label>
                <Input
                  value={contactFormData.firstName}
                  onChange={(e) => setContactFormData({ ...contactFormData, firstName: e.target.value })}
                  required
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
    </div>
  );
}
