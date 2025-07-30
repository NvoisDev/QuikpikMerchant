import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Sparkles, Target, Users, TrendingUp, Clock, Package, MessageCircle, Send, Eye, BarChart3 } from 'lucide-react';
import { PersonalizedWhatsAppMessageGenerator, CustomerSegmentationEngine, CampaignPerformancePredictor, DEFAULT_CUSTOMER_SEGMENTS } from '@shared/personalized-campaigns';

interface PersonalizedCampaignCreatorProps {
  onCampaignCreated?: () => void;
}

interface Customer {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phoneNumber?: string;
  totalSpent?: number;
  orderCount?: number;
  lastOrderDate?: string;
  segment?: string;
}

interface Product {
  id: number;
  name: string;
  price: string;
  stock: number;
  image?: string;
}

interface PersonalizedOffer {
  customerId: string;
  productId: number;
  productName: string;
  originalPrice: number;
  offerType: 'percentage_discount' | 'fixed_discount' | 'fixed_price' | 'bogo' | 'bulk_discount';
  discountPercentage?: number;
  discountAmount?: number;
  fixedPrice?: number;
  buyQuantity?: number;
  getQuantity?: number;
  maxQuantity?: number;
  validUntil?: Date;
  reason?: string;
}

export default function PersonalizedCampaignCreator({ onCampaignCreated }: PersonalizedCampaignCreatorProps) {
  const [campaignData, setCampaignData] = useState({
    title: '',
    baseMessage: '',
    includeContact: true,
    includePurchaseLink: true,
    selectedCustomers: [] as string[],
    selectedProducts: [] as number[],
    segmentationStrategy: 'automatic'
  });
  
  const [personalizedOffers, setPersonalizedOffers] = useState<PersonalizedOffer[]>([]);
  const [campaignPreview, setCampaignPreview] = useState<string>('');
  const [currentStep, setCurrentStep] = useState(1);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch customers available for personalization
  const { data: customers = [], isLoading: loadingCustomers } = useQuery({
    queryKey: ['/api/personalized-campaigns/customers'],
    refetchOnWindowFocus: false,
  });

  // Fetch products
  const { data: products = [], isLoading: loadingProducts } = useQuery({
    queryKey: ['/api/products'],
    refetchOnWindowFocus: false,
  });

  // Create personalized offers mutation
  const createOffersMutation = useMutation({
    mutationFn: async (offerData: any) => {
      return apiRequest('POST', '/api/personalized-campaigns/offers', offerData);
    },
    onSuccess: () => {
      toast({
        title: "Offers Created",
        description: "Personalized offers have been generated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error Creating Offers",
        description: error.message || "Failed to create personalized offers",
        variant: "destructive",
      });
    },
  });

  // Create campaign recipients mutation
  const createCampaignMutation = useMutation({
    mutationFn: async (campaignData: any) => {
      return apiRequest('POST', '/api/personalized-campaigns/recipients', campaignData);
    },
    onSuccess: () => {
      toast({
        title: "Campaign Created",
        description: "Personalized campaign has been created successfully",
      });
      if (onCampaignCreated) {
        onCampaignCreated();
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error Creating Campaign",
        description: error.message || "Failed to create personalized campaign",
        variant: "destructive",
      });
    },
  });

  // Generate personalized offers
  const generateOffers = async () => {
    if (campaignData.selectedCustomers.length === 0 || campaignData.selectedProducts.length === 0) {
      toast({
        title: "Selection Required",
        description: "Please select customers and products to generate personalized offers",
        variant: "destructive",
      });
      return;
    }

    const offers: PersonalizedOffer[] = [];
    const campaignId = `campaign_${Date.now()}`;

    for (const customerId of campaignData.selectedCustomers) {
      const customer = customers.find((c: Customer) => c.id === customerId);
      if (!customer) continue;

      // Determine customer segment
      const segment = CustomerSegmentationEngine.analyzeCustomer(
        customer,
        [], // Recent orders would be fetched here
        {} // Customer preferences would be fetched here
      ) || DEFAULT_CUSTOMER_SEGMENTS[0];

      for (const productId of campaignData.selectedProducts) {
        const product = products.find((p: Product) => p.id === productId);
        if (!product) continue;

        // Generate personalized offer for this customer-product combination
        const offer: PersonalizedOffer = {
          customerId,
          productId,
          productName: product.name,
          originalPrice: parseFloat(product.price),
          offerType: segment.offerStrategy.primaryOfferType as any,
          discountPercentage: segment.offerStrategy.primaryOfferType === 'percentage_discount' 
            ? Math.floor(Math.random() * (segment.offerStrategy.discountRange.max - segment.offerStrategy.discountRange.min + 1)) + segment.offerStrategy.discountRange.min
            : undefined,
          maxQuantity: segment.offerStrategy.maxQuantityLimit,
          validUntil: new Date(Date.now() + (segment.offerStrategy.validityDays || 7) * 24 * 60 * 60 * 1000),
          reason: `Personalized for ${segment.name} - ${customer.firstName || 'customer'}`
        };

        offers.push(offer);
      }
    }

    setPersonalizedOffers(offers);
    setCurrentStep(3);

    // Generate campaign preview
    const sampleCustomer = customers[0];
    const sampleOffers = offers.filter(o => o.customerId === sampleCustomer?.id).slice(0, 3);
    
    const previewConfig = {
      campaignTitle: campaignData.title,
      baseMessage: campaignData.baseMessage,
      offers: sampleOffers,
      includeContact: campaignData.includeContact,
      includePurchaseLink: campaignData.includePurchaseLink
    };

    const preview = PersonalizedWhatsAppMessageGenerator.generateCampaignPreview(previewConfig, sampleCustomer);
    setCampaignPreview(preview);
  };

  // Send personalized campaign
  const sendCampaign = async () => {
    const campaignId = `personalized_${Date.now()}`;

    try {
      // Create offers in database
      for (const offer of personalizedOffers) {
        await createOffersMutation.mutateAsync({
          ...offer,
          campaignId,
          originalPrice: offer.originalPrice.toString(),
          promotionalPrice: offer.offerType === 'percentage_discount' 
            ? (offer.originalPrice * (1 - (offer.discountPercentage || 0) / 100)).toString()
            : offer.originalPrice.toString()
        });
      }

      // Create campaign recipients
      const customerOffers = campaignData.selectedCustomers.map(customerId => {
        const customer = customers.find((c: Customer) => c.id === customerId);
        const customerOffersList = personalizedOffers.filter(o => o.customerId === customerId);
        
        const personalizedMessage = PersonalizedWhatsAppMessageGenerator.generatePersonalizedBroadcast(
          {
            campaignTitle: campaignData.title,
            baseMessage: campaignData.baseMessage,
            offers: customerOffersList,
            includeContact: campaignData.includeContact,
            includePurchaseLink: campaignData.includePurchaseLink
          },
          customer,
          { id: 'current_user' } // Wholesaler data would be passed here
        );

        return {
          campaignId,
          customerId,
          personalizedMessage,
          customerName: customer?.firstName || 'Customer',
          totalOffersIncluded: customerOffersList.length,
          personalizationStrategy: 'automatic_segmentation'
        };
      });

      // Send to each recipient
      for (const recipient of customerOffers) {
        await createCampaignMutation.mutateAsync(recipient);
      }

      toast({
        title: "Campaign Sent Successfully!",
        description: `Personalized messages sent to ${campaignData.selectedCustomers.length} customers with ${personalizedOffers.length} total offers`,
      });

      // Reset form
      setCampaignData({
        title: '',
        baseMessage: '',
        includeContact: true,
        includePurchaseLink: true,
        selectedCustomers: [],
        selectedProducts: [],
        segmentationStrategy: 'automatic'
      });
      setPersonalizedOffers([]);
      setCampaignPreview('');
      setCurrentStep(1);

    } catch (error) {
      console.error('Error sending personalized campaign:', error);
      toast({
        title: "Campaign Failed",
        description: "Failed to send personalized campaign. Please try again.",
        variant: "destructive",
      });
    }
  };

  if (loadingCustomers || loadingProducts) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
            <p>Loading personalization data...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Personalized Campaign Creator
          </CardTitle>
          <div className="flex items-center gap-4">
            <Progress value={(currentStep / 4) * 100} className="flex-1" />
            <span className="text-sm text-muted-foreground">Step {currentStep} of 4</span>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={currentStep.toString()} className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="1" disabled={currentStep < 1}>Setup</TabsTrigger>
              <TabsTrigger value="2" disabled={currentStep < 2}>Selection</TabsTrigger>
              <TabsTrigger value="3" disabled={currentStep < 3}>Preview</TabsTrigger>
              <TabsTrigger value="4" disabled={currentStep < 4}>Send</TabsTrigger>
            </TabsList>

            <TabsContent value="1" className="mt-6 space-y-4">
              <div className="grid gap-4">
                <div>
                  <Label htmlFor="title">Campaign Title</Label>
                  <Input
                    id="title"
                    placeholder="Enter campaign title..."
                    value={campaignData.title}
                    onChange={(e) => setCampaignData(prev => ({ ...prev, title: e.target.value }))}
                  />
                </div>
                
                <div>
                  <Label htmlFor="message">Base Message</Label>
                  <Textarea
                    id="message"
                    placeholder="Enter your base campaign message..."
                    value={campaignData.baseMessage}
                    onChange={(e) => setCampaignData(prev => ({ ...prev, baseMessage: e.target.value }))}
                    rows={4}
                  />
                  <p className="text-sm text-muted-foreground mt-1">
                    This message will be personalized for each customer with their specific offers
                  </p>
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="include-contact"
                        checked={campaignData.includeContact}
                        onCheckedChange={(checked) => setCampaignData(prev => ({ ...prev, includeContact: checked }))}
                      />
                      <Label htmlFor="include-contact">Include contact information</Label>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="include-link"
                        checked={campaignData.includePurchaseLink}
                        onCheckedChange={(checked) => setCampaignData(prev => ({ ...prev, includePurchaseLink: checked }))}
                      />
                      <Label htmlFor="include-link">Include purchase links</Label>
                    </div>
                  </div>
                </div>

                <Button 
                  onClick={() => setCurrentStep(2)}
                  disabled={!campaignData.title || !campaignData.baseMessage}
                  className="w-full"
                >
                  Next: Select Recipients <Users className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="2" className="mt-6 space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      Select Customers ({campaignData.selectedCustomers.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="max-h-64 overflow-y-auto">
                    <div className="space-y-2">
                      {customers.map((customer: Customer) => (
                        <div
                          key={customer.id}
                          className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                            campaignData.selectedCustomers.includes(customer.id)
                              ? 'border-primary bg-primary/5'
                              : 'border-border hover:border-primary/50'
                          }`}
                          onClick={() => {
                            setCampaignData(prev => ({
                              ...prev,
                              selectedCustomers: prev.selectedCustomers.includes(customer.id)
                                ? prev.selectedCustomers.filter(id => id !== customer.id)
                                : [...prev.selectedCustomers, customer.id]
                            }));
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium">{customer.firstName} {customer.lastName}</p>
                              <p className="text-sm text-muted-foreground">{customer.email}</p>
                            </div>
                            {customer.segment && (
                              <Badge variant="secondary" className="text-xs">
                                {customer.segment}
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Package className="h-5 w-5" />
                      Select Products ({campaignData.selectedProducts.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="max-h-64 overflow-y-auto">
                    <div className="space-y-2">
                      {products.map((product: Product) => (
                        <div
                          key={product.id}
                          className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                            campaignData.selectedProducts.includes(product.id)
                              ? 'border-primary bg-primary/5'
                              : 'border-border hover:border-primary/50'
                          }`}
                          onClick={() => {
                            setCampaignData(prev => ({
                              ...prev,
                              selectedProducts: prev.selectedProducts.includes(product.id)
                                ? prev.selectedProducts.filter(id => id !== product.id)
                                : [...prev.selectedProducts, product.id]
                            }));
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium">{product.name}</p>
                              <p className="text-sm text-muted-foreground">£{product.price}</p>
                            </div>
                            <Badge variant="outline" className="text-xs">
                              {product.stock} in stock
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setCurrentStep(1)}>
                  Back
                </Button>
                <Button 
                  onClick={generateOffers}
                  disabled={campaignData.selectedCustomers.length === 0 || campaignData.selectedProducts.length === 0}
                  className="flex-1"
                >
                  Generate Personalized Offers <Target className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="3" className="mt-6 space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Eye className="h-5 w-5" />
                      Campaign Preview
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="bg-muted p-4 rounded-lg">
                      <pre className="whitespace-pre-wrap text-sm">{campaignPreview}</pre>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <BarChart3 className="h-5 w-5" />
                      Campaign Statistics
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4 text-center">
                      <div>
                        <p className="text-2xl font-bold text-primary">{personalizedOffers.length}</p>
                        <p className="text-sm text-muted-foreground">Total Offers</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-primary">{campaignData.selectedCustomers.length}</p>
                        <p className="text-sm text-muted-foreground">Recipients</p>
                      </div>
                    </div>
                    
                    <Separator />
                    
                    <div>
                      <p className="text-sm font-medium mb-2">Offer Types Distribution</p>
                      <div className="space-y-2">
                        {Object.entries(
                          personalizedOffers.reduce((acc, offer) => {
                            acc[offer.offerType] = (acc[offer.offerType] || 0) + 1;
                            return acc;
                          }, {} as Record<string, number>)
                        ).map(([type, count]) => (
                          <div key={type} className="flex justify-between text-sm">
                            <span className="capitalize">{type.replace('_', ' ')}</span>
                            <Badge variant="secondary">{count}</Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setCurrentStep(2)}>
                  Back to Selection
                </Button>
                <Button onClick={() => setCurrentStep(4)} className="flex-1">
                  Review & Send <Send className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="4" className="mt-6 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Send className="h-5 w-5" />
                    Ready to Send Campaign
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-primary/5 p-4 rounded-lg">
                    <h4 className="font-medium mb-2">Campaign Summary:</h4>
                    <ul className="space-y-1 text-sm text-muted-foreground">
                      <li>• {campaignData.selectedCustomers.length} personalized recipients</li>
                      <li>• {personalizedOffers.length} unique promotional offers</li>
                      <li>• {campaignData.selectedProducts.length} featured products</li>
                      <li>• Includes contact info: {campaignData.includeContact ? 'Yes' : 'No'}</li>
                      <li>• Includes purchase links: {campaignData.includePurchaseLink ? 'Yes' : 'No'}</li>
                    </ul>
                  </div>

                  <div className="flex gap-3">
                    <Button variant="outline" onClick={() => setCurrentStep(3)}>
                      Back to Preview
                    </Button>
                    <Button
                      onClick={sendCampaign}
                      disabled={createOffersMutation.isPending || createCampaignMutation.isPending}
                      className="flex-1 bg-primary hover:bg-primary/90"
                    >
                      {createOffersMutation.isPending || createCampaignMutation.isPending ? (
                        <>Sending Campaign...</>
                      ) : (
                        <>Send Personalized Campaign <MessageCircle className="ml-2 h-4 w-4" /></>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}