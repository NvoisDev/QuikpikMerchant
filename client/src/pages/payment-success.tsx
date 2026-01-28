import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, Loader2, AlertCircle } from "lucide-react";
import Logo from "@/components/ui/logo";

interface OrderDetails {
  orderNumber: string;
  total: string;
  amountPaid: string;
  amountOutstanding: string;
  paymentStatus: string;
}

export default function PaymentSuccess() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const orderNumber = params.get('order');
  const sessionId = params.get('session_id');
  
  const [order, setOrder] = useState<OrderDetails | null>(null);
  const [loading, setLoading] = useState(!!orderNumber);

  useEffect(() => {
    const fetchOrder = async () => {
      if (!orderNumber) {
        setLoading(false);
        return;
      }

      try {
        const url = sessionId 
          ? `/api/orders/by-number/${orderNumber}?session_id=${sessionId}`
          : `/api/orders/by-number/${orderNumber}`;
        const response = await fetch(url);
        if (response.ok) {
          const data = await response.json();
          setOrder(data);
        }
      } catch (err) {
        console.error('Error fetching order:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchOrder();
  }, [orderNumber]);

  const hasOutstandingBalance = order && parseFloat(order.amountOutstanding || '0') > 0;

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <CardTitle className="text-green-600">Payment Successful!</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            {loading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : (
              <>
                {orderNumber && (
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <p className="text-sm text-gray-500">Order Number</p>
                    <p className="font-semibold text-lg">{orderNumber}</p>
                  </div>
                )}

                {order && (
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between py-1 border-b">
                      <span className="text-gray-600">Order Total</span>
                      <span className="font-medium">£{parseFloat(order.total || '0').toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b">
                      <span className="text-gray-600">Amount Paid</span>
                      <span className="font-medium text-green-600">£{parseFloat(order.amountPaid || '0').toFixed(2)}</span>
                    </div>
                    {hasOutstandingBalance && (
                      <div className="flex justify-between py-1">
                        <span className="text-gray-600">Outstanding Balance</span>
                        <span className="font-medium text-amber-600">£{parseFloat(order.amountOutstanding).toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                )}

                {hasOutstandingBalance ? (
                  <div className="bg-amber-50 p-4 rounded-lg">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                      <div className="text-left">
                        <p className="text-sm font-medium text-amber-800">Balance Due</p>
                        <p className="text-sm text-amber-700">
                          You have an outstanding balance of £{parseFloat(order!.amountOutstanding).toFixed(2)}. 
                          The wholesaler will send you a payment link to complete your order.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-green-50 p-4 rounded-lg">
                    <p className="text-sm text-green-700">
                      Your payment is complete! The wholesaler will receive your order details
                      and will contact you soon regarding delivery.
                    </p>
                  </div>
                )}

                <Button 
                  onClick={() => setLocation('/customer')}
                  className="w-full bg-green-600 hover:bg-green-700"
                >
                  Continue Shopping
                </Button>
              </>
            )}
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
