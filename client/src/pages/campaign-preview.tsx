import { useQuery } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Share2, ExternalLink, MessageCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface CampaignPreview {
  type: 'single' | 'multi';
  title: string;
  message: string;
  product?: any;
  template?: any;
  wholesaler: {
    businessName: string;
    businessPhone: string;
  };
  campaignUrl?: string;
}

export default function CampaignPreview() {
  const [match, params] = useRoute("/campaign/:id");
  const { toast } = useToast();
  
  const { data: preview, isLoading, error } = useQuery({
    queryKey: ["/api/campaigns", params?.id, "preview"],
    queryFn: async (): Promise<CampaignPreview> => {
      const response = await fetch(`/api/campaigns/${params?.id}/preview`);
      if (!response.ok) throw new Error('Campaign not found');
      return await response.json();
    },
    enabled: !!params?.id,
  });

  const shareLink = () => {
    const currentUrl = window.location.href;
    navigator.clipboard.writeText(currentUrl);
    toast({
      title: "Link Copied",
      description: "Campaign preview link copied to clipboard",
    });
  };

  const openWhatsApp = () => {
    if (preview?.wholesaler.businessPhone) {
      const phone = preview.wholesaler.businessPhone.replace(/\D/g, '');
      const message = encodeURIComponent("Hi! I'm interested in your products from your campaign.");
      window.open(`https://wa.me/${phone}?text=${message}`, '_blank');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error || !preview) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <h2 className="text-xl font-semibold mb-2">Campaign Not Found</h2>
            <p className="text-gray-600">This campaign preview is no longer available.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{preview.title}</h1>
              <p className="text-gray-600">Campaign Preview by {preview.wholesaler.businessName}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={shareLink} className="flex items-center gap-2">
                <Share2 className="w-4 h-4" />
                Share
              </Button>
              {preview.campaignUrl && (
                <Button onClick={() => window.open('/marketplace', '_blank')} className="flex items-center gap-2">
                  <ExternalLink className="w-4 h-4" />
                  View Products
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="grid md:grid-cols-2 gap-8">
          {/* WhatsApp Message Preview */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-green-600" />
                <CardTitle>WhatsApp Message Preview</CardTitle>
                <Badge variant={preview.type === 'single' ? 'default' : 'secondary'}>
                  {preview.type === 'single' ? 'Single Product' : 'Multi Product'}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="bg-white rounded-lg p-3 shadow-sm">
                  <pre className="whitespace-pre-wrap text-sm font-mono text-gray-800 leading-relaxed">
                    {preview.message}
                  </pre>
                </div>
                <div className="mt-3 text-xs text-green-700">
                  WhatsApp • {new Date().toLocaleTimeString()}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Business Information */}
          <Card>
            <CardHeader>
              <CardTitle>Business Contact</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Business Name</label>
                <p className="text-lg font-semibold">{preview.wholesaler.businessName}</p>
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-700">WhatsApp Business</label>
                <p className="text-lg">{preview.wholesaler.businessPhone}</p>
              </div>

              <Button 
                onClick={openWhatsApp} 
                className="w-full bg-green-600 hover:bg-green-700 flex items-center gap-2"
              >
                <MessageCircle className="w-4 h-4" />
                Contact on WhatsApp
              </Button>

              {preview.type === 'single' && preview.product && (
                <div className="pt-4 border-t">
                  <h3 className="font-medium mb-2">Featured Product</h3>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="font-medium">{preview.product.name}</p>
                    <p className="text-sm text-gray-600 mt-1">{preview.product.description}</p>
                    <div className="flex justify-between mt-2 text-sm">
                      <span>Stock: {preview.product.stock}</span>
                      <span>MOQ: {preview.product.moq}</span>
                    </div>
                  </div>
                </div>
              )}

              {preview.type === 'multi' && preview.template && (
                <div className="pt-4 border-t">
                  <h3 className="font-medium mb-2">Campaign Products</h3>
                  <div className="space-y-2">
                    {preview.template.products?.map((item: any, index: number) => (
                      <div key={item.id} className="bg-gray-50 rounded-lg p-2">
                        <p className="text-sm font-medium">{item.product.name}</p>
                        <p className="text-xs text-gray-600">
                          Stock: {item.product.stock} | MOQ: {item.product.moq}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-gray-500 text-sm">
          <p>Powered by <span className="font-semibold text-green-600">Quikpik Merchant</span></p>
          <p className="mt-1">Connecting wholesalers and retailers</p>
        </div>
      </div>
    </div>
  );
}