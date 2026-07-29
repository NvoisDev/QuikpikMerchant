import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation } from "wouter";
import { ContextualHelpBubble } from "@/components/ContextualHelpBubble";
import { helpContent } from "@/data/whatsapp-help-content";
import { BusinessSearchInput, type BusinessPlaceResult } from "@/components/BusinessSearchInput";
import {
  Users, Plus, MessageSquare, UserPlus, Edit, Trash2, Search,
  Smartphone, ContactRound, ChevronDown, ChevronRight, Edit3, Check, X,
} from "lucide-react";

const customerGroupFormSchema = z.object({
  name: z.string().min(1, "Group name is required"),
  description: z.string().optional(),
});

const addMemberFormSchema = z.object({
  firstName: z.string().optional().or(z.literal("")),
  lastName: z.string().optional().or(z.literal("")),
  businessName: z.string().optional().or(z.literal("")),
  email: z.string().email("Please enter a valid email address").optional().or(z.literal("")),
  phoneNumber: z.string()
    .min(10, "Valid phone number is required")
    .regex(/^\+?[\d\s\-\(\)]+$/, "Please enter a valid phone number"),
  streetAddress: z.string().optional().or(z.literal("")),
  addressLine2: z.string().optional().or(z.literal("")),
  city: z.string().optional().or(z.literal("")),
  postalCode: z.string().optional().or(z.literal("")),
  country: z.string().optional().or(z.literal("")),
});

const editMemberFormSchema = z.object({
  firstName: z.string().optional().or(z.literal("")),
  lastName: z.string().optional().or(z.literal("")),
  phoneNumber: z.string()
    .min(10, "Valid phone number is required")
    .regex(/^\+?[\d\s\-\(\)]+$/, "Please enter a valid phone number"),
  name: z.string().optional().or(z.literal("")),
  email: z.string().email("Please enter a valid email address").optional().or(z.literal("")),
  streetAddress: z.string().optional().or(z.literal("")),
  addressLine2: z.string().optional().or(z.literal("")),
  city: z.string().optional().or(z.literal("")),
  postalCode: z.string().optional().or(z.literal("")),
  country: z.string().optional().or(z.literal("")),
});

const editGroupFormSchema = z.object({
  name: z.string().min(1, "Group name is required"),
  description: z.string().optional(),
});

const searchAndAddFormSchema = z.object({
  customerId: z.string().min(1, "Please select a customer"),
});

type CustomerGroupFormData = z.infer<typeof customerGroupFormSchema>;
type AddMemberFormData = z.infer<typeof addMemberFormSchema>;
type EditMemberFormData = z.infer<typeof editMemberFormSchema>;
type EditGroupFormData = z.infer<typeof editGroupFormSchema>;
type SearchAndAddFormData = z.infer<typeof searchAndAddFormSchema>;

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
}

interface GroupMember {
  id?: string;
  customerId?: string;
  businessName?: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  phoneNumber?: string;
  phone_number?: string;
  email?: string;
  streetAddress?: string;
  addressLine2?: string;
  city?: string;
  postalCode?: string;
  country?: string;
}

interface DeviceContact {
  id: string;
  name: string;
  phoneNumber: string;
  email?: string;
  businessName?: string;
}

interface ApiError extends Error {
  response?: { data?: { error?: string } };
}

interface PlanLimits {
  plan: string;
  limits: { products: number; broadcasts: number; teamMembers: number; customGroups: number; priceLists: number };
  usage: { products: number; broadcasts: number; teamMembers: number; priceLists: number };
}

interface CustomerGroupsTabProps {
  customers: Customer[];
  user: { id: string; role?: string } | null;
  isViewer: boolean;
  showUpgradeModal: boolean;
  setShowUpgradeModal: (v: boolean) => void;
  planLimits: PlanLimits | undefined;
  planLimitsLoading: boolean;
  customerGroups: CustomerGroup[];
  isLoadingGroups: boolean;
}

export function CustomerGroupsTab({
  customers,
  user,
  isViewer,
  showUpgradeModal,
  setShowUpgradeModal,
  planLimits,
  planLimitsLoading,
  customerGroups,
  isLoadingGroups,
}: CustomerGroupsTabProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<CustomerGroup | null>(null);
  const [isAddMemberDialogOpen, setIsAddMemberDialogOpen] = useState(false);
  const [isEditMemberDialogOpen, setIsEditMemberDialogOpen] = useState(false);
  const [isEditGroupDialogOpen, setIsEditGroupDialogOpen] = useState(false);
  const [isImportContactsDialogOpen, setIsImportContactsDialogOpen] = useState(false);
  const [isSearchAndAddDialogOpen, setIsSearchAndAddDialogOpen] = useState(false);
  const [isViewMembersDialogOpen, setIsViewMembersDialogOpen] = useState(false);
  const [selectedMember, setSelectedMember] = useState<GroupMember | null>(null);
  const [selectedContacts, setSelectedContacts] = useState<DeviceContact[]>([]);
  const [deviceContacts, setDeviceContacts] = useState<DeviceContact[]>([]);
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');

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
    staleTime: 10 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  const createGroupForm = useForm<CustomerGroupFormData>({
    resolver: zodResolver(customerGroupFormSchema),
    defaultValues: { name: "", description: "" },
  });

  const addMemberForm = useForm<AddMemberFormData>({
    resolver: zodResolver(addMemberFormSchema),
    defaultValues: {
      firstName: "", lastName: "", businessName: "", email: "",
      phoneNumber: "", streetAddress: "", addressLine2: "", city: "", postalCode: "", country: "",
    },
  });

  const handleAddMemberBusinessSearch = useCallback((result: BusinessPlaceResult) => {
    const opts = { shouldValidate: true };
    if (result.businessName) addMemberForm.setValue('businessName', result.businessName, opts);
    if (result.streetAddress) addMemberForm.setValue('streetAddress', result.streetAddress, opts);
    if (result.city) addMemberForm.setValue('city', result.city, opts);
    if (result.postalCode) addMemberForm.setValue('postalCode', result.postalCode, opts);
    if (result.country) addMemberForm.setValue('country', result.country, opts);
  }, [addMemberForm]);

  const editMemberForm = useForm<EditMemberFormData>({
    resolver: zodResolver(editMemberFormSchema),
    defaultValues: {
      phoneNumber: "", name: "", email: "",
      firstName: "", lastName: "",
      streetAddress: "", addressLine2: "", city: "", postalCode: "", country: "",
    },
  });

  const editGroupForm = useForm<EditGroupFormData>({
    resolver: zodResolver(editGroupFormSchema),
    defaultValues: { name: "", description: "" },
  });

  const searchAndAddForm = useForm<SearchAndAddFormData>({
    resolver: zodResolver(searchAndAddFormSchema),
    defaultValues: { customerId: "" },
  });

  const createGroupMutation = useMutation({
    mutationFn: (data: CustomerGroupFormData) => apiRequest('POST', '/api/customer-groups', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/customer-groups'] });
      toast({ title: "Success", description: "Customer group created successfully!" });
      setIsCreateDialogOpen(false);
      createGroupForm.reset();
    },
    onError: (error: Error) => {
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
    onError: (error: Error) => {
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
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add customer",
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
    onError: (error: ApiError) => {
      console.error('Update member error:', error);
      toast({
        title: "Error",
        description: error?.response?.data?.error || "Failed to update member",
        variant: "destructive"
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
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to remove customer from group",
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
      setIsSearchAndAddDialogOpen(false);
      searchAndAddForm.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add customer to group",
        variant: "destructive",
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
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete customer group",
        variant: "destructive",
      });
    },
  });

  const handleCreateGroup = (data: CustomerGroupFormData) => {
    createGroupMutation.mutate(data);
  };

  const handleAddMember = (data: AddMemberFormData) => {
    if (!selectedGroup) return;
    addMemberMutation.mutate({ groupId: selectedGroup.id, data });
  };

  const handleUpdateGroup = (data: EditGroupFormData) => {
    if (!selectedGroup) return;
    editGroupMutation.mutate({ groupId: selectedGroup.id, data });
  };

  const handleUpdateMember = (data: EditMemberFormData) => {
    if (!selectedMember || !selectedGroup) return;
    const memberId = selectedMember?.id || selectedMember?.customerId || '';
    updateMemberMutation.mutate({
      groupId: selectedGroup.id,
      memberId,
      data
    });
  };

  const handleDeleteGroup = (groupId: number) => {
    deleteGroupMutation.mutate(groupId);
  };

  const handleViewMembers = (group: CustomerGroup) => {
    setSelectedGroup(group);
    setIsViewMembersDialogOpen(true);
  };

  const handleRemoveFromGroup = (customerId: string, groupId: number) => {
    removeFromGroupMutation.mutate({ groupId, customerId });
  };

  const handleSearchAndAddCustomer = (data: SearchAndAddFormData) => {
    if (!selectedGroup) return;
    addCustomerToGroupMutation.mutate({ groupId: selectedGroup.id, customerId: data.customerId });
  };

  const handleImportContacts = async () => {
    try {
      if ('contacts' in navigator && 'ContactsManager' in window) {
        const props = ['name', 'tel'];
        const opts = { multiple: true };
        // @ts-ignore - Contacts API is experimental
        const contacts = await navigator.contacts.select(props, opts);
        setDeviceContacts(contacts.map((contact: { name?: string[]; tel?: string[] }) => ({
          id: Math.random().toString(36).substr(2, 9),
          name: contact.name?.[0] || 'Unknown',
          phoneNumber: contact.tel?.[0] || '',
        })));
      } else {
        toast({
          title: "Use Alternative Import Methods",
          description: "Direct contact access isn't available on mobile. Use the 'Paste Contact List' option below or export contacts from your phone as CSV.",
          variant: "default",
        });
      }
    } catch {
      toast({
        title: "Contact Access Unavailable",
        description: "Contact access was denied or isn't available. Use the 'Paste Contact List' section below to import contacts.",
        variant: "default",
      });
    }
  };

  const handleSelectContact = (contact: DeviceContact) => {
    const isSelected = selectedContacts.find(c => c.id === contact.id);
    if (isSelected) {
      setSelectedContacts(selectedContacts.filter(c => c.id !== contact.id));
    } else {
      setSelectedContacts([...selectedContacts, contact]);
    }
  };

  const handleImportSelectedContacts = () => {
    if (!selectedGroup || selectedContacts.length === 0) return;
    selectedContacts.forEach(contact => {
      if (contact.phoneNumber) {
        const [importFirst, ...rest] = contact.name.trim().split(' ');
        const importLast = rest.join(' ');
        addMemberMutation.mutate({
          groupId: selectedGroup.id,
          data: {
            firstName: importFirst || contact.name,
            lastName: importLast,
            phoneNumber: contact.phoneNumber,
            email: contact.email || '',
            businessName: contact.businessName || '',
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

  const getAvailableCustomers = () => {
    if (!selectedGroup || !customers || customerSearchQuery.length === 0) return [];
    const existingMemberIds = (groupMembers || []).map((member: GroupMember) => member?.id || member?.customerId).filter(Boolean);
    const q = customerSearchQuery.toLowerCase();
    return (customers || []).filter(customer => {
      if (!customer) return false;
      const matchesSearch =
        `${customer.firstName || ''} ${customer.lastName || ''}`.toLowerCase().includes(q) ||
        (customer.businessName || '').toLowerCase().includes(q) ||
        (customer.phoneNumber || '').includes(customerSearchQuery) ||
        (customer.email || '').toLowerCase().includes(q);
      const notAlreadyMember = !existingMemberIds.includes(customer.id);
      return matchesSearch && notAlreadyMember;
    });
  };

  const getInitials = (member: GroupMember) => {
    return (member.businessName || member.firstName || member.name || (member.phoneNumber || member.phone_number || '').replace(/\D/g, '').slice(-2) || '?').charAt(0);
  };

  const formatPhoneNumber = (raw: string | undefined | null): string => {
    if (!raw) return '';
    const digits = raw.replace(/\s+/g, '');
    if (digits.startsWith('+44') && digits.length === 13) {
      return `+44 ${digits.slice(3, 7)} ${digits.slice(7, 10)} ${digits.slice(10)}`;
    }
    if (digits.startsWith('+') && digits.length > 10) {
      return `${digits.slice(0, 3)} ${digits.slice(3, 7)} ${digits.slice(7)}`;
    }
    return raw;
  };

  const getDisplayName = (c: Customer | null | undefined) =>
    c?.businessName || `${c?.firstName || ''} ${c?.lastName || ''}`.trim() || c?.phoneNumber || 'Unknown';

  return (
    <>
      {/* Groups Tab Content */}
      <div className="space-y-4 sm:space-y-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg sm:text-xl font-semibold">Customer Groups</h2>
          <div className="flex items-center space-x-2">
            <ContextualHelpBubble
              topic="Customer Groups"
              title="Managing Customer Groups"
              steps={helpContent.customerDirectory.steps}
            />
            {!isViewer && (
              <Button
                size="sm"
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
              <Card
                key={group.id}
                onClick={() => handleViewMembers(group)}
                className="group cursor-pointer border-slate-200 shadow-sm hover:shadow-md hover:border-slate-300 transition-all"
              >
                <CardContent className="p-3 sm:p-4">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleViewMembers(group);
                    }}
                    aria-label={`View members of ${group.name}`}
                    className="flex items-center justify-between gap-3 w-full text-left rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
                  >
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold text-slate-900 text-base sm:text-lg truncate">{group.name}</h3>
                      <p className="text-xs sm:text-sm text-slate-500 truncate mt-0.5">
                        <span className="font-medium text-slate-700">{group.memberCount || 0} {(group.memberCount || 0) === 1 ? 'member' : 'members'}</span>
                        {group.description && <span> • {group.description}</span>}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-300 flex-shrink-0 group-hover:text-slate-400 transition-colors" />
                  </button>

                  <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-slate-100">
                    <div onClick={(e) => e.stopPropagation()}>
                      {!isViewer && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs sm:text-sm">
                              <UserPlus className="h-3.5 w-3.5" />
                              <span className="hidden xs:inline ml-1.5">Add</span>
                              <ChevronDown className="ml-1 h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start" className="w-48">
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedGroup(group);
                                setTimeout(() => setIsAddMemberDialogOpen(true), 0);
                              }}
                            >
                              <UserPlus className="mr-2 h-4 w-4" />
                              Manual Entry
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedGroup(group);
                                setTimeout(() => setIsSearchAndAddDialogOpen(true), 0);
                              }}
                            >
                              <Search className="mr-2 h-4 w-4" />
                              Search Existing
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => {
                                setSelectedGroup(group);
                                setTimeout(() => setIsImportContactsDialogOpen(true), 0);
                              }}
                            >
                              <Smartphone className="mr-2 h-4 w-4" />
                              Import Contacts
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate("/campaigns")}
                        title="Broadcast coming soon"
                        aria-label="Broadcast coming soon"
                        className="h-8 w-8 p-0 rounded-full text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                      >
                        <MessageSquare className="h-4 w-4" />
                      </Button>
                      {!isViewer && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedGroup(group);
                            editGroupForm.reset({ name: group.name, description: group.description || '' });
                            setIsEditGroupDialogOpen(true);
                          }}
                          title="Edit Group"
                          aria-label="Edit Group"
                          className="h-8 w-8 p-0 rounded-full text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                        >
                          <Edit className="h-4 w-4" />
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
                          aria-label="Delete Group"
                          className="h-8 w-8 p-0 rounded-full text-red-500 hover:text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Add Member Dialog */}
      <Dialog open={isAddMemberDialogOpen} onOpenChange={(open) => {
        setIsAddMemberDialogOpen(open);
        if (!open) addMemberForm.reset();
      }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Manual Entry - Add Customer to {selectedGroup?.name}</DialogTitle>
            <DialogDescription>
              Create a new customer profile and add them to this group. They'll be able to receive your broadcasts.
            </DialogDescription>
          </DialogHeader>
          <Form {...addMemberForm}>
            <form onSubmit={addMemberForm.handleSubmit(handleAddMember)} className="space-y-4">
              <div className="pb-1">
                <label className="text-sm font-medium mb-1.5 block">Search on Google</label>
                <BusinessSearchInput
                  placeholder="Type a business name to auto-fill..."
                  onSelect={handleAddMemberBusinessSearch}
                />
              </div>
              <div className="border-t border-dashed pt-3">
                <p className="text-xs text-muted-foreground mb-3">Or fill in manually:</p>
              </div>
              <FormField
                control={addMemberForm.control}
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
                control={addMemberForm.control}
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
                control={addMemberForm.control}
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
                control={addMemberForm.control}
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
                control={addMemberForm.control}
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
              <div className="border-t pt-4">
                <p className="text-sm font-medium text-muted-foreground mb-3">Address <span className="font-normal">(optional — appears on invoices)</span></p>
                <div className="space-y-3">
                  <FormField
                    control={addMemberForm.control}
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
                    control={addMemberForm.control}
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
                      control={addMemberForm.control}
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
                      control={addMemberForm.control}
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
                    control={addMemberForm.control}
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

      {/* View Members Dialog */}
      <Dialog open={isViewMembersDialogOpen} onOpenChange={setIsViewMembersDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="leading-snug break-words pr-6">
              {selectedGroup?.name}
            </DialogTitle>
            <DialogDescription>
              {groupMembers.length} {groupMembers.length === 1 ? 'member' : 'members'}
            </DialogDescription>
          </DialogHeader>

          <div>
            {groupMembers.length > 0 ? (
              <div className="-mx-1 max-h-[70vh] overflow-y-auto divide-y divide-slate-100">
                {groupMembers.map((member: GroupMember, index: number) => (
                  <div key={index} className="flex items-center justify-between gap-3 px-1 py-2.5 rounded-lg hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar className="h-9 w-9 flex-shrink-0">
                        <AvatarFallback className="bg-blue-100 text-blue-700 text-xs font-medium">
                          {getInitials(member)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">
                          {member.businessName || `${member.firstName || ''} ${member.lastName || ''}`.trim() || member.name || member.phoneNumber || member.phone_number || 'Unknown'}
                        </p>
                        <p className="text-xs text-slate-500 truncate">{formatPhoneNumber(member.phoneNumber || member.phone_number)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setSelectedMember(member);
                          const fullName = `${member.firstName || ''} ${member.lastName || ''}`.trim() || member.name || '';
                          editMemberForm.reset({
                            name: fullName,
                            firstName: member.firstName || '',
                            lastName: member.lastName || '',
                            phoneNumber: member.phoneNumber || member.phone_number || '',
                            email: member.email || '',
                            streetAddress: member.streetAddress || '',
                            addressLine2: member.addressLine2 || '',
                            city: member.city || '',
                            postalCode: member.postalCode || '',
                            country: member.country || '',
                          });
                          setIsEditMemberDialogOpen(true);
                        }}
                        title="Edit Member"
                        aria-label="Edit Member"
                        className="h-8 w-8 p-0 rounded-full text-slate-500 hover:text-slate-700 hover:bg-slate-100"
                      >
                        <Edit3 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveFromGroup(member.id || member.customerId || '', selectedGroup?.id!)}
                        title="Remove Member"
                        aria-label="Remove Member"
                        className="h-8 w-8 p-0 rounded-full text-red-500 hover:text-red-600 hover:bg-red-50"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <Users className="h-9 w-9 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-500">No members in this group yet</p>
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
              <FormField
                control={editMemberForm.control}
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
              <FormField
                control={editMemberForm.control}
                name="streetAddress"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Street Address (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., 12 High Street" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={editMemberForm.control}
                name="addressLine2"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address Line 2 (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Flat 2" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-3">
                <FormField
                  control={editMemberForm.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>City (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., London" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editMemberForm.control}
                  name="postalCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Postal Code (Optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., EC1A 1BB" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={editMemberForm.control}
                name="country"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Country (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., GB" {...field} />
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
                    <label className="text-sm font-medium">Paste Contact List</label>
                    <Textarea
                      placeholder="Paste contacts here, one per line:&#10;John Smith, +447123456789&#10;Jane Doe, +447987654321, jane@example.com&#10;Bob Wilson, +447555123456, bob@example.com, Acme Ltd"
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
                            phoneNumber: parts[1] || '',
                            email: parts[2] || undefined,
                            businessName: parts[3] || undefined,
                          };
                        }).filter(contact => contact.phoneNumber);
                        setDeviceContacts(contacts);
                      }}
                    />
                    <p className="text-xs text-gray-500">
                      Format: Name, Phone Number, Email (optional), Business Name (optional) — one per line
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
                            <p className="font-medium">{contact.name}{contact.businessName ? ` · ${contact.businessName}` : ''}</p>
                            <p className="text-sm text-gray-600">{contact.phoneNumber}{contact.email ? ` · ${contact.email}` : ''}</p>
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
            <div className="space-y-2">
              <label htmlFor="search" className="text-sm font-medium">Search Customers</label>
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
                        {(customer?.firstName?.[0] || customer?.businessName?.[0] || '?').toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-sm">{getDisplayName(customer)}</p>
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
    </>
  );
}
