import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CreditCard, Settings, X } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";

interface StripeConnectStatus {
  isConnected: boolean;
  accountId?: string;
  hasPayoutsEnabled?: boolean;
  requiresInfo?: boolean;
  accountStatus?: 'not_connected' | 'incomplete_setup' | 'pending_verification' | 'active' | 'error';
}

export function StripeSetupAlert({ onDismiss }: { onDismiss?: () => void }) {
  const [isDismissed, setIsDismissed] = useState(false);

  // Fetch Stripe Connect status
  const { data: stripeStatus, isLoading } = useQuery<StripeConnectStatus>({
    queryKey: ["/api/stripe/connect/status"],
    retry: false,
    refetchOnWindowFocus: false,
  });

  if (isLoading || isDismissed) {
    return null;
  }

  // Only show if Stripe is not properly connected
  if (stripeStatus?.accountStatus === 'active') {
    return null;
  }

  const handleDismiss = () => {
    setIsDismissed(true);
    onDismiss?.();
  };

  return (
    <Alert className="border-blue-200 bg-blue-50 mb-6">
      <CreditCard className="h-4 w-4 text-blue-600" />
      <div className="flex items-start justify-between w-full">
        <div className="flex-1">
          <AlertDescription className="text-blue-800">
            <div className="flex items-center gap-2 mb-2">
              <span className="font-medium">Payment Setup Required</span>
              <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-medium">
                Priority
              </span>
            </div>
            <p className="text-sm mb-3">
              {stripeStatus?.accountStatus === 'incomplete_setup' 
                ? 'Complete your Stripe Connect setup to start accepting payments. Finish the verification process to activate your account.'
                : stripeStatus?.accountStatus === 'pending_verification'
                ? 'Your Stripe account is pending verification. This usually takes 1-2 business days.'
                : 'Connect your Stripe account to accept customer payments and receive payouts. This is essential for processing orders and managing your revenue.'
              }
            </p>
            <div className="flex flex-wrap gap-2">
              <Link href="/settings?tab=integrations">
                <Button 
                  size="sm" 
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <Settings className="h-4 w-4 mr-2" />
                  {stripeStatus?.accountStatus === 'incomplete_setup' ? 'Complete Setup' : 'Set Up Payments'}
                </Button>
              </Link>
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleDismiss}
                className="text-blue-700 border-blue-300 hover:bg-blue-100"
              >
                Dismiss
              </Button>
            </div>
          </AlertDescription>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDismiss}
          className="text-blue-600 hover:text-blue-800 hover:bg-blue-100 h-6 w-6 p-0 ml-2"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </Alert>
  );
}

export function StripeStatusIndicator() {
  const { data: stripeStatus, isLoading } = useQuery<StripeConnectStatus>({
    queryKey: ["/api/stripe/connect/status"],
    retry: false,
    refetchOnWindowFocus: false,
  });

  if (isLoading) {
    return <div className="animate-pulse bg-gray-200 h-4 w-16 rounded"></div>;
  }

  if (stripeStatus?.accountStatus === 'active') {
    return (
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
        <span className="text-sm text-green-700">Payments Active</span>
      </div>
    );
  }

  if (stripeStatus?.accountStatus === 'pending_verification') {
    return (
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
        <span className="text-sm text-blue-700">Pending Verification</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
      <span className="text-sm text-orange-700">
        {stripeStatus?.accountStatus === 'incomplete_setup' ? 'Complete Setup' : 'Setup Required'}
      </span>
    </div>
  );
}