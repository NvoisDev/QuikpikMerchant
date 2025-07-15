import { useState } from "react";
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

export function CustomerAuth({ wholesalerId, onAuthSuccess, onSkipAuth }: CustomerAuthProps) {
  const [lastFourDigits, setLastFourDigits] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const { toast } = useToast();

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

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-6xl grid lg:grid-cols-2 gap-8 items-center">
        {/* Left Side - Authentication Form */}
        <div className="max-w-md mx-auto lg:mx-0">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-gray-900 mb-2">Welcome back!</h1>
            <p className="text-gray-600">
              Access your wholesale products and manage orders with Quikpik
            </p>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="lastFour" className="text-sm font-medium text-gray-700">
                Last 4 digits of phone number
              </Label>
              <Input
                id="lastFour"
                type="password"
                placeholder="****"
                value={lastFourDigits}
                onChange={handleLastFourChange}
                maxLength={4}
                className="text-center text-xl tracking-widest font-mono h-12 border-gray-300 rounded-xl"
              />
            </div>

            {error && (
              <Alert variant="destructive" className="rounded-xl">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button 
              onClick={handleLogin} 
              className="w-full bg-black hover:bg-gray-800 text-white h-12 rounded-xl font-medium"
              disabled={isLoading || lastFourDigits.length !== 4}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying...
                </>
              ) : (
                "Login"
              )}
            </Button>

            <div className="text-center text-sm text-gray-500 mt-6">
              or continue with
            </div>

            <div className="flex justify-center space-x-4 mt-4">
              <div className="w-12 h-12 bg-black rounded-full flex items-center justify-center cursor-pointer hover:bg-gray-800 transition-colors">
                <span className="text-white text-lg">Q</span>
              </div>
            </div>

            {onSkipAuth && (
              <div className="text-center mt-6">
                <Button 
                  variant="ghost" 
                  onClick={onSkipAuth}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Continue as guest
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Right Side - Illustration */}
        <div className="hidden lg:flex items-center justify-center">
          <div className="relative">
            {/* Background Circle */}
            <div className="w-96 h-96 bg-gradient-to-br from-green-100 to-blue-100 rounded-full flex items-center justify-center relative overflow-hidden">
              {/* Main Character - Shopping Person */}
              <div className="relative z-10">
                <div className="w-32 h-32 bg-green-500 rounded-full flex items-center justify-center mb-4">
                  <ShoppingCart className="w-16 h-16 text-white" />
                </div>
                <div className="text-center">
                  <h3 className="text-lg font-semibold text-gray-800">Quikpik Store</h3>
                  <p className="text-sm text-gray-600">Easy wholesale ordering</p>
                </div>
              </div>
              
              {/* Floating Elements */}
              <div className="absolute top-8 left-8 w-8 h-8 bg-green-400 rounded transform rotate-45"></div>
              <div className="absolute top-16 right-12 w-6 h-6 bg-blue-400 rounded-full"></div>
              <div className="absolute bottom-16 left-16 w-4 h-4 bg-yellow-400 rounded-full"></div>
              <div className="absolute bottom-8 right-8 w-6 h-6 bg-purple-400 rounded transform rotate-12"></div>
              
              {/* Product Icons */}
              <div className="absolute top-20 left-20">
                <Package className="w-6 h-6 text-green-600" />
              </div>
              <div className="absolute bottom-20 right-20">
                <Star className="w-5 h-5 text-yellow-500" />
              </div>
            </div>
            
            {/* Bottom Text */}
            <div className="text-center mt-8">
              <h2 className="text-2xl font-bold text-gray-800 mb-2">
                Streamline your wholesale business
              </h2>
              <p className="text-gray-600">
                with Quikpik's platform
              </p>
            </div>
          </div>
        </div>
      </div>
      
      {/* Footer */}
      <div className="absolute bottom-0 left-0 right-0">
        <Footer />
      </div>
    </div>
  );
}