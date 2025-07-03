import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { formatCurrency } from "@/lib/currencies";
import { 
  MessageSquare, 
  Plus,
  Send,
  Copy,
  Trash2,
  Eye,
  Edit3,
  Users,
  Package,
  ShoppingCart,
  RefreshCw,
  ExternalLink,
  BarChart3,
  Calendar,
  CheckCircle,
  XCircle,
  Clock
} from "lucide-react";
import type { Product, CustomerGroup } from "@shared/schema";

const campaignFormSchema = z.object({
  title: z.string().min(1, "Campaign title is required"),
  customMessage: z.string().optional(),
  includeContact: z.boolean().default(true),
  includePurchaseLink: z.boolean().default(true),
  campaignType: z.enum(['single', 'multi']),
  // For single product campaigns
  productId: z.number().optional(),
  // For multi-product campaigns
  products: z.array(z.object({
    productId: z.number(),
    quantity: z.number().min(1),
    specialPrice: z.string().optional(),
  })).optional(),
});

type CampaignFormData = z.infer<typeof campaignFormSchema>;

interface Campaign {
  id: string;
  title: string;
  customMessage?: string;
  includeContact: boolean;
  includePurchaseLink: boolean;
  campaignType: 'single' | 'multi';
  status: string;
  createdAt: string;
  product?: Product;
  products?: Array<{
    id: number;
    productId: number;
    quantity: number;
    specialPrice?: string;
    product: Product;
  }>;
  sentCampaigns: Array<{
    id: number;
    sentAt?: string;
    recipientCount: number;
    clickCount: number;
    orderCount: number;
    totalRevenue: string;
    customerGroup: CustomerGroup;
  }>;
}

export default function Campaigns() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isSendOpen, setIsSendOpen] = useState(false);
  const [isStockRefreshOpen, setIsStockRefreshOpen] = useState(false);
  const [campaignType, setCampaignType] = useState<'single' | 'multi'>('single');
  const [selectedProducts, setSelectedProducts] = useState<Array<{productId: number; quantity: number; specialPrice?: string}>>([]);

  // Fetch campaigns (unified broadcasts and templates)
  const { data: campaigns = [], isLoading: campaignsLoading } = useQuery({
    queryKey: ["/api/campaigns"],
  });

  // Fetch products for campaign creation
  const { data: products = [] } = useQuery({
    queryKey: ["/api/products"],
  });

  // Fetch customer groups for campaign sending
  const { data: customerGroups = [] } = useQuery({
    queryKey: ["/api/customer-groups"],
  });

  const form = useForm<CampaignFormData>({
    resolver: zodResolver(campaignFormSchema),
    defaultValues: {
      title: "",
      customMessage: "",
      includeContact: true,
      includePurchaseLink: true,
      campaignType: 'single',
      products: [],
    },
  });

  // Create campaign mutation
  const createCampaignMutation = useMutation({
    mutationFn: async (data: CampaignFormData) => {
      const campaignData = {
        ...data,
        products: data.campaignType === 'multi' ? selectedProducts.filter(p => p.productId > 0) : undefined
      };
      const response = await apiRequest("POST", "/api/campaigns", campaignData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      setIsCreateOpen(false);
      form.reset();
      setSelectedProducts([]);
      toast({
        title: "Campaign Created",
        description: "Your marketing campaign has been created successfully!",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Creation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Send campaign mutation
  const sendCampaignMutation = useMutation({
    mutationFn: async ({ campaignId, customerGroupId }: { campaignId: string; customerGroupId: number }) => {
      const response = await apiRequest("POST", "/api/campaigns/send", {
        campaignId,
        customerGroupId,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      setIsSendOpen(false);
      toast({
        title: "Campaign Sent",
        description: "Your marketing campaign has been sent successfully!",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Campaign Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Stock refresh mutation
  const stockRefreshMutation = useMutation({
    mutationFn: async ({ campaignId, customerGroupId }: { campaignId: string; customerGroupId: number }) => {
      const response = await apiRequest("POST", `/api/campaigns/${campaignId}/refresh-stock`, {
        customerGroupId,
      });
      return response.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      setIsStockRefreshOpen(false);
      toast({
        title: "Stock Update Sent",
        description: `Stock update sent to ${data.messagesSent} customers`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Stock Update Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const addProduct = () => {
    setSelectedProducts([...selectedProducts, { productId: 0, quantity: 1 }]);
  };

  const removeProduct = (index: number) => {
    setSelectedProducts(selectedProducts.filter((_, i) => i !== index));
  };

  const updateProduct = (index: number, field: string, value: any) => {
    const updated = [...selectedProducts];
    
    if (field === 'productId') {
      // When product is selected, set quantity to stock amount
      const selectedProduct = (products as Product[]).find(p => p.id === parseInt(value));
      updated[index] = { 
        ...updated[index], 
        [field]: value,
        quantity: selectedProduct?.stock || 1
      };
    } else {
      updated[index] = { ...updated[index], [field]: value };
    }
    
    setSelectedProducts(updated);
  };

  const generatePreviewMessage = (campaign: Campaign) => {
    const businessName = user?.businessName || "Your Business";
    const phone = user?.businessPhone || user?.phoneNumber || "+1234567890";
    const campaignUrl = "https://quikpik.co/campaign/abc123";

    let message = `🛍️ ${campaign.title}`;
    
    if (campaign.customMessage) {
      message += `\n\n${campaign.customMessage}`;
    }

    if (campaign.campaignType === 'single' && campaign.product) {
      message += `\n\n📦 Featured Product:\n${campaign.product.name}\n\n`;
      message += `💰 Unit Price: ${formatCurrency(parseFloat(campaign.product.price))}\n`;
      message += `📦 MOQ: ${campaign.product.moq} units\n`;
      message += `📦 In Stock: ${campaign.product.stock || 'Available'} packs available`;
      
      if (campaign.product.description) {
        message += `\n\n📋 ${campaign.product.description}`;
      }
    } else if (campaign.campaignType === 'multi' && campaign.products) {
      message += `\n\n📦 Featured Products:\n`;
      campaign.products.forEach((item, index) => {
        const price = item.specialPrice || item.product.price;
        message += `\n${index + 1}. ${item.product.name}\n`;
        message += `   💰 Unit Price: ${formatCurrency(parseFloat(price))}\n`;
        message += `   📦 MOQ: ${item.product.moq} units\n`;
        message += `   📦 Suggested Qty: ${item.quantity} units\n`;
        message += `   📦 In Stock: ${item.product.stock || 'Available'} packs available`;
      });
    }

    if (campaign.includePurchaseLink) {
      message += `\n\n🛒 Place Your Order Now:\n${campaignUrl}`;
    }

    if (campaign.includeContact) {
      message += `\n\n📞 Questions or Bulk Orders?\n${businessName}\n📱 ${phone}`;
    }

    message += `\n\n✨ This update was powered by Quikpik Merchant`;

    return message;
  };

  const onSubmit = (data: CampaignFormData) => {
    createCampaignMutation.mutate({
      ...data,
      campaignType,
      products: campaignType === 'multi' ? selectedProducts.filter(p => p.productId > 0) : undefined
    });
  };

  if (campaignsLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Broadcast Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Campaigns</p>
                <p className="text-2xl font-bold text-gray-900">{campaigns.length}</p>
              </div>
              <div className="h-8 w-8 bg-blue-100 rounded-full flex items-center justify-center">
                <MessageSquare className="h-4 w-4 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Messages Sent</p>
                <p className="text-2xl font-bold text-gray-900">
                  {campaigns.reduce((total, campaign) => 
                    total + campaign.sentCampaigns.reduce((sum, sent) => sum + sent.recipientCount, 0), 0
                  )}
                </p>
              </div>
              <div className="h-8 w-8 bg-green-100 rounded-full flex items-center justify-center">
                <Send className="h-4 w-4 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Orders</p>
                <p className="text-2xl font-bold text-gray-900">
                  {campaigns.reduce((total, campaign) => 
                    total + campaign.sentCampaigns.reduce((sum, sent) => sum + sent.orderCount, 0), 0
                  )}
                </p>
              </div>
              <div className="h-8 w-8 bg-purple-100 rounded-full flex items-center justify-center">
                <ShoppingCart className="h-4 w-4 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Stock Value</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatCurrency((campaigns as any[]).reduce((total: number, campaign: any) => {
                    if (campaign.campaignType === 'single') {
                      return total + ((Number(campaign.product?.price) || 0) * (Number(campaign.product?.stock) || 0));
                    } else {
                      return total + (campaign.products?.reduce((sum: number, p: any) => 
                        sum + ((Number(p.product?.price) || 0) * (Number(p.product?.stock) || 0)), 0) || 0);
                    }
                  }, 0))}
                </p>
              </div>
              <div className="h-8 w-8 bg-yellow-100 rounded-full flex items-center justify-center">
                <BarChart3 className="h-4 w-4 text-yellow-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Broadcast</h1>
          <p className="text-gray-600 mt-1">Send WhatsApp messages to promote products and boost sales</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="flex items-center space-x-2">
              <Plus className="h-4 w-4" />
              <span>Create Broadcast</span>
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Broadcast Campaign</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Campaign Title</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g., 🔥 Weekend Flash Sale" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="customMessage"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Custom Message (Optional)</FormLabel>
                      <FormControl>
                        <Textarea 
                          {...field} 
                          placeholder="Add a personal message to your customers..."
                          rows={3}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Campaign Type Selection */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Campaign Type</h3>
                  <Tabs value={campaignType} onValueChange={(value) => setCampaignType(value as 'single' | 'multi')}>
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="single">Single Product</TabsTrigger>
                      <TabsTrigger value="multi">Multiple Products</TabsTrigger>
                    </TabsList>

                    <TabsContent value="single" className="space-y-4">
                      <FormField
                        control={form.control}
                        name="productId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Select Product</FormLabel>
                            <Select onValueChange={(value) => field.onChange(parseInt(value))}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Choose a product to promote" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {(products as Product[]).map((product: Product) => (
                                  <SelectItem key={product.id} value={product.id.toString()}>
                                    {product.name} - {formatCurrency(parseFloat(product.price))}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </TabsContent>

                    <TabsContent value="multi" className="space-y-4">
                      <div className="flex justify-between items-center">
                        <h4 className="font-medium">Products</h4>
                        <Button type="button" onClick={addProduct} size="sm">
                          <Plus className="h-4 w-4 mr-2" />
                          Add Product
                        </Button>
                      </div>

                      {selectedProducts.map((item, index) => (
                        <div key={index} className="grid grid-cols-12 gap-2 items-end">
                          <div className="col-span-5">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Product</label>
                            <Select 
                              value={item.productId.toString()} 
                              onValueChange={(value) => updateProduct(index, 'productId', parseInt(value))}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select product" />
                              </SelectTrigger>
                              <SelectContent>
                                {(products as Product[]).map((product: Product) => (
                                  <SelectItem key={product.id} value={product.id.toString()}>
                                    {product.name} - {formatCurrency(parseFloat(product.price))}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                            <Input
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) => updateProduct(index, 'quantity', parseInt(e.target.value))}
                            />
                          </div>
                          <div className="col-span-4">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Special Price (Optional)</label>
                            <Input
                              placeholder="Campaign price"
                              value={item.specialPrice || ''}
                              onChange={(e) => updateProduct(index, 'specialPrice', e.target.value)}
                            />
                          </div>
                          <div className="col-span-1">
                            <Button 
                              type="button" 
                              variant="outline" 
                              size="sm"
                              onClick={() => removeProduct(index)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </TabsContent>
                  </Tabs>
                </div>

                {/* Options */}
                <div className="space-y-3">
                  <h3 className="text-lg font-medium">Message Options</h3>
                  <div className="space-y-2">
                    <FormField
                      control={form.control}
                      name="includeContact"
                      render={({ field }) => (
                        <FormItem className="flex items-center space-x-2">
                          <FormControl>
                            <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                          <FormLabel>Include contact information</FormLabel>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="includePurchaseLink"
                      render={({ field }) => (
                        <FormItem className="flex items-center space-x-2">
                          <FormControl>
                            <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                          <FormLabel>Include purchase link</FormLabel>
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <div className="flex justify-end space-x-3">
                  <Button type="button" variant="outline" onClick={() => setIsCreateOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createCampaignMutation.isPending}>
                    {createCampaignMutation.isPending ? "Creating..." : "Create Campaign"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Campaigns Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {campaigns.map((campaign: Campaign) => (
          <Card key={campaign.id} className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between mb-2">
                <CardTitle className="text-lg font-semibold truncate">{campaign.title}</CardTitle>
                <Badge variant={campaign.status === 'active' ? 'default' : 'secondary'}>
                  {campaign.status}
                </Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <Badge variant={campaign.campaignType === 'single' ? 'outline' : 'default'}>
                  {campaign.campaignType === 'single' ? '1 Product' : `${campaign.products?.length || 0} Products`}
                </Badge>
                <span className="flex items-center text-gray-600">
                  <Send className="h-4 w-4 mr-1" />
                  {campaign.sentCampaigns.reduce((sum, c) => sum + c.recipientCount, 0)} sent
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center text-sm">
                <Package className="h-4 w-4 mr-2 text-gray-500" />
                <span className="text-gray-600">
                  {campaign.campaignType === 'single' ? campaign.product?.name : `${campaign.products?.length || 0} products included`}
                </span>
              </div>
              
              {campaign.sentCampaigns.length > 0 && (
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Total Sent:</span>
                    <div className="font-medium text-lg">{campaign.sentCampaigns.reduce((sum, c) => sum + c.recipientCount, 0)}</div>
                  </div>
                  <div>
                    <span className="text-gray-500">Stock Value:</span>
                    <div className="font-medium text-lg">{formatCurrency(
                      campaign.campaignType === 'single' 
                        ? (Number(campaign.product?.price) || 0) * (Number(campaign.product?.stock) || 0)
                        : campaign.products?.reduce((sum: number, p: any) => 
                            sum + ((Number(p.product?.price) || 0) * (Number(p.product?.stock) || 0)), 0) || 0
                    )}</div>
                  </div>
                </div>
              )}

              <div className="flex space-x-2">
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => {
                    setSelectedCampaign(campaign);
                    setIsPreviewOpen(true);
                  }}
                  className="flex-1"
                >
                  <Eye className="h-4 w-4 mr-1" />
                  Preview
                </Button>
                {campaign.sentCampaigns.length > 0 && (
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => {
                      setSelectedCampaign(campaign);
                      setIsStockRefreshOpen(true);
                    }}
                    className="flex-1 bg-orange-50 hover:bg-orange-100 text-orange-700 border-orange-200"
                  >
                    <RefreshCw className="h-4 w-4 mr-1" />
                    Stock Update
                  </Button>
                )}
                <Button 
                  size="sm" 
                  onClick={() => {
                    setSelectedCampaign(campaign);
                    setIsSendOpen(true);
                  }}
                  className="flex-1"
                >
                  <Send className="h-4 w-4 mr-1" />
                  {campaign.sentCampaigns.length > 0 ? 'Resend' : 'Send'}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {campaigns.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <MessageSquare className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Broadcast Campaigns</h3>
            <p className="text-gray-600 mb-4">
              Create your first WhatsApp broadcast to promote products and boost sales.
            </p>
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Your First Broadcast
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Preview Dialog */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Message Preview</DialogTitle>
          </DialogHeader>
          {selectedCampaign && (
            <div className="space-y-4">
              <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                <div className="flex items-center mb-2">
                  <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center mr-3">
                    <MessageSquare className="h-4 w-4 text-white" />
                  </div>
                  <span className="font-medium">WhatsApp Message Preview</span>
                </div>
                <div className="bg-white p-3 rounded-lg shadow-sm">
                  <pre className="whitespace-pre-wrap text-sm">{generatePreviewMessage(selectedCampaign)}</pre>
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={() => setIsPreviewOpen(false)}>Close</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Send Campaign Dialog */}
      <Dialog open={isSendOpen} onOpenChange={setIsSendOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Campaign</DialogTitle>
          </DialogHeader>
          {selectedCampaign && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Customer Group
                </label>
                <Select onValueChange={(value) => {
                  const groupId = parseInt(value);
                  sendCampaignMutation.mutate({
                    campaignId: selectedCampaign.id,
                    customerGroupId: groupId,
                  });
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose customer group to send to" />
                  </SelectTrigger>
                  <SelectContent>
                    {(customerGroups as CustomerGroup[]).map((group: CustomerGroup) => (
                      <SelectItem key={group.id} value={group.id.toString()}>
                        {group.name} ({group.description})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-sm text-blue-800">
                  This will send the "{selectedCampaign.title}" campaign to all members of the selected customer group.
                  Each customer will receive a personalized WhatsApp message with a unique purchase link.
                </p>
              </div>
              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setIsSendOpen(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Stock Refresh Dialog */}
      <Dialog open={isStockRefreshOpen} onOpenChange={setIsStockRefreshOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Stock Update</DialogTitle>
          </DialogHeader>
          {selectedCampaign && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Customer Group
                </label>
                <Select onValueChange={(value) => {
                  const groupId = parseInt(value);
                  stockRefreshMutation.mutate({
                    campaignId: selectedCampaign.id.toString(),
                    customerGroupId: groupId,
                  });
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose customer group for stock update" />
                  </SelectTrigger>
                  <SelectContent>
                    {(customerGroups as CustomerGroup[]).map((group: CustomerGroup) => (
                      <SelectItem key={group.id} value={group.id.toString()}>
                        {group.name} ({group.description})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="p-3 bg-orange-50 rounded-lg border border-orange-200">
                <div className="flex items-center mb-2">
                  <RefreshCw className="h-4 w-4 text-orange-600 mr-2" />
                  <span className="font-medium text-orange-800">Stock Update Message</span>
                </div>
                <p className="text-sm text-orange-800">
                  This will send a stock update for "{selectedCampaign.title}" with current pricing and availability to all members of the selected customer group.
                  The message will be clearly marked as a "Stock Update" with refreshed product information.
                </p>
              </div>
              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setIsStockRefreshOpen(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}