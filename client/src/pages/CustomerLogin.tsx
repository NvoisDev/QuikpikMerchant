import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { ArrowLeft, Store, Search } from "lucide-react";

export default function CustomerLogin() {
  const [wholesalerId, setWholesalerId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!wholesalerId.trim()) {
      toast({
        title: "Wholesaler ID Required",
        description: "Please enter a wholesaler ID to continue",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    
    try {
      // Check if wholesaler exists
      const response = await fetch(`/api/wholesaler/${encodeURIComponent(wholesalerId.trim())}`);
      
      if (response.ok) {
        const wholesaler = await response.json();
        // Redirect to customer portal for this wholesaler
        window.location.href = `/customer/${wholesaler.id}`;
      } else if (response.status === 404) {
        toast({
          title: "Wholesaler Not Found",
          description: "No wholesaler found with this ID. Please check the ID and try again.",
          variant: "destructive"
        });
      } else {
        toast({
          title: "Error",
          description: "Unable to verify wholesaler ID. Please try again.",
          variant: "destructive"
        });
      }
    } catch (error) {
      toast({
        title: "Connection Error",
        description: "Unable to connect to server. Please check your internet connection.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-white to-green-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Back to Home Link */}
        <div className="text-center mb-6">
          <Link href="/" className="inline-flex items-center text-gray-600 hover:text-gray-900 transition-colors">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Home
          </Link>
        </div>

        <Card className="w-full shadow-lg">
          <CardHeader className="text-center space-y-2">
            <div className="mx-auto h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Store className="h-8 w-8 text-primary" />
            </div>
            <CardTitle className="text-2xl font-bold text-gray-900">
              Customer Login
            </CardTitle>
            <p className="text-gray-600">
              Enter your wholesaler's store ID to access their products
            </p>
          </CardHeader>
          
          <CardContent className="space-y-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="wholesalerId">Wholesaler Store ID</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    id="wholesalerId"
                    type="text"
                    placeholder="Enter store ID (e.g., 123456789)"
                    value={wholesalerId}
                    onChange={(e) => setWholesalerId(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>
              
              <Button 
                type="submit" 
                className="w-full" 
                disabled={isLoading}
              >
                {isLoading ? "Finding Store..." : "Access Store"}
              </Button>
            </form>

            <div className="text-center space-y-3">
              <div className="bg-blue-50 rounded-lg p-4">
                <p className="text-sm text-blue-700 font-medium">Need help finding your Store ID?</p>
                <p className="text-xs text-blue-600 mt-1">
                  Contact your wholesaler for their unique store ID or check any previous order confirmations
                </p>
              </div>
              
              <div className="text-xs text-gray-500">
                Are you a wholesaler? {" "}
                <Link href="/login" className="text-primary hover:underline font-medium">
                  Login to your dashboard
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}