import { useEffect } from 'react';
import { CheckCircle, ArrowLeft, CreditCard, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useLocation } from 'wouter';

export default function StripeSuccess() {
  const [, navigate] = useLocation();

  useEffect(() => {
    // Set page title
    document.title = 'Stripe Connected - Quikpik';
  }, []);

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
          {/* Success Message */}
          <div className="text-center space-y-2">
            <p className="text-gray-700">
              🎉 Congratulations! You can now receive payments from your customers.
            </p>
          </div>

          {/* Platform Fees Information */}
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-2">
                <div className="font-medium text-gray-900">Platform Fees:</div>
                <div className="text-sm text-gray-700 space-y-1">
                  <div>• <strong>3.3%</strong> per successful transaction</div>
                  <div>• Fees are automatically deducted from each payment</div>
                  <div>• No monthly fees or setup costs</div>
                </div>
              </div>
            </AlertDescription>
          </Alert>

          {/* What's Next */}
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

          {/* Return Button */}
          <Button 
            onClick={() => navigate('/dashboard')}
            className="w-full bg-green-600 hover:bg-green-700"
            size="lg"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Return to Dashboard
          </Button>

          {/* Additional Info */}
          <div className="text-center">
            <p className="text-xs text-gray-500">
              Need help? Visit your{' '}
              <button 
                onClick={() => navigate('/settings?tab=integrations')}
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