import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Crown, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useQueryClient } from "@tanstack/react-query";

export function SimpleUpgradeButton() {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleUpgrade = async () => {
    setIsLoading(true);
    try {
      // Direct Stripe checkout for Premium
      const response = await apiRequest("POST", "/api/subscription/create", {
        targetTier: "premium"
      });
      
      const data = await response.json();
      
      if (data.subscriptionUrl) {
        // Redirect to Stripe checkout
        window.location.href = data.subscriptionUrl;
      } else {
        throw new Error("No checkout URL received");
      }
    } catch (error) {
      console.error("Upgrade error:", error);
      toast({
        title: "Upgrade Failed",
        description: "Unable to start upgrade process. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button 
      onClick={handleUpgrade}
      disabled={isLoading}
      className="bg-gradient-to-r from-yellow-400 to-orange-500 hover:from-yellow-500 hover:to-orange-600 text-white font-semibold px-6 py-3 rounded-lg shadow-lg"
    >
      {isLoading ? (
        <>
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          Processing...
        </>
      ) : (
        <>
          <Crown className="w-4 h-4 mr-2" />
          Upgrade to Premium £19.99/month
        </>
      )}
    </Button>
  );
}