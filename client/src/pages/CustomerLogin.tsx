import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Loader2, ShoppingBag, Package, TrendingUp, Clock, Star, Users, ArrowLeft, Building2, ShieldCheck, Phone } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface WholesalerOption {
  customerId: string;
  wholesalerId: string;
  businessName: string;
  logoUrl: string | null;
  logoType: string | null;
}

type LoginStep = 'phone' | 'otp' | 'select' | 'no-account';

const COUNTRY_CODE = '+44';

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

function formatCountdown(secs: number) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const FloatingIcons = () => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none">
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
    <div className="absolute top-1/5 right-1/5 w-16 h-16 bg-white/10 rounded-full animate-pulse" style={{ animationDelay: '1s' }} />
    <div className="absolute bottom-1/5 left-1/5 w-12 h-12 bg-white/15 rounded-lg rotate-45 animate-pulse" style={{ animationDelay: '2s' }} />
  </div>
);

export default function CustomerLogin() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { backToHome } = useAuth();

  const [step, setStep] = useState<LoginStep>('phone');
  const [phoneLocal, setPhoneLocal] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [wholesalerOptions, setWholesalerOptions] = useState<WholesalerOption[]>([]);

  const otpRef = useRef<HTMLInputElement>(null);

  const fullPhone = COUNTRY_CODE + phoneLocal.replace(/^0/, '');

  // Session resume: if an active customer session exists, redirect to their store
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/customer-auth/check-session', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          if (data?.authenticated && data?.wholesalerId) {
            setLocation(`/store/${data.wholesalerId}`);
          }
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  // Countdown timer
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

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
      } else if (resend) {
        toast({ title: 'Code resent!', description: 'A new verification code has been sent to your phone.' });
      }

      setCountdown(120);
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

      if (options.length === 1) {
        await completeLogin(options[0]);
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

  const completeLogin = async (opt: WholesalerOption) => {
    setIsLoading(true);
    setError('');
    try {
      const res = await fetch('/api/customer-auth/complete-phone-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ phoneNumber: fullPhone, wholesalerId: opt.wholesalerId }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Login failed');
        return;
      }

      toast({ title: 'Welcome!', description: `You're now logged in, ${data.customer.name}.` });
      setLocation(`/store/${opt.wholesalerId}`);
    } catch {
      setError('Connection error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const stepTitle: Record<LoginStep, string> = {
    phone: 'Sign in',
    otp: 'Verify your number',
    select: 'Choose your store',
    'no-account': 'No account found',
  };

  const stepSubtitle: Record<LoginStep, string> = {
    phone: 'Enter your mobile number to continue',
    otp: `We sent a 6-digit code to ${COUNTRY_CODE} ${phoneLocal}`,
    select: 'You have access to multiple stores',
    'no-account': `${fullPhone} isn't linked to any store`,
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel — hero */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-green-600 to-emerald-700 relative flex-col justify-center px-12 text-white">
        <FloatingIcons />
        <div className="relative z-10">
          <h2 className="text-5xl font-bold mb-4 leading-tight">Welcome to<br />Quikpik</h2>
          <p className="text-xl text-green-100 mb-6 font-medium">"Wholesale made simple"</p>
          <p className="text-green-200 text-base leading-relaxed max-w-sm">
            Access your wholesale account, browse products, and place orders — all in one place.
          </p>
        </div>
        <div className="absolute bottom-6 left-12 right-12 text-green-300/60 text-xs">
          © {new Date().getFullYear()} Quikpik. All rights reserved.
        </div>
      </div>

      {/* Right panel — form */}
      <div className="w-full lg:w-1/2 bg-white flex flex-col justify-center px-4 sm:px-8 lg:px-12">
        <div className="w-full max-w-md mx-auto">

          {/* Back button (mobile only) */}
          <button
            onClick={() => backToHome()}
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-8 lg:hidden"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>

          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-1">{stepTitle[step]}</h1>
            <p className="text-gray-500 text-base">{stepSubtitle[step]}</p>
          </div>

          <Card className="border-0 shadow-none">
            <CardContent className="px-0 pt-0 space-y-6">

              {/* ── Phone entry ── */}
              {step === 'phone' && (
                <form onSubmit={e => { e.preventDefault(); handleSendOtp(); }} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="phone" className="font-medium flex items-center gap-2 text-sm">
                      <Phone className="h-4 w-4" /> Mobile Number
                    </Label>
                    <div className="flex">
                      <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 bg-gray-50 text-gray-600 text-sm font-medium select-none whitespace-nowrap">
                        🇬🇧 {COUNTRY_CODE}
                      </span>
                      <Input
                        id="phone"
                        type="tel"
                        inputMode="numeric"
                        placeholder="7700 900000"
                        value={phoneLocal}
                        onChange={e => {
                          setPhoneLocal(e.target.value.replace(/[^\d\s]/g, ''));
                          setError('');
                        }}
                        className="rounded-l-none h-12 text-base border-gray-300 focus:border-green-600"
                        autoComplete="tel"
                        disabled={isLoading}
                        autoFocus
                      />
                    </div>
                  </div>

                  {error && (
                    <Alert variant="destructive" className="border-0 bg-red-50">
                      <AlertDescription className="text-sm">{error}</AlertDescription>
                    </Alert>
                  )}

                  <Button
                    type="submit"
                    className="w-full h-12 bg-green-600 hover:bg-green-700 text-white font-semibold text-base"
                    disabled={isLoading || phoneLocal.replace(/\D/g, '').length < 7}
                  >
                    {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending code…</> : 'Continue'}
                  </Button>

                  <p className="text-xs text-gray-400 text-center">
                    By continuing, you agree to our Terms of Service and Privacy Policy.
                  </p>
                </form>
              )}

              {/* ── OTP entry ── */}
              {step === 'otp' && (
                <div className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="otp" className="font-medium flex items-center gap-2 text-sm">
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
                        setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                        setError('');
                      }}
                      maxLength={6}
                      className="text-center text-2xl tracking-[0.5em] h-16 border-2 font-mono focus:border-green-600"
                      autoComplete="one-time-code"
                      disabled={isLoading}
                    />
                    {countdown > 0 && (
                      <p className="text-xs text-blue-600 text-center">{formatCountdown(countdown)} remaining</p>
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
                    {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Verifying…</> : 'Verify'}
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
                      {isResending
                        ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…</>
                        : countdown > 60
                          ? `Wait ${formatCountdown(countdown - 60)}`
                          : 'Resend Code'}
                    </Button>
                  </div>
                </div>
              )}

              {/* ── Wholesaler selection ── */}
              {step === 'select' && (
                <div className="space-y-3">
                  {wholesalerOptions.map(opt => (
                    <button
                      key={opt.wholesalerId}
                      onClick={() => completeLogin(opt)}
                      disabled={isLoading}
                      className="w-full flex items-center gap-4 p-4 border-2 border-gray-200 rounded-xl hover:border-green-500 hover:bg-green-50 transition-colors text-left"
                    >
                      {opt.logoUrl ? (
                        <img src={opt.logoUrl} alt={opt.businessName} className="h-12 w-12 rounded-xl object-cover flex-shrink-0" />
                      ) : (
                        <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-green-500 to-green-700 flex items-center justify-center flex-shrink-0">
                          <span className="text-white font-bold text-sm">{getInitials(opt.businessName)}</span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 truncate">{opt.businessName}</p>
                        <p className="text-sm text-gray-500">Tap to enter this store</p>
                      </div>
                      {isLoading && <Loader2 className="h-5 w-5 animate-spin text-green-600 flex-shrink-0" />}
                    </button>
                  ))}

                  {error && (
                    <Alert variant="destructive" className="border-0 bg-red-50">
                      <AlertDescription className="text-sm text-center">{error}</AlertDescription>
                    </Alert>
                  )}

                  <Button
                    variant="outline"
                    onClick={() => { setStep('phone'); setError(''); }}
                    className="w-full h-11 border-2"
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" /> Back
                  </Button>
                </div>
              )}

              {/* ── No account ── */}
              {step === 'no-account' && (
                <div className="space-y-5">
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 space-y-3">
                    <Building2 className="h-8 w-8 text-amber-500 mx-auto block" />
                    <p className="text-amber-800 font-semibold text-sm text-center">No account found</p>
                    <p className="text-amber-700 text-sm text-center">
                      Your number <span className="font-mono font-semibold">{fullPhone}</span> isn't linked to any wholesale account yet.
                    </p>
                    <div className="border-t border-amber-200 pt-3 space-y-2">
                      <p className="text-amber-700 text-sm font-medium">How to get access:</p>
                      <ul className="text-amber-600 text-sm space-y-1 list-disc list-inside">
                        <li>Ask your wholesaler to add your number directly</li>
                        <li>Visit a wholesaler's store link and request access there</li>
                      </ul>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => { setStep('phone'); setOtpCode(''); setPhoneLocal(''); setError(''); }}
                    className="w-full h-11 border-2"
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" /> Try a different number
                  </Button>
                </div>
              )}

            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
