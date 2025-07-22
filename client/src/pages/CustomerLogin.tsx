import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Link, useLocation, useRouter } from "wouter";
import { ArrowLeft, Store, Search, Check, ShoppingBag, Package, TrendingUp, Clock, Star, Users } from "lucide-react";
import { Command, CommandInput, CommandItem, CommandList, CommandEmpty, CommandGroup } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface Wholesaler {
  id: string;
  businessName: string;
  email: string;
}

// Dynamic welcome message generator
const getWelcomeMessage = () => {
  const hour = new Date().getHours();
  const day = new Date().getDay();
  const month = new Date().getMonth();
  const date = new Date().getDate();

  // Special occasions
  if (month === 11 && date >= 20) return "🎄 Holiday shopping made easy";
  if (month === 0 && date <= 7) return "🎊 New Year, new deals";
  if (day === 5) return "🎉 Friday deals await";
  if (day === 1) return "💪 Monday motivation shopping";

  // Time-based
  if (hour >= 5 && hour < 12) return "🌅 Early bird shopping";
  if (hour >= 12 && hour < 17) return "☀️ Afternoon marketplace";
  if (hour >= 17 && hour < 21) return "🌆 Evening shopping time";
  return "🌙 Late night deals";
};

// Floating animated icons component
const FloatingIcons = () => {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Floating business icons */}
      <div className="absolute top-1/4 left-1/4 animate-bounce" style={{ animationDelay: '0s', animationDuration: '3s' }}>
        <ShoppingBag className="h-8 w-8 text-white/30" />
      </div>
      <div className="absolute top-1/3 right-1/4 animate-bounce" style={{ animationDelay: '1s', animationDuration: '4s' }}>
        <Package className="h-6 w-6 text-white/25" />
      </div>
      <div className="absolute bottom-1/3 left-1/3 animate-bounce" style={{ animationDelay: '2s', animationDuration: '5s' }}>
        <TrendingUp className="h-7 w-7 text-white/20" />
      </div>
      <div className="absolute top-1/2 right-1/3 animate-bounce" style={{ animationDelay: '1.5s', animationDuration: '3.5s' }}>
        <Star className="h-5 w-5 text-white/30" />
      </div>
      <div className="absolute bottom-1/4 right-1/2 animate-bounce" style={{ animationDelay: '0.5s', animationDuration: '4.5s' }}>
        <Users className="h-6 w-6 text-white/25" />
      </div>
      <div className="absolute top-3/4 left-1/2 animate-bounce" style={{ animationDelay: '2.5s', animationDuration: '3.8s' }}>
        <Clock className="h-5 w-5 text-white/20" />
      </div>
      
      {/* Pulsing geometric shapes */}
      <div className="absolute top-1/5 right-1/5 w-16 h-16 bg-white/10 rounded-full animate-pulse" style={{ animationDelay: '1s' }}></div>
      <div className="absolute bottom-1/5 left-1/5 w-12 h-12 bg-white/15 rounded-lg rotate-45 animate-pulse" style={{ animationDelay: '2s' }}></div>
      <div className="absolute top-2/3 right-2/3 w-8 h-8 bg-white/20 rounded-full animate-pulse" style={{ animationDelay: '0.5s' }}></div>
    </div>
  );
};

export default function CustomerLogin() {
  const [location] = useLocation();
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedWholesaler, setSelectedWholesaler] = useState<Wholesaler | null>(null);
  const [wholesalers, setWholesalers] = useState<Wholesaler[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [lastFourDigits, setLastFourDigits] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingWholesalers, setIsLoadingWholesalers] = useState(false);
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  
  // Extract wholesaler ID from URL if accessing directly via /customer/:id
  const wholesalerIdFromUrl = location.includes('/customer/') ? location.split('/customer/')[1]?.split('?')[0] : null;

  // Brand green theme colors
  const getThemeColors = () => {
    return "bg-green-500";
  };

  // Load wholesalers and handle direct URL access
  useEffect(() => {
    const loadWholesalers = async () => {
      setIsLoadingWholesalers(true);
      try {
        const response = await fetch('/api/wholesalers/all');
        if (response.ok) {
          const data = await response.json();
          // Remove duplicates by business name and ID
          const uniqueWholesalers = data.filter((wholesaler: Wholesaler, index: number, array: Wholesaler[]) => 
            array.findIndex(w => w.id === wholesaler.id || w.businessName === wholesaler.businessName) === index
          );
          setWholesalers(uniqueWholesalers);
          
          // If accessing via direct URL, automatically select wholesaler and go to step 2
          if (wholesalerIdFromUrl) {
            const targetWholesaler = data.find((w: Wholesaler) => w.id === wholesalerIdFromUrl);
            if (targetWholesaler) {
              setSelectedWholesaler(targetWholesaler);
              setStep(2); // Skip to the beautiful welcome screen
            }
          }
        }
      } catch (error) {
        console.error("Failed to load wholesalers:", error);
      } finally {
        setIsLoadingWholesalers(false);
      }
    };
    
    loadWholesalers();
  }, [wholesalerIdFromUrl]);

  const filteredWholesalers = wholesalers.filter(wholesaler =>
    wholesaler.businessName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleWholesalerSelect = (wholesaler: Wholesaler) => {
    setSelectedWholesaler(wholesaler);
    setOpen(false);
    setStep(2); // Go to step 2 (digits entry page) after wholesaler selection
  };

  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!lastFourDigits.trim() || lastFourDigits.length !== 4) {
      toast({
        title: "Invalid Phone Number",
        description: "Please enter the last 4 digits of your phone number",
        variant: "destructive"
      });
      return;
    }

    if (!selectedWholesaler) {
      toast({
        title: "No Wholesaler Selected",
        description: "Please select a wholesaler first",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    
    try {
      // Redirect to customer portal - authentication component will handle the SMS flow
      window.location.href = `/store/${selectedWholesaler.id}?auth=${lastFourDigits}`;
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

  const handleBack = () => {
    setStep(1);
    setLastFourDigits("");
  };

  return (
    <div className="min-h-screen flex">
      {/* Left side - Authentication form */}
      <div className="w-full lg:w-1/2 bg-white flex flex-col justify-center px-4 sm:px-6 lg:px-8">
        <div className="w-full max-w-md mx-auto">
          {/* Back to Home Link */}
          <div className="mb-8">
            <Link href="/" className="inline-flex items-center text-gray-600 hover:text-gray-900 transition-colors group">
              <ArrowLeft className="h-4 w-4 mr-2 group-hover:-translate-x-1 transition-transform" />
              Back to Home
            </Link>
          </div>

          {/* Logo and welcome */}
          <div className="text-center mb-8">
            <div className="mx-auto h-20 w-20 rounded-2xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center mb-6 shadow-lg">
              <Store className="h-10 w-10 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              {step === 1 ? "Find Your Store" : "Welcome Back"}
            </h1>
            <p className="text-gray-600 text-lg">
              {step === 1 ? "Search for your wholesaler to access their products" : `Accessing ${selectedWholesaler?.businessName}`}
            </p>
          </div>

          {/* Form Card */}
          <Card className="w-full shadow-xl border-0 bg-white/80 backdrop-blur-sm">
            <CardHeader className="text-center pb-2">
              <div className="flex items-center justify-center space-x-2 mb-4">
                <div className={`h-3 w-3 rounded-full transition-all duration-300 ${step >= 1 ? 'bg-primary' : 'bg-gray-200'}`}></div>
                <div className={`h-0.5 w-8 transition-all duration-300 ${step >= 2 ? 'bg-primary' : 'bg-gray-200'}`}></div>
                <div className={`h-3 w-3 rounded-full transition-all duration-300 ${step >= 2 ? 'bg-primary' : 'bg-gray-200'}`}></div>
              </div>
              <p className="text-sm text-gray-500">Step {step} of 2</p>
            </CardHeader>
            
            <CardContent className="space-y-6">
              {step === 1 ? (
                <div className="space-y-6">
                  <div className="space-y-3">
                    <Label htmlFor="wholesaler-search" className="text-base font-medium">Find Your Wholesaler</Label>
                    <Popover open={open} onOpenChange={setOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={open}
                          className="w-full justify-between h-12 text-left font-normal border-2 hover:border-primary/50 focus:border-primary"
                          disabled={isLoadingWholesalers}
                        >
                          {selectedWholesaler ? (
                            <div className="flex items-center">
                              <div className="h-6 w-6 rounded bg-primary/10 flex items-center justify-center mr-3">
                                <Store className="h-3 w-3 text-primary" />
                              </div>
                              {selectedWholesaler.businessName}
                            </div>
                          ) : (
                            <span className="text-gray-500">
                              {isLoadingWholesalers ? "Loading wholesalers..." : "Select your wholesaler..."}
                            </span>
                          )}
                          <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-full p-0" align="start">
                        <Command>
                          <CommandInput
                            placeholder="Search by business name..."
                            value={searchTerm}
                            onValueChange={setSearchTerm}
                            className="border-0"
                          />
                          <CommandList>
                            <CommandEmpty>No wholesaler found with that name.</CommandEmpty>
                            <CommandGroup>
                              {filteredWholesalers.map((wholesaler) => (
                                <CommandItem
                                  key={wholesaler.id}
                                  onSelect={() => handleWholesalerSelect(wholesaler)}
                                  className="flex items-center py-3"
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      selectedWholesaler?.id === wholesaler.id ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  <div className="flex items-center">
                                    <div className="h-6 w-6 rounded bg-primary/10 flex items-center justify-center mr-3">
                                      <Store className="h-3 w-3 text-primary" />
                                    </div>
                                    {wholesaler.businessName}
                                  </div>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                  
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-sm text-blue-700 text-center">
                      💡 Can't find your wholesaler? Contact them directly for assistance accessing their store.
                    </p>
                  </div>
                </div>
              ) : (
                <form onSubmit={handlePhoneSubmit} className="space-y-6">
                  <div className="space-y-3">
                    <Label htmlFor="phone" className="text-base font-medium">Phone Verification</Label>
                    <div className="text-center mb-4">
                      <p className="text-sm text-gray-600">Enter the last 4 digits of your phone number</p>
                    </div>
                    <Input
                      id="phone"
                      type="text"
                      placeholder="••••"
                      value={lastFourDigits}
                      onChange={(e) => {
                        const value = e.target.value.replace(/\D/g, '').slice(0, 4);
                        setLastFourDigits(value);
                      }}
                      className="text-center text-2xl tracking-[0.5em] h-16 border-2 font-mono focus:border-primary"
                      disabled={isLoading}
                      maxLength={4}
                      autoComplete="off"
                    />
                  </div>
                  
                  <div className="flex space-x-3">
                    <Button 
                      type="button"
                      variant="outline"
                      onClick={handleBack}
                      disabled={isLoading}
                      className="flex-1 h-12"
                    >
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Back
                    </Button>
                    <Button 
                      type="submit" 
                      className="flex-1 h-12 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary" 
                      disabled={isLoading || lastFourDigits.length !== 4}
                    >
                      {isLoading ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                          Verifying...
                        </>
                      ) : (
                        "Access Store"
                      )}
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Right side - Animated background with retail owner photo */}
      <div className={`hidden lg:flex lg:w-1/2 ${getThemeColors()} relative overflow-hidden`}>
        {/* Background retail owner image overlay */}
        <div 
          className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-30"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400' viewBox='0 0 400 400'%3E%3Cdefs%3E%3Cpattern id='retail' x='0' y='0' width='40' height='40' patternUnits='userSpaceOnUse'%3E%3Ccircle cx='20' cy='20' r='2' fill='%23ffffff' fill-opacity='0.1'/%3E%3C/pattern%3E%3C/defs%3E%3Crect width='400' height='400' fill='url(%23retail)'/%3E%3C/svg%3E")`
          }}
        ></div>

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-black/20 via-transparent to-black/40"></div>
        
        {/* Floating icons */}
        <FloatingIcons />
        
        {/* Content */}
        <div className="relative z-10 flex flex-col justify-center px-12 text-white">
          <div className="space-y-8">
            {/* Welcome message */}
            <div className="space-y-4">
              <h2 className="text-4xl font-bold leading-tight">
                {getWelcomeMessage()}
              </h2>
              <p className="text-xl opacity-90">
                Access exclusive wholesale products and special pricing from your trusted suppliers.
              </p>
            </div>

            {/* Feature highlights */}
            <div className="space-y-4">
              <div className="flex items-center space-x-4 bg-white/10 backdrop-blur-sm rounded-lg p-4">
                <div className="h-10 w-10 rounded-lg bg-white/20 flex items-center justify-center">
                  <Package className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold">Wholesale Pricing</h3>
                  <p className="text-sm opacity-80">Get better prices on bulk orders</p>
                </div>
              </div>
              
              <div className="flex items-center space-x-4 bg-white/10 backdrop-blur-sm rounded-lg p-4">
                <div className="h-10 w-10 rounded-lg bg-white/20 flex items-center justify-center">
                  <TrendingUp className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold">Growing Selection</h3>
                  <p className="text-sm opacity-80">New products added regularly</p>
                </div>
              </div>
              
              <div className="flex items-center space-x-4 bg-white/10 backdrop-blur-sm rounded-lg p-4">
                <div className="h-10 w-10 rounded-lg bg-white/20 flex items-center justify-center">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold">Trusted Network</h3>
                  <p className="text-sm opacity-80">Connect with verified suppliers</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}