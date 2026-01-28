import { useLocation, useSearch } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, ShoppingBag } from "lucide-react";
import Logo from "@/components/ui/logo";

export default function PaymentSuccess() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const orderNumber = params.get('order');

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <Card>
          <CardHeader className="text-center pb-2">
            <div className="mx-auto w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircle className="w-10 h-10 text-green-600" />
            </div>
            <CardTitle className="text-2xl text-green-600">Thank You!</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-6">
            <div>
              <p className="text-gray-600 text-lg">Your payment was successful.</p>
              {orderNumber && (
                <p className="text-gray-500 mt-2">Order: <span className="font-semibold">{orderNumber}</span></p>
              )}
            </div>

            <div className="bg-green-50 p-4 rounded-lg">
              <p className="text-sm text-green-700">
                Your supplier has been notified and will be in touch with you shortly.
              </p>
            </div>

            <Button 
              onClick={() => setLocation('/customer')}
              className="w-full bg-green-600 hover:bg-green-700 py-6 text-lg"
            >
              <ShoppingBag className="w-5 h-5 mr-2" />
              Shop Again
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
