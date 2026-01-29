import { useLocation, useSearch } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, Store, Search, ShoppingCart, ArrowRight } from "lucide-react";
import Logo from "@/components/ui/logo";

export default function PaymentSuccess() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const orderNumber = params.get('order');

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <Card className="border-0 shadow-lg">
          <CardHeader className="text-center pb-2">
            <div className="mx-auto w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircle className="w-10 h-10 text-green-600" />
            </div>
            <CardTitle className="text-2xl text-green-600">Payment Successful!</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-6">
            <div>
              <p className="text-gray-600 text-lg">Thank you for your payment.</p>
              {orderNumber && (
                <p className="text-gray-500 mt-2">Order Reference: <span className="font-semibold text-gray-700">{orderNumber}</span></p>
              )}
            </div>

            <div className="bg-green-50 border border-green-100 p-4 rounded-lg">
              <p className="text-sm text-green-700 font-medium">
                Your supplier has been notified and will prepare your order.
              </p>
            </div>

            <div className="bg-gray-50 rounded-lg p-5 text-left space-y-4">
              <h3 className="font-semibold text-gray-800 text-center mb-4">
                Ready to order more?
              </h3>
              
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <Search className="w-4 h-4 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-700 font-medium">Find Your Wholesaler</p>
                    <p className="text-xs text-gray-500">Search for your supplier by name</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <Store className="w-4 h-4 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-700 font-medium">Enter Your Phone Number</p>
                    <p className="text-xs text-gray-500">Use the same phone as your order</p>
                  </div>
                </div>
                
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <ShoppingCart className="w-4 h-4 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-700 font-medium">Start Shopping</p>
                    <p className="text-xs text-gray-500">Browse products and place orders</p>
                  </div>
                </div>
              </div>
            </div>

            <Button 
              onClick={() => setLocation('/customer')}
              className="w-full bg-green-600 hover:bg-green-700 py-6 text-lg"
            >
              <Store className="w-5 h-5 mr-2" />
              Find Your Store
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </CardContent>
        </Card>

        <div className="mt-8 text-center">
          <div className="flex items-center justify-center space-x-2 text-gray-600">
            <span>Powered by</span>
            <Logo size="sm" variant="full" />
          </div>
        </div>
      </div>
    </div>
  );
}
