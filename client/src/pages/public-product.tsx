import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { 
  Star, 
  MapPin, 
  Package, 
  Truck, 
  Phone, 
  Mail, 
  ExternalLink,
  Share2,
  Heart,
  ShoppingCart,
  Eye,
  MessageCircle
} from "lucide-react";
import { formatCurrency } from "@/lib/currencies";

interface PublicProduct {
  id: string;
  name: string;
  description: string;
  price: string;
  category: string;
  images: string[];
  wholesaler: {
    id: string;
    businessName: string;
    location: string;
    rating: number;
    totalReviews: number;
    profileImage?: string;
    phoneNumber?: string;
    email?: string;
  };
  specifications: {
    [key: string]: string;
  };
  availability: string;
  minOrderQuantity: number;
  views: number;
  lastUpdated: string;
}

// SEO-optimized public product page for search engines
export default function PublicProductPage() {
  const [match, params] = useRoute("/product/:slug");
  const [inquiryForm, setInquiryForm] = useState({
    name: "",
    email: "",
    phone: "",
    company: "",
    message: "",
    quantity: ""
  });
  const [inquirySubmitted, setInquirySubmitted] = useState(false);

  const { data: product, isLoading } = useQuery<PublicProduct>({
    queryKey: [`/api/public/products/${params?.slug}`],
    queryFn: async () => {
      const response = await fetch(`/api/public/products/${params?.slug}`);
      if (!response.ok) throw new Error("Product not found");
      return response.json();
    },
    enabled: !!params?.slug,
  });

  // Update page title and meta description for SEO
  useEffect(() => {
    if (product) {
      document.title = `${product.name} - Wholesale Supplier | Quikpik`;
      
      const metaDescription = document.querySelector('meta[name="description"]');
      if (metaDescription) {
        metaDescription.setAttribute('content', 
          `Premium ${product.name} available for wholesale from ${product.wholesaler.businessName}. ${product.description.slice(0, 120)}...`
        );
      }
    }
  }, [product]);

  const handleInquirySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const response = await fetch(`/api/public/products/${params?.slug}/inquiry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inquiryForm)
      });
      
      if (response.ok) {
        setInquirySubmitted(true);
      }
    } catch (error) {
      console.error('Failed to submit inquiry:', error);
    }
  };

  const handleShare = async () => {
    const shareData = {
      title: product?.name || 'Product',
      text: `Check out ${product?.name} from ${product?.wholesaler.businessName}`,
      url: window.location.href
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (error) {
        // Fallback to clipboard copy
        navigator.clipboard.writeText(window.location.href);
      }
    } else {
      navigator.clipboard.writeText(window.location.href);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="animate-pulse space-y-8">
            <div className="bg-gray-200 rounded-lg h-96"></div>
            <div className="bg-gray-200 rounded-lg h-64"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-600 mb-2">Product Not Found</h2>
          <p className="text-gray-500">The product you're looking for doesn't exist or has been removed.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-blue-600">Quikpik</h1>
              <Badge variant="outline">Wholesale Marketplace</Badge>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={handleShare}>
                <Share2 className="w-4 h-4 mr-2" />
                Share
              </Button>
              <Button variant="outline" size="sm">
                <Heart className="w-4 h-4 mr-2" />
                Save
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Product Images */}
          <div className="space-y-4">
            <div className="aspect-square bg-white rounded-lg border overflow-hidden">
              {product.images.length > 0 ? (
                <img 
                  src={product.images[0]} 
                  alt={product.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gray-100">
                  <Package className="w-24 h-24 text-gray-400" />
                </div>
              )}
            </div>
            
            {product.images.length > 1 && (
              <div className="grid grid-cols-4 gap-2">
                {product.images.slice(1, 5).map((image, index) => (
                  <div key={index} className="aspect-square bg-white rounded border overflow-hidden">
                    <img 
                      src={image} 
                      alt={`${product.name} ${index + 2}`}
                      className="w-full h-full object-cover cursor-pointer hover:opacity-80"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Product Information */}
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">{product.name}</h1>
              <div className="flex items-center gap-4 mb-4">
                <Badge variant="secondary">{product.category}</Badge>
                <div className="flex items-center gap-1 text-sm text-gray-600">
                  <Eye className="w-4 h-4" />
                  {product.views.toLocaleString()} views
                </div>
              </div>
              
              <div className="text-3xl font-bold text-green-600 mb-4">
                {formatCurrency(parseFloat(product.price), 'GBP')}
                <span className="text-sm font-normal text-gray-500 ml-2">per unit</span>
              </div>
              
              <p className="text-gray-700 text-lg leading-relaxed">{product.description}</p>
            </div>

            {/* Availability & MOQ */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                <h3 className="font-semibold text-green-800 mb-1">Availability</h3>
                <p className="text-green-700">{product.availability}</p>
              </div>
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <h3 className="font-semibold text-blue-800 mb-1">Min. Order</h3>
                <p className="text-blue-700">{product.minOrderQuantity} units</p>
              </div>
            </div>

            {/* Supplier Information */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Supplier Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                    <Package className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{product.wholesaler.businessName}</h3>
                    <div className="flex items-center gap-4 text-sm text-gray-600">
                      <div className="flex items-center gap-1">
                        <MapPin className="w-4 h-4" />
                        {product.wholesaler.location}
                      </div>
                      <div className="flex items-center gap-1">
                        <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                        {product.wholesaler.rating} ({product.wholesaler.totalReviews} reviews)
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="flex gap-2 pt-2">
                  {product.wholesaler.phoneNumber && (
                    <Button variant="outline" size="sm" className="flex-1">
                      <Phone className="w-4 h-4 mr-2" />
                      Call
                    </Button>
                  )}
                  <Button size="sm" className="flex-1">
                    <MessageCircle className="w-4 h-4 mr-2" />
                    Inquire
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Product Specifications */}
        {Object.keys(product.specifications).length > 0 && (
          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Product Specifications</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.entries(product.specifications).map(([key, value]) => (
                  <div key={key} className="flex justify-between py-2 border-b">
                    <span className="font-medium text-gray-600">{key}:</span>
                    <span className="text-gray-900">{value}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Inquiry Form */}
        <Card>
          <CardHeader>
            <CardTitle>Request a Quote</CardTitle>
            <p className="text-gray-600">Get in touch with the supplier for pricing and availability</p>
          </CardHeader>
          <CardContent>
            {inquirySubmitted ? (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <MessageCircle className="w-8 h-8 text-green-600" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Inquiry Sent!</h3>
                <p className="text-gray-600">The supplier will contact you within 24 hours.</p>
              </div>
            ) : (
              <form onSubmit={handleInquirySubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Your Name *
                    </label>
                    <Input
                      type="text"
                      required
                      value={inquiryForm.name}
                      onChange={(e) => setInquiryForm(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Enter your full name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Email Address *
                    </label>
                    <Input
                      type="email"
                      required
                      value={inquiryForm.email}
                      onChange={(e) => setInquiryForm(prev => ({ ...prev, email: e.target.value }))}
                      placeholder="your@email.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Phone Number
                    </label>
                    <Input
                      type="tel"
                      value={inquiryForm.phone}
                      onChange={(e) => setInquiryForm(prev => ({ ...prev, phone: e.target.value }))}
                      placeholder="+44 123 456 7890"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Company Name
                    </label>
                    <Input
                      type="text"
                      value={inquiryForm.company}
                      onChange={(e) => setInquiryForm(prev => ({ ...prev, company: e.target.value }))}
                      placeholder="Your business name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Quantity Needed
                    </label>
                    <Input
                      type="number"
                      value={inquiryForm.quantity}
                      onChange={(e) => setInquiryForm(prev => ({ ...prev, quantity: e.target.value }))}
                      placeholder="e.g., 100"
                      min={product.minOrderQuantity}
                    />
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Message *
                  </label>
                  <Textarea
                    required
                    rows={4}
                    value={inquiryForm.message}
                    onChange={(e) => setInquiryForm(prev => ({ ...prev, message: e.target.value }))}
                    placeholder="Please include any specific requirements or questions about this product..."
                  />
                </div>
                
                <Button type="submit" size="lg" className="w-full">
                  <MessageCircle className="w-4 h-4 mr-2" />
                  Send Inquiry
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
      
      {/* Footer */}
      <footer className="bg-white border-t mt-16">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="text-center">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Powered by Quikpik</h3>
            <p className="text-gray-600 mb-4">
              The UK's leading B2B wholesale marketplace connecting suppliers with retailers
            </p>
            <Button variant="outline">
              <ExternalLink className="w-4 h-4 mr-2" />
              Visit Quikpik.co.uk
            </Button>
          </div>
        </div>
      </footer>
    </div>
  );
}