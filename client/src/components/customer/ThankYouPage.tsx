import React, { useState, useEffect } from "react";
import { CheckCircle, Mail, Package, ArrowLeft, ShoppingBag, Sparkles, Gift, PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { PromotionalPricingCalculator } from "@shared/promotional-pricing";
import { formatCurrency } from "@shared/utils/currency";
import { QuikpikFooter } from "@/components/ui/quikpik-footer";
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
  onViewOrders?: () => void;
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
  // Animation states
  const [showConfetti, setShowConfetti] = useState(true);
  const [showSuccessAnimation, setShowSuccessAnimation] = useState(true);
  const [animationStage, setAnimationStage] = useState(0);
  const [celebrationClicked, setCelebrationClicked] = useState(false);

  // Animation sequence effect
  useEffect(() => {
    const stages = [
      () => setAnimationStage(1), // Initial load
      () => setAnimationStage(2), // Success icon animation
      () => setAnimationStage(3), // Text reveal
      () => setAnimationStage(4), // Final state
    ];

    stages.forEach((stage, index) => {
      setTimeout(stage, index * 800);
    });

    // Auto-hide confetti after 5 seconds
    const confettiTimer = setTimeout(() => {
      setShowConfetti(false);
    }, 5000);

    return () => clearTimeout(confettiTimer);
  }, []);

  // Interactive celebration handler
  const handleCelebrationClick = () => {
    setCelebrationClicked(true);
    setShowConfetti(true);
    // Reset confetti after short burst
    setTimeout(() => {
      setCelebrationClicked(false);
    }, 1500);
  };

  // Confetti Animation Component
  const ConfettiAnimation = () => {
    if (!showConfetti) return null;
    
    return (
      <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
        {[...Array(40)].map((_, i) => (
          <div
            key={i}
            className={`absolute w-3 h-3 ${
              i % 5 === 0 ? 'bg-emerald-400' : 
              i % 5 === 1 ? 'bg-blue-400' : 
              i % 5 === 2 ? 'bg-yellow-400' : 
              i % 5 === 3 ? 'bg-pink-400' : 'bg-purple-400'
            } rounded-full confetti-fall`}
            style={{
              left: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 3}s`,
              animationDuration: `${3 + Math.random() * 2}s`
            }}
          />
        ))}
        {/* Add some star shapes */}
        {[...Array(15)].map((_, i) => (
          <div
            key={`star-${i}`}
            className="absolute text-yellow-400 sparkle-twinkle"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 2}s`,
              fontSize: `${12 + Math.random() * 8}px`
            }}
          >
            ✨
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 relative overflow-hidden">
      {/* Confetti Animation */}
      <ConfettiAnimation />
      
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Success Header with Enhanced Animation */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-6">
            <div 
              className={`relative cursor-pointer transition-all duration-1000 ${
                animationStage >= 2 ? 'scale-100 rotate-0' : 'scale-50 rotate-45'
              } ${celebrationClicked ? 'scale-110' : ''}`}
              onClick={handleCelebrationClick}
            >
              <div className={`w-48 h-48 rounded-2xl bg-gradient-to-br from-green-400 to-blue-500 flex items-center justify-center shadow-lg transition-all duration-700 ${
                animationStage >= 1 ? 'opacity-100 scale-100' : 'opacity-0 scale-75'
              } ${celebrationClicked ? 'shadow-2xl' : ''}`}>
                <CheckCircle className={`w-24 h-24 text-white transition-all duration-500 ${
                  animationStage >= 2 ? 'scale-100 opacity-100' : 'scale-75 opacity-0'
                }`} />
                
                {/* Sparkle effects */}
                {celebrationClicked && (
                  <>
                    <Sparkles className="absolute top-4 left-4 w-6 h-6 text-yellow-300 animate-pulse" />
                    <Sparkles className="absolute bottom-4 right-4 w-4 h-4 text-pink-300 animate-bounce" />
                    <Gift className="absolute top-4 right-4 w-5 h-5 text-purple-300 animate-pulse" />
                    <PartyPopper className="absolute bottom-4 left-4 w-5 h-5 text-blue-300 animate-bounce" />
                  </>
                )}
              </div>
              
              <div className={`absolute -bottom-2 -right-2 w-12 h-12 bg-green-100 rounded-full flex items-center justify-center shadow-lg transition-all duration-500 ${
                animationStage >= 2 ? 'opacity-100 translate-x-0 translate-y-0' : 'opacity-0 translate-x-4 translate-y-4'
              } ${celebrationClicked ? 'scale-125 bg-green-200' : ''}`}>
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>

              {/* Pulse rings */}
              <div className={`absolute inset-0 rounded-2xl bg-green-400 opacity-20 animate-ping ${
                animationStage >= 3 ? 'block' : 'hidden'
              }`}></div>
            </div>
          </div>

          <div className={`transition-all duration-1000 ${
            animationStage >= 3 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              🎉 Thank you for your order!
            </h1>
            <p className="text-lg text-gray-600">
              Your order has been successfully placed and is being processed by our team.
            </p>
            <p className="text-sm text-gray-500 mt-2">
              We appreciate your business and look forward to serving you again.
            </p>
            
            {/* Interactive celebration button */}
            <div className="mt-4">
              <Button
                onClick={handleCelebrationClick}
                variant="outline"
                className={`transition-all duration-300 ${
                  celebrationClicked 
                    ? 'bg-gradient-to-r from-emerald-500 to-blue-500 text-white border-transparent transform scale-105' 
                    : 'hover:bg-emerald-50 hover:border-emerald-300'
                } ${animationStage >= 4 ? 'opacity-100' : 'opacity-0'}`}
              >
                <PartyPopper className="w-4 h-4 mr-2" />
                Celebrate! 🎊
              </Button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Order Details */}
          <div className={`lg:col-span-2 transition-all duration-1000 ${
            animationStage >= 4 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
          }`}>
            <Card className="order-card-entrance shadow-lg hover:shadow-xl transition-shadow duration-300">
              <CardHeader className="relative">
                <CardTitle className="flex items-center space-x-2 text-lg">
                  <Package className={`w-5 h-5 transition-all duration-500 ${
                    celebrationClicked ? 'text-emerald-600 scale-110' : 'text-gray-600'
                  }`} />
                  <span>Order Details</span>
                  {celebrationClicked && (
                    <Sparkles className="w-4 h-4 text-yellow-500 animate-pulse ml-2" />
                  )}
                </CardTitle>
                <div className="flex justify-between items-center text-sm text-gray-600">
                  <span>ORDER NUMBER</span>
                  <span className={`font-mono font-medium transition-all duration-300 ${
                    celebrationClicked ? 'text-emerald-600 font-bold' : ''
                  }`}>{orderNumber}</span>
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
{(() => {
                            if (item.sellingType === "pallets") {
                              return formatCurrency(parseFloat(item.product.palletPrice || "0") * item.quantity);
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
                              return formatCurrency(pricing.totalCost);
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
                    <span>{formatCurrency(subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Transaction Fee (5.5% + £0.50):</span>
                    <span>{formatCurrency(transactionFee)}</span>
                  </div>
                  {shippingCost > 0 && (
                    <div className="flex justify-between text-sm">
                      <span>Delivery Cost:</span>
                      <span>{formatCurrency(shippingCost)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-semibold text-lg border-t pt-2">
                    <span>Total Paid:</span>
                    <span>{formatCurrency(totalAmount)}</span>
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

          {/* Animated Sidebar */}
          <div className={`space-y-6 transition-all duration-1200 ${
            animationStage >= 4 ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-6'
          }`}>
            {/* Email Confirmation */}
            <Card className={`transition-all duration-500 ${
              celebrationClicked ? 'bg-green-50 border-green-200 shadow-lg' : 'hover:shadow-md'
            }`}>
              <CardContent className="p-6">
                <div className="flex items-center space-x-3 mb-4">
                  <div className={`w-10 h-10 bg-green-100 rounded-full flex items-center justify-center transition-all duration-500 ${
                    celebrationClicked ? 'bg-green-200 scale-110' : ''
                  }`}>
                    <Mail className={`w-5 h-5 text-green-600 transition-all duration-500 ${
                      celebrationClicked ? 'scale-125' : ''
                    }`} />
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-900 flex items-center">
                      Email Confirmation
                      {celebrationClicked && (
                        <Sparkles className="w-3 h-3 text-yellow-500 animate-pulse ml-2" />
                      )}
                    </h4>
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
                  <p><strong>Phone:</strong> {wholesaler.phone}</p>
                </div>
              </CardContent>
            </Card>

            {/* Animated Action Buttons */}
            <div className="space-y-3">
              <Button 
                onClick={onViewOrders} 
                className={`w-full transition-all duration-300 ${
                  celebrationClicked 
                    ? 'bg-gradient-to-r from-emerald-500 to-blue-500 transform scale-105' 
                    : 'hover:scale-[1.02]'
                }`}
                size="lg"
              >
                <Package className="w-4 h-4 mr-2" />
                View My Orders
                {celebrationClicked && (
                  <Gift className="w-4 h-4 ml-2 animate-bounce" />
                )}
              </Button>
              <Button 
                onClick={onContinueShopping} 
                variant="outline" 
                className={`w-full transition-all duration-300 ${
                  celebrationClicked 
                    ? 'border-emerald-500 text-emerald-600 bg-emerald-50 transform scale-105' 
                    : 'hover:scale-[1.02] hover:border-emerald-300'
                }`}
                size="lg"
              >
                <ShoppingBag className="w-4 h-4 mr-2" />
                Continue Shopping
                {celebrationClicked && (
                  <PartyPopper className="w-4 h-4 ml-2 animate-pulse" />
                )}
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
        
        {/* Quikpik Footer */}
        <QuikpikFooter />
      </div>
    </div>
  );
};