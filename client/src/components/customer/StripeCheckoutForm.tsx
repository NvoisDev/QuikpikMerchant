import { useState, useEffect } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, useStripe, useElements, PaymentElement } from "@stripe/react-stripe-js";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ShieldCheck, HelpCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/currencies";
import type { StripeCheckoutFormProps, WholesalerPortal } from "./portal-types";

async function fetchStripePromise(publishableKey?: string, wholesalerId?: string) {
  if (publishableKey) {
    return loadStripe(publishableKey);
  }
  try {
    const url = wholesalerId
      ? `/api/config/stripe-key?wholesalerId=${encodeURIComponent(wholesalerId)}`
      : '/api/config/stripe-key';
    const res = await fetch(url, { credentials: 'include' });
    const data = res.ok ? await res.json() : {};
    const key = data.publishableKey || import.meta.env.VITE_STRIPE_PUBLIC_KEY || '';
    return key ? loadStripe(key) : null;
  } catch {
    const key = import.meta.env.VITE_STRIPE_PUBLIC_KEY || '';
    return key ? loadStripe(key) : null;
  }
}

const PaymentFormContent = ({
  onSuccess,
  totalAmount,
  subtotal,
  customerTransactionFee,
  shippingCost,
  wholesaler,
  disabled,
}: {
  onSuccess: StripeCheckoutFormProps['onSuccess'];
  totalAmount: number;
  subtotal: number;
  customerTransactionFee: number;
  shippingCost: number;
  wholesaler: WholesalerPortal;
  disabled?: boolean;
}) => {
  const stripe = useStripe();
  const elements = useElements();
  const [isElementReady, setIsElementReady] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentSubmitted, setPaymentSubmitted] = useState(false);
  const [paymentFailureDialog, setPaymentFailureDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
  }>({
    isOpen: false,
    title: '',
    message: '',
  });
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (disabled) return;

    if (!isElementReady) {
      toast({ title: "Payment form is still loading", description: "Payment form is still loading, please wait a moment.", variant: "destructive" });
      return;
    }

    if (!stripe || !elements || isProcessing || paymentSubmitted) {
      console.error('💳 Payment Error: Stripe/Elements not loaded or payment already in progress');
      return;
    }

    setIsProcessing(true);
    setPaymentSubmitted(true);

    try {
      const { error, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/payment-success`,
        },
        redirect: "if_required",
      });


      if (error) {
        let errorMessage = "Payment failed. Please try again.";
        let errorTitle = "Payment Failed";

        if (error.type === 'card_error') {
          switch (error.code) {
            case 'card_declined':
              errorMessage = "Your card was declined. Please try a different payment method or contact your bank.";
              break;
            case 'insufficient_funds':
              errorMessage = "Insufficient funds. Please check your account balance or try a different card.";
              break;
            case 'expired_card':
              errorMessage = "Your card has expired. Please use a different payment method.";
              break;
            case 'incorrect_cvc':
              errorMessage = "The security code (CVC) is incorrect. Please check and try again.";
              break;
            case 'processing_error':
              errorMessage = "Payment processing error. Please try again in a few moments.";
              break;
            default:
              errorMessage = error.message || "Card payment failed. Please check your card details.";
          }
        } else if (error.type === 'validation_error') {
          errorMessage = "Invalid payment details. Please check your information and try again.";
        } else if (error.type === 'api_error') {
          if (error.message && (error.message.includes('account') || error.message.includes('setup') || error.message.includes('onboarding'))) {
            errorTitle = "Store Payment Setup Issue";
            errorMessage = "The business owner may need to complete their payment setup. Please contact them directly or try again later.";
          } else {
            errorMessage = "Payment service temporarily unavailable. Please try again later.";
          }
        } else if (error.type === 'invalid_request_error') {
          errorTitle = "Payment Configuration Issue";

          if (error.code === 'payment_intent_invalid_parameter' || error.code === 'payment_intent_creation_failed') {
            errorMessage = "The payment setup has an issue. Please try again, or contact the business owner if the problem persists.";
          } else if (error.code === 'account_invalid' || error.message?.includes('account')) {
            errorMessage = "The business payment account needs attention. Please contact the business owner to resolve this issue.";
          } else if (error.code === 'setup_intent_invalid' || error.code === 'payment_method_invalid') {
            errorMessage = "Payment method configuration issue. Please try refreshing the page and attempting payment again.";
          } else {
            errorMessage = "There's an issue with the payment setup. Please contact the business owner or try again later.";
          }

          console.error('💳 INVALID REQUEST ERROR Details:', {
            code: error.code,
            message: error.message,
            type: error.type,
            decline_code: error.decline_code,
          });
        } else {
          errorMessage = error.message || "An unexpected payment error occurred. Please try again.";
        }

        toast({ title: errorTitle, description: errorMessage, variant: "destructive" });
        setPaymentFailureDialog({ isOpen: true, title: errorTitle, message: errorMessage });
        setPaymentSubmitted(false);

      } else if (paymentIntent && paymentIntent.status === 'processing') {
        // Deferred payment method (BACS, SEPA, ACH) — payment is queued, not yet settled.
        // Advance to the success screen so the customer isn't stuck on the payment form.
        onSuccess({
          orderNumber: "Processing…",
          cart: [],
          customerData: { name: '', email: '', phone: '', address: '', city: '', state: '', postalCode: '', country: '', notes: '', shippingOption: undefined },
          totalAmount,
          subtotal,
          customerTransactionFee,
          shippingCost,
        });
        toast({
          title: "Payment Initiated",
          description: "Your payment is being processed. You will receive a confirmation once complete.",
        });

      } else if (paymentIntent && paymentIntent.status === 'succeeded') {
        try {
          const timeoutPromise = new Promise<Response>((_, reject) =>
            setTimeout(() => reject(new Error('OrderTimeout')), 20000)
          );
          const response = await Promise.race([
            fetch("/api/marketplace/create-order", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ paymentIntentId: paymentIntent.id }),
            }),
            timeoutPromise,
          ]);

          if (response.ok) {
            const orderData = await response.json();
            // Use server-returned financial values — paymentIntent.metadata is not
            // populated by Stripe.js on the client side.  The create-order endpoint
            // retrieves the PaymentIntent server-side and returns the correct amounts.
            // Fall back to pre-computed cart prop values (never 0) if the field is
            // absent from orderData for any reason.
            onSuccess({
              orderNumber: orderData.orderNumber || `Order #${orderData.orderId}`,
              cart: [],
              customerData: { name: '', email: '', phone: '', address: '', city: '', state: '', postalCode: '', country: '', notes: '', shippingOption: undefined },
              totalAmount: orderData.totalAmount ?? totalAmount,
              subtotal: orderData.subtotal ?? subtotal,
              customerTransactionFee: orderData.customerTransactionFee ?? customerTransactionFee,
              shippingCost: orderData.shippingCost || shippingCost,
            });
            toast({
              title: "Payment Successful!",
              description: `Order #${orderData.orderNumber || orderData.id} has been placed successfully. You'll receive a confirmation email shortly.`,
            });
          } else {
            // Order DB write failed after successful Stripe payment.
            // The webhook will still save the order — advance to success so
            // the customer isn't left on the payment screen.
            console.error('Order confirmation pending (payment succeeded):', paymentIntent.id);
            onSuccess({
              orderNumber: "Confirming…",
              cart: [],
              customerData: { name: '', email: '', phone: '', address: '', city: '', state: '', postalCode: '', country: '', notes: '', shippingOption: undefined },
              totalAmount,
              subtotal,
              customerTransactionFee,
              shippingCost,
            });
            toast({
              title: "Payment Received",
              description: "Your payment was successful. Your order is being confirmed — you'll receive a confirmation email shortly.",
            });
          }
        } catch (orderError) {
          // Network error — order creation request never reached the server.
          // The webhook will still save the order.
          console.error('Order confirmation pending (network error):', paymentIntent.id, orderError);
          onSuccess({
            orderNumber: "Confirming…",
            cart: [],
            customerData: { name: '', email: '', phone: '', address: '', city: '', state: '', postalCode: '', country: '', notes: '', shippingOption: undefined },
            totalAmount,
            subtotal,
            customerTransactionFee,
            shippingCost,
          });
          toast({
            title: "Payment Received",
            description: "Your payment was successful. Your order is being confirmed — you'll receive a confirmation email shortly.",
          });
        }
      }
    } catch (error: unknown) {
      setPaymentSubmitted(false);
      console.error('Unexpected payment error:', error);

      let errorMessage = "An unexpected error occurred during payment. Please try again.";
      let errorTitle = "Payment Error";

      const err = error as { name?: string; message?: string };
      if (err.name === 'NetworkError') {
        errorMessage = "Network connection failed. Please check your internet connection and try again.";
      } else if (err.name === 'TimeoutError') {
        errorMessage = "Payment request timed out. Please try again.";
      } else if (err.message) {
        errorMessage = `Payment error: ${err.message}. Please try again.`;
      }

      toast({ title: errorTitle, description: errorMessage, variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="p-4 border rounded-lg">
          {!isElementReady && (
            <div className="space-y-3 animate-pulse" aria-hidden="true">
              <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded" />
              <div className="grid grid-cols-2 gap-3">
                <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded" />
                <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded" />
              </div>
            </div>
          )}
          <div className={!isElementReady ? "h-0 overflow-hidden" : ""}>
            <PaymentElement onReady={() => setIsElementReady(true)} />
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
          <div className="flex items-center space-x-2 mb-2">
            <ShieldCheck className="w-4 h-4" />
            <span className="font-semibold">Secure Payment Processing</span>
            <HelpCircle className="w-3 h-3 text-blue-600 cursor-help" />
          </div>
          <p>Your payment is processed securely through Stripe.{customerTransactionFee > 0 && " A service fee is included in the total."}</p>
        </div>

        <Button
          type="submit"
          disabled={disabled || !isElementReady || !stripe || isProcessing || paymentSubmitted}
          className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3"
        >
          {!isElementReady ? "Loading payment form…" : isProcessing ? "Processing..." : paymentSubmitted ? "Payment Submitted..." : `Pay ${formatCurrency(totalAmount, wholesaler?.preferredCurrency || wholesaler?.defaultCurrency)}`}
        </Button>
      </form>

      <Dialog open={paymentFailureDialog.isOpen} onOpenChange={(open) => setPaymentFailureDialog(prev => ({ ...prev, isOpen: open }))}>
        <DialogContent className="sm:max-w-lg p-0 overflow-hidden">
          <div className="p-6">
            <h3 className="text-lg font-semibold text-red-600 mb-2">{paymentFailureDialog.title}</h3>
            <p className="text-gray-700 mb-4">{paymentFailureDialog.message}</p>
            <Button onClick={() => setPaymentFailureDialog(prev => ({ ...prev, isOpen: false }))} variant="outline">
              Try Again
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export const StripeCheckoutForm = ({ cart, customerData, wholesaler, totalAmount, subtotal, customerTransactionFee, shippingCost, clientSecret, publishableKey, disabled, onSuccess }: StripeCheckoutFormProps) => {
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [stripePromise, setStripePromise] = useState<ReturnType<typeof fetchStripePromise> | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const wholesalerId = wholesaler?.id ? String(wholesaler.id) : undefined;
    setStripePromise(fetchStripePromise(publishableKey, wholesalerId));
  }, [clientSecret, publishableKey, wholesaler?.id]);

  if (!clientSecret || !stripePromise) {
    return (
      <div className="text-center py-8">
        <div className="flex flex-col items-center space-y-4">
          <div className="flex space-x-1">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="w-2 h-7 rounded-full animate-bounce"
                style={{
                  background: 'var(--theme-primary)',
                  animationDelay: `${i * 0.2}s`,
                  animationDuration: '1.2s',
                }}
              />
            ))}
          </div>
          <p className="text-sm text-gray-600">Preparing payment...</p>
        </div>
      </div>
    );
  }

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance: {
          theme: 'stripe',
          variables: {
            colorPrimary: '#22C55E',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          },
        },
        locale: 'en',
      }}
    >
      <PaymentFormContent
        onSuccess={onSuccess}
        totalAmount={totalAmount}
        subtotal={subtotal}
        customerTransactionFee={customerTransactionFee}
        shippingCost={shippingCost}
        wholesaler={wholesaler}
        disabled={disabled}
      />
    </Elements>
  );
};
