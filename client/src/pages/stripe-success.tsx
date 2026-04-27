import { useEffect } from 'react';
import { CheckCircle, ArrowLeft, CreditCard, Info, Clock, AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';

interface StripeConnectStatus {
  isConnected: boolean;
  hasStripeKeys: boolean;
  hasStripeConnect: boolean;
  accountId: string | null;
  hasPayoutsEnabled: boolean;
  requiresInfo: boolean;
  accountStatus: 'active' | 'incomplete_setup' | 'pending_verification' | 'not_connected' | 'error';
  paymentProcessingType: string;
}

export default function StripeSuccess() {
  const [, navigate] = useLocation();

  useEffect(() => {
    document.title = 'Stripe Connected - Quikpik';
  }, []);

  const { data: status, isLoading, isError } = useQuery<StripeConnectStatus>({
    queryKey: ['/api/stripe/connect/status'],
  });

  const goToIntegrations = () => navigate('/integrations');

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex flex-col items-center justify-center py-12 space-y-4">
            <Loader2 className="w-10 h-10 text-gray-400 animate-spin" />
            <p className="text-gray-600 text-sm">Checking your connection status...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isError || !status) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <Info className="w-8 h-8 text-gray-500" />
            </div>
            <CardTitle className="text-2xl text-gray-700">We're checking your connection</CardTitle>
            <CardDescription className="text-gray-500">
              We weren't able to confirm your Stripe status right now
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-sm text-center text-gray-600">
              Your onboarding may still have completed. Please visit Settings → Integrations to verify your connection status.
            </p>
            <Button onClick={goToIntegrations} className="w-full" size="lg" variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Go to Settings → Integrations
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status.accountStatus === 'active') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <CardTitle className="text-2xl text-green-800">Stripe Connected!</CardTitle>
            <CardDescription className="text-gray-600">
              Your payment processing is now active
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            <div className="text-center space-y-2">
              <p className="text-gray-700">
                🎉 Congratulations! You can now receive payments from your customers.
              </p>
            </div>

            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-2">
                  <div className="font-medium text-gray-900">Platform Fees:</div>
                  <div className="text-sm text-gray-700 space-y-1">
                    <div>• A small service fee per successful transaction</div>
                    <div>• Fees are automatically deducted from each payment</div>
                    <div>• No monthly fees or setup costs</div>
                  </div>
                </div>
              </AlertDescription>
            </Alert>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start space-x-3">
                <CreditCard className="w-5 h-5 text-blue-600 mt-0.5" />
                <div>
                  <h3 className="font-medium text-blue-900 mb-2">What's Next?</h3>
                  <ul className="text-sm text-blue-800 space-y-1">
                    <li>✅ Your customers can now place orders</li>
                    <li>✅ Payments will be processed automatically</li>
                    <li>✅ Money will be deposited to your bank account</li>
                    <li>✅ View all transactions in your dashboard</li>
                  </ul>
                </div>
              </div>
            </div>

            <Button
              onClick={() => navigate('/dashboard')}
              className="w-full bg-green-600 hover:bg-green-700"
              size="lg"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Return to Dashboard
            </Button>

            <div className="text-center">
              <p className="text-xs text-gray-500">
                Need help? Visit your{' '}
                <button
                  onClick={goToIntegrations}
                  className="text-blue-600 hover:underline"
                >
                  Settings → Integrations
                </button>
                {' '}to manage your Stripe connection
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status.accountStatus === 'incomplete_setup') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mb-4">
              <AlertTriangle className="w-8 h-8 text-amber-600" />
            </div>
            <CardTitle className="text-2xl text-amber-800">Setup Incomplete</CardTitle>
            <CardDescription className="text-gray-600">
              Your Stripe account setup hasn't been fully completed yet
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            <p className="text-sm text-center text-gray-600">
              It looks like you didn't finish filling in all the required details in Stripe. You'll need to complete the setup before you can accept payments.
            </p>

            <Button onClick={goToIntegrations} className="w-full bg-amber-600 hover:bg-amber-700" size="lg">
              Continue Setup
            </Button>

            <div className="text-center">
              <p className="text-xs text-gray-500">
                Go to{' '}
                <button
                  onClick={goToIntegrations}
                  className="text-blue-600 hover:underline"
                >
                  Settings → Integrations
                </button>
                {' '}to resume onboarding
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status.accountStatus === 'pending_verification') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
              <Clock className="w-8 h-8 text-blue-600" />
            </div>
            <CardTitle className="text-2xl text-blue-800">Pending Verification</CardTitle>
            <CardDescription className="text-gray-600">
              Stripe is reviewing your account
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            <p className="text-sm text-center text-gray-600">
              You've completed the setup, but Stripe may take some time to verify your information. You'll be notified once your account is fully activated and you can start accepting payments.
            </p>

            <Button onClick={() => navigate('/dashboard')} className="w-full" size="lg" variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Return to Dashboard
            </Button>

            <div className="text-center">
              <p className="text-xs text-gray-500">
                Check your connection status anytime in{' '}
                <button
                  onClick={goToIntegrations}
                  className="text-blue-600 hover:underline"
                >
                  Settings → Integrations
                </button>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Fallback for 'not_connected' or any other unexpected status
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
            <Info className="w-8 h-8 text-gray-500" />
          </div>
          <CardTitle className="text-2xl text-gray-700">We're checking your connection</CardTitle>
          <CardDescription className="text-gray-500">
            Your Stripe connection status is unclear
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-center text-gray-600">
            Please visit Settings → Integrations to view and manage your Stripe connection.
          </p>
          <Button onClick={goToIntegrations} className="w-full" size="lg" variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Go to Settings → Integrations
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
