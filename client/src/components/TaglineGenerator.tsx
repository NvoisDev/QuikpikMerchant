import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Copy, Check, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface TaglineGeneratorProps {
  currentTagline: string;
  onTaglineSelect: (tagline: string) => void;
  businessName?: string;
  businessDescription?: string;
}

export function TaglineGenerator({ 
  currentTagline, 
  onTaglineSelect, 
  businessName = "", 
  businessDescription = "" 
}: TaglineGeneratorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    businessName,
    businessDescription,
    category: "",
    targetAudience: "Retailers and businesses",
    style: "Professional and trustworthy"
  });
  const [generatedTaglines, setGeneratedTaglines] = useState<string[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const { toast } = useToast();

  const generateMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await apiRequest("/api/ai/generate-taglines", "POST", data);
      return response;
    },
    onSuccess: (data) => {
      setGeneratedTaglines(data.taglines || []);
      toast({
        title: "Taglines Generated!",
        description: `Generated ${data.taglines?.length || 0} unique taglines for your store.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Generation Failed",
        description: error.message || "Failed to generate taglines. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleGenerate = () => {
    if (!formData.businessName.trim()) {
      toast({
        title: "Business Name Required",
        description: "Please enter your business name to generate taglines.",
        variant: "destructive",
      });
      return;
    }
    generateMutation.mutate(formData);
  };

  const handleCopyTagline = async (tagline: string, index: number) => {
    try {
      await navigator.clipboard.writeText(tagline);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
      toast({
        title: "Copied!",
        description: "Tagline copied to clipboard.",
      });
    } catch (error) {
      toast({
        title: "Copy Failed",
        description: "Failed to copy tagline to clipboard.",
        variant: "destructive",
      });
    }
  };

  const handleSelectTagline = (tagline: string) => {
    onTaglineSelect(tagline);
    setIsOpen(false);
    toast({
      title: "Tagline Updated!",
      description: "Your store tagline has been updated.",
    });
  };

  if (!isOpen) {
    return (
      <div className="space-y-2">
        <Label htmlFor="tagline">Store Tagline</Label>
        <div className="flex gap-2">
          <Input
            id="tagline"
            value={currentTagline}
            onChange={(e) => onTaglineSelect(e.target.value)}
            placeholder="Enter your store tagline..."
            className="flex-1"
          />
          <Button
            onClick={() => setIsOpen(true)}
            variant="outline"
            size="sm"
            className="border-green-600 text-green-600 hover:bg-green-50"
          >
            <Sparkles className="h-4 w-4 mr-1" />
            AI Generate
          </Button>
        </div>
        <p className="text-xs text-gray-500">
          This appears as the subtitle on your customer portal
        </p>
      </div>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-green-600" />
          AI Tagline Generator
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="business-name">Business Name *</Label>
            <Input
              id="business-name"
              value={formData.businessName}
              onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
              placeholder="Your business name"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="category">Industry/Category</Label>
            <Input
              id="category"
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              placeholder="e.g., Food & Beverages, Electronics, Fashion"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Business Description</Label>
          <Textarea
            id="description"
            value={formData.businessDescription}
            onChange={(e) => setFormData({ ...formData, businessDescription: e.target.value })}
            placeholder="Brief description of your business and what you sell..."
            rows={3}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="target-audience">Target Audience</Label>
            <Select
              value={formData.targetAudience}
              onValueChange={(value) => setFormData({ ...formData, targetAudience: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Retailers and businesses">Retailers & Businesses</SelectItem>
                <SelectItem value="Small shop owners">Small Shop Owners</SelectItem>
                <SelectItem value="Restaurant owners">Restaurant Owners</SelectItem>
                <SelectItem value="Online sellers">Online Sellers</SelectItem>
                <SelectItem value="Local businesses">Local Businesses</SelectItem>
                <SelectItem value="International buyers">International Buyers</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="style">Style Preference</Label>
            <Select
              value={formData.style}
              onValueChange={(value) => setFormData({ ...formData, style: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Professional and trustworthy">Professional & Trustworthy</SelectItem>
                <SelectItem value="Friendly and approachable">Friendly & Approachable</SelectItem>
                <SelectItem value="Modern and innovative">Modern & Innovative</SelectItem>
                <SelectItem value="Reliable and established">Reliable & Established</SelectItem>
                <SelectItem value="Value-focused and affordable">Value-focused & Affordable</SelectItem>
                <SelectItem value="Premium and exclusive">Premium & Exclusive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            onClick={handleGenerate}
            disabled={generateMutation.isPending}
            className="bg-green-600 hover:bg-green-700"
          >
            {generateMutation.isPending ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Generate Taglines
              </>
            )}
          </Button>
          <Button
            onClick={() => setIsOpen(false)}
            variant="outline"
          >
            Cancel
          </Button>
        </div>

        {generatedTaglines.length > 0 && (
          <div className="space-y-3 mt-6">
            <h4 className="font-medium text-sm">Generated Taglines:</h4>
            <div className="grid gap-2">
              {generatedTaglines.map((tagline, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <span className="text-sm flex-1">{tagline}</span>
                  <div className="flex gap-1">
                    <Button
                      onClick={() => handleCopyTagline(tagline, index)}
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                    >
                      {copiedIndex === index ? (
                        <Check className="h-3 w-3 text-green-600" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </Button>
                    <Button
                      onClick={() => handleSelectTagline(tagline)}
                      size="sm"
                      className="bg-green-600 hover:bg-green-700 text-xs px-2"
                    >
                      Use This
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}