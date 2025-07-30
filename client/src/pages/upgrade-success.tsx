import { useEffect } from "react";
import { Crown } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function UpgradeSuccess() {
  useEffect(() => {
    // Auto-redirect to dashboard after 3 seconds
    const timer = setTimeout(() => {
      window.location.href = '/';
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="text-center py-12">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 rounded-full mb-8">
          <Crown className="w-10 h-10 text-green-600" />
        </div>
        
        <h1 className="text-4xl font-bold mb-4 text-green-800">Premium Plan Activated!</h1>
        <p className="text-xl text-gray-600 mb-8">
          Your subscription has been successfully upgraded to Premium!
        </p>
        
        <div className="bg-green-50 border border-green-200 rounded-xl p-6 mb-8 inline-block">
          <div className="flex items-center gap-3 mb-3">
            <Crown className="w-6 h-6 text-green-600" />
            <span className="font-bold text-xl text-green-800">Premium Plan Features</span>
          </div>
          <div className="text-left space-y-2">
            <p className="text-green-700 flex items-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
              <strong>Unlimited Products</strong> - Add as many products as you need
            </p>
            <p className="text-green-700 flex items-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
              <strong>B2B Marketplace Access</strong> - Reach more customers
            </p>
            <p className="text-green-700 flex items-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
              <strong>Team Management</strong> - Collaborate with team members
            </p>
            <p className="text-green-700 flex items-center gap-2">
              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
              <strong>Advanced Analytics</strong> - Track your business performance
            </p>
          </div>
          <p className="text-green-600 font-semibold mt-4">£19.99/month</p>
        </div>
        
        <p className="text-gray-600 mb-6">Redirecting to your dashboard in a few seconds...</p>
        
        <div className="space-y-4">
          <Button 
            onClick={() => window.location.href = '/'}
            size="lg"
            className="bg-green-600 hover:bg-green-700 text-white px-8 py-3"
          >
            Go to Dashboard Now
          </Button>
          
          <p className="text-sm text-gray-500">
            You now have access to all Premium features and unlimited products
          </p>
        </div>
      </div>
    </div>
  );
}