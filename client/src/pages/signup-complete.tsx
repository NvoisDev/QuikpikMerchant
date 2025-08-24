import { useState, useEffect } from "react";
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
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { Building, MapPin, Loader2, CheckCircle, ArrowRight } from "lucide-react";

const profileCompletionSchema = z.object({
  // Business Information
  businessName: z.string().min(1, "Business name is required"),
  businessDescription: z.string().optional(),
  businessPhone: z.string().optional(),
  businessType: z.string().optional(),
  estimatedMonthlyVolume: z.string().optional(),
  
  // Address Information
  streetAddress: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  country: z.string().optional(),
  
  // Preferences
  preferredCurrency: z.string().default("GBP"),
});

type ProfileForm = z.infer<typeof profileCompletionSchema>;

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

export default function SignupComplete() {
  const { user, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const form = useForm<ProfileForm>({
    resolver: zodResolver(profileCompletionSchema),
    defaultValues: {
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

  // Pre-fill form with existing user data
  useEffect(() => {
    if (user && !isLoading) {
      form.reset({
        businessName: user.businessName && !user.businessName.includes("'s Business") 
          ? user.businessName 
          : `${user.firstName} ${user.lastName}'s Business`,
        businessDescription: user.businessDescription || "",
        businessPhone: user.businessPhone || "",
        businessType: user.businessType || "",
        estimatedMonthlyVolume: user.estimatedMonthlyVolume || "",
        streetAddress: user.streetAddress || "",
        city: user.city || "",
        state: user.state || "",
        postalCode: user.postalCode || "",
        country: user.country || "United Kingdom",
        preferredCurrency: user.defaultCurrency || "GBP"
      });
    }
  }, [user, isLoading, form]);

  // Redirect if user is not authenticated
  useEffect(() => {
    if (!isLoading && !user) {
      setLocation('/login');
    }
  }, [user, isLoading, setLocation]);

  const nextStep = () => {
    setCurrentStep(2);
  };

  const prevStep = () => {
    setCurrentStep(1);
  };

  const onSubmit = async (data: ProfileForm) => {
    if (currentStep !== 2) {
      nextStep();
      return;
    }
    
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/auth/complete-profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          ...data,
          isFirstLogin: false // Mark as profile completed
        }),
      });

      const result = await response.json();

      if (result.success) {
        toast({
          title: "Profile Completed!",
          description: "Your business profile has been set up successfully. Welcome to Quikpik!",
          duration: 4000,
        });
        
        // Small delay then redirect to dashboard
        setTimeout(() => {
          window.location.href = '/dashboard';
        }, 1500);
      } else {
        throw new Error(result.message || 'Failed to complete profile');
      }
    } catch (error) {
      console.error('Profile completion error:', error);
      toast({
        title: "Profile Update Failed",
        description: "There was an error completing your profile. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="w-8 h-8 animate-spin text-green-600" />
          <p className="text-gray-600">Loading your profile...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null; // Will redirect via useEffect
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto px-4">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Complete Your Profile
          </h1>
          <p className="text-gray-600">
            Hi {user.firstName}! Let's finish setting up your wholesale business account.
          </p>
        </div>

        {/* Progress Indicator */}
        <div className="flex items-center justify-center mb-8">
          <div className="flex items-center space-x-4">
            <div className="flex items-center">
              <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center text-white text-sm">
                <CheckCircle className="w-4 h-4" />
              </div>
              <span className="ml-2 text-sm text-green-600 font-medium">Account Created</span>
            </div>
            <div className="w-8 h-0.5 bg-gray-300" />
            <div className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${
                currentStep >= 1 ? 'bg-green-600 text-white' : 'bg-gray-300 text-gray-600'
              }`}>
                <Building className="w-4 h-4" />
              </div>
              <span className={`ml-2 text-sm font-medium ${
                currentStep >= 1 ? 'text-green-600' : 'text-gray-500'
              }`}>Business Info</span>
            </div>
            <div className="w-8 h-0.5 bg-gray-300" />
            <div className="flex items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${
                currentStep >= 2 ? 'bg-green-600 text-white' : 'bg-gray-300 text-gray-600'
              }`}>
                <MapPin className="w-4 h-4" />
              </div>
              <span className={`ml-2 text-sm font-medium ${
                currentStep >= 2 ? 'text-green-600' : 'text-gray-500'
              }`}>Address & Preferences</span>
            </div>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>
              {currentStep === 1 ? "Business Information" : "Address & Preferences"}
            </CardTitle>
            <CardDescription>
              {currentStep === 1 
                ? "Tell us about your wholesale business"
                : "Complete your business address and preferences"
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                {currentStep === 1 && (
                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name="businessName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-medium">Business Name *</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="Your Business Name" 
                              {...field}
                              className="bg-white"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="businessDescription"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-medium">Business Description</FormLabel>
                          <FormControl>
                            <Textarea 
                              placeholder="Briefly describe your business and products..." 
                              rows={3}
                              {...field}
                              className="bg-white"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="businessPhone"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-medium">Business Phone</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="+44 20 1234 5678" 
                                {...field}
                                className="bg-white"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="businessType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-medium">Business Type</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger className="bg-white">
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
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="estimatedMonthlyVolume"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-medium">Estimated Monthly Volume</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger className="bg-white">
                                <SelectValue placeholder="Select estimated monthly sales volume" />
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
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}

                {currentStep === 2 && (
                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name="streetAddress"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-medium">Street Address</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="123 Business Street" 
                              {...field}
                              className="bg-white"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="city"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-medium">City</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="London" 
                                {...field}
                                className="bg-white"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="postalCode"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-medium">Postal Code</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="SW1A 1AA" 
                                {...field}
                                className="bg-white"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="state"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-medium">State/County</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="Greater London" 
                                {...field}
                                className="bg-white"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="country"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-sm font-medium">Country</FormLabel>
                            <FormControl>
                              <Input 
                                placeholder="United Kingdom" 
                                {...field}
                                className="bg-white"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="preferredCurrency"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-sm font-medium">Preferred Currency</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger className="bg-white">
                                <SelectValue placeholder="Select currency" />
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
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}

                <div className="flex justify-between pt-6">
                  {currentStep === 2 && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={prevStep}
                      className="flex items-center gap-2"
                    >
                      Back to Business Info
                    </Button>
                  )}
                  
                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    className="bg-green-600 hover:bg-green-700 ml-auto flex items-center gap-2"
                  >
                    {isSubmitting ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : currentStep === 1 ? (
                      <>
                        Continue
                        <ArrowRight className="w-4 h-4" />
                      </>
                    ) : (
                      "Complete Profile"
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}