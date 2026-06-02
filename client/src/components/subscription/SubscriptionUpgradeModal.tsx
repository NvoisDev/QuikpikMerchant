import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Crown } from "lucide-react";

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-yellow-500" />
            Upgrade Required
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-1">
          <p className="text-sm text-muted-foreground text-center">
            You need to upgrade your plan to access {feature}.{" "}
            Your current <Badge variant="outline">{currentPlan}</Badge> plan has reached its limits.
          </p>

          <Button
            className="w-full bg-emerald-600 hover:bg-emerald-700"
            onClick={() => { window.location.href = '/subscription-pricing'; }}
          >
            <Crown className="h-4 w-4 mr-2" />
            View Plans & Upgrade
          </Button>

          <div className="text-center">
            <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              Continue with {currentPlan}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
