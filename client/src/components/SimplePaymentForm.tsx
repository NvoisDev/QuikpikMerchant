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

function CheckoutForm({ onSuccess, onError }: { onSuccess: (result: any) => void; onError: (error: any) => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const { toast } = useToast();

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!stripe || !elements) {
      console.error('Stripe or elements not available');
      setMessage('Payment system not ready. Please try again.');
      return;
    }

    setIsLoading(true);
    setMessage(null);

    try {
      // Get the PaymentElement
      const paymentElement = elements.getElement('payment');
      if (!paymentElement) {
        console.error('PaymentElement not found');
        setMessage('Payment form not loaded properly. Please refresh the page.');
        setIsLoading(false);
        return;
      }

      console.log('Confirming payment with Stripe...');
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/payment-success`,
        },
        redirect: "if_required",
      });

      if (error) {
        console.error('Payment error:', error);
        setMessage(error.message || 'Payment failed');
        onError(error);
      } else if (paymentIntent) {
        console.log('Payment successful:', paymentIntent);
        onSuccess(paymentIntent);
      }
    } catch (error) {
      console.error('Unexpected error:', error);
      setMessage('An unexpected error occurred');
      onError(error);
    }

    setIsLoading(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement 
        options={{
          layout: 'tabs'
        }}
      />
      {message && (
        <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
          {message}
        </div>
      )}
      <Button 
        disabled={!stripe || !elements || isLoading} 
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

  if (loading) {
    return (
      <div className="p-4 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
        <p className="text-sm text-gray-600">Setting up payment form...</p>
      </div>
    );
  }

  if (!clientSecret) {
    return <div className="p-4 text-center text-red-600">Error loading payment form</div>;
  }

  const options = {
    clientSecret,
    appearance: {
      theme: 'stripe' as const,
      variables: {
        colorPrimary: '#0066cc',
      }
    },
  };

  return (
    <div className="max-w-md mx-auto">
      <Elements options={options} stripe={stripePromise}>
        <CheckoutForm onSuccess={onSuccess} onError={onError} />
      </Elements>
    </div>
  );
}