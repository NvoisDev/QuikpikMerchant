import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  BarChart3, 
  TrendingUp, 
  Users, 
  Eye, 
  MousePointer, 
  Share2, 
  MessageSquare, 
  Megaphone,
  Zap,
  Target,
  Calendar,
  ExternalLink
} from 'lucide-react';

export default function AdvertisingPreview() {
  const sampleCampaigns = [
    {
      id: 1,
      name: "Fresh Organic Produce Launch",
      status: "Active",
      budget: "£500",
      reach: "12,450",
      clicks: "523",
      conversions: "22",
      roi: "340%"
    },
    {
      id: 2,
      name: "Premium Frozen Foods",
      status: "Paused",
      budget: "£750",
      reach: "8,200",
      clicks: "310",
      conversions: "15",
      roi: "220%"
    },
    {
      id: 3,
      name: "Seasonal Specialty Items",
      status: "Scheduled",
      budget: "£300",
      reach: "0",
      clicks: "0",
      conversions: "0",
      roi: "0%"
    }
  ];

  const contentTemplates = [
    {
      type: "Product Showcase",
      platform: "Facebook",
      engagement: "High",
      description: "Professional product photos with compelling copy"
    },
    {
      type: "Customer Testimonial",
      platform: "Instagram",
      engagement: "Very High",
      description: "Real customer reviews with product imagery"
    },
    {
      type: "Behind the Scenes",
      platform: "LinkedIn",
      engagement: "Medium",
      description: "Business story and quality processes"
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <Megaphone className="h-8 w-8 text-blue-600" />
              Advertising Dashboard
            </h1>
            <p className="text-gray-600 mt-2">Manage your marketing campaigns and boost your business visibility</p>
          </div>
          <div className="flex gap-2">
            <Button className="bg-blue-600 hover:bg-blue-700">
              <Zap className="h-4 w-4 mr-2" />
              Create Campaign
            </Button>
            <Button variant="outline">
              <BarChart3 className="h-4 w-4 mr-2" />
              Analytics
            </Button>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Reach</CardTitle>
              <Eye className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">20,650</div>
              <p className="text-xs text-muted-foreground">
                <TrendingUp className="inline h-3 w-3 text-green-500 mr-1" />
                +12% from last month
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Click-Through Rate</CardTitle>
              <MousePointer className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">4.2%</div>
              <p className="text-xs text-muted-foreground">
                <TrendingUp className="inline h-3 w-3 text-green-500 mr-1" />
                +0.8% from last month
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Conversions</CardTitle>
              <Target className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">37</div>
              <p className="text-xs text-muted-foreground">
                <TrendingUp className="inline h-3 w-3 text-green-500 mr-1" />
                +23% from last month
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Average ROI</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">287%</div>
              <p className="text-xs text-muted-foreground">
                <TrendingUp className="inline h-3 w-3 text-green-500 mr-1" />
                +45% from last month
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Active Campaigns */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Active Campaigns
              </CardTitle>
              <CardDescription>
                Manage your current advertising campaigns
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {sampleCampaigns.map((campaign) => (
                <div key={campaign.id} className="p-4 border rounded-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold">{campaign.name}</h4>
                    <Badge 
                      variant={campaign.status === 'Active' ? 'default' : campaign.status === 'Paused' ? 'secondary' : 'outline'}
                    >
                      {campaign.status}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">Budget:</span>
                      <span className="font-medium ml-2">{campaign.budget}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Reach:</span>
                      <span className="font-medium ml-2">{campaign.reach}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Clicks:</span>
                      <span className="font-medium ml-2">{campaign.clicks}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">ROI:</span>
                      <span className="font-medium ml-2 text-green-600">{campaign.roi}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline">Edit</Button>
                    <Button size="sm" variant="outline">
                      <BarChart3 className="h-4 w-4 mr-1" />
                      View Stats
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Content Templates */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Content Templates
              </CardTitle>
              <CardDescription>
                Ready-to-use social media content for your products
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {contentTemplates.map((template, index) => (
                <div key={index} className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold">{template.type}</h4>
                    <Badge variant="outline">{template.platform}</Badge>
                  </div>
                  <p className="text-sm text-gray-600 mb-3">{template.description}</p>
                  <div className="flex items-center justify-between">
                    <Badge 
                      variant={template.engagement === 'Very High' ? 'default' : template.engagement === 'High' ? 'secondary' : 'outline'}
                    >
                      {template.engagement} Engagement
                    </Badge>
                    <Button size="sm" variant="outline">
                      <ExternalLink className="h-4 w-4 mr-1" />
                      Use Template
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Quick Actions
            </CardTitle>
            <CardDescription>
              Get started with your marketing campaigns
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Button className="h-20 flex-col space-y-2">
                <Share2 className="h-6 w-6" />
                <span>Create SEO Product Page</span>
              </Button>
              <Button variant="outline" className="h-20 flex-col space-y-2">
                <MessageSquare className="h-6 w-6" />
                <span>Generate Social Content</span>
              </Button>
              <Button variant="outline" className="h-20 flex-col space-y-2">
                <BarChart3 className="h-6 w-6" />
                <span>View Full Analytics</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="text-center py-6">
          <Badge variant="outline" className="bg-blue-50 text-blue-700">
            Temporary Access - Full features available after login resolution
          </Badge>
        </div>
      </div>
    </div>
  );
}