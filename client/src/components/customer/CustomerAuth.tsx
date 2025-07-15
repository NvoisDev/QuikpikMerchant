import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Shield } from "lucide-react";
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
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="flex-1 grid lg:grid-cols-2">
        {/* Left Side - Branding */}
        <div className="bg-gradient-to-br from-green-600 to-green-700 flex items-center justify-center p-8 lg:p-12">
          <div className="text-center text-white max-w-md">
            <div className="mb-8">
              <Logo variant="text-only" size="2xl" className="text-white mb-4" />
              <div className="text-4xl lg:text-5xl font-bold mb-2">Quikpik</div>
              <div className="text-xl lg:text-2xl font-light opacity-90">Wholesale Platform</div>
            </div>
            <div className="space-y-4 text-lg lg:text-xl opacity-80">
              <p>Connecting wholesalers with retailers</p>
              <p>Secure • Simple • Efficient</p>
            </div>
          </div>
        </div>

        {/* Right Side - Authentication Form */}
        <div className="flex items-center justify-center p-8 lg:p-12">
          <div className="w-full max-w-md">
            <Card className="shadow-xl border-0">
              <CardHeader className="text-center pb-6">
                <div className="mx-auto mb-4 w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                  <Shield className="w-6 h-6 text-green-600" />
                </div>
                <CardTitle className="text-2xl">Customer Access</CardTitle>
                <p className="text-gray-600 text-sm">
                  Secure access for registered customers only
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                  <p className="text-sm text-blue-800 text-center">
                    Please enter the last 4 digits of your phone number to access this store
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="lastFour" className="text-center block">Last 4 Digits of Your Phone Number</Label>
                  <Input
                    id="lastFour"
                    type="password"
                    placeholder="****"
                    value={lastFourDigits}
                    onChange={handleLastFourChange}
                    maxLength={4}
                    className="text-center text-xl tracking-widest font-mono"
                  />
                </div>

                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                <Button 
                  onClick={handleLogin} 
                  className="w-full bg-green-600 hover:bg-green-700"
                  disabled={isLoading || lastFourDigits.length !== 4}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    "Access Store"
                  )}
                </Button>

                {onSkipAuth && (
                  <div className="text-center">
                    <Button 
                      variant="ghost" 
                      onClick={onSkipAuth}
                      className="text-sm text-gray-500 hover:text-gray-700"
                    >
                      Continue as guest (limited access)
                    </Button>
                  </div>
                )}

                <div className="text-xs text-gray-500 text-center space-y-1">
                  <p>Only customers in the wholesaler's contact groups can access this store.</p>
                  <p>Your phone number must match our records exactly.</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      
      {/* Footer */}
      <Footer />
    </div>
  );
}