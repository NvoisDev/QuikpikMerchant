import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar, CreditCard, AlertTriangle, Clock, ArrowDown } from "lucide-react";
import { format, addDays } from "date-fns";

interface DowngradeConfirmationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPlan: string;
  targetPlan: string;
  onConfirm: () => void;
  isLoading?: boolean;
}

export function DowngradeConfirmationModal({
  open,
  onOpenChange,
  currentPlan,
  targetPlan,
  onConfirm,
  isLoading = false
}: DowngradeConfirmationModalProps) {
  const currentDate = new Date();
  const planExpiryDate = addDays(currentDate, 30); // Assuming monthly billing
  const newBillingDate = addDays(currentDate, 30);

  const planPrices = {
    premium: "£19.99",
    standard: "£10.99",
    free: "£0"
  };

  const planLimits = {
    premium: { products: "Unlimited", features: "All premium features" },
    standard: { products: "Up to 10", features: "Standard features" },
    free: { products: "Up to 3", features: "Basic features only" }
  };

  const getCurrentPlanColor = (plan: string) => {
    switch (plan) {
      case 'premium': return 'bg-gradient-to-r from-purple-500 to-pink-500';
      case 'standard': return 'bg-blue-500';
      case 'free': return 'bg-gray-500';
      default: return 'bg-gray-500';
    }
  };

  const getTargetPlanColor = (plan: string) => {
    switch (plan) {
      case 'premium': return 'bg-gradient-to-r from-purple-500 to-pink-500';
      case 'standard': return 'bg-blue-500';
      case 'free': return 'bg-green-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <ArrowDown className="h-5 w-5 text-orange-500" />
            Confirm Plan Downgrade
          </DialogTitle>
          <DialogDescription>
            Review the details of your plan change before confirming
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Plan Change Visual */}
          <div className="flex items-center justify-center gap-4">
            <div className="text-center">
              <div className={`${getCurrentPlanColor(currentPlan)} text-white px-4 py-2 rounded-lg font-semibold capitalize mb-2`}>
                {currentPlan} Plan
              </div>
              <p className="text-sm text-muted-foreground">Current</p>
            </div>
            <ArrowDown className="h-6 w-6 text-muted-foreground" />
            <div className="text-center">
              <div className={`${getTargetPlanColor(targetPlan)} text-white px-4 py-2 rounded-lg font-semibold capitalize mb-2`}>
                {targetPlan} Plan
              </div>
              <p className="text-sm text-muted-foreground">New</p>
            </div>
          </div>

          {/* Billing Timeline */}
          <Card className="border-orange-200 bg-orange-50">
            <CardContent className="p-4">
              <h3 className="font-semibold flex items-center gap-2 mb-4">
                <Clock className="h-4 w-4" />
                Billing Timeline
              </h3>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-white rounded-lg border">
                  <div className="flex items-center gap-3">
                    <Calendar className="h-4 w-4 text-blue-500" />
                    <div>
                      <p className="font-medium">Current {currentPlan} plan expires</p>
                      <p className="text-sm text-muted-foreground">You'll keep all features until then</p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-blue-600 border-blue-200">
                    {format(planExpiryDate, 'MMM dd, yyyy')}
                  </Badge>
                </div>

                <div className="flex items-center justify-between p-3 bg-white rounded-lg border">
                  <div className="flex items-center gap-3">
                    <CreditCard className="h-4 w-4 text-green-500" />
                    <div>
                      <p className="font-medium">New {targetPlan} billing starts</p>
                      <p className="text-sm text-muted-foreground">
                        {targetPlan === 'free' ? 'No charge' : `${(planPrices as any)[targetPlan]}/month`}
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-green-600 border-green-200">
                    {format(newBillingDate, 'MMM dd, yyyy')}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Feature Changes */}
          <Card className="border-red-200 bg-red-50">
            <CardContent className="p-4">
              <h3 className="font-semibold flex items-center gap-2 mb-4 text-red-800">
                <AlertTriangle className="h-4 w-4" />
                What Changes After Downgrade
              </h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="font-medium text-red-700 mb-2">You'll Lose:</h4>
                  <ul className="text-sm space-y-1 text-red-600">
                    {currentPlan === 'premium' && targetPlan !== 'premium' && (
                      <>
                        <li>• Unlimited products</li>
                        <li>• Advanced analytics</li>
                        <li>• Premium integrations</li>
                      </>
                    )}
                    {currentPlan !== 'free' && targetPlan === 'free' && (
                      <>
                        <li>• Extended product limits</li>
                        <li>• Team member access</li>
                        <li>• Advanced WhatsApp features</li>
                      </>
                    )}
                  </ul>
                </div>
                
                <div>
                  <h4 className="font-medium text-green-700 mb-2">You'll Keep:</h4>
                  <ul className="text-sm space-y-1 text-green-600">
                    <li>• {(planLimits as any)[targetPlan].products} products</li>
                    <li>• {(planLimits as any)[targetPlan].features}</li>
                    <li>• All existing data</li>
                    <li>• Customer relationships</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Next Billing Amount */}
          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-blue-800">Next Billing Amount</h3>
                  <p className="text-sm text-blue-600">Starting {format(newBillingDate, 'MMM dd, yyyy')}</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-blue-800">
                    {(planPrices as any)[targetPlan]}
                  </p>
                  <p className="text-sm text-blue-600">
                    {targetPlan === 'free' ? 'forever' : 'per month'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <DialogFooter>
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button 
            onClick={onConfirm}
            disabled={isLoading}
            className="bg-orange-600 hover:bg-orange-700"
          >
            {isLoading ? 'Processing...' : `Confirm Downgrade to ${targetPlan}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}