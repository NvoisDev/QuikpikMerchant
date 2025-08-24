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
import { formatNumber } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DynamicTooltip } from "@/components/ui/dynamic-tooltip";
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
  Clock,
  Tag,
  Percent,
  TrendingUp,
  AlertTriangle,
  Gift,
  Zap,
  Star,
  Target
} from "lucide-react";
import { ContextualHelpBubble } from "@/components/ContextualHelpBubble";
import { helpContent } from "@/data/whatsapp-help-content";
import { SubscriptionUpgradeModal } from "@/components/SubscriptionUpgradeModal";
import { WhatsAppSetupAlert, WhatsAppStatusIndicator } from "@/components/WhatsAppSetupAlert";
import { useSubscription } from "@/hooks/useSubscription";
import { PromotionalOffersManager } from "@/components/PromotionalOffersManager";
import { PromotionalPricingCalculator } from "@shared/promotional-pricing";
import { getCampaignOfferIndicators, formatPromotionalOffersWithEmojis } from "@shared/promotional-offer-utils";
import type { Product, CustomerGroup, PromotionalOffer, PromotionalOfferType } from "@shared/schema";

const campaignFormSchema = z.object({
  title: z.string().min(1, "Campaign title is required"),
  customMessage: z.string().optional(),
  includeContact: z.boolean().default(true),
  includePurchaseLink: z.boolean().default(true),
  campaignType: z.enum(['single', 'multi']),
  // For single product campaigns
  productId: z.number().optional(),
  quantity: z.number().optional(),
  specialPrice: z.string().optional(),
  promotionalOffers: z.array(z.object({
    id: z.string(),
    name: z.string(),
    type: z.string(),
    isActive: z.boolean(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    discountPercentage: z.number().optional(),
    discountAmount: z.number().optional(),
    fixedPrice: z.number().optional(),
    buyQuantity: z.number().optional(),
    getQuantity: z.number().optional(),
    minQuantity: z.number().optional(),
    maxQuantity: z.number().optional(),
    bulkTiers: z.array(z.object({
      minQuantity: z.number(),
      discountPercentage: z.number(),
      discountAmount: z.number().optional(),
    })).optional(),
    bundleProducts: z.array(z.number()).optional(),
    bundlePrice: z.number().optional(),
    maxUses: z.number().optional(),
    usesCount: z.number().optional(),
    maxUsesPerCustomer: z.number().optional(),
    description: z.string().optional(),
    termsAndConditions: z.string().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })).optional(),
  // For multi-product campaigns
  products: z.array(z.object({
    productId: z.number(),
    quantity: z.number().min(1),
    specialPrice: z.string().optional(),
    promotionalOffers: z.array(z.object({
      id: z.string(),
      name: z.string(),
      type: z.string(),
      isActive: z.boolean(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
      discountPercentage: z.number().optional(),
      discountAmount: z.number().optional(),
      fixedPrice: z.number().optional(),
      buyQuantity: z.number().optional(),
      getQuantity: z.number().optional(),
      minQuantity: z.number().optional(),
      maxQuantity: z.number().optional(),
      bulkTiers: z.array(z.object({
        minQuantity: z.number(),
        discountPercentage: z.number(),
        discountAmount: z.number().optional(),
      })).optional(),
      bundleProducts: z.array(z.number()).optional(),
      bundlePrice: z.number().optional(),
      maxUses: z.number().optional(),
      usesCount: z.number().optional(),
      maxUsesPerCustomer: z.number().optional(),
      description: z.string().optional(),
      termsAndConditions: z.string().optional(),
      createdAt: z.string(),
      updatedAt: z.string(),
    })).optional(),
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
  specialPrice?: string;
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

// Helper functions for promotional offers
const hasPromotionalOffers = (campaign: Campaign) => {
  if (campaign.campaignType === 'single') {
    // Check if single product has promotional offers
    return campaign.promotionalOffers && campaign.promotionalOffers.length > 0;
  } else {
    // Check if any products in multi-product campaign have promotional offers
    return campaign.products?.some((productItem: any) => 
      productItem.promotionalOffers && productItem.promotionalOffers.length > 0
    ) || false;
  }
};

const getAllPromotionalOffers = (campaign: Campaign): any[] => {
  if (campaign.campaignType === 'single') {
    return campaign.promotionalOffers || [];
  } else {
    const allOffers: any[] = [];
    campaign.products?.forEach((productItem: any) => {
      if (productItem.promotionalOffers) {
        allOffers.push(...productItem.promotionalOffers);
      }
    });
    return allOffers;
  }
};

export default function Campaigns() {
  // Helper function to calculate promotional pricing for products
  const calculatePromotionalPricing = (product: Product, quantity: number = 1) => {
    const basePrice = parseFloat(product.price) || 0;
    return PromotionalPricingCalculator.calculatePromotionalPricing(
      basePrice,
      quantity,
      product.promotionalOffers || [],
      product.promoPrice ? parseFloat(product.promoPrice) : undefined,
      product.promoActive
    );
  };

  // Helper function to check if product has existing promotional offers
  const getProductExistingOffers = (productId: number) => {
    const product = (products as Product[])?.find(p => p.id === productId);
    if (!product) return { hasOffers: false, offers: [], campaigns: [] };
    
    const hasOffers = product.promotionalOffers && product.promotionalOffers.length > 0;
    const offers = product.promotionalOffers || [];
    
    // Find campaigns that might be using this product
    const relatedCampaigns = (campaigns as Campaign[])?.filter(campaign => {
      if (campaign.campaignType === 'single') {
        return campaign.product?.id === productId;
      } else {
        return campaign.products?.some(p => p.productId === productId);
      }
    }) || [];
    
    return { hasOffers, offers, campaigns: relatedCampaigns };
  };
  const { user } = useAuth();
  const { toast } = useToast();
  const { subscription, isLoading: subscriptionLoading } = useSubscription();
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isSendOpen, setIsSendOpen] = useState(false);
  const [isStockRefreshOpen, setIsStockRefreshOpen] = useState(false);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [campaignType, setCampaignType] = useState<'single' | 'multi'>('single');
  const [selectedProducts, setSelectedProducts] = useState<Array<{productId: number; quantity: number; specialPrice?: string; promotionalOffers?: PromotionalOffer[]}>>([]);
  const [editableMessage, setEditableMessage] = useState<string>("");
  const [isEditingMessage, setIsEditingMessage] = useState<boolean>(false);
  const [singleProductOffers, setSingleProductOffers] = useState<PromotionalOffer[]>([]);
  const [activeTab, setActiveTab] = useState<'campaigns'>('campaigns');

  // Fetch campaigns (unified broadcasts and templates)
  const { data: campaigns = [], isLoading: campaignsLoading, refetch: refetchCampaigns } = useQuery({
    queryKey: ["/api/campaigns"],
    staleTime: 0, // Force fresh data
    gcTime: 0, // Don't cache
  });

  // Fetch products for campaign creation
  const { data: products = [] } = useQuery({
    queryKey: ["/api/products"],
  });

  // Fetch customer groups for campaign sending
  const { data: customerGroups = [] } = useQuery({
    queryKey: ["/api/customer-groups"],
  });

  // Check WhatsApp connection status
  const { data: whatsappStatus } = useQuery({
    queryKey: ["/api/whatsapp/status"],
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  const form = useForm<CampaignFormData>({
    resolver: zodResolver(campaignFormSchema),
    defaultValues: {
      title: "",
      customMessage: "",
      includeContact: true,
      includePurchaseLink: true,
      campaignType: 'single',
      quantity: 1,
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

  // Edit campaign mutation
  const editCampaignMutation = useMutation({
    mutationFn: async (data: CampaignFormData & { id: string }) => {
      const campaignData = {
        ...data,
        products: data.campaignType === 'multi' ? selectedProducts.filter(p => p.productId > 0) : undefined
      };
      const response = await apiRequest("PUT", `/api/campaigns/${data.id}`, campaignData);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      setIsEditOpen(false);
      setEditingCampaign(null);
      form.reset();
      setSelectedProducts([]);
      toast({
        title: "Campaign Updated",
        description: "Your marketing campaign has been updated successfully!",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
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
        customMessage: editableMessage || undefined, // Include edited message if exists
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Campaign send failed");
      }
      
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
    onError: async (error: any, variables) => {
      // Handle broadcast limit exceeded error
      if (error.message && error.message.includes("broadcast limit")) {
        setIsSendOpen(false);
        setIsUpgradeModalOpen(true);
        toast({
          title: "Broadcast Limit Reached",
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Campaign Failed",
          description: error.message,
          variant: "destructive",
        });
      }
    },
  });

  // Stock refresh mutation
  const stockRefreshMutation = useMutation({
    mutationFn: async ({ campaignId }: { campaignId: string }) => {
      const response = await apiRequest("POST", `/api/campaigns/${campaignId}/refresh-stock`, {});
      return response.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      setIsStockRefreshOpen(false);
      toast({
        title: "Stock Information Refreshed",
        description: data.message || "Stock counts and pricing updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Stock Refresh Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete campaign mutation
  const deleteCampaignMutation = useMutation({
    mutationFn: async (campaignId: string) => {
      const response = await apiRequest("DELETE", `/api/campaigns/${campaignId}`, {});
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/campaigns"] });
      toast({
        title: "Campaign Deleted",
        description: "Campaign has been permanently removed",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Delete Failed",
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
      // When product is selected, set quantity to stock amount and populate existing offers
      const selectedProduct = (products as Product[]).find(p => p.id === parseInt(value));
      const existingOffers = getProductExistingOffers(parseInt(value));
      
      updated[index] = { 
        ...updated[index], 
        [field]: value,
        quantity: selectedProduct?.stock || 1,
        promotionalOffers: existingOffers.offers || []
      };
    } else {
      updated[index] = { ...updated[index], [field]: value };
    }
    
    setSelectedProducts(updated);
  };



  // Helper function to generate promotional offers messaging
  const generatePromotionalOffersMessage = (promotionalOffers: any[], currencySymbol: string = '£'): string => {
    if (!promotionalOffers || promotionalOffers.length === 0) {
      return '';
    }

    let promoMessage = '\n\n🎉 *SPECIAL OFFERS ACTIVE:*';
    
    promotionalOffers.forEach((offer, index) => {
      switch (offer.type) {
        case 'percentage_discount':
          const percentageDiscount = offer.value || offer.discountPercentage;
          promoMessage += `\n💥 ${percentageDiscount}% OFF - Save big on your order!`;
          break;
        case 'fixed_discount':
        case 'fixed_amount_discount':
          const fixedDiscount = offer.value || offer.discountAmount;
          promoMessage += `\n💥 ${currencySymbol}${fixedDiscount} OFF each unit - Instant savings!`;
          break;
        case 'fixed_price':
          promoMessage += `\n🔥 SPECIAL PRICE: Only ${currencySymbol}${offer.fixedPrice} each!`;
          break;
        case 'bogo':
        case 'buy_x_get_y_free':
          promoMessage += `\n🎁 AMAZING DEAL: Buy ${offer.buyQuantity}, Get ${offer.getQuantity} FREE!`;
          break;
        case 'multi_buy':
          promoMessage += `\n📦 BULK DISCOUNT: Buy ${offer.quantity}+ and get ${offer.discountType === 'percentage' ? `${offer.discountValue}% OFF` : `${currencySymbol}${offer.discountValue} OFF`} each!`;
          break;
        case 'bulk_tier':
          promoMessage += `\n📊 WHOLESALE PRICING: ${offer.quantity}+ units = ${currencySymbol}${offer.pricePerUnit} each!`;
          break;
        case 'bulk_discount':
          if (offer.bulkTiers && offer.bulkTiers.length > 0) {
            const firstTier = offer.bulkTiers[0];
            if (firstTier.pricePerUnit) {
              promoMessage += `\n📊 TIERED PRICING: Starting from ${currencySymbol}${firstTier.pricePerUnit} each!`;
            } else if (firstTier.discountPercentage) {
              promoMessage += `\n📊 BULK SAVINGS: Up to ${firstTier.discountPercentage}% OFF on bulk orders!`;
            } else if (firstTier.discountAmount) {
              promoMessage += `\n📊 BULK SAVINGS: Up to ${currencySymbol}${firstTier.discountAmount} OFF each!`;
            }
          }
          break;
        case 'free_shipping':
          promoMessage += `\n🚚 FREE DELIVERY on orders over ${currencySymbol}${offer.minimumOrderValue}!`;
          break;
        case 'bundle_deal':
          if (offer.bundlePrice) {
            promoMessage += `\n🎁 BUNDLE SPECIAL: ${currencySymbol}${offer.bundlePrice} each when bought together!`;
          } else if (offer.discountType === 'percentage' && offer.discountValue) {
            promoMessage += `\n🎁 BUNDLE DEAL: Save ${offer.discountValue}% when buying together!`;
          } else if (offer.discountType === 'fixed' && offer.discountValue) {
            promoMessage += `\n🎁 BUNDLE DEAL: Save ${currencySymbol}${offer.discountValue} each when buying together!`;
          }
          break;
        default:
          if (offer.name) {
            promoMessage += `\n✨ ${offer.name} - Special offer available!`;
          }
          break;
      }
    });

    promoMessage += `\n⏰ *Limited time offer - Order now!*`;
    return promoMessage;
  };

  const generatePreviewMessage = (campaign: Campaign) => {
    const businessName = user?.businessName || "Your Business";
    const phone = user?.businessPhone || user?.phoneNumber || "+1234567890";
    const baseUrl = window.location.origin;
    const customerPortalUrl = `${baseUrl}/customer/${user?.id}`;
    const currencySymbol = user?.defaultCurrency === 'GBP' ? '£' : user?.defaultCurrency === 'EUR' ? '€' : '$';

    let message = `🛍️ *${campaign.title}*\n\n`;
    
    if (campaign.customMessage) {
      message += `${campaign.customMessage}\n\n`;
    }

    if (campaign.campaignType === 'single' && campaign.product) {
      message += `📦 *Featured Products:*\n\n`;
      
      // Use special price if provided, otherwise use promotional price if active, otherwise use regular price
      const basePrice = campaign.specialPrice ? parseFloat(campaign.specialPrice) : parseFloat(campaign.product.price) || 0;
      const promoPrice = campaign.product.promoPrice ? parseFloat(campaign.product.promoPrice) : undefined;
      
      // Calculate promotional pricing using the same logic as backend
      const promotionalOffers = (campaign as any).promotionalOffers || [];
      const pricing = PromotionalPricingCalculator.calculatePromotionalPricing(
        basePrice,
        1,
        promotionalOffers,
        promoPrice,
        campaign.product.promoActive
      );
      
      // Format price display with promotional pricing
      const hasPromotion = pricing.effectivePrice < pricing.originalPrice;
      const priceDisplay = hasPromotion 
        ? `${currencySymbol}${pricing.effectivePrice.toFixed(2)} ~~${currencySymbol}${pricing.originalPrice.toFixed(2)}~~ 🔥PROMO🔥`
        : `${currencySymbol}${pricing.originalPrice.toFixed(2)}`;
      
      message += `1. ${campaign.product.name}${hasPromotion ? ' 🔥' : ''}\n`;
      message += `   💰 Unit Price: ${priceDisplay}\n`;
      
      // Add negotiation information if enabled
      if (campaign.product.negotiationEnabled) {
        message += `   💬 Price Negotiable - Request Custom Quote Available!\n`;
        if (campaign.product.minimumBidPrice) {
          message += `   💡 Minimum acceptable price: ${formatCurrency(parseFloat(campaign.product.minimumBidPrice))}\n`;
        }
      }
      
      message += `   📦 MOQ: ${formatNumber(campaign.product.moq)} units\n`;
      message += `   📦 In Stock: ${formatNumber(campaign.product.stock)} packs available\n`;
      
      // Add promotional offers for single product campaigns
      const promoMessaging = generatePromotionalOffersMessage(promotionalOffers, currencySymbol);
      if (promoMessaging) {
        message += `   ${promoMessaging.replace(/\n/g, '\n   ')}\n`;
      }
      
    } else if (campaign.campaignType === 'multi' && campaign.products) {
      message += `📦 *Featured Products:*\n\n`;
      campaign.products.forEach((item, index) => {
        const basePrice = item.specialPrice ? parseFloat(item.specialPrice) : parseFloat(item.product.price) || 0;
        const promoPrice = item.product.promoPrice ? parseFloat(item.product.promoPrice) : undefined;
        
        // Calculate promotional pricing for this product
        const promotionalOffers = item.promotionalOffers || [];
        const pricing = PromotionalPricingCalculator.calculatePromotionalPricing(
          basePrice,
          1,
          promotionalOffers,
          promoPrice,
          item.product.promoActive
        );
        
        // Format price display with promotional pricing
        const hasPromotion = pricing.effectivePrice < pricing.originalPrice;
        const priceDisplay = hasPromotion 
          ? `${currencySymbol}${pricing.effectivePrice.toFixed(2)} ~~${currencySymbol}${pricing.originalPrice.toFixed(2)}~~ 🔥PROMO🔥`
          : `${currencySymbol}${pricing.originalPrice.toFixed(2)}`;
        
        message += `${index + 1}. ${item.product.name}${hasPromotion ? ' 🔥' : ''}\n`;
        message += `   💰 Unit Price: ${priceDisplay}\n`;
        
        // Add negotiation information if enabled
        if (item.product.negotiationEnabled) {
          message += `   💬 Price Negotiable - Request Custom Quote Available!\n`;
          if (item.product.minimumBidPrice) {
            message += `   💡 Minimum acceptable price: ${formatCurrency(parseFloat(item.product.minimumBidPrice))}\n`;
          }
        }
        
        message += `   📦 MOQ: ${formatNumber(item.product.moq)} units\n`;
        message += `   📦 In Stock: ${formatNumber(item.product.stock)} packs available\n`;
        
        // Add promotional offers for this product
        const promoMessaging = generatePromotionalOffersMessage(promotionalOffers, currencySymbol);
        if (promoMessaging) {
          message += `   ${promoMessaging.replace(/\n/g, '\n   ')}\n`;
        }
      });
    }

    if (campaign.includePurchaseLink) {
      message += `🛒 *Place Your Order Now:*\n${customerPortalUrl}`;
      if (campaign.campaignType === 'single' && campaign.product) {
        // For single product campaigns, add featured product parameter
        message = message.replace(customerPortalUrl, `${customerPortalUrl}?featured=${campaign.product.id}`);
      }
      message += `\n\n`;
    }

    if (campaign.includeContact) {
      message += `📞 *Questions or Bulk Orders?*\n${businessName}\n📱 ${phone}\n\n`;
    }

    message += `✨ This update was powered by Quikpik Merchant`;

    return message;
  };

  const onSubmit = (data: CampaignFormData) => {
    const payload = {
      ...data,
      campaignType,
      promotionalOffers: campaignType === 'single' ? singleProductOffers : undefined,
      products: campaignType === 'multi' ? selectedProducts.filter(p => p.productId > 0) : undefined
    };

    if (editingCampaign) {
      editCampaignMutation.mutate({
        ...payload,
        id: editingCampaign.id,
      });
    } else {
      createCampaignMutation.mutate(payload);
    }
  };

  // Function to open edit modal with campaign data
  const handleEditCampaign = (campaign: Campaign) => {
    setEditingCampaign(campaign);
    setCampaignType(campaign.campaignType);
    setIsEditOpen(true); // Important: Open the edit dialog
    
    // Populate form with campaign data
    form.reset({
      title: campaign.title,
      customMessage: campaign.customMessage || "",
      includeContact: campaign.includeContact,
      includePurchaseLink: campaign.includePurchaseLink,
      campaignType: campaign.campaignType,
      productId: campaign.campaignType === 'single' ? campaign.product?.id : undefined,
      quantity: campaign.quantity || 1,
      specialPrice: campaign.specialPrice || "",
    });

    // Set up promotional offers for single product campaigns
    if (campaign.campaignType === 'single' && (campaign as any).promotionalOffers) {
      setSingleProductOffers((campaign as any).promotionalOffers || []);
    } else {
      setSingleProductOffers([]);
    }

    // Set up products for multi-product campaigns
    if (campaign.campaignType === 'multi' && campaign.products) {
      setSelectedProducts(campaign.products.map(p => ({
        productId: p.productId,
        quantity: p.quantity,
        specialPrice: p.specialPrice || '',
        promotionalOffers: (p as any).promotionalOffers || []
      })));
    } else {
      setSelectedProducts([]);
    }
  };

  if (campaignsLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-4 sm:space-y-0">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Campaigns</h1>
            <ContextualHelpBubble
              topic="campaigns"
              title="Creating Effective Campaigns"
              steps={helpContent.campaigns.steps}
              position="right"
            />
          </div>
          <p className="text-gray-600 mt-1">Create and manage WhatsApp marketing campaigns</p>
        </div>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'campaigns')}>
        <TabsList className="grid w-full grid-cols-1">
          <TabsTrigger value="campaigns" className="flex items-center gap-2 px-2 sm:px-4">
            <MessageSquare className="h-4 w-4" />
            <span className="hidden sm:inline">Campaign Management</span>
            <span className="sm:hidden">Campaigns</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="campaigns" className="space-y-6">
          {/* WhatsApp Connection Status */}
          <div className="flex items-center justify-between p-4 bg-white border rounded-lg shadow-sm">
            <div className="flex items-center gap-3">
              <MessageSquare className="h-5 w-5 text-green-600" />
              <h3 className="font-medium text-gray-900">WhatsApp Integration</h3>
              <WhatsAppStatusIndicator />
            </div>
          </div>
          
          {/* WhatsApp Setup Alert */}
          <WhatsAppSetupAlert />

          {/* Broadcast Dashboard */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Campaigns</p>
                <p className="text-2xl font-bold text-gray-900">{campaigns.length}</p>
              </div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="h-8 w-8 bg-blue-100 rounded-full flex items-center justify-center cursor-help">
                      <MessageSquare className="h-4 w-4 text-blue-600" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Total number of broadcast campaigns created</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
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
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="h-8 w-8 bg-green-100 rounded-full flex items-center justify-center cursor-help">
                      <Send className="h-4 w-4 text-green-600" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Total WhatsApp messages sent to customers</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
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
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="h-8 w-8 bg-purple-100 rounded-full flex items-center justify-center cursor-help">
                      <ShoppingCart className="h-4 w-4 text-purple-600" />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Orders generated from campaign broadcasts</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Stock Value</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatCurrency((products || []).reduce((total: number, product: any) => {
                    const pricing = calculatePromotionalPricing(product);
                    return total + (pricing.effectivePrice * (Number(product.stock) || 0));
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
        <div className="flex items-center gap-3">
          {/* AI components removed as requested by user */}
          <Button 
            className="flex items-center space-x-2"
            disabled={!(whatsappStatus as any)?.isConfigured}
            onClick={() => {
              if (!(whatsappStatus as any)?.isConfigured) {
                toast({
                  title: "WhatsApp Not Connected",
                  description: "Please connect WhatsApp before creating campaigns",
                  variant: "destructive",
                });
                return;
              }
              setEditingCampaign(null);
              setCampaignType('single');
              form.reset({
                title: "",
                customMessage: "",
                includeContact: true,
                includePurchaseLink: true,
                campaignType: 'single',
              });
              setSelectedProducts([{ productId: 0, quantity: 1 }]);
              setIsCreateOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            <span>
              {(whatsappStatus as any)?.isConfigured 
                ? "Create Broadcast" 
                : "WhatsApp Required"
              }
            </span>
          </Button>
        </div>
      </div>

      {/* Unified Create/Edit Campaign Dialog */}
      <Dialog open={isCreateOpen || isEditOpen} onOpenChange={(open) => {
        if (!open) {
          setIsCreateOpen(false);
          setIsEditOpen(false);
          setEditingCampaign(null);
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingCampaign ? 'Edit Campaign' : 'Create Broadcast Campaign'}</DialogTitle>
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
                            <Select onValueChange={(value) => {
                              const productId = parseInt(value);
                              field.onChange(productId);
                              
                              // Populate existing promotional offers when product is selected
                              const existingOffers = getProductExistingOffers(productId);
                              setSingleProductOffers(existingOffers.offers || []);
                            }}>
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
                            
                            {/* Cross-campaign promotional offer warning */}
                            {form.watch('productId') && (() => {
                              const selectedProductId = form.watch('productId');
                              const existingOffers = getProductExistingOffers(selectedProductId);
                              
                              if (existingOffers.hasOffers) {
                                return (
                                  <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                                    <div className="flex items-start space-x-2">
                                      <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5" />
                                      <div>
                                        <p className="text-sm font-medium text-amber-800">
                                          Existing Promotional Offers Detected
                                        </p>
                                        <p className="text-sm text-amber-700 mt-1">
                                          This product already has promotional offers configured. Any changes you make here will update the product's promotional pricing across all campaigns.
                                        </p>
                                        <div className="mt-2">
                                          <p className="text-xs text-amber-600">Current offers:</p>
                                          <div className="flex flex-wrap gap-1 mt-1">
                                            {existingOffers.offers.map((offer: any, index: number) => (
                                              <Badge key={index} variant="secondary" className="text-xs bg-amber-100 text-amber-800">
                                                {offer.type === 'percentage_discount' && `${offer.discountPercentage}% off`}
                                                {offer.type === 'fixed_amount_discount' && `£${offer.discountAmount} off`}
                                                {offer.type === 'fixed_price' && `£${offer.fixedPrice} fixed`}
                                                {offer.type === 'bogo' && 'Buy 1 Get 1'}
                                                {offer.type === 'buy_x_get_y_free' && `Buy ${offer.buyQuantity} Get ${offer.getQuantity} Free`}
                                                {offer.type === 'bulk_discount' && 'Bulk Discount'}
                                                {offer.type === 'free_shipping' && 'Free Shipping'}
                                                {offer.type === 'bundle_deal' && 'Bundle Deal'}
                                              </Badge>
                                            ))}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                );
                              }
                              return null;
                            })()}
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="quantity"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Quantity</FormLabel>
                            <FormControl>
                              <Input 
                                {...field} 
                                placeholder="e.g., 200"
                                type="number"
                                min="1"
                                onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                              />
                            </FormControl>
                            <FormMessage />
                            <p className="text-sm text-muted-foreground">
                              Quantity available for this campaign
                            </p>
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={form.control}
                        name="specialPrice"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Special Price (Optional)</FormLabel>
                            <FormControl>
                              <Input 
                                {...field} 
                                placeholder="e.g., 2.50 for promotional pricing"
                                type="number"
                                step="0.01"
                                min="0"
                              />
                            </FormControl>
                            <FormMessage />
                            <p className="text-sm text-muted-foreground">
                              Leave empty to use regular product price. Special price will be displayed in the campaign message.
                            </p>
                          </FormItem>
                        )}
                      />
                      
                      {/* Promotional Offers Manager for Single Product */}
                      {form.watch('productId') && (
                        <PromotionalOffersManager
                          offers={singleProductOffers}
                          onOffersChange={setSingleProductOffers}
                          productPrice={parseFloat(
                            (products as Product[]).find(p => p.id === form.watch('productId'))?.price || '0'
                          )}
                          currency={user?.defaultCurrency || 'GBP'}
                          className="mt-6"
                        />
                      )}
                    </TabsContent>

                    <TabsContent value="multi" className="space-y-4">
                      <div className="flex justify-between items-center">
                        <h4 className="font-medium">Products</h4>
                        <Button type="button" onClick={addProduct} size="sm">
                          <Plus className="h-4 w-4 mr-2" />
                          Add Product
                        </Button>
                      </div>

                      {selectedProducts.map((item, index) => {
                        const selectedProduct = (products as Product[]).find(p => p.id === item.productId);
                        
                        return (
                          <div key={index} className="border rounded-lg p-4 space-y-4">
                            <div className="grid grid-cols-12 gap-2 items-end">
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
                            
                            {/* Cross-campaign promotional offer warning for multi-product */}
                            {item.productId > 0 && (() => {
                              const existingOffers = getProductExistingOffers(item.productId);
                              
                              if (existingOffers.hasOffers) {
                                return (
                                  <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                                    <div className="flex items-start space-x-2">
                                      <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5" />
                                      <div>
                                        <p className="text-sm font-medium text-amber-800">
                                          Existing Promotional Offers Detected
                                        </p>
                                        <p className="text-sm text-amber-700 mt-1">
                                          This product already has promotional offers configured. Any changes you make here will update the product's promotional pricing across all campaigns.
                                        </p>
                                        <div className="mt-2">
                                          <p className="text-xs text-amber-600">Current offers:</p>
                                          <div className="flex flex-wrap gap-1 mt-1">
                                            {existingOffers.offers.map((offer: any, index: number) => (
                                              <Badge key={index} variant="secondary" className="text-xs bg-amber-100 text-amber-800">
                                                {offer.type === 'percentage_discount' && `${offer.discountPercentage}% off`}
                                                {offer.type === 'fixed_amount_discount' && `£${offer.discountAmount} off`}
                                                {offer.type === 'fixed_price' && `£${offer.fixedPrice} fixed`}
                                                {offer.type === 'bogo' && 'Buy 1 Get 1'}
                                                {offer.type === 'buy_x_get_y_free' && `Buy ${offer.buyQuantity} Get ${offer.getQuantity} Free`}
                                                {offer.type === 'bulk_discount' && 'Bulk Discount'}
                                                {offer.type === 'free_shipping' && 'Free Shipping'}
                                                {offer.type === 'bundle_deal' && 'Bundle Deal'}
                                              </Badge>
                                            ))}
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                );
                              }
                              return null;
                            })()}
                            
                            {/* Promotional Offers for Multi-Product Campaign */}
                            {selectedProduct && (
                              <PromotionalOffersManager
                                offers={item.promotionalOffers || []}
                                onOffersChange={(offers) => updateProduct(index, 'promotionalOffers', offers)}
                                productPrice={parseFloat(selectedProduct.price)}
                                currency={user?.defaultCurrency || 'GBP'}
                                className="mt-4"
                              />
                            )}
                          </div>
                        );
                      })}
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
                  <Button type="button" variant="outline" onClick={() => {
                    setIsCreateOpen(false);
                    setIsEditOpen(false);
                    setEditingCampaign(null);
                  }}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createCampaignMutation.isPending || editCampaignMutation.isPending}>
                    {editingCampaign 
                      ? (editCampaignMutation.isPending ? "Updating..." : "Update Campaign")
                      : (createCampaignMutation.isPending ? "Creating..." : "Create Campaign")
                    }
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

      {/* Campaigns Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
        {campaigns.map((campaign: Campaign) => (
          <Card key={campaign.id} className="hover:shadow-md transition-all duration-200">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between mb-2">
                <CardTitle className="text-lg font-semibold truncate">{campaign.title}</CardTitle>
                <Badge variant={campaign.sentCampaigns.length > 0 ? 'default' : 'outline'}>
                  {campaign.sentCampaigns.length > 0 ? 'Sent' : 'Draft'}
                </Badge>
              </div>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={campaign.campaignType === 'single' ? 'outline' : 'default'} className="bg-slate-100 text-slate-700">
                      <Package className="h-3 w-3 mr-1" />
                      {campaign.campaignType === 'single' ? '1 Product' : `${campaign.products?.length || 0} Products`}
                    </Badge>
                    
                    {/* Promotional Offers Badge */}
                    {hasPromotionalOffers(campaign) && (
                      <Badge variant="secondary" className="bg-purple-100 text-purple-800">
                        <Percent className="h-3 w-3 mr-1" />
                        Offers
                      </Badge>
                    )}
                  </div>
                  <span className="flex items-center text-gray-600">
                    <Send className="h-4 w-4 mr-1" />
                    {campaign.sentCampaigns.reduce((sum, c) => sum + c.recipientCount, 0)} sent
                  </span>
                </div>
                {campaign.sentCampaigns.length > 0 && (
                  <div className="flex items-center text-xs text-gray-500 mt-2">
                    <Clock className="h-3 w-3 mr-1" />
                    Last sent: {(() => {
                      const latestSent = campaign.sentCampaigns
                        .filter(c => c.sentAt)
                        .sort((a, b) => new Date(b.sentAt!).getTime() - new Date(a.sentAt!).getTime())[0];
                      return latestSent ? new Date(latestSent.sentAt!).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      }) : 'Never';
                    })()}
                  </div>
                )}
              </CardHeader>
            <CardContent className="space-y-4">
              {campaign.campaignType === 'single' ? (
                <div className="space-y-2">
                  <div className="flex items-center text-sm">
                    <Package className="h-4 w-4 mr-2 text-gray-500" />
                    <span className="text-gray-600 truncate font-medium">{campaign.product?.name}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs bg-gray-50 px-2 py-1 rounded">
                    <span className="text-gray-600">
                      💰 {(() => {
                        if (campaign.product) {
                          const pricing = calculatePromotionalPricing(campaign.product);
                          const hasDiscounts = pricing.effectivePrice < pricing.originalPrice;
                          
                          return hasDiscounts ? (
                            <span className="flex items-center space-x-1">
                              <span className="text-red-600 font-semibold">
                                {formatCurrency(pricing.effectivePrice)}
                              </span>
                              <span className="text-gray-400 line-through text-xs">
                                {formatCurrency(pricing.originalPrice)}
                              </span>
                              <span className="text-red-600 font-medium">PROMO</span>
                            </span>
                          ) : (
                            <span>{formatCurrency(pricing.originalPrice)}</span>
                          );
                        }
                        return <span>£0.00</span>;
                      })()}
                    </span>
                    <span className="text-gray-600">
                      📦 {formatNumber(campaign.quantity || campaign.product?.stock || 0)} qty
                    </span>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center">
                      <Package className="h-4 w-4 mr-2 text-gray-500" />
                      <span className="text-gray-600 font-medium">{campaign.products?.length || 0} Products</span>
                    </div>
                    <span className="text-xs text-gray-500">
                      Total: {formatCurrency(
                        campaign.products?.reduce((sum: number, p: any) => {
                          if (p.specialPrice) {
                            return sum + ((Number(p.specialPrice) || 0) * (Number(p.quantity) || 0));
                          }
                          if (p.product) {
                            // Include promotional offers from the campaign product item
                            const productWithOffers = {
                              ...p.product,
                              promotionalOffers: p.promotionalOffers || []
                            };
                            const pricing = calculatePromotionalPricing(productWithOffers, Number(p.quantity) || 1);
                            return sum + pricing.totalCost;
                          }
                          return sum;
                        }, 0) || 0
                      )}
                    </span>
                  </div>
                  <div className="max-h-24 overflow-y-auto space-y-1">
                    {campaign.products?.map((productItem: any, index: number) => (
                      <div key={index} className="bg-gray-50 px-2 py-1 rounded">
                        <div className="flex items-center text-xs">
                          <span className="truncate flex-1 font-medium text-gray-700">{productItem.product?.name}</span>
                        </div>
                        <div className="flex items-center justify-between text-xs text-gray-600">
                          <span>💰 {(() => {
                            if (productItem.specialPrice) {
                              return (
                                <span className="flex items-center space-x-1">
                                  <span className="text-red-600 font-semibold">
                                    {formatCurrency(Number(productItem.specialPrice) || 0)}
                                  </span>
                                  <span className="text-gray-400 line-through text-xs">
                                    {formatCurrency(Number(productItem.product?.price) || 0)}
                                  </span>
                                  <span className="text-red-600 font-medium">SPECIAL</span>
                                </span>
                              );
                            }
                            if (productItem.product) {
                              // Include promotional offers from the campaign product item
                              const productWithOffers = {
                                ...productItem.product,
                                promotionalOffers: productItem.promotionalOffers || []
                              };
                              const pricing = calculatePromotionalPricing(productWithOffers);
                              const hasDiscounts = pricing.effectivePrice < pricing.originalPrice;
                              
                              return hasDiscounts ? (
                                <span className="flex items-center space-x-1">
                                  <span className="text-red-600 font-semibold">
                                    {formatCurrency(pricing.effectivePrice)}
                                  </span>
                                  <span className="text-gray-400 line-through text-xs">
                                    {formatCurrency(pricing.originalPrice)}
                                  </span>
                                  <span className="text-red-600 font-medium">PROMO</span>
                                </span>
                              ) : (
                                <span>{formatCurrency(pricing.originalPrice)}</span>
                              );
                            }
                            return <span>£0.00</span>;
                          })()}
                          </span>
                          <span>📦 {formatNumber(productItem.quantity || 0)} qty</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {campaign.sentCampaigns.length > 0 && campaign.campaignType === 'single' && (
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Total Sent:</span>
                    <div className="font-medium text-lg">{campaign.sentCampaigns.reduce((sum, c) => sum + c.recipientCount, 0)}</div>
                  </div>
                  <div>
                    <span className="text-gray-500">Stock Value:</span>
                    <div className="font-medium text-lg">{formatCurrency(
                      (() => {
                        if (campaign.specialPrice) {
                          return (Number(campaign.specialPrice) || 0) * (Number(campaign.quantity) || Number(campaign.product?.stock) || 0);
                        }
                        if (campaign.product) {
                          const quantity = Number(campaign.quantity) || Number(campaign.product.stock) || 0;
                          const pricing = calculatePromotionalPricing(campaign.product, quantity);
                          return pricing.totalCost;
                        }
                        return 0;
                      })()
                    )}</div>
                  </div>
                </div>
              )}

              {campaign.sentCampaigns.length > 0 && campaign.campaignType === 'multi' && (
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Total Sent:</span>
                    <div className="font-medium text-lg">{campaign.sentCampaigns.reduce((sum, c) => sum + c.recipientCount, 0)}</div>
                  </div>
                  <div>
                    <span className="text-gray-500">Stock Value:</span>
                    <div className="font-medium text-lg">{formatCurrency(
                      campaign.products?.reduce((sum: number, p: any) => {
                        if (p.specialPrice) {
                          return sum + ((Number(p.specialPrice) || 0) * (Number(p.quantity) || 0));
                        }
                        if (p.product) {
                          const quantity = Number(p.quantity) || 0;
                          // Include promotional offers from the campaign product item
                          const productWithOffers = {
                            ...p.product,
                            promotionalOffers: p.promotionalOffers || []
                          };
                          const pricing = calculatePromotionalPricing(productWithOffers, quantity);
                          return sum + pricing.totalCost;
                        }
                        return sum;
                      }, 0) || 0
                    )}</div>
                  </div>
                </div>
              )}

              <div className="flex flex-col space-y-2 w-full">
                <div className="flex flex-wrap gap-1 sm:gap-2 w-full">
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={() => {
                      setSelectedCampaign(campaign);
                      setIsPreviewOpen(true);
                    }}
                    className="flex-1 min-w-[60px] px-2 text-xs sm:text-sm"
                    title={generatePreviewMessage(campaign)}
                  >
                    <span className="truncate">Preview</span>
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => handleEditCampaign(campaign)}
                    className="flex-1 min-w-[60px] px-2 text-xs sm:text-sm"
                  >
                    <Edit3 className="h-3 w-3 mr-1 hidden xs:inline" />
                    <span className="truncate">Edit</span>
                  </Button>
                  <Button 
                    size="sm" 
                    onClick={() => {
                      setSelectedCampaign(campaign);
                      setIsSendOpen(true);
                    }}
                    className="flex-1 min-w-[60px] px-2 text-xs sm:text-sm"
                  >
                    <Send className="h-3 w-3 mr-1 hidden xs:inline" />
                    <span className="truncate">Send</span>
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => {
                      if (window.confirm(`Are you sure you want to delete "${campaign.title}"? This action cannot be undone.`)) {
                        deleteCampaignMutation.mutate(campaign.id);
                      }
                    }}
                    className="flex-shrink-0 text-red-600 hover:text-red-700 hover:bg-red-50 px-2 w-10"
                    disabled={deleteCampaignMutation.isPending}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>

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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              WhatsApp Message Preview
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (!isEditingMessage) {
                    setEditableMessage(generatePreviewMessage(selectedCampaign!));
                  }
                  setIsEditingMessage(!isEditingMessage);
                }}
              >
                <Edit3 className="h-4 w-4 mr-2" />
                {isEditingMessage ? "View" : "Edit"}
              </Button>
            </DialogTitle>
          </DialogHeader>
          {selectedCampaign && (
            <div className="space-y-4">
              <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                <div className="flex items-center mb-2">
                  <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center mr-3">
                    <MessageSquare className="h-4 w-4 text-white" />
                  </div>
                  <span className="font-medium">WhatsApp Message</span>
                </div>
                <div className="bg-white p-3 rounded-lg shadow-sm">
                  {isEditingMessage ? (
                    <Textarea
                      value={editableMessage}
                      onChange={(e) => setEditableMessage(e.target.value)}
                      placeholder="Edit your WhatsApp message..."
                      className="min-h-[200px] font-mono text-sm resize-none"
                    />
                  ) : (
                    <pre className="whitespace-pre-wrap text-sm">{generatePreviewMessage(selectedCampaign)}</pre>
                  )}
                </div>
              </div>
              
              {isEditingMessage && (
                <div className="p-3 bg-blue-50 rounded border border-blue-200">
                  <p className="text-sm text-blue-800">
                    <strong>Tip:</strong> You can edit the message text while keeping the formatting. 
                    Changes will be saved for when you send this campaign.
                  </p>
                </div>
              )}
              
              <div className="flex justify-between">
                <div className="text-sm text-gray-500">
                  Character count: {(isEditingMessage ? editableMessage : generatePreviewMessage(selectedCampaign)).length}
                </div>
                <div className="flex space-x-2">
                  {isEditingMessage && (
                    <Button 
                      variant="outline" 
                      onClick={() => {
                        setEditableMessage(generatePreviewMessage(selectedCampaign!));
                      }}
                    >
                      Reset
                    </Button>
                  )}
                  <Button onClick={() => {
                    setIsPreviewOpen(false);
                    setIsEditingMessage(false);
                  }}>
                    Close
                  </Button>
                </div>
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
              {editableMessage && (
                <div className="p-3 bg-green-50 rounded border border-green-200">
                  <p className="text-sm text-green-800 font-medium">
                    📝 Custom Message Ready
                  </p>
                  <p className="text-xs text-green-600 mt-1">
                    You've edited the WhatsApp message. Your custom version will be sent to customers.
                  </p>
                </div>
              )}
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Customer Group
                </label>
                <Select onValueChange={(value) => {
                  const groupId = parseInt(value);
                  const selectedGroup = (customerGroups as CustomerGroup[]).find(g => g.id === groupId);
                  
                  if (selectedGroup) {
                    const confirmMessage = `Are you sure you want to send "${selectedCampaign.title}" to all ${selectedGroup.memberCount || 0} members of "${selectedGroup.name}"?\n\nThis action will immediately send WhatsApp messages to all group members and cannot be undone.`;
                    
                    if (window.confirm(confirmMessage)) {
                      sendCampaignMutation.mutate({
                        campaignId: selectedCampaign.id,
                        customerGroupId: groupId,
                      });
                    }
                  }
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
              
              <div className="flex justify-between space-x-2">
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setIsSendOpen(false);
                    setIsPreviewOpen(true);
                  }}
                >
                  <Eye className="h-4 w-4 mr-2" />
                  Preview Message
                </Button>
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
            <DialogTitle>Refresh Stock Information</DialogTitle>
          </DialogHeader>
          {selectedCampaign && (
            <div className="space-y-4">
              <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex items-center mb-2">
                  <Package className="h-4 w-4 text-blue-600 mr-2" />
                  <span className="font-medium text-blue-800">Stock Data Refresh</span>
                </div>
                <p className="text-sm text-blue-800">
                  This will update the stock counts and pricing information for "{selectedCampaign.title}" with the current data from your products.
                  No messages will be sent to customers - this just refreshes the campaign data.
                </p>
              </div>
              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setIsStockRefreshOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={() => {
                  stockRefreshMutation.mutate({
                    campaignId: selectedCampaign.id.toString(),
                  });
                }}>
                  <Package className="h-4 w-4 mr-2" />
                  Refresh Stock Data
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

        </TabsContent>

      </Tabs>

      {/* Subscription Upgrade Modal */}
      <SubscriptionUpgradeModal 
        open={isUpgradeModalOpen}
        onOpenChange={setIsUpgradeModalOpen}
        reason="broadcast_limit"
        currentPlan={subscription?.tier || "free"}
      />
    </div>
  );
}