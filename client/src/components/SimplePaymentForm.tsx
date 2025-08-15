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
  items: Array<{
    productId: number;
    quantity: number;
    unitPrice: number;
  }>;
  customerData: any;
  wholesalerId: string;
  customerEmail: string;
  customerName: string;
  shippingData: any;
  onSuccess: (result: any) => void;
  onError: (error: any) => void;
}

function CheckoutForm({ onSuccess, onError, clientSecret }: { onSuccess: (result: any) => void; onError: (error: any) => void; clientSecret: string }) {
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

    const { error, paymentIntent } = await stripe.confirmPayment({
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
      onError(error);
    } else {
      onSuccess(paymentIntent);
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
        {isLoading ? "Processing..." : "Complete Payment"}
      </Button>
    </form>
  );
}

export default function SimplePaymentForm({ 
  items,
  customerData, 
  wholesalerId,
  customerEmail,
  customerName,
  shippingData,
  onSuccess,
  onError
}: SimplePaymentFormProps) {
  const [clientSecret, setClientSecret] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Create payment intent when component mounts
    fetch("/api/marketplace/create-payment-intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items,
        customerData,
        wholesalerId,
        customerEmail,
        customerName,
        shippingData
      }),
    })
      .then(res => res.json())
      .then(data => {
        if (data.clientSecret) {
          setClientSecret(data.clientSecret);
        } else {
          console.error('No clientSecret in response:', data);
          onError(new Error(data.message || 'Failed to create payment intent'));
        }
        setLoading(false);
      })
      .catch(error => {
        console.error('Error creating payment intent:', error);
        onError(error);
        setLoading(false);
      });
  }, [items, customerData, wholesalerId, customerEmail, customerName, shippingData]);

  const appearance = {
    theme: 'stripe' as const,
  };

  const options = {
    clientSecret,
    appearance,
  };

  if (loading) {
    return <div className="p-4 text-center">Loading payment form...</div>;
  }

  if (!clientSecret) {
    return <div className="p-4 text-center text-red-600">Error loading payment form</div>;
  }

  return (
    <Elements options={options} stripe={stripePromise}>
      <CheckoutForm onSuccess={onSuccess} onError={onError} clientSecret={clientSecret} />
    </Elements>
  );
}