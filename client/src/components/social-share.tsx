import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Share2, Facebook, Twitter, Linkedin, Instagram, Copy, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Product {
  id: number;
  name: string;
  description?: string;
  price: string;
  imageUrl?: string;
  category?: string;
  wholesaler?: {
    businessName: string;
  };
}

interface SocialShareProps {
  product: Product;
  wholesalerName?: string;
  className?: string;
}

export function SocialShare({ product, wholesalerName, className = "" }: SocialShareProps) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  // Generate dynamic share content
  const shareTitle = `${product.name} - Wholesale from ${wholesalerName || product.wholesaler?.businessName || 'Quikpik'}`;
  const shareDescription = product.description 
    ? `${product.description.slice(0, 120)}...` 
    : `Quality wholesale ${product.name} available now. Starting from £${product.price}`;
  
  const shareUrl = `${window.location.origin}/product/${product.id}`;
  const shareImage = product.imageUrl || `${window.location.origin}/api/product-preview/${product.id}`;

  // Platform-specific sharing URLs
  const shareLinks = {
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}&quote=${encodeURIComponent(shareTitle)}`,
    twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareTitle)}&url=${encodeURIComponent(shareUrl)}&hashtags=wholesale,b2b,${product.category?.toLowerCase() || 'products'}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}&title=${encodeURIComponent(shareTitle)}&summary=${encodeURIComponent(shareDescription)}`,
    whatsapp: `https://wa.me/?text=${encodeURIComponent(`${shareTitle}\n\n${shareDescription}\n\n${shareUrl}`)}`,
    instagram: shareUrl // Instagram requires manual sharing
  };

  const handleShare = (platform: string) => {
    if (platform === 'copy') {
      handleCopyLink();
      return;
    }

    const link = shareLinks[platform as keyof typeof shareLinks];
    if (link) {
      if (platform === 'instagram') {
        // Instagram doesn't support URL sharing, copy link instead
        handleCopyLink();
        toast({
          title: "Link Copied",
          description: "Paste this link in your Instagram story or post",
        });
      } else {
        window.open(link, '_blank', 'width=600,height=400');
      }
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({
        title: "Link Copied",
        description: "Product link copied to clipboard",
      });
    } catch (error) {
      toast({
        title: "Copy Failed",
        description: "Failed to copy link to clipboard",
        variant: "destructive",
      });
    }
  };

  const platforms = [
    { name: 'Facebook', icon: Facebook, key: 'facebook', color: 'hover:bg-blue-50 hover:text-blue-600' },
    { name: 'Twitter', icon: Twitter, key: 'twitter', color: 'hover:bg-sky-50 hover:text-sky-600' },
    { name: 'LinkedIn', icon: Linkedin, key: 'linkedin', color: 'hover:bg-blue-50 hover:text-blue-700' },
    { name: 'WhatsApp', icon: Share2, key: 'whatsapp', color: 'hover:bg-green-50 hover:text-green-600' },
    { name: 'Instagram', icon: Instagram, key: 'instagram', color: 'hover:bg-pink-50 hover:text-pink-600' },
  ];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={className}>
          <Share2 className="h-4 w-4 mr-2" />
          Share
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-4">
        <div className="space-y-4">
          {/* Preview Card */}
          <div className="border rounded-lg p-3 bg-gray-50">
            <div className="flex space-x-3">
              {product.imageUrl && (
                <div className="flex-shrink-0">
                  <img 
                    src={product.imageUrl} 
                    alt={product.name}
                    className="w-16 h-16 object-cover rounded"
                  />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-sm text-gray-900 truncate">
                  {product.name}
                </h4>
                <p className="text-sm text-gray-600 mt-1">
                  From £{product.price}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  {wholesalerName || product.wholesaler?.businessName || 'Quikpik Merchant'}
                </p>
              </div>
            </div>
          </div>

          {/* Share Buttons */}
          <div className="space-y-2">
            <h5 className="font-medium text-sm text-gray-900">Share on:</h5>
            <div className="grid grid-cols-2 gap-2">
              {platforms.map((platform) => {
                const IconComponent = platform.icon;
                return (
                  <Button
                    key={platform.key}
                    variant="ghost"
                    size="sm"
                    className={`justify-start ${platform.color}`}
                    onClick={() => handleShare(platform.key)}
                  >
                    <IconComponent className="h-4 w-4 mr-2" />
                    {platform.name}
                  </Button>
                );
              })}
            </div>

            {/* Copy Link Button */}
            <Button
              variant="outline"
              size="sm"
              className="w-full mt-3"
              onClick={handleCopyLink}
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 mr-2 text-green-600" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy Link
                </>
              )}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}