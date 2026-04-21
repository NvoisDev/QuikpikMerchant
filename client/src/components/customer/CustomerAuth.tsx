import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, MessageSquare, Mail, Building2, User, ArrowLeft, UserPlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import Footer from "@/components/ui/footer";

interface CustomerAuthProps {
  wholesalerId: string;
  onAuthSuccess: (customerData: any) => void;
  onSkipAuth?: () => void;
  openRequestAccess?: boolean;
}

interface Wholesaler {
  id: string;
  businessName: string;
  logoType?: string;
  logoUrl?: string;
  firstName?: string;
  lastName?: string;
}

export function CustomerAuth({ wholesalerId, onAuthSuccess, onSkipAuth, openRequestAccess = false }: CustomerAuthProps) {
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
  const [autoVerifying, setAutoVerifying] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const ap = params.get('auth');
    return !!(ap && ap.length === 4 && /^\d{4}$/.test(ap));
  });
  const [cameFromLogin] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const ap = params.get('auth');
    return !!(ap && ap.length === 4 && /^\d{4}$/.test(ap));
  });
  
  // Registration request form state
  const [showRegistrationForm, setShowRegistrationForm] = useState(openRequestAccess);
  const [registrationData, setRegistrationData] = useState({
    name: '',
    businessName: '',
    phone: '',
    email: '',
    message: '',
    customerType: ''
  });
  const [isSubmittingRegistration, setIsSubmittingRegistration] = useState(false);

  const { toast } = useToast();

  useEffect(() => {
    if (openRequestAccess) {
      setShowRegistrationForm(true);
    }
  }, [openRequestAccess]);

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
          customerType: registrationData.customerType || null,
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
        setRegistrationData({ name: '', businessName: '', phone: '', email: '', message: '', customerType: '' });
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
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customerId: customerData.id,
          email: customerData.email,
          code: emailCode.trim(),
          wholesalerId
        }),
      });

      const data = await response.json();

      if (response.ok) {
        toast({
          title: "Email Verification Successful!",
          description: `Welcome ${customerData.name}, you're now securely logged in.`,
        });
        onAuthSuccess(data.customer || customerData);
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
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4 sm:px-6">
      <div className="w-full max-w-md mx-auto">
        <div className="text-center mb-8">
          {wholesaler?.logoUrl ? (
            <img
              src={wholesaler.logoUrl}
              alt={wholesaler.businessName}
              className="mx-auto h-20 w-20 rounded-full object-cover mb-6 border-2 border-gray-100"
            />
          ) : (
            <div className="mx-auto h-20 w-20 rounded-full bg-gradient-to-br from-green-600 to-green-700 flex items-center justify-center mb-6">
              <span className="text-2xl font-bold text-white">
                {wholesaler?.businessName ? getInitials(wholesaler.businessName) : 'Q'}
              </span>
            </div>
          )}
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            {authStep === 'step3' && customerData ? `Welcome, ${customerData.name}!` : 'Welcome Back'}
          </h1>
          <p className="text-gray-600 text-lg">
            Accessing {wholesaler?.businessName || 'Store'}
          </p>
        </div>

        <div className="flex items-center justify-center space-x-2 mb-2">
          <div className="h-3 w-3 rounded-full bg-green-600"></div>
          <div className={`h-0.5 w-8 ${authStep === 'step3' ? 'bg-green-600' : 'bg-gray-200'}`}></div>
          <div className={`h-3 w-3 rounded-full ${authStep === 'step3' ? 'bg-green-600' : 'bg-gray-200'}`}></div>
          {cameFromLogin && (
            <>
              <div className={`h-0.5 w-8 ${authStep === 'step3' ? 'bg-green-600' : 'bg-gray-200'}`}></div>
              <div className={`h-3 w-3 rounded-full ${authStep === 'step3' ? 'bg-green-600' : 'bg-gray-200'}`}></div>
            </>
          )}
        </div>
        <p className="text-sm text-gray-500 text-center mb-6">
          {authStep === 'step3'
            ? cameFromLogin ? 'Step 3 of 3' : 'Step 2 of 2'
            : cameFromLogin ? 'Step 2 of 3' : 'Step 1 of 2'}
        </p>

        {authStep === 'step2' && (
          <div className="space-y-6">
            <form onSubmit={(e) => { e.preventDefault(); handleLogin(); }} className="space-y-6">
              <div className="space-y-3">
                <Label htmlFor="lastFour" className="text-base font-medium">Phone Verification</Label>
                <p className="text-sm text-gray-600 text-center">Enter the last 4 digits of your phone number</p>
                <Input
                  id="lastFour"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
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

            {onSkipAuth && (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={onSkipAuth}
                  className="w-full h-11 rounded-xl border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 hover:border-green-300 font-semibold text-sm transition-colors"
                >
                  Browse products as guest →
                </button>
              </div>
            )}

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
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="123456"
                  value={smsCode}
                  onChange={handleSMSCodeChange}
                  maxLength={6}
                  className="text-center text-2xl tracking-[0.5em] h-16 border-2 font-mono focus:border-blue-600"
                  autoComplete="one-time-code"
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
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="123456"
                  value={emailCode}
                  onChange={handleEmailCodeChange}
                  maxLength={6}
                  className="text-center text-2xl tracking-[0.5em] h-16 border-2 font-mono focus:border-blue-600"
                  autoComplete="one-time-code"
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
                className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-semibold"
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

        <div className="mt-8">
          <Footer />
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
              <Label htmlFor="reg-customer-type" className="text-sm font-medium">Business Type <span className="text-gray-400 font-normal">(optional)</span></Label>
              <select
                id="reg-customer-type"
                value={registrationData.customerType}
                onChange={(e) => setRegistrationData(prev => ({ ...prev, customerType: e.target.value }))}
                className="mt-1 w-full h-10 text-sm border border-gray-200 rounded-md px-3 bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-700"
              >
                <option value="">Select type...</option>
                <option value="retail">Retailer</option>
                <option value="wholesale">Wholesaler</option>
                <option value="individual">Individual</option>
              </select>
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