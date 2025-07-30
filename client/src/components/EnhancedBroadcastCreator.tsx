import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { MessageSquare, Send, Eye, Users, Package, Percent, Target } from "lucide-react";

interface EnhancedBroadcastCreatorProps {
  onCampaignCreated?: () => void;
}

export default function EnhancedBroadcastCreator({ onCampaignCreated }: EnhancedBroadcastCreatorProps) {
  const [campaignData, setCampaignData] = useState({
    title: '',
    customMessage: '',
    selectedProducts: [] as number[],
    customerGroupId: '',
    discountStrategy: 'automatic',
    includeContact: true,
    includePurchaseLink: true
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch products
  const { data: products = [], isLoading: loadingProducts } = useQuery({
    queryKey: ['/api/products'],
    refetchOnWindowFocus: false,
  });

  // Fetch customer groups
  const { data: customerGroups = [], isLoading: loadingGroups } = useQuery({
    queryKey: ['/api/customer-groups'],
    refetchOnWindowFocus: false,
  });

  // Create enhanced broadcast campaign
  const createCampaignMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest('POST', '/api/campaigns/enhanced-broadcast', data);
    },
    onSuccess: () => {
      toast({
        title: "Enhanced Broadcast Created",
        description: "Your broadcast campaign with personalized discounts has been sent successfully.",
      });
      setCampaignData({
        title: '',
        customMessage: '',
        selectedProducts: [],
        customerGroupId: '',
        discountStrategy: 'automatic',
        includeContact: true,
        includePurchaseLink: true
      });
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns'] });
      if (onCampaignCreated) {
        onCampaignCreated();
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error Creating Campaign",
        description: error.message || "Failed to create enhanced broadcast campaign",
        variant: "destructive",
      });
    },
  });

  const handleProductToggle = (productId: number) => {
    setCampaignData(prev => ({
      ...prev,
      selectedProducts: prev.selectedProducts.includes(productId)
        ? prev.selectedProducts.filter(id => id !== productId)
        : [...prev.selectedProducts, productId]
    }));
  };

  const getSelectedProducts = () => {
    return (products as any[]).filter((p: any) => campaignData.selectedProducts.includes(p.id));
  };

  const generatePreviewMessage = () => {
    const selectedProducts = getSelectedProducts();
    if (selectedProducts.length === 0) return '';

    const customerName = "Michael"; // Example customer name
    let message = `🌟 Hi ${customerName}!\n\n`;
    
    if (campaignData.customMessage) {
      message += `${campaignData.customMessage}\n\n`;
    }

    message += `Special offers just for you:\n\n`;

    selectedProducts.forEach((product: any) => {
      const originalPrice = parseFloat(product.price);
      let discount = 0;
      
      // Calculate discount based on strategy
      switch (campaignData.discountStrategy) {
        case 'automatic':
          discount = 0.20; // 20% for high-value customers (example)
          break;
        case 'tiered':
          discount = 0.15; // 15% for this customer tier
          break;
        case 'fixed':
          discount = 0.10; // 10% for all customers
          break;
      }

      const discountedPrice = originalPrice * (1 - discount);
      const discountPercentage = Math.round(discount * 100);

      message += `${product.name}\n`;
      message += `£${discountedPrice.toFixed(2)} (${discountPercentage}% OFF)\n`;
      message += `Was: £${originalPrice.toFixed(2)}\n\n`;
    });

    if (campaignData.includePurchaseLink) {
      message += `Order now: lanrefoods.quikpik.app\n\n`;
    }

    if (campaignData.includeContact) {
      message += `Questions? Reply to this message or call us.`;
    }

    return message;
  };

  const handleSubmit = () => {
    if (!campaignData.title || campaignData.selectedProducts.length === 0 || !campaignData.customerGroupId) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields: title, products, and customer group.",
        variant: "destructive",
      });
      return;
    }

    createCampaignMutation.mutate(campaignData);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Create Broadcast with Personalized Discounts
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Send the same campaign to all customers, but each receives a personalized discount based on their loyalty and purchase history.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column: Campaign Setup */}
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Campaign Title *</label>
              <Input 
                placeholder="e.g., Weekly Special Offers"
                value={campaignData.title}
                onChange={(e) => setCampaignData(prev => ({ ...prev, title: e.target.value }))}
              />
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">Select Customer Group *</label>
              <Select 
                value={campaignData.customerGroupId} 
                onValueChange={(value) => setCampaignData(prev => ({ ...prev, customerGroupId: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose customer group" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Customers</SelectItem>
                  {(customerGroups as any[]).map((group: any) => (
                    <SelectItem key={group.id} value={group.id.toString()}>
                      {group.name} ({group.customerCount || 0} customers)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Select Products *</label>
              <div className="border rounded-lg p-3 max-h-48 overflow-y-auto space-y-2">
                {loadingProducts ? (
                  <div className="text-sm text-gray-500">Loading products...</div>
                ) : (products as any[]).length === 0 ? (
                  <div className="text-sm text-gray-500">No products available</div>
                ) : (
                  (products as any[]).map((product: any) => (
                    <div key={product.id} className="flex items-center space-x-2">
                      <Checkbox 
                        id={`product-${product.id}`}
                        checked={campaignData.selectedProducts.includes(product.id)}
                        onCheckedChange={() => handleProductToggle(product.id)}
                      />
                      <label htmlFor={`product-${product.id}`} className="text-sm flex-1 cursor-pointer">
                        {product.name} - £{product.price}
                      </label>
                    </div>
                  ))
                )}
              </div>
              {campaignData.selectedProducts.length > 0 && (
                <p className="text-xs text-muted-foreground mt-2">
                  {campaignData.selectedProducts.length} product(s) selected
                </p>
              )}
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Discount Strategy</label>
              <Select 
                value={campaignData.discountStrategy} 
                onValueChange={(value) => setCampaignData(prev => ({ ...prev, discountStrategy: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="automatic">Automatic (AI determines discount per customer)</SelectItem>
                  <SelectItem value="tiered">Tiered (High/Medium/Low value customers)</SelectItem>
                  <SelectItem value="fixed">Fixed discount for all</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Automatic: High-value customers get 15-25%, regular customers get 10-15%, new customers get 5-10%
              </p>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Custom Message (Optional)</label>
              <Textarea 
                placeholder="Add your custom message here..."
                className="h-20"
                value={campaignData.customMessage}
                onChange={(e) => setCampaignData(prev => ({ ...prev, customMessage: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="include-contact"
                  checked={campaignData.includeContact}
                  onCheckedChange={(checked) => setCampaignData(prev => ({ ...prev, includeContact: !!checked }))}
                />
                <label htmlFor="include-contact" className="text-sm">Include contact information</label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="include-purchase"
                  checked={campaignData.includePurchaseLink}
                  onCheckedChange={(checked) => setCampaignData(prev => ({ ...prev, includePurchaseLink: !!checked }))}
                />
                <label htmlFor="include-purchase" className="text-sm">Include purchase link</label>
              </div>
            </div>
          </div>

          {/* Right Column: Message Preview */}
          <div className="space-y-4">
            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                <Eye className="h-4 w-4" />
                Preview (Example for High-Value Customer)
              </h4>
              <div className="bg-white p-3 rounded border text-sm whitespace-pre-line">
                {generatePreviewMessage() || "Select products to see preview..."}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Each customer will see different discounts based on their profile
              </p>
            </div>

            {campaignData.selectedProducts.length > 0 && (
              <div className="bg-blue-50 p-4 rounded-lg">
                <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <Target className="h-4 w-4" />
                  Campaign Summary
                </h4>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span>Products:</span>
                    <Badge variant="secondary">{campaignData.selectedProducts.length}</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Strategy:</span>
                    <Badge variant="outline">
                      {campaignData.discountStrategy === 'automatic' ? 'AI-Powered' : 
                       campaignData.discountStrategy === 'tiered' ? 'Customer Tiers' : 
                       'Fixed Discount'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Tracking:</span>
                    <Badge variant="secondary">Performance Analytics</Badge>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-3 pt-4 border-t">
          <Button 
            className="flex-1" 
            onClick={handleSubmit}
            disabled={createCampaignMutation.isPending}
          >
            <Send className="h-4 w-4 mr-2" />
            {createCampaignMutation.isPending ? "Sending..." : "Send Personalized Broadcast"}
          </Button>
          <Button variant="outline" disabled={campaignData.selectedProducts.length === 0}>
            <Eye className="h-4 w-4 mr-2" />
            Preview All Variations
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}