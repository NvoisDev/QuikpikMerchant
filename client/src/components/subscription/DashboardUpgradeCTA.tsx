import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { CrownIcon, TrendingUpIcon, ArrowRightIcon, SparklesIcon } from 'lucide-react';
import { Link } from 'wouter';

interface DashboardUpgradeCTAProps {
  compact?: boolean;
}

export function DashboardUpgradeCTA({ compact = false }: DashboardUpgradeCTAProps) {
  const [isDismissed, setIsDismissed] = useState(false);

  // Get current subscription and plan limits
  const { data: currentSubscription } = useQuery({
    queryKey: ['/api/subscriptions/current'],
  });

  const { data: planLimits } = useQuery({
    queryKey: ['/api/subscriptions/plan-limits'],
  });

  // Don't show if user is already on Premium or if dismissed
  const currentPlan = currentSubscription?.currentPlan || 'free';
  if (currentPlan === 'premium' || isDismissed) {
    return null;
  }

  // Calculate highest usage percentage to show urgency
  const usageData = planLimits ? [
    { name: 'Products', usage: planLimits.usage?.products || 0, limit: planLimits.limits?.products || 10, percent: planLimits.percentUsed?.products || 0 },
    { name: 'Broadcasts', usage: planLimits.usage?.broadcasts || 0, limit: planLimits.limits?.broadcasts || 5, percent: planLimits.percentUsed?.broadcasts || 0 },
    { name: 'Team Members', usage: planLimits.usage?.teamMembers || 0, limit: planLimits.limits?.teamMembers || 1, percent: planLimits.percentUsed?.teamMembers || 0 },
  ] : [];

  const highestUsage = usageData.reduce((max, item) => item.percent > max.percent ? item : max, { percent: 0, name: '', usage: 0, limit: 0 });
  const isNearLimit = highestUsage.percent > 80;
  const isAtLimit = highestUsage.percent >= 100;

  const getUpgradeMessage = () => {
    if (isAtLimit) {
      return `You've reached your ${highestUsage.name.toLowerCase()} limit! Upgrade to continue growing.`;
    }
    if (isNearLimit) {
      return `You're using ${Math.round(highestUsage.percent)}% of your ${highestUsage.name.toLowerCase()}. Time to scale up!`;
    }
    if (currentPlan === 'free') {
      return "Ready to supercharge your wholesale business? Unlock unlimited potential!";
    }
    return "Take your business to the next level with Premium features!";
  };

  const getButtonVariant = () => {
    if (isAtLimit) return 'destructive';
    if (isNearLimit) return 'default';
    return 'outline';
  };

  const getCardStyling = () => {
    if (isAtLimit) return 'border-red-200 bg-gradient-to-r from-red-50 to-orange-50';
    if (isNearLimit) return 'border-amber-200 bg-gradient-to-r from-amber-50 to-yellow-50';
    return 'border-purple-200 bg-gradient-to-r from-purple-50 to-blue-50';
  };

  if (compact) {
    return (
      <Card className={`${getCardStyling()} relative overflow-hidden`}>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-purple-400 to-blue-500 rounded-lg">
                <CrownIcon className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">Upgrade to Premium</p>
                <p className="text-sm text-gray-600">{getUpgradeMessage()}</p>
              </div>
            </div>
            <Link href="/subscription-pricing">
              <Button size="sm" variant={getButtonVariant()} className="flex items-center gap-2">
                Upgrade <ArrowRightIcon className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`${getCardStyling()} relative overflow-hidden`}>
      <div className="absolute top-0 right-0 p-2">
        <button 
          onClick={() => setIsDismissed(true)}
          className="text-gray-400 hover:text-gray-600 text-sm"
        >
          ✕
        </button>
      </div>
      
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-br from-purple-400 to-blue-500 rounded-xl">
              <CrownIcon className="h-6 w-6 text-white" />
            </div>
            <div>
              <CardTitle className="text-xl text-gray-900">Unlock Premium Power</CardTitle>
              <p className="text-gray-600 mt-1">{getUpgradeMessage()}</p>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Usage Progress for Near/At Limit */}
        {(isNearLimit || isAtLimit) && (
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-gray-700">{highestUsage.name} Usage</span>
              <span className="text-sm text-gray-600">{highestUsage.usage}/{highestUsage.limit}</span>
            </div>
            <Progress 
              value={Math.min(highestUsage.percent, 100)} 
              className={`h-2 ${isAtLimit ? 'bg-red-200' : 'bg-amber-200'}`}
            />
          </div>
        )}

        {/* Premium Features Preview */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-2 text-sm">
            <SparklesIcon className="h-4 w-4 text-purple-500" />
            <span>Unlimited Products</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <TrendingUpIcon className="h-4 w-4 text-blue-500" />
            <span>Advanced Analytics</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <CrownIcon className="h-4 w-4 text-yellow-500" />
            <span>Priority Support</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <SparklesIcon className="h-4 w-4 text-green-500" />
            <span>B2B Marketplace</span>
          </div>
        </div>

        {/* CTA Buttons */}
        <div className="flex gap-3 pt-2">
          <Link href="/subscription-pricing" className="flex-1">
            <Button 
              className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700" 
              size="lg"
            >
              <CrownIcon className="h-4 w-4 mr-2" />
              Upgrade to Premium
            </Button>
          </Link>
          <Button 
            variant="outline" 
            onClick={() => setIsDismissed(true)}
            className="px-4"
          >
            Later
          </Button>
        </div>

        {/* Pricing Info */}
        <div className="text-center pt-2 border-t">
          <p className="text-sm text-gray-600">
            Starting at <span className="font-semibold text-gray-900">£19.99/month</span>
            {currentPlan === 'free' && <span className="text-xs text-gray-500 block">Cancel anytime • 30-day money back</span>}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}