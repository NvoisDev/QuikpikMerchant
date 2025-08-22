import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { 
  TrendingUp, 
  Target, 
  Globe, 
  Share2, 
  Eye, 
  Users, 
  MapPin, 
  Calendar,
  Star,
  Zap,
  Crown,
  PlusCircle,
  ExternalLink,
  Award,
  Megaphone
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useSubscription } from "@/hooks/useSubscription";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatCurrency } from "@/lib/currencies";

interface PromotionCampaign {
  id: string;
  name: string;
  type: 'featured_product' | 'category_sponsor' | 'banner_ad' | 'location_boost';
  status: 'active' | 'paused' | 'completed' | 'draft';
  budget: number;
  spent: number;
  impressions: number;
  clicks: number;
  conversions: number;
  startDate: string;
  endDate: string;
  targetAudience: {
    location?: string[];
    categories?: string[];
    businessTypes?: string[];
  };
}

interface SEOPage {
  id: string;
  productId: string;
  productName: string;
  slug: string;
  metaTitle: string;
  metaDescription: string;
  views: number;
  leads: number;
  status: 'published' | 'draft';
}

export default function Advertising() {
  const { user } = useAuth();
  const { currentTier } = useSubscription();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("campaigns");
  const [newCampaignOpen, setNewCampaignOpen] = useState(false);

  // Query for existing campaigns
  const { data: campaigns = [], isLoading: campaignsLoading } = useQuery<PromotionCampaign[]>({
    queryKey: ['/api/advertising/campaigns'],
    queryFn: async () => {
      const response = await fetch('/api/advertising/campaigns');
      if (!response.ok) throw new Error('Failed to fetch campaigns');
      return response.json();
    },
  });

  // Query for SEO pages
  const { data: seoPages = [], isLoading: seoLoading } = useQuery<SEOPage[]>({
    queryKey: ['/api/advertising/seo-pages'],
    queryFn: async () => {
      const response = await fetch('/api/advertising/seo-pages');
      if (!response.ok) throw new Error('Failed to fetch SEO pages');
      return response.json();
    },
  });

  // Query for products (for campaign creation)
  const { data: products = [] } = useQuery({
    queryKey: ['/api/products'],
    queryFn: async () => {
      const response = await fetch('/api/products');
      if (!response.ok) throw new Error('Failed to fetch products');
      return response.json();
    },
  });

  const createCampaignMutation = useMutation({
    mutationFn: async (campaignData: any) => {
      return await apiRequest('POST', '/api/advertising/campaigns', campaignData);
    },
    onSuccess: () => {
      toast({ title: "Campaign created successfully!" });
      queryClient.invalidateQueries({ queryKey: ['/api/advertising/campaigns'] });
      setNewCampaignOpen(false);
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to create campaign", 
        description: error.message,
        variant: "destructive" 
      });
    }
  });

  const generateSEOPageMutation = useMutation({
    mutationFn: async (productId: string) => {
      return await apiRequest('POST', '/api/advertising/seo-pages', { productId });
    },
    onSuccess: () => {
      toast({ title: "SEO page generated successfully!" });
      queryClient.invalidateQueries({ queryKey: ['/api/advertising/seo-pages'] });
    },
    onError: (error: any) => {
      toast({ 
        title: "Failed to generate SEO page", 
        description: error.message,
        variant: "destructive" 
      });
    }
  });

  // Check if user has access to advertising features
  const hasAdvancedAccess = currentTier === 'premium';

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center space-y-4 sm:space-y-0">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Advertising & Promotion</h1>
          <p className="text-gray-600 mt-1 sm:mt-2">Reach new customers beyond your existing contacts</p>
        </div>
        <div className="flex gap-3">
          <Button
            onClick={() => setNewCampaignOpen(true)}
            disabled={!hasAdvancedAccess}
            className="w-full sm:w-auto bg-gradient-to-r from-blue-600 to-purple-600"
          >
            <PlusCircle className="w-4 h-4 mr-2" />
            Create Campaign
          </Button>
        </div>
      </div>

      {!hasAdvancedAccess && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Crown className="w-5 h-5 text-amber-600" />
              <div>
                <h3 className="font-semibold text-amber-800">Premium Feature</h3>
                <p className="text-amber-700 text-sm">
                  Upgrade to Premium to access advanced advertising capabilities and reach new customers.
                </p>
              </div>
              <Button size="sm" className="ml-auto">
                Upgrade
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
          <TabsTrigger value="campaigns" className="flex items-center gap-1 sm:gap-2 px-2 sm:px-4">
            <Megaphone className="w-4 h-4" />
            <span className="hidden sm:inline">Campaigns</span>
            <span className="sm:hidden text-xs">Campaigns</span>
          </TabsTrigger>
          <TabsTrigger value="seo" className="flex items-center gap-1 sm:gap-2 px-2 sm:px-4">
            <Globe className="w-4 h-4" />
            <span className="hidden sm:inline">SEO Pages</span>
            <span className="sm:hidden text-xs">SEO</span>
          </TabsTrigger>
          <TabsTrigger value="social" className="flex items-center gap-1 sm:gap-2 px-2 sm:px-4">
            <Share2 className="w-4 h-4" />
            <span className="hidden sm:inline">Social Media</span>
            <span className="sm:hidden text-xs">Social</span>
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-1 sm:gap-2 px-2 sm:px-4">
            <TrendingUp className="w-4 h-4" />
            <span className="hidden sm:inline">Analytics</span>
            <span className="sm:hidden text-xs">Analytics</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="campaigns" className="space-y-6">
          {/* Campaign Performance Overview */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Active Campaigns</p>
                    <p className="text-2xl font-bold">
                      {campaigns.filter(c => c.status === 'active').length}
                    </p>
                  </div>
                  <Target className="w-8 h-8 text-blue-500" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Total Impressions</p>
                    <p className="text-2xl font-bold">
                      {campaigns.reduce((sum, c) => sum + c.impressions, 0).toLocaleString()}
                    </p>
                  </div>
                  <Eye className="w-8 h-8 text-green-500" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Click-Through Rate</p>
                    <p className="text-2xl font-bold">
                      {campaigns.length > 0 
                        ? ((campaigns.reduce((sum, c) => sum + c.clicks, 0) / 
                           campaigns.reduce((sum, c) => sum + c.impressions, 1)) * 100).toFixed(1)
                        : '0.0'}%
                    </p>
                  </div>
                  <Users className="w-8 h-8 text-purple-500" />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Total Spent</p>
                    <p className="text-2xl font-bold">
                      {formatCurrency(campaigns.reduce((sum, c) => sum + c.spent, 0), 'GBP')}
                    </p>
                  </div>
                  <TrendingUp className="w-8 h-8 text-orange-500" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Active Campaigns List */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Megaphone className="w-5 h-5" />
                Your Advertising Campaigns
              </CardTitle>
            </CardHeader>
            <CardContent>
              {campaignsLoading ? (
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="animate-pulse bg-gray-100 rounded-lg h-20" />
                  ))}
                </div>
              ) : campaigns.length === 0 ? (
                <div className="text-center py-8">
                  <Megaphone className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                  <h3 className="font-semibold text-gray-600 mb-2">No campaigns yet</h3>
                  <p className="text-gray-500 mb-4">Create your first advertising campaign to reach new customers</p>
                  <Button 
                    onClick={() => setNewCampaignOpen(true)}
                    disabled={!hasAdvancedAccess}
                  >
                    Create Campaign
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {campaigns.map((campaign) => (
                    <div key={campaign.id} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="font-semibold text-lg">{campaign.name}</h3>
                          <div className="flex items-center gap-3 mt-1">
                            <Badge variant={
                              campaign.status === 'active' ? 'default' :
                              campaign.status === 'paused' ? 'secondary' :
                              campaign.status === 'completed' ? 'outline' : 'destructive'
                            }>
                              {campaign.status}
                            </Badge>
                            <span className="text-sm text-gray-600 capitalize">
                              {campaign.type.replace('_', ' ')}
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-gray-600">Budget</p>
                          <p className="font-semibold">{formatCurrency(campaign.budget, 'GBP')}</p>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <p className="text-gray-600">Impressions</p>
                          <p className="font-semibold">{campaign.impressions.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Clicks</p>
                          <p className="font-semibold">{campaign.clicks.toLocaleString()}</p>
                        </div>
                        <div>
                          <p className="text-gray-600">Conversions</p>
                          <p className="font-semibold">{campaign.conversions}</p>
                        </div>
                      </div>
                      
                      <div className="flex justify-between items-center mt-4">
                        <div className="text-sm text-gray-600">
                          {new Date(campaign.startDate).toLocaleDateString()} - {new Date(campaign.endDate).toLocaleDateString()}
                        </div>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm">
                            Edit
                          </Button>
                          <Button variant="outline" size="sm">
                            View Details
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="seo" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Globe className="w-5 h-5" />
                  SEO-Optimized Product Pages
                </div>
                <Button
                  onClick={() => {
                    // Generate SEO pages for all products
                    products.forEach(product => {
                      generateSEOPageMutation.mutate(product.id);
                    });
                  }}
                  disabled={!hasAdvancedAccess || products.length === 0}
                  size="sm"
                >
                  <Zap className="w-4 h-4 mr-2" />
                  Generate All
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {seoLoading ? (
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="animate-pulse bg-gray-100 rounded-lg h-16" />
                  ))}
                </div>
              ) : seoPages.length === 0 ? (
                <div className="text-center py-8">
                  <Globe className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                  <h3 className="font-semibold text-gray-600 mb-2">No SEO pages yet</h3>
                  <p className="text-gray-500 mb-4">Generate SEO-optimized pages for your products to appear in Google search results</p>
                  <Button 
                    onClick={() => {
                      if (products.length > 0) {
                        generateSEOPageMutation.mutate(products[0].id);
                      }
                    }}
                    disabled={!hasAdvancedAccess || products.length === 0}
                  >
                    Generate First Page
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {seoPages.map((page) => (
                    <div key={page.id} className="border rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="font-semibold">{page.productName}</h3>
                          <p className="text-sm text-gray-600 mt-1">{page.metaDescription}</p>
                          <div className="flex items-center gap-4 mt-3 text-sm text-gray-500">
                            <span>Views: {page.views.toLocaleString()}</span>
                            <span>Leads: {page.leads}</span>
                            <Badge variant={page.status === 'published' ? 'default' : 'secondary'}>
                              {page.status}
                            </Badge>
                          </div>
                        </div>
                        <div className="flex gap-2 ml-4">
                          <Button variant="outline" size="sm">
                            <ExternalLink className="w-4 h-4 mr-1" />
                            View Page
                          </Button>
                          <Button variant="outline" size="sm">
                            Edit SEO
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="social" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Share2 className="w-5 h-5" />
                Social Media Marketing
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <Share2 className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <h3 className="font-semibold text-gray-600 mb-2">Social Media Integration Coming Soon</h3>
                <p className="text-gray-500 mb-4">
                  Automatically generate social media posts from your products and sync with Facebook, Instagram, and LinkedIn
                </p>
                <Badge variant="outline" className="text-blue-600 border-blue-600">
                  In Development
                </Badge>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Advertising Analytics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8">
                <TrendingUp className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <h3 className="font-semibold text-gray-600 mb-2">Detailed Analytics Coming Soon</h3>
                <p className="text-gray-500 mb-4">
                  Track ROI, customer acquisition costs, and campaign performance across all advertising channels
                </p>
                <Badge variant="outline" className="text-blue-600 border-blue-600">
                  In Development
                </Badge>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* New Campaign Dialog */}
      <Dialog open={newCampaignOpen} onOpenChange={setNewCampaignOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create Advertising Campaign</DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="campaign-name">Campaign Name</Label>
                <Input id="campaign-name" placeholder="e.g., Holiday Product Promotion" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="campaign-type">Campaign Type</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select campaign type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="featured_product">Featured Product Listing</SelectItem>
                    <SelectItem value="category_sponsor">Category Sponsorship</SelectItem>
                    <SelectItem value="banner_ad">Banner Advertisement</SelectItem>
                    <SelectItem value="location_boost">Location-Based Promotion</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="budget">Budget (£)</Label>
                <Input id="budget" type="number" placeholder="100" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="duration">Campaign Duration</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Select duration" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">7 days</SelectItem>
                    <SelectItem value="14">14 days</SelectItem>
                    <SelectItem value="30">30 days</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setNewCampaignOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={() => createCampaignMutation.mutate({
                  // Campaign data would be collected from form
                  name: "Test Campaign",
                  type: "featured_product",
                  budget: 100
                })}
                disabled={createCampaignMutation.isPending}
              >
                {createCampaignMutation.isPending ? "Creating..." : "Create Campaign"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}