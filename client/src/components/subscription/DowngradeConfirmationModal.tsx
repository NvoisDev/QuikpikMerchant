import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangleIcon, X, CheckIcon, CrownIcon } from 'lucide-react';

interface DowngradeConfirmationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPlan: string;
  targetPlan: string;
  onConfirmDowngrade: () => void;
  isLoading?: boolean;
  billingInfo?: {
    currentPeriodEnd?: number;
    daysRemaining?: number;
  };
}

const getPlanFeatures = (plan: string) => {
  const features = {
    premium: {
      name: "Premium",
      price: "£19.99",
      features: [
        "Unlimited products",
        "Unlimited broadcasts",
        "Full business performance analytics",
        "Custom reports and insights",
        "Priority email and phone support",
        "B2B Marketplace access",
        "Advanced advertising tools"
      ]
    },
    standard: {
      name: "Standard", 
      price: "£9.99",
      features: [
        "Up to 50 products",
        "Up to 25 broadcasts per month",
        "Advanced analytics and insights",
        "Priority email support",
        "Team management (3 members)"
      ]
    },
    free: {
      name: "Free",
      price: "£0",
      features: [
        "Up to 10 products",
        "Up to 5 broadcasts per month",
        "Basic dashboard analytics",
        "Standard email support"
      ]
    }
  };
  return features[plan as keyof typeof features] || features.free;
};

export function DowngradeConfirmationModal({
  open,
  onOpenChange,
  currentPlan,
  targetPlan,
  onConfirmDowngrade,
  isLoading = false,
  billingInfo
}: DowngradeConfirmationModalProps) {
  const [confirmationChecked, setConfirmationChecked] = useState(false);
  
  const currentFeatures = getPlanFeatures(currentPlan);
  const targetFeatures = getPlanFeatures(targetPlan);
  
  // Features that will be lost
  const lostFeatures = currentFeatures.features.filter(
    feature => !targetFeatures.features.includes(feature)
  );
  
  // Features that will be retained
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
    if (confirmationChecked) {
      onConfirmDowngrade();
      setConfirmationChecked(false);
      onOpenChange(false);
    }
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
              <h3 className="font-semibold text-blue-900 mb-2">📅 When This Takes Effect</h3>
              <p className="text-blue-800 text-sm">
                Your downgrade will take effect on <strong>{formatEndDate(billingInfo?.currentPeriodEnd)}</strong>
                {billingInfo?.daysRemaining && (
                  <span> ({billingInfo.daysRemaining} days remaining)</span>
                )}. 
                <br />
                You'll keep all {currentFeatures.name} features until then with no additional charges.
              </p>
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
          {currentPlan === 'premium' || currentPlan === 'standard' ? (
            <Card className="bg-amber-50 border-amber-200">
              <CardContent className="p-4">
                <h3 className="font-semibold text-amber-900 mb-2">⚠️ Data Impact</h3>
                <p className="text-amber-800 text-sm">
                  If you have more than {targetPlan === 'free' ? '10 products' : '50 products'}, 
                  your newest products will be locked but preserved. You can unlock them by deleting 
                  other products or upgrading again.
                </p>
              </CardContent>
            </Card>
          ) : null}

          {/* Confirmation Checkbox */}
          <div className="flex items-start gap-3 p-4 bg-gray-50 rounded-lg">
            <input
              type="checkbox"
              id="confirm-downgrade"
              checked={confirmationChecked}
              onChange={(e) => setConfirmationChecked(e.target.checked)}
              className="mt-1"
            />
            <label htmlFor="confirm-downgrade" className="text-sm text-gray-700 cursor-pointer">
              I understand that I will lose access to the features listed above when my current billing period ends. 
              I can upgrade again at any time to restore full functionality.
            </label>
          </div>
        </div>

        <DialogFooter className="gap-3">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Keep Current Plan
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={!confirmationChecked || isLoading}
          >
            {isLoading ? (
              'Processing...'
            ) : (
              `Confirm Downgrade to ${targetFeatures.name}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}