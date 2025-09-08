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
}

export function SubscriptionUpgradeModal({ 
  open, 
  onOpenChange, 
  feature = "this feature",
  currentPlan = "Free"
}: SubscriptionUpgradeModalProps) {
  
  const handleUpgrade = (plan: string) => {
    window.location.href = '/subscription-pricing';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-yellow-500" />
            Upgrade Required
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          <div className="text-center">
            <p className="text-muted-foreground">
              You need to upgrade your plan to access {feature}. 
              <br />
              Your current <Badge variant="outline">{currentPlan}</Badge> plan has reached its limits.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {/* Standard Plan */}
            <Card className="relative">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  Standard
                  <Badge variant="secondary">£9.99/month</Badge>
                </CardTitle>
                <CardDescription>Perfect for growing businesses</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500" />
                    50 Products
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500" />
                    10 Marketing Campaigns
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500" />
                    3 Team Members
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500" />
                    Advanced Analytics
                  </li>
                </ul>
                <Button 
                  className="w-full mt-4" 
                  onClick={() => handleUpgrade('standard')}
                >
                  Choose Standard
                </Button>
              </CardContent>
            </Card>

            {/* Premium Plan */}
            <Card className="relative border-primary">
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                <Badge className="bg-primary text-primary-foreground">
                  <Zap className="h-3 w-3 mr-1" />
                  Most Popular
                </Badge>
              </div>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  Premium
                  <Badge variant="default">£19.99/month</Badge>
                </CardTitle>
                <CardDescription>For scaling wholesale operations</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500" />
                    Unlimited Products
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500" />
                    Unlimited Campaigns
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500" />
                    10 Team Members
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500" />
                    Priority Support
                  </li>
                  <li className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-green-500" />
                    WhatsApp Integration
                  </li>
                </ul>
                <Button 
                  className="w-full mt-4" 
                  onClick={() => handleUpgrade('premium')}
                >
                  Choose Premium
                </Button>
              </CardContent>
            </Card>
          </div>

          <div className="text-center">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Continue with {currentPlan}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}