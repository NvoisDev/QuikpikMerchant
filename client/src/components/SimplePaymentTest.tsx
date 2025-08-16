import React, { useState } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';

// Test component to isolate Stripe loading issues
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY || '');

const PaymentTestForm = () => {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Test payment form submitted');
  };

  console.log('PaymentTestForm render - stripe:', !!stripe, 'elements:', !!elements);

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-4 border rounded">
      <div className="p-4 border rounded">
        <PaymentElement 
          onReady={() => console.log('Test PaymentElement ready')}
          onLoadError={(error) => console.error('Test PaymentElement error:', error)}
        />
      </div>
      <button 
        type="submit" 
        disabled={!stripe || !elements}
        className="w-full bg-blue-600 text-white py-2 px-4 rounded"
      >
        Test Payment
      </button>
    </form>
  );
};

export const SimplePaymentTest = ({ clientSecret }: { clientSecret: string }) => {
  console.log('SimplePaymentTest - clientSecret:', !!clientSecret);
  
  if (!clientSecret) {
    return <div className="p-4">No client secret provided</div>;
  }

  return (
    <Elements stripe={stripePromise} options={{ clientSecret }}>
      <PaymentTestForm />
    </Elements>
  );
};