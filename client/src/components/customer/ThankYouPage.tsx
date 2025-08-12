import { CheckCircle, Mail, Package, ArrowLeft, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { PromotionalPricingCalculator } from "@shared/promotional-pricing";
// Image removed for production - using icon instead

interface CartItem {
  product: {
    id: number;
    name: string;
    price: string;
    image?: string;
    promoPrice?: string;
    promoActive?: boolean;
    promotionalOffers?: any[];
    palletPrice?: string;
  };
  quantity: number;
  sellingType: "units" | "pallets";
}

interface ThankYouPageProps {
  orderNumber: string;
  cart: CartItem[];
  customerData: {
    name: string;
    email: string;
    shippingOption: "pickup" | "delivery";
    selectedShippingService?: {
      serviceName: string;
      price: number;
    };
  };
  totalAmount: number;
  subtotal: number;
  transactionFee: number;
  shippingCost?: number;
  wholesaler: {
    businessName: string;
    email: string;
    phone: string;
  };
  onContinueShopping: () => void;
  onViewOrders: () => void;
}

export const ThankYouPage = ({ 
  orderNumber, 
  cart, 
  customerData, 
  totalAmount, 
  subtotal, 
  transactionFee, 
  shippingCost = 0,
  wholesaler,
  onContinueShopping, 
  onViewOrders 
}: ThankYouPageProps) => {
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Success Header with Image */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-6">
            <div className="relative">
              <div className="w-48 h-48 rounded-2xl bg-gradient-to-br from-green-400 to-blue-500 flex items-center justify-center shadow-lg">
                <CheckCircle className="w-24 h-24 text-white" />
              </div>
              <div className="absolute -bottom-2 -right-2 w-12 h-12 bg-green-100 rounded-full flex items-center justify-center shadow-lg">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
            </div>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Thank you for your order!</h1>
          <p className="text-lg text-gray-600">
            Your order has been successfully placed and is being processed by our team.
          </p>
          <p className="text-sm text-gray-500 mt-2">
            We appreciate your business and look forward to serving you again.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Order Details */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Package className="w-5 h-5" />
                  <span>Order Details</span>
                </CardTitle>
                <div className="flex justify-between items-center text-sm text-gray-600">
                  <span>ORDER NUMBER</span>
                  <span className="font-mono font-medium">{orderNumber}</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Order Items */}
                <div className="space-y-3">
                  {cart.map((item, index) => (
                    <div key={index} className="flex justify-between items-center py-3 border-b border-gray-100 last:border-b-0">
                      <div className="flex items-center space-x-3">
                        <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                          <Package className="w-6 h-6 text-gray-400" />
                        </div>
                        <div>
                          <h4 className="font-medium text-gray-900">{item.product.name}</h4>
                          <p className="text-sm text-gray-500">
                            QTY: {item.quantity} {item.sellingType === "pallets" ? "pallets" : "units"}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">
                          £{(() => {
                            if (item.sellingType === "pallets") {
                              return (parseFloat(item.product.palletPrice || "0") * item.quantity).toFixed(2);
                            } else {
                              // CRITICAL FIX: Use promotional pricing calculation for accurate display
                              const basePrice = parseFloat(item.product.price) || 0;
                              const pricing = PromotionalPricingCalculator.calculatePromotionalPricing(
                                basePrice,
                                item.quantity,
                                item.product.promotionalOffers || [],
                                item.product.promoPrice ? parseFloat(item.product.promoPrice) : undefined,
                                item.product.promoActive
                              );
                              return pricing.totalCost.toFixed(2);
                            }
                          })()}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Order Summary - Customer Payment Details */}
                <Separator />
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Subtotal:</span>
                    <span>£{subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Transaction Fee (5.5% + £0.50):</span>
                    <span>£{(subtotal * 0.055 + 0.50).toFixed(2)}</span>
                  </div>
                  {shippingCost > 0 && (
                    <div className="flex justify-between text-sm">
                      <span>Delivery Cost:</span>
                      <span>£{shippingCost.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-semibold text-lg border-t pt-2">
                    <span>Total Paid:</span>
                    <span>£{totalAmount.toFixed(2)}</span>
                  </div>
                </div>

                {/* Collection/Delivery Info */}
                <div className="bg-blue-50 p-4 rounded-lg">
                  <h5 className="font-medium text-blue-900 mb-2">
                    {customerData.shippingOption === "pickup" ? "Collection Information" : "Delivery Information"}
                  </h5>
                  {customerData.shippingOption === "pickup" ? (
                    <p className="text-sm text-blue-800">
                      Your order will be ready for collection from {wholesaler.businessName}. 
                      You will receive a notification when your order is ready.
                    </p>
                  ) : (
                    <p className="text-sm text-blue-800">
                      Your order will be delivered via {customerData.selectedShippingService?.serviceName}. 
                      You will receive tracking information once your order is dispatched.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Email Confirmation */}
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center space-x-3 mb-4">
                  <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                    <Mail className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-900">Email Confirmation</h4>
                    <p className="text-sm text-gray-600">Sent to {customerData.email}</p>
                  </div>
                </div>
                <p className="text-sm text-gray-700">
                  A confirmation email with your order details and receipt has been sent to your email address.
                </p>
              </CardContent>
            </Card>

            {/* Contact Information */}
            <Card>
              <CardContent className="p-6">
                <h4 className="font-medium text-gray-900 mb-3">Need Help?</h4>
                <div className="space-y-2 text-sm text-gray-600">
                  <p><strong>Business:</strong> {wholesaler.businessName}</p>
                  <p><strong>Email:</strong> {wholesaler.email}</p>
                  <p><strong>Phone:</strong> {wholesaler.businessPhone || wholesaler.phone || wholesaler.phoneNumber}</p>
                </div>
              </CardContent>
            </Card>

            {/* Action Buttons */}
            <div className="space-y-3">
              <Button 
                onClick={onViewOrders} 
                className="w-full"
                size="lg"
              >
                <Package className="w-4 h-4 mr-2" />
                View My Orders
              </Button>
              <Button 
                onClick={onContinueShopping} 
                variant="outline" 
                className="w-full"
                size="lg"
              >
                <ShoppingBag className="w-4 h-4 mr-2" />
                Continue Shopping
              </Button>
            </div>
          </div>
        </div>

        {/* Back to Homepage */}
        <div className="text-center mt-8">
          <Button 
            onClick={onContinueShopping}
            variant="ghost" 
            className="text-gray-600"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Products
          </Button>
        </div>
      </div>
    </div>
  );
};