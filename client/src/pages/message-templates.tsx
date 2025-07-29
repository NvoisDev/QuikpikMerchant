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
  ExternalLink,
  BarChart3,
  Calendar,
  CheckCircle,
  XCircle,
  Clock
} from "lucide-react";
import type { Product, CustomerGroup } from "@shared/schema";

const templateFormSchema = z.object({
  name: z.string().min(1, "Template name is required"),
  title: z.string().min(1, "Campaign title is required"),
  description: z.string().optional(),
  customMessage: z.string().optional(),
  includeContact: z.boolean().default(true),
  includePurchaseLink: z.boolean().default(true),
  products: z.array(z.object({
    productId: z.number(),
    quantity: z.number().min(1),
    specialPrice: z.string().optional(),
  })).min(1, "At least one product is required"),
});

type TemplateFormData = z.infer<typeof templateFormSchema>;

interface MessageTemplate {
  id: number;
  name: string;
  title: string;
  description?: string;
  customMessage?: string;
  includeContact: boolean;
  includePurchaseLink: boolean;
  status: string;
  createdAt: string;
  products: Array<{
    id: number;
    productId: number;
    quantity: number;
    specialPrice?: string;
    product: Product;
  }>;
  campaigns: Array<{
    id: number;
    sentAt?: string;
    recipientCount: number;
    clickCount: number;
    orderCount: number;
    totalRevenue: string;
    customerGroup: CustomerGroup;
  }>;
}

interface TemplateCampaign {
  id: number;
  templateId: number;
  customerGroupId: number;
  campaignUrl: string;
  sentAt?: string;
  status: string;
  recipientCount: number;
  clickCount: number;
  orderCount: number;
  totalRevenue: string;
  template: {
    name: string;
    title: string;
  };
  customerGroup: CustomerGroup;
}

export default function MessageTemplates() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selectedTemplate, setSelectedTemplate] = useState<MessageTemplate | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isCampaignOpen, setIsCampaignOpen] = useState(false);
  const [selectedProducts, setSelectedProducts] = useState<Array<{productId: number; quantity: number; specialPrice?: string}>>([]);

  // Fetch message templates
  const { data: templates = [], isLoading: templatesLoading } = useQuery({
    queryKey: ["/api/message-templates"],
  });

  // Fetch products for template creation
  const { data: products = [] } = useQuery({
    queryKey: ["/api/products"],
  });

  // Fetch customer groups for campaign sending
  const { data: customerGroups = [] } = useQuery({
    queryKey: ["/api/customer-groups"],
  });

  const form = useForm<TemplateFormData>({
    resolver: zodResolver(templateFormSchema),
    defaultValues: {
      name: "",
      title: "",
      description: "",
      customMessage: "",
      includeContact: true,
      includePurchaseLink: true,
      products: [],
    },
  });

  // Create template mutation
  const createTemplateMutation = useMutation({
    mutationFn: async (data: TemplateFormData) => {
      const response = await apiRequest("POST", "/api/message-templates", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/message-templates"] });
      setIsCreateOpen(false);
      form.reset();
      setSelectedProducts([]);
      toast({
        title: "Template Created",
        description: "Your message template has been created successfully!",
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
    mutationFn: async ({ templateId, customerGroupId }: { templateId: number; customerGroupId: number }) => {
      const response = await apiRequest("POST", "/api/message-templates/send-campaign", {
        templateId,
        customerGroupId,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/message-templates"] });
      setIsCampaignOpen(false);
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

  const addProduct = () => {
    setSelectedProducts([...selectedProducts, { productId: 0, quantity: 1 }]);
  };

  const removeProduct = (index: number) => {
    setSelectedProducts(selectedProducts.filter((_, i) => i !== index));
  };

  const updateProduct = (index: number, field: string, value: any) => {
    const updated = [...selectedProducts];
    updated[index] = { ...updated[index], [field]: value };
    setSelectedProducts(updated);
  };

  const generatePreviewMessage = (template: MessageTemplate) => {
    const businessName = user?.businessName || "Your Business";
    const phone = user?.businessPhone || user?.phoneNumber || "+1234567890";
    const campaignUrl = "https://quikpik.co/campaign/abc123";

    let message = `🛍️ *${template.title}*\n\n`;
    
    if (template.customMessage) {
      message += `${template.customMessage}\n\n`;
    }

    message += `📦 *Featured Products:*\n`;
    
    (template.products || []).forEach((item, index) => {
      const price = item.specialPrice || item.product.price;
      message += `${index + 1}. *${item.product.name}*\n`;
      message += `   💰 ${formatCurrency(parseFloat(price))} (MOQ: ${item.product.moq})\n`;
      message += `   📋 Suggested Qty: ${item.quantity}\n\n`;
    });

    if (template.includePurchaseLink) {
      message += `🛒 *Order Now:* ${campaignUrl}\n\n`;
    }

    if (template.includeContact) {
      message += `📞 Questions? Contact us:\n`;
      message += `*${businessName}*\n`;
      message += `📱 ${phone}\n`;
    }

    message += `\n✨ _Powered by Quikpik Merchant_`;

    return message;
  };

  const onSubmit = (data: TemplateFormData) => {
    const formData = {
      ...data,
      products: selectedProducts.filter(p => p.productId > 0),
    };
    createTemplateMutation.mutate(formData);
  };

  if (templatesLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex flex-col items-center space-y-4">
          {/* Enhanced Loading Animation */}
          <div className="flex space-x-1">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="w-3 h-8 bg-gradient-to-t from-blue-400 to-indigo-500 rounded-full animate-bounce"
                style={{
                  animationDelay: `${i * 0.2}s`,
                  animationDuration: '1.3s'
                }}
              />
            ))}
          </div>
          <p className="text-sm text-gray-500 text-center">Loading message templates...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Message Templates</h1>
          <p className="text-gray-600 mt-1">Create multi-product sales campaigns for WhatsApp marketing</p>
        </div>
        <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
          <DialogTrigger asChild>
            <Button className="flex items-center space-x-2">
              <Plus className="h-4 w-4" />
              <span>Create Template</span>
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Message Template</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Template Name</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="e.g., Weekend Special Offer" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
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
                </div>

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description (Optional)</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Internal description for this template" />
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
                          placeholder="Add a personal message at the beginning of the campaign..."
                          rows={3}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Products Section */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-lg font-medium">Products</h3>
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
                            {products.map((product: Product) => (
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
                  <Button type="submit" disabled={createTemplateMutation.isPending}>
                    {createTemplateMutation.isPending ? "Creating..." : "Create Template"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Templates Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {templates.map((template: MessageTemplate) => (
          <Card key={template.id} className="hover:shadow-md transition-shadow">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="truncate">{template.name}</span>
                <Badge variant={template.status === 'active' ? 'default' : 'secondary'}>
                  {template.status}
                </Badge>
              </CardTitle>
              <p className="text-sm text-gray-600">{template.title}</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center text-gray-600">
                  <Package className="h-4 w-4 mr-1" />
                  {(template.products || []).length} products
                </span>
                <span className="flex items-center text-gray-600">
                  <Send className="h-4 w-4 mr-1" />
                  {(template.campaigns || []).length} campaigns
                </span>
              </div>
              
              {(template.campaigns || []).length > 0 && (
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-gray-500">Total Sent:</span>
                    <div className="font-medium">{(template.campaigns || []).reduce((sum, c) => sum + c.recipientCount, 0)}</div>
                  </div>
                  <div>
                    <span className="text-gray-500">Revenue:</span>
                    <div className="font-medium">{formatCurrency((template.campaigns || []).reduce((sum, c) => sum + parseFloat(c.totalRevenue), 0))}</div>
                  </div>
                </div>
              )}

              <div className="flex space-x-2">
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => {
                    setSelectedTemplate(template);
                    setIsPreviewOpen(true);
                  }}
                  className="flex-1"
                >
                  <Eye className="h-4 w-4 mr-1" />
                  Preview
                </Button>
                <Button 
                  size="sm" 
                  onClick={() => {
                    setSelectedTemplate(template);
                    setIsCampaignOpen(true);
                  }}
                  className="flex-1"
                >
                  <Send className="h-4 w-4 mr-1" />
                  Send
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {templates.length === 0 && (
        <Card>
          <CardContent className="p-12 text-center">
            <MessageSquare className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Message Templates</h3>
            <p className="text-gray-600 mb-4">
              Create your first multi-product sales campaign template to start marketing to customers.
            </p>
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Your First Template
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
          {selectedTemplate && (
            <div className="space-y-4">
              <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                <div className="flex items-center mb-2">
                  <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center mr-3">
                    <MessageSquare className="h-4 w-4 text-white" />
                  </div>
                  <span className="font-medium">WhatsApp Message Preview</span>
                </div>
                <div className="bg-white p-3 rounded-lg shadow-sm">
                  <pre className="whitespace-pre-wrap text-sm">{generatePreviewMessage(selectedTemplate)}</pre>
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
      <Dialog open={isCampaignOpen} onOpenChange={setIsCampaignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Campaign</DialogTitle>
          </DialogHeader>
          {selectedTemplate && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Customer Group
                </label>
                <Select onValueChange={(value) => {
                  const groupId = parseInt(value);
                  sendCampaignMutation.mutate({
                    templateId: selectedTemplate.id,
                    customerGroupId: groupId,
                  });
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose customer group to send to" />
                  </SelectTrigger>
                  <SelectContent>
                    {customerGroups.map((group: CustomerGroup) => (
                      <SelectItem key={group.id} value={group.id.toString()}>
                        {group.name} ({group.description})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-sm text-blue-800">
                  This will send the "{selectedTemplate.title}" campaign to all members of the selected customer group.
                  Each customer will receive a personalized WhatsApp message with a unique purchase link.
                </p>
              </div>
              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setIsCampaignOpen(false)}>
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