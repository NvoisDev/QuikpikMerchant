import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { apiRequest } from '@/lib/queryClient';
import { 
  Search, 
  Users, 
  User, 
  Phone, 
  Mail, 
  MapPin, 
  ShoppingBag, 
  DollarSign,
  Calendar,
  UserPlus,
  Edit3,
  TrendingUp,
  Activity,
  Plus,
  Trash2,
  Home,
  Building2,
  Warehouse,
  Pencil,
  X,
  Check
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

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

export default function CustomerAddressBook() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: customers = [], isLoading } = useQuery<Customer[]>({
    queryKey: ['/api/customers'],
  });

  const { data: stats } = useQuery<CustomerStats>({
    queryKey: ['/api/customers/stats'],
  });

  const { data: searchResults = [] } = useQuery<Customer[]>({
    queryKey: ['/api/customers/search', searchQuery],
    enabled: searchQuery.length > 2,
  });

  const updateCustomerMutation = useMutation({
    mutationFn: async ({ customerId, updates }: { customerId: string; updates: Partial<Customer> }) => {
      const response = await fetch(`/api/customers/${customerId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!response.ok) throw new Error('Failed to update customer');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
      toast({ title: 'Customer updated successfully' });
      setIsEditDialogOpen(false);
    },
    onError: () => {
      toast({ title: 'Failed to update customer', variant: 'destructive' });
    }
  });

  const displayedCustomers = searchQuery.length > 2 ? searchResults : customers;

  const getCustomerInitials = (customer: Customer) => {
    return `${customer.firstName?.[0] || ''}${customer.lastName?.[0] || ''}`.toUpperCase() || 'C';
  };

  const getCustomerFullName = (customer: Customer) => {
    return `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || 'Customer';
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP'
    }).format(amount);
  };

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const handleUpdateCustomer = (updates: Partial<Customer>) => {
    if (!selectedCustomer) return;
    updateCustomerMutation.mutate({
      customerId: selectedCustomer.id,
      updates
    });
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Customer Address Book</h1>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div className="h-6 bg-gray-200 rounded w-1/2"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Customer Address Book</h1>
          <p className="text-muted-foreground">Manage all your customers in one place</p>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Customers</p>
                  <p className="text-2xl font-bold">{stats.totalCustomers}</p>
                </div>
                <Users className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Active Customers</p>
                  <p className="text-2xl font-bold">{stats.activeCustomers}</p>
                </div>
                <Activity className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">New This Month</p>
                  <p className="text-2xl font-bold">{stats.newCustomersThisMonth}</p>
                </div>
                <UserPlus className="h-8 w-8 text-purple-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Top Customers</p>
                  <p className="text-2xl font-bold">{stats.topCustomers.length}</p>
                </div>
                <TrendingUp className="h-8 w-8 text-orange-500" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search customers by name, email, or phone..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      <div className="grid gap-4">
        {displayedCustomers.map((customer) => (
          <Card key={customer.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-4">
                  <Avatar className="h-12 w-12">
                    <AvatarFallback className="bg-blue-100 text-blue-600">
                      {getCustomerInitials(customer)}
                    </AvatarFallback>
                  </Avatar>
                  
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center space-x-2">
                      <h3 className="text-lg font-semibold">{getCustomerFullName(customer)}</h3>
                      {customer.groupNames.map((groupName) => (
                        <Badge key={groupName} variant="secondary" className="text-xs">
                          {groupName}
                        </Badge>
                      ))}
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center space-x-2">
                        <Phone className="h-4 w-4" />
                        <span>{customer.phoneNumber}</span>
                      </div>
                      
                      {customer.email && (
                        <div className="flex items-center space-x-2">
                          <Mail className="h-4 w-4" />
                          <span>{customer.email}</span>
                        </div>
                      )}
                      
                      {customer.city && (
                        <div className="flex items-center space-x-2">
                          <MapPin className="h-4 w-4" />
                          <span>{customer.city}, {customer.country}</span>
                        </div>
                      )}
                      
                      <div className="flex items-center space-x-2">
                        <Calendar className="h-4 w-4" />
                        <span>Joined {formatDate(customer.createdAt)}</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-6 text-sm">
                      <div className="flex items-center space-x-2">
                        <ShoppingBag className="h-4 w-4 text-blue-500" />
                        <span className="font-medium">{customer.totalOrders} orders</span>
                      </div>
                      
                      <div className="flex items-center space-x-2">
                        <DollarSign className="h-4 w-4 text-green-500" />
                        <span className="font-medium">{formatCurrency(customer.totalSpent)}</span>
                      </div>
                      
                      {customer.lastOrderDate && (
                        <span className="text-muted-foreground">
                          Last order: {formatDate(customer.lastOrderDate)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                
                <Dialog open={isEditDialogOpen && selectedCustomer?.id === customer.id} onOpenChange={setIsEditDialogOpen}>
                  <DialogTrigger asChild>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setSelectedCustomer(customer)}
                    >
                      <Edit3 className="h-4 w-4 mr-2" />
                      Edit
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Edit Customer - {getCustomerFullName(customer)}</DialogTitle>
                    </DialogHeader>
                    <CustomerEditForm 
                      customer={customer} 
                      onSave={handleUpdateCustomer}
                      isLoading={updateCustomerMutation.isPending}
                    />
                    <Separator className="my-2" />
                    <CustomerDeliveryAddresses customerId={customer.id} />
                  </DialogContent>
                </Dialog>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {displayedCustomers.length === 0 && !isLoading && (
        <Card className="p-12 text-center">
          <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No customers found</h3>
          <p className="text-muted-foreground">
            {searchQuery ? 'Try adjusting your search criteria' : 'Start by adding customers to your groups'}
          </p>
        </Card>
      )}
    </div>
  );
}

interface CustomerEditFormProps {
  customer: Customer;
  onSave: (updates: Partial<Customer>) => void;
  isLoading: boolean;
}

function CustomerEditForm({ customer, onSave, isLoading }: CustomerEditFormProps) {
  const [formData, setFormData] = useState({
    firstName: customer.firstName || '',
    lastName: customer.lastName || '',
    email: customer.email || '',
    phoneNumber: customer.phoneNumber || '',
    businessName: (customer as any).businessName || '',
    streetAddress: customer.streetAddress || '',
    city: customer.city || '',
    state: customer.state || '',
    postalCode: customer.postalCode || '',
    country: customer.country || ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="firstName">First Name</Label>
          <Input
            id="firstName"
            value={formData.firstName}
            onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
            required
          />
        </div>
        <div>
          <Label htmlFor="lastName">Last Name</Label>
          <Input
            id="lastName"
            value={formData.lastName}
            onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
          />
        </div>
      </div>
      
      <div>
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
        />
      </div>
      
      <div>
        <Label htmlFor="phoneNumber">Phone Number</Label>
        <Input
          id="phoneNumber"
          value={formData.phoneNumber}
          onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
          required
        />
      </div>
      
      <div>
        <Label htmlFor="businessName">Business Name</Label>
        <Input
          id="businessName"
          value={formData.businessName}
          onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
          placeholder="Enter business name"
        />
      </div>
      
      <div>
        <Label htmlFor="streetAddress">Street Address</Label>
        <Input
          id="streetAddress"
          value={formData.streetAddress}
          onChange={(e) => setFormData({ ...formData, streetAddress: e.target.value })}
        />
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="city">City</Label>
          <Input
            id="city"
            value={formData.city}
            onChange={(e) => setFormData({ ...formData, city: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="state">State/County</Label>
          <Input
            id="state"
            value={formData.state}
            onChange={(e) => setFormData({ ...formData, state: e.target.value })}
          />
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="postalCode">Postal Code</Label>
          <Input
            id="postalCode"
            value={formData.postalCode}
            onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="country">Country</Label>
          <Input
            id="country"
            value={formData.country}
            onChange={(e) => setFormData({ ...formData, country: e.target.value })}
          />
        </div>
      </div>
      
      <div className="flex justify-end space-x-2 pt-4">
        <Button type="submit" disabled={isLoading}>
          {isLoading ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </form>
  );
}

function CustomerDeliveryAddresses({ customerId }: { customerId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'United Kingdom',
    label: '',
  });

  const { data: addresses = [], isLoading } = useQuery<DeliveryAddress[]>({
    queryKey: [`/api/wholesaler/customers/${customerId}/addresses`],
  });

  const addMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await apiRequest('POST', `/api/wholesaler/customers/${customerId}/addresses`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/wholesaler/customers/${customerId}/addresses`] });
      toast({ title: 'Address added' });
      resetForm();
    },
    onError: () => {
      toast({ title: 'Failed to add address', variant: 'destructive' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ addressId, data }: { addressId: number; data: typeof formData }) => {
      const response = await apiRequest('PUT', `/api/wholesaler/customers/${customerId}/addresses/${addressId}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/wholesaler/customers/${customerId}/addresses`] });
      toast({ title: 'Address updated' });
      resetForm();
    },
    onError: () => {
      toast({ title: 'Failed to update address', variant: 'destructive' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (addressId: number) => {
      await apiRequest('DELETE', `/api/wholesaler/customers/${customerId}/addresses/${addressId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/wholesaler/customers/${customerId}/addresses`] });
      toast({ title: 'Address deleted' });
    },
    onError: () => {
      toast({ title: 'Failed to delete address', variant: 'destructive' });
    },
  });

  const resetForm = () => {
    setFormData({ addressLine1: '', addressLine2: '', city: '', state: '', postalCode: '', country: 'United Kingdom', label: '' });
    setShowAddForm(false);
    setEditingId(null);
  };

  const startEdit = (addr: DeliveryAddress) => {
    setEditingId(addr.id);
    setShowAddForm(true);
    setFormData({
      addressLine1: addr.addressLine1 || '',
      addressLine2: addr.addressLine2 || '',
      city: addr.city || '',
      state: addr.state || '',
      postalCode: addr.postalCode || '',
      country: addr.country || 'United Kingdom',
      label: addr.label || '',
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      updateMutation.mutate({ addressId: editingId, data: formData });
    } else {
      addMutation.mutate(formData);
    }
  };

  const getLabelIcon = (label?: string) => {
    switch (label?.toLowerCase()) {
      case 'home': return <Home className="h-4 w-4" />;
      case 'office': return <Building2 className="h-4 w-4" />;
      case 'warehouse': return <Warehouse className="h-4 w-4" />;
      default: return <MapPin className="h-4 w-4" />;
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <MapPin className="h-4 w-4 text-green-600" />
          Delivery Addresses ({addresses.length})
        </h3>
        {!showAddForm && (
          <Button variant="outline" size="sm" onClick={() => { resetForm(); setShowAddForm(true); }}>
            <Plus className="h-3 w-3 mr-1" />
            Add Address
          </Button>
        )}
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading addresses...</p>}

      {addresses.length === 0 && !isLoading && !showAddForm && (
        <div className="text-center py-4 bg-gray-50 rounded-lg border border-dashed">
          <MapPin className="h-6 w-6 mx-auto text-muted-foreground mb-1" />
          <p className="text-xs text-muted-foreground">No delivery addresses saved</p>
          <Button variant="ghost" size="sm" className="mt-1 text-xs text-green-600" onClick={() => setShowAddForm(true)}>
            Add first address
          </Button>
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
              <p className="text-muted-foreground">{addr.city}, {addr.state && `${addr.state}, `}{addr.postalCode}</p>
              <p className="text-muted-foreground text-xs">{addr.country}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 ml-2">
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => startEdit(addr)}>
              <Pencil className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-red-500 hover:text-red-700"
              onClick={() => deleteMutation.mutate(addr.id)}
              disabled={deleteMutation.isPending}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      ))}

      {showAddForm && (
        <form onSubmit={handleSubmit} className="space-y-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-blue-900">{editingId ? 'Edit Address' : 'Add New Address'}</p>
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={resetForm}>
              <X className="h-3 w-3" />
            </Button>
          </div>
          <div>
            <Label className="text-xs">Label (e.g. Home, Office, Warehouse)</Label>
            <Input
              value={formData.label}
              onChange={(e) => setFormData({ ...formData, label: e.target.value })}
              placeholder="e.g. Home, Office"
              className="h-8 text-sm"
            />
          </div>
          <div>
            <Label className="text-xs">Address Line 1 *</Label>
            <Input
              value={formData.addressLine1}
              onChange={(e) => setFormData({ ...formData, addressLine1: e.target.value })}
              required
              className="h-8 text-sm"
            />
          </div>
          <div>
            <Label className="text-xs">Address Line 2</Label>
            <Input
              value={formData.addressLine2}
              onChange={(e) => setFormData({ ...formData, addressLine2: e.target.value })}
              className="h-8 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">City *</Label>
              <Input
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                required
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">County/State</Label>
              <Input
                value={formData.state}
                onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                className="h-8 text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Postal Code *</Label>
              <Input
                value={formData.postalCode}
                onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
                required
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">Country</Label>
              <Input
                value={formData.country}
                onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                className="h-8 text-sm"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={resetForm}>Cancel</Button>
            <Button type="submit" size="sm" className="bg-green-600 hover:bg-green-700" disabled={addMutation.isPending || updateMutation.isPending}>
              <Check className="h-3 w-3 mr-1" />
              {editingId ? 'Update' : 'Save'} Address
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
