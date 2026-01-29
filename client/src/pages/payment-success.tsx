import { useLocation, useSearch } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, Bell, History, Tag, MessageCircle, Lock, ArrowRight } from "lucide-react";
import Logo from "@/components/ui/logo";

export default function PaymentSuccess() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const orderNumber = params.get('order');

  const benefits = [
    {
      icon: Bell,
      title: "Stock Updates",
      description: "Get notified when new products arrive or items are back in stock"
    },
    {
      icon: History,
      title: "Easy Reordering",
      description: "View your order history and quickly reorder your favourites"
    },
    {
      icon: Tag,
      title: "Exclusive Deals",
      description: "Access special promotions and discounts from your wholesaler"
    },
    {
      icon: MessageCircle,
      title: "Direct Communication",
      description: "Stay connected with your supplier for quotes and enquiries"
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <Card className="border-0 shadow-xl">
          <CardHeader className="text-center pb-4">
            <div className="mx-auto w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircle className="w-10 h-10 text-green-600" />
            </div>
            <CardTitle className="text-2xl text-green-600">Welcome to Quikpik!</CardTitle>
            <p className="text-gray-600 mt-2">Thank you for your order</p>
            {orderNumber && (
              <p className="text-sm text-gray-500 mt-1">
                Order Reference: <span className="font-semibold text-gray-700">{orderNumber}</span>
              </p>
            )}
          </CardHeader>
          
          <CardContent className="space-y-6">
            <div className="bg-green-50 border border-green-100 p-4 rounded-lg text-center">
              <p className="text-green-700 font-semibold">
                You're now registered!
              </p>
              <p className="text-sm text-green-600 mt-1">
                Your account is ready to use
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="font-semibold text-gray-800 text-center">
                Your Account Benefits
              </h3>
              
              <div className="space-y-3">
                {benefits.map((benefit, index) => (
                  <div key={index} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                    <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <benefit.icon className="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-800">{benefit.title}</p>
                      <p className="text-xs text-gray-500">{benefit.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-2">
              <Button 
                onClick={() => setLocation('/customer')}
                className="w-full bg-green-600 hover:bg-green-700 py-6 text-lg"
              >
                <Lock className="w-5 h-5 mr-2" />
                Log In to Your Account
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
              <p className="text-xs text-gray-500 text-center mt-3">
                Secure login using your registered phone number
              </p>
            </div>
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
