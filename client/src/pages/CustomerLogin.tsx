import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { ArrowLeft, Store, Search, Check } from "lucide-react";
import { Command, CommandInput, CommandItem, CommandList, CommandEmpty, CommandGroup } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface Wholesaler {
  id: string;
  businessName: string;
  email: string;
}

export default function CustomerLogin() {
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedWholesaler, setSelectedWholesaler] = useState<Wholesaler | null>(null);
  const [wholesalers, setWholesalers] = useState<Wholesaler[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [lastFourDigits, setLastFourDigits] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingWholesalers, setIsLoadingWholesalers] = useState(false);
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  // Load all wholesalers when component mounts
  useEffect(() => {
    const loadWholesalers = async () => {
      setIsLoadingWholesalers(true);
      try {
        const response = await fetch('/api/wholesalers/all');
        if (response.ok) {
          const data = await response.json();
          setWholesalers(data);
        }
      } catch (error) {
        console.error("Failed to load wholesalers:", error);
      } finally {
        setIsLoadingWholesalers(false);
      }
    };
    
    loadWholesalers();
  }, []);

  const filteredWholesalers = wholesalers.filter(wholesaler =>
    wholesaler.businessName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleWholesalerSelect = (wholesaler: Wholesaler) => {
    setSelectedWholesaler(wholesaler);
    setOpen(false);
    setStep(2);
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
      // Redirect to customer portal with phone authentication
      window.location.href = `/customer/${selectedWholesaler.id}?phone=${lastFourDigits}`;
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
              {step === 1 ? "Find Your Store" : "Authenticate"}
            </CardTitle>
            <p className="text-gray-600">
              {step === 1 ? "Search for your wholesaler to access their products" : `Enter your phone number to access ${selectedWholesaler?.businessName}`}
            </p>
          </CardHeader>
          <CardContent className="space-y-6">
            {step === 1 ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="wholesaler-search">Search Wholesaler</Label>
                  <Popover open={open} onOpenChange={setOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={open}
                        className="w-full justify-between"
                        disabled={isLoadingWholesalers}
                      >
                        {selectedWholesaler
                          ? selectedWholesaler.businessName
                          : isLoadingWholesalers
                          ? "Loading wholesalers..."
                          : "Select a wholesaler..."
                        }
                        <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-full p-0" align="start">
                      <Command>
                        <CommandInput
                          placeholder="Search wholesaler..."
                          value={searchTerm}
                          onValueChange={setSearchTerm}
                        />
                        <CommandList>
                          <CommandEmpty>No wholesaler found.</CommandEmpty>
                          <CommandGroup>
                            {filteredWholesalers.map((wholesaler) => (
                              <CommandItem
                                key={wholesaler.id}
                                onSelect={() => handleWholesalerSelect(wholesaler)}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    selectedWholesaler?.id === wholesaler.id ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                {wholesaler.businessName}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                
                <div className="text-center text-sm text-gray-500">
                  <p>
                    Can't find your wholesaler? Contact them for assistance.
                  </p>
                </div>
              </div>
            ) : (
              <form onSubmit={handlePhoneSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="phone">Last 4 Digits of Phone Number</Label>
                  <Input
                    id="phone"
                    type="text"
                    placeholder="e.g., 1234"
                    value={lastFourDigits}
                    onChange={(e) => {
                      const value = e.target.value.replace(/\D/g, '').slice(0, 4);
                      setLastFourDigits(value);
                    }}
                    className="text-center text-lg tracking-wider"
                    disabled={isLoading}
                    maxLength={4}
                  />
                </div>
                
                <div className="flex space-x-2">
                  <Button 
                    type="button"
                    variant="outline"
                    onClick={handleBack}
                    disabled={isLoading}
                    className="flex-1"
                  >
                    Back
                  </Button>
                  <Button 
                    type="submit" 
                    className="flex-1" 
                    disabled={isLoading || lastFourDigits.length !== 4}
                  >
                    {isLoading ? "Authenticating..." : "Access Store"}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}