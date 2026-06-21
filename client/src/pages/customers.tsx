import { useState, useMemo, useCallback } from "react";
import { useCurrency } from "@/hooks/useCurrency";
import { FeatureLock, isListingTier } from "@/components/FeatureLock";
import PageHeader from "@/components/PageHeader";
import ElephantLoader from "@/components/ui/elephant-loader";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAuth, type AuthUser } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Link, useLocation } from "wouter";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { BusinessSearchInput, type BusinessPlaceResult } from "@/components/BusinessSearchInput";
import {
  Users,
  Plus,
  UserPlus,
  Edit3,
  Search,
  DollarSign,
  Activity,
  Contact,
  UserCheck,
  X,
  Eye,
  MessageCircle,
  ShieldX,
  MoreHorizontal,
  TrendingUp,
  Clock,
  Tag,
  Share2,
  AlertTriangle,
  Trash2,
} from "lucide-react";
import { CustomerOrderHistory } from "@/components/customer/CustomerOrderHistory";
import CustomerInvitationModal from "@/components/CustomerInvitationModal";
import { SubscriptionUpgradeModal } from "@/components/subscription/SubscriptionUpgradeModal";
import { PriceListManagementDialog } from "@/components/customer/PriceListManagementDialog";
import { CustomerGroupsTab } from "@/components/customer/CustomerGroupsTab";
import { CustomerMergeDialog } from "@/components/customer/CustomerMergeDialog";
import { AddToPriceListDialog } from "@/components/customer/AddToPriceListDialog";

// Form Schemas
const editCustomerFormSchema = z.object({
  firstName: z.string().optional().or(z.literal("")),
  lastName: z.string().optional().or(z.literal("")),
  phoneNumber: z.string()
    .min(10, "Valid phone number is required")
    .regex(/^\+?[\d\s\-\(\)]+$/, "Please enter a valid phone number"),
  email: z.union([
    z.string().email("Please enter a valid email address"),
    z.literal("")
  ]).optional(),
  businessName: z.string().optional(),
  streetAddress: z.string().optional().or(z.literal("")),
  addressLine2: z.string().optional().or(z.literal("")),
  city: z.string().optional().or(z.literal("")),
  postalCode: z.string().optional().or(z.literal("")),
  country: z.string().optional().or(z.literal("")),
});

const addToGroupFormSchema = z.object({
  groupId: z.number().min(1, "Please select a group"),
});

const addCustomerFormSchema = z.object({
  firstName: z.string().optional().or(z.literal("")),
  lastName: z.string().optional(),
  businessName: z.string().optional(),
  email: z.string().email("Please enter a valid email address").optional().or(z.literal("")),
  phoneNumber: z.string()
    .min(10, "Valid phone number is required")
    .regex(/^\+?[\d\s\-\(\)]+$/, "Please enter a valid phone number"),
  groupId: z.number().optional(),
  streetAddress: z.string().optional().or(z.literal("")),
  addressLine2: z.string().optional().or(z.literal("")),
  city: z.string().optional().or(z.literal("")),
  postalCode: z.string().optional().or(z.literal("")),
  country: z.string().optional().or(z.literal("")),
});

// Type definitions
type EditCustomerFormData = z.infer<typeof editCustomerFormSchema>;
type AddToGroupFormData = z.infer<typeof addToGroupFormSchema>;
type AddCustomerFormData = z.infer<typeof addCustomerFormSchema>;

interface CustomerGroup {
  id: number;
  name: string;
  description?: string;
  memberCount?: number;
  createdAt: string;
  whatsappGroupId?: string;
}

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
  totalInvoiced: number;
  totalSpent: number;
  totalUnpaid?: number;
  lastOrderDate?: Date;
  createdAt: Date;
}

interface CustomerOrder {
  id: number;
  retailerId: string;
  status: string;
  createdAt: string;
  totalAmount: number;
}

interface WelcomeMessageResult {
  customerName: string;
  welcomeMessages?: {
    emailSent?: boolean;
    smsSent?: boolean;
    whatsappSent?: boolean;
    errors?: string[];
  };
}

type NamedEntity = {
  businessName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  phoneNumber?: string | null;
};

interface PriceChangeRow {
  id: number;
  productId: number | null;
  productName: string;
  sellingType: string;
  oldPrice: string;
  newPrice: string;
  orderId: number | null;
  changedAt: string;
}

function PriceChangesTab() {
  const { data: rows = [], isLoading } = useQuery<PriceChangeRow[]>({
    queryKey: ['/api/products/price-history'],
    staleTime: 30_000,
  });

  const fmt = (val: string) => {
    const n = parseFloat(val);
    if (!isFinite(n)) return '—';
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(n);
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <TrendingUp className="h-10 w-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm font-medium text-gray-500">No price changes yet</p>
        <p className="text-xs mt-1">When you update a product price via an invoice using "Apply to all orders", it will appear here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500 pb-1">Catalog price changes made via invoice price propagation (scope = all orders).</p>
      <div className="rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-2.5 text-left font-medium">Product</th>
              <th className="px-4 py-2.5 text-left font-medium hidden sm:table-cell">Type</th>
              <th className="px-4 py-2.5 text-right font-medium">Old Price</th>
              <th className="px-4 py-2.5 text-right font-medium">New Price</th>
              <th className="px-4 py-2.5 text-right font-medium">Change</th>
              <th className="px-4 py-2.5 text-right font-medium hidden md:table-cell">Date</th>
              <th className="px-4 py-2.5 text-right font-medium hidden lg:table-cell">Order</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map((row) => {
              const pct = ((parseFloat(row.newPrice) - parseFloat(row.oldPrice)) / parseFloat(row.oldPrice)) * 100;
              const isUp = pct > 0;
              return (
                <tr key={row.id} className="bg-white hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-800 max-w-[140px] truncate">{row.productName}</td>
                  <td className="px-4 py-3 text-gray-500 hidden sm:table-cell capitalize">{row.sellingType}</td>
                  <td className="px-4 py-3 text-right text-gray-500">{fmt(row.oldPrice)}</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-800">{fmt(row.newPrice)}</td>
                  <td className={`px-4 py-3 text-right font-semibold text-xs ${isUp ? 'text-green-600' : 'text-red-500'}`}>
                    {isUp ? '↑' : '↓'} {Math.abs(pct).toFixed(1)}%
                  </td>
                  <td className="px-4 py-3 text-right text-gray-400 text-xs hidden md:table-cell">
                    {new Date(row.changedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-4 py-3 text-right hidden lg:table-cell">
                    {row.orderId ? (
                      <Link href={`/orders/${row.orderId}`} className="text-xs text-emerald-600 hover:underline">
                        View order
                      </Link>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Customers() {
  const { formatMoney } = useCurrency();
  const { user } = useAuth();
  const isViewer = (user as AuthUser)?.teamMemberRole === 'viewer';
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [location, navigate] = useLocation();

  // Get tab from URL parameter or default to "address-book"
  const urlParams = new URLSearchParams(location.split('?')[1] || '');
  const tabFromUrl = urlParams.get('tab');
  const defaultTab = tabFromUrl && ['groups', 'address-book', 'price-lists'].includes(tabFromUrl) ? tabFromUrl : 'address-book';
  const [activeTab, setActiveTab] = useState(defaultTab);

  // Address book state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isEditCustomerDialogOpen, setIsEditCustomerDialogOpen] = useState(false);
  const [isAddToGroupDialogOpen, setIsAddToGroupDialogOpen] = useState(false);
  const [isViewCustomerOrdersDialogOpen, setIsViewCustomerOrdersDialogOpen] = useState(false);
  const [isAddCustomerDialogOpen, setIsAddCustomerDialogOpen] = useState(false);

  // Upgrade modal state (shared with CustomerGroupsTab)
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // Invitation modal state
  const [isInvitationModalOpen, setIsInvitationModalOpen] = useState(false);

  // Price list filter (set by address-book badge click, read by PriceListManagementDialog)
  const [priceListFilterCustomer, setPriceListFilterCustomer] = useState<{ id: string; name: string } | null>(null);

  // Add to price list dialog
  const [priceListTarget, setPriceListTarget] = useState<{ id: string; name: string } | null>(null);

  // Merge dialog trigger state (dialog manages its own internal state)
  const [isMergeDialogOpen, setIsMergeDialogOpen] = useState(false);
  const [mergeInitialDuplicates, setMergeInitialDuplicates] = useState<Customer[]>([]);
  const [mergeInitialMode, setMergeInitialMode] = useState<'automatic' | 'manual'>('manual');

  // Price list URL param (passed to PriceListManagementDialog)
  const priceListIdFromUrl = Number(urlParams.get('priceListId')) || null;

  // Forms
  const editCustomerForm = useForm<EditCustomerFormData>({
    resolver: zodResolver(editCustomerFormSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      phoneNumber: "",
      email: "",
      businessName: ""
    },
  });

  const addToGroupForm = useForm<AddToGroupFormData>({
    resolver: zodResolver(addToGroupFormSchema),
    defaultValues: { groupId: 0 },
  });

  const addCustomerForm = useForm<AddCustomerFormData>({
    resolver: zodResolver(addCustomerFormSchema),
    defaultValues: { firstName: "", lastName: "", businessName: "", email: "", phoneNumber: "", groupId: undefined },
  });

  const handleBusinessSearch = useCallback((result: BusinessPlaceResult) => {
    const opts = { shouldDirty: true, shouldTouch: true };
    if (result.businessName) addCustomerForm.setValue('businessName', result.businessName, opts);
    if (result.streetAddress) addCustomerForm.setValue('streetAddress', result.streetAddress, opts);
    if (result.city) addCustomerForm.setValue('city', result.city, opts);
    if (result.postalCode) addCustomerForm.setValue('postalCode', result.postalCode, opts);
    if (result.country) addCustomerForm.setValue('country', result.country, opts);
  }, [addCustomerForm]);

  // Plan limits — used by CustomerGroupsTab and PriceListManagementDialog
  const { data: planLimits, isLoading: planLimitsLoading } = useQuery<{
    plan: string;
    limits: { products: number; broadcasts: number; teamMembers: number; customGroups: number; priceLists: number };
    usage: { products: number; broadcasts: number; teamMembers: number; priceLists: number };
  }>({
    queryKey: ['/api/subscriptions/plan-limits'],
    staleTime: 5 * 60 * 1000,
  });

  // Customer Groups (shared with CustomerGroupsTab and PriceListManagementDialog)
  const { data: customerGroups = [], isLoading: isLoadingGroups } = useQuery<CustomerGroup[]>({
    queryKey: ['/api/customer-groups'],
    staleTime: 10 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  // Query for customer orders - only when needed
  const { data: customerOrders = [] } = useQuery({
    queryKey: ['/api/orders'],
    staleTime: 10 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    enabled: isViewCustomerOrdersDialogOpen,
  });

  // Customers query
  const { data: customers = [], isLoading: isLoadingCustomers, refetch: refetchCustomers } = useQuery<Customer[]>({
    queryKey: ['/api/customers'],
    staleTime: 10 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  // Price list customer summary — used by address-book badges
  const { data: priceListCustomerSummary = {} } = useQuery<Record<string, { count: number; names: string[]; ids: number[] }>>({
    queryKey: ['/api/price-lists/customer-summary'],
  });

  // Calculate stats from existing customer data
  const stats = useMemo(() => {
    if (!customers.length) return null;
    return {
      totalCustomers: customers.length,
      activeCustomers: customers.filter(c => c.totalOrders > 0).length,
      totalUnpaid: customers.reduce((sum, c) => sum + (c.totalUnpaid || 0), 0),
      totalRevenue: customers.reduce((sum, c) => sum + (c.totalSpent || 0), 0)
    };
  }, [customers]);

  // Client-side search filtering
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return customers;
    const q = searchQuery.toLowerCase();
    return customers.filter(c =>
      (c.firstName || '').toLowerCase().includes(q) ||
      (c.lastName || '').toLowerCase().includes(q) ||
      (c.businessName || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.phoneNumber || '').toLowerCase().includes(q)
    );
  }, [customers, searchQuery]);

  // Address Book Mutations
  const updateCustomerMutation = useMutation({
    mutationFn: ({ customerId, data }: { customerId: string; data: EditCustomerFormData }) =>
      apiRequest('PATCH', `/api/customers/${customerId}`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
      const nameChanged = selectedCustomer && (
        variables.data.firstName !== selectedCustomer.firstName ||
        variables.data.lastName !== (selectedCustomer.lastName || '')
      );
      if (nameChanged) {
        toast({ title: "Customer name updated", description: "All future invoices will reflect this change." });
      } else {
        toast({ title: "Success", description: "Customer updated successfully!" });
      }
      setIsEditCustomerDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to update customer", variant: "destructive" });
    },
  });

  const addCustomerToGroupMutation = useMutation({
    mutationFn: ({ groupId, customerId }: { groupId: number; customerId: string }) =>
      apiRequest('POST', `/api/customer-groups/${groupId}/members/${customerId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/customer-groups'] });
      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
      toast({ title: "Success", description: "Customer added to group successfully!" });
      setIsAddToGroupDialogOpen(false);
      addToGroupForm.reset();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to add customer to group", variant: "destructive" });
    },
  });

  const removeFromGroupMutation = useMutation({
    mutationFn: ({ groupId, customerId }: { groupId: number; customerId: string }) =>
      apiRequest('DELETE', `/api/customer-groups/${groupId}/members/${customerId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/customer-groups'] });
      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
      toast({ title: "Success", description: "Customer removed from group successfully!" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to remove customer from group", variant: "destructive" });
    },
  });

  const addCustomerMutation = useMutation({
    mutationFn: async (data: AddCustomerFormData): Promise<{ welcomeMessages?: { emailSent?: boolean; smsSent?: boolean; whatsappSent?: boolean; errors?: string[] } }> => {
      const res = await apiRequest('POST', '/api/customers', data);
      return res.json();
    },
    onSuccess: async (response) => {
      await queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/customers/stats'] });
      await refetchCustomers();

      if (response.welcomeMessages) {
        const { emailSent, whatsappSent, errors } = response.welcomeMessages;
        let description = "Customer added successfully!";
        if (emailSent && whatsappSent) description += " Welcome email and WhatsApp message sent.";
        else if (emailSent) description += " Welcome email sent.";
        else if (whatsappSent) description += " Welcome WhatsApp message sent.";
        if (errors && errors.length > 0) console.warn("Welcome message errors:", errors);
        toast({ title: "Success", description });
      } else {
        toast({ title: "Success", description: "Customer added to directory successfully!" });
      }

      setIsAddCustomerDialogOpen(false);
      addCustomerForm.reset();
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to add customer", variant: "destructive" });
    },
  });

  const deleteCustomerMutation = useMutation({
    mutationFn: async (customerId: string): Promise<{ archived: boolean; message?: string }> => {
      const res = await apiRequest('DELETE', `/api/customers/${customerId}`);
      return res.json();
    },
    onSuccess: (data: { archived: boolean; message?: string }) => {
      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
      queryClient.invalidateQueries({ queryKey: ['/api/customers/stats'] });
      if (data.archived) {
        toast({
          title: "Customer Archived",
          description: "Customer has existing orders and has been archived instead of deleted. Archived customers won't appear in your customer list but their order history is preserved.",
          duration: 8000
        });
      } else {
        toast({ title: "Success", description: "Customer deleted successfully!" });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to delete customer", variant: "destructive" });
    },
  });

  const sendWelcomeMessageMutation = useMutation({
    mutationFn: async (customerId: string): Promise<WelcomeMessageResult> => {
      const res = await apiRequest('POST', `/api/customers/${customerId}/send-welcome`);
      return res.json();
    },
    onSuccess: (data: WelcomeMessageResult) => {
      const { customerName, welcomeMessages } = data;
      const emailSent = welcomeMessages?.emailSent || false;
      const smsSent = welcomeMessages?.smsSent || false;
      const whatsappSent = welcomeMessages?.whatsappSent || false;
      const errors = welcomeMessages?.errors || [];
      let description = `Welcome message sent to ${customerName}:\n`;
      if (emailSent) description += "✓ Email sent successfully\n";
      if (smsSent) description += "✓ SMS sent successfully\n";
      if (whatsappSent) description += "✓ WhatsApp message sent successfully\n";
      if (errors && errors.length > 0) description += `⚠️ ${errors.join(', ')}`;
      toast({
        title: "Welcome Message Sent",
        description: description,
        variant: emailSent || smsSent || whatsappSent ? "default" : "destructive",
      });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to Send Welcome Message", description: error.message || "Could not send welcome message to customer", variant: "destructive" });
    },
  });

  const removeCustomerAccessMutation = useMutation({
    mutationFn: async (customerId: string): Promise<{ message?: string }> => {
      const res = await apiRequest('DELETE', `/api/wholesaler/customer/${customerId}`);
      return res.json();
    },
    onSuccess: (data: { message?: string }) => {
      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
      queryClient.invalidateQueries({ queryKey: ['/api/customers/stats'] });
      toast({ title: "Access Removed", description: data.message || "Customer access to your portal has been removed successfully.", duration: 5000 });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to remove customer access", variant: "destructive" });
    },
  });

  const allowCustomerAccessMutation = useMutation({
    mutationFn: async (customerData: { email: string; phoneNumber?: string; firstName?: string; lastName?: string }): Promise<{ message?: string }> => {
      const res = await apiRequest('POST', '/api/wholesaler/invite', customerData);
      return res.json();
    },
    onSuccess: (data: { message?: string }) => {
      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
      queryClient.invalidateQueries({ queryKey: ['/api/customers/stats'] });
      toast({ title: "Access Granted", description: data.message || "Customer access has been restored successfully.", duration: 5000 });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to grant customer access", variant: "destructive" });
    },
  });

  const getInitials = (firstName: string, lastName?: string, businessName?: string, phoneNumber?: string) => {
    if (businessName) return businessName.slice(0, 2).toUpperCase();
    if (firstName) return `${firstName[0]}${lastName ? lastName[0] : ''}`.toUpperCase();
    if (phoneNumber) return phoneNumber.replace(/\D/g, '').slice(-2);
    return '?';
  };

  const getDisplayName = (c: NamedEntity | null | undefined) =>
    c?.businessName || `${c?.firstName || ''} ${c?.lastName || ''}`.trim() || c?.phoneNumber || 'Unknown';

  const sortedCustomers = useMemo(() => [...(searchResults || [])].sort((a, b) => {
    const nameA = a.businessName || `${a.firstName || ''} ${a.lastName || ''}`.trim() || '';
    const nameB = b.businessName || `${b.firstName || ''} ${b.lastName || ''}`.trim() || '';
    return nameA.localeCompare(nameB);
  }), [searchResults]);

  // Address book handlers
  const handleEditCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    editCustomerForm.reset({
      firstName: customer.firstName ?? '',
      lastName: customer.lastName || '',
      phoneNumber: customer.phoneNumber || '',
      email: customer.email || '',
      businessName: customer.businessName || '',
      streetAddress: customer.streetAddress || '',
      addressLine2: customer.addressLine2 || '',
      city: customer.city || '',
      postalCode: customer.postalCode || '',
      country: customer.country || '',
    });
    setTimeout(() => setIsEditCustomerDialogOpen(true), 0);
  };

  const handleUpdateCustomer = (data: EditCustomerFormData) => {
    if (!selectedCustomer) return;
    updateCustomerMutation.mutate({ customerId: selectedCustomer.id, data });
  };

  const handleAddToGroup = (customer: Customer) => {
    setSelectedCustomer(customer);
    addToGroupForm.reset({ groupId: 0 });
    setTimeout(() => setIsAddToGroupDialogOpen(true), 0);
  };

  const handleAddCustomerToGroup = (data: AddToGroupFormData) => {
    if (!selectedCustomer) return;
    addCustomerToGroupMutation.mutate({ groupId: data.groupId, customerId: selectedCustomer.id });
  };

  const handleAddCustomer = (data: AddCustomerFormData) => {
    addCustomerMutation.mutate(data);
  };

  const handleViewCustomerOrders = (customer: Customer) => {
    setSelectedCustomer(customer);
    setIsViewCustomerOrdersDialogOpen(true);
  };

  const handleRemoveFromGroup = (customerId: string, groupId: number) => {
    removeFromGroupMutation.mutate({ groupId, customerId });
  };

  if (isListingTier(planLimits?.plan)) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <FeatureLock
          feature="Customer Management"
          description="Managing customers, groups, and invitations is available on the Starter plan and above."
        />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <PageHeader title="Customers" description="View and manage your wholesale customers">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <MoreHorizontal className="h-4 w-4" />
              <span className="hidden sm:inline">More</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            <DropdownMenuItem asChild>
              <Link href="/customer-registration-requests" className="flex items-center cursor-pointer">
                <UserPlus className="h-4 w-4 mr-2" /> Requests
              </Link>
            </DropdownMenuItem>
            {!isViewer && (
              <DropdownMenuItem onClick={() => setTimeout(() => setIsInvitationModalOpen(true), 0)}>
                <Share2 className="h-4 w-4 mr-2" /> Invite Customer
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        {!isViewer && (
          <Button
            size="sm"
            className="bg-green-600 hover:bg-green-700 text-white"
            onClick={() => setIsAddCustomerDialogOpen(true)}
          >
            <Plus className="h-4 w-4 mr-1.5" />
            <span className="hidden sm:inline">Add Customer</span>
            <span className="sm:hidden">Add</span>
          </Button>
        )}
      </PageHeader>

      {/* Add Customer Dialog */}
      <Dialog open={isAddCustomerDialogOpen} onOpenChange={setIsAddCustomerDialogOpen}>
        <DialogTrigger asChild>
          <span />
        </DialogTrigger>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Customer</DialogTitle>
            <DialogDescription>
              Add a new customer to your directory.
            </DialogDescription>
          </DialogHeader>
          <Form {...addCustomerForm}>
            <form onSubmit={addCustomerForm.handleSubmit(handleAddCustomer)} className="space-y-4">
              <div className="pb-1">
                <label className="text-sm font-medium mb-1.5 block">Search on Google</label>
                <BusinessSearchInput
                  placeholder="Type a business name to auto-fill..."
                  onSelect={handleBusinessSearch}
                />
              </div>
              <div className="border-t border-dashed pt-3">
                <p className="text-xs text-muted-foreground mb-3">Or fill in manually:</p>
              </div>
              <FormField
                control={addCustomerForm.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>First Name <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                    <FormControl>
                      <Input placeholder="John" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={addCustomerForm.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Last Name <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                    <FormControl>
                      <Input placeholder="Doe" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={addCustomerForm.control}
                name="businessName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Business Name <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                    <FormControl>
                      <Input placeholder="Acme Ltd" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={addCustomerForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                    <FormControl>
                      <Input placeholder="john@example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={addCustomerForm.control}
                name="phoneNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone Number *</FormLabel>
                    <FormControl>
                      <Input placeholder="+447123456789" {...field} />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">Required for payment links and customer login</p>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={addCustomerForm.control}
                name="groupId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Customer Group (Optional)</FormLabel>
                    <Select
                      onValueChange={(value) => field.onChange(value && value !== "no-group" ? parseInt(value) : undefined)}
                      value={field.value ? field.value.toString() : "no-group"}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a group (optional)" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="no-group">No group - Add to directory only</SelectItem>
                        {customerGroups.map((group) => (
                          <SelectItem key={group.id} value={group.id.toString()}>
                            {group.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="border-t pt-4">
                <p className="text-sm font-medium text-muted-foreground mb-3">Address <span className="font-normal">(optional — appears on invoices)</span></p>
                <div className="space-y-3">
                  <FormField
                    control={addCustomerForm.control}
                    name="streetAddress"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Address Line 1</FormLabel>
                        <FormControl>
                          <Input placeholder="123 High Street" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={addCustomerForm.control}
                    name="addressLine2"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Address Line 2</FormLabel>
                        <FormControl>
                          <Input placeholder="Flat, suite, unit (optional)" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={addCustomerForm.control}
                      name="city"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>City</FormLabel>
                          <FormControl>
                            <Input placeholder="London" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={addCustomerForm.control}
                      name="postalCode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Postcode</FormLabel>
                          <FormControl>
                            <Input placeholder="SW1A 1AA" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={addCustomerForm.control}
                    name="country"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Country</FormLabel>
                        <FormControl>
                          <Input placeholder="United Kingdom" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
              <div className="flex justify-end space-x-2">
                <Button type="button" variant="outline" onClick={() => setIsAddCustomerDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={addCustomerMutation.isPending}>
                  {addCustomerMutation.isPending ? "Adding..." : "Add Customer"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <div className="space-y-4 sm:space-y-6 p-4 sm:p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4 sm:space-y-6">
          <TabsList className="grid w-full grid-cols-4 h-auto bg-slate-100 p-1 rounded-xl">
            <TabsTrigger value="address-book" className="flex items-center justify-center space-x-1 sm:space-x-2 py-2 sm:py-3 rounded-lg data-[state=active]:bg-white data-[state=active]:text-emerald-700 data-[state=active]:shadow-sm">
              <Contact className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="text-xs sm:text-sm">Directory</span>
            </TabsTrigger>
            <TabsTrigger value="groups" className="flex items-center justify-center space-x-1 sm:space-x-2 py-2 sm:py-3 rounded-lg data-[state=active]:bg-white data-[state=active]:text-emerald-700 data-[state=active]:shadow-sm">
              <Users className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="text-xs sm:text-sm">Groups</span>
            </TabsTrigger>
            <TabsTrigger value="price-lists" className="flex items-center justify-center space-x-1 sm:space-x-2 py-2 sm:py-3 rounded-lg data-[state=active]:bg-white data-[state=active]:text-emerald-700 data-[state=active]:shadow-sm">
              <Tag className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="text-xs sm:text-sm">Price Lists</span>
            </TabsTrigger>
            <TabsTrigger value="price-changes" className="flex items-center justify-center space-x-1 sm:space-x-2 py-2 sm:py-3 rounded-lg data-[state=active]:bg-white data-[state=active]:text-emerald-700 data-[state=active]:shadow-sm">
              <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="text-xs sm:text-sm">Price Changes</span>
            </TabsTrigger>
          </TabsList>

          {/* Address Book Tab */}
          <TabsContent value="address-book" className="space-y-4 sm:space-y-6">

            {stats && (
              <div className={`grid gap-2 mb-2 ${user?.role !== 'team_member' ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2'}`}>
                {user?.role !== 'team_member' && (
                  <div className="rounded-lg bg-green-50 border border-green-100 px-3 py-2.5 flex items-center gap-2 min-w-0">
                    <DollarSign className="h-4 w-4 text-green-500 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[11px] text-green-700">Paid</p>
                      <p className="text-sm font-bold text-green-600 truncate">{formatMoney(stats.totalRevenue)}</p>
                    </div>
                  </div>
                )}
                {user?.role !== 'team_member' && (
                  <div className="rounded-lg bg-red-50 border border-red-100 px-3 py-2.5 flex items-center gap-2 min-w-0">
                    <Clock className="h-4 w-4 text-red-500 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[11px] text-red-700">Unpaid</p>
                      <p className="text-sm font-bold text-red-600 truncate">{formatMoney(stats.totalUnpaid)}</p>
                    </div>
                  </div>
                )}
                <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2.5 flex items-center gap-2 min-w-0">
                  <Users className="h-4 w-4 text-blue-500 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[11px] text-blue-700">Customers</p>
                    <p className="text-sm font-bold text-blue-600">{stats.totalCustomers}</p>
                  </div>
                </div>
                <div className="rounded-lg bg-orange-50 border border-orange-100 px-3 py-2.5 flex items-center gap-2 min-w-0">
                  <Activity className="h-4 w-4 text-orange-500 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[11px] text-orange-700">Active</p>
                    <p className="text-sm font-bold text-orange-600">{stats.activeCustomers}</p>
                  </div>
                </div>
              </div>
            )}

            <div className="sticky top-14 lg:top-0 z-10 bg-white border-b border-slate-100 py-2 -mx-4 sm:-mx-6 px-4 sm:px-6 mb-4">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <Input
                    placeholder="Search customers..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 h-8 border-slate-200 rounded-lg focus:ring-emerald-500/30 focus:border-emerald-400"
                  />
                </div>
                {!isViewer && (
                  <Button
                    size="sm"
                    className="lg:hidden h-8 bg-green-600 hover:bg-green-700 text-white shrink-0"
                    onClick={() => setIsAddCustomerDialogOpen(true)}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => {
                      if (!customers || customers.length === 0) {
                        toast({ title: "No customers found", description: "Please wait for customer data to load", variant: "destructive" });
                        return;
                      }
                      const duplicatePhoneGroups = new Map<string, Customer[]>();
                      customers.forEach(customer => {
                        if (!customer?.phoneNumber) return;
                        const lastFour = customer?.phoneNumber?.slice(-4) || '';
                        if (!duplicatePhoneGroups.has(lastFour)) {
                          duplicatePhoneGroups.set(lastFour, []);
                        }
                        duplicatePhoneGroups.get(lastFour)!.push(customer);
                      });
                      const duplicateGroups = Array.from(duplicatePhoneGroups.values()).filter(group => group.length > 1);
                      if (duplicateGroups.length > 0) {
                        const firstDuplicateGroup = duplicateGroups[0];
                        setMergeInitialDuplicates(firstDuplicateGroup.sort((a, b) => (b?.totalOrders || 0) - (a?.totalOrders || 0)));
                        setMergeInitialMode('automatic');
                        setIsMergeDialogOpen(true);
                      } else {
                        const fallbackAccounts = customers.filter(customer =>
                          customer?.firstName?.toLowerCase().includes('michael') ||
                          customer?.firstName?.toLowerCase().includes('john')
                        ).sort((a, b) => (b?.totalOrders || 0) - (a?.totalOrders || 0));
                        if (fallbackAccounts.length > 1) {
                          setMergeInitialDuplicates(fallbackAccounts);
                          setMergeInitialMode('automatic');
                          setIsMergeDialogOpen(true);
                        } else {
                          toast({ title: "No duplicates found", description: "No duplicate customer accounts detected" });
                        }
                      }
                    }}>
                      <Users className="h-4 w-4 mr-2" />
                      Auto-Detect Duplicates
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => {
                      setMergeInitialDuplicates([]);
                      setMergeInitialMode('manual');
                      setTimeout(() => setIsMergeDialogOpen(true), 0);
                    }}>
                      <Search className="h-4 w-4 mr-2" />
                      Search & Merge Customers
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Customer List */}
            {isLoadingCustomers ? (
              <div className="flex items-center justify-center h-64">
                <ElephantLoader message="Loading your customers..." />
              </div>
            ) : sortedCustomers.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <Contact className="h-12 w-12 text-gray-400 mb-4" />
                  <h3 className="text-base font-medium text-gray-900 mb-2">No customers found</h3>
                  <p className="text-gray-500 text-center mb-6 max-w-sm">
                    {searchQuery ? 'No customers match your search criteria.' : 'Start adding customers to your groups to see them here.'}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="divide-y divide-gray-100 border border-gray-100 rounded-lg overflow-hidden bg-white">
                {sortedCustomers.map((customer) => (
                  <div key={customer?.id} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 transition-colors cursor-pointer min-w-0" onClick={() => navigate(`/customers/${customer?.id}`)}>
                    <Avatar className="h-8 w-8 flex-shrink-0">
                      <AvatarFallback className="bg-blue-100 text-blue-600 text-xs">
                        {getInitials(customer?.firstName || '', customer?.lastName, customer?.businessName, customer?.phoneNumber)}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0 overflow-hidden">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-semibold text-gray-900 truncate max-w-full">
                          {getDisplayName(customer)}
                        </h3>
                        {customer?.groupNames && customer.groupNames.length > 0 && (
                          <div className="hidden sm:flex gap-1">
                            {Array.from(new Set(customer?.groupNames || [])).slice(0, 2).map((groupName, index) => (
                              <Badge key={index} variant="outline" className="text-[10px] py-0 px-1.5">
                                {groupName}
                              </Badge>
                            ))}
                          </div>
                        )}
                        {!customer?.businessName?.trim() && !customer?.firstName?.trim() && !customer?.lastName?.trim() && (
                          <Badge
                            className="text-[10px] py-0 px-1.5 bg-amber-100 text-amber-700 border border-amber-300 shrink-0 cursor-pointer hover:bg-amber-200 transition-colors"
                            onClick={(e) => { e.stopPropagation(); handleEditCustomer(customer); }}
                            title="Click to add a name"
                          >
                            <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                            Add name
                          </Badge>
                        )}
                        {customer?.id && priceListCustomerSummary[customer.id] && (
                          <Badge
                            variant="secondary"
                            className="text-[10px] py-0 px-1.5 cursor-pointer hover:bg-blue-100 hover:text-blue-700 transition-colors shrink-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPriceListFilterCustomer({
                                id: customer.id,
                                name: `${customer.firstName || 'Unknown'} ${customer.lastName || ''}`.trim(),
                              });
                              setActiveTab('price-lists');
                            }}
                            title={priceListCustomerSummary[customer.id].names.join(', ')}
                          >
                            <Tag className="h-2.5 w-2.5 mr-0.5" />
                            {priceListCustomerSummary[customer.id].count} {priceListCustomerSummary[customer.id].count === 1 ? 'price list' : 'price lists'}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5 overflow-hidden">
                        <span className="shrink-0">{customer?.phoneNumber || 'No phone'}</span>
                        {customer?.email && <span className="hidden sm:inline truncate overflow-hidden text-ellipsis">{customer.email}</span>}
                      </div>
                    </div>

                    <div className="flex items-center gap-4 shrink-0">
                      <div className="text-right hidden sm:block">
                        <p className="text-sm font-medium">{customer?.totalOrders || 0} orders</p>
                        <p className="text-xs text-gray-500">{formatMoney(customer?.totalInvoiced || 0)}</p>
                      </div>
                      <div className="sm:hidden text-right">
                        <p className="text-xs font-medium">{customer?.totalOrders || 0}</p>
                        <p className="text-[10px] text-gray-500">{formatMoney(customer?.totalInvoiced || 0)}</p>
                      </div>
                      <div onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                            <DropdownMenuItem onClick={() => handleViewCustomerOrders(customer)}>
                              <Eye className="h-4 w-4 mr-2" />
                              View Orders
                            </DropdownMenuItem>
                            {!isViewer && (
                              <DropdownMenuItem onClick={() => handleAddToGroup(customer)}>
                                <UserCheck className="h-4 w-4 mr-2" />
                                Add to Group
                              </DropdownMenuItem>
                            )}
                            {!isViewer && (
                              <DropdownMenuItem onClick={() => setPriceListTarget({ id: customer.id, name: getDisplayName(customer) })}>
                                <Tag className="h-4 w-4 mr-2" />
                                Add to Price List
                              </DropdownMenuItem>
                            )}
                            {!isViewer && (
                              <DropdownMenuItem onClick={() => handleEditCustomer(customer)}>
                                <Edit3 className="h-4 w-4 mr-2" />
                                Edit Customer
                              </DropdownMenuItem>
                            )}
                            {!isViewer && (
                              <DropdownMenuItem
                                onClick={() => {
                                  const phone = customer?.phoneNumber?.replace(/[^0-9]/g, '');
                                  if (phone) window.open(`https://wa.me/${phone}`, '_blank');
                                }}
                              >
                                <MessageCircle className="h-4 w-4 mr-2" />
                                Send Message
                              </DropdownMenuItem>
                            )}
                            {!isViewer && (
                              <DropdownMenuItem
                                className="text-orange-600"
                                onClick={() => {
                                  if (confirm(`Remove portal access for ${getDisplayName(customer)}? They will no longer be able to access your customer portal, but their order history will be preserved.`)) {
                                    removeCustomerAccessMutation.mutate(customer?.id);
                                  }
                                }}
                                disabled={removeCustomerAccessMutation.isPending}
                              >
                                <ShieldX className="h-4 w-4 mr-2" />
                                Remove Access
                              </DropdownMenuItem>
                            )}
                            {!isViewer && (
                              <DropdownMenuItem
                                className="text-red-600"
                                onClick={() => {
                                  if (confirm(`Are you sure you want to delete ${getDisplayName(customer)}? This action cannot be undone.`)) {
                                    deleteCustomerMutation.mutate(customer?.id);
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
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Customer Groups Tab */}
          <TabsContent value="groups" className="space-y-4 sm:space-y-6">
            <CustomerGroupsTab
              customers={customers}
              user={user ?? null}
              isViewer={isViewer}
              showUpgradeModal={showUpgradeModal}
              setShowUpgradeModal={setShowUpgradeModal}
              planLimits={planLimits}
              planLimitsLoading={planLimitsLoading}
              customerGroups={customerGroups}
              isLoadingGroups={isLoadingGroups}
            />
          </TabsContent>

          {/* Price Lists Tab */}
          <TabsContent value="price-lists" className="space-y-4 sm:space-y-6">
            <PriceListManagementDialog
              customers={customers}
              user={user ?? null}
              customerGroups={customerGroups}
              planLimits={planLimits}
              planLimitsLoading={planLimitsLoading}
              priceListIdFromUrl={priceListIdFromUrl}
              onActivatePriceListsTab={() => setActiveTab('price-lists')}
              filterCustomer={priceListFilterCustomer}
              onFilterChange={setPriceListFilterCustomer}
            />
          </TabsContent>

          <TabsContent value="price-changes" className="space-y-4 sm:space-y-6">
            <PriceChangesTab />
          </TabsContent>
        </Tabs>
      </div>

      {/* Edit Customer Dialog */}
      <Dialog open={isEditCustomerDialogOpen} onOpenChange={setIsEditCustomerDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Customer Information</DialogTitle>
            <DialogDescription>
              Update customer details. Changes will be reflected across all groups.
            </DialogDescription>
          </DialogHeader>
          <Form {...editCustomerForm}>
            <form onSubmit={editCustomerForm.handleSubmit(handleUpdateCustomer)} className="space-y-4">
              <FormField
                control={editCustomerForm.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>First Name</FormLabel>
                    <FormControl>
                      <Input placeholder="First name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editCustomerForm.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Last Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Last name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editCustomerForm.control}
                name="phoneNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone Number</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., +44 7123 456789" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editCustomerForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input placeholder="customer@example.com" type="email" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editCustomerForm.control}
                name="businessName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Business Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter business name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="border-t pt-4">
                <p className="text-sm font-medium text-muted-foreground mb-3">Address <span className="font-normal">(optional — appears on invoices)</span></p>
                <div className="space-y-3">
                  <FormField
                    control={editCustomerForm.control}
                    name="streetAddress"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Address Line 1</FormLabel>
                        <FormControl>
                          <Input placeholder="123 High Street" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editCustomerForm.control}
                    name="addressLine2"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Address Line 2</FormLabel>
                        <FormControl>
                          <Input placeholder="Flat, suite, unit (optional)" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <FormField
                      control={editCustomerForm.control}
                      name="city"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>City</FormLabel>
                          <FormControl>
                            <Input placeholder="London" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={editCustomerForm.control}
                      name="postalCode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Postcode</FormLabel>
                          <FormControl>
                            <Input placeholder="SW1A 1AA" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={editCustomerForm.control}
                    name="country"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Country</FormLabel>
                        <FormControl>
                          <Input placeholder="United Kingdom" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
              <div className="flex justify-end space-x-2">
                <Button type="button" variant="outline" onClick={() => setIsEditCustomerDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={updateCustomerMutation.isPending}>
                  {updateCustomerMutation.isPending ? "Updating..." : "Update Customer"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Add Customer to Group Dialog */}
      <Dialog open={isAddToGroupDialogOpen} onOpenChange={setIsAddToGroupDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add {selectedCustomer?.firstName} to Group</DialogTitle>
            <DialogDescription>
              Select an existing customer group to add this customer to.
            </DialogDescription>
          </DialogHeader>
          <Form {...addToGroupForm}>
            <form onSubmit={addToGroupForm.handleSubmit(handleAddCustomerToGroup)} className="space-y-4">
              <FormField
                control={addToGroupForm.control}
                name="groupId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Customer Group</FormLabel>
                    <Select
                      onValueChange={(value) => field.onChange(parseInt(value))}
                      value={field.value?.toString()}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a group" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {customerGroups
                          .filter(group => !selectedCustomer?.groupIds.includes(group.id))
                          .map((group) => (
                            <SelectItem key={group.id} value={group.id.toString()}>
                              {group.name} ({group.memberCount || 0} members)
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {selectedCustomer && selectedCustomer.groupNames && selectedCustomer.groupNames.length > 0 && (
                <div className="p-3 bg-blue-50 rounded-lg">
                  <p className="text-sm text-blue-700 font-medium mb-2">
                    Currently in groups:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {Array.from(new Set(selectedCustomer.groupNames)).map((groupName, index) => {
                      const groupId = customerGroups.find(g => g.name === groupName)?.id;
                      return (
                        <div key={index} className="flex items-center space-x-1 bg-white rounded-full px-3 py-1 border">
                          <Badge variant="outline" className="text-xs border-0 px-0">
                            {groupName}
                          </Badge>
                          {groupId && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-4 w-4 p-0 hover:bg-red-100"
                              onClick={() => selectedCustomer && handleRemoveFromGroup(selectedCustomer.id, groupId)}
                              title="Remove from group"
                            >
                              <X className="h-3 w-3 text-red-500" />
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="flex justify-end space-x-2">
                <Button type="button" variant="outline" onClick={() => setIsAddToGroupDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={addCustomerToGroupMutation.isPending}>
                  {addCustomerToGroupMutation.isPending ? "Adding..." : "Add to Group"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Customer Order History Dialog */}
      <Dialog open={isViewCustomerOrdersDialogOpen} onOpenChange={setIsViewCustomerOrdersDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedCustomer ? `${getDisplayName(selectedCustomer)} — Order History` : 'Order History'}
            </DialogTitle>
            <DialogDescription>
              Complete order history for this customer
            </DialogDescription>
          </DialogHeader>

          {selectedCustomer && user && (
            <CustomerOrderHistory
              wholesalerId={user.id}
              customerPhone={selectedCustomer.phoneNumber}
            />
          )}

          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setIsViewCustomerOrdersDialogOpen(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add to Price List Dialog */}
      <AddToPriceListDialog
        customer={priceListTarget}
        open={!!priceListTarget}
        onClose={() => setPriceListTarget(null)}
      />

      {/* Customer Merge Dialog */}
      <CustomerMergeDialog
        customers={customers}
        open={isMergeDialogOpen}
        onOpenChange={setIsMergeDialogOpen}
        initialDuplicates={mergeInitialDuplicates}
        initialMode={mergeInitialMode}
      />

      {/* Upgrade Modal */}
      <SubscriptionUpgradeModal
        open={showUpgradeModal}
        onOpenChange={setShowUpgradeModal}
        feature="more customer groups"
        currentPlan={planLimits?.plan ?? "Free"}
      />

      {/* Customer Invitation Modal */}
      <CustomerInvitationModal
        isOpen={isInvitationModalOpen}
        onOpenChange={setIsInvitationModalOpen}
      />
    </div>
  );
}
