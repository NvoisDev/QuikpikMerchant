import { useState, useMemo, useCallback, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { useCurrency } from "@/hooks/useCurrency";
import { apiRequest } from "@/lib/queryClient";
import { Users, Search, X } from "lucide-react";

interface Customer {
  id: string;
  firstName: string;
  lastName?: string;
  email?: string;
  phoneNumber: string;
  businessName?: string;
  totalOrders: number;
  totalSpent: number;
}

type MergeMode = 'automatic' | 'manual';

interface CustomerMergeDialogProps {
  customers: Customer[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialDuplicates?: Customer[];
  initialMode?: MergeMode;
}

export function CustomerMergeDialog({
  customers,
  open,
  onOpenChange,
  initialDuplicates = [],
  initialMode = 'manual',
}: CustomerMergeDialogProps) {
  const { formatMoney } = useCurrency();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedDuplicates, setSelectedDuplicates] = useState<Customer[]>(initialDuplicates);
  const [mergeSearchQuery, setMergeSearchQuery] = useState('');
  const [selectedCustomersForMerge, setSelectedCustomersForMerge] = useState<Customer[]>([]);
  const [mergeMode, setMergeMode] = useState<MergeMode>(initialMode);

  // Resync internal state every time the dialog opens with new props
  useEffect(() => {
    if (open) {
      setSelectedDuplicates(initialDuplicates);
      setMergeMode(initialMode);
      setSelectedCustomersForMerge([]);
      setMergeSearchQuery('');
    }
  }, [open, initialDuplicates, initialMode]);

  const getInitials = (firstName: string, lastName?: string, businessName?: string, phoneNumber?: string) => {
    if (firstName) return `${firstName[0]}${lastName ? lastName[0] : ''}`.toUpperCase();
    if (businessName) return businessName.slice(0, 2).toUpperCase();
    if (phoneNumber) return phoneNumber.replace(/\D/g, '').slice(-2);
    return '?';
  };

  const getDisplayName = (c: Customer | null | undefined) =>
    c?.businessName || `${c?.firstName || ''} ${c?.lastName || ''}`.trim() || c?.phoneNumber || 'Unknown';

  const mergeCustomersMutation = useMutation({
    mutationFn: async ({ primaryCustomerId, duplicateCustomerIds, mergedData }: {
      primaryCustomerId: string;
      duplicateCustomerIds: string[];
      mergedData?: Record<string, unknown>
    }): Promise<{ message?: string }> => {
      const res = await apiRequest('POST', '/api/customers/merge', { primaryCustomerId, duplicateCustomerIds, mergedData });
      return res.json();
    },
    onSuccess: (data: { message?: string }) => {
      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
      queryClient.invalidateQueries({ queryKey: ['/api/customer-groups'] });
      toast({
        title: "Success",
        description: data?.message || "Successfully merged customer records"
      });
      setSelectedDuplicates([]);
      setSelectedCustomersForMerge([]);
      setMergeSearchQuery('');
      setMergeMode('manual');
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to merge customers",
        variant: "destructive",
      });
    },
  });

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
    const sortedForMerge = [...selectedCustomersForMerge].sort((a, b) => b.totalOrders - a.totalOrders);
    setSelectedDuplicates(sortedForMerge);
    setMergeMode('manual');
  };

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

  const handleClose = () => {
    onOpenChange(false);
    setSelectedDuplicates([]);
    setSelectedCustomersForMerge([]);
    setMergeSearchQuery('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
                            <span className="font-medium">{getDisplayName(customer)}</span>
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
                                  {getInitials(customer?.firstName || '', customer?.lastName, customer?.businessName, customer?.phoneNumber)}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <h5 className="font-medium">{getDisplayName(customer)}</h5>
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
                <Button variant="outline" onClick={handleClose}>
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
                          {getDisplayName(customer)}
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
                <Button variant="outline" onClick={handleClose}>
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
  );
}
