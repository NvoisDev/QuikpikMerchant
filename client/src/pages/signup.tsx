import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Link, useLocation } from "wouter";
import { ArrowLeft, User, Building, Mail, Phone, MapPin, LogIn, Loader2 } from "lucide-react";

const signupSchema = z.object({
  // Personal Information (Required)
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email("Valid email is required"),
  password: z.string().min(6, "Password must be at least 6 characters"),
  confirmPassword: z.string(),
  
  // Business Information (Optional)
  businessName: z.string().optional(),
  businessDescription: z.string().optional(),
  businessPhone: z.string().optional(),
  businessType: z.string().optional(),
  estimatedMonthlyVolume: z.string().optional(),
  
  // Address Information (Optional)
  streetAddress: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
  
  // Preferences (Optional)
  preferredCurrency: z.string().default("GBP"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type SignupForm = z.infer<typeof signupSchema>;

const currencies = [
  { code: "GBP", name: "British Pound (£)" },
  { code: "EUR", name: "Euro (€)" },
  { code: "USD", name: "US Dollar ($)" },
  { code: "CAD", name: "Canadian Dollar" },
  { code: "AUD", name: "Australian Dollar" },
];

const businessTypes = [
  "Food & Beverage",
  "Retail & Consumer Goods",
  "Electronics & Technology",
  "Fashion & Apparel",
  "Health & Beauty",
  "Home & Garden",
  "Industrial & Manufacturing",
  "Other"
];

const monthlyVolumes = [
  "Under £1,000",
  "£1,000 - £5,000",
  "£5,000 - £25,000",
  "£25,000 - £100,000",
  "Over £100,000"
];

export default function Signup() {
  const [, setLocation] = useLocation();
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [signupMethod, setSignupMethod] = useState<'google' | 'email'>('email');
  const { toast } = useToast();

  const form = useForm<SignupForm>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      password: "",
      confirmPassword: "",
      businessName: "",
      businessDescription: "",
      businessPhone: "",
      businessType: "",
      estimatedMonthlyVolume: "",
      streetAddress: "",
      city: "",
      state: "",
      postalCode: "",
      country: "United Kingdom",
      preferredCurrency: "GBP"
    }
  });

  const nextStep = async () => {
    const fieldsToValidate = currentStep === 1 
      ? ["firstName", "lastName", "email", "password", "confirmPassword"]
      : [];
    
    const isValid = await form.trigger(fieldsToValidate as any);
    if (isValid) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    setCurrentStep(currentStep - 1);
  };

  const handleGoogleSignup = async () => {
    try {
      setIsLoading(true);
      
      // Get Google auth URL from server
      const response = await fetch('/api/auth/google');
      const data = await response.json();
      
      if (data.authUrl) {
        // Redirect to Google authentication
        window.location.href = data.authUrl;
      } else {
        throw new Error('Failed to get authentication URL');
      }
    } catch (error) {
      console.error('Google signup error:', error);
      toast({
        title: "Signup Failed",
        description: "There was an error with Google signup. Please try again.",
        variant: "destructive",
      });
      setIsLoading(false);
    }
  };

  const onSubmit = async (data: SignupForm) => {
    // Only allow submission on step 3 (address page)
    if (currentStep !== 3) {
      return;
    }
    
    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        // Show comprehensive welcome message
        toast({
          title: result.welcomeMessage?.title || "Welcome to Quikpik!",
          description: "Your account has been created successfully. Check your email for a detailed welcome guide with platform features and future roadmap.",
          duration: 6000,
        });
        
        // Store welcome message for potential display on dashboard
        if (result.welcomeMessage) {
          sessionStorage.setItem('welcomeMessage', JSON.stringify(result.welcomeMessage));
        }
        
        // Small delay to ensure session is established before redirect
        setTimeout(() => {
          window.location.href = '/';
        }, 1500);
      } else {
        // Show specific error message from server
        const errorMessage = result.message || "Please try again.";
        toast({
          title: "Signup failed",
          description: errorMessage,
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Signup error:', error);
      toast({
        title: "Signup failed",
        description: "Network error. Please check your connection and try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-block mb-4 hover:opacity-80 transition-opacity">
            <div className="mx-auto h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
              <div className="h-12 w-12 rounded-full bg-primary flex items-center justify-center">
                <span className="text-white font-bold text-xl">Q</span>
              </div>
            </div>
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Join Quikpik</h1>
          <p className="text-gray-600 mt-2">Start your wholesale business journey</p>
          <p className="mt-1 text-sm text-gray-500">
            <Link href="/" className="text-primary hover:underline">
              ← Back to Home
            </Link>
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl text-center">Create Your Account</CardTitle>
            <CardDescription className="text-center">
              Choose your preferred signup method
            </CardDescription>
            
            {/* Signup Method Selection */}
            <div className="flex gap-2 mt-4">
              <Button
                variant={signupMethod === 'google' ? 'default' : 'outline'}
                onClick={() => setSignupMethod('google')}
                className="flex-1"
              >
                Google
              </Button>
              <Button
                variant={signupMethod === 'email' ? 'default' : 'outline'}
                onClick={() => setSignupMethod('email')}
                className="flex-1"
              >
                Email
              </Button>
            </div>
          </CardHeader>

          <CardContent>
            {signupMethod === 'google' ? (
              <div className="space-y-4">
                <div className="text-center py-4">
                  <p className="text-sm text-gray-600 mb-4">
                    Sign up with your Google account for quick access
                  </p>
                </div>
                
                <Button
                  onClick={handleGoogleSignup}
                  disabled={isLoading}
                  className="w-full h-12 text-base font-medium"
                  size="lg"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Creating account...
                    </>
                  ) : (
                    <>
                      <LogIn className="mr-2 h-5 w-5" />
                      Continue with Google
                    </>
                  )}
                </Button>
                
                <div className="text-center text-sm text-gray-500 mt-4">
                  Already have an account?{' '}
                  <Link href="/login" className="text-primary hover:underline">
                    Sign in here
                  </Link>
                </div>
              </div>
            ) : (
              <>
                {/* Step Header for Email Signup */}
                <div className="flex items-center justify-between mb-4">
                  {currentStep > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={prevStep}
                      className="p-1"
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </Button>
                  )}
                  <div className="flex-1 text-center">
                    <h3 className="font-medium">
                      {currentStep === 1 ? "Personal Information" : 
                       currentStep === 2 ? "Business Details" : "Address & Preferences"}
                    </h3>
                    <p className="text-sm text-gray-600">
                      Step {currentStep} of 3 • {currentStep > 1 ? "All fields optional" : "Required fields"}
                    </p>
                  </div>
                  <div className="w-8" />
                </div>
                
                {/* Progress indicator */}
                <div className="flex space-x-1 mb-6">
                  {[1, 2, 3].map((step) => (
                    <div
                      key={step}
                      className={`h-2 flex-1 rounded ${
                        step <= currentStep ? 'bg-primary' : 'bg-gray-200'
                      }`}
                    />
                  ))}
                </div>

                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" onKeyDown={(e) => {
                    // Prevent form submission on Enter key press - users must click buttons
                    if (e.key === 'Enter') {
                      e.preventDefault();
                    }
                  }}>
                    {currentStep === 1 && (
                      <>
                        <div className="flex items-center space-x-2 text-primary mb-4">
                          <User className="h-5 w-5" />
                          <span className="font-medium">Personal Information</span>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4">
                          <FormField
                            control={form.control}
                            name="firstName"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>First Name *</FormLabel>
                                <FormControl>
                                  <Input placeholder="John" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          
                          <FormField
                            control={form.control}
                            name="lastName"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Last Name *</FormLabel>
                                <FormControl>
                                  <Input placeholder="Smith" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <FormField
                          control={form.control}
                          name="email"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Business Email Address *</FormLabel>
                              <FormControl>
                                <Input type="email" placeholder="john@yourcompany.com" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="password"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Password *</FormLabel>
                              <FormControl>
                                <Input type="password" placeholder="At least 6 characters" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="confirmPassword"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Confirm Password *</FormLabel>
                              <FormControl>
                                <Input type="password" placeholder="Re-enter password" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </>
                    )}

                    {currentStep === 2 && (
                      <>
                        <div className="flex items-center space-x-2 text-primary mb-4">
                          <Building className="h-5 w-5" />
                          <span className="font-medium">Business Information</span>
                        </div>
                        
                        <FormField
                          control={form.control}
                          name="businessName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Business Name</FormLabel>
                              <FormControl>
                                <Input placeholder="Your Business Ltd" {...field} />
                              </FormControl>
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="businessDescription"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Business Description</FormLabel>
                              <FormControl>
                                <Textarea placeholder="Brief description of your business..." {...field} />
                              </FormControl>
                            </FormItem>
                          )}
                        />



                        <FormField
                          control={form.control}
                          name="businessPhone"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Business Phone</FormLabel>
                              <FormControl>
                                <Input type="tel" placeholder="+44 20 7123 4567" {...field} />
                              </FormControl>
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="businessType"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Business Type</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select business type" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {businessTypes.map((type) => (
                                    <SelectItem key={type} value={type}>
                                      {type}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name="estimatedMonthlyVolume"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Estimated Monthly Volume</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select volume range" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {monthlyVolumes.map((volume) => (
                                    <SelectItem key={volume} value={volume}>
                                      {volume}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </FormItem>
                          )}
                        />
                      </>
                    )}

                    {currentStep === 3 && (
                      <>
                        <div className="flex items-center space-x-2 text-primary mb-4">
                          <MapPin className="h-5 w-5" />
                          <span className="font-medium">Address & Preferences</span>
                        </div>
                        
                        <FormField
                          control={form.control}
                          name="streetAddress"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Street Address</FormLabel>
                              <FormControl>
                                <Input placeholder="123 Business Street" {...field} />
                              </FormControl>
                            </FormItem>
                          )}
                        />

                        <div className="grid grid-cols-2 gap-4">
                          <FormField
                            control={form.control}
                            name="city"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>City</FormLabel>
                                <FormControl>
                                  <Input placeholder="London" {...field} />
                                </FormControl>
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="postalCode"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Postal Code</FormLabel>
                                <FormControl>
                                  <Input placeholder="SW1A 1AA" {...field} />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <FormField
                            control={form.control}
                            name="state"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>State/County</FormLabel>
                                <FormControl>
                                  <Input placeholder="Greater London" {...field} />
                                </FormControl>
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="country"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Country</FormLabel>
                                <FormControl>
                                  <Input placeholder="United Kingdom" {...field} />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                        </div>

                        <FormField
                          control={form.control}
                          name="preferredCurrency"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Preferred Currency</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {currencies.map((currency) => (
                                    <SelectItem key={currency.code} value={currency.code}>
                                      {currency.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </FormItem>
                          )}
                        />
                      </>
                    )}

                    <div className="flex justify-between pt-4">
                      {currentStep < 3 ? (
                        <Button 
                          type="button" 
                          onClick={nextStep}
                          className="w-full"
                        >
                          Continue
                        </Button>
                      ) : (
                        <Button 
                          type="submit" 
                          disabled={isLoading}
                          className="w-full"
                        >
                          {isLoading ? "Creating Account..." : "Create Account"}
                        </Button>
                      )}
                    </div>

                    <div className="text-center pt-4">
                      <p className="text-sm text-gray-600">
                        Already have an account?{" "}
                        <Link href="/login" className="text-primary hover:underline">
                          Sign in
                        </Link>
                      </p>
                    </div>
                  </form>
                </Form>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}