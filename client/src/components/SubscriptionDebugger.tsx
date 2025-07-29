import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, Zap, AlertCircle } from "lucide-react";

export function SubscriptionDebugger() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isUpgrading, setIsUpgrading] = useState(false);

  // Get debug subscription data
  const { data: debugData, refetch } = useQuery({
    queryKey: ["/api/subscription/debug"],
    retry: false,
  });

  const handleManualUpgrade = async (planId: string) => {
    setIsUpgrading(true);
    try {
      const response = await apiRequest("POST", "/api/subscription/manual-upgrade", {
        planId: planId,
        stripeSessionId: `manual_${Date.now()}`
      });
      
      if (response.ok) {
        const result = await response.json();
        console.log("Manual upgrade result:", result);
        
        toast({
          title: "Upgrade Successful!",
          description: `Successfully upgraded to ${planId} plan`,
        });
        
        // Refresh all relevant data
        queryClient.invalidateQueries({ queryKey: ["/api/subscription/status"] });
        queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
        refetch();
        
        // Force page refresh to ensure UI updates
        setTimeout(() => window.location.reload(), 1000);
      } else {
        throw new Error("Upgrade failed");
      }
    } catch (error) {
      console.error("Manual upgrade error:", error);
      toast({
        title: "Upgrade Failed",
        description: "Failed to upgrade subscription. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUpgrading(false);
    }
  };

  const handleRefreshData = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/subscription/status"] });
    queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    refetch();
    
    toast({
      title: "Data Refreshed",
      description: "Subscription data has been refreshed",
    });
  };

  if (!user) return null;

  return (
    <Card className="mb-6 border-orange-200 bg-orange-50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-orange-800">
          <AlertCircle className="h-5 w-5" />
          Subscription Debug Panel
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <strong>User ID:</strong> {user.id}
          </div>
          <div>
            <strong>Email:</strong> {user.email}
          </div>
          <div>
            <strong>Current Tier:</strong> 
            <Badge className="ml-2" variant={user.subscriptionTier === 'premium' ? 'default' : 'secondary'}>
              {user.subscriptionTier || 'free'}
            </Badge>
          </div>
          <div>
            <strong>Status:</strong> 
            <Badge className="ml-2" variant={user.subscriptionStatus === 'active' ? 'default' : 'secondary'}>
              {user.subscriptionStatus || 'inactive'}
            </Badge>
          </div>
          <div>
            <strong>Product Limit:</strong> {user.productLimit === -1 ? 'Unlimited' : user.productLimit || '3'}
          </div>
          <div>
            <strong>Stripe Sub ID:</strong> {user.stripeSubscriptionId || 'None'}
          </div>
        </div>

        {debugData && (
          <div className="bg-white p-3 rounded border">
            <strong>Debug Data:</strong>
            <pre className="text-xs mt-2 whitespace-pre-wrap">
              {JSON.stringify(debugData, null, 2)}
            </pre>
          </div>
        )}

        <div className="flex gap-2 flex-wrap">
          <Button 
            onClick={handleRefreshData}
            variant="outline"
            size="sm"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh Data
          </Button>
          
          <Button 
            onClick={() => handleManualUpgrade('premium')}
            disabled={isUpgrading}
            size="sm"
            className="bg-purple-600 hover:bg-purple-700"
          >
            <Zap className="h-4 w-4 mr-2" />
            {isUpgrading ? 'Upgrading...' : 'Force Premium Upgrade'}
          </Button>
          
          <Button 
            onClick={() => handleManualUpgrade('standard')}
            disabled={isUpgrading}
            variant="outline"
            size="sm"
          >
            Force Standard Upgrade
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}