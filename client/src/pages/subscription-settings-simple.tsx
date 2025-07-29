import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Crown, Check } from "lucide-react";
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
                <p className="text-sm text-gray-600">of {user.subscriptionTier === 'premium' ? 'unlimited' : user.subscriptionTier === 'standard' ? '10' : '3'} allowed</p>
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
                  
                  {/* Free Plan Features */}
                  <ul className="space-y-2 mt-4 mb-4 text-left text-sm">
                    <li className="flex items-start">
                      <Check className="w-4 h-4 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                      <span>Up to 3 products</span>
                    </li>
                    <li className="flex items-start">
                      <Check className="w-4 h-4 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                      <span>3 edits per product</span>
                    </li>
                    <li className="flex items-start">
                      <Check className="w-4 h-4 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                      <span>Up to 2 customer groups</span>
                    </li>
                    <li className="flex items-start">
                      <Check className="w-4 h-4 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                      <span>5 broadcasts per month</span>
                    </li>
                  </ul>
                  
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
                  
                  {/* Standard Plan Features */}
                  <ul className="space-y-2 mt-4 mb-4 text-left text-sm">
                    <li className="flex items-start">
                      <Check className="w-4 h-4 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                      <span>Up to 10 products</span>
                    </li>
                    <li className="flex items-start">
                      <Check className="w-4 h-4 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                      <span>10 product edits per product</span>
                    </li>
                    <li className="flex items-start">
                      <Check className="w-4 h-4 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                      <span>Up to 5 customer groups</span>
                    </li>
                    <li className="flex items-start">
                      <Check className="w-4 h-4 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                      <span>25 broadcasts per month</span>
                    </li>
                    <li className="flex items-start">
                      <Check className="w-4 h-4 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                      <span>Up to 2 team members</span>
                    </li>
                  </ul>
                  
                  <Button 
                    className="mt-2 w-full"
                    disabled={user.subscriptionTier === 'standard'}
                  >
                    {user.subscriptionTier === 'standard' ? 'Current Plan' : 'Upgrade'}
                  </Button>
                </CardContent>
              </Card>

              <Card className="relative border-primary shadow-lg">
                {/* Premium Badge */}
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                  <Badge className="bg-primary text-white px-3 py-1">
                    <Crown className="w-3 h-3 mr-1" />
                    Most Popular
                  </Badge>
                </div>
                
                <CardContent className="p-4 text-center">
                  <div className="flex items-center justify-center mb-2">
                    <Crown className="w-5 h-5 text-yellow-500 mr-2" />
                    <h4 className="font-semibold">Premium</h4>
                  </div>
                  <p className="text-2xl font-bold bg-gradient-to-r from-yellow-500 to-orange-500 bg-clip-text text-transparent">£19.99</p>
                  <p className="text-sm text-gray-600">per month</p>
                  
                  {/* Premium Plan Features */}
                  <ul className="space-y-2 mt-4 mb-4 text-left text-sm">
                    <li className="flex items-start">
                      <Check className="w-4 h-4 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                      <span>Unlimited products</span>
                    </li>
                    <li className="flex items-start">
                      <Check className="w-4 h-4 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                      <span>Unlimited product edits</span>
                    </li>
                    <li className="flex items-start">
                      <Check className="w-4 h-4 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                      <span>Unlimited customer groups</span>
                    </li>
                    <li className="flex items-start">
                      <Check className="w-4 h-4 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                      <span>Unlimited broadcasts</span>
                    </li>
                    <li className="flex items-start">
                      <Check className="w-4 h-4 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                      <span>Up to 5 team members</span>
                    </li>
                    <li className="flex items-start">
                      <Check className="w-4 h-4 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                      <span>Marketplace access</span>
                    </li>
                    <li className="flex items-start">
                      <Check className="w-4 h-4 text-green-500 mt-0.5 mr-2 flex-shrink-0" />
                      <span>Product advertising</span>
                    </li>
                  </ul>
                  
                  <Button 
                    className="mt-2 w-full bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600"
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

      {/* Billing Information - Stage 4 */}
      <Card>
        <CardHeader>
          <CardTitle>Billing Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-medium text-gray-800 mb-2">Current Plan</h4>
              <p className="text-lg font-semibold capitalize">{user.subscriptionTier || 'free'} Plan</p>
              <p className="text-sm text-gray-600">Status: {user.subscriptionStatus || 'active'}</p>
            </div>
            <div>
              <h4 className="font-medium text-gray-800 mb-2">Next Billing Date</h4>
              <p className="text-lg font-semibold">
                {user.subscriptionTier === 'free' ? 'No billing required' : 'August 29, 2025'}
              </p>
              <p className="text-sm text-gray-600">
                {user.subscriptionTier === 'free' ? 'Free plan' : 'Monthly subscription'}
              </p>
            </div>
          </div>
          
          {user.subscriptionTier !== 'free' && (
            <div className="mt-6 p-4 bg-blue-50 rounded-lg">
              <h4 className="font-medium text-blue-800 mb-2">Subscription Details</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <span className="text-blue-600">Plan:</span>
                  <span className="ml-2 font-medium capitalize">{user.subscriptionTier}</span>
                </div>
                <div>
                  <span className="text-blue-600">Amount:</span>
                  <span className="ml-2 font-medium">
                    {user.subscriptionTier === 'standard' ? '£10.99' : '£19.99'}/month
                  </span>
                </div>
                <div>
                  <span className="text-blue-600">Started:</span>
                  <span className="ml-2 font-medium">July 29, 2025</span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}