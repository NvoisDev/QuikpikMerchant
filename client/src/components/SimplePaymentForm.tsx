import React, { useState, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements
} from '@stripe/react-stripe-js';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

// Initialize Stripe
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY!);

interface SimplePaymentFormProps {
  cart: any[];
  customerData: any;
  wholesaler: any;
  totalAmount: number;
  onSuccess: () => void;
}

function CheckoutForm({ onSuccess, totalAmount }: { onSuccess: () => void; totalAmount: number }) {
  const stripe = useStripe();
  const elements = useElements();
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setIsLoading(true);

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/payment-success`,
      },
      redirect: "if_required",
    });

    if (error) {
      toast({
        title: "Payment failed",
        description: error.message,
        variant: "destructive",
      });
    } else {
      onSuccess();
    }

    setIsLoading(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />
      <Button 
        disabled={!stripe || isLoading} 
        className="w-full"
        type="submit"
      >
        {isLoading ? "Processing..." : `Pay £${totalAmount.toFixed(2)}`}
      </Button>
    </form>
  );
}

export default function SimplePaymentForm({ 
  cart, 
  customerData, 
  wholesaler, 
  totalAmount, 
  onSuccess 
}: SimplePaymentFormProps) {
  const [clientSecret, setClientSecret] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    // Create PaymentIntent as soon as the component mounts
    fetch("/api/marketplace/create-payment-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: cart.map(item => ({
          productId: item.product.id,
          quantity: item.quantity,
          unitPrice: parseFloat(item.product.price || "0")
        })),
        customerData,
        wholesalerId: wholesaler.id,
        customerEmail: customerData.email,
        customerName: customerData.name,
        shippingData: {
          option: customerData.shippingOption,
          service: customerData.selectedShippingService,
          address: {
            name: customerData.name,
            email: customerData.email,
            phone: customerData.phone,
            address: customerData.address,
            city: customerData.city,
            state: customerData.state,
            postalCode: customerData.postalCode,
            country: customerData.country
          }
        }
      }),
    })
    .then((res) => res.json())
    .then((data) => {
      console.log('Payment intent created:', data);
      setClientSecret(data.clientSecret);
    })
    .catch((error) => {
      console.error('Error creating payment intent:', error);
      toast({
        title: "Setup Error",
        description: "Unable to initialize payment. Please try again.",
        variant: "destructive",
      });
    });
  }, []);

  const appearance = {
    theme: 'stripe' as const,
  };
  
  const options = {
    clientSecret,
    appearance,
  };

  return (
    <div className="max-w-md mx-auto">
      {clientSecret ? (
        <Elements options={options} stripe={stripePromise}>
          <CheckoutForm onSuccess={onSuccess} totalAmount={totalAmount} />
        </Elements>
      ) : (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-sm text-gray-600">Setting up payment...</p>
        </div>
      )}
    </div>
  );
}