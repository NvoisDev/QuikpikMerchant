import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Shield, ShoppingCart, Package, Star, MessageSquare, Mail } from "lucide-react";
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
  const [smsCode, setSmsCode] = useState("");
  const [authStep, setAuthStep] = useState<'phone' | 'verification'>('phone');
  const [customerData, setCustomerData] = useState<any>(null);
  const [verificationMethod, setVerificationMethod] = useState<'sms' | 'email' | 'both'>('sms');
  const [emailCode, setEmailCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSMSLoading, setIsSMSLoading] = useState(false);
  const [error, setError] = useState("");
  const [smsExpiry, setSmsExpiry] = useState<number | null>(null);
  const [countdown, setCountdown] = useState<number>(0);
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

  // Countdown timer for SMS expiry
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleLogin = async () => {
    console.log('🚀 Starting streamlined authentication...', { wholesalerId, lastFourDigits });
    
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
      console.log('📡 Verifying customer and sending SMS...');
      
      // First verify the customer exists with these last 4 digits
      const verifyResponse = await fetch('/api/customer-auth/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          wholesalerId,
          lastFourDigits: lastFourDigits.trim()
        }),
      });

      const verifyData = await verifyResponse.json();

      if (verifyResponse.ok) {
        console.log('✅ Customer found, sending SMS immediately...');
        setCustomerData(verifyData.customer);
        
        // Immediately send SMS code without going to verification step
        const smsResponse = await fetch('/api/customer-auth/request-sms', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            wholesalerId,
            lastFourDigits: lastFourDigits.trim()
          }),
        });

        const smsData = await smsResponse.json();

        if (smsResponse.ok) {
          console.log('📱 SMS sent successfully, moving to SMS verification...');
          // Determine verification method
          if (verifyData.customer.email && verifyData.customer.email.includes('@')) {
            setVerificationMethod('both');
          } else {
            setVerificationMethod('sms');
          }
          
          setAuthStep('verification');
          setCountdown(300); // 5 minutes
          setSmsExpiry(Date.now() + 300000);
          
          toast({
            title: "SMS Sent!",
            description: `A verification code has been sent to your phone, ${verifyData.customer.name}.`,
          });
        } else {
          console.error('❌ SMS sending failed:', smsData);
          setError(smsData.error || "Failed to send SMS code. Please try again.");
        }
      } else {
        console.error('❌ Customer verification failed:', verifyData);
        setError(verifyData.error || "Customer not found. Please check the last 4 digits of your phone number.");
      }
    } catch (error) {
      console.error('⚠️ Authentication error:', error);
      setError("Connection error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRequestSMS = async () => {
    if (!lastFourDigits) {
      setError("Please enter the last 4 digits of your phone number first");
      return;
    }

    if (lastFourDigits.length !== 4) {
      setError("Please enter exactly 4 digits");
      return;
    }

    setIsSMSLoading(true);
    setError("");

    try {
      const response = await fetch('/api/customer-auth/request-sms', {
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
          title: "SMS Sent!",
          description: "A verification code has been sent to your phone.",
        });
        setCountdown(300); // 5 minutes
        setSmsExpiry(Date.now() + 300000); // 5 minutes
      } else {
        setError(data.error || "Failed to send SMS code. Please try again.");
        // If SMS fails, go back to phone step
        setAuthStep('phone');
        setCustomerData(null);
      }
    } catch (error) {
      console.error('SMS request error:', error);
      setError("Connection error. Please try again.");
      setAuthStep('phone');
    } finally {
      setIsSMSLoading(false);
    }
  };

  const handleSMSVerification = async () => {
    if (!smsCode) {
      setError("Please enter the verification code");
      return;
    }

    if (smsCode.length !== 6) {
      setError("Please enter the complete 6-digit code");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const response = await fetch('/api/customer-auth/verify-sms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          wholesalerId,
          lastFourDigits: lastFourDigits.trim(),
          smsCode: smsCode.trim()
        }),
      });

      const data = await response.json();

      if (response.ok) {
        toast({
          title: "Verification Successful!",
          description: `Welcome ${data.customer.name}, you're now securely logged in.`,
        });
        onAuthSuccess(data.customer);
      } else {
        setError(data.error || "Invalid verification code. Please try again.");
      }
    } catch (error) {
      console.error('SMS verification error:', error);
      setError("Connection error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // Email verification functions
  const handleRequestEmail = async () => {
    if (!customerData || !customerData.email) {
      setError("Email address not available for verification");
      return;
    }

    setIsSMSLoading(true);
    setError("");

    try {
      const response = await fetch('/api/customer-email-verification/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customerId: customerData.id,
          email: customerData.email
        }),
      });

      const data = await response.json();

      if (response.ok) {
        toast({
          title: "Email Sent!",
          description: `A verification code has been sent to ${customerData.email}`,
        });
        setCountdown(600); // 10 minutes for email
        setSmsExpiry(Date.now() + 600000); // 10 minutes
      } else {
        setError(data.message || "Failed to send email verification. Please try SMS instead.");
      }
    } catch (error) {
      console.error('Email verification request error:', error);
      setError("Connection error. Please try again.");
    } finally {
      setIsSMSLoading(false);
    }
  };

  const handleEmailVerification = async () => {
    if (!emailCode) {
      setError("Please enter the email verification code");
      return;
    }

    if (emailCode.length !== 6) {
      setError("Please enter the complete 6-digit code");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const response = await fetch('/api/customer-email-verification/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customerId: customerData.id,
          email: customerData.email,
          code: emailCode.trim()
        }),
      });

      const data = await response.json();

      if (response.ok) {
        toast({
          title: "Email Verification Successful!",
          description: `Welcome ${customerData.name}, you're now securely logged in.`,
        });
        onAuthSuccess(customerData);
      } else {
        setError(data.message || "Invalid email verification code. Please try again.");
      }
    } catch (error) {
      console.error('Email verification error:', error);
      setError("Connection error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 6); // Only digits, max 6
    setEmailCode(value);
  };

  const handleBackToPhone = () => {
    setAuthStep('phone');
    setSmsCode("");
    setEmailCode("");
    setCountdown(0);
    setSmsExpiry(null);
    setError("");
    setCustomerData(null);
  };

  const handleLastFourChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 4); // Only digits, max 4
    setLastFourDigits(value);
  };

  const handleSMSCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 6); // Only digits, max 6
    setSmsCode(value);
  };

  const formatCountdown = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
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
          shapes: ['bg-purple-300', 'bg-gold-300', 'bg-green-300', 'bg-blue-300']
        };
      } else if (specialOccasion.greeting.includes('Friday')) {
        return {
          background: 'bg-gradient-to-br from-orange-50 via-yellow-50 to-white',
          floatingIcons: ['🎉', '🍕', '🎵', '🌟', '😄'],
          shapes: ['bg-orange-300', 'bg-yellow-300', 'bg-green-300', 'bg-purple-300']
        };
      }
    }
    
    // Time-based themes
    if (hour >= 5 && hour < 12) {
      return {
        background: 'bg-gradient-to-br from-yellow-50 via-orange-50 to-white',
        floatingIcons: ['☕', '🌅', '🥐', '📰', '⚡'],
        shapes: ['bg-yellow-300', 'bg-orange-300', 'bg-green-300', 'bg-red-300']
      };
    } else if (hour >= 12 && hour < 17) {
      return {
        background: 'bg-gradient-to-br from-blue-50 via-cyan-50 to-white',
        floatingIcons: ['☀️', '🌞', '💼', '📈', '💪'],
        shapes: ['bg-blue-300', 'bg-cyan-300', 'bg-green-300', 'bg-teal-300']
      };
    } else if (hour >= 17 && hour < 21) {
      return {
        background: 'bg-gradient-to-br from-purple-50 via-green-50 to-white',
        floatingIcons: ['🌆', '🍽️', '🏠', '📱', '✨'],
        shapes: ['bg-purple-300', 'bg-green-300', 'bg-indigo-300', 'bg-blue-300']
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
    <div className="min-h-screen flex">
      {/* Left Side - White Background with Authentication Form */}
      <div className="w-full lg:w-1/2 bg-white flex items-center justify-center p-4 lg:p-8">
        <div className="w-full max-w-md mx-auto">
          {/* Back Button */}
          <div className="mb-6">
            <Button
              onClick={() => window.history.back()}
              variant="ghost"
              className="text-gray-600 hover:text-gray-800 hover:bg-gray-100 p-2 rounded-full transition-all duration-200 flex items-center space-x-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span className="text-sm font-medium">Back</span>
            </Button>
          </div>

          {/* Wholesaler Logo/Initials Header */}
          <div className="text-center mb-4">
            <div className="mx-auto mb-6 relative">
              {wholesaler?.logoUrl ? (
                <img 
                  src={wholesaler.logoUrl} 
                  alt={wholesaler.businessName}
                  className="w-24 h-24 rounded-full object-cover mx-auto border-4 border-gray-200 shadow-lg"
                />
              ) : (
                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-green-500 to-blue-500 flex items-center justify-center mx-auto border-4 border-gray-200 shadow-lg">
                  <span className="text-2xl font-bold text-white">
                    {wholesaler ? getInitials(wholesaler.businessName) : 'Q'}
                  </span>
                </div>
              )}

            </div>
            

          </div>

          {/* Unified Authentication Card */}
          <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-2xl rounded-3xl overflow-hidden">
            <CardContent className="p-8">
              <div className="space-y-6">
                {/* Security Notice Header */}
                <div className="text-center mb-6">
                  <h3 className="text-xl font-semibold text-gray-800 mb-4">
                    🛡️ Secure access for registered customers only
                  </h3>
                  <div className="bg-gradient-to-r from-blue-50 to-green-50 rounded-2xl p-6 mb-3 border border-blue-100">
                    <p className="text-sm text-blue-900 font-semibold mb-3">
                      Secure Two-Step Authentication:
                    </p>
                    <p className="text-sm text-blue-800 leading-relaxed">
                      1. Enter your last 4 digits<br/>
                      2. Verify with SMS code (mandatory for security)
                    </p>
                  </div>
                  <p className="text-xs text-gray-600 font-medium">
                    SMS verification is required for all customers
                  </p>
                </div>

                {/* Step 1: Phone Number Verification */}
                {authStep === 'phone' && (
                  <>
                    <div className="space-y-4">
                      <Label htmlFor="lastFour" className="text-sm font-semibold text-gray-800 text-center block">
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
                          className="text-center text-3xl tracking-[1rem] font-mono h-16 border-2 border-gray-300 rounded-2xl bg-gradient-to-br from-gray-50 to-white hover:from-white hover:to-gray-50 focus:bg-white focus:border-green-500 focus:ring-2 focus:ring-green-200 transition-all duration-300 shadow-inner"
                        />
                        <div className="absolute -right-3 top-1/2 transform -translate-y-1/2 text-2xl animate-pulse">🔐</div>
                      </div>
                    </div>

                    {error && (
                      <Alert variant="destructive" className="rounded-xl border-0 bg-red-50">
                        <AlertDescription className="text-center">{error}</AlertDescription>
                      </Alert>
                    )}

                    <div className="space-y-3">
                      <Button 
                        onClick={handleLogin} 
                        className="w-full bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white h-16 rounded-2xl font-semibold text-lg shadow-xl hover:shadow-2xl transform transition-all duration-300 hover:scale-105 hover:-translate-y-1 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:hover:scale-100"
                        disabled={isLoading || lastFourDigits.length !== 4}
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="mr-3 h-5 w-5 animate-spin" />
                            Sending verification code...
                          </>
                        ) : (
                          <>
                            <span>Access Store</span>
                            <span className="ml-2 text-xl">🔓</span>
                          </>
                        )}
                      </Button>

                      <div className="text-center">
                        <p className="text-xs text-gray-500 flex items-center justify-center">
                          <Shield className="mr-1 h-3 w-3" />
                          SMS verification is required for security
                        </p>
                      </div>
                    </div>
                  </>
                )}

                {/* Step 2: Verification (SMS or Email) */}
                {authStep === 'verification' && customerData && (
                  <>
                    <div className="text-center mb-6">
                      <h4 className="text-lg font-semibold text-gray-800 mb-2">
                        🔐 Verification Required
                      </h4>
                      <p className="text-sm text-gray-600 mb-4">
                        Hello {customerData.name}! Please verify your identity:
                      </p>
                      <div className="flex items-center justify-center space-x-2 my-4">
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                      </div>
                      <p className="text-xs text-gray-600 font-medium">
                        Step 2 of 2: Identity Verification
                      </p>
                      {countdown > 0 && (
                        <p className="text-xs text-blue-600 mt-2">
                          Code expires in {formatCountdown(countdown)}
                        </p>
                      )}
                    </div>

                    {/* Verification Method Tabs */}
                    {verificationMethod === 'both' ? (
                      <div className="mb-6">
                        <div className="flex bg-gray-100 rounded-xl p-1">
                          <button
                            onClick={() => setVerificationMethod('sms')}
                            className="flex-1 flex items-center justify-center py-3 px-4 rounded-lg font-medium text-sm bg-blue-500 text-white shadow-md"
                          >
                            <MessageSquare className="mr-2 h-4 w-4" />
                            SMS
                          </button>
                          <button
                            onClick={() => setVerificationMethod('email')}
                            className="flex-1 flex items-center justify-center py-3 px-4 rounded-lg font-medium text-sm text-gray-600 hover:bg-gray-200"
                          >
                            <Mail className="mr-2 h-4 w-4" />
                            Email
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {/* SMS Verification */}
                    {(verificationMethod === 'sms' || verificationMethod === 'both') && (
                      <div className="space-y-4">
                        <div className="text-center">
                          <p className="text-sm text-gray-600 mb-3">
                            Enter the 6-digit code sent to your phone
                          </p>
                        </div>
                        <div className="relative">
                          <Input
                            type="text"
                            placeholder="123456"
                            value={smsCode}
                            onChange={handleSMSCodeChange}
                            maxLength={6}
                            className="text-center text-2xl tracking-[0.5rem] font-mono h-16 border-2 border-gray-300 rounded-2xl bg-gradient-to-br from-gray-50 to-white hover:from-white hover:to-gray-50 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all duration-300 shadow-inner"
                          />
                          <div className="absolute -right-3 top-1/2 transform -translate-y-1/2 text-2xl animate-pulse">📱</div>
                        </div>
                      </div>
                    )}

                    {/* Email Verification */}
                    {verificationMethod === 'email' && (
                      <div className="space-y-4">
                        <div className="text-center">
                          <p className="text-sm text-gray-600 mb-2">
                            Enter the 6-digit code sent to:
                          </p>
                          <p className="text-sm font-medium text-blue-600 mb-3">
                            {customerData.email}
                          </p>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleRequestEmail}
                            disabled={isSMSLoading}
                            className="text-xs"
                          >
                            {isSMSLoading ? (
                              <>
                                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                Sending...
                              </>
                            ) : (
                              <>
                                <Mail className="mr-1 h-3 w-3" />
                                Send Email Code
                              </>
                            )}
                          </Button>
                        </div>
                        <div className="relative">
                          <Input
                            type="text"
                            placeholder="123456"
                            value={emailCode}
                            onChange={handleEmailCodeChange}
                            maxLength={6}
                            className="text-center text-2xl tracking-[0.5rem] font-mono h-16 border-2 border-gray-300 rounded-2xl bg-gradient-to-br from-gray-50 to-white hover:from-white hover:to-gray-50 focus:bg-white focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all duration-300 shadow-inner"
                          />
                          <div className="absolute -right-3 top-1/2 transform -translate-y-1/2 text-2xl animate-pulse">📧</div>
                        </div>
                      </div>
                    )}

                    {error && (
                      <Alert variant="destructive" className="rounded-xl border-0 bg-red-50">
                        <AlertDescription className="text-center">{error}</AlertDescription>
                      </Alert>
                    )}

                    <div className="space-y-3">
                      {verificationMethod === 'sms' || verificationMethod === 'both' ? (
                        <Button 
                          onClick={handleSMSVerification}
                          className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white h-16 rounded-2xl font-semibold text-lg shadow-xl hover:shadow-2xl transform transition-all duration-300 hover:scale-105 hover:-translate-y-1 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:hover:scale-100"
                          disabled={isLoading || smsCode.length !== 6}
                        >
                          {isLoading ? (
                            <>
                              <Loader2 className="mr-3 h-5 w-5 animate-spin" />
                              Verifying SMS code...
                            </>
                          ) : (
                            <>
                              <span>Verify SMS Code</span>
                              <span className="ml-2 text-xl">📱</span>
                            </>
                          )}
                        </Button>
                      ) : (
                        <Button 
                          onClick={handleEmailVerification}
                          className="w-full bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white h-16 rounded-2xl font-semibold text-lg shadow-xl hover:shadow-2xl transform transition-all duration-300 hover:scale-105 hover:-translate-y-1 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:hover:scale-100"
                          disabled={isLoading || emailCode.length !== 6}
                        >
                          {isLoading ? (
                            <>
                              <Loader2 className="mr-3 h-5 w-5 animate-spin" />
                              Verifying email code...
                            </>
                          ) : (
                            <>
                              <span>Verify Email Code</span>
                              <span className="ml-2 text-xl">📧</span>
                            </>
                          )}
                        </Button>
                      )}

                      <div className="flex space-x-3">
                        <Button 
                          variant="outline" 
                          onClick={handleBackToPhone}
                          className="flex-1 h-12 rounded-xl font-medium border-2 border-gray-300 hover:border-gray-400 text-gray-600 hover:text-gray-700"
                        >
                          ← Back
                        </Button>
                        
                        {verificationMethod === 'sms' || verificationMethod === 'both' ? (
                          <Button 
                            variant="outline"
                            onClick={handleRequestSMS}
                            disabled={isSMSLoading || countdown > 240}
                            className="flex-1 h-12 rounded-xl font-medium border-2 border-blue-300 hover:border-blue-400 text-blue-600 hover:text-blue-700"
                          >
                            {isSMSLoading ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Sending...
                              </>
                            ) : countdown > 240 ? (
                              `Wait ${formatCountdown(countdown - 240)}`
                            ) : (
                              <>
                                <MessageSquare className="mr-2 h-4 w-4" />
                                Resend SMS
                              </>
                            )}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </>
                )}

                {/* Maintain existing structure for any remaining SMS-only references */}
                {authStep === 'sms' && (
                  <>
                    <div className="text-center mb-6">
                      <h4 className="text-lg font-semibold text-gray-800 mb-2">
                        📱 SMS Verification
                      </h4>
                      <p className="text-sm text-gray-600">
                        Enter the 6-digit code sent to your phone
                      </p>
                      <div className="flex items-center justify-center space-x-2 my-4">
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                      </div>
                      <p className="text-xs text-gray-600 font-medium">
                        Step 2 of 2: SMS Code Verification
                      </p>
                      {countdown > 0 && (
                        <p className="text-xs text-blue-600 mt-2">
                          Code expires in {formatCountdown(countdown)}
                        </p>
                      )}
                    </div>

                    <div className="space-y-4">
                      <div className="relative">
                        <Input
                          type="text"
                          placeholder="123456"
                          value={smsCode}
                          onChange={handleSMSCodeChange}
                          maxLength={6}
                          className="text-center text-2xl tracking-[0.5rem] font-mono h-16 border-2 border-gray-300 rounded-2xl bg-gradient-to-br from-gray-50 to-white hover:from-white hover:to-gray-50 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all duration-300 shadow-inner"
                        />
                        <div className="absolute -right-3 top-1/2 transform -translate-y-1/2 text-2xl animate-pulse">📱</div>
                      </div>
                    </div>

                    {error && (
                      <Alert variant="destructive" className="rounded-xl border-0 bg-red-50">
                        <AlertDescription className="text-center">{error}</AlertDescription>
                      </Alert>
                    )}

                    <div className="space-y-3">
                      <Button 
                        onClick={handleSMSVerification}
                        className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white h-16 rounded-2xl font-semibold text-lg shadow-xl hover:shadow-2xl transform transition-all duration-300 hover:scale-105 hover:-translate-y-1 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:hover:scale-100"
                        disabled={isLoading || smsCode.length !== 6}
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="mr-3 h-5 w-5 animate-spin" />
                            Verifying code...
                          </>
                        ) : (
                          <>
                            <span>Verify & Enter</span>
                            <span className="ml-2 text-xl">✅</span>
                          </>
                        )}
                      </Button>

                      <div className="flex space-x-2">
                        <Button 
                          variant="outline"
                          onClick={handleBackToPhone}
                          className="flex-1 bg-gray-50 border-2 border-gray-200 text-gray-700 font-semibold h-12 rounded-2xl hover:bg-gray-100 hover:border-gray-300 transition-all duration-300"
                        >
                          Back
                        </Button>
                        <Button 
                          variant="outline"
                          onClick={handleRequestSMS}
                          className="flex-1 bg-blue-50 border-2 border-blue-200 text-blue-700 font-semibold h-12 rounded-2xl hover:bg-blue-100 hover:border-blue-300 transition-all duration-300 disabled:opacity-50"
                          disabled={isSMSLoading || countdown > 240} // Allow resend after 1 minute
                        >
                          {isSMSLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            "Resend SMS"
                          )}
                        </Button>
                      </div>
                    </div>
                  </>
                )}

              </div>
            </CardContent>
          </Card>
          
          {/* Footer positioned higher */}
          <div className="mt-6">
            <Footer />
          </div>
        </div>
      </div>

      {/* Right Side - Dynamic Background */}
      <div className={`hidden lg:block w-1/2 ${themeConfig.background} relative overflow-hidden transition-all duration-1000`}>
        {/* Floating Icons */}
        {themeConfig.floatingIcons.map((icon, index) => (
          <div
            key={index}
            className={`absolute text-4xl animate-bounce opacity-20 hover:opacity-40 transition-opacity duration-300`}
            style={{
              left: `${15 + (index * 18)}%`,
              top: `${20 + (index * 12)}%`,
              animationDelay: `${index * 0.5}s`,
              animationDuration: `${3 + (index * 0.5)}s`
            }}
          >
            {icon}
          </div>
        ))}

        {/* Floating Geometric Shapes */}
        {themeConfig.shapes.map((shapeClass, index) => (
          <div
            key={index}
            className={`absolute w-16 h-16 ${shapeClass} rounded-full opacity-10 animate-pulse`}
            style={{
              right: `${10 + (index * 15)}%`,
              top: `${15 + (index * 20)}%`,
              animationDelay: `${index * 0.8}s`,
              animationDuration: `${2 + (index * 0.3)}s`
            }}
          />
        ))}

        {/* Bouncing Elements */}
        <div className="absolute top-10 right-10 w-8 h-8 bg-yellow-400 rounded-full animate-bounce opacity-30" style={{ animationDelay: '0.5s' }} />
        <div className="absolute bottom-20 left-10 w-6 h-6 bg-green-400 rounded-full animate-bounce opacity-30" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/3 left-1/4 w-4 h-4 bg-blue-400 rounded-full animate-bounce opacity-30" style={{ animationDelay: '1.5s' }} />

        {/* Centered Content for Right Side */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center p-8 max-w-md transform hover:scale-105 transition-transform duration-300">
            <div className="mb-6">
              <p className="text-2xl font-semibold text-gray-800 mb-2 animate-pulse">
                {welcomeMessage.greeting}
              </p>
              <h2 className="text-4xl font-bold text-gray-900 mb-4 transform hover:scale-110 transition-transform duration-300">
                {welcomeMessage.title}
              </h2>
              <p className="text-xl text-gray-700 mb-4">
                {welcomeMessage.subtitle}
              </p>
              {welcomeMessage.businessHours && (
                <p className="text-gray-600 text-lg italic mb-4 animate-pulse">
                  {welcomeMessage.businessHours}
                </p>
              )}
            </div>

            <div className="border-t border-gray-300 pt-4">
              <p className="text-lg text-gray-700 animate-pulse">
                Premium wholesale products with care
              </p>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}