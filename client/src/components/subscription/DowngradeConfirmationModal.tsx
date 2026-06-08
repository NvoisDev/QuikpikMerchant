import { useState } from 'react';
import { formatCurrency } from '@/lib/currencies';
import { getBaseTier } from '@/lib/planUtils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangleIcon, X, CheckIcon, CrownIcon } from 'lucide-react';

interface PlanInfo {
  planId: string;
  name: string;
  monthlyPrice: string;
  productLimit?: number;
  features: string[];
}

interface DowngradeConfirmationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPlan: string;
  targetPlan: string;
  onConfirmDowngrade: () => void;
  isLoading?: boolean;
  plans?: PlanInfo[];
  isCancelAtPeriodEnd?: boolean;
  billingInfo?: {
    currentPeriodEnd?: number;
    daysRemaining?: number;
    proratedCredit?: number;
    nextBillingAmount?: number;
    currentPlanPrice?: number;
    targetPlanPrice?: number;
  };
}

const FALLBACK_PLAN_FEATURES: Record<string, PlanInfo> = {
  premium: {
    planId: "premium",
    name: "Premium",
    monthlyPrice: "99.99",
    productLimit: -1,
    features: [
      "Unlimited products",
      "Unlimited price lists",
      "Unlimited team members",
      "Broadcast & marketing tools",
      "Advanced permissions & reporting",
      "Priority support",
    ],
  },
  standard: {
    planId: "standard",
    name: "Standard",
    monthlyPrice: "49.99",
    productLimit: 50,
    features: [
      "Up to 50 products",
      "Up to 10 price lists",
      "Up to 3 team members",
      "Advanced analytics",
      "Picking & checklists",
      "Priority support",
    ],
  },
  starter: {
    planId: "starter",
    name: "Starter",
    monthlyPrice: "29.99",
    productLimit: 20,
    features: [
      "Up to 20 products",
      "Up to 5 price lists",
      "Invoices & payments",
      "Customer & order management",
      "Customer portal",
      "Stock tracking",
    ],
  },
  listing: {
    planId: "listing",
    name: "Listing",
    monthlyPrice: "19.99",
    productLimit: 10,
    features: [
      "Up to 10 products",
      "Up to 2 price lists",
      "Public supplier profile",
      "Marketplace & search visibility",
      "Retailer enquiries & leads",
    ],
  },
  free: {
    planId: "free",
    name: "Free",
    monthlyPrice: "0.00",
    productLimit: 20,
    features: [
      "Up to 20 products",
      "Up to 5 price lists",
      "Invoices & payments",
      "Customer management",
      "Order management",
    ],
  },
};

function resolvePlan(planId: string, plans?: PlanInfo[]): PlanInfo {
  if (plans && plans.length > 0) {
    const match = plans.find(p => p.planId === planId);
    if (match) return match;
  }
  return FALLBACK_PLAN_FEATURES[planId] ?? FALLBACK_PLAN_FEATURES.free;
}

export function DowngradeConfirmationModal({
  open,
  onOpenChange,
  currentPlan,
  targetPlan,
  onConfirmDowngrade,
  isLoading = false,
  plans,
  isCancelAtPeriodEnd = false,
  billingInfo
}: DowngradeConfirmationModalProps) {
  const [confirmationChecked, setConfirmationChecked] = useState(false);
  
  const currentFeatures = resolvePlan(currentPlan, plans);
  const targetFeatures = resolvePlan(targetPlan, plans);
  
  const lostFeatures = currentFeatures.features.filter(
    feature => !targetFeatures.features.includes(feature)
  );
  
  const retainedFeatures = currentFeatures.features.filter(
    feature => targetFeatures.features.includes(feature)
  );

  const formatEndDate = (timestamp?: number) => {
    if (!timestamp) return "end of current billing period";
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString('en-GB', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
  };

  const handleConfirm = () => {
    if (!confirmationChecked) {
      return;
    }
    
    onConfirmDowngrade();
    setConfirmationChecked(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <AlertTriangleIcon className="h-6 w-6 text-amber-500" />
            Confirm Plan Downgrade
          </DialogTitle>
          <DialogDescription>
            You're about to downgrade from <Badge variant="outline">{currentFeatures.name}</Badge> to <Badge variant="outline">{targetFeatures.name}</Badge>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Billing Information */}
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="p-4">
              <h3 className="font-semibold text-blue-900 mb-3">📅 Billing & Timeline Information</h3>
              
              <div className="space-y-3">
                {isCancelAtPeriodEnd ? (
                  <div>
                    <p className="text-blue-800 text-sm">
                      <strong>Effective Date:</strong> {formatEndDate(billingInfo?.currentPeriodEnd)}
                    </p>
                    <p className="text-blue-700 text-xs mt-1">
                      You'll keep all your current {currentFeatures.name} features until your billing period ends
                      {billingInfo?.daysRemaining !== undefined ? ` (${billingInfo.daysRemaining} day${billingInfo.daysRemaining !== 1 ? 's' : ''} remaining)` : ''}.
                      After that, your plan switches to {targetFeatures.name} and no further charges will be made for the {currentFeatures.name} plan.
                    </p>
                  </div>
                ) : (
                  <div>
                    <p className="text-blue-800 text-sm">
                      <strong>Effective Date:</strong> Immediately upon confirmation
                    </p>
                    <p className="text-blue-700 text-xs mt-1">
                      Your plan will change to {targetFeatures.name} right away, and you'll receive a pro-rated credit for any unused time from your {currentFeatures.name} plan.
                    </p>
                  </div>
                )}

                {!isCancelAtPeriodEnd && billingInfo?.proratedCredit && billingInfo.proratedCredit > 0 && (
                  <div className="bg-green-100 p-3 rounded-md border border-green-200">
                    <p className="text-green-800 text-sm font-medium">
                      💰 You'll receive a pro-rated credit of <strong>{formatCurrency(billingInfo.proratedCredit)}</strong>
                    </p>
                    <p className="text-green-700 text-xs mt-1">
                      This credit will be applied to your next billing cycle or refunded if you cancel completely.
                    </p>
                  </div>
                )}

                <div className="bg-gray-100 p-3 rounded-md">
                  {isCancelAtPeriodEnd ? (
                    <p className="text-gray-800 text-sm">
                      <strong>No charge until renewal:</strong> You won't be billed again for {currentFeatures.name}. After the switch, your {targetFeatures.name} plan will be <strong>{formatCurrency(parseFloat(targetFeatures.monthlyPrice))}/month</strong>.
                    </p>
                  ) : (
                    <p className="text-gray-800 text-sm">
                      <strong>Next Billing:</strong> Your next charge will be <strong>{formatCurrency(billingInfo?.nextBillingAmount ?? parseFloat(targetFeatures.monthlyPrice))}/month</strong> for the {targetFeatures.name} plan
                    </p>
                  )}
                  {!isCancelAtPeriodEnd && billingInfo?.currentPlanPrice && billingInfo?.targetPlanPrice && (
                    <p className="text-gray-600 text-xs mt-1">
                      Monthly savings: {formatCurrency(billingInfo.currentPlanPrice - billingInfo.targetPlanPrice)}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Feature Loss Warning */}
          {lostFeatures.length > 0 && (
            <Card className="bg-red-50 border-red-200">
              <CardContent className="p-4">
                <h3 className="font-semibold text-red-900 mb-3 flex items-center gap-2">
                  <CrownIcon className="h-4 w-4" />
                  Features You'll Lose
                </h3>
                <ul className="space-y-2">
                  {lostFeatures.map((feature, index) => (
                    <li key={index} className="flex items-center gap-2 text-red-800 text-sm">
                      <X className="h-4 w-4 text-red-600 flex-shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Features You'll Keep */}
          {retainedFeatures.length > 0 && (
            <Card className="bg-green-50 border-green-200">
              <CardContent className="p-4">
                <h3 className="font-semibold text-green-900 mb-3">Features You'll Keep</h3>
                <ul className="space-y-2">
                  {retainedFeatures.map((feature, index) => (
                    <li key={index} className="flex items-center gap-2 text-green-800 text-sm">
                      <CheckIcon className="h-4 w-4 text-green-600 flex-shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {/* Data Impact Warning */}
          {getBaseTier(currentPlan) !== 'free' ? (
            <Card className="bg-amber-50 border-amber-200">
              <CardContent className="p-4">
                <h3 className="font-semibold text-amber-900 mb-2">⚠️ Data Impact</h3>
                <p className="text-amber-800 text-sm">
                  {targetFeatures.productLimit === -1
                    ? "No products will be affected — the new plan has no product limit."
                    : `If you have more than ${targetFeatures.productLimit} products, your newest products will be locked but preserved. You can unlock them by deleting other products or upgrading again.`}
                </p>
              </CardContent>
            </Card>
          ) : null}

          {/* Enhanced Confirmation Checkbox */}
          <div className="bg-gray-50 border-2 border-gray-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="confirm-downgrade"
                checked={confirmationChecked}
                onChange={(e) => setConfirmationChecked(e.target.checked)}
                className="mt-1 h-4 w-4 text-blue-600 border-2 border-gray-300 rounded focus:ring-blue-500"
                required
              />
              <label htmlFor="confirm-downgrade" className="text-sm text-gray-700 cursor-pointer leading-relaxed">
                <span className="font-medium">I understand and confirm that:</span>
                <ul className="mt-2 space-y-1 text-xs text-gray-600">
                  {isCancelAtPeriodEnd ? (
                    <>
                      <li>• I will keep my {currentFeatures.name} features until my billing period ends on {formatEndDate(billingInfo?.currentPeriodEnd)}</li>
                      <li>• My plan will switch to {targetFeatures.name} at the end of the billing period</li>
                      <li>• I will not be charged again for {currentFeatures.name}</li>
                      <li>• I can upgrade again at any time to restore full functionality</li>
                    </>
                  ) : (
                    <>
                      <li>• I will lose access to the {lostFeatures.length} premium features listed above immediately</li>
                      <li>• This change takes effect immediately upon confirmation</li>
                      <li>• I can upgrade again at any time to restore full functionality</li>
                      <li>• I will receive a pro-rated credit for any unused time on my current plan</li>
                    </>
                  )}
                </ul>
              </label>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-3">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
            className="flex-1"
          >
            Keep Current Plan
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={!confirmationChecked || isLoading}
            className="flex-1"
          >
            {isLoading ? (
              <div className="flex items-center gap-2">
                <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div>
                Processing...
              </div>
            ) : (
              `Confirm Downgrade to ${targetFeatures.name}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
