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

  // Dynamic welcome message generator based on time and wholesaler profile
  const generateWelcomeMessage = (wholesaler: Wholesaler | null) => {
    const now = new Date();
    const hour = now.getHours();
    const dayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.
    const month = now.getMonth(); // 0 = January, 11 = December
    const businessName = wholesaler?.businessName || 'Our Store';
    const businessType = getBusinessType(businessName);
    
    // Check for special occasions/seasons
    const specialOccasion = getSpecialOccasion(now);
    
    // Time-based greetings with business hours consideration
    let timeGreeting = '';
    let timeEmoji = '';
    let businessHoursMessage = '';
    
    if (hour >= 5 && hour < 9) {
      timeGreeting = 'Good morning';
      timeEmoji = '🌅';
      businessHoursMessage = dayOfWeek >= 1 && dayOfWeek <= 5 ? 'Early bird! We love your dedication.' : 'Starting your weekend right!';
    } else if (hour >= 9 && hour < 12) {
      timeGreeting = 'Good morning';
      timeEmoji = '☕';
      businessHoursMessage = 'Perfect timing for business!';
    } else if (hour >= 12 && hour < 14) {
      timeGreeting = 'Good afternoon';
      timeEmoji = '🌞';
      businessHoursMessage = 'Lunch break shopping? Great choice!';
    } else if (hour >= 14 && hour < 17) {
      timeGreeting = 'Good afternoon';
      timeEmoji = '☀️';
      businessHoursMessage = 'Prime time for business orders!';
    } else if (hour >= 17 && hour < 20) {
      timeGreeting = 'Good evening';
      timeEmoji = '🌆';
      businessHoursMessage = 'End of day restocking?';
    } else if (hour >= 20 && hour < 23) {
      timeGreeting = 'Good evening';
      timeEmoji = '🌙';
      businessHoursMessage = 'Planning ahead for tomorrow!';
    } else {
      timeGreeting = 'Working late';
      timeEmoji = '🌙';
      businessHoursMessage = 'Night owl? We respect the hustle!';
    }

    // Business type specific messages with seasonal variations
    const businessMessages = {
      food: [
        'Fresh products await you', 
        'Quality ingredients ready', 
        'Your favorite foods are here',
        month >= 2 && month <= 4 ? 'Spring fresh arrivals!' : '',
        month >= 5 && month <= 7 ? 'Summer specials available!' : '',
        month >= 8 && month <= 10 ? 'Autumn harvest ready!' : '',
        month === 11 || month === 0 || month === 1 ? 'Winter comfort foods!' : ''
      ].filter(Boolean),
      tech: [
        'Latest tech solutions available', 
        'Innovation at your fingertips', 
        'Technology made simple',
        'Cutting-edge products in stock',
        'Digital transformation starts here'
      ],
      wholesale: [
        'Bulk orders made easy', 
        'Wholesale prices just for you', 
        'Business solutions ready',
        'Volume discounts available',
        'Your business growth partner'
      ],
      retail: [
        'Premium products available', 
        'Quality items in stock', 
        'Your trusted supplier',
        'Retail excellence awaits',
        'Customer satisfaction guaranteed'
      ],
      default: [
        'Quality products await', 
        'Great deals inside', 
        'Your business partner',
        'Professional service guaranteed'
      ]
    };

    const messages = businessMessages[businessType] || businessMessages.default;
    const randomMessage = messages[Math.floor(Math.random() * messages.length)];

    // Special occasion override
    if (specialOccasion.isSpecial) {
      return {
        greeting: `${specialOccasion.greeting}! ${specialOccasion.emoji}`,
        title: `${specialOccasion.prefix} ${businessName}`,
        subtitle: specialOccasion.message,
        timeBasedEmoji: specialOccasion.emoji,
        businessHours: businessHoursMessage
      };
    }

    return {
      greeting: `${timeGreeting}! ${timeEmoji}`,
      title: `Welcome to ${businessName}`,
      subtitle: randomMessage,
      timeBasedEmoji: timeEmoji,
      businessHours: businessHoursMessage
    };
  };

  // Special occasions and seasonal greetings
  const getSpecialOccasion = (date: Date) => {
    const month = date.getMonth();
    const day = date.getDate();
    const dayOfWeek = date.getDay();
    
    // Christmas season
    if (month === 11 && day >= 20) {
      return {
        isSpecial: true,
        greeting: 'Merry Christmas',
        emoji: '🎄',
        prefix: 'Ho ho ho! Welcome to',
        message: 'Special holiday deals await you!'
      };
    }
    
    // New Year
    if (month === 0 && day <= 7) {
      return {
        isSpecial: true,
        greeting: 'Happy New Year',
        emoji: '🎊',
        prefix: 'New year, new opportunities at',
        message: 'Fresh start, fresh products!'
      };
    }
    
    // Friday feeling
    if (dayOfWeek === 5) {
      return {
        isSpecial: true,
        greeting: 'Happy Friday',
        emoji: '🎉',
        prefix: 'TGIF! Welcome to',
        message: 'Weekend prep time!'
      };
    }
    
    // Monday motivation
    if (dayOfWeek === 1) {
      return {
        isSpecial: true,
        greeting: 'Motivational Monday',
        emoji: '💪',
        prefix: 'Start your week strong at',
        message: 'Monday motivation starts here!'
      };
    }
    
    return { isSpecial: false };
  };

  // Helper to detect business type from name
  const getBusinessType = (businessName: string): string => {
    const name = businessName.toLowerCase();
    
    if (name.includes('food') || name.includes('restaurant') || name.includes('kitchen') || 
        name.includes('spice') || name.includes('organic') || name.includes('fresh')) {
      return 'food';
    } else if (name.includes('tech') || name.includes('electronics') || name.includes('digital') || 
               name.includes('computer') || name.includes('software')) {
      return 'tech';
    } else if (name.includes('wholesale') || name.includes('bulk') || name.includes('supply')) {
      return 'wholesale';
    } else if (name.includes('retail') || name.includes('store') || name.includes('shop')) {
      return 'retail';
    }
    
    return 'default';
  };

  const welcomeMessage = generateWelcomeMessage(wholesaler);

  // Dynamic theme based on time and special occasions
  const getThemeConfig = () => {
    const hour = new Date().getHours();
    const specialOccasion = getSpecialOccasion(new Date());
    
    if (specialOccasion.isSpecial) {
      if (specialOccasion.greeting.includes('Christmas')) {
        return {
          background: 'bg-gradient-to-br from-red-50 via-green-50 to-white',
          floatingIcons: ['🎄', '🎁', '⭐', '❄️', '🔔'],
          shapes: ['bg-red-300', 'bg-green-300', 'bg-gold-300', 'bg-white']
        };
      } else if (specialOccasion.greeting.includes('New Year')) {
        return {
          background: 'bg-gradient-to-br from-purple-50 via-gold-50 to-white',
          floatingIcons: ['🎊', '🎉', '✨', '🥳', '🎆'],
          shapes: ['bg-purple-300', 'bg-gold-300', 'bg-pink-300', 'bg-blue-300']
        };
      } else if (specialOccasion.greeting.includes('Friday')) {
        return {
          background: 'bg-gradient-to-br from-orange-50 via-yellow-50 to-white',
          floatingIcons: ['🎉', '🍕', '🎵', '🌟', '😄'],
          shapes: ['bg-orange-300', 'bg-yellow-300', 'bg-pink-300', 'bg-purple-300']
        };
      }
    }
    
    // Time-based themes
    if (hour >= 5 && hour < 12) {
      return {
        background: 'bg-gradient-to-br from-yellow-50 via-orange-50 to-white',
        floatingIcons: ['☕', '🌅', '🥐', '📰', '⚡'],
        shapes: ['bg-yellow-300', 'bg-orange-300', 'bg-pink-300', 'bg-red-300']
      };
    } else if (hour >= 12 && hour < 17) {
      return {
        background: 'bg-gradient-to-br from-blue-50 via-cyan-50 to-white',
        floatingIcons: ['☀️', '🌞', '💼', '📈', '💪'],
        shapes: ['bg-blue-300', 'bg-cyan-300', 'bg-green-300', 'bg-teal-300']
      };
    } else if (hour >= 17 && hour < 21) {
      return {
        background: 'bg-gradient-to-br from-purple-50 via-pink-50 to-white',
        floatingIcons: ['🌆', '🍽️', '🏠', '📱', '✨'],
        shapes: ['bg-purple-300', 'bg-pink-300', 'bg-indigo-300', 'bg-blue-300']
      };
    } else {
      return {
        background: 'bg-gradient-to-br from-indigo-50 via-purple-50 to-gray-100',
        floatingIcons: ['🌙', '⭐', '💤', '🦉', '🌃'],
        shapes: ['bg-indigo-300', 'bg-purple-300', 'bg-gray-300', 'bg-blue-300']
      };
    }
  };

  const themeConfig = getThemeConfig();

  return (
    <div className={`min-h-screen ${themeConfig.background} flex items-center justify-center p-4 relative overflow-hidden transition-all duration-1000`}>
      {/* Dynamic Background Elements */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Dynamic Floating Shapes */}
        {themeConfig.shapes.map((shapeColor, index) => (
          <div 
            key={index}
            className={`absolute w-8 h-8 md:w-12 md:h-12 ${shapeColor} rounded-full opacity-60 animate-bounce`}
            style={{ 
              animationDelay: `${index * 0.5}s`,
              top: `${20 + index * 15}%`,
              left: index % 2 === 0 ? `${10 + index * 5}%` : 'auto',
              right: index % 2 === 1 ? `${10 + index * 5}%` : 'auto'
            }}
          />
        ))}
        
        {/* Dynamic Cartoon Icons */}
        {themeConfig.floatingIcons.map((icon, index) => (
          <div 
            key={icon}
            className="absolute text-2xl md:text-4xl animate-pulse"
            style={{ 
              animationDelay: `${index * 0.7}s`,
              top: `${15 + index * 20}%`,
              left: index % 2 === 0 ? `${15 + index * 10}%` : 'auto',
              right: index % 2 === 1 ? `${15 + index * 10}%` : 'auto'
            }}
          >
            {icon}
          </div>
        ))}
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
          
          <div className="mb-3">
            <p className="text-lg font-semibold text-gray-700">
              {welcomeMessage.greeting}
            </p>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            {welcomeMessage.title}
          </h1>
          <p className="text-gray-600 text-lg mb-2">
            {welcomeMessage.subtitle}
          </p>
          {welcomeMessage.businessHours && (
            <p className="text-gray-500 text-sm mb-2 italic">
              {welcomeMessage.businessHours}
            </p>
          )}
          <p className="text-gray-500 text-sm">
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

              <div className="text-center pt-4 space-y-2">
                {onSkipAuth && (
                  <Button 
                    variant="ghost" 
                    onClick={onSkipAuth}
                    className="text-sm text-gray-500 hover:text-gray-700 rounded-xl block w-full"
                  >
                    Browse as guest 👀
                  </Button>
                )}

              </div>
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