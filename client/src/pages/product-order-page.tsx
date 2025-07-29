import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Package, Phone, ShoppingCart, MapPin, Clock } from "lucide-react";
import Logo from "@/components/ui/logo";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface Product {
  id: number;
  name: string;
  description?: string;
  price: string;
  moq: number;
  stock: number;
  category?: string;
  imageUrl?: string;
  status: string;
  wholesaler: {
    id: string;
    businessName: string;
    businessPhone?: string;
    businessAddress?: string;
    profileImageUrl?: string;
    defaultCurrency?: string;
  };
}

interface OrderData {
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  quantity: number;
  totalAmount: string;
  notes?: string;
}

export default function ProductOrderPage() {
  const params = useParams<{ id: string }>();
  const { toast } = useToast();
  const [quantity, setQuantity] = useState<number>(1);
  const [customerData, setCustomerData] = useState({
    name: '',
    phone: '',
    email: '',
    notes: ''
  });

  const { data: product, isLoading } = useQuery<Product>({
    queryKey: ["/api/marketplace/products", params?.id],
    queryFn: async (): Promise<Product> => {
      const response = await fetch(`/api/marketplace/products/${params?.id}`);
      if (!response.ok) throw new Error('Product not found');
      return await response.json();
    },
    enabled: !!params?.id,
  });

  const orderMutation = useMutation({
    mutationFn: async (orderData: OrderData) => {
      return apiRequest("POST", "/api/marketplace/orders", {
        ...orderData,
        productId: params?.id
      });
    },
    onSuccess: () => {
      toast({
        title: "Order Placed Successfully!",
        description: "Your order has been submitted. The wholesaler will contact you shortly.",
      });
      // Reset form
      setCustomerData({ name: '', phone: '', email: '', notes: '' });
      setQuantity(product?.moq || 1);
    },
    onError: (error: any) => {
      toast({
        title: "Order Failed",
        description: error.message || "Failed to place order. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleQuantityChange = (value: string) => {
    const num = parseInt(value) || 0;
    if (product && num >= product.moq && num <= product.stock) {
      setQuantity(num);
    }
  };

  const handlePlaceOrder = () => {
    if (!product || !customerData.name || !customerData.phone) {
      toast({
        title: "Missing Information",
        description: "Please fill in your name and phone number.",
        variant: "destructive",
      });
      return;
    }

    const totalAmount = (parseFloat(product.price) * quantity).toFixed(2);
    
    orderMutation.mutate({
      customerName: customerData.name,
      customerPhone: customerData.phone,
      customerEmail: customerData.email,
      quantity,
      totalAmount,
      notes: customerData.notes,
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center space-y-4">
          {/* Enhanced Loading Animation */}
          <div className="flex space-x-1">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="w-3 h-9 bg-gradient-to-t from-blue-400 to-cyan-500 rounded-full animate-bounce"
                style={{
                  animationDelay: `${i * 0.2}s`,
                  animationDuration: '1.1s'
                }}
              />
            ))}
          </div>
          <p className="text-sm text-gray-500 text-center">Loading product details...</p>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="text-center p-8">
            <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h1 className="text-xl font-semibold mb-2">Product Not Found</h1>
            <p className="text-gray-600 mb-4">The product you're looking for is not available.</p>
            <Button onClick={() => window.location.href = '/marketplace'} variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Browse Products
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currencySymbol = product.wholesaler.defaultCurrency === 'GBP' ? '£' : 
                        product.wholesaler.defaultCurrency === 'EUR' ? '€' : '$';
  const totalPrice = (parseFloat(product.price) * quantity).toFixed(2);
  const minQuantity = product.moq;
  const maxQuantity = product.stock;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Logo size="sm" variant="full" />
              <span className="text-gray-400">|</span>
              <span className="text-sm text-gray-600">Product Order</span>
            </div>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => window.location.href = '/marketplace'}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Marketplace
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-2 gap-8">
          {/* Product Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Package className="w-5 h-5" />
                <span>Product Details</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Product Image */}
              {product.imageUrl && (
                <div className="relative">
                  <img 
                    src={product.imageUrl} 
                    alt={product.name}
                    className="w-full h-48 object-cover rounded-lg"
                  />
                  <Badge 
                    className="absolute top-2 right-2" 
                    variant={product.status === 'active' ? 'default' : 'secondary'}
                  >
                    {product.status}
                  </Badge>
                </div>
              )}
              
              {/* Product Info */}
              <div>
                <h1 className="text-2xl font-bold mb-2">{product.name}</h1>
                {product.category && (
                  <Badge variant="outline" className="mb-3">{product.category}</Badge>
                )}
                {product.description && (
                  <p className="text-gray-600 mb-4">{product.description}</p>
                )}
              </div>

              {/* Pricing & Stock */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Unit Price:</span>
                  <span className="text-2xl font-bold text-primary">
                    {currencySymbol}{parseFloat(product.price).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Min Order Quantity:</span>
                  <span className="font-medium">{product.moq.toLocaleString()} units</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Available Stock:</span>
                  <span className="font-medium">{product.stock.toLocaleString()} units</span>
                </div>
              </div>

              <Separator />

              {/* Wholesaler Info */}
              <div>
                <h3 className="font-semibold mb-3 flex items-center">
                  <MapPin className="w-4 h-4 mr-2" />
                  Supplier Information
                </h3>
                <div className="space-y-2">
                  <div className="flex items-center space-x-3">
                    {product.wholesaler.profileImageUrl ? (
                      <img 
                        src={product.wholesaler.profileImageUrl} 
                        alt={product.wholesaler.businessName}
                        className="w-10 h-10 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                        <span className="text-primary font-medium">
                          {product.wholesaler.businessName.charAt(0)}
                        </span>
                      </div>
                    )}
                    <div>
                      <p className="font-medium">{product.wholesaler.businessName}</p>
                      {product.wholesaler.businessPhone && (
                        <p className="text-sm text-gray-600 flex items-center">
                          <Phone className="w-3 h-3 mr-1" />
                          {product.wholesaler.businessPhone}
                        </p>
                      )}
                    </div>
                  </div>
                  {product.wholesaler.businessAddress && (
                    <p className="text-sm text-gray-600 pl-13">
                      {product.wholesaler.businessAddress}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Order Form */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <ShoppingCart className="w-5 h-5" />
                <span>Place Your Order</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Quantity Selection */}
              <div>
                <Label htmlFor="quantity">Quantity</Label>
                <div className="flex items-center space-x-2 mt-1">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => handleQuantityChange((quantity - 1).toString())}
                    disabled={quantity <= minQuantity}
                  >
                    -
                  </Button>
                  <Input
                    id="quantity"
                    type="number"
                    min={minQuantity}
                    max={maxQuantity}
                    value={quantity}
                    onChange={(e) => handleQuantityChange(e.target.value)}
                    className="text-center max-w-24"
                  />
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => handleQuantityChange((quantity + 1).toString())}
                    disabled={quantity >= maxQuantity}
                  >
                    +
                  </Button>
                </div>
                <p className="text-xs text-gray-600 mt-1">
                  Min: {minQuantity.toLocaleString()}, Max: {maxQuantity.toLocaleString()} units
                </p>
              </div>

              {/* Total Price */}
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Total Amount:</span>
                  <span className="text-2xl font-bold text-primary">
                    {currencySymbol}{totalPrice}
                  </span>
                </div>
                <p className="text-sm text-gray-600 mt-1">
                  {quantity.toLocaleString()} units × {currencySymbol}{parseFloat(product.price).toFixed(2)}
                </p>
              </div>

              <Separator />

              {/* Customer Information */}
              <div className="space-y-4">
                <h3 className="font-semibold">Your Information</h3>
                
                <div>
                  <Label htmlFor="customerName">Full Name *</Label>
                  <Input
                    id="customerName"
                    value={customerData.name}
                    onChange={(e) => setCustomerData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Enter your full name"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="customerPhone">Phone Number *</Label>
                  <Input
                    id="customerPhone"
                    value={customerData.phone}
                    onChange={(e) => setCustomerData(prev => ({ ...prev, phone: e.target.value }))}
                    placeholder="+1234567890"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="customerEmail">Email (Optional)</Label>
                  <Input
                    id="customerEmail"
                    type="email"
                    value={customerData.email}
                    onChange={(e) => setCustomerData(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="your@email.com"
                  />
                </div>

                <div>
                  <Label htmlFor="notes">Special Notes (Optional)</Label>
                  <Textarea
                    id="notes"
                    value={customerData.notes}
                    onChange={(e) => setCustomerData(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="Any special requirements or delivery instructions..."
                    rows={3}
                  />
                </div>
              </div>

              {/* Order Button */}
              <Button 
                onClick={handlePlaceOrder}
                disabled={orderMutation.isPending || !customerData.name || !customerData.phone}
                className="w-full"
                size="lg"
              >
                {orderMutation.isPending ? (
                  <>
                    <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                    Placing Order...
                  </>
                ) : (
                  <>
                    <ShoppingCart className="w-4 h-4 mr-2" />
                    Place Order - {currencySymbol}{totalPrice}
                  </>
                )}
              </Button>

              {/* Disclaimer */}
              <div className="text-xs text-gray-600 space-y-1">
                <p className="flex items-center">
                  <Clock className="w-3 h-3 mr-1" />
                  The supplier will contact you within 24 hours to confirm your order.
                </p>
                <p>Payment terms and delivery details will be discussed directly with the supplier.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-16 bg-white border-t">
        <div className="max-w-4xl mx-auto px-4 py-6 text-center">
          <div className="flex items-center justify-center space-x-2 text-gray-600">
            <span>Powered by</span>
            <Logo size="sm" variant="full" />
          </div>
        </div>
      </div>
    </div>
  );
}