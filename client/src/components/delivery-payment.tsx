import { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Truck, CreditCard } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

// Use shared stripePromise to prevent conflicts - will be passed as prop

interface DeliveryPaymentFormProps {
  orderId: number;
  deliveryCost: number;
  customerEmail: string;
  orderNumber: string;
  onSuccess: () => void;
  onCancel: () => void;
}

const DeliveryPaymentForm = ({ orderId, deliveryCost, customerEmail, orderNumber, onSuccess, onCancel }: DeliveryPaymentFormProps) => {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsProcessing(true);

    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/payment-success`,
        },
        redirect: "if_required",
      });

      if (error) {
        console.error('💳 DELIVERY PAYMENT ERROR:', error);
        toast({
          title: "Delivery Payment Failed",
          description: error.message || "Unable to process delivery payment. Please try again.",
          variant: "destructive",
        });
      } else if (paymentIntent && paymentIntent.status === 'succeeded') {
        console.log(`✅ DELIVERY PAYMENT SUCCESS: £${deliveryCost} collected for order ${orderNumber}`);
        toast({
          title: "Delivery Payment Successful",
          description: `Delivery fee of £${deliveryCost} has been processed successfully.`,
        });
        onSuccess();
      }
    } catch (error: any) {
      console.error('💳 DELIVERY PAYMENT EXCEPTION:', error);
      toast({
        title: "Delivery Payment Failed",
        description: "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    }

    setIsProcessing(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PaymentElement />
      <div className="flex gap-3">
        <Button 
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isProcessing}
          className="flex-1"
        >
          Cancel
        </Button>
        <Button 
          type="submit" 
          disabled={!stripe || isProcessing} 
          className="flex-1 bg-green-600 hover:bg-green-700"
        >
          {isProcessing ? "Processing..." : `Pay £${deliveryCost} Delivery`}
        </Button>
      </div>
    </form>
  );
};

interface DeliveryPaymentComponentProps {
  orderId: number;
  deliveryCost: number;
  customerEmail: string;
  orderNumber: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export const DeliveryPaymentComponent = ({ 
  orderId, 
  deliveryCost, 
  customerEmail, 
  orderNumber, 
  onSuccess, 
  onCancel 
}: DeliveryPaymentComponentProps) => {
  const [clientSecret, setClientSecret] = useState("");
  const [isCreatingIntent, setIsCreatingIntent] = useState(false);
  const { toast } = useToast();

  // Create delivery payment intent
  useState(() => {
    const createDeliveryPaymentIntent = async () => {
      if (isCreatingIntent || clientSecret) return;
      
      setIsCreatingIntent(true);
      console.log(`💳 DELIVERY: Creating separate payment intent for £${deliveryCost} delivery (Order ${orderNumber})`);
      
      try {
        const response = await apiRequest("POST", "/api/platform/collect-delivery-fee", {
          orderId,
          deliveryCost,
          customerEmail,
          orderNumber
        });
        
        const data = await response.json();
        setClientSecret(data.deliveryPaymentClientSecret);
        console.log('✅ DELIVERY: Payment intent created successfully');
      } catch (error: any) {
        console.error('❌ DELIVERY: Failed to create payment intent:', error);
        toast({
          title: "Setup Failed",
          description: "Unable to initialize delivery payment. Please try again.",
          variant: "destructive",
        });
        onCancel();
      }
      
      setIsCreatingIntent(false);
    };

    createDeliveryPaymentIntent();
  });

  if (!clientSecret) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Truck className="w-5 h-5" />
            Setting up Delivery Payment
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-4">
            <div className="flex justify-center mb-3">
              {[...Array(3)].map((_, i) => (
                <div
                  key={i}
                  className="w-2 h-7 bg-gradient-to-t from-green-400 to-emerald-500 rounded-full animate-bounce mx-1"
                  style={{
                    animationDelay: `${i * 0.2}s`,
                    animationDuration: '1.2s'
                  }}
                />
              ))}
            </div>
            <p className="text-sm text-gray-600">Preparing delivery payment...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Truck className="w-5 h-5 text-blue-600" />
          Pay Delivery Fee
        </CardTitle>
        <p className="text-sm text-gray-600">
          Your product order was successful! Now pay the delivery fee to complete your order.
        </p>
      </CardHeader>
      <CardContent>
        <div className="mb-4 p-4 bg-blue-50 rounded-lg">
          <div className="flex items-center justify-between">
            <span className="font-medium">Delivery Cost:</span>
            <span className="text-lg font-bold text-blue-600">£{deliveryCost}</span>
          </div>
          <p className="text-xs text-blue-600 mt-1">Order #{orderNumber}</p>
        </div>
        
        <Elements 
          stripe={stripePromise} 
          options={{ clientSecret }}
        >
          <DeliveryPaymentForm
            orderId={orderId}
            deliveryCost={deliveryCost}
            customerEmail={customerEmail}
            orderNumber={orderNumber}
            onSuccess={onSuccess}
            onCancel={onCancel}
          />
        </Elements>
      </CardContent>
    </Card>
  );
};

export default DeliveryPaymentComponent;