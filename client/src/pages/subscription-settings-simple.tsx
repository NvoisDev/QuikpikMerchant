import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

export default function SubscriptionSettingsSimple() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);

  // Show login message if not authenticated
  if (!user) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Subscription Settings</h1>
          <p className="text-gray-600 mt-2">
            Please log in to view your subscription details
          </p>
        </div>
        <Card>
          <CardContent className="p-6 text-center">
            <h3 className="text-lg font-semibold mb-4">Authentication Required</h3>
            <p className="text-gray-600 mb-4">
              You need to log in to access your subscription settings
            </p>
            <Button onClick={() => window.location.href = '/login'}>
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Subscription Settings</h1>
        <p className="text-gray-600 mt-2">
          Manage your subscription plan and billing information
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Current Plan</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <h3 className="text-xl font-semibold">
                {user.subscriptionTier || 'Free'} Plan
              </h3>
              <p className="text-gray-600">
                Status: {user.subscriptionStatus || 'active'}
              </p>
            </div>
            
            {/* Usage Statistics - Stage 1 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-6">
              <div className="p-4 bg-gray-50 rounded-lg">
                <h4 className="font-medium text-gray-800">Products Created</h4>
                <p className="text-2xl font-bold text-primary">0</p>
                <p className="text-sm text-gray-600">of {user.subscriptionTier === 'premium' ? 'unlimited' : user.subscriptionTier === 'standard' ? '25' : '5'} allowed</p>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <h4 className="font-medium text-gray-800">Plan Status</h4>
                <p className="text-2xl font-bold text-primary capitalize">{user.subscriptionTier || 'free'}</p>
                <p className="text-sm text-gray-600">{user.subscriptionStatus === 'active' ? 'Active subscription' : 'Free plan'}</p>
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="p-4 text-center">
                  <h4 className="font-semibold">Free</h4>
                  <p className="text-2xl font-bold">£0</p>
                  <p className="text-sm text-gray-600">forever</p>
                  <Button 
                    variant="outline" 
                    className="mt-2 w-full"
                    disabled={user.subscriptionTier === 'free'}
                  >
                    {user.subscriptionTier === 'free' ? 'Current Plan' : 'Downgrade'}
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4 text-center">
                  <h4 className="font-semibold">Standard</h4>
                  <p className="text-2xl font-bold">£10.99</p>
                  <p className="text-sm text-gray-600">per month</p>
                  <Button 
                    className="mt-2 w-full"
                    disabled={user.subscriptionTier === 'standard'}
                  >
                    {user.subscriptionTier === 'standard' ? 'Current Plan' : 'Upgrade'}
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4 text-center">
                  <h4 className="font-semibold">Premium</h4>
                  <p className="text-2xl font-bold">£19.99</p>
                  <p className="text-sm text-gray-600">per month</p>
                  <Button 
                    className="mt-2 w-full"
                    disabled={user.subscriptionTier === 'premium'}
                  >
                    {user.subscriptionTier === 'premium' ? 'Current Plan' : 'Upgrade'}
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}