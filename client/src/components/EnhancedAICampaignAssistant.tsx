import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Brain, Sparkles, Clock, Users, MessageSquare, TrendingUp, Lightbulb, Target, Wand2, Calendar, Star, Search, Check, ChevronsUpDown, Package, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface PersonalizedMessage {
  greeting: string;
  mainMessage: string;
  callToAction: string;
  fullMessage: string;
}

interface CampaignSuggestion {
  title: string;
  description: string;
  targetAudience: string;
  suggestedTiming: string;
  messageStyle: string;
}

interface TimingOptimization {
  recommendedTime: string;
  recommendedDay: string;
  reasoning: string;
  confidence: number;
}

interface Customer {
  id: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  customerGroups?: string[];
}

interface Product {
  id: number;
  name: string;
  category: string;
  price: number;
}

interface CustomerGroup {
  id: number;
  name: string;
  memberCount: number;
}

interface EnhancedAICampaignAssistantProps {
  selectedProduct?: any;
  selectedCustomerGroup?: any;
  onMessageGenerated?: (message: string) => void;
}

export function EnhancedAICampaignAssistant({ 
  selectedProduct, 
  selectedCustomerGroup, 
  onMessageGenerated 
}: EnhancedAICampaignAssistantProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('personalize');
  
  // Search states
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [selectedGroupId, setSelectedGroupId] = useState<string>("");
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const [productSearchOpen, setProductSearchOpen] = useState(false);
  const [groupSearchOpen, setGroupSearchOpen] = useState(false);
  
  const [personalizationContext, setPersonalizationContext] = useState({
    customerName: '',
    customerGroup: selectedCustomerGroup?.name || '',
    productName: selectedProduct?.name || '',
    productCategory: selectedProduct?.category || '',
    promotionalOffer: '',
    previousOrders: 0,
    isLoyalCustomer: false,
    timeOfDay: 'morning' as 'morning' | 'afternoon' | 'evening',
    dayOfWeek: ''
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch data for search functionality
  const { data: products = [] } = useQuery({
    queryKey: ['/api/products'],
    enabled: isOpen
  });

  const { data: customerGroups = [] } = useQuery({
    queryKey: ['/api/customer-groups'],
    enabled: isOpen
  });

  // Fetch all customers from customer groups
  const { data: allCustomers = [] } = useQuery({
    queryKey: ['/api/customer-groups/all-members'],
    queryFn: async () => {
      const groups = await apiRequest('/api/customer-groups');
      const allMembers: Customer[] = [];
      
      for (const group of groups) {
        const members = await apiRequest(`/api/customer-groups/${group.id}/members`);
        members.forEach((member: any) => {
          const existingCustomer = allMembers.find(c => c.id === member.userId);
          if (existingCustomer) {
            existingCustomer.customerGroups = [...(existingCustomer.customerGroups || []), group.name];
          } else {
            allMembers.push({
              id: member.userId,
              firstName: member.firstName,
              lastName: member.lastName,
              phoneNumber: member.phoneNumber,
              customerGroups: [group.name]
            });
          }
        });
      }
      
      return allMembers;
    },
    enabled: isOpen
  });

  // Generate personalized message
  const personalizeMutation = useMutation({
    mutationFn: (context: any) => apiRequest('/api/ai/personalized-message', {
      method: 'POST',
      body: JSON.stringify(context)
    }),
    onSuccess: (data: PersonalizedMessage) => {
      toast({
        title: "Message Generated!",
        description: "AI has created your personalized campaign message.",
      });
      if (onMessageGenerated) {
        onMessageGenerated(data.fullMessage);
      }
    },
    onError: () => {
      toast({
        title: "Generation Failed",
        description: "Could not generate personalized message. Please try again.",
        variant: "destructive"
      });
    }
  });

  // Get campaign suggestions
  const { data: campaignSuggestions, isLoading: suggestionsLoading } = useQuery({
    queryKey: ['/api/ai/campaign-suggestions'],
    enabled: isOpen && activeTab === 'suggestions'
  });

  // Optimize timing
  const timingMutation = useMutation({
    mutationFn: (context: any) => apiRequest('/api/ai/optimize-timing', {
      method: 'POST',
      body: JSON.stringify(context)
    }),
    onSuccess: (data: TimingOptimization) => {
      toast({
        title: "Timing Optimized!",
        description: `Best time: ${data.recommendedDay} at ${data.recommendedTime}`,
      });
    }
  });

  const handlePersonalize = () => {
    const selectedCustomer = allCustomers.find(c => c.id === selectedCustomerId);
    const selectedProductData = products.find(p => p.id === parseInt(selectedProductId));
    const selectedGroupData = customerGroups.find(g => g.id === parseInt(selectedGroupId));

    const contextWithSelections = {
      ...personalizationContext,
      customerName: selectedCustomer ? `${selectedCustomer.firstName} ${selectedCustomer.lastName}` : personalizationContext.customerName,
      productName: selectedProductData?.name || personalizationContext.productName,
      productCategory: selectedProductData?.category || personalizationContext.productCategory,
      customerGroup: selectedGroupData?.name || personalizationContext.customerGroup,
    };

    personalizeMutation.mutate(contextWithSelections);
  };

  const handleCustomerSelect = (customerId: string) => {
    setSelectedCustomerId(customerId);
    const customer = allCustomers.find(c => c.id === customerId);
    if (customer) {
      setPersonalizationContext(prev => ({
        ...prev,
        customerName: `${customer.firstName} ${customer.lastName}`
      }));
    }
    setCustomerSearchOpen(false);
  };

  const handleProductSelect = (productId: string) => {
    setSelectedProductId(productId);
    const product = products.find(p => p.id === parseInt(productId));
    if (product) {
      setPersonalizationContext(prev => ({
        ...prev,
        productName: product.name,
        productCategory: product.category
      }));
    }
    setProductSearchOpen(false);
  };

  const handleGroupSelect = (groupId: string) => {
    setSelectedGroupId(groupId);
    const group = customerGroups.find(g => g.id === parseInt(groupId));
    if (group) {
      setPersonalizationContext(prev => ({
        ...prev,
        customerGroup: group.name
      }));
    }
    setGroupSearchOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="flex items-center gap-2 border-purple-200 hover:border-purple-300">
          <Brain className="h-4 w-4 text-purple-600" />
          AI Assistant
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-purple-600" />
            AI Campaign Assistant
          </DialogTitle>
          <DialogDescription>
            Use AI to personalize messages, get campaign suggestions, and optimize timing
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="personalize" className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Personalize
            </TabsTrigger>
            <TabsTrigger value="suggestions" className="flex items-center gap-2">
              <Lightbulb className="h-4 w-4" />
              Suggestions
            </TabsTrigger>
            <TabsTrigger value="timing" className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Timing
            </TabsTrigger>
          </TabsList>

          <TabsContent value="personalize" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wand2 className="h-5 w-5 text-purple-600" />
                  Message Personalization
                </CardTitle>
                <CardDescription>
                  Create personalized WhatsApp messages based on customer and product context
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  {/* Customer Search */}
                  <div className="space-y-2">
                    <Label>Customer Name</Label>
                    <Popover open={customerSearchOpen} onOpenChange={setCustomerSearchOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={customerSearchOpen}
                          className="w-full justify-between"
                        >
                          {selectedCustomerId
                            ? (() => {
                                const customer = allCustomers.find(c => c.id === selectedCustomerId);
                                return customer ? `${customer.firstName} ${customer.lastName}` : "Select customer...";
                              })()
                            : "Select customer..."}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-full p-0">
                        <Command>
                          <CommandInput placeholder="Search customers..." />
                          <CommandEmpty>No customer found.</CommandEmpty>
                          <CommandGroup>
                            <CommandList>
                              {allCustomers.map((customer) => (
                                <CommandItem
                                  key={customer.id}
                                  value={`${customer.firstName} ${customer.lastName}`}
                                  onSelect={() => handleCustomerSelect(customer.id)}
                                  className="flex items-center justify-between"
                                >
                                  <div className="flex items-center gap-2">
                                    <User className="h-4 w-4" />
                                    <div>
                                      <div className="font-medium">{customer.firstName} {customer.lastName}</div>
                                      <div className="text-sm text-gray-500">{customer.phoneNumber}</div>
                                    </div>
                                  </div>
                                  <Check
                                    className={cn(
                                      "h-4 w-4",
                                      selectedCustomerId === customer.id ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                </CommandItem>
                              ))}
                            </CommandList>
                          </CommandGroup>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* Customer Group Search */}
                  <div className="space-y-2">
                    <Label>Customer Group</Label>
                    <Popover open={groupSearchOpen} onOpenChange={setGroupSearchOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={groupSearchOpen}
                          className="w-full justify-between"
                        >
                          {selectedGroupId
                            ? (() => {
                                const group = customerGroups.find(g => g.id === parseInt(selectedGroupId));
                                return group ? group.name : "Select group...";
                              })()
                            : "Select group..."}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-full p-0">
                        <Command>
                          <CommandInput placeholder="Search customer groups..." />
                          <CommandEmpty>No group found.</CommandEmpty>
                          <CommandGroup>
                            <CommandList>
                              {customerGroups.map((group) => (
                                <CommandItem
                                  key={group.id}
                                  value={group.name}
                                  onSelect={() => handleGroupSelect(group.id.toString())}
                                  className="flex items-center justify-between"
                                >
                                  <div className="flex items-center gap-2">
                                    <Users className="h-4 w-4" />
                                    <div>
                                      <div className="font-medium">{group.name}</div>
                                      <div className="text-sm text-gray-500">{group.memberCount} members</div>
                                    </div>
                                  </div>
                                  <Check
                                    className={cn(
                                      "h-4 w-4",
                                      selectedGroupId === group.id.toString() ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                </CommandItem>
                              ))}
                            </CommandList>
                          </CommandGroup>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* Product Search */}
                  <div className="space-y-2">
                    <Label>Product Name</Label>
                    <Popover open={productSearchOpen} onOpenChange={setProductSearchOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={productSearchOpen}
                          className="w-full justify-between"
                        >
                          {selectedProductId
                            ? (() => {
                                const product = products.find(p => p.id === parseInt(selectedProductId));
                                return product ? product.name : "Select product...";
                              })()
                            : "Select product..."}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-full p-0">
                        <Command>
                          <CommandInput placeholder="Search products..." />
                          <CommandEmpty>No product found.</CommandEmpty>
                          <CommandGroup>
                            <CommandList>
                              {products.map((product) => (
                                <CommandItem
                                  key={product.id}
                                  value={product.name}
                                  onSelect={() => handleProductSelect(product.id.toString())}
                                  className="flex items-center justify-between"
                                >
                                  <div className="flex items-center gap-2">
                                    <Package className="h-4 w-4" />
                                    <div>
                                      <div className="font-medium">{product.name}</div>
                                      <div className="text-sm text-gray-500">{product.category} • £{product.price}</div>
                                    </div>
                                  </div>
                                  <Check
                                    className={cn(
                                      "h-4 w-4",
                                      selectedProductId === product.id.toString() ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                </CommandItem>
                              ))}
                            </CommandList>
                          </CommandGroup>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* Time of Day */}
                  <div className="space-y-2">
                    <Label>Time of Day</Label>
                    <Select
                      value={personalizationContext.timeOfDay}
                      onValueChange={(value: 'morning' | 'afternoon' | 'evening') =>
                        setPersonalizationContext(prev => ({ ...prev, timeOfDay: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select time of day" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="morning">Morning</SelectItem>
                        <SelectItem value="afternoon">Afternoon</SelectItem>
                        <SelectItem value="evening">Evening</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Promotional Offer (Optional)</Label>
                  <Textarea
                    placeholder="e.g., 20% off bulk orders"
                    value={personalizationContext.promotionalOffer}
                    onChange={(e) =>
                      setPersonalizationContext(prev => ({ ...prev, promotionalOffer: e.target.value }))
                    }
                  />
                </div>

                <Button 
                  onClick={handlePersonalize} 
                  disabled={personalizeMutation.isPending}
                  className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
                >
                  {personalizeMutation.isPending ? "Generating..." : "Generate Personalized Message"}
                  <Sparkles className="ml-2 h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="suggestions" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lightbulb className="h-5 w-5 text-blue-600" />
                  Campaign Suggestions
                </CardTitle>
                <CardDescription>
                  AI-powered campaign ideas based on your business data
                </CardDescription>
              </CardHeader>
              <CardContent>
                {suggestionsLoading ? (
                  <div className="text-center py-8">
                    <div className="animate-spin inline-block w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full"></div>
                    <p className="mt-2 text-gray-600">Generating suggestions...</p>
                  </div>
                ) : campaignSuggestions && campaignSuggestions.length > 0 ? (
                  <div className="space-y-4">
                    {campaignSuggestions.map((suggestion: CampaignSuggestion, index: number) => (
                      <Card key={index} className="border-blue-200">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            <div>
                              <h4 className="font-semibold text-blue-800">{suggestion.title}</h4>
                              <p className="text-sm text-gray-600 mt-1">{suggestion.description}</p>
                              <div className="flex gap-4 mt-2 text-xs text-gray-500">
                                <span>Target: {suggestion.targetAudience}</span>
                                <span>Timing: {suggestion.suggestedTiming}</span>
                                <span>Style: {suggestion.messageStyle}</span>
                              </div>
                            </div>
                            <Badge variant="secondary">AI Suggested</Badge>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <Lightbulb className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                    <p>No suggestions available. Add products and customer groups to get AI recommendations.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="timing" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-green-600" />
                  Timing Optimization
                </CardTitle>
                <CardDescription>
                  Get AI recommendations for the best time to send your campaigns
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <Button 
                    onClick={() => timingMutation.mutate({
                      customerGroup: personalizationContext.customerGroup || 'General',
                      previousCampaignData: []
                    })}
                    disabled={timingMutation.isPending}
                    className="w-full"
                  >
                    {timingMutation.isPending ? "Analyzing..." : "Get Timing Recommendations"}
                    <Clock className="ml-2 h-4 w-4" />
                  </Button>

                  {timingMutation.data && (
                    <Card className="border-green-200 bg-green-50">
                      <CardContent className="p-4">
                        <h4 className="font-semibold text-green-800 mb-2">Optimal Timing</h4>
                        <div className="space-y-2 text-sm">
                          <div>
                            <strong>Recommended:</strong> {timingMutation.data.recommendedDay} at {timingMutation.data.recommendedTime}
                          </div>
                          <div>
                            <strong>Confidence:</strong>
                            <Badge variant="secondary" className="ml-2">
                              {Math.round(timingMutation.data.confidence * 100)}%
                            </Badge>
                          </div>
                          <div>
                            <strong>Reasoning:</strong>
                            <p className="text-gray-600 mt-1">{timingMutation.data.reasoning}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}