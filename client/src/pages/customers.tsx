import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useCurrency } from "@/hooks/useCurrency";
import PageHeader from "@/components/PageHeader";
import ElephantLoader from "@/components/ui/elephant-loader";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAuth, type AuthUser } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useLocation, Link } from "wouter";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { 
  Users, 
  Plus, 
  MessageSquare, 
  UserPlus,
  Phone,
  Edit,
  Trash2,
  Upload,
  Search,
  User,
  Mail,
  MapPin,
  ShoppingBag,
  DollarSign,
  Calendar,
  Edit3,
  TrendingUp,
  Activity,
  Contact,
  UserCheck,
  X,
  Eye,
  Smartphone,
  ContactRound,
  Check,
  ChevronDown,
  ChevronUp,
  MessageCircle,
  Shield,
  ShieldX,
  UserX,
  MoreHorizontal,
  Clock,
  Tag,
  Share2,
  Download,
  Package,
  Lock,
  AlertTriangle,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ContextualHelpBubble } from "@/components/ContextualHelpBubble";
import { helpContent } from "@/data/whatsapp-help-content";
import { CustomerOrderHistory } from "@/components/customer/CustomerOrderHistory";
import { DynamicTooltip } from "@/components/ui/dynamic-tooltip";
import CustomerInvitationModal from "@/components/CustomerInvitationModal";
import { SubscriptionUpgradeModal } from "@/components/subscription/SubscriptionUpgradeModal";

// ── Price List Types ───────────────────────────────────────────────────────
interface PriceListSummary {
  id: number;
  wholesalerId: string;
  name: string;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
  isLocked: boolean;
  createdAt: string;
  updatedAt: string;
  itemCount: number;
  assignmentCount: number;
}

interface PriceListItemForm {
  productId: number;
  product: { id: number; name: string; price: string; palletPrice?: string | null } | undefined;
  customPrice: string;
  discountPercentage: string;
  customPalletPrice: string;
}

interface PriceListAssignmentForm {
  customerId: string | null;
  customerGroupId: number | null;
}

interface PriceListDetail extends PriceListSummary {
  items: PriceListItemForm[];
  assignments: PriceListAssignmentForm[];
}

interface PLProduct {
  id: number;
  name: string;
  price: string;
  palletPrice?: string | null;
}

// Form Schemas
const customerGroupFormSchema = z.object({
  name: z.string().min(1, "Group name is required"),
  description: z.string().optional(),
});

const addMemberFormSchema = z.object({
  phoneNumber: z.string()
    .min(10, "Valid phone number is required")
    .regex(/^\+?[\d\s\-\(\)]+$/, "Please enter a valid phone number"),
  name: z.string().min(1, "Customer name is required"),
  email: z.string().email("Please enter a valid email address").optional().or(z.literal("")),
});

const bulkAddFormSchema = z.object({
  contacts: z.string().min(1, "Please enter contact information"),
});

const editMemberFormSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  phoneNumber: z.string()
    .min(10, "Valid phone number is required")
    .regex(/^\+?[\d\s\-\(\)]+$/, "Please enter a valid phone number"),
  name: z.string().min(1, "Customer name is required"),
  email: z.string().email("Please enter a valid email address").optional().or(z.literal("")),
});

const editCustomerFormSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  phoneNumber: z.string()
    .min(10, "Valid phone number is required")
    .regex(/^\+?[\d\s\-\(\)]+$/, "Please enter a valid phone number"),
  email: z.union([
    z.string().email("Please enter a valid email address"),
    z.literal("")
  ]).optional(),
  businessName: z.string().optional(),
});

const editGroupFormSchema = z.object({
  name: z.string().min(1, "Group name is required"),
  description: z.string().optional(),
});

const addToGroupFormSchema = z.object({
  groupId: z.number().min(1, "Please select a group"),
});

const addCustomerFormSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().optional(),
  email: z.string().email("Please enter a valid email address").optional().or(z.literal("")),
  phoneNumber: z.string()
    .min(10, "Valid phone number is required")
    .regex(/^\+?[\d\s\-\(\)]+$/, "Please enter a valid phone number"),
  groupId: z.number().optional(), // Optional group assignment
});

const searchAndAddFormSchema = z.object({
  customerId: z.string().min(1, "Please select a customer"),
});

// Type definitions
type CustomerGroupFormData = z.infer<typeof customerGroupFormSchema>;
type AddMemberFormData = z.infer<typeof addMemberFormSchema>;
type BulkAddFormData = z.infer<typeof bulkAddFormSchema>;
type EditMemberFormData = z.infer<typeof editMemberFormSchema>;
type EditCustomerFormData = z.infer<typeof editCustomerFormSchema>;
type EditGroupFormData = z.infer<typeof editGroupFormSchema>;
type AddToGroupFormData = z.infer<typeof addToGroupFormSchema>;
type SearchAndAddFormData = z.infer<typeof searchAndAddFormSchema>;
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

interface CustomerStats {
  totalCustomers: number;
  activeCustomers: number;
  totalUnpaid: number;
  topCustomers: { customerId: string; name: string; totalSpent: number }[];
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
  
  // Group management state
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<CustomerGroup | null>(null);
  const [isAddMemberDialogOpen, setIsAddMemberDialogOpen] = useState(false);
  const [isBulkAddDialogOpen, setIsBulkAddDialogOpen] = useState(false);
  const [isEditMemberDialogOpen, setIsEditMemberDialogOpen] = useState(false);
  const [isEditGroupDialogOpen, setIsEditGroupDialogOpen] = useState(false);
  const [isImportContactsDialogOpen, setIsImportContactsDialogOpen] = useState(false);
  const [isSearchAndAddDialogOpen, setIsSearchAndAddDialogOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<any>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [selectedContacts, setSelectedContacts] = useState<any[]>([]);
  const [deviceContacts, setDeviceContacts] = useState<any[]>([]);
  const [isAddCustomerDialogOpen, setIsAddCustomerDialogOpen] = useState(false);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  
  // Address book state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isEditCustomerDialogOpen, setIsEditCustomerDialogOpen] = useState(false);
  const [isAddToGroupDialogOpen, setIsAddToGroupDialogOpen] = useState(false);
  const [isViewCustomerOrdersDialogOpen, setIsViewCustomerOrdersDialogOpen] = useState(false);
  const [isViewMembersDialogOpen, setIsViewMembersDialogOpen] = useState(false);
  const [selectedGroupForCustomer, setSelectedGroupForCustomer] = useState<number | null>(null);
  
  // Customer merge states
  const [isMergeDialogOpen, setIsMergeDialogOpen] = useState(false);
  const [selectedDuplicates, setSelectedDuplicates] = useState<Customer[]>([]);
  const [potentialDuplicates, setPotentialDuplicates] = useState<Customer[]>([]);
  const [mergeSearchQuery, setMergeSearchQuery] = useState('');
  const [selectedCustomersForMerge, setSelectedCustomersForMerge] = useState<Customer[]>([]);
  const [mergeMode, setMergeMode] = useState<'automatic' | 'manual'>('automatic');
  
  // Multi-wholesaler invitation state
  const [isInvitationModalOpen, setIsInvitationModalOpen] = useState(false);

  // Price List state
  const [isPriceListModalOpen, setIsPriceListModalOpen] = useState(false);
  const [editingPriceList, setEditingPriceList] = useState<PriceListSummary | null>(null);
  const [isManagePriceListOpen, setIsManagePriceListOpen] = useState(false);
  const [managingPriceList, setManagingPriceList] = useState<PriceListSummary | null>(null);
  const [plProductSearch, setPlProductSearch] = useState("");
  const [priceListItems, setPriceListItems] = useState<PriceListItemForm[]>([]);
  const [incompletePLItems, setIncompletePLItems] = useState<Set<number>>(new Set());
  const [priceListAssignments, setPriceListAssignments] = useState<PriceListAssignmentForm[]>([]);
  const [priceListForm, setPriceListForm] = useState({
    name: "", description: "", startDate: "", endDate: "", isActive: true,
  });
  const [expandedPriceLists, setExpandedPriceLists] = useState<Record<number, boolean>>({});
  const [priceListDetailCache, setPriceListDetailCache] = useState<Record<number, PriceListDetail>>({});
  const priceListIdFromUrl = Number(urlParams.get('priceListId')) || null;
  const autoExpandedRef = useRef(false);

  // Forms
  const createGroupForm = useForm<CustomerGroupFormData>({
    resolver: zodResolver(customerGroupFormSchema),
    defaultValues: { name: "", description: "" },
  });

  const addMemberForm = useForm<AddMemberFormData>({
    resolver: zodResolver(addMemberFormSchema),
    defaultValues: { phoneNumber: "", name: "", email: "" },
  });

  const bulkAddForm = useForm<BulkAddFormData>({
    resolver: zodResolver(bulkAddFormSchema),
    defaultValues: { contacts: "" },
  });

  const editMemberForm = useForm<EditMemberFormData>({
    resolver: zodResolver(editMemberFormSchema),
    defaultValues: { phoneNumber: "", name: "", email: "" },
  });

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

  const editGroupForm = useForm<EditGroupFormData>({
    resolver: zodResolver(editGroupFormSchema),
    defaultValues: { name: "", description: "" },
  });

  const addCustomerForm = useForm<AddCustomerFormData>({
    resolver: zodResolver(addCustomerFormSchema),
    defaultValues: { firstName: "", lastName: "", email: "", phoneNumber: "", groupId: undefined },
  });

  const searchAndAddForm = useForm<SearchAndAddFormData>({
    resolver: zodResolver(searchAndAddFormSchema),
    defaultValues: { customerId: "" },
  });

  // Plan limits — used for group limit pre-check before opening Create Group dialog
  const { data: planLimits, isLoading: planLimitsLoading } = useQuery<{
    plan: string;
    limits: { products: number; broadcasts: number; teamMembers: number; customGroups: number; priceLists: number };
    usage: { products: number; broadcasts: number; teamMembers: number; priceLists: number };
  }>({
    queryKey: ['/api/subscriptions/plan-limits'],
    staleTime: 5 * 60 * 1000,
  });

  // Optimized Queries - Customer Groups (longer cache, conditional loading)
  const { data: customerGroups = [], isLoading: isLoadingGroups } = useQuery<CustomerGroup[]>({
    queryKey: ['/api/customer-groups'],
    staleTime: 10 * 60 * 1000, // 10 minutes cache
    gcTime: 15 * 60 * 1000,
  });

  const { data: groupMembers = [] } = useQuery({
    queryKey: ['/api/customer-groups', selectedGroup?.id, 'members'],
    queryFn: async () => {
      if (!selectedGroup?.id) return [];
      const url = `/api/customer-groups/${selectedGroup.id}/members`;
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) {
        throw new Error(`Failed to fetch group members: ${response.status}`);
      }
      return response.json();
    },
    enabled: !!selectedGroup?.id && isViewMembersDialogOpen,
    staleTime: 10 * 60 * 1000, // Longer cache
    gcTime: 15 * 60 * 1000,
  });

  // Query for customer orders - only when needed
  const { data: customerOrders = [] } = useQuery({
    queryKey: ['/api/orders'],
    staleTime: 10 * 60 * 1000, // Longer cache
    gcTime: 15 * 60 * 1000,
    enabled: isViewCustomerOrdersDialogOpen, // Only load when dialog is open
  });

  // Optimized queries for single customer scenario
  const { data: customers = [], isLoading: isLoadingCustomers, refetch: refetchCustomers } = useQuery<Customer[]>({
    queryKey: ['/api/customers'],
    staleTime: 10 * 60 * 1000, // 10 minutes - much longer cache for single customer
    gcTime: 15 * 60 * 1000, // Keep in memory longer
  });

  // Calculate stats from existing customer data instead of separate API call
  const stats = useMemo(() => {
    if (!customers.length) return null;
    
    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    return {
      totalCustomers: customers.length,
      activeCustomers: customers.filter(c => c.totalOrders > 0).length,
      totalUnpaid: customers.reduce((sum, c) => sum + ((c as any).totalUnpaid || 0), 0),
      totalRevenue: customers.reduce((sum, c) => sum + (c.totalSpent || 0), 0)
    };
  }, [customers]);

  // Client-side search filtering - instant, no API call needed
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return customers;
    const q = searchQuery.toLowerCase();
    return customers.filter(c =>
      (c.firstName || '').toLowerCase().includes(q) ||
      (c.lastName || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.phoneNumber || '').toLowerCase().includes(q)
    );
  }, [customers, searchQuery]);

  // Mutations - Customer Groups
  const createGroupMutation = useMutation({
    mutationFn: (data: CustomerGroupFormData) => apiRequest('POST', '/api/customer-groups', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/customer-groups'] });
      toast({ title: "Success", description: "Customer group created successfully!" });
      setIsCreateDialogOpen(false);
      createGroupForm.reset();
    },
    onError: (error: any) => {
      if (error.message?.includes("403") && error.message?.toLowerCase().includes("group")) {
        setIsCreateDialogOpen(false);
        setShowUpgradeModal(true);
      } else {
        toast({
          title: "Error",
          description: error.message || "Failed to create customer group",
          variant: "destructive",
        });
      }
    },
  });

  const editGroupMutation = useMutation({
    mutationFn: ({ groupId, data }: { groupId: number; data: EditGroupFormData }) =>
      apiRequest('PUT', `/api/customer-groups/${groupId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/customer-groups'] });
      toast({ title: "Success", description: "Customer group updated successfully!" });
      setIsEditGroupDialogOpen(false);
      editGroupForm.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update customer group",
        variant: "destructive",
      });
    },
  });

  const addMemberMutation = useMutation({
    mutationFn: ({ groupId, data }: { groupId: number; data: AddMemberFormData }) =>
      apiRequest('POST', `/api/customer-groups/${groupId}/members`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/customer-groups'] });
      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
      toast({ title: "Success", description: "Customer added successfully!" });
      setIsAddMemberDialogOpen(false);
      addMemberForm.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add customer",
        variant: "destructive",
      });
    },
  });

  // Mutations - Customer Address Book
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
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update customer",
        variant: "destructive",
      });
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
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add customer to group",
        variant: "destructive",
      });
    },
  });

  // Customer merge mutation
  const mergeCustomersMutation = useMutation({
    mutationFn: ({ primaryCustomerId, duplicateCustomerIds, mergedData }: { 
      primaryCustomerId: string; 
      duplicateCustomerIds: string[]; 
      mergedData?: any 
    }) =>
      apiRequest('POST', '/api/customers/merge', { primaryCustomerId, duplicateCustomerIds, mergedData }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
      queryClient.invalidateQueries({ queryKey: ['/api/customer-groups'] });
      toast({ 
        title: "Success", 
        description: (data as any)?.message || "Successfully merged customer records" 
      });
      setIsMergeDialogOpen(false);
      setSelectedDuplicates([]);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to merge customers",
        variant: "destructive",
      });
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
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to remove customer from group",
        variant: "destructive",
      });
    },
  });

  const addCustomerMutation = useMutation({
    mutationFn: (data: AddCustomerFormData) => apiRequest('POST', '/api/customers', data),
    onSuccess: async (response: any) => {
      await queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/customers/stats'] });
      await refetchCustomers(); // Force immediate refresh
      
      // Show welcome message status if available
      if (response.welcomeMessages) {
        const { emailSent, whatsappSent, errors } = response.welcomeMessages;
        let description = "Customer added successfully!";
        
        if (emailSent && whatsappSent) {
          description += " Welcome email and WhatsApp message sent.";
        } else if (emailSent) {
          description += " Welcome email sent.";
        } else if (whatsappSent) {
          description += " Welcome WhatsApp message sent.";
        }
        
        if (errors.length > 0) {
          console.warn("Welcome message errors:", errors);
        }
        
        toast({ title: "Success", description });
      } else {
        toast({ title: "Success", description: "Customer added to directory successfully!" });
      }
      
      setIsAddCustomerDialogOpen(false);
      addCustomerForm.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add customer",
        variant: "destructive",
      });
    },
  });

  const deleteCustomerMutation = useMutation({
    mutationFn: (customerId: string) => apiRequest('DELETE', `/api/customers/${customerId}`),
    onSuccess: (data: any) => {
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
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete customer",
        variant: "destructive",
      });
    },
  });

  const sendWelcomeMessageMutation = useMutation({
    mutationFn: (customerId: string) => apiRequest('POST', `/api/customers/${customerId}/send-welcome`),
    onSuccess: (data: any) => {
      const { customerName, welcomeMessages } = data;
      
      // Safely extract welcome message data with defaults
      const emailSent = welcomeMessages?.emailSent || false;
      const smsSent = welcomeMessages?.smsSent || false;
      const whatsappSent = welcomeMessages?.whatsappSent || false;
      const errors = welcomeMessages?.errors || [];
      
      let description = `Welcome message sent to ${customerName}:\n`;
      if (emailSent) description += "✓ Email sent successfully\n";
      if (smsSent) description += "✓ SMS sent successfully\n";
      if (whatsappSent) description += "✓ WhatsApp message sent successfully\n";
      if (errors && errors.length > 0) {
        description += `⚠️ ${errors.join(', ')}`;
      }
      
      toast({
        title: "Welcome Message Sent",
        description: description,
        variant: emailSent || smsSent || whatsappSent ? "default" : "destructive",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Send Welcome Message",
        description: error.message || "Could not send welcome message to customer",
        variant: "destructive",
      });
    },
  });

  // Access control mutations
  const removeCustomerAccessMutation = useMutation({
    mutationFn: (customerId: string) => apiRequest('DELETE', `/api/wholesaler/customer/${customerId}`),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
      queryClient.invalidateQueries({ queryKey: ['/api/customers/stats'] });
      toast({ 
        title: "Access Removed", 
        description: data.message || "Customer access to your portal has been removed successfully.",
        duration: 5000
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to remove customer access",
        variant: "destructive",
      });
    },
  });

  const allowCustomerAccessMutation = useMutation({
    mutationFn: (customerData: { email: string; phoneNumber?: string; firstName?: string; lastName?: string }) => 
      apiRequest('POST', '/api/wholesaler/invite', customerData),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
      queryClient.invalidateQueries({ queryKey: ['/api/customers/stats'] });
      toast({ 
        title: "Access Granted", 
        description: data.message || "Customer access has been restored successfully.",
        duration: 5000
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to grant customer access",
        variant: "destructive",
      });
    },
  });

  const updateMemberMutation = useMutation({
    mutationFn: ({ groupId, memberId, data }: { groupId: number; memberId: string; data: EditMemberFormData }) =>
      apiRequest('PATCH', `/api/customer-groups/${groupId}/members/${memberId}`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/customer-groups'] });
      queryClient.invalidateQueries({ queryKey: [`/api/customer-groups/${selectedGroup?.id}/members`] });
      const nameChanged = selectedMember && (
        (variables.data.firstName || '') !== (selectedMember.firstName || '') ||
        (variables.data.lastName || '') !== (selectedMember.lastName || '') ||
        (variables.data.name || '') !== (selectedMember.name || '')
      );
      if (nameChanged) {
        toast({ title: "Customer name updated", description: "All future invoices will reflect this change." });
      } else {
        toast({ title: "Success", description: "Member updated successfully!" });
      }
      setIsEditMemberDialogOpen(false);
      editMemberForm.reset();
    },
    onError: (error: any) => {
      console.error('Update member error:', error);
      toast({ 
        title: "Error", 
        description: error?.response?.data?.error || "Failed to update member", 
        variant: "destructive" 
      });
    },
  });

  const deleteGroupMutation = useMutation({
    mutationFn: (groupId: number) => apiRequest('DELETE', `/api/customer-groups/${groupId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/customer-groups'] });
      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
      toast({ title: "Success", description: "Customer group deleted successfully!" });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete customer group",
        variant: "destructive",
      });
    },
  });

  // ──── Price List queries & mutations ────────────────────────────────────
  const { data: fetchedPriceLists = [], isLoading: isLoadingPriceLists } = useQuery<PriceListSummary[]>({
    queryKey: ['/api/price-lists'],
  });

  const { data: priceListCustomerSummary = {} } = useQuery<Record<string, { count: number; names: string[]; ids: number[] }>>({
    queryKey: ['/api/price-lists/customer-summary'],
  });

  const [priceListFilterCustomer, setPriceListFilterCustomer] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    if (!priceListIdFromUrl || autoExpandedRef.current || isLoadingPriceLists) return;
    const target = fetchedPriceLists.find((pl) => pl.id === priceListIdFromUrl);
    if (!target) return;
    autoExpandedRef.current = true;
    setActiveTab('price-lists');
    setExpandedPriceLists((prev) => ({ ...prev, [priceListIdFromUrl]: true }));
    if (!priceListDetailCache[priceListIdFromUrl]) {
      apiRequest('GET', `/api/price-lists/${priceListIdFromUrl}`)
        .then((res) => res.json())
        .then((detail: PriceListDetail) => {
          setPriceListDetailCache((prev) => ({ ...prev, [priceListIdFromUrl]: detail }));
        })
        .catch(() => {});
    }
  // priceListDetailCache intentionally omitted: autoExpandedRef guards against re-runs after cache updates
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceListIdFromUrl, fetchedPriceLists, isLoadingPriceLists]);

  const { data: productsForPL = [] } = useQuery<PLProduct[]>({
    queryKey: ['/api/products'],
  });

  const createPriceListMutation = useMutation({
    mutationFn: (data: any) => apiRequest('POST', '/api/price-lists', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/price-lists'] });
      queryClient.invalidateQueries({ queryKey: ['/api/price-lists/customer-summary'] });
      setIsPriceListModalOpen(false);
      setPriceListForm({ name: "", description: "", startDate: "", endDate: "", isActive: true });
      toast({ title: "Created", description: "Price list created successfully!" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updatePriceListMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest('PATCH', `/api/price-lists/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/price-lists'] });
      queryClient.invalidateQueries({ queryKey: ['/api/price-lists/customer-summary'] });
      setIsPriceListModalOpen(false);
      setEditingPriceList(null);
      toast({ title: "Updated", description: "Price list updated!" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deletePriceListMutation = useMutation({
    mutationFn: (id: number) => apiRequest('DELETE', `/api/price-lists/${id}`),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ['/api/price-lists'] });
      queryClient.invalidateQueries({ queryKey: ['/api/price-lists/customer-summary'] });
      setPriceListDetailCache(prev => { const next = { ...prev }; delete next[id]; return next; });
      setExpandedPriceLists(prev => { const next = { ...prev }; delete next[id]; return next; });
      toast({ title: "Deleted", description: "Price list deleted." });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const refreshPriceListDetail = async (id: number) => {
    try {
      const res = await apiRequest('GET', `/api/price-lists/${id}`);
      const detail = await res.json() as PriceListDetail;
      setPriceListDetailCache(prev => ({ ...prev, [id]: detail }));
    } catch {
      // silently ignore — summary panel will remain empty
    }
  };

  const savePLItemsMutation = useMutation({
    mutationFn: ({ id, items }: { id: number; items: any[] }) => apiRequest('PUT', `/api/price-lists/${id}/items`, items),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/price-lists'] });
      queryClient.invalidateQueries({ queryKey: ['/api/price-lists/customer-summary'] });
      setPriceListDetailCache(prev => { const next = { ...prev }; delete next[variables.id]; return next; });
      if (expandedPriceLists[variables.id]) {
        refreshPriceListDetail(variables.id);
      }
      toast({ title: "Saved", description: "Products updated!" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const savePLAssignmentsMutation = useMutation({
    mutationFn: ({ id, assignments }: { id: number; assignments: any[] }) => apiRequest('PUT', `/api/price-lists/${id}/assignments`, assignments),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/price-lists'] });
      queryClient.invalidateQueries({ queryKey: ['/api/price-lists/customer-summary'] });
      setPriceListDetailCache(prev => { const next = { ...prev }; delete next[variables.id]; return next; });
      if (expandedPriceLists[variables.id]) {
        refreshPriceListDetail(variables.id);
      }
      toast({ title: "Saved", description: "Assignments updated!" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const [sharingListId, setSharingListId] = useState<number | null>(null);

  const handleNativeShare = async (listId: number, listName: string) => {
    const portalUrl = `${window.location.origin}/customer/${user.id}`;

    // If the Web Share API is completely absent, trigger a direct anchor download
    // immediately without any async fetch (avoids popup-blocker and wasted round-trip).
    if (typeof navigator.share !== "function") {
      const a = document.createElement("a");
      a.href = `/api/price-lists/${listId}/export`;
      a.download = `${listName} - Price List.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }

    setSharingListId(listId);
    try {
      // Fetch the Excel file so we can pass it to the share sheet
      const response = await fetch(`/api/price-lists/${listId}/export`);
      if (!response.ok) throw new Error("Failed to fetch price list");
      const blob = await response.blob();
      const file = new File([blob], `${listName} - Price List.xlsx`, {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      if (navigator.canShare?.({ files: [file] })) {
        // Full file share — iOS Safari 15+, Android Chrome
        await navigator.share({
          title: listName,
          text: "Your exclusive price list — shop at the link below.",
          url: portalUrl,
          files: [file],
        });
      } else {
        // Share API present but file sharing not supported — share URL only
        await navigator.share({
          title: listName,
          text: "Your exclusive price list — shop at the link below.",
          url: portalUrl,
        });
      }
    } catch (err: any) {
      // AbortError  — user dismissed the share sheet: ignore silently
      // NotAllowedError — desktop Chrome blocks file sharing: fall back to download
      if (err?.name === "AbortError") {
        // nothing to do
      } else if (err?.name === "NotAllowedError") {
        const a = document.createElement("a");
        a.href = `/api/price-lists/${listId}/export`;
        a.download = `${listName} - Price List.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else {
        toast({ title: "Could not share", description: err?.message || "Something went wrong.", variant: "destructive" });
      }
    } finally {
      setSharingListId(null);
    }
  };

  const openManagePriceList = async (list: PriceListSummary) => {
    setIncompletePLItems(new Set());
    setManagingPriceList(list);
    setPriceListForm({
      name: list.name,
      description: list.description || "",
      startDate: list.startDate || "",
      endDate: list.endDate || "",
      isActive: list.isActive,
    });
    try {
      const res = await apiRequest('GET', `/api/price-lists/${list.id}`);
      const detail = await res.json() as PriceListDetail;
      setPriceListItems((detail.items || []).map(item => ({
        ...item,
        customPrice: item.customPrice ?? "",
        discountPercentage: item.discountPercentage ?? "",
        customPalletPrice: (item as any).customPalletPrice ?? "",
      })));
      setPriceListAssignments(detail.assignments || []);
    } catch {
      setPriceListItems([]);
      setPriceListAssignments([]);
      toast({ title: "Could not load price list", description: "Please close and try again.", variant: "destructive" });
    }
    setIsManagePriceListOpen(true);
  };

  const togglePriceListExpanded = async (list: PriceListSummary) => {
    const isOpen = expandedPriceLists[list.id];
    setExpandedPriceLists(prev => ({ ...prev, [list.id]: !isOpen }));
    if (!isOpen && !priceListDetailCache[list.id]) {
      try {
        const res = await apiRequest('GET', `/api/price-lists/${list.id}`);
        const detail = await res.json() as PriceListDetail;
        setPriceListDetailCache(prev => ({ ...prev, [list.id]: detail }));
      } catch {
        // silently ignore — counts still visible on the card
      }
    }
  };

  const addProductToPL = (product: { id: number; name: string; price: string; palletPrice?: string | null }) => {
    if (priceListItems.some(i => i.productId === product.id)) return;
    setPriceListItems(prev => [...prev, { productId: product.id, product, customPrice: "", discountPercentage: "", customPalletPrice: "" }]);
  };

  const removeProductFromPL = (productId: number) => {
    setPriceListItems(prev => prev.filter(i => i.productId !== productId));
    setIncompletePLItems(prev => {
      const next = new Set(prev);
      next.delete(productId);
      return next;
    });
  };

  const updatePLItemPrice = (productId: number, field: 'customPrice' | 'discountPercentage' | 'customPalletPrice', value: string) => {
    setPriceListItems(prev => prev.map(i => i.productId === productId ? { ...i, [field]: value } : i));
    if (value) {
      setIncompletePLItems(prev => {
        const next = new Set(prev);
        next.delete(productId);
        return next;
      });
    }
  };

  const togglePLCustomerAssignment = (customerId: string) => {
    setPriceListAssignments(prev => {
      const has = prev.some(a => a.customerId === customerId);
      if (has) return prev.filter(a => a.customerId !== customerId);
      return [...prev, { customerId, customerGroupId: null }];
    });
  };

  const togglePLGroupAssignment = (groupId: number) => {
    setPriceListAssignments(prev => {
      const has = prev.some(a => a.customerGroupId === groupId);
      if (has) return prev.filter(a => a.customerGroupId !== groupId);
      return [...prev, { customerId: null, customerGroupId: groupId }];
    });
  };
  // ──────────────────────────────────────────────────────────────────────

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  const getInitials = (firstName: string, lastName?: string) => {
    if (!firstName) return 'U';
    return `${firstName[0]}${lastName ? lastName[0] : ''}`.toUpperCase();
  };

  const sortedCustomers = [...(searchResults || [])].sort((a, b) => (a.firstName || '').localeCompare(b.firstName || ''));

  // Event handlers
  const handleCreateGroup = (data: CustomerGroupFormData) => {
    createGroupMutation.mutate(data);
  };

  const handleAddMember = (data: AddMemberFormData) => {
    if (!selectedGroup) return;
    addMemberMutation.mutate({ groupId: selectedGroup.id, data });
  };

  const handleEditCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    editCustomerForm.reset({
      firstName: customer.firstName,
      lastName: customer.lastName || '',
      phoneNumber: customer.phoneNumber || '',
      email: customer.email || '',
      businessName: customer.businessName || '',
    });
    setIsEditCustomerDialogOpen(true);
  };

  const handleUpdateCustomer = (data: EditCustomerFormData) => {
    if (!selectedCustomer) return;
    updateCustomerMutation.mutate({ customerId: selectedCustomer.id, data });
  };

  const handleAddToGroup = (customer: Customer) => {
    setSelectedCustomer(customer);
    addToGroupForm.reset({ groupId: 0 });
    setIsAddToGroupDialogOpen(true);
  };

  const handleAddCustomerToGroup = (data: AddToGroupFormData) => {
    if (!selectedCustomer) return;
    addCustomerToGroupMutation.mutate({ groupId: data.groupId, customerId: selectedCustomer.id });
  };

  // Memoized functions for better performance
  const findDuplicateCustomers = useCallback((phoneNumber: string) => {
    const lastFourDigits = phoneNumber.slice(-4);
    return (customers || []).filter(customer => 
      customer?.phoneNumber?.slice(-4) === lastFourDigits && 
      customer?.phoneNumber !== phoneNumber
    );
  }, [customers]);

  const handleCustomerMergeSelection = useCallback((customer: Customer) => {
    const isSelected = selectedCustomersForMerge.find(c => c.id === customer.id);
    if (isSelected) {
      setSelectedCustomersForMerge(prev => prev.filter(c => c.id !== customer.id));
    } else {
      setSelectedCustomersForMerge(prev => [...prev, customer]);
    }
  }, [selectedCustomersForMerge]);

  const handleStartManualMerge = () => {
    if (selectedCustomersForMerge.length < 2) {
      toast({
        title: "Select customers to merge",
        description: "Please select at least 2 customers to merge together",
        variant: "destructive",
      });
      return;
    }
    // Sort by total orders descending to make the customer with most orders the primary
    const sortedForMerge = [...selectedCustomersForMerge].sort((a, b) => b.totalOrders - a.totalOrders);
    setSelectedDuplicates(sortedForMerge);
    setMergeMode('manual');
    setIsMergeDialogOpen(true);
  };

  // Memoized filtered data for performance
  const mergeSearchResults = useMemo(() => {
    if (mergeSearchQuery.length < 2) return [];
    return (customers || []).filter(customer => {
      if (!customer) return false;
      const fullName = `${customer.firstName || ''} ${customer.lastName || ''}`.toLowerCase();
      const query = mergeSearchQuery.toLowerCase();
      return fullName.includes(query) || 
             (customer.phoneNumber || '').includes(query) ||
             (customer.email && customer.email.toLowerCase().includes(query));
    });
  }, [customers, mergeSearchQuery]);


  // Handle customer merge
  const handleMergeCustomers = (primaryCustomer: Customer, duplicates: Customer[]) => {
    const duplicateIds = (duplicates || []).map(d => d?.id).filter(Boolean);
    mergeCustomersMutation.mutate({
      primaryCustomerId: primaryCustomer.id,
      duplicateCustomerIds: duplicateIds,
      mergedData: {
        firstName: primaryCustomer.firstName,
        lastName: primaryCustomer.lastName,
        email: primaryCustomer.email || duplicates.find(d => d.email)?.email
      }
    });
  };

  const handleRemoveFromGroup = (customerId: string, groupId: number) => {
    removeFromGroupMutation.mutate({ groupId, customerId });
  };

  const handleViewMembers = (group: CustomerGroup) => {
    setSelectedGroup(group);
    setIsViewMembersDialogOpen(true);
  };

  const handleViewCustomerOrders = (customer: Customer) => {
    setSelectedCustomer(customer);
    setIsViewCustomerOrdersDialogOpen(true);
  };

  const handleEditGroup = (group: CustomerGroup) => {
    setSelectedGroup(group);
    editGroupForm.reset({
      name: group.name,
      description: group.description || '',
    });
    setIsEditGroupDialogOpen(true);
  };

  const handleUpdateGroup = (data: EditGroupFormData) => {
    if (!selectedGroup) return;
    editGroupMutation.mutate({ groupId: selectedGroup.id, data });
  };

  const handleUpdateMember = (data: EditMemberFormData) => {
    if (!selectedMember || !selectedGroup) return;
    const memberId = selectedMember?.id || selectedMember?.customerId;
    updateMemberMutation.mutate({ 
      groupId: selectedGroup.id, 
      memberId, 
      data 
    });
  };

  const handleDeleteGroup = (groupId: number) => {
    deleteGroupMutation.mutate(groupId);
  };

  // Contact import functionality
  const handleImportContacts = async () => {
    try {
      // Check if Contacts API is supported
      if ('contacts' in navigator && 'ContactsManager' in window) {
        const props = ['name', 'tel'];
        const opts = { multiple: true };
        
        // @ts-ignore - Contacts API is experimental
        const contacts = await navigator.contacts.select(props, opts);
        setDeviceContacts(contacts.map((contact: any) => ({
          id: Math.random().toString(36).substr(2, 9),
          name: contact.name?.[0] || 'Unknown',
          phoneNumber: contact.tel?.[0] || '',
        })));
      } else {
        // Fallback for unsupported browsers
        toast({
          title: "Use Alternative Import Methods",
          description: "Direct contact access isn't available on mobile. Use the 'Paste Contact List' option below or export contacts from your phone as CSV.",
          variant: "default",
        });
      }
    } catch (error) {
      toast({
        title: "Contact Access Unavailable",
        description: "Contact access was denied or isn't available. Use the 'Paste Contact List' section below to import contacts.",
        variant: "default",
      });
    }
  };

  const handleSelectContact = (contact: any) => {
    const isSelected = selectedContacts.find(c => c.id === contact.id);
    if (isSelected) {
      setSelectedContacts(selectedContacts.filter(c => c.id !== contact.id));
    } else {
      setSelectedContacts([...selectedContacts, contact]);
    }
  };

  const handleImportSelectedContacts = () => {
    if (!selectedGroup || selectedContacts.length === 0) return;
    
    // Import selected contacts one by one
    selectedContacts.forEach(contact => {
      if (contact.phoneNumber) {
        addMemberMutation.mutate({ 
          groupId: selectedGroup.id, 
          data: {
            name: contact.name,
            phoneNumber: contact.phoneNumber,
            email: ''
          }
        });
      }
    });
    
    setSelectedContacts([]);
    setDeviceContacts([]);
    setIsImportContactsDialogOpen(false);
    
    toast({
      title: "Contacts Imported",
      description: `Successfully imported ${selectedContacts.length} contacts to ${selectedGroup.name}`,
    });
  };

  const handleAddCustomer = (data: AddCustomerFormData) => {
    addCustomerMutation.mutate(data);
  };

  const handleSearchAndAddCustomer = (data: SearchAndAddFormData) => {
    if (!selectedGroup) return;
    addCustomerToGroupMutation.mutate({ groupId: selectedGroup.id, customerId: data.customerId });
  };

  // Filter customers for search and add (exclude already added customers)
  const getAvailableCustomers = () => {
    if (!selectedGroup || !customers) return [];
    const existingMemberIds = (groupMembers || []).map((member: any) => member?.id || member?.customerId).filter(Boolean);
    return (customers || []).filter(customer => {
      if (!customer) return false;
      const matchesSearch = customerSearchQuery.length === 0 || 
        `${customer.firstName || ''} ${customer.lastName || ''}`.toLowerCase().includes(customerSearchQuery.toLowerCase()) ||
        (customer.phoneNumber || '').includes(customerSearchQuery) ||
        (customer.email && customer.email.toLowerCase().includes(customerSearchQuery.toLowerCase()));
      const notAlreadyMember = !existingMemberIds.includes(customer.id);
      return matchesSearch && notAlreadyMember;
    });
  };

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
              <DropdownMenuItem onClick={() => setIsInvitationModalOpen(true)}>
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
          <Dialog open={isAddCustomerDialogOpen} onOpenChange={setIsAddCustomerDialogOpen}>
            <DialogTrigger asChild>
              <span />
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Customer</DialogTitle>
                <DialogDescription>
                  Add a new customer to your directory.
                </DialogDescription>
              </DialogHeader>
              <Form {...addCustomerForm}>
                <form onSubmit={addCustomerForm.handleSubmit(handleAddCustomer)} className="space-y-4">
                  <FormField
                    control={addCustomerForm.control}
                    name="firstName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>First Name</FormLabel>
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
                        <FormLabel>Last Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Doe" {...field} />
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
                        <FormLabel>Email</FormLabel>
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
                        <FormLabel>Phone Number</FormLabel>
                        <FormControl>
                          <Input placeholder="+447123456789" {...field} />
                        </FormControl>
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
        <TabsList className="grid w-full grid-cols-3 h-auto bg-slate-100 p-1 rounded-xl">
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
        </TabsList>

        {/* Customer Groups Tab */}
        <TabsContent value="groups" className="space-y-4 sm:space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-0">
            <h2 className="text-lg sm:text-xl font-semibold">Customer Groups</h2>
            <div className="flex items-center space-x-2">
              <ContextualHelpBubble 
                topic="Customer Groups"
                title="Managing Customer Groups"
                steps={helpContent.customerDirectory.steps}
              />
              {!isViewer && (
              <Button
                className="w-full sm:w-auto"
                disabled={planLimitsLoading}
                onClick={() => {
                  const limit = planLimits?.limits?.customGroups;
                  const usage = customerGroups.length;
                  if (limit !== undefined && limit !== -1 && usage >= limit) {
                    setShowUpgradeModal(true);
                    return;
                  }
                  setIsCreateDialogOpen(true);
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                <span className="hidden xs:inline">Create Group</span>
                <span className="xs:hidden">Create</span>
              </Button>
              )}
              <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create Customer Group</DialogTitle>
                    <DialogDescription>
                      Create a new customer group to organize your contacts for targeted messaging.
                    </DialogDescription>
                  </DialogHeader>
                  <Form {...createGroupForm}>
                    <form onSubmit={createGroupForm.handleSubmit(handleCreateGroup)} className="space-y-4">
                      <FormField
                        control={createGroupForm.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Group Name</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g., Regular Customers" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={createGroupForm.control}
                        name="description"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Description (Optional)</FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="Describe this customer group..."
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="flex justify-end space-x-2">
                        <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                          Cancel
                        </Button>
                        <Button type="submit" disabled={createGroupMutation.isPending}>
                          {createGroupMutation.isPending ? "Creating..." : "Create Group"}
                        </Button>
                      </div>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {isLoadingGroups ? (
            <div className="grid grid-cols-1 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="animate-pulse">
                  <CardHeader>
                    <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                    <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                  </CardHeader>
                  <CardContent>
                    <div className="h-3 bg-gray-200 rounded w-full"></div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : customerGroups.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 sm:py-16">
                <Users className="h-10 w-10 sm:h-12 sm:w-12 text-gray-400 mb-4" />
                <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-2 text-center">No customer groups yet</h3>
                <p className="text-sm sm:text-base text-gray-500 text-center mb-6 max-w-sm px-4">
                  Create your first customer group to organize your contacts and send targeted messages.
                </p>
                {!isViewer && (
                <Button onClick={() => setIsCreateDialogOpen(true)} className="text-sm sm:text-base">
                  <Plus className="mr-2 h-4 w-4" />
                  Create Your First Group
                </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 md:gap-6">
              {customerGroups.map((group) => (
                <Card key={group.id} className="hover:shadow-lg transition-shadow border-slate-200">
                  <CardHeader className="pb-3 p-4 sm:p-6">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <CardTitle className="text-base sm:text-lg md:text-xl truncate font-bold text-slate-900">{group.name}</CardTitle>
                        {group.description && (
                          <p className="text-xs sm:text-sm text-slate-500 mt-1 line-clamp-2">{group.description}</p>
                        )}
                      </div>
                      <div className="flex items-center space-x-1 sm:space-x-2 flex-shrink-0">
                        <Badge className="text-xs font-semibold px-2.5 py-1 bg-emerald-100 text-emerald-700 border-0 rounded-full">
                          {group.memberCount || 0}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewMembers(group)}
                          title="View Members"
                          className="h-7 w-7 sm:h-8 sm:w-8 p-0 shrink-0"
                        >
                          <Eye className="h-3 w-3 sm:h-4 sm:w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0 p-4 sm:p-6">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center">
                        {!isViewer && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="h-7 sm:h-8 px-2 sm:px-3 text-xs sm:text-sm">
                              <UserPlus className="h-3 w-3 sm:h-4 sm:w-4" />
                              <span className="hidden xs:inline ml-1 sm:ml-2">Add</span>
                              <ChevronDown className="ml-1 sm:ml-2 h-3 w-3 sm:h-4 sm:w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuItem 
                              onClick={() => {
                                setSelectedGroup(group);
                                setIsAddMemberDialogOpen(true);
                              }}
                            >
                              <UserPlus className="mr-2 h-4 w-4" />
                              Manual Entry
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => {
                                setSelectedGroup(group);
                                setIsSearchAndAddDialogOpen(true);
                              }}
                            >
                              <Search className="mr-2 h-4 w-4" />
                              Search Existing
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => {
                                setSelectedGroup(group);
                                setIsImportContactsDialogOpen(true);
                              }}
                            >
                              <Smartphone className="mr-2 h-4 w-4" />
                              Import Contacts
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        )}
                      </div>
                      <div className="flex items-center space-x-1 sm:space-x-2">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => {
                            navigate("/campaigns");
                          }}
                          title="Broadcast coming soon"
                          aria-label="Broadcast coming soon"
                          className="h-7 w-7 sm:h-8 sm:w-8 p-0"
                        >
                          <MessageSquare className="h-3 w-3 sm:h-4 sm:w-4" />
                        </Button>
                        {!isViewer && (
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => {
                            setSelectedGroup(group);
                            setIsEditGroupDialogOpen(true);
                          }}
                          title="Edit Group"
                          className="h-7 w-7 sm:h-8 sm:w-8 p-0"
                        >
                          <Edit className="h-3 w-3 sm:h-4 sm:w-4" />
                        </Button>
                        )}
                        {!isViewer && (
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => {
                            if (window.confirm(`Are you sure you want to delete the "${group.name}" group? This will remove all members from the group and cannot be undone.`)) {
                              handleDeleteGroup(group.id);
                            }
                          }}
                          title="Delete Group"
                          className="h-7 w-7 sm:h-8 sm:w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-3 w-3 sm:h-4 sm:w-4" />
                        </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Address Book Tab */}
        <TabsContent value="address-book" className="space-y-6">
          {stats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {user?.role !== 'team_member' && (
                <div className="rounded-lg bg-green-50 border border-green-100 px-3 py-2 flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-green-500 shrink-0" />
                  <div>
                    <p className="text-[11px] text-green-700">Paid</p>
                    <p className="text-sm font-bold text-green-600">{formatMoney(stats.totalRevenue)}</p>
                  </div>
                </div>
              )}
              {user?.role !== 'team_member' && (
                <div className="rounded-lg bg-red-50 border border-red-100 px-3 py-2 flex items-center gap-2">
                  <Clock className="h-4 w-4 text-red-500 shrink-0" />
                  <div>
                    <p className="text-[11px] text-red-700">Unpaid</p>
                    <p className="text-sm font-bold text-red-600">{formatMoney(stats.totalUnpaid)}</p>
                  </div>
                </div>
              )}
              <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2 flex items-center gap-2">
                <Users className="h-4 w-4 text-blue-500 shrink-0" />
                <div>
                  <p className="text-[11px] text-blue-700">Customers</p>
                  <p className="text-sm font-bold text-blue-600">{stats.totalCustomers}</p>
                </div>
              </div>
              <div className="rounded-lg bg-orange-50 border border-orange-100 px-3 py-2 flex items-center gap-2">
                <Activity className="h-4 w-4 text-orange-500 shrink-0" />
                <div>
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
                placeholder="Search customers by name, email, or phone..."
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
                    toast({
                      title: "No customers found",
                      description: "Please wait for customer data to load",
                      variant: "destructive",
                    });
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
                    setSelectedDuplicates(firstDuplicateGroup.sort((a, b) => (b?.totalOrders || 0) - (a?.totalOrders || 0)));
                    setMergeMode('automatic');
                    setIsMergeDialogOpen(true);
                  } else {
                    const michaelAccounts = customers.filter(customer => 
                      customer?.firstName?.toLowerCase().includes('michael') || 
                      customer?.firstName?.toLowerCase().includes('john')
                    ).sort((a, b) => (b?.totalOrders || 0) - (a?.totalOrders || 0));
                    if (michaelAccounts.length > 1) {
                      setSelectedDuplicates(michaelAccounts);
                      setMergeMode('automatic');
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
                  setSelectedCustomersForMerge([]);
                  setMergeSearchQuery('');
                  setMergeMode('manual');
                  setSelectedDuplicates([]);
                  setIsMergeDialogOpen(true);
                }}>
                  <Search className="h-4 w-4 mr-2" />
                  Search & Merge Customers
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => {
                  setSelectedGroup({ id: 0, name: 'All Customers', description: 'General customer directory' } as CustomerGroup);
                  setIsImportContactsDialogOpen(true);
                }}>
                  <Smartphone className="h-4 w-4 mr-2" />
                  Import Contacts
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
            <div className="space-y-2 overflow-x-hidden">
              {sortedCustomers.map((customer) => (
                <div key={customer?.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border bg-white hover:bg-gray-50 transition-colors cursor-pointer min-w-0" onClick={() => navigate(`/customers/${customer?.id}`)}>
                  <Avatar className="h-9 w-9 flex-shrink-0">
                    <AvatarFallback className="bg-blue-100 text-blue-600 text-sm">
                      {getInitials(customer?.firstName || '', customer?.lastName)}
                    </AvatarFallback>
                  </Avatar>
                  
                  <div className="flex-1 min-w-0 overflow-hidden">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-gray-900 truncate max-w-full">
                        {customer?.firstName || 'Unknown'} {customer?.lastName || ''}
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
                      <p className="text-xs text-gray-500">{formatMoney(customer?.totalSpent || 0)}</p>
                    </div>
                    <div className="sm:hidden text-right">
                      <p className="text-xs font-medium">{customer?.totalOrders || 0}</p>
                      <p className="text-[10px] text-gray-500">{formatMoney(customer?.totalSpent || 0)}</p>
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
                              if (confirm(`Remove portal access for ${customer?.firstName || 'this customer'} ${customer?.lastName || ''}? They will no longer be able to access your customer portal, but their order history will be preserved.`)) {
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
                              if (confirm(`Are you sure you want to delete ${customer?.firstName || 'this customer'} ${customer?.lastName || ''}? This action cannot be undone.`)) {
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

        {/* Customer Orders Tab */}
        <TabsContent value="orders" className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-base font-semibold">Customer Orders</h3>
              <p className="text-gray-600">View all orders organized by customer</p>
            </div>
          </div>

          {isLoadingCustomers ? (
            <div className="flex justify-center items-center h-64">
              <ElephantLoader message="Loading your customers..." />
            </div>
          ) : (
            <div className="space-y-4">
              {(customers || []).filter(customer => customer?.totalOrders > 0).map((customer) => {
                const customerOrdersList = Array.isArray(customerOrders) 
                  ? customerOrders.filter((order: any) => order?.retailerId === customer?.id)
                  : [];
                
                return (
                  <Card key={customer.id} className="overflow-hidden">
                    <CardContent className="p-0">
                      <div className="p-6 border-b bg-gray-50">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-4">
                            <Avatar className="h-12 w-12">
                              <AvatarFallback className="bg-blue-100 text-blue-700 font-semibold">
                                {customer?.firstName?.charAt(0) || '?'}{customer?.lastName?.charAt(0) || ''}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <h4 className="text-base font-semibold">
                                {customer?.firstName || 'Unknown'} {customer?.lastName || ''}
                              </h4>
                              <div className="flex items-center space-x-4 text-sm text-gray-600">
                                <div className="flex items-center space-x-1">
                                  <Phone className="h-4 w-4" />
                                  <span>{customer?.phoneNumber || 'No phone'}</span>
                                </div>
                                {customer.email && (
                                  <div className="flex items-center space-x-1">
                                    <Mail className="h-4 w-4" />
                                    <span>{customer.email}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="flex items-center space-x-4">
                              <div className="flex items-center space-x-2">
                                <ShoppingBag className="h-4 w-4 text-blue-500" />
                                <span className="font-medium">{customer?.totalOrders || 0} orders</span>
                              </div>
                              <div className="flex items-center space-x-2">
                                <DollarSign className="h-4 w-4 text-green-500" />
                                <span className="font-medium">{formatMoney(customer.totalSpent)}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                      
                      {customerOrdersList.length > 0 && (
                        <div className="p-6">
                          <h5 className="font-medium mb-4">Recent Orders</h5>
                          <div className="space-y-3">
                            {customerOrdersList.slice(0, 5).map((order: any) => (
                              <div key={order.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                                <div className="flex items-center space-x-3">
                                  <Badge variant={order.status === 'fulfilled' ? 'default' : 'secondary'}>
                                    Order #{order.id}
                                  </Badge>
                                  <span className="text-sm text-gray-600">
                                    {formatDate(new Date(order.createdAt))}
                                  </span>
                                </div>
                                <div className="flex items-center space-x-4">
                                  <span className="font-medium">{formatMoney(order.totalAmount)}</span>
                                  <Badge variant={
                                    order.status === 'fulfilled' ? 'default' : 
                                    order.status === 'confirmed' ? 'secondary' : 'outline'
                                  }>
                                    {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                                  </Badge>
                                </div>
                              </div>
                            ))}
                          </div>
                          {customerOrdersList.length > 5 && (
                            <p className="text-sm text-gray-500 mt-3">
                              And {customerOrdersList.length - 5} more orders...
                            </p>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
              
              {(customers || []).filter(customer => (customer?.totalOrders || 0) > 0).length === 0 && (
                <div className="text-center py-12">
                  <ShoppingBag className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No Customer Orders</h3>
                  <p className="text-gray-600">No customers have placed orders yet.</p>
                </div>
              )}
            </div>
          )}
        </TabsContent>

        {/* Price Lists Tab */}
        <TabsContent value="price-lists" className="space-y-4 sm:space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg sm:text-xl font-semibold">Price Lists</h2>
              <p className="text-sm text-muted-foreground">Create custom prices for specific customers or groups</p>
            </div>
            <div className="flex items-center gap-2">
              {planLimits && planLimits.limits.priceLists !== -1 && (
                <span className="text-sm text-muted-foreground whitespace-nowrap">
                  {planLimits.usage.priceLists ?? 0} / {planLimits.limits.priceLists} price lists
                </span>
              )}
              <ContextualHelpBubble
                topic="Price Lists"
                title="Managing Price Lists"
                steps={helpContent.priceLists.steps}
              />
              {planLimits && planLimits.limits.priceLists !== -1 && (planLimits.usage.priceLists ?? 0) >= planLimits.limits.priceLists ? (
                <Button
                  disabled
                  className="w-full sm:w-auto bg-green-600 hover:bg-green-700 opacity-50 cursor-not-allowed"
                  title="Upgrade your plan to create more price lists"
                >
                  <Lock className="h-4 w-4 mr-2" />
                  New Price List
                </Button>
              ) : (
                <Button
                  onClick={() => {
                    setEditingPriceList(null);
                    setPriceListForm({ name: "", description: "", startDate: "", endDate: "", isActive: true });
                    setIsPriceListModalOpen(true);
                  }}
                  className="w-full sm:w-auto bg-green-600 hover:bg-green-700"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  New Price List
                </Button>
              )}
            </div>
          </div>

          {priceListFilterCustomer && (
            <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
              <Tag className="h-4 w-4 shrink-0" />
              <span className="flex-1">Showing price lists for <strong>{priceListFilterCustomer.name}</strong></span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-blue-700 hover:bg-blue-100"
                onClick={() => setPriceListFilterCustomer(null)}
              >
                <X className="h-3 w-3 mr-1" />
                Clear filter
              </Button>
            </div>
          )}

          {isLoadingPriceLists ? (
            <div className="text-center py-10 text-muted-foreground">Loading price lists...</div>
          ) : (() => {
            const filteredPriceLists = priceListFilterCustomer
              ? fetchedPriceLists.filter((list) =>
                  (priceListCustomerSummary[priceListFilterCustomer.id]?.ids ?? []).includes(list.id)
                )
              : fetchedPriceLists;

            if (filteredPriceLists.length === 0 && priceListFilterCustomer) {
              return (
                <Card className="border-dashed">
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <Tag className="h-12 w-12 text-muted-foreground/40 mb-4" />
                    <h3 className="font-medium text-lg mb-2">No price lists for {priceListFilterCustomer.name}</h3>
                    <p className="text-muted-foreground text-center text-sm max-w-xs mb-4">
                      This customer is not assigned to any price lists yet. Clear the filter to see all lists, or create a new one.
                    </p>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => setPriceListFilterCustomer(null)}>
                        <X className="h-4 w-4 mr-2" /> Clear filter
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => { setEditingPriceList(null); setPriceListForm({ name: "", description: "", startDate: "", endDate: "", isActive: true }); setIsPriceListModalOpen(true); }}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        <Plus className="h-4 w-4 mr-2" /> Create price list
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            }

            if (fetchedPriceLists.length === 0) {
              return (
                <Card className="border-dashed">
                  <CardContent className="flex flex-col items-center justify-center py-12">
                    <Tag className="h-12 w-12 text-muted-foreground/40 mb-4" />
                    <h3 className="font-medium text-lg mb-2">No price lists yet</h3>
                    <p className="text-muted-foreground text-center text-sm max-w-xs mb-4">
                      Create a price list to offer custom prices or discounts to specific customers or groups.
                    </p>
                    <Button
                      onClick={() => { setEditingPriceList(null); setPriceListForm({ name: "", description: "", startDate: "", endDate: "", isActive: true }); setIsPriceListModalOpen(true); }}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <Plus className="h-4 w-4 mr-2" /> Create First Price List
                    </Button>
                  </CardContent>
                </Card>
              );
            }

            return (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredPriceLists.map((list) => (
                <Card key={list.id} className={`relative hover:shadow-lg transition-shadow border-slate-200 ${list.isLocked ? 'opacity-60 grayscale' : ''}`}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base font-bold text-slate-900 truncate">{list.name}</h3>
                        {list.description && <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{list.description}</p>}
                      </div>
                      <div className="flex items-center gap-1 ml-2 shrink-0">
                        {list.isLocked ? (
                          <Badge variant="secondary" className="text-xs rounded-full px-2.5 py-1 bg-gray-100 text-gray-500 flex items-center gap-1">
                            <Lock className="h-3 w-3" /> Locked
                          </Badge>
                        ) : (
                          <Badge variant={list.isActive ? "default" : "secondary"} className={list.isActive ? "bg-emerald-100 text-emerald-700 border-0 rounded-full font-semibold text-xs px-2.5 py-1" : "text-xs rounded-full px-2.5 py-1"}>
                            {list.isActive ? "Active" : "Inactive"}
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Package className="h-3 w-3" /> {list.itemCount || 0} products</span>
                        <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {list.assignmentCount || 0} assigned</span>
                      </div>
                      <button
                        onClick={() => togglePriceListExpanded(list)}
                        className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
                      >
                        {expandedPriceLists[list.id] ? (
                          <><ChevronUp className="h-3 w-3" /> Hide details</>
                        ) : (
                          <><ChevronDown className="h-3 w-3" /> View details</>
                        )}
                      </button>
                    </div>

                    {expandedPriceLists[list.id] && (() => {
                      const detail = priceListDetailCache[list.id];
                      return (
                        <div className="border rounded-md bg-gray-50 p-3 space-y-3 text-xs">
                          {/* Products */}
                          <div>
                            <p className="font-medium text-gray-700 mb-1.5 flex items-center gap-1">
                              <Package className="h-3 w-3" /> Products
                            </p>
                            {!detail ? (
                              <p className="text-muted-foreground italic">Loading…</p>
                            ) : detail.items.length === 0 ? (
                              <p className="text-muted-foreground italic">No products added.</p>
                            ) : (
                              <div className="space-y-1">
                                {detail.items.map(item => {
                                  const base = parseFloat(item.product?.price || "0");
                                  const hasFixed = !!(item.customPrice && parseFloat(item.customPrice) > 0);
                                  const hasPct = !!(item.discountPercentage && parseFloat(item.discountPercentage) > 0);
                                  return (
                                    <div key={item.productId} className="flex items-center justify-between">
                                      <span className="text-gray-700 truncate max-w-[55%]">{item.product?.name || "Unknown"}</span>
                                      {hasFixed && (
                                        <span className="text-green-700 font-medium">{formatMoney(item.customPrice)}</span>
                                      )}
                                      {hasPct && !hasFixed && (
                                        <span className="text-green-700 font-medium">
                                          {parseFloat(item.discountPercentage).toFixed(0)}% off → {formatMoney(base * (1 - parseFloat(item.discountPercentage) / 100))}
                                        </span>
                                      )}
                                      {!hasFixed && !hasPct && (
                                        <span className="text-muted-foreground italic">no price set</span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          {/* Assigned to */}
                          <div>
                            <p className="font-medium text-gray-700 mb-1.5 flex items-center gap-1">
                              <Users className="h-3 w-3" /> Assigned to
                            </p>
                            {!detail ? (
                              <p className="text-muted-foreground italic">Loading…</p>
                            ) : detail.assignments.length === 0 ? (
                              <p className="text-muted-foreground italic">No one assigned yet.</p>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {detail.assignments.map((a, idx) => {
                                  if (a.customerId) {
                                    const c = customers.find(x => x.id === a.customerId);
                                    const name = c ? `${c.firstName} ${c.lastName || ""}`.trim() : a.customerId;
                                    return <Badge key={idx} variant="secondary" className="text-xs">{name}</Badge>;
                                  }
                                  if (a.customerGroupId) {
                                    const g = customerGroups.find(x => x.id === a.customerGroupId);
                                    return (
                                      <Badge key={idx} variant="outline" className="text-xs border-primary/40 text-primary flex items-center gap-0.5">
                                        <Users className="h-2.5 w-2.5" />{g?.name || `Group ${a.customerGroupId}`}
                                      </Badge>
                                    );
                                  }
                                  return null;
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {(list.startDate || list.endDate) && (
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {list.startDate || "Now"} – {list.endDate || "Ongoing"}
                      </div>
                    )}

                    {list.isLocked && (
                      <div className="flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                        <span>Locked — <a href="/subscription-pricing" className="underline font-medium">upgrade to unlock</a></span>
                      </div>
                    )}
                    <div className="flex gap-1.5 pt-1">
                      <Button size="sm" variant="outline" className="flex-1 text-xs" onClick={() => !list.isLocked && openManagePriceList(list)} disabled={list.isLocked} title={list.isLocked ? "Upgrade your plan to manage this price list" : undefined}>
                        {list.isLocked ? <Lock className="h-3 w-3 mr-1" /> : <Edit3 className="h-3 w-3 mr-1" />} Manage
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="sm" variant="outline" className="text-xs px-2" aria-label="More actions">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem
                            onClick={() => handleNativeShare(list.id, list.name)}
                            disabled={sharingListId === list.id}
                          >
                            <Share2 className="h-4 w-4 mr-2" />
                            {sharingListId === list.id ? "Sharing…" : "Share"}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => window.open(`/api/price-lists/${list.id}/export`, '_blank')}
                          >
                            <Download className="h-4 w-4 mr-2" />
                            Download Excel
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => { if (confirm("Delete this price list?")) deletePriceListMutation.mutate(list.id); }}
                            className="text-red-600 focus:text-red-600"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            );
          })()}
        </TabsContent>
      </Tabs>

      {/* ── Create / Edit Price List Modal ─────────────────────────────── */}
      <Dialog open={isPriceListModalOpen} onOpenChange={(open) => { setIsPriceListModalOpen(open); if (!open) setEditingPriceList(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingPriceList ? "Edit Price List" : "Create Price List"}</DialogTitle>
            <DialogDescription>Set up a named price list for your customers.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Name *</Label>
              <Input placeholder="e.g. VIP Customers Q2" value={priceListForm.name}
                onChange={e => setPriceListForm(prev => ({ ...prev, name: e.target.value }))} />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea placeholder="Optional notes about this price list..." value={priceListForm.description}
                onChange={e => setPriceListForm(prev => ({ ...prev, description: e.target.value }))} rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Start Date</Label>
                <Input type="date" value={priceListForm.startDate}
                  onChange={e => setPriceListForm(prev => ({ ...prev, startDate: e.target.value }))} />
              </div>
              <div>
                <Label>End Date</Label>
                <Input type="date" value={priceListForm.endDate}
                  onChange={e => setPriceListForm(prev => ({ ...prev, endDate: e.target.value }))} />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Label>Active</Label>
              <Switch checked={priceListForm.isActive}
                onCheckedChange={val => setPriceListForm(prev => ({ ...prev, isActive: val }))} />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setIsPriceListModalOpen(false)}>Cancel</Button>
            <Button className="bg-green-600 hover:bg-green-700"
              disabled={!priceListForm.name || createPriceListMutation.isPending || updatePriceListMutation.isPending}
              onClick={() => {
                const payload = {
                  name: priceListForm.name,
                  description: priceListForm.description || null,
                  startDate: priceListForm.startDate || null,
                  endDate: priceListForm.endDate || null,
                  isActive: priceListForm.isActive,
                };
                if (editingPriceList) {
                  updatePriceListMutation.mutate({ id: editingPriceList.id, data: payload });
                } else {
                  createPriceListMutation.mutate(payload);
                }
              }}
            >
              {createPriceListMutation.isPending || updatePriceListMutation.isPending ? "Saving..." : (editingPriceList ? "Update" : "Create")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Manage Price List Modal (Products + Assignments) ──────────── */}
      <Dialog open={isManagePriceListOpen} onOpenChange={(open) => { if (!open) setIncompletePLItems(new Set()); setIsManagePriceListOpen(open); }}>
        <DialogContent className="w-full sm:max-w-2xl max-h-screen sm:max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5 text-green-600" />
              Manage: {managingPriceList?.name}
            </DialogTitle>
            <DialogDescription>
              Add products with custom prices, then assign to customers or groups.
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="products" className="mt-2">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="details"><Edit3 className="h-4 w-4 mr-1" />Details</TabsTrigger>
              <TabsTrigger value="products"><Package className="h-4 w-4 mr-1" />Products</TabsTrigger>
              <TabsTrigger value="assign"><Users className="h-4 w-4 mr-1" />Assign</TabsTrigger>
              <TabsTrigger value="impact"><Eye className="h-4 w-4 mr-1" />Impact</TabsTrigger>
            </TabsList>

            {/* Details Tab — edit name/description/dates/active */}
            <TabsContent value="details" className="space-y-4 pt-4">
              <div>
                <Label>Name *</Label>
                <Input placeholder="e.g. VIP Customers Q2" value={priceListForm.name}
                  onChange={e => setPriceListForm(prev => ({ ...prev, name: e.target.value }))} />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea placeholder="Optional notes..." value={priceListForm.description}
                  onChange={e => setPriceListForm(prev => ({ ...prev, description: e.target.value }))} rows={2} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Start Date</Label>
                  <Input type="date" value={priceListForm.startDate}
                    onChange={e => setPriceListForm(prev => ({ ...prev, startDate: e.target.value }))} />
                </div>
                <div>
                  <Label>End Date</Label>
                  <Input type="date" value={priceListForm.endDate}
                    onChange={e => setPriceListForm(prev => ({ ...prev, endDate: e.target.value }))} />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <Label>Active</Label>
                <Switch checked={priceListForm.isActive}
                  onCheckedChange={val => setPriceListForm(prev => ({ ...prev, isActive: val }))} />
              </div>
              <Button className="w-full bg-green-600 hover:bg-green-700"
                disabled={!priceListForm.name || updatePriceListMutation.isPending || !managingPriceList}
                onClick={() => {
                  if (!managingPriceList) return;
                  updatePriceListMutation.mutate({
                    id: managingPriceList.id,
                    data: {
                      name: priceListForm.name,
                      description: priceListForm.description || null,
                      startDate: priceListForm.startDate || null,
                      endDate: priceListForm.endDate || null,
                      isActive: priceListForm.isActive,
                    },
                  });
                  setIsManagePriceListOpen(false);
                }}>
                {updatePriceListMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </TabsContent>

            {/* Products Tab */}
            <TabsContent value="products" className="space-y-4 pt-4">
              {/* Search to add products */}
              <div>
                <Label className="text-sm font-medium">Add Products</Label>
                <Input placeholder="Search products..." value={plProductSearch}
                  onChange={e => setPlProductSearch(e.target.value)} className="mt-1" />
                {plProductSearch && (
                  <div className="border rounded-md mt-1 max-h-40 overflow-y-auto bg-white shadow-sm">
                    {productsForPL
                      .filter(p => p.name?.toLowerCase().includes(plProductSearch.toLowerCase()) && !priceListItems.some(i => i.productId === p.id))
                      .slice(0, 8)
                      .map(p => (
                        <div key={p.id} className="flex items-center justify-between px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm"
                          onClick={() => { addProductToPL(p); setPlProductSearch(""); }}>
                          <span>{p.name}</span>
                          <span className="text-muted-foreground">{formatMoney(p.price || "0")}</span>
                        </div>
                      ))}
                    {productsForPL.filter(p => p.name?.toLowerCase().includes(plProductSearch.toLowerCase()) && !priceListItems.some(i => i.productId === p.id)).length === 0 && (
                      <div className="px-3 py-2 text-sm text-muted-foreground">No more products to add</div>
                    )}
                  </div>
                )}
              </div>

              {/* Product list with pricing */}
              {priceListItems.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">No products added yet. Search above to add products.</div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Set a fixed price OR a % discount for each product (not both).</p>
                  {priceListItems.map((item) => {
                    const product = item.product;
                    const standardPrice = parseFloat(product?.price || "0");
                    return (
                      <div key={item.productId} className={`border rounded-lg p-3 bg-gray-50 ${incompletePLItems.has(item.productId) ? "border-red-500 bg-red-50" : ""}`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-medium text-sm">{product?.name}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">Standard: {formatMoney(standardPrice)}</span>
                            <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-500"
                              onClick={() => removeProductFromPL(item.productId)}>
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                        <p className="text-[10px] text-muted-foreground mb-1.5">Unit price</p>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs">Fixed Price (£)</Label>
                            <Input className="h-7 text-xs mt-0.5" placeholder="e.g. 14.99" value={item.customPrice}
                              onChange={e => updatePLItemPrice(item.productId, 'customPrice', e.target.value)}
                              disabled={!!item.discountPercentage} />
                          </div>
                          <div>
                            <Label className="text-xs">Discount (%)</Label>
                            <Input className="h-7 text-xs mt-0.5" placeholder="e.g. 10" value={item.discountPercentage}
                              onChange={e => updatePLItemPrice(item.productId, 'discountPercentage', e.target.value)}
                              disabled={!!item.customPrice} />
                          </div>
                        </div>
                        {(item.customPrice || item.discountPercentage) && (
                          <p className="text-xs text-green-700 mt-1">
                            Customer price: {formatMoney(
                              item.customPrice
                                ? parseFloat(item.customPrice)
                                : (standardPrice * (1 - parseFloat(item.discountPercentage) / 100))
                            )}
                          </p>
                        )}
                        {product?.palletPrice != null && (
                          <div className="mt-2 pt-2 border-t border-gray-200">
                            <p className="text-[10px] text-muted-foreground mb-1.5">
                              Pallet price <span className="text-gray-400">(standard: {formatMoney(product.palletPrice)})</span>
                            </p>
                            <div className="w-1/2 pr-1">
                              <Label className="text-xs">Custom Pallet Price (£)</Label>
                              <Input className="h-7 text-xs mt-0.5" placeholder={parseFloat(product.palletPrice).toFixed(2)}
                                value={item.customPalletPrice}
                                onChange={e => updatePLItemPrice(item.productId, 'customPalletPrice', e.target.value)} />
                            </div>
                            {item.customPalletPrice && (
                              <p className="text-xs text-green-700 mt-1">
                                Pallet price: {formatMoney(item.customPalletPrice)}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <Button className="w-full bg-green-600 hover:bg-green-700"
                disabled={savePLItemsMutation.isPending || !managingPriceList}
                onClick={() => {
                  const incomplete = priceListItems
                    .filter(i => !i.customPrice?.trim() && !i.discountPercentage?.trim())
                    .map(i => i.productId);
                  if (incomplete.length > 0) {
                    setIncompletePLItems(new Set(incomplete));
                    toast({
                      title: "Pricing required",
                      description: `${incomplete.length} product${incomplete.length > 1 ? "s" : ""} ${incomplete.length > 1 ? "are" : "is"} missing a fixed price or discount. Please complete pricing before saving.`,
                      variant: "destructive",
                    });
                    return;
                  }
                  setIncompletePLItems(new Set());
                  const items = priceListItems.map(i => ({
                    productId: i.productId,
                    customPrice: i.customPrice || null,
                    discountPercentage: i.discountPercentage || null,
                    customPalletPrice: i.customPalletPrice || null,
                  }));
                  savePLItemsMutation.mutate({ id: managingPriceList.id, items });
                }}>
                {savePLItemsMutation.isPending ? "Saving..." : "Save Products"}
              </Button>
            </TabsContent>

            {/* Assign Tab */}
            <TabsContent value="assign" className="space-y-4 pt-4">
              <p className="text-sm text-muted-foreground">Select which customers or groups get this price list.</p>

              {/* Customer Groups */}
              {customerGroups.length > 0 && (
                <div>
                  <Label className="text-sm font-medium mb-2 block">Customer Groups</Label>
                  <div className="space-y-1 max-h-36 overflow-y-auto border rounded-md p-2">
                    {customerGroups.map((group) => {
                      const assigned = priceListAssignments.some(a => a.customerGroupId === group.id);
                      return (
                        <div key={group.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-gray-50 cursor-pointer"
                          onClick={() => togglePLGroupAssignment(group.id)}>
                          <div className={`h-4 w-4 rounded border-2 flex items-center justify-center ${assigned ? "bg-green-600 border-green-600" : "border-gray-300"}`}>
                            {assigned && <Check className="h-2.5 w-2.5 text-white" />}
                          </div>
                          <span className="text-sm">{group.name}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Individual customers */}
              <div>
                <Label className="text-sm font-medium mb-2 block">Individual Customers</Label>
                <div className="space-y-1 max-h-48 overflow-y-auto border rounded-md p-2">
                  {customers.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No customers yet</p>
                  ) : (
                    customers.map((cust) => {
                      const assigned = priceListAssignments.some(a => a.customerId === cust.id);
                      const name = `${cust.firstName || ""} ${cust.lastName || ""}`.trim() || cust.phoneNumber;
                      return (
                        <div key={cust.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-gray-50 cursor-pointer"
                          onClick={() => togglePLCustomerAssignment(cust.id)}>
                          <div className={`h-4 w-4 rounded border-2 flex items-center justify-center ${assigned ? "bg-green-600 border-green-600" : "border-gray-300"}`}>
                            {assigned && <Check className="h-2.5 w-2.5 text-white" />}
                          </div>
                          <span className="text-sm">{name}</span>
                          {cust.businessName && <span className="text-xs text-muted-foreground">· {cust.businessName}</span>}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button className="flex-1 min-w-[120px] bg-green-600 hover:bg-green-700"
                  disabled={savePLAssignmentsMutation.isPending || !managingPriceList}
                  onClick={() => savePLAssignmentsMutation.mutate({ id: managingPriceList.id, assignments: priceListAssignments })}>
                  {savePLAssignmentsMutation.isPending ? "Saving..." : "Save Assignments"}
                </Button>
                <Button variant="outline" className="shrink-0"
                  onClick={() => managingPriceList && window.open(`/api/price-lists/${managingPriceList.id}/export`, '_blank')}
                  disabled={!managingPriceList}
                  title="Download Excel"
                  aria-label="Download Excel price list"
                >
                  <Download className="h-4 w-4 sm:mr-2" aria-hidden="true" />
                  <span className="hidden sm:inline">Download Excel</span>
                  <span className="sm:hidden sr-only">Download Excel</span>
                </Button>
                <Button variant="outline" className="shrink-0 text-green-700 border-green-200 hover:bg-green-50"
                  disabled={sharingListId === managingPriceList?.id || !managingPriceList}
                  onClick={() => managingPriceList && handleNativeShare(managingPriceList.id, managingPriceList.name)}
                  title="Share Now"
                  aria-label="Share price list"
                >
                  <Share2 className="h-4 w-4 sm:mr-2" aria-hidden="true" />
                  <span className="hidden sm:inline">
                    {sharingListId === managingPriceList?.id ? "Preparing…" : "Share Now"}
                  </span>
                  <span className="sm:hidden sr-only">Share Now</span>
                </Button>
              </div>
            </TabsContent>

            {/* Impact Tab */}
            <TabsContent value="impact" className="space-y-4 pt-4">
              {(() => {
                const today = new Date().toISOString().slice(0, 10);
                const isExpired = !!(priceListForm.endDate && priceListForm.endDate < today);
                const notYetStarted = !!(priceListForm.startDate && priceListForm.startDate > today);
                const outsideDateWindow = isExpired || notYetStarted;
                const isInactive = !priceListForm.isActive || outsideDateWindow;

                return (
                  <>
                    {isInactive && (
                      <Alert className="border-yellow-300 bg-yellow-50">
                        <AlertTriangle className="h-4 w-4 text-yellow-600" />
                        <AlertDescription className="text-yellow-800 text-sm">
                          {!priceListForm.isActive
                            ? "This price list is inactive. Customers won't see these prices until you activate it on the Details tab."
                            : isExpired
                              ? "This price list has expired. Update the end date on the Details tab to re-activate it."
                              : `This price list doesn't start until ${priceListForm.startDate}. Customers won't see these prices until then.`}
                        </AlertDescription>
                      </Alert>
                    )}

                    {/* Products impact table */}
                    <div>
                      <p className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5">
                        <Package className="h-4 w-4 text-green-600" />
                        What customers will pay
                      </p>
                      {priceListItems.length === 0 ? (
                        <div className="text-center py-6 text-muted-foreground text-sm border rounded-lg bg-gray-50">
                          Add products on the <span className="font-medium">Products</span> tab to preview prices here.
                        </div>
                      ) : (
                        <div className="border rounded-lg overflow-hidden">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50 border-b">
                              <tr>
                                <th className="text-left px-3 py-2 font-medium text-gray-600 text-xs">Product</th>
                                <th className="text-right px-3 py-2 font-medium text-gray-600 text-xs">Standard</th>
                                <th className="text-right px-3 py-2 font-medium text-gray-600 text-xs">Their price</th>
                                <th className="text-right px-3 py-2 font-medium text-gray-600 text-xs">Saving</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {priceListItems.map((item) => {
                                const standard = parseFloat(item.product?.price || "0");
                                const hasFixed = !!(item.customPrice?.trim());
                                const hasPct = !!(item.discountPercentage?.trim());
                                let custom = standard;
                                if (hasFixed) custom = parseFloat(item.customPrice) || 0;
                                else if (hasPct) custom = standard * (1 - (parseFloat(item.discountPercentage) || 0) / 100);
                                const saving = standard - custom;
                                const savingPct = standard > 0 ? (saving / standard) * 100 : 0;
                                const priced = hasFixed || hasPct;
                                return (
                                  <tr key={item.productId} className="bg-white">
                                    <td className="px-3 py-2.5 text-gray-800 max-w-[140px] truncate">
                                      {item.product?.name || "Unknown"}
                                    </td>
                                    <td className="px-3 py-2.5 text-right text-muted-foreground line-through text-xs">
                                      {formatMoney(standard)}
                                    </td>
                                    <td className="px-3 py-2.5 text-right font-semibold text-green-700">
                                      {priced ? formatMoney(custom) : <span className="text-muted-foreground font-normal text-xs italic">no price set</span>}
                                    </td>
                                    <td className="px-3 py-2.5 text-right">
                                      {priced && saving > 0 ? (
                                        <span className="inline-flex items-center bg-green-100 text-green-800 text-xs font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap">
                                          {formatMoney(saving)} ({savingPct.toFixed(0)}%)
                                        </span>
                                      ) : priced ? (
                                        <span className="text-xs text-muted-foreground">—</span>
                                      ) : null}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* Assigned customers */}
                    <div>
                      <p className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1.5">
                        <Users className="h-4 w-4 text-green-600" />
                        Assigned to
                      </p>
                      {priceListAssignments.length === 0 ? (
                        <div className="text-center py-6 text-muted-foreground text-sm border rounded-lg bg-gray-50">
                          Assign customers on the <span className="font-medium">Assign</span> tab to see who benefits.
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {priceListAssignments.map((a, idx) => {
                            if (a.customerId) {
                              const c = customers.find(x => x.id === a.customerId);
                              const name = c ? `${c.firstName || ""} ${c.lastName || ""}`.trim() || c.phoneNumber : a.customerId;
                              return (
                                <Link key={idx} href={`/customers/${a.customerId}`}>
                                  <Badge variant="secondary" className="text-xs cursor-pointer hover:bg-gray-200 transition-colors">
                                    {name}
                                  </Badge>
                                </Link>
                              );
                            }
                            if (a.customerGroupId) {
                              const g = customerGroups.find(x => x.id === a.customerGroupId);
                              return (
                                <Badge key={idx} variant="outline" className="text-xs border-primary/40 text-primary flex items-center gap-0.5">
                                  <Users className="h-2.5 w-2.5" />{g?.name || `Group ${a.customerGroupId}`}
                                </Badge>
                              );
                            }
                            return null;
                          })}
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Add Member Dialog */}
      <Dialog open={isAddMemberDialogOpen} onOpenChange={setIsAddMemberDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manual Entry - Add Customer to {selectedGroup?.name}</DialogTitle>
            <DialogDescription>
              Create a new customer profile and add them to this group. They'll be able to receive your broadcasts.
            </DialogDescription>
          </DialogHeader>
          <Form {...addMemberForm}>
            <form onSubmit={addMemberForm.handleSubmit(handleAddMember)} className="space-y-4">
              <FormField
                control={addMemberForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Customer Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., John Smith" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={addMemberForm.control}
                name="phoneNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone Number</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., +447123456789" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={addMemberForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., customer@example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex justify-end space-x-2">
                <Button type="button" variant="outline" onClick={() => setIsAddMemberDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={addMemberMutation.isPending}>
                  {addMemberMutation.isPending ? "Adding..." : "Add Customer"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Edit Customer Dialog */}
      <Dialog open={isEditCustomerDialogOpen} onOpenChange={setIsEditCustomerDialogOpen}>
        <DialogContent>
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

      {/* View Members Dialog */}
      <Dialog open={isViewMembersDialogOpen} onOpenChange={setIsViewMembersDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selectedGroup?.name} Members
            </DialogTitle>
            <DialogDescription>
              View all members in this customer group
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {groupMembers.length > 0 ? (
              <div className="space-y-3">
                {groupMembers.map((member: any, index: number) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-blue-100 text-blue-700 text-sm">
                          {(member.firstName || member.name)?.charAt(0) || '?'}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="font-medium text-xs">
                          {member.firstName && member.lastName 
                            ? `${member.firstName} ${member.lastName}` 
                            : member.name || 'Unknown'}
                        </p>
                        <p className="text-xs text-gray-500">{member.phoneNumber || member.phone_number}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setSelectedMember(member);
                          // Pre-populate the form with current member data
                          const fullName = member.firstName && member.lastName 
                            ? `${member.firstName} ${member.lastName}` 
                            : member.name || '';
                          editMemberForm.reset({
                            name: fullName,
                            phoneNumber: member.phoneNumber || member.phone_number || '',
                          });
                          setIsEditMemberDialogOpen(true);
                        }}
                        title="Edit Member"
                      >
                        <Edit3 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveFromGroup(member.id || member.customerId, selectedGroup?.id!)}
                        title="Remove Member"
                        className="hover:bg-red-100"
                      >
                        <X className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6">
                <Users className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No members in this group yet</p>
              </div>
            )}
          </div>
          
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setIsViewMembersDialogOpen(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Group Dialog */}
      <Dialog open={isEditGroupDialogOpen} onOpenChange={setIsEditGroupDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Customer Group</DialogTitle>
            <DialogDescription>
              Update the name and description of this customer group.
            </DialogDescription>
          </DialogHeader>
          <Form {...editGroupForm}>
            <form onSubmit={editGroupForm.handleSubmit(handleUpdateGroup)} className="space-y-4">
              <FormField
                control={editGroupForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Group Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Regular Customers" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editGroupForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description (Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Describe this customer group..."
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex justify-end space-x-2">
                <Button type="button" variant="outline" onClick={() => setIsEditGroupDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={editGroupMutation.isPending}>
                  {editGroupMutation.isPending ? "Updating..." : "Update Group"}
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
              {selectedCustomer ? `${selectedCustomer.firstName} ${selectedCustomer.lastName} - Order History` : 'Order History'}
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

      {/* Import Contacts Dialog */}
      <Dialog open={isImportContactsDialogOpen} onOpenChange={setIsImportContactsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center space-x-2">
              <Smartphone className="h-5 w-5" />
              <span>Import Contacts to {selectedGroup?.name}</span>
            </DialogTitle>
            <DialogDescription>
              Import customers from your phone's contact list quickly and easily.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {deviceContacts.length === 0 ? (
              <div className="text-center py-8">
                <ContactRound className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  Import Contacts
                </h3>
                <p className="text-gray-600 mb-6">
                  Quickly add multiple customers by pasting contact information.
                </p>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Paste Contact List</Label>
                    <Textarea
                      placeholder="Paste contacts here, one per line:&#10;John Smith, +447123456789&#10;Jane Doe, +447987654321&#10;Bob Wilson, +447555123456"
                      rows={4}
                      className="text-sm"
                      onChange={(e) => {
                        const text = e.target.value;
                        const lines = text.split('\n').filter(line => line.trim());
                        const contacts = lines.map((line, index) => {
                          const parts = line.split(',').map(p => p.trim());
                          return {
                            id: `paste_${index}`,
                            name: parts[0] || `Contact ${index + 1}`,
                            phoneNumber: parts[1] || ''
                          };
                        }).filter(contact => contact.phoneNumber);
                        setDeviceContacts(contacts);
                      }}
                    />
                    <p className="text-xs text-gray-500">
                      Format: Name, Phone Number (one per line)
                    </p>
                  </div>
                </div>
                
                <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                  <p className="text-sm text-blue-700">
                    <strong>Mobile Tip:</strong> Copy contacts from your WhatsApp, phone contacts, or any contact list and paste them above for quick import.
                  </p>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h4 className="font-medium">
                    Select Contacts ({selectedContacts.length} selected)
                  </h4>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (selectedContacts.length === deviceContacts.length) {
                        setSelectedContacts([]);
                      } else {
                        setSelectedContacts(deviceContacts);
                      }
                    }}
                  >
                    {selectedContacts.length === deviceContacts.length ? 'Deselect All' : 'Select All'}
                  </Button>
                </div>
                
                <div className="max-h-60 overflow-y-auto space-y-2">
                  {deviceContacts.map((contact) => {
                    const isSelected = selectedContacts.find(c => c.id === contact.id);
                    return (
                      <div
                        key={contact.id}
                        className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-colors ${
                          isSelected ? 'bg-blue-50 border-blue-200' : 'hover:bg-gray-50'
                        }`}
                        onClick={() => handleSelectContact(contact)}
                      >
                        <div className="flex items-center space-x-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                            isSelected ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-600'
                          }`}>
                            {isSelected ? <Check className="h-4 w-4" /> : contact.name[0]?.toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium">{contact.name}</p>
                            <p className="text-sm text-gray-600">{contact.phoneNumber}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                
                <div className="flex justify-end space-x-2 mt-6">
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      setIsImportContactsDialogOpen(false);
                      setDeviceContacts([]);
                      setSelectedContacts([]);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleImportSelectedContacts}
                    disabled={selectedContacts.length === 0}
                  >
                    Import {selectedContacts.length} Contact{selectedContacts.length !== 1 ? 's' : ''}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Member Dialog */}
      <Dialog open={isEditMemberDialogOpen} onOpenChange={setIsEditMemberDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Group Member</DialogTitle>
            <DialogDescription>
              Update member information for this customer group.
            </DialogDescription>
          </DialogHeader>
          <Form {...editMemberForm}>
            <form onSubmit={editMemberForm.handleSubmit(handleUpdateMember)} className="space-y-4">
              <FormField
                control={editMemberForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Customer Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., John Smith" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editMemberForm.control}
                name="phoneNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone Number</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., +447123456789" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="flex justify-end space-x-2">
                <Button type="button" variant="outline" onClick={() => setIsEditMemberDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={updateMemberMutation.isPending}>
                  {updateMemberMutation.isPending ? "Updating..." : "Update Member"}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Search & Add Customer Dialog */}
      <Dialog open={isSearchAndAddDialogOpen} onOpenChange={setIsSearchAndAddDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Search & Add Customer to {selectedGroup?.name}</DialogTitle>
            <DialogDescription>
              Search for existing customers and add them directly to this group.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Search Input */}
            <div className="space-y-2">
              <Label htmlFor="search">Search Customers</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  id="search"
                  placeholder="Search by name, phone, or email..."
                  value={customerSearchQuery}
                  onChange={(e) => setCustomerSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Customer Results */}
            <div className="max-h-60 overflow-y-auto space-y-2">
              {getAvailableCustomers().length === 0 ? (
                <div className="text-center py-4 text-gray-500">
                  {customerSearchQuery.length === 0 ? (
                    <p>Start typing to search for customers...</p>
                  ) : (
                    <p>No customers found matching "{customerSearchQuery}"</p>
                  )}
                </div>
              ) : (
                getAvailableCustomers().map((customer) => (
                  <div
                    key={customer.id}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 cursor-pointer"
                    onClick={() => {
                      searchAndAddForm.setValue('customerId', customer.id);
                      handleSearchAndAddCustomer({ customerId: customer.id });
                      setIsSearchAndAddDialogOpen(false);
                      setCustomerSearchQuery('');
                      searchAndAddForm.reset();
                    }}
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-xs font-medium text-blue-600">
                        {customer?.firstName?.[0]?.toUpperCase() || '?'}
                      </div>
                      <div>
                        <p className="font-medium text-sm">{customer?.firstName || 'Unknown'} {customer?.lastName || ''}</p>
                        <p className="text-xs text-gray-600">{customer?.phoneNumber || 'No phone'}</p>
                        {customer?.email && (
                          <p className="text-xs text-gray-500">{customer.email}</p>
                        )}
                      </div>
                    </div>
                    <Button variant="outline" size="sm">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="flex justify-end space-x-2">
            <Button 
              variant="outline" 
              onClick={() => {
                setIsSearchAndAddDialogOpen(false);
                setCustomerSearchQuery('');
                searchAndAddForm.reset();
              }}
            >
              Cancel
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Customer Merge Dialog */}
      <Dialog open={isMergeDialogOpen} onOpenChange={setIsMergeDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {mergeMode === 'automatic' ? 'Merge Duplicate Customer Accounts' : 'Search & Select Customers to Merge'}
            </DialogTitle>
            <DialogDescription>
              {mergeMode === 'automatic' 
                ? 'Combine multiple customer records with the same phone number into a single account. All orders and group memberships will be transferred to the primary account.'
                : 'Search for specific customers and select which ones you want to merge together. The customer with the most orders will become the primary account.'
              }
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto space-y-4">
          {mergeMode === 'manual' && selectedDuplicates.length === 0 && (
            <div className="space-y-4">
              {/* Search Interface */}
              <div className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <Input
                    placeholder="Search customers by name, email, or phone number..."
                    value={mergeSearchQuery}
                    onChange={(e) => setMergeSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                
                {selectedCustomersForMerge.length > 0 && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h4 className="text-xs font-medium text-blue-800 mb-2">
                      Selected for Merge ({selectedCustomersForMerge.length} customers)
                    </h4>
                    <div className="space-y-2">
                      {selectedCustomersForMerge.map(customer => (
                        <div key={customer?.id} className="flex items-center justify-between bg-white rounded p-2">
                          <div>
                            <span className="font-medium">{customer?.firstName || 'Unknown'} {customer?.lastName || ''}</span>
                            <span className="text-sm text-gray-500 ml-2">({customer?.totalOrders || 0} orders)</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCustomerMergeSelection(customer)}
                            className="text-red-500 hover:text-red-700"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-between items-center mt-4 pt-3 border-t border-blue-200">
                      <p className="text-sm text-blue-700">
                        The customer with the most orders will be the primary account
                      </p>
                      <Button 
                        onClick={handleStartManualMerge}
                        disabled={selectedCustomersForMerge.length < 2}
                        className="bg-green-600 hover:bg-green-700 font-medium"
                        size="lg"
                      >
                        <Users className="h-4 w-4 mr-2" />
                        Merge {selectedCustomersForMerge.length} Customers
                      </Button>
                    </div>
                  </div>
                )}
                
                {/* Search Results */}
                {mergeSearchQuery.length >= 2 && (
                  <div className="border rounded-lg max-h-60 overflow-y-auto">
                    <div className="p-3 border-b bg-gray-50">
                      <h4 className="text-sm font-medium">Search Results</h4>
                    </div>
                    {mergeSearchResults.map(customer => {
                      const isSelected = selectedCustomersForMerge.find(c => c?.id === customer?.id);
                      return (
                        <div 
                          key={customer?.id} 
                          className={`p-3 border-b last:border-b-0 cursor-pointer hover:bg-gray-50 ${isSelected ? 'bg-blue-50' : ''}`}
                          onClick={() => handleCustomerMergeSelection(customer)}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                              <input
                                type="checkbox"
                                checked={!!isSelected}
                                onChange={() => handleCustomerMergeSelection(customer)}
                                className="rounded"
                              />
                              <Avatar className="h-8 w-8">
                                <AvatarFallback className="bg-blue-100 text-blue-600 text-sm">
                                  {getInitials(customer?.firstName || '', customer?.lastName)}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <h5 className="font-medium">{customer?.firstName || 'Unknown'} {customer?.lastName || ''}</h5>
                                <p className="text-sm text-gray-600">{customer?.phoneNumber || 'No phone'}</p>
                                {customer?.email && <p className="text-xs text-gray-500">{customer.email}</p>}
                              </div>
                            </div>
                            <div className="text-right text-sm">
                              <p className="font-medium">{customer?.totalOrders || 0} orders</p>
                              <p className="text-gray-500">{formatMoney(customer?.totalSpent || 0)}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {mergeSearchResults.length === 0 && (
                      <div className="p-4 text-center text-gray-500">
                        No customers found matching "{mergeSearchQuery}"
                      </div>
                    )}
                  </div>
                )}
                
                {mergeSearchQuery.length < 2 && (
                  <div className="text-center py-8 text-gray-500">
                    <Search className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                    <p>Start typing to search for customers to merge</p>
                    <p className="text-sm">Search by name, phone number, or email address</p>
                  </div>
                )}
              </div>
              
              <div className="flex justify-end">
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setIsMergeDialogOpen(false);
                    setSelectedCustomersForMerge([]);
                    setMergeSearchQuery('');
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
          
          {selectedDuplicates.length > 0 && (
            <div className="space-y-4">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <h4 className="text-sm font-medium text-yellow-800 mb-2">
                  {mergeMode === 'automatic' ? 'Duplicate Accounts Found' : 'Customers Selected for Merge'}
                </h4>
                <p className="text-sm text-yellow-700">
                  {mergeMode === 'automatic' 
                    ? `These customers share the same phone number ending in ${selectedDuplicates[0]?.phoneNumber.slice(-4)}:`
                    : `You have selected ${selectedDuplicates.length} customers to merge. The customer with the most orders will be the primary account:`
                  }
                </p>
              </div>
              
              <div className="space-y-3 max-h-48 overflow-y-auto">
                {selectedDuplicates.map((customer, index) => (
                  <div 
                    key={customer?.id} 
                    className={`p-4 border rounded-lg ${index === 0 ? 'border-green-200 bg-green-50' : 'border-gray-200'}`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h5 className="font-medium">
                          {customer?.firstName || 'Unknown'} {customer?.lastName || ''}
                          {index === 0 && <span className="ml-2 text-xs bg-green-100 text-green-800 px-2 py-1 rounded">PRIMARY</span>}
                        </h5>
                        <p className="text-sm text-gray-600">{customer?.phoneNumber || 'No phone'}</p>
                        {customer?.email && <p className="text-sm text-gray-600">{customer.email}</p>}
                        <p className="text-sm text-gray-500">{customer?.totalOrders || 0} orders • {formatMoney(customer?.totalSpent || 0)} spent</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h5 className="text-sm font-medium text-blue-800 mb-2">After Merge:</h5>
                <ul className="text-sm text-blue-700 space-y-1">
                  <li>• All orders from duplicate accounts will be transferred to the primary account</li>
                  <li>• Customer group memberships will be consolidated</li>
                  <li>• Duplicate records will be permanently deleted</li>
                  <li>• Primary account will retain the best available information (name, email, etc.)</li>
                </ul>
              </div>
              
              <div className="flex justify-end space-x-2">
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setIsMergeDialogOpen(false);
                    setSelectedDuplicates([]);
                    setSelectedCustomersForMerge([]);
                    setMergeSearchQuery('');
                  }}
                >
                  Cancel
                </Button>
                <Button 
                  onClick={() => handleMergeCustomers(selectedDuplicates[0], selectedDuplicates.slice(1))}
                  disabled={mergeCustomersMutation.isPending}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {mergeCustomersMutation.isPending ? "Merging..." : "Merge Accounts"}
                </Button>
              </div>
            </div>
          )}
          </div>
        </DialogContent>
      </Dialog>

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
    </div>
  );
}