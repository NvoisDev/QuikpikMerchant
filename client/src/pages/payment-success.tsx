import { useEffect } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle } from "lucide-react";
import Logo from "@/components/ui/logo";

export default function PaymentSuccess() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="max-w-md w-full mx-4">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <CardTitle className="text-green-600">Payment Successful!</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-gray-600">
              Your order has been processed successfully. The wholesaler will receive your order details
              and will contact you soon regarding delivery.
            </p>
            
            <div className="bg-green-50 p-4 rounded-lg">
              <p className="text-sm text-green-700">
                You will receive an email confirmation shortly with your order details.
              </p>
            </div>

            <Button 
              onClick={() => setLocation('/customer')}
              className="w-full bg-green-600 hover:bg-green-700"
            >
              Continue Shopping
            </Button>
          </CardContent>
        </Card>

        {/* Footer */}
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