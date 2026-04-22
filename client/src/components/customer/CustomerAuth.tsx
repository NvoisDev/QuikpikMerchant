import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Building2, User, ArrowLeft, UserPlus, Phone, ShieldCheck, Store, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import Footer from "@/components/ui/footer";

interface CustomerAuthProps {
  wholesalerId?: string;
  onAuthSuccess: (customerData: any) => void;
  onSkipAuth?: () => void;
  openRequestAccess?: boolean;
}

interface WholesalerOption {
  customerId: string | null;
  wholesalerId: string;
  businessName: string;
  logoUrl: string | null;
  logoType: string | null;
  status?: 'active' | 'pending';
}

interface WholesalerInfo {
  id: string;
  businessName: string;
  logoType?: string;
  logoUrl?: string;
}

type AuthStep = 'phone' | 'otp' | 'select' | 'no-account';

const DEFAULT_COUNTRY_CODE = '+44';

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

function formatCountdown(secs: number) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function CustomerAuth({ wholesalerId, onAuthSuccess, onSkipAuth, openRequestAccess = false }: CustomerAuthProps) {
  const [step, setStep] = useState<AuthStep>('phone');
  const [countryCode, setCountryCode] = useState(DEFAULT_COUNTRY_CODE); // editable, default UK
  const [phoneLocal, setPhoneLocal] = useState('');          // digits after country code
  const [otpCode, setOtpCode] = useState('');
  const [wholesalerOptions, setWholesalerOptions] = useState<WholesalerOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [wholesalerInfo, setWholesalerInfo] = useState<WholesalerInfo | null>(null);
  const [showRegistrationForm, setShowRegistrationForm] = useState(openRequestAccess);
  const [registrationData, setRegistrationData] = useState({
    name: '', businessName: '', phone: '', email: '', message: '', customerType: ''
  });
  const [isSubmittingRegistration, setIsSubmittingRegistration] = useState(false);
  const otpRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Full phone (normalised E.164): strip leading 0 from local part
  const fullPhone = countryCode.trim() + phoneLocal.replace(/^0/, '');

  // Fetch wholesaler branding when wholesalerId is known
  useEffect(() => {
    if (!wholesalerId) return;
    fetch(`/api/marketplace/wholesaler/${wholesalerId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => data && setWholesalerInfo(data))
      .catch(() => {});
  }, [wholesalerId]);

  // Countdown timer
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  useEffect(() => {
    if (openRequestAccess) setShowRegistrationForm(true);
  }, [openRequestAccess]);

  // Check for existing session on mount
  useEffect(() => {
    if (!wholesalerId) return;
    fetch(`/api/customer-auth/check/${wholesalerId}`, { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.authenticated && data?.customer) {
          onAuthSuccess(data.customer);
        }
      })
      .catch(() => {});
  }, [wholesalerId]);

  const handleSendOtp = async (resend = false) => {
    const digits = phoneLocal.replace(/\D/g, '');
    if (digits.length < 7) {
      setError('Please enter a valid phone number');
      return;
    }

    if (resend) setIsResending(true);
    else setIsLoading(true);
    setError('');

    try {
      const res = await fetch('/api/customer-auth/request-phone-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: fullPhone }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to send verification code');
        return;
      }

      if (data.throttled) {
        toast({ title: 'Already sent', description: 'A code was sent recently. Please check your messages.' });
      } else {
        if (resend) toast({ title: 'Code resent!', description: 'A new verification code has been sent.' });
      }

      setCountdown(120); // 2-minute resend cooldown
      setOtpCode('');
      setStep('otp');
      setTimeout(() => otpRef.current?.focus(), 100);
    } catch {
      setError('Connection error. Please try again.');
    } finally {
      setIsLoading(false);
      setIsResending(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otpCode.length !== 6) {
      setError('Please enter the complete 6-digit code');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const res = await fetch('/api/customer-auth/verify-phone-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneNumber: fullPhone, code: otpCode }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Invalid verification code');
        return;
      }

      if (data.noWholesalers) {
        setStep('no-account');
        return;
      }

      const options: WholesalerOption[] = data.wholesalers;
      const activeOptions = options.filter(o => o.status !== 'pending');

      // If a target wholesalerId is known and the customer has ACTIVE access to it, auto-select
      if (wholesalerId) {
        const match = activeOptions.find(o => o.wholesalerId === wholesalerId);
        if (match) {
          await completeLogin(match.wholesalerId);
          return;
        }
      }

      // Auto-select only when there is exactly one active store (pending stores never auto-select)
      if (activeOptions.length === 1 && options.length === 1) {
        await completeLogin(activeOptions[0].wholesalerId);
        return;
      }

      setWholesalerOptions(options);
      setStep('select');
    } catch {
      setError('Connection error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const completeLogin = async (selectedWholesalerId: string) => {
    setIsLoading(true);
    setError('');
    try {
      const res = await fetch('/api/customer-auth/complete-phone-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ phoneNumber: fullPhone, code: otpCode, wholesalerId: selectedWholesalerId }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Login failed');
        return;
      }

      toast({ title: 'Welcome!', description: `You're now logged in, ${data.customer.name}.` });
      onAuthSuccess(data.customer);
    } catch {
      setError('Connection error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegistrationSubmit = async () => {
    if (!registrationData.name || !registrationData.phone) {
      toast({ title: 'Missing Information', description: 'Please fill in your name and phone number.', variant: 'destructive' });
      return;
    }
    setIsSubmittingRegistration(true);
    try {
      const targetWholesalerId = wholesalerId || wholesalerOptions[0]?.wholesalerId;
      const res = await fetch('/api/customer/request-wholesaler-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wholesalerId: targetWholesalerId,
          customerPhone: registrationData.phone,
          customerName: registrationData.name,
          customerEmail: registrationData.email,
          businessName: registrationData.businessName,
          customerType: registrationData.customerType || null,
          requestMessage: registrationData.message,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast({ title: 'Request Sent!', description: data.message || 'Your access request has been sent.' });
        setShowRegistrationForm(false);
        setRegistrationData({ name: '', businessName: '', phone: '', email: '', message: '', customerType: '' });
        setError('');
      } else {
        toast({ title: 'Request Failed', description: data.error || 'Failed to send your request.', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Connection Error', description: 'Unable to send your request. Please try again.', variant: 'destructive' });
    } finally {
      setIsSubmittingRegistration(false);
    }
  };

  const storeLabel = wholesalerInfo?.businessName || 'Store';

  // ─── Loading spinner ─────────────────────────────────────────────────────
  if (isLoading && step === 'phone') {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4">
        <div className="text-center max-w-md mx-auto">
          <WholesalerAvatar info={wholesalerInfo} />
          <Loader2 className="h-8 w-8 animate-spin text-green-600 mx-auto mb-4 mt-4" />
          <p className="text-gray-500 text-sm">Sending verification code…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-4 sm:px-6">
      <div className="w-full max-w-md mx-auto">

        {/* Header */}
        <div className="text-center mb-8">
          <WholesalerAvatar info={wholesalerInfo} />
          <h1 className="text-3xl font-bold text-gray-900 mb-2 mt-4">
            {step === 'phone' && (wholesalerId ? 'Sign In' : 'Welcome Back')}
            {step === 'otp' && 'Verify your number'}
            {step === 'select' && 'Choose your store'}
            {step === 'no-account' && 'No account found'}
          </h1>
          <p className="text-gray-600 text-base">
            {step === 'phone' && (wholesalerInfo ? `Accessing ${storeLabel}` : 'Sign in to your wholesale account')}
            {step === 'otp' && `We sent a code to ${countryCode} ${phoneLocal}`}
            {step === 'select' && 'You have access to multiple stores'}
            {step === 'no-account' && `${countryCode} ${phoneLocal} isn't linked to any store`}
          </p>
        </div>

        {/* Step dots */}
        <StepDots current={step} />

        {/* ── Phone entry ── */}
        {step === 'phone' && (
          <div className="space-y-6">
            <form onSubmit={e => { e.preventDefault(); handleSendOtp(); }} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="phone" className="text-base font-medium flex items-center gap-2">
                  <Phone className="h-4 w-4" /> Mobile Number
                </Label>
                <div className="flex">
                  <Input
                    id="country-code"
                    type="text"
                    value={countryCode}
                    onChange={e => {
                      const v = e.target.value.replace(/[^\d+]/g, '') || '+';
                      setCountryCode(v.startsWith('+') ? v : '+' + v);
                      setError('');
                    }}
                    className="rounded-r-none h-12 text-base border-gray-300 focus:border-green-600 w-20 text-center font-medium"
                    aria-label="Country code"
                    disabled={isLoading}
                  />
                  <Input
                    id="phone"
                    type="tel"
                    inputMode="numeric"
                    placeholder="7700 900000"
                    value={phoneLocal}
                    onChange={e => {
                      const v = e.target.value.replace(/[^\d\s]/g, '');
                      setPhoneLocal(v);
                      setError('');
                    }}
                    className="rounded-l-none h-12 text-base border-l-0 border-gray-300 focus:border-green-600"
                    autoComplete="tel"
                    disabled={isLoading}
                  />
                </div>
                <p className="text-xs text-gray-500">Enter your mobile number. We'll send you a verification code.</p>
              </div>

              {error && (
                <Alert variant="destructive" className="border-0 bg-red-50">
                  <AlertDescription className="text-sm text-center">{error}</AlertDescription>
                </Alert>
              )}

              <Button
                type="submit"
                className="w-full h-12 bg-green-600 hover:bg-green-700 text-white font-semibold text-base"
                disabled={isLoading || phoneLocal.replace(/\D/g, '').length < 7}
              >
                {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending code…</> : 'Continue'}
              </Button>
            </form>

            {onSkipAuth && (
              <button
                type="button"
                onClick={onSkipAuth}
                className="w-full h-11 rounded-xl border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 hover:border-green-300 font-semibold text-sm transition-colors"
              >
                Browse products as guest →
              </button>
            )}

            <div className="border-t pt-4">
              <button
                type="button"
                onClick={() => setShowRegistrationForm(true)}
                className="w-full h-11 rounded-xl border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 hover:border-green-300 font-semibold text-sm transition-colors flex items-center justify-center gap-2"
              >
                <UserPlus className="h-4 w-4" />
                New customer? Request access
              </button>
            </div>
          </div>
        )}

        {/* ── OTP entry ── */}
        {step === 'otp' && (
          <div className="space-y-6">
            <div className="space-y-3">
              <Label htmlFor="otp" className="text-base font-medium flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" /> Verification Code
              </Label>
              <Input
                ref={otpRef}
                id="otp"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="123456"
                value={otpCode}
                onChange={e => {
                  const v = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setOtpCode(v);
                  setError('');
                }}
                maxLength={6}
                className="text-center text-2xl tracking-[0.5em] h-16 border-2 font-mono focus:border-green-600"
                autoComplete="one-time-code"
                disabled={isLoading}
              />
              {countdown > 60 && (
                <p className="text-xs text-blue-600 text-center">Resend available in {formatCountdown(countdown - 60)}</p>
              )}
            </div>

            {error && (
              <Alert variant="destructive" className="border-0 bg-red-50">
                <AlertDescription className="text-sm text-center">{error}</AlertDescription>
              </Alert>
            )}

            <Button
              onClick={handleVerifyOtp}
              className="w-full h-12 bg-green-600 hover:bg-green-700 text-white font-semibold"
              disabled={isLoading || otpCode.length !== 6}
            >
              {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Verifying…</> : 'Verify Code'}
            </Button>

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => { setStep('phone'); setOtpCode(''); setError(''); }}
                className="flex-1 h-11 border-2"
                disabled={isLoading}
              >
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
              </Button>
              <Button
                variant="outline"
                onClick={() => handleSendOtp(true)}
                disabled={isResending || countdown > 60}
                className="flex-1 h-11 border-2 border-blue-300 text-blue-600 hover:bg-blue-50"
              >
                {isResending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…</> : countdown > 60 ? `Wait ${formatCountdown(countdown - 60)}` : 'Resend Code'}
              </Button>
            </div>
          </div>
        )}

        {/* ── Wholesaler selection ── */}
        {step === 'select' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 text-center">Select the store you'd like to shop with today:</p>
            {wholesalerOptions.map(opt => {
              const isPending = opt.status === 'pending';
              return (
                <button
                  key={opt.wholesalerId}
                  onClick={() => {
                    if (isPending) {
                      toast({ title: 'Request pending', description: 'Your request is pending approval from this wholesaler.' });
                    } else {
                      completeLogin(opt.wholesalerId);
                    }
                  }}
                  disabled={isLoading}
                  className={`w-full flex items-center gap-4 p-4 border-2 rounded-xl text-left transition-colors ${
                    isPending
                      ? 'border-amber-200 bg-amber-50 opacity-80 cursor-default'
                      : 'border-gray-200 hover:border-green-500 hover:bg-green-50'
                  }`}
                >
                  {opt.logoUrl ? (
                    <img src={opt.logoUrl} alt={opt.businessName} className={`h-12 w-12 rounded-xl object-cover flex-shrink-0 ${isPending ? 'opacity-60' : ''}`} />
                  ) : (
                    <div className={`h-12 w-12 rounded-xl flex items-center justify-center flex-shrink-0 ${isPending ? 'bg-gradient-to-br from-amber-400 to-amber-500' : 'bg-gradient-to-br from-green-500 to-green-700'}`}>
                      <span className="text-white font-bold text-sm">{getInitials(opt.businessName)}</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className={`font-semibold truncate ${isPending ? 'text-amber-900' : 'text-gray-900'}`}>{opt.businessName}</p>
                    {isPending ? (
                      <div className="mt-0.5 space-y-1">
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-100 border border-amber-200 rounded-full px-2 py-0.5">
                          <Clock className="h-3 w-3" /> Pending approval
                        </span>
                        <p className="text-xs text-amber-700">Awaiting wholesaler approval</p>
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">Tap to enter this store</p>
                    )}
                  </div>
                  {isLoading && !isPending && <Loader2 className="h-5 w-5 animate-spin text-green-600 flex-shrink-0" />}
                </button>
              );
            })}
            {error && (
              <Alert variant="destructive" className="border-0 bg-red-50">
                <AlertDescription className="text-sm text-center">{error}</AlertDescription>
              </Alert>
            )}
            <Button variant="outline" onClick={() => { setStep('phone'); setError(''); }} className="w-full h-11 border-2">
              <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
          </div>
        )}

        {/* ── No account found ── */}
        {step === 'no-account' && (
          <div className="space-y-5">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 text-center space-y-3">
              <Building2 className="h-8 w-8 text-blue-500 mx-auto" />
              <p className="text-blue-800 font-semibold text-sm">Not registered yet?</p>
              <p className="text-blue-700 text-sm">
                Your number isn't linked to any wholesale account. Ask your wholesaler to add you, or submit a registration request below.
              </p>
              <Button
                onClick={() => setShowRegistrationForm(true)}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white h-11 text-sm"
              >
                <User className="h-4 w-4 mr-2" /> Request Access
              </Button>
            </div>
            <Button variant="outline" onClick={() => { setStep('phone'); setError(''); }} className="w-full h-11 border-2">
              <ArrowLeft className="mr-2 h-4 w-4" /> Try a different number
            </Button>
          </div>
        )}

        <div className="mt-8"><Footer /></div>
      </div>

      {/* Registration request dialog */}
      <Dialog open={showRegistrationForm} onOpenChange={setShowRegistrationForm}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader className="pb-2">
            <DialogTitle className="flex items-center text-base sm:text-lg">
              <Building2 className="w-4 h-4 sm:w-5 sm:h-5 mr-2 text-blue-600" />
              Request Access{wholesalerInfo ? ` to ${wholesalerInfo.businessName}` : ''}
            </DialogTitle>
            <DialogDescription className="text-sm">
              Fill in your details and the wholesaler will review your request.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="reg-name" className="text-sm font-medium">Name *</Label>
              <Input
                id="reg-name"
                value={registrationData.name}
                onChange={e => setRegistrationData(p => ({ ...p, name: e.target.value }))}
                placeholder="Your full name"
                className="mt-1 h-10 text-sm"
              />
            </div>
            <div>
              <Label htmlFor="reg-business" className="text-sm font-medium">Business Name</Label>
              <Input
                id="reg-business"
                value={registrationData.businessName}
                onChange={e => setRegistrationData(p => ({ ...p, businessName: e.target.value }))}
                placeholder="Your business name"
                className="mt-1 h-10 text-sm"
              />
            </div>
            <div>
              <Label htmlFor="reg-customer-type" className="text-sm font-medium">Business Type <span className="text-gray-400 font-normal">(optional)</span></Label>
              <select
                id="reg-customer-type"
                value={registrationData.customerType}
                onChange={e => setRegistrationData(p => ({ ...p, customerType: e.target.value }))}
                className="w-full mt-1 h-10 text-sm border border-input rounded-md px-3 bg-background"
              >
                <option value="">Select type…</option>
                <option value="retailer">Retailer</option>
                <option value="restaurant">Restaurant / Catering</option>
                <option value="wholesaler">Sub-wholesaler</option>
                <option value="individual">Individual</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <Label htmlFor="reg-phone" className="text-sm font-medium">Phone Number *</Label>
              <Input
                id="reg-phone"
                type="tel"
                value={registrationData.phone || (phoneLocal ? countryCode + phoneLocal.replace(/^0/, '') : '')}
                onChange={e => setRegistrationData(p => ({ ...p, phone: e.target.value }))}
                placeholder="+44 7700 900000"
                className="mt-1 h-10 text-sm"
              />
            </div>
            <div>
              <Label htmlFor="reg-email" className="text-sm font-medium">Email</Label>
              <Input
                id="reg-email"
                type="email"
                value={registrationData.email}
                onChange={e => setRegistrationData(p => ({ ...p, email: e.target.value }))}
                placeholder="your@email.com"
                className="mt-1 h-10 text-sm"
              />
            </div>
            <div>
              <Label htmlFor="reg-message" className="text-sm font-medium">Message <span className="text-gray-400 font-normal">(optional)</span></Label>
              <Textarea
                id="reg-message"
                value={registrationData.message}
                onChange={e => setRegistrationData(p => ({ ...p, message: e.target.value }))}
                placeholder="Tell us about your business or what you'd like to order…"
                className="mt-1 text-sm"
                rows={3}
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={() => setShowRegistrationForm(false)} disabled={isSubmittingRegistration} className="flex-1 h-10">
              Cancel
            </Button>
            <Button
              onClick={handleRegistrationSubmit}
              disabled={isSubmittingRegistration || !registrationData.name.trim() || !registrationData.phone.trim()}
              className="flex-1 h-10 bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isSubmittingRegistration ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…</> : 'Send Request'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function WholesalerAvatar({ info }: { info: WholesalerInfo | null }) {
  if (info?.logoUrl) {
    return <img src={info.logoUrl} alt={info.businessName} className="mx-auto h-20 w-20 rounded-full object-cover border-2 border-gray-100 shadow-md" />;
  }
  return (
    <div className="mx-auto h-20 w-20 rounded-full bg-gradient-to-br from-green-600 to-green-700 flex items-center justify-center shadow-md">
      {info?.businessName ? (
        <span className="text-2xl font-bold text-white">{getInitials(info.businessName)}</span>
      ) : (
        <Store className="h-9 w-9 text-white" />
      )}
    </div>
  );
}

function StepDots({ current }: { current: AuthStep }) {
  const steps: AuthStep[] = ['phone', 'otp', 'select'];
  const idx = steps.indexOf(current);
  if (idx < 0) return null;
  return (
    <div className="flex items-center justify-center space-x-2 mb-6">
      {steps.slice(0, 3).map((_, i) => (
        <div key={i} className={`h-2.5 w-2.5 rounded-full transition-all duration-300 ${i <= idx ? 'bg-green-600' : 'bg-gray-200'}`} />
      ))}
    </div>
  );
}
