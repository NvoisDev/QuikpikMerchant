import { useState, useEffect, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Store, ShieldCheck, MessageCircle, CheckCircle2, Tag } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { CountryCodePicker, detectCountryDialCode } from "@/components/ui/country-code-picker";
import { formatPhoneToInternational } from "@shared/phone-utils";

interface PreviewProduct {
  id: string;
  name: string;
  imageUrl?: string | null;
  images?: string[] | null;
  category?: string | null;
}

const COUNTRY_CODE_STORAGE_KEY = "customerPreferredCountryCode";

function getSavedCountryCode() {
  try {
    return localStorage.getItem(COUNTRY_CODE_STORAGE_KEY) || detectCountryDialCode();
  } catch {
    return detectCountryDialCode();
  }
}

function saveCountryCode(code: string) {
  try {
    localStorage.setItem(COUNTRY_CODE_STORAGE_KEY, code);
  } catch {}
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

interface WholesalerInfo {
  id: string;
  businessName: string;
  logoUrl?: string | null;
  logoType?: string | null;
  tagline?: string | null;
  defaultCountryCode?: string;
}

const BUSINESS_TYPES = [
  { value: "retailer", label: "Retailer (Shop / Store)" },
  { value: "wholesaler", label: "Wholesaler / Distributor" },
  { value: "business", label: "Business (Restaurant, Salon, etc.)" },
  { value: "individual", label: "Individual / Sole Trader" },
];

export default function WelcomePage() {
  const { wholesalerId } = useParams<{ wholesalerId: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [wholesaler, setWholesaler] = useState<WholesalerInfo | null>(null);
  const [loadingWholesaler, setLoadingWholesaler] = useState(true);
  const [sessionChecked, setSessionChecked] = useState(false);

  const [countryCode, setCountryCode] = useState(getSavedCountryCode);
  const [phoneLocal, setPhoneLocal] = useState("");
  const [name, setName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const [previewProducts, setPreviewProducts] = useState<PreviewProduct[]>([]);

  const phoneRef = useRef<HTMLInputElement>(null);

  // Check for existing session — redirect if already authenticated
  useEffect(() => {
    if (!wholesalerId) return;
    fetch(`/api/customer-auth/check/${wholesalerId}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.authenticated) {
          setLocation(`/store/${wholesalerId}`, { replace: true });
        } else {
          setSessionChecked(true);
        }
      })
      .catch(() => setSessionChecked(true));
  }, [wholesalerId, setLocation]);

  // Fetch wholesaler branding
  useEffect(() => {
    if (!wholesalerId) return;
    fetch(`/api/marketplace/wholesaler/${wholesalerId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setWholesaler(data);
          if (data.defaultCountryCode) {
            setCountryCode(data.defaultCountryCode);
          }
        }
        setLoadingWholesaler(false);
      })
      .catch(() => setLoadingWholesaler(false));
  }, [wholesalerId]);

  // Fetch product preview (guest-safe, no prices)
  useEffect(() => {
    if (!wholesalerId) return;
    fetch(`/api/customer-products/${wholesalerId}?guest=true`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: PreviewProduct[]) => {
        if (Array.isArray(data)) {
          setPreviewProducts(data.slice(0, 8));
        }
      })
      .catch(() => {});
  }, [wholesalerId]);

  const fullPhone = formatPhoneToInternational(
    phoneLocal.replace(/\s/g, ""),
    countryCode.trim() || "+44"
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast({ title: "Name required", description: "Please enter your full name.", variant: "destructive" });
      return;
    }
    const digits = phoneLocal.replace(/\D/g, "");
    if (digits.length < 7) {
      toast({ title: "Phone required", description: "Please enter a valid phone number.", variant: "destructive" });
      return;
    }

    saveCountryCode(countryCode);
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/customer/request-wholesaler-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wholesalerId,
          customerName: name.trim(),
          customerPhone: fullPhone,
          businessName: businessName.trim() || undefined,
          businessType: businessType || undefined,
          customerEmail: email.trim() || undefined,
          requestMessage: message.trim() || undefined,
        }),
      });
      const data = await res.json();

      if (res.ok) {
        setSubmitted(true);
      } else if (data?.code === "DUPLICATE_REGISTRATION") {
        toast({
          title: "Already applied",
          description: "You already have a pending request with this store. We'll let you know when it's reviewed.",
        });
      } else {
        toast({
          title: "Something went wrong",
          description: data?.error || "Please try again.",
          variant: "destructive",
        });
      }
    } catch {
      toast({ title: "Connection error", description: "Please check your connection and try again.", variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!sessionChecked || loadingWholesaler) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-green-600" />
      </div>
    );
  }

  const bizName = wholesaler?.businessName || "this store";

  if (submitted) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="h-9 w-9 text-green-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Request Sent!</h2>
            <p className="text-gray-500 mb-6 leading-relaxed">
              Your request to join <strong>{bizName}</strong> has been sent. You'll receive an SMS once approved.
            </p>
            <Button
              className="w-full h-12 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl text-base"
              onClick={() => setLocation(`/store/${wholesalerId}`)}
            >
              Go to Store
            </Button>
            <p className="text-xs text-gray-400 mt-4">You can sign in once the wholesaler approves your request.</p>
          </div>
        </div>
        <footer className="py-4 text-center text-xs text-gray-400">
          Powered by Quikpik &bull; Secure wholesale ordering
        </footer>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-gradient-to-br from-green-600 to-emerald-700 px-4 pt-10 pb-8 text-white text-center">
        <div className="max-w-md mx-auto">
          {/* Wholesaler logo / initials */}
          {wholesaler?.logoUrl ? (
            <img
              src={wholesaler.logoUrl}
              alt={bizName}
              className="w-20 h-20 rounded-2xl object-cover mx-auto mb-4 shadow-lg border-2 border-white/30"
            />
          ) : (
            <div className="w-20 h-20 rounded-2xl bg-white/20 flex items-center justify-center mx-auto mb-4 shadow-lg border-2 border-white/30">
              <span className="text-white font-bold text-2xl">{getInitials(bizName)}</span>
            </div>
          )}
          <h1 className="text-2xl font-bold mb-1">{bizName}</h1>
          <p className="text-green-100 text-sm leading-relaxed">
            You've been invited to shop wholesale at {bizName}, powered by Quikpik.
          </p>
        </div>
      </div>

      {/* Trust signals */}
      <div className="bg-white border-b border-gray-100 px-4 py-3">
        <div className="max-w-md mx-auto flex items-center justify-center gap-4 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-gray-600">
            <Store className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />
            <span>Sent by {bizName}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-600">
            <ShieldCheck className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />
            <span>Secure ordering &amp; payments</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-gray-600">
            <MessageCircle className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />
            <span>You'll receive updates via SMS</span>
          </div>
        </div>
      </div>

      {/* Product Preview */}
      {previewProducts.length > 0 && (
        <div className="px-4 py-6 bg-gray-50">
          <div className="max-w-md mx-auto">
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3 mb-4">
              <Tag className="h-4 w-4 text-green-600 flex-shrink-0" />
              <p className="text-sm font-medium text-green-800">Sign up to see prices and place orders.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {previewProducts.map((product) => {
                const thumb = product.imageUrl || (Array.isArray(product.images) && product.images[0]) || null;
                return (
                  <div key={product.id} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                    <div className="aspect-square bg-gray-100 flex items-center justify-center">
                      {thumb ? (
                        <img
                          src={thumb}
                          alt={product.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-gray-300">
                          <Store className="h-10 w-10" />
                        </div>
                      )}
                    </div>
                    <div className="px-3 py-2">
                      <p className="text-xs font-medium text-gray-900 truncate leading-snug">{product.name}</p>
                      {product.category && (
                        <p className="text-xs text-gray-400 truncate mt-0.5">{product.category}</p>
                      )}
                      <p className="text-xs text-green-600 font-semibold mt-1">Sign up to see price</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Form */}
      <div className="flex-1 px-4 py-6">
        <div className="max-w-md mx-auto">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Request Account Access</h2>
            <p className="text-sm text-gray-500 mb-5">
              Fill in your details and {bizName} will review your request.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Full Name */}
              <div className="space-y-1.5">
                <Label htmlFor="w-name" className="text-sm font-medium text-gray-700">
                  Full Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="w-name"
                  type="text"
                  placeholder="Your full name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-12 rounded-xl border-gray-200 focus:border-green-500 focus:ring-green-500 text-base"
                  autoComplete="name"
                  required
                />
              </div>

              {/* Phone Number */}
              <div className="space-y-1.5">
                <Label htmlFor="w-phone" className="text-sm font-medium text-gray-700">
                  Phone Number <span className="text-red-500">*</span>
                </Label>
                <div className="flex gap-2">
                  <CountryCodePicker
                    value={countryCode}
                    onChange={setCountryCode}
                  />
                  <Input
                    id="w-phone"
                    ref={phoneRef}
                    type="tel"
                    inputMode="numeric"
                    placeholder="7700 900000"
                    value={phoneLocal}
                    onChange={(e) => setPhoneLocal(e.target.value)}
                    className="flex-1 h-12 rounded-xl border-gray-200 focus:border-green-500 focus:ring-green-500 text-base"
                    autoComplete="tel-national"
                    autoFocus
                    required
                  />
                </div>
                <p className="text-xs text-gray-400">
                  We'll send a verification code when you're approved.
                </p>
              </div>

              {/* Business Name */}
              <div className="space-y-1.5">
                <Label htmlFor="w-biz" className="text-sm font-medium text-gray-700">
                  Business Name <span className="text-gray-400 font-normal">(optional)</span>
                </Label>
                <Input
                  id="w-biz"
                  type="text"
                  placeholder="Your business name"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  className="h-12 rounded-xl border-gray-200 focus:border-green-500 focus:ring-green-500 text-base"
                  autoComplete="organization"
                />
              </div>

              {/* Business Type */}
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-gray-700">
                  Business Type <span className="text-gray-400 font-normal">(optional)</span>
                </Label>
                <Select value={businessType} onValueChange={setBusinessType}>
                  <SelectTrigger className="h-12 rounded-xl border-gray-200 focus:border-green-500 focus:ring-green-500 text-base">
                    <SelectValue placeholder="Select the option that best describes you" />
                  </SelectTrigger>
                  <SelectContent>
                    {BUSINESS_TYPES.map((bt) => (
                      <SelectItem key={bt.value} value={bt.value} className="py-2.5 text-sm">
                        {bt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Email */}
              <div className="space-y-1.5">
                <Label htmlFor="w-email" className="text-sm font-medium text-gray-700">
                  Email <span className="text-gray-400 font-normal">(optional)</span>
                </Label>
                <Input
                  id="w-email"
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-12 rounded-xl border-gray-200 focus:border-green-500 focus:ring-green-500 text-base"
                  autoComplete="email"
                  inputMode="email"
                />
              </div>

              {/* Message */}
              <div className="space-y-1.5">
                <Label htmlFor="w-msg" className="text-sm font-medium text-gray-700">
                  Message <span className="text-gray-400 font-normal">(optional)</span>
                </Label>
                <Textarea
                  id="w-msg"
                  placeholder="Tell us about your business or what you'd like to order…"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="rounded-xl border-gray-200 focus:border-green-500 focus:ring-green-500 text-base min-h-[90px] resize-none"
                />
              </div>

              {/* Submit */}
              <Button
                type="submit"
                disabled={isSubmitting || !name.trim() || phoneLocal.replace(/\D/g, "").length < 7}
                className="w-full h-13 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl text-base mt-2 h-12"
              >
                {isSubmitting ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending Request…</>
                ) : (
                  "Request Access"
                )}
              </Button>

              {/* Cancel / Already have an account */}
              <button
                type="button"
                onClick={() => setLocation(`/store/${wholesalerId}`)}
                className="w-full text-center text-sm text-gray-500 hover:text-gray-700 py-2 transition-colors"
              >
                Already have an account? Sign in
              </button>
            </form>
          </div>
        </div>
      </div>

      <footer className="py-4 text-center text-xs text-gray-400">
        Powered by Quikpik &bull; Secure wholesale ordering
      </footer>
    </div>
  );
}
