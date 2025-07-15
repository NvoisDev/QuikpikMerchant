import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Shield, ShoppingCart, Package, Star } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import Logo from "@/components/ui/logo";
import Footer from "@/components/ui/footer";

interface CustomerAuthProps {
  wholesalerId: string;
  onAuthSuccess: (customerData: any) => void;
  onSkipAuth?: () => void;
}

interface Wholesaler {
  id: string;
  businessName: string;
  logoType?: string;
  logoUrl?: string;
  firstName?: string;
  lastName?: string;
}

export function CustomerAuth({ wholesalerId, onAuthSuccess, onSkipAuth }: CustomerAuthProps) {
  const [lastFourDigits, setLastFourDigits] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [wholesaler, setWholesaler] = useState<Wholesaler | null>(null);
  const { toast } = useToast();

  // Fetch wholesaler data for personalization
  useEffect(() => {
    const fetchWholesaler = async () => {
      try {
        const response = await fetch(`/api/marketplace/wholesaler/${wholesalerId}`);
        if (response.ok) {
          const data = await response.json();
          setWholesaler(data);
        }
      } catch (error) {
        console.error('Failed to fetch wholesaler data:', error);
      }
    };

    if (wholesalerId) {
      fetchWholesaler();
    }
  }, [wholesalerId]);

  const handleLogin = async () => {
    if (!lastFourDigits) {
      setError("Please enter the last 4 digits of your phone number");
      return;
    }

    if (lastFourDigits.length !== 4) {
      setError("Please enter exactly 4 digits");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const response = await fetch('/api/customer-auth/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          wholesalerId,
          lastFourDigits: lastFourDigits.trim()
        }),
      });

      const data = await response.json();

      if (response.ok) {
        toast({
          title: "Welcome!",
          description: `Hello ${data.customer.name}, you're now logged in.`,
        });
        onAuthSuccess(data.customer);
      } else {
        setError(data.error || "Authentication failed. Please check your details.");
      }
    } catch (error) {
      console.error('Authentication error:', error);
      setError("Connection error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLastFourChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 4); // Only digits, max 4
    setLastFourDigits(value);
  };

  // Helper function to generate initials from business name
  const getInitials = (businessName: string) => {
    return businessName
      .split(' ')
      .map(word => word.charAt(0))
      .join('')
      .substring(0, 2)
      .toUpperCase();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-green-50 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background Cartoon Elements */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Floating Shapes */}
        <div className="absolute top-20 left-20 w-12 h-12 bg-yellow-300 rounded-full opacity-60 animate-bounce" style={{ animationDelay: '0s' }}></div>
        <div className="absolute top-40 right-32 w-8 h-8 bg-pink-300 rounded-full opacity-50 animate-bounce" style={{ animationDelay: '2s' }}></div>
        <div className="absolute bottom-32 left-16 w-6 h-6 bg-purple-300 rounded-full opacity-60 animate-bounce" style={{ animationDelay: '1s' }}></div>
        <div className="absolute bottom-20 right-20 w-10 h-10 bg-green-300 rounded-full opacity-50 animate-bounce" style={{ animationDelay: '3s' }}></div>
        
        {/* Cute Cartoon Icons */}
        <div className="absolute top-16 right-16 text-4xl animate-pulse" style={{ animationDelay: '1s' }}>🛒</div>
        <div className="absolute bottom-40 left-32 text-3xl animate-pulse" style={{ animationDelay: '2s' }}>📦</div>
        <div className="absolute top-1/2 left-10 text-2xl animate-pulse" style={{ animationDelay: '0.5s' }}>⭐</div>
        <div className="absolute top-32 left-1/2 text-3xl animate-pulse" style={{ animationDelay: '3s' }}>🎉</div>
        <div className="absolute bottom-16 right-1/2 text-2xl animate-pulse" style={{ animationDelay: '1.5s' }}>💎</div>
      </div>

      <div className="w-full max-w-md mx-auto relative z-10">
        {/* Wholesaler Logo/Initials Header */}
        <div className="text-center mb-8">
          <div className="mx-auto mb-6 relative">
            {wholesaler?.logoUrl ? (
              <img 
                src={wholesaler.logoUrl} 
                alt={wholesaler.businessName}
                className="w-24 h-24 rounded-full object-cover mx-auto border-4 border-white shadow-lg"
              />
            ) : (
              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-green-500 to-blue-500 flex items-center justify-center mx-auto border-4 border-white shadow-lg">
                <span className="text-2xl font-bold text-white">
                  {wholesaler ? getInitials(wholesaler.businessName) : 'Q'}
                </span>
              </div>
            )}
            {/* Cute decoration around logo */}
            <div className="absolute -top-2 -right-2 w-8 h-8 bg-yellow-400 rounded-full flex items-center justify-center shadow-md">
              <span className="text-lg">✨</span>
            </div>
          </div>
          
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Welcome to {wholesaler?.businessName || 'Our Store'}!
          </h1>
          <p className="text-gray-600 text-lg">
            Please enter your security code to continue
          </p>
        </div>

        {/* Authentication Card */}
        <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-xl rounded-2xl">
          <CardContent className="p-8">
            <div className="space-y-6">
              <div className="space-y-3">
                <Label htmlFor="lastFour" className="text-sm font-medium text-gray-700 text-center block">
                  Last 4 digits of your phone number
                </Label>
                <div className="relative">
                  <Input
                    id="lastFour"
                    type="password"
                    placeholder="••••"
                    value={lastFourDigits}
                    onChange={handleLastFourChange}
                    maxLength={4}
                    className="text-center text-3xl tracking-[1rem] font-mono h-16 border-2 border-gray-300 rounded-2xl bg-gray-50 focus:bg-white focus:border-green-500 transition-all duration-300"
                  />
                  {/* Cute input decoration */}
                  <div className="absolute -right-3 top-1/2 transform -translate-y-1/2 text-2xl animate-pulse">🔐</div>
                </div>
              </div>

              {error && (
                <Alert variant="destructive" className="rounded-xl border-0 bg-red-50">
                  <AlertDescription className="text-center">{error}</AlertDescription>
                </Alert>
              )}

              <Button 
                onClick={handleLogin} 
                className="w-full bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600 text-white h-14 rounded-2xl font-semibold text-lg shadow-lg transform transition-all duration-200 hover:scale-105"
                disabled={isLoading || lastFourDigits.length !== 4}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-3 h-5 w-5 animate-spin" />
                    Verifying your access...
                  </>
                ) : (
                  <>
                    <span>Enter Store</span>
                    <span className="ml-2 text-xl">🚀</span>
                  </>
                )}
              </Button>

              {onSkipAuth && (
                <div className="text-center pt-4">
                  <Button 
                    variant="ghost" 
                    onClick={onSkipAuth}
                    className="text-sm text-gray-500 hover:text-gray-700 rounded-xl"
                  >
                    Browse as guest 👀
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Cute Bottom Message */}
        <div className="text-center mt-6 bg-white/60 backdrop-blur-sm rounded-2xl p-4 border border-gray-100">
          <p className="text-sm text-gray-600">
            🛡️ Secure access for registered customers only
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Your security matters to us!
          </p>
        </div>
      </div>
      
      {/* Footer */}
      <div className="absolute bottom-0 left-0 right-0">
        <Footer />
      </div>
    </div>
  );
}