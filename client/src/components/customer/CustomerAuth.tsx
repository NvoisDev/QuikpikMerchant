import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Shield, ShoppingCart, Package, Star, MessageSquare, Mail, Building2, User, Phone, ArrowLeft, UserPlus } from "lucide-react";
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
  const [authStep, setAuthStep] = useState<'step1' | 'step2' | 'step3' | 'success'>('step2');
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
  const [autoVerifying, setAutoVerifying] = useState(false);
  
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
      setAuthStep('step2');
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
      setLastFourDigits(authParam);
      setAutoVerifying(true);
      
      checkExistingSession().then(hasSession => {
        if (!hasSession) {
          console.log('🔗 FROM CUSTOMER LOGIN: No session found, sending SMS with digits', authParam);
          handleAuthenticationFromLogin(authParam).finally(() => {
            setAutoVerifying(false);
          });
        } else {
          setAutoVerifying(false);
        }
      });
    } else {
      // Fresh start - check for existing session first
      checkExistingSession().then(hasSession => {
        if (!hasSession) {
          console.log('🔄 FRESH START: No session found, starting at phone entry');
          setAuthStep('step2');
        }
      });
    }
  }, [wholesalerId]); // Only depend on wholesalerId to prevent infinite loops

  // Fetch wholesaler data
  useEffect(() => {
    const fetchWholesaler = async () => {
      try {
        console.log('🔍 Fetching wholesaler data for ID:', wholesalerId);
        const response = await fetch(`/api/marketplace/wholesaler/${wholesalerId}`);
        if (response.ok) {
          const data = await response.json();
          console.log('🏪 Wholesaler data received:', {
            id: data.id,
            businessName: data.businessName,
            logoUrl: data.logoUrl,
            initials: data.businessName ? getInitials(data.businessName) : 'N/A'
          });
          setWholesaler(data);
        } else {
          console.error('❌ Failed to fetch wholesaler - response not ok:', response.status);
        }
      } catch (error) {
        console.error('❌ Failed to fetch wholesaler - network error:', error);
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
        setAuthStep('step2');
        setCustomerData(null);
      }
    } catch (error) {
      console.error('SMS request error:', error);
      setError("Connection error. Please try again.");
      setAuthStep('step2');
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
        
        // Check if customer has multiple wholesaler relationships
        try {
          const wholesalersResponse = await fetch('/api/customer/wholesalers', {
            credentials: 'include'
          });
          
          if (wholesalersResponse.ok) {
            const wholesalers = await wholesalersResponse.json();
            
            // If customer has multiple wholesalers, redirect to selection page
            if (wholesalers.length > 1) {
              window.location.href = '/select-wholesaler';
              return;
            } else if (wholesalers.length === 1) {
              // If only one wholesaler, check if it's the current one
              const currentWholesaler = wholesalers[0].wholesaler.id;
              if (currentWholesaler !== wholesalerId) {
                // Redirect to the correct wholesaler's portal
                window.location.href = `/customer-portal/${currentWholesaler}`;
                return;
              }
            }
          }
        } catch (error) {
          console.error('Error checking wholesaler relationships:', error);
          // Continue with normal flow if check fails
        }
        
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

  if (autoVerifying) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4">
        <div className="text-center max-w-md mx-auto">
          {wholesaler?.logoUrl ? (
            <img
              src={wholesaler.logoUrl}
              alt={wholesaler.businessName}
              className="mx-auto h-20 w-20 rounded-full object-cover mb-6 border-2 border-gray-100 shadow-md"
            />
          ) : (
            <div className="mx-auto h-20 w-20 rounded-full bg-gradient-to-br from-green-600 to-green-700 flex items-center justify-center mb-6 shadow-md">
              <span className="text-2xl font-bold text-white">
                {wholesaler?.businessName ? getInitials(wholesaler.businessName) : 'Q'}
              </span>
            </div>
          )}
          <Loader2 className="h-8 w-8 animate-spin text-green-600 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Verifying your access...</h2>
          <p className="text-gray-500 text-sm">
            Connecting you to {wholesaler?.businessName || 'the store'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex">
      <div className="w-full lg:w-1/2 bg-white flex flex-col justify-center px-4 sm:px-6 lg:px-8">
        <div className="w-full max-w-md mx-auto">
          <div className="text-center mb-8">
            {wholesaler?.logoUrl ? (
              <img
                src={wholesaler.logoUrl}
                alt={wholesaler.businessName}
                className="mx-auto h-20 w-20 rounded-full object-cover mb-6 shadow-lg border-2 border-gray-100"
              />
            ) : (
              <div className="mx-auto h-20 w-20 rounded-full bg-gradient-to-br from-green-600 to-green-700 flex items-center justify-center mb-6 shadow-lg">
                <span className="text-2xl font-bold text-white">
                  {wholesaler?.businessName ? getInitials(wholesaler.businessName) : 'Q'}
                </span>
              </div>
            )}
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              {authStep === 'step3' && customerData ? `Welcome, ${customerData.name}!` : 'Welcome Back'}
            </h1>
            <p className="text-gray-600 text-lg">
              {authStep === 'step3' ? 'Verify your identity to continue' : `Accessing ${wholesaler?.businessName || 'Store'}`}
            </p>
          </div>

          <Card className="w-full shadow-xl border-0 bg-white/80 backdrop-blur-sm">
            <CardHeader className="text-center pb-2">
              <div className="flex items-center justify-center space-x-2 mb-4">
                <div className={`h-3 w-3 rounded-full transition-all duration-300 bg-green-600`}></div>
                <div className={`h-0.5 w-8 transition-all duration-300 ${authStep === 'step3' ? 'bg-green-600' : 'bg-gray-200'}`}></div>
                <div className={`h-3 w-3 rounded-full transition-all duration-300 ${authStep === 'step3' ? 'bg-green-600' : 'bg-gray-200'}`}></div>
              </div>
              <p className="text-sm text-gray-500">
                {authStep === 'step3' ? 'Step 2 of 2' : 'Step 1 of 2'}
              </p>
            </CardHeader>

            <CardContent className="space-y-6">
              {authStep === 'step2' && (
                <div className="space-y-6">
                  <form onSubmit={(e) => { e.preventDefault(); handleLogin(); }} className="space-y-6">
                    <div className="space-y-3">
                      <Label htmlFor="lastFour" className="text-base font-medium">Phone Verification</Label>
                      <div className="text-center mb-4">
                        <p className="text-sm text-gray-600">Enter the last 4 digits of your phone number</p>
                      </div>
                      <Input
                        id="lastFour"
                        type="text"
                        placeholder="••••"
                        value={lastFourDigits}
                        onChange={handleLastFourChange}
                        maxLength={4}
                        className="text-center text-2xl tracking-[0.5em] h-16 border-2 font-mono focus:border-green-600"
                        disabled={isLoading}
                        autoComplete="off"
                      />
                    </div>

                    {error && (
                      <Alert variant={error === "CUSTOMER_NOT_FOUND" ? "default" : "destructive"} className={`rounded-lg border-0 ${error === "CUSTOMER_NOT_FOUND" ? "bg-blue-50" : "bg-red-50"}`}>
                        {error === "CUSTOMER_NOT_FOUND" ? (
                          <AlertDescription className="text-center space-y-3">
                            <div className="flex items-center justify-center mb-1">
                              <Building2 className="w-4 h-4 text-blue-600 mr-2" />
                              <span className="text-blue-800 font-semibold text-sm">Not registered yet?</span>
                            </div>
                            <p className="text-blue-700 text-sm mb-3 px-2">
                              You need to be registered by {wholesaler?.businessName || 'this wholesaler'} before you can access their store.
                            </p>
                            <div className="space-y-2">
                              <Button
                                type="button"
                                onClick={() => setShowRegistrationForm(true)}
                                className="w-full bg-blue-600 hover:bg-blue-700 text-white h-11 text-sm"
                              >
                                <User className="w-4 h-4 mr-2" />
                                Request Access
                              </Button>
                              <Button
                                type="button"
                                onClick={() => setError("")}
                                variant="outline"
                                className="w-full border-blue-300 text-blue-600 hover:bg-blue-50 h-11 text-sm"
                              >
                                <ArrowLeft className="w-4 h-4 mr-2" />
                                Try Different Number
                              </Button>
                            </div>
                          </AlertDescription>
                        ) : error.includes("SMS failed") || error.includes("Failed to send") ? (
                          <AlertDescription className="text-center space-y-2">
                            <h6 className="font-semibold text-gray-800 text-sm">SMS Delivery Issue</h6>
                            <p className="text-sm text-gray-600 px-2">{error}</p>
                          </AlertDescription>
                        ) : (
                          <AlertDescription className="text-center">
                            <p className="text-sm text-gray-600 px-2">{error}</p>
                          </AlertDescription>
                        )}
                      </Alert>
                    )}

                    <Button
                      type="submit"
                      className="w-full h-12 bg-green-600 hover:bg-green-700 text-white font-semibold"
                      disabled={isLoading || lastFourDigits.length !== 4}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Sending verification code...
                        </>
                      ) : (
                        "Access Store"
                      )}
                    </Button>
                  </form>

                  <div className="border-t pt-4">
                    <button
                      type="button"
                      onClick={() => setShowRegistrationForm(true)}
                      className="w-full flex items-center justify-center gap-2 text-sm text-green-700 hover:text-green-800 font-medium transition-colors py-2"
                    >
                      <UserPlus className="h-4 w-4" />
                      Not a customer yet? Request wholesale access
                    </button>
                  </div>
                </div>
              )}

              {authStep === 'step3' && customerData && (
                <div className="space-y-6">
                  {countdown > 0 && (
                    <p className="text-xs text-blue-600 text-center">
                      Code expires in {formatCountdown(countdown)}
                    </p>
                  )}

                  {verificationMethod === 'both' ? (
                    <div className="flex bg-gray-100 rounded-xl p-1">
                      <button
                        onClick={() => setVerificationMethod('sms')}
                        className="flex-1 flex items-center justify-center py-2.5 px-4 rounded-lg font-medium text-sm bg-blue-600 text-white shadow-sm"
                      >
                        <MessageSquare className="mr-2 h-4 w-4" />
                        SMS
                      </button>
                      <button
                        onClick={() => setVerificationMethod('email')}
                        className="flex-1 flex items-center justify-center py-2.5 px-4 rounded-lg font-medium text-sm text-gray-600 hover:bg-gray-200"
                      >
                        <Mail className="mr-2 h-4 w-4" />
                        Email
                      </button>
                    </div>
                  ) : null}

                  {(verificationMethod === 'sms' || verificationMethod === 'both') && (
                    <div className="space-y-3">
                      <Label className="text-base font-medium block text-center">SMS Verification</Label>
                      <p className="text-sm text-gray-600 text-center">
                        Enter the 6-digit code sent to your phone
                      </p>
                      <Input
                        type="text"
                        placeholder="123456"
                        value={smsCode}
                        onChange={handleSMSCodeChange}
                        maxLength={6}
                        className="text-center text-2xl tracking-[0.5em] h-16 border-2 font-mono focus:border-blue-600"
                        autoComplete="off"
                      />
                    </div>
                  )}

                  {verificationMethod === 'email' && (
                    <div className="space-y-3">
                      <Label className="text-base font-medium block text-center">Email Verification</Label>
                      <p className="text-sm text-gray-600 text-center">
                        Enter the 6-digit code sent to:
                      </p>
                      <p className="text-sm font-medium text-blue-600 text-center break-all">
                        {customerData.email}
                      </p>
                      <div className="text-center">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleRequestEmail}
                          disabled={isSMSLoading}
                          className="text-xs h-8"
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
                      <Input
                        type="text"
                        placeholder="123456"
                        value={emailCode}
                        onChange={handleEmailCodeChange}
                        maxLength={6}
                        className="text-center text-2xl tracking-[0.5em] h-16 border-2 font-mono focus:border-purple-600"
                        autoComplete="off"
                      />
                    </div>
                  )}

                  {error && (
                    <Alert className="border-red-200 bg-red-50 rounded-lg">
                      <AlertDescription className="text-center space-y-2">
                        {error.includes("Invalid") || error.includes("incorrect") ? (
                          <>
                            <h6 className="font-semibold text-gray-800 text-sm">Code Incorrect</h6>
                            <p className="text-xs text-gray-600">Double-check the code and try again.</p>
                          </>
                        ) : error.includes("expired") ? (
                          <>
                            <h6 className="font-semibold text-gray-800 text-sm">Code Expired</h6>
                            <p className="text-xs text-gray-600">Request a new verification code and try again.</p>
                          </>
                        ) : (
                          <p className="text-sm text-gray-600">{error}</p>
                        )}
                      </AlertDescription>
                    </Alert>
                  )}

                  {verificationMethod === 'sms' || verificationMethod === 'both' ? (
                    <Button
                      onClick={handleSMSVerification}
                      className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-semibold"
                      disabled={isLoading || smsCode.length !== 6}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Verifying...
                        </>
                      ) : (
                        "Verify Code"
                      )}
                    </Button>
                  ) : (
                    <Button
                      onClick={handleEmailVerification}
                      className="w-full h-12 bg-purple-600 hover:bg-purple-700 text-white font-semibold"
                      disabled={isLoading || emailCode.length !== 6}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Verifying...
                        </>
                      ) : (
                        "Verify Code"
                      )}
                    </Button>
                  )}

                  <div className="flex space-x-3">
                    <Button
                      variant="outline"
                      onClick={handleBackToPhone}
                      className="flex-1 h-11 font-medium border-2"
                    >
                      <ArrowLeft className="mr-2 h-4 w-4" />
                      Back
                    </Button>

                    {(verificationMethod === 'sms' || verificationMethod === 'both') && (
                      <Button
                        variant="outline"
                        onClick={handleRequestSMS}
                        disabled={isSMSLoading || countdown > 240}
                        className="flex-1 h-11 font-medium border-2 border-blue-300 text-blue-600 hover:bg-blue-50"
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
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="mt-6">
            <Footer />
          </div>
        </div>
      </div>

      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-green-600 to-green-800 relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400' viewBox='0 0 400 400'%3E%3Cdefs%3E%3Cpattern id='dots' x='0' y='0' width='40' height='40' patternUnits='userSpaceOnUse'%3E%3Ccircle cx='20' cy='20' r='2' fill='%23ffffff'/%3E%3C/pattern%3E%3C/defs%3E%3Crect width='400' height='400' fill='url(%23dots)'/%3E%3C/svg%3E")`
          }}
        ></div>
        <div className="absolute inset-0 bg-gradient-to-br from-black/10 via-transparent to-black/30"></div>
        <div className="relative z-10 flex flex-col justify-center px-12 text-white">
          <div className="space-y-8">
            <div className="space-y-4">
              <h2 className="text-4xl font-bold leading-tight">
                Your Wholesale Portal
              </h2>
              <p className="text-xl opacity-90">
                Access exclusive wholesale products and special pricing from {wholesaler?.businessName || 'your trusted supplier'}.
              </p>
            </div>
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
                  <ShoppingCart className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold">Easy Ordering</h3>
                  <p className="text-sm opacity-80">Quick reorder and order tracking</p>
                </div>
              </div>
              <div className="flex items-center space-x-4 bg-white/10 backdrop-blur-sm rounded-lg p-4">
                <div className="h-10 w-10 rounded-lg bg-white/20 flex items-center justify-center">
                  <Shield className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold">Secure Access</h3>
                  <p className="text-sm opacity-80">Your data is always protected</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={showRegistrationForm} onOpenChange={setShowRegistrationForm}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader className="pb-2">
            <DialogTitle className="flex items-center text-base sm:text-lg">
              <Building2 className="w-4 h-4 sm:w-5 sm:h-5 mr-2 text-blue-600" />
              Request Access to {wholesaler?.businessName || 'Store'}
            </DialogTitle>
            <DialogDescription className="text-sm">
              Fill out this form to request access. The wholesaler will review your request and get back to you.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="reg-name" className="text-sm font-medium">Name *</Label>
              <Input
                id="reg-name"
                value={registrationData.name}
                onChange={(e) => setRegistrationData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Your full name"
                className="mt-1 h-10 text-sm"
              />
            </div>
            <div>
              <Label htmlFor="reg-business" className="text-sm font-medium">Business Name</Label>
              <Input
                id="reg-business"
                value={registrationData.businessName}
                onChange={(e) => setRegistrationData(prev => ({ ...prev, businessName: e.target.value }))}
                placeholder="Your business name"
                className="mt-1 h-10 text-sm"
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
                className="mt-1 h-10 text-sm"
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
                className="mt-1 h-10 text-sm"
              />
            </div>
            <div>
              <Label htmlFor="reg-message" className="text-sm font-medium">Message (Optional)</Label>
              <Textarea
                id="reg-message"
                value={registrationData.message}
                onChange={(e) => setRegistrationData(prev => ({ ...prev, message: e.target.value }))}
                placeholder="Tell them why you'd like access to their store..."
                className="mt-1 resize-none text-sm h-24"
                rows={3}
              />
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button
              onClick={() => setShowRegistrationForm(false)}
              variant="outline"
              className="w-full sm:w-auto h-10 text-sm"
            >
              Cancel
            </Button>
            <Button
              onClick={handleRegistrationSubmit}
              disabled={isSubmittingRegistration || !registrationData.name || !registrationData.phone}
              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 h-10 text-sm"
            >
              {isSubmittingRegistration ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Mail className="mr-2 h-4 w-4" />
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