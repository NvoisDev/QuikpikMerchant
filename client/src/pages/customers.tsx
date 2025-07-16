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
  X
} from "lucide-react";
import { ContextualHelpBubble } from "@/components/ContextualHelpBubble";
import { helpContent } from "@/data/whatsapp-help-content";
import { SubscriptionUpgradeModal } from "@/components/SubscriptionUpgradeModal";

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
  phoneNumber: z.string()
    .min(10, "Valid phone number is required")
    .regex(/^\+?[\d\s\-\(\)]+$/, "Please enter a valid phone number"),
  name: z.string().min(1, "Customer name is required"),
  email: z.string().email("Please enter a valid email address").optional().or(z.literal("")),
});

const editCustomerFormSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().optional(),
  email: z.string().email("Please enter a valid email address").optional().or(z.literal("")),
});

const addToGroupFormSchema = z.object({
  groupId: z.number().min(1, "Please select a group"),
});

// Type definitions
type CustomerGroupFormData = z.infer<typeof customerGroupFormSchema>;
type AddMemberFormData = z.infer<typeof addMemberFormSchema>;
type BulkAddFormData = z.infer<typeof bulkAddFormSchema>;
type EditMemberFormData = z.infer<typeof editMemberFormSchema>;
type EditCustomerFormData = z.infer<typeof editCustomerFormSchema>;
type AddToGroupFormData = z.infer<typeof addToGroupFormSchema>;

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
  const [selectedMember, setSelectedMember] = useState<any>(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  
  // Address book state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isEditCustomerDialogOpen, setIsEditCustomerDialogOpen] = useState(false);
  const [isAddToGroupDialogOpen, setIsAddToGroupDialogOpen] = useState(false);
  const [isViewMembersDialogOpen, setIsViewMembersDialogOpen] = useState(false);
  const [selectedGroupForCustomer, setSelectedGroupForCustomer] = useState<number | null>(null);

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
    defaultValues: { firstName: "", lastName: "", email: "" },
  });

  const addToGroupForm = useForm<AddToGroupFormData>({
    resolver: zodResolver(addToGroupFormSchema),
    defaultValues: { groupId: 0 },
  });

  // Queries - Customer Groups
  const { data: customerGroups = [], isLoading: isLoadingGroups } = useQuery<CustomerGroup[]>({
    queryKey: ['/api/customer-groups'],
    staleTime: 2 * 60 * 1000,
  });

  const { data: groupMembers = [] } = useQuery({
    queryKey: ['/api/customer-groups', selectedGroup?.id, 'members'],
    enabled: !!selectedGroup?.id && isViewMembersDialogOpen,
    staleTime: 2 * 60 * 1000,
  });

  // Query for customer orders
  const { data: customerOrders = [] } = useQuery({
    queryKey: ['/api/orders'],
    staleTime: 2 * 60 * 1000,
  });

  // Queries - Customer Address Book
  const { data: customers = [], isLoading: isLoadingCustomers } = useQuery<Customer[]>({
    queryKey: ['/api/customers'],
    staleTime: 5 * 60 * 1000,
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
    mutationFn: (data: CustomerGroupFormData) => apiRequest('/api/customer-groups', 'POST', data),
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

  const addMemberMutation = useMutation({
    mutationFn: ({ groupId, data }: { groupId: number; data: AddMemberFormData }) =>
      apiRequest(`/api/customer-groups/${groupId}/members`, 'POST', data),
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
      apiRequest(`/api/customers/${customerId}`, 'PUT', data),
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
      apiRequest(`/api/customer-groups/${groupId}/members/${customerId}`, 'POST'),
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

  const removeFromGroupMutation = useMutation({
    mutationFn: ({ groupId, customerId }: { groupId: number; customerId: string }) =>
      apiRequest(`/api/customer-groups/${groupId}/members/${customerId}`, 'DELETE'),
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
    return `${firstName[0]}${lastName ? lastName[0] : ''}`.toUpperCase();
  };

  const displayedCustomers = searchQuery.length > 2 ? searchResults : customers;
  const sortedCustomers = displayedCustomers.sort((a, b) => b.totalSpent - a.totalSpent);

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
      email: customer.email || '',
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

  const handleRemoveFromGroup = (customerId: string, groupId: number) => {
    removeFromGroupMutation.mutate({ groupId, customerId });
  };

  const handleViewMembers = (group: CustomerGroup) => {
    setSelectedGroup(group);
    setIsViewMembersDialogOpen(true);
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
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="groups" className="flex items-center space-x-2">
            <Users className="h-4 w-4" />
            <span>Customer Groups</span>
          </TabsTrigger>
          <TabsTrigger value="address-book" className="flex items-center space-x-2">
            <Contact className="h-4 w-4" />
            <span>Address Book</span>
          </TabsTrigger>
          <TabsTrigger value="orders" className="flex items-center space-x-2">
            <ShoppingBag className="h-4 w-4" />
            <span>Customer Orders</span>
          </TabsTrigger>
        </TabsList>

        {/* Customer Groups Tab */}
        <TabsContent value="groups" className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Customer Groups</h2>
            <div className="flex items-center space-x-2">
              <ContextualHelpBubble content={helpContent.customerGroups} />
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
                      <Badge variant="secondary">
                        {group.memberCount || 0} members
                      </Badge>
                    </div>
                    {group.description && (
                      <p className="text-sm text-muted-foreground">{group.description}</p>
                    )}
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedGroup(group);
                          setIsAddMemberDialogOpen(true);
                        }}
                      >
                        <UserPlus className="mr-2 h-4 w-4" />
                        Add Member
                      </Button>
                      <div className="flex items-center space-x-2">
                        <Button variant="ghost" size="sm">
                          <MessageSquare className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm">
                          <Edit className="h-4 w-4" />
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

          {/* Search Bar */}
          <div className="flex items-center space-x-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search customers by name, email, or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
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
                <Card key={customer.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <Avatar className="h-12 w-12">
                          <AvatarFallback className="bg-blue-100 text-blue-600">
                            {getInitials(customer.firstName, customer.lastName)}
                          </AvatarFallback>
                        </Avatar>
                        
                        <div className="space-y-1">
                          <h3 className="text-lg font-semibold">
                            {customer.firstName} {customer.lastName}
                          </h3>
                          
                          <div className="flex items-center space-x-4 text-sm text-gray-600">
                            <div className="flex items-center space-x-1">
                              <Phone className="h-4 w-4" />
                              <span>{customer.phoneNumber}</span>
                            </div>
                            
                            {customer.email && (
                              <div className="flex items-center space-x-1">
                                <Mail className="h-4 w-4" />
                                <span>{customer.email}</span>
                              </div>
                            )}
                          </div>
                          
                          {customer.groupNames.length > 0 && (
                            <div className="flex items-center space-x-2">
                              {[...new Set(customer.groupNames)].map((groupName, index) => (
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
                            <span className="font-medium">{customer.totalOrders} orders</span>
                          </div>
                          
                          <div className="flex items-center space-x-2">
                            <DollarSign className="h-4 w-4 text-green-500" />
                            <span className="font-medium">{formatCurrency(customer.totalSpent)}</span>
                          </div>
                          
                          {customer.lastOrderDate && (
                            <div className="flex items-center space-x-2 text-sm text-gray-500">
                              <Calendar className="h-4 w-4" />
                              <span>Last: {formatDate(customer.lastOrderDate)}</span>
                            </div>
                          )}
                        </div>
                        
                        <div className="flex items-center space-x-2">
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
              {customers.filter(customer => customer.totalOrders > 0).map((customer) => {
                const customerOrdersList = customerOrders.filter(order => 
                  order.retailerId === customer.id
                );
                
                return (
                  <Card key={customer.id} className="overflow-hidden">
                    <CardContent className="p-0">
                      <div className="p-6 border-b bg-gray-50">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-4">
                            <Avatar className="h-12 w-12">
                              <AvatarFallback className="bg-blue-100 text-blue-700 font-semibold">
                                {customer.firstName.charAt(0)}{customer.lastName?.charAt(0) || ''}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <h4 className="text-lg font-semibold">
                                {customer.firstName} {customer.lastName}
                              </h4>
                              <div className="flex items-center space-x-4 text-sm text-gray-600">
                                <div className="flex items-center space-x-1">
                                  <Phone className="h-4 w-4" />
                                  <span>{customer.phoneNumber}</span>
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
                                <span className="font-medium">{customer.totalOrders} orders</span>
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
                            {customerOrdersList.slice(0, 5).map((order) => (
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
              
              {customers.filter(customer => customer.totalOrders > 0).length === 0 && (
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
            <DialogTitle>Add Customer to {selectedGroup?.name}</DialogTitle>
            <DialogDescription>
              Add a new customer to this group. They'll be able to receive your broadcasts.
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
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input placeholder="Email address" {...field} />
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
              {selectedCustomer?.groupNames.length > 0 && (
                <div className="p-3 bg-blue-50 rounded-lg">
                  <p className="text-sm text-blue-700 font-medium mb-2">
                    Currently in groups:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {[...new Set(selectedCustomer.groupNames)].map((groupName, index) => {
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
                              onClick={() => handleRemoveFromGroup(selectedCustomer.id, groupId)}
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

      {/* Upgrade Modal */}
      <SubscriptionUpgradeModal 
        isOpen={showUpgradeModal} 
        onClose={() => setShowUpgradeModal(false)} 
      />
    </div>
  );
}