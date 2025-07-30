import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Crown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AuthSuccess() {
  const { user, isLoading } = useAuth();

  useEffect(() => {
    // Auto-redirect to subscription settings after authentication
    if (user && !isLoading) {
      setTimeout(() => {
        window.location.href = '/subscription-settings';
      }, 2000);
    }
  }, [user, isLoading]);

  if (isLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="text-center py-12">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-green-600" />
          <h1 className="text-2xl font-bold mb-4">Authenticating...</h1>
          <p className="text-gray-600">Please wait while we verify your authentication.</p>
        </div>
      </div>
    );
  }

  if (user) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="text-center py-12">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-6">
            <Crown className="w-8 h-8 text-green-600" />
          </div>
          <h1 className="text-3xl font-bold mb-4">Welcome back, {user.firstName}!</h1>
          <p className="text-lg text-gray-600 mb-6">
            Authentication successful. Redirecting to your Premium subscription dashboard...
          </p>
          
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6 inline-block">
            <div className="flex items-center gap-2">
              <Crown className="w-5 h-5 text-green-600" />
              <span className="font-semibold text-green-800">Premium Plan Active</span>
            </div>
            <p className="text-green-700 mt-1">Access to unlimited products and premium features</p>
          </div>
          
          <Button 
            onClick={() => window.location.href = '/subscription-settings'}
            className="bg-green-600 hover:bg-green-700"
          >
            Go to Subscription Settings
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold mb-4">Authentication Required</h1>
        <p className="text-gray-600 mb-6">Please sign in to continue to your subscription settings.</p>
        <a 
          href="/api/auth/google"
          className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-medium transition-colors"
        >
          Sign in with Google
        </a>
      </div>
    </div>
  );
}