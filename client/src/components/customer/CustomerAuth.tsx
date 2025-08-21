import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Shield, ShoppingCart, Package, Star, MessageSquare, Mail, Building2, User, Phone, ArrowLeft } from "lucide-react";
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
  // Check for auth parameter from URL
  const urlParams = new URLSearchParams(window.location.search);
  const authParam = urlParams.get('auth');
  
  const [lastFourDigits, setLastFourDigits] = useState(authParam || "");
  const [smsCode, setSmsCode] = useState("");
  const [authStep, setAuthStep] = useState<'step1' | 'step2' | 'step3' | 'success'>('step1');
  const [customerData, setCustomerData] = useState<any>(null);
  const [verificationMethod, setVerificationMethod] = useState<'sms' | 'email' | 'both'>('sms');
  const [emailCode, setEmailCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSMSLoading, setIsSMSLoading] = useState(false);
  const [error, setError] = useState("");
  const [smsExpiry, setSmsExpiry] = useState<number | null>(null);
  const [countdown, setCountdown] = useState<number>(0);
  const [wholesaler, setWholesaler] = useState<Wholesaler | null>(null);
  const [smsRequestInProgress, setSmsRequestInProgress] = useState(false);
  const [lastSmsTime, setLastSmsTime] = useState<number>(0);
  
  // Registration request form state
  const [showRegistrationForm, setShowRegistrationForm] = useState(false);
  const [registrationData, setRegistrationData] = useState({
    name: '',
    businessName: '',
    phone: '',
    email: '',
    message: ''
  });
  const [isSubmittingRegistration, setIsSubmittingRegistration] = useState(false);

  const { toast } = useToast();

  // Handle registration request form submission
  const handleRegistrationSubmit = async () => {
    if (!registrationData.name || !registrationData.phone) {
      toast({
        title: "Missing Information",
        description: "Please fill in your name and phone number.",
        variant: "destructive"
      });
      return;
    }

    setIsSubmittingRegistration(true);
    try {
      const response = await fetch('/api/customer/request-wholesaler-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wholesalerId,
          customerPhone: registrationData.phone,
          customerName: registrationData.name,
          customerEmail: registrationData.email,
          businessName: registrationData.businessName,
          requestMessage: registrationData.message
        })
      });

      const data = await response.json();

      if (response.ok) {
        toast({
          title: "Request Sent!",
          description: data.message || "Your access request has been sent to the wholesaler.",
        });
        setShowRegistrationForm(false);
        setRegistrationData({ name: '', businessName: '', phone: '', email: '', message: '' });
        setError(""); // Clear the customer not found error
      } else {
        toast({
          title: "Request Failed",
          description: data.error || "Failed to send your request. Please try again.",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Registration request error:', error);
      toast({
        title: "Connection Error",
        description: "Unable to send your request. Please check your connection and try again.",
        variant: "destructive"
      });
    } finally {
      setIsSubmittingRegistration(false);
    }
  };

  // Handle automatic authentication when coming from CustomerLogin
  const handleAuthenticationFromLogin = useCallback(async (digits: string) => {
    // Prevent duplicate SMS requests with both flag and time-based protection
    const now = Date.now();
    if (smsRequestInProgress || (now - lastSmsTime < 30000)) {
      console.log('🚫 SMS request blocked - either in progress or too recent', {
        smsRequestInProgress,
        timeSinceLastSms: now - lastSmsTime,
        lastSmsTime
      });
      return;
    }
    
    setSmsRequestInProgress(true);
    setLastSmsTime(now);
    
    console.log('🚀 HANDLE_AUTHENTICATION_FROM_LOGIN START', { 
      wholesalerId, 
      digits,
      currentAuthStep: authStep,
      customerData: customerData ? 'EXISTS' : 'NULL'
    });
    
    try {
      // Verify customer exists with these last 4 digits
      console.log('📡 SENDING VERIFY REQUEST...');
      const verifyResponse = await fetch('/api/customer-auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wholesalerId, lastFourDigits: digits }),
      });

      const verifyData = await verifyResponse.json();
      console.log('📡 VERIFY RESPONSE:', { ok: verifyResponse.ok, data: verifyData });

      if (verifyResponse.ok) {
        console.log('✅ CUSTOMER FOUND - SETTING CUSTOMER DATA');
        setCustomerData(verifyData.customer);
        
        // Send SMS code
        console.log('📱 SENDING SMS REQUEST...');
        const smsResponse = await fetch('/api/customer-auth/request-sms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wholesalerId, lastFourDigits: digits }),
        });

        const smsData = await smsResponse.json();
        console.log('📱 SMS RESPONSE:', { ok: smsResponse.ok, data: smsData });
        


        if (smsResponse.ok) {
          console.log('✅ SMS SENT - MOVING TO STEP 3');
          setVerificationMethod(verifyData.customer.email ? 'both' : 'sms');
          setSmsExpiry(Date.now() + 5 * 60 * 1000);
          setCountdown(300);
          setAuthStep('step3'); // SMS verification step
        } else {
          console.log('❌ SMS FAILED - BACK TO STEP 2');
          setError('Failed to send SMS. Please try again.');
          setAuthStep('step2');
        }
      } else {
        console.log('❌ CUSTOMER VERIFY FAILED - SHOWING STEP 2 WITH REGISTRATION OPTIONS');
        // Show customer not found message with contact instructions
        setError("CUSTOMER_NOT_FOUND");
        setAuthStep('step2'); // Go to step 2 to show phone form and registration options
      }
    } catch (error) {
      console.error('❌ AUTO-AUTHENTICATION EXCEPTION:', error);
      setError('Authentication failed. Please try again.');
      setAuthStep('step1');
    } finally {
      setSmsRequestInProgress(false);
    }
  }, [wholesalerId, smsRequestInProgress]);

  // Initialize authentication flow once on component mount
  useEffect(() => {
    console.log('🔧 COMPONENT MOUNT - Initializing authentication');
    
    // Check for existing session first to avoid unnecessary SMS
    const checkExistingSession = async () => {
      if (!wholesalerId) return false;
      
      try {
        console.log('🔍 Checking for existing session before SMS...');
        const response = await fetch(`/api/customer-auth/check/${wholesalerId}`, {
          credentials: 'include',
        });
        
        if (response.ok) {
          const sessionData = await response.json();
          if (sessionData.authenticated && sessionData.customer) {
            console.log('✅ Existing session found, bypassing SMS:', sessionData.customer.name);
            onAuthSuccess(sessionData.customer);
            return true;
          }
        }
      } catch (error) {
        console.log('🔍 No existing session found, proceeding with authentication');
      }
      return false;
    };
    
    // Check for auth parameter from CustomerLogin
    const urlParams = new URLSearchParams(window.location.search);
    const authParam = urlParams.get('auth');
    
    console.log('🔍 URL Parameter Check on Mount:', { 
      authParam, 
      isValid: authParam && authParam.length === 4 && /^\d{4}$/.test(authParam),
      wholesalerId 
    });
    
    if (authParam && authParam.length === 4 && /^\d{4}$/.test(authParam)) {
      // Customer came from CustomerLogin - start at step 2 and check authentication
      setLastFourDigits(authParam);
      setAuthStep('step2'); // Start directly at step 2 with the digits
      
      checkExistingSession().then(hasSession => {
        if (!hasSession) {
          // No existing session, proceed with SMS verification
          console.log('🔗 FROM CUSTOMER LOGIN: No session found, sending SMS with digits', authParam);
          handleAuthenticationFromLogin(authParam);
        }
      });
    } else {
      // Fresh start - check for existing session first
      checkExistingSession().then(hasSession => {
        if (!hasSession) {
          console.log('🔄 FRESH START: No session found, starting at step 1');
          setAuthStep('step1');
        }
      });
    }
  }, [wholesalerId]); // Only depend on wholesalerId to prevent infinite loops

  // DISABLED - Fetch wholesaler data causing infinite loop
  // useEffect(() => {
  //   const fetchWholesaler = async () => {
  //     try {
  //       const response = await fetch(`/api/marketplace/wholesaler/${wholesalerId}`);
  //       if (response.ok) {
  //         const data = await response.json();
  //         setWholesaler(data);
  //       }
  //     } catch (error) {
  //       console.error('Failed to fetch wholesaler data:', error);
  //     }
  //   };

  //   if (wholesalerId) {
  //     fetchWholesaler();
  //   }
  // }, [wholesalerId]);

  // Countdown timer for SMS expiry
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleLogin = async (overrideDigits?: string) => {
    const phoneDigits = overrideDigits || lastFourDigits;
    console.log('🚀 Starting streamlined authentication...', { wholesalerId, lastFourDigits: phoneDigits });
    
    if (!phoneDigits) {
      setError("Please enter the last 4 digits of your phone number");
      return;
    }

    if (phoneDigits.length !== 4) {
      setError("Please enter exactly 4 digits");
      return;
    }

    // Prevent multiple simultaneous authentication attempts
    if (isLoading) {
      console.log('⏳ Authentication already in progress, ignoring duplicate request');
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
          lastFourDigits: phoneDigits.trim()
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
            lastFourDigits: phoneDigits.trim()
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
          
          setAuthStep('step3');
          setCountdown(300); // 5 minutes
          setSmsExpiry(Date.now() + 300000);
          
          toast({
            title: "SMS Sent!",
            description: `A verification code has been sent to your phone, ${verifyData.customer.name}. Please enter the code below.`,
          });
          

        } else {
          console.error('❌ SMS sending failed:', smsData);
          setError(smsData.error || "Failed to send SMS code. Please try again.");
        }
      } else {
        console.error('❌ Customer verification failed:', verifyData);
        // Enhanced error handling - distinguish between different error types
        if (verifyData.error?.includes("Customer not found") || verifyData.error?.includes("not found")) {
          setError("CUSTOMER_NOT_FOUND");
        } else {
          setError(verifyData.error || "Customer not found. Please check the last 4 digits of your phone number.");
        }
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

    // Prevent multiple simultaneous SMS requests
    if (isSMSLoading) {
      console.log('⏳ SMS request already in progress, ignoring duplicate request');
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
        setAuthStep('step1');
        setCustomerData(null);
      }
    } catch (error) {
      console.error('SMS request error:', error);
      setError("Connection error. Please try again.");
      setAuthStep('step1');
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
        // Clear the input for retry
        setSmsCode('');
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
    setAuthStep('step2');
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

    const messages = (businessMessages as Record<string, string[]>)[businessType] || businessMessages.default;
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
      if (specialOccasion.greeting?.includes('Christmas')) {
        return {
          background: 'bg-gradient-to-br from-red-50 via-green-50 to-white',
          floatingIcons: ['🎄', '🎁', '⭐', '❄️', '🔔'],
          shapes: ['bg-red-300', 'bg-green-300', 'bg-gold-300', 'bg-white']
        };
      } else if (specialOccasion.greeting?.includes('New Year')) {
        return {
          background: 'bg-gradient-to-br from-purple-50 via-gold-50 to-white',
          floatingIcons: ['🎊', '🎉', '✨', '🥳', '🎆'],
          shapes: ['bg-purple-300', 'bg-gold-300', 'bg-green-300', 'bg-blue-300']
        };
      } else if (specialOccasion.greeting?.includes('Friday')) {
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
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Left Side - White Background with Authentication Form */}
      <div className="w-full lg:w-1/2 bg-white flex items-start justify-center p-3 sm:p-4 lg:p-4 overflow-y-auto">
        <div className="w-full max-w-md mx-auto py-2 sm:py-4">
          {/* Back Button - Mobile Optimized */}
          <div className="mb-3 sm:mb-4">
            <Button
              onClick={() => window.location.href = '/customer-login'}
              variant="ghost"
              className="text-gray-600 hover:text-gray-800 hover:bg-gray-100 p-2 sm:p-3 rounded-full transition-all duration-200 flex items-center space-x-2 text-sm sm:text-base"
            >
              <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span className="font-medium">Back</span>
            </Button>
          </div>

          {/* Wholesaler Logo/Initials Header - Mobile Optimized */}
          <div className="text-center mb-3 sm:mb-4">
            <div className="mx-auto mb-2 sm:mb-3 relative">
              {wholesaler?.logoUrl ? (
                <img 
                  src={wholesaler.logoUrl} 
                  alt={wholesaler.businessName}
                  className="w-12 h-12 sm:w-16 sm:h-16 rounded-full object-cover mx-auto border-2 sm:border-3 border-gray-200 shadow-lg"
                />
              ) : (
                <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-gradient-to-br from-green-500 to-blue-500 flex items-center justify-center mx-auto border-2 sm:border-3 border-gray-200 shadow-lg">
                  <span className="text-lg sm:text-xl font-bold text-white">
                    {wholesaler ? getInitials(wholesaler.businessName) : 'Q'}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Unified Authentication Card - Mobile Optimized */}
          <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-xl sm:shadow-2xl rounded-2xl sm:rounded-3xl overflow-hidden">
            <CardContent className="p-3 sm:p-4">
              <div className="space-y-3 sm:space-y-4">

                {/* Enhanced Step 1: Store Introduction with Progress Indicator */}
                {authStep === 'step1' && (
                  <>
                    <div className="text-center space-y-4 sm:space-y-6">
                      {/* Progress Bar */}
                      <div className="mb-4 sm:mb-6">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-xs sm:text-sm font-medium text-gray-600">Step 1 of 3</span>
                          <span className="text-xs sm:text-sm text-gray-500">Getting Started</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-1.5 sm:h-2">
                          <div className="bg-gradient-to-r from-green-500 to-blue-500 h-1.5 sm:h-2 rounded-full transition-all duration-700 ease-out" style={{ width: '33%' }}></div>
                        </div>
                      </div>

                      <div className="bg-gradient-to-br from-blue-50 to-green-50 rounded-xl sm:rounded-2xl p-4 sm:p-6 border border-blue-100 shadow-sm">
                        <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br from-green-500 to-blue-500 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4 shadow-lg">
                          <span className="text-white text-2xl sm:text-3xl">🏪</span>
                        </div>
                        <h4 className="text-lg sm:text-xl font-bold text-gray-800 mb-2">
                          Welcome to {wholesaler?.businessName || 'Our Store'}
                        </h4>
                        <p className="text-gray-600 text-sm sm:text-base">
                          Access your wholesale portal with secure authentication
                        </p>
                      </div>
                      
                      <Button 
                        onClick={() => setAuthStep('step2')} 
                        className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white h-11 sm:h-12 rounded-xl font-semibold text-sm sm:text-base shadow-lg hover:shadow-xl transform transition-all duration-300 hover:scale-105 hover:-translate-y-1"
                      >
                        Continue to Authentication
                        <span className="ml-2 text-lg">→</span>
                      </Button>
                    </div>
                  </>
                )}

                {/* Enhanced Step 2: Phone Number Entry */}
                {authStep === 'step2' && (
                  <>
                    <div className="space-y-3 sm:space-y-4">
                      {/* Enhanced Progress Indicator */}
                      <div className="text-center mb-3 sm:mb-4">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-xs sm:text-sm font-medium text-gray-600">Step 2 of 3</span>
                          <span className="text-xs sm:text-sm text-gray-500">Authentication</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-1.5 sm:h-2 mb-3 sm:mb-4">
                          <div className="bg-gradient-to-r from-green-500 to-blue-500 h-1.5 sm:h-2 rounded-full transition-all duration-700 ease-out" style={{ width: '66%' }}></div>
                        </div>
                        
                        {/* Visual Header */}
                        <div className="bg-gradient-to-br from-green-50 to-blue-50 rounded-lg sm:rounded-xl p-3 sm:p-4 border border-green-100">
                          <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br from-green-500 to-blue-500 rounded-full flex items-center justify-center mx-auto mb-2 shadow-md">
                            <span className="text-white text-lg sm:text-xl">📱</span>
                          </div>
                          <h4 className="text-base sm:text-lg font-semibold text-gray-800 mb-1">
                            Phone Authentication
                          </h4>
                          <p className="text-xs sm:text-sm text-gray-600">
                            Enter the last 4 digits of your phone number
                          </p>
                        </div>
                      </div>
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
                          className="text-center text-xl sm:text-2xl tracking-[0.4rem] sm:tracking-[0.8rem] font-mono h-10 sm:h-12 border-2 border-gray-300 rounded-lg sm:rounded-xl bg-gradient-to-br from-gray-50 to-white hover:from-white hover:to-gray-50 focus:bg-white focus:border-green-500 focus:ring-2 focus:ring-green-200 transition-all duration-300 shadow-inner"
                        />
                        <div className="absolute -right-2 sm:-right-3 top-1/2 transform -translate-y-1/2 text-lg sm:text-2xl animate-pulse">🔐</div>
                        {/* Progress indicator for phone input */}
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-200 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-green-500 to-blue-500 transition-all duration-300 rounded-full"
                            style={{ width: `${(lastFourDigits.length / 4) * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Enhanced Mobile-Optimized Error Display for Step 2 */}
                    {error && (
                      <Alert variant={error === "CUSTOMER_NOT_FOUND" ? "default" : "destructive"} className={`rounded-lg sm:rounded-xl border-0 ${error === "CUSTOMER_NOT_FOUND" ? "bg-blue-50" : "bg-red-50"}`}>
                        {error === "CUSTOMER_NOT_FOUND" ? (
                          <AlertDescription className="text-center space-y-3 sm:space-y-4">
                            <div className="flex items-center justify-center mb-1 sm:mb-2">
                              <Building2 className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 mr-1 sm:mr-2" />
                              <span className="text-blue-800 font-semibold text-sm sm:text-base">Not registered yet?</span>
                            </div>
                            <p className="text-blue-700 text-xs sm:text-sm mb-2 sm:mb-3 px-2">
                              You need to be registered by {wholesaler?.businessName || 'this wholesaler'} before you can access their store. 
                              Request access by filling out a quick form below.
                            </p>
                            <div className="space-y-2">
                              <Button
                                onClick={() => setShowRegistrationForm(true)}
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white h-10 sm:h-11 text-sm sm:text-base"
                              >
                                <User className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
                                Request Access
                              </Button>
                              <Button
                                onClick={() => setError("")}
                                variant="outline"
                                className="w-full border-blue-300 text-blue-600 hover:bg-blue-50 h-10 sm:h-11 text-sm sm:text-base"
                              >
                                <ArrowLeft className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
                                Try Different Number
                              </Button>
                            </div>
                          </AlertDescription>
                        ) : error.includes("SMS failed") || error.includes("Failed to send") ? (
                          <AlertDescription className="text-center space-y-2 sm:space-y-3">
                            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-orange-100 rounded-full flex items-center justify-center mx-auto">
                              <span className="text-orange-600 text-sm sm:text-lg">📱</span>
                            </div>
                            <h6 className="font-semibold text-gray-800 text-sm sm:text-base">SMS Delivery Issue</h6>
                            <p className="text-xs sm:text-sm text-gray-600 px-2">{error}</p>
                            <div className="bg-orange-50 p-2 sm:p-3 rounded-lg">
                              <p className="text-xs text-orange-700 font-medium">Troubleshooting tips:</p>
                              <ul className="text-xs text-orange-600 mt-1 space-y-1 text-left">
                                <li>• Check your phone has signal</li>
                                <li>• Wait 30 seconds and try again</li>
                                <li>• Ensure your number is correct</li>
                              </ul>
                            </div>
                          </AlertDescription>
                        ) : (
                          <AlertDescription className="text-center">
                            <p className="text-xs sm:text-sm text-gray-600 px-2">{error}</p>
                          </AlertDescription>
                        )}
                      </Alert>
                    )}

                    <div className="space-y-3">
                      <Button 
                        onClick={() => handleLogin()} 
                        className="w-full bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white h-10 sm:h-12 rounded-lg sm:rounded-xl font-semibold text-sm sm:text-base shadow-lg sm:shadow-xl hover:shadow-xl sm:hover:shadow-2xl transform transition-all duration-300 hover:scale-105 hover:-translate-y-1 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:hover:scale-100"
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

                {/* Step 3: SMS Verification */}
                {authStep === 'step3' && customerData && (
                  <>
                    <div className="text-center mb-4">
                      <h4 className="text-base font-semibold text-gray-800 mb-1">
                        🔐 Verification Required
                      </h4>
                      <p className="text-sm text-gray-600 mb-2">
                        Hello {customerData.name}! Please verify your identity:
                      </p>
                      <div className="flex items-center justify-center space-x-2 my-4">
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                      </div>
                      <p className="text-xs text-gray-600 font-medium">
                        Step 3 of 3: SMS Verification
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
                          <p className="text-xs sm:text-sm text-gray-600 mb-2 sm:mb-3 px-2">
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
                            className="text-center text-lg sm:text-xl tracking-[0.2rem] sm:tracking-[0.4rem] font-mono h-10 sm:h-12 border-2 border-gray-300 rounded-lg sm:rounded-xl bg-gradient-to-br from-gray-50 to-white hover:from-white hover:to-gray-50 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all duration-300 shadow-inner"
                          />
                          <div className="absolute -right-2 sm:-right-3 top-1/2 transform -translate-y-1/2 text-lg sm:text-2xl animate-pulse">📱</div>
                          {/* Progress indicator for SMS input */}
                          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-200 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-gradient-to-r from-blue-500 to-green-500 transition-all duration-300 rounded-full"
                              style={{ width: `${(smsCode.length / 6) * 100}%` }}
                            />
                          </div>
                        </div>
                        

                      </div>
                    )}

                    {/* Email Verification */}
                    {verificationMethod === 'email' && (
                      <div className="space-y-4">
                        <div className="text-center">
                          <p className="text-xs sm:text-sm text-gray-600 mb-1 sm:mb-2 px-2">
                            Enter the 6-digit code sent to:
                          </p>
                          <p className="text-xs sm:text-sm font-medium text-blue-600 mb-2 sm:mb-3 break-all px-2">
                            {customerData.email}
                          </p>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleRequestEmail}
                            disabled={isSMSLoading}
                            className="text-xs h-8 sm:h-9"
                          >
                            {isSMSLoading ? (
                              <>
                                <Loader2 className="mr-1 h-2 w-2 sm:h-3 sm:w-3 animate-spin" />
                                Sending...
                              </>
                            ) : (
                              <>
                                <Mail className="mr-1 h-2 w-2 sm:h-3 sm:w-3" />
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
                            className="text-center text-lg sm:text-xl tracking-[0.2rem] sm:tracking-[0.4rem] font-mono h-10 sm:h-12 border-2 border-gray-300 rounded-lg sm:rounded-xl bg-gradient-to-br from-gray-50 to-white hover:from-white hover:to-gray-50 focus:bg-white focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all duration-300 shadow-inner"
                          />
                          <div className="absolute -right-2 sm:-right-3 top-1/2 transform -translate-y-1/2 text-lg sm:text-2xl animate-pulse">📧</div>
                          {/* Progress indicator for email input */}
                          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gray-200 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-gradient-to-r from-purple-500 to-blue-500 transition-all duration-300 rounded-full"
                              style={{ width: `${(emailCode.length / 6) * 100}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Enhanced Error Display for Step 3 Verification */}
                    {error && (
                      <Alert className="border-red-200 bg-red-50 rounded-lg sm:rounded-xl">
                        <AlertDescription className="text-center space-y-2 sm:space-y-3">
                          {error.includes("Invalid") || error.includes("incorrect") ? (
                            <>
                              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                                <span className="text-red-600 text-sm sm:text-lg">❌</span>
                              </div>
                              <h6 className="font-semibold text-gray-800 text-xs sm:text-sm">Code Incorrect</h6>
                              <p className="text-xs text-gray-600 px-2">Double-check the code and try again. Make sure you're using the most recent code sent to you.</p>
                            </>
                          ) : error.includes("expired") ? (
                            <>
                              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-orange-100 rounded-full flex items-center justify-center mx-auto">
                                <span className="text-orange-600 text-sm sm:text-lg">⏰</span>
                              </div>
                              <h6 className="font-semibold text-gray-800 text-xs sm:text-sm">Code Expired</h6>
                              <p className="text-xs text-gray-600 px-2">Request a new verification code and try again.</p>
                            </>
                          ) : error.includes("Failed to send") || error.includes("SMS") ? (
                            <>
                              <div className="w-8 h-8 sm:w-10 sm:h-10 bg-orange-100 rounded-full flex items-center justify-center mx-auto">
                                <span className="text-orange-600 text-sm sm:text-lg">📱</span>
                              </div>
                              <h6 className="font-semibold text-gray-800 text-xs sm:text-sm">SMS Issue</h6>
                              <p className="text-xs text-gray-600 px-2">{error}</p>
                              <div className="bg-orange-50 p-2 rounded-lg">
                                <p className="text-xs text-orange-700">Try resending or check your signal</p>
                              </div>
                            </>
                          ) : (
                            <p className="text-xs sm:text-sm text-gray-600 px-2">{error}</p>
                          )}
                        </AlertDescription>
                      </Alert>
                    )}

                    <div className="space-y-2 sm:space-y-3">
                      {verificationMethod === 'sms' || verificationMethod === 'both' ? (
                        <Button 
                          onClick={handleSMSVerification}
                          className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white h-10 sm:h-12 rounded-lg sm:rounded-xl font-semibold text-sm sm:text-base shadow-lg sm:shadow-xl hover:shadow-xl sm:hover:shadow-2xl transform transition-all duration-300 hover:scale-105 hover:-translate-y-1 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:hover:scale-100"
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
                          className="w-full bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white h-10 sm:h-12 rounded-lg sm:rounded-xl font-semibold text-sm sm:text-base shadow-lg sm:shadow-xl hover:shadow-xl sm:hover:shadow-2xl transform transition-all duration-300 hover:scale-105 hover:-translate-y-1 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none disabled:hover:scale-100"
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

                {/* Legacy SMS step - should not be reached */}
                {false && (
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

      {/* Mobile-Optimized Registration Request Dialog */}
      <Dialog open={showRegistrationForm} onOpenChange={setShowRegistrationForm}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader className="pb-2">
            <DialogTitle className="flex items-center text-base sm:text-lg">
              <Building2 className="w-4 h-4 sm:w-5 sm:h-5 mr-1 sm:mr-2 text-blue-600" />
              Request Access to {wholesaler?.businessName || 'Store'}
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              Fill out this form to request access. The wholesaler will review your request and get back to you.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-3 sm:space-y-4 py-2">
            <div>
              <Label htmlFor="reg-name" className="text-sm font-medium">Name *</Label>
              <Input
                id="reg-name"
                value={registrationData.name}
                onChange={(e) => setRegistrationData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Your full name"
                className="mt-1 h-9 sm:h-10 text-sm"
              />
            </div>
            
            <div>
              <Label htmlFor="reg-business" className="text-sm font-medium">Business Name</Label>
              <Input
                id="reg-business"
                value={registrationData.businessName}
                onChange={(e) => setRegistrationData(prev => ({ ...prev, businessName: e.target.value }))}
                placeholder="Your business name"
                className="mt-1 h-9 sm:h-10 text-sm"
              />
            </div>
            
            <div>
              <Label htmlFor="reg-phone" className="text-sm font-medium">Phone Number *</Label>
              <Input
                id="reg-phone"
                type="tel"
                value={registrationData.phone}
                onChange={(e) => setRegistrationData(prev => ({ ...prev, phone: e.target.value }))}
                placeholder="Your phone number"
                className="mt-1 h-9 sm:h-10 text-sm"
              />
            </div>
            
            <div>
              <Label htmlFor="reg-email" className="text-sm font-medium">Email</Label>
              <Input
                id="reg-email"
                type="email"
                value={registrationData.email}
                onChange={(e) => setRegistrationData(prev => ({ ...prev, email: e.target.value }))}
                placeholder="Your email address"
                className="mt-1 h-9 sm:h-10 text-sm"
              />
            </div>
            
            <div>
              <Label htmlFor="reg-message" className="text-sm font-medium">Message (Optional)</Label>
              <Textarea
                id="reg-message"
                value={registrationData.message}
                onChange={(e) => setRegistrationData(prev => ({ ...prev, message: e.target.value }))}
                placeholder="Tell them why you'd like access to their store..."
                className="mt-1 resize-none text-sm h-20 sm:h-24"
                rows={3}
              />
            </div>
          </div>

          <DialogFooter className="space-y-2 sm:space-y-0 pt-2">
            <Button
              onClick={() => setShowRegistrationForm(false)}
              variant="outline"
              className="w-full sm:w-auto h-9 sm:h-10 text-sm"
            >
              Cancel
            </Button>
            <Button
              onClick={handleRegistrationSubmit}
              disabled={isSubmittingRegistration || !registrationData.name || !registrationData.phone}
              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 h-9 sm:h-10 text-sm"
            >
              {isSubmittingRegistration ? (
                <>
                  <Loader2 className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Mail className="mr-1 sm:mr-2 h-3 w-3 sm:h-4 sm:w-4" />
                  Send Request
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}