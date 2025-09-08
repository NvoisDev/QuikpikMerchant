import { useQuery } from '@tanstack/react-query';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { AlertTriangleIcon, CrownIcon } from 'lucide-react';
import { Link } from 'wouter';

interface PlanLimitBannerProps {
  feature: 'products' | 'broadcasts' | 'teamMembers';
  showWhenNearLimit?: boolean;
  threshold?: number; // Show banner when usage is above this percentage
}

export function PlanLimitBanner({ 
  feature, 
  showWhenNearLimit = true, 
  threshold = 80 
}: PlanLimitBannerProps) {
  const { data: planLimits, isLoading } = useQuery({
    queryKey: ['/api/subscriptions/plan-limits'],
  });

  if (isLoading || !planLimits) return null;

  const usage = planLimits.usage[feature];
  const limit = planLimits.limits[feature];
  const percentUsed = planLimits.percentUsed[feature];
  const isUnlimited = limit === -1;

  // Don't show banner for unlimited plans unless explicitly needed
  if (isUnlimited) return null;

  // Only show if near/at limit
  const shouldShow = showWhenNearLimit ? percentUsed >= threshold : usage >= limit;
  if (!shouldShow) return null;

  const isAtLimit = usage >= limit;
  const featureName = {
    products: 'Products',
    broadcasts: 'Broadcasts',
    teamMembers: 'Team Members'
  }[feature];

  return (
    <Alert className={`mb-4 ${isAtLimit ? 'border-red-200 bg-red-50' : 'border-yellow-200 bg-yellow-50'}`}>
      <AlertTriangleIcon className={`h-4 w-4 ${isAtLimit ? 'text-red-600' : 'text-yellow-600'}`} />
      <AlertDescription className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className={`font-medium ${isAtLimit ? 'text-red-800' : 'text-yellow-800'}`}>
              {isAtLimit ? 'Limit Reached' : 'Approaching Limit'}
            </span>
            <span className={`text-sm ${isAtLimit ? 'text-red-600' : 'text-yellow-600'}`}>
              {usage}/{limit} {featureName}
            </span>
          </div>
          <Progress 
            value={Math.min(percentUsed, 100)} 
            className={`h-2 mb-2 ${isAtLimit ? 'bg-red-200' : 'bg-yellow-200'}`}
          />
          <p className={`text-sm ${isAtLimit ? 'text-red-700' : 'text-yellow-700'}`}>
            {isAtLimit 
              ? `You've reached your ${planLimits.plan} plan limit. Upgrade to add more ${featureName.toLowerCase()}.`
              : `You're using ${percentUsed}% of your ${featureName.toLowerCase()} limit. Consider upgrading for more capacity.`
            }
          </p>
        </div>
        <Link href="/subscription/pricing">
          <Button 
            size="sm" 
            className={`ml-4 ${
              isAtLimit 
                ? 'bg-red-600 hover:bg-red-700' 
                : 'bg-yellow-600 hover:bg-yellow-700'
            }`}
          >
            <CrownIcon className="w-4 h-4 mr-1" />
            Upgrade
          </Button>
        </Link>
      </AlertDescription>
    </Alert>
  );
}

export default PlanLimitBanner;