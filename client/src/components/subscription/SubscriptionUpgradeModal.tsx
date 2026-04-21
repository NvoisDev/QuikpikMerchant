import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Crown, Zap } from "lucide-react";

interface SubscriptionUpgradeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feature?: string;
  currentPlan?: string;
  reason?: string;
}

export function SubscriptionUpgradeModal({ 
  open, 
  onOpenChange, 
  feature = "this feature",
  currentPlan = "Free"
}: SubscriptionUpgradeModalProps) {
  
  const handleUpgrade = (_plan: string) => {
    window.location.href = '/subscription-pricing';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-lg sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-yellow-500" />
            Upgrade Required
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="text-center">
            <p className="text-muted-foreground text-sm">
              You need to upgrade your plan to access {feature}.{" "}
              Your current <Badge variant="outline">{currentPlan}</Badge> plan has reached its limits.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Standard Plan */}
            <Card className="relative border-primary mt-4 sm:mt-0">
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                <Badge className="bg-primary text-primary-foreground text-xs">
                  <Zap className="h-3 w-3 mr-1" />
                  Most Popular
                </Badge>
              </div>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="flex items-center justify-between text-base">
                  Standard
                  <Badge variant="secondary" className="text-xs">£19.99/mo</Badge>
                </CardTitle>
                <CardDescription className="text-xs">Perfect for growing businesses</CardDescription>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <ul className="space-y-1.5 mb-3">
                  <li className="flex items-center gap-2 text-sm">
                    <Check className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                    50 Products
                  </li>
                  <li className="flex items-center gap-2 text-sm">
                    <Check className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                    Broadcast tools coming soon
                  </li>
                  <li className="flex items-center gap-2 text-sm">
                    <Check className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                    3 Team Members
                  </li>
                  <li className="flex items-center gap-2 text-sm">
                    <Check className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                    Advanced Analytics
                  </li>
                </ul>
                <Button 
                  className="w-full"
                  size="sm"
                  onClick={() => handleUpgrade('standard')}
                >
                  Choose Standard
                </Button>
              </CardContent>
            </Card>

            {/* Premium Plan */}
            <Card className="relative">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="flex items-center justify-between text-base">
                  Premium
                  <Badge variant="default" className="text-xs">£39.99/mo</Badge>
                </CardTitle>
                <CardDescription className="text-xs">For scaling wholesale operations</CardDescription>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <ul className="space-y-1.5 mb-3">
                  <li className="flex items-center gap-2 text-sm">
                    <Check className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                    Unlimited Products
                  </li>
                  <li className="flex items-center gap-2 text-sm">
                    <Check className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                    Broadcast tools coming soon
                  </li>
                  <li className="flex items-center gap-2 text-sm">
                    <Check className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                    Unlimited Team Members
                  </li>
                  <li className="flex items-center gap-2 text-sm">
                    <Check className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                    Priority Support
                  </li>
                  <li className="flex items-center gap-2 text-sm">
                    <Check className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                    WhatsApp Integration
                  </li>
                </ul>
                <Button 
                  className="w-full"
                  size="sm"
                  onClick={() => handleUpgrade('premium')}
                >
                  Choose Premium
                </Button>
              </CardContent>
            </Card>
          </div>

          <div className="text-center pt-1 pb-1">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Continue with {currentPlan}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
