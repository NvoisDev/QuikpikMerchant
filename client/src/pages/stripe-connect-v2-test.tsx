import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { CheckCircle2, AlertCircle, Clock, DollarSign } from 'lucide-react';

/**
 * STRIPE CONNECT V2 TEST PAGE
 * Interactive testing interface for the new "Separate Charges and Transfers" architecture
 * Safe to use alongside existing system without conflicts
 */

export default function StripeConnectV2Test() {
  const [wholesalerId, setWholesalerId] = useState('104871691614680693123');
  const [accountId, setAccountId] = useState('');
  const [onboardingUrl, setOnboardingUrl] = useState('');
  const [accountStatus, setAccountStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // Test payment calculation
  const [calculation, setCalculation] = useState<any>(null);
  const [productSubtotal, setProductSubtotal] = useState('100.00');
  const [deliveryFee, setDeliveryFee] = useState('90.00');

  const handleCreateAccount = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/stripe-v2/create-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wholesalerId })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setAccountId(data.accountId);
      toast({
        title: "V2 Account Created",
        description: `Express account ${data.accountId} created successfully`
      });

    } catch (error: any) {
      console.error('Create account error:', error);
      toast({
        title: "Account Creation Failed",
        description: error.message || "Failed to create Express account",
        variant: "destructive"
      });
    }
    setLoading(false);
  };

  const handleCreateAccountLink = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/stripe-v2/create-account-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wholesalerId })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setOnboardingUrl(data.url);
      toast({
        title: "Onboarding Link Created",
        description: "Click the link to complete Express account setup"
      });

    } catch (error: any) {
      console.error('Create account link error:', error);
      toast({
        title: "Link Creation Failed",
        description: error.message || "Failed to create onboarding link",
        variant: "destructive"
      });
    }
    setLoading(false);
  };

  const handleCheckStatus = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/stripe-v2/account-status/${wholesalerId}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setAccountStatus(data);
      toast({
        title: "Status Retrieved",
        description: `Account status: ${data.canReceiveTransfers ? 'Ready' : 'Setup Required'}`
      });

    } catch (error: any) {
      console.error('Check status error:', error);
      toast({
        title: "Status Check Failed",
        description: error.message || "Failed to check account status",
        variant: "destructive"
      });
    }
    setLoading(false);
  };

  const handleCalculatePayment = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/stripe-v2/calculate-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productSubtotal: parseFloat(productSubtotal),
          deliveryFee: parseFloat(deliveryFee)
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setCalculation(data.calculation);
      toast({
        title: "Payment Calculated",
        description: `Customer pays £${data.calculation.totalAmount}, wholesaler gets £${data.calculation.wholesalerShare}`
      });

    } catch (error: any) {
      console.error('Calculate payment error:', error);
      toast({
        title: "Calculation Failed",
        description: error.message || "Failed to calculate payment",
        variant: "destructive"
      });
    }
    setLoading(false);
  };

  return (
    <div className="container mx-auto p-6 space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">Stripe Connect V2 Test Interface</h1>
        <p className="text-muted-foreground">
          "Separate Charges and Transfers" Architecture Testing
        </p>
      </div>

      {/* Account Management Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
            Express Account Management
          </CardTitle>
          <CardDescription>
            Create and manage Express connected accounts for wholesalers
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="wholesalerId">Wholesaler ID</Label>
              <Input
                id="wholesalerId"
                value={wholesalerId}
                onChange={(e) => setWholesalerId(e.target.value)}
                placeholder="Enter wholesaler ID"
              />
            </div>
            <div className="flex items-end">
              <Button 
                onClick={handleCreateAccount} 
                disabled={loading || !wholesalerId}
                className="w-full"
              >
                {loading ? 'Creating...' : 'Create V2 Account'}
              </Button>
            </div>
            <div className="flex items-end">
              <Button 
                onClick={handleCreateAccountLink} 
                disabled={loading || !wholesalerId}
                variant="outline"
                className="w-full"
              >
                {loading ? 'Creating...' : 'Create Onboarding Link'}
              </Button>
            </div>
          </div>

          {accountId && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-md">
              <p className="text-sm font-medium text-green-800">Account ID: {accountId}</p>
            </div>
          )}

          {onboardingUrl && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
              <p className="text-sm font-medium text-blue-800 mb-2">Onboarding URL:</p>
              <a 
                href={onboardingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline break-all text-sm"
              >
                {onboardingUrl}
              </a>
            </div>
          )}

          <div className="flex justify-center">
            <Button 
              onClick={handleCheckStatus} 
              disabled={loading || !wholesalerId}
              variant="secondary"
            >
              {loading ? <Clock className="w-4 h-4 animate-spin mr-2" /> : <AlertCircle className="w-4 h-4 mr-2" />}
              Check Account Status
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Account Status Display */}
      {accountStatus && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {accountStatus.canReceiveTransfers ? (
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              ) : (
                <AlertCircle className="w-5 h-5 text-yellow-600" />
              )}
              Account Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="font-medium">Account ID: <span className="font-mono text-sm">{accountStatus.accountId}</span></p>
                <p className="text-sm text-muted-foreground mt-1">
                  Can Receive Transfers: {accountStatus.canReceiveTransfers ? '✅ Yes' : '❌ No'}
                </p>
                <p className="text-sm text-muted-foreground">
                  Onboarding Completed: {accountStatus.onboardingCompleted ? '✅ Yes' : '❌ No'}
                </p>
              </div>
              <div>
                <p className="font-medium">Capabilities:</p>
                <ul className="text-sm text-muted-foreground mt-1">
                  <li>Charges: {accountStatus.account?.charges_enabled ? '✅' : '❌'}</li>
                  <li>Payouts: {accountStatus.account?.payouts_enabled ? '✅' : '❌'}</li>
                  <li>Details Submitted: {accountStatus.account?.details_submitted ? '✅' : '❌'}</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Payment Calculation Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-green-600" />
            Payment Split Calculator
          </CardTitle>
          <CardDescription>
            Test the dual platform fee calculation system
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="productSubtotal">Product Subtotal (£)</Label>
              <Input
                id="productSubtotal"
                type="number"
                step="0.01"
                value={productSubtotal}
                onChange={(e) => setProductSubtotal(e.target.value)}
                placeholder="100.00"
              />
            </div>
            <div>
              <Label htmlFor="deliveryFee">Delivery Fee (£)</Label>
              <Input
                id="deliveryFee"
                type="number"
                step="0.01"
                value={deliveryFee}
                onChange={(e) => setDeliveryFee(e.target.value)}
                placeholder="90.00"
              />
            </div>
            <div className="flex items-end">
              <Button 
                onClick={handleCalculatePayment} 
                disabled={loading}
                className="w-full"
              >
                {loading ? 'Calculating...' : 'Calculate Split'}
              </Button>
            </div>
          </div>

          {calculation && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-md">
                <h3 className="font-semibold text-blue-800 mb-2">Customer Payment</h3>
                <p className="text-2xl font-bold text-blue-900">£{calculation.totalAmount}</p>
                <p className="text-sm text-blue-700">
                  Products: £{calculation.productSubtotal} + Delivery: £{calculation.deliveryFee} + Fee: £{calculation.customerPlatformFee} + Transaction: £{calculation.transactionFee}
                </p>
              </div>
              <div className="p-4 bg-green-50 border border-green-200 rounded-md">
                <h3 className="font-semibold text-green-800 mb-2">Wholesaler Receives</h3>
                <p className="text-2xl font-bold text-green-900">£{calculation.wholesalerShare}</p>
                <p className="text-sm text-green-700">
                  After platform fee: £{calculation.wholesalerPlatformFee}
                </p>
              </div>
              <div className="p-4 bg-purple-50 border border-purple-200 rounded-md">
                <h3 className="font-semibold text-purple-800 mb-2">Platform Keeps</h3>
                <p className="text-2xl font-bold text-purple-900">£{calculation.platformTotal}</p>
                <p className="text-sm text-purple-700">
                  Fees + Delivery + Transaction
                </p>
              </div>
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-md">
                <h3 className="font-semibold text-gray-800 mb-2">Fee Breakdown</h3>
                <p className="text-sm text-gray-700">
                  Customer fee rate: {(calculation.customerPlatformFeeRate * 100).toFixed(1)}%<br/>
                  Wholesaler fee rate: {(calculation.wholesalerPlatformFeeRate * 100).toFixed(1)}%
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* System Status */}
      <Card>
        <CardHeader>
          <CardTitle>System Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              <span className="text-sm">V2 Routes Registered</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              <span className="text-sm">Database Schema Updated</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              <span className="text-sm">Webhook Endpoint: /api/webhooks/stripe-v2</span>
            </div>
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-yellow-600" />
              <span className="text-sm">Safe deployment alongside existing system</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}