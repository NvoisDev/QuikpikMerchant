import { useState } from "react";
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

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
  ChevronDown
} from "lucide-react";
import { ContextualHelpBubble } from "@/components/ContextualHelpBubble";
import { helpContent } from "@/data/whatsapp-help-content";
import { SubscriptionUpgradeModal } from "@/components/SubscriptionUpgradeModal";
import { CustomerOrderHistory } from "@/components/customer/CustomerOrderHistory";

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
  newCustomersThisMonth: number;
  topCustomers: { customerId: string; name: string; totalSpent: number }[];
}

export default function Customers() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
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
    defaultValues: { firstName: "", lastName: "", email: "", phoneNumber: "" },
  });

  const searchAndAddForm = useForm<SearchAndAddFormData>({
    resolver: zodResolver(searchAndAddFormSchema),
    defaultValues: { customerId: "" },
  });

  // Queries - Customer Groups
  const { data: customerGroups = [], isLoading: isLoadingGroups } = useQuery<CustomerGroup[]>({
    queryKey: ['/api/customer-groups'],
    staleTime: 2 * 60 * 1000,
  });

  const { data: groupMembers = [] } = useQuery({
    queryKey: ['/api/customer-groups', selectedGroup?.id, 'members'],
    queryFn: async () => {
      if (!selectedGroup?.id) return [];
      const url = `/api/customer-groups/${selectedGroup.id}/members`;
      console.log('Fetching group members from:', url);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch group members: ${response.status}`);
      }
      const data = await response.json();
      console.log('Group members data received:', data);
      return data;
    },
    enabled: !!selectedGroup?.id && isViewMembersDialogOpen,
    staleTime: 2 * 60 * 1000,
  });

  // Query for customer orders
  const { data: customerOrders = [] } = useQuery({
    queryKey: ['/api/orders'],
    staleTime: 2 * 60 * 1000,
  });

  // Queries - Customer Address Book
  const { data: customers = [], isLoading: isLoadingCustomers, refetch: refetchCustomers } = useQuery<Customer[]>({
    queryKey: ['/api/customers'],
    staleTime: 30 * 1000, // 30 seconds instead of 5 minutes
  });

  const { data: stats } = useQuery<CustomerStats>({
    queryKey: ['/api/customers/stats'],
    staleTime: 5 * 60 * 1000,
  });

  const { data: searchResults = [] } = useQuery<Customer[]>({
    queryKey: ['/api/customers/search', searchQuery],
    enabled: searchQuery.length > 2,
  });

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
      if (error.message?.includes('upgrade')) {
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
      toast({ title: "Success", description: "Customer updated successfully!" });
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

  const updateMemberMutation = useMutation({
    mutationFn: ({ groupId, memberId, data }: { groupId: number; memberId: string; data: EditMemberFormData }) =>
      apiRequest('PATCH', `/api/customer-groups/${groupId}/members/${memberId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/customer-groups'] });
      queryClient.invalidateQueries({ queryKey: [`/api/customer-groups/${selectedGroup?.id}/members`] });
      toast({ title: "Success", description: "Member updated successfully!" });
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

  // Helper functions
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP'
    }).format(amount);
  };

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

  const displayedCustomers = searchQuery.length > 2 ? searchResults : customers;
  const sortedCustomers = displayedCustomers?.sort((a, b) => b.totalSpent - a.totalSpent) || [];

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

  // Find potential duplicate customers by phone number
  const findDuplicateCustomers = (phoneNumber: string) => {
    const lastFourDigits = phoneNumber.slice(-4);
    return (customers || []).filter(customer => 
      customer?.phoneNumber?.slice(-4) === lastFourDigits && 
      customer?.phoneNumber !== phoneNumber
    );
  };

  // Handle manual customer merge selection
  const handleCustomerMergeSelection = (customer: Customer) => {
    const isSelected = selectedCustomersForMerge.find(c => c.id === customer.id);
    if (isSelected) {
      setSelectedCustomersForMerge(selectedCustomersForMerge.filter(c => c.id !== customer.id));
    } else {
      setSelectedCustomersForMerge([...selectedCustomersForMerge, customer]);
    }
  };

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

  // Filter customers for merge search
  const getMergeSearchResults = () => {
    if (mergeSearchQuery.length < 2) return [];
    return (customers || []).filter(customer => {
      if (!customer) return false;
      const fullName = `${customer.firstName || ''} ${customer.lastName || ''}`.toLowerCase();
      const query = mergeSearchQuery.toLowerCase();
      return fullName.includes(query) || 
             (customer.phoneNumber || '').includes(query) ||
             (customer.email && customer.email.toLowerCase().includes(query));
    });
  };

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
          title: "Contact Import Not Supported",
          description: "Your browser doesn't support contact import. Please add customers manually.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Contact Access Denied",
        description: "Unable to access contacts. Please add customers manually.",
        variant: "destructive",
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Customer Management</h1>
          <p className="text-muted-foreground">Manage your customer groups and address book</p>
        </div>
      </div>

      <Tabs defaultValue="groups" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="groups" className="flex items-center space-x-2">
            <Users className="h-4 w-4" />
            <span>Customer Groups</span>
          </TabsTrigger>
          <TabsTrigger value="address-book" className="flex items-center space-x-2">
            <Contact className="h-4 w-4" />
            <span>Customer Directory</span>
          </TabsTrigger>
        </TabsList>

        {/* Customer Groups Tab */}
        <TabsContent value="groups" className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Customer Groups</h2>
            <div className="flex items-center space-x-2">
              <ContextualHelpBubble 
                topic="Customer Groups"
                title="Managing Customer Groups"
                steps={helpContent.customerDirectory.steps}
              />
              <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Group
                  </Button>
                </DialogTrigger>
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
              <CardContent className="flex flex-col items-center justify-center py-16">
                <Users className="h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No customer groups yet</h3>
                <p className="text-gray-500 text-center mb-6 max-w-sm">
                  Create your first customer group to organize your contacts and send targeted messages.
                </p>
                <Button onClick={() => setIsCreateDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Your First Group
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {customerGroups.map((group) => (
                <Card key={group.id} className="hover:shadow-md transition-shadow">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{group.name}</CardTitle>
                      <div className="flex items-center space-x-2">
                        <Badge variant="secondary">
                          {group.memberCount || 0} members
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewMembers(group)}
                          title="View Members"
                          className="h-8 w-8 p-0"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    {group.description && (
                      <p className="text-sm text-muted-foreground">{group.description}</p>
                    )}
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm">
                              <UserPlus className="mr-2 h-4 w-4" />
                              Add Member
                              <ChevronDown className="ml-2 h-4 w-4" />
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
                      </div>
                      <div className="flex items-center space-x-2">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => {
                            // Navigate to campaigns with this group pre-selected
                            window.location.href = `/campaigns?groupId=${group.id}`;
                          }}
                          title="Send Message"
                        >
                          <MessageSquare className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => {
                            setSelectedGroup(group);
                            setIsEditGroupDialogOpen(true);
                          }}
                          title="Edit Group"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => {
                            if (window.confirm(`Are you sure you want to delete the "${group.name}" group? This will remove all members from the group and cannot be undone.`)) {
                              handleDeleteGroup(group.id);
                            }
                          }}
                          title="Delete Group"
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
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
          {/* Customer Stats */}
          {stats && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="flex items-center p-6">
                  <div className="flex items-center space-x-4">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <Users className="h-6 w-6 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-600">Total Customers</p>
                      <p className="text-2xl font-bold">{stats.totalCustomers}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="flex items-center p-6">
                  <div className="flex items-center space-x-4">
                    <div className="p-2 bg-green-100 rounded-lg">
                      <Activity className="h-6 w-6 text-green-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-600">Active Customers</p>
                      <p className="text-2xl font-bold">{stats.activeCustomers}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="flex items-center p-6">
                  <div className="flex items-center space-x-4">
                    <div className="p-2 bg-purple-100 rounded-lg">
                      <UserPlus className="h-6 w-6 text-purple-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-600">New This Month</p>
                      <p className="text-2xl font-bold">{stats.newCustomersThisMonth}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="flex items-center p-6">
                  <div className="flex items-center space-x-4">
                    <div className="p-2 bg-orange-100 rounded-lg">
                      <TrendingUp className="h-6 w-6 text-orange-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-600">Top Spenders</p>
                      <p className="text-2xl font-bold">{stats.topCustomers.length}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Search Bar and Actions */}
          <div className="flex items-center justify-between space-x-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search customers by name, email, or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex items-center space-x-2">
              <ContextualHelpBubble 
                topic="Customer Directory"
                title="Customer Directory & Groups"
                steps={helpContent.customerDirectory.steps}
              />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex items-center space-x-2"
                  >
                    <Users className="h-4 w-4" />
                    <span>Merge Customers</span>
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={() => {
                    // CRITICAL FIX: Check if customers array exists and has data
                    if (!customers || customers.length === 0) {
                      toast({
                        title: "No customers found",
                        description: "Please wait for customer data to load",
                        variant: "destructive",
                      });
                      return;
                    }

                    // Find potential duplicates by phone number last 4 digits
                    const phoneNumbers = customers.map(c => c?.phoneNumber || '');
                    const duplicatePhoneGroups = new Map<string, Customer[]>();
                    
                    customers.forEach(customer => {
                      if (!customer?.phoneNumber) return;
                      const lastFour = customer?.phoneNumber?.slice(-4) || '';
                      if (!duplicatePhoneGroups.has(lastFour)) {
                        duplicatePhoneGroups.set(lastFour, []);
                      }
                      duplicatePhoneGroups.get(lastFour)!.push(customer);
                    });
                    
                    // Find groups with more than one customer (duplicates)
                    const duplicateGroups = Array.from(duplicatePhoneGroups.values())
                      .filter(group => group.length > 1);
                    
                    if (duplicateGroups.length > 0) {
                      // Show the first duplicate group found
                      const firstDuplicateGroup = duplicateGroups[0];
                      setSelectedDuplicates(firstDuplicateGroup.sort((a, b) => (b?.totalOrders || 0) - (a?.totalOrders || 0)));
                      setMergeMode('automatic');
                      setIsMergeDialogOpen(true);
                    } else {
                      // Check for Michael test accounts
                      const michaelAccounts = customers.filter(customer => 
                        customer?.firstName?.toLowerCase().includes('michael') || 
                        customer?.firstName?.toLowerCase().includes('john')
                      ).sort((a, b) => (b?.totalOrders || 0) - (a?.totalOrders || 0)); // Sort by orders descending
                      
                      if (michaelAccounts.length > 1) {
                        setSelectedDuplicates(michaelAccounts);
                        setMergeMode('automatic');
                        setIsMergeDialogOpen(true);
                      } else {
                        toast({
                          title: "No duplicates found",
                          description: "No duplicate customer accounts detected",
                        });
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
                    // Show search interface in the merge dialog
                    setSelectedDuplicates([]);
                    setIsMergeDialogOpen(true);
                  }}>
                    <Search className="h-4 w-4 mr-2" />
                    Search & Select Customers
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                onClick={() => {
                  // Set a default group for directory additions (or create a general one)
                  setSelectedGroup({ id: 0, name: 'All Customers', description: 'General customer directory' } as CustomerGroup);
                  setIsImportContactsDialogOpen(true);
                }}
                variant="outline"
                size="sm"
                className="flex items-center space-x-2"
              >
                <Smartphone className="h-4 w-4" />
                <span>Import Contacts</span>
              </Button>
              <Dialog open={isAddCustomerDialogOpen} onOpenChange={setIsAddCustomerDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="flex items-center space-x-2">
                    <UserPlus className="h-4 w-4" />
                    <span>Add Customer</span>
                  </Button>
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
            </div>
          </div>

          {/* Customer List */}
          {isLoadingCustomers ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="p-6">
                    <div className="flex items-center space-x-4">
                      <div className="w-12 h-12 bg-gray-200 rounded-full"></div>
                      <div className="flex-1 space-y-2">
                        <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                        <div className="h-3 bg-gray-200 rounded w-1/3"></div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : sortedCustomers.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16">
                <Contact className="h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No customers found</h3>
                <p className="text-gray-500 text-center mb-6 max-w-sm">
                  {searchQuery ? 'No customers match your search criteria.' : 'Start adding customers to your groups to see them here.'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {sortedCustomers.map((customer) => (
                <Card key={customer?.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <Avatar className="h-12 w-12">
                          <AvatarFallback className="bg-blue-100 text-blue-600">
                            {getInitials(customer?.firstName || '', customer?.lastName)}
                          </AvatarFallback>
                        </Avatar>
                        
                        <div className="space-y-1">
                          <h3 className="text-lg font-semibold">
                            {customer?.firstName || 'Unknown'} {customer?.lastName || ''}
                          </h3>
                          
                          <div className="flex items-center space-x-4 text-sm text-gray-600">
                            <div className="flex items-center space-x-1">
                              <Phone className="h-4 w-4" />
                              <span>{customer?.phoneNumber || 'No phone'}</span>
                            </div>
                            
                            {customer?.email && (
                              <div className="flex items-center space-x-1">
                                <Mail className="h-4 w-4" />
                                <span>{customer.email}</span>
                              </div>
                            )}
                          </div>
                          
                          {customer?.groupNames && customer.groupNames.length > 0 && (
                            <div className="flex items-center space-x-2">
                              {Array.from(new Set(customer?.groupNames || [])).map((groupName, index) => (
                                <Badge key={index} variant="outline" className="text-xs">
                                  {groupName}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-6">
                        <div className="text-right space-y-1">
                          <div className="flex items-center space-x-2">
                            <ShoppingBag className="h-4 w-4 text-blue-500" />
                            <span className="font-medium">{customer?.totalOrders || 0} orders</span>
                          </div>
                          
                          <div className="flex items-center space-x-2">
                            <DollarSign className="h-4 w-4 text-green-500" />
                            <span className="font-medium">{formatCurrency(customer?.totalSpent || 0)}</span>
                          </div>
                          
                          {customer?.lastOrderDate && (
                            <div className="flex items-center space-x-2 text-sm text-gray-500">
                              <Calendar className="h-4 w-4" />
                              <span>Last: {formatDate(customer?.lastOrderDate || new Date())}</span>
                            </div>
                          )}
                        </div>
                        
                        <div className="flex items-center space-x-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewCustomerOrders(customer)}
                            title="View All Orders"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleAddToGroup(customer)}
                            title="Add to Group"
                          >
                            <UserCheck className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditCustomer(customer)}
                            title="Edit Customer"
                          >
                            <Edit3 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (confirm(`Are you sure you want to delete ${customer?.firstName || 'this customer'} ${customer?.lastName || ''}? This action cannot be undone.`)) {
                                deleteCustomerMutation.mutate(customer?.id);
                              }
                            }}
                            title="Delete Customer"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Customer Orders Tab */}
        <TabsContent value="orders" className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-semibold">Customer Orders</h3>
              <p className="text-gray-600">View all orders organized by customer</p>
            </div>
          </div>

          {isLoadingCustomers ? (
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
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
                              <h4 className="text-lg font-semibold">
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
                                <span className="font-medium">{formatCurrency(customer.totalSpent)}</span>
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
                                  <span className="font-medium">{formatCurrency(order.totalAmount)}</span>
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
      </Tabs>

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
                        <p className="font-medium text-sm">
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
                  Import from Your Contacts
                </h3>
                <p className="text-gray-600 mb-6">
                  Access your phone's contact list to quickly add customers without typing.
                </p>
                <div className="space-y-3">
                  <Button onClick={handleImportContacts} className="w-full">
                    <Smartphone className="mr-2 h-4 w-4" />
                    Access Phone Contacts
                  </Button>
                  
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                      <span className="bg-white px-2 text-gray-500">Or</span>
                    </div>
                  </div>
                  
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
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-sm font-medium text-blue-600">
                        {customer?.firstName?.[0]?.toUpperCase() || '?'}
                      </div>
                      <div>
                        <p className="font-medium">{customer?.firstName || 'Unknown'} {customer?.lastName || ''}</p>
                        <p className="text-sm text-gray-600">{customer?.phoneNumber || 'No phone'}</p>
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
                    <h4 className="text-sm font-medium text-blue-800 mb-2">
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
                    {getMergeSearchResults().map(customer => {
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
                              <p className="text-gray-500">£{(customer?.totalSpent || 0).toFixed(2)}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {getMergeSearchResults().length === 0 && (
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
                        <p className="text-sm text-gray-500">{customer?.totalOrders || 0} orders • £{(customer?.totalSpent || 0).toFixed(2)} spent</p>
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
        onOpenChange={() => setShowUpgradeModal(false)}
        reason="customer_group_limit"
        currentPlan="free"
      />
    </div>
  );
}